import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { PersonaKey } from "@mission-control/shared";
import {
  COMPANY_PERMISSIONS,
  requireCompanyAccess,
  requireCompanyPermission,
} from "./lib/companyAccess";
import {
  validateMembershipInput,
  wouldRemoveLastOwner,
} from "./lib/companyMemberPolicy";
import { isScopeAllowedForPersona } from "./lib/accessControl";

const personaKeyValidator = v.union(
  v.literal("EXECUTIVE"),
  v.literal("ARCHITECT"),
  v.literal("BUILDER"),
  v.literal("ADMIN"),
);

const personaScopeValidator = v.object({
  type: v.union(v.literal("tenant"), v.literal("project"), v.literal("team")),
  id: v.string(),
});

const DEFAULT_ROLES = [
  {
    name: "Company Owner",
    aliases: ["Owner"],
    description: "Full company administration and governed delivery authority.",
    permissions: [
      "company.owner",
      COMPANY_PERMISSIONS.MANAGE_COMPANY,
      COMPANY_PERMISSIONS.MANAGE_MEMBERS,
      COMPANY_PERMISSIONS.CREATE_WORKSPACES,
      COMPANY_PERMISSIONS.MANAGE_WORKSPACES,
      "missions.write",
      "missions.approve",
      "workorders.write",
      "workorders.dispatch",
      "approvals.decide",
    ],
  },
  {
    name: "Portfolio Owner",
    aliases: [],
    description: "Owns portfolio intent, planning, and governed decisions.",
    permissions: [
      "missions.write",
      "missions.approve",
      "workorders.write",
      "workorders.dispatch",
      "approvals.decide",
    ],
  },
  {
    name: "Scrum Lead",
    aliases: [],
    description: "Coordinates team delivery, assignment, and review readiness.",
    permissions: ["missions.write", "workorders.write", "tasks.assign", "tasks.write"],
  },
  {
    name: "Developer",
    aliases: [],
    description: "Creates and executes authorized delivery work.",
    permissions: ["missions.write", "workorders.write", "tasks.write", "evidence.write"],
  },
  {
    name: "Read-only Auditor",
    aliases: ["Observer"],
    description: "Inspects authorized outcomes, decisions, and evidence.",
    permissions: ["missions.read", "workorders.read", "tasks.read", "evidence.read"],
  },
] as const;

function bootstrapConfiguration() {
  return {
    subject: process.env.MC_BOOTSTRAP_OWNER_SUBJECT?.trim(),
    tenantSlug: process.env.MC_BOOTSTRAP_TENANT_SLUG?.trim(),
  };
}

async function resolveBootstrapTenant(ctx: MutationCtx, subject: string) {
  const configured = bootstrapConfiguration();
  if (!configured.subject || !configured.tenantSlug || configured.subject !== subject) {
    return null;
  }
  const tenant = await ctx.db
    .query("tenants")
    .withIndex("by_slug", (q) => q.eq("slug", configured.tenantSlug!))
    .first();
  if (!tenant?.active) return null;
  const operators = await ctx.db
    .query("operators")
    .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
    .collect();
  if (operators.some((operator) => operator.active && operator.authId)) return null;
  return tenant;
}

function isOwnerRole(role: Doc<"roles">): boolean {
  const name = role.name.trim().toLowerCase();
  return role.permissions.includes("company.owner") || name === "owner" || name === "company owner";
}

async function getTenantRoles(ctx: MutationCtx, tenantId: Id<"tenants">) {
  return await ctx.db
    .query("roles")
    .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
    .collect();
}

async function getTenantAssignments(
  ctx: MutationCtx,
  operatorId: Id<"operators">,
  tenantId: Id<"tenants">
) {
  const assignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_operator", (q) => q.eq("operatorId", operatorId))
    .collect();
  const roles = await getTenantRoles(ctx, tenantId);
  const tenantRoleIds = new Set(roles.map((role) => role._id));
  return assignments.filter(
    (assignment) =>
      tenantRoleIds.has(assignment.roleId) &&
      (!assignment.scope || assignment.scope.type === "tenant")
  );
}

