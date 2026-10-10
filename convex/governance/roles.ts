import { v } from "convex/values";
import { mutation, query } from "../lib/missionScopedFunctions";
import {
  COMPANY_PERMISSIONS,
  requireCompanyAccess,
  requireCompanyPermission,
} from "../lib/companyAccess";

export const createRole = mutation({
  args: {
    tenantId: v.id("tenants"),
    name: v.string(),
    description: v.optional(v.string()),
    permissions: v.array(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCompanyPermission(ctx, args.tenantId, COMPANY_PERMISSIONS.MANAGE_MEMBERS);
    const existing = await ctx.db
      .query("roles")
      .withIndex("by_tenant_name", (q) => q.eq("tenantId", args.tenantId).eq("name", args.name))
      .first();
    if (existing) return existing;

    const id = await ctx.db.insert("roles", args);
    await ctx.db.insert("activities", {
      tenantId: args.tenantId,
      actorType: "HUMAN",
      actorId: actor.operatorId ?? "demo:company-administrator",
      action: "COMPANY_ROLE_CREATED",
      description: `Company role "${args.name}" created`,
      targetType: "ROLE",
      targetId: id,
      afterState: { permissions: args.permissions },
    });
    return await ctx.db.get(id);
  },
});

export const listRoles = query({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    await requireCompanyAccess(ctx, args.tenantId);
    return await ctx.db
      .query("roles")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();
  },
});
