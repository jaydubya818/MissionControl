import { v, type Infer } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { FACTORY_PERMISSIONS, requireWorkspacePermission } from "./lib/companyAccess";
import {
  factoryOutcomeEvent,
  canonicalOutcomeSourceDigest,
  inferencePriceBook,
  inferenceReservation,
  physicalInferenceIntent,
  claimPhysicalInferenceIntent,
  physicalInferenceReceipt,
  projectFactoryOutcome,
  compareRouteEconomics,
  summarizeRouteEconomics,
  assertClassifyInferenceRoute,
  assertClassifyInferenceDispatchAllowance,
  usageCompleteness,
  OUTCOME_FORMULA_VERSION,
} from "@mission-control/shared";
import { canonicalDigest } from "@mission-control/shared";
import type { InferenceReservation, PhysicalInferenceIntent, PhysicalInferenceReceipt,
  FactoryOutcomeProjection, InferencePriceBook, ClassifyInferenceDispatchAllowance } from "@mission-control/shared";
import type { Doc, Id } from "./_generated/dataModel";
import { loadExecutionProfileAdmission } from "./lib/executionProfileAdmission";
import { factoryLeaseMatchesCurrentRegistration } from "./lib/factoryAttempt";
import { resolveCurrentAttemptExecutionProfile } from "./lib/attemptExecutionProfile";
import { modelRouteQualifiedFor } from "./lib/modelRouteAdmission";

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

function canonicalSnapshot<T>(value: unknown, schema: string, digestKey: "digest" | "receiptDigest", expectedDigest: string): T {
  const { [digestKey]: recordedDigest, ...bytes } = recordValue(value);
  if (bytes.schema !== schema || recordedDigest !== expectedDigest || canonicalDigest(schema, bytes) !== expectedDigest) {
    throw new Error("Canonical inference snapshot is missing, invalid, or inconsistent with its recorded digest.");
  }
  return value as T;
}

function reservationValue(reservation: Doc<"inferenceReservations">) {
  const snapshot = canonicalSnapshot<InferenceReservation>(reservation.immutableSnapshot,
    "inference-reservation/v1", "digest", reservation.reservationDigest);
  if (snapshot.projectId !== String(reservation.projectId) || snapshot.workOrderId !== String(reservation.workOrderId)
    || snapshot.taskId !== String(reservation.taskId) || snapshot.attemptId !== String(reservation.workflowRunId)
    || snapshot.logicalRequestKey !== reservation.logicalRequestKey) {
    throw new Error("Canonical reservation identity does not match its persisted scope.");
  }
  return snapshot;
}

function intentValue(intent: Doc<"inferencePhysicalIntents">, reservation: Doc<"inferenceReservations">) {
  const snapshot = canonicalSnapshot<PhysicalInferenceIntent>(intent.immutableSnapshot,
    "inference-physical-intent/v2", "digest", intent.intentDigest);
  if (snapshot.state !== "PERSISTED" || !snapshot.intentId || intent.reservationId !== reservation._id
    || intent.workflowRunId !== reservation.workflowRunId
    || snapshot.reservationId !== reservationValue(reservation).reservationId
    || snapshot.logicalRequestKey !== intent.logicalRequestKey || snapshot.physicalOrdinal !== intent.physicalOrdinal
    || snapshot.requestDigest !== intent.requestDigest || snapshot.createdAt !== intent.createdAt
    || canonicalDigest("inference-route-binding/v1", snapshot.route) !== canonicalDigest("inference-route-binding/v1", intent.route)) {
    throw new Error("Canonical intent identity does not match its persisted scope.");
  }
  return snapshot;
}

function receiptValue(receipt: Doc<"inferencePhysicalReceipts">) {
  const schema = recordValue(receipt.immutableSnapshot).schema;
  if (schema !== "inference-physical-receipt/v2" && schema !== "inference-physical-receipt/v3") {
    throw new Error("Canonical inference receipt snapshot schema is unsupported.");
  }
  const snapshot = canonicalSnapshot<PhysicalInferenceReceipt>(receipt.immutableSnapshot,
    schema, "receiptDigest", receipt.receiptDigest);
  if (snapshot.attemptId !== String(receipt.workflowRunId) || snapshot.reservationDigest !== receipt.reservationDigest
    || snapshot.logicalRequestKey !== receipt.logicalRequestKey || snapshot.physicalOrdinal !== receipt.physicalOrdinal) {
    throw new Error("Canonical receipt identity does not match its persisted scope.");
  }
  if (usageCompleteness(snapshot.usage) !== snapshot.usageCompleteness
    || (snapshot.costMicrousd !== undefined && (!Number.isSafeInteger(snapshot.costMicrousd) || snapshot.costMicrousd < 0))
    || (schema === "inference-physical-receipt/v3" && (!Array.isArray(snapshot.violationCodes)
      || snapshot.violationCodes.some(code => typeof code !== "string")
      || snapshot.costClassification !== (snapshot.costMicrousd === undefined ? "UNKNOWN" : "ESTIMATED")))) {
    throw new Error("Canonical receipt observation fields are invalid.");
  }
  return snapshot;
}

export function assertInferenceSpendingAllowed(workOrder: { inferenceSpendingFence?: unknown } | null) {
  if (!workOrder) throw new Error("Inference WorkOrder is unavailable.");
  if (workOrder.inferenceSpendingFence) throw new Error("WORK_ORDER_INFERENCE_SPENDING_FENCED");
}

