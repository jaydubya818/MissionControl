import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;
export type MissionCapability = "READ" | "CONTRIBUTE" | "VERIFY" | "OWNER";
const capabilities: Record<Doc<"missionAssignments">["role"], readonly MissionCapability[]> = {
  OWNER: ["READ"],
  CONTRIBUTOR: ["READ", "CONTRIBUTE"],
  REVIEWER: ["READ", "VERIFY"],
  STAKEHOLDER: ["READ"],
};

export async function legacyMissionOwnerOperatorId(ctx: Ctx, mission: Doc<"missions">) {
  let operatorId = mission.requestedByOperatorId;
  if (mission.ownerMemberId) {
    const member = await ctx.db.get(mission.ownerMemberId);
    if (!member?.active || member.tenantId !== mission.tenantId || member.projectId !== mission.projectId) return null;
    operatorId = member.operatorId;
  } else if (!operatorId && mission.owner) {
    operatorId = ctx.db.normalizeId("operators", mission.owner) ?? undefined;
  }
  const operator = operatorId ? await ctx.db.get(operatorId) : null;
  return operator?.active && operator.tenantId === mission.tenantId ? operator._id : null;
}

export async function missionOwnerOperatorId(ctx: Ctx, mission: Doc<"missions">) {
  if (!mission.tenantId || !mission.projectId || !mission.ownerOperatorId) return null;
  const operator = await ctx.db.get(mission.ownerOperatorId);
  return operator?.active && operator.tenantId === mission.tenantId ? operator._id : null;
}

export async function canAccessMission(ctx: Ctx, mission: Doc<"missions">, capability: MissionCapability = "READ") {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || !mission.tenantId || !mission.projectId) return false;
  const [tenant, project, operators] = await Promise.all([
    ctx.db.get(mission.tenantId), ctx.db.get(mission.projectId),
    ctx.db.query("operators").withIndex("by_auth_id", q => q.eq("authId", identity.subject)).collect(),
  ]);
  if (!tenant?.active || project?.tenantId !== tenant._id) return false;
  const actorIds = new Set(operators.filter(o => o.active && o.tenantId === tenant._id).map(o => o._id));
  if (!actorIds.size) return false;
  const owner = await missionOwnerOperatorId(ctx, mission);
  if (owner && actorIds.has(owner)) return true;
  if (capability === "OWNER") return false;
  const assignments = await ctx.db.query("missionAssignments").withIndex("by_mission", q => q.eq("missionId", mission._id)).collect();
  const now = Date.now();
  for (const assignment of assignments) {
    if (!assignment.active || assignment.activeFrom > now || (assignment.activeUntil !== undefined && assignment.activeUntil <= now)
      || assignment.tenantId !== tenant._id || assignment.projectId !== mission.projectId
      || !capabilities[assignment.role].includes(capability)) continue;
    const member = await ctx.db.get(assignment.memberId);
    if (member?.active && member.tenantId === tenant._id && member.projectId === mission.projectId
      && assignment.operatorId && member.operatorId === assignment.operatorId && actorIds.has(assignment.operatorId)) return true;
  }
  return false;
}

export async function requireMissionAccess(ctx: Ctx, missionId: Id<"missions">, capability: MissionCapability = "READ") {
  const mission = await ctx.db.get(missionId);
  if (!mission || !await canAccessMission(ctx, mission, capability)) throw Error("MISSION_UNAVAILABLE");
  return mission;
}
