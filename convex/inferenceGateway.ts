import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { FACTORY_PERMISSIONS, requireWorkspacePermission } from "./lib/companyAccess";
import {
  factoryOutcomeEvent,
  canonicalOutcomeSourceDigest,
  inferencePriceBook,
  inferenceReservation,
  physicalInferenceIntent,
  physicalInferenceReceipt,
  projectFactoryOutcome,
  compareRouteEconomics,
  summarizeRouteEconomics,
} from "@mission-control/shared";
import { canonicalDigest } from "@mission-control/shared";
import type { Doc, Id } from "./_generated/dataModel";

const sha256 = /^sha256:[a-f0-9]{64}$/;
const routeValidator = v.object({
  provider: v.string(), providerRoute: v.string(), modelId: v.string(), routeDigest: v.string(),
  adapter: v.string(), adapterVersion: v.string(), endpoint: v.string(),
});
const usageValidator = v.object({
  inputTokens: v.optional(v.number()), outputTokens: v.optional(v.number()),
  cacheReadTokens: v.optional(v.number()), cacheWriteTokens: v.optional(v.number()),
  reasoningTokens: v.optional(v.number()),
});
const completenessValidator = v.union(v.literal("COMPLETE"), v.literal("PARTIAL"), v.literal("UNKNOWN"));
const outcomeStageValidator = v.union(
  v.literal("VERIFICATION_PASSED"), v.literal("HUMAN_ACCEPTED"), v.literal("MERGED"),
  v.literal("DEPLOYED"), v.literal("PRODUCTION_VERIFIED"), v.literal("INCIDENT"),
  v.literal("ROLLED_BACK"), v.literal("REJECTED"), v.literal("ABANDONED"),
);

const priceRateValidator = v.object({
  routeDigest: v.string(),
  inputMicrousdPerMillionTokens: v.number(),
  outputMicrousdPerMillionTokens: v.number(),
  cacheReadMicrousdPerMillionTokens: v.optional(v.number()),
  cacheWriteMicrousdPerMillionTokens: v.optional(v.number()),
  reasoningMicrousdPerMillionTokens: v.optional(v.number()),
  batchMultiplierBps: v.optional(v.number()),
  serviceTier: v.optional(v.string()),
});

function bounded(value: string, max: number, label: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new Error(`${label} is invalid.`);
  return normalized;
}

function optionalBounded(value: string | undefined, max: number, label: string) {
  return value === undefined ? undefined : bounded(value, max, label);
}

function recordValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function requireDigest(value: string, label: string) {
  if (!sha256.test(value)) throw new Error(`${label} must be a canonical SHA-256 digest.`);
  return value;
}

function gatewayAdmissionEnabled() {
  return process.env.MC_GOVERNED_INFERENCE_GATEWAY_ENABLED === "1";
}

export const registerPriceBookDraft = mutation({
  args: {
    projectId: v.id("projects"), priceBookKey: v.string(), version: v.number(),
    sourceKind: v.union(v.literal("PROVIDER_PUBLISHED"), v.literal("OPERATOR_APPROVED")),
    sourceReference: v.string(), sourceDigest: v.string(), effectiveFrom: v.number(),
    effectiveUntil: v.optional(v.number()), rates: v.array(priceRateValidator),
    registrationIdempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.MANAGE_AUTOMATION);
    const registrationKey = bounded(args.registrationIdempotencyKey, 200, "Price-book registration key");
    const snapshot = inferencePriceBook({
      priceBookId: `${args.projectId}:${bounded(args.priceBookKey, 100, "Price-book key")}:v${args.version}`,
      version: args.version,
      currency: "USD",
      source: {
        kind: args.sourceKind,
        reference: bounded(args.sourceReference, 1_000, "Price-book source reference"),
        digest: requireDigest(args.sourceDigest, "Price-book source digest"),
      },
      effectiveFrom: args.effectiveFrom,
      effectiveUntil: args.effectiveUntil,
      rates: args.rates,
    });
    const existing = await ctx.db.query("inferencePriceBooks")
      .withIndex("by_registration", (q) => q.eq("projectId", args.projectId).eq("registrationIdempotencyKey", registrationKey))
      .first();
    if (existing) {
      if (existing.priceBookDigest !== snapshot.digest) throw new Error("Price-book idempotency key is bound to different immutable bytes.");
      return { priceBookId: existing._id, priceBookDigest: existing.priceBookDigest, created: false as const };
    }
    const versionConflict = await ctx.db.query("inferencePriceBooks")
      .withIndex("by_project_key_version", (q) => q.eq("projectId", args.projectId).eq("priceBookKey", args.priceBookKey.trim()).eq("version", args.version))
      .first();
    if (versionConflict) throw new Error("Price-book version already exists.");
    const id = await ctx.db.insert("inferencePriceBooks", {
      tenantId: access.project.tenantId, projectId: args.projectId, priceBookKey: args.priceBookKey.trim(),
      version: args.version, currency: "USD", sourceKind: args.sourceKind,
      sourceReference: args.sourceReference.trim(), sourceDigest: args.sourceDigest,
      effectiveFrom: args.effectiveFrom, effectiveUntil: args.effectiveUntil, rates: args.rates,
      immutableSnapshot: snapshot, priceBookDigest: snapshot.digest, state: "DRAFT",
      registrationIdempotencyKey: registrationKey, createdBy: access.actorId, createdAt: Date.now(),
    });
    return { priceBookId: id, priceBookDigest: snapshot.digest, created: true as const };
  },
});