/** Monotonic incident fence. Observations and corrections never release capacity. */
export async function fenceWorkOrderInferenceSpending(ctx: MutationCtx, workOrderId: Id<"workOrders">,
  sourceDigest: string, violationCodes: string[], receiptId?: Id<"inferencePhysicalReceipts">) {
  const workOrder = await ctx.db.get(workOrderId);
  if (!workOrder) throw new Error("Inference WorkOrder is unavailable.");
  if (!workOrder.inferenceSpendingFence) await ctx.db.patch(workOrderId, {
    inferenceSpendingFence: { fencedAt: Date.now(), sourceDigest, violationCodes, ...(receiptId ? { receiptId } : {}) },
  });
}

function reconciliationValue(event: Doc<"inferenceReconciliations">, receipt: Doc<"inferencePhysicalReceipts">) {
  const bytes = { schema: "inference-reconciliation/v1", receiptId: String(receipt._id),
    providerEventId: event.providerEventId, providerRequestId: event.providerRequestId,
    providerBillingId: event.providerBillingId, observedUsage: event.observedUsage,
    observedCostMicrousd: event.observedCostMicrousd, completeness: event.completeness, sourceDigest: event.sourceDigest };
  if (event.receiptId !== receipt._id || event.workflowRunId !== receipt.workflowRunId || event.projectId !== receipt.projectId
    || canonicalDigest("inference-reconciliation/v1", bytes) !== event.reconciliationDigest) {
    throw new Error("Canonical reconciliation history is invalid.");
  }
  if (event.observedUsage) usageCompleteness(event.observedUsage);
  if (event.observedCostMicrousd !== undefined && (!Number.isSafeInteger(event.observedCostMicrousd) || event.observedCostMicrousd < 0)) {
    throw new Error("Canonical reconciliation cost is invalid.");
  }
  return event;
}

async function effectiveReservationObservations(ctx: MutationCtx, reservationRow: Doc<"inferenceReservations">,
  correction?: { receiptId: Id<"inferencePhysicalReceipts">; observedUsage?: PhysicalInferenceReceipt["usage"];
    observedCostMicrousd?: number; completeness: "COMPLETE" | "PARTIAL" | "UNKNOWN" }) {
  const reservation = reservationValue(reservationRow);
  const receipts = await ctx.db.query("inferencePhysicalReceipts")
    .withIndex("by_reservation", q => q.eq("reservationId", reservationRow._id)).collect();
  return Promise.all(receipts.map(async row => {
    const canonical = receiptValue(row);
    if (canonical.reservationId !== reservation.reservationId || canonical.reservationDigest !== reservation.digest) {
      throw new Error("Reconciliation receipt reservation scope is invalid.");
    }
    const usage = { ...canonical.usage };
    let costMicrousd = canonical.costMicrousd;
    const events = await ctx.db.query("inferenceReconciliations")
      .withIndex("by_receipt", q => q.eq("receiptId", row._id)).collect();
    // Arrival order is accounting history, not an asserted provider revision.
    for (const event of events.sort((a, b) => a.reconciledAt - b.reconciledAt)) {
      reconciliationValue(event, row);
      if (event.observedUsage) Object.assign(usage, event.observedUsage);
      if (event.observedCostMicrousd !== undefined || event.completeness === "UNKNOWN") costMicrousd = event.observedCostMicrousd;
    }
    if (row._id === correction?.receiptId) {
      if (correction.observedUsage) Object.assign(usage, correction.observedUsage);
      if (correction.observedCostMicrousd !== undefined || correction.completeness === "UNKNOWN") costMicrousd = correction.observedCostMicrousd;
    }
    usageCompleteness(usage);
    if (costMicrousd !== undefined && (!Number.isSafeInteger(costMicrousd) || costMicrousd < 0)) {
      throw new Error("Canonical reconciliation cost is invalid.");
    }
    return { reservationId: canonical.reservationId, reservationDigest: canonical.reservationDigest, usage, costMicrousd };
  }));
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

export function assertCumulativeInferenceBudget(workOrderReservations: readonly Doc<"inferenceReservations">[], projectId: Id<"projects">, maximumMicrousd: number, approvedMicrousd: number) {
  if (!Number.isSafeInteger(maximumMicrousd) || maximumMicrousd <= 0 || !Number.isSafeInteger(approvedMicrousd) || approvedMicrousd <= 0) throw new Error("Inference allocation money ceiling is invalid.");
    let allocatedMicrousd = 0n;
    for (const prior of workOrderReservations) {
      if (prior.projectId !== projectId || !Number.isSafeInteger(prior.maxCostMicrousd)
        || prior.maxCostMicrousd <= 0
        || recordValue(prior.immutableSnapshot).maxCostMicrousd !== prior.maxCostMicrousd) {
        throw new Error("Existing WorkOrder inference allocation is invalid; reconcile its authority before reserving more.");
      }
      allocatedMicrousd += BigInt(prior.maxCostMicrousd);
    }
    // Keep every allocation until an explicit settlement contract proves release.
    // The indexed read and insert share one Convex transaction, including retries.
    if (allocatedMicrousd + BigInt(maximumMicrousd) > BigInt(approvedMicrousd)) {
      throw new Error("Aggregate inference reservations exceed the approved WorkOrder cost ceiling.");
    }
}

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
    const aggregate = await ctx.db.query("factoryProviderReservations").withIndex("by_work_order", q => q.eq("workOrderId", args.workOrderId)).first();
    if (aggregate) throw new Error("WorkOrder aggregate liability requires the composed admission path.");
    const [workOrder, task, run, profile, priceBook, routeCatalog] = await Promise.all([
      ctx.db.get(args.workOrderId), ctx.db.get(args.taskId), ctx.db.get(args.workflowRunId),
      ctx.db.get(args.executionProfileId), ctx.db.get(args.priceBookId),
      ctx.db.query("modelCatalog").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).collect(),
    ]);
    assertInferenceSpendingAllowed(workOrder);
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
    assertCumulativeInferenceBudget(workOrderReservations, args.projectId, args.maxCostMicrousd, approvedMaxCostMicrousd);
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

