import {
  resolveExecutionRoute,
  workOrderRiskToExecutionTier,
  type ExecutionEvidence,
  type ExecutionRoutingCandidate,
  type ExecutionRoutingMode,
  type ExecutionRoutingPolicy,
} from "@mission-control/shared";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { resolveFlag, type FlagRow } from "./flags";
import { countActiveFactoryWorkerLeases, factoryWorkerEligibility } from "./factoryWorkerRuntime";
import { factoryHarnessCapabilityRequirements, resolveFrozenHarnessBinding } from "./harnessCapabilities";
import { loadModelCatalogForProject } from "./modelCatalogScope";
import { getCurrentVerificationRoutingOutcome } from "./currentVerification";
import { sandboxProfileProductionEligible } from "./sandboxProfileAdmission";
import { modelRouteProductionEligible } from "./modelRouteAdmission";
import {
  harnessCapabilityRequirementsSatisfied,
  harnessSupportsModel,
} from "@mission-control/workflow-engine/harness-contract";

type RoutingCtx = QueryCtx | MutationCtx;

export const DEFAULT_EXECUTION_ROUTING_POLICY = {
  mode: "ADVISORY" as const,
  evidenceWindowDays: 30,
  minimumVerifiedAttempts: 5,
  minimumEvidenceCoverage: 0.6,
  minimumScoreMargin: 5,
  minimumContextWindow: undefined as number | undefined,
  guardedAutoPromotedAt: undefined as number | undefined,
  guardedAutoPromotedBy: undefined as string | undefined,
  guardedAutoPromotionReason: undefined as string | undefined,
};

const MAX_CANDIDATES = 25;
const MAX_EVIDENCE_ATTEMPTS = 250;
const MAX_OBSERVABILITY_RECORDS = 500;

type RoutingVerifiedOutcome = {
  sourceAttemptId: string;
  outcome: "SUCCESS" | "FAILURE";
  recordedAt: number;
  lineage: "POLICY_V2" | "LEGACY";
};

export function executionRoutingRequested(input: {
  factoryDefinitionVersionId?: Id<"factoryDefinitionVersions">;
  executionRoutingPin?: Doc<"workOrders">["executionRoutingPin"];
}) {
  return Boolean(input.factoryDefinitionVersionId || input.executionRoutingPin);
}

export { sandboxProfileProductionEligible } from "./sandboxProfileAdmission";

function tupleKey(version: Doc<"factoryDefinitionVersions">) {
  return `${String(version._id)}:${version.configurationDigest}`;
}

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : undefined;
}

function primaryAgentVersion(
  workflow: Doc<"workflows">,
  version: Doc<"factoryDefinitionVersions">,
  agentVersions: Array<Doc<"agentVersions"> | null>,
) {
  const primaryIndex = (version.agentBindings ?? []).findIndex(
    (binding) => binding.workflowAgentId === workflow.steps?.[0]?.agent,
  );
  return agentVersions[primaryIndex >= 0 ? primaryIndex : 0] ?? null;
}

