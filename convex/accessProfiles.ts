import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  ACCESS_PROFILE_DEFAULTS,
  ACCESS_VIEW_REQUIREMENTS,
  PERSONA_KEYS,
  SUPPORTED_ACCESS_VIEWS,
  canonicalHash,
  type AccessControlMode,
  type AccessViewKey,
  type PersonaKey,
} from "@mission-control/shared";
import {
  COMPANY_PERMISSIONS,
  getOperatorRoles,
  requireCompanyAccess,
  requireCompanyPermission,
  requireWorkspaceAccess,
  roleGrantsPermission,
} from "./lib/companyAccess";
import {
  accessProfileDiff,
  canTransitionAccessControlMode,
  isScopeAllowedForPersona,
  normalizeAccessProfileDraft,
  selectPrimaryPersona,
} from "./lib/accessControl";

const personaKeyValidator = v.union(
  v.literal("EXECUTIVE"),
  v.literal("ARCHITECT"),
  v.literal("BUILDER"),
  v.literal("ADMIN"),
);

const scopeLensValidator = v.union(
  v.literal("MY_WORK"),
  v.literal("TEAM"),
  v.literal("WORKSPACE"),
  v.literal("COMPANY"),
);

const accessControlModeValidator = v.union(
  v.literal("LEGACY"),
  v.literal("SHADOW"),
  v.literal("ENFORCED"),
);

const profileDraftValidator = v.object({
  permissions: v.array(v.string()),
  visibleViews: v.array(v.string()),
  defaultLandingView: v.string(),
  defaultScopeLens: scopeLensValidator,
});

const assignmentScopeValidator = v.object({
  type: v.union(
    v.literal("tenant"),
    v.literal("project"),
    v.literal("team"),
  ),
  id: v.string(),
});

type AuthorizationCoverageStatus =
  | "UNINVENTORIED"
  | "INVENTORIED"
  | "SHADOW_ENFORCED"
  | "ENFORCED"
  | "BROWSER_PROVEN";

/**
 * This list is intentionally conservative. A route advances only after all of
 * its public data and command paths are server-guarded and tested.
 */
const AUTHORIZATION_COVERAGE = Object.fromEntries(
  SUPPORTED_ACCESS_VIEWS.map((view) => [
    view,
    view === "access-profiles" ? "ENFORCED" : "INVENTORIED",
  ]),
) as Record<AccessViewKey, AuthorizationCoverageStatus>;

function isCoverageEligible(view: AccessViewKey) {
  const status = AUTHORIZATION_COVERAGE[view];
  return status === "ENFORCED" || status === "BROWSER_PROVEN";
}

type AccessCtx = QueryCtx | MutationCtx;

async function getSystemProfiles(ctx: AccessCtx, tenantId: Id<"tenants">) {
  const roles = await ctx.db
    .query("roles")
    .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
    .collect();
  return roles.filter(
    (role): role is Doc<"roles"> & { systemKey: PersonaKey } =>
      Boolean(role.systemKey && PERSONA_KEYS.includes(role.systemKey as PersonaKey)),
  );
}

async function getProfile(
  ctx: AccessCtx,
  tenantId: Id<"tenants">,
  systemKey: PersonaKey,
) {
  return await ctx.db
    .query("roles")
    .withIndex("by_tenant_system_key", (q) =>
      q.eq("tenantId", tenantId).eq("systemKey", systemKey)
    )
    .first();
}

function activeProfileProjection(role: Doc<"roles"> & { systemKey: PersonaKey }) {
  const defaults = ACCESS_PROFILE_DEFAULTS[role.systemKey];
  return {
    roleId: role._id,
    systemKey: role.systemKey,
    name: role.name,
    description: role.description ?? defaults.description,
    version: role.profileVersion ?? 1,
    permissions: role.permissions,
    visibleViews: role.visibleViews ?? [...defaults.visibleViews],
    defaultLandingView: role.defaultLandingView ?? defaults.defaultLandingView,
    defaultScopeLens: role.defaultScopeLens ?? defaults.defaultScopeLens,
    updatedAt: role.updatedAt,
    updatedBy: role.updatedBy,
  };
}

