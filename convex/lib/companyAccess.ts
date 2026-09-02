import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type CompanyCtx = QueryCtx | MutationCtx;

export type CompanyAccessMode = "AUTHENTICATED" | "DEMO";

export const COMPANY_PERMISSIONS = {
  MANAGE_COMPANY: "company.manage",
  MANAGE_MEMBERS: "members.manage",
  READ_ACCESS_PROFILES: "accessProfiles.read",
  MANAGE_ACCESS_PROFILES: "accessProfiles.manage",
  READ_SETTINGS: "settings.read",
  CREATE_WORKSPACES: "workspaces.create",
  MANAGE_WORKSPACES: "workspaces.manage",
  MANAGE_REPOSITORIES: "repositories.manage",
  MANAGE_TEAMS: "teams.manage",
  ASSIGN_DELIVERY: "delivery.assign",
  DISPATCH_WORK: "delivery.dispatch",
  UPDATE_DELIVERY: "delivery.write",
  VERIFY_DELIVERY: "delivery.verify",
  APPROVE_DELIVERY: "delivery.approve",
} as const;

export const FACTORY_PERMISSIONS = {
  VIEW: "factory.read",
  IMPROVE: "factory.improve",
  APPROVE: "factory.approve",
  MANAGE_AUTOMATION: "factory.automation.manage",
} as const;

export type CompanyPermission =
  (typeof COMPANY_PERMISSIONS)[keyof typeof COMPANY_PERMISSIONS];

export type FactoryPermission =
  (typeof FACTORY_PERMISSIONS)[keyof typeof FACTORY_PERMISSIONS];

export interface CompanyMembership {
  tenant: Doc<"tenants">;
  operatorId?: Id<"operators">;
  roleNames: string[];
  permissions: string[];
  canManageCompany: boolean;
  mode: CompanyAccessMode;
}

function anonymousDemoEnabled(): boolean {
  return process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT === "1";
}

export function isCompanyAdminRole(role: Doc<"roles">): boolean {
  if (role.systemKey === "ADMIN") return true;
  const name = role.name.trim().toLowerCase();
  return (
    name === "owner" ||
    name === "company owner" ||
    name === "admin" ||
    name === "company admin" ||
    role.permissions.includes(COMPANY_PERMISSIONS.MANAGE_COMPANY) ||
    role.permissions.includes("settings.manage")
  );
}

const LEGACY_DELIVERY_PERMISSION_ALIASES: Partial<Record<CompanyPermission, string[]>> = {
  [COMPANY_PERMISSIONS.APPROVE_DELIVERY]: ["approvals.decide", "missions.approve"],
  [COMPANY_PERMISSIONS.DISPATCH_WORK]: ["workorders.dispatch"],
  [COMPANY_PERMISSIONS.UPDATE_DELIVERY]: ["workorders.write", "tasks.write", "evidence.write"],
  [COMPANY_PERMISSIONS.VERIFY_DELIVERY]: ["evidence.write", "approvals.decide"],
  [COMPANY_PERMISSIONS.ASSIGN_DELIVERY]: ["tasks.assign"],
};

function roleGrantsDeliveryPermissionByLegacyAlias(
  role: Doc<"roles">,
  permission: CompanyPermission,
): boolean {
  return (LEGACY_DELIVERY_PERMISSION_ALIASES[permission] ?? [])
    .some((alias) => role.permissions.includes(alias));
}

