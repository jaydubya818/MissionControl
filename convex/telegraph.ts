/**
 * Telegraph Communications Functions
 *
 * Async messaging system for agent-org communications.
 * Supports internal (Convex-native) and external (Telegram) channels.
 */

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

const channelValidator = v.union(v.literal("INTERNAL"), v.literal("TELEGRAM"));
const senderTypeValidator = v.union(
  v.literal("AGENT"),
  v.literal("HUMAN"),
  v.literal("SYSTEM")
);
const messageStatusValidator = v.union(
  v.literal("DRAFT"),
  v.literal("SENT"),
  v.literal("DELIVERED"),
  v.literal("READ"),
  v.literal("FAILED")
);

// ============================================================================
// THREAD QUERIES
// ============================================================================

/**
 * List threads for a project, ordered by last activity.
 */
export const listThreads = query({
  args: {
    projectId: v.optional(v.id("projects")),
    channel: v.optional(channelValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    let threads;
    if (args.projectId) {
      threads = await ctx.db
        .query("telegraphThreads")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .order("desc")
        .take(limit);
    } else {
      threads = await ctx.db
        .query("telegraphThreads")
        .order("desc")
        .take(limit);
    }

    if (args.channel) {
      threads = threads.filter((t) => t.channel === args.channel);
    }

    return threads;
  },
});

/**
 * Get a thread with its messages.
 */
export const getThread = query({
  args: {
    threadId: v.id("telegraphThreads"),
    messageLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return null;

    const messages = await ctx.db
      .query("telegraphMessages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .take(args.messageLimit ?? 100);

    return { ...thread, messages };
  },
});

/**
 * Get threads linked to a specific task.
 */
export const getThreadsByTask = query({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("telegraphThreads")
      .withIndex("by_linked_task", (q) => q.eq("linkedTaskId", args.taskId))
      .collect();
  },
});

// ============================================================================
// THREAD MUTATIONS
// ============================================================================

/**
 * Create a new telegraph thread.
 */
export const createThread = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    title: v.string(),
    participants: v.array(v.string()),
    channel: channelValidator,
    externalThreadRef: v.optional(v.string()),
    linkedTaskId: v.optional(v.id("tasks")),
    linkedApprovalId: v.optional(v.id("approvals")),
    linkedIncidentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("telegraphThreads", {
      projectId: args.projectId,
      title: args.title,
      participants: args.participants,
      channel: args.channel,
      externalThreadRef: args.externalThreadRef,
      linkedTaskId: args.linkedTaskId,
      linkedApprovalId: args.linkedApprovalId,
      linkedIncidentId: args.linkedIncidentId,
      lastMessageAt: undefined,
      messageCount: 0,
    });
  },
});

/**
 * Link a thread to a task, approval, or incident.
 */
export const linkToEntity = mutation({
  args: {
    threadId: v.id("telegraphThreads"),
    linkedTaskId: v.optional(v.id("tasks")),
    linkedApprovalId: v.optional(v.id("approvals")),
    linkedIncidentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) throw new Error("Thread not found");

    const updates: Record<string, any> = {};
    if (args.linkedTaskId !== undefined) updates.linkedTaskId = args.linkedTaskId;
    if (args.linkedApprovalId !== undefined) updates.linkedApprovalId = args.linkedApprovalId;
    if (args.linkedIncidentId !== undefined) updates.linkedIncidentId = args.linkedIncidentId;

    await ctx.db.patch(args.threadId, updates);
  },
});

// ============================================================================
// MESSAGE MUTATIONS
// ============================================================================

/**
 * Send a message to a thread.
 * Enforces "final replies only" safety rule for TELEGRAM channel.
 */
export const sendMessage = mutation({
  args: {
    threadId: v.id("telegraphThreads"),
    senderId: v.string(),
    senderType: senderTypeValidator,
    content: v.string(),
    channel: channelValidator,
    replyToId: v.optional(v.id("telegraphMessages")),
    externalRef: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    // SAFETY: Reject streaming/partial content for external channels
    if (args.channel === "TELEGRAM") {
      if (!args.content || args.content.trim().length === 0) {
        throw new Error("SAFETY: Cannot send empty message to external channel");
      }
      if (args.content.includes("[STREAMING]") || args.content.includes("[PARTIAL]")) {
        throw new Error("SAFETY: Cannot send streaming/partial content to Telegram. Final replies only.");
      }
    }

    // Insert message
    const messageId = await ctx.db.insert("telegraphMessages", {
      projectId: args.projectId,
      threadId: args.threadId,
      senderId: args.senderId,
      senderType: args.senderType,
      content: args.content,
      replyToId: args.replyToId,
      channel: args.channel,
      externalRef: args.externalRef,
      status: "SENT",
    });

    // Update thread stats
    const thread = await ctx.db.get(args.threadId);
    if (thread) {
      await ctx.db.patch(args.threadId, {
        lastMessageAt: Date.now(),
        messageCount: thread.messageCount + 1,
      });

      // Add sender to participants if not already there
      if (!thread.participants.includes(args.senderId)) {
        await ctx.db.patch(args.threadId, {
          participants: [...thread.participants, args.senderId],
        });
      }
    }

    return messageId;
  },
});

/**
 * Mark a message as read.
 */
export const markRead = mutation({
  args: {
    messageId: v.id("telegraphMessages"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, { status: "READ" });
  },
});
