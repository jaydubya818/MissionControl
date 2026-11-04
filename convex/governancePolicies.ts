import { v } from "convex/values";
import { mutation, query } from "./lib/missionScopedFunctions";
import { COMPANY_PERMISSIONS, requireWorkspaceAccess } from "./lib/companyAccess";
import { isCompanyContextEnforced } from "./lib/companyContextGate";
import { DEFAULT_GOVERNANCE_POLICY } from "./lib/workOrderRevision";

const VERIFICATION_FIRST_V1_PROFILE = {
  ...DEFAULT_GOVERNANCE_POLICY,
  approvalValidityHoursByRisk: {
    LOW: 24 * 14,
    MEDIUM: 24 * 7,
    HIGH: 24 * 3,
    CRITICAL: 24,
  },
  verificationValidityHours: 24 * 7,
  approvalExpiringSoonHours: 24,
  evidenceExpiringSoonHours: 24,
  requireReapprovalAfterMaterialChange: true,
  requireReverificationAfterCodeChange: true,
  requireReverificationAfterWorkflowChange: true,
  requireReverificationAfterEnvironmentChange: true,
  fullReopenOnAcceptedWorkOrderChange: true,
} as const;

async function requirePolicyAdministration(ctx: any, project: any, access: "READ" | "WRITE") {
  if (!(await isCompanyContextEnforced(ctx, project._id, access))) return;
  if (!project.tenantId) throw new Error("Workspace company assignment is required before configuring governance.");
  await requireWorkspaceAccess(ctx, project.tenantId, project._id, {
    permission: COMPANY_PERMISSIONS.MANAGE_WORKSPACES,
  });
}

export const getActiveForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Workspace not found.");
    await requirePolicyAdministration(ctx, project, "READ");
    return await ctx.db
      .query("governancePolicies")
      .withIndex("by_project_active", (q) => q.eq("projectId", args.projectId).eq("active", true))
      .first();
  },
});

export const activateVerificationFirstV1 = mutation({
  args: {
    projectId: v.id("projects"),
    requestedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Workspace not found.");
    await requirePolicyAdministration(ctx, project, "WRITE");

    const existingPolicies = await ctx.db
      .query("governancePolicies")
      .withIndex("by_project_active", (q) => q.eq("projectId", args.projectId).eq("active", true))
      .collect();
    const current = existingPolicies.find(
      (policy) => policy.metadata?.profileKey === "verification-first-v1"
    );
    if (current) return { policyId: current._id, created: false };

    const now = Date.now();
    for (const policy of existingPolicies) {
      await ctx.db.patch(policy._id, { active: false, updatedAt: now });
    }

    const policyId = await ctx.db.insert("governancePolicies", {
      tenantId: project.tenantId,
      projectId: args.projectId,
      name: "Verification-First V1",
      scope: "PROJECT",
      active: true,
      ...VERIFICATION_FIRST_V1_PROFILE,
      createdAt: now,
      updatedAt: now,
      metadata: {
        profileKey: "verification-first-v1",
        profileVersion: 1,
        requestedBy: args.requestedBy ?? "operator",
      },
    });
    return { policyId, created: true };
  },
});
