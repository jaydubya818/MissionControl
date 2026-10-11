/**
 * Alert Rules — user-defined cost/token thresholds, evaluated by cron.
 */

import { v } from "convex/values";
import { mutation, query, internalMutation } from "./lib/missionScopedFunctions";
import type { Id } from "./_generated/dataModel";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    if (args.projectId) {
      return await ctx.db
        .query("alertRules")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
        .collect();
    }
    return await ctx.db.query("alertRules").collect();
  },
});

export const create = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    type: v.literal("daily_cost_exceeded"),
    threshold: v.number(),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("alertRules", {
      projectId: args.projectId,
      type: args.type,
      threshold: args.threshold,
      enabled: args.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("alertRules"),
    threshold: v.optional(v.number()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const rule = await ctx.db.get(id);
    if (!rule) throw new Error("Alert rule not found");
    const patch: { updatedAt: number; threshold?: number; enabled?: boolean } = {
      updatedAt: Date.now(),
    };
    if (updates.threshold !== undefined) patch.threshold = updates.threshold;
    if (updates.enabled !== undefined) patch.enabled = updates.enabled;
    await ctx.db.patch(id, patch);
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("alertRules") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return args.id;
  },
});

/** Internal: run by cron to evaluate rules and create alerts when thresholds are exceeded. */
export const evaluateRules = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const since = now - ONE_DAY_MS;
    const rules = await ctx.db
      .query("alertRules")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();
    if (rules.length === 0) return;

    let runs = await ctx.db.query("runs").order("desc").take(5000);
    runs = runs.filter((r) => r.startedAt >= since);

    for (const rule of rules) {
      const relevant = rule.projectId
        ? runs.filter((r) => r.projectId === rule.projectId)
        : runs;
      const dailyCost = relevant.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
      if (dailyCost >= rule.threshold) {
        await ctx.db.insert("alerts", {
          projectId: rule.projectId,
          severity: "WARNING",
          type: rule.type,
          title: `Alert: ${rule.type.replace(/_/g, " ")}`,
          description: `Daily cost $${dailyCost.toFixed(2)} exceeded threshold $${rule.threshold.toFixed(2)}.`,
          status: "OPEN",
          metadata: { sourceRunIds: relevant.map(run => run._id), ruleId: rule._id, dailyCost, threshold: rule.threshold },
        });
      }
    }
  },
});
