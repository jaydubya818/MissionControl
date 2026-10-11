import type { MutationCtx, QueryCtx } from "../_generated/server";
import { missionOwnerOperatorId } from "./missionAccess";

export async function enterpriseMissionOwner(ctx: MutationCtx | QueryCtx, mission: any): Promise<string> {
  const owner = mission && await missionOwnerOperatorId(ctx, mission);
  if (!owner) throw Error("ENTERPRISE_OWNER_UNAVAILABLE");
  return owner;
}
