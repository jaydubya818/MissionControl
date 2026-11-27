/**
 * Factory Learning — deterministic evidence projection and governed experiments.
 *
 * This module is deliberately advisory. It can collect and cluster evidence,
 * create reviewable proposals, and link a human-approved canonical experiment.
 * It cannot change active Factory, model-routing, context, or agent settings and
 * it never participates in acceptance authority.
 */

import { v } from "convex/values";
import {
  action,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../lib/missionScopedFunctions";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  aggregateLearningSignals,
  buildImprovementCandidate,
  deriveObservationLearningSignals,
  deriveMissionSpecLearningSignals,
  deriveRecipeMismatch,
  learningClusterKey,
  normalizeLearningSignature,
  recommendImprovementPromotion,
  type LearningSeverity,
  type LearningSignalInput,
  type LearningSignalType,
} from "../lib/factoryLearning";
import {
  FACTORY_PERMISSIONS,
  requireWorkspacePermission,
} from "../lib/companyAccess";
import { requireFactoryActionWithAudit } from "../lib/factoryActionAuthorization";

const SCANNER_VERSION = "factory-learning-v1";
const WINDOW_DAYS = 30;
const MAX_SOURCE_ROWS = 200;
const MAX_SIGNAL_ROWS = 500;
const MAX_EVIDENCE_ITEMS = 40;
const MINIMUM_OCCURRENCES = 3;
const MAX_OBSERVATION_TRACES = 50;
const MAX_OBSERVATIONS_PER_TRACE = 50;

const configurationEntryArg = v.object({
  sourcePath: v.string(),
  harness: v.union(
    v.literal("CROSS_HARNESS"),
    v.literal("CLAUDE"),
    v.literal("CODEX"),
    v.literal("CURSOR"),
    v.literal("LOOM"),
    v.literal("GIT"),
    v.literal("OTHER"),
  ),
  kind: v.union(
    v.literal("INSTRUCTIONS"),
    v.literal("SKILL"),
    v.literal("RULE"),
    v.literal("HOOK"),
    v.literal("IGNORE"),
    v.literal("PERMISSIONS"),
    v.literal("CONFIG"),
  ),
  scope: v.string(),
  digest: v.string(),
  effectivePrecedence: v.number(),
  lastChangedCommit: v.optional(v.string()),
  directives: v.array(v.object({
    key: v.string(),
    polarity: v.union(v.literal("REQUIRE"), v.literal("FORBID")),
    statement: v.string(),
    line: v.number(),
  })),
  overlapKeys: v.array(v.string()),
});

const configurationFindingArg = v.object({
  findingType: v.union(
    v.literal("CONTRADICTION"),
    v.literal("COVERAGE_GAP"),
    v.literal("DUPLICATE_INTENT"),
    v.literal("PRECEDENCE_SHADOW"),
  ),
  severity: v.union(v.literal("INFO"), v.literal("WARNING"), v.literal("HIGH")),
  normalizedKey: v.string(),
  summary: v.string(),
  sources: v.array(v.object({
    path: v.string(),
    harness: v.string(),
    statement: v.string(),
  })),
  suggestedRemediation: v.string(),
});

type LearningCtx = Pick<MutationCtx, "db">;

interface RepositoryScope {
  repositoryId?: Id<"workspaceRepositories">;
  repositoryKey: string;
  acceptsUnscopedSources: boolean;
}

interface SignalDraft {
  signalType: LearningSignalType;
  sourceType:
    | "VERIFICATION_RECEIPT"
    | "QUALITY_GATE_DECISION"
    | "WORKFLOW_RUN"
    | "RUN_EVENT"
    | "TRACE"
    | "HUMAN_DECISION"
    | "REVIEW_JUDGMENT"
    | "CONFIGURATION_REGISTRY"
    | "MISSION_SPEC_QUALITY";
  sourceId: string;
  reasonCode: string;
  reasonSummary: string;
  deterministicKey: string;
  evidenceRefs: string[];
  confidence: number;
  severity: LearningSeverity;
  observedAt: number;
  workOrderId?: Id<"workOrders">;
  workflowRunId?: Id<"workflowRuns">;
  traceId?: Id<"traces">;
  observationId?: Id<"traceObservations">;
  evalScoreId?: Id<"evalScores">;
  factoryDefinitionVersionId?: Id<"factoryDefinitionVersions">;
  missionSpecRevisionId?: Id<"missionSpecRevisions">;
  specFindingCode?: string;
  recipeId?: string;
  affectedRole?: string;
  affectedModel?: string;
  observedModelCalls?: number;
  observedTokens?: number;
  observedCostUsd?: number;
  metadata?: unknown;
  evidenceFingerprint?: string;
}