function actorLabel(operatorId: Id<"operators"> | undefined) {
  return operatorId ? String(operatorId) : "demo:company-administrator";
}

function availableScopeLenses(systemKey: PersonaKey) {
  if (systemKey === "ADMIN" || systemKey === "EXECUTIVE") return ["COMPANY"] as const;
  if (systemKey === "ARCHITECT") return ["WORKSPACE", "COMPANY"] as const;
  return ["MY_WORK", "TEAM", "WORKSPACE"] as const;
}

async function auditProfileChange(
  ctx: MutationCtx,
  args: {
    tenantId: Id<"tenants">;
    actorId: string;
    action: string;
    description: string;
    targetType: string;
    targetId: string;
    beforeState?: unknown;
    afterState?: unknown;
    metadata?: Record<string, unknown>;
  },
) {
  await ctx.db.insert("activities", {
    tenantId: args.tenantId,
    actorType: "HUMAN",
    actorId: args.actorId,
    action: args.action,
    description: args.description,
    targetType: args.targetType,
    targetId: args.targetId,
    beforeState: args.beforeState,
    afterState: args.afterState,
    metadata: args.metadata,
  });
}

async function assignmentCounts(ctx: AccessCtx, roleId: Id<"roles">) {
  const assignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_role", (q) => q.eq("roleId", roleId))
    .collect();
  const operators = await Promise.all(assignments.map((assignment) => ctx.db.get(assignment.operatorId)));
  return {
    total: assignments.length,
    active: operators.filter((operator) => operator?.active).length,
  };
}

async function activeAdminCount(ctx: AccessCtx, tenantId: Id<"tenants">) {
  const admin = await getProfile(ctx, tenantId, "ADMIN");
  if (!admin) return 0;
  const counts = await assignmentCounts(ctx, admin._id);
  return counts.active;
}

async function validateAssignmentScope(
  ctx: AccessCtx,
  tenantId: Id<"tenants">,
  systemKey: PersonaKey,
  scope: { type: "tenant" | "project" | "team"; id: string },
) {
  if (!isScopeAllowedForPersona(systemKey, scope.type)) {
    throw new Error(`${systemKey.toLowerCase()} cannot be assigned at ${scope.type} scope.`);
  }
  if (scope.type === "tenant") {
    if (scope.id !== tenantId) throw new Error("Tenant scope must match the selected company.");
    return;
  }
  if (scope.type === "project") {
    const projectId = ctx.db.normalizeId("projects", scope.id);
    const project = projectId ? await ctx.db.get(projectId) : null;
    if (!project || project.tenantId !== tenantId) {
      throw new Error("Workspace scope must belong to the selected company.");
    }
    return;
  }
  const teamId = ctx.db.normalizeId("scrumTeams", scope.id);
  const team = teamId ? await ctx.db.get(teamId) : null;
  if (!team || team.tenantId !== tenantId) {
    throw new Error("Team scope must belong to the selected company.");
  }
}

async function insertRevision(
  ctx: MutationCtx,
  args: {
    tenantId: Id<"tenants">;
    roleId: Id<"roles">;
    systemKey: PersonaKey;
    version: number;
    profile: {
      permissions: string[];
      visibleViews: string[];
      defaultLandingView: string;
      defaultScopeLens: "MY_WORK" | "TEAM" | "WORKSPACE" | "COMPANY";
    };
    reason: string;
    operatorId?: Id<"operators">;
    restoredFromRevisionId?: Id<"accessProfileRevisions">;
  },
) {
  const actorId = actorLabel(args.operatorId);
  const digestInput = {
    tenantId: String(args.tenantId),
    roleId: String(args.roleId),
    systemKey: args.systemKey,
    version: args.version,
    ...args.profile,
  };
  return await ctx.db.insert("accessProfileRevisions", {
    tenantId: args.tenantId,
    roleId: args.roleId,
    systemKey: args.systemKey,
    version: args.version,
    ...args.profile,
    reason: args.reason,
    createdBy: args.operatorId,
    actorId,
    createdAt: Date.now(),
    restoredFromRevisionId: args.restoredFromRevisionId,
    digest: `sha256:${canonicalHash({ namespace: "access-profile-v1", value: digestInput })}`,
  });
}

