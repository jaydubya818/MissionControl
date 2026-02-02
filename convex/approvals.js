"use strict";
/**
 * Approvals — Convex Functions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.expireStale = exports.cancel = exports.deny = exports.approve = exports.request = exports.get = exports.listByRequestor = exports.listByTask = exports.listPending = void 0;
const values_1 = require("convex/values");
const server_1 = require("./_generated/server");
// ============================================================================
// QUERIES
// ============================================================================
exports.listPending = (0, server_1.query)({
    args: {
        projectId: values_1.v.optional(values_1.v.id("projects")),
        limit: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        if (args.projectId) {
            return await ctx.db
                .query("approvals")
                .withIndex("by_project_status", (q) => q.eq("projectId", args.projectId).eq("status", "PENDING"))
                .order("desc")
                .take(args.limit ?? 50);
        }
        return await ctx.db
            .query("approvals")
            .withIndex("by_status", (q) => q.eq("status", "PENDING"))
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
            .query("approvals")
            .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
            .order("desc")
            .take(args.limit ?? 50);
    },
});
exports.listByRequestor = (0, server_1.query)({
    args: {
        agentId: values_1.v.id("agents"),
        limit: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("approvals")
            .withIndex("by_requestor", (q) => q.eq("requestorAgentId", args.agentId))
            .order("desc")
            .take(args.limit ?? 50);
    },
});
exports.get = (0, server_1.query)({
    args: { approvalId: values_1.v.id("approvals") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.approvalId);
    },
});
// ============================================================================
// MUTATIONS
// ============================================================================
exports.request = (0, server_1.mutation)({
    args: {
        projectId: values_1.v.optional(values_1.v.id("projects")),
        taskId: values_1.v.optional(values_1.v.id("tasks")),
        toolCallId: values_1.v.optional(values_1.v.id("toolCalls")),
        requestorAgentId: values_1.v.id("agents"),
        actionType: values_1.v.string(),
        actionSummary: values_1.v.string(),
        riskLevel: values_1.v.string(),
        actionPayload: values_1.v.optional(values_1.v.any()),
        estimatedCost: values_1.v.optional(values_1.v.number()),
        rollbackPlan: values_1.v.optional(values_1.v.string()),
        justification: values_1.v.string(),
        expiresInMinutes: values_1.v.optional(values_1.v.number()),
        idempotencyKey: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        // Check idempotency
        if (args.idempotencyKey) {
            const existing = await ctx.db
                .query("approvals")
                .filter((q) => q.eq(q.field("idempotencyKey"), args.idempotencyKey))
                .first();
            if (existing) {
                return { approval: existing, created: false };
            }
        }
        // Get projectId from task if not provided
        let projectId = args.projectId;
        if (!projectId && args.taskId) {
            const task = await ctx.db.get(args.taskId);
            projectId = task?.projectId;
        }
        const expiresAt = Date.now() + (args.expiresInMinutes ?? 60) * 60 * 1000;
        const approvalId = await ctx.db.insert("approvals", {
            projectId,
            idempotencyKey: args.idempotencyKey,
            taskId: args.taskId,
            toolCallId: args.toolCallId,
            requestorAgentId: args.requestorAgentId,
            actionType: args.actionType,
            actionSummary: args.actionSummary,
            riskLevel: args.riskLevel,
            actionPayload: args.actionPayload,
            estimatedCost: args.estimatedCost,
            rollbackPlan: args.rollbackPlan,
            justification: args.justification,
            status: "PENDING",
            expiresAt,
        });
        // Log activity
        const agent = await ctx.db.get(args.requestorAgentId);
        await ctx.db.insert("activities", {
            projectId,
            actorType: "AGENT",
            actorId: args.requestorAgentId.toString(),
            action: "APPROVAL_REQUESTED",
            description: `${agent?.name || "Agent"} requested approval for: ${args.actionSummary}`,
            targetType: "APPROVAL",
            targetId: approvalId,
            taskId: args.taskId,
            agentId: args.requestorAgentId,
        });
        return { approval: await ctx.db.get(approvalId), created: true };
    },
});
exports.approve = (0, server_1.mutation)({
    args: {
        approvalId: values_1.v.id("approvals"),
        decidedByAgentId: values_1.v.optional(values_1.v.id("agents")),
        decidedByUserId: values_1.v.optional(values_1.v.string()),
        reason: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        const approval = await ctx.db.get(args.approvalId);
        if (!approval) {
            return { success: false, error: "Approval not found" };
        }
        if (approval.status !== "PENDING") {
            return { success: false, error: `Approval already ${approval.status}` };
        }
        if (Date.now() > approval.expiresAt) {
            await ctx.db.patch(args.approvalId, { status: "EXPIRED" });
            return { success: false, error: "Approval has expired" };
        }
        await ctx.db.patch(args.approvalId, {
            status: "APPROVED",
            decidedByAgentId: args.decidedByAgentId,
            decidedByUserId: args.decidedByUserId,
            decidedAt: Date.now(),
            decisionReason: args.reason,
        });
        // Log activity
        await ctx.db.insert("activities", {
            projectId: approval.projectId,
            actorType: args.decidedByUserId ? "HUMAN" : "AGENT",
            actorId: args.decidedByUserId ?? args.decidedByAgentId?.toString(),
            action: "APPROVAL_APPROVED",
            description: `Approval granted: ${approval.actionSummary}`,
            targetType: "APPROVAL",
            targetId: args.approvalId,
            taskId: approval.taskId,
            agentId: approval.requestorAgentId,
        });
        return { success: true, approval: await ctx.db.get(args.approvalId) };
    },
});
exports.deny = (0, server_1.mutation)({
    args: {
        approvalId: values_1.v.id("approvals"),
        decidedByAgentId: values_1.v.optional(values_1.v.id("agents")),
        decidedByUserId: values_1.v.optional(values_1.v.string()),
        reason: values_1.v.string(),
    },
    handler: async (ctx, args) => {
        const approval = await ctx.db.get(args.approvalId);
        if (!approval) {
            return { success: false, error: "Approval not found" };
        }
        if (approval.status !== "PENDING") {
            return { success: false, error: `Approval already ${approval.status}` };
        }
        await ctx.db.patch(args.approvalId, {
            status: "DENIED",
            decidedByAgentId: args.decidedByAgentId,
            decidedByUserId: args.decidedByUserId,
            decidedAt: Date.now(),
            decisionReason: args.reason,
        });
        // Log activity
        await ctx.db.insert("activities", {
            projectId: approval.projectId,
            actorType: args.decidedByUserId ? "HUMAN" : "AGENT",
            actorId: args.decidedByUserId ?? args.decidedByAgentId?.toString(),
            action: "APPROVAL_DENIED",
            description: `Approval denied: ${approval.actionSummary} — ${args.reason}`,
            targetType: "APPROVAL",
            targetId: args.approvalId,
            taskId: approval.taskId,
            agentId: approval.requestorAgentId,
        });
        return { success: true, approval: await ctx.db.get(args.approvalId) };
    },
});
exports.cancel = (0, server_1.mutation)({
    args: {
        approvalId: values_1.v.id("approvals"),
        reason: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        const approval = await ctx.db.get(args.approvalId);
        if (!approval) {
            return { success: false, error: "Approval not found" };
        }
        if (approval.status !== "PENDING") {
            return { success: false, error: `Approval already ${approval.status}` };
        }
        await ctx.db.patch(args.approvalId, {
            status: "CANCELED",
            decisionReason: args.reason,
        });
        return { success: true, approval: await ctx.db.get(args.approvalId) };
    },
});
exports.expireStale = (0, server_1.mutation)({
    args: {},
    handler: async (ctx) => {
        const now = Date.now();
        const pendingApprovals = await ctx.db
            .query("approvals")
            .withIndex("by_status", (q) => q.eq("status", "PENDING"))
            .collect();
        let expired = 0;
        for (const approval of pendingApprovals) {
            if (now > approval.expiresAt) {
                await ctx.db.patch(approval._id, { status: "EXPIRED" });
                expired++;
            }
        }
        return { expired };
    },
});