export function roleGrantsPermission(
  role: Doc<"roles">,
  permission: CompanyPermission
): boolean {
  if (role.permissions.includes(permission)) return true;
  if (isCompanyAdminRole(role)) return true;
  if (
    permission === COMPANY_PERMISSIONS.MANAGE_COMPANY ||
    permission === COMPANY_PERMISSIONS.MANAGE_MEMBERS ||
    permission === COMPANY_PERMISSIONS.MANAGE_WORKSPACES ||
    permission === COMPANY_PERMISSIONS.MANAGE_REPOSITORIES ||
    permission === COMPANY_PERMISSIONS.MANAGE_TEAMS ||
    permission === COMPANY_PERMISSIONS.ASSIGN_DELIVERY ||
    permission === COMPANY_PERMISSIONS.DISPATCH_WORK
    || permission === COMPANY_PERMISSIONS.UPDATE_DELIVERY
    || permission === COMPANY_PERMISSIONS.VERIFY_DELIVERY
    || permission === COMPANY_PERMISSIONS.APPROVE_DELIVERY
  ) {
    if (isCompanyAdminRole(role)) return true;
    const normalized = role.name.trim().toLowerCase();
    if (
      (permission === COMPANY_PERMISSIONS.MANAGE_WORKSPACES || permission === COMPANY_PERMISSIONS.MANAGE_REPOSITORIES) &&
      (normalized === "workspace lead" || normalized === "product manager")
    ) {
      return true;
    }
    if (
      permission === COMPANY_PERMISSIONS.MANAGE_TEAMS ||
      permission === COMPANY_PERMISSIONS.ASSIGN_DELIVERY ||
      permission === COMPANY_PERMISSIONS.DISPATCH_WORK ||
      permission === COMPANY_PERMISSIONS.APPROVE_DELIVERY
    ) {
      if (normalized === "workspace lead" || normalized === "product manager" || normalized === "team lead") return true;
    }
    if (permission === COMPANY_PERMISSIONS.UPDATE_DELIVERY && (normalized === "developer" || normalized === "software engineer")) return true;
    if (permission === COMPANY_PERMISSIONS.VERIFY_DELIVERY
      && (normalized === "developer" || normalized === "software engineer" || normalized === "qa" || normalized === "qa engineer")) return true;
    return roleGrantsDeliveryPermissionByLegacyAlias(role, permission);
  }
  if (permission === COMPANY_PERMISSIONS.CREATE_WORKSPACES) {
    return isCompanyAdminRole(role) || role.permissions.includes("projects.create");
  }
  return false;
}

export function teamMembershipGrantsPermission(
  role: Doc<"teamMemberships">["role"],
  permission: CompanyPermission
): boolean {
  if (permission === COMPANY_PERMISSIONS.DISPATCH_WORK) {
    return role === "LEAD" || role === "PM" || role === "DEVELOPER";
  }
  if (permission === COMPANY_PERMISSIONS.UPDATE_DELIVERY) {
    return role === "LEAD" || role === "PM" || role === "DEVELOPER";
  }
  if (permission === COMPANY_PERMISSIONS.VERIFY_DELIVERY) {
    return role !== "VIEWER";
  }
  if (permission === COMPANY_PERMISSIONS.APPROVE_DELIVERY) {
    return role === "LEAD" || role === "PM";
  }
  if (permission === COMPANY_PERMISSIONS.MANAGE_TEAMS || permission === COMPANY_PERMISSIONS.ASSIGN_DELIVERY) {
    return role === "LEAD" || role === "PM";
  }
  return false;
}

export async function getOperatorRoles(
  ctx: CompanyCtx,
  operator: Doc<"operators">,
  tenantId: Id<"tenants">,
  scope?: { projectId?: Id<"projects">; teamId?: Id<"scrumTeams">; repositoryId?: Id<"workspaceRepositories"> }
) {
  const assignments = await ctx.db
    .query("roleAssignments")
    .withIndex("by_operator", (q) => q.eq("operatorId", operator._id))
    .collect();
  const applicable = assignments.filter((assignment) => {
    if (!assignment.scope) return true;
    if (assignment.scope.type === "tenant") return assignment.scope.id === tenantId;
    if (assignment.scope.type === "project") return assignment.scope.id === scope?.projectId;
    if (assignment.scope.type === "team") return assignment.scope.id === scope?.teamId;
    if (assignment.scope.type === "repository") return assignment.scope.id === scope?.repositoryId;
    return false;
  });
  const roles = (
    await Promise.all(applicable.map((assignment) => ctx.db.get(assignment.roleId)))
  ).filter((role): role is Doc<"roles"> => Boolean(role && role.tenantId === tenantId));
  return roles;
}

function roleGrantsFactoryPermission(
  role: Doc<"roles">,
  permission: FactoryPermission
): boolean {
  if (role.permissions.includes(permission) || isCompanyAdminRole(role)) return true;

  const deliveryPermission: Partial<Record<FactoryPermission, CompanyPermission>> = {
    [FACTORY_PERMISSIONS.IMPROVE]: COMPANY_PERMISSIONS.UPDATE_DELIVERY,
    [FACTORY_PERMISSIONS.APPROVE]: COMPANY_PERMISSIONS.APPROVE_DELIVERY,
    [FACTORY_PERMISSIONS.MANAGE_AUTOMATION]: COMPANY_PERMISSIONS.MANAGE_WORKSPACES,
  };
  const mappedPermission = deliveryPermission[permission];
  if (mappedPermission && roleGrantsPermission(role, mappedPermission)) return true;

  const legacyPermissionAliases: Record<FactoryPermission, string[]> = {
    [FACTORY_PERMISSIONS.VIEW]: [
      "missions.read",
      "missions.write",
      "workorders.read",
      "workorders.write",
      "tasks.read",
      "tasks.view",
      "tasks.write",
      "tasks.update",
      "telemetry.read",
      "evidence.read",
      "evidence.write",
      "approvals.read",
      "approvals.view",
      "approvals.decide",
    ],
    [FACTORY_PERMISSIONS.IMPROVE]: [
      "missions.write",
      "workorders.write",
      "tasks.write",
      "tasks.update",
      "tasks.create",
      "evidence.write",
    ],
    [FACTORY_PERMISSIONS.APPROVE]: [
      "missions.approve",
      "approvals.decide",
    ],
    [FACTORY_PERMISSIONS.MANAGE_AUTOMATION]: [
      "policy.manage",
      "deployments.activate",
      "settings.manage",
    ],
  };
  return legacyPermissionAliases[permission].some((candidate) =>
    role.permissions.includes(candidate)
  );
}