function boundedText(value: unknown, maximum = 1_000): string {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function safeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function harnessLearningContext(value: unknown): Record<string, string> | undefined {
  const source = recordValue(value);
  const harness = recordValue(source.harness);
  const candidate = Object.fromEntries([
    ["harnessId", harness.harnessId ?? source.harnessId],
    ["harnessVersion", harness.harnessVersion ?? source.harnessVersion],
    ["adapter", harness.adapter ?? source.adapter],
    ["adapterVersion", harness.version ?? source.adapterVersion],
    ["capabilityManifestSha256", harness.capabilityManifestSha256 ?? source.capabilityManifestSha256],
    ["effectiveConfigSha256", harness.effectiveConfigSha256 ?? source.effectiveConfigSha256],
  ].flatMap(([key, item]) => typeof item === "string" && item.trim()
    ? [[key, boundedText(item, 200)] as const]
    : []));
  return Object.keys(candidate).length ? candidate : undefined;
}

function metaLoopKind(candidateType: string): Doc<"metaLoopSuggestions">["kind"] {
  if (candidateType === "MODIFY_GATE" || candidateType === "ADD_DETERMINISTIC_GATE") {
    return "VERIFIER";
  }
  if (candidateType === "ADD_OR_UPDATE_SKILL") {
    return "SKILL_UPDATE";
  }
  if (candidateType === "REPLACE_AGENT_WITH_CODE") return "DELEGATION";
  return "MAINTENANCE";
}

async function resolveRepositoryScope(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
  repositoryId?: Id<"workspaceRepositories">,
): Promise<RepositoryScope> {
  const project = await ctx.db.get(projectId);
  if (!project) throw new Error("Workspace is unavailable.");
  const repository = repositoryId
    ? await ctx.db.get(repositoryId)
    : await ctx.db
      .query("workspaceRepositories")
      .withIndex("by_project_default", (q) => q.eq("projectId", projectId).eq("isDefault", true))
      .first();
  if (repository && repository.projectId !== projectId) {
    throw new Error("Repository does not belong to the selected workspace.");
  }
  return {
    repositoryId: repository?._id,
    repositoryKey: repository?.repository ?? project.githubRepo ?? `workspace:${projectId}`,
    acceptsUnscopedSources: repository?.isDefault ?? true,
  };
}

async function sourceBelongsToRepository(
  ctx: QueryCtx | MutationCtx,
  scope: RepositoryScope,
  source: { workOrderId?: Id<"workOrders">; repositoryId?: Id<"workspaceRepositories"> },
): Promise<boolean> {
  if (source.repositoryId) return source.repositoryId === scope.repositoryId;
  if (!source.workOrderId) return scope.acceptsUnscopedSources;
  const workOrder = await ctx.db.get(source.workOrderId);
  if (!workOrder) return false;
  if (workOrder.repositoryId) return workOrder.repositoryId === scope.repositoryId;
  return workOrder.repository === scope.repositoryKey;
}

async function insertSignal(
  ctx: LearningCtx,
  access: { project: Doc<"projects"> },
  scope: RepositoryScope,
  draft: SignalDraft,
): Promise<Id<"learningSignals"> | undefined> {
  const normalizedSignature = normalizeLearningSignature(draft.deterministicKey);
  const idempotencyKey = [
    SCANNER_VERSION,
    access.project._id,
    scope.repositoryKey,
    draft.sourceType,
    draft.sourceId,
    draft.signalType,
    normalizedSignature,
  ].join(":");
  const existing = await ctx.db
    .query("learningSignals")
    .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
    .first();
  if (existing) return undefined;
  const clusterKey = learningClusterKey({
    projectId: String(access.project._id),
    repositoryKey: scope.repositoryKey,
    signalType: draft.signalType,
    deterministicKey: draft.deterministicKey,
  });
  return ctx.db.insert("learningSignals", {
    tenantId: access.project.tenantId,
    projectId: access.project._id,
    repositoryId: scope.repositoryId,
    repositoryKey: scope.repositoryKey,
    workOrderId: draft.workOrderId,
    workflowRunId: draft.workflowRunId,
    traceId: draft.traceId,
    observationId: draft.observationId,
    evalScoreId: draft.evalScoreId,
    factoryDefinitionVersionId: draft.factoryDefinitionVersionId,
    missionSpecRevisionId: draft.missionSpecRevisionId,
    specFindingCode: draft.specFindingCode,
    signalType: draft.signalType,
    sourceType: draft.sourceType,
    sourceId: boundedText(draft.sourceId, 300),
    reasonCode: boundedText(draft.reasonCode, 100),
    reasonSummary: boundedText(draft.reasonSummary),
    normalizedSignature,
    deterministicKey: boundedText(draft.deterministicKey),
    clusterKey,
    evidenceFingerprint: draft.evidenceFingerprint ?? `${draft.sourceType}:${draft.sourceId}:${draft.signalType}`,
    evidenceRefs: draft.evidenceRefs.map((item) => boundedText(item, 500)).slice(0, 10),
    confidence: Math.max(0, Math.min(1, draft.confidence)),
    severity: draft.severity,
    recipeId: draft.recipeId,
    affectedRole: draft.affectedRole,
    affectedModel: draft.affectedModel,
    observedModelCalls: safeNumber(draft.observedModelCalls),
    observedTokens: safeNumber(draft.observedTokens),
    observedCostUsd: safeNumber(draft.observedCostUsd),
    idempotencyKey,
    observedAt: draft.observedAt,
    createdAt: Date.now(),
    metadata: draft.metadata,
    acceptanceAuthority: false,
  });
}

async function collectSourceSignals(
  ctx: MutationCtx,
  access: { project: Doc<"projects"> },
  scope: RepositoryScope,
  windowStart: number,
): Promise<number> {
  let created = 0;
  const add = async (draft: SignalDraft) => {
    if (draft.observedAt < windowStart) return;
    if (await insertSignal(ctx, access, scope, draft)) created += 1;
  };

  const specEvaluations = await ctx.db
    .query("missionSpecQualityEvaluations")
    .withIndex("by_project_evaluated", (q) =>
      q.eq("projectId", access.project._id).gte("evaluatedAt", windowStart))
    .order("desc")
    .take(MAX_SOURCE_ROWS);
  for (const evaluation of specEvaluations) {
    const mission = await ctx.db.get(evaluation.missionId);
    if (!mission || !(await sourceBelongsToRepository(ctx, scope, {
      repositoryId: mission.repositoryId,
    }))) continue;
    for (const derived of deriveMissionSpecLearningSignals(evaluation.findings)) {
      await add({
        ...derived,
        sourceType: "MISSION_SPEC_QUALITY",
        sourceId: String(evaluation._id),
        reasonCode: derived.findingCode,
        reasonSummary: derived.reason,
        evidenceRefs: [
          `mission-spec-revision:${evaluation.missionSpecRevisionId}`,
          `mission-spec-evaluation:${evaluation._id}`,
          `spec-finding:${derived.findingCode}`,
        ],
        observedAt: evaluation.evaluatedAt,
        missionSpecRevisionId: evaluation.missionSpecRevisionId,
        specFindingCode: derived.findingCode,
        metadata: {
          missionId: evaluation.missionId,
          missionSpecDigest: evaluation.missionSpecDigest,
          rulesetVersion: evaluation.rulesetVersion,
          acceptanceAuthority: false,
        },
      });
    }
  }

  const receipts = await ctx.db
    .query("verificationReceipts")
    .withIndex("by_project", (q) => q.eq("projectId", access.project._id))
    .take(MAX_SOURCE_ROWS);
  for (const receipt of receipts) {
    if (receipt.recordedAt < windowStart) continue;
    if (!(await sourceBelongsToRepository(ctx, scope, receipt))) continue;
    if (receipt.status !== "FAILED" && receipt.verdict !== "NOT_VERIFIED" && receipt.verdict !== "BLOCKED") continue;
    const failedChecks = receipt.checks?.filter((check) => check.status === "FAIL" || check.status === "ERROR") ?? [];
    const reasons = [
      ...failedChecks.map((check) => `${check.category}: ${check.summary}`),
      ...(receipt.verdictReasons ?? []),
      ...(receipt.violations ?? []),
      receipt.result,
    ].filter(Boolean).map(String);
    const reason = reasons.join("; ") || `Verification receipt ${receipt.status.toLowerCase()}`;
    await add({
      signalType: "VERIFICATION_FAILURE",
      sourceType: "VERIFICATION_RECEIPT",
      sourceId: String(receipt._id),
      reasonCode: receipt.verdict ?? receipt.status,
      reasonSummary: reason,
      deterministicKey: `${receipt.verificationMethod ?? "verification"}:${receipt.commandOrCheck ?? reason}`,
      evidenceRefs: [receipt.evidenceLocation, receipt.artifactReference, `verification-receipt:${receipt._id}`].filter(Boolean) as string[],
      confidence: 1,
      severity: receipt.riskLevel ?? "HIGH",
      observedAt: receipt.recordedAt,
      workOrderId: receipt.workOrderId,
      workflowRunId: receipt.workflowRunId,
    });
  }

  const gateDecisions = await ctx.db
    .query("qualityGateDecisions")
    .withIndex("by_project_evaluated", (q) => q.eq("projectId", access.project._id))
    .order("desc")
    .take(MAX_SOURCE_ROWS);
  for (const decision of gateDecisions) {
    if (decision.evaluatedAt < windowStart) continue;
    if (!(await sourceBelongsToRepository(ctx, scope, decision))) continue;
    if (!["INELIGIBLE", "WAIVER_REQUIRED", "AWAITING_HUMAN"].includes(decision.state)) continue;
    const reason = decision.reasons.join("; ") || `Quality gate state ${decision.state}`;
    await add({
      signalType: decision.state === "AWAITING_HUMAN" ? "HUMAN_INTERVENTION" : "DETERMINISTIC_GATE_FAILURE",
      sourceType: "QUALITY_GATE_DECISION",
      sourceId: String(decision._id),
      reasonCode: decision.state,
      reasonSummary: reason,
      deterministicKey: `quality-gate:${reason}`,
      evidenceRefs: [`quality-gate:${decision._id}`, ...decision.blockingFindingIds.map((id) => `finding:${id}`)],
      confidence: 1,
      severity: decision.state === "INELIGIBLE" ? "HIGH" : "MEDIUM",
      observedAt: decision.evaluatedAt,
      workOrderId: decision.workOrderId,
      workflowRunId: decision.workflowRunId,
    });
  }

  const runs = await ctx.db
    .query("workflowRuns")
    .withIndex("by_project", (q) => q.eq("projectId", access.project._id))
    .order("desc")
    .take(MAX_SOURCE_ROWS);
  for (const run of runs) {
    if (run.startedAt < windowStart || !(await sourceBelongsToRepository(ctx, scope, run))) continue;
    const runMetadata = recordValue(run.metadata);
    const runHarness = harnessLearningContext(run.executionManifest);
    const inputTokens = safeNumber(runMetadata.inputTokens);
    const outputTokens = safeNumber(runMetadata.outputTokens);
    const observedTokens = safeNumber(runMetadata.totalTokens)
      ?? (inputTokens !== undefined || outputTokens !== undefined
        ? (inputTokens ?? 0) + (outputTokens ?? 0)
        : undefined);
    const retryCount = run.steps.reduce((sum, step) => sum + step.retryCount, 0);
    if (retryCount > 0) {
      const errors = run.steps.filter((step) => step.retryCount > 0).map((step) => `${step.stepId}:${step.error ?? "retry"}`);
      await add({
        signalType: "RETRY_REQUIRED",
        sourceType: "WORKFLOW_RUN",
        sourceId: String(run._id),
        reasonCode: "STEP_RETRY",
        reasonSummary: `${retryCount} retries: ${errors.join("; ")}`,
        deterministicKey: `${run.workflowId}:${errors.join(";")}`,
        evidenceRefs: [`attempt:${run._id}`, `run:${run.runId}`],
        confidence: 1,
        severity: "HIGH",
        observedAt: run.completedAt ?? run.startedAt,
        workOrderId: run.workOrderId,
        workflowRunId: run._id,
        factoryDefinitionVersionId: run.factoryDefinitionVersionId,
        recipeId: run.workflowId,
        affectedModel: run.model,
        observedModelCalls: run.steps.filter((step) => step.kind === "AGENT").length,
        observedTokens,
        metadata: runHarness ? { harness: runHarness, acceptanceAuthority: false } : undefined,
      });
    }
    if (["RETRYABLE", "RECOVERABLE", "LOST"].includes(run.runtimeDisposition ?? "")) {
      await add({
        signalType: "RECOVERY_REQUIRED",
        sourceType: "WORKFLOW_RUN",
        sourceId: String(run._id),
        reasonCode: run.runtimeDisposition ?? "RECOVERY",
        reasonSummary: run.runtimeDispositionReason ?? run.failureReason ?? "Attempt required recovery",
        deterministicKey: `${run.workflowId}:${run.runtimeDisposition}:${run.runtimeDispositionReason ?? run.failureReason ?? "recovery"}`,
        evidenceRefs: [`attempt:${run._id}`, `run:${run.runId}`],
        confidence: 1,
        severity: "HIGH",
        observedAt: run.completedAt ?? run.startedAt,
        workOrderId: run.workOrderId,
        workflowRunId: run._id,
        factoryDefinitionVersionId: run.factoryDefinitionVersionId,
        recipeId: run.workflowId,
        affectedModel: run.model,
        observedTokens,
        metadata: runHarness ? { harness: runHarness, acceptanceAuthority: false } : undefined,
      });
    }
    const recipeMismatch = deriveRecipeMismatch({
      workflowId: run.workflowId,
      steps: run.steps.map((step) => ({
        stepId: step.stepId,
        retryCount: step.retryCount,
        error: step.error,
      })),
    });
    if (recipeMismatch) {
      await add({
        ...recipeMismatch,
        sourceType: "WORKFLOW_RUN",
        sourceId: String(run._id),
        reasonCode: "BUILD_BEFORE_TYPECHECK_FAILURE",
        reasonSummary: recipeMismatch.reason,
        evidenceRefs: [`attempt:${run._id}`, `run:${run.runId}`],
        observedAt: run.completedAt ?? run.startedAt,
        workOrderId: run.workOrderId,
        workflowRunId: run._id,
        factoryDefinitionVersionId: run.factoryDefinitionVersionId,
        recipeId: run.workflowId,
        affectedModel: run.model,
        metadata: runHarness ? { harness: runHarness, acceptanceAuthority: false } : undefined,
      });
    }
  }

  const traces = await ctx.db
    .query("traces")
    .withIndex("by_project_started", (q) => q.eq("projectId", access.project._id))
    .order("desc")
    .take(MAX_SOURCE_ROWS);
  let observationTracesScanned = 0;
  for (const trace of traces) {
    if (trace.startedAt < windowStart || !(await sourceBelongsToRepository(ctx, scope, trace))) continue;
    const traceHarness = harnessLearningContext(trace.metadata);
    if ((trace.humanInterventionCount ?? 0) > 0) {
      await add({
        signalType: "HUMAN_INTERVENTION",
        sourceType: "TRACE",
        sourceId: String(trace._id),
        reasonCode: "TRACE_HUMAN_INTERVENTION",
        reasonSummary: `${trace.humanInterventionCount} human intervention(s) in ${trace.name}`,
        deterministicKey: `${trace.name}:${trace.error?.message ?? "human-intervention"}`,
        evidenceRefs: [`trace:${trace.externalTraceId}`],
        confidence: 1,
        severity: "MEDIUM",
        observedAt: trace.endedAt ?? trace.startedAt,
        workOrderId: trace.workOrderId,
        workflowRunId: trace.workflowRunId,
        traceId: trace._id,
        factoryDefinitionVersionId: trace.factoryDefinitionVersionId,
        affectedModel: trace.model,
        observedModelCalls: 1,
        observedTokens: trace.tokenUsage?.total ?? ((trace.tokenUsage?.input ?? 0) + (trace.tokenUsage?.output ?? 0)),
        observedCostUsd: trace.estimatedCostUsd,
        metadata: traceHarness ? { harness: traceHarness, acceptanceAuthority: false } : undefined,
      });
    }
    const metadata = recordValue(trace.metadata);
    if (metadata.tokenWaste === true) {
      await add({
        signalType: "TOKEN_WASTE",
        sourceType: "TRACE",
        sourceId: String(trace._id),
        reasonCode: "EXPLICIT_TOKEN_WASTE",
        reasonSummary: boundedText(metadata.tokenWasteReason ?? `Trace ${trace.name} was explicitly marked as token waste`),
        deterministicKey: `${trace.name}:${metadata.tokenWasteReason ?? "token-waste"}`,
        evidenceRefs: [`trace:${trace.externalTraceId}`],
        confidence: 1,
        severity: "MEDIUM",
        observedAt: trace.endedAt ?? trace.startedAt,
        workOrderId: trace.workOrderId,
        workflowRunId: trace.workflowRunId,
        traceId: trace._id,
        affectedModel: trace.model,
        observedTokens: trace.tokenUsage?.total,
        observedCostUsd: trace.estimatedCostUsd,
        metadata: traceHarness ? { harness: traceHarness, acceptanceAuthority: false } : undefined,
      });
    }
    if (observationTracesScanned < MAX_OBSERVATION_TRACES) {
      observationTracesScanned += 1;
      const observations = await ctx.db
        .query("traceObservations")
        .withIndex("by_trace_started", (q) => q.eq("traceId", trace._id))
        .order("desc")
        .take(MAX_OBSERVATIONS_PER_TRACE);
      for (const observation of observations) {
        for (const derived of deriveObservationLearningSignals(observation)) {
          await add({
            ...derived,
            sourceType: "TRACE",
            sourceId: String(observation._id),
            reasonCode: derived.signalType,
            reasonSummary: derived.reason,
            evidenceRefs: [
              `trace:${trace.externalTraceId}`,
              `observation:${observation._id}`,
            ],
            observedAt: observation.endedAt ?? observation.startedAt,
            workOrderId: trace.workOrderId,
            workflowRunId: trace.workflowRunId,
            traceId: trace._id,
            observationId: observation._id,
            factoryDefinitionVersionId: trace.factoryDefinitionVersionId,
            affectedModel: observation.model ?? trace.model,
            observedModelCalls: observation.type === "AGENT" ? 1 : undefined,
            observedTokens: observation.tokenUsage?.total,
            observedCostUsd: observation.estimatedCostUsd,
            metadata: harnessLearningContext(observation.metadata) || traceHarness
              ? { harness: harnessLearningContext(observation.metadata) ?? traceHarness, acceptanceAuthority: false }
              : undefined,
          });
        }
      }
    }
  }

  for (const status of ["REJECTED", "REVISION_REQUESTED"] as const) {
    const decisions = await ctx.db
      .query("approvalDecisions")
      .withIndex("by_project_status", (q) => q.eq("projectId", access.project._id).eq("status", status))
      .take(MAX_SOURCE_ROWS / 2);
    for (const decision of decisions) {
      const observedAt = decision.decidedAt ?? decision.createdAt;
      if (observedAt < windowStart || !(await sourceBelongsToRepository(ctx, scope, decision))) continue;
      const reason = decision.reason ?? decision.conditions?.join("; ") ?? decision.requestedAction;
      await add({
        signalType: status === "REVISION_REQUESTED" ? "REPEATED_REVIEW_FINDING" : "HUMAN_CORRECTION",
        sourceType: "HUMAN_DECISION",
        sourceId: String(decision._id),
        reasonCode: decision.decision ?? status,
        reasonSummary: reason,
        deterministicKey: `${decision.approvalType}:${reason}`,
        evidenceRefs: [`approval-decision:${decision._id}`],
        confidence: 1,
        severity: decision.riskLevel,
        observedAt,
        workOrderId: decision.workOrderId,
        workflowRunId: decision.workflowRunId,
      });
    }
  }

  // Review corrections are advisory learning evidence. Multiple equivalent
  // comments on one WorkOrder count once; candidate thresholding therefore
  // requires the same correction pattern on independent WorkOrders.
  const correctionJudgments = await ctx.db
    .query("reviewJudgments")
    .withIndex("by_project_action", (q) => q.eq("projectId", access.project._id).eq("action", "CORRECTION"))
    .order("desc")
    .take(MAX_SOURCE_ROWS);
  const observedCorrections = new Set<string>();
  for (const judgment of correctionJudgments) {
    if (judgment.recordedAt < windowStart || !judgment.correctionCategory || !judgment.normalizedCorrection) continue;
    if (!(await sourceBelongsToRepository(ctx, scope, judgment))) continue;
    const independentKey = `${judgment.workOrderId}:${judgment.correctionCategory}:${judgment.normalizedCorrection}`;
    if (observedCorrections.has(independentKey)) continue;
    observedCorrections.add(independentKey);
    const workOrder = await ctx.db.get(judgment.workOrderId);
    if (!workOrder) continue;
    const repeatedFinding = [
      "ARCHITECTURAL_REVIEW_PATTERN", "MISSING_DETERMINISTIC_GATE",
      "REPEATED_SECURITY_COMMENT", "REPEATED_SCOPE_CORRECTION",
    ].includes(judgment.correctionCategory);
    await add({
      signalType: repeatedFinding ? "REPEATED_REVIEW_FINDING" : "HUMAN_CORRECTION",
      sourceType: "REVIEW_JUDGMENT",
      sourceId: String(judgment._id),
      reasonCode: judgment.correctionCategory,
      reasonSummary: judgment.summary,
      deterministicKey: `${judgment.correctionCategory}:${judgment.normalizedCorrection}`,
      evidenceFingerprint: `review-correction:${judgment.workOrderId}:${judgment.correctionCategory}:${judgment.normalizedCorrection}`,
      evidenceRefs: [
        `review-judgment:${judgment._id}`,
        `work-order:${judgment.workOrderId}:revision:${judgment.workOrderRevisionNumber}`,
        `attempt:${judgment.workflowRunId}:candidate:${judgment.candidateRevision ?? "unknown"}`,
      ],
      confidence: 1,
      severity: workOrder.riskLevel,
      observedAt: judgment.recordedAt,
      workOrderId: judgment.workOrderId,
      workflowRunId: judgment.workflowRunId,
      metadata: { correctionCategory: judgment.correctionCategory, reviewPackageDigest: judgment.reviewPackageDigest, acceptanceAuthority: false },
    });
  }

  const exhaustedRoutes = await ctx.db
    .query("modelRoutingDecisions")
    .withIndex("by_project_created", (q) => q.eq("projectId", access.project._id))
    .order("desc")
    .take(MAX_SOURCE_ROWS);
  for (const decision of exhaustedRoutes) {
    if (decision.createdAt < windowStart || decision.mode !== "EXHAUSTED") continue;
    if (!(await sourceBelongsToRepository(ctx, scope, decision))) continue;
    await add({
      signalType: "MODEL_ROUTING_MISMATCH",
      sourceType: "WORKFLOW_RUN",
      sourceId: String(decision._id),
      reasonCode: "ROUTING_EXHAUSTED",
      reasonSummary: decision.explanation,
      deterministicKey: `${decision.operatingLane ?? "unknown"}:${decision.requestedTier ?? "unknown"}:${decision.explanation}`,
      evidenceRefs: [`model-routing-decision:${decision._id}`],
      confidence: 1,
      severity: decision.riskLevel,
      observedAt: decision.createdAt,
      workOrderId: decision.workOrderId,
      workflowRunId: decision.workflowRunId,
      affectedModel: decision.selectedModelId,
    });
  }
  return created;
}

async function projectClustersAndCandidates(
  ctx: LearningCtx,
  access: { project: Doc<"projects"> },
  scope: RepositoryScope,
  windowStart: number,
) {
  const signals = await ctx.db
    .query("learningSignals")
    .withIndex("by_project_repository_observed", (q) =>
      q.eq("projectId", access.project._id).eq("repositoryKey", scope.repositoryKey).gte("observedAt", windowStart))
    .order("desc")
    .take(MAX_SIGNAL_ROWS);
  const projection = aggregateLearningSignals(signals.map((signal): LearningSignalInput => ({
    projectId: String(signal.projectId),
    repositoryKey: signal.repositoryKey,
    signalType: signal.signalType,
    deterministicKey: signal.deterministicKey,
    evidenceFingerprint: signal.evidenceFingerprint,
    evidenceRefs: signal.evidenceRefs,
    observedAt: signal.observedAt,
    confidence: signal.confidence,
    severity: signal.severity,
    reason: signal.reasonSummary,
    acceptanceAuthority: false,
    observedModelCalls: signal.observedModelCalls,
    observedTokens: signal.observedTokens,
    observedCostUsd: signal.observedCostUsd,
  })), {
    minimumOccurrences: MINIMUM_OCCURRENCES,
    maximumEvidenceItems: MAX_EVIDENCE_ITEMS,
    windowStart,
  });

  let createdCandidates = 0;
  for (const cluster of projection.clusters) {
    const existingCluster = await ctx.db
      .query("learningSignalClusters")
      .withIndex("by_cluster_key", (q) => q.eq("clusterKey", cluster.clusterKey))
      .first();
    const clusterSignals = signals
      .filter((signal) => signal.clusterKey === cluster.clusterKey)
      .sort((left, right) => right.observedAt - left.observedAt)
      .slice(0, MAX_EVIDENCE_ITEMS);
    const clusterPatch = {
      occurrenceCount: cluster.occurrenceCount,
      signalIds: clusterSignals.map((signal) => signal._id),
      evidenceFingerprints: cluster.evidenceFingerprints,
      evidenceRefs: cluster.evidenceRefs,
      confidence: cluster.confidence,
      severity: cluster.severity,
      observedCostImpact: cluster.observedCostImpact,
      firstObservedAt: cluster.firstObservedAt,
      lastObservedAt: cluster.lastObservedAt,
      reasonSummary: cluster.reason,
      updatedAt: Date.now(),
    };
    const clusterId = existingCluster?._id ?? await ctx.db.insert("learningSignalClusters", {
      tenantId: access.project.tenantId,
      projectId: access.project._id,
      repositoryId: scope.repositoryId,
      repositoryKey: scope.repositoryKey,
      clusterKey: cluster.clusterKey,
      signalType: cluster.signalType,
      deterministicKey: cluster.deterministicKey,
      status: cluster.qualifiesForCandidate ? "ACTIVE" : "BELOW_THRESHOLD",
      minimumOccurrences: MINIMUM_OCCURRENCES,
      ...clusterPatch,
      createdAt: Date.now(),
      acceptanceAuthority: false,
    });
    if (existingCluster) await ctx.db.patch(existingCluster._id, clusterPatch);
    if (!cluster.qualifiesForCandidate || existingCluster?.candidateId) continue;

    const dedupeKey = `factory-learning:${cluster.clusterKey}`;
    const existingCandidate = await ctx.db
      .query("metaLoopSuggestions")
      .withIndex("by_dedupe", (q) => q.eq("dedupeKey", dedupeKey))
      .first();
    if (existingCandidate) {
      await ctx.db.patch(clusterId, { candidateId: existingCandidate._id, status: "CANDIDATE_CREATED", updatedAt: Date.now() });
      continue;
    }
    const candidate = buildImprovementCandidate(cluster);
    const candidateId = await ctx.db.insert("metaLoopSuggestions", {
      projectId: access.project._id,
      kind: metaLoopKind(candidate.candidateType),
      title: `${candidate.candidateType.toLowerCase().replace(/_/g, " ")}: ${cluster.signalType.toLowerCase().replace(/_/g, " ")}`,
      summary: candidate.problemStatement,
      status: "OPEN",
      sourceRef: `learning-cluster:${clusterId}`,
      sourceLinks: cluster.evidenceRefs,
      dedupeKey,
      evidenceCount: candidate.evidenceCount,
      confidence: candidate.confidence,
      impact: cluster.severity,
      affectedSurface: cluster.deterministicKey,
      repositoryId: scope.repositoryId,
      learningClusterId: clusterId,
      candidateType: candidate.candidateType,
      problemStatement: candidate.problemStatement,
      proposedChange: candidate.proposedChange,
      expectedBenefit: candidate.expectedBenefit,
      risk: candidate.risk,
      estimatedEffort: candidate.estimatedEffort,
      observedCostImpact: candidate.observedCostImpact,
      acceptanceAuthority: false,
      payload: {
        source: "FACTORY_LEARNING_V1",
        scannerVersion: SCANNER_VERSION,
        repositoryKey: scope.repositoryKey,
        deterministicOnly: true,
      },
      createdAt: Date.now(),
    });
    await ctx.db.patch(clusterId, { candidateId, status: "CANDIDATE_CREATED", updatedAt: Date.now() });
    createdCandidates += 1;
  }
  return { projection, createdCandidates };
}

async function refreshProject(
  ctx: MutationCtx,
  access: { project: Doc<"projects">; actorId: string },
  scope: RepositoryScope,
) {
  const windowStart = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1_000;
  const createdSignals = await collectSourceSignals(ctx, access, scope, windowStart);
  const { projection, createdCandidates } = await projectClustersAndCandidates(ctx, access, scope, windowStart);
  await ctx.db.insert("activities", {
    tenantId: access.project.tenantId,
    projectId: access.project._id,
    actorType: access.actorId.startsWith("system:") ? "SYSTEM" : "HUMAN",
    actorId: access.actorId,
    action: "FACTORY_LEARNING_REFRESHED",
    description: `Refreshed deterministic learning evidence for ${scope.repositoryKey}`,
    targetType: "FACTORY_LEARNING",
    targetId: scope.repositoryKey,
    metadata: {
      scannerVersion: SCANNER_VERSION,
      createdSignals,
      clusters: projection.clusters.length,
      createdCandidates,
      duplicatesSuppressed: projection.duplicatesSuppressed,
      modelCalls: 0,
      acceptanceAuthority: false,
    },
  });
  return {
    repositoryKey: scope.repositoryKey,
    createdSignals,
    clusters: projection.clusters.length,
    createdCandidates,
    duplicatesSuppressed: projection.duplicatesSuppressed,
    modelCalls: 0,
  };
}

export const refresh = mutation({
  args: {
    projectId: v.id("projects"),
    repositoryId: v.optional(v.id("workspaceRepositories")),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.IMPROVE);
    const scope = await resolveRepositoryScope(ctx, args.projectId, args.repositoryId);
    return refreshProject(ctx, access, scope);
  },
});

