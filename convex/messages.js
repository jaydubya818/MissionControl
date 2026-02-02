"use strict";
/**
 * Messages — Convex Functions
 *
 * Task thread messages with types and artifacts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.postReview = exports.postProgress = exports.postWorkPlan = exports.post = exports.listRecent = exports.get = exports.listByTask = void 0;
const values_1 = require("convex/values");
const server_1 = require("./_generated/server");
// ============================================================================
// QUERIES
// ============================================================================
exports.listByTask = (0, server_1.query)({
    args: {
        taskId: values_1.v.id("tasks"),
        limit: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("messages")
            .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
            .order("asc")
            .take(args.limit ?? 100);
    },
});
exports.get = (0, server_1.query)({
    args: { messageId: values_1.v.id("messages") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.messageId);
    },
});
/** Recent messages across all tasks (for Live Feed). */
exports.listRecent = (0, server_1.query)({
    args: {
        projectId: values_1.v.optional(values_1.v.id("projects")),
        limit: values_1.v.optional(values_1.v.number()),
    },
    handler: async (ctx, args) => {
        if (args.projectId) {
            return await ctx.db
                .query("messages")
                .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
                .order("desc")
                .take(args.limit ?? 50);
        }
        return await ctx.db
            .query("messages")
            .order("desc")
            .take(args.limit ?? 50);
    },
});
// ============================================================================
// MUTATIONS
// ============================================================================
// Internal function for posting messages (shared by multiple mutations)
async function postMessageInternal(ctx, args) {
    // Check idempotency
    if (args.idempotencyKey) {
        const existing = await ctx.db
            .query("messages")
            .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
            .first();
        if (existing) {
            return { message: existing, created: false };
        }
    }
    // Validate task exists
    const task = await ctx.db.get(args.taskId);
    if (!task) {
        throw new Error("Task not found");
    }
    // Create message
    const messageId = await ctx.db.insert("messages", {
        projectId: task.projectId,
        taskId: args.taskId,
        authorType: args.authorType,
        authorAgentId: args.authorAgentId,
        authorUserId: args.authorUserId,
        type: args.type,
        content: args.content,
        artifacts: args.artifacts,
        mentions: args.mentions,
        replyToId: args.replyToId,
        redactedFields: args.redactedFields,
        idempotencyKey: args.idempotencyKey,
        metadata: args.metadata,
    });
    // Log activity
    const authorName = args.authorUserId ?? args.authorAgentId?.toString() ?? "Unknown";
    await ctx.db.insert("activities", {
        projectId: task.projectId,
        actorType: args.authorType,
        actorId: authorName,
        action: "MESSAGE_POSTED",
        description: `${args.type} message posted on task "${task.title}"`,
        targetType: "MESSAGE",
        targetId: messageId,
        taskId: args.taskId,
        agentId: args.authorAgentId,
    });
    // Notifications: @mentions — resolve mention names to agents and create MENTION notifications
    for (const mention of args.mentions ?? []) {
        const name = String(mention).replace(/^@/, "").trim();
        if (!name)
            continue;
        const agent = await ctx.db
            .query("agents")
            .withIndex("by_name", (q) => q.eq("name", name))
            .first();
        if (agent && agent._id !== args.authorAgentId) {
            await ctx.db.insert("notifications", {
                projectId: task.projectId,
                agentId: agent._id,
                type: "MENTION",
                title: `@${name} mentioned you`,
                body: args.content.slice(0, 200),
                taskId: args.taskId,
                messageId,
                fromAgentId: args.authorAgentId,
                fromUserId: args.authorUserId,
            });
        }
    }
    const message = await ctx.db.get(messageId);
    return { message, created: true };
}
exports.post = (0, server_1.mutation)({
    args: {
        taskId: values_1.v.id("tasks"),
        authorType: values_1.v.string(),
        authorAgentId: values_1.v.optional(values_1.v.id("agents")),
        authorUserId: values_1.v.optional(values_1.v.string()),
        type: values_1.v.string(),
        content: values_1.v.string(),
        artifacts: values_1.v.optional(values_1.v.array(values_1.v.object({
            name: values_1.v.string(),
            type: values_1.v.string(),
            url: values_1.v.optional(values_1.v.string()),
            content: values_1.v.optional(values_1.v.string()),
        }))),
        mentions: values_1.v.optional(values_1.v.array(values_1.v.string())),
        replyToId: values_1.v.optional(values_1.v.id("messages")),
        redactedFields: values_1.v.optional(values_1.v.array(values_1.v.string())),
        idempotencyKey: values_1.v.optional(values_1.v.string()),
        metadata: values_1.v.optional(values_1.v.any()),
    },
    handler: async (ctx, args) => {
        return await postMessageInternal(ctx, args);
    },
});
exports.postWorkPlan = (0, server_1.mutation)({
    args: {
        taskId: values_1.v.id("tasks"),
        agentId: values_1.v.id("agents"),
        bullets: values_1.v.array(values_1.v.string()),
        estimatedCost: values_1.v.optional(values_1.v.number()),
        estimatedDuration: values_1.v.optional(values_1.v.string()),
        idempotencyKey: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        const content = [
            "## Work Plan",
            "",
            ...args.bullets.map((b, i) => `${i + 1}. ${b}`),
        ];
        if (args.estimatedCost) {
            content.push("", `**Estimated Cost:** $${args.estimatedCost.toFixed(2)}`);
        }
        if (args.estimatedDuration) {
            content.push(`**Estimated Duration:** ${args.estimatedDuration}`);
        }
        return await postMessageInternal(ctx, {
            taskId: args.taskId,
            authorType: "AGENT",
            authorAgentId: args.agentId,
            type: "WORK_PLAN",
            content: content.join("\n"),
            idempotencyKey: args.idempotencyKey,
        });
    },
});
exports.postProgress = (0, server_1.mutation)({
    args: {
        taskId: values_1.v.id("tasks"),
        agentId: values_1.v.id("agents"),
        content: values_1.v.string(),
        percentComplete: values_1.v.optional(values_1.v.number()),
        artifacts: values_1.v.optional(values_1.v.array(values_1.v.object({
            name: values_1.v.string(),
            type: values_1.v.string(),
            url: values_1.v.optional(values_1.v.string()),
            content: values_1.v.optional(values_1.v.string()),
        }))),
        idempotencyKey: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        let content = args.content;
        if (args.percentComplete !== undefined) {
            content = `**Progress: ${args.percentComplete}%**\n\n${content}`;
        }
        return await postMessageInternal(ctx, {
            taskId: args.taskId,
            authorType: "AGENT",
            authorAgentId: args.agentId,
            type: "PROGRESS",
            content,
            artifacts: args.artifacts,
            idempotencyKey: args.idempotencyKey,
        });
    },
});
exports.postReview = (0, server_1.mutation)({
    args: {
        taskId: values_1.v.id("tasks"),
        authorType: values_1.v.string(),
        authorAgentId: values_1.v.optional(values_1.v.id("agents")),
        authorUserId: values_1.v.optional(values_1.v.string()),
        decision: values_1.v.string(), // "APPROVE", "REQUEST_CHANGES", "REJECT"
        comments: values_1.v.string(),
        checklist: values_1.v.optional(values_1.v.array(values_1.v.object({
            label: values_1.v.string(),
            checked: values_1.v.boolean(),
            note: values_1.v.optional(values_1.v.string()),
        }))),
        idempotencyKey: values_1.v.optional(values_1.v.string()),
    },
    handler: async (ctx, args) => {
        const decisionEmoji = {
            APPROVE: "✅",
            REQUEST_CHANGES: "🔄",
            REJECT: "❌",
        };
        let content = `## Review: ${decisionEmoji[args.decision] || "📝"} ${args.decision}\n\n${args.comments}`;
        if (args.checklist) {
            content += "\n\n### Checklist\n";
            for (const item of args.checklist) {
                content += `\n- [${item.checked ? "x" : " "}] ${item.label}`;
                if (item.note)
                    content += ` — ${item.note}`;
            }
        }
        return await postMessageInternal(ctx, {
            taskId: args.taskId,
            authorType: args.authorType,
            authorAgentId: args.authorAgentId,
            authorUserId: args.authorUserId,
            type: "REVIEW",
            content,
            idempotencyKey: args.idempotencyKey,
        });
    },
});
