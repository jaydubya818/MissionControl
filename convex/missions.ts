import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  canTransitionMission,
  evaluateMissionAcceptance,
  validateMissionHandoff,
} from "./lib/missionGovernance";
import {
  assertMissionDraftWorkspace,
  changedMissionDraftFields,
  missionScopeStatus,
  validateMissionDraftInput,
} from "./lib/missionDraft";
import {
  MISSION_PLAN_RELEASE_FLAG,
  missionBlueprintReleaseKey,
  missionPlanReleaseKey,
  validateMissionPlan,
  type MissionPlanInput,
} from "./lib/missionPlan";
import { resolveFlag, type FlagRow } from "./lib/flags";
import { createWorkOrderRecord } from "./lib/workOrderCreate";
import { compileMissionWorkOrderContract } from "./lib/missionWorkOrderContract";
import { compileApprovedPlanQualityContract } from "./lib/qualityContract";
import {
  loadMissionExecutionState,
  reconcileMissionAfterHandoff,
} from "./lib/missionExecution";
import { COMPANY_PERMISSIONS, requireWorkspaceAccess } from "./lib/companyAccess";
import { assertAuthorizedDeliveryRecord, canAccessDeliveryRecord, requireAuthorizedDeliveryScope } from "./lib/deliveryAuthorization";
import { evaluateAcceptance } from "./lib/workOrderGovernance";
import { loadFactoryAttemptReviewReadModel } from "./lib/factoryReviewReadModel";
import { getCurrentVerificationResult } from "./lib/currentVerification";
import { computeCanonicalHash } from "./lib/genomeHash";
import {
  MISSION_SPEC_INTAKE_FLAG,
  analyzeSpecPlanConsistency,
  missionSpecDigest,
  projectConstitutionDigest,
  type ChecklistClassification,
  type MissionSpecContent,
} from "./lib/missionSpec";
import { resolveMissionRepositoryBinding } from "./lib/workspaceRepositories";

const missionState = v.union(
  v.literal("DRAFT"), v.literal("PLANNING"), v.literal("AWAITING_PLAN_APPROVAL"),
  v.literal("READY"), v.literal("IN_PROGRESS"), v.literal("BLOCKED"),
  v.literal("AWAITING_VALIDATION"), v.literal("AWAITING_ACCEPTANCE"),
  v.literal("DONE"), v.literal("CANCELED"), v.literal("SUPERSEDED")
);

const sourceRef = v.object({
  kind: v.union(v.literal("REPO"), v.literal("DOC"), v.literal("PRD"), v.literal("ISSUE"), v.literal("URL")),
  label: v.string(),
  location: v.string(),
});

const assertionInput = v.object({
  assertionId: v.string(),
  title: v.string(),
  outcome: v.string(),
  verificationMethod: v.union(v.literal("COMMAND"), v.literal("TEST"), v.literal("BROWSER"), v.literal("MANUAL"), v.literal("CHECKLIST")),
  passCondition: v.string(),
  requiredEvidence: v.string(),
  requiresIndependentValidation: v.boolean(),
  waiverAllowed: v.boolean(),
  sourceRequirementIds: v.optional(v.array(v.string())),
  sourceAcceptanceExpectationIds: v.optional(v.array(v.string())),
  sourceVerificationExpectationIds: v.optional(v.array(v.string())),
});

const blueprintInput = v.object({
  id: v.string(),
  title: v.string(),
  desiredOutcome: v.string(),
  workflowId: v.optional(v.string()),
  workflowVersion: v.optional(v.number()),
  sequence: v.number(),
  role: v.union(v.literal("WORKER"), v.literal("VALIDATOR")),
  isMutating: v.boolean(),
  priority: v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4)),
  riskLevel: v.union(v.literal("LOW"), v.literal("MEDIUM"), v.literal("HIGH"), v.literal("CRITICAL")),
  modelComplexity: v.optional(v.union(v.literal("SMALL"), v.literal("STANDARD"), v.literal("LARGE"))),
  branchStrategy: v.optional(v.string()),
  constraints: v.array(v.string()),
  requiredApprovals: v.array(v.string()),
  estimatedCostUsd: v.optional(v.number()),
  implementationPolicy: v.optional(v.object({
    allowedCommands: v.array(v.string()),
    independentVerification: v.optional(v.object({
      executable: v.string(),
      args: v.array(v.string()),
      category: v.union(
        v.literal("BUILD"), v.literal("TYPECHECK"), v.literal("UNIT_TEST"),
        v.literal("INTEGRATION_TEST"), v.literal("CONTRACT_TEST"), v.literal("SECURITY"),
      ),
      commandClass: v.union(
        v.literal("BUILD"), v.literal("TYPECHECK"), v.literal("TEST"),
        v.literal("LINT"), v.literal("SECURITY_SCAN"), v.literal("DEPENDENCY_SCAN"),
      ),
      evidenceCategory: v.union(
        v.literal("TEST_RESULT"), v.literal("BUILD_RESULT"), v.literal("STATIC_ANALYSIS"),
        v.literal("SECURITY_SCAN"), v.literal("COMMAND_LOG"), v.literal("BROWSER_RESULT"),
      ),
      timeoutMs: v.number(),
    })),
    maxFilesChanged: v.optional(v.number()),
    maxLinesChanged: v.optional(v.number()),
    maxCostUsd: v.optional(v.number()),
    maxAttempts: v.number(),
    timeoutMinutes: v.number(),
    stopCondition: v.string(),
  })),
  dependsOnBlueprintIds: v.array(v.string()),
  assertionIds: v.array(v.string()),
});

async function assertPlanReleaseEnabled(ctx: any, projectId: any) {
  const rows = await ctx.db
    .query("featureFlags")
    .withIndex("by_key", (q: any) => q.eq("key", MISSION_PLAN_RELEASE_FLAG))
    .collect() as FlagRow[];
  if (!resolveFlag(rows, MISSION_PLAN_RELEASE_FLAG, projectId).enabled) {
    throw new Error(`Mission planning is disabled (${MISSION_PLAN_RELEASE_FLAG})`);
  }
}

async function isSpecIntakeEnabled(ctx: MutationCtx, projectId: Id<"projects">) {
  const rows = await ctx.db
    .query("featureFlags")
    .withIndex("by_key", (q) => q.eq("key", MISSION_SPEC_INTAKE_FLAG))
    .collect() as FlagRow[];
  return resolveFlag(rows, MISSION_SPEC_INTAKE_FLAG, projectId).enabled;
}

function hasAnyPlanSpecLineage(plan: Doc<"missionPlans">) {
  return Boolean(
    plan.missionSpecRevisionId
    || plan.missionSpecDigest
    || plan.missionSpecQualityEvaluationId
    || plan.projectConstitutionRevisionId
    || plan.projectConstitutionDigest
  );
}

async function loadFinalizedSpecBinding(
  ctx: MutationCtx,
  project: Doc<"projects">,
  mission: Doc<"missions">,
) {
  if (!mission.currentSpecRevisionId) throw new Error("Finalize a Mission Spec revision before creating a governed Plan");
  if (!project.currentConstitutionRevisionId) throw new Error("Activate a Project Constitution before creating a governed Plan");
  const [spec, constitution] = await Promise.all([
    ctx.db.get(mission.currentSpecRevisionId),
    ctx.db.get(project.currentConstitutionRevisionId),
  ]);
  if (!spec || spec.missionId !== mission._id || spec.projectId !== project._id) throw new Error("Current Mission Spec revision is unavailable");
  if (!constitution || constitution.projectId !== project._id) throw new Error("Current Project Constitution revision is unavailable");
  if (spec.projectConstitutionRevisionId !== constitution._id || spec.projectConstitutionDigest !== constitution.digest) {
    throw new Error("Current Mission Spec was created under another Constitution revision. Revise and finalize the Spec before planning.");
  }
  if (spec.digest !== missionSpecDigest(spec.content) || constitution.digest !== projectConstitutionDigest(constitution.content)) {
    throw new Error("Mission Spec or Constitution digest does not match immutable content");
  }
  const decision = await ctx.db.query("missionSpecDecisions").withIndex("by_spec", (q) => q.eq("missionSpecRevisionId", spec._id)).first();
  if (!decision || decision.decisionType !== "FINALIZED") throw new Error("Mission Spec revision is not FINALIZED for planning");
  const evaluation = await ctx.db.get(decision.missionSpecQualityEvaluationId);
  if (!evaluation || evaluation.missionSpecRevisionId !== spec._id || evaluation.result !== "PASS" || evaluation.findings.some((item) => item.blocking)) {
    throw new Error("Mission Spec revision does not have a passing exact deterministic evaluation");
  }
  if (evaluation.missionSpecDigest !== spec.digest || evaluation.projectConstitutionRevisionId !== constitution._id || evaluation.projectConstitutionDigest !== constitution.digest) {
    throw new Error("Mission Spec finalization lineage is invalid");
  }
  return {
    spec,
    constitution,
    evaluation,
    decision,
    fields: {
      missionSpecRevisionId: spec._id,
      missionSpecDigest: spec.digest,
      missionSpecQualityEvaluationId: evaluation._id,
      projectConstitutionRevisionId: constitution._id,
      projectConstitutionDigest: constitution.digest,
    },
  };
}

