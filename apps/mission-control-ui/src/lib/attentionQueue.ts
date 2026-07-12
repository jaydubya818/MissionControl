import type { Doc, Id } from "../../../../convex/_generated/dataModel";

export type AttentionBadgeTone = "warning" | "error" | "neutral" | "success";

export interface AttentionItem {
  id: string;
  title: string;
  detail?: string;
  badgeLabel: string;
  badgeTone: AttentionBadgeTone;
  onOpen?: () => void;
  onApprove?: () => void | Promise<void>;
  onUnblock?: () => void | Promise<void>;
}

export interface AttentionQueueInput {
  approvals: Doc<"approvals">[];
  blockedTasks: Doc<"tasks">[];
  needsApprovalTasks: Doc<"tasks">[];
  failedTasks: Doc<"tasks">[];
  alerts: Doc<"alerts">[];
  limit?: number;
  openApproval: (approvalId: Id<"approvals">) => void;
  openTask: (taskId: Id<"tasks">) => void;
  openApprovalsModal?: () => void;
  openAlertRules?: () => void;
  approveApproval?: (approvalId: Id<"approvals">) => void | Promise<void>;
  unblockTask?: (taskId: Id<"tasks">) => void | Promise<void>;
}

/** Merge duplicate approval rows (same task or identical title). */
function groupApprovals(approvals: Doc<"approvals">[]): Array<{
  key: string;
  approval: Doc<"approvals">;
  count: number;
}> {
  const groups = new Map<string, Doc<"approvals">[]>();
  for (const approval of approvals) {
    const key = approval.taskId
      ? `task:${approval.taskId}`
      : `summary:${approval.actionSummary.trim().toLowerCase()}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(approval);
    groups.set(key, bucket);
  }
  return [...groups.entries()].map(([key, bucket]) => ({
    key,
    approval: bucket[0],
    count: bucket.length,
  }));
}

export function buildAttentionItems(input: AttentionQueueInput): AttentionItem[] {
  const {
    approvals,
    blockedTasks,
    needsApprovalTasks,
    failedTasks,
    alerts,
    limit = 12,
    openApproval,
    openTask,
    openApprovalsModal,
    openAlertRules,
    approveApproval,
    unblockTask,
  } = input;

  const items: AttentionItem[] = [];

  for (const { approval, count } of groupApprovals(approvals)) {
    const detailBase =
      approval.justification?.trim() ||
      "Operator approval required before execution continues.";
    items.push({
      id: `approval-${approval._id}`,
      title: approval.actionSummary,
      detail: count > 1 ? `${detailBase} (${count} pending)` : detailBase,
      badgeLabel: approval.riskLevel === "RED" ? "Red approval" : "Approval",
      badgeTone: approval.riskLevel === "RED" ? "error" : "warning",
      onOpen: openApprovalsModal ?? (() => openApproval(approval._id)),
      onApprove: approveApproval ? () => approveApproval(approval._id) : undefined,
    });
  }

  for (const task of blockedTasks) {
    items.push({
      id: `blocked-${task._id}`,
      title: task.title,
      detail: task.blockedReason || "Execution is stalled until a dependency is removed.",
      badgeLabel: "Blocked",
      badgeTone: "warning",
      onOpen: () => openTask(task._id),
      onUnblock: unblockTask ? () => unblockTask(task._id) : undefined,
    });
  }

  for (const task of needsApprovalTasks) {
    items.push({
      id: `needs-approval-${task._id}`,
      title: task.title,
      detail: task.description || "Task is waiting on a human decision.",
      badgeLabel: "Needs approval",
      badgeTone: "warning",
      onOpen: () => openTask(task._id),
    });
  }

  for (const task of failedTasks) {
    items.push({
      id: `failed-${task._id}`,
      title: task.title,
      detail: task.blockedReason || "Execution failed — review runs and retry or unblock.",
      badgeLabel: "Failed",
      badgeTone: "error",
      onOpen: () => openTask(task._id),
    });
  }

  for (const alert of alerts) {
    items.push({
      id: `alert-${alert._id}`,
      title: alert.title,
      detail: alert.description || undefined,
      badgeLabel: "Alert",
      badgeTone: "error",
      onOpen: openAlertRules,
    });
  }

  return items.slice(0, limit);
}

export interface ExceptionCounts {
  approvals: number;
  blocked: number;
  failed: number;
  alerts: number;
}

export function exceptionCounts(input: {
  approvals: Doc<"approvals">[];
  blockedTasks: Doc<"tasks">[];
  failedTasks: Doc<"tasks">[];
  alerts: Doc<"alerts">[];
}): ExceptionCounts {
  return {
    approvals: input.approvals.length,
    blocked: input.blockedTasks.length,
    failed: input.failedTasks.length,
    alerts: input.alerts.length,
  };
}
