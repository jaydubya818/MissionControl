import { query } from "../_generated/server";
import { v } from "convex/values";

export const listOpEvents = query({
  args: {
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    instanceId: v.optional(v.id("agentInstances")),
    type: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let rows = args.instanceId
      ? await ctx.db
          .query("opEvents")
          .withIndex("by_instance", (q) => q.eq("instanceId", args.instanceId))
          .collect()
      : args.projectId
      ? await ctx.db
          .query("opEvents")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
          .collect()
      : args.tenantId
      ? await ctx.db
          .query("opEvents")
          .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
          .collect()
      : await ctx.db.query("opEvents").collect();

    if (args.type) {
      rows = rows.filter((row) => row.type === args.type);
    }

    rows.sort((a, b) => b.timestamp - a.timestamp);
    return rows.slice(0, args.limit ?? 200);
  },
});

export const getOpEventStats = query({
  args: {
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    windowMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rows = args.projectId
      ? await ctx.db
          .query("opEvents")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
          .collect()
      : args.tenantId
      ? await ctx.db
          .query("opEvents")
          .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
          .collect()
      : await ctx.db.query("opEvents").collect();

    const now = Date.now();
    const windowMs = (args.windowMinutes ?? 60) * 60 * 1000;
    const byType: Record<string, number> = {};
    let inWindow = 0;

    for (const row of rows) {
      byType[row.type] = (byType[row.type] ?? 0) + 1;
      if (now - row.timestamp <= windowMs) {
        inWindow++;
      }
    }

    const topTypes = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([type, count]) => ({ type, count }));

    return {
      total: rows.length,
      inWindow,
      windowMinutes: args.windowMinutes ?? 60,
      byType,
      topTypes,
      latestTimestamp: rows.length ? rows.reduce((max, row) => Math.max(max, row.timestamp), 0) : null,
    };
  },
});