export async function loadExecutionRoutingEvidenceBundle(
  ctx: RoutingCtx,
  projectId: Id<"projects">,
  cutoffAt: number,
  evidenceWindowDays: number,
) {
  const windowStartedAt = cutoffAt - evidenceWindowDays * 86_400_000;
  const [attempts, traces, gates] = await Promise.all([
    ctx.db.query("workflowRuns")
      .withIndex("by_project", (query) => query.eq("projectId", projectId))
      .order("desc")
      .take(MAX_EVIDENCE_ATTEMPTS),
    ctx.db.query("traces")
      .withIndex("by_project_started", (query) => query.eq("projectId", projectId).gte("startedAt", windowStartedAt))
      .order("desc")
      .take(MAX_OBSERVABILITY_RECORDS),
    ctx.db.query("qualityGateDecisions")
      .withIndex("by_project_evaluated", (query) => query.eq("projectId", projectId).gte("evaluatedAt", windowStartedAt))
      .order("desc")
      .take(MAX_OBSERVABILITY_RECORDS),
  ]);
  const boundedAttempts = attempts.filter((attempt) =>
    attempt.startedAt >= windowStartedAt
    && attempt.startedAt <= cutoffAt
    && Boolean(attempt.factoryDefinitionVersionId)
    && (attempt.attemptPurpose ?? "IMPLEMENTATION") === "IMPLEMENTATION"
  );
  const attemptById = new Map(boundedAttempts.map((attempt) => [String(attempt._id), attempt]));
  const workOrderIds = [...new Set(boundedAttempts.map((attempt) => String(attempt.workOrderId)))];
  const workOrders = (await Promise.all(workOrderIds.map((id) => ctx.db.get(id as Id<"workOrders">))))
    .filter((workOrder): workOrder is Doc<"workOrders"> => Boolean(
      workOrder && String(workOrder.projectId) === String(projectId)
    ));
  const canonicalOutcomes = (await Promise.all(workOrders.map(async (workOrder) => {
    const current = await getCurrentVerificationRoutingOutcome(ctx, workOrder, cutoffAt);
    if (!current.sourceAttemptId || !current.verifiedOutcome || current.verificationRecordedAt === undefined) {
      return null;
    }
    const sourceAttempt = attemptById.get(current.sourceAttemptId);
    if (!sourceAttempt
      || String(sourceAttempt.workOrderId) !== String(workOrder._id)
      || !sourceAttempt.verificationSubject) {
      return null;
    }
    return {
      sourceAttemptId: current.sourceAttemptId,
      outcome: current.verifiedOutcome,
      recordedAt: current.verificationRecordedAt,
      lineage: "POLICY_V2" as const,
    };
  }))).filter((outcome) => outcome !== null);
  const canonicalAttemptIds = new Set(canonicalOutcomes.map((outcome) => outcome.sourceAttemptId));
  const legacyAttempts = boundedAttempts.filter((attempt) =>
    !attempt.verificationSubject && !canonicalAttemptIds.has(String(attempt._id))
  );
  const receiptIds = [...new Set(legacyAttempts
    .map((attempt) => attempt.factoryContinuation?.verificationReceiptId)
    .filter((id): id is Id<"verificationReceipts"> => Boolean(id)))];
  const legacyReceipts = (await Promise.all(receiptIds.map((id) => ctx.db.get(id))))
    .filter((receipt): receipt is Doc<"verificationReceipts"> => Boolean(receipt));
  const legacyOutcomes = legacyReceipts.flatMap((receipt): RoutingVerifiedOutcome[] => {
    const sourceAttemptId = String(receipt.sourceAttemptId ?? receipt.workflowRunId);
    const sourceAttempt = attemptById.get(sourceAttemptId);
    if (!sourceAttempt
      || sourceAttempt.verificationSubject
      || String(receipt.workOrderId) !== String(sourceAttempt.workOrderId)
      || (receipt.projectId && String(receipt.projectId) !== String(projectId))
      || receipt.invalidatedAt
      || (receipt.validUntil && receipt.validUntil <= cutoffAt)
      || receipt.independenceValid !== true) {
      return [];
    }
    const outcome = receipt.status === "PASSED" && receipt.verdict === "VERIFIED"
      ? "SUCCESS" as const
      : receipt.status === "FAILED" && (receipt.verdict === "NOT_VERIFIED" || receipt.verdict === "BLOCKED")
        ? "FAILURE" as const
        : undefined;
    return outcome ? [{ sourceAttemptId, outcome, recordedAt: receipt.recordedAt, lineage: "LEGACY" }] : [];
  });
  return {
    windowStartedAt,
    cutoffAt,
    attempts: boundedAttempts,
    traces,
    gates,
    verifiedOutcomes: [...canonicalOutcomes, ...legacyOutcomes],
  };
}