export const activatePriceBook = mutation({
  args: { priceBookId: v.id("inferencePriceBooks"), expectedDigest: v.string() },
  handler: async (ctx, args) => {
    const priceBook = await ctx.db.get(args.priceBookId);
    if (!priceBook) throw new Error("Price book is unavailable or unauthorized.");
    const access = await requireWorkspacePermission(ctx, priceBook.projectId, FACTORY_PERMISSIONS.APPROVE);
    if (priceBook.state !== "DRAFT" || priceBook.priceBookDigest !== args.expectedDigest) {
      throw new Error("Price-book activation identity or lifecycle mismatch.");
    }
    const snapshot = inferencePriceBook({
      priceBookId: priceBook.immutableSnapshot.priceBookId, version: priceBook.version, currency: "USD",
      source: { kind: priceBook.sourceKind, reference: priceBook.sourceReference, digest: priceBook.sourceDigest },
      effectiveFrom: priceBook.effectiveFrom, effectiveUntil: priceBook.effectiveUntil, rates: priceBook.rates,
    });
    if (snapshot.digest !== priceBook.priceBookDigest) throw new Error("Price-book immutable bytes drifted.");
    for (const rate of priceBook.rates) {
      const route = await ctx.db.query("modelCatalog")
        .withIndex("by_project", (q) => q.eq("projectId", priceBook.projectId))
        .filter((q) => q.eq(q.field("routeDigest"), rate.routeDigest))
        .first();
      if (!route || route.enabled !== true || route.qualificationStatus !== "EVIDENCE_QUALIFIED"
        || route.admissionStatus !== "PRODUCTION_PILOT_ELIGIBLE") {
        throw new Error("Every price-book rate requires an independently qualified exact route.");
      }
    }
    const active = await ctx.db.query("inferencePriceBooks")
      .withIndex("by_project", (q) => q.eq("projectId", priceBook.projectId))
      .filter((q) => q.eq(q.field("state"), "ACTIVE"))
      .collect();
    for (const prior of active) await ctx.db.patch(prior._id, { state: "RETIRED" });
    await ctx.db.patch(priceBook._id, { state: "ACTIVE" });
    return { priceBookId: priceBook._id, priceBookDigest: priceBook.priceBookDigest, activatedBy: access.actorId };
  },
});

export const createReservation = mutation({
  args: {
    projectId: v.id("projects"), workOrderId: v.id("workOrders"), taskId: v.id("tasks"),
    workflowRunId: v.id("workflowRuns"), executionProfileId: v.id("factoryExecutionProfiles"),
    logicalRequestKey: v.string(),
    executionProfileDigest: v.string(), primaryRoute: routeValidator, allowedFallbacks: v.array(routeValidator),
    maxPhysicalCalls: v.number(), maxInputTokens: v.number(), maxOutputTokens: v.number(),
    maxCacheReadTokens: v.number(), maxCacheWriteTokens: v.number(),
    maxReasoningTokens: v.number(), maxCostMicrousd: v.number(), deadlineAt: v.number(),
    priceBookId: v.id("inferencePriceBooks"), policyDigest: v.string(), leaseId: v.string(),
    leaseExpiresAt: v.number(), registrationIdempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    if (!gatewayAdmissionEnabled()) throw new Error("GOVERNED_INFERENCE_GATEWAY_DISABLED");
    const access = await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.MANAGE_AUTOMATION);
    const [workOrder, task, run, profile, priceBook, routeCatalog] = await Promise.all([
      ctx.db.get(args.workOrderId), ctx.db.get(args.taskId), ctx.db.get(args.workflowRunId),
      ctx.db.get(args.executionProfileId), ctx.db.get(args.priceBookId),
      ctx.db.query("modelCatalog").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
    ]);
    if (!workOrder || workOrder.projectId !== args.projectId || workOrder.approvalStatus !== "APPROVED"
      || run?.workOrderRevisionNumber !== workOrder.currentRevisionNumber || task?.projectId !== args.projectId
      || task._id !== run?.parentTaskId || run.projectId !== args.projectId || run.workOrderId !== args.workOrderId
      || run._id !== args.workflowRunId || run.status !== "RUNNING" || run.cancellationRequestedAt) {
      throw new Error("Reservation Attempt scope is unavailable, substituted, or inactive.");
    }
    if (!run.lease || run.lease.leaseId !== args.leaseId || run.lease.expiresAt <= Date.now()
      || args.leaseExpiresAt > run.lease.expiresAt) throw new Error("Reservation lease is stale or expanded.");
    if (!run.executionManifestDigest || args.policyDigest !== run.executionManifestDigest) {
      throw new Error("Reservation policy digest does not match the frozen Attempt execution manifest.");
    }
    const implementationPolicy = recordValue(recordValue(workOrder.metadata).implementationPolicy);
    const approvedMaxCostUsd = implementationPolicy.maxCostUsd;
    const approvedMaxCostMicrousd = typeof approvedMaxCostUsd === "number"
      ? Math.floor(approvedMaxCostUsd * 1_000_000)
      : Number.NaN;
    if (!Number.isSafeInteger(args.maxCostMicrousd) || args.maxCostMicrousd <= 0
      || !Number.isSafeInteger(approvedMaxCostMicrousd) || approvedMaxCostMicrousd <= 0
      || BigInt(args.maxCostMicrousd) > BigInt(approvedMaxCostMicrousd)) {
      throw new Error("Inference reservation exceeds or lacks the approved WorkOrder cost ceiling.");
    }
    if (!profile || profile.projectId !== args.projectId || profile._id !== run.executionProfileId
      || profile.profileDigest !== args.executionProfileDigest || run.executionProfileDigest !== args.executionProfileDigest
      || !profile.enabled || profile.qualificationStatus !== "EVIDENCE_QUALIFIED"
      || profile.admissionStatus !== "PRODUCTION_PILOT_ELIGIBLE" || (profile.qualificationExpiresAt ?? 0) <= Date.now()) {
      throw new Error("Reservation Execution Profile is not exact and current.");
    }
    for (const requestedRoute of [args.primaryRoute, ...args.allowedFallbacks]) {
      const route = routeCatalog.find((candidate) => candidate.routeDigest === requestedRoute.routeDigest);
      if (!route || route.enabled !== true || route.qualificationStatus !== "EVIDENCE_QUALIFIED"
        || route.admissionStatus !== "PRODUCTION_PILOT_ELIGIBLE"
        || route.provider !== requestedRoute.provider || route.providerRoute !== requestedRoute.providerRoute
        || route.modelId !== requestedRoute.modelId) {
        throw new Error("Every reservation route and fallback must be exact and independently qualified.");
      }
    }
    const reservationCreatedAt = Date.now();
    if (!priceBook || priceBook.projectId !== args.projectId || priceBook.state !== "ACTIVE"
      || priceBook.effectiveFrom > reservationCreatedAt
      || (priceBook.effectiveUntil !== undefined && priceBook.effectiveUntil <= reservationCreatedAt)) {
      throw new Error("Reservation requires the active workspace price book.");
    }
    const registrationKey = bounded(args.registrationIdempotencyKey, 200, "Reservation registration key");
    const existing = await ctx.db.query("inferenceReservations")
      .withIndex("by_registration", (q) => q.eq("projectId", args.projectId).eq("registrationIdempotencyKey", registrationKey)).first();
    const snapshot = inferenceReservation({
      reservationId: `${args.projectId}:${registrationKey}`, projectId: String(args.projectId),
      workOrderId: String(args.workOrderId), taskId: String(args.taskId), attemptId: String(args.workflowRunId),
      logicalRequestKey: bounded(args.logicalRequestKey, 500, "Logical request key"),
      executionProfileId: String(args.executionProfileId), executionProfileDigest: requireDigest(args.executionProfileDigest, "Execution Profile digest"),
      primaryRoute: args.primaryRoute, allowedFallbacks: args.allowedFallbacks,
      maxPhysicalCalls: args.maxPhysicalCalls, maxInputTokens: args.maxInputTokens,
      maxOutputTokens: args.maxOutputTokens, maxCacheReadTokens: args.maxCacheReadTokens,
      maxCacheWriteTokens: args.maxCacheWriteTokens, maxReasoningTokens: args.maxReasoningTokens,
      maxCostMicrousd: args.maxCostMicrousd, currency: "USD", deadlineAt: args.deadlineAt,
      priceBookId: priceBook.immutableSnapshot.priceBookId, priceBookDigest: priceBook.priceBookDigest,
      policyDigest: requireDigest(args.policyDigest, "Inference policy digest"), leaseId: args.leaseId,
      leaseExpiresAt: args.leaseExpiresAt, createdAt: existing?.createdAt ?? reservationCreatedAt,
    }, priceBook.immutableSnapshot);
    if (existing) {
      if (existing.reservationDigest !== snapshot.digest) throw new Error("Reservation idempotency key is bound to different immutable bytes.");
      return { reservationId: existing._id, reservationDigest: existing.reservationDigest, created: false as const };
    }
    const logicalReservation = await ctx.db.query("inferenceReservations")
      .withIndex("by_logical_request", (q) => q.eq("projectId", args.projectId).eq("logicalRequestKey", snapshot.logicalRequestKey)).first();
    if (logicalReservation) throw new Error("Logical inference request already has an immutable reservation.");
    const workOrderReservations = await ctx.db.query("inferenceReservations")
      .withIndex("by_work_order", (q) => q.eq("workOrderId", args.workOrderId)).collect();
    let allocatedMicrousd = 0n;
    for (const prior of workOrderReservations) {
      if (prior.projectId !== args.projectId || !Number.isSafeInteger(prior.maxCostMicrousd)
        || prior.maxCostMicrousd <= 0
        || recordValue(prior.immutableSnapshot).maxCostMicrousd !== prior.maxCostMicrousd) {
        throw new Error("Existing WorkOrder inference allocation is invalid; reconcile its authority before reserving more.");
      }
      allocatedMicrousd += BigInt(prior.maxCostMicrousd);
    }
    // Keep every allocation until an explicit settlement contract proves release.
    // The indexed read and insert share one Convex transaction, including retries.
    if (allocatedMicrousd + BigInt(args.maxCostMicrousd) > BigInt(approvedMaxCostMicrousd)) {
      throw new Error("Aggregate inference reservations exceed the approved WorkOrder cost ceiling.");
    }
    const id = await ctx.db.insert("inferenceReservations", {
      tenantId: access.project.tenantId, projectId: args.projectId, workOrderId: args.workOrderId,
      taskId: args.taskId, workflowRunId: args.workflowRunId, executionProfileId: args.executionProfileId,
      logicalRequestKey: snapshot.logicalRequestKey,
      executionProfileDigest: args.executionProfileDigest, primaryRoute: args.primaryRoute,
      allowedFallbacks: args.allowedFallbacks, maxPhysicalCalls: args.maxPhysicalCalls,
      maxInputTokens: args.maxInputTokens, maxOutputTokens: args.maxOutputTokens,
      maxCacheReadTokens: args.maxCacheReadTokens, maxCacheWriteTokens: args.maxCacheWriteTokens,
      maxReasoningTokens: args.maxReasoningTokens, maxCostMicrousd: args.maxCostMicrousd,
      currency: "USD", deadlineAt: args.deadlineAt, priceBookId: args.priceBookId,
      priceBookDigest: priceBook.priceBookDigest, policyDigest: args.policyDigest, leaseId: args.leaseId,
      leaseExpiresAt: args.leaseExpiresAt, immutableSnapshot: snapshot, reservationDigest: snapshot.digest,
      state: "ACTIVE", registrationIdempotencyKey: registrationKey, createdBy: access.actorId, createdAt: snapshot.createdAt,
    });
    return { reservationId: id, reservationDigest: snapshot.digest, created: true as const };
  },
});

