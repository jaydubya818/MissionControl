/**
 * Task transition event append-only.
 * Task status MUST be updated only via tasks.transitionTaskStatus.
 */
import { mutation } from "./_generated/server";
import { v } from "convex/values";
export async function appendTransition(ctx, args) {
    const existing = await ctx.db
        .query("taskTransitions")
        .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
        .unique();
    if (existing) {
        return existing._id;
    }
    return await ctx.db.insert("taskTransitions", {
        taskId: args.taskId,
        fromStatus: args.fromStatus,
        toStatus: args.toStatus,
        actorType: args.actorType,
        actorAgentId: args.actorAgentId,
        actorUserId: args.actorUserId,
        reason: args.reason,
        artifactsSnapshot: args.artifactsSnapshot,
        idempotencyKey: args.idempotencyKey,
    });
}
export const transitions_append = mutation({
    args: {
        taskId: v.id("tasks"),
        fromStatus: v.string(),
        toStatus: v.string(),
        actorType: v.union(v.literal("AGENT"), v.literal("HUMAN"), v.literal("SYSTEM")),
        actorAgentId: v.optional(v.id("agents")),
        actorUserId: v.optional(v.string()),
        reason: v.optional(v.string()),
        artifactsSnapshot: v.optional(v.any()),
        idempotencyKey: v.string(),
    },
    handler: async (ctx, args) => {
        return await appendTransition(ctx, args);
    },
});