async function loadPlanSpecLineage(
  ctx: MutationCtx,
  mission: Doc<"missions">,
  plan: Doc<"missionPlans">,
) {
  if (!hasAnyPlanSpecLineage(plan)) return null;
  if (!plan.missionSpecRevisionId || !plan.missionSpecDigest || !plan.missionSpecQualityEvaluationId || !plan.projectConstitutionRevisionId || !plan.projectConstitutionDigest) {
    throw new Error("Mission Plan Spec lineage is incomplete. Create a new Plan revision.");
  }
  const [spec, evaluation, constitution] = await Promise.all([
    ctx.db.get(plan.missionSpecRevisionId),
    ctx.db.get(plan.missionSpecQualityEvaluationId),
    ctx.db.get(plan.projectConstitutionRevisionId),
  ]);
  if (!spec || spec.missionId !== mission._id || spec.projectId !== mission.projectId) throw new Error("Mission Plan references an unavailable Spec revision");
  if (!constitution || constitution.projectId !== mission.projectId) throw new Error("Mission Plan references an unavailable Constitution revision");
  const [governancePolicy, policyEnvelope] = await Promise.all([
    constitution.governancePolicyId ? ctx.db.get(constitution.governancePolicyId) : null,
    constitution.policyEnvelopeId ? ctx.db.get(constitution.policyEnvelopeId) : null,
  ]);
  if (constitution.governancePolicyId && (!governancePolicy || !governancePolicy.active || (governancePolicy.scope === "PROJECT" && governancePolicy.projectId !== mission.projectId))) {
    throw new Error("Mission Plan Constitution governance policy is unavailable or inactive");
  }
  if (constitution.policyEnvelopeId && (!policyEnvelope || !policyEnvelope.active || (policyEnvelope.projectId && policyEnvelope.projectId !== mission.projectId))) {
    throw new Error("Mission Plan Constitution policy envelope is unavailable or inactive");
  }
  if (spec.digest !== plan.missionSpecDigest || spec.digest !== missionSpecDigest(spec.content)) throw new Error("Mission Plan Spec digest is stale or invalid");
  if (constitution.digest !== plan.projectConstitutionDigest || constitution.digest !== projectConstitutionDigest(constitution.content)) throw new Error("Mission Plan Constitution digest is stale or invalid");
  if (spec.projectConstitutionRevisionId !== constitution._id || spec.projectConstitutionDigest !== constitution.digest) throw new Error("Mission Plan Spec and Constitution lineage do not match");
  if (!evaluation || evaluation.missionSpecRevisionId !== spec._id || evaluation.missionSpecDigest !== spec.digest || evaluation.projectConstitutionRevisionId !== constitution._id || evaluation.projectConstitutionDigest !== constitution.digest || evaluation.result !== "PASS" || evaluation.findings.some((item) => item.blocking)) {
    throw new Error("Mission Plan references a non-passing or mismatched Spec Quality evaluation");
  }
  const decision = await ctx.db.query("missionSpecDecisions").withIndex("by_spec", (q) => q.eq("missionSpecRevisionId", spec._id)).first();
  if (!decision || decision.decisionType !== "FINALIZED" || decision.missionSpecQualityEvaluationId !== evaluation._id) throw new Error("Mission Plan references a Spec revision that is not FINALIZED for planning");
  return { spec, constitution, evaluation, decision };
}

function analyzeBoundPlan(
  mission: Doc<"missions">,
  plan: Doc<"missionPlans">,
  lineage: NonNullable<Awaited<ReturnType<typeof loadPlanSpecLineage>>>,
) {
  const analysis = analyzeSpecPlanConsistency({
    spec: lineage.spec.content,
    assertions: normalizedPlanAssertions(plan),
    workOrderBlueprints: plan.workOrderBlueprints,
    planSummary: plan.summary,
    repositoryId: mission.repositoryId ? String(mission.repositoryId) : undefined,
  });
  const blockingFindings = analysis.findings.filter((item) => item.blocking);
  if (blockingFindings.length > 0) {
    const error = new Error(`Mission Plan is inconsistent with its bound Spec: ${blockingFindings.map((item) => item.message).join(" ")}`) as Error & { data?: unknown };
    error.data = { code: "MISSION_SPEC_PLAN_INCONSISTENT", findings: analysis.findings, coverage: analysis.coverage };
    throw error;
  }
  return analysis;
}

function boundChecklistLineage(spec: MissionSpecContent) {
  const byClassification = (classification: ChecklistClassification) => spec.checklistDispositions
    .filter((item) => item.classification === classification)
    .map((item) => item.checklistItemId)
    .sort((left, right) => left.localeCompare(right));
  return {
    requirementsQualityItemIds: byClassification("REQUIREMENTS_QUALITY"),
    governanceConstraintItemIds: byClassification("GOVERNANCE_CONSTRAINT"),
    evidenceBearingVerificationItemIds: byClassification("EVIDENCE_BEARING_VERIFICATION"),
  };
}

function normalizedPlanAssertions(plan: any) {
  return plan.assertions ?? plan.metadata?.assertions ?? [];
}

function planInput(plan: any): MissionPlanInput {
  return {
    summary: plan.summary,
    rollbackApproach: plan.rollbackApproach ?? "",
    estimatedCostUsd: plan.estimatedCostUsd,
    repository: plan.repository,
    repositoryBranch: plan.repositoryBranch,
    workOrderBlueprints: plan.workOrderBlueprints.map((blueprint: any) => ({
      ...blueprint,
      priority: blueprint.priority ?? 3,
      riskLevel: blueprint.riskLevel ?? "MEDIUM",
      constraints: blueprint.constraints ?? [],
      requiredApprovals: blueprint.requiredApprovals ?? [],
    })),
    assertions: normalizedPlanAssertions(plan),
  };
}

function assertValidPlan(plan: any) {
  const errors = validateMissionPlan(planInput(plan));
  if (errors.length > 0) {
    const error = new Error(`Mission plan is invalid: ${errors.map((item) => item.message).join(" ")}`) as Error & { data?: any };
    error.data = { code: "MISSION_PLAN_INVALID", errors };
    throw error;
  }
}

async function assertMissionProject(ctx: any, missionId: any, projectId: any, deliveryAccess?: any) {
  const [mission, project] = await Promise.all([ctx.db.get(missionId), ctx.db.get(projectId)]);
  if (!mission) throw new Error("Mission not found");
  if (!project || mission.projectId !== projectId) throw new Error("Mission does not belong to the selected workspace");
  assertAuthorizedDeliveryRecord(deliveryAccess, mission);
  return { mission, project };
}

async function loadMissionRepositoryBinding(ctx: any, mission: Doc<"missions">, project: Doc<"projects">) {
  const missionRepository = mission.repositoryId ? await ctx.db.get(mission.repositoryId) : null;
  if (mission.repositoryId && !missionRepository) {
    throw new Error("Mission repository configuration is missing");
  }
  return resolveMissionRepositoryBinding({
    projectId: String(project._id),
    missionRepository: missionRepository ? {
      projectId: String(missionRepository.projectId),
      repository: missionRepository.repository,
      defaultBranch: missionRepository.defaultBranch,
    } : null,
    legacyRepository: project.githubRepo,
    legacyDefaultBranch: project.githubBranch,
  });
}

async function logMissionEvent(ctx: any, args: {
  mission: any;
  eventType: string;
  actorType: "HUMAN" | "AGENT" | "SYSTEM";
  actorId?: string;
  summary: string;
  idempotencyKey?: string;
  metadata?: any;
}) {
  if (args.idempotencyKey) {
    const existing = await ctx.db
      .query("missionEvents")
      .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    if (existing) return existing;
  }
  const id = await ctx.db.insert("missionEvents", {
    tenantId: args.mission.tenantId,
    projectId: args.mission.projectId,
    missionId: args.mission._id,
    eventType: args.eventType,
    actorType: args.actorType,
    actorId: args.actorId,
    summary: args.summary,
    idempotencyKey: args.idempotencyKey,
    timestamp: Date.now(),
    metadata: args.metadata,
  });
  return await ctx.db.get(id);
}

function assertTransition(mission: any, state: any) {
  if (!canTransitionMission(mission.state, state)) {
    throw new Error(`Mission cannot transition from ${mission.state} to ${state}`);
  }
}

async function resolveOperator(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity) {
    return { actorId: identity.subject, actorSource: "AUTHENTICATED" as const };
  }
  return {
    actorId: "development:local-operator",
    actorSource: "DEVELOPMENT_FALLBACK" as const,
  };
}

async function loadPlanningRunBinding(
  ctx: MutationCtx,
  mission: Doc<"missions">,
  planningRunId: Id<"missionPlanningRuns">,
) {
  const run = await ctx.db.get(planningRunId);
  if (!run || run.missionId !== mission._id || run.projectId !== mission.projectId) {
    throw new Error("Planning candidate is unavailable or outside this Mission");
  }
  if (run.status !== "SUCCEEDED"
    || !run.candidatePlan
    || !run.candidateDigest
    || !run.researchPacket
    || !run.researchPacketDigest
    || !run.provenance
    || !run.outputDigest) {
    throw new Error("Planning candidate is incomplete, failed, or has not passed validation");
  }
  if (!/^[a-f0-9]{40,64}$/i.test(run.planningRepositorySha)) {
    throw new Error("Planning candidate does not bind an immutable repository SHA");
  }
  return run;
}

function planningPlanFields(run: Doc<"missionPlanningRuns">) {
  return {
    planningRunId: run._id,
    planningRepositorySha: run.planningRepositorySha,
    planningResearchPacketDigest: run.researchPacketDigest,
    planningCandidateDigest: run.candidateDigest,
    planningProvenance: run.provenance,
  };
}

function planningCandidateEditedBeforeSave(
  run: Doc<"missionPlanningRuns">,
  planInput: MissionPlanInput,
) {
  if (run.adoptedPlanId) return false;
  const candidate = run.candidatePlan as MissionPlanInput | undefined;
  if (!candidate) return false;
  const comparable = (value: MissionPlanInput) => ({
    summary: value.summary,
    rollbackApproach: value.rollbackApproach,
    estimatedCostUsd: value.estimatedCostUsd,
    workOrderBlueprints: value.workOrderBlueprints,
    assertions: value.assertions,
  });
  return computeCanonicalHash(comparable(planInput)) !== computeCanonicalHash(comparable(candidate));
}

async function assertPlanningPlanBinding(
  ctx: MutationCtx,
  mission: Doc<"missions">,
  plan: Doc<"missionPlans">,
) {
  const planningFields = [
    plan.planningRunId,
    plan.planningRepositorySha,
    plan.planningResearchPacketDigest,
    plan.planningCandidateDigest,
    plan.planningProvenance,
  ];
  if (planningFields.every((field) => field === undefined)) return;
  if (!plan.planningRunId) throw new Error("Plan planning provenance is partial; create a new revision");
  const run = await loadPlanningRunBinding(ctx, mission, plan.planningRunId);
  if (plan.planningRepositorySha !== run.planningRepositorySha
    || plan.planningResearchPacketDigest !== run.researchPacketDigest
    || plan.planningCandidateDigest !== run.candidateDigest
    || plan.planningProvenance?.planningRunId !== String(run._id)
    || plan.planningProvenance?.planningRepositorySha !== run.planningRepositorySha
    || plan.planningProvenance?.researchPacketDigest !== run.researchPacketDigest
    || plan.planningProvenance?.candidateDigest !== run.candidateDigest) {
    throw new Error("Plan planning provenance changed after candidate validation; create a new revision");
  }
}

