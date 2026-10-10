export type MissionState =
  | "DRAFT"
  | "PLANNING"
  | "AWAITING_PLAN_APPROVAL"
  | "READY"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "AWAITING_VALIDATION"
  | "AWAITING_ACCEPTANCE"
  | "DONE"
  | "CANCELED"
  | "SUPERSEDED";

export type MissionRole = "ORCHESTRATOR" | "WORKER" | "VALIDATOR" | "OPERATOR";
export type MissionExecutionPolicy = "SERIAL_MUTATIONS";
export type MissionAssertionStatus = "PENDING" | "PASS" | "FAIL" | "WAIVED" | "STALE" | "UNKNOWN";
export type MissionHandoffOutcome = "COMPLETE" | "INCOMPLETE" | "NEEDS_HUMAN_INPUT";

const TRANSITIONS: Record<MissionState, MissionState[]> = {
  DRAFT: ["PLANNING", "CANCELED"],
  PLANNING: ["DRAFT", "AWAITING_PLAN_APPROVAL", "BLOCKED", "CANCELED"],
  AWAITING_PLAN_APPROVAL: ["DRAFT", "READY", "CANCELED"],
  READY: ["IN_PROGRESS", "BLOCKED", "CANCELED"],
  IN_PROGRESS: ["AWAITING_VALIDATION", "AWAITING_ACCEPTANCE", "BLOCKED", "CANCELED"],
  BLOCKED: ["READY", "CANCELED"],
  AWAITING_VALIDATION: ["IN_PROGRESS", "AWAITING_ACCEPTANCE", "BLOCKED", "CANCELED"],
  AWAITING_ACCEPTANCE: ["DONE", "IN_PROGRESS", "BLOCKED", "CANCELED"],
  DONE: ["SUPERSEDED"],
  CANCELED: [],
  SUPERSEDED: [],
};

export function canTransitionMission(from: MissionState, to: MissionState) {
  return TRANSITIONS[from].includes(to);
}

export function missionIterationAuthorized(correctiveIterations: number, maxCorrectiveIterations: number) {
  return Number.isInteger(correctiveIterations) && Number.isInteger(maxCorrectiveIterations)
    && correctiveIterations >= 0 && maxCorrectiveIterations >= 0
    && (maxCorrectiveIterations === 0
      ? correctiveIterations === 0
      : correctiveIterations < maxCorrectiveIterations);
}

export function validateMissionWorkOrderDispatch(args: {
  missionState: MissionState;
  workOrderRole?: Extract<MissionRole, "WORKER" | "VALIDATOR">;
  planApproved: boolean;
  executionPolicy: MissionExecutionPolicy;
  workOrderReleased: boolean;
  isMutating: boolean;
  hasActiveMutatingWorkOrder: boolean;
  predecessorHandoffValid: boolean;
  budgetRemaining: boolean;
  correctiveIterationsRemaining: boolean;
}) {
  if (!args.planApproved) return { ok: false as const, reason: "plan-not-approved" };
  if (!args.workOrderReleased) return { ok: false as const, reason: "work-order-not-released" };
  const role = args.workOrderRole ?? "WORKER";
  const dispatchableStates = role === "VALIDATOR"
    ? ["IN_PROGRESS", "AWAITING_VALIDATION"]
    : ["READY", "IN_PROGRESS"];
  if (!dispatchableStates.includes(args.missionState)) {
    return { ok: false as const, reason: `mission-not-dispatchable:${args.missionState}` };
  }
  if (!args.predecessorHandoffValid) return { ok: false as const, reason: "predecessor-handoff-invalid" };
  if (!args.budgetRemaining) return { ok: false as const, reason: "mission-budget-exhausted" };
  if (!args.correctiveIterationsRemaining) return { ok: false as const, reason: "corrective-iteration-limit" };
  if (args.executionPolicy === "SERIAL_MUTATIONS" && args.isMutating && args.hasActiveMutatingWorkOrder) {
    return { ok: false as const, reason: "active-mutating-work-order-exists" };
  }
  return { ok: true as const };
}

export function validateMissionHandoff(args: {
  role: MissionRole;
  outcome: MissionHandoffOutcome;
  completedAssertionIds: string[];
  incompleteAssertionIds: string[];
  unknownAssertionIds: string[];
  commands: Array<{ command: string; exitCode: number }>;
  knownRisks: string[];
  nextAction: string;
}) {
  if (!["WORKER", "VALIDATOR"].includes(args.role)) return { ok: false as const, reason: "handoff-role-invalid" };
  if (!args.nextAction.trim()) return { ok: false as const, reason: "next-action-required" };
  if (args.commands.some((command) => !command.command.trim() || !Number.isInteger(command.exitCode))) {
    return { ok: false as const, reason: "command-evidence-invalid" };
  }
  const allAssertionIds = [
    ...args.completedAssertionIds,
    ...args.incompleteAssertionIds,
    ...args.unknownAssertionIds,
  ];
  if (new Set(allAssertionIds).size !== allAssertionIds.length) {
    return { ok: false as const, reason: "assertion-outcomes-overlap" };
  }
  if (args.outcome === "COMPLETE" && (args.incompleteAssertionIds.length > 0 || args.unknownAssertionIds.length > 0)) {
    return { ok: false as const, reason: "complete-handoff-has-open-assertions" };
  }
  if (args.outcome !== "COMPLETE" && args.knownRisks.length === 0) {
    return { ok: false as const, reason: "open-handoff-risk-required" };
  }
  return { ok: true as const };
}

