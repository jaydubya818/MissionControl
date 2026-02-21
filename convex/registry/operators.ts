import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

export const createOperator = mutation({
  args: {
    tenantId: v.id("tenants"),
    email: v.string(),
    name: v.string(),
    authId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("operators")
      .withIndex("by_tenant_email", (q) => q.eq("tenantId", args.tenantId).eq("email", args.email))
      .first();
    if (existing) return existing;

    const id = await ctx.db.insert("operators", {
      ...args,
      active: true,
      createdAt: Date.now(),
    });
    return await ctx.db.get(id);
  },
});

export const getOperator = query({
  args: {
    operatorId: v.id("operators"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.operatorId);
  },
});

export const listOperators = query({
  args: {
    tenantId: v.id("tenants"),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("operators")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();

    return (args.activeOnly ?? true) ? rows.filter((row) => row.active) : rows;
  },
});
