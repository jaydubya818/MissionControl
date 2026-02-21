import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const createRole = mutation({
  args: {
    tenantId: v.id("tenants"),
    name: v.string(),
    description: v.optional(v.string()),
    permissions: v.array(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("roles")
      .withIndex("by_tenant_name", (q) => q.eq("tenantId", args.tenantId).eq("name", args.name))
      .first();
    if (existing) return existing;

    const id = await ctx.db.insert("roles", args);
    return await ctx.db.get(id);
  },
});

export const listRoles = query({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("roles")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();
  },
});