export const persistIntentInternal = internalMutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
    reservationId: v.id("inferenceReservations"), logicalRequestKey: v.string(), physicalOrdinal: v.number(),
    retryOfIntentId: v.optional(v.id("inferencePhysicalIntents")),
    route: routeValidator, requestDigest: v.string(), intentKey: v.string(),
  },
  handler: async (ctx, args) => {
    const reservation = await ctx.db.get(args.reservationId);
    if (!reservation || reservation.workflowRunId !== args.workflowRunId || reservation.state !== "ACTIVE") {
      throw new Error("Inference reservation is unavailable, unscoped, or inactive.");
    }
    const logicalRequestKey = bounded(args.logicalRequestKey, 500, "Logical request key");
    if (reservation.logicalRequestKey !== logicalRequestKey) throw new Error("Inference reservation logical request scope is substituted.");
    const logicalIntents = await ctx.db.query("inferencePhysicalIntents")
      .withIndex("by_logical_request", (q) => q.eq("projectId", reservation.projectId).eq("logicalRequestKey", logicalRequestKey)).collect();
    const duplicate = logicalIntents.find((intent) => intent.physicalOrdinal === args.physicalOrdinal);
    if (duplicate) {
      const requested = canonicalDigest("inference-intent-replay/v1", {
        logicalRequestKey,
        physicalOrdinal: args.physicalOrdinal,
        retryOfIntentId: args.retryOfIntentId ? String(args.retryOfIntentId) : undefined,
        route: args.route,
        requestDigest: requireDigest(args.requestDigest, "Inference request digest"),
      });
      const persisted = canonicalDigest("inference-intent-replay/v1", {
        logicalRequestKey: duplicate.logicalRequestKey,
        physicalOrdinal: duplicate.physicalOrdinal,
        retryOfIntentId: duplicate.retryOfIntentId ? String(duplicate.retryOfIntentId) : undefined,
        route: duplicate.route,
        requestDigest: duplicate.requestDigest,
      });
      if (requested !== persisted) throw new Error("Inference intent replay conflicts with immutable history.");
      return { intentId: duplicate._id, state: duplicate.state, created: false as const };
    }
    const intents = await ctx.db.query("inferencePhysicalIntents")
      .withIndex("by_reservation", (q) => q.eq("reservationId", reservation._id)).collect();
    if (args.physicalOrdinal > 1) {
      const prior = args.retryOfIntentId ? await ctx.db.get(args.retryOfIntentId) : null;
      const priorReceipt = prior
        ? await ctx.db.query("inferencePhysicalReceipts").withIndex("by_intent", (q) => q.eq("intentId", prior._id)).first()
        : null;
      if (!prior || prior.reservationId !== reservation._id || prior.logicalRequestKey !== args.logicalRequestKey
        || prior.physicalOrdinal !== args.physicalOrdinal - 1 || prior.state !== "RECEIPTED" || !priorReceipt
        || priorReceipt.delivery !== "NOT_DELIVERED" || !["FAILED", "TIMED_OUT"].includes(priorReceipt.status)) {
        throw new Error("Retry/fallback requires one exact, definitive failed prior physical attempt.");
      }
    }
    const snapshot = physicalInferenceIntent({
      intentId: bounded(args.intentKey, 200, "Physical intent key"), reservationId: String(reservation._id),
      logicalRequestKey,
      physicalOrdinal: args.physicalOrdinal, retryOfIntentId: args.retryOfIntentId ? String(args.retryOfIntentId) : undefined,
      route: args.route,
      requestDigest: requireDigest(args.requestDigest, "Inference request digest"), createdAt: Date.now(),
    }, reservation.immutableSnapshot, intents.map((intent) => ({
      ...intent, schema: "inference-physical-intent/v1" as const, reservationId: String(intent.reservationId),
      intentId: String(intent._id), retryOfIntentId: intent.retryOfIntentId ? String(intent.retryOfIntentId) : undefined,
      digest: intent.intentDigest,
    })), Date.now());
    const id = await ctx.db.insert("inferencePhysicalIntents", {
      tenantId: reservation.tenantId, projectId: reservation.projectId, workflowRunId: reservation.workflowRunId,
      reservationId: reservation._id, logicalRequestKey: snapshot.logicalRequestKey,
      physicalOrdinal: snapshot.physicalOrdinal, retryOfIntentId: args.retryOfIntentId,
      route: snapshot.route, requestDigest: snapshot.requestDigest,
      intentDigest: snapshot.digest, state: "PERSISTED", createdAt: snapshot.createdAt,
    });
    return { intentId: id, state: "PERSISTED" as const, created: true as const };
  },
});

