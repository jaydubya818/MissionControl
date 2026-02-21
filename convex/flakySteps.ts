import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
    activeOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rows = args.projectId
      ? await ctx.db.query("flakySteps").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).order("desc").take(args.limit ?? 100)
      : await ctx.db.query("flakySteps").order("desc").take(args.limit ?? 100);
    return args.activeOnly ? rows.filter((row) => row.isActive) : rows;
  },
});

export const get = query({
  args: { id: v.id("flakySteps") },
  handler: async (ctx, args) => await ctx.db.get(args.id),
});

export const recordRun = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    stepName: v.string(),
    status: v.union(v.literal("passed"), v.literal("failed")),
    responseTimeMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("flakySteps").withIndex("by_step", (q) => q.eq("stepName", args.stepName)).first();
    const now = Date.now();
    if (!existing) {
      const id = await ctx.db.insert("flakySteps", {
        tenantId: undefined,
        projectId: args.projectId,
        stepName: args.stepName,
        failureRatio: args.status === "failed" ? 1 : 0,
        totalRuns: 1,
        failedRuns: args.status === "failed" ? 1 : 0,
        lastSeen: now,
        firstDetected: now,
        isActive: args.status === "failed",
        retryCount: 0,
        avgResponseTimeMs: args.responseTimeMs,
      });
      return { id, created: true };
    }

    const totalRuns = existing.totalRuns + 1;
    const failedRuns = existing.failedRuns + (args.status === "failed" ? 1 : 0);
    const failureRatio = failedRuns / Math.max(totalRuns, 1);
    const avgResponseTimeMs =
      args.responseTimeMs === undefined
        ? existing.avgResponseTimeMs
        : existing.avgResponseTimeMs === undefined
          ? args.responseTimeMs
          : Math.round((existing.avgResponseTimeMs * existing.totalRuns + args.responseTimeMs) / totalRuns);

    await ctx.db.patch(existing._id, {
      projectId: args.projectId ?? existing.projectId,
      totalRuns,
      failedRuns,
      failureRatio,
      lastSeen: now,
      isActive: failureRatio >= 0.2,
      avgResponseTimeMs,
    });
    return { id: existing._id, created: false, failureRatio };
  },
});

export const markResolved = mutation({
  args: { id: v.id("flakySteps") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { isActive: false });
    return { success: true };
  },
});
