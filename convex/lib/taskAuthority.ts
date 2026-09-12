export const WORK_ORDER_OBJECTIVE_AUTHORITY = "WORK_ORDER_DESIRED_OUTCOME" as const;

export interface WorkOrderTaskAuthorityScope {
  kind: typeof WORK_ORDER_OBJECTIVE_AUTHORITY;
  workOrderId: string;
  workOrderRevisionNumber: number;
  authorityRef: string;
  objective: string;
}

export interface WorkOrderAuthoritySource {
  _id: string;
  currentRevisionNumber?: number;
  desiredOutcome: string;
}

export function buildWorkOrderTaskAuthority(
  workOrder: WorkOrderAuthoritySource,
): WorkOrderTaskAuthorityScope {
  const revisionNumber = workOrder.currentRevisionNumber ?? 1;
  return {
    kind: WORK_ORDER_OBJECTIVE_AUTHORITY,
    workOrderId: String(workOrder._id),
    workOrderRevisionNumber: revisionNumber,
    authorityRef: `work-order:${String(workOrder._id)}:revision:${revisionNumber}:desired-outcome`,
    objective: workOrder.desiredOutcome.trim(),
  };
}

export function workOrderTaskAuthorityIssue(args: {
  scope: unknown;
  workOrder: WorkOrderAuthoritySource;
}): "task-authority-missing" | "task-authority-mismatch" | null {
  if (!args.scope || typeof args.scope !== "object") {
    return "task-authority-missing";
  }

  const expected = buildWorkOrderTaskAuthority(args.workOrder);
  const scope = args.scope as Partial<WorkOrderTaskAuthorityScope>;
  return scope.kind === expected.kind
    && scope.workOrderId === expected.workOrderId
    && scope.workOrderRevisionNumber === expected.workOrderRevisionNumber
    && scope.authorityRef === expected.authorityRef
    && scope.objective?.trim() === expected.objective
    ? null
    : "task-authority-mismatch";
}

/**
 * A governed retry may cross a WorkOrder revision only when the Task's prior
 * authority is intact and the human-owned objective did not change. This
 * advances the revision pointer without repairing missing or tampered scope.
 */
export function advanceWorkOrderTaskAuthorityForRetry(args: {
  scope: unknown;
  workOrder: WorkOrderAuthoritySource;
}): WorkOrderTaskAuthorityScope | null {
  if (!args.scope || typeof args.scope !== "object") return null;

  const expected = buildWorkOrderTaskAuthority(args.workOrder);
  const scope = args.scope as Partial<WorkOrderTaskAuthorityScope>;
  const priorRevision = scope.workOrderRevisionNumber;
  if (
    scope.kind !== expected.kind
    || scope.workOrderId !== expected.workOrderId
    || typeof priorRevision !== "number"
    || !Number.isSafeInteger(priorRevision)
    || priorRevision >= expected.workOrderRevisionNumber
    || scope.authorityRef !== `work-order:${expected.workOrderId}:revision:${priorRevision}:desired-outcome`
    || scope.objective?.trim() !== expected.objective
  ) {
    return null;
  }

  return expected;
}
