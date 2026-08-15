import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import {
  COMPANY_PERMISSIONS,
  requireCompanyAccess,
  requireCompanyPermission,
} from "../lib/companyAccess";

const RESERVED_PERMISSION_PREFIXES = ["platform."] as const;

function normalizePermissions(permissions: string[]): string[] {
  const normalized = [...new Set(permissions.map((permission) => permission.trim()))];
  if (
    normalized.length === 0 ||
    normalized.some((permission) => !permission || permission.length > 120)
  ) {
    throw new Error("Every role permission must be between 1 and 120 characters.");
  }
  return normalized;
}

function isReservedPermission(permission: string): boolean {
  return RESERVED_PERMISSION_PREFIXES.some((prefix) => permission.startsWith(prefix));
}

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
    const name = args.name.trim();
    const description = args.description?.trim() || undefined;
    const permissions = normalizePermissions(args.permissions);
    if (!name || name.length > 120) {
      throw new Error("Role name is required and must be 120 characters or fewer.");
    }
    if (description && description.length > 1_000) {
      throw new Error("Role description must be 1,000 characters or fewer.");
    }
    const unauthorizedReservedPermission = permissions.find(
      (permission) =>
        isReservedPermission(permission) && !actor.permissions.includes(permission)
    );
    if (unauthorizedReservedPermission) {
      throw new Error("Platform permissions cannot be granted by a company administrator.");
    }
    const existing = await ctx.db
      .query("roles")
      .withIndex("by_tenant_name", (q) => q.eq("tenantId", args.tenantId).eq("name", name))
      .first();
    if (existing) return existing;

    const id = await ctx.db.insert("roles", {
      tenantId: args.tenantId,
      name,
      description,
      permissions,
      metadata: args.metadata,
    });
    await ctx.db.insert("activities", {
      tenantId: args.tenantId,
      actorType: "HUMAN",
      actorId: actor.operatorId ?? "demo:company-administrator",
      action: "COMPANY_ROLE_CREATED",
      description: `Company role "${name}" created`,
      targetType: "ROLE",
      targetId: id,
      afterState: { permissions },
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