async function activeOwnerCount(ctx: MutationCtx, tenantId: Id<"tenants">) {
  const [operators, roles] = await Promise.all([
    ctx.db
      .query("operators")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
      .collect(),
    getTenantRoles(ctx, tenantId),
  ]);
  const ownerRoleIds = new Set(roles.filter(isOwnerRole).map((role) => role._id));
  let count = 0;
  for (const operator of operators.filter((item) => item.active)) {
    const assignments = await getTenantAssignments(ctx, operator._id, tenantId);
    if (assignments.some((assignment) => ownerRoleIds.has(assignment.roleId))) count += 1;
  }
  return count;
}

async function operatorHasOwnerRole(
  ctx: MutationCtx,
  tenantId: Id<"tenants">,
  operatorId: Id<"operators">
) {
  const [roles, assignments] = await Promise.all([
    getTenantRoles(ctx, tenantId),
    getTenantAssignments(ctx, operatorId, tenantId),
  ]);
  const ownerRoleIds = new Set(roles.filter(isOwnerRole).map((role) => role._id));
  return assignments.some((assignment) => ownerRoleIds.has(assignment.roleId));
}

async function validateRoles(
  ctx: MutationCtx,
  tenantId: Id<"tenants">,
  roleIds: Id<"roles">[]
) {
  const roles = await Promise.all(roleIds.map((roleId) => ctx.db.get(roleId)));
  if (roles.some((role) => !role || role.tenantId !== tenantId)) {
    return { ok: false as const, error: "Every role must belong to the selected company." };
  }
  if (roles.some((role) => role?.systemKey)) {
    return {
      ok: false as const,
      error: "Primary personas must be changed with the access-profile assignment control.",
    };
  }
  return { ok: true as const, roles: roles as Doc<"roles">[] };
}

async function validatePersonaAssignment(
  ctx: MutationCtx,
  tenantId: Id<"tenants">,
  systemKey: PersonaKey,
  scope: { type: "tenant" | "project" | "team"; id: string },
) {
  if (!isScopeAllowedForPersona(systemKey, scope.type)) {
    return { ok: false as const, error: `${systemKey.toLowerCase()} cannot be assigned at ${scope.type} scope.` };
  }
  if (scope.type === "tenant") {
    if (scope.id !== tenantId) return { ok: false as const, error: "Tenant scope must match the selected company." };
  } else if (scope.type === "project") {
    const projectId = ctx.db.normalizeId("projects", scope.id);
    const project = projectId ? await ctx.db.get(projectId) : null;
    if (!project || project.tenantId !== tenantId) {
      return { ok: false as const, error: "Workspace scope must belong to the selected company." };
    }
  } else {
    const teamId = ctx.db.normalizeId("scrumTeams", scope.id);
    const team = teamId ? await ctx.db.get(teamId) : null;
    if (!team || team.tenantId !== tenantId) {
      return { ok: false as const, error: "Team scope must belong to the selected company." };
    }
  }
  const role = await ctx.db
    .query("roles")
    .withIndex("by_tenant_system_key", (q) =>
      q.eq("tenantId", tenantId).eq("systemKey", systemKey)
    )
    .first();
  if (!role) return { ok: false as const, error: "Access profiles must be initialized before assigning a persona." };
  return { ok: true as const, role };
}

async function getPrimaryPersonaAssignment(
  ctx: MutationCtx,
  tenantId: Id<"tenants">,
  operatorId: Id<"operators">,
) {
  const assignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_operator", (q) => q.eq("operatorId", operatorId))
    .collect();
  for (const assignment of assignments) {
    const role = await ctx.db.get(assignment.roleId);
    if (role?.tenantId === tenantId && role.systemKey) return { assignment, role };
  }
  return null;
}

async function activeAdminPersonaCount(ctx: MutationCtx, tenantId: Id<"tenants">) {
  const adminRole = await ctx.db
    .query("roles")
    .withIndex("by_tenant_system_key", (q) =>
      q.eq("tenantId", tenantId).eq("systemKey", "ADMIN")
    )
    .first();
  if (!adminRole) return 0;
  const assignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_role", (q) => q.eq("roleId", adminRole._id))
    .collect();
  const operators = await Promise.all(assignments.map((assignment) => ctx.db.get(assignment.operatorId)));
  return operators.filter((operator) => operator?.active && operator.tenantId === tenantId).length;
}