const persistIntentTransactionArgs = v.object({
    workflowRunId: v.id("workflowRuns"),
    reservationId: v.id("inferenceReservations"), logicalRequestKey: v.string(), physicalOrdinal: v.number(),
    retryOfIntentId: v.optional(v.id("inferencePhysicalIntents")),
    route: routeValidator, requestDigest: v.string(), intentKey: v.string(),
  });

export async function persistIntentInTransaction(ctx: MutationCtx, args: Infer<typeof persistIntentTransactionArgs>) {
    const reservation = await ctx.db.get(args.reservationId);
    if (!reservation || reservation.workflowRunId !== args.workflowRunId || reservation.state !== "ACTIVE") {
      throw new Error("Inference reservation is unavailable, unscoped, or inactive.");
    }
    assertInferenceSpendingAllowed(await ctx.db.get(reservation.workOrderId));
    const logicalRequestKey = bounded(args.logicalRequestKey, 500, "Logical request key");
    if (reservation.logicalRequestKey !== logicalRequestKey) throw new Error("Inference reservation logical request scope is substituted.");
    const reservationSnapshot = reservationValue(reservation);
    const logicalIntents = await ctx.db.query("inferencePhysicalIntents")
      .withIndex("by_logical_request", (q) => q.eq("projectId", reservation.projectId).eq("logicalRequestKey", logicalRequestKey)).collect();
    const duplicate = logicalIntents.find((intent) => intent.physicalOrdinal === args.physicalOrdinal);
    if (duplicate) {
      const duplicateSnapshot = intentValue(duplicate, reservation);
      const requested = canonicalDigest("inference-intent-replay/v1", {
        intentKey: bounded(args.intentKey, 200, "Physical intent key"),
        logicalRequestKey,
        physicalOrdinal: args.physicalOrdinal,
        retryOfIntentId: args.retryOfIntentId ? String(args.retryOfIntentId) : undefined,
        route: args.route,
        requestDigest: requireDigest(args.requestDigest, "Inference request digest"),
      });
      const persisted = canonicalDigest("inference-intent-replay/v1", {
        intentKey: duplicateSnapshot.intentId,
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
    const intentSnapshots = intents.map((intent) => intentValue(intent, reservation));
    let priorSnapshot: PhysicalInferenceIntent | undefined;
    if (args.physicalOrdinal === 1 && args.retryOfIntentId !== undefined) throw new Error("PRIMARY_ATTEMPT_CANNOT_HAVE_RETRY_LINEAGE");
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
      priorSnapshot = intentValue(prior, reservation);
      const priorReceiptSnapshot = receiptValue(priorReceipt);
      if (priorReceiptSnapshot.intentId !== priorSnapshot.intentId
        || priorReceiptSnapshot.delivery !== "NOT_DELIVERED"
        || !["FAILED", "TIMED_OUT"].includes(priorReceiptSnapshot.status)) {
        throw new Error("Canonical fallback evidence does not match its prior intent.");
      }
    }
    const intentKey = bounded(args.intentKey, 200, "Physical intent key");
    if (intentSnapshots.some((intent) => intent.intentId === intentKey)) throw new Error("Canonical intent identity is already allocated.");
    const snapshot = physicalInferenceIntent({
      intentId: intentKey, reservationId: reservationSnapshot.reservationId,
      logicalRequestKey,
      physicalOrdinal: args.physicalOrdinal, retryOfIntentId: priorSnapshot?.intentId,
      route: args.route,
      requestDigest: requireDigest(args.requestDigest, "Inference request digest"), createdAt: Date.now(),
    }, reservationSnapshot, intentSnapshots, Date.now());
    const id = await ctx.db.insert("inferencePhysicalIntents", {
      tenantId: reservation.tenantId, projectId: reservation.projectId, workflowRunId: reservation.workflowRunId,
      reservationId: reservation._id, logicalRequestKey: snapshot.logicalRequestKey,
      physicalOrdinal: snapshot.physicalOrdinal, retryOfIntentId: args.retryOfIntentId,
      route: snapshot.route, requestDigest: snapshot.requestDigest,
      intentDigest: snapshot.digest, immutableSnapshot: snapshot, state: "PERSISTED", createdAt: snapshot.createdAt,
    });
    return { intentId: id, state: "PERSISTED" as const, created: true as const };
}

export const persistIntentInternal = internalMutation({
  args: persistIntentTransactionArgs.fields,
  handler: persistIntentInTransaction,
});

const claimIntentTransactionArgs = v.object({
    workflowRunId: v.id("workflowRuns"), intentId: v.id("inferencePhysicalIntents"),
    leaseId: v.string(), claimId: v.string(), cancelRequested: v.optional(v.boolean()),
    dispatch: v.optional(v.object({ contract: v.literal("classify-text/v1"), payloadBytes: v.number(), maximumOutputTokens: v.number(), temperature: v.optional(v.number()) })),
  });

async function classifyDispatchAllowance(
  ctx: MutationCtx, args: Infer<typeof claimIntentTransactionArgs>,
  intent: Doc<"inferencePhysicalIntents">, reservation: Doc<"inferenceReservations">,
  run: Doc<"workflowRuns">, claimId: string, now: number,
): Promise<ClassifyInferenceDispatchAllowance> {
  if (!gatewayAdmissionEnabled()) throw new Error("GOVERNED_INFERENCE_GATEWAY_DISABLED");
  const dispatch = args.dispatch!;
  const frozen = reservationValue(reservation);
  const frozenIntent = intentValue(intent, reservation);
  assertClassifyInferenceRoute(frozenIntent.route);
  if (dispatch.contract !== "classify-text/v1" || !Number.isSafeInteger(dispatch.payloadBytes)
    || dispatch.payloadBytes <= 0 || dispatch.payloadBytes > 256_000
    || !Number.isSafeInteger(dispatch.maximumOutputTokens) || dispatch.maximumOutputTokens <= 0 || dispatch.maximumOutputTokens > 1024
    || frozen.maxPhysicalCalls !== 1 || frozen.allowedFallbacks.length !== 0 || frozenIntent.physicalOrdinal !== 1
    || frozen.maxInputTokens < 128_000 || frozen.maxCacheReadTokens < 128_000
    || frozen.maxOutputTokens < dispatch.maximumOutputTokens || frozen.maxCacheWriteTokens !== 0 || frozen.maxReasoningTokens !== 0) {
    throw new Error("CLASSIFY_DISPATCH_LIABILITY_UNBOUNDED");
  }
  const [wo, task, admission, host, version, price, allocations] = await Promise.all([
    ctx.db.get(reservation.workOrderId), ctx.db.get(reservation.taskId),
    loadExecutionProfileAdmission(ctx, reservation.executionProfileId, now),
    run.hostBindingId ? ctx.db.get(run.hostBindingId) : null,
    run.factoryDefinitionVersionId ? ctx.db.get(run.factoryDefinitionVersionId) : null,
    ctx.db.get(reservation.priceBookId),
    ctx.db.query("inferenceReservations").withIndex("by_work_order", q => q.eq("workOrderId", reservation.workOrderId)).collect(),
  ]);
  if (!wo || wo.projectId !== reservation.projectId || wo.approvalStatus !== "APPROVED"
    || wo.currentExecutionRunId !== run._id || wo.currentRevisionNumber !== run.workOrderRevisionNumber
    || run.workOrderId !== wo._id || run.parentTaskId !== reservation.taskId || task?.projectId !== reservation.projectId
    || run.projectId !== reservation.projectId || !wo.repositoryId || run.repositoryId !== wo.repositoryId
    || !admission.eligible || !admission.profile || admission.profile.projectId !== reservation.projectId
    || run.executionProfileId !== reservation.executionProfileId
    || frozen.executionProfileId !== String(reservation.executionProfileId)
    || admission.profile.profileDigest !== frozen.executionProfileDigest || run.executionProfileDigest !== frozen.executionProfileDigest
    || run.executionManifestDigest !== frozen.policyDigest
    || !admission.modelRoute || admission.modelRoute.routeDigest !== frozenIntent.route.routeDigest
    || admission.modelRoute.provider !== frozenIntent.route.provider || admission.modelRoute.providerRoute !== frozenIntent.route.providerRoute
    || admission.modelRoute.modelId !== frozenIntent.route.modelId) throw new Error("CLASSIFY_DISPATCH_AUTHORITY_CHANGED");
  if (!run.lease?.workerId || !run.lease.workerSessionId || !Number.isSafeInteger(run.lease.workerGeneration)
    || !host || host.projectId !== reservation.projectId || !factoryLeaseMatchesCurrentRegistration(run.lease, host)) {
    throw new Error("CLASSIFY_DISPATCH_WORKER_FENCED");
  }
  if (!version || version.projectId !== reservation.projectId || version.repositoryId !== wo.repositoryId
    || !run.factoryConfigurationDigest || version.configurationDigest !== run.factoryConfigurationDigest
    || version.executionProfileId !== reservation.executionProfileId || version.executionProfileDigest !== frozen.executionProfileDigest) {
    throw new Error("CLASSIFY_DISPATCH_FACTORY_CHANGED");
  }
  await resolveCurrentAttemptExecutionProfile(ctx, version, run, run.executionManifest, now);
  const workloadClass = version.purpose === "VERIFICATION" ? "VERIFICATION"
    : version.purpose === "INTELLIGENT_AUTOMATION" ? "AUTOMATION" : "SOFTWARE_CHANGE";
  if (!modelRouteQualifiedFor(admission.modelRoute, { workloadClass, riskClass: version.riskBoundary, repositoryId: String(wo.repositoryId) })) {
    throw new Error("CLASSIFY_DISPATCH_QUALIFICATION_SCOPE_MISMATCH");
  }
  const parameters = recordValue(recordValue(admission.modelRoute.routeSnapshot).reasoningConfig);
  if (Object.keys(parameters).some(key => !["maxTokens", "temperature"].includes(key))
    || parameters.maxTokens !== dispatch.maximumOutputTokens || parameters.temperature !== dispatch.temperature) {
    throw new Error("CLASSIFY_DISPATCH_ROUTE_PARAMETERS_CHANGED");
  }
  const policy = recordValue(recordValue(wo.metadata).implementationPolicy);
  const workOrderMaximum = typeof policy.maxCostUsd === "number" ? Math.floor(policy.maxCostUsd * 1_000_000) : NaN;
  const factoryMaximum = Math.floor(version.budget.maxCostUsd * 1_000_000);
  if (!Number.isSafeInteger(workOrderMaximum) || workOrderMaximum <= 0
    || !Number.isSafeInteger(factoryMaximum) || factoryMaximum <= 0) throw new Error("CLASSIFY_DISPATCH_BUDGET_INVALID");
  // Include every retained reservation, including cancelled, expired or unknown
  // outcomes. Claiming never returns capacity to the WorkOrder.
  for (const allocation of allocations) reservationValue(allocation);
  const others = allocations.filter(allocation => allocation._id !== reservation._id);
  assertCumulativeInferenceBudget(others, reservation.projectId, frozen.maxCostMicrousd, Math.min(workOrderMaximum, factoryMaximum));
  if (!price || price.projectId !== reservation.projectId || price.state !== "ACTIVE"
    || price.priceBookDigest !== frozen.priceBookDigest) throw new Error("CLASSIFY_DISPATCH_PRICE_CHANGED");
  const priceSnapshot = canonicalSnapshot<InferencePriceBook>(price.immutableSnapshot,
    "inference-price-book/v1", "digest", frozen.priceBookDigest);
  // This selected dispatch requires a finite, explicit price interval and tier.
  // Historical indefinite books remain inspectable but cannot issue this proof.
  if (!Number.isSafeInteger(priceSnapshot.effectiveUntil) || priceSnapshot.effectiveUntil! <= now
    || priceSnapshot.effectiveFrom > now || price.effectiveFrom !== priceSnapshot.effectiveFrom
    || price.effectiveUntil !== priceSnapshot.effectiveUntil
    || priceSnapshot.rates.find(rate => rate.routeDigest === frozenIntent.route.routeDigest)?.serviceTier !== "default") {
    throw new Error("CLASSIFY_DISPATCH_PRICE_NOT_CURRENT");
  }
  const { schema: _priceSchema, digest: _priceDigest, ...priceInput } = priceSnapshot;
  inferencePriceBook(priceInput);
  const { schema: _schema, digest: _digest, ...reservationInput } = frozen;
  // Re-evaluate frozen worst-case money against its exact immutable rates.
  inferenceReservation(reservationInput, priceSnapshot);
  const bytes: Omit<ClassifyInferenceDispatchAllowance, "digest"> = {
    schema: "classify-inference-dispatch/v1", projectId: frozen.projectId, repositoryId: String(wo.repositoryId),
    workOrderId: frozen.workOrderId, taskId: frozen.taskId, attemptId: frozen.attemptId,
    reservationId: String(reservation._id), reservationLogicalId: frozen.reservationId, reservationDigest: frozen.digest,
    intentId: String(intent._id), intentLogicalId: frozenIntent.intentId, intentDigest: frozenIntent.digest,
    logicalRequestKey: frozen.logicalRequestKey, leaseId: args.leaseId, claimId,
    executionProfileId: frozen.executionProfileId, executionProfileDigest: frozen.executionProfileDigest,
    priceBookDigest: frozen.priceBookDigest, route: frozenIntent.route, requestDigest: frozenIntent.requestDigest,
    payloadBytes: dispatch.payloadBytes, maximumInputTokens: 128_000, maximumCacheReadTokens: 128_000,
    maximumOutputTokens: dispatch.maximumOutputTokens, maxCostMicrousd: frozen.maxCostMicrousd, maximumPhysicalCalls: 1,
    temperature: dispatch.temperature ?? null,
    issuedAt: now, validUntil: Math.min(now + 30_000, frozen.deadlineAt, frozen.leaseExpiresAt,
      run.lease.expiresAt, priceSnapshot.effectiveUntil!, admission.validUntil ?? now),
  };
  const allowance = { ...bytes, digest: canonicalDigest("classify-inference-dispatch/v1", bytes) };
  assertClassifyInferenceDispatchAllowance(allowance);
  return allowance;
}

export async function claimIntentInTransaction(ctx: MutationCtx, args: Infer<typeof claimIntentTransactionArgs>) {
    const intent = await ctx.db.get(args.intentId);
    if (!intent || intent.workflowRunId !== args.workflowRunId) throw new Error("Physical inference intent is unavailable or unscoped.");
    const [reservation, run] = await Promise.all([ctx.db.get(intent.reservationId), ctx.db.get(intent.workflowRunId)]);
    if (intent.state !== "PERSISTED") return { claimed: false as const, reason: "PHYSICAL_INTENT_ALREADY_DECIDED", state: intent.state };
    if (!reservation || !run || reservation.workflowRunId !== args.workflowRunId || run._id !== args.workflowRunId) {
      throw new Error("Inference claim Attempt scope is unavailable or substituted.");
    }
    assertInferenceSpendingAllowed(await ctx.db.get(reservation.workOrderId));
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
    // A legacy row with lost identity cannot acquire new authority. Both the
    // current lease above and the frozen lease must admit the committed claim.
    const now = Date.now();
    const dispatchAllowance = args.dispatch
      ? await classifyDispatchAllowance(ctx, args, intent, reservation, run, claimId, now) : undefined;
    const claimed = claimPhysicalInferenceIntent(intentValue(intent, reservation), reservationValue(reservation), {
      claimId, leaseId: args.leaseId, now, cancelled: false,
    });
    await ctx.db.patch(intent._id, { state: "CLAIMED", claimId, claimedAt: claimed.claimedAt,
      ...(dispatchAllowance ? { dispatchAllowance } : {}) });
    return { claimed: true as const, intentId: intent._id, reservationDigest: reservation.reservationDigest,
      ...(dispatchAllowance ? { dispatchAllowance } : {}) };
}

export const claimIntentInternal = internalMutation({
  args: claimIntentTransactionArgs.fields,
  handler: claimIntentInTransaction,
});

const appendReceiptTransactionArgs = v.object({
    workflowRunId: v.id("workflowRuns"),
    intentId: v.id("inferencePhysicalIntents"), resolvedProvider: v.optional(v.string()),
    resolvedModelId: v.optional(v.string()), providerRequestId: v.optional(v.string()),
    providerBillingId: v.optional(v.string()),
    delivery: v.union(v.literal("DELIVERED"), v.literal("NOT_DELIVERED"), v.literal("UNKNOWN")),
    status: v.union(v.literal("SUCCEEDED"), v.literal("FAILED"), v.literal("CANCELLED"), v.literal("TIMED_OUT"), v.literal("UNKNOWN")),
    usage: usageValidator, responseDigest: v.optional(v.string()), failureCode: v.optional(v.string()),
    startedAt: v.number(), completedAt: v.number(), batch: v.optional(v.boolean()), serviceTier: v.optional(v.string()),
  });

async function assertCanonicalProviderRequestOwnership(ctx: MutationCtx, projectId: Id<"projects">, provider: string, providerRequestId: string, ownerReceiptId?: Id<"inferencePhysicalReceipts">) {
  const [receipts, corrections] = await Promise.all([
    ctx.db.query("inferencePhysicalReceipts").withIndex("by_provider_request", q => q.eq("projectId", projectId).eq("providerRequestId", providerRequestId)).collect(),
    ctx.db.query("inferenceReconciliations").withIndex("by_provider_request", q => q.eq("projectId", projectId).eq("providerRequestId", providerRequestId)).collect(),
  ]);
  if (receipts.some(receipt => receipt._id !== ownerReceiptId && (receipt.resolvedProvider ?? receipt.route.provider) === provider)) throw new Error("Canonical provider request belongs to another receipt.");
  for (const correction of corrections) {
    if (correction.receiptId === ownerReceiptId) continue;
    const owner = await ctx.db.get(correction.receiptId);
    if (!owner || (owner.resolvedProvider ?? owner.route.provider) === provider) throw new Error("Canonical provider request belongs to another reconciliation.");
  }
}

export async function appendReceiptInTransaction(ctx: MutationCtx, args: Infer<typeof appendReceiptTransactionArgs>) {
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
      const existingSnapshot = receiptValue(existing);
      const replayDigest = canonicalDigest("inference-receipt-replay/v1", {
        batch: args.batch, serviceTier: args.serviceTier,
        resolvedProvider, resolvedModelId, providerRequestId, providerBillingId,
        delivery: args.delivery,
        status: args.status,
        usage: args.usage,
        responseDigest, failureCode,
        startedAt: args.startedAt,
        completedAt: args.completedAt,
      });
      const existingDigest = canonicalDigest("inference-receipt-replay/v1", {
        batch: existingSnapshot.batch, serviceTier: existingSnapshot.serviceTier,
        resolvedProvider: existingSnapshot.resolvedProvider,
        resolvedModelId: existingSnapshot.resolvedModelId,
        providerRequestId: existingSnapshot.providerRequestId,
        providerBillingId: existingSnapshot.providerBillingId,
        delivery: existingSnapshot.delivery,
        status: existingSnapshot.status,
        usage: existingSnapshot.usage,
        responseDigest: existingSnapshot.responseDigest,
        failureCode: existingSnapshot.failureCode,
        startedAt: existingSnapshot.startedAt,
        completedAt: existingSnapshot.completedAt,
      });
      if (replayDigest !== existingDigest) throw new Error("Inference receipt replay conflicts with immutable history.");
      return { receiptId: existing._id, receiptDigest: existing.receiptDigest, created: false as const };
    }
    const reservation = await ctx.db.get(intent.reservationId);
    if (!reservation) throw new Error("Inference receipt reservation is unavailable.");
    const priceBook = await ctx.db.get(reservation.priceBookId);
    if (!priceBook) throw new Error("Inference receipt price book is unavailable.");
    if (intent.state !== "CLAIMED" || !intent.claimId || intent.claimedAt === undefined) {
      throw new Error("Receipt requires the exact committed physical claim.");
    }
    const reservationSnapshot = reservationValue(reservation);
    const priceSnapshot = canonicalSnapshot<InferencePriceBook>(priceBook.immutableSnapshot,
      "inference-price-book/v1", "digest", reservationSnapshot.priceBookDigest);
    if (priceBook.projectId !== reservation.projectId || priceBook.priceBookDigest !== reservationSnapshot.priceBookDigest) {
      throw new Error("Inference receipt frozen price identity changed.");
    }
    // Reconstruct the committed transition without changing the original snapshot.
    // Its historical claim time admits late observations after the lease expires.
    const claimedIntent = claimPhysicalInferenceIntent(intentValue(intent, reservation), reservationSnapshot, {
      claimId: intent.claimId, leaseId: reservationSnapshot.leaseId, now: intent.claimedAt, cancelled: false,
    });
    const receiptKey = canonicalDigest("inference-receipt-id/v1", { intentId: String(intent._id), completedAt: args.completedAt });
    const priorReceipts = await effectiveReservationObservations(ctx, reservation);
    const snapshot = physicalInferenceReceipt({
      receiptId: receiptKey, intent: claimedIntent, reservation: reservationSnapshot, priceBook: priceSnapshot,
      priorReceipts,
      resolvedProvider, resolvedModelId, providerRequestId, providerBillingId,
      delivery: args.delivery, status: args.status, usage: args.usage,
      responseDigest, failureCode,
      startedAt: args.startedAt, completedAt: args.completedAt, batch: args.batch, serviceTier: args.serviceTier,
    });
    if (providerRequestId) {
      await assertCanonicalProviderRequestOwnership(ctx, reservation.projectId, resolvedProvider ?? intent.route.provider, providerRequestId);
      const duplicateProviderRequest = await ctx.db.query("inferencePhysicalReceipts")
        .withIndex("by_provider_request", (q) => q.eq("projectId", reservation.projectId).eq("providerRequestId", providerRequestId)).first();
      if (duplicateProviderRequest) throw new Error("Provider response/request ID replay detected.");
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
      costClassification: snapshot.costClassification, violationCodes: snapshot.violationCodes,
      priceBookId: priceBook._id, priceBookDigest: priceBook.priceBookDigest,
      responseDigest, failureCode, startedAt: args.startedAt,
      completedAt: args.completedAt, receiptDigest: snapshot.receiptDigest, immutableSnapshot: snapshot,
    });
    if (snapshot.violationCodes?.length) await fenceWorkOrderInferenceSpending(ctx, reservation.workOrderId,
      snapshot.receiptDigest, snapshot.violationCodes, id);
    await ctx.db.patch(intent._id, { state: args.delivery === "UNKNOWN" ? "AMBIGUOUS" : "RECEIPTED" });
    if (intent.physicalOrdinal >= reservation.maxPhysicalCalls) await ctx.db.patch(reservation._id, { state: "EXHAUSTED" });
    return { receiptId: id, receiptDigest: snapshot.receiptDigest, created: true as const };
}

