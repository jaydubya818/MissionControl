import { v } from "convex/values";
import { mutation, query } from "./lib/missionScopedFunctions";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ACTIVE_RUN_STATUSES } from "./lib/workOrderDispatch";
import { buildExecutionRoutingPreview } from "./lib/executionRouting";
import {
  COMPANY_PERMISSIONS,
  FACTORY_PERMISSIONS,
  requireWorkspacePermission,
} from "./lib/companyAccess";
import {
  assertAuthorizedDeliveryRecord,
  requireAuthorizedDeliveryScope,
} from "./lib/deliveryAuthorization";

async function loadWorkOrderAndWorkflow(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  workOrderId: Id<"workOrders">,
) {
  const workOrder = await ctx.db.get(workOrderId);
  if (!workOrder?.projectId) throw new Error("WorkOrder is unavailable or unauthorized.");
  const workflow = workOrder.workflowId
    ? await ctx.db.query("workflows")
      .withIndex("by_workflow_id", (query: any) => query.eq("workflowId", workOrder.workflowId))
      .first()
    : null;
  if (!workflow?.active) throw new Error("WorkOrder requires an active workflow before routing.");
  return { workOrder, workflow, projectId: workOrder.projectId as Id<"projects"> };
}

/** Read-only, non-authoritative preview. Actual dispatch persists a frozen decision. */
export const previewForWorkOrder = query({
  args: {
    workOrderId: v.id("workOrders"),
    fallbackFactoryDefinitionVersionId: v.optional(v.id("factoryDefinitionVersions")),
  },
  handler: async (ctx, args) => {
    const { workOrder, workflow, projectId } = await loadWorkOrderAndWorkflow(ctx, args.workOrderId);
    await requireWorkspacePermission(ctx, projectId, FACTORY_PERMISSIONS.VIEW);
    const access = await requireAuthorizedDeliveryScope(ctx, projectId);
    assertAuthorizedDeliveryRecord(access, workOrder);
    return buildExecutionRoutingPreview(ctx, {
      workOrder,
      workflow,
      fallbackFactoryDefinitionVersionId: args.fallbackFactoryDefinitionVersionId,
    });
  },
});

/**
 * Pins an exact immutable Factory Version. Pinning is ranking authority only;
 * current eligibility is reevaluated and can still block dispatch.
 */