async function auditMembershipChange(
  ctx: MutationCtx,
  args: {
    tenantId: Id<"tenants">;
    actorId?: Id<"operators">;
    action: string;
    description: string;
    targetId: Id<"operators">;
    beforeState?: unknown;
    afterState?: unknown;
  }
) {
  await ctx.db.insert("activities", {
    tenantId: args.tenantId,
    actorType: "HUMAN",
    actorId: args.actorId ?? "demo:company-administrator",
    action: args.action,
    description: args.description,
    targetType: "OPERATOR",
    targetId: args.targetId,
    beforeState: args.beforeState,
    afterState: args.afterState,
  });
}

export const list = query({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    const membership = await requireCompanyAccess(ctx, args.tenantId);
    const [operators, roles] = await Promise.all([
      ctx.db
        .query("operators")
        .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
        .collect(),
      ctx.db
        .query("roles")
        .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
        .collect(),
    ]);
    const roleById = new Map(roles.map((role) => [role._id, role]));
    const assignableRoles = roles.filter((role) => !role.systemKey);
    const members = await Promise.all(
      operators.map(async (operator) => {
        const assignments = await ctx.db
          .query("roleAssignments")
          .withIndex("by_operator", (q) => q.eq("operatorId", operator._id))
          .collect();
        const resolvedAssignments = assignments
          .map((assignment) => ({ assignment, role: roleById.get(assignment.roleId) }))
          .filter((item): item is { assignment: Doc<"roleAssignments">; role: Doc<"roles"> } =>
            Boolean(item.role?.tenantId === args.tenantId)
          );
        const personaAssignments = resolvedAssignments.filter((item) => Boolean(item.role.systemKey));
        return {
          ...operator,
          roles: resolvedAssignments
            .filter((item) => !item.role.systemKey)
            .filter((item) => !item.assignment.scope || item.assignment.scope.type === "tenant")
            .map((item) => item.role),
          primaryPersona: personaAssignments.length === 1
            ? {
                systemKey: personaAssignments[0].role.systemKey,
                name: personaAssignments[0].role.name,
                scope: personaAssignments[0].assignment.scope,
              }
            : undefined,
          personaConflict: personaAssignments.length > 1,
        };
      })
    );
    const canManageMembers =
      membership.mode === "DEMO" ||
      membership.permissions.includes(COMPANY_PERMISSIONS.MANAGE_MEMBERS) ||
      membership.canManageCompany;
    const canManageAccessProfiles =
      membership.mode === "DEMO" ||
      membership.permissions.includes(COMPANY_PERMISSIONS.MANAGE_ACCESS_PROFILES) ||
      membership.canManageCompany;
    const [workspaces, teams] = canManageMembers
      ? await Promise.all([
          ctx.db
            .query("projects")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
            .collect(),
          ctx.db
            .query("scrumTeams")
            .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
            .collect(),
        ])
      : [[], []];
    return {
      members: (canManageMembers
        ? members
        : members.filter((member) => member._id === membership.operatorId)
      ).map((member) => ({
        ...member,
        email: canManageMembers || member._id === membership.operatorId ? member.email : undefined,
        authId: canManageMembers || member._id === membership.operatorId ? member.authId : undefined,
      })),
      roles: canManageMembers ? assignableRoles : [],
      accessProfiles: canManageMembers
        ? roles.filter((role) => Boolean(role.systemKey))
        : [],
      canManageMembers,
      canManageAccessProfiles,
      assignmentScopes: canManageMembers
        ? {
            workspaces: workspaces
              .filter((workspace) => workspace.status !== "ARCHIVED")
              .map((workspace) => ({ id: workspace._id, name: workspace.name })),
            teams: teams
              .filter((team) => team.status !== "ARCHIVED")
              .map((team) => ({ id: team._id, projectId: team.projectId, name: team.name })),
          }
        : { workspaces: [], teams: [] },
    };
  },
});