export function aggregateExecutionRoutingEvidence(
  versionId: Id<"factoryDefinitionVersions">,
  repositoryId: Id<"workspaceRepositories">,
  bundle: Awaited<ReturnType<typeof loadExecutionRoutingEvidenceBundle>>,
): ExecutionEvidence {
  const attempts = bundle.attempts.filter((attempt) =>
    attempt.factoryDefinitionVersionId === versionId && attempt.repositoryId === repositoryId
  );
  const attemptIds = new Set(attempts.map((attempt) => String(attempt._id)));
  const verifiedOutcomes = bundle.verifiedOutcomes.filter((outcome) => attemptIds.has(outcome.sourceAttemptId));
  const passedReceiptAttemptIds = new Set(verifiedOutcomes
    .filter((outcome) => outcome.outcome === "SUCCESS")
    .map((outcome) => outcome.sourceAttemptId));
  const verifiedAttemptIds = new Set(verifiedOutcomes.map((outcome) => outcome.sourceAttemptId));
  const verifiedAttempts = attempts.filter((attempt) => verifiedAttemptIds.has(String(attempt._id)));
  const successfulVerifiedAttempts = attempts.filter((attempt) => passedReceiptAttemptIds.has(String(attempt._id)));
  const firstPassSuccesses = successfulVerifiedAttempts.filter((attempt) =>
    !(attempt.metadata as { retryOfWorkflowRunId?: unknown } | undefined)?.retryOfWorkflowRunId
    && attempt.steps.every((step) => step.retryCount === 0)
  ).length;
  const terminalAttempts = attempts.filter((attempt) => ["COMPLETED", "FAILED", "CANCELED"].includes(attempt.status));
  const retryFreeAttempts = terminalAttempts.filter((attempt) =>
    !(attempt.metadata as { retryOfWorkflowRunId?: unknown } | undefined)?.retryOfWorkflowRunId
    && attempt.steps.every((step) => step.retryCount === 0)
  ).length;
  const verificationLatency = successfulVerifiedAttempts.flatMap((attempt) => {
    const outcome = verifiedOutcomes.find((item) =>
      item.sourceAttemptId === String(attempt._id) && item.outcome === "SUCCESS"
    );
    return outcome ? [Math.max(0, outcome.recordedAt - attempt.startedAt)] : [];
  });
  const attemptTraces = bundle.traces.filter((trace) => trace.workflowRunId && attemptIds.has(String(trace.workflowRunId)));
  const tracesByAttempt = new Map<string, typeof attemptTraces>();
  for (const trace of attemptTraces) {
    const key = String(trace.workflowRunId);
    tracesByAttempt.set(key, [...(tracesByAttempt.get(key) ?? []), trace]);
  }
  const contextObserved = [...tracesByAttempt.entries()];
  const contextMisses = contextObserved.filter(([, values]) => values.some((trace) =>
    [...(trace.tags ?? []), trace.error?.code ?? "", trace.error?.message ?? ""]
      .some((value) => /context|token limit|prompt too long/i.test(value))
  )).length;
  const latestGateByAttempt = new Map<string, (typeof bundle.gates)[number]>();
  for (const gate of bundle.gates) {
    const id = gate.sourceAttemptId ?? gate.workflowRunId;
    if (id && attemptIds.has(String(id)) && !latestGateByAttempt.has(String(id))) {
      latestGateByAttempt.set(String(id), gate);
    }
  }
  const passingGates = [...latestGateByAttempt.values()].filter((gate) => gate.state === "ELIGIBLE").length;
  const successfulTerminalAttempts = terminalAttempts.filter((attempt) => attempt.status === "COMPLETED").length;
  const modelCosts = attemptTraces.map((trace) => finiteNonNegative(trace.estimatedCostUsd)).filter((value): value is number => value !== undefined);
  const computeCosts = attempts
    .map((attempt) => finiteNonNegative((attempt.metadata as { computeCostUsd?: unknown } | undefined)?.computeCostUsd))
    .filter((value): value is number => value !== undefined);
  const totalCosts = attempts.map((attempt) => finiteNonNegative(attempt.spentUsd)).filter((value): value is number => value !== undefined);
  const totalCostPerVerifiedSuccessUsd = totalCosts.length === attempts.length
    && successfulVerifiedAttempts.length > 0
    ? totalCosts.reduce((sum, value) => sum + value, 0) / successfulVerifiedAttempts.length
    : undefined;

  return {
    windowStartedAt: bundle.windowStartedAt,
    cutoffAt: bundle.cutoffAt,
    attemptCount: attempts.length,
    verifiedAttemptCount: verifiedAttempts.length,
    repositoryAttemptCount: attempts.length,
    verifiedSuccessRate: rate(passedReceiptAttemptIds.size, verifiedAttempts.length),
    firstPassSuccessRate: rate(firstPassSuccesses, verifiedAttempts.length),
    retryAvoidanceRate: rate(retryFreeAttempts, terminalAttempts.length),
    timeToVerifiedCandidateMs: verificationLatency.length
      ? verificationLatency.reduce((sum, value) => sum + value, 0) / verificationLatency.length
      : undefined,
    modelCostUsd: modelCosts.length ? modelCosts.reduce((sum, value) => sum + value, 0) : undefined,
    computeCostUsd: computeCosts.length === attempts.length && attempts.length
      ? computeCosts.reduce((sum, value) => sum + value, 0)
      : undefined,
    totalCostUsd: totalCosts.length === attempts.length && attempts.length
      ? totalCosts.reduce((sum, value) => sum + value, 0)
      : undefined,
    totalCostPerVerifiedSuccessUsd,
    contextMissAvoidanceRate: rate(contextObserved.length - contextMisses, contextObserved.length),
    qualityGateAvoidanceRate: rate(passingGates, latestGateByAttempt.size),
    cancellationFailureAvoidanceRate: rate(successfulTerminalAttempts, terminalAttempts.length),
  };
}

