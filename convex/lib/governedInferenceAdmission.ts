import {
  canonicalDigest,
  inferencePriceBook,
  inferenceReservation,
  calculateInferenceCost,
  type ExactInferenceRoute,
} from "@mission-control/shared";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  assertCumulativeInferenceBudget,
  persistIntentInTransaction,
  claimIntentInTransaction,
  appendReceiptInTransaction,
  appendReconciliationInTransaction,
} from "../inferenceGateway";
import type { ProviderPrice, ProviderUsage } from "./providerLiability";

type Aggregate = Doc<"factoryProviderReservations">;
const logicalKey = (
  aggregate: Aggregate,
  attemptId: string,
  requestId: string,
) =>
  canonicalDigest("bedrock-logical-request/v1", {
    reservationId: String(aggregate._id),
    attemptId,
    requestId,
  });
const safe = (value: bigint) => {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("BEDROCK_ACCOUNTING_MONEY_OVERFLOW");
  return Number(value);
};
export const nanoPerTokenToMicroPerMillion = (value: number) =>
  safe(BigInt(value) * 1000n);
export const nanoToMicroCeiling = (value: number) =>
  safe((BigInt(value) + 999n) / 1000n);

/** Called only inside the signed hard-liability reserve transaction. No second send authority. */
export async function admitBedrockAccounting(
  ctx: MutationCtx,
  aggregate: Aggregate,
  run: Doc<"workflowRuns">,
  price: ProviderPrice,
  request: { requestId: string; requestDigest: string; inputTokens: number; outputTokens: number },
) {
  if (process.env.MC_GOVERNED_INFERENCE_GATEWAY_ENABLED !== "1")
    throw new Error("GOVERNED_INFERENCE_GATEWAY_DISABLED");
  const now = Date.now();
  const [workOrder, task, profile, books] = await Promise.all([
    ctx.db.get(aggregate.workOrderId),
    run.parentTaskId ? ctx.db.get(run.parentTaskId) : null,
    ctx.db.get(aggregate.executionProfileId),
    ctx.db
      .query("inferencePriceBooks")
      .withIndex("by_project", (q) => q.eq("projectId", aggregate.projectId))
      .collect(),
  ]);
  if (
    !workOrder ||
    workOrder.projectId !== aggregate.projectId ||
    workOrder.approvalStatus !== "APPROVED" ||
    !task ||
    task.projectId !== aggregate.projectId ||
    !run.executionManifestDigest ||
    !run.lease ||
    !profile ||
    profile.projectId !== aggregate.projectId ||
    profile.profileDigest !== run.executionProfileDigest
  ) {
    throw new Error("BEDROCK_ACCOUNTING_ATTEMPT_AUTHORITY_MISSING");
  }
  const routeRow = await ctx.db.get(profile.modelCatalogId);
  if (
    !routeRow ||
    routeRow.enabled !== true ||
    routeRow.qualificationStatus !== "EVIDENCE_QUALIFIED" ||
    routeRow.admissionStatus !== "PRODUCTION_PILOT_ELIGIBLE" ||
    routeRow.routeDigest !== aggregate.snapshot.scope.modelRouteDigest ||
    routeRow.provider !== price.provider ||
    routeRow.modelId !== price.model
  )
    throw new Error("BEDROCK_ACCOUNTING_ROUTE_MISMATCH");
  const harness = (
    profile.immutableSnapshot as {
      harness?: { adapter?: string; version?: string };
    }
  ).harness;
  if (!routeRow.providerRoute || !(
    (harness?.adapter === "codex" && harness.version === "bedrock-v1") ||
    (harness?.adapter === "fab" && harness.version === "v1")
  ))
    throw new Error("BEDROCK_ACCOUNTING_ROUTE_DESCRIPTOR_MISSING");
  const route: ExactInferenceRoute = {
    provider: routeRow.provider,
    providerRoute: routeRow.providerRoute,
    modelId: routeRow.modelId,
    routeDigest: routeRow.routeDigest,
    adapter: harness.adapter,
    adapterVersion: harness.version,
    endpoint: "https://bedrock-runtime.us-east-1.amazonaws.com",
  };
  const active = books.filter(
    (book) =>
      book.state === "ACTIVE" &&
      book.effectiveFrom <= now &&
      (book.effectiveUntil === undefined || book.effectiveUntil > now),
  );
  if (active.length !== 1)
    throw new Error("BEDROCK_ACCOUNTING_ACTIVE_PRICE_BOOK_REQUIRED");
  const book = active[0];
  const canonicalBook = inferencePriceBook({
    priceBookId: book.immutableSnapshot.priceBookId,
    version: book.version,
    currency: book.currency,
    source: {
      kind: book.sourceKind,
      reference: book.sourceReference,
      digest: book.sourceDigest,
    },
    effectiveFrom: book.effectiveFrom,
    effectiveUntil: book.effectiveUntil,
    rates: book.rates,
  });
  const rate = canonicalBook.rates.find(
    (value) => value.routeDigest === route.routeDigest,
  );
  if (
    canonicalBook.digest !== book.priceBookDigest ||
    canonicalDigest(
      "bedrock-price-book-snapshot/v1",
      book.immutableSnapshot,
    ) !== canonicalDigest("bedrock-price-book-snapshot/v1", canonicalBook) ||
    book.sourceDigest !== price.evidenceDigest ||
    book.sourceReference !== price.source ||
    !rate ||
    rate.inputMicrousdPerMillionTokens !==
      nanoPerTokenToMicroPerMillion(price.inputNanoUsdPerToken) ||
    rate.outputMicrousdPerMillionTokens !==
      nanoPerTokenToMicroPerMillion(price.outputNanoUsdPerToken) ||
    rate.serviceTier !== undefined
  )
    throw new Error("BEDROCK_ACCOUNTING_PRICE_MISMATCH");
  const workOrderReservations = await ctx.db
    .query("inferenceReservations")
    .withIndex("by_work_order", (q) =>
      q.eq("workOrderId", aggregate.workOrderId),
    )
    .collect();
  const priorKeys = new Set(
    aggregate.snapshot.holds.map((hold) =>
      logicalKey(aggregate, hold.attemptId, hold.requestId),
    ),
  );
  if (
    workOrderReservations.some((item) => !priorKeys.has(item.logicalRequestKey))
  )
    throw new Error("BEDROCK_ACCOUNTING_INDEPENDENT_BUDGET_EXISTS");
  const key = logicalKey(aggregate, String(run._id), request.requestId);
  const prior = await ctx.db
    .query("inferenceReservations")
    .withIndex("by_logical_request", (q) =>
      q.eq("projectId", aggregate.projectId).eq("logicalRequestKey", key),
    )
    .first();
  if (prior) throw new Error("BEDROCK_ACCOUNTING_REQUEST_REPLAY");
  // The main ledger rounds each dimension upward. The aggregate retains exact nano-USD enforcement.
  const money = safe(
    (BigInt(request.inputTokens) * BigInt(price.inputNanoUsdPerToken) +
      999n) /
      1000n +
      (BigInt(request.outputTokens) * BigInt(price.outputNanoUsdPerToken) +
        999n) /
        1000n,
  );
  const metadata = workOrder.metadata as
    | { implementationPolicy?: { maxCostUsd?: number } }
    | undefined;
  const approved = Math.floor(
    (metadata?.implementationPolicy?.maxCostUsd ?? 0) * 1_000_000,
  );
  const approvedNano = Math.floor(
    (metadata?.implementationPolicy?.maxCostUsd ?? 0) * 1_000_000_000,
  );
  if (
    !Number.isSafeInteger(approvedNano) ||
    approvedNano <= 0 ||
    BigInt(aggregate.snapshot.maximumNanoUsd) > BigInt(approvedNano) ||
    !Number.isSafeInteger(approved) ||
    approved <= 0 ||
    money > approved
  )
    throw new Error("BEDROCK_ACCOUNTING_WORKORDER_BUDGET_MISSING");
  assertCumulativeInferenceBudget(
    workOrderReservations,
    aggregate.projectId,
    money,
    approved,
  );
  const deadlineAt = Math.min(
    aggregate.snapshot.expiresAt,
    price.expiresAt,
    book.effectiveUntil ?? Number.MAX_SAFE_INTEGER,
    profile.qualificationExpiresAt ?? 0,
    run.lease.expiresAt,
  );
  const values = {
    projectId: String(aggregate.projectId),
    workOrderId: String(workOrder._id),
    taskId: String(task._id),
    attemptId: String(run._id),
    logicalRequestKey: key,
    executionProfileId: String(profile._id),
    executionProfileDigest: profile.profileDigest,
    primaryRoute: route,
    allowedFallbacks: [],
    maxPhysicalCalls: 1,
    maxInputTokens: request.inputTokens,
    maxOutputTokens: request.outputTokens,
    maxCacheReadTokens: 0,
    maxCacheWriteTokens: 0,
    maxReasoningTokens: 0,
    maxCostMicrousd: money,
    currency: "USD" as const,
    deadlineAt,
    priceBookId: canonicalBook.priceBookId,
    priceBookDigest: canonicalBook.digest,
    policyDigest: run.executionManifestDigest,
    leaseId: run.lease.leaseId,
    leaseExpiresAt: deadlineAt,
    createdAt: now,
  };
  const initial = inferenceReservation(
    { ...values, reservationId: key },
    canonicalBook,
  );
  const { attemptId: _attemptId, ...recordValues } = values;
  const id = await ctx.db.insert("inferenceReservations", {
    ...recordValues,
    tenantId: workOrder.tenantId,
    projectId: aggregate.projectId,
    workOrderId: workOrder._id,
    taskId: task._id,
    workflowRunId: run._id,
    executionProfileId: profile._id,
    priceBookId: book._id,
    immutableSnapshot: initial,
    reservationDigest: initial.digest,
    state: "ACTIVE",
    registrationIdempotencyKey: key,
    createdBy: `attempt:${run._id}`,
  });
  // Convex IDs are allocated by insert. Freeze that same ID before any intent is persisted.
  const immutable = inferenceReservation(
    { ...values, reservationId: String(id) },
    canonicalBook,
  );
  await ctx.db.patch(id, {
    immutableSnapshot: immutable,
    reservationDigest: immutable.digest,
  });
  const persisted = await persistIntentInTransaction(ctx, {
    workflowRunId: run._id,
    reservationId: id,
    logicalRequestKey: key,
    physicalOrdinal: 1,
    route,
    requestDigest: request.requestDigest,
    intentKey: key,
  });
  if (!persisted.created) throw new Error("BEDROCK_ACCOUNTING_INTENT_REPLAY");
  const claim = await claimIntentInTransaction(ctx, {
    workflowRunId: run._id,
    intentId: persisted.intentId,
    leaseId: run.lease.leaseId,
    claimId: key,
  });
  if (!claim.claimed) throw new Error("BEDROCK_ACCOUNTING_CLAIM_DENIED");
  return { validUntil: deadlineAt };
}

