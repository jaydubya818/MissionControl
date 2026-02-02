"use strict";
/**
 * Notifications — @mentions, task assignments, approval events.
 * Delivered to agents via heartbeat (pendingNotifications).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.listRecent = exports.listPendingForAgent = exports.markAllReadForAgent = exports.markRead = exports.listByAgent = exports.createForAgents = exports.create = void 0;
const values_1 = require("convex/values");
const server_1 = require("./_generated/server");
exports.create = (0, server_1.mutation)({
    args: {
        agentId: values_1.v.id("agents"),
        type: values_1.v.union(values_1.v.literal("MENTION"), values_1.v.literal("TASK_ASSIGNED"), values_1.v.literal("TASK_TRANSITION"), values_1.v.literal("APPROVAL_REQUESTED"), values_1.v.literal("APPROVAL_DECIDED"), values_1.v.literal("SYSTEM")),
        title: values_1.v.string(),
        body: values_1.v.optional(values_1.v.string()),
        taskId: values_1.v.optional(values_1.v.id("tasks")),
        messageId: values_1.v.optional(values_1.v.id("messages")),
        approvalId: values_1.v.optional(values_1.v.id("approvals")),
        fromAgentId: values_1.v.optional(values_1.v.id("agents")),
        fromUserId: values_1.v.optional(values_1.v.string()),
        metadata: values_1.v.optional(values_1.v.any()),
    },
    handler: async (ctx, args) => {
        const id = await ctx.db.insert("notifications", {
            agentId: args.agentId,
            type: args.type,
            title: args.title,
            body: args.body,
            taskId: args.taskId,
            messageId: args.messageId,
            approvalId: args.approvalId,
            fromAgentId: args.fromAgentId,
            fromUserId: args.fromUserId,
            metadata: args.metadata,
        });
        return id;
    },
});
/** Create notifications for multiple agents (e.g. assignees or @mentions). */
exports.createForAgents = (0, server_1.mutation)({
    args: {
        agentIds: values_1.v.array(values_1.v.id("agents")),
        type: values_1.v.union(values_1.v.literal("MENTION"), values_1.v.literal("TASK_ASSIGNED"), values_1.v.literal("TASK_TRANSITION"), values_1.v.literal("APPROVAL_REQUESTED"), values_1.v.literal("APPROVAL_DECIDED"), values_1.v.literal("SYSTEM")),
        title: values_1.v.string(),
        body: values_1.v.optional(values_1.v.string()),
        taskId: values_1.v.optional(values_1.v.id("tasks")),
        messageId: values_1.v.optional(values_1.v.id("messages")),
        approvalId: values_1.v.optional(values_1.v.id("approvals")),
        fromAgentId: values_1.v.optional(values_1.v.id("agents")),
        fromUserId: values_1.v.optional(values_1.v.string()),
        metadata: values_1.v.optional(values_1.v.any()),
    },
    handler: async (ctx, args) => {
        const ids = [];
        for (const agentId of args.agentIds) {
            const id = await ctx.db.insert("notifications", {
                agentId,
                type: args.type,
                title: args.title,
                body: args.body,
                taskId: args.taskId,
                messageId: args.messageId,
                approvalId: args.approvalId,
                fromAgentId: args.fromAgentId,
                fromUserId: args.fromUserId,
                metadata: args.metadata,
            });
            ids.push(id);
        }
        return ids;
    },
});
exports.listByAgent = (0, server_1.query)({
    args: {
        agentId: values_1.v.id("agents"),
        unreadOnly: values_1.v.optional(values_1.v.boolean()),
        limit: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 50;
        const list = await ctx.db
            .query("notifications")
            .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
            .order("desc")
            .take(limit * 2);
        const filtered = args.unreadOnly ? list.filter((n) => n.readAt === undefined) : list;
        return filtered.slice(0, limit);
    },
});
exports.markRead = (0, server_1.mutation)({
    args: {
        notificationId: values_1.v.id("notifications"),
        agentId: values_1.v.id("agents"),
    },
    handler: async (ctx, args) => {
        const n = await ctx.db.get(args.notificationId);
        if (!n || n.agentId !== args.agentId)
            return { success: false };
        await ctx.db.patch(args.notificationId, { readAt: Date.now() });
        return { success: true };
    },
});
exports.markAllReadForAgent = (0, server_1.mutation)({
    args: { agentId: values_1.v.id("agents") },
    handler: async (ctx, args) => {
        const list = await ctx.db
            .query("notifications")
            .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
            .collect();
        const unread = list.filter((n) => n.readAt === undefined);
        const now = Date.now();
        for (const n of unread) {
            await ctx.db.patch(n._id, { readAt: now });
        }
        return { marked: unread.length };
    },
});
/** Pending (unread) notifications for an agent — used by heartbeat. */
exports.listPendingForAgent = (0, server_1.query)({
    args: { agentId: values_1.v.id("agents"), limit: values_1.v.optional(values_1.v.number()) },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 30;
        const list = await ctx.db
            .query("notifications")
            .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
            .order("desc")
            .take(limit * 2);
        return list.filter((n) => n.readAt === undefined).slice(0, limit);
    },
});
/** Recent notifications across all agents (admin/operator view). */
exports.listRecent = (0, server_1.query)({
    args: { limit: values_1.v.optional(values_1.v.number()) },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 50;
        return await ctx.db.query("notifications").order("desc").take(limit);
    },
});