export const getBootstrapStatus = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { eligible: false as const };
    const configured = bootstrapConfiguration();
    if (!configured.subject || !configured.tenantSlug || configured.subject !== identity.subject) {
      return { eligible: false as const };
    }
    const tenant = await ctx.db
      .query("tenants")
      .withIndex("by_slug", (q) => q.eq("slug", configured.tenantSlug!))
      .first();
    if (!tenant?.active) return { eligible: false as const };
    const operators = await ctx.db
      .query("operators")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id))
      .collect();
    if (operators.some((operator) => operator.active && operator.authId)) {
      return { eligible: false as const };
    }
    return { eligible: true as const, tenantName: tenant.name };
  },
});

export const bootstrapOwner = mutation({
  args: { name: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { success: false, error: "Authentication is required." };
    const tenant = await resolveBootstrapTenant(ctx, identity.subject);
    if (!tenant) return { success: false, error: "Owner bootstrap is unavailable." };
    const inputError = validateMembershipInput({
      name: args.name,
      email: args.email,
      authId: identity.subject,
      roleCount: 1,
    });
    if (inputError) return { success: false, error: inputError };
    const email = args.email.trim().toLowerCase();
    const duplicateEmail = await ctx.db
      .query("operators")
      .withIndex("by_tenant_email", (q) => q.eq("tenantId", tenant._id).eq("email", email))
      .first();
    if (duplicateEmail) {
      return { success: false, error: "That email already belongs to an existing operator record." };
    }
    let ownerRole = (await getTenantRoles(ctx, tenant._id)).find(isOwnerRole);
    if (!ownerRole) {
      const definition = DEFAULT_ROLES[0];
      const roleId = await ctx.db.insert("roles", {
        tenantId: tenant._id,
        name: definition.name,
        description: definition.description,
        permissions: [...definition.permissions],
        metadata: { systemRoleVersion: 1, bootstrap: true },
      });
      ownerRole = (await ctx.db.get(roleId))!;
    }
    const operatorId = await ctx.db.insert("operators", {
      tenantId: tenant._id,
      name: args.name.trim(),
      email,
      authId: identity.subject,
      active: true,
      createdAt: Date.now(),
      metadata: { identityProvider: "clerk", bootstrapOwner: true },
    });
    await ctx.db.insert("roleAssignments", {
      operatorId,
      roleId: ownerRole._id,
      scope: { type: "tenant", id: tenant._id },
      assignedBy: operatorId,
      assignedAt: Date.now(),
      metadata: { bootstrap: true },
    });
    await auditMembershipChange(ctx, {
      tenantId: tenant._id,
      actorId: operatorId,
      action: "COMPANY_OWNER_BOOTSTRAPPED",
      description: `Initial company owner "${args.name.trim()}" created`,
      targetId: operatorId,
      afterState: { authId: identity.subject, ownerRoleId: ownerRole._id },
    });
    return { success: true, tenantId: tenant._id };
  },
});

export const ensureDefaultRoles = mutation({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    const actor = await requireCompanyPermission(ctx, args.tenantId, COMPANY_PERMISSIONS.MANAGE_MEMBERS);
    const existing = await getTenantRoles(ctx, args.tenantId);
    const byName = new Set(existing.map((role) => role.name.trim().toLowerCase()));
    let created = 0;
    for (const definition of DEFAULT_ROLES) {
      if (
        [definition.name, ...definition.aliases].some((name) =>
          byName.has(name.toLowerCase())
        )
      ) continue;
      await ctx.db.insert("roles", {
        tenantId: args.tenantId,
        name: definition.name,
        description: definition.description,
        permissions: [...definition.permissions],
        metadata: { systemRoleVersion: 1 },
      });
      created += 1;
    }
    if (created > 0) {
      await ctx.db.insert("activities", {
        tenantId: args.tenantId,
        actorType: "HUMAN",
        actorId: actor.operatorId ?? "demo:company-administrator",
        action: "COMPANY_DEFAULT_ROLES_INITIALIZED",
        description: `${created} default company roles initialized`,
        targetType: "TENANT",
        targetId: args.tenantId,
        afterState: { created, roleVersion: 1 },
      });
    }
    return { success: true, created };
  },
});

