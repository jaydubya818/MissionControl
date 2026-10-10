import {
  canTransitionMission,
  evaluateMissionAcceptance,
  evaluateMissionDeliveryProgress,
  type MissionAssertionStatus,
} from "./missionGovernance";

type ReceiptStatus = "PENDING" | "PASSED" | "FAILED" | "WAIVED" | "STALE";

function assertionStatusForReceipt(status: ReceiptStatus): MissionAssertionStatus | null {
  if (status === "PASSED") return "PASS";
  if (status === "FAILED") return "FAIL";
  if (status === "WAIVED") return "WAIVED";
  if (status === "STALE") return "STALE";
  return null;
}

export function assertionEvidenceCanSatisfy(args: {
  missionRole?: string;
  requiresIndependentValidation: boolean;
  serverDerivedIndependentVerification?: boolean;
}) {
  return args.missionRole === "VALIDATOR"
    || ((args.missionRole ?? "WORKER") === "WORKER"
      && (!args.requiresIndependentValidation || args.serverDerivedIndependentVerification === true));
}

export function missionReceiptMatchesExecution(args: {
  workOrder: { _id: string; missionId?: string; missionRole?: string; currentRevisionNumber?: number };
  workflowRun: { _id: string; workOrderId?: string; missionId?: string; missionRole?: string; status: string; executionBaseSha?: string; headSha?: string; attemptPurpose?: string; verificationAttemptBinding?: any };
  verificationReceipt: { workflowRunId: string; workOrderRevisionNumber?: number; status?: string; sourceRevision?: string; candidateRevision?: string; sourceAttemptId?: string; verificationAttemptId?: string; independenceValid?: boolean };
}) {
  const role = args.workOrder.missionRole ?? "WORKER";
  const terminalStatusMatches = args.verificationReceipt.status && args.verificationReceipt.status !== "PASSED"
    ? ["COMPLETED", "FAILED"].includes(args.workflowRun.status)
    : args.workflowRun.status === "COMPLETED";
  const policyV2 = args.workflowRun.attemptPurpose === "VERIFICATION";
  const subject = args.workflowRun.verificationAttemptBinding?.verificationSubject;
  const exactCandidateMatches = policyV2
    ? args.verificationReceipt.independenceValid === true
      && args.verificationReceipt.verificationAttemptId === args.workflowRun._id
      && args.verificationReceipt.sourceAttemptId === args.workflowRun.verificationAttemptBinding?.sourceAttemptId
      && (!args.verificationReceipt.candidateRevision
        || args.verificationReceipt.candidateRevision === (subject?.kind === "GIT_CANDIDATE" ? subject.candidateSha : subject?.outputSnapshotContentHash))
    : (!args.verificationReceipt.sourceRevision || args.verificationReceipt.sourceRevision === args.workflowRun.executionBaseSha)
      && (!args.verificationReceipt.candidateRevision || args.verificationReceipt.candidateRevision === args.workflowRun.headSha);
  return terminalStatusMatches
    && args.workflowRun.workOrderId === args.workOrder._id
    && args.workflowRun.missionId === args.workOrder.missionId
    && (args.workflowRun.missionRole ?? "WORKER") === role
    && args.verificationReceipt.workflowRunId === args.workflowRun._id
    && args.verificationReceipt.workOrderRevisionNumber === (args.workOrder.currentRevisionNumber ?? 1)
    && exactCandidateMatches;
}