export const claimIntentInternal = internalMutation({
  args: {
    workflowRunId: v.id("workflowRuns"), intentId: v.id("inferencePhysicalIntents"),
    leaseId: v.string(), claimId: v.string(), cancelRequested: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    if (!intent || intent.workflowRunId !== args.workflowRunId) throw new Error("Physical inference intent is unavailable or unscoped.");
    const [reservation, run] = await Promise.all([ctx.db.get(intent.reservationId), ctx.db.get(intent.workflowRunId)]);
    if (intent.state !== "PERSISTED") return { claimed: false as const, reason: "PHYSICAL_INTENT_ALREADY_DECIDED", state: intent.state };
    if (!reservation || !run || reservation.workflowRunId !== args.workflowRunId || run._id !== args.workflowRunId) {
      throw new Error("Inference claim Attempt scope is unavailable or substituted.");
    }
    if ((args.cancelRequested || run.cancellationRequestedAt)
      && reservation.leaseId === args.leaseId && run.lease?.leaseId === args.leaseId) {
      await ctx.db.patch(intent._id, { state: "CANCELLED" });
      return { claimed: false as const, cancelled: true as const, reason: "ATTEMPT_CANCELLED" };
    }
    if (reservation.state !== "ACTIVE" || run.status !== "RUNNING"
      || run.cancellationRequestedAt || !run.lease || run.lease.leaseId !== args.leaseId
      || reservation.leaseId !== args.leaseId || run.lease.expiresAt <= Date.now()
      || reservation.leaseExpiresAt <= Date.now() || reservation.deadlineAt <= Date.now()) {
      throw new Error("Inference claim authority is stale or substituted.");
    }
    const claimId = bounded(args.claimId, 200, "Claim ID");
    const claimConflict = await ctx.db.query("inferencePhysicalIntents").withIndex("by_claim", (q) => q.eq("claimId", claimId)).first();
    if (claimConflict) throw new Error("Physical inference claim ID was replayed.");
    await ctx.db.patch(intent._id, { state: "CLAIMED", claimId, claimedAt: Date.now() });
    return { claimed: true as const, intentId: intent._id, reservationDigest: reservation.reservationDigest };
  },
});

