import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const createEnvironment = mutation({
  args: {
    tenantId: v.id("tenants"),
    name: v.string(),
    type: v.union(v.literal("dev"), v.literal("staging"), v.literal("prod")),
    description: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("environments")
      .withIndex("by_tenant_type", (q) => q.eq("tenantId", args.tenantId).eq("type", args.type))
      .collect();
    const exact = existing.find((row) => row.name.toLowerCase() === args.name.toLowerCase());
    if (exact) return exact;

    const id = await ctx.db.insert("environments", args);
    return await ctx.db.get(id);
  },
});

export const listEnvironments = query({
  args: {
    tenantId: v.id("tenants"),
    type: v.optional(v.union(v.literal("dev"), v.literal("staging"), v.literal("prod"))),
  },
  handler: async (ctx, args) => {
    let rows = await ctx.db
      .query("environments")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();

    if (args.type) {
      rows = rows.filter((row) => row.type === args.type);
    }

    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});
