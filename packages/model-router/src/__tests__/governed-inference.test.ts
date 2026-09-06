import { describe, expect, it } from "vitest";
import {
  claimPhysicalInferenceIntent,
  compareRouteEconomics,
  factoryOutcomeEvent,
  inferencePriceBook,
  inferenceReservation,
  logicalInferenceRequestKey,
  markPhysicalIntentAmbiguous,
  physicalInferenceIntent,
  physicalInferenceReceipt,
  projectFactoryOutcome,
  summarizeRouteEconomics,
} from "../governed-inference";

const sha = (value: string) => `sha256:${value.padEnd(64, "0").slice(0, 64)}`;
const route = {
  provider: "openai",
  providerRoute: "openai-chat-completions",
  modelId: "gpt-4o",
  routeDigest: sha("a"),
  adapter: "mission-control-openai",
  adapterVersion: "0.9.0",
  endpoint: "https://api.openai.com/v1/chat/completions",
};
const fallback = { ...route, modelId: "gpt-4o-mini", routeDigest: sha("b") };

function book() {
  return inferencePriceBook({
    priceBookId: "pb-1",
    version: 1,
    currency: "USD",
    source: { kind: "OPERATOR_APPROVED", reference: "fixture", digest: sha("c") },
    effectiveFrom: 1,
    rates: [
      {
        routeDigest: route.routeDigest,
        inputMicrousdPerMillionTokens: 5_000_000,
        outputMicrousdPerMillionTokens: 15_000_000,
        cacheReadMicrousdPerMillionTokens: 500_000,
        cacheWriteMicrousdPerMillionTokens: 6_250_000,
        reasoningMicrousdPerMillionTokens: 0,
      },
      {
        routeDigest: fallback.routeDigest,
        inputMicrousdPerMillionTokens: 150_000,
        outputMicrousdPerMillionTokens: 600_000,
        cacheReadMicrousdPerMillionTokens: 150_000,
        cacheWriteMicrousdPerMillionTokens: 150_000,
        reasoningMicrousdPerMillionTokens: 0,
      },
    ],
  });
}

function reservation() {
  const priceBook = book();
  return inferenceReservation({
    reservationId: "reservation-1",
    projectId: "project-1",
    workOrderId: "work-order-1",
    taskId: "task-1",
    attemptId: "attempt-1",
    logicalRequestKey: "project-1:attempt-1:write-code:1",
    executionProfileId: "profile-1",
    executionProfileDigest: sha("d"),
    primaryRoute: route,
    allowedFallbacks: [fallback],
    maxPhysicalCalls: 2,
    maxInputTokens: 10_000,
    maxOutputTokens: 2_000,
    maxCacheReadTokens: 1_000,
    maxCacheWriteTokens: 1_000,
    maxReasoningTokens: 1_000,
    maxCostMicrousd: 200_000,
    currency: "USD",
    deadlineAt: 10_000,
    priceBookId: priceBook.priceBookId,
    priceBookDigest: priceBook.digest,
    policyDigest: sha("e"),
    leaseId: "lease-1",
    leaseExpiresAt: 9_000,
    createdAt: 100,
  }, priceBook);
}

function claimedIntent() {
  const held = reservation();
  const logicalRequestKey = logicalInferenceRequestKey({
    projectId: held.projectId,
    attemptId: held.attemptId,
    stepId: "write-code",
    requestOrdinal: 1,
  });
  const intent = physicalInferenceIntent({
    intentId: "intent-1",
    reservationId: held.reservationId,
    logicalRequestKey,
    physicalOrdinal: 1,
    route,
    requestDigest: sha("f"),
    createdAt: 200,
  }, held, [], 200);
  return { held, intent: claimPhysicalInferenceIntent(intent, held, { claimId: "claim-1", leaseId: "lease-1", now: 300, cancelled: false }) };
}