async function insertMissionEvent(ctx: any, args: {
  mission: any;
  workOrderId?: any;
  workflowRunId?: any;
  eventType: string;
  actorType: "HUMAN" | "AGENT" | "SYSTEM";
  actorId?: string;
  summary: string;
  idempotencyKey: string;
  metadata?: any;
}) {
  const existing = await ctx.db
    .query("missionEvents")
    .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", args.idempotencyKey))
    .first();
  if (existing) return existing;
  const id = await ctx.db.insert("missionEvents", {
    tenantId: args.mission.tenantId,
    projectId: args.mission.projectId,
    missionId: args.mission._id,
    workOrderId: args.workOrderId,
    workflowRunId: args.workflowRunId,
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

function latestHandoffs(handoffs: any[]) {
  const byWorkOrder = new Map<string, any>();
  for (const handoff of [...handoffs].sort((left, right) => right.createdAt - left.createdAt)) {
    const key = String(handoff.workOrderId);
    if (!byWorkOrder.has(key)) byWorkOrder.set(key, handoff);
  }
  return [...byWorkOrder.values()];
}

export async function loadMissionExecutionState(ctx: any, missionId: any) {
  const [assertions, workOrders, handoffRows] = await Promise.all([
    ctx.db.query("validationAssertions").withIndex("by_mission", (q: any) => q.eq("missionId", missionId)).collect(),
    ctx.db.query("workOrders").withIndex("by_mission", (q: any) => q.eq("missionId", missionId)).collect(),
    ctx.db.query("missionHandoffs").withIndex("by_mission", (q: any) => q.eq("missionId", missionId)).collect(),
  ]);
  const handoffs = latestHandoffs(handoffRows);
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
    handoffs: handoffs.map((handoff: any) => ({
      workOrderId: String(handoff.workOrderId),
      outcome: handoff.outcome,
      incompleteAssertionIds: handoff.incompleteAssertionIds,
      unknownAssertionIds: handoff.unknownAssertionIds,
    })),
  });
  const progress = evaluateMissionDeliveryProgress({
    workOrders: workOrders.map((workOrder: any) => ({
      id: String(workOrder._id),
      role: workOrder.missionRole ?? "WORKER",
      state: workOrder.state,
    })),
    handoffs: handoffs.map((handoff: any) => ({
      workOrderId: String(handoff.workOrderId),
      outcome: handoff.outcome,
      incompleteAssertionIds: handoff.incompleteAssertionIds,
      unknownAssertionIds: handoff.unknownAssertionIds,
    })),
  });
  return { assertions, workOrders, handoffs, acceptance, progress };
}

export async function startMissionForWorkOrderDispatch(ctx: any, args: {
  mission: any;
  workOrder: any;
  workflowRunId: any;
  actorType: "HUMAN" | "AGENT" | "SYSTEM";
  actorId?: string;
  idempotencyKey: string;
}) {
  const isValidator = args.workOrder.missionRole === "VALIDATOR";
  const shouldStart = args.mission.state === "READY"
    || (isValidator && args.mission.state === "AWAITING_VALIDATION");
  if (!shouldStart) return { mission: args.mission, changed: false };
  if (!canTransitionMission(args.mission.state, "IN_PROGRESS")) {
    throw new Error(`Mission cannot enter execution from ${args.mission.state}`);
  }
  const now = Date.now();
  await ctx.db.patch(args.mission._id, {
    state: "IN_PROGRESS",
    updatedAt: now,
    blockingReason: undefined,
    requiredHumanAction: undefined,
  });
  const updated = await ctx.db.get(args.mission._id);
  await insertMissionEvent(ctx, {
    mission: updated ?? args.mission,
    workOrderId: args.workOrder._id,
    workflowRunId: args.workflowRunId,
    eventType: isValidator ? "MISSION_VALIDATION_STARTED" : "MISSION_STARTED",
    actorType: args.actorType,
    actorId: args.actorId,
    summary: isValidator
      ? `Independent validation started from ${args.workOrder.title}`
      : `Mission execution started from ${args.workOrder.title}`,
    idempotencyKey: `${args.idempotencyKey}:mission-start`,
  });
  return { mission: updated, changed: true };
}

export async function syncMissionValidationReceipt(ctx: any, args: {
  workOrder: any;
  workflowRun: any;
  verificationReceipt: any;
}) {
  const missionStatus = assertionStatusForReceipt(args.verificationReceipt.status);
  if (!args.workOrder.missionId || !missionStatus) return { synced: false };
  const isValidator = args.workOrder.missionRole === "VALIDATOR";
  if (!missionReceiptMatchesExecution(args)) {
    throw new Error("Mission assertion evidence requires a completed linked run");
  }
  const mission = await ctx.db.get(args.workOrder.missionId);
  if (!mission) throw new Error("Mission not found for Validator evidence");
  const assertion = await ctx.db
    .query("validationAssertions")
    .withIndex("by_mission_assertion", (q: any) => q
      .eq("missionId", mission._id)
      .eq("assertionId", args.verificationReceipt.acceptanceCriterionId))
    .first();
  if (!assertion || !assertion.linkedWorkOrderIds.includes(args.workOrder._id)) {
    throw new Error("Verification receipt is not linked to the Mission assertion contract");
  }
  if (args.verificationReceipt.validationAssertionId !== assertion._id) {
    throw new Error("Verification receipt does not bind the linked Mission assertion");
  }
  const serverDerivedIndependentVerification = Boolean(
    args.workOrder.verificationContract?.schemaVersion === 2
    && args.workflowRun.attemptPurpose === "VERIFICATION"
    && args.verificationReceipt.independenceValid === true
    && args.verificationReceipt.verificationAttemptId === args.workflowRun._id
    && args.verificationReceipt.sourceAttemptId
    && args.verificationReceipt.sourceAttemptId !== args.workflowRun._id,
  );
  if (!assertionEvidenceCanSatisfy({
    missionRole: args.workOrder.missionRole,
    requiresIndependentValidation: assertion.requiresIndependentValidation,
    serverDerivedIndependentVerification,
  })) {
    return { synced: false };
  }
  if (missionStatus === "WAIVED" && (!assertion.waiverAllowed || !args.verificationReceipt.waiverApprovalDecisionId)) {
    throw new Error("Mission assertion waiver requires an authorized approval");
  }

  const now = Date.now();
  await ctx.db.patch(assertion._id, {
    status: missionStatus,
    validatorWorkflowRunId: isValidator || serverDerivedIndependentVerification ? args.workflowRun._id : undefined,
    verificationReceiptId: args.verificationReceipt._id,
    waiverApprovalDecisionId: args.verificationReceipt.waiverApprovalDecisionId,
    updatedAt: now,
  });
  const state = await loadMissionExecutionState(ctx, mission._id);
  const failed = ["FAIL", "STALE", "UNKNOWN"].includes(missionStatus);
  const nextState = failed
    ? "BLOCKED"
    : state.acceptance.eligible
      ? "AWAITING_ACCEPTANCE"
      : mission.state;
  if (nextState !== mission.state && !canTransitionMission(mission.state, nextState as any)) {
    throw new Error(`Mission cannot transition from ${mission.state} to ${nextState}`);
  }
  await ctx.db.patch(mission._id, {
    state: nextState,
    updatedAt: now,
    blockingReason: failed ? state.acceptance.blockingReasons.join("; ") : undefined,
    requiredHumanAction: failed
      ? "Review failed validator evidence and request bounded corrective work."
      : state.acceptance.eligible
        ? "Review and accept the fully evidenced Mission."
        : "Accept the Validator WorkOrder and record its structured handoff.",
  });
  const updatedMission = await ctx.db.get(mission._id);
  await insertMissionEvent(ctx, {
    mission: updatedMission ?? mission,
    workOrderId: args.workOrder._id,
    workflowRunId: args.workflowRun._id,
    eventType: "VALIDATION_RECORDED",
    actorType: "AGENT",
    actorId: args.verificationReceipt.verifier,
    summary: `Validation ${missionStatus} for ${assertion.assertionId}`,
    idempotencyKey: `mission-validation-receipt:${args.verificationReceipt._id}`,
    metadata: {
      validationAssertionId: assertion._id,
      verificationReceiptId: args.verificationReceipt._id,
    },
  });
  return { synced: true, assertion: await ctx.db.get(assertion._id), mission: updatedMission, acceptance: state.acceptance };
}

export async function reconcileMissionAfterHandoff(ctx: any, args: {
  mission: any;
  handoff: any;
}) {
  const state = await loadMissionExecutionState(ctx, args.mission._id);
  const failedHandoff = args.handoff.outcome !== "COMPLETE";
  const nextState = failedHandoff
    ? "BLOCKED"
    : state.acceptance.eligible
      ? "AWAITING_ACCEPTANCE"
      : state.progress.allWorkersComplete && state.progress.hasValidators
        ? "AWAITING_VALIDATION"
        : args.mission.state;
  if (nextState !== args.mission.state && !canTransitionMission(args.mission.state, nextState as any)) {
    throw new Error(`Mission cannot transition from ${args.mission.state} to ${nextState}`);
  }
  const requiredHumanAction = failedHandoff
    ? "Review the incomplete handoff and decide whether to retry, revise, or stop."
    : nextState === "AWAITING_VALIDATION"
      ? "Approve and dispatch the independent Validator WorkOrder."
      : nextState === "AWAITING_ACCEPTANCE"
        ? "Review and accept the fully evidenced Mission."
        : args.mission.requiredHumanAction;
  await ctx.db.patch(args.mission._id, {
    state: nextState,
    updatedAt: Date.now(),
    blockingReason: failedHandoff ? `Handoff ${args.handoff.outcome}` : undefined,
    requiredHumanAction,
  });
  return { mission: await ctx.db.get(args.mission._id), acceptance: state.acceptance, progress: state.progress };
}