export const create = mutation({
  args: {
    tenantId: v.id("tenants"),
    name: v.string(),
    email: v.string(),
    authId: v.string(),
    roleIds: v.array(v.id("roles")),
    primaryPersona: v.object({
      systemKey: personaKeyValidator,
      scope: personaScopeValidator,
    }),
  },
  handler: async (ctx, args) => {
    const actor = await requireCompanyPermission(
      ctx,
      args.tenantId,
      COMPANY_PERMISSIONS.MANAGE_MEMBERS
    );
    await requireCompanyPermission(
      ctx,
      args.tenantId,
      COMPANY_PERMISSIONS.MANAGE_ACCESS_PROFILES,
    );
    const name = args.name.trim();
    const email = args.email.trim().toLowerCase();
    const authId = args.authId.trim();
    const inputError = validateMembershipInput({
      name,
      email,
      authId,
      // A primary persona is the required authority bundle. Legacy/custom
      // roles are optional supplemental grants.
      roleCount: Math.max(args.roleIds.length, 1),
    });
    if (inputError) return { success: false, error: inputError };
    const roles = await validateRoles(ctx, args.tenantId, [...new Set(args.roleIds)]);
    if (!roles.ok) return { success: false, error: roles.error };
    const persona = await validatePersonaAssignment(
      ctx,
      args.tenantId,
      args.primaryPersona.systemKey,
      args.primaryPersona.scope,
    );
    if (!persona.ok) return { success: false, error: persona.error };
    const [duplicateAuth, duplicateEmail] = await Promise.all([
      ctx.db
        .query("operators")
        .withIndex("by_tenant_auth_id", (q) => q.eq("tenantId", args.tenantId).eq("authId", authId))
        .first(),
      ctx.db
        .query("operators")
        .withIndex("by_tenant_email", (q) => q.eq("tenantId", args.tenantId).eq("email", email))
        .first(),
    ]);
    if (duplicateAuth || duplicateEmail) return { success: false, error: "This person already has a company membership." };
    const operatorId = await ctx.db.insert("operators", {
      tenantId: args.tenantId,
      name,
      email,
      authId,
      active: true,
      createdAt: Date.now(),
      metadata: { identityProvider: "clerk", provisionedBy: actor.operatorId ?? "demo" },
    });
    for (const roleId of new Set(args.roleIds)) {
      await ctx.db.insert("roleAssignments", {
        operatorId,
        roleId,
        scope: { type: "tenant", id: args.tenantId },
        assignedBy: actor.operatorId,
        assignedAt: Date.now(),
      });
    }
    await ctx.db.insert("roleAssignments", {
      operatorId,
      roleId: persona.role._id,
      scope: args.primaryPersona.scope,
      assignedBy: actor.operatorId,
      assignedAt: Date.now(),
      metadata: {
        primaryPersona: true,
        accessProfileVersion: persona.role.profileVersion ?? 1,
      },
    });
    await auditMembershipChange(ctx, {
      tenantId: args.tenantId,
      actorId: actor.operatorId,
      action: "COMPANY_MEMBER_CREATED",
      description: `Company member "${name}" provisioned`,
      targetId: operatorId,
      afterState: {
        name,
        email,
        authId,
        roleIds: args.roleIds,
        primaryPersona: args.primaryPersona,
      },
    });
    return { success: true, operatorId };
  },
});