export const appendReceiptInternal = internalMutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
    intentId: v.id("inferencePhysicalIntents"), resolvedProvider: v.optional(v.string()),
    resolvedModelId: v.optional(v.string()), providerRequestId: v.optional(v.string()),
    providerBillingId: v.optional(v.string()),
    delivery: v.union(v.literal("DELIVERED"), v.literal("NOT_DELIVERED"), v.literal("UNKNOWN")),
    status: v.union(v.literal("SUCCEEDED"), v.literal("FAILED"), v.literal("CANCELLED"), v.literal("TIMED_OUT"), v.literal("UNKNOWN")),
    usage: usageValidator, responseDigest: v.optional(v.string()), failureCode: v.optional(v.string()),
    startedAt: v.number(), completedAt: v.number(), batch: v.optional(v.boolean()), serviceTier: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.intentId);
    if (!intent || intent.workflowRunId !== args.workflowRunId) throw new Error("Physical inference intent is unavailable or unscoped.");
    const resolvedProvider = optionalBounded(args.resolvedProvider, 100, "Resolved provider");
    const resolvedModelId = optionalBounded(args.resolvedModelId, 200, "Resolved model ID");
    const providerRequestId = optionalBounded(args.providerRequestId, 300, "Provider request ID");
    const providerBillingId = optionalBounded(args.providerBillingId, 300, "Provider billing ID");
    const responseDigest = args.responseDigest === undefined ? undefined : requireDigest(args.responseDigest, "Inference response digest");
    const failureCode = optionalBounded(args.failureCode, 200, "Inference failure code");
    const existing = await ctx.db.query("inferencePhysicalReceipts").withIndex("by_intent", (q) => q.eq("intentId", intent._id)).first();
    if (existing) {
      const replayDigest = canonicalDigest("inference-receipt-replay/v1", {
        resolvedProvider, resolvedModelId, providerRequestId, providerBillingId,
        delivery: args.delivery,
        status: args.status,
        usage: args.usage,
        responseDigest, failureCode,
        startedAt: args.startedAt,
        completedAt: args.completedAt,
      });
      const existingDigest = canonicalDigest("inference-receipt-replay/v1", {
        resolvedProvider: existing.resolvedProvider,
        resolvedModelId: existing.resolvedModelId,
        providerRequestId: existing.providerRequestId,
        providerBillingId: existing.providerBillingId,
        delivery: existing.delivery,
        status: existing.status,
        usage: existing.usage,
        responseDigest: existing.responseDigest,
        failureCode: existing.failureCode,
        startedAt: existing.startedAt,
        completedAt: existing.completedAt,
      });
      if (replayDigest !== existingDigest) throw new Error("Inference receipt replay conflicts with immutable history.");
      return { receiptId: existing._id, receiptDigest: existing.receiptDigest, created: false as const };
    }
    const reservation = await ctx.db.get(intent.reservationId);
    if (!reservation) throw new Error("Inference receipt reservation is unavailable.");
    const priceBook = await ctx.db.get(reservation.priceBookId);
    if (!priceBook) throw new Error("Inference receipt price book is unavailable.");
    const receiptKey = canonicalDigest("inference-receipt-id/v1", { intentId: String(intent._id), completedAt: args.completedAt });
    const snapshot = physicalInferenceReceipt({
      receiptId: receiptKey, intent: {
        schema: "inference-physical-intent/v1", intentId: String(intent._id), reservationId: String(intent.reservationId),
        logicalRequestKey: intent.logicalRequestKey, physicalOrdinal: intent.physicalOrdinal, route: intent.route,
        retryOfIntentId: intent.retryOfIntentId ? String(intent.retryOfIntentId) : undefined,
        requestDigest: intent.requestDigest, state: intent.state, createdAt: intent.createdAt,
        claimedAt: intent.claimedAt, claimId: intent.claimId, digest: intent.intentDigest,
      }, reservation: reservation.immutableSnapshot, priceBook: priceBook.immutableSnapshot,
      resolvedProvider, resolvedModelId, providerRequestId, providerBillingId,
      delivery: args.delivery, status: args.status, usage: args.usage,
      responseDigest, failureCode,
      startedAt: args.startedAt, completedAt: args.completedAt, batch: args.batch, serviceTier: args.serviceTier,
    });
    if (providerRequestId) {
      const duplicateProviderRequest = await ctx.db.query("inferencePhysicalReceipts")
        .withIndex("by_provider_request", (q) => q.eq("projectId", reservation.projectId).eq("providerRequestId", providerRequestId)).first();
      if (duplicateProviderRequest) throw new Error("Provider response/request ID replay detected.");
    }
    const priorReceipts = await ctx.db.query("inferencePhysicalReceipts")
      .withIndex("by_reservation", (q) => q.eq("reservationId", reservation._id)).collect();
    for (const [key, ceiling] of [
      ["inputTokens", reservation.maxInputTokens], ["outputTokens", reservation.maxOutputTokens],
      ["cacheReadTokens", reservation.maxCacheReadTokens], ["cacheWriteTokens", reservation.maxCacheWriteTokens],
      ["reasoningTokens", reservation.maxReasoningTokens],
    ] as const) {
      const consumed = priorReceipts.reduce((sum, receipt) => sum + BigInt(receipt.usage[key] ?? 0), 0n);
      if (args.usage[key] !== undefined && consumed + BigInt(args.usage[key]!) > BigInt(ceiling)) {
        throw new Error(`RESERVATION_${key.replace("Tokens", "").replace(/([A-Z])/g, "_$1").toUpperCase()}_TOKEN_LIMIT_EXCEEDED`);
      }
    }
    const knownPrior = priorReceipts.reduce((sum, receipt) => sum + BigInt(receipt.costMicrousd ?? 0), 0n);
    if (snapshot.costMicrousd !== undefined
      && knownPrior + BigInt(snapshot.costMicrousd) > BigInt(reservation.maxCostMicrousd)) {
      throw new Error("RESERVATION_COST_LIMIT_EXCEEDED");
    }
    const id = await ctx.db.insert("inferencePhysicalReceipts", {
      tenantId: reservation.tenantId, projectId: reservation.projectId, workflowRunId: reservation.workflowRunId,
      reservationId: reservation._id, reservationDigest: reservation.reservationDigest,
      executionProfileId: reservation.executionProfileId, executionProfileDigest: reservation.executionProfileDigest,
      policyDigest: reservation.policyDigest, intentId: intent._id, logicalRequestKey: intent.logicalRequestKey,
      physicalOrdinal: intent.physicalOrdinal, route: intent.route, resolvedProvider,
      resolvedModelId, providerRequestId, providerBillingId, delivery: args.delivery, status: args.status,
      usage: args.usage, usageCompleteness: snapshot.usageCompleteness,
      costMicrousd: snapshot.costMicrousd, costCompleteness: snapshot.costCompleteness,
      priceBookId: priceBook._id, priceBookDigest: priceBook.priceBookDigest,
      responseDigest, failureCode, startedAt: args.startedAt,
      completedAt: args.completedAt, receiptDigest: snapshot.receiptDigest,
    });
    await ctx.db.patch(intent._id, { state: args.delivery === "UNKNOWN" ? "AMBIGUOUS" : "RECEIPTED" });
    if (intent.physicalOrdinal >= reservation.maxPhysicalCalls) await ctx.db.patch(reservation._id, { state: "EXHAUSTED" });
    return { receiptId: id, receiptDigest: snapshot.receiptDigest, created: true as const };
  },
});