async function getMissionDetail(ctx: any, mission: any) {
  const [plans, assertions, handoffs, events, workOrders, project] = await Promise.all([
    ctx.db.query("missionPlans").withIndex("by_mission", (q: any) => q.eq("missionId", mission._id)).order("desc").collect(),
    ctx.db.query("validationAssertions").withIndex("by_mission", (q: any) => q.eq("missionId", mission._id)).collect(),
    ctx.db.query("missionHandoffs").withIndex("by_mission", (q: any) => q.eq("missionId", mission._id)).order("desc").collect(),
    ctx.db.query("missionEvents").withIndex("by_mission_timestamp", (q: any) => q.eq("missionId", mission._id)).order("desc").collect(),
    ctx.db.query("workOrders").withIndex("by_mission", (q: any) => q.eq("missionId", mission._id)).collect(),
    mission.projectId ? ctx.db.get(mission.projectId) : null,
  ]);
  const normalizedPlans = plans.map((plan: any) => ({
    ...plan,
    assertions: normalizedPlanAssertions(plan),
    legacyRelease: plan.status === "APPROVED" && !plan.releaseIdempotencyKey,
  }));
  const currentPlan = normalizedPlans.find((plan: any) => plan._id === mission.currentPlanId)
    ?? normalizedPlans.find((plan: any) => plan.status === "PROPOSED")
    ?? normalizedPlans[0];
  const blueprintById = new Map((currentPlan?.workOrderBlueprints ?? []).map((blueprint: any) => [blueprint.id, blueprint]));
  const workOrderByBlueprintId = new Map(workOrders.map((workOrder: any) => [workOrder.metadata?.missionBlueprintId, workOrder]));
  const handoffByWorkOrderId = new Map<string, any>();
  for (const handoff of handoffs) {
    const key = String(handoff.workOrderId);
    if (!handoffByWorkOrderId.has(key)) handoffByWorkOrderId.set(key, handoff);
  }
  const eligibleWorkOrders = workOrders
    .map((workOrder: any) => {
      const blueprint = blueprintById.get(workOrder.metadata?.missionBlueprintId) as any;
      const missingDependencies = (blueprint?.dependsOnBlueprintIds ?? []).filter((dependencyId: string) => {
        const dependencyWorkOrder = workOrderByBlueprintId.get(dependencyId) as any;
        if (!dependencyWorkOrder) return true;
        const handoff = handoffByWorkOrderId.get(String(dependencyWorkOrder._id)) as any;
        return !handoff || handoff.outcome !== "COMPLETE" || handoff.incompleteAssertionIds.length > 0 || handoff.unknownAssertionIds.length > 0;
      });
      return {
        ...workOrder,
        missionEligibility: missingDependencies.length === 0
          ? { eligible: true as const, reason: "All predecessor handoffs are complete." }
          : { eligible: false as const, reason: `Waiting for predecessor handoff: ${missingDependencies.join(", ")}`, missingBlueprintIds: missingDependencies },
      };
    })
    .sort((left: any, right: any) => (left.missionSequence ?? 0) - (right.missionSequence ?? 0));
  const executionWorkOrders = await Promise.all(eligibleWorkOrders.map(async (workOrder: any) => {
    const [
      childTasks,
      executionRuns,
      approvalDecisions,
      verificationReceipts,
      verificationRuns,
      evidenceEnvelopes,
      qualityGateDecisions,
    ] = await Promise.all([
      ctx.db.query("tasks").withIndex("by_work_order", (q: any) => q.eq("workOrderId", workOrder._id)).collect(),
      ctx.db.query("workflowRuns").withIndex("by_work_order", (q: any) => q.eq("workOrderId", workOrder._id)).order("desc").collect(),
      ctx.db.query("approvalDecisions").withIndex("by_work_order", (q: any) => q.eq("workOrderId", workOrder._id)).order("desc").collect(),
      ctx.db.query("verificationReceipts").withIndex("by_work_order", (q: any) => q.eq("workOrderId", workOrder._id)).order("desc").collect(),
      ctx.db.query("verificationRuns").withIndex("by_work_order", (q: any) => q.eq("workOrderId", workOrder._id)).order("desc").collect(),
      ctx.db.query("evidenceEnvelopes").withIndex("by_work_order", (q: any) => q.eq("workOrderId", workOrder._id)).order("desc").collect(),
      ctx.db.query("qualityGateDecisions").withIndex("by_work_order", (q: any) => q.eq("workOrderId", workOrder._id)).order("desc").collect(),
    ]);
    const governanceAcceptance = evaluateAcceptance({
      riskLevel: workOrder.riskLevel,
      requiredApprovals: workOrder.requiredApprovals,
      isMutating: workOrder.isMutating,
      approvalDecisions,
      acceptanceCriteria: workOrder.acceptanceCriteria,
      verificationReceipts,
      now: Date.now(),
    });
    const latestRun = executionRuns[0] ?? null;
    const reviewReadModel = latestRun
      ? await loadFactoryAttemptReviewReadModel(ctx, { run: latestRun, workOrder })
      : null;
    return {
      ...workOrder,
      childTasks,
      executionRuns,
      approvalDecisions,
      verificationReceipts,
      verificationRuns,
      evidenceEnvelopes,
      qualityGateDecisions,
      acceptanceSummary: governanceAcceptance,
      currentVerification: workOrder.verificationContract?.schemaVersion === 2
        && workOrder.verificationContract.enforcementMode === "ENFORCED"
        ? await getCurrentVerificationResult(ctx, workOrder)
        : null,
      reviewPackage: reviewReadModel?.reviewPackage ?? null,
      latestHandoff: handoffByWorkOrderId.get(String(workOrder._id)) ?? null,
    };
  }));
  const acceptance = evaluateMissionAcceptance({
    assertions: assertions.map((assertion: any) => ({
      id: assertion.assertionId,
      status: assertion.status,
      requiresIndependentValidation: assertion.requiresIndependentValidation,
      validatorRunId: assertion.validatorWorkflowRunId,
      verificationReceiptId: assertion.verificationReceiptId,
      waiverApprovalId: assertion.waiverApprovalDecisionId,
    })),
    workOrders: workOrders.map((workOrder: any) => ({ id: String(workOrder._id), state: workOrder.state })),
    handoffs: [...handoffByWorkOrderId.values()].map((handoff: any) => ({
      workOrderId: String(handoff.workOrderId),
      outcome: handoff.outcome,
      incompleteAssertionIds: handoff.incompleteAssertionIds,
      unknownAssertionIds: handoff.unknownAssertionIds,
    })),
  });
  return {
    mission,
    project,
    plans: normalizedPlans,
    assertions,
    handoffs,
    events,
    workOrders: executionWorkOrders,
    acceptance,
  };
}

export const list = query({
  args: { projectId: v.optional(v.id("projects")), state: v.optional(missionState), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const deliveryAccess = await requireAuthorizedDeliveryScope(ctx, args.projectId);
    let missions = args.projectId
      ? await ctx.db.query("missions").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).order("desc").take(args.limit ?? 100)
      : await ctx.db.query("missions").order("desc").take(args.limit ?? 100);
    if (args.state) missions = missions.filter((mission) => mission.state === args.state);
    if (deliveryAccess) missions = missions.filter((mission) => canAccessDeliveryRecord(deliveryAccess, mission));
    return Promise.all(missions.map(async (mission) => {
      const [workOrders, assertions] = await Promise.all([
        ctx.db.query("workOrders").withIndex("by_mission", (q) => q.eq("missionId", mission._id)).collect(),
        ctx.db.query("validationAssertions").withIndex("by_mission", (q) => q.eq("missionId", mission._id)).collect(),
      ]);
      return { ...mission, workOrderCount: workOrders.length, assertionCount: assertions.length };
    }));
  },
});

export const get = query({
  args: { missionId: v.id("missions") },
  handler: async (ctx, args) => {
    const mission = await ctx.db.get(args.missionId);
    if (!mission) return null;
    const deliveryAccess = await requireAuthorizedDeliveryScope(ctx, mission.projectId);
    assertAuthorizedDeliveryRecord(deliveryAccess, mission);
    return await getMissionDetail(ctx, mission);
  },
});

export const getScoped = query({
  args: { missionId: v.id("missions"), projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const deliveryAccess = await requireAuthorizedDeliveryScope(ctx, args.projectId);
    const mission = await ctx.db.get(args.missionId);
    if (!mission) return { status: "NOT_FOUND" as const };
    const scope = missionScopeStatus(mission, args.projectId);
    if (scope === "SCOPE_MISMATCH") return { status: "SCOPE_MISMATCH" as const };
    assertAuthorizedDeliveryRecord(deliveryAccess, mission);
    return { status: "FOUND" as const, detail: await getMissionDetail(ctx, mission) };
  },
});