export const scanScheduled = internalMutation({
  args: {},
  handler: async (ctx) => {
    const schedules = await ctx.db.query("contextWorkflowRuns").collect();
    const projectIds = [...new Set(schedules
      .filter((run) => run.projectId && run.skillName === "factory-learning-scan" && run.schedule && run.schedule !== "manual")
      .map((run) => run.projectId!))];
    const results = [];
    for (const projectId of projectIds) {
      const project = await ctx.db.get(projectId);
      if (!project) continue;
      const scope = await resolveRepositoryScope(ctx, projectId);
      results.push(await refreshProject(ctx, { project, actorId: "system:factory-learning" }, scope));
    }
    return { scannedProjects: projectIds.length, results };
  },
});

export const getCandidate = query({
  args: { candidateId: v.id("metaLoopSuggestions") },
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate?.projectId) throw new Error("Improvement candidate is unavailable.");
    await requireWorkspacePermission(ctx, candidate.projectId, FACTORY_PERMISSIONS.VIEW);
    return candidate;
  },
});

export const getExperimentReview = query({
  args: { candidateId: v.id("metaLoopSuggestions") },
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate?.projectId) throw new Error("Improvement candidate is unavailable.");
    await requireWorkspacePermission(ctx, candidate.projectId, FACTORY_PERMISSIONS.VIEW);
    if (!candidate.experimentId) return null;
    const experiment = await ctx.db.get(candidate.experimentId);
    if (!experiment || experiment.projectId !== candidate.projectId) return null;
    const variants = await ctx.db
      .query("experimentVariants")
      .withIndex("by_experiment", (q) => q.eq("experimentId", experiment._id))
      .collect();
    const metrics = variants.map((variant) => ({
      sampleSize: variant.sampleSize,
      successRate: safeNumber(recordValue(variant.metrics).successRate),
      averageDurationMs: safeNumber(recordValue(variant.metrics).averageDurationMs),
      averageCostUsd: safeNumber(recordValue(variant.metrics).averageCostUsd),
    }));
    return {
      experiment,
      variants,
      recommendation: variants.length === 2
        ? recommendImprovementPromotion({ baseline: metrics[0], candidate: metrics[1] })
        : null,
    };
  },
});

