import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { COMPANY_PERMISSIONS } from "./lib/companyAccess";
import { requireAuthorizedDeliveryScope } from "./lib/deliveryAuthorization";
import { computeCanonicalHash } from "./lib/genomeHash";
import { reconcileFactoryCrashPoint, type FactoryCrashPoint } from "./lib/factoryLifecycle";

function deriveCrashPoint(input: { run: any; verificationRun?: any | null; accepted: boolean }): FactoryCrashPoint {
  if (input.accepted) return "ACCEPTANCE_TRANSITION";
  if (input.verificationRun?.verdict) return "VERDICT_PERSISTED_BEFORE_RECONCILIATION";
  if (input.run.attemptPurpose === "VERIFICATION") return "VERIFIER_RUNNING";
  if (input.run.candidateReadyAt || input.run.headSha) return "CANDIDATE_CAPTURED_BEFORE_FINALIZATION";
  if (input.run.executionPhase || input.run.startedAt) return "PRODUCER_RUNNING";
  return "LEASED_BEFORE_EXECUTOR";
}

export const reconcileAttempt = mutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
    processLive: v.boolean(),
    observedAt: v.number(),
    actorId: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run?.workOrderId || !run.projectId) throw new Error("A Factory WorkOrder Attempt is required.");
    await requireAuthorizedDeliveryScope(ctx, run.projectId, COMPANY_PERMISSIONS.UPDATE_DELIVERY);
    const workOrder = await ctx.db.get(run.workOrderId);
    if (!workOrder) throw new Error("The Attempt WorkOrder no longer exists.");
    const verificationRun = await ctx.db.query("verificationRuns").withIndex("by_run", (q) => q.eq("workflowRunId", run._id)).first();
    const membership = await ctx.db.query("factoryRunWorkOrders").withIndex("by_work_order", (q) => q.eq("workOrderId", run.workOrderId!)).order("desc").first();
    const accepted = workOrder.state === "DONE" && workOrder.acceptedRevisionNumber === (workOrder.currentRevisionNumber ?? 1);
    const leaseExpiresAt = run.lease?.expiresAt ?? run.executionLeaseExpiresAt ?? 0;
    const facts = {
      workflowRunId: String(run._id),
      status: run.status,
      attemptPurpose: run.attemptPurpose ?? "IMPLEMENTATION",
      leaseExpiresAt,
      observedAt: args.observedAt,
      processLive: args.processLive,
      candidateReadyAt: run.candidateReadyAt ?? null,
      headSha: run.headSha ?? null,
      verificationRunId: verificationRun?._id ? String(verificationRun._id) : null,
      verificationVerdict: verificationRun?.verdict ?? null,
      workOrderState: workOrder.state,
      currentRevisionNumber: workOrder.currentRevisionNumber ?? 1,
      acceptedRevisionNumber: workOrder.acceptedRevisionNumber ?? null,
    };
    const factsDigest = `sha256:${computeCanonicalHash(facts)}`;
    const prior = (await ctx.db.query("factoryReconciliations").withIndex("by_attempt", (q) => q.eq("workflowRunId", run._id)).collect())
      .find((record) => record.factsDigest === factsDigest);
    if (prior) return { reconciliation: prior, created: false };
    const crashPoint = deriveCrashPoint({ run, verificationRun, accepted });
    const result = reconcileFactoryCrashPoint({
      crashPoint,
      leaseLive: leaseExpiresAt > args.observedAt,
      processLive: args.processLive,
      candidateCaptured: Boolean(run.candidateReadyAt || run.headSha),
      verdictPersisted: Boolean(verificationRun?.verdict),
      accepted,
    });
    const reconciliationId = await ctx.db.insert("factoryReconciliations", {
      tenantId: run.tenantId,
      projectId: run.projectId,
      factoryRunId: membership?.factoryRunId,
      workOrderId: run.workOrderId,
      workflowRunId: run._id,
      crashPoint,
      disposition: result.disposition,
      reasonCode: result.reasonCode,
      actions: result.actions,
      factsDigest,
      recordedAt: args.observedAt,
    });
    if (result.disposition === "STALE" && !["COMPLETED", "FAILED", "CANCELED"].includes(run.status)) {
      await ctx.db.patch(run._id, {
        runtimeDisposition: "LOST",
        runtimeDispositionReason: result.reasonCode,
        runtimeReconciledAt: args.observedAt,
      });
    }
    await ctx.db.insert("activities", {
      projectId: run.projectId,
      actorType: "SYSTEM",
      actorId: args.actorId,
      action: "FACTORY_ATTEMPT_RECONCILED",
      description: `Attempt ${run.runId} reconciled as ${result.disposition}: ${result.reasonCode}`,
      targetType: "WORKFLOW_RUN",
      targetId: run._id,
      metadata: { reconciliationId, crashPoint, factsDigest, actions: result.actions },
    });
    return { reconciliation: await ctx.db.get(reconciliationId), created: true };
  },
});

export const listForWorkOrder = query({
  args: { workOrderId: v.id("workOrders") },
  handler: async (ctx, args) => {
    const workOrder = await ctx.db.get(args.workOrderId);
    if (!workOrder) return [];
    await requireAuthorizedDeliveryScope(ctx, workOrder.projectId);
    return await ctx.db.query("factoryReconciliations").withIndex("by_work_order", (q) => q.eq("workOrderId", args.workOrderId)).order("desc").collect();
  },
});