async function applyProfileUpdate(
  ctx: MutationCtx,
  args: {
    tenantId: Id<"tenants">;
    systemKey: PersonaKey;
    expectedVersion: number;
    proposed: {
      permissions: string[];
      visibleViews: string[];
      defaultLandingView: string;
      defaultScopeLens: "MY_WORK" | "TEAM" | "WORKSPACE" | "COMPANY";
    };
    reason: string;
    operatorId?: Id<"operators">;
    restoredFromRevisionId?: Id<"accessProfileRevisions">;
  },
) {
  const role = await getProfile(ctx, args.tenantId, args.systemKey);
  if (!role) throw new Error("Access profile is not initialized.");
  const current = activeProfileProjection(role as Doc<"roles"> & { systemKey: PersonaKey });
  if (current.version !== args.expectedVersion) {
    throw new Error("Access profile changed in another session. Reload and preview again.");
  }
  const reason = args.reason.trim();
  if (reason.length < 3 || reason.length > 1_000) {
    throw new Error("Change reason must be between 3 and 1,000 characters.");
  }
  const normalized = normalizeAccessProfileDraft(args.systemKey, args.proposed);
  if (normalized.ok === false) throw new Error(normalized.errors.join(" "));

  const nextVersion = current.version + 1;
  const now = Date.now();
  const next = normalized.value;
  const newlyEnabledWithoutCoverage = next.visibleViews.filter(
    (view) => !current.visibleViews.includes(view) && !isCoverageEligible(view),
  );
  if (newlyEnabledWithoutCoverage.length > 0) {
    throw new Error(
      `Complete server authorization coverage before enabling: ${newlyEnabledWithoutCoverage.join(", ")}.`,
    );
  }
  const revisionId = await insertRevision(ctx, {
    tenantId: args.tenantId,
    roleId: role._id,
    systemKey: args.systemKey,
    version: nextVersion,
    profile: next,
    reason,
    operatorId: args.operatorId,
    restoredFromRevisionId: args.restoredFromRevisionId,
  });
  await ctx.db.patch(role._id, {
    permissions: next.permissions,
    visibleViews: next.visibleViews,
    defaultLandingView: next.defaultLandingView,
    defaultScopeLens: next.defaultScopeLens,
    profileVersion: nextVersion,
    updatedAt: now,
    updatedBy: args.operatorId,
  });
  const diff = accessProfileDiff(current as any, next);
  await auditProfileChange(ctx, {
    tenantId: args.tenantId,
    actorId: actorLabel(args.operatorId),
    action: args.restoredFromRevisionId ? "ACCESS_PROFILE_RESTORED" : "ACCESS_PROFILE_UPDATED",
    description: `${args.systemKey} access profile activated at version ${nextVersion}`,
    targetType: "ACCESS_PROFILE",
    targetId: String(role._id),
    beforeState: current,
    afterState: { ...next, version: nextVersion, revisionId },
    metadata: { reason, diff, restoredFromRevisionId: args.restoredFromRevisionId },
  });
  return { success: true as const, roleId: role._id, revisionId, version: nextVersion, diff };
}

