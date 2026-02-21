import { query } from "../_generated/server";
import { v } from "convex/values";

export const listChangeRecords = query({
  args: {
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    type: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let rows = args.projectId
      ? await ctx.db
          .query("changeRecords")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
          .collect()
      : args.tenantId
      ? await ctx.db
          .query("changeRecords")
          .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
          .collect()
      : await ctx.db.query("changeRecords").collect();

    if (args.type) {
      rows = rows.filter((row) => row.type === args.type);
    }

    rows.sort((a, b) => b.timestamp - a.timestamp);
    return rows.slice(0, args.limit ?? 200);
  },
});

export const getChangeRecord = query({
  args: { changeRecordId: v.id("changeRecords") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.changeRecordId);
  },
});
