/**
 * One definition of "pending approvals", used by every surface that claims to
 * show that number.
 *
 * ## Why this exists
 *
 * Twelve UI surfaces independently called `approvals.listPending` with six
 * different `limit` values and rendered `result.length`. The header bell (limit
 * 10) and the sidebar badge (limit 100) are rendered by the same shell at the
 * same time, so at 34 pending the operator sees "10" and "34" simultaneously.
 * A thirteenth source (`analytics.schematicOverview`) counted `PENDING` only.
 *
 * ## The definition
 *
 * - Table: `approvals` — the agent action/tool-call gate.
 *   `approvalDecisions` (WorkOrder governance) is a **different queue** with its
 *   own counter, and `approvalRecords` is an audit mirror that must never be
 *   counted. Conflating them is why the `control-approvals` badge and the page
 *   it opens disagreed.
 * - Statuses: `PENDING` ∪ `ESCALATED`. `escalateOverdue` promotes rows
 *   `PENDING -> ESCALATED` on a timer, so a `PENDING`-only count makes the
 *   badge fall as work becomes *more* urgent.
 * - Scope: one workspace. The count is exact — two index range reads bounded by
 *   the number of currently-undecided approvals in that workspace, which is a
 *   human work queue and structurally small (and actively drained by
 *   `expireStale`). No truncation, so no `take(N).length` lying about a total.
 */

import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type ApprovalCtx = QueryCtx | MutationCtx;

/** Statuses that still require a human decision. */
export const PENDING_APPROVAL_STATUSES = ["PENDING", "ESCALATED"] as const;

export interface PendingApprovalCounts {
  /** Exact total awaiting a decision. Never truncated. */
  total: number;
  pending: number;
  escalated: number;
}

export function sortByCreationDesc<T extends { _creationTime: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b._creationTime - a._creationTime);
}

async function readByStatus(
  ctx: ApprovalCtx,
  projectId: Id<"projects"> | null,
  status: (typeof PENDING_APPROVAL_STATUSES)[number],
): Promise<Doc<"approvals">[]> {
  if (projectId) {
    return await ctx.db
      .query("approvals")
      .withIndex("by_project_status", (q) =>
        q.eq("projectId", projectId).eq("status", status),
      )
      .collect();
  }
  return await ctx.db
    .query("approvals")
    .withIndex("by_status", (q) => q.eq("status", status))
    .collect();
}

/** Exact counts for the pending approval queue. */
export async function countPendingApprovals(
  ctx: ApprovalCtx,
  projectId: Id<"projects"> | null,
): Promise<PendingApprovalCounts> {
  const [pending, escalated] = await Promise.all([
    readByStatus(ctx, projectId, "PENDING"),
    readByStatus(ctx, projectId, "ESCALATED"),
  ]);
  return {
    total: pending.length + escalated.length,
    pending: pending.length,
    escalated: escalated.length,
  };
}

/**
 * Exact counts plus a bounded page of rows.
 *
 * Callers render `counts.total` for any number they present as a total, and
 * `items` for a list. That separation is the whole point: a list may be capped,
 * a count may not.
 */
export async function pendingApprovalSummary(
  ctx: ApprovalCtx,
  projectId: Id<"projects"> | null,
  limit: number,
): Promise<PendingApprovalCounts & { items: Doc<"approvals">[] }> {
  const [pending, escalated] = await Promise.all([
    readByStatus(ctx, projectId, "PENDING"),
    readByStatus(ctx, projectId, "ESCALATED"),
  ]);
  return {
    total: pending.length + escalated.length,
    pending: pending.length,
    escalated: escalated.length,
    items: sortByCreationDesc([...pending, ...escalated]).slice(0, limit),
  };
}
