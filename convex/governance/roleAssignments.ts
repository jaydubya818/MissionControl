import { mutation, query } from "../lib/missionScopedFunctions";
import type { MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import {
  COMPANY_PERMISSIONS,
  requireCompanyAccess,
  requireCompanyPermission,
} from "../lib/companyAccess";

async function validateScope(
  ctx: MutationCtx,
  tenantId: string,
  scope: { type: "tenant" | "project" | "environment"; id: string } | undefined
) {
  if (!scope) return;
  if (scope.type === "tenant") {
    if (scope.id !== tenantId) throw new Error("Tenant role scope must match the operator company.");
    return;
  }
  if (scope.type === "project") {
    const projectId = ctx.db.normalizeId("projects", scope.id);
    const project = projectId ? await ctx.db.get(projectId) : null;
    if (!project || project.tenantId !== tenantId) {
      throw new Error("Project role scope must belong to the operator company.");
    }
    return;
  }
  const environmentId = ctx.db.normalizeId("environments", scope.id);
  const environment = environmentId ? await ctx.db.get(environmentId) : null;
  if (!environment || environment.tenantId !== tenantId) {
    throw new Error("Environment role scope must belong to the operator company.");
  }
}

export const assignRole = mutation({
  args: {
    operatorId: v.id("operators"),
    roleId: v.id("roles"),
    scope: v.optional(
      v.object({
        type: v.union(v.literal("tenant"), v.literal("project"), v.literal("environment")),
        id: v.string(),
      })
    ),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const [operator, role] = await Promise.all([
      ctx.db.get(args.operatorId),
      ctx.db.get(args.roleId),
    ]);
    if (!operator || !role || operator.tenantId !== role.tenantId) {
      throw new Error("Operator and role must belong to the same company.");
    }
    await validateScope(ctx, operator.tenantId, args.scope);
    const actor = await requireCompanyPermission(
      ctx,
      operator.tenantId,
      COMPANY_PERMISSIONS.MANAGE_MEMBERS
    );
    const existing = await ctx.db
      .query("roleAssignments")
      .withIndex("by_operator_role", (q) => q.eq("operatorId", args.operatorId).eq("roleId", args.roleId))
      .first();
    if (existing) return existing;

    const id = await ctx.db.insert("roleAssignments", {
      operatorId: args.operatorId,
      roleId: args.roleId,
      scope: args.scope,
      assignedBy: actor.operatorId,
      metadata: args.metadata,
      assignedAt: Date.now(),
    });

    await ctx.db.insert("activities", {
      tenantId: operator.tenantId,
      actorType: "HUMAN",
      actorId: actor.operatorId ?? "demo:company-administrator",
      action: "COMPANY_ROLE_ASSIGNED",
      description: `Role "${role.name}" assigned to "${operator.name}"`,
      targetType: "OPERATOR",
      targetId: operator._id,
      afterState: { roleId: role._id, scope: args.scope },
    });

    return await ctx.db.get(id);
  },
});

export const listAssignments = query({
  args: {
    tenantId: v.id("tenants"),
    operatorId: v.optional(v.id("operators")),
    roleId: v.optional(v.id("roles")),
  },
  handler: async (ctx, args) => {
    await requireCompanyAccess(ctx, args.tenantId);
    const operatorId = args.operatorId;
    const roleId = args.roleId;
    if (operatorId) {
      const operator = await ctx.db.get(operatorId);
      if (!operator || operator.tenantId !== args.tenantId) return [];
      return await ctx.db
        .query("roleAssignments")
        .withIndex("by_operator", (q) => q.eq("operatorId", operatorId))
        .collect();
    }
    if (roleId) {
      const role = await ctx.db.get(roleId);
      if (!role || role.tenantId !== args.tenantId) return [];
      return await ctx.db
        .query("roleAssignments")
        .withIndex("by_role", (q) => q.eq("roleId", roleId))
        .collect();
    }

    const operators = await ctx.db
      .query("operators")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();
    const assignments = await Promise.all(
      operators.map((operator) =>
        ctx.db
          .query("roleAssignments")
          .withIndex("by_operator", (q) => q.eq("operatorId", operator._id))
          .collect()
      )
    );
    return assignments.flat();
  },
});
