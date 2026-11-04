import { makeFunctionReference } from "convex/server";
import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { legacyMissionOwnerOperatorId } from "../lib/missionAccess";

/** Deployment-admin migration only. Dry-run by default; never infer identities from names or roles. */
export const run = internalMutation({
  args: { apply: v.optional(v.boolean()), cursor: v.optional(v.string()) },
  handler: async (ctx, { apply = false, cursor }) => {
    const page = await ctx.db.query("missions").paginate({ numItems: 100, cursor: cursor ?? null });
    const unresolved: string[] = [];
    let ownersBound = 0, assignmentsBound = 0;
    for (const mission of page.page) {
      const project = mission.projectId && await ctx.db.get(mission.projectId);
      if (!mission.tenantId || !project || project.tenantId !== mission.tenantId) { unresolved.push(mission._id); continue; }
      if (mission.ownerOperatorId) {
        const operator = await ctx.db.get(mission.ownerOperatorId);
        if (!operator?.active || operator.tenantId !== mission.tenantId) { unresolved.push(mission._id); continue; }
      }
      if (!mission.ownerOperatorId) {
        const ownerOperatorId = await legacyMissionOwnerOperatorId(ctx, mission);
        if (!ownerOperatorId) { unresolved.push(mission._id); continue; }
        ownersBound++;
        if (apply) await ctx.db.patch(mission._id, { ownerOperatorId });
      }
      const assignments = await ctx.db.query("missionAssignments").withIndex("by_mission", q => q.eq("missionId", mission._id)).collect();
      for (const assignment of assignments) {
        if (apply && assignment.active && assignment.activeUntil !== undefined) await ctx.scheduler.runAt(
          Math.max(Date.now(), assignment.activeUntil), makeFunctionReference<"mutation">("missionAuthorization:expireAssignment"), { assignmentId: assignment._id });
        if (assignment.operatorId || !assignment.active) continue;
        const member = await ctx.db.get(assignment.memberId);
        const operator = member?.operatorId && await ctx.db.get(member.operatorId);
        if (!member?.active || !operator?.active || assignment.tenantId !== mission.tenantId || assignment.projectId !== mission.projectId
          || member.tenantId !== mission.tenantId || member.projectId !== mission.projectId || operator.tenantId !== mission.tenantId) {
          unresolved.push(assignment._id); continue;
        }
        assignmentsBound++;
        if (apply) await ctx.db.patch(assignment._id, { operatorId: operator._id });
      }
    }
    if (apply) await ctx.db.insert("activities", { actorType: "SYSTEM", action: "MISSION_PRINCIPALS_MIGRATED",
      description: `Bound ${ownersBound} owners and ${assignmentsBound} assignments`, metadata: { unresolved, cursor, nextCursor: page.continueCursor } });
    return { apply, ownersBound, assignmentsBound, unresolved, cursor: page.continueCursor, isDone: page.isDone };
  },
});