export const reviewCandidate = mutation({
  args: {
    candidateId: v.id("metaLoopSuggestions"),
    decision: v.union(v.literal("DISMISS"), v.literal("REJECT"), v.literal("SNOOZE")),
    reason: v.string(),
    snoozedUntil: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate?.projectId || candidate.acceptanceAuthority !== false) {
      throw new Error("Factory Learning candidate is unavailable.");
    }
    const access = await requireWorkspacePermission(ctx, candidate.projectId, FACTORY_PERMISSIONS.APPROVE);
    if (!["OPEN", "SNOOZED"].includes(candidate.status)) {
      throw new Error("Only open or snoozed candidates can be reviewed.");
    }
    const reason = boundedText(args.reason, 2_000);
    if (!reason) throw new Error("A review reason is required.");
    if (args.decision === "SNOOZE" && (!args.snoozedUntil || args.snoozedUntil <= Date.now())) {
      throw new Error("Snoozed candidates require a future review date.");
    }
    const status = args.decision === "SNOOZE" ? "SNOOZED" : args.decision === "REJECT" ? "REJECTED" : "DISMISSED";
    await ctx.db.patch(candidate._id, {
      status,
      dismissalReason: reason,
      snoozedUntil: args.decision === "SNOOZE" ? args.snoozedUntil : undefined,
      reviewedAt: Date.now(),
      reviewedBy: access.actorId,
      resolvedAt: args.decision === "SNOOZE" ? undefined : Date.now(),
    });
    if (candidate.learningClusterId) {
      await ctx.db.patch(candidate.learningClusterId, {
        status: args.decision === "SNOOZE" ? "SNOOZED" : "CLOSED",
        updatedAt: Date.now(),
      });
    }
    await ctx.db.insert("activities", {
      tenantId: access.project.tenantId,
      projectId: access.project._id,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: `FACTORY_LEARNING_${status}`,
      description: `${args.decision.toLowerCase()} improvement candidate: ${reason}`,
      targetType: "META_LOOP_SUGGESTION",
      targetId: String(candidate._id),
      metadata: { reason, snoozedUntil: args.snoozedUntil, acceptanceAuthority: false },
    });
    return { candidateId: candidate._id, status };
  },
});

