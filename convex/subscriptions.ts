/**
 * Thread Subscriptions — agents subscribed to task threads.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const subscribe = mutation({
  args: {
    agentId: v.id("agents"),
    taskId: v.id("tasks"),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("threadSubscriptions")
      .withIndex("by_agent_task", (q) =>
        q.eq("agentId", args.agentId).eq("taskId", args.taskId)
      )
      .first();
    if (existing) return { subscriptionId: existing._id, created: false };
    const now = Date.now();
    const id = await ctx.db.insert("threadSubscriptions", {
      agentId: args.agentId,
      taskId: args.taskId,
      subscribedAt: now,
      metadata: args.metadata,
    });
    return { subscriptionId: id, created: true };
  },
});

export const unsubscribe = mutation({
  args: {
    agentId: v.id("agents"),
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query("threadSubscriptions")
      .withIndex("by_agent_task", (q) =>
        q.eq("agentId", args.agentId).eq("taskId", args.taskId)
      )
      .first();
    if (!sub) return { removed: false };
    await ctx.db.delete(sub._id);
    return { removed: true };
  },
});

export const listByAgent = query({
  args: { agentId: v.id("agents"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("threadSubscriptions")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(limit);
  },
});

export const listByTask = query({
  args: { taskId: v.id("tasks"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("threadSubscriptions")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .take(limit);
  },
});

/** Subscribed task IDs for an agent — used by heartbeat / "threads with activity". */
export const getSubscribedTaskIds = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const subs = await ctx.db
      .query("threadSubscriptions")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .collect();
    return subs.map((s) => s.taskId);
  },
});
