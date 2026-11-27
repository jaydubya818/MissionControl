import { v } from "convex/values";
import { internalMutation } from "./lib/missionScopedFunctions";

export const expireAssignment = internalMutation({
  args: { assignmentId: v.id("missionAssignments") },
  handler: async (ctx, { assignmentId }) => {
    const assignment = await ctx.db.get(assignmentId);
    if (!assignment?.active || assignment.activeUntil === undefined || assignment.activeUntil > Date.now()) return;
    await ctx.db.patch(assignmentId, { active: false, updatedAt: Date.now() });
    await ctx.db.insert("activities", { tenantId: assignment.tenantId, projectId: assignment.projectId,
      actorType: "SYSTEM", action: "MISSION_COLLABORATOR_EXPIRED", description: "The explicit Mission grant expired.",
      targetType: "MISSION", targetId: assignment.missionId, metadata: { assignmentId } });
  },
});