export const linkExperiment = internalMutation({
  args: {
    candidateId: v.id("metaLoopSuggestions"),
    experimentId: v.id("experiments"),
    actorId: v.string(),
  },
  handler: async (ctx, args) => {
    const [candidate, experiment] = await Promise.all([
      ctx.db.get(args.candidateId),
      ctx.db.get(args.experimentId),
    ]);
    if (!candidate?.projectId || candidate.acceptanceAuthority !== false || !experiment || experiment.projectId !== candidate.projectId) {
      throw new Error("Experiment and candidate scopes do not match.");
    }
    await ctx.db.patch(candidate._id, {
      experimentId: experiment._id,
      status: "ACCEPTED",
      reviewedAt: Date.now(),
      reviewedBy: args.actorId,
      dismissalReason: undefined,
      snoozedUntil: undefined,
    });
    await ctx.db.insert("activities", {
      tenantId: experiment.tenantId,
      projectId: experiment.projectId,
      actorType: "HUMAN",
      actorId: args.actorId,
      action: "FACTORY_LEARNING_EXPERIMENT_APPROVED",
      description: `Approved governed experiment for ${candidate.title}`,
      targetType: "META_LOOP_SUGGESTION",
      targetId: String(candidate._id),
      metadata: { experimentId: experiment._id, acceptanceAuthority: false },
    });
    return candidate._id;
  },
});