export const getMyAccessContext = query({
  args: {
    tenantId: v.id("tenants"),
    projectId: v.optional(v.id("projects")),
    demoPersona: v.optional(personaKeyValidator),
  },
  handler: async (ctx, args) => {
    const membership = await requireCompanyAccess(ctx, args.tenantId);
    const mode = membership.tenant.accessControlMode ?? "LEGACY";
    if (membership.mode === "DEMO") {
      const persona = args.demoPersona ?? "ADMIN";
      return {
        status: "READY" as const,
        identityMode: membership.mode,
        mode,
        enforced: args.demoPersona ? true : mode === "ENFORCED",
        demoPreview: Boolean(args.demoPersona),
        persona,
        profile: { ...ACCESS_PROFILE_DEFAULTS[persona], version: 1 },
        effectivePermissions: [...ACCESS_PROFILE_DEFAULTS[persona].permissions],
        shadowPermissions: [...ACCESS_PROFILE_DEFAULTS[persona].permissions],
        availableScopeLenses: availableScopeLenses(persona),
        canManageAccessProfiles: persona === "ADMIN",
        conflict: false,
        denialReason: undefined,
      };
    }
    const operator = membership.operatorId ? await ctx.db.get(membership.operatorId) : null;
    if (!operator) throw new Error("Authenticated operator membership is required.");
    if (args.projectId) {
      await requireWorkspaceAccess(ctx, args.tenantId, args.projectId);
    }
    const roles = await getOperatorRoles(
      ctx,
      operator,
      args.tenantId,
      args.projectId ? { projectId: args.projectId } : undefined,
    );
    const primary = selectPrimaryPersona(roles);
    const legacyPermissions = [...new Set(roles.flatMap((role) => role.permissions))];
    if (!primary.role || !primary.systemKey || primary.conflict) {
      return {
        status: primary.conflict ? "CONFLICT" as const : "NO_PROFILE" as const,
        identityMode: membership.mode,
        mode,
        enforced: mode === "ENFORCED",
        persona: primary.systemKey,
        profile: undefined,
        effectivePermissions: mode === "ENFORCED"
          ? []
          : legacyPermissions,
        shadowPermissions: [],
        availableScopeLenses: [],
        canManageAccessProfiles: roles.some((role) =>
          roleGrantsPermission(role, COMPANY_PERMISSIONS.MANAGE_ACCESS_PROFILES)
        ),
        conflict: primary.conflict,
        denialReason: primary.conflict
          ? "Multiple primary personas are assigned. An Admin must resolve the conflict."
          : "No primary access persona is assigned.",
      };
    }
    const profile = activeProfileProjection(
      primary.role as Doc<"roles"> & { systemKey: PersonaKey },
    );
    return {
      status: "READY" as const,
      identityMode: membership.mode,
      mode,
      enforced: mode === "ENFORCED",
      persona: primary.systemKey,
      profile,
      effectivePermissions: legacyPermissions,
      shadowPermissions: profile.permissions,
      availableScopeLenses: availableScopeLenses(primary.systemKey),
      canManageAccessProfiles: roles.some((role) =>
        roleGrantsPermission(role, COMPANY_PERMISSIONS.MANAGE_ACCESS_PROFILES)
      ),
      conflict: false,
      denialReason: undefined,
    };
  },
});

export const listForAdministration = query({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    await requireCompanyPermission(ctx, args.tenantId, COMPANY_PERMISSIONS.MANAGE_ACCESS_PROFILES);
    const roles = await getSystemProfiles(ctx, args.tenantId);
    const profiles = await Promise.all(roles.map(async (role) => ({
      ...activeProfileProjection(role),
      assignments: await assignmentCounts(ctx, role._id),
    })));
    return {
      mode: (await ctx.db.get(args.tenantId))?.accessControlMode ?? "LEGACY",
      initialized: profiles.length === PERSONA_KEYS.length,
      profiles: profiles.sort(
        (left, right) => PERSONA_KEYS.indexOf(left.systemKey) - PERSONA_KEYS.indexOf(right.systemKey),
      ),
    };
  },
});

export const getProfileForAdministration = query({
  args: { tenantId: v.id("tenants"), systemKey: personaKeyValidator },
  handler: async (ctx, args) => {
    await requireCompanyPermission(ctx, args.tenantId, COMPANY_PERMISSIONS.MANAGE_ACCESS_PROFILES);
    const role = await getProfile(ctx, args.tenantId, args.systemKey);
    if (!role) return null;
    return {
      ...activeProfileProjection(role as Doc<"roles"> & { systemKey: PersonaKey }),
      assignments: await assignmentCounts(ctx, role._id),
    };
  },
});