describe("governed inference reservation and intent", () => {
  it("freezes a finite exact-route reservation", () => {
    const held = reservation();
    expect(held.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(held.allowedFallbacks).toEqual([fallback]);
  });

  it("rejects fallback loops, missing rates, duplicates, stale leases, and overflow", () => {
    const priceBook = book();
    const { digest: _digest, schema: _schema, ...reservationInput } = reservation();
    expect(() => inferenceReservation({ ...reservationInput, allowedFallbacks: [route] }, priceBook)).toThrow(/unique/);
    const held = reservation();
    const key = held.logicalRequestKey;
    const first = physicalInferenceIntent({ intentId: "i1", reservationId: held.reservationId, logicalRequestKey: key, physicalOrdinal: 1, route, requestDigest: sha("1"), createdAt: 2 }, held, [], 2);
    expect(() => physicalInferenceIntent({ intentId: "i2", reservationId: held.reservationId, logicalRequestKey: key, physicalOrdinal: 1, route, requestDigest: sha("2"), createdAt: 3 }, held, [first], 3)).toThrow("DUPLICATE_PHYSICAL_ATTEMPT");
    const retry = physicalInferenceIntent({ intentId: "i2", reservationId: held.reservationId, logicalRequestKey: key, physicalOrdinal: 2, retryOfIntentId: "i1", route: fallback, requestDigest: sha("2"), createdAt: 3 }, held, [first], 3);
    expect(retry.retryOfIntentId).toBe("i1");
    expect(() => claimPhysicalInferenceIntent(first, held, { claimId: "claim", leaseId: "wrong", now: 3, cancelled: false })).toThrow("RESERVATION_LEASE_STALE");
    expect(() => physicalInferenceIntent({
      intentId: "substituted", reservationId: held.reservationId, logicalRequestKey: key,
      physicalOrdinal: 1, route: { ...route, endpoint: "https://proxy.invalid" }, requestDigest: sha("4"), createdAt: 3,
    }, held, [], 3)).toThrow("UNAPPROVED_ROUTE_OR_FALLBACK");
    expect(() => physicalInferenceIntent({ intentId: "i3", reservationId: held.reservationId, logicalRequestKey: key, physicalOrdinal: 1, route, requestDigest: sha("3"), createdAt: 3 }, held, [first, retry], 3)).toThrow("RESERVATION_CALL_LIMIT_EXCEEDED");
  });

  it("lets cancellation win before claim and never redispatches ambiguous claims", () => {
    const held = reservation();
    const pending = physicalInferenceIntent({ intentId: "i", reservationId: held.reservationId, logicalRequestKey: held.logicalRequestKey, physicalOrdinal: 1, route, requestDigest: sha("1"), createdAt: 2 }, held, [], 2);
    expect(claimPhysicalInferenceIntent(pending, held, { claimId: "c", leaseId: "lease-1", now: 3, cancelled: true }).state).toBe("CANCELLED");
    const claimed = claimPhysicalInferenceIntent(pending, held, { claimId: "c", leaseId: "lease-1", now: 3, cancelled: false });
    const ambiguous = markPhysicalIntentAmbiguous(claimed);
    expect(ambiguous.state).toBe("AMBIGUOUS");
    expect(() => claimPhysicalInferenceIntent(ambiguous, held, { claimId: "c2", leaseId: "lease-1", now: 4, cancelled: false })).toThrow("PHYSICAL_INTENT_ALREADY_DECIDED");
  });
});

describe("immutable provider receipts and pricing", () => {
  it("prices cache dimensions from the frozen price book", () => {
    const { held, intent } = claimedIntent();
    const receipt = physicalInferenceReceipt({
      receiptId: "receipt-1",
      intent,
      reservation: held,
      priceBook: book(),
      resolvedProvider: "openai",
      resolvedModelId: "gpt-4o",
      providerRequestId: "req-1",
      providerBillingId: "bill-1",
      delivery: "DELIVERED",
      status: "SUCCEEDED",
      usage: { inputTokens: 1_000, outputTokens: 100, cacheReadTokens: 500, cacheWriteTokens: 0, reasoningTokens: 0 },
      responseDigest: sha("9"),
      startedAt: 400,
      completedAt: 500,
    });
    expect(receipt.costMicrousd).toBe(6_750);
    expect(receipt.costCompleteness).toBe("COMPLETE");
  });

  it("keeps missing usage and ambiguous delivery unknown", () => {
    const { held, intent } = claimedIntent();
    const receipt = physicalInferenceReceipt({
      receiptId: "receipt-unknown",
      intent,
      reservation: held,
      priceBook: book(),
      delivery: "UNKNOWN",
      status: "TIMED_OUT",
      usage: {},
      failureCode: "TRANSPORT_TIMEOUT_AFTER_DISPATCH",
      startedAt: 400,
      completedAt: 500,
    });
    expect(receipt.costMicrousd).toBeUndefined();
    expect(receipt.costCompleteness).toBe("UNKNOWN");
    expect(() => physicalInferenceReceipt({
      receiptId: "bad", intent, reservation: held, priceBook: book(), delivery: "UNKNOWN",
      status: "SUCCEEDED", usage: {}, startedAt: 400, completedAt: 500,
    })).toThrow(/Ambiguous delivery/);
  });

  it("rejects provider and resolved-model substitution", () => {
    const { held, intent } = claimedIntent();
    expect(() => physicalInferenceReceipt({
      receiptId: "bad", intent, reservation: held, priceBook: book(), resolvedProvider: "alias",
      delivery: "DELIVERED", status: "FAILED", usage: {}, startedAt: 400, completedAt: 500,
    })).toThrow(/Provider alias/);
    expect(() => physicalInferenceReceipt({
      receiptId: "bad", intent, reservation: held, priceBook: book(), resolvedModelId: "gpt-4o-latest",
      delivery: "DELIVERED", status: "FAILED", usage: {}, startedAt: 400, completedAt: 500,
    })).toThrow(/model drift/);
  });

  it("fails closed instead of rounding unsafe financial arithmetic", () => {
    const unsafeBook = inferencePriceBook({
      priceBookId: "unsafe", version: 1, currency: "USD",
      source: { kind: "OPERATOR_APPROVED", reference: "overflow fixture", digest: sha("c") },
      effectiveFrom: 1,
      rates: [{
        routeDigest: route.routeDigest,
        inputMicrousdPerMillionTokens: Number.MAX_SAFE_INTEGER,
        outputMicrousdPerMillionTokens: Number.MAX_SAFE_INTEGER,
        cacheReadMicrousdPerMillionTokens: 0,
        cacheWriteMicrousdPerMillionTokens: 0,
        reasoningMicrousdPerMillionTokens: 0,
      }],
    });
    expect(() => inferenceReservation({
      reservationId: "unsafe", projectId: "p", workOrderId: "w", taskId: "t", attemptId: "a",
      logicalRequestKey: "p:a:s:1",
      executionProfileId: "ep", executionProfileDigest: sha("d"), primaryRoute: route,
      allowedFallbacks: [], maxPhysicalCalls: 1, maxInputTokens: Number.MAX_SAFE_INTEGER,
      maxOutputTokens: Number.MAX_SAFE_INTEGER, maxCacheReadTokens: 1, maxCacheWriteTokens: 1,
      maxReasoningTokens: 1, maxCostMicrousd: Number.MAX_SAFE_INTEGER, currency: "USD",
      deadlineAt: 3, priceBookId: unsafeBook.priceBookId, priceBookDigest: unsafeBook.digest,
      policyDigest: sha("e"), leaseId: "l", leaseExpiresAt: 2, createdAt: 1,
    }, unsafeBook)).toThrow(/Worst-case dispatch exposure/);
  });
});

describe("outcome economics", () => {
  function acceptedProjection(complete = true) {
    const { held, intent } = claimedIntent();
    const receipt = physicalInferenceReceipt({
      receiptId: complete ? "r-complete" : "r-unknown",
      intent,
      reservation: held,
      priceBook: book(),
      delivery: complete ? "DELIVERED" : "UNKNOWN",
      status: complete ? "SUCCEEDED" : "UNKNOWN",
      usage: complete ? { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 } : {},
      startedAt: 400,
      completedAt: 500,
    });
    const events = [
      factoryOutcomeEvent({ eventId: "verify", projectId: "project-1", workOrderId: "work-order-1", attemptId: "attempt-1", stage: "VERIFICATION_PASSED", sourceType: "verification-receipt", sourceId: "v1", sourceDigest: sha("7"), occurredAt: 600, recordedAt: 600 }),
      factoryOutcomeEvent({ eventId: "accept", projectId: "project-1", workOrderId: "work-order-1", attemptId: "attempt-1", stage: "HUMAN_ACCEPTED", sourceType: "approval-decision", sourceId: "a1", sourceDigest: sha("8"), occurredAt: 700, recordedAt: 700 }),
    ];
    return projectFactoryOutcome({ projectionId: complete ? "p1" : "p2", cohortDigest: sha("6"), projectId: "project-1", workOrderId: "work-order-1", attemptId: "attempt-1", routeDigest: route.routeDigest, events, receipts: [receipt], projectedAt: 800 });
  }

  it("requires independent verification before human acceptance and preserves absent later stages", () => {
    const projection = acceptedProjection();
    expect(projection.outcome).toBe("ACCEPTED");
    expect(projection.stages.MERGED).toBeUndefined();
    expect(projection.totalCostMicrousd).toBeDefined();
    expect(projection.costCoverage).toBe(1);
  });

  it("attributes failed primary and fallback spend to one selected-route outcome", () => {
    const { held, intent } = claimedIntent();
    const primaryReceipt = physicalInferenceReceipt({
      receiptId: "primary-failure", intent, reservation: held, priceBook: book(),
      delivery: "NOT_DELIVERED", status: "FAILED",
      usage: { inputTokens: 100, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 },
      startedAt: 400, completedAt: 450,
    });
    const retry = physicalInferenceIntent({
      intentId: "intent-2", reservationId: held.reservationId,
      logicalRequestKey: intent.logicalRequestKey, physicalOrdinal: 2, retryOfIntentId: intent.intentId,
      route: fallback, requestDigest: sha("2"), createdAt: 451,
    }, held, [intent], 451);
    const claimedRetry = claimPhysicalInferenceIntent(retry, held, { claimId: "claim-2", leaseId: held.leaseId, now: 452, cancelled: false });
    const fallbackReceipt = physicalInferenceReceipt({
      receiptId: "fallback-success", intent: claimedRetry, reservation: held, priceBook: book(),
      delivery: "DELIVERED", status: "SUCCEEDED",
      usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 },
      startedAt: 452, completedAt: 500,
    });
    const events = [
      factoryOutcomeEvent({ eventId: "verify-retry", projectId: held.projectId, workOrderId: held.workOrderId, attemptId: held.attemptId, stage: "VERIFICATION_PASSED", sourceType: "verification-receipt", sourceId: "v2", sourceDigest: sha("7"), occurredAt: 600, recordedAt: 600 }),
      factoryOutcomeEvent({ eventId: "accept-retry", projectId: held.projectId, workOrderId: held.workOrderId, attemptId: held.attemptId, stage: "HUMAN_ACCEPTED", sourceType: "approval-decision", sourceId: "a2", sourceDigest: sha("8"), occurredAt: 700, recordedAt: 700 }),
    ];
    const projection = projectFactoryOutcome({
      projectionId: "p-retry", cohortDigest: sha("6"), projectId: held.projectId,
      workOrderId: held.workOrderId, attemptId: held.attemptId, routeDigest: route.routeDigest,
      events, receipts: [primaryReceipt, fallbackReceipt], projectedAt: 800,
    });
    expect(projection.physicalCallCount).toBe(2);
    expect(projection.totalCostMicrousd).toBe(primaryReceipt.costMicrousd! + fallbackReceipt.costMicrousd!);
  });

  it("never lets unknown cost improve a route", () => {
    const projection = acceptedProjection(false);
    expect(projection.totalCostMicrousd).toBeUndefined();
    const summary = summarizeRouteEconomics([projection], { routeDigest: route.routeDigest, cohortDigest: sha("6"), minimumSampleSize: 1, now: 900, maxAgeMs: 1_000 });
    expect(summary.costPerAcceptedOutcomeMicrousd).toBeUndefined();
    expect(summary.eligibleForPromotion).toBe(false);
    expect(summary.blockers).toContain("INCOMPLETE_COST_COVERAGE");
  });

  it("freezes newer provider reconciliation into projection cost and lineage", () => {
    const { held, intent } = claimedIntent();
    const receipt = physicalInferenceReceipt({
      receiptId: "transport-estimate", intent, reservation: held, priceBook: book(),
      delivery: "DELIVERED", status: "SUCCEEDED",
      usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 },
      startedAt: 400, completedAt: 500,
    });
    const events = [
      factoryOutcomeEvent({ eventId: "verify-reconciled", projectId: held.projectId, workOrderId: held.workOrderId, attemptId: held.attemptId, stage: "VERIFICATION_PASSED", sourceType: "verification-receipt", sourceId: "v3", sourceDigest: sha("7"), occurredAt: 600, recordedAt: 600 }),
      factoryOutcomeEvent({ eventId: "accept-reconciled", projectId: held.projectId, workOrderId: held.workOrderId, attemptId: held.attemptId, stage: "HUMAN_ACCEPTED", sourceType: "approval-decision", sourceId: "a3", sourceDigest: sha("8"), occurredAt: 700, recordedAt: 700 }),
    ];
    const projection = projectFactoryOutcome({
      projectionId: "p-reconciled", cohortDigest: sha("6"), projectId: held.projectId,
      workOrderId: held.workOrderId, attemptId: held.attemptId, routeDigest: route.routeDigest,
      events, receipts: [receipt], reconciliations: [{
        reconciliationId: "reconciliation-1", receiptId: receipt.receiptId,
        observedCostMicrousd: 999, completeness: "COMPLETE", reconciledAt: 750, digest: sha("9"),
      }], projectedAt: 800,
    });
    expect(projection.totalCostMicrousd).toBe(999);
    expect(projection.reconciliationIds).toEqual(["reconciliation-1"]);
    expect(projection.lineageDigest).toMatch(/^sha256:/);
  });

  it("keeps comparisons advisory and fails closed for an unqualified route", () => {
    const projection = acceptedProjection();
    const qualified = summarizeRouteEconomics([projection], { routeDigest: route.routeDigest, cohortDigest: sha("6"), minimumSampleSize: 1, now: 900, maxAgeMs: 1_000 });
    const unknown = { ...qualified, routeDigest: fallback.routeDigest, eligibleForPromotion: false, costPerAcceptedOutcomeMicrousd: undefined, blockers: ["ROUTE_NOT_INDEPENDENTLY_QUALIFIED"] };
    expect(compareRouteEconomics(qualified, unknown)).toMatchObject({
      status: "NO_GO",
      automaticPromotionAuthorized: false,
    });
    expect(compareRouteEconomics(qualified, { ...qualified, routeDigest: fallback.routeDigest, costPerAcceptedOutcomeMicrousd: qualified.costPerAcceptedOutcomeMicrousd! + 1 })).toMatchObject({
      status: "ADVISORY_ONLY",
      winner: route.routeDigest,
      automaticPromotionAuthorized: false,
    });
  });
});