export const approveExperiment = action({
  args: {
    candidateId: v.id("metaLoopSuggestions"),
    datasetId: v.id("evalDatasets"),
    evalDefinitionIds: v.array(v.id("evalDefinitions")),
    baseline: v.object({
      factoryDefinitionVersionId: v.optional(v.id("factoryDefinitionVersions")),
      executor: v.optional(v.string()),
      model: v.optional(v.string()),
      configuration: v.optional(v.any()),
    }),
    candidate: v.object({
      factoryDefinitionVersionId: v.optional(v.id("factoryDefinitionVersions")),
      executor: v.optional(v.string()),
      model: v.optional(v.string()),
      configuration: v.optional(v.any()),
    }),
  },
  handler: async (ctx, args): Promise<{ candidateId: string; experimentId: string }> => {
    const candidate = await ctx.runQuery(api.factory.learning.getCandidate, { candidateId: args.candidateId });
    if (!candidate.projectId || candidate.acceptanceAuthority !== false) throw new Error("Factory Learning candidate is unavailable.");
    if (!["OPEN", "SNOOZED"].includes(candidate.status)) throw new Error("Only open or snoozed candidates can start an experiment.");
    const authorization = await requireFactoryActionWithAudit(ctx, {
      projectId: candidate.projectId,
      permission: FACTORY_PERMISSIONS.APPROVE,
      operation: "FACTORY_LEARNING_APPROVE_EXPERIMENT",
    });
    const result = await ctx.runMutation(api.observability.createExperiment, {
      projectId: candidate.projectId,
      datasetId: args.datasetId,
      name: `Factory Learning: ${candidate.title}`,
      evalDefinitionIds: args.evalDefinitionIds,
      variants: [
        { name: "Current baseline", ...args.baseline },
        { name: "Proposed candidate", ...args.candidate },
      ],
    });
    if (!result.experiment) throw new Error("Canonical experiment could not be created.");
    await ctx.runMutation(internal.factory.learning.linkExperiment, {
      candidateId: args.candidateId,
      experimentId: result.experiment._id,
      actorId: authorization.actorId,
    });
    return { candidateId: String(args.candidateId), experimentId: String(result.experiment._id) };
  },
});

