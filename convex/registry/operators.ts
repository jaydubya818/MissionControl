import { v } from "convex/values";
import { mutation, query } from "../lib/missionScopedFunctions";
import {
  COMPANY_PERMISSIONS,
  requireCompanyAccess,
  requireCompanyPermission,
} from "../lib/companyAccess";

export const createOperator = mutation({
  args: {
    tenantId: v.id("tenants"),
    email: v.string(),
    name: v.string(),
    authId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const actor = await requireCompanyPermission(ctx, args.tenantId, COMPANY_PERMISSIONS.MANAGE_MEMBERS);
    const name = args.name.trim();
    const email = args.email.trim().toLowerCase();
    const authId = args.authId?.trim();
    if (!name || name.length > 120) throw new Error("Operator name is required and must be 120 characters or fewer.");
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new Error("Enter a valid operator email address.");
    if (authId && (!/^user_[A-Za-z0-9]+$/.test(authId) || authId.length > 200)) {
      throw new Error("Clerk membership requires the exact user ID beginning with user_.");
    }
    const [existingEmail, existingAuth] = await Promise.all([
      ctx.db
        .query("operators")
        .withIndex("by_tenant_email", (q) => q.eq("tenantId", args.tenantId).eq("email", email))
        .first(),
      authId
        ? ctx.db
            .query("operators")
            .withIndex("by_tenant_auth_id", (q) => q.eq("tenantId", args.tenantId).eq("authId", authId))
            .first()
        : null,
    ]);
    if (existingEmail || existingAuth) return existingEmail ?? existingAuth;

    const id = await ctx.db.insert("operators", {
      tenantId: args.tenantId,
      email,
      name,
      authId,
      metadata: args.metadata,
      active: true,
      createdAt: Date.now(),
    });
    await ctx.db.insert("activities", {
      tenantId: args.tenantId,
      actorType: "HUMAN",
      actorId: actor.operatorId ?? "demo:company-administrator",
      action: "COMPANY_OPERATOR_CREATED",
      description: `Operator "${name}" created`,
      targetType: "OPERATOR",
      targetId: id,
      afterState: { email, authId },
    });
    return await ctx.db.get(id);
  },
});

export const getOperator = query({
  args: {
    operatorId: v.id("operators"),
  },
  handler: async (ctx, args) => {
    const operator = await ctx.db.get(args.operatorId);
    if (!operator) return null;
    await requireCompanyAccess(ctx, operator.tenantId);
    return operator;
  },
});

export const listOperators = query({
  args: {
    tenantId: v.id("tenants"),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireCompanyAccess(ctx, args.tenantId);
    const rows = await ctx.db
      .query("operators")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();

    return (args.activeOnly ?? true) ? rows.filter((row) => row.active) : rows;
  },
});
