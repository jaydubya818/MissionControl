import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  canonicalDigest,
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
  type ExactInferenceRoute,
} from "@mission-control/shared";

const at = {
  created: Date.parse("2026-09-05T20:00:00.000Z"),
  claimed: Date.parse("2026-09-05T20:00:01.000Z"),
  completed: Date.parse("2026-09-05T20:00:02.000Z"),
  verified: Date.parse("2026-09-05T20:00:03.000Z"),
  accepted: Date.parse("2026-09-05T20:00:04.000Z"),
  projected: Date.parse("2026-09-05T20:00:05.000Z"),
};

const selectedRouteBase = {
  provider: "openai",
  providerRoute: "openai-chat-completions",
  modelId: "gpt-4o-mini-2024-07-18",
  adapter: "mission-control-openai-chat-completions",
  adapterVersion: "1.0.0",
  endpoint: "https://api.openai.com/v1/chat/completions",
};
const selectedRoute: ExactInferenceRoute = {
  ...selectedRouteBase,
  routeDigest: canonicalDigest("inference-route/v1", selectedRouteBase),
};
const comparisonRouteBase = {
  provider: "fixture-provider",
  providerRoute: "offline-comparison-fixture",
  modelId: "fixture-model-v1",
  adapter: "mission-control-offline-fixture",
  adapterVersion: "1.0.0",
  endpoint: "https://example.invalid/v1/inference",
};
const comparisonRoute: ExactInferenceRoute = {
  ...comparisonRouteBase,
  routeDigest: canonicalDigest("inference-route/v1", comparisonRouteBase),
};

const sha = (namespace: string, value: unknown) => canonicalDigest(namespace, value);
const priceBook = inferencePriceBook({
  priceBookId: "phase5-offline-price-book-v1",
  version: 1,
  currency: "USD",
  source: {
    kind: "OPERATOR_APPROVED",
    reference: "offline qualification fixture; not a live provider price claim",
    digest: sha("phase5-price-source/v1", "offline-fixture-v1"),
  },
  effectiveFrom: at.created,
  rates: [
    {
      routeDigest: selectedRoute.routeDigest,
      inputMicrousdPerMillionTokens: 150_000,
      outputMicrousdPerMillionTokens: 600_000,
      cacheReadMicrousdPerMillionTokens: 75_000,
      cacheWriteMicrousdPerMillionTokens: 150_000,
      reasoningMicrousdPerMillionTokens: 0,
    },
    {
      routeDigest: comparisonRoute.routeDigest,
      inputMicrousdPerMillionTokens: 200_000,
      outputMicrousdPerMillionTokens: 800_000,
      cacheReadMicrousdPerMillionTokens: 100_000,
      cacheWriteMicrousdPerMillionTokens: 200_000,
      reasoningMicrousdPerMillionTokens: 0,
    },
  ],
});
const qualifiedLogicalRequestKey = logicalInferenceRequestKey({
  projectId: "phase5-offline-project",
  attemptId: "phase5-offline-attempt",
  stepId: "classify",
  requestOrdinal: 1,
});

const reservation = inferenceReservation({
  reservationId: "phase5-offline-reservation-1",
  projectId: "phase5-offline-project",
  workOrderId: "phase5-offline-work-order",
  taskId: "phase5-offline-task",
  attemptId: "phase5-offline-attempt",
  logicalRequestKey: qualifiedLogicalRequestKey,
  executionProfileId: "phase5-offline-execution-profile",
  executionProfileDigest: sha("phase5-profile/v1", "harness-runtime-kept-separate"),
  primaryRoute: selectedRoute,
  allowedFallbacks: [],
  maxPhysicalCalls: 1,
  maxInputTokens: 1_000,
  maxOutputTokens: 250,
  maxCacheReadTokens: 100,
  maxCacheWriteTokens: 100,
  maxReasoningTokens: 100,
  maxCostMicrousd: 1_000,
  currency: "USD",
  deadlineAt: at.projected + 60_000,
  priceBookId: priceBook.priceBookId,
  priceBookDigest: priceBook.digest,
  policyDigest: sha("phase5-policy/v1", "offline-one-call-no-fallback"),
  leaseId: "phase5-offline-lease",
  leaseExpiresAt: at.projected + 30_000,
  createdAt: at.created,
}, priceBook);