export const setRoles = mutation({
  args: {
    tenantId: v.id("tenants"),
    operatorId: v.id("operators"),
    roleIds: v.array(v.id("roles")),
  },
  handler: async (ctx, args) => {
    const actor = await requireCompanyPermission(ctx, args.tenantId, COMPANY_PERMISSIONS.MANAGE_MEMBERS);
    const operator = await ctx.db.get(args.operatorId);
    if (!operator || operator.tenantId !== args.tenantId) return { success: false, error: "Company member is unavailable." };
    if (args.roleIds.length === 0) return { success: false, error: "Assign at least one company role." };
    const validated = await validateRoles(ctx, args.tenantId, [...new Set(args.roleIds)]);
    if (!validated.ok) return { success: false, error: validated.error };
    const assignments = await getTenantAssignments(ctx, args.operatorId, args.tenantId);
    const resolvedAssignments = await Promise.all(
      assignments.map(async (assignment) => ({ assignment, role: await ctx.db.get(assignment.roleId) }))
    );
    const legacyAssignments = resolvedAssignments
      .filter((item) => !item.role?.systemKey)
      .map((item) => item.assignment);
    const wasOwner = await operatorHasOwnerRole(ctx, args.tenantId, args.operatorId);
    const remainsOwner = validated.roles.some(isOwnerRole);
    if (wouldRemoveLastOwner({
      memberActive: operator.active,
      memberIsOwner: wasOwner,
      memberWillRemainOwner: remainsOwner,
      activeOwnerCount: await activeOwnerCount(ctx, args.tenantId),
    })) {
      return { success: false, error: "Assign another active company owner before removing the final owner role." };
    }
    for (const assignment of legacyAssignments) await ctx.db.delete(assignment._id);
    for (const roleId of new Set(args.roleIds)) {
      await ctx.db.insert("roleAssignments", {
        operatorId: args.operatorId,
        roleId,
        scope: { type: "tenant", id: args.tenantId },
        assignedBy: actor.operatorId,
        assignedAt: Date.now(),
      });
    }
    await auditMembershipChange(ctx, {
      tenantId: args.tenantId,
      actorId: actor.operatorId,
      action: "COMPANY_MEMBER_ROLES_UPDATED",
      description: `Roles updated for "${operator.name}"`,
      targetId: operator._id,
      beforeState: { roleIds: legacyAssignments.map((assignment) => assignment.roleId) },
      afterState: { roleIds: args.roleIds },
    });
    return { success: true };
  },
});

