import { canAccessMission, type MissionCapability } from "./missionAccess";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { resolveFlag, type FlagRow } from "./flags";
import {
  COMPANY_PERMISSIONS,
  requireWorkspaceAccess,
  type CompanyPermission,
} from "./companyAccess";
import {
  authorizationRequiredFor,
  resolveDeploymentAuthorizationMode,
} from "./authorizationRollout";

type DeliveryCtx = QueryCtx | MutationCtx;

/**
 * Legacy delivery reads remain compatible only while no active operator has
 * been provisioned. As soon as an operator exists, authorization is enforced
 * regardless of the legacy flag so flag-off cannot become a permanent bypass.
 */
export async function requireAuthorizedDeliveryScope(
  ctx: DeliveryCtx,
  projectId: Id<"projects"> | undefined,
  permission?: CompanyPermission
): Promise<(Awaited<ReturnType<typeof requireWorkspaceAccess>> & { missionIds?: Set<string> }) | null> {
  const rows = (await ctx.db.query("featureFlags").collect()) as FlagRow[];
  const flagEnabled = resolveFlag(rows, "control-plane.team-authorization", projectId ?? null).enabled;
  const mode = await resolveDeploymentAuthorizationMode(ctx, flagEnabled);
  const accessKind = permission ? "WRITE" : "READ";
  if (!authorizationRequiredFor(mode, accessKind)) return null;
  if (!projectId) throw new Error("An authorized workspace is required while team authorization is enabled.");
  const project = await ctx.db.get(projectId);
  if (!project?.tenantId) throw new Error("Workspace company assignment is incomplete.");
  const access = await requireWorkspaceAccess(ctx, project.tenantId, project._id, { permission });
  const capability: MissionCapability = !permission ? "READ"
    : permission === COMPANY_PERMISSIONS.UPDATE_DELIVERY ? "CONTRIBUTE"
    : permission === COMPANY_PERMISSIONS.VERIFY_DELIVERY ? "VERIFY" : "OWNER";
  const missions = await ctx.db.query("missions").withIndex("by_project", q => q.eq("projectId", project._id)).collect();
  const missionIds = new Set<string>();
  for (const mission of missions) if (await canAccessMission(ctx, mission, capability)) missionIds.add(mission._id);
  return { ...access, missionIds };
}

export function canAccessDeliveryRecord(
  access: (Omit<NonNullable<Awaited<ReturnType<typeof requireAuthorizedDeliveryScope>>>, "missionIds"> & { missionIds?: Set<string> }) | null,
  record: { _id?: string; missionId?: Id<"missions">; objective?: string; owningTeamId?: Id<"scrumTeams">; ownerMemberId?: Id<"orgMembers"> }
): boolean {
  if (access?.missionIds) {
    const missionId = record.missionId ?? (record.objective !== undefined ? record._id : undefined);
    if (missionId) return access.missionIds.has(missionId);
  }
  if (!access || access.membership.mode === "DEMO" || access.membership.canManageCompany) return true;
  if (access.permissions?.includes(COMPANY_PERMISSIONS.APPROVE_DELIVERY)) return true;
  if (access.roleNames.some((name) => /workspace lead|product manager|company|owner|admin/i.test(name))) return true;
  if (record.owningTeamId && access.teamMemberships?.some((membership) => membership.teamId === record.owningTeamId)) return true;
  if (record.ownerMemberId && access.memberProfiles?.some((profile) => profile._id === record.ownerMemberId)) return true;
  return false;
}

export function assertAuthorizedDeliveryRecord(
  access: (Omit<NonNullable<Awaited<ReturnType<typeof requireAuthorizedDeliveryScope>>>, "missionIds"> & { missionIds?: Set<string> }) | null,
  record: { _id?: string; missionId?: Id<"missions">; objective?: string; owningTeamId?: Id<"scrumTeams">; ownerMemberId?: Id<"orgMembers"> }
) {
  if (!canAccessDeliveryRecord(access, record)) throw new Error("Delivery record is unavailable or unauthorized.");
}

export async function requireAuthorizedDeliveryRecord(
  ctx: DeliveryCtx,
  projectId: Id<"projects"> | undefined,
  record: { _id?: string; missionId?: Id<"missions">; objective?: string; owningTeamId?: Id<"scrumTeams">; ownerMemberId?: Id<"orgMembers"> },
  permission?: CompanyPermission
) {
  const access = await requireAuthorizedDeliveryScope(ctx, projectId, permission);
  assertAuthorizedDeliveryRecord(access, record);
  return access;
}
