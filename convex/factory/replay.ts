import { v } from "convex/values";
import { verificationContractDigest } from "@mission-control/workflow-engine/verification-identity";
import { action, mutation, query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { COMPANY_PERMISSIONS, FACTORY_PERMISSIONS,
  requireWorkspaceAccess, requireWorkspacePermission, type FactoryPermission } from "../lib/companyAccess";
import { assertAuthorizedDeliveryRecord, requireAuthorizedDeliveryScope } from "../lib/deliveryAuthorization";
import { validateExecutionRoutingExperimentVariants } from "../lib/executionRouting";
import { assertBoundedReplayDefinition, assertReplayManifest, datasetWorkloadSummary,
  replayAttemptSetDigest, replayDigest, replayEvaluatorIdentity, replaySnapshot, snapshotReplayWorkload,
  type ReplayDefinition } from "../lib/factoryReplay";
import { loadReplayReview, requireReplayDeliveryVisibility } from "../lib/factoryReplayPersistence";
import { createWorkOrderRecord } from "../lib/workOrderCreate";
import { deriveApprovalStatus, latestApprovalByType, isApprovalUsable } from "../lib/workOrderGovernance";
import { dispatchApprovalAllowed } from "../lib/workOrderDispatch";
import { capabilityPermitsValidator } from "../lib/capabilityAdmission";
import { dispatchWorkOrder } from "../workOrders";

type ReplayCtx = QueryCtx | MutationCtx;

async function requireReplayAccess(ctx: ReplayCtx, projectId: Id<"projects">, permission: FactoryPermission) {
  if (!await ctx.auth.getUserIdentity()) throw new Error("Authenticated replay access is required.");
  const access = await requireWorkspacePermission(ctx, projectId, permission);
  if (access.membership.mode !== "AUTHENTICATED") throw new Error("Replay requires an authenticated operator membership.");
  return access;
}

async function audit(ctx: MutationCtx, projectId: Id<"projects">, actorId: string,
  action: string, targetId: string, metadata: unknown) {
  const project = await ctx.db.get(projectId);
  await ctx.db.insert("activities", { tenantId: project?.tenantId, projectId, actorType: "HUMAN",
    actorId, action, targetType: "FACTORY_REPLAY", targetId,
    description: action.toLowerCase().replace(/_/g, " "), metadata: replaySnapshot(metadata) });
}

async function loadManifest(ctx: ReplayCtx, id: Id<"factoryReplayManifests">, permission = FACTORY_PERMISSIONS.IMPROVE) {
  const manifest = await ctx.db.get(id);
  if (!manifest) throw new Error("Replay is unavailable or unauthorized.");
  const access = await requireReplayAccess(ctx, manifest.projectId, permission);
  assertReplayManifest(manifest);
  const experiment = await ctx.db.get(manifest.experimentId);
  if (!experiment || experiment.projectId !== manifest.projectId
    || experiment.metadata?.factoryReplayManifestId !== manifest._id) throw new Error("Replay experiment binding is invalid.");
  await requireReplayDeliveryVisibility(ctx, manifest);
  return { manifest, access, experiment };
}

function selectCase(manifest: Doc<"factoryReplayManifests">, variantId: Id<"experimentVariants">, caseKey: string) {
  const caseDefinition = manifest.definition.cases.find((item) => item.key === caseKey);
  const variant = manifest.definition.variants.find((item) => item.id === variantId);
  if (!caseDefinition || !variant) throw new Error("Replay case or variant is not in the frozen manifest.");
  return { caseDefinition, variant };
}

export const freeze = mutation({
  args: { experimentId: v.id("experiments"), minimumPairs: v.number(), maxAttemptsPerCase: v.number() },
  handler: async (ctx, args) => {
    const experiment = await ctx.db.get(args.experimentId);
    if (!experiment) throw new Error("Experiment is unavailable or unauthorized.");
    const access = await requireReplayAccess(ctx, experiment.projectId, FACTORY_PERMISSIONS.IMPROVE);
    const existing = await ctx.db.query("factoryReplayManifests")
      .withIndex("by_experiment", (q) => q.eq("experimentId", experiment._id)).unique();
    if (existing) {
      assertReplayManifest(existing);
      if (existing.projectId !== experiment.projectId || experiment.metadata?.factoryReplayManifestId !== existing._id) {
        throw new Error("Replay experiment binding is invalid.");
      }
      await requireReplayDeliveryVisibility(ctx, existing);
      if (existing.definition.minimumPairs !== args.minimumPairs || existing.definition.maxAttemptsPerCase !== args.maxAttemptsPerCase) {
        throw new Error("Frozen replay limits cannot be changed.");
      }
      return { manifest: existing, created: false };
    }
    if (experiment.status !== "DRAFT") throw new Error("Only an unexecuted draft experiment can be frozen for replay.");
    const [dataset, items, variants, definitions] = await Promise.all([
      ctx.db.get(experiment.datasetId),
      ctx.db.query("evalDatasetItems").withIndex("by_dataset", (q) => q.eq("datasetId", experiment.datasetId)).take(51),
      ctx.db.query("experimentVariants").withIndex("by_experiment", (q) => q.eq("experimentId", experiment._id)).take(3),
      Promise.all(experiment.evalDefinitionIds.map((id) => ctx.db.get(id))),
    ]);
    if (!dataset || dataset.projectId !== experiment.projectId || dataset.version !== experiment.datasetVersion
      || items.length < 1 || items.length > 50
      || new Set(items.map((item) => String(item._id))).size !== items.length
      || items.some((item) => item.projectId !== experiment.projectId || item.datasetId !== dataset._id)) {
      throw new Error("Replay requires one to fifty distinct cases from the unchanged experiment dataset.");
    }
    if (!Number.isSafeInteger(args.minimumPairs) || args.minimumPairs < 1 || args.minimumPairs > items.length
      || !Number.isSafeInteger(args.maxAttemptsPerCase) || args.maxAttemptsPerCase < 1 || args.maxAttemptsPerCase > 5) {
      throw new Error("Replay requires a valid explicit pair threshold and one to five attempts per case.");
    }
    if (variants.length !== 2 || new Set(variants.map((variant) => variant.factoryDefinitionVersionId)).size !== 2
      || variants.some((variant) => variant.projectId !== experiment.projectId
      || !variant.factoryDefinitionVersionId || variant.executor || variant.model || variant.sampleSize !== 0)) {
      throw new Error("Replay compares two exact Factory Versions without separate executor/model overrides or prior outcomes.");
    }
    if (definitions.length < 1 || definitions.length > 20
      || new Set(experiment.evalDefinitionIds).size !== definitions.length
      || definitions.some((definition) => !definition || !definition.enabled
        || definition.projectId !== experiment.projectId || !["TRACE", "ATTEMPT"].includes(definition.scope)
        || !["NUMERIC", "BOOLEAN"].includes(definition.scoreType))) {
      throw new Error("Replay requires enabled, distinct numeric or boolean Attempt/Trace evaluators in the same workspace.");
    }
    const versionIds = variants.map((variant) => variant.factoryDefinitionVersionId!);
    const tuples = await validateExecutionRoutingExperimentVariants(ctx, {
      projectId: experiment.projectId, factoryDefinitionVersionIds: versionIds,
    });
    const versions = await Promise.all(versionIds.map((id) => ctx.db.get(id)));
    if (versions.some((version) => !version || args.maxAttemptsPerCase > version.budget.maxAttempts)) {
      throw new Error("Replay attempt bound exceeds a Factory Version budget.");
    }
    const delivery = await requireAuthorizedDeliveryScope(ctx, experiment.projectId);
    const cases: ReplayDefinition["cases"] = [];
    for (const item of items.sort((a, b) => String(a._id).localeCompare(String(b._id)))) {
      const workOrder = item.sourceWorkOrderId ? await ctx.db.get(item.sourceWorkOrderId) : null;
      if (!workOrder || workOrder.projectId !== experiment.projectId || workOrder.kind !== "SOFTWARE_CHANGE"
        || !workOrder.repositoryId || !workOrder.planningRepositorySha
        || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(workOrder.planningRepositorySha)
        || !workOrder.qualityContractDigest || !workOrder.acceptanceCriteria.length
        || workOrder.verificationContract?.schemaVersion !== 2
        || workOrder.verificationContract.enforcementMode !== "ENFORCED"
        || workOrder.verificationContract.independence?.required !== true
        || workOrder.verificationContractDigest !== verificationContractDigest(workOrder.verificationContract, workOrder.qualityContractDigest)
        || versions.some((version) => version!.repositoryId !== workOrder.repositoryId)) {
        throw new Error("Replay source requires the same repository, a fixed revision, and an enforced independent Quality Contract.");
      }
      assertAuthorizedDeliveryRecord(delivery, workOrder);
      const sourceSummary = item.input?.workOrder;
      if (!sourceSummary || replayDigest(datasetWorkloadSummary(sourceSummary)) !== replayDigest(datasetWorkloadSummary(workOrder))) {
        throw new Error("Dataset workload summary no longer matches its source WorkOrder.");
      }
      const workload = snapshotReplayWorkload(workOrder);
      cases.push(replaySnapshot({ key: String(item._id), datasetItemId: item._id, sourceWorkOrderId: workOrder._id,
        input: item.input, expectedOutcome: item.expectedOutcome, workload, workloadDigest: replayDigest(workload) }));
    }
    const definition: ReplayDefinition = replaySnapshot({
      schema: "factory-replay/v1", projectId: experiment.projectId, experimentId: experiment._id,
      datasetId: dataset._id, datasetVersion: dataset.version,
      datasetSnapshot: dataset, datasetItems: items,
      datasetDigest: replayDigest({ dataset, items }), minimumPairs: args.minimumPairs,
      maxAttemptsPerCase: args.maxAttemptsPerCase,
      evaluators: definitions.map((definition) => ({ id: definition!._id, definition: definition!, digest: replayDigest(definition),
        ...replayEvaluatorIdentity(definition!) })),
      variants: variants.map((variant, index) => ({ id: variant._id, name: variant.name,
        factoryDefinitionVersionId: versionIds[index], configurationDigest: versions[index]!.configurationDigest, tuple: tuples[index] })),
      cases,
    });
    assertBoundedReplayDefinition(definition);
    const manifestId = await ctx.db.insert("factoryReplayManifests", {
      tenantId: access.project.tenantId, projectId: experiment.projectId, experimentId: experiment._id,
      definition, digest: replayDigest(definition), createdBy: access.actorId, createdAt: Date.now(),
    });
    await ctx.db.patch(experiment._id, { metadata: { ...experiment.metadata,
      factoryReplayManifestId: manifestId, outcomeSource: "FROZEN_CANONICAL_REPLAY",
      acceptanceAuthority: false, statisticalSignificanceClaimed: false } });
    await audit(ctx, experiment.projectId, access.actorId, "FACTORY_REPLAY_FROZEN", String(manifestId),
      { caseCount: cases.length, variantCount: 2, manifestDigest: replayDigest(definition), minimumPairs: args.minimumPairs });
    return { manifest: (await ctx.db.get(manifestId))!, created: true };
  },
});

async function bindWorkOrder(ctx: MutationCtx, manifest: Doc<"factoryReplayManifests">,
  variantId: Id<"experimentVariants">, caseKey: string, workOrder: Doc<"workOrders">, actorId: string) {
  const { caseDefinition } = selectCase(manifest, variantId, caseKey);
  const existing = await ctx.db.query("factoryReplayCases").withIndex("by_manifest_variant_case", (q) =>
    q.eq("manifestId", manifest._id).eq("variantId", variantId).eq("caseKey", caseKey)).unique();
  if (existing) {
    if (existing.workOrderId !== workOrder._id) throw new Error("Replay case is already bound to another WorkOrder.");
    return existing;
  }
  const other = await ctx.db.query("factoryReplayCases").withIndex("by_work_order", (q) => q.eq("workOrderId", workOrder._id)).first();
  const priorAttempt = await ctx.db.query("workflowRuns").withIndex("by_work_order", (q) => q.eq("workOrderId", workOrder._id)).first();
  if (other || priorAttempt || workOrder._id === caseDefinition.sourceWorkOrderId
    || workOrder.projectId !== manifest.projectId
    || ["DONE", "CANCELED", "SUPERSEDED"].includes(workOrder.state)
    || replayDigest(snapshotReplayWorkload(workOrder)) !== caseDefinition.workloadDigest) {
    throw new Error("Replay needs a fresh, same-project WorkOrder matching the exact frozen workload.");
  }
  const id = await ctx.db.insert("factoryReplayCases", { projectId: manifest.projectId, manifestId: manifest._id,
    variantId, caseKey, workOrderId: workOrder._id, workOrderRevision: workOrder.currentRevisionNumber ?? 1,
    boundBy: actorId, boundAt: Date.now() });
  await audit(ctx, manifest.projectId, actorId, "FACTORY_REPLAY_CASE_BOUND", String(id),
    { manifestId: manifest._id, variantId, caseKey, workOrderId: workOrder._id });
  return (await ctx.db.get(id))!;
}

const caseArgs = { manifestId: v.id("factoryReplayManifests"), variantId: v.id("experimentVariants"), caseKey: v.string() };

export const bindCase = mutation({
  args: { ...caseArgs, workOrderId: v.id("workOrders") },
  handler: async (ctx, args) => {
    const { manifest, access, experiment } = await loadManifest(ctx, args.manifestId);
    if (["COMPLETED", "CANCELED"].includes(experiment.status)) throw new Error("Closed replay cannot acquire new bindings.");
    const workOrder = await ctx.db.get(args.workOrderId);
    if (!workOrder || workOrder.projectId !== manifest.projectId) throw new Error("WorkOrder is unavailable or unauthorized.");
    const delivery = await requireWorkspaceAccess(ctx, access.project.tenantId!, manifest.projectId,
      { permission: COMPANY_PERMISSIONS.ASSIGN_DELIVERY });
    assertAuthorizedDeliveryRecord(delivery, workOrder);
    return bindWorkOrder(ctx, manifest, args.variantId, args.caseKey, workOrder, access.actorId);
  },
});

export const prepareCase = mutation({
  args: caseArgs,
  handler: async (ctx, args) => {
    const { manifest, access, experiment } = await loadManifest(ctx, args.manifestId);
    if (["COMPLETED", "CANCELED"].includes(experiment.status)) throw new Error("Closed replay cannot prepare WorkOrders.");
    const { caseDefinition } = selectCase(manifest, args.variantId, args.caseKey);
    const delivery = await requireWorkspaceAccess(ctx, access.project.tenantId!, manifest.projectId,
      { permission: COMPANY_PERMISSIONS.ASSIGN_DELIVERY });
    assertAuthorizedDeliveryRecord(delivery, caseDefinition.workload);
    const prior = await ctx.db.query("factoryReplayCases").withIndex("by_manifest_variant_case", (q) =>
      q.eq("manifestId", manifest._id).eq("variantId", args.variantId).eq("caseKey", args.caseKey)).unique();
    if (prior) return prior;
    const created = await createWorkOrderRecord(ctx, {
      ...caseDefinition.workload, projectId: manifest.projectId,
      state: "READY", requestedBy: access.actorId,
      requestingOperatorId: access.membership.operatorId,
      idempotencyKey: `factory-replay:${manifest._id}:${args.variantId}:${args.caseKey}`,
      metadata: { ...caseDefinition.workload.metadata, factoryReplay: { manifestId: manifest._id,
        sourceWorkOrderId: caseDefinition.sourceWorkOrderId, variantId: args.variantId, caseKey: args.caseKey } },
    });
    return bindWorkOrder(ctx, manifest, args.variantId, args.caseKey, created.workOrder, access.actorId);
  },
});

const runtimeBindingArgs = {
  executorHostId: v.optional(v.string()), worktree: v.optional(v.string()), branch: v.optional(v.string()),
  taskId: v.optional(v.id("tasks")),
  capabilityPermits: v.optional(capabilityPermitsValidator),
};

export const dispatchCase = mutation({
  args: { caseId: v.id("factoryReplayCases"), retryOfWorkflowRunId: v.optional(v.id("workflowRuns")), retryReason: v.optional(v.string()),
    ...runtimeBindingArgs },
  handler: async (ctx, args) => {
    const binding = await ctx.db.get(args.caseId);
    if (!binding) throw new Error("Replay case is unavailable or unauthorized.");
    const { manifest, access, experiment } = await loadManifest(ctx, binding.manifestId);
    if (["COMPLETED", "CANCELED"].includes(experiment.status)) throw new Error("Closed replay cannot dispatch work.");
    const { caseDefinition, variant } = selectCase(manifest, binding.variantId, binding.caseKey);
    const workOrder = await ctx.db.get(binding.workOrderId);
    if (!workOrder || workOrder.projectId !== manifest.projectId || binding.projectId !== manifest.projectId
      || (workOrder.currentRevisionNumber ?? 1) !== binding.workOrderRevision
      || replayDigest(snapshotReplayWorkload(workOrder)) !== caseDefinition.workloadDigest) {
      throw new Error("Replay WorkOrder changed after its frozen binding.");
    }
    const version = await ctx.db.get(variant.factoryDefinitionVersionId);
    if (!version || version.configurationDigest !== variant.configurationDigest) throw new Error("Replay Factory Version identity changed.");
    await validateExecutionRoutingExperimentVariants(ctx, { projectId: manifest.projectId,
      factoryDefinitionVersionIds: manifest.definition.variants.map((item) => item.factoryDefinitionVersionId) });
    const attempts = await ctx.db.query("workflowRuns").withIndex("by_work_order", (q) => q.eq("workOrderId", workOrder._id)).take(201);
    if (attempts.length > 200) throw new Error("Replay attempt set exceeds bounded dispatch inspection.");
    const implementation = attempts.filter((attempt) => attempt.attemptPurpose === "IMPLEMENTATION");
    const prior = args.retryOfWorkflowRunId ? implementation.find((attempt) => attempt._id === args.retryOfWorkflowRunId) : null;
    if (args.retryOfWorkflowRunId && (!prior || !["FAILED", "CANCELED"].includes(prior.status)
      || !args.retryReason?.trim())) throw new Error("Replay retry must identify its failed case Attempt and a reason.");
    const idempotencyKey = `factory-replay:${binding._id}:${prior ? `retry:${prior._id}` : "initial"}`;
    const existing = await ctx.db.query("workOrderEvents").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", `${idempotencyKey}:dispatched`)).first();
    if (!existing && implementation.length >= manifest.definition.maxAttemptsPerCase) throw new Error("Replay attempt budget is exhausted.");
    if (!prior && !existing && implementation.length) throw new Error("An existing replay Attempt requires an explicit bounded retry.");
    if (!existing) {
      const approvals = await ctx.db.query("approvalDecisions")
        .withIndex("by_work_order", (q) => q.eq("workOrderId", workOrder._id)).collect();
      const approvalStatus = deriveApprovalStatus({ ...workOrder, approvals, now: Date.now() });
      if (!["APPROVED", "CONDITIONAL", "NOT_REQUIRED"].includes(workOrder.approvalStatus)
        || !dispatchApprovalAllowed({ ...workOrder, approvalStatus })
        || [...latestApprovalByType(approvals).values()].some((item) => item.status !== "SUPERSEDED" && !isApprovalUsable(item))) {
        throw new Error("Replay requires the WorkOrder's own current approval before dispatch.");
      }
    }
    const replay = { manifestId: manifest._id, manifestDigest: manifest.digest, caseId: binding._id,
      caseKey: binding.caseKey, variantId: variant.id, workloadDigest: caseDefinition.workloadDigest };
    const result = await dispatchWorkOrder(ctx, { workOrderId: workOrder._id,
      factoryDefinitionVersionId: variant.factoryDefinitionVersionId,
      actorType: "HUMAN", actorId: access.actorId, idempotencyKey,
      retryOfWorkflowRunId: args.retryOfWorkflowRunId, retryReason: args.retryReason, capabilityPermits: args.capabilityPermits,
      executorHostId: args.executorHostId, worktree: args.worktree, branch: args.branch, taskId: args.taskId },
    { initialContext: { factoryReplay: replay }, metadata: { factoryReplay: replay } });
    if (result.run) {
      const dispatchedWorkOrder = await ctx.db.get(workOrder._id);
      if (result.run.projectId !== manifest.projectId || result.run.workOrderId !== workOrder._id
        || result.run.factoryDefinitionVersionId !== variant.factoryDefinitionVersionId
        || result.run.factoryConfigurationDigest !== variant.configurationDigest
        || result.run.workOrderRevisionNumber !== binding.workOrderRevision
        || result.run.executionBaseSha !== caseDefinition.workload.planningRepositorySha
        || result.run.context?.factoryReplay?.manifestDigest !== manifest.digest
        || result.run.context?.factoryReplay?.caseId !== binding._id
        || !dispatchedWorkOrder || replayDigest(snapshotReplayWorkload(dispatchedWorkOrder)) !== caseDefinition.workloadDigest) {
        throw new Error("Canonical dispatch changed the frozen replay identity; transaction rolled back. Check the WorkOrder's exact execution route pin and scope policy.");
      }
      if (experiment.status === "DRAFT") await ctx.db.patch(experiment._id, { status: "RUNNING" });
      if (result.created) await audit(ctx, manifest.projectId, access.actorId, "FACTORY_REPLAY_CASE_DISPATCHED", String(binding._id),
        { workflowRunId: result.run._id, factoryDefinitionVersionId: variant.factoryDefinitionVersionId, idempotencyKey });
    }
    return result;
  },
});

export const getDispatchBatch = query({
  args: { manifestId: v.id("factoryReplayManifests"), cursor: v.number(), limit: v.number() },
  handler: async (ctx, args) => {
    const { manifest, experiment } = await loadManifest(ctx, args.manifestId);
    if (!["DRAFT", "RUNNING"].includes(experiment.status)) throw new Error("Closed replay cannot dispatch work.");
    if (!Number.isSafeInteger(args.cursor) || args.cursor < 0
      || !Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 10) throw new Error("Replay batch requires a valid cursor and a limit of one to ten.");
    const slots = manifest.definition.cases.flatMap((item) => manifest.definition.variants.map((variant) => ({ caseKey: item.key, variantId: variant.id })));
    if (args.cursor > slots.length) throw new Error("Replay batch cursor is outside the frozen workload.");
    const selected = slots.slice(args.cursor, args.cursor + args.limit);
    const entries = await Promise.all(selected.map(async (slot) => {
      const binding = await ctx.db.query("factoryReplayCases").withIndex("by_manifest_variant_case", (q) =>
        q.eq("manifestId", manifest._id).eq("variantId", slot.variantId).eq("caseKey", slot.caseKey)).unique();
      if (!binding) return { ...slot, caseId: null, state: "UNBOUND" as const };
      if (binding.projectId !== manifest.projectId) throw new Error("Replay case scope mismatch.");
      const attempts = await ctx.db.query("workflowRuns").withIndex("by_work_order", (q) => q.eq("workOrderId", binding.workOrderId)).take(201);
      if (attempts.length > 200) throw new Error("Replay attempt set exceeds bounded dispatch inspection.");
      const implementation = attempts.filter((item) => item.attemptPurpose === "IMPLEMENTATION")
        .sort((left, right) => right.startedAt - left.startedAt || String(right._id).localeCompare(String(left._id)));
      return { ...slot, caseId: binding._id, state: !implementation.length ? "PENDING" as const
        : ["FAILED", "CANCELED"].includes(implementation[0].status) ? "REQUIRES_EXPLICIT_RETRY" as const : "ALREADY_DISPATCHED" as const };
    }));
    const nextCursor = args.cursor + selected.length < slots.length ? args.cursor + selected.length : null;
    return { entries, nextCursor, totalSlots: slots.length };
  },
});

type DispatchBatchResult = {
  results: Array<{ caseKey: string; variantId: Id<"experimentVariants">; caseId: Id<"factoryReplayCases"> | null;
    status: "DISPATCHED" | "ALREADY_DISPATCHED" | "BLOCKED"; reason?: string; workflowRunId?: Id<"workflowRuns"> }>;
  dispatched: number; alreadyDispatched: number; blocked: number; nextCursor: number | null; totalSlots: number;
  liveReplayQualified: false;
};

export const dispatchPending = action({
  args: { manifestId: v.id("factoryReplayManifests"), cursor: v.optional(v.number()), limit: v.optional(v.number()),
    runtimeBindings: v.optional(v.array(v.object({ caseId: v.id("factoryReplayCases"), ...runtimeBindingArgs }))) },
  handler: async (ctx, args): Promise<DispatchBatchResult> => {
    if (!await ctx.auth.getUserIdentity()) throw new Error("Authenticated replay access is required.");
    const runtimeBindings = args.runtimeBindings ?? [];
    if (runtimeBindings.length > 10 || new Set(runtimeBindings.map((item) => item.caseId)).size !== runtimeBindings.length) {
      throw new Error("Replay batch supports at most ten distinct runtime bindings.");
    }
    const batch = await ctx.runQuery(api.factory.replay.getDispatchBatch, {
      manifestId: args.manifestId, cursor: args.cursor ?? 0, limit: args.limit ?? 10,
    });
    if (runtimeBindings.some((runtime) => !batch.entries.some((entry) => entry.caseId === runtime.caseId))) {
      throw new Error("Replay runtime binding is outside this frozen batch.");
    }
    const results: DispatchBatchResult["results"] = [];
    for (const entry of batch.entries) {
      const { state, ...identity } = entry;
      if (state !== "PENDING" || !entry.caseId) {
        results.push({ ...identity, status: state === "ALREADY_DISPATCHED" ? "ALREADY_DISPATCHED" : "BLOCKED", reason: state });
        continue;
      }
      try {
        const runtime = runtimeBindings.find((item) => item.caseId === entry.caseId);
        const result = await ctx.runMutation(api.factory.replay.dispatchCase, { ...runtime, caseId: entry.caseId });
        results.push({ ...identity, status: result.run ? result.created ? "DISPATCHED" : "ALREADY_DISPATCHED" : "BLOCKED",
          reason: result.reason, workflowRunId: result.run?._id });
      } catch (error) {
        results.push({ ...identity, status: "BLOCKED", reason: (error instanceof Error ? error.message : "Dispatch refused").slice(0, 1000) });
      }
    }
    return { results, dispatched: results.filter((item) => item.status === "DISPATCHED").length,
      alreadyDispatched: results.filter((item) => item.status === "ALREADY_DISPATCHED").length,
      blocked: results.filter((item) => item.status === "BLOCKED").length,
      nextCursor: batch.nextCursor, totalSlots: batch.totalSlots, liveReplayQualified: false };
  },
});

export const reconcile = mutation({
  args: { manifestId: v.id("factoryReplayManifests") },
  handler: async (ctx, args) => {
    const { manifest, experiment, access } = await loadManifest(ctx, args.manifestId);
    if (experiment.status === "CANCELED") throw new Error("Canceled replay cannot be reconciled.");
    const review = await loadReplayReview(ctx, experiment._id);
    if (!review) throw new Error("Frozen replay manifest is missing.");
    const digest = replayDigest({ cases: review.cases, comparison: review.comparison });
    if (experiment.metadata?.factoryReplayReviewDigest === digest) return { review, changed: false };
    for (const derived of review.comparison.variants) {
      const variant = await ctx.db.get(derived.variantId);
      if (!variant || variant.projectId !== manifest.projectId || variant.experimentId !== experiment._id) {
        throw new Error("Replay variant binding is invalid.");
      }
      await ctx.db.patch(variant._id, { sampleSize: derived.pairedSampleSize, metrics: replaySnapshot(derived.metrics) });
    }
    await ctx.db.patch(experiment._id, {
      status: review.comparison.complete ? "COMPLETED" : experiment.status,
      ...(review.comparison.complete && !experiment.completedAt ? { completedAt: Date.now() } : {}),
      metadata: { ...experiment.metadata, factoryReplayReviewDigest: digest,
        factoryReplayComparisonComplete: review.comparison.complete,
        factoryReplayMatchedPairs: review.comparison.matchedPairs,
        autoPromote: false, statisticallySignificant: false, acceptanceAuthority: false },
    });
    await audit(ctx, manifest.projectId, access.actorId, "FACTORY_REPLAY_RECONCILED", String(manifest._id), {
      digest, complete: review.comparison.complete, matchedPairs: review.comparison.matchedPairs,
      denominator: review.comparison.denominator, recommendation: review.comparison.recommendation.recommendation,
    });
    return { review, changed: true };
  },
});

export const recordInterventions = mutation({
  args: { caseId: v.id("factoryReplayCases"), ownerCount: v.number(), assistantOutsideFactoryCount: v.number(), evidenceRefs: v.array(v.string()) },
  handler: async (ctx, args) => {
    const binding = await ctx.db.get(args.caseId);
    if (!binding) throw new Error("Replay case is unavailable or unauthorized.");
    const { manifest, access } = await loadManifest(ctx, binding.manifestId);
    if (binding.projectId !== manifest.projectId) throw new Error("Replay case scope mismatch.");
    const attempts = await ctx.db.query("workflowRuns").withIndex("by_work_order", (q) => q.eq("workOrderId", binding.workOrderId)).take(201);
    if (attempts.length > 200) throw new Error("Replay attempt set exceeds bounded intervention inspection.");
    if (!attempts.length || attempts.some((attempt) => attempt.projectId !== manifest.projectId
      || ["PENDING", "RUNNING"].includes(attempt.status))) throw new Error("Intervention report requires a retained, quiescent case attempt set.");
    const knownOwner = attempts.reduce((sum, attempt) => sum + (Number.isFinite(attempt.humanInterventions) && (attempt.humanInterventions ?? -1) >= 0 ? attempt.humanInterventions! : 0), 0);
    if (!Number.isSafeInteger(args.ownerCount) || args.ownerCount < knownOwner
      || !Number.isSafeInteger(args.assistantOutsideFactoryCount) || args.assistantOutsideFactoryCount < 0
      || !args.evidenceRefs.length || args.evidenceRefs.length > 20
      || args.evidenceRefs.some((ref) => !ref.trim() || ref.length > 1000)) {
      throw new Error("Intervention counts must be nonnegative integers, cover observed owner events, and include bounded evidence references.");
    }
    const attemptSetDigest = replayAttemptSetDigest(attempts);
    const existing = await ctx.db.query("factoryReplayInterventionReports").withIndex("by_case_attempts", (q) =>
      q.eq("caseId", binding._id).eq("attemptSetDigest", attemptSetDigest)).unique();
    const values = { ownerCount: args.ownerCount, assistantOutsideFactoryCount: args.assistantOutsideFactoryCount,
      evidenceRefs: [...new Set(args.evidenceRefs.map((ref) => ref.trim()))].sort() };
    if (existing) {
      if (existing.ownerCount !== values.ownerCount || existing.assistantOutsideFactoryCount !== values.assistantOutsideFactoryCount
        || replayDigest(existing.evidenceRefs) !== replayDigest(values.evidenceRefs)) throw new Error("An intervention report for this exact attempt set is immutable.");
      return existing;
    }
    const id = await ctx.db.insert("factoryReplayInterventionReports", { projectId: manifest.projectId, caseId: binding._id,
      attemptSetDigest, ...values, recordedBy: access.actorId, recordedAt: Date.now() });
    await audit(ctx, manifest.projectId, access.actorId, "FACTORY_REPLAY_INTERVENTIONS_RECORDED", String(id),
      { caseId: binding._id, attemptSetDigest, source: "OPERATOR_REPORTED", ...values });
    return (await ctx.db.get(id))!;
  },
});

export const getReview = query({
  args: { experimentId: v.id("experiments") },
  handler: async (ctx, args) => {
    const experiment = await ctx.db.get(args.experimentId);
    if (!experiment) throw new Error("Experiment is unavailable or unauthorized.");
    await requireReplayAccess(ctx, experiment.projectId, FACTORY_PERMISSIONS.VIEW);
    return loadReplayReview(ctx, experiment._id);
  },
});
