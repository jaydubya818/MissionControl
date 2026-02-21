import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const record = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    metricName: v.string(),
    metricType: v.union(v.literal("counter"), v.literal("gauge"), v.literal("histogram")),
    value: v.number(),
    timestamp: v.optional(v.number()),
    labels: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("metrics", {
      tenantId: undefined,
      projectId: args.projectId,
      metricName: args.metricName,
      metricType: args.metricType,
      value: args.value,
      timestamp: args.timestamp ?? Date.now(),
      labels: args.labels,
    });
    return { id };
  },
});

export const queryRange = query({
  args: {
    projectId: v.optional(v.id("projects")),
    metricName: v.optional(v.string()),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rows = args.projectId
      ? await ctx.db.query("metrics").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).order("desc").take(args.limit ?? 500)
      : await ctx.db.query("metrics").order("desc").take(args.limit ?? 500);
    return rows.filter((row) => {
      if (args.metricName && row.metricName !== args.metricName) return false;
      if (args.from && row.timestamp < args.from) return false;
      if (args.to && row.timestamp > args.to) return false;
      return true;
    });
  },
});

export const aggregate = query({
  args: {
    projectId: v.optional(v.id("projects")),
    metricName: v.string(),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("metrics").withIndex("by_name", (q) => q.eq("metricName", args.metricName)).collect();
    const filtered = rows.filter((row) => {
      if (args.projectId && row.projectId !== args.projectId) return false;
      if (args.from && row.timestamp < args.from) return false;
      if (args.to && row.timestamp > args.to) return false;
      return true;
    });
    if (filtered.length === 0) {
      return { count: 0, min: 0, max: 0, avg: 0, p95: 0, p99: 0 };
    }
    const values = filtered.map((row) => row.value).sort((a, b) => a - b);
    const sum = values.reduce((total, value) => total + value, 0);
    const percentile = (p: number) => values[Math.min(values.length - 1, Math.floor(values.length * p))];
    return {
      count: values.length,
      min: values[0],
      max: values[values.length - 1],
      avg: sum / values.length,
      p95: percentile(0.95),
      p99: percentile(0.99),
    };
  },
});