export const createDraft = mutation({
  args: {
    projectId: v.optional(v.id("projects")), idempotencyKey: v.optional(v.string()), title: v.string(), objective: v.string(),
    context: v.optional(v.string()), constraints: v.optional(v.array(v.string())), sourceOfTruthRefs: v.optional(v.array(sourceRef)),
    owner: v.optional(v.string()), budgetUsd: v.optional(v.number()), stopCondition: v.string(),
    ownerMemberId: v.optional(v.id("orgMembers")), owningTeamId: v.optional(v.id("scrumTeams")),
    repositoryId: v.optional(v.id("workspaceRepositories")), codeScopeIds: v.optional(v.array(v.id("repositoryCodeScopes"))),
    executionEnvironment: v.optional(v.union(v.literal("LOCAL"), v.literal("CLOUD"), v.literal("REMOTE"), v.literal("POLICY_SELECTED"))),
    maxReadOnlyConcurrency: v.optional(v.number()), maxCorrectiveIterations: v.optional(v.number()), metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const deliveryAccess = await requireAuthorizedDeliveryScope(ctx, args.projectId, COMPANY_PERMISSIONS.UPDATE_DELIVERY);
    assertAuthorizedDeliveryRecord(deliveryAccess, {
      ownerMemberId: args.ownerMemberId,
      owningTeamId: args.owningTeamId,
    });
    validateMissionDraftInput(args);
    if (args.idempotencyKey) {
      const existing = await ctx.db.query("missions").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).first();
      if (existing) {
        if (existing.projectId !== args.projectId) throw new Error("Idempotency key is already bound to another workspace");
        assertAuthorizedDeliveryRecord(deliveryAccess, existing);
        return { mission: existing, created: false };
      }
    }
    const project = args.projectId ? await ctx.db.get(args.projectId) : null;
    if (args.projectId && !project) throw new Error("Workspace not found");
    let requestingOperatorId;
    let ownerMember: any = null;
    let owningTeam: any = null;
    if (args.projectId && project?.tenantId && (args.ownerMemberId || args.owningTeamId || args.repositoryId || args.codeScopeIds?.length)) {
      const access = await requireWorkspaceAccess(ctx, project.tenantId, args.projectId, { permission: COMPANY_PERMISSIONS.ASSIGN_DELIVERY });
      assertAuthorizedDeliveryRecord(access, {
        ownerMemberId: args.ownerMemberId,
        owningTeamId: args.owningTeamId,
      });
      requestingOperatorId = access.membership.operatorId;
      [ownerMember, owningTeam] = await Promise.all([
        args.ownerMemberId ? ctx.db.get(args.ownerMemberId) : null,
        args.owningTeamId ? ctx.db.get(args.owningTeamId) : null,
      ]);
      const repository = args.repositoryId ? await ctx.db.get(args.repositoryId) : null;
      const scopes = await Promise.all((args.codeScopeIds ?? []).map((scopeId) => ctx.db.get(scopeId)));
      if (ownerMember && ownerMember.projectId !== args.projectId) throw new Error("Mission owner must belong to the active workspace.");
      if (owningTeam && owningTeam.projectId !== args.projectId) throw new Error("Mission team must belong to the active workspace.");
      if (repository && repository.projectId !== args.projectId) throw new Error("Mission repository must belong to the active workspace.");
      if (scopes.some((scope) => !scope || scope.projectId !== args.projectId || (repository && scope.repositoryId !== repository._id))) throw new Error("Mission code scopes must belong to the active workspace and repository.");
      if (args.ownerMemberId && args.owningTeamId) {
        const teamMembership = await ctx.db.query("teamMemberships").withIndex("by_team_member", (q) => q.eq("teamId", args.owningTeamId!).eq("memberId", args.ownerMemberId!)).first();
        if (!teamMembership?.active) throw new Error("Mission owner must be active in the owning team.");
      }
    }
    const operator = await resolveOperator(ctx);
    const now = Date.now();
    const missionId = await ctx.db.insert("missions", {
      tenantId: project?.tenantId, projectId: args.projectId, idempotencyKey: args.idempotencyKey,
      title: args.title, objective: args.objective, context: args.context, constraints: args.constraints,
      sourceOfTruthRefs: args.sourceOfTruthRefs, owner: ownerMember?.name ?? args.owner,
      ownerMemberId: args.ownerMemberId, owningTeamId: args.owningTeamId, repositoryId: args.repositoryId,
      codeScopeIds: args.codeScopeIds ?? [], requestedByOperatorId: requestingOperatorId,
      executionEnvironment: args.executionEnvironment,
      state: "DRAFT", executionPolicy: "SERIAL_MUTATIONS",
      maxReadOnlyConcurrency: args.maxReadOnlyConcurrency ?? 2, maxCorrectiveIterations: args.maxCorrectiveIterations ?? 2,
      correctiveIterations: 0, stopCondition: args.stopCondition, budgetUsd: args.budgetUsd, spentUsd: 0,
      createdAt: now, updatedAt: now, metadata: args.metadata,
    });
    const mission = await ctx.db.get(missionId);
    if (!mission) throw new Error("Mission creation failed");
    if (args.ownerMemberId && args.owningTeamId && project?.tenantId) {
      await ctx.db.insert("missionAssignments", {
        tenantId: project.tenantId,
        projectId: project._id,
        missionId: mission._id,
        memberId: args.ownerMemberId,
        teamId: args.owningTeamId,
        role: "OWNER",
        activeFrom: now,
        active: true,
        createdAt: now,
        updatedAt: now,
        createdBy: requestingOperatorId,
        updatedBy: requestingOperatorId,
      });
    }
    await logMissionEvent(ctx, {
      mission,
      eventType: "MISSION_CREATED",
      actorType: "HUMAN",
      actorId: operator.actorId,
      summary: `Created mission ${args.title}`,
      idempotencyKey: args.idempotencyKey ? `${args.idempotencyKey}:created` : undefined,
      metadata: { actorSource: operator.actorSource },
    });
    return { mission, created: true };
  },
});

export const updateDraft = mutation({
  args: {
    missionId: v.id("missions"),
    projectId: v.id("projects"),
    idempotencyKey: v.string(),
    title: v.string(),
    objective: v.string(),
    context: v.optional(v.string()),
    constraints: v.optional(v.array(v.string())),
    sourceOfTruthRefs: v.optional(v.array(sourceRef)),
    owner: v.optional(v.string()),
    budgetUsd: v.optional(v.number()),
    stopCondition: v.string(),
    maxReadOnlyConcurrency: v.optional(v.number()),
    maxCorrectiveIterations: v.optional(v.number()),
    ownerMemberId: v.optional(v.id("orgMembers")),
    owningTeamId: v.optional(v.id("scrumTeams")),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    codeScopeIds: v.optional(v.array(v.id("repositoryCodeScopes"))),
  },
  handler: async (ctx, args) => {
    const deliveryAccess = await requireAuthorizedDeliveryScope(ctx, args.projectId, COMPANY_PERMISSIONS.UPDATE_DELIVERY);
    validateMissionDraftInput(args);
    const mission = await ctx.db.get(args.missionId);
    if (!mission) throw new Error("Mission not found");
    assertMissionDraftWorkspace(mission, args.projectId);
    assertAuthorizedDeliveryRecord(deliveryAccess, mission);

    const duplicate = await ctx.db
      .query("missionEvents")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    if (duplicate) return { mission, updated: false };
    if (mission.state !== "DRAFT") {
      throw new Error(`Mission draft cannot be edited while ${mission.state}`);
    }

    let ownerMember: any = null;
    let assignmentAccess: any = null;
    if (args.ownerMemberId || args.owningTeamId || args.repositoryId || args.codeScopeIds?.length) {
      if (!mission.tenantId || !args.ownerMemberId || !args.owningTeamId || !args.repositoryId || !args.codeScopeIds?.length) {
        throw new Error("Mission delivery scope requires an owner, team, repository, and code scope");
      }
      assignmentAccess = await requireWorkspaceAccess(ctx, mission.tenantId, args.projectId, {
        permission: COMPANY_PERMISSIONS.ASSIGN_DELIVERY,
      });
      assertAuthorizedDeliveryRecord(assignmentAccess, {
        ownerMemberId: args.ownerMemberId,
        owningTeamId: args.owningTeamId,
      });
      const [member, team, repository, scopes, teamMembership] = await Promise.all([
        ctx.db.get(args.ownerMemberId),
        ctx.db.get(args.owningTeamId),
        ctx.db.get(args.repositoryId),
        Promise.all(args.codeScopeIds.map((scopeId) => ctx.db.get(scopeId))),
        ctx.db.query("teamMemberships")
          .withIndex("by_team_member", (q) => q.eq("teamId", args.owningTeamId!).eq("memberId", args.ownerMemberId!))
          .first(),
      ]);
      if (!member || !member.active || member.projectId !== args.projectId) throw new Error("Mission owner must be active in the selected workspace");
      if (!team || team.status !== "ACTIVE" || team.projectId !== args.projectId) throw new Error("Mission team must be active in the selected workspace");
      if (!teamMembership?.active) throw new Error("Mission owner must be active in the selected team");
      if (!repository || repository.projectId !== args.projectId) throw new Error("Mission repository must belong to the selected workspace");
      if (scopes.some((scope) => !scope || !scope.active || scope.projectId !== args.projectId || scope.repositoryId !== repository._id)) {
        throw new Error("Mission code scopes must be active in the selected repository");
      }
      ownerMember = member;
    }

    const {
      missionId: _missionId,
      projectId: _projectId,
      idempotencyKey: _idempotencyKey,
      ...draft
    } = args;
    const normalizedDraft = ownerMember ? { ...draft, owner: ownerMember.name } : draft;
    const changedFields = changedMissionDraftFields(mission, normalizedDraft);
    if (changedFields.length === 0) return { mission, updated: false };

    const now = Date.now();
    await ctx.db.patch(mission._id, { ...normalizedDraft, updatedAt: now });
    if (ownerMember && args.owningTeamId && assignmentAccess) {
      const assignments = await ctx.db.query("missionAssignments")
        .withIndex("by_mission_role", (q) => q.eq("missionId", mission._id).eq("role", "OWNER"))
        .collect();
      for (const assignment of assignments.filter((item) => item.active && (item.memberId !== ownerMember._id || item.teamId !== args.owningTeamId))) {
        await ctx.db.patch(assignment._id, {
          active: false,
          activeUntil: now,
          updatedAt: now,
          updatedBy: assignmentAccess.membership.operatorId,
        });
      }
      const matching = assignments.find((item) => item.memberId === ownerMember._id && item.teamId === args.owningTeamId);
      if (matching) {
        await ctx.db.patch(matching._id, {
          active: true,
          activeUntil: undefined,
          updatedAt: now,
          updatedBy: assignmentAccess.membership.operatorId,
        });
      } else {
        await ctx.db.insert("missionAssignments", {
          tenantId: mission.tenantId!,
          projectId: args.projectId,
          missionId: mission._id,
          memberId: ownerMember._id,
          teamId: args.owningTeamId,
          role: "OWNER",
          activeFrom: now,
          active: true,
          createdAt: now,
          updatedAt: now,
          createdBy: assignmentAccess.membership.operatorId,
          updatedBy: assignmentAccess.membership.operatorId,
        });
      }
    }
    const updated = await ctx.db.get(mission._id);
    if (!updated) throw new Error("Mission draft update failed");
    const operator = await resolveOperator(ctx);
    await logMissionEvent(ctx, {
      mission: updated,
      eventType: "MISSION_DRAFT_UPDATED",
      actorType: "HUMAN",
      actorId: operator.actorId,
      summary: `Updated mission draft ${updated.title}`,
      idempotencyKey: args.idempotencyKey,
      metadata: { actorSource: operator.actorSource, changedFields },
    });
    return { mission: updated, updated: true };
  },
});

