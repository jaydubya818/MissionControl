"use strict";
/**
 * Activities — Convex Functions
 *
 * Audit log queries.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.listByAction = exports.listByAgent = exports.listByTask = exports.listRecent = void 0;
const values_1 = require("convex/values");
const server_1 = require("./_generated/server");
exports.listRecent = (0, server_1.query)({
    args: {
        projectId: values_1.v.optional(values_1.v.id("projects")),
        limit: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        if (args.projectId) {
            return await ctx.db
                .query("activities")
                .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
                .order("desc")
                .take(args.limit ?? 50);
        }
        return await ctx.db
            .query("activities")
            .order("desc")
            .take(args.limit ?? 50);
    },
});
exports.listByTask = (0, server_1.query)({
    args: {
        taskId: values_1.v.id("tasks"),
        limit: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("activities")
            .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
            .order("desc")
            .take(args.limit ?? 50);
    },
});
exports.listByAgent = (0, server_1.query)({
    args: {
        agentId: values_1.v.id("agents"),
        limit: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("activities")
            .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
            .order("desc")
            .take(args.limit ?? 50);
    },
});
exports.listByAction = (0, server_1.query)({
    args: {
        action: values_1.v.string(),
        limit: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("activities")
            .withIndex("by_action", (q) => q.eq("action", args.action))
            .order("desc")
            .take(args.limit ?? 50);
    },
});