export const syncAgentConfiguration = mutation({
  args: {
    projectId: v.id("projects"),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    commitSha: v.string(),
    scanDigest: v.string(),
    limits: v.object({ maximumFiles: v.number(), maximumBytesPerFile: v.number() }),
    entries: v.array(configurationEntryArg),
    findings: v.array(configurationFindingArg),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.IMPROVE);
    const scope = await resolveRepositoryScope(ctx, args.projectId, args.repositoryId);
    if (args.entries.length > 200 || args.findings.length > 200) throw new Error("Configuration registry sync exceeds the V1 record cap.");
    if (args.limits.maximumFiles > 200 || args.limits.maximumBytesPerFile > 262_144) {
      throw new Error("Configuration registry scan limits exceed the V1 safety envelope.");
    }
    const existing = (await ctx.db
      .query("agentConfigurationScans")
      .withIndex("by_scan_digest", (q) => q.eq("scanDigest", args.scanDigest))
      .collect()).find((scan) => scan.projectId === args.projectId && scan.repositoryKey === scope.repositoryKey);
    if (existing) {
      return { scanId: existing._id, created: false };
    }
    const now = Date.now();
    const scanId = await ctx.db.insert("agentConfigurationScans", {
      tenantId: access.project.tenantId,
      projectId: args.projectId,
      repositoryId: scope.repositoryId,
      repositoryKey: scope.repositoryKey,
      commitSha: boundedText(args.commitSha, 100),
      scanDigest: boundedText(args.scanDigest, 100),
      scannerVersion: SCANNER_VERSION,
      status: "COMPLETED",
      fileCount: args.entries.length,
      findingCount: args.findings.length,
      limits: args.limits,
      actorId: access.actorId,
      startedAt: now,
      completedAt: now,
      acceptanceAuthority: false,
    });
    for (const entry of args.entries) {
      await ctx.db.insert("agentConfigurationEntries", {
        tenantId: access.project.tenantId,
        projectId: args.projectId,
        repositoryId: scope.repositoryId,
        repositoryKey: scope.repositoryKey,
        scanId,
        ...entry,
        sourcePath: boundedText(entry.sourcePath, 500),
        scope: boundedText(entry.scope, 500),
        digest: boundedText(entry.digest, 100),
        lastChangedCommit: entry.lastChangedCommit ? boundedText(entry.lastChangedCommit, 100) : undefined,
        directives: entry.directives.slice(0, 100).map((directive) => ({
          ...directive,
          key: boundedText(directive.key, 200),
          statement: boundedText(directive.statement, 500),
        })),
        overlapKeys: entry.overlapKeys.map((key) => boundedText(key, 200)).slice(0, 100),
        acceptanceAuthority: false,
      });
    }
    for (const finding of args.findings) {
      const findingId = await ctx.db.insert("agentConfigurationFindings", {
        tenantId: access.project.tenantId,
        projectId: args.projectId,
        repositoryId: scope.repositoryId,
        repositoryKey: scope.repositoryKey,
        scanId,
        ...finding,
        normalizedKey: boundedText(finding.normalizedKey, 200),
        summary: boundedText(finding.summary),
        sources: finding.sources.slice(0, 20).map((source) => ({
          path: boundedText(source.path, 500),
          harness: boundedText(source.harness, 50),
          statement: boundedText(source.statement, 500),
        })),
        suggestedRemediation: boundedText(finding.suggestedRemediation),
        createdAt: now,
        acceptanceAuthority: false,
      });
      if (finding.findingType === "CONTRADICTION" || finding.severity === "HIGH") {
        await insertSignal(ctx, access, scope, {
          signalType: "AGENT_CONFIG_DRIFT",
          sourceType: "CONFIGURATION_REGISTRY",
          sourceId: String(findingId),
          reasonCode: finding.findingType,
          reasonSummary: finding.summary,
          deterministicKey: `${finding.normalizedKey}:${finding.findingType}`,
          evidenceRefs: finding.sources.map((source) => `config:${source.path}`),
          confidence: 1,
          severity: finding.severity === "HIGH" ? "HIGH" : "MEDIUM",
          observedAt: now,
        });
      }
    }
    await projectClustersAndCandidates(ctx, access, scope, now - WINDOW_DAYS * 24 * 60 * 60 * 1_000);
    await ctx.db.insert("activities", {
      tenantId: access.project.tenantId,
      projectId: access.project._id,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "AGENT_CONFIGURATION_REGISTRY_SYNCED",
      description: `Synced read-only agent configuration projection for ${scope.repositoryKey}`,
      targetType: "AGENT_CONFIGURATION_SCAN",
      targetId: String(scanId),
      metadata: { commitSha: args.commitSha, entries: args.entries.length, findings: args.findings.length, acceptanceAuthority: false },
    });
    return { scanId, created: true };
  },
});

