/**
 * Comments — Task comments with @mentions
 */

import { v } from "convex/values";
import { authedMutation } from "./lib/authedFunctions";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { resolveAgentRef } from "./lib/agentResolver";

// ============================================================================
// QUERIES
// ============================================================================

export const listByTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("messages")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .filter((q) => q.eq(q.field("type"), "COMMENT"))
      .order("desc")
      .collect();

    // Get authors
    const agentIds = [...new Set(comments.map((c) => c.authorAgentId).filter(Boolean))];
    const agents = await Promise.all(
      agentIds.map((id) => id && ctx.db.get(id as Id<"agents">))
    );
    const agentMap = new Map(agents.filter((a): a is NonNullable<typeof a> => a !== null).map((a) => [a._id, a]));

    return comments.map((comment) => ({
      ...comment,
      author: comment.authorAgentId ? agentMap.get(comment.authorAgentId) : null,
    }));
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Post a task comment.
 *
 * `authorUserId` used to be a caller-supplied string, and the only caller sent
 * the literal `"operator"`. That string was written to the comment AND used as
 * `activities.actorId` — i.e. the audit trail's author was chosen by whoever
 * made the request. Anyone holding the deployment URL could post a comment
 * attributed to any name they liked.
 *
 * The human author is now the authenticated operator, resolved server-side.
 * Actor identity is never an argument.
 */
export const post = authedMutation({
  args: {
    taskId: v.id("tasks"),
    content: v.string(),
    authorType: v.union(v.literal("AGENT"), v.literal("HUMAN"), v.literal("SYSTEM")),
    authorAgentId: v.optional(v.id("agents")),
    mentions: v.optional(v.array(v.id("agents"))),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const authorUserId: string | undefined =
      args.authorType === "AGENT" ? undefined : ctx.access.actorId;
    // Check idempotency
    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query("messages")
        .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", args.idempotencyKey))
        .first();

      if (existing) {
        return { commentId: existing._id, created: false };
      }
    }

    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Task not found");
    }

    // Extract @mentions from content
    const mentionRegex = /@(\w+)/g;
    const mentionedNames = [...args.content.matchAll(mentionRegex)].map((m) => m[1]);
    
    // Get mentioned agents
    const mentionedAgents = [];
    for (const name of mentionedNames) {
      const agent = await ctx.db
        .query("agents")
        .filter((q: any) => q.eq(q.field("name"), name))
        .first();
      if (agent) {
        mentionedAgents.push(agent._id);
      }
    }

    // Create comment
    const authorRef = args.authorAgentId
      ? await resolveAgentRef(
          { db: ctx.db as any },
          { agentId: args.authorAgentId, createIfMissing: true }
        )
      : null;
    const commentId = await ctx.db.insert("messages", {
      tenantId: task.tenantId,
      projectId: task.projectId,
      idempotencyKey: args.idempotencyKey || `comment-${args.taskId}-${Date.now()}`,
      taskId: args.taskId,
      type: "COMMENT",
      authorType: args.authorType,
      authorAgentId: args.authorAgentId,
      authorInstanceId: authorRef?.instanceId,
      authorUserId,
      content: args.content,
    });

    // Create notifications for mentioned agents
    for (const agentId of mentionedAgents) {
      await ctx.db.insert("notifications", {
        projectId: task.projectId,
        agentId,
        type: "MENTION",
        title: "You were mentioned",
        body: `${args.authorAgentId ? "Agent" : "User"} mentioned you in task: ${task.title}`,
        taskId: args.taskId,
        messageId: commentId,
      });
    }

    // Create activity
    await ctx.db.insert("activities", {
      projectId: task.projectId,
      actorType: args.authorType,
      actorId: authorUserId || args.authorAgentId,
      action: "COMMENT_POSTED",
      description: `Posted comment on task: ${task.title}`,
      taskId: args.taskId,
      agentId: args.authorAgentId,
      metadata: {
        commentId,
        mentions: mentionedAgents.length,
      },
    });

    return { commentId, created: true };
  },
});

export const edit = mutation({
  args: {
    commentId: v.id("messages"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment) {
      throw new Error("Comment not found");
    }

    if (comment.type !== "COMMENT") {
      throw new Error("Not a comment");
    }

    await ctx.db.patch(args.commentId, {
      content: args.content,
    });

    return { success: true };
  },
});

export const remove = mutation({
  args: {
    commentId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    const comment = await ctx.db.get(args.commentId);
    if (!comment) {
      throw new Error("Comment not found");
    }

    if (comment.type !== "COMMENT") {
      throw new Error("Not a comment");
    }

    await ctx.db.delete(args.commentId);

    return { success: true };
  },
});
