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

/**
 * Display order for the attention queue.
 *
 * The queue used to be built strictly by category — every approval, then every
 * blocked task, then needs-approval, then failed, then alerts — and then
 * `slice(0, 12)`. With 12 pending approvals, every open alert and every failed
 * task was silently cut from the list, with no indication anything had been
 * dropped. The queue is meant to be read during an incident, which is exactly
 * when there are many approvals AND alerts, so the highest-severity rows were
 * the ones most reliably hidden.
 *
 * Error-tone rows (RED approvals, failed tasks, open alerts) now sort ahead of
 * warning-tone rows, ties broken by the original category order so the result is
 * stable. Whatever still does not fit is *reported*, never silently dropped.
 */
const TONE_RANK: Record<AttentionBadgeTone, number> = {
  error: 0,
  warning: 1,
  neutral: 2,
  success: 3,
};

export interface AttentionQueue {
  /** The rows to render, severity-ordered and capped at `limit`. */
  items: AttentionItem[];
  /** Every row that qualified, before the cap. */
  totalCount: number;
  /** How many qualifying rows are not shown. Render this; never hide it. */
  hiddenCount: number;
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

/** Severity-ordered queue plus an explicit account of anything not shown. */
export function buildAttentionQueue(input: AttentionQueueInput): AttentionQueue {
  const all = collectAttentionItems(input);
  const limit = input.limit ?? 12;
  const ranked = all
    .map((item, index) => ({ item, index }))
    .sort((a, b) => TONE_RANK[a.item.badgeTone] - TONE_RANK[b.item.badgeTone] || a.index - b.index)
    .map((entry) => entry.item);
  return {
    items: ranked.slice(0, limit),
    totalCount: ranked.length,
    hiddenCount: Math.max(0, ranked.length - limit),
  };
}

/** Back-compatible shape: the capped, severity-ordered rows only. */
export function buildAttentionItems(input: AttentionQueueInput): AttentionItem[] {
  return buildAttentionQueue(input).items;
}

function collectAttentionItems(input: AttentionQueueInput): AttentionItem[] {
  const {
    approvals,
    blockedTasks,
    needsApprovalTasks,
    failedTasks,
    alerts,
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

  return items;
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