/** Settlement and append-only correction run in the same transaction as the aggregate update. */
export async function settleBedrockAccounting(
  ctx: MutationCtx,
  aggregate: Aggregate,
  usage: ProviderUsage,
  actor: string,
  correction: boolean,
  evidenceReference?: string,
  overrun = false,
) {
  const hold = aggregate.snapshot.holds.find(
    (h) => h.requestId === usage.requestId,
  );
  if (!hold) throw new Error("BEDROCK_ACCOUNTING_HOLD_MISSING");
  const reservation = await ctx.db
    .query("inferenceReservations")
    .withIndex("by_logical_request", (q) =>
      q
        .eq("projectId", aggregate.projectId)
        .eq(
          "logicalRequestKey",
          logicalKey(aggregate, hold.attemptId, usage.requestId),
        ),
    )
    .first();
  if (
    !reservation ||
    String(reservation.workflowRunId) !== hold.attemptId ||
    reservation.executionProfileDigest !==
      aggregate.snapshot.scope.executionProfileDigest ||
    reservation.primaryRoute.routeDigest !==
      aggregate.snapshot.scope.modelRouteDigest
  )
    throw new Error("BEDROCK_ACCOUNTING_RESERVATION_MISMATCH");
  const intents = await ctx.db
    .query("inferencePhysicalIntents")
    .withIndex("by_reservation", (q) => q.eq("reservationId", reservation._id))
    .collect();
  const intent = intents[0];
  if (
    intents.length !== 1 ||
    !intent ||
    intent.requestDigest !== usage.requestDigest ||
    intent.claimedAt === undefined
  )
    throw new Error("BEDROCK_ACCOUNTING_INTENT_MISMATCH");
  const receipt = await ctx.db
    .query("inferencePhysicalReceipts")
    .withIndex("by_intent", (q) => q.eq("intentId", intent._id))
    .first();
  if (correction && receipt) {
    if (usage.classification !== "ACTUAL" || !evidenceReference)
      throw new Error("BEDROCK_ACCOUNTING_CORRECTION_REQUIRES_ACTUAL_EVIDENCE");
    const book = await ctx.db.get(reservation.priceBookId);
    if (!book) throw new Error("BEDROCK_ACCOUNTING_PRICE_BOOK_MISSING");
    const observedUsage = {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    };
    const cost = usage.provider !== reservation.primaryRoute.provider || usage.model !== reservation.primaryRoute.modelId
      ? { completeness: "UNKNOWN" as const, costMicrousd: undefined } : calculateInferenceCost({
      usage: observedUsage,
      routeDigest: reservation.primaryRoute.routeDigest,
      priceBook: book.immutableSnapshot,
    });
    await appendReconciliationInTransaction(
      ctx,
      {
        workflowRunId: reservation.workflowRunId,
        receiptId: receipt._id,
        providerEventId: canonicalDigest("bedrock-provider-event/v1", {
          usageId: usage.usageId,
          receiptRevision: usage.expectedReceiptRevision + 1,
        }),
        providerRequestId: usage.providerRequestId,
        observedUsage,
        observedCostMicrousd: cost.costMicrousd,
        completeness: cost.completeness,
        sourceDigest: canonicalDigest("bedrock-usage-reconciliation/v1", {
          usage,
          evidenceReference,
        }),
        reconciledBy: actor,
      },
      { allowPreviouslyUnknownRequest: true },
    );
    return;
  }
  if (receipt) throw new Error("BEDROCK_ACCOUNTING_RECEIPT_ALREADY_EXISTS");
  await appendReceiptInTransaction(ctx, {
    workflowRunId: reservation.workflowRunId,
    intentId: intent._id,
    ...(usage.classification === "ACTUAL"
      ? {
          resolvedProvider: usage.provider,
          resolvedModelId: usage.model,
          providerRequestId: usage.providerRequestId,
        }
      : {}),
    delivery: usage.classification === "ACTUAL" ? "DELIVERED" : "UNKNOWN",
    status:
      usage.classification === "ACTUAL"
        ? overrun
          ? "FAILED"
          : "SUCCEEDED"
        : "UNKNOWN",
    ...(overrun ? { failureCode: "PROVIDER_USAGE_OVERRUN" } : {}),
    usage:
      usage.classification === "ACTUAL"
        ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }
        : {},
    startedAt: intent.claimedAt,
    completedAt: Date.now(),
  });
}