export const savePlanDraft = mutation({
  args: {
    projectId: v.id("projects"),
    missionId: v.id("missions"),
    planId: v.optional(v.id("missionPlans")),
    basePlanId: v.optional(v.id("missionPlans")),
    expectedDraftVersion: v.optional(v.number()),
    planningRunId: v.optional(v.id("missionPlanningRuns")),
    idempotencyKey: v.string(),
    summary: v.string(),
    rollbackApproach: v.string(),
    estimatedCostUsd: v.optional(v.number()),
    workOrderBlueprints: v.array(blueprintInput),
    assertions: v.array(assertionInput),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const deliveryAccess = await requireAuthorizedDeliveryScope(ctx, args.projectId, COMPANY_PERMISSIONS.UPDATE_DELIVERY);
    await assertPlanReleaseEnabled(ctx, args.projectId);
    const { mission, project } = await assertMissionProject(ctx, args.missionId, args.projectId, deliveryAccess);
    if (!["DRAFT", "PLANNING"].includes(mission.state)) throw new Error(`Mission plan cannot be edited while ${mission.state}`);
    const operator = await resolveOperator(ctx);
    const now = Date.now();
    const planningBinding = args.planningRunId
      ? await loadPlanningRunBinding(ctx, mission, args.planningRunId)
      : null;
    const candidateEditedBeforeSave = planningBinding
      ? planningCandidateEditedBeforeSave(planningBinding, args)
      : false;

    if (args.planId) {
      const plan = await ctx.db.get(args.planId);
      if (!plan || plan.missionId !== mission._id || plan.projectId !== args.projectId) throw new Error("Mission plan not found");
      if (plan.status !== "DRAFT") throw new Error("Only a draft plan can be edited");
      if (planningBinding?.adoptedPlanId && planningBinding.adoptedPlanId !== plan._id) {
        throw new Error("Planning candidate is already bound to another Plan revision");
      }
      const version = plan.draftVersion ?? 1;
      if (args.expectedDraftVersion !== version) throw new Error("Mission plan changed in another session. Reload before saving.");
      await ctx.db.patch(plan._id, {
        summary: args.summary,
        rollbackApproach: args.rollbackApproach,
        estimatedCostUsd: args.estimatedCostUsd,
        workOrderBlueprints: args.workOrderBlueprints,
        assertions: args.assertions,
        draftVersion: version + 1,
        metadata: args.metadata,
        ...(planningBinding ? planningPlanFields(planningBinding) : {}),
      });
      if (planningBinding && planningBinding.adoptedPlanId !== plan._id) {
        await ctx.db.patch(planningBinding._id, { adoptedPlanId: plan._id, updatedAt: now });
      }
      const updated = await ctx.db.get(plan._id);
      await logMissionEvent(ctx, {
        mission,
        eventType: "PLAN_DRAFT_SAVED",
        actorType: "HUMAN",
        actorId: operator.actorId,
        summary: `Saved mission plan revision ${plan.revisionNumber}`,
        idempotencyKey: args.idempotencyKey,
        metadata: { planId: plan._id, draftVersion: version + 1, actorSource: operator.actorSource, planningRunId: planningBinding?._id, candidateEditedBeforeSave },
      });
      return { plan: updated, created: false };
    }

    const duplicate = await ctx.db.query("missionPlans").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).first();
    if (duplicate) {
      if (duplicate.missionId !== mission._id) throw new Error("Idempotency key is already bound to another Mission");
      return { plan: duplicate, created: false };
    }
    if (args.basePlanId) {
      const base = await ctx.db.get(args.basePlanId);
      if (!base || base.missionId !== mission._id || !["REJECTED", "SUPERSEDED"].includes(base.status)) {
        throw new Error("Plan revision baseline is not available");
      }
    }
    if (planningBinding?.adoptedPlanId) {
      throw new Error("Planning candidate is already bound to another Plan revision");
    }
    const specBinding = await isSpecIntakeEnabled(ctx, args.projectId)
      ? await loadFinalizedSpecBinding(ctx, project, mission)
      : null;
    const latestPlan = await ctx.db.query("missionPlans").withIndex("by_mission_revision", (q) => q.eq("missionId", mission._id)).order("desc").first();
    const revisionNumber = (latestPlan?.revisionNumber ?? 0) + 1;
    const planId = await ctx.db.insert("missionPlans", {
      tenantId: mission.tenantId,
      projectId: mission.projectId,
      missionId: mission._id,
      basePlanId: args.basePlanId,
      idempotencyKey: args.idempotencyKey,
      revisionNumber,
      draftVersion: 1,
      status: "DRAFT",
      summary: args.summary,
      rollbackApproach: args.rollbackApproach,
      estimatedCostUsd: args.estimatedCostUsd,
      createdBy: operator.actorId,
      ...(planningBinding ? planningPlanFields(planningBinding) : {}),
      ...specBinding?.fields,
      assertions: args.assertions,
      workOrderBlueprints: args.workOrderBlueprints,
      createdAt: now,
      metadata: args.metadata,
    });
    if (planningBinding) {
      await ctx.db.patch(planningBinding._id, { adoptedPlanId: planId, updatedAt: now });
    }
    if (mission.state === "DRAFT") {
      assertTransition(mission, "PLANNING");
      await ctx.db.patch(mission._id, { state: "PLANNING", updatedAt: now });
    }
    const updatedMission = await ctx.db.get(mission._id) ?? mission;
    await logMissionEvent(ctx, {
      mission: updatedMission,
      eventType: "PLAN_DRAFT_CREATED",
      actorType: "HUMAN",
      actorId: operator.actorId,
      summary: `Created mission plan revision ${revisionNumber}`,
      idempotencyKey: `${args.idempotencyKey}:created`,
      metadata: { planId, basePlanId: args.basePlanId, actorSource: operator.actorSource, planningRunId: planningBinding?._id, candidateEditedBeforeSave },
    });
    return { plan: await ctx.db.get(planId), created: true };
  },
});

export const abandonPlanDraft = mutation({
  args: { projectId: v.id("projects"), missionId: v.id("missions"), planId: v.id("missionPlans"), reason: v.string(), idempotencyKey: v.string() },
  handler: async (ctx, args) => {
    const deliveryAccess = await requireAuthorizedDeliveryScope(ctx, args.projectId, COMPANY_PERMISSIONS.UPDATE_DELIVERY);
    await assertPlanReleaseEnabled(ctx, args.projectId);
    if (!args.reason.trim()) throw new Error("A reason is required to abandon a plan draft");
    const { mission } = await assertMissionProject(ctx, args.missionId, args.projectId, deliveryAccess);
    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.missionId !== mission._id || plan.status !== "DRAFT") throw new Error("Draft plan not found");
    if (mission.state !== "PLANNING") throw new Error(`Mission plan cannot be abandoned while ${mission.state}`);
    const duplicate = await ctx.db.query("missionEvents").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).first();
    if (duplicate) return { mission, plan, created: false };
    const operator = await resolveOperator(ctx);
    const now = Date.now();
    assertTransition(mission, "DRAFT");
    await ctx.db.patch(plan._id, { status: "SUPERSEDED", decisionReason: args.reason.trim(), decidedBy: operator.actorId, decidedAt: now, decidedActorSource: operator.actorSource });
    await ctx.db.patch(mission._id, { state: "DRAFT", updatedAt: now, requiredHumanAction: "Review the Mission definition before creating another plan." });
    const updated = await ctx.db.get(mission._id);
    if (updated) await logMissionEvent(ctx, { mission: updated, eventType: "PLAN_DRAFT_ABANDONED", actorType: "HUMAN", actorId: operator.actorId, summary: `Abandoned mission plan revision ${plan.revisionNumber}`, idempotencyKey: args.idempotencyKey, metadata: { planId: plan._id, reason: args.reason.trim(), actorSource: operator.actorSource } });
    return { mission: updated, plan: await ctx.db.get(plan._id), created: true };
  },
});

export const submitPlan = mutation({
  args: { projectId: v.id("projects"), missionId: v.id("missions"), planId: v.id("missionPlans"), idempotencyKey: v.string() },
  handler: async (ctx, args) => {
    const deliveryAccess = await requireAuthorizedDeliveryScope(ctx, args.projectId, COMPANY_PERMISSIONS.UPDATE_DELIVERY);
    await assertPlanReleaseEnabled(ctx, args.projectId);
    const { mission, project } = await assertMissionProject(ctx, args.missionId, args.projectId, deliveryAccess);
    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.missionId !== mission._id || plan.projectId !== args.projectId) throw new Error("Mission plan not found");
    if (plan.status === "PROPOSED") return { plan, created: false };
    if (plan.status !== "DRAFT" || mission.state !== "PLANNING") throw new Error("Mission plan is not ready for submission");
    await assertPlanningPlanBinding(ctx, mission, plan);
    const workflows = await Promise.all(plan.workOrderBlueprints.map((blueprint: any) => blueprint.workflowId
      ? ctx.db.query("workflows").withIndex("by_workflow_id", (q: any) => q.eq("workflowId", blueprint.workflowId)).first()
      : null));
    const workOrderBlueprints = plan.workOrderBlueprints.map((blueprint: any, index: number) => {
      const workflow = workflows[index];
      if (!workflow || !workflow.active) throw new Error(`Active workflow not found for ${blueprint.id}`);
      return { ...blueprint, workflowVersion: workflow.version };
    });
    const repositoryBinding = await loadMissionRepositoryBinding(ctx, mission, project);
    const proposed = { ...plan, repository: repositoryBinding.repository, repositoryBranch: repositoryBinding.defaultBranch, workOrderBlueprints };
    assertValidPlan(proposed);
    if (mission.budgetUsd !== undefined && proposed.estimatedCostUsd !== undefined && proposed.estimatedCostUsd > mission.budgetUsd) {
      throw new Error("Plan estimate exceeds the Mission budget");
    }
    const specLineage = await loadPlanSpecLineage(ctx, mission, proposed);
    const specAnalysis = specLineage ? analyzeBoundPlan(mission, proposed, specLineage) : null;
    const operator = await resolveOperator(ctx);
    const now = Date.now();
    assertTransition(mission, "AWAITING_PLAN_APPROVAL");
    await ctx.db.patch(plan._id, {
      status: "PROPOSED",
      repository: repositoryBinding.repository,
      repositoryBranch: repositoryBinding.defaultBranch,
      workOrderBlueprints,
      submittedBy: operator.actorId,
      submittedAt: now,
      submittedActorSource: operator.actorSource,
      requirementsCoverageProjection: specAnalysis?.coverage,
      specConsistencyFindings: specAnalysis?.findings,
      specConsistencyDigest: specAnalysis?.digest,
      specConsistencyEvaluatedAt: specAnalysis ? now : undefined,
    });
    await ctx.db.patch(mission._id, { state: "AWAITING_PLAN_APPROVAL", updatedAt: now, requiredHumanAction: "Review, reject, or approve the proposed Mission plan." });
    const updated = await ctx.db.get(mission._id);
    if (updated) await logMissionEvent(ctx, { mission: updated, eventType: "PLAN_SUBMITTED", actorType: "HUMAN", actorId: operator.actorId, summary: `Submitted mission plan revision ${plan.revisionNumber}`, idempotencyKey: args.idempotencyKey, metadata: { planId: plan._id, actorSource: operator.actorSource } });
    return { plan: await ctx.db.get(plan._id), created: true };
  },
});

