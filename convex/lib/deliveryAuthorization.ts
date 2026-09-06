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
) {
  const rows = (await ctx.db.query("featureFlags").collect()) as FlagRow[];
  const flagEnabled = resolveFlag(rows, "control-plane.team-authorization", projectId ?? null).enabled;
  const mode = await resolveDeploymentAuthorizationMode(ctx, flagEnabled);
  const accessKind = permission ? "WRITE" : "READ";
  if (!authorizationRequiredFor(mode, accessKind)) return null;
  if (!projectId) throw new Error("An authorized workspace is required while team authorization is enabled.");
  const project = await ctx.db.get(projectId);
  if (!project?.tenantId) throw new Error("Workspace company assignment is incomplete.");
  return await requireWorkspaceAccess(ctx, project.tenantId, project._id, { permission });
}

export function canAccessDeliveryRecord(
  access: Awaited<ReturnType<typeof requireAuthorizedDeliveryScope>>,
  record: { owningTeamId?: Id<"scrumTeams">; ownerMemberId?: Id<"orgMembers"> }
): boolean {
  if (!access || access.membership.mode === "DEMO" || access.membership.canManageCompany) return true;
  if (access.permissions?.includes(COMPANY_PERMISSIONS.APPROVE_DELIVERY)) return true;
  if (access.roleNames.some((name) => /workspace lead|product manager|company|owner|admin/i.test(name))) return true;
  if (record.owningTeamId && access.teamMemberships?.some((membership) => membership.teamId === record.owningTeamId)) return true;
  if (record.ownerMemberId && access.memberProfiles?.some((profile) => profile._id === record.ownerMemberId)) return true;
  return false;
}

export function assertAuthorizedDeliveryRecord(
  access: Awaited<ReturnType<typeof requireAuthorizedDeliveryScope>>,
  record: { owningTeamId?: Id<"scrumTeams">; ownerMemberId?: Id<"orgMembers"> }
) {
  if (!canAccessDeliveryRecord(access, record)) throw new Error("Delivery record is unavailable or unauthorized.");
}

export async function requireAuthorizedDeliveryRecord(
  ctx: DeliveryCtx,
  projectId: Id<"projects"> | undefined,
  record: { owningTeamId?: Id<"scrumTeams">; ownerMemberId?: Id<"orgMembers"> },
  permission?: CompanyPermission
) {
  const access = await requireAuthorizedDeliveryScope(ctx, projectId, permission);
  assertAuthorizedDeliveryRecord(access, record);
  return access;
}