export const appendReconciliationInternal = internalMutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
    receiptId: v.id("inferencePhysicalReceipts"), providerEventId: v.string(), providerRequestId: v.string(),
    providerBillingId: v.optional(v.string()), observedUsage: v.optional(usageValidator),
    observedCostMicrousd: v.optional(v.number()), completeness: completenessValidator, sourceDigest: v.string(),
    reconciledBy: v.string(),
  },
  handler: async (ctx, args) => {
    const providerEventId = bounded(args.providerEventId, 300, "Provider event ID");
    const providerRequestId = bounded(args.providerRequestId, 300, "Provider request ID");
    const providerBillingId = optionalBounded(args.providerBillingId, 300, "Provider billing ID");
    const reconciledBy = bounded(args.reconciledBy, 200, "Reconciliation service identity");
    const receipt = await ctx.db.get(args.receiptId);
    if (!receipt || receipt.workflowRunId !== args.workflowRunId
      || !receipt.providerRequestId || receipt.providerRequestId !== providerRequestId) {
      throw new Error("Reconciliation provider request identity does not match a receipt.");
    }
    if (args.observedCostMicrousd !== undefined && (!Number.isSafeInteger(args.observedCostMicrousd) || args.observedCostMicrousd < 0)) {
      throw new Error("Reconciliation cost is invalid.");
    }
    const existing = await ctx.db.query("inferenceReconciliations")
      .withIndex("by_provider_event", (q) => q.eq("projectId", receipt.projectId).eq("providerEventId", providerEventId)).first();
    const snapshot = {
      schema: "inference-reconciliation/v1", receiptId: String(receipt._id), providerEventId,
      providerRequestId, providerBillingId,
      observedUsage: args.observedUsage, observedCostMicrousd: args.observedCostMicrousd,
      completeness: args.completeness, sourceDigest: requireDigest(args.sourceDigest, "Reconciliation source digest"),
    };
    const reconciliationDigest = canonicalDigest("inference-reconciliation/v1", snapshot);
    if (existing) {
      if (existing.reconciliationDigest !== reconciliationDigest) throw new Error("Provider billing event replay conflicts with immutable history.");
      return { reconciliationId: existing._id, created: false as const };
    }
    const id = await ctx.db.insert("inferenceReconciliations", {
      tenantId: receipt.tenantId, projectId: receipt.projectId, workflowRunId: receipt.workflowRunId,
      receiptId: receipt._id,
      providerEventId, providerRequestId, providerBillingId,
      observedUsage: args.observedUsage, observedCostMicrousd: args.observedCostMicrousd,
      completeness: args.completeness, sourceDigest: args.sourceDigest, reconciliationDigest,
      reconciledBy, reconciledAt: Date.now(),
    });
    return { reconciliationId: id, created: true as const };
  },
});

export const recordOutcomeEvent = mutation({
  args: {
    projectId: v.id("projects"), workOrderId: v.id("workOrders"), workflowRunId: v.id("workflowRuns"),
    stage: outcomeStageValidator, sourceType: v.string(), sourceId: v.string(), sourceDigest: v.string(), occurredAt: v.number(),
  },
  handler: async (ctx, args) => {
    const sourceType = bounded(args.sourceType, 100, "Outcome source type");
    const sourceId = bounded(args.sourceId, 300, "Outcome source ID");
    const sourceDigest = requireDigest(args.sourceDigest, "Outcome source digest");
    const permission = args.stage === "HUMAN_ACCEPTED" ? FACTORY_PERMISSIONS.APPROVE : FACTORY_PERMISSIONS.IMPROVE;
    const access = await requireWorkspacePermission(ctx, args.projectId, permission);
    const [workOrder, run] = await Promise.all([ctx.db.get(args.workOrderId), ctx.db.get(args.workflowRunId)]);
    if (!workOrder || workOrder.projectId !== args.projectId || !run || run.projectId !== args.projectId
      || run.workOrderId !== args.workOrderId) throw new Error("Outcome event scope is substituted.");
    if (args.stage === "VERIFICATION_PASSED") {
      if (sourceType !== "verification-receipt") throw new Error("Verification outcome requires a canonical verification receipt.");
      const receipt = await ctx.db.get(sourceId as Id<"verificationReceipts">);
      if (!receipt || String(receipt._id) !== sourceId || receipt.workOrderId !== args.workOrderId
        || receipt.verdict !== "VERIFIED" || receipt.independenceValid !== true || receipt.invalidatedAt
        || ![receipt.workflowRunId, receipt.sourceAttemptId].some((id) => id === args.workflowRunId)
        || args.occurredAt !== receipt.recordedAt) {
        throw new Error("Verification outcome source is not an independent current pass for this Attempt.");
      }
      const expected = canonicalOutcomeSourceDigest({
        sourceType, sourceId: String(receipt._id), workOrderId: String(receipt.workOrderId),
        workflowRunId: String(receipt.workflowRunId), sourceAttemptId: receipt.sourceAttemptId ? String(receipt.sourceAttemptId) : undefined,
        verdict: receipt.verdict, independenceValid: receipt.independenceValid,
        verificationSubjectDigest: receipt.verificationSubjectDigest, decisionInputDigest: receipt.decisionInputDigest,
        recordedAt: receipt.recordedAt,
      });
      if (sourceDigest !== expected) throw new Error("Verification outcome source digest does not match canonical facts.");
    } else if (args.stage === "HUMAN_ACCEPTED") {
      if (sourceType !== "approval-decision") throw new Error("Acceptance outcome requires a canonical human approval decision.");
      const approval = await ctx.db.get(sourceId as Id<"approvalDecisions">);
      if (!approval || String(approval._id) !== sourceId || approval.workOrderId !== args.workOrderId
        || approval.workflowRunId !== args.workflowRunId || approval.status !== "APPROVED"
        || !["APPROVE", "APPROVE_WITH_CONDITIONS"].includes(approval.decision ?? "")
        || approval.revokedAt || approval.expiredAt || approval.supersededByApprovalDecisionId || !approval.decidedAt
        || args.occurredAt !== approval.decidedAt) {
        throw new Error("Acceptance outcome source is not a current explicit human approval for this Attempt.");
      }
      const expected = canonicalOutcomeSourceDigest({
        sourceType, sourceId: String(approval._id), workOrderId: String(approval.workOrderId),
        workflowRunId: approval.workflowRunId ? String(approval.workflowRunId) : undefined,
        approvalType: approval.approvalType, requestedAction: approval.requestedAction,
        status: approval.status, decision: approval.decision, approver: approval.approver, decidedAt: approval.decidedAt,
      });
      if (sourceDigest !== expected) throw new Error("Acceptance outcome source digest does not match canonical facts.");
    } else {
      throw new Error("OUTCOME_STAGE_SOURCE_NOT_YET_QUALIFIED");
    }
    const existing = await ctx.db.query("factoryOutcomeEvents")
      .withIndex("by_source", (q) => q.eq("projectId", args.projectId).eq("sourceType", sourceType).eq("sourceId", sourceId)).first();
    const event = factoryOutcomeEvent({
      eventId: `${sourceType}:${sourceId}`, projectId: String(args.projectId), workOrderId: String(args.workOrderId),
      attemptId: String(args.workflowRunId), stage: args.stage, sourceType,
      sourceId, sourceDigest,
      occurredAt: args.occurredAt, recordedAt: existing?.recordedAt ?? Date.now(),
    });
    if (existing) {
      if (existing.eventDigest !== event.digest) throw new Error("Outcome source replay conflicts with immutable history.");
      return { outcomeEventId: existing._id, eventDigest: existing.eventDigest, created: false as const };
    }
    const id = await ctx.db.insert("factoryOutcomeEvents", {
      tenantId: access.project.tenantId, projectId: args.projectId, workOrderId: args.workOrderId,
      workflowRunId: args.workflowRunId, stage: args.stage, sourceType, sourceId,
      sourceDigest, occurredAt: args.occurredAt, recordedAt: event.recordedAt,
      eventDigest: event.digest, recordedBy: access.actorId,
    });
    return { outcomeEventId: id, eventDigest: event.digest, created: true as const };
  },
});

