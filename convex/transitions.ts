/**
 * Task transition event append-only. Task status MUST be updated only via tasks.transitionTaskStatus.
 */

import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export async function appendTransition(
  ctx: MutationCtx,
  args: {
    taskId: Id<"tasks">;
    fromStatus: string;
    toStatus: string;
    actor: "agent" | "human" | "system";
    actorId?: string;
    reason?: string;
    artifactsProvided?: string[];
    idempotencyKey: string;
  }
): Promise<Id<"taskTransitions">> => {
  const existing = await ctx.db
    .query("taskTransitions")
    .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", args.idempotencyKey))
    .unique();
  if (existing) {
    return existing._id;
  }
  return await ctx.db.insert("taskTransitions", {
    taskId: args.taskId,
    fromStatus: args.fromStatus,
    toStatus: args.toStatus,
    actor: args.actor,
    actorId: args.actorId,
    reason: args.reason,
    artifactsProvided: args.artifactsProvided,
    idempotencyKey: args.idempotencyKey,
  });
}