export const appendReceiptInternal = internalMutation({
  args: appendReceiptTransactionArgs.fields,
  handler: appendReceiptInTransaction,
});

const appendReconciliationTransactionArgs = v.object({
    workflowRunId: v.id("workflowRuns"),
    receiptId: v.id("inferencePhysicalReceipts"), providerEventId: v.string(), providerRequestId: v.string(),
    providerBillingId: v.optional(v.string()), observedUsage: v.optional(usageValidator),
    observedCostMicrousd: v.optional(v.number()), completeness: completenessValidator, sourceDigest: v.string(),
    reconciledBy: v.string(),
  });

export async function appendReconciliationInTransaction(ctx: MutationCtx, args: Infer<typeof appendReconciliationTransactionArgs>, options?: { allowPreviouslyUnknownRequest: boolean }) {
    const providerEventId = bounded(args.providerEventId, 300, "Provider event ID");
    const providerRequestId = bounded(args.providerRequestId, 300, "Provider request ID");
    const providerBillingId = optionalBounded(args.providerBillingId, 300, "Provider billing ID");
    const reconciledBy = bounded(args.reconciledBy, 200, "Reconciliation service identity");
    const receipt = await ctx.db.get(args.receiptId);
    if (!receipt || receipt.workflowRunId !== args.workflowRunId
      || (receipt.providerRequestId ? receipt.providerRequestId !== providerRequestId
        : !(options?.allowPreviouslyUnknownRequest && receipt.delivery === "UNKNOWN"))) {
      throw new Error("Reconciliation provider request identity does not match a receipt.");
    }
    await assertCanonicalProviderRequestOwnership(ctx, receipt.projectId, receipt.resolvedProvider ?? receipt.route.provider, providerRequestId, receipt._id);
    if (args.observedCostMicrousd !== undefined && (!Number.isSafeInteger(args.observedCostMicrousd) || args.observedCostMicrousd < 0)) {
      throw new Error("Reconciliation cost is invalid.");
    }
    if (args.observedUsage !== undefined) usageCompleteness(args.observedUsage);
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
    const reservationRow = await ctx.db.get(receipt.reservationId);
    if (!reservationRow) throw new Error("Reconciliation reservation is unavailable.");
    const reservation = reservationValue(reservationRow);
    const effective = await effectiveReservationObservations(ctx, reservationRow, args);
    const violationCodes: string[] = [];
    for (const [key, maximum, code] of [
      ["inputTokens", reservation.maxInputTokens, "INPUT"], ["outputTokens", reservation.maxOutputTokens, "OUTPUT"],
      ["cacheReadTokens", reservation.maxCacheReadTokens, "CACHE_READ"], ["cacheWriteTokens", reservation.maxCacheWriteTokens, "CACHE_WRITE"],
      ["reasoningTokens", reservation.maxReasoningTokens, "REASONING"],
    ] as const) {
      if (effective.reduce((sum, entry) => sum + BigInt(entry.usage[key] ?? 0), 0n) > BigInt(maximum)) {
        violationCodes.push(`RESERVATION_${code}_TOKEN_LIMIT_EXCEEDED`);
      }
    }
    if (effective.reduce((sum, entry) => sum + BigInt(entry.costMicrousd ?? 0), 0n) > BigInt(reservation.maxCostMicrousd)) {
      violationCodes.push("RESERVATION_COST_LIMIT_EXCEEDED");
    }
    const id = await ctx.db.insert("inferenceReconciliations", {
      tenantId: receipt.tenantId, projectId: receipt.projectId, workflowRunId: receipt.workflowRunId,
      receiptId: receipt._id,
      providerEventId, providerRequestId, providerBillingId,
      observedUsage: args.observedUsage, observedCostMicrousd: args.observedCostMicrousd,
      completeness: args.completeness, sourceDigest: args.sourceDigest, reconciliationDigest,
      reconciledBy, reconciledAt: Date.now(),
    });
    if (violationCodes.length) await fenceWorkOrderInferenceSpending(ctx, reservationRow.workOrderId,
      reconciliationDigest, violationCodes, receipt._id);
    return { reconciliationId: id, created: true as const };
}