const logicalRequestKey = reservation.logicalRequestKey;
const persistedIntent = physicalInferenceIntent({
  intentId: "phase5-offline-intent-1",
  reservationId: reservation.reservationId,
  logicalRequestKey,
  physicalOrdinal: 1,
  route: selectedRoute,
  requestDigest: sha("phase5-request/v1", { messages: [{ role: "user", content: "synthetic fixture" }] }),
  createdAt: at.created,
}, reservation, [], at.created);
const claimedIntent = claimPhysicalInferenceIntent(persistedIntent, reservation, {
  claimId: "phase5-offline-claim-1",
  leaseId: reservation.leaseId,
  now: at.claimed,
  cancelled: false,
});
const receipt = physicalInferenceReceipt({
  receiptId: "phase5-offline-receipt-1",
  intent: claimedIntent,
  reservation,
  priceBook,
  resolvedProvider: selectedRoute.provider,
  resolvedModelId: selectedRoute.modelId,
  providerRequestId: "offline-fixture-request-1",
  providerBillingId: "offline-fixture-billing-1",
  delivery: "DELIVERED",
  status: "SUCCEEDED",
  usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 10, cacheWriteTokens: 0, reasoningTokens: 0 },
  responseDigest: sha("phase5-response/v1", { classification: "synthetic" }),
  startedAt: at.claimed,
  completedAt: at.completed,
});
const events = [
  factoryOutcomeEvent({
    eventId: "phase5-offline-verification",
    projectId: reservation.projectId,
    workOrderId: reservation.workOrderId,
    attemptId: reservation.attemptId,
    stage: "VERIFICATION_PASSED",
    sourceType: "verification-receipt",
    sourceId: "phase5-offline-verification-receipt",
    sourceDigest: sha("phase5-verification-source/v1", "independent-pass"),
    occurredAt: at.verified,
    recordedAt: at.verified,
  }),
  factoryOutcomeEvent({
    eventId: "phase5-offline-acceptance",
    projectId: reservation.projectId,
    workOrderId: reservation.workOrderId,
    attemptId: reservation.attemptId,
    stage: "HUMAN_ACCEPTED",
    sourceType: "approval-decision",
    sourceId: "phase5-offline-approval-decision",
    sourceDigest: sha("phase5-acceptance-source/v1", "exact-synthetic-result-approved"),
    occurredAt: at.accepted,
    recordedAt: at.accepted,
  }),
];
const projection = projectFactoryOutcome({
  projectionId: "phase5-offline-projection-1",
  cohortDigest: sha("phase5-cohort/v1", "same-task-policy-verifier-formula"),
  projectId: reservation.projectId,
  workOrderId: reservation.workOrderId,
  attemptId: reservation.attemptId,
  routeDigest: selectedRoute.routeDigest,
  events,
  receipts: [receipt],
  projectedAt: at.projected,
});
const selectedSummary = summarizeRouteEconomics([projection], {
  routeDigest: selectedRoute.routeDigest,
  cohortDigest: projection.cohortDigest,
  minimumSampleSize: 1,
  now: at.projected,
  maxAgeMs: 60_000,
});
const comparisonSummary = summarizeRouteEconomics([], {
  routeDigest: comparisonRoute.routeDigest,
  cohortDigest: projection.cohortDigest,
  minimumSampleSize: 1,
  now: at.projected,
  maxAgeMs: 60_000,
});
const comparison = compareRouteEconomics(selectedSummary, comparisonSummary);

function denied(name: string, operation: () => unknown, pattern: RegExp) {
  assert.throws(operation, pattern);
  return { name, result: "PASS", expected: "DENIED" } as const;
}