function workerReasonPriority(reason: string) {
  const priorities: Record<string, number> = {
    "worker-heartbeat-stale": 0,
    "worker-repository-access-missing": 1,
    "worker-factory-version-mismatch": 2,
    "worker-harness-manifest-mismatch": 3,
    "worker-harness-model-unsupported": 4,
    "worker-harness-capability-missing": 5,
    "worker-backend-unsupported": 6,
  };
  return priorities[reason] ?? 100;
}

export async function buildExecutionRoutingPreview(
  ctx: RoutingCtx,
  input: {
    workOrder: Doc<"workOrders">;
    workflow: Doc<"workflows">;
    fallbackFactoryDefinitionVersionId?: Id<"factoryDefinitionVersions">;
    cutoffAt?: number;
  },
) {
  const { workOrder, workflow } = input;
  if (!workOrder.projectId || !workOrder.repositoryId) return null;
  const cutoffAt = input.cutoffAt ?? Date.now();
  const [definitions, activePolicy, flagRows, bindings, catalog, activeRuns] = await Promise.all([
    ctx.db.query("factoryDefinitions")
      .withIndex("by_repository", (query) => query.eq("repositoryId", workOrder.repositoryId!))
      .collect(),
    ctx.db.query("modelRoutingPolicies")
      .withIndex("by_project_status", (query) => query.eq("projectId", workOrder.projectId!).eq("status", "ACTIVE"))
      .order("desc")
      .first(),
    ctx.db.query("featureFlags").collect(),
    ctx.db.query("workspaceHostBindings")
      .withIndex("by_project", (query) => query.eq("projectId", workOrder.projectId!))
      .collect(),
    loadModelCatalogForProject(ctx, workOrder.projectId),
    ctx.db.query("workflowRuns")
      .withIndex("by_status", (query) => query.eq("status", "RUNNING"))
      .collect(),
  ]);
  const config = activePolicy?.executionRouting ?? DEFAULT_EXECUTION_ROUTING_POLICY;
  const guardedAutoEnabled = resolveFlag(
    flagRows as FlagRow[],
    "execution-routing.guarded-auto",
    workOrder.projectId,
  ).enabled;
  const evidenceBundle = await loadExecutionRoutingEvidenceBundle(
    ctx,
    workOrder.projectId,
    cutoffAt,
    config.evidenceWindowDays,
  );
  const versions = (await Promise.all(definitions
    .filter((definition) => definition.activeVersionId)
    .slice(0, MAX_CANDIDATES)
    .map((definition) => ctx.db.get(definition.activeVersionId!))))
    .filter((version): version is Doc<"factoryDefinitionVersions"> => Boolean(version));

  const candidates: ExecutionRoutingCandidate[] = [];
  for (const version of versions) {
    const definition = definitions.find((item) => item._id === version.factoryDefinitionId) ?? null;
    const [assessments, agentVersions, sandboxProfile] = await Promise.all([
      ctx.db.query("factoryReadinessAssessments")
        .withIndex("by_version", (query) => query.eq("factoryDefinitionVersionId", version._id))
        .collect(),
      Promise.all((version.agentBindings ?? []).map((binding) => ctx.db.get(binding.agentVersionId))),
      version.sandboxProfileId ? ctx.db.get(version.sandboxProfileId) : null,
    ]);
    const assessment = assessments.sort((left, right) => right.assessedAt - left.assessedAt)[0];
    let frozenHarness: ReturnType<typeof resolveFrozenHarnessBinding> | null = null;
    try {
      frozenHarness = resolveFrozenHarnessBinding(version);
    } catch {
      // Invalid frozen manifests remain visible as ineligible candidates.
    }
    const primaryAgent = primaryAgentVersion(workflow, version, agentVersions);
    const primaryModel = primaryAgent?.genome.modelConfig;
    const catalogModel = version.modelCatalogId
      ? catalog.find((model) => model._id === version.modelCatalogId)
      : undefined;
    const backend = version.executionBackend ?? "persistent-worker";
    const requiredSandboxCapabilities = backend === "remote-sandbox"
      ? ["git-worktree", "workspace-write", "remote-sandbox", "sandbox-provider:exe-dev"]
      : ["git-worktree", "workspace-write"];
    const workerResults = frozenHarness ? bindings.map((binding) => factoryWorkerEligibility({
      worker: {
        workerId: binding.hostId,
        status: binding.status,
        dirty: binding.dirty,
        capacity: binding.capacity,
        workerRuntime: binding.workerRuntime ? {
          ...binding.workerRuntime,
          repositoryAccess: binding.workerRuntime.repositoryAccess.map((item) => ({
            ...item,
            repositoryId: String(item.repositoryId),
          })),
          factoryVersionBindings: binding.workerRuntime.factoryVersionBindings?.map((item) => ({
            ...item,
            factoryDefinitionVersionId: String(item.factoryDefinitionVersionId),
            repositoryId: String(item.repositoryId),
          })),
        } : undefined,
      },
      requirements: {
        repositoryId: String(workOrder.repositoryId),
        executor: {
          adapter: frozenHarness.adapter,
          version: frozenHarness.version,
          capabilityManifestSha256: frozenHarness.capabilityManifestSha256,
          effectiveConfigSha256: frozenHarness.effectiveConfigSha256,
        },
        provider: primaryModel?.provider ?? null,
        model: primaryModel?.modelId ?? null,
        harnessCapabilities: factoryHarnessCapabilityRequirements("WORKSPACE_WRITE"),
        isolation: "WORKSPACE_WRITE",
        sandboxCapabilities: requiredSandboxCapabilities,
        executionBackend: backend,
        factoryDefinitionVersionId: String(version._id),
        factoryConfigurationDigest: version.configurationDigest,
        modelRouteDigest: version.modelRouteDigest,
        sandboxProfileDigest: version.sandboxProfileDigest,
      },
      activeWorkerLeaseCount: countActiveFactoryWorkerLeases({
        runs: activeRuns,
        workerId: binding.hostId,
        now: cutoffAt,
      }),
      now: cutoffAt,
    })) : [];
    const workerEligible = workerResults.some((result) => result.eligible);
    const workerReason = workerResults
      .filter((result): result is Extract<(typeof workerResults)[number], { eligible: false }> => !result.eligible)
      .map((result) => result.reason)
      .sort((left, right) => workerReasonPriority(left) - workerReasonPriority(right))[0];
    const manifest = frozenHarness?.capabilityManifest;
    const matchingWorkers = bindings.filter((binding) => binding.workerRuntime?.supportedExecutors.some((executor) =>
      executor.adapter === version.executor.adapter && executor.version === version.executor.version
    ));
    const repositoryAccess = matchingWorkers.some((binding) => binding.workerRuntime?.repositoryAccess.some((item) =>
      item.repositoryId === workOrder.repositoryId && item.access === "READ_WRITE"
    ));
    const sandboxReady = backend !== "remote-sandbox" || Boolean(
      sandboxProfile
      && sandboxProfile.projectId === version.projectId
      && sandboxProfile.status === "ACTIVE"
      && sandboxProfile.profileDigest === version.sandboxProfileDigest
      && sandboxProfile.readinessState !== "BLOCKED"
      && sandboxProfile.readinessExpiresAt > cutoffAt
      && sandboxProfile.egressEnforcementProven
      && sandboxProfileProductionEligible(sandboxProfile)
    );
    const modelApproved = Boolean(
      primaryAgent?.status === "APPROVED"
      && catalogModel
      && catalogModel.routeDigest === version.modelRouteDigest
      && modelRouteProductionEligible(catalogModel)
      && !catalogModel.deprecated
      && (
        !(workOrder.riskLevel === "HIGH" || workOrder.riskLevel === "CRITICAL")
        || catalogModel.riskApproved
      )
    );
    const estimatedCost = catalogModel?.estimatedCostPerRunUsd;
    const contextWindow = catalogModel?.contextWindow
      ?? manifest?.models.supported.find((model) =>
        model.provider === primaryModel?.provider
        && (model.modelId === primaryModel?.modelId || model.modelId === "*")
      )?.contextWindowTokens
      ?? undefined;
    candidates.push({
      tuple: {
        tupleKey: tupleKey(version),
        factoryDefinitionId: String(version.factoryDefinitionId),
        factoryDefinitionVersionId: String(version._id),
        factoryVersion: version.version,
        factoryConfigurationDigest: version.configurationDigest,
        harness: {
          adapter: version.executor.adapter,
          version: version.executor.version,
          capabilityManifestDigest: frozenHarness?.capabilityManifestSha256 ?? "unknown",
          maturity: manifest?.admission.maturity ?? "EXPERIMENTAL",
        },
        model: {
          provider: primaryModel?.provider ?? "unknown",
          modelId: primaryModel?.modelId ?? "unknown",
          contextWindow: contextWindow ?? undefined,
          estimatedCostPerRunUsd: estimatedCost,
        },
        backend,
        riskBoundary: version.riskBoundary,
        budget: version.budget,
      },
      eligibility: {
        factoryActive: definition?.status === "ACTIVE",
        factoryVersionActive: definition?.activeVersionId === version._id,
        readiness: !assessment ? "MISSING" : assessment.status,
        readinessCurrent: Boolean(assessment && assessment.expiresAt > cutoffAt),
        readinessDigestMatches: assessment?.configurationDigest === version.configurationDigest,
        workflowMatches: version.workflowId === workflow._id,
        repositoryMatches: version.repositoryId === workOrder.repositoryId,
        repositoryAccess,
        workerEligible,
        workerReason,
        harnessCapabilitiesSatisfied: Boolean(
          manifest && harnessCapabilityRequirementsSatisfied(
            manifest,
            factoryHarnessCapabilityRequirements("WORKSPACE_WRITE"),
          )
        ),
        harnessModelSupported: Boolean(manifest && harnessSupportsModel(
          manifest,
          primaryModel?.provider,
          primaryModel?.modelId,
        )),
        backendSupported: Boolean(manifest?.admission.executionBackends.includes(backend)),
        isolationSupported: Boolean(manifest?.sandbox.isolationModes.includes("WORKSPACE_WRITE")),
        networkPolicySatisfied: backend === "remote-sandbox"
          ? sandboxReady
          : Boolean(manifest && manifest.network.runtimeEgressControl !== "UNSUPPORTED"),
        credentialPolicySatisfied: backend === "remote-sandbox"
          ? sandboxProfile?.inferenceCredentialMode === "ATTEMPT_SCOPED_OPENROUTER"
          : Boolean(
              manifest?.credentials.classes.length
              && manifest.credentials.redaction !== "UNSUPPORTED"
              && manifest.credentials.passedToToolProcesses === false
            ),
        modelApproved,
        modelAvailable: Boolean(catalogModel && ["HEALTHY", "DEGRADED"].includes(catalogModel.availability)),
        productionCertified: assessment?.status === "PASS"
          && manifest?.admission.maturity === "PRODUCTION"
          && modelRouteProductionEligible(catalogModel),
      },
      evidence: aggregateExecutionRoutingEvidence(version._id, workOrder.repositoryId, evidenceBundle),
    });
  }

  const pin = workOrder.executionRoutingPin;
  const requestedMode: ExecutionRoutingMode = pin ? "PINNED" : (config.mode ?? "ADVISORY");
  const maximumEstimatedCostUsd = Math.min(
    finiteNonNegative((workOrder.metadata as { modelBudgetRemainingUsd?: unknown } | undefined)?.modelBudgetRemainingUsd) ?? Number.POSITIVE_INFINITY,
    activePolicy?.budgetLimitUsd ?? Number.POSITIVE_INFINITY,
  );
  const policy: ExecutionRoutingPolicy = {
    mode: requestedMode,
    policyVersion: activePolicy?.version ?? 0,
    guardedAutoPromoted: Boolean(config.guardedAutoPromotedAt),
    guardedAutoEnabled,
    minimumVerifiedAttempts: config.minimumVerifiedAttempts,
    minimumEvidenceCoverage: config.minimumEvidenceCoverage,
    minimumScoreMargin: config.minimumScoreMargin,
    evidenceWindowDays: config.evidenceWindowDays,
    maximumEstimatedCostUsd: Number.isFinite(maximumEstimatedCostUsd) ? maximumEstimatedCostUsd : undefined,
    minimumContextWindow: config.minimumContextWindow
      ?? finiteNonNegative((workOrder.metadata as { requiredContextTokens?: unknown } | undefined)?.requiredContextTokens),
  };
  const fallbackVersionId = input.fallbackFactoryDefinitionVersionId ?? pin?.factoryDefinitionVersionId;
  const fallbackTupleKey = fallbackVersionId
    ? candidates.find((candidate) => candidate.tuple.factoryDefinitionVersionId === String(fallbackVersionId))?.tuple.tupleKey
    : candidates.find((candidate) => candidate.eligibility.productionCertified)?.tuple.tupleKey;
  const pinnedTupleKey = pin
    ? candidates.find((candidate) =>
        candidate.tuple.factoryDefinitionVersionId === String(pin.factoryDefinitionVersionId)
        && candidate.tuple.factoryConfigurationDigest === pin.factoryConfigurationDigest
      )?.tuple.tupleKey ?? `${String(pin.factoryDefinitionVersionId)}:${pin.factoryConfigurationDigest}`
    : undefined;
  const result = resolveExecutionRoute({
    riskTier: workOrderRiskToExecutionTier(workOrder.riskLevel),
    candidates,
    policy,
    fallbackTupleKey,
    pinnedTupleKey,
  });
  const selectedCandidate = result.appliedTupleKey
    ? result.candidates.find((candidate) => candidate.tuple.tupleKey === result.appliedTupleKey)
    : undefined;
  return {
    result,
    activePolicy,
    policy,
    cutoffAt,
    selectedFactoryDefinitionVersionId: selectedCandidate?.tuple.factoryDefinitionVersionId as Id<"factoryDefinitionVersions"> | undefined,
    selectedModel: selectedCandidate?.tuple.model,
  };
}

