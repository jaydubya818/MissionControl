export type ParentTaskStatus =
  | "INBOX"
  | "READY"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "REVIEW"
  | "NEEDS_APPROVAL"
  | "DONE"
  | "BLOCKED"
  | "FAILED"
  | "CANCELED";

export type WorkOrderParentSyncPlan =
  | { action: "NOOP"; reason: "no-linked-parent" }
  | { action: "ALREADY_SYNCED"; reason: "parent-already-done" }
  | { action: "SYNC"; reason: "accepted-work-order"; fromStatus: ParentTaskStatus }
  | {
      action: "CONFLICT";
      reason:
        | "linked-parent-not-found"
        | "project-mismatch"
        | "protected-parent-state"
        | "unknown-parent-state";
      message: string;
    };

const ACTIONABLE_PARENT_STATUSES = new Set<ParentTaskStatus>([
  "INBOX",
  // `READY` is a live schema status (tasks.status) and is what reopenWorkOrder
  // resets a canceled parent task to. Omitting it made every such WorkOrder
  // permanently unacceptable with "unsupported state READY".
  "READY",
  "ASSIGNED",
  "IN_PROGRESS",
  "REVIEW",
  "NEEDS_APPROVAL",
]);

const PROTECTED_PARENT_STATUSES = new Set<ParentTaskStatus>([
  "BLOCKED",
  "FAILED",
  "CANCELED",
]);

export function planAcceptedWorkOrderParentSync(input: {
  legacyTaskId?: string | null;
  workOrderProjectId?: string | null;
  parentTask?: {
    status: string;
    projectId?: string | null;
  } | null;
}): WorkOrderParentSyncPlan {
  if (!input.legacyTaskId) {
    return { action: "NOOP", reason: "no-linked-parent" };
  }

  if (!input.parentTask) {
    return {
      action: "CONFLICT",
      reason: "linked-parent-not-found",
      message: "Linked parent task no longer exists.",
    };
  }

  if (
    (input.workOrderProjectId ?? null) !==
    (input.parentTask.projectId ?? null)
  ) {
    return {
      action: "CONFLICT",
      reason: "project-mismatch",
      message: "Linked parent task belongs to a different project.",
    };
  }

  const status = input.parentTask.status as ParentTaskStatus;
  if (status === "DONE") {
    return { action: "ALREADY_SYNCED", reason: "parent-already-done" };
  }

  if (ACTIONABLE_PARENT_STATUSES.has(status)) {
    return {
      action: "SYNC",
      reason: "accepted-work-order",
      fromStatus: status,
    };
  }

  if (PROTECTED_PARENT_STATUSES.has(status)) {
    return {
      action: "CONFLICT",
      reason: "protected-parent-state",
      message: `Linked parent task is ${status}; resolve that state before accepting the WorkOrder.`,
    };
  }

  return {
    action: "CONFLICT",
    reason: "unknown-parent-state",
    message: `Linked parent task has unsupported state ${input.parentTask.status}.`,
  };
}