async function getAuthenticatedOperators(ctx: CompanyCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return { identity: null, operators: [] as Doc<"operators">[] };

  const operators = await ctx.db
    .query("operators")
    .withIndex("by_auth_id", (q) => q.eq("authId", identity.subject))
    .collect();
  return { identity, operators: operators.filter((operator) => operator.active) };
}

export async function listCompanyMemberships(ctx: CompanyCtx): Promise<CompanyMembership[]> {
  const { identity, operators } = await getAuthenticatedOperators(ctx);

  if (identity) {
    const memberships = await Promise.all(
      operators.map(async (operator) => {
        const tenant = await ctx.db.get(operator.tenantId);
        if (!tenant?.active) return null;
        const roles = await getOperatorRoles(ctx, operator, tenant._id);
        return {
          tenant,
          operatorId: operator._id,
          roleNames: roles.map((role) => role.name),
          permissions: [...new Set(roles.flatMap((role) => role.permissions))],
          canManageCompany: roles.some(isCompanyAdminRole),
          mode: "AUTHENTICATED" as const,
        };
      })
    );
    const byTenant = new Map<Id<"tenants">, CompanyMembership>();
    for (const membership of memberships.filter((item) => item !== null)) {
      const existing = byTenant.get(membership.tenant._id);
      if (!existing) {
        byTenant.set(membership.tenant._id, membership);
        continue;
      }
      byTenant.set(membership.tenant._id, {
        ...existing,
        operatorId:
          existing.canManageCompany || !membership.canManageCompany
            ? existing.operatorId
            : membership.operatorId,
        roleNames: [...new Set([...existing.roleNames, ...membership.roleNames])],
        permissions: [
          ...new Set([...existing.permissions, ...membership.permissions]),
        ],
        canManageCompany:
          existing.canManageCompany || membership.canManageCompany,
      });
    }
    return [...byTenant.values()];
  }

  if (!anonymousDemoEnabled()) return [];

  const tenants = await ctx.db
    .query("tenants")
    .withIndex("by_active", (q) => q.eq("active", true))
    .collect();
  return tenants.map((tenant) => ({
    tenant,
    roleNames: ["Demo administrator"],
    permissions: Object.values(COMPANY_PERMISSIONS),
    canManageCompany: true,
    mode: "DEMO" as const,
  }));
}

export async function requireCompanyPermission(
  ctx: CompanyCtx,
  tenantId: Id<"tenants">,
  permission: CompanyPermission
): Promise<CompanyMembership> {
  const membership = await requireCompanyAccess(ctx, tenantId);
  if (membership.mode === "DEMO") return membership;

  const operator = membership.operatorId
    ? await ctx.db.get(membership.operatorId)
    : null;
  if (!operator) throw new Error("Authenticated operator membership is required.");
  const roles = await getOperatorRoles(ctx, operator, tenantId);
  if (!roles.some((role) => roleGrantsPermission(role, permission))) {
    throw new Error("Your company role does not permit this action.");
  }
  return membership;
}

export async function requireCompanyAccess(
  ctx: CompanyCtx,
  tenantId: Id<"tenants">,
  options: { manage?: boolean } = {}
): Promise<CompanyMembership> {
  const membership = (await listCompanyMemberships(ctx)).find(
    (item) => item.tenant._id === tenantId
  );
  if (!membership) throw new Error("Company account is unavailable or unauthorized.");
  if (options.manage && !membership.canManageCompany) {
    throw new Error("Company administrator access is required.");
  }
  return membership;
}

