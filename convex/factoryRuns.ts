import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { COMPANY_PERMISSIONS } from "./lib/companyAccess";
import { requireAuthorizedDeliveryScope } from "./lib/deliveryAuthorization";
import { computeCanonicalHash } from "./lib/genomeHash";
import {
  evaluateFactoryDependency,
  summarizeFactoryRun,
  type FactoryDependencyType,
} from "./lib/factoryLifecycle";

const dependencyTypeValidator = v.union(
  v.literal("ACCEPTED_OUTPUT_REQUIRED"),
  v.literal("EXECUTION_COMPLETE"),
  v.literal("ARTIFACT_AVAILABLE"),
  v.literal("OPTIONAL"),
  v.literal("INFORMATIONAL"),
);

const runStateValidator = v.union(
  v.literal("PLANNED"), v.literal("RUNNING"), v.literal("PAUSED"),
  v.literal("DRAINING"), v.literal("ACCEPTED"), v.literal("PRODUCT_FAILED"),
  v.literal("FACTORY_FAILED"), v.literal("BLOCKED"), v.literal("CANCELLED"),
  v.literal("SUPERSEDED"),
);

async function loadRunModel(ctx: any, factoryRun: any) {
  const [members, dependencies] = await Promise.all([
    ctx.db.query("factoryRunWorkOrders").withIndex("by_run", (q: any) => q.eq("factoryRunId", factoryRun._id)).collect(),
    ctx.db.query("workOrderDependencies").withIndex("by_run", (q: any) => q.eq("factoryRunId", factoryRun._id)).collect(),
  ]);
  const workOrders = (await Promise.all(members.map((member: any) => ctx.db.get(member.workOrderId)))).filter(Boolean);
  return {
    factoryRun,
    members,
    dependencies,
    workOrders,
    summary: summarizeFactoryRun({ factoryRunId: factoryRun._id, members, workOrders, dependencies }),
  };
}

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    missionId: v.optional(v.id("missions")),
    missionPlanId: v.optional(v.id("missionPlans")),
    sourcePlanRevision: v.number(),
    runKey: v.string(),
    title: v.string(),
    memberWorkOrderIds: v.array(v.id("workOrders")),
    dependencies: v.optional(v.array(v.object({
      workOrderId: v.id("workOrders"),
      dependsOnWorkOrderId: v.id("workOrders"),
      dependencyType: v.optional(dependencyTypeValidator),
      requiredRevisionNumber: v.optional(v.number()),
    }))),
    actorId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuthorizedDeliveryScope(ctx, args.projectId, COMPANY_PERMISSIONS.UPDATE_DELIVERY);
    if (!args.runKey.trim() || !args.title.trim()) throw new Error("Factory Run identity and title are required.");
    if (!Number.isSafeInteger(args.sourcePlanRevision) || args.sourcePlanRevision < 1) throw new Error("A positive source Plan revision is required.");
    if (!args.memberWorkOrderIds.length) throw new Error("A Factory Run requires at least one explicit WorkOrder member.");
    if (new Set(args.memberWorkOrderIds.map(String)).size !== args.memberWorkOrderIds.length) throw new Error("Factory Run membership contains duplicate WorkOrders.");
    const existing = await ctx.db.query("factoryRuns").withIndex("by_run_key", (q) => q.eq("runKey", args.runKey.trim())).first();
    if (existing) return await loadRunModel(ctx, existing);
    const workOrders = await Promise.all(args.memberWorkOrderIds.map((workOrderId) => ctx.db.get(workOrderId)));
    if (workOrders.some((workOrder) => !workOrder || workOrder.projectId !== args.projectId)) throw new Error("Every Factory Run member must belong to the selected workspace.");
    if (args.missionPlanId) {
      const plan = await ctx.db.get(args.missionPlanId);
      if (!plan || plan.projectId !== args.projectId || plan.status !== "APPROVED" || plan.revisionNumber !== args.sourcePlanRevision) {
        throw new Error("Factory Run membership must bind to the exact approved Plan revision.");
      }
      const released = new Set((plan.releasedWorkOrderIds ?? []).map(String));
      if (args.memberWorkOrderIds.some((workOrderId) => !released.has(String(workOrderId)))) {
        throw new Error("Factory Run membership contains a WorkOrder outside the approved Plan release.");
      }
    }
    const memberSet = new Set(args.memberWorkOrderIds.map(String));
    for (const dependency of args.dependencies ?? []) {
      if (!memberSet.has(String(dependency.workOrderId)) || !memberSet.has(String(dependency.dependsOnWorkOrderId))) {
        throw new Error("Factory Run dependencies must remain inside the explicit membership snapshot.");
      }
      if (dependency.workOrderId === dependency.dependsOnWorkOrderId) throw new Error("A WorkOrder cannot depend on itself.");
    }
    const now = Date.now();
    const membershipSnapshot = workOrders.map((workOrder, index) => ({
      workOrderId: String(workOrder!._id),
      workOrderRevisionNumber: workOrder!.currentRevisionNumber ?? 1,
      sequence: index + 1,
      sourcePlanRevision: args.sourcePlanRevision,
    }));
    const membershipDigest = `sha256:${computeCanonicalHash(membershipSnapshot)}`;
    const factoryRunId = await ctx.db.insert("factoryRuns", {
      tenantId: workOrders[0]?.tenantId,
      projectId: args.projectId,
      missionId: args.missionId,
      missionPlanId: args.missionPlanId,
      sourcePlanRevision: args.sourcePlanRevision,
      runKey: args.runKey.trim(),
      title: args.title.trim(),
      state: "PLANNED",
      membershipDigest,
      createdBy: args.actorId,
      createdAt: now,
      updatedAt: now,
    });
    for (const [index, workOrder] of workOrders.entries()) {
      await ctx.db.insert("factoryRunWorkOrders", {
        tenantId: workOrder!.tenantId,
        projectId: args.projectId,
        factoryRunId,
        workOrderId: workOrder!._id,
        workOrderRevisionNumber: workOrder!.currentRevisionNumber ?? 1,
        sourcePlanRevision: args.sourcePlanRevision,
        sequence: index + 1,
        addedAt: now,
        addedBy: args.actorId,
        membershipDigest,
      });
    }
    for (const dependency of args.dependencies ?? []) {
      const predecessor = workOrders.find((workOrder) => workOrder?._id === dependency.dependsOnWorkOrderId)!;
      await ctx.db.insert("workOrderDependencies", {
        tenantId: predecessor.tenantId,
        projectId: args.projectId,
        factoryRunId,
        workOrderId: dependency.workOrderId,
        dependsOnWorkOrderId: dependency.dependsOnWorkOrderId,
        dependencyType: dependency.dependencyType ?? "ACCEPTED_OUTPUT_REQUIRED",
        requiredRevisionNumber: dependency.requiredRevisionNumber ?? predecessor.currentRevisionNumber ?? 1,
        sourcePlanRevision: args.sourcePlanRevision,
        createdBy: args.actorId,
        createdAt: now,
      });
    }
    await ctx.db.insert("activities", {
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: args.actorId,
      action: "FACTORY_RUN_CREATED",
      description: `Created Factory Run ${args.title.trim()} with ${workOrders.length} explicit WorkOrder members`,
      targetType: "FACTORY_RUN",
      targetId: factoryRunId,
      metadata: { membershipDigest, sourcePlanRevision: args.sourcePlanRevision },
    });
    return await loadRunModel(ctx, await ctx.db.get(factoryRunId));
  },
});