export const previewUpdate = query({
  args: {
    tenantId: v.id("tenants"),
    systemKey: personaKeyValidator,
    proposed: profileDraftValidator,
  },
  handler: async (ctx, args) => {
    await requireCompanyPermission(ctx, args.tenantId, COMPANY_PERMISSIONS.MANAGE_ACCESS_PROFILES);
    const role = await getProfile(ctx, args.tenantId, args.systemKey);
    if (!role) return { valid: false as const, errors: ["Access profile is not initialized."] };
    const normalized = normalizeAccessProfileDraft(args.systemKey, args.proposed);
    if (normalized.ok === false) return { valid: false as const, errors: normalized.errors };
    const current = activeProfileProjection(role as Doc<"roles"> & { systemKey: PersonaKey });
    const newlyEnabledWithoutCoverage = normalized.value.visibleViews.filter(
      (view) => !current.visibleViews.includes(view) && !isCoverageEligible(view),
    );
    if (newlyEnabledWithoutCoverage.length > 0) {
      return {
        valid: false as const,
        errors: [`Complete server authorization coverage before enabling: ${newlyEnabledWithoutCoverage.join(", ")}.`],
      };
    }
    return {
      valid: true as const,
      errors: [],
      expectedVersion: current.version,
      diff: accessProfileDiff(current as any, normalized.value),
      affectedMembers: (await assignmentCounts(ctx, role._id)).active,
      proposed: normalized.value,
    };
  },
});

export const listRevisions = query({
  args: { tenantId: v.id("tenants"), systemKey: personaKeyValidator },
  handler: async (ctx, args) => {
    await requireCompanyPermission(ctx, args.tenantId, COMPANY_PERMISSIONS.MANAGE_ACCESS_PROFILES);
    return await ctx.db
      .query("accessProfileRevisions")
      .withIndex("by_tenant_system_key_version", (q) =>
        q.eq("tenantId", args.tenantId).eq("systemKey", args.systemKey)
      )
      .order("desc")
      .collect();
  },
});

export const getAuthorizationCoverage = query({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    await requireCompanyPermission(ctx, args.tenantId, COMPANY_PERMISSIONS.MANAGE_ACCESS_PROFILES);
    return SUPPORTED_ACCESS_VIEWS.map((view) => ({
      view,
      requiredPermission: ACCESS_VIEW_REQUIREMENTS[view],
      status: AUTHORIZATION_COVERAGE[view],
    }));
  },
});

export const ensureSystemProfiles = mutation({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args) => {
    const actor = await requireCompanyPermission(
      ctx,
      args.tenantId,
      COMPANY_PERMISSIONS.MANAGE_ACCESS_PROFILES,
    );
    const existing = await getSystemProfiles(ctx, args.tenantId);
    const existingKeys = new Set(existing.map((role) => role.systemKey));
    const created: PersonaKey[] = [];
    for (const systemKey of PERSONA_KEYS) {
      if (existingKeys.has(systemKey)) continue;
      const defaults = ACCESS_PROFILE_DEFAULTS[systemKey];
      const roleId = await ctx.db.insert("roles", {
        tenantId: args.tenantId,
        name: defaults.name,
        description: defaults.description,
        systemKey,
        kind: "SYSTEM_PROFILE",
        profileVersion: 1,
        permissions: [...defaults.permissions],
        visibleViews: [...defaults.visibleViews],
        defaultLandingView: defaults.defaultLandingView,
        defaultScopeLens: defaults.defaultScopeLens,
        updatedAt: Date.now(),
        updatedBy: actor.operatorId,
        metadata: { accessProfileSchemaVersion: 1 },
      });
      await insertRevision(ctx, {
        tenantId: args.tenantId,
        roleId,
        systemKey,
        version: 1,
        profile: {
          permissions: [...defaults.permissions],
          visibleViews: [...defaults.visibleViews],
          defaultLandingView: defaults.defaultLandingView,
          defaultScopeLens: defaults.defaultScopeLens,
        },
        reason: "Initialize canonical access profile",
        operatorId: actor.operatorId,
      });
      created.push(systemKey);
    }
    if (created.length > 0) {
      await auditProfileChange(ctx, {
        tenantId: args.tenantId,
        actorId: actorLabel(actor.operatorId),
        action: "ACCESS_PROFILES_INITIALIZED",
        description: `${created.length} canonical access profiles initialized`,
        targetType: "TENANT",
        targetId: String(args.tenantId),
        afterState: { created, schemaVersion: 1 },
      });
    }
    return { success: true as const, created };
  },
});