export const setPinnedTuple = mutation({
  args: {
    workOrderId: v.id("workOrders"),
    factoryDefinitionVersionId: v.optional(v.id("factoryDefinitionVersions")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { workOrder, workflow, projectId } = await loadWorkOrderAndWorkflow(ctx, args.workOrderId);
    const permission = await requireWorkspacePermission(
      ctx,
      projectId,
      FACTORY_PERMISSIONS.APPROVE,
    );
    const deliveryAccess = await requireAuthorizedDeliveryScope(
      ctx,
      projectId,
      COMPANY_PERMISSIONS.APPROVE_DELIVERY,
    );
    assertAuthorizedDeliveryRecord(deliveryAccess, workOrder);
    const runs = await ctx.db.query("workflowRuns")
      .withIndex("by_work_order", (query) => query.eq("workOrderId", workOrder._id))
      .collect();
    if (runs.some((run) => ACTIVE_RUN_STATUSES.includes(run.status as any))) {
      throw new Error("Cancel or complete the active Attempt before changing its execution route.");
    }
    const now = Date.now();
    if (!args.factoryDefinitionVersionId) {
      await ctx.db.patch(workOrder._id, { executionRoutingPin: undefined, updatedAt: now });
      await ctx.db.insert("activities", {
        tenantId: workOrder.tenantId,
        projectId: workOrder.projectId,
        actorType: "HUMAN",
        actorId: permission.actorId,
        action: "WORK_ORDER_EXECUTION_ROUTE_PIN_CLEARED",
        description: `Cleared the execution route pin for ${workOrder.title}`,
        targetType: "WORK_ORDER",
        targetId: workOrder._id,
      });
      return { cleared: true };
    }
    if (!args.reason?.trim() || args.reason.trim().length > 1_000) {
      throw new Error("An execution route pin reason between 1 and 1,000 characters is required.");
    }
    const version = await ctx.db.get(args.factoryDefinitionVersionId);
    if (
      !version
      || version.projectId !== workOrder.projectId
      || version.repositoryId !== workOrder.repositoryId
      || version.workflowId !== workflow._id
    ) {
      throw new Error("Factory Version is unavailable or outside the WorkOrder scope.");
    }
    const definition = await ctx.db.get(version.factoryDefinitionId);
    if (definition?.status !== "ACTIVE" || definition.activeVersionId !== version._id) {
      throw new Error("Only an active exact Factory Version can be pinned.");
    }
    const pin = {
      factoryDefinitionVersionId: version._id,
      factoryConfigurationDigest: version.configurationDigest,
      reason: args.reason.trim(),
      pinnedBy: permission.actorId,
      pinnedAt: now,
    };
    await ctx.db.patch(workOrder._id, { executionRoutingPin: pin, updatedAt: now });
    await ctx.db.insert("activities", {
      tenantId: workOrder.tenantId,
      projectId: workOrder.projectId,
      actorType: "HUMAN",
      actorId: permission.actorId,
      action: "WORK_ORDER_EXECUTION_ROUTE_PINNED",
      description: `Pinned ${workOrder.title} to Factory Version ${version.version}`,
      targetType: "WORK_ORDER",
      targetId: workOrder._id,
      metadata: {
        factoryDefinitionVersionId: version._id,
        factoryConfigurationDigest: version.configurationDigest,
        reason: args.reason.trim(),
      },
    });
    return { cleared: false, pin };
  },
});

/** Guarded Auto promotion is an explicit policy-version transition. */
export const promoteGuardedAuto = mutation({
  args: {
    projectId: v.id("projects"),
    reason: v.string(),
    evidenceDecisionIds: v.array(v.id("modelRoutingDecisions")),
  },
  handler: async (ctx, args) => {
    const permission = await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.MANAGE_AUTOMATION,
    );
    if (!args.reason.trim() || args.reason.trim().length > 1_000) {
      throw new Error("A promotion reason between 1 and 1,000 characters is required.");
    }
    if (
      !args.evidenceDecisionIds.length
      || args.evidenceDecisionIds.length > 25
      || new Set(args.evidenceDecisionIds.map(String)).size !== args.evidenceDecisionIds.length
    ) {
      throw new Error("Promotion requires between 1 and 25 unique reviewed routing decisions.");
    }
    const evidence = await Promise.all(args.evidenceDecisionIds.map((id) => ctx.db.get(id)));
    if (evidence.some((decision) =>
      !decision
      || decision.projectId !== args.projectId
      || !decision.algorithmVersion
      || !decision.decisionDigest
    )) {
      throw new Error("Promotion evidence is missing, cross-workspace, or not reproducible.");
    }
    const current = await ctx.db.query("modelRoutingPolicies")
      .withIndex("by_project_status", (query) => query.eq("projectId", args.projectId).eq("status", "ACTIVE"))
      .order("desc")
      .first();
    if (!current) throw new Error("Activate an Advisory routing policy before promotion.");
    const now = Date.now();
    await ctx.db.patch(current._id, { status: "ARCHIVED", updatedAt: now });
    const policyId = await ctx.db.insert("modelRoutingPolicies", {
      projectId: current.projectId,
      name: current.name,
      status: "ACTIVE",
      defaultModelId: current.defaultModelId,
      safeFallbackModelId: current.safeFallbackModelId,
      rules: current.rules,
      lanePools: current.lanePools,
      fallbackChain: current.fallbackChain,
      budgetLimitUsd: current.budgetLimitUsd,
      latencyTargetMs: current.latencyTargetMs,
      executionRouting: {
        ...(current.executionRouting ?? {
          mode: "ADVISORY" as const,
          evidenceWindowDays: 30,
          minimumVerifiedAttempts: 5,
          minimumEvidenceCoverage: 0.6,
          minimumScoreMargin: 5,
        }),
        mode: "GUARDED_AUTO" as const,
        guardedAutoPromotedAt: now,
        guardedAutoPromotedBy: permission.actorId,
        guardedAutoPromotionReason: args.reason.trim(),
        guardedAutoEvidenceDecisionIds: args.evidenceDecisionIds,
      },
      canaryPercent: current.canaryPercent,
      killSwitch: current.killSwitch,
      version: current.version + 1,
      createdBy: permission.actorId,
      updatedBy: permission.actorId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("activities", {
      tenantId: permission.project.tenantId,
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: permission.actorId,
      action: "EXECUTION_ROUTING_GUARDED_AUTO_PROMOTED",
      description: `Promoted execution routing policy to Guarded Auto v${current.version + 1}`,
      targetType: "MODEL_ROUTING_POLICY",
      targetId: policyId,
      metadata: { reason: args.reason.trim(), evidenceDecisionIds: args.evidenceDecisionIds },
    });
    return await ctx.db.get(policyId);
  },
});
