import type { MutationCtx, QueryCtx } from "../_generated/server";
import { enterpriseProject } from "./enterpriseAttemptAccounting";
import { enterpriseMissionOwner } from "./enterpriseMissionOwner";
import { requireWorkspacePermission, FACTORY_PERMISSIONS } from "./companyAccess";

export async function requireEnterpriseQualificationOwner(ctx: MutationCtx | QueryCtx, workOrder: any) {
  if (process.env.MC_NATIVE_SUCCESSOR_QUALIFICATION !== "1" || !workOrder?.projectId || !workOrder.missionId
    || workOrder.verificationContract?.schemaVersion !== 2 || workOrder.verificationContract.enforcementMode !== "ENFORCED"
    || !await enterpriseProject(ctx, workOrder.projectId)) throw Error("ENTERPRISE_QUALIFICATION_SCOPE_DENIED");
  const access = await requireWorkspacePermission(ctx, workOrder.projectId, FACTORY_PERMISSIONS.APPROVE);
  const mission: any = await ctx.db.get(workOrder.missionId);
  if (!mission || mission.projectId !== workOrder.projectId || mission.tenantId !== workOrder.tenantId
    || await enterpriseMissionOwner(ctx, mission) !== access.actorId || access.membership.mode !== "AUTHENTICATED") {
    throw Error("ENTERPRISE_QUALIFICATION_OWNER_REQUIRED");
  }
  return access;
}