export const getDashboard = query({
  args: {
    projectId: v.id("projects"),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    const scope = await resolveRepositoryScope(ctx, args.projectId, args.repositoryId);
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 50), 100));
    const [repositories, signals, clusters, datasets, definitions, scans] = await Promise.all([
      ctx.db.query("workspaceRepositories").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
      ctx.db.query("learningSignals").withIndex("by_project_repository_observed", (q) => q.eq("projectId", args.projectId).eq("repositoryKey", scope.repositoryKey)).order("desc").take(limit),
      ctx.db.query("learningSignalClusters").withIndex("by_project_repository_updated", (q) => q.eq("projectId", args.projectId).eq("repositoryKey", scope.repositoryKey)).order("desc").take(limit),
      ctx.db.query("evalDatasets").withIndex("by_project_updated", (q) => q.eq("projectId", args.projectId)).order("desc").take(100),
      ctx.db.query("evalDefinitions").withIndex("by_project_enabled", (q) => q.eq("projectId", args.projectId).eq("enabled", true)).take(100),
      ctx.db.query("agentConfigurationScans").withIndex("by_project_repository", (q) => q.eq("projectId", args.projectId).eq("repositoryKey", scope.repositoryKey)).order("desc").take(1),
    ]);
    const learningClusters = clusters;
    const candidates = (await Promise.all(learningClusters.map((cluster) =>
      cluster.candidateId ? ctx.db.get(cluster.candidateId) : null
    ))).filter((candidate): candidate is Doc<"metaLoopSuggestions"> => Boolean(candidate));
    const experimentRows = (await Promise.all(candidates.map(async (candidate) => {
      if (!candidate.experimentId) return null;
      const experiment = await ctx.db.get(candidate.experimentId);
      if (!experiment || experiment.projectId !== args.projectId) return null;
      return {
        ...experiment,
        variants: await ctx.db.query("experimentVariants").withIndex("by_experiment", (q) => q.eq("experimentId", experiment._id)).collect(),
      };
    }))).filter((experiment): experiment is NonNullable<typeof experiment> => Boolean(experiment));
    const latestScan = scans[0];
    const [configurationEntries, configurationFindings] = latestScan
      ? await Promise.all([
        ctx.db.query("agentConfigurationEntries").withIndex("by_scan", (q) => q.eq("scanId", latestScan._id)).take(200),
        ctx.db.query("agentConfigurationFindings").withIndex("by_scan", (q) => q.eq("scanId", latestScan._id)).take(200),
      ])
      : [[], []];
    return {
      policy: {
        mode: "DETERMINISTIC_V1" as const,
        semanticClusteringEnabled: false,
        modelCallsPerRefresh: 0,
        windowDays: WINDOW_DAYS,
        maximumSourceRows: MAX_SOURCE_ROWS,
        maximumSignals: MAX_SIGNAL_ROWS,
        minimumOccurrences: MINIMUM_OCCURRENCES,
        maximumEvidenceItems: MAX_EVIDENCE_ITEMS,
        acceptanceAuthority: false,
        scheduleSkillName: "factory-learning-scan",
      },
      selectedRepository: {
        repositoryId: scope.repositoryId,
        repositoryKey: scope.repositoryKey,
      },
      repositories,
      signals,
      clusters: learningClusters,
      candidates,
      experiments: experimentRows,
      datasets,
      evalDefinitions: definitions,
      configuration: {
        scan: latestScan ?? null,
        entries: configurationEntries,
        findings: configurationFindings,
      },
    };
  },
});