export const createOutcomeProjection = mutation({
  args: { workflowRunId: v.id("workflowRuns"), cohortDigest: v.string(), routeDigest: v.string() },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run?.projectId || !run.workOrderId) throw new Error("Outcome projection Attempt is unavailable or unscoped.");
    const access = await requireWorkspacePermission(ctx, run.projectId, FACTORY_PERMISSIONS.IMPROVE);
    const prior = await ctx.db.query("factoryOutcomeProjections").withIndex("by_attempt", (q) => q.eq("workflowRunId", run._id)).collect();
    const [events, receipts, reconciliations] = await Promise.all([
      ctx.db.query("factoryOutcomeEvents").withIndex("by_attempt", (q) => q.eq("workflowRunId", run._id)).collect(),
      ctx.db.query("inferencePhysicalReceipts").withIndex("by_attempt", (q) => q.eq("workflowRunId", run._id)).collect(),
      ctx.db.query("inferenceReconciliations").withIndex("by_attempt", (q) => q.eq("workflowRunId", run._id)).collect(),
    ]);
    const projectedAt = Date.now();
    const projection = projectFactoryOutcome({
      projectionId: `${run._id}:v${prior.length + 1}`, cohortDigest: requireDigest(args.cohortDigest, "Outcome cohort digest"),
      projectId: String(run.projectId), workOrderId: String(run.workOrderId), attemptId: String(run._id),
      routeDigest: requireDigest(args.routeDigest, "Outcome route digest"),
      events: events.map((event) => ({
        schema: "factory-outcome-event/v1", eventId: String(event._id), projectId: String(event.projectId),
        workOrderId: String(event.workOrderId), attemptId: String(event.workflowRunId), stage: event.stage,
        sourceType: event.sourceType, sourceId: event.sourceId, sourceDigest: event.sourceDigest,
        occurredAt: event.occurredAt, recordedAt: event.recordedAt, digest: event.eventDigest,
      })),
      receipts: receipts.map((receipt) => ({
        schema: "inference-physical-receipt/v1", receiptId: String(receipt._id), intentId: String(receipt.intentId),
        reservationId: String(receipt.reservationId), logicalRequestKey: receipt.logicalRequestKey,
        reservationDigest: receipt.reservationDigest, attemptId: String(receipt.workflowRunId),
        executionProfileId: String(receipt.executionProfileId), executionProfileDigest: receipt.executionProfileDigest,
        policyDigest: receipt.policyDigest,
        physicalOrdinal: receipt.physicalOrdinal, route: receipt.route, resolvedProvider: receipt.resolvedProvider,
        resolvedModelId: receipt.resolvedModelId, providerRequestId: receipt.providerRequestId,
        providerBillingId: receipt.providerBillingId, delivery: receipt.delivery, status: receipt.status,
        usage: receipt.usage, usageCompleteness: receipt.usageCompleteness, costMicrousd: receipt.costMicrousd,
        costCompleteness: receipt.costCompleteness, priceBookId: String(receipt.priceBookId),
        priceBookDigest: receipt.priceBookDigest, responseDigest: receipt.responseDigest,
        failureCode: receipt.failureCode, startedAt: receipt.startedAt, completedAt: receipt.completedAt,
        receiptDigest: receipt.receiptDigest,
      })),
      reconciliations: reconciliations.map((reconciliation) => ({
        reconciliationId: String(reconciliation._id), receiptId: String(reconciliation.receiptId),
        observedCostMicrousd: reconciliation.observedCostMicrousd,
        completeness: reconciliation.completeness, reconciledAt: reconciliation.reconciledAt,
        digest: reconciliation.reconciliationDigest,
      })),
      projectedAt,
    });
    const id = await ctx.db.insert("factoryOutcomeProjections", {
      tenantId: run.tenantId, projectId: run.projectId, workOrderId: run.workOrderId, workflowRunId: run._id,
      routeDigest: projection.routeDigest, formulaVersion: projection.formulaVersion,
      cohortDigest: projection.cohortDigest, outcome: projection.outcome, stages: projection.stages,
      receiptIds: receipts.map((receipt) => receipt._id),
      reconciliationIds: reconciliations.map((reconciliation) => reconciliation._id),
      physicalCallCount: projection.physicalCallCount,
      knownCostMicrousd: projection.knownCostMicrousd, totalCostMicrousd: projection.totalCostMicrousd,
      costCoverage: projection.costCoverage, costCompleteness: projection.costCompleteness,
      freshnessAt: projection.freshnessAt, confidence: projection.confidence,
      lineageDigest: projection.lineageDigest, projectionDigest: projection.digest,
      createdBy: access.actorId, createdAt: projectedAt,
    });
    return { projectionId: id, projectionDigest: projection.digest, outcome: projection.outcome, costCompleteness: projection.costCompleteness };
  },
});