export function evaluateMissionAcceptance(args: {
  assertions: Array<{
    id: string;
    status: MissionAssertionStatus;
    requiresIndependentValidation: boolean;
    validatorRunId?: string;
    verificationReceiptId?: string;
    waiverApprovalId?: string;
  }>;
  workOrders?: Array<{ id: string; state: string }>;
  handoffs?: Array<{
    workOrderId: string;
    outcome: MissionHandoffOutcome;
    incompleteAssertionIds: string[];
    unknownAssertionIds: string[];
  }>;
}) {
  const missingAssertionIds: string[] = [];
  const failedAssertionIds: string[] = [];
  const staleAssertionIds: string[] = [];
  const unverifiedAssertionIds: string[] = [];
  const waiverWithoutApprovalIds: string[] = [];
  const missingReceiptAssertionIds: string[] = [];

  for (const assertion of args.assertions) {
    if (assertion.status === "PENDING" || assertion.status === "UNKNOWN") missingAssertionIds.push(assertion.id);
    if (assertion.status === "FAIL") failedAssertionIds.push(assertion.id);
    if (assertion.status === "STALE") staleAssertionIds.push(assertion.id);
    if (assertion.requiresIndependentValidation && assertion.status === "PASS" && !assertion.validatorRunId) {
      unverifiedAssertionIds.push(assertion.id);
    }
    if (assertion.requiresIndependentValidation && assertion.status === "PASS" && !assertion.verificationReceiptId) {
      missingReceiptAssertionIds.push(assertion.id);
    }
    if (assertion.status === "WAIVED" && !assertion.waiverApprovalId) waiverWithoutApprovalIds.push(assertion.id);
  }

  const incompleteWorkOrderIds = (args.workOrders ?? [])
    .filter((workOrder) => workOrder.state !== "DONE")
    .map((workOrder) => workOrder.id);
  const handoffByWorkOrderId = new Map((args.handoffs ?? []).map((handoff) => [handoff.workOrderId, handoff]));
  const missingHandoffWorkOrderIds = (args.workOrders ?? [])
    .filter((workOrder) => {
      const handoff = handoffByWorkOrderId.get(workOrder.id);
      return !handoff
        || handoff.outcome !== "COMPLETE"
        || handoff.incompleteAssertionIds.length > 0
        || handoff.unknownAssertionIds.length > 0;
    })
    .map((workOrder) => workOrder.id);

  const blockingReasons = [
    ...(missingAssertionIds.length ? [`Missing assertion evidence: ${missingAssertionIds.join(", ")}`] : []),
    ...(failedAssertionIds.length ? [`Failed assertions: ${failedAssertionIds.join(", ")}`] : []),
    ...(staleAssertionIds.length ? [`Stale assertions: ${staleAssertionIds.join(", ")}`] : []),
    ...(unverifiedAssertionIds.length ? [`Independent validation missing: ${unverifiedAssertionIds.join(", ")}`] : []),
    ...(missingReceiptAssertionIds.length ? [`Independent receipt missing: ${missingReceiptAssertionIds.join(", ")}`] : []),
    ...(waiverWithoutApprovalIds.length ? [`Waiver approval missing: ${waiverWithoutApprovalIds.join(", ")}`] : []),
    ...(incompleteWorkOrderIds.length ? [`WorkOrders not accepted: ${incompleteWorkOrderIds.join(", ")}`] : []),
    ...(missingHandoffWorkOrderIds.length ? [`Complete handoffs missing: ${missingHandoffWorkOrderIds.join(", ")}`] : []),
  ];

  return {
    missingAssertionIds,
    failedAssertionIds,
    staleAssertionIds,
    unverifiedAssertionIds,
    missingReceiptAssertionIds,
    waiverWithoutApprovalIds,
    incompleteWorkOrderIds,
    missingHandoffWorkOrderIds,
    blockingReasons,
    eligible: blockingReasons.length === 0,
  };
}

export function evaluateMissionDeliveryProgress(args: {
  workOrders: Array<{ id: string; role: "WORKER" | "VALIDATOR"; state: string }>;
  handoffs: Array<{
    workOrderId: string;
    outcome: MissionHandoffOutcome;
    incompleteAssertionIds: string[];
    unknownAssertionIds: string[];
  }>;
}) {
  const handoffByWorkOrderId = new Map(args.handoffs.map((handoff) => [handoff.workOrderId, handoff]));
  const isComplete = (workOrder: { id: string; state: string }) => {
    const handoff = handoffByWorkOrderId.get(workOrder.id);
    return workOrder.state === "DONE"
      && handoff?.outcome === "COMPLETE"
      && handoff.incompleteAssertionIds.length === 0
      && handoff.unknownAssertionIds.length === 0;
  };
  const workers = args.workOrders.filter((workOrder) => workOrder.role === "WORKER");
  const validators = args.workOrders.filter((workOrder) => workOrder.role === "VALIDATOR");
  return {
    allWorkersComplete: workers.length > 0 && workers.every(isComplete),
    allValidatorsComplete: validators.length > 0 && validators.every(isComplete),
    hasValidators: validators.length > 0,
    incompleteWorkerIds: workers.filter((workOrder) => !isComplete(workOrder)).map((workOrder) => workOrder.id),
    incompleteValidatorIds: validators.filter((workOrder) => !isComplete(workOrder)).map((workOrder) => workOrder.id),
  };
}
