import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireCompanyAdministrator } from "../lib/companyAccess";

/**
 * The permission catalog is deployment-wide RBAC vocabulary; only a company
 * administrator may extend it.
 */
export const createPermission = mutation({
  args: {
    resource: v.string(),
    action: v.string(),
    description: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireCompanyAdministrator(ctx);
    const existing = await ctx.db
      .query("permissions")
      .withIndex("by_resource_action", (q) => q.eq("resource", args.resource).eq("action", args.action))
      .first();
    if (existing) return existing;

    const id = await ctx.db.insert("permissions", args);
    return await ctx.db.get(id);
  },
});

export const listPermissions = query({
  args: {
    resource: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const resource = args.resource;
    if (resource) {
      return await ctx.db
        .query("permissions")
        .withIndex("by_resource", (q) => q.eq("resource", resource))
        .collect();
    }
    return await ctx.db.query("permissions").collect();
  },
});