function retainedDrift(name: string, resolution: { resolvedProvider?: string; resolvedModelId?: string }, code: string) {
  const observed = physicalInferenceReceipt({
    receiptId: name, intent: claimedIntent, reservation, priceBook, ...resolution,
    delivery: "DELIVERED", status: "FAILED", usage: { inputTokens: 1, outputTokens: 1 },
    startedAt: at.claimed, completedAt: at.completed,
  });
  assert.equal(observed.schema, "inference-physical-receipt/v3");
  assert.ok(observed.violationCodes?.includes(code));
  assert.equal(observed.costClassification, "UNKNOWN");
  assert.equal(observed.costMicrousd, undefined);
  assert.deepEqual(observed.usage, { inputTokens: 1, outputTokens: 1 });
  return { name, result: "PASS", expected: "OBSERVATION_RETAINED_WITH_VIOLATION" } as const;
}

const { schema: _reservationSchema, digest: _reservationDigest, ...reservationInput } = reservation;
const duplicateTestReservation = inferenceReservation({
  ...reservationInput,
  allowedFallbacks: [comparisonRoute],
  maxPhysicalCalls: 2,
}, priceBook);
const duplicateTestIntent = physicalInferenceIntent({
  intentId: "phase5-duplicate-test-intent",
  reservationId: duplicateTestReservation.reservationId,
  logicalRequestKey,
  physicalOrdinal: 1,
  route: selectedRoute,
  requestDigest: persistedIntent.requestDigest,
  createdAt: at.created,
}, duplicateTestReservation, [], at.created);

const negativeControls = [
  denied("duplicate physical attempt", () => physicalInferenceIntent({
    ...duplicateTestIntent, intentId: "duplicate", createdAt: at.claimed,
  }, duplicateTestReservation, [duplicateTestIntent], at.claimed), /DUPLICATE_PHYSICAL_ATTEMPT/),
  denied("stale lease", () => claimPhysicalInferenceIntent(persistedIntent, reservation, {
    claimId: "stale", leaseId: "wrong-lease", now: at.claimed, cancelled: false,
  }), /RESERVATION_LEASE_STALE/),
  denied("unapproved route", () => physicalInferenceIntent({
    intentId: "substituted", reservationId: reservation.reservationId, logicalRequestKey,
    physicalOrdinal: 1, route: comparisonRoute, requestDigest: persistedIntent.requestDigest, createdAt: at.claimed,
  }, reservation, [], at.claimed), /UNAPPROVED_ROUTE_OR_FALLBACK/),
  denied("claim replay after ambiguity", () => claimPhysicalInferenceIntent(
    markPhysicalIntentAmbiguous(claimedIntent), reservation,
    { claimId: "second", leaseId: reservation.leaseId, now: at.completed, cancelled: false },
  ), /PHYSICAL_INTENT_ALREADY_DECIDED/),
  retainedDrift("observed provider substitution", { resolvedProvider: "provider-alias" }, "RESOLVED_PROVIDER_DRIFT"),
  retainedDrift("observed model substitution", { resolvedModelId: "gpt-4o-mini-latest" }, "RESOLVED_MODEL_DRIFT"),
  denied("ambiguous success", () => physicalInferenceReceipt({
    receiptId: "bad-ambiguity", intent: claimedIntent, reservation, priceBook,
    delivery: "UNKNOWN", status: "SUCCEEDED", usage: {}, startedAt: at.claimed, completedAt: at.completed,
  }), /Ambiguous delivery/),
  denied("reservation cost overflow", () => inferenceReservation({
    ...reservationInput, priceBookId: priceBook.priceBookId, priceBookDigest: priceBook.digest,
    maxCostMicrousd: 1, createdAt: at.created,
  }, priceBook), /Worst-case dispatch exposure/),
];

const cancelled = claimPhysicalInferenceIntent(persistedIntent, reservation, {
  claimId: "cancelled", leaseId: reservation.leaseId, now: at.claimed, cancelled: true,
});
const unknownReceipt = physicalInferenceReceipt({
  receiptId: "phase5-offline-unknown-receipt",
  intent: claimedIntent,
  reservation,
  priceBook,
  delivery: "UNKNOWN",
  status: "TIMED_OUT",
  usage: {},
  failureCode: "TRANSPORT_RESULT_UNKNOWN",
  startedAt: at.claimed,
  completedAt: at.completed,
});