export const updateProfile = mutation({
  args: {
    tenantId: v.id("tenants"),
    systemKey: personaKeyValidator,
    expectedVersion: v.number(),
    proposed: profileDraftValidator,
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCompanyPermission(
      ctx,
      args.tenantId,
      COMPANY_PERMISSIONS.MANAGE_ACCESS_PROFILES,
    );
    return await applyProfileUpdate(ctx, { ...args, operatorId: actor.operatorId });
  },
});

export const restoreRevision = mutation({
  args: {
    tenantId: v.id("tenants"),
    systemKey: personaKeyValidator,
    revisionId: v.id("accessProfileRevisions"),
    expectedVersion: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCompanyPermission(
      ctx,
      args.tenantId,
      COMPANY_PERMISSIONS.MANAGE_ACCESS_PROFILES,
    );
    const revision = await ctx.db.get(args.revisionId);
    if (!revision || revision.tenantId !== args.tenantId || revision.systemKey !== args.systemKey) {
      throw new Error("Access profile revision is unavailable.");
    }
    return await applyProfileUpdate(ctx, {
      tenantId: args.tenantId,
      systemKey: args.systemKey,
      expectedVersion: args.expectedVersion,
      proposed: {
        permissions: revision.permissions,
        visibleViews: revision.visibleViews,
        defaultLandingView: revision.defaultLandingView,
        defaultScopeLens: revision.defaultScopeLens,
      },
      reason: args.reason,
      operatorId: actor.operatorId,
      restoredFromRevisionId: revision._id,
    });
  },
});

export const assignPrimaryPersona = mutation({
  args: {
    tenantId: v.id("tenants"),
    operatorId: v.id("operators"),
    systemKey: personaKeyValidator,
    scope: assignmentScopeValidator,
  },
  handler: async (ctx, args) => {
    const actor = await requireCompanyPermission(
      ctx,
      args.tenantId,
      COMPANY_PERMISSIONS.MANAGE_ACCESS_PROFILES,
    );
    const [operator, targetRole] = await Promise.all([
      ctx.db.get(args.operatorId),
      getProfile(ctx, args.tenantId, args.systemKey),
    ]);
    if (!operator || operator.tenantId !== args.tenantId) {
      throw new Error("Company member is unavailable.");
    }
    if (!targetRole) throw new Error("Access profile is not initialized.");
    await validateAssignmentScope(ctx, args.tenantId, args.systemKey, args.scope);
    const assignments = await ctx.db
      .query("roleAssignments")
      .withIndex("by_operator", (q) => q.eq("operatorId", args.operatorId))
      .collect();
    const assignedRoles = await Promise.all(assignments.map((assignment) => ctx.db.get(assignment.roleId)));
    const personaAssignments = assignments.filter((_assignment, index) =>
      Boolean(assignedRoles[index]?.systemKey)
    );
    const priorPersonas = assignedRoles
      .map((role) => role?.systemKey)
      .filter((value): value is PersonaKey => Boolean(value));
    if (
      operator.active
      && priorPersonas.includes("ADMIN")
      && args.systemKey !== "ADMIN"
      && await activeAdminCount(ctx, args.tenantId) <= 1
    ) {
      throw new Error("Assign another active Admin before changing the final Admin persona.");
    }
    for (const assignment of personaAssignments) await ctx.db.delete(assignment._id);
    const assignmentId = await ctx.db.insert("roleAssignments", {
      operatorId: args.operatorId,
      roleId: targetRole._id,
      scope: args.scope,
      assignedBy: actor.operatorId,
      assignedAt: Date.now(),
      metadata: { primaryPersona: true, accessProfileVersion: targetRole.profileVersion ?? 1 },
    });
    await auditProfileChange(ctx, {
      tenantId: args.tenantId,
      actorId: actorLabel(actor.operatorId),
      action: "PRIMARY_PERSONA_ASSIGNED",
      description: `${args.systemKey} persona assigned to ${operator.name}`,
      targetType: "OPERATOR",
      targetId: String(operator._id),
      beforeState: { personas: priorPersonas },
      afterState: { systemKey: args.systemKey, scope: args.scope, assignmentId },
    });
    return { success: true as const, assignmentId };
  },
});

