import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireEnterpriseQualificationOwner } from "../lib/enterpriseQualificationAccess";
import { requireWorkspacePermission, FACTORY_PERMISSIONS } from "../lib/companyAccess";
import { getCurrentVerificationRoutingOutcome, appendCurrentVerificationQualityGateDecision } from "../lib/currentVerification";

/** Evaluates the canonical enterprise gate only in the marked isolated project.
 * Does not accept a WorkOrder, publish a candidate, or alter evidence authority. */
export const evaluate = mutation({ args: { workOrderId: v.id("workOrders"), idempotencyKey: v.string() }, handler: async (ctx, args) => {
    const workOrder = await ctx.db.get(args.workOrderId);
    if (!workOrder?.projectId) throw Error("ENTERPRISE_QUALIFICATION_SCOPE_DENIED");
    await requireWorkspacePermission(ctx, workOrder.projectId, FACTORY_PERMISSIONS.APPROVE);
  await requireEnterpriseQualificationOwner(ctx, workOrder);
  const now = Date.now();
  const current = await getCurrentVerificationRoutingOutcome(ctx, workOrder, now, "ACCEPTANCE", true);
  const gate = await appendCurrentVerificationQualityGateDecision(ctx, workOrder, current, args.idempotencyKey, now, "ISOLATED_ENTERPRISE_QUALIFICATION");
  return { current, gate, qualificationOnly: true, productionAuthority: "NONE" };
} });