assert.equal(cancelled.state, "CANCELLED");
assert.equal(unknownReceipt.costCompleteness, "UNKNOWN");
assert.equal(unknownReceipt.costMicrousd, undefined);
assert.equal(projection.outcome, "ACCEPTED");
assert.equal(projection.costCompleteness, "COMPLETE");
assert.equal(projection.stages.MERGED, undefined);
assert.equal(comparison.status, "NO_GO");
assert.equal(comparison.automaticPromotionAuthorized, false);

const record = {
  schema: "governed-inference-phase5-offline-qualification/v1",
  status: "NO_GO",
  phaseDecision: "OFFLINE_GATE_GO_LIVE_COMPARISON_NO_GO",
  reason: "Only one exact route is selected for offline qualification; a second independently qualified route and live-spend authority are absent.",
  generatedAt: "2026-09-05T20:00:05.000Z",
  networkCalls: 0,
  syntheticCustomerData: false,
  runtimeContract: "v51",
  route: selectedRoute,
  comparisonRoute: { ...comparisonRoute, qualification: "NOT_INDEPENDENTLY_QUALIFIED" },
  identities: {
    executionProfileDigest: reservation.executionProfileDigest,
    priceBookDigest: priceBook.digest,
    reservationDigest: reservation.digest,
    policyDigest: reservation.policyDigest,
    logicalRequestKey,
    intentDigest: claimedIntent.digest,
    receiptDigest: receipt.receiptDigest,
    projectionDigest: projection.digest,
    lineageDigest: projection.lineageDigest,
    cohortDigest: projection.cohortDigest,
  },
  fixture: {
    providerApi: "OpenAI Chat Completions response-compatible offline fixture",
    adapterVersion: selectedRoute.adapterVersion,
    physicalCalls: 1,
    maximumPhysicalCalls: reservation.maxPhysicalCalls,
    fallbackCount: reservation.allowedFallbacks.length,
    usageCompleteness: receipt.usageCompleteness,
    receiptSchema: receipt.schema,
    costClassification: receipt.costClassification,
    violationCodes: receipt.violationCodes,
    costCompleteness: receipt.costCompleteness,
    costMicrousd: receipt.costMicrousd,
  },
  outcome: {
    formulaVersion: projection.formulaVersion,
    terminalOutcome: projection.outcome,
    stages: projection.stages,
    absentStages: ["MERGED", "DEPLOYED", "PRODUCTION_VERIFIED", "INCIDENT", "ROLLED_BACK"],
    sampleSize: selectedSummary.sampleSize,
    acceptedCount: selectedSummary.acceptedCount,
    coverage: selectedSummary.coverage,
    confidence: selectedSummary.confidence,
    costPerAcceptedOutcomeMicrousd: selectedSummary.costPerAcceptedOutcomeMicrousd,
  },
  comparison: {
    ...comparison,
    left: selectedSummary,
    right: comparisonSummary,
  },
  classifiedControls: [
    ...negativeControls,
    { name: "cancellation before claim", result: "PASS", expected: "CANCELLED" },
    { name: "timeout after possible delivery", result: "PASS", expected: "UNKNOWN_COST" },
    { name: "incomplete comparison route", result: "PASS", expected: "NO_GO" },
    { name: "automatic route promotion", result: "PASS", expected: "DISABLED" },
  ],
  cleanup: { deterministic: true, externalResourcesCreated: 0, credentialsUsed: 0 },
};

if (process.argv.includes("--check")) {
  const frozenRecord = JSON.parse(readFileSync(new URL(
    "../docs/testing/evidence/governed-inference-observations-v1/offline-qualification.json",
    import.meta.url,
  ), "utf8"));
  assert.deepEqual(
    frozenRecord,
    JSON.parse(JSON.stringify(record)),
    "Frozen Phase 5 observations-v1 evidence does not match the reproducible qualification output.",
  );
}

process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
