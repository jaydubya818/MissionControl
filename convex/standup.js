"use strict";
/**
 * Daily Standup Report — aggregates tasks, agents, approvals for human review.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDaily = exports.save = exports.generate = void 0;
const values_1 = require("convex/values");
const server_1 = require("./_generated/server");
/** Generate standup report (query — no side effects). */
exports.generate = (0, server_1.query)({
    args: {
        projectId: values_1.v.optional(values_1.v.id("projects")),
        at: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        const now = args.at ?? Date.now();
        // Get data scoped by project if provided
        let agents;
        let tasks;
        let pendingApprovals;
        if (args.projectId) {
            agents = await ctx.db
                .query("agents")
                .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
                .collect();
            tasks = await ctx.db
                .query("tasks")
                .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
                .collect();
            pendingApprovals = await ctx.db
                .query("approvals")
                .withIndex("by_project_status", (q) => q.eq("projectId", args.projectId).eq("status", "PENDING"))
                .collect();
        }
        else {
            agents = await ctx.db.query("agents").collect();
            tasks = await ctx.db.query("tasks").collect();
            pendingApprovals = await ctx.db
                .query("approvals")
                .withIndex("by_status", (q) => q.eq("status", "PENDING"))
                .collect();
        }
        const byStatus = (status) => tasks.filter((t) => t.status === status);
        const activeAgents = agents.filter((a) => a.status === "ACTIVE");
        const pausedAgents = agents.filter((a) => a.status === "PAUSED");
        // Calculate burn rate (sum of today's spend across agents)
        const burnRateToday = agents.reduce((sum, a) => sum + a.spendToday, 0);
        const report = {
            projectId: args.projectId,
            generatedAt: now,
            date: new Date(now).toISOString().slice(0, 10),
            agents: {
                total: agents.length,
                active: activeAgents.length,
                paused: pausedAgents.length,
                list: agents.map((a) => ({
                    id: a._id,
                    name: a.name,
                    role: a.role,
                    status: a.status,
                    spendToday: a.spendToday,
                    budgetDaily: a.budgetDaily,
                })),
            },
            tasks: {
                inbox: byStatus("INBOX").length,
                assigned: byStatus("ASSIGNED").length,
                inProgress: byStatus("IN_PROGRESS").length,
                review: byStatus("REVIEW").length,
                needsApproval: byStatus("NEEDS_APPROVAL").length,
                blocked: byStatus("BLOCKED").length,
                done: byStatus("DONE").length,
                canceled: byStatus("CANCELED").length,
                total: tasks.length,
            },
            approvals: {
                pending: pendingApprovals.length,
                items: pendingApprovals.slice(0, 20).map((a) => ({
                    id: a._id,
                    actionSummary: a.actionSummary,
                    riskLevel: a.riskLevel,
                    requestorAgentId: a.requestorAgentId,
                    expiresAt: a.expiresAt,
                })),
            },
            burnRate: {
                today: burnRateToday,
            },
        };
        return report;
    },
});
/** Store standup report (mutation — for cron to save daily). */
exports.save = (0, server_1.mutation)({
    args: {
        report: values_1.v.any(),
        savedAt: values_1.v.number(),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert("activities", {
            actorType: "SYSTEM",
            action: "STANDUP_REPORT",
            description: `Daily standup: ${args.report.agents.active} active agents, ${args.report.tasks.total} tasks, ${args.report.approvals.pending} pending approvals`,
            targetType: "REPORT",
            metadata: { report: args.report, savedAt: args.savedAt },
        });
        return { success: true };
    },
});
/** Run daily standup (mutation — for cron). Builds report and saves to activities. */
exports.runDaily = (0, server_1.mutation)({
    args: {},
    handler: async (ctx) => {
        const now = Date.now();
        const agents = await ctx.db.query("agents").collect();
        const tasks = await ctx.db.query("tasks").collect();
        const pendingApprovals = await ctx.db
            .query("approvals")
            .withIndex("by_status", (q) => q.eq("status", "PENDING"))
            .collect();
        const byStatus = (status) => tasks.filter((t) => t.status === status);
        const activeAgents = agents.filter((a) => a.status === "ACTIVE");
        const report = {
            generatedAt: now,
            date: new Date(now).toISOString().slice(0, 10),
            agents: { total: agents.length, active: activeAgents.length },
            tasks: {
                inbox: byStatus("INBOX").length,
                assigned: byStatus("ASSIGNED").length,
                inProgress: byStatus("IN_PROGRESS").length,
                review: byStatus("REVIEW").length,
                needsApproval: byStatus("NEEDS_APPROVAL").length,
                blocked: byStatus("BLOCKED").length,
                done: byStatus("DONE").length,
                total: tasks.length,
            },
            approvals: { pending: pendingApprovals.length },
        };
        await ctx.db.insert("activities", {
            actorType: "SYSTEM",
            action: "STANDUP_REPORT",
            description: `Daily standup: ${report.agents.active} active agents, ${report.tasks.total} tasks, ${report.approvals.pending} pending approvals`,
            targetType: "REPORT",
            metadata: { report, savedAt: now },
        });
        return { success: true, report };
    },
});