export async function requireWorkspaceAccess(
  ctx: CompanyCtx,
  tenantId: Id<"tenants">,
  projectId: Id<"projects">,
  options: { manage?: boolean; permission?: CompanyPermission } = {}
) {
  const membership = await requireCompanyAccess(ctx, tenantId);
  const project = await ctx.db.get(projectId);
  if (!project || project.tenantId !== tenantId) {
    throw new Error("Workspace does not belong to the selected company account.");
  }
  if (membership.mode === "DEMO") return { membership, project, roleNames: membership.roleNames, permissions: membership.permissions };

  const operator = membership.operatorId ? await ctx.db.get(membership.operatorId) : null;
  if (!operator) throw new Error("Authenticated operator membership is required.");
  const roles = await getOperatorRoles(ctx, operator, tenantId, { projectId });
  const memberships = await ctx.db
    .query("teamMemberships")
    .withIndex("by_operator", (q) => q.eq("operatorId", operator._id))
    .collect();
  const activeTeamMemberships = memberships.filter(
    (item) => item.projectId === projectId && item.active && (!item.activeUntil || item.activeUntil > Date.now())
  );
  const memberProfiles = await ctx.db
    .query("orgMembers")
    .withIndex("by_operator", (q) => q.eq("operatorId", operator._id))
    .collect();
  const profileAccess = memberProfiles.some((profile) =>
    profile.active && profile.tenantId === tenantId && profile.projectAccess?.some((entry) => entry.projectId === projectId)
  );
  if (roles.length === 0 && activeTeamMemberships.length === 0 && !profileAccess) {
    throw new Error("Workspace is unavailable or unauthorized.");
  }

  const requestedPermission = options.permission ?? (options.manage ? COMPANY_PERMISSIONS.MANAGE_WORKSPACES : undefined);
  if (requestedPermission && !roles.some((role) => roleGrantsPermission(role, requestedPermission))) {
    const teamCanManage = activeTeamMemberships.some((item) =>
      teamMembershipGrantsPermission(item.role, requestedPermission)
    );
    if (!teamCanManage) throw new Error("Your workspace role does not permit this action.");
  }

  return {
    membership,
    project,
    roleNames: roles.map((role) => role.name),
    permissions: [...new Set(roles.flatMap((role) => role.permissions))],
    teamMemberships: activeTeamMemberships,
    memberProfiles,
  };
}

export async function listAccessibleWorkspaces(
  ctx: CompanyCtx,
  tenantId: Id<"tenants">
) {
  const membership = await requireCompanyAccess(ctx, tenantId);
  const projects = await ctx.db
    .query("projects")
    .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
    .collect();
  if (membership.mode === "DEMO" || membership.canManageCompany) return projects;

  const accessible = [];
  for (const project of projects) {
    try {
      await requireWorkspaceAccess(ctx, tenantId, project._id);
      accessible.push(project);
    } catch {
      // Deliberately omit inaccessible workspaces without leaking their count.
    }
  }
  return accessible;
}

export async function requireWorkspacePermission(
  ctx: CompanyCtx,
  projectId: Id<"projects">,
  permission: FactoryPermission
) {
  const project = await ctx.db.get(projectId);
  if (!project?.tenantId) {
    throw new Error("Workspace is unavailable or unauthorized.");
  }
  const access = await requireWorkspaceAccess(
    ctx,
    project.tenantId,
    projectId
  );
  const { membership } = access;
  if (membership.mode === "DEMO") {
    return {
      membership,
      project,
      actorId: "demo:company-administrator",
      permission,
    };
  }
  const operator = membership.operatorId
    ? await ctx.db.get(membership.operatorId)
    : null;
  if (!operator) throw new Error("Authenticated operator membership is required.");
  if (permission === FACTORY_PERMISSIONS.VIEW) {
    return {
      membership,
      project,
      actorId: String(operator._id),
      permission,
    };
  }
  const roles = await getOperatorRoles(ctx, operator, project.tenantId, { projectId });
  const teamPermission = permission === FACTORY_PERMISSIONS.IMPROVE
    ? COMPANY_PERMISSIONS.UPDATE_DELIVERY
    : permission === FACTORY_PERMISSIONS.APPROVE
      ? COMPANY_PERMISSIONS.APPROVE_DELIVERY
      : undefined;
  const teamAuthorized = teamPermission
    ? access.teamMemberships?.some((item) =>
        teamMembershipGrantsPermission(item.role, teamPermission)
      )
    : false;
  if (
    !roles.some((role) => roleGrantsFactoryPermission(role, permission)) &&
    !teamAuthorized
  ) {
    throw new Error("Your workspace role does not permit this factory action.");
  }
  return {
    membership,
    project,
    actorId: String(operator._id),
    permission,
  };
}
