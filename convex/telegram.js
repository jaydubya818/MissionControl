"use strict";
/**
 * Telegram Integration — Convex Functions
 *
 * Functions for sending notifications and CEO briefs to Telegram.
 * Called by crons and mutations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyLoopDetected = exports.notifyBudgetExceeded = exports.notifyApprovalPending = exports.prepareDailyCEOBrief = exports.formatCEOBrief = exports.generateCEOBriefData = void 0;
const values_1 = require("convex/values");
const server_1 = require("./_generated/server");
const api_1 = require("./_generated/api");
// ============================================================================
// INTERNAL QUERIES
// ============================================================================
/**
 * Generate CEO brief data for all projects.
 */
exports.generateCEOBriefData = (0, server_1.internalQuery)({
    args: {},
    handler: async (ctx) => {
        const projects = await ctx.db.query("projects").collect();
        const briefs = [];
        for (const project of projects) {
            const stats = await ctx.db
                .query("tasks")
                .withIndex("by_project", (q) => q.eq("projectId", project._id))
                .collect();
            const agents = await ctx.db
                .query("agents")
                .withIndex("by_project", (q) => q.eq("projectId", project._id))
                .collect();
            const pendingApprovals = await ctx.db
                .query("approvals")
                .withIndex("by_project_status", (q) => q.eq("projectId", project._id).eq("status", "PENDING"))
                .collect();
            const byStatus = (status) => stats.filter(t => t.status === status).length;
            const burnRateToday = agents.reduce((sum, a) => sum + a.spendToday, 0);
            // Get top 3 next actions (inbox + assigned + review, sorted by priority)
            const nextActions = stats
                .filter(t => ["INBOX", "ASSIGNED", "REVIEW"].includes(t.status))
                .sort((a, b) => a.priority - b.priority)
                .slice(0, 3);
            briefs.push({
                project: {
                    id: project._id,
                    name: project.name,
                    slug: project.slug,
                },
                tasks: {
                    completed: byStatus("DONE"),
                    inProgress: byStatus("IN_PROGRESS"),
                    blocked: byStatus("BLOCKED"),
                    review: byStatus("REVIEW"),
                    needsApproval: byStatus("NEEDS_APPROVAL"),
                },
                approvals: {
                    pending: pendingApprovals.length,
                },
                burnRate: {
                    today: burnRateToday,
                },
                nextActions: nextActions.map(t => ({
                    id: t._id,
                    title: t.title,
                    status: t.status,
                    priority: t.priority,
                })),
            });
        }
        return { briefs, generatedAt: Date.now() };
    },
});
/**
 * Format CEO brief as Telegram message.
 */
exports.formatCEOBrief = (0, server_1.internalQuery)({
    args: { briefData: values_1.v.any() },
    handler: async (_ctx, args) => {
        const { briefs, generatedAt } = args.briefData;
        const date = new Date(generatedAt).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
        });
        let message = `📊 **Daily CEO Brief** — ${date}\n\n`;
        for (const brief of briefs) {
            message += `**${brief.project.name}**\n`;
            message += `✅ Completed: ${brief.tasks.completed}\n`;
            message += `🔄 In Progress: ${brief.tasks.inProgress}\n`;
            message += `🚫 Blocked: ${brief.tasks.blocked}\n`;
            message += `👀 Review: ${brief.tasks.review}\n`;
            message += `⏳ Needs Approval: ${brief.tasks.needsApproval}\n`;
            message += `📋 Approvals Pending: ${brief.approvals.pending}\n`;
            message += `💰 Burn Rate: $${brief.burnRate.today.toFixed(2)}\n\n`;
            if (brief.nextActions.length > 0) {
                message += `🎯 **Top ${brief.nextActions.length} Next Actions:**\n`;
                for (let i = 0; i < brief.nextActions.length; i++) {
                    const action = brief.nextActions[i];
                    const priorityEmoji = action.priority === 1 ? "🔴" : action.priority === 2 ? "🟠" : "🔵";
                    message += `${i + 1}. ${priorityEmoji} ${action.title} (${action.status})\n`;
                }
            }
            message += `\n---\n\n`;
        }
        return message;
    },
});
// ============================================================================
// INTERNAL MUTATIONS (Called by Crons or External Service)
// ============================================================================
/**
 * Send daily CEO brief to Telegram.
 * Called by cron job.
 *
 * Note: This mutation prepares the data. The actual Telegram send
 * should be done by the telegram-bot service polling this data or
 * via HTTP action if Convex supports it.
 */
