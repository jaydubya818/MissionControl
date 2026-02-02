/**
 * Alerts — Convex Functions
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================================================
// QUERIES
// ============================================================================

export const listOpen = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("alerts")
      .withIndex("by_status", (q) => q.eq("status", "OPEN"))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const listBySeverity = query({
  args: { 
    severity: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("alerts")
      .withIndex("by_severity", (q) => q.eq("severity", args.severity as any))
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
      .query("alerts")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

export const create = mutation({
  args: {
    severity: v.string(),
    type: v.string(),
    title: v.string(),
    description: v.string(),
    agentId: v.optional(v.id("agents")),
    taskId: v.optional(v.id("tasks")),
    runId: v.optional(v.id("runs")),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const alertId = await ctx.db.insert("alerts", {
      severity: args.severity as any,
      type: args.type,
      title: args.title,
      description: args.description,
      agentId: args.agentId,
      taskId: args.taskId,
      runId: args.runId,
      status: "OPEN",
      metadata: args.metadata,
    });
    
    return { alert: await ctx.db.get(alertId) };
  },
});

export const acknowledge = mutation({
  args: {
    alertId: v.id("alerts"),
    acknowledgedBy: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.alertId, {
      status: "ACKNOWLEDGED",
      acknowledgedBy: args.acknowledgedBy,
      acknowledgedAt: Date.now(),
    });
    
    return { alert: await ctx.db.get(args.alertId) };
  },
});

export const resolve = mutation({
  args: {
    alertId: v.id("alerts"),
    resolutionNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.alertId, {
      status: "RESOLVED",
      resolvedAt: Date.now(),
      resolutionNote: args.resolutionNote,
    });
    
    return { alert: await ctx.db.get(args.alertId) };
  },
});

export const ignore = mutation({
  args: {
    alertId: v.id("alerts"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.alertId, {
      status: "IGNORED",
      resolutionNote: args.reason,
    });
    
    return { alert: await ctx.db.get(args.alertId) };
  },
});