export const rejectPlan = mutation({
  args: { projectId: v.id("projects"), missionId: v.id("missions"), planId: v.id("missionPlans"), reason: v.string(), idempotencyKey: v.string() },
  handler: async (ctx, args) => {
    const deliveryAccess = await requireAuthorizedDeliveryScope(ctx, args.projectId, COMPANY_PERMISSIONS.APPROVE_DELIVERY);
    await assertPlanReleaseEnabled(ctx, args.projectId);
    if (!args.reason.trim()) throw new Error("Plan rejection requires a reason");
    const { mission } = await assertMissionProject(ctx, args.missionId, args.projectId, deliveryAccess);
    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.missionId !== mission._id) throw new Error("Mission plan not found");
    if (plan.status === "REJECTED") return { mission, plan, created: false };
    if (plan.status !== "PROPOSED" || mission.state !== "AWAITING_PLAN_APPROVAL") throw new Error("Mission plan is not awaiting a decision");
    const operator = await resolveOperator(ctx);
    const now = Date.now();
    assertTransition(mission, "DRAFT");
    await ctx.db.patch(plan._id, { status: "REJECTED", decisionReason: args.reason.trim(), decidedBy: operator.actorId, decidedAt: now, decidedActorSource: operator.actorSource });
    await ctx.db.patch(mission._id, { state: "DRAFT", updatedAt: now, requiredHumanAction: "Revise the rejected plan before requesting another decision." });
    const updated = await ctx.db.get(mission._id);
    if (updated) await logMissionEvent(ctx, { mission: updated, eventType: "PLAN_REJECTED", actorType: "HUMAN", actorId: operator.actorId, summary: `Rejected mission plan revision ${plan.revisionNumber}`, idempotencyKey: args.idempotencyKey, metadata: { planId: plan._id, reason: args.reason.trim(), actorSource: operator.actorSource } });
    return { mission: updated, plan: await ctx.db.get(plan._id), created: true };
  },
});

export const forkPlanRevision = mutation({
  args: { projectId: v.id("projects"), missionId: v.id("missions"), sourcePlanId: v.id("missionPlans"), idempotencyKey: v.string() },
  handler: async (ctx, args) => {
    const deliveryAccess = await requireAuthorizedDeliveryScope(ctx, args.projectId, COMPANY_PERMISSIONS.UPDATE_DELIVERY);
    await assertPlanReleaseEnabled(ctx, args.projectId);
    const { mission, project } = await assertMissionProject(ctx, args.missionId, args.projectId, deliveryAccess);
    if (mission.state !== "DRAFT") throw new Error(`Mission cannot create a plan revision while ${mission.state}`);
    const source = await ctx.db.get(args.sourcePlanId);
    if (!source || source.missionId !== mission._id || !["REJECTED", "SUPERSEDED"].includes(source.status)) throw new Error("Plan revision source not found");
    const duplicate = await ctx.db.query("missionPlans").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).first();
    if (duplicate) {
      if (duplicate.missionId !== mission._id) throw new Error("Idempotency key is already bound to another Mission");
      return { plan: duplicate, created: false };
    }
    const latestPlan = await ctx.db.query("missionPlans").withIndex("by_mission_revision", (q) => q.eq("missionId", mission._id)).order("desc").first();
    const revisionNumber = (latestPlan?.revisionNumber ?? 0) + 1;
    const operator = await resolveOperator(ctx);
    const now = Date.now();
    const specEnabled = await isSpecIntakeEnabled(ctx, args.projectId);
    if (!specEnabled && hasAnyPlanSpecLineage(source)) throw new Error(`Mission Spec intake is disabled (${MISSION_SPEC_INTAKE_FLAG}); a new Spec-bound Plan revision cannot be created`);
    const specBinding = specEnabled ? await loadFinalizedSpecBinding(ctx, project, mission) : null;
    const planId = await ctx.db.insert("missionPlans", {
      tenantId: mission.tenantId,
      projectId: mission.projectId,
      missionId: mission._id,
      basePlanId: source._id,
      idempotencyKey: args.idempotencyKey,
      revisionNumber,
      draftVersion: 1,
      status: "DRAFT",
      summary: source.summary,
      rollbackApproach: source.rollbackApproach,
      estimatedCostUsd: source.estimatedCostUsd,
      createdBy: operator.actorId,
      planningRunId: source.planningRunId,
      planningRepositorySha: source.planningRepositorySha,
      planningResearchPacketDigest: source.planningResearchPacketDigest,
      planningCandidateDigest: source.planningCandidateDigest,
      planningProvenance: source.planningProvenance,
      ...specBinding?.fields,
      assertions: normalizedPlanAssertions(source),
      workOrderBlueprints: source.workOrderBlueprints,
      createdAt: now,
      metadata: source.metadata,
    });
    assertTransition(mission, "PLANNING");
    await ctx.db.patch(mission._id, { state: "PLANNING", updatedAt: now, requiredHumanAction: undefined });
    const updated = await ctx.db.get(mission._id);
    if (updated) await logMissionEvent(ctx, { mission: updated, eventType: "PLAN_REVISION_FORKED", actorType: "HUMAN", actorId: operator.actorId, summary: `Created mission plan revision ${revisionNumber} from revision ${source.revisionNumber}`, idempotencyKey: `${args.idempotencyKey}:forked`, metadata: { planId, basePlanId: source._id, actorSource: operator.actorSource } });
    return { plan: await ctx.db.get(planId), created: true };
  },
});