exports.prepareDailyCEOBrief = (0, server_1.internalMutation)({
    args: {},
    handler: async (ctx) => {
        const briefData = await ctx.runQuery(api_1.internal.telegram.generateCEOBriefData);
        const message = await ctx.runQuery(api_1.internal.telegram.formatCEOBrief, { briefData });
        // Store in activities for audit
        await ctx.db.insert("activities", {
            actorType: "SYSTEM",
            action: "CEO_BRIEF_GENERATED",
            description: "Daily CEO brief generated",
            targetType: "REPORT",
            metadata: { briefData, generatedAt: Date.now() },
        });
        // Store message for telegram-bot to poll
        await ctx.db.insert("notifications", {
            agentId: null, // System notification
            type: "SYSTEM",
            title: "Daily CEO Brief",
            body: message,
            metadata: { isCEOBrief: true, generatedAt: Date.now() },
        });
        return { success: true, message };
    },
});
/**
 * Send notification for approval request.
 */
exports.notifyApprovalPending = (0, server_1.internalMutation)({
    args: {
        approvalId: values_1.v.id("approvals"),
    },
    handler: async (ctx, args) => {
        const approval = await ctx.db.get(args.approvalId);
        if (!approval)
            return { success: false };
        const agent = await ctx.db.get(approval.requestorAgentId);
        const message = (`⏳ **Approval Required**\n\n` +
            `${approval.actionSummary}\n` +
            `Requested by: ${agent?.name || "Unknown"}\n` +
            `Risk: ${approval.riskLevel}\n` +
            `ID: ${args.approvalId.slice(-6)}\n\n` +
            `/approve ${args.approvalId.slice(-6)} or /deny ${args.approvalId.slice(-6)} <reason>`);
        // Store notification for polling
        await ctx.db.insert("notifications", {
            agentId: null, // System notification
            type: "APPROVAL_REQUESTED",
            title: "Approval Required",
            body: message,
            approvalId: args.approvalId,
            metadata: { isTelegramNotification: true },
        });
        return { success: true };
    },
});
/**
 * Send notification for budget exceeded.
 */
exports.notifyBudgetExceeded = (0, server_1.internalMutation)({
    args: {
        agentId: values_1.v.id("agents"),
        taskId: values_1.v.optional(values_1.v.id("tasks")),
        spendToday: values_1.v.number(),
        budgetDaily: values_1.v.number(),
    },
    handler: async (ctx, args) => {
        const agent = await ctx.db.get(args.agentId);
        const task = args.taskId ? await ctx.db.get(args.taskId) : null;
        const message = (`💰 **Budget Exceeded**\n\n` +
            `Agent: ${agent?.name || "Unknown"}\n` +
            `Spend: $${args.spendToday.toFixed(2)} / $${args.budgetDaily.toFixed(2)}\n` +
            (task ? `Task: ${task.title}\n` : "") +
            `\nAgent has been paused. Use /resume_squad to resume.`);
        // Store notification
        await ctx.db.insert("notifications", {
            agentId: args.agentId,
            type: "SYSTEM",
            title: "Budget Exceeded",
            body: message,
            taskId: args.taskId,
            metadata: { isTelegramNotification: true },
        });
        return { success: true };
    },
});
/**
 * Send notification for loop detected.
 */
exports.notifyLoopDetected = (0, server_1.internalMutation)({
    args: {
        taskId: values_1.v.id("tasks"),
        loopType: values_1.v.string(),
        count: values_1.v.number(),
        threshold: values_1.v.number(),
    },
    handler: async (ctx, args) => {
        const task = await ctx.db.get(args.taskId);
        const message = (`🔄 **Loop Detected**\n\n` +
            `Task: ${task?.title || "Unknown"}\n` +
            `Type: ${args.loopType}\n` +
            `Count: ${args.count} (threshold: ${args.threshold})\n` +
            `\nTask has been blocked. Review and unblock manually.`);
        // Store notification
        await ctx.db.insert("notifications", {
            agentId: null,
            type: "SYSTEM",
            title: "Loop Detected",
            body: message,
            taskId: args.taskId,
            metadata: { isTelegramNotification: true },
        });
        return { success: true };
    },
});