export const setAccessControlMode = mutation({
  args: {
    tenantId: v.id("tenants"),
    expectedMode: accessControlModeValidator,
    nextMode: accessControlModeValidator,
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireCompanyPermission(
      ctx,
      args.tenantId,
      COMPANY_PERMISSIONS.MANAGE_ACCESS_PROFILES,
    );
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant) throw new Error("Company is unavailable.");
    const current = (tenant.accessControlMode ?? "LEGACY") as AccessControlMode;
    if (current !== args.expectedMode) {
      throw new Error("Access-control mode changed in another session. Reload and try again.");
    }
    if (!canTransitionAccessControlMode(current, args.nextMode)) {
      throw new Error(`Access-control mode must pass through SHADOW before ENFORCED.`);
    }
    const reason = args.reason.trim();
    if (reason.length < 3 || reason.length > 1_000) {
      throw new Error("Change reason must be between 3 and 1,000 characters.");
    }
    if (args.nextMode === "ENFORCED") {
      const profiles = await getSystemProfiles(ctx, args.tenantId);
      if (profiles.length !== PERSONA_KEYS.length) {
        throw new Error("Initialize all four access profiles before enforcement.");
      }
      if (await activeAdminCount(ctx, args.tenantId) < 1) {
        throw new Error("Assign at least one active Admin before enforcement.");
      }
      const uncoveredViews = [...new Set(profiles.flatMap((role) =>
        (role.visibleViews ?? ACCESS_PROFILE_DEFAULTS[role.systemKey as PersonaKey].visibleViews)
          .filter((view): view is AccessViewKey =>
            SUPPORTED_ACCESS_VIEWS.includes(view as AccessViewKey) &&
            !isCoverageEligible(view as AccessViewKey)
          )
      ))];
      if (uncoveredViews.length > 0) {
        throw new Error(
          `Access control cannot be enforced until server coverage is complete for ${uncoveredViews.length} configured area(s).`,
        );
      }
    }
    const nextVersion = (tenant.accessControlVersion ?? 0) + 1;
    await ctx.db.patch(args.tenantId, {
      accessControlMode: args.nextMode,
      accessControlVersion: nextVersion,
      updatedAt: Date.now(),
      updatedBy: actor.operatorId,
    });
    await auditProfileChange(ctx, {
      tenantId: args.tenantId,
      actorId: actorLabel(actor.operatorId),
      action: "ACCESS_CONTROL_MODE_CHANGED",
      description: `Access control changed from ${current} to ${args.nextMode}`,
      targetType: "TENANT",
      targetId: String(args.tenantId),
      beforeState: { mode: current, version: tenant.accessControlVersion ?? 0 },
      afterState: { mode: args.nextMode, version: nextVersion },
      metadata: { reason },
    });
    return { success: true as const, mode: args.nextMode, version: nextVersion };
  },
});
