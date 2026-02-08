/**
 * Activities — Convex Functions
 * 
 * Audit log queries.
 */

import { v } from "convex/values";
import { query } from "./_generated/server";

export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.projectId) {
      return await ctx.db
        .query("activities")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .order("desc")
        .take(args.limit ?? 50);
    }
    return await ctx.db
      .query("activities")
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const listRecent = query({
  args: { 
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.projectId) {
      return await ctx.db
        .query("activities")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .order("desc")
        .take(args.limit ?? 50);
    }
    return await ctx.db
      .query("activities")
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const listByTask = query({
  args: { 
    taskId: v.id("tasks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("activities")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const listByAgent = query({
  args: { 
    agentId: v.id("agents"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("activities")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const listByAction = query({
  args: { 
    action: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("activities")
      .withIndex("by_action", (q) => q.eq("action", args.action))
      .order("desc")
      .take(args.limit ?? 50);
  },
});
