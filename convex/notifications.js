/**
 * Notifications — @mentions, task assignments, approval events.
 * Delivered to agents via heartbeat (pendingNotifications).
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
export const create = mutation({
    args: {
        agentId: v.id("agents"),
        type: v.union(v.literal("MENTION"), v.literal("TASK_ASSIGNED"), v.literal("TASK_TRANSITION"), v.literal("APPROVAL_REQUESTED"), v.literal("APPROVAL_DECIDED"), v.literal("SYSTEM")),
        title: v.string(),
        body: v.optional(v.string()),
        taskId: v.optional(v.id("tasks")),
        messageId: v.optional(v.id("messages")),
        approvalId: v.optional(v.id("approvals")),
        fromAgentId: v.optional(v.id("agents")),
        fromUserId: v.optional(v.string()),
        metadata: v.optional(v.any()),
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
export const createForAgents = mutation({
    args: {
        agentIds: v.array(v.id("agents")),
        type: v.union(v.literal("MENTION"), v.literal("TASK_ASSIGNED"), v.literal("TASK_TRANSITION"), v.literal("APPROVAL_REQUESTED"), v.literal("APPROVAL_DECIDED"), v.literal("SYSTEM")),
        title: v.string(),
        body: v.optional(v.string()),
        taskId: v.optional(v.id("tasks")),
        messageId: v.optional(v.id("messages")),
        approvalId: v.optional(v.id("approvals")),
        fromAgentId: v.optional(v.id("agents")),
        fromUserId: v.optional(v.string()),
        metadata: v.optional(v.any()),
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
export const listByAgent = query({
    args: {
        agentId: v.id("agents"),
        unreadOnly: v.optional(v.boolean()),
        limit: v.optional(v.number()),
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
export const markRead = mutation({
    args: {
        notificationId: v.id("notifications"),
        agentId: v.id("agents"),
    },
    handler: async (ctx, args) => {
        const n = await ctx.db.get(args.notificationId);
        if (!n || n.agentId !== args.agentId)
            return { success: false };
        await ctx.db.patch(args.notificationId, { readAt: Date.now() });
        return { success: true };
    },
});
export const markAllReadForAgent = mutation({
    args: { agentId: v.id("agents") },
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
export const listPendingForAgent = query({
    args: { agentId: v.id("agents"), limit: v.optional(v.number()) },
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
export const listRecent = query({
    args: { limit: v.optional(v.number()) },
    handler: async (ctx, args) => {
        const limit = args.limit ?? 50;
        return await ctx.db.query("notifications").order("desc").take(limit);
    },
});
