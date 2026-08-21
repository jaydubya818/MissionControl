import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { resolveFlag, type FlagRow } from "./flags";
import { requireWorkspaceAccess, type CompanyPermission } from "./companyAccess";
import {
  authorizationIsEnforced,
  resolveDeploymentAuthorizationMode,
} from "./authorizationRollout";

type DeliveryCtx = QueryCtx | MutationCtx;

/**
 * Authorization gate for governed Mission/WorkOrder functions.
 *
 * Enforcement is no longer purely flag-driven. It is on whenever the flag is
 * on, AND — regardless of the flag — whenever the deployment has provisioned at
 * least one active operator. A deployment with no operator is a fresh or
 * unmigrated install where every check would refuse everyone; that is the only
 * state in which legacy unscoped access is retained, and it resolves itself the
 * moment an owner is created. See `lib/authorizationRollout.ts`.
 */
export async function requireAuthorizedDeliveryScope(
  ctx: DeliveryCtx,
  projectId: Id<"projects"> | undefined,
  permission?: CompanyPermission
) {
  const rows = (await ctx.db
    .query("featureFlags")
    .withIndex("by_key", (q) => q.eq("key", "control-plane.team-authorization"))
    .collect()) as FlagRow[];
  const flagEnabled = resolveFlag(
    rows,
    "control-plane.team-authorization",
    projectId ?? null,
  ).enabled;
  const mode = await resolveDeploymentAuthorizationMode(ctx, flagEnabled);
  if (!authorizationIsEnforced(mode)) return null;
  if (!projectId) throw new Error("An authorized workspace is required while team authorization is enabled.");
  const project = await ctx.db.get(projectId);
  if (!project?.tenantId) throw new Error("Workspace company assignment is incomplete.");
  return await requireWorkspaceAccess(ctx, project.tenantId, project._id, { permission });
}

/**
 * Record-level *narrowing* on top of the workspace check.
 *
 * `requireAuthorizedDeliveryScope` has already established that the caller
 * holds the required permission in this record's workspace. This function only
 * narrows further when the record declares an owner — a team or a member — so
 * that team-scoped work stays within its team.
 *
 * A record with no `owningTeamId` and no `ownerMemberId` has nothing to narrow
 * by, so it is accessible to anyone the workspace check already authorized.
 * This previously returned `false` for that case, which — now that the delivery
 * gate actually enforces rather than returning null while a flag was off —
 * would deny every unowned WorkOrder to every operator who is not a company
 * admin or whose role name happens to match the heuristic below. Delivery
 * records are unowned by default, so that is the common case, not the edge one.
 */
export function canAccessDeliveryRecord(
  access: Awaited<ReturnType<typeof requireAuthorizedDeliveryScope>>,
  record: { owningTeamId?: Id<"scrumTeams">; ownerMemberId?: Id<"orgMembers"> }
): boolean {
  if (!access || access.membership.mode === "DEMO" || access.membership.canManageCompany) return true;
  if (access.roleNames.some((name) => /workspace lead|product manager|company|owner|admin/i.test(name))) return true;
  if (record.owningTeamId && access.teamMemberships?.some((membership) => membership.teamId === record.owningTeamId)) return true;
  if (record.ownerMemberId && access.memberProfiles?.some((profile) => profile._id === record.ownerMemberId)) return true;
  // Unowned record: the workspace-scope permission check is the whole check.
  return !record.owningTeamId && !record.ownerMemberId;
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
