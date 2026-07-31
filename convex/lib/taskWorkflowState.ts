export type CompatibleTaskStatus =
  | "INBOX"
  | "READY"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "REVIEW"
  | "NEEDS_APPROVAL"
  | "BLOCKED"
  | "FAILED"
  | "DONE"
  | "CANCELED";

export type BlockerType =
  | "TASK"
  | "EXTERNAL"
  | "POLICY"
  | "APPROVAL"
  | "CAPACITY"
  | "UNKNOWN";

export type BlockerResolution = "RESOLVED" | "WAIVED" | "REPLACED";

export const MIN_WORKFLOW_REASON_LENGTH = 10;

export function canonicalTaskStatus(status: CompatibleTaskStatus): CompatibleTaskStatus {
  return status === "ASSIGNED" ? "READY" : status;
}

export function isReadyCompatibleStatus(status: string): boolean {
  return status === "READY" || status === "ASSIGNED";
}

export function validateWorkflowTransitionContext(args: {
  fromStatus: CompatibleTaskStatus;
  toStatus: CompatibleTaskStatus;
  reason?: string;
  blocker?: { type: BlockerType; reason: string };
  blockerResolution?: { resolution: BlockerResolution; reason: string };
}): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = [];
  const meaningful = (value?: string) =>
    (value?.trim().length ?? 0) >= MIN_WORKFLOW_REASON_LENGTH;

  if (args.toStatus === "BLOCKED") {
    if (!args.blocker) {
      errors.push({ field: "blocker", message: "Structured blocker context is required" });
    } else if (!meaningful(args.blocker.reason)) {
      errors.push({
        field: "blocker.reason",
        message: `Blocker reason must be at least ${MIN_WORKFLOW_REASON_LENGTH} characters`,
      });
    }
  }

  if (args.fromStatus === "REVIEW" && args.toStatus === "IN_PROGRESS" && !meaningful(args.reason)) {
    errors.push({
      field: "reason",
      message: `Review rejection reason must be at least ${MIN_WORKFLOW_REASON_LENGTH} characters`,
    });
  }

  if (
    args.fromStatus === "BLOCKED" &&
    ["READY", "ASSIGNED", "IN_PROGRESS", "NEEDS_APPROVAL"].includes(args.toStatus)
  ) {
    if (!args.blockerResolution) {
      errors.push({ field: "blockerResolution", message: "Blocker resolution is required" });
    } else if (!meaningful(args.blockerResolution.reason)) {
      errors.push({
        field: "blockerResolution.reason",
        message: `Resolution reason must be at least ${MIN_WORKFLOW_REASON_LENGTH} characters`,
      });
    }
  }

  return errors;
}

type CompatibilityTask = {
  status: CompatibleTaskStatus;
  assigneeIds: unknown[];
  workOrderId?: unknown;
  review?: unknown;
  blocker?: unknown;
};

export function buildWorkflowStateCompatibilityReport(tasks: CompatibilityTask[]) {
  const rawStatusCounts: Record<string, number> = {};
  const canonicalStatusCounts: Record<string, number> = {};

  for (const task of tasks) {
    rawStatusCounts[task.status] = (rawStatusCounts[task.status] ?? 0) + 1;
    const canonical = canonicalTaskStatus(task.status);
    canonicalStatusCounts[canonical] = (canonicalStatusCounts[canonical] ?? 0) + 1;
  }

  const legacyAssigned = tasks.filter((task) => task.status === "ASSIGNED");
  return {
    totalTasks: tasks.length,
    rawStatusCounts,
    canonicalStatusCounts,
    legacyAssignedCount: legacyAssigned.length,
    eligibleLegacyAssignedCount: legacyAssigned.filter(
      (task) => task.assigneeIds.length > 0 && !!task.workOrderId
    ).length,
    excludedLegacyAssigned: {
      missingAssignee: legacyAssigned.filter((task) => task.assigneeIds.length === 0).length,
      missingWorkOrder: legacyAssigned.filter((task) => !task.workOrderId).length,
    },
    reviewMissingStructuredCount: tasks.filter(
      (task) => task.status === "REVIEW" && !task.review
    ).length,
    blockedMissingStructuredCount: tasks.filter(
      (task) => task.status === "BLOCKED" && !task.blocker
    ).length,
  };
}
