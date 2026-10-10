import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/** Delivery's owner field is a display name when a member is assigned. The
 * member's scoped operator relation supplies accounting identity instead. */
export async function enterpriseMissionOwner(ctx: MutationCtx | QueryCtx, mission: any): Promise<string> {
  if (!mission?.ownerMemberId) {
    if (!mission?.owner) throw Error("ENTERPRISE_OWNER_UNAVAILABLE");
    return mission.owner;
  }
  const member = await ctx.db.get(mission.ownerMemberId as Id<"orgMembers">);
  if (!member?.active || member.projectId !== mission.projectId || member.tenantId !== mission.tenantId || !member.operatorId) {
    throw Error("ENTERPRISE_OWNER_UNAVAILABLE");
  }
  const operator = await ctx.db.get(member.operatorId);
  if (!operator?.active || operator.tenantId !== mission.tenantId) throw Error("ENTERPRISE_OWNER_UNAVAILABLE");
  return String(operator._id);
}
