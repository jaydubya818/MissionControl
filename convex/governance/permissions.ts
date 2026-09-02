import { internalMutation, query } from "../_generated/server";
import { v } from "convex/values";
import {
  COMPANY_PERMISSIONS,
  requireCompanyPermission,
} from "../lib/companyAccess";

/**
 * Permission keys are a code-reviewed platform contract. Runtime creation is
 * reserved for trusted seed and migration callers; browser clients cannot
 * mutate the catalog.
 */
export const createPermission = internalMutation({
  args: {
    resource: v.string(),
    action: v.string(),
    description: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
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
    tenantId: v.id("tenants"),
    resource: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCompanyPermission(
      ctx,
      args.tenantId,
      COMPANY_PERMISSIONS.MANAGE_ACCESS_PROFILES,
    );
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