/** Atomically updates the primary persona and tenant-wide supplemental roles. */
export const updateMemberAccess = mutation({
  args: {
    tenantId: v.id("tenants"),
    operatorId: v.id("operators"),
    roleIds: v.array(v.id("roles")),
    primaryPersona: v.object({
      systemKey: personaKeyValidator,
      scope: personaScopeValidator,
    }),
  },
  handler: async (ctx, args) => {
    const actor = await requireCompanyPermission(
      ctx,
      args.tenantId,
      COMPANY_PERMISSIONS.MANAGE_MEMBERS,
    );
    await requireCompanyPermission(
      ctx,
      args.tenantId,
      COMPANY_PERMISSIONS.MANAGE_ACCESS_PROFILES,
    );
    const operator = await ctx.db.get(args.operatorId);
    if (!operator || operator.tenantId !== args.tenantId) {
      return { success: false as const, error: "Company member is unavailable." };
    }
    const validated = await validateRoles(ctx, args.tenantId, [...new Set(args.roleIds)]);
    if (!validated.ok) return { success: false as const, error: validated.error };
    const persona = await validatePersonaAssignment(
      ctx,
      args.tenantId,
      args.primaryPersona.systemKey,
      args.primaryPersona.scope,
    );
    if (!persona.ok) return { success: false as const, error: persona.error };

    const allAssignments = await ctx.db
      .query("roleAssignments")
      .withIndex("by_operator", (q) => q.eq("operatorId", args.operatorId))
      .collect();
    const resolved = await Promise.all(
      allAssignments.map(async (assignment) => ({ assignment, role: await ctx.db.get(assignment.roleId) }))
    );
    const personaAssignments = resolved
      .filter((item) => item.role?.tenantId === args.tenantId && item.role.systemKey)
      .map((item) => item.assignment);
    const legacyTenantAssignments = resolved
      .filter((item) =>
        item.role?.tenantId === args.tenantId &&
        !item.role.systemKey &&
        (!item.assignment.scope || item.assignment.scope.type === "tenant")
      )
      .map((item) => item.assignment);
    const priorPersonaKeys = resolved
      .map((item) => item.role?.systemKey)
      .filter((value): value is PersonaKey => Boolean(value));

    if (
      operator.active &&
      priorPersonaKeys.includes("ADMIN") &&
      args.primaryPersona.systemKey !== "ADMIN" &&
      await activeAdminPersonaCount(ctx, args.tenantId) <= 1
    ) {
      return { success: false as const, error: "Assign another active Admin before changing the final Admin persona." };
    }

    const wasOwner = await operatorHasOwnerRole(ctx, args.tenantId, args.operatorId);
    const remainsOwner = validated.roles.some(isOwnerRole);
    if (
      args.primaryPersona.systemKey !== "ADMIN" &&
      wouldRemoveLastOwner({
        memberActive: operator.active,
        memberIsOwner: wasOwner,
        memberWillRemainOwner: remainsOwner,
        activeOwnerCount: await activeOwnerCount(ctx, args.tenantId),
      })
    ) {
      return { success: false as const, error: "Assign another active company owner before removing the final owner role." };
    }

    for (const assignment of [...personaAssignments, ...legacyTenantAssignments]) {
      await ctx.db.delete(assignment._id);
    }
    for (const roleId of new Set(args.roleIds)) {
      await ctx.db.insert("roleAssignments", {
        operatorId: args.operatorId,
        roleId,
        scope: { type: "tenant", id: args.tenantId },
        assignedBy: actor.operatorId,
        assignedAt: Date.now(),
      });
    }
    const personaAssignmentId = await ctx.db.insert("roleAssignments", {
      operatorId: args.operatorId,
      roleId: persona.role._id,
      scope: args.primaryPersona.scope,
      assignedBy: actor.operatorId,
      assignedAt: Date.now(),
      metadata: {
        primaryPersona: true,
        accessProfileVersion: persona.role.profileVersion ?? 1,
      },
    });
    await auditMembershipChange(ctx, {
      tenantId: args.tenantId,
      actorId: actor.operatorId,
      action: "COMPANY_MEMBER_ACCESS_UPDATED",
      description: `Access updated for "${operator.name}"`,
      targetId: operator._id,
      beforeState: {
        roleIds: legacyTenantAssignments.map((assignment) => assignment.roleId),
        personas: priorPersonaKeys,
      },
      afterState: {
        roleIds: args.roleIds,
        primaryPersona: args.primaryPersona,
        personaAssignmentId,
      },
    });
    return { success: true as const, personaAssignmentId };
  },
});

export const setActive = mutation({
  args: {
    tenantId: v.id("tenants"),
    operatorId: v.id("operators"),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCompanyPermission(ctx, args.tenantId, COMPANY_PERMISSIONS.MANAGE_MEMBERS);
    const operator = await ctx.db.get(args.operatorId);
    if (!operator || operator.tenantId !== args.tenantId) return { success: false, error: "Company member is unavailable." };
    const primaryPersona = await getPrimaryPersonaAssignment(ctx, args.tenantId, args.operatorId);
    if (
      !args.active &&
      operator.active &&
      primaryPersona?.role.systemKey === "ADMIN" &&
      await activeAdminPersonaCount(ctx, args.tenantId) <= 1
    ) {
      return { success: false, error: "Assign another active Admin before deactivating the final Admin." };
    }
    if (!args.active && wouldRemoveLastOwner({
      memberActive: operator.active,
      memberIsOwner: await operatorHasOwnerRole(ctx, args.tenantId, args.operatorId),
      memberWillRemainOwner: false,
      activeOwnerCount: await activeOwnerCount(ctx, args.tenantId),
    })) {
      return { success: false, error: "Add another active company owner before deactivating the final owner." };
    }
    await ctx.db.patch(args.operatorId, { active: args.active });
    await auditMembershipChange(ctx, {
      tenantId: args.tenantId,
      actorId: actor.operatorId,
      action: args.active ? "COMPANY_MEMBER_ACTIVATED" : "COMPANY_MEMBER_DEACTIVATED",
      description: `${operator.name} ${args.active ? "activated" : "deactivated"}`,
      targetId: operator._id,
      beforeState: { active: operator.active },
      afterState: { active: args.active },
    });
    return { success: true };
  },
});