export const list = query({
  args: { projectId: v.id("projects"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAuthorizedDeliveryScope(ctx, args.projectId);
    const runs = await ctx.db.query("factoryRuns").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).order("desc").take(args.limit ?? 25);
    return await Promise.all(runs.map((run) => loadRunModel(ctx, run)));
  },
});

export const get = query({
  args: { factoryRunId: v.id("factoryRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.factoryRunId);
    if (!run) return null;
    await requireAuthorizedDeliveryScope(ctx, run.projectId);
    const model = await loadRunModel(ctx, run);
    const workOrdersById = new Map(model.workOrders.map((workOrder: any) => [String(workOrder._id), workOrder]));
    return {
      ...model,
      dependencies: model.dependencies.map((dependency: any) => ({
        ...dependency,
        evaluation: evaluateFactoryDependency({
          dependency: { ...dependency, dependencyType: dependency.dependencyType as FactoryDependencyType },
          predecessor: workOrdersById.get(String(dependency.dependsOnWorkOrderId)),
        }),
      })),
    };
  },
});

export const setOperationalState = mutation({
  args: {
    factoryRunId: v.id("factoryRuns"),
    state: runStateValidator,
    reason: v.string(),
    actorId: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.factoryRunId);
    if (!run) throw new Error("Factory Run not found.");
    await requireAuthorizedDeliveryScope(ctx, run.projectId, COMPANY_PERMISSIONS.UPDATE_DELIVERY);
    if (!args.reason.trim()) throw new Error("An auditable state-change reason is required.");
    const now = Date.now();
    await ctx.db.patch(run._id, {
      state: args.state,
      terminalReasonCode: ["ACCEPTED", "PRODUCT_FAILED", "FACTORY_FAILED", "BLOCKED", "CANCELLED", "SUPERSEDED"].includes(args.state) ? args.state : undefined,
      terminalSummary: ["ACCEPTED", "PRODUCT_FAILED", "FACTORY_FAILED", "BLOCKED", "CANCELLED", "SUPERSEDED"].includes(args.state) ? args.reason.trim() : undefined,
      startedAt: run.startedAt ?? (args.state === "RUNNING" ? now : undefined),
      completedAt: ["ACCEPTED", "PRODUCT_FAILED", "FACTORY_FAILED", "CANCELLED", "SUPERSEDED"].includes(args.state) ? now : undefined,
      updatedAt: now,
    });
    await ctx.db.insert("activities", {
      projectId: run.projectId,
      actorType: "HUMAN",
      actorId: args.actorId,
      action: "FACTORY_RUN_STATE_CHANGED",
      description: `Factory Run ${run.title} moved from ${run.state} to ${args.state}: ${args.reason.trim()}`,
      targetType: "FACTORY_RUN",
      targetId: run._id,
      metadata: { fromState: run.state, toState: args.state, reason: args.reason.trim() },
    });
    return await loadRunModel(ctx, await ctx.db.get(run._id));
  },
});