export const getAttemptEconomics = query({
  args: { workflowRunId: v.id("workflowRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run?.projectId) throw new Error("Attempt is unavailable or unauthorized.");
    await requireWorkspacePermission(ctx, run.projectId, FACTORY_PERMISSIONS.VIEW);
    const [reservations, intents, receipts, reconciliations, outcomes, projections, comparisons] = await Promise.all([
      ctx.db.query("inferenceReservations").withIndex("by_attempt", (q) => q.eq("workflowRunId", run._id)).collect(),
      ctx.db.query("inferencePhysicalIntents").withIndex("by_attempt", (q) => q.eq("workflowRunId", run._id)).collect(),
      ctx.db.query("inferencePhysicalReceipts").withIndex("by_attempt", (q) => q.eq("workflowRunId", run._id)).collect(),
      ctx.db.query("inferenceReconciliations").withIndex("by_attempt", (q) => q.eq("workflowRunId", run._id)).collect(),
      ctx.db.query("factoryOutcomeEvents").withIndex("by_attempt", (q) => q.eq("workflowRunId", run._id)).collect(),
      ctx.db.query("factoryOutcomeProjections").withIndex("by_attempt", (q) => q.eq("workflowRunId", run._id)).collect(),
      ctx.db.query("inferenceRouteComparisons").withIndex("by_project", (q) => q.eq("projectId", run.projectId!)).order("desc").take(100),
    ]);
    const latest = [...projections].sort((left, right) => right.createdAt - left.createdAt)[0];
    return {
      maturity: "EXPERIMENTAL_OFFLINE_QUALIFIED" as const,
      gatewayAdmissionEnabled: gatewayAdmissionEnabled(), reservations, intents, receipts, reconciliations, outcomes,
      latestProjection: latest ?? null,
      latestComparison: comparisons.find((comparison) => receipts.some((receipt) =>
        receipt.route.routeDigest === comparison.leftRouteDigest || receipt.route.routeDigest === comparison.rightRouteDigest)) ?? null,
      state: latest ? latest.costCompleteness === "COMPLETE" ? "COMPLETE" : latest.costCompleteness
        : intents.some((intent) => intent.state === "AMBIGUOUS") ? "UNKNOWN"
          : intents.some((intent) => intent.state === "CLAIMED") ? "IN_PROGRESS" : "EMPTY",
      limitations: ["No live provider route qualified", "No autonomous route promotion", "No deployment authority"],
    };
  },
});

export const freezeRouteComparison = mutation({
  args: {
    projectId: v.id("projects"), leftRouteDigest: v.string(), rightRouteDigest: v.string(),
    cohortDigest: v.string(), minimumSampleSize: v.number(), maximumAgeMs: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.leftRouteDigest === args.rightRouteDigest) throw new Error("A route cannot be compared with itself.");
    const access = await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.IMPROVE);
    const [leftProjections, rightProjections, catalog] = await Promise.all([
      ctx.db.query("factoryOutcomeProjections").withIndex("by_route", (q) => q.eq("projectId", args.projectId).eq("routeDigest", args.leftRouteDigest)).collect(),
      ctx.db.query("factoryOutcomeProjections").withIndex("by_route", (q) => q.eq("projectId", args.projectId).eq("routeDigest", args.rightRouteDigest)).collect(),
      ctx.db.query("modelCatalog").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
    ]);
    const now = Date.now();
    const summaryInput = { cohortDigest: requireDigest(args.cohortDigest, "Comparison cohort digest"), minimumSampleSize: args.minimumSampleSize, now, maxAgeMs: args.maximumAgeMs };
    let left = summarizeRouteEconomics(leftProjections.map(projectionValue), { ...summaryInput, routeDigest: requireDigest(args.leftRouteDigest, "Left route digest") });
    let right = summarizeRouteEconomics(rightProjections.map(projectionValue), { ...summaryInput, routeDigest: requireDigest(args.rightRouteDigest, "Right route digest") });
    const routeQualified = (routeDigest: string) => catalog.some((route) => route.routeDigest === routeDigest
      && route.enabled === true && route.qualificationStatus === "EVIDENCE_QUALIFIED"
      && route.admissionStatus === "PRODUCTION_PILOT_ELIGIBLE");
    if (!routeQualified(left.routeDigest)) left = disqualifySummary(left, "ROUTE_NOT_INDEPENDENTLY_QUALIFIED");
    if (!routeQualified(right.routeDigest)) right = disqualifySummary(right, "ROUTE_NOT_INDEPENDENTLY_QUALIFIED");
    const comparison = compareRouteEconomics(left, right);
    const snapshot = {
      schema: "inference-route-comparison/v1", projectId: String(args.projectId),
      leftRouteDigest: args.leftRouteDigest, rightRouteDigest: args.rightRouteDigest,
      cohortDigest: args.cohortDigest, formulaVersion: "accepted-outcome-economics/v1" as const,
      minimumSampleSize: args.minimumSampleSize, maximumAgeMs: args.maximumAgeMs,
      leftSummary: left, rightSummary: right, status: comparison.status,
      advisoryWinnerRouteDigest: comparison.status === "ADVISORY_ONLY" ? comparison.winner : undefined,
      blockers: comparison.blockers, automaticPromotionAuthorized: false as const, createdAt: now,
    };
    const comparisonDigest = canonicalDigest("inference-route-comparison/v1", snapshot);
    const id = await ctx.db.insert("inferenceRouteComparisons", {
      tenantId: access.project.tenantId, projectId: args.projectId,
      leftRouteDigest: args.leftRouteDigest, rightRouteDigest: args.rightRouteDigest,
      cohortDigest: args.cohortDigest, formulaVersion: "accepted-outcome-economics/v1",
      minimumSampleSize: args.minimumSampleSize, maximumAgeMs: args.maximumAgeMs,
      leftSummary: left, rightSummary: right, status: comparison.status,
      advisoryWinnerRouteDigest: comparison.status === "ADVISORY_ONLY" ? comparison.winner : undefined,
      blockers: comparison.blockers, automaticPromotionAuthorized: false,
      comparisonDigest, createdBy: access.actorId, createdAt: now,
    });
    return { comparisonId: id, comparisonDigest, ...comparison, automaticPromotionAuthorized: false as const };
  },
});

export const listRouteComparisons = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    return await ctx.db.query("inferenceRouteComparisons").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).order("desc").take(100);
  },
});

function projectionValue(projection: Doc<"factoryOutcomeProjections">) {
  return {
    schema: "factory-outcome-projection/v1" as const, projectionId: String(projection._id),
    formulaVersion: projection.formulaVersion, cohortDigest: projection.cohortDigest,
    projectId: String(projection.projectId), workOrderId: String(projection.workOrderId),
    attemptId: String(projection.workflowRunId), routeDigest: projection.routeDigest,
    outcome: projection.outcome, stages: projection.stages,
    receiptIds: projection.receiptIds.map(String), reconciliationIds: projection.reconciliationIds.map(String),
    physicalCallCount: projection.physicalCallCount,
    knownCostMicrousd: projection.knownCostMicrousd, totalCostMicrousd: projection.totalCostMicrousd,
    costCoverage: projection.costCoverage, costCompleteness: projection.costCompleteness,
    freshnessAt: projection.freshnessAt, confidence: projection.confidence,
    lineageDigest: projection.lineageDigest, digest: projection.projectionDigest,
  };
}

function disqualifySummary<T extends { blockers: string[] }>(summary: T, blocker: string): T & { eligibleForPromotion: false; costPerAcceptedOutcomeMicrousd: undefined; confidence: "LOW" | "NONE" } {
  return {
    ...summary,
    blockers: [...new Set([...summary.blockers, blocker])],
    eligibleForPromotion: false,
    costPerAcceptedOutcomeMicrousd: undefined,
    confidence: "LOW" as const,
  };
}