export const appendReconciliationInternal = internalMutation({
  args: appendReconciliationTransactionArgs.fields,
  handler: appendReconciliationInTransaction,
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
    const receiptSnapshots = new Map(receipts.map((receipt) => [receipt._id, receiptValue(receipt)]));
    const receiptRows = new Map(receipts.map(receipt => [receipt._id, receipt]));
    const projection = projectFactoryOutcome({
      projectionId: `${run._id}:v${prior.length + 1}`, cohortDigest: requireDigest(args.cohortDigest, "Outcome cohort digest"),
      projectId: String(run.projectId), workOrderId: String(run.workOrderId), attemptId: String(run._id),
      routeDigest: requireDigest(args.routeDigest, "Outcome route digest"),
      events: events.map((event) => {
        const snapshot = factoryOutcomeEvent({
          eventId: `${event.sourceType}:${event.sourceId}`, projectId: String(event.projectId),
          workOrderId: String(event.workOrderId), attemptId: String(event.workflowRunId), stage: event.stage,
          sourceType: event.sourceType, sourceId: event.sourceId, sourceDigest: event.sourceDigest,
          occurredAt: event.occurredAt, recordedAt: event.recordedAt,
        });
        if (snapshot.digest !== event.eventDigest) throw new Error("Canonical outcome event digest is inconsistent.");
        return snapshot;
      }),
      receipts: [...receiptSnapshots.values()],
      reconciliations: reconciliations.map((reconciliation) => {
        const receipt = receiptSnapshots.get(reconciliation.receiptId);
        const receiptRow = receiptRows.get(reconciliation.receiptId);
        if (!receipt || !receiptRow) throw new Error("Outcome reconciliation references an unavailable receipt.");
        reconciliationValue(reconciliation, receiptRow);
        return {
          reconciliationId: String(reconciliation._id), receiptId: receipt.receiptId,
          observedCostMicrousd: reconciliation.observedCostMicrousd,
          completeness: reconciliation.completeness, reconciledAt: reconciliation.reconciledAt,
          // This is source evidence provenance, not a digest of the derived view.
          digest: reconciliation.reconciliationDigest,
        };
      }),
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
      lineageDigest: projection.lineageDigest, projectionDigest: projection.digest, immutableSnapshot: projection,
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
    const workOrder = run.workOrderId ? await ctx.db.get(run.workOrderId) : null;
    if (run.workOrderId && (!workOrder || workOrder.projectId !== run.projectId)) {
      throw new Error("Attempt economics WorkOrder scope is unavailable or substituted.");
    }
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
      inferenceSpendingFence: workOrder?.inferenceSpendingFence ?? null,
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
    const inCohort = (row: Doc<"factoryOutcomeProjections">) => row.cohortDigest === summaryInput.cohortDigest
      && row.formulaVersion === OUTCOME_FORMULA_VERSION;
    let left = summarizeRouteEconomics(leftProjections.filter(inCohort).map(projectionValue), { ...summaryInput, routeDigest: requireDigest(args.leftRouteDigest, "Left route digest") });
    let right = summarizeRouteEconomics(rightProjections.filter(inCohort).map(projectionValue), { ...summaryInput, routeDigest: requireDigest(args.rightRouteDigest, "Right route digest") });
    const routeQualified = (routeDigest: string) => catalog.some((route) => route.routeDigest === routeDigest
      && route.enabled === true && route.qualificationStatus === "EVIDENCE_QUALIFIED"
      && route.admissionStatus === "PRODUCTION_PILOT_ELIGIBLE");
    if (!routeQualified(left.routeDigest)) left = disqualifySummary(left, "ROUTE_NOT_INDEPENDENTLY_QUALIFIED");
    if (!routeQualified(right.routeDigest)) right = disqualifySummary(right, "ROUTE_NOT_INDEPENDENTLY_QUALIFIED");
    const comparison = compareRouteEconomics(left, right);
    const snapshot = {
      schema: "inference-route-comparison/v1", projectId: String(args.projectId),
      leftRouteDigest: args.leftRouteDigest, rightRouteDigest: args.rightRouteDigest,
      cohortDigest: args.cohortDigest, formulaVersion: OUTCOME_FORMULA_VERSION,
      minimumSampleSize: args.minimumSampleSize, maximumAgeMs: args.maximumAgeMs,
      leftSummary: left, rightSummary: right, status: comparison.status,
      advisoryWinnerRouteDigest: comparison.status === "ADVISORY_ONLY" ? comparison.winner : undefined,
      blockers: comparison.blockers, automaticPromotionAuthorized: false as const, createdAt: now,
    };
    const comparisonDigest = canonicalDigest("inference-route-comparison/v1", snapshot);
    const id = await ctx.db.insert("inferenceRouteComparisons", {
      tenantId: access.project.tenantId, projectId: args.projectId,
      leftRouteDigest: args.leftRouteDigest, rightRouteDigest: args.rightRouteDigest,
      cohortDigest: args.cohortDigest, formulaVersion: OUTCOME_FORMULA_VERSION,
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
  const snapshot = canonicalSnapshot<FactoryOutcomeProjection>(projection.immutableSnapshot,
    "factory-outcome-projection/v2", "digest", projection.projectionDigest);
  if (snapshot.projectId !== String(projection.projectId) || snapshot.workOrderId !== String(projection.workOrderId)
    || snapshot.attemptId !== String(projection.workflowRunId) || snapshot.routeDigest !== projection.routeDigest
    || snapshot.cohortDigest !== projection.cohortDigest) {
    throw new Error("Canonical projection identity does not match its persisted scope.");
  }
  return snapshot;
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