/**
 * Admit only two distinct, current, production-qualified exact tuples into a
 * routing experiment. Experimental Attempts still pass normal dispatch and
 * verification; this function grants no execution or acceptance authority.
 */
export async function validateExecutionRoutingExperimentVariants(
  ctx: RoutingCtx,
  input: {
    projectId: Id<"projects">;
    factoryDefinitionVersionIds: Id<"factoryDefinitionVersions">[];
    now?: number;
  },
) {
  if (input.factoryDefinitionVersionIds.length !== 2
    || new Set(input.factoryDefinitionVersionIds.map(String)).size !== 2) {
    throw new Error("Execution routing experiments require two distinct exact Factory Versions.");
  }
  const now = input.now ?? Date.now();
  const versions = await Promise.all(input.factoryDefinitionVersionIds.map((id) => ctx.db.get(id)));
  const snapshots = [];
  for (const version of versions) {
    if (!version || version.projectId !== input.projectId) {
      throw new Error("Experiment Factory tuple is unavailable or outside the workspace.");
    }
    const [definition, assessments, agentVersions] = await Promise.all([
      ctx.db.get(version.factoryDefinitionId),
      ctx.db.query("factoryReadinessAssessments")
        .withIndex("by_version", (query) => query.eq("factoryDefinitionVersionId", version._id))
        .collect(),
      Promise.all((version.agentBindings ?? []).map((binding) => ctx.db.get(binding.agentVersionId))),
    ]);
    const assessment = assessments.sort((left, right) => right.assessedAt - left.assessedAt)[0];
    let harness: ReturnType<typeof resolveFrozenHarnessBinding>;
    try {
      harness = resolveFrozenHarnessBinding(version);
    } catch {
      throw new Error("Experiment Factory tuple has an invalid frozen harness identity.");
    }
    if (
      definition?.status !== "ACTIVE"
      || definition.activeVersionId !== version._id
      || assessment?.status !== "PASS"
      || assessment.expiresAt <= now
      || assessment.configurationDigest !== version.configurationDigest
      || harness.capabilityManifest.admission.maturity !== "PRODUCTION"
      || !agentVersions.length
      || agentVersions.some((agentVersion) => !agentVersion || agentVersion.status !== "APPROVED")
    ) {
      throw new Error("Experiment Factory tuple is not current and production-qualified.");
    }
    snapshots.push({
      tupleKey: tupleKey(version),
      factoryDefinitionId: version.factoryDefinitionId,
      factoryDefinitionVersionId: version._id,
      factoryConfigurationDigest: version.configurationDigest,
      harness: {
        adapter: harness.adapter,
        version: harness.version,
        capabilityManifestDigest: harness.capabilityManifestSha256,
      },
      backend: version.executionBackend ?? "persistent-worker",
      agentVersionIds: agentVersions.map((agentVersion) => agentVersion!._id),
      admittedAt: now,
    });
  }
  return snapshots;
}
