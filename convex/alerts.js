"use strict";
/**
 * Alerts — Convex Functions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ignore = exports.resolve = exports.acknowledge = exports.create = exports.listByAgent = exports.listBySeverity = exports.listOpen = void 0;
const values_1 = require("convex/values");
const server_1 = require("./_generated/server");
// ============================================================================
// QUERIES
// ============================================================================
exports.listOpen = (0, server_1.query)({
    args: { limit: values_1.v.optional(values_1.v.number()) },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("alerts")
            .withIndex("by_status", (q) => q.eq("status", "OPEN"))
            .order("desc")
            .take(args.limit ?? 50);
    },
});
exports.listBySeverity = (0, server_1.query)({
    args: {
        severity: values_1.v.string(),
        limit: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("alerts")
            .withIndex("by_severity", (q) => q.eq("severity", args.severity))
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
            .query("alerts")
            .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
            .order("desc")
            .take(args.limit ?? 50);
    },
});
// ============================================================================
// MUTATIONS
// ============================================================================
exports.create = (0, server_1.mutation)({
    args: {
        severity: values_1.v.string(),
        type: values_1.v.string(),
        title: values_1.v.string(),
        description: values_1.v.string(),
        agentId: values_1.v.optional(values_1.v.id("agents")),
        taskId: values_1.v.optional(values_1.v.id("tasks")),
        runId: values_1.v.optional(values_1.v.id("runs")),
        metadata: values_1.v.optional(values_1.v.any()),
    },
    handler: async (ctx, args) => {
        const alertId = await ctx.db.insert("alerts", {
            severity: args.severity,
            type: args.type,
            title: args.title,
            description: args.description,
            agentId: args.agentId,
            taskId: args.taskId,
            runId: args.runId,
            status: "OPEN",
            metadata: args.metadata,
        });
        return { alert: await ctx.db.get(alertId) };
    },
});
exports.acknowledge = (0, server_1.mutation)({
    args: {
        alertId: values_1.v.id("alerts"),
        acknowledgedBy: values_1.v.string(),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.alertId, {
            status: "ACKNOWLEDGED",
            acknowledgedBy: args.acknowledgedBy,
            acknowledgedAt: Date.now(),
        });
        return { alert: await ctx.db.get(args.alertId) };
    },
});
exports.resolve = (0, server_1.mutation)({
    args: {
        alertId: values_1.v.id("alerts"),
        resolutionNote: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.alertId, {
            status: "RESOLVED",
            resolvedAt: Date.now(),
            resolutionNote: args.resolutionNote,
        });
        return { alert: await ctx.db.get(args.alertId) };
    },
});
exports.ignore = (0, server_1.mutation)({
    args: {
        alertId: values_1.v.id("alerts"),
        reason: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        await ctx.db.patch(args.alertId, {
            status: "IGNORED",
            resolutionNote: args.reason,
        });
        return { alert: await ctx.db.get(args.alertId) };
    },
});
