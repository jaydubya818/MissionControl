import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const createTenant = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("tenants")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (existing) return existing;

    const id = await ctx.db.insert("tenants", {
      name: args.name,
      slug: args.slug,
      description: args.description,
      active: true,
      metadata: args.metadata,
    });
    return await ctx.db.get(id);
  },
});

export const getTenant = query({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.tenantId);
  },
});

export const listTenants = query({
  args: { activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    if (args.activeOnly ?? true) {
      return await ctx.db
        .query("tenants")
        .withIndex("by_active", (q) => q.eq("active", true))
        .collect();
    }
    return await ctx.db.query("tenants").collect();
  },
});
