"use strict";
/**
 * Thread Subscriptions — agents subscribed to task threads.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSubscribedTaskIds = exports.listByTask = exports.listByAgent = exports.unsubscribe = exports.subscribe = void 0;
const values_1 = require("convex/values");
const server_1 = require("./_generated/server");
exports.subscribe = (0, server_1.mutation)({
    args: {
        agentId: values_1.v.id("agents"),
        taskId: values_1.v.id("tasks"),
        metadata: values_1.v.optional(values_1.v.any()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("threadSubscriptions")
            .withIndex("by_agent_task", (q) => q.eq("agentId", args.agentId).eq("taskId", args.taskId))
            .first();
        if (existing)
            return { subscriptionId: existing._id, created: false };
        const now = Date.now();
        const id = await ctx.db.insert("threadSubscriptions", {
            agentId: args.agentId,
            taskId: args.taskId,
            subscribedAt: now,
            metadata: args.metadata,
        });
        return { subscriptionId: id, created: true };
    },
});
exports.unsubscribe = (0, server_1.mutation)({
    args: {
        agentId: values_1.v.id("agents"),
        taskId: values_1.v.id("tasks"),
    },
    handler: async (ctx, args) => {
        const sub = await ctx.db
            .query("threadSubscriptions")
            .withIndex("by_agent_task", (q) => q.eq("agentId", args.agentId).eq("taskId", args.taskId))
            .first();
        if (!sub)
            return { removed: false };
        await ctx.db.delete(sub._id);
        return { removed: true };
    },
});
exports.listByAgent = (0, server_1.query)({
    args: { agentId: values_1.v.id("agents"), limit: values_1.v.optional(values_1.v.number()) },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 50;
        return await ctx.db
            .query("threadSubscriptions")
            .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
            .order("desc")
            .take(limit);
    },
});
exports.listByTask = (0, server_1.query)({
    args: { taskId: values_1.v.id("tasks"), limit: values_1.v.optional(values_1.v.number()) },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 50;
        return await ctx.db
            .query("threadSubscriptions")
            .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
            .order("desc")
            .take(limit);
    },
});
/** Subscribed task IDs for an agent — used by heartbeat / "threads with activity". */
exports.getSubscribedTaskIds = (0, server_1.query)({
    args: { agentId: values_1.v.id("agents") },
    handler: async (ctx, args) => {
        const subs = await ctx.db
            .query("threadSubscriptions")
            .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
            .collect();
        return subs.map((s) => s.taskId);
    },
});