export const approvePlan = mutation({
  args: { projectId: v.id("projects"), missionId: v.id("missions"), planId: v.id("missionPlans"), decisionReason: v.string(), idempotencyKey: v.string() },
  handler: async (ctx, args) => {
    const deliveryAccess = await requireAuthorizedDeliveryScope(ctx, args.projectId, COMPANY_PERMISSIONS.APPROVE_DELIVERY);
    await assertPlanReleaseEnabled(ctx, args.projectId);
    if (!args.decisionReason.trim()) throw new Error("Plan approval requires a reason");
    const { mission, project } = await assertMissionProject(ctx, args.missionId, args.projectId, deliveryAccess);
    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.missionId !== mission._id || plan.projectId !== args.projectId) throw new Error("Mission plan not found");
    if (plan.status === "APPROVED" && plan.releasedWorkOrderIds?.length) {
      const existingWorkOrders = (await Promise.all(plan.releasedWorkOrderIds.map((id: any) => ctx.db.get(id)))).filter(Boolean);
      return { mission, plan, workOrders: existingWorkOrders, created: false };
    }
    if (mission.state !== "AWAITING_PLAN_APPROVAL" || plan.status !== "PROPOSED") throw new Error("Mission plan is not awaiting approval");
    const repositoryBinding = await loadMissionRepositoryBinding(ctx, mission, project);
    if (plan.repository !== repositoryBinding.repository || plan.repositoryBranch !== repositoryBinding.defaultBranch) throw new Error("Repository configuration changed after plan submission. Create a new revision.");
    await assertPlanningPlanBinding(ctx, mission, plan);
    assertValidPlan(plan);
    const specLineage = await loadPlanSpecLineage(ctx, mission, plan);
    const specAnalysis = specLineage ? analyzeBoundPlan(mission, plan, specLineage) : null;
    if (specAnalysis && (!plan.requirementsCoverageProjection || plan.specConsistencyDigest !== specAnalysis.digest || plan.requirementsCoverageProjection.digest !== specAnalysis.coverage.digest)) {
      throw new Error("Mission Plan Spec coverage changed after submission. Create a new Plan revision.");
    }
    const workflows = await Promise.all(plan.workOrderBlueprints.map((blueprint: any) => ctx.db.query("workflows").withIndex("by_workflow_id", (q: any) => q.eq("workflowId", blueprint.workflowId)).first()));
    for (let index = 0; index < workflows.length; index += 1) {
      if (!workflows[index]?.active || workflows[index]?.version !== plan.workOrderBlueprints[index].workflowVersion) {
        throw new Error(`Workflow changed after plan submission: ${plan.workOrderBlueprints[index].workflowId}`);
      }
    }
    const operator = await resolveOperator(ctx);
    if (operator.actorSource === "AUTHENTICATED" && plan.submittedBy === operator.actorId) {
      throw new Error("A plan author cannot approve the same plan revision");
    }
    const now = Date.now();
    const releaseKey = missionPlanReleaseKey(String(plan._id));
    const qualityContract = compileApprovedPlanQualityContract({
      missionId: String(mission._id),
      missionPlanId: String(plan._id),
      missionPlanRevision: plan.revisionNumber,
      objective: mission.objective,
      businessContext: mission.context,
      constraints: mission.constraints,
      sourceOfTruthRefs: mission.sourceOfTruthRefs,
      repository: plan.repository!,
      repositoryBranch: plan.repositoryBranch!,
      planningRepositorySha: plan.planningRepositorySha,
      summary: plan.summary,
      rollbackApproach: plan.rollbackApproach,
      assertions: normalizedPlanAssertions(plan),
      workOrderBlueprints: plan.workOrderBlueprints,
      specLineage: specLineage ? {
        missionSpecRevisionId: String(specLineage.spec._id),
        missionSpecDigest: specLineage.spec.digest,
        missionSpecQualityEvaluationId: String(specLineage.evaluation._id),
        projectConstitutionRevisionId: String(specLineage.constitution._id),
        projectConstitutionDigest: specLineage.constitution.digest,
        requirementsCoverage: specAnalysis!.coverage,
        checklistLineage: boundChecklistLineage(specLineage.spec.content),
      } : undefined,
    });
    const assertionRows = new Map<string, any>();
    for (const assertion of normalizedPlanAssertions(plan)) {
      const assertionId = await ctx.db.insert("validationAssertions", {
        tenantId: mission.tenantId,
        projectId: mission.projectId,
        missionId: mission._id,
        missionPlanId: plan._id,
        assertionId: assertion.assertionId,
        title: assertion.title,
        outcome: assertion.outcome,
        verificationMethod: assertion.verificationMethod,
        passCondition: assertion.passCondition,
        requiredEvidence: assertion.requiredEvidence,
        requiresIndependentValidation: assertion.requiresIndependentValidation,
        waiverAllowed: assertion.waiverAllowed,
        linkedWorkOrderIds: [],
        status: "PENDING",
        createdAt: now,
        updatedAt: now,
      });
      assertionRows.set(assertion.assertionId, await ctx.db.get(assertionId));
    }
    await ctx.db.patch(plan._id, {
      status: "APPROVED",
      approvedBy: operator.actorId,
      approvedAt: now,
      decisionReason: args.decisionReason.trim(),
      decidedBy: operator.actorId,
      decidedAt: now,
      decidedActorSource: operator.actorSource,
      releaseIdempotencyKey: releaseKey,
      materializationVersion: 1,
      qualityContractProjection: qualityContract.projection,
      qualityContractDigest: qualityContract.digest,
    });
    await ctx.db.patch(mission._id, { state: "READY", currentPlanId: plan._id, updatedAt: now, requiredHumanAction: "Review released WorkOrders. Execution remains a separate governed action." });

    const releasedByBlueprint = new Map<string, any>();
    const workOrders: any[] = [];
    const codeScopes = (await Promise.all((mission.codeScopeIds ?? []).map((scopeId: any) => ctx.db.get(scopeId))))
      .filter(Boolean);
    for (const blueprint of [...plan.workOrderBlueprints].sort((left: any, right: any) => left.sequence - right.sequence)) {
      const dependencies = blueprint.dependsOnBlueprintIds.map((dependencyId: string) => String(releasedByBlueprint.get(dependencyId)?._id ?? dependencyId));
      const compiledContract = compileMissionWorkOrderContract({
        blueprint: {
          ...blueprint,
          priority: blueprint.priority ?? 3,
          riskLevel: blueprint.riskLevel ?? "MEDIUM",
          constraints: blueprint.constraints ?? [],
          requiredApprovals: blueprint.requiredApprovals ?? [],
        },
        assertions: normalizedPlanAssertions(plan),
        rollbackApproach: plan.rollbackApproach,
        codeScopes,
        spec: specLineage?.spec.content,
      });
      const result = await createWorkOrderRecord(ctx, {
        projectId: args.projectId,
        missionId: mission._id,
        missionPlanId: plan._id,
        missionPlanRevision: plan.revisionNumber,
        planningRunId: plan.planningRunId,
        planningRepositorySha: plan.planningRepositorySha,
        qualityContractDigest: qualityContract.digest,
        missionSpecLineage: specLineage ? {
          missionSpecRevisionId: specLineage.spec._id,
          missionSpecDigest: specLineage.spec.digest,
          missionSpecQualityEvaluationId: specLineage.evaluation._id,
          projectConstitutionRevisionId: specLineage.constitution._id,
          projectConstitutionDigest: specLineage.constitution.digest,
          requirementsCoverage: specAnalysis!.coverage,
          checklistLineage: boundChecklistLineage(specLineage.spec.content),
        } : undefined,
        missionBlueprintId: blueprint.id,
        missionRole: blueprint.role,
        isMutating: blueprint.isMutating,
        idempotencyKey: missionBlueprintReleaseKey(String(plan._id), blueprint.id),
        title: blueprint.title,
        desiredOutcome: blueprint.desiredOutcome,
        context: mission.context,
        workflowId: blueprint.workflowId,
        repository: plan.repository,
        branchStrategy: blueprint.branchStrategy,
        priority: blueprint.priority ?? 3,
        riskLevel: blueprint.riskLevel ?? "MEDIUM",
        modelComplexity: blueprint.modelComplexity,
        requestedBy: operator.actorId,
        requirements: compiledContract.requirements,
        acceptanceCriteria: compiledContract.acceptanceCriteria,
        constraints: [...(mission.constraints ?? []), ...(blueprint.constraints ?? [])],
        positiveConstraints: compiledContract.positiveConstraints,
        negativeConstraints: compiledContract.negativeConstraints,
        changeBudget: compiledContract.changeBudget,
        verificationContract: compiledContract.verificationContract,
        autonomyLevel: compiledContract.autonomyLevel,
        dependencies,
        sourceOfTruthRefs: mission.sourceOfTruthRefs,
        requiredApprovals: compiledContract.requiredApprovals,
        state: "READY",
        metadata: {
          ...compiledContract.metadata,
          approvedWorkflowVersion: blueprint.workflowVersion,
          estimatedCostUsd: blueprint.estimatedCostUsd,
          implementationPolicy: blueprint.implementationPolicy
            ? {
                ...blueprint.implementationPolicy,
                maxCostUsd: blueprint.implementationPolicy.maxCostUsd
                  ?? blueprint.estimatedCostUsd
                  ?? plan.estimatedCostUsd,
              }
            : undefined,
        },
      });
      releasedByBlueprint.set(blueprint.id, result.workOrder);
      workOrders.push(result.workOrder);
    }
    await ctx.db.patch(plan._id, { releasedAt: now, releasedWorkOrderIds: workOrders.map((workOrder) => workOrder._id) });
    const factoryLearningCandidateId = plan.metadata?.factoryLearningCandidateId;
    if (factoryLearningCandidateId) {
      const candidate = await ctx.db.get(
        factoryLearningCandidateId as Id<"metaLoopSuggestions">,
      );
      if (
        candidate?.acceptanceAuthority === false
        && candidate.projectId === args.projectId
        && candidate.missionId === mission._id
        && candidate.missionPlanId === plan._id
      ) {
        await ctx.db.patch(candidate._id, {
          status: "WORK_ORDERED",
          workOrderId: workOrders[0]?._id,
          resolvedAt: now,
        });
        await ctx.db.insert("activities", {
          tenantId: mission.tenantId,
          projectId: mission.projectId,
          actorType: "HUMAN",
          actorId: operator.actorId,
          action: "FACTORY_LEARNING_WORK_ORDERED",
          description: `Approved the governed Mission plan and released implementation work for ${candidate.title}`,
          targetType: "META_LOOP_SUGGESTION",
          targetId: String(candidate._id),
          metadata: {
            missionId: mission._id,
            missionPlanId: plan._id,
            workOrderIds: workOrders.map((workOrder) => workOrder._id),
            acceptanceAuthority: false,
          },
        });
      }
    }
    const updated = await ctx.db.get(mission._id);
    if (updated) await logMissionEvent(ctx, { mission: updated, eventType: "PLAN_APPROVED_AND_WORKORDERS_RELEASED", actorType: "HUMAN", actorId: operator.actorId, summary: `Approved mission plan revision ${plan.revisionNumber} and released ${workOrders.length} WorkOrders`, idempotencyKey: args.idempotencyKey, metadata: { planId: plan._id, releaseKey, qualityContractDigest: qualityContract.digest, workOrderIds: workOrders.map((workOrder) => workOrder._id), reason: args.decisionReason.trim(), actorSource: operator.actorSource, dispatchStarted: false } });
    return { mission: updated, plan: await ctx.db.get(plan._id), workOrders, created: true };
  },
});

export const start = mutation({
  args: { missionId: v.id("missions"), actorId: v.optional(v.string()), idempotencyKey: v.string() },
  handler: async (ctx, args) => {
    const scopedMission = await ctx.db.get(args.missionId);
    const deliveryAccess = await requireAuthorizedDeliveryScope(ctx, scopedMission?.projectId, COMPANY_PERMISSIONS.DISPATCH_WORK);
    const mission = await ctx.db.get(args.missionId);
    if (!mission) throw new Error("Mission not found");
    assertAuthorizedDeliveryRecord(deliveryAccess, mission);
    if (deliveryAccess) {
      if (!mission.ownerMemberId || !mission.owningTeamId) {
        throw new Error("Assign one accountable human owner and owning team before starting the Mission");
      }
      const activeOwners = (await ctx.db
        .query("missionAssignments")
        .withIndex("by_mission_role", (q) => q.eq("missionId", mission._id).eq("role", "OWNER"))
        .collect())
        .filter((assignment) => assignment.active);
      if (activeOwners.length !== 1 || activeOwners[0].memberId !== mission.ownerMemberId || activeOwners[0].teamId !== mission.owningTeamId) {
        throw new Error("Mission ownership must have exactly one matching active OWNER assignment before start");
      }
    }
    if (mission.state === "IN_PROGRESS") return { mission, created: false };
    const releasedWorkOrder = await ctx.db
      .query("workOrders")
      .withIndex("by_mission", (q) => q.eq("missionId", mission._id))
      .first();
    if (!releasedWorkOrder) throw new Error("Release at least one approved WorkOrder before starting the Mission");
    assertTransition(mission, "IN_PROGRESS");
    const now = Date.now();
    await ctx.db.patch(mission._id, { state: "IN_PROGRESS", updatedAt: now, blockingReason: undefined, requiredHumanAction: undefined });
    const updated = await ctx.db.get(mission._id);
    if (updated) await logMissionEvent(ctx, { mission: updated, eventType: "MISSION_STARTED", actorType: "HUMAN", actorId: args.actorId, summary: "Mission execution started", idempotencyKey: args.idempotencyKey });
    return { mission: updated, created: true };
  },
});

