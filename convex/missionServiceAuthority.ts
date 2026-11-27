import { v } from "convex/values";
import { mutation } from "./lib/missionScopedFunctions";
import { requireMissionAccess } from "./lib/missionAccess";
import { serviceAttemptBinding, serviceAttemptEffects } from "./lib/missionServiceAuthority";

export const grant = mutation({
  args: { workflowRunId: v.id("workflowRuns"), serviceId: v.string(), capabilities: v.array(v.string()), expiresAt: v.number(), reason: v.string() },
  handler: async (ctx, args) => {
    const binding = await serviceAttemptBinding(ctx, args.workflowRunId);
    await requireMissionAccess(ctx, binding.missionId, "OWNER");
    const now = Date.now();
    const capabilities = [...new Set(args.capabilities)];
    if (!args.serviceId.trim() || !args.reason.trim() || !capabilities.length || !Number.isFinite(args.expiresAt)
      || args.expiresAt <= now || args.expiresAt > now + 86_400_000
      || capabilities.some(capability => !serviceAttemptEffects[capability]
        || (capability.startsWith("verification:") ? "VERIFICATION" : "IMPLEMENTATION") !== binding.attemptPurpose)) throw Error("INVALID_SERVICE_ATTEMPT_GRANT");
    const approvalId = await ctx.db.insert("approvalDecisions", {
      tenantId: binding.tenantId, projectId: binding.projectId, workOrderId: binding.workOrderId, workflowRunId: binding.workflowRunId,
      approvalType: "SERVICE_ATTEMPT_ACCESS", requestedAction: "Execute the explicitly scoped Attempt commands", riskLevel: "LOW",
      requestedBy: binding.ownerOperatorId, approver: binding.ownerOperatorId, status: "APPROVED", decision: "APPROVE",
      workOrderRevisionNumber: binding.workOrderRevisionNumber, expiresAt: args.expiresAt, createdAt: now, decidedAt: now, reason: args.reason,
      metadata: { schema: "mission-service-delegation/v1", ...binding, serviceId: args.serviceId, capabilities,
        allowedEffects: [...new Set(capabilities.flatMap(capability => serviceAttemptEffects[capability]))] },
    });
    await ctx.db.insert("activities", { projectId: binding.projectId, actorType: "HUMAN", actorId: binding.ownerOperatorId,
      action: "MISSION_SERVICE_AUTHORITY_GRANTED", description: args.reason, targetType: "MISSION", targetId: binding.missionId,
      metadata: { approvalId, workflowRunId: binding.workflowRunId, serviceId: args.serviceId, capabilities, expiresAt: args.expiresAt } });
    return approvalId;
  },
});
export const revoke = mutation({
  args: { approvalId: v.id("approvalDecisions"), reason: v.string() },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval || approval.approvalType !== "SERVICE_ATTEMPT_ACCESS" || !approval.workflowRunId || !args.reason.trim()) throw Error("SERVICE_ATTEMPT_UNAVAILABLE");
    const run = await ctx.db.get(approval.workflowRunId);
    if (!run?.missionId) throw Error("SERVICE_ATTEMPT_UNAVAILABLE");
    await requireMissionAccess(ctx, run.missionId, "OWNER");
    await ctx.db.patch(approval._id, { revokedAt: Date.now() });
    await ctx.db.insert("activities", { projectId: approval.projectId, actorType: "HUMAN", actorId: (await ctx.auth.getUserIdentity())!.subject,
      action: "MISSION_SERVICE_AUTHORITY_REVOKED", description: args.reason, targetType: "MISSION", targetId: run.missionId,
      metadata: { approvalId: approval._id } });
  },
});
