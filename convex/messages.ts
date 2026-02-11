/**
 * Messages — Convex Functions
 *
 * Task thread messages with types and artifacts.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { sanitizeMessageContent } from "./lib/sanitize";

// ============================================================================
// QUERIES
// ============================================================================

export const listByTask = query({
  args: { 
    taskId: v.id("tasks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("asc")
      .take(args.limit ?? 100);
  },
});

export const get = query({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.messageId);
  },
});

/** Recent messages across all tasks (for Live Feed). */
export const listRecent = query({
  args: { 
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
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
async function postMessageInternal(
  ctx: MutationCtx,
  args: {
    taskId: Id<"tasks">;
    authorType: string;
    authorAgentId?: Id<"agents">;
    authorUserId?: string;
    type: string;
    content: string;
    artifacts?: Array<{
      name: string;
      type: string;
      url?: string;
      content?: string;
    }>;
    mentions?: string[];
    replyToId?: Id<"messages">;
    redactedFields?: string[];
    idempotencyKey?: string;
    metadata?: any;
  }
) {
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

  // Sanitize content (OpenClaw: untrusted DM/webhook input)
  const content = sanitizeMessageContent(args.content);

  // Create message
  const messageId = await ctx.db.insert("messages", {
    projectId: task.projectId,
    taskId: args.taskId,
    authorType: args.authorType as any,
    authorAgentId: args.authorAgentId,
    authorUserId: args.authorUserId,
    type: args.type as any,
    content,
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
    actorType: args.authorType as any,
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
    if (!name) continue;
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

export const post = mutation({
  args: {
    taskId: v.id("tasks"),
    authorType: v.string(),
    authorAgentId: v.optional(v.id("agents")),
    authorUserId: v.optional(v.string()),
    type: v.string(),
    content: v.string(),
    artifacts: v.optional(v.array(v.object({
      name: v.string(),
      type: v.string(),
      url: v.optional(v.string()),
      content: v.optional(v.string()),
    }))),
    mentions: v.optional(v.array(v.string())),
    replyToId: v.optional(v.id("messages")),
    redactedFields: v.optional(v.array(v.string())),
    idempotencyKey: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await postMessageInternal(ctx, args);
  },
});

export const postWorkPlan = mutation({
  args: {
    taskId: v.id("tasks"),
    agentId: v.id("agents"),
    bullets: v.array(v.string()),
    estimatedCost: v.optional(v.number()),
    estimatedDuration: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
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

export const postProgress = mutation({
  args: {
    taskId: v.id("tasks"),
    agentId: v.id("agents"),
    content: v.string(),
    percentComplete: v.optional(v.number()),
    artifacts: v.optional(v.array(v.object({
      name: v.string(),
      type: v.string(),
      url: v.optional(v.string()),
      content: v.optional(v.string()),
    }))),
    idempotencyKey: v.optional(v.string()),
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

export const postReview = mutation({
  args: {
    taskId: v.id("tasks"),
    authorType: v.string(),
    authorAgentId: v.optional(v.id("agents")),
    authorUserId: v.optional(v.string()),
    reviewType: v.union(
      v.literal("PRAISE"),
      v.literal("REFUTE"),
      v.literal("CHANGESET"),
      v.literal("APPROVE"),
      v.literal("REQUEST_CHANGES"), // Legacy support
      v.literal("REJECT") // Legacy support
    ),
    comments: v.string(),
    changeset: v.optional(v.array(v.object({
      file: v.string(),
      change: v.string(),
      lineNumber: v.optional(v.number()),
    }))),
    checklist: v.optional(v.array(v.object({
      label: v.string(),
      checked: v.boolean(),
      note: v.optional(v.string()),
    }))),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Task not found");
    }
    
    const reviewTypeEmoji = {
      PRAISE: "🌟",
      REFUTE: "🤔",
      CHANGESET: "📝",
      APPROVE: "✅",
      REQUEST_CHANGES: "🔄",
      REJECT: "❌",
    };
    
    let content = `## Review: ${reviewTypeEmoji[args.reviewType as keyof typeof reviewTypeEmoji] || "📝"} ${args.reviewType}\n\n${args.comments}`;
    
    // Add changeset if provided
    if (args.changeset && args.changeset.length > 0) {
      content += `\n\n### Requested Changes\n`;
      for (const change of args.changeset) {
        content += `\n📝 **${change.file}**`;
        if (change.lineNumber) {
          content += ` (line ${change.lineNumber})`;
        }
        content += `\n   ${change.change}\n`;
      }
    }
    
    // Add checklist if provided
    if (args.checklist) {
      content += "\n\n### Checklist\n";
      for (const item of args.checklist) {
        content += `\n- [${item.checked ? "x" : " "}] ${item.label}`;
        if (item.note) content += ` — ${item.note}`;
      }
    }

    const messageId = await postMessageInternal(ctx, {
      taskId: args.taskId,
      authorType: args.authorType,
      authorAgentId: args.authorAgentId,
      authorUserId: args.authorUserId,
      type: "REVIEW",
      content,
      idempotencyKey: args.idempotencyKey,
      metadata: {
        reviewType: args.reviewType,
        changeset: args.changeset,
      },
    });
    
    // Handle review type actions
    if (args.reviewType === "CHANGESET" || args.reviewType === "REQUEST_CHANGES") {
      // Move task back to IN_PROGRESS for revisions
      await ctx.db.patch(args.taskId, {
        status: "IN_PROGRESS",
        reviewCycles: task.reviewCycles + 1,
      });
      
      // Create transition record
      await ctx.db.insert("taskTransitions", {
        projectId: task.projectId,
        idempotencyKey: args.idempotencyKey || `review-changeset-${args.taskId}-${Date.now()}`,
        taskId: args.taskId,
        fromStatus: task.status,
        toStatus: "IN_PROGRESS",
        actorType: args.authorType as any,
        actorAgentId: args.authorAgentId,
        actorUserId: args.authorUserId,
        reason: "Changes requested in review",
      });
    } else if (args.reviewType === "APPROVE" && args.authorAgentId) {
      // Create approval record for REVIEW → DONE
      await ctx.db.insert("approvals", {
        projectId: task.projectId,
        taskId: args.taskId,
        requestorAgentId: args.authorAgentId,
        actionType: "COMPLETE_TASK",
        actionSummary: "Complete task after review approval",
        riskLevel: "YELLOW",
        status: "PENDING",
        estimatedCost: 0,
        justification: `Reviewer approved deliverable`,
        expiresAt: Date.now() + 1440 * 60 * 1000, // 24 hours
      });
    } else if (args.reviewType === "REFUTE") {
      // Increment review cycles for loop detection
      await ctx.db.patch(args.taskId, {
        reviewCycles: task.reviewCycles + 1,
      });
    } else if (args.reviewType === "PRAISE") {
      // Just record the praise, no state change
      // Could increment a "praise count" metric if desired
    }
    
    return messageId;
  },
});