export const recordValidationResult = mutation({
  args: {
    missionId: v.id("missions"), validationAssertionId: v.id("validationAssertions"), workflowRunId: v.id("workflowRuns"),
    status: v.union(v.literal("PASS"), v.literal("FAIL"), v.literal("WAIVED"), v.literal("STALE"), v.literal("UNKNOWN")),
    verificationReceiptId: v.optional(v.id("verificationReceipts")), waiverApprovalDecisionId: v.optional(v.id("approvalDecisions")),
    actorId: v.optional(v.string()), idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const scopedMission = await ctx.db.get(args.missionId);
    const deliveryAccess = await requireAuthorizedDeliveryScope(ctx, scopedMission?.projectId, COMPANY_PERMISSIONS.VERIFY_DELIVERY);
    const [mission, assertion, run] = await Promise.all([
      ctx.db.get(args.missionId), ctx.db.get(args.validationAssertionId), ctx.db.get(args.workflowRunId),
    ]);
    if (!mission || !assertion || !run || assertion.missionId !== mission._id || run.missionId !== mission._id) {
      throw new Error("Mission validation references do not match");
    }
    assertAuthorizedDeliveryRecord(deliveryAccess, mission);
    if (run.missionRole !== "VALIDATOR" && assertion.requiresIndependentValidation) {
      throw new Error("Independent validation requires a validator WorkflowRun");
    }
    if (args.status === "PASS" && run.status !== "COMPLETED") {
      throw new Error("A passing Mission assertion requires a completed validator WorkflowRun");
    }
    if (args.status === "PASS") {
      if (!args.verificationReceiptId) {
        throw new Error("A passing Mission assertion requires a verification receipt");
      }
      const receipt = await ctx.db.get(args.verificationReceiptId);
      if (!receipt
        || receipt.validationAssertionId !== assertion._id
        || receipt.workflowRunId !== run._id
        || receipt.status !== "PASSED") {
        throw new Error("The verification receipt does not prove this assertion with this Validator run");
      }
    }
    if (args.status === "WAIVED" && (!assertion.waiverAllowed || !args.waiverApprovalDecisionId)) {
      throw new Error("Mission assertion waiver requires an authorized approval");
    }
    const duplicate = await ctx.db.query("missionEvents").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).first();
    if (duplicate) return { assertion, created: false };
    const now = Date.now();
    await ctx.db.patch(assertion._id, {
      status: args.status, validatorWorkflowRunId: run._id, verificationReceiptId: args.verificationReceiptId,
      waiverApprovalDecisionId: args.waiverApprovalDecisionId, updatedAt: now,
    });
    const execution = await loadMissionExecutionState(ctx, mission._id);
    const acceptance = execution.acceptance;
    const nextState = acceptance.eligible ? "AWAITING_ACCEPTANCE" : args.status === "FAIL" || args.status === "UNKNOWN" || args.status === "STALE" ? "BLOCKED" : mission.state;
    await ctx.db.patch(mission._id, {
      state: nextState as any, updatedAt: now,
      blockingReason: acceptance.eligible ? undefined : acceptance.blockingReasons.join("; "),
      requiredHumanAction: acceptance.eligible ? "Review and accept the fully evidenced Mission." : "Review validation evidence and create corrective work or revise the plan.",
    });
    const updated = await ctx.db.get(mission._id);
    if (updated) await logMissionEvent(ctx, { mission: updated, eventType: "VALIDATION_RECORDED", actorType: "AGENT", actorId: args.actorId, summary: `Validation ${args.status} for ${assertion.assertionId}`, idempotencyKey: args.idempotencyKey, metadata: { validationAssertionId: assertion._id, workflowRunId: run._id, verificationReceiptId: args.verificationReceiptId } });
    return { assertion: await ctx.db.get(assertion._id), mission: updated, acceptance, created: true };
  },
});

export const requestCorrectiveWork = mutation({
  args: { missionId: v.id("missions"), requestedBy: v.string(), reason: v.string(), idempotencyKey: v.string() },
  handler: async (ctx, args) => {
    const scopedMission = await ctx.db.get(args.missionId);
    const deliveryAccess = await requireAuthorizedDeliveryScope(ctx, scopedMission?.projectId, COMPANY_PERMISSIONS.UPDATE_DELIVERY);
    const mission = await ctx.db.get(args.missionId);
    if (!mission) throw new Error("Mission not found");
    assertAuthorizedDeliveryRecord(deliveryAccess, mission);
    if (mission.state !== "BLOCKED") throw new Error(`Corrective work can only be requested while Mission is BLOCKED (currently ${mission.state})`);
    if (mission.correctiveIterations >= mission.maxCorrectiveIterations) {
      throw new Error("Mission corrective-iteration limit reached; revise the plan or rescope with an operator");
    }
    const failedAssertions = await ctx.db
      .query("validationAssertions")
      .withIndex("by_mission", (q) => q.eq("missionId", mission._id))
      .collect();
    const failedAssertionIds = failedAssertions.filter((assertion) => ["FAIL", "STALE", "UNKNOWN"].includes(assertion.status)).map((assertion) => assertion.assertionId);
    if (failedAssertionIds.length === 0) throw new Error("Corrective work requires failed, stale, or unknown validation evidence");
    const duplicate = await ctx.db.query("missionEvents").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).first();
    if (duplicate) return { mission, failedAssertionIds, created: false };
    const now = Date.now();
    await ctx.db.patch(mission._id, {
      state: "READY", correctiveIterations: mission.correctiveIterations + 1, updatedAt: now,
      blockingReason: undefined,
      requiredHumanAction: "Release a corrective Worker Work Order, then re-run independent validation.",
    });
    const updated = await ctx.db.get(mission._id);
    if (updated) await logMissionEvent(ctx, {
      mission: updated, eventType: "CORRECTIVE_WORK_REQUESTED", actorType: "HUMAN", actorId: args.requestedBy,
      summary: `Corrective iteration ${updated.correctiveIterations} requested for ${failedAssertionIds.join(", ")}`,
      idempotencyKey: args.idempotencyKey, metadata: { failedAssertionIds, reason: args.reason },
    });
    return { mission: updated, failedAssertionIds, created: true };
  },
});

export const accept = mutation({
  args: { missionId: v.id("missions"), acceptedBy: v.string(), idempotencyKey: v.string() },
  handler: async (ctx, args) => {
    const scopedMission = await ctx.db.get(args.missionId);
    const deliveryAccess = await requireAuthorizedDeliveryScope(ctx, scopedMission?.projectId, COMPANY_PERMISSIONS.APPROVE_DELIVERY);
    const mission = await ctx.db.get(args.missionId);
    if (!mission) throw new Error("Mission not found");
    assertAuthorizedDeliveryRecord(deliveryAccess, mission);
    const duplicate = await ctx.db.query("missionEvents").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).first();
    if (duplicate) return { mission, created: false };
    if (mission.state !== "AWAITING_ACCEPTANCE") throw new Error(`Mission cannot be accepted while ${mission.state}`);
    const acceptance = (await loadMissionExecutionState(ctx, mission._id)).acceptance;
    if (!acceptance.eligible) throw new Error(`Mission cannot be accepted (${acceptance.blockingReasons.join("; ")})`);
    const now = Date.now();
    await ctx.db.patch(mission._id, { state: "DONE", acceptedAt: now, updatedAt: now, requiredHumanAction: undefined, blockingReason: undefined });
    const updated = await ctx.db.get(mission._id);
    if (updated) await logMissionEvent(ctx, { mission: updated, eventType: "MISSION_ACCEPTED", actorType: "HUMAN", actorId: args.acceptedBy, summary: "Mission accepted with complete validation coverage", idempotencyKey: args.idempotencyKey });
    return { mission: updated, created: true };
  },
});

export const recordHandoff = mutation({
  args: {
    missionId: v.id("missions"), workOrderId: v.id("workOrders"), workflowRunId: v.id("workflowRuns"), idempotencyKey: v.string(),
    producingRole: v.union(v.literal("WORKER"), v.literal("VALIDATOR")), consumingRole: v.union(v.literal("WORKER"), v.literal("VALIDATOR"), v.literal("ORCHESTRATOR"), v.literal("OPERATOR")),
    outcome: v.union(v.literal("COMPLETE"), v.literal("INCOMPLETE"), v.literal("NEEDS_HUMAN_INPUT")),
    completedAssertionIds: v.array(v.string()), incompleteAssertionIds: v.array(v.string()), unknownAssertionIds: v.array(v.string()),
    commands: v.array(v.object({ command: v.string(), exitCode: v.number() })), artifactIds: v.array(v.id("runArtifacts")), knownRisks: v.array(v.string()), nextAction: v.string(), nextOwner: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scopedMission = await ctx.db.get(args.missionId);
    const deliveryAccess = await requireAuthorizedDeliveryScope(ctx, scopedMission?.projectId, COMPANY_PERMISSIONS.UPDATE_DELIVERY);
    const [mission, workOrder, workflowRun] = await Promise.all([ctx.db.get(args.missionId), ctx.db.get(args.workOrderId), ctx.db.get(args.workflowRunId)]);
    if (!mission || !workOrder || !workflowRun || workOrder.missionId !== mission._id || workflowRun.missionId !== mission._id) throw new Error("Mission handoff references do not match");
    assertAuthorizedDeliveryRecord(deliveryAccess, mission);
    if (workflowRun.workOrderId !== workOrder._id || workflowRun.status !== "COMPLETED") {
      throw new Error("Mission handoff requires a completed run from the same WorkOrder");
    }
    if (workOrder.state !== "DONE") throw new Error("Accept the WorkOrder before recording its Mission handoff");
    const missionRole = workOrder.missionRole ?? "WORKER";
    if (missionRole !== args.producingRole || workflowRun.missionRole !== args.producingRole) {
      throw new Error("Mission handoff producing role does not match its WorkOrder and run");
    }
    const plan = workOrder.missionPlanId ? await ctx.db.get(workOrder.missionPlanId) : null;
    const blueprintId = workOrder.metadata?.missionBlueprintId;
    const blueprint = plan?.workOrderBlueprints.find((candidate: any) => candidate.id === blueprintId);
    if (!blueprint) throw new Error("Mission handoff is missing its approved blueprint contract");
    const reportedAssertionIds = [
      ...args.completedAssertionIds,
      ...args.incompleteAssertionIds,
      ...args.unknownAssertionIds,
    ];
    if (reportedAssertionIds.length !== blueprint.assertionIds.length
      || reportedAssertionIds.some((assertionId: string) => !blueprint.assertionIds.includes(assertionId))) {
      throw new Error("Mission handoff must account for every assertion in its approved blueprint");
    }
    for (const artifactId of args.artifactIds) {
      const artifact = await ctx.db.get(artifactId);
      if (!artifact || artifact.workflowRunId !== workflowRun._id || artifact.workOrderId !== workOrder._id) {
        throw new Error("Mission handoff artifacts must belong to the same run and WorkOrder");
      }
    }
    const validation = validateMissionHandoff({ ...args, role: args.producingRole });
    if (!validation.ok) throw new Error(`Mission handoff is invalid (${validation.reason})`);
    const duplicate = await ctx.db.query("missionHandoffs").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).first();
    if (duplicate) return { handoff: duplicate, created: false };
    const handoffId = await ctx.db.insert("missionHandoffs", { ...args, tenantId: mission.tenantId, projectId: mission.projectId, createdAt: Date.now() });
    await logMissionEvent(ctx, { mission, eventType: "HANDOFF_RECORDED", actorType: "AGENT", summary: `${args.producingRole} handoff recorded`, idempotencyKey: `${args.idempotencyKey}:event`, metadata: { handoffId, workOrderId: workOrder._id, workflowRunId: workflowRun._id } });
    const handoff = await ctx.db.get(handoffId);
    const reconciliation = await reconcileMissionAfterHandoff(ctx, { mission, handoff });
    return { handoff, mission: reconciliation.mission, acceptance: reconciliation.acceptance, created: true };
  },
});
