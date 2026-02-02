"use strict";
/**
 * Task transition event append-only.
 * Task status MUST be updated only via tasks.transitionTaskStatus.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.transitions_append = void 0;
exports.appendTransition = appendTransition;
const server_1 = require("./_generated/server");
const values_1 = require("convex/values");
async function appendTransition(ctx, args) {
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
exports.transitions_append = (0, server_1.mutation)({
    args: {
        taskId: values_1.v.id("tasks"),
        fromStatus: values_1.v.string(),
        toStatus: values_1.v.string(),
        actorType: values_1.v.union(values_1.v.literal("AGENT"), values_1.v.literal("HUMAN"), values_1.v.literal("SYSTEM")),
        actorAgentId: values_1.v.optional(values_1.v.id("agents")),
        actorUserId: values_1.v.optional(values_1.v.string()),
        reason: values_1.v.optional(values_1.v.string()),
        artifactsSnapshot: values_1.v.optional(values_1.v.any()),
        idempotencyKey: values_1.v.string(),
    },
    handler: async (ctx, args) => {
        return await appendTransition(ctx, args);
    },
});
