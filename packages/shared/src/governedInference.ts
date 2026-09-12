import { canonicalDigest } from "./canonicalDigest.js";

export const INFERENCE_PRICE_BOOK_SCHEMA = "inference-price-book/v1" as const;
export const INFERENCE_RESERVATION_SCHEMA = "inference-reservation/v1" as const;
export const INFERENCE_INTENT_SCHEMA = "inference-physical-intent/v2" as const;
export const INFERENCE_RECEIPT_SCHEMA = "inference-physical-receipt/v3" as const;
export const OUTCOME_EVENT_SCHEMA = "factory-outcome-event/v1" as const;
export const OUTCOME_PROJECTION_SCHEMA = "factory-outcome-projection/v2" as const;
export const OUTCOME_FORMULA_VERSION = "accepted-outcome-economics/v2" as const;

export type ObservationCompleteness = "COMPLETE" | "PARTIAL" | "UNKNOWN";
export type DeliveryState = "DELIVERED" | "NOT_DELIVERED" | "UNKNOWN";
export type PhysicalIntentState = "PERSISTED" | "CLAIMED" | "CANCELLED" | "RECEIPTED" | "AMBIGUOUS";
export type OutcomeStage =
  | "VERIFICATION_PASSED"
  | "HUMAN_ACCEPTED"
  | "MERGED"
  | "DEPLOYED"
  | "PRODUCTION_VERIFIED"
  | "INCIDENT"
  | "ROLLED_BACK"
  | "REJECTED"
  | "ABANDONED";

export interface ExactInferenceRoute {
  provider: string;
  providerRoute: string;
  modelId: string;
  routeDigest: string;
  adapter: string;
  adapterVersion: string;
  endpoint: string;
}

export interface PriceBookRate {
  routeDigest: string;
  inputMicrousdPerMillionTokens: number;
  outputMicrousdPerMillionTokens: number;
  cacheReadMicrousdPerMillionTokens?: number;
  cacheWriteMicrousdPerMillionTokens?: number;
  reasoningMicrousdPerMillionTokens?: number;
  batchMultiplierBps?: number;
  serviceTier?: string;
}

export interface InferencePriceBook {
  schema: typeof INFERENCE_PRICE_BOOK_SCHEMA;
  priceBookId: string;
  version: number;
  currency: "USD";
  source: { kind: "PROVIDER_PUBLISHED" | "OPERATOR_APPROVED"; reference: string; digest: string };
  effectiveFrom: number;
  effectiveUntil?: number;
  rates: PriceBookRate[];
  digest: string;
}

export interface InferenceReservation {
  schema: typeof INFERENCE_RESERVATION_SCHEMA;
  reservationId: string;
  projectId: string;
  workOrderId: string;
  taskId: string;
  attemptId: string;
  logicalRequestKey: string;
  executionProfileId: string;
  executionProfileDigest: string;
  primaryRoute: ExactInferenceRoute;
  allowedFallbacks: ExactInferenceRoute[];
  maxPhysicalCalls: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxCacheReadTokens: number;
  maxCacheWriteTokens: number;
  maxReasoningTokens: number;
  maxCostMicrousd: number;
  currency: "USD";
  deadlineAt: number;
  priceBookId: string;
  priceBookDigest: string;
  policyDigest: string;
  leaseId: string;
  leaseExpiresAt: number;
  createdAt: number;
  digest: string;
}

export interface PhysicalInferenceIntent {
  schema: typeof INFERENCE_INTENT_SCHEMA;
  intentId: string;
  reservationId: string;
  logicalRequestKey: string;
  physicalOrdinal: number;
  retryOfIntentId?: string;
  route: ExactInferenceRoute;
  requestDigest: string;
  state: PhysicalIntentState;
  createdAt: number;
  claimedAt?: number;
  claimId?: string;
  digest: string;
}

export interface ProviderUsageObservation {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
}

export interface PhysicalInferenceReceipt {
  schema: typeof INFERENCE_RECEIPT_SCHEMA | "inference-physical-receipt/v2";
  receiptId: string;
  intentId: string;
  reservationId: string;
  reservationDigest: string;
  attemptId: string;
  executionProfileId: string;
  executionProfileDigest: string;
  policyDigest: string;
  logicalRequestKey: string;
  physicalOrdinal: number;
  route: ExactInferenceRoute;
  resolvedProvider?: string;
  resolvedModelId?: string;
  providerRequestId?: string;
  providerBillingId?: string;
  delivery: DeliveryState;
  status: "SUCCEEDED" | "FAILED" | "CANCELLED" | "TIMED_OUT" | "UNKNOWN";
  usage: ProviderUsageObservation;
  usageCompleteness: ObservationCompleteness;
  costMicrousd?: number;
  costCompleteness: ObservationCompleteness;
  /** Present on v3 receipts. Rate-derived money is never attributable billing. */
  costClassification?: "ESTIMATED" | "UNKNOWN";
  violationCodes?: string[];
  priceBookId: string;
  priceBookDigest: string;
  batch?: boolean;
  serviceTier?: string;
  responseDigest?: string;
  failureCode?: string;
  startedAt: number;
  completedAt: number;
  receiptDigest: string;
}

export interface InferenceReconciliation {
  reconciliationId: string;
  receiptId: string;
  observedCostMicrousd?: number;
  completeness: ObservationCompleteness;
  reconciledAt: number;
  /** Digest of immutable source evidence, not the derived projection view. */
  digest: string;
}

export interface FactoryOutcomeEvent {
  schema: typeof OUTCOME_EVENT_SCHEMA;
  eventId: string;
  projectId: string;
  workOrderId: string;
  attemptId: string;
  stage: OutcomeStage;
  sourceType: string;
  sourceId: string;
  sourceDigest: string;
  occurredAt: number;
  recordedAt: number;
  digest: string;
}

export interface FactoryOutcomeProjection {
  schema: typeof OUTCOME_PROJECTION_SCHEMA;
  projectionId: string;
  formulaVersion: typeof OUTCOME_FORMULA_VERSION | "accepted-outcome-economics/v1";
  cohortDigest: string;
  projectId: string;
  workOrderId: string;
  attemptId: string;
  routeDigest: string;
  outcome: "ACCEPTED" | "REJECTED" | "ABANDONED" | "IN_PROGRESS";
  stages: Partial<Record<OutcomeStage, { eventId: string; occurredAt: number }>>;
  receiptIds: string[];
  reconciliationIds: string[];
  physicalCallCount: number;
  knownCostMicrousd?: number;
  totalCostMicrousd?: number;
  costCoverage: number;
  costCompleteness: ObservationCompleteness;
  freshnessAt: number;
  confidence: "HIGH" | "LOW" | "NONE";
  lineageDigest: string;
  digest: string;
}

export interface RouteEconomicsSummary {
  routeDigest: string;
  formulaVersion: typeof OUTCOME_FORMULA_VERSION;
  cohortDigest: string;
  sampleSize: number;
  acceptedCount: number;
  totalKnownCostMicrousd?: number;
  costPerAcceptedOutcomeMicrousd?: number;
  coverage: number;
  confidence: "HIGH" | "LOW" | "NONE";
  eligibleForPromotion: boolean;
  blockers: string[];
}

function positiveSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer.`);
}

function nonNegativeSafeInteger(value: number | undefined, label: string) {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
    throw new Error(`${label} must be a non-negative safe integer when present.`);
  }
}

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function tokenCostMicrousd(tokens: number, rate: number): bigint {
  return (BigInt(tokens) * BigInt(rate) + 999_999n) / 1_000_000n;
}

function sumMicrousd(values: Array<number | undefined>, label: string): number | undefined {
  for (const value of values) nonNegativeSafeInteger(value, label);
  if (values.some(value => value === undefined)) return undefined;
  const total = values.reduce<bigint>((sum, value) => sum + BigInt(value!), 0n);
  return total > MAX_SAFE_BIGINT ? undefined : Number(total);
}

function digest(namespace: string, value: unknown) {
  return canonicalDigest(namespace, value);
}

export function canonicalOutcomeSourceDigest(value: unknown) {
  return digest("factory-outcome-canonical-source/v1", value);
}

export function inferencePriceBook(input: Omit<InferencePriceBook, "schema" | "digest">): InferencePriceBook {
  positiveSafeInteger(input.version, "Price-book version");
  if (input.currency !== "USD") throw new Error("Only USD price books are supported by v1.");
  if (!input.priceBookId.trim() || !input.source.reference.trim() || !/^sha256:[a-f0-9]{64}$/.test(input.source.digest)) {
    throw new Error("Price-book identity and source evidence are required.");
  }
  if (!Number.isFinite(input.effectiveFrom) || (input.effectiveUntil !== undefined && input.effectiveUntil <= input.effectiveFrom)) {
    throw new Error("Price-book effective interval is invalid.");
  }
  if (input.rates.length === 0) throw new Error("Price book must contain at least one exact route.");
  const seen = new Set<string>();
  for (const rate of input.rates) {
    if (!/^sha256:[a-f0-9]{64}$/.test(rate.routeDigest) || seen.has(rate.routeDigest)) {
      throw new Error("Price-book route identities must be unique SHA-256 digests.");
    }
    seen.add(rate.routeDigest);
    for (const [label, value] of Object.entries(rate).filter(([key]) => key.endsWith("MicrousdPerMillionTokens"))) {
      nonNegativeSafeInteger(value as number | undefined, label);
    }
    if (rate.batchMultiplierBps !== undefined
      && (!Number.isSafeInteger(rate.batchMultiplierBps) || rate.batchMultiplierBps < 0 || rate.batchMultiplierBps > 100_000)) {
      throw new Error("Batch multiplier must be between 0 and 100000 basis points.");
    }
  }
  const snapshot = { ...input, schema: INFERENCE_PRICE_BOOK_SCHEMA };
  return { ...snapshot, digest: digest(INFERENCE_PRICE_BOOK_SCHEMA, snapshot) };
}

export function inferenceReservation(
  input: Omit<InferenceReservation, "schema" | "digest">,
  priceBook: InferencePriceBook,
): InferenceReservation {
  if (input.currency !== "USD" || input.currency !== priceBook.currency) throw new Error("Reservation currency mismatch.");
  if (input.priceBookId !== priceBook.priceBookId || input.priceBookDigest !== priceBook.digest) {
    throw new Error("Reservation price-book identity mismatch.");
  }
  if (!input.logicalRequestKey.trim()) throw new Error("Reservation logical request identity is required.");
  for (const [label, value] of [
    ["Maximum physical calls", input.maxPhysicalCalls],
    ["Maximum input tokens", input.maxInputTokens],
    ["Maximum output tokens", input.maxOutputTokens],
    ["Maximum cost", input.maxCostMicrousd],
  ] as const) positiveSafeInteger(value, label);
  for (const [label, value] of [["Maximum cache-read tokens", input.maxCacheReadTokens], ["Maximum cache-write tokens", input.maxCacheWriteTokens], ["Maximum reasoning tokens", input.maxReasoningTokens]] as const) {
    nonNegativeSafeInteger(value, label);
  }
  if (input.deadlineAt <= input.createdAt || input.leaseExpiresAt <= input.createdAt) {
    throw new Error("Reservation deadline and lease must be live at creation.");
  }
  if (input.leaseExpiresAt > input.deadlineAt) throw new Error("Reservation lease cannot outlive its deadline.");
  const routes = [input.primaryRoute, ...input.allowedFallbacks];
  if (routes.length !== input.maxPhysicalCalls) {
    throw new Error("Every permitted physical call requires one exact route in the finite fallback chain.");
  }
  if (new Set(routes.map((route) => route.routeDigest)).size !== routes.length) {
    throw new Error("Reservation fallback routes must be unique and cannot loop to the primary route.");
  }
  for (const route of routes) {
    if (!priceBook.rates.some((rate) => rate.routeDigest === route.routeDigest)) {
      throw new Error("Every allowed route requires a frozen price-book rate.");
    }
  }
  const rates = routes.map((route) => priceBook.rates.find((candidate) => candidate.routeDigest === route.routeDigest)!);
  const maximumRate = (key: keyof PriceBookRate, tokens: number) => {
    const values = rates.map((rate) => rate[key]);
    if (tokens > 0 && values.some((value) => value === undefined)) throw new Error("Worst-case exposure has an unpriced token dimension.");
    return Math.max(0, ...(values as number[]).filter((value) => value !== undefined));
  };
  const worstCaseMicrousd = [
    [input.maxInputTokens, maximumRate("inputMicrousdPerMillionTokens", input.maxInputTokens)],
    [input.maxOutputTokens, maximumRate("outputMicrousdPerMillionTokens", input.maxOutputTokens)],
    [input.maxCacheReadTokens, maximumRate("cacheReadMicrousdPerMillionTokens", input.maxCacheReadTokens)],
    [input.maxCacheWriteTokens, maximumRate("cacheWriteMicrousdPerMillionTokens", input.maxCacheWriteTokens)],
    [input.maxReasoningTokens, maximumRate("reasoningMicrousdPerMillionTokens", input.maxReasoningTokens)],
  ].reduce((sum, [tokens, unitRate]) => sum + tokenCostMicrousd(tokens, unitRate), 0n);
  if (worstCaseMicrousd > BigInt(input.maxCostMicrousd)) throw new Error("Worst-case dispatch exposure exceeds the reservation money ceiling.");
  const snapshot = { ...input, schema: INFERENCE_RESERVATION_SCHEMA };
  return { ...snapshot, digest: digest(INFERENCE_RESERVATION_SCHEMA, snapshot) };
}

export function logicalInferenceRequestKey(input: {
  projectId: string;
  attemptId: string;
  stepId: string;
  requestOrdinal: number;
}) {
  positiveSafeInteger(input.requestOrdinal, "Logical request ordinal");
  if (![input.projectId, input.attemptId, input.stepId].every((value) => value.trim())) {
    throw new Error("Logical request scope is incomplete.");
  }
  return `${input.projectId}:${input.attemptId}:${input.stepId}:${input.requestOrdinal}`;
}

// V2 snapshots omit absent object fields before hashing, matching durable JSON
// storage. Keep the shared legacy canonical hash algorithm and old records intact.
function durableInferenceValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map(durableInferenceValue) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, durableInferenceValue(item)])) as T;
  }
  return value;
}

export function physicalInferenceIntent(
  input: Omit<PhysicalInferenceIntent, "schema" | "state" | "digest">,
  reservation: InferenceReservation,
  existing: PhysicalInferenceIntent[],
  now: number,
): PhysicalInferenceIntent {
  if (input.reservationId !== reservation.reservationId || input.logicalRequestKey !== reservation.logicalRequestKey) {
    throw new Error("Intent reservation or logical request identity mismatch.");
  }
  positiveSafeInteger(input.physicalOrdinal, "Physical ordinal");
  if (existing.length >= reservation.maxPhysicalCalls) {
    throw new Error("RESERVATION_CALL_LIMIT_EXCEEDED");
  }
  const sameLogical = existing.filter((intent) => intent.logicalRequestKey === input.logicalRequestKey);
  if (sameLogical.some((intent) => intent.physicalOrdinal === input.physicalOrdinal)) throw new Error("DUPLICATE_PHYSICAL_ATTEMPT");
  if (input.physicalOrdinal === 1 && sameLogical.length > 0) throw new Error("DUPLICATE_LOGICAL_REQUEST");
  if (input.physicalOrdinal > 1) {
    const prior = sameLogical.find((intent) => intent.physicalOrdinal === input.physicalOrdinal - 1);
    if (!prior || input.retryOfIntentId !== prior.intentId) throw new Error("RETRY_LINEAGE_MISSING");
  } else if (input.retryOfIntentId !== undefined) {
    throw new Error("PRIMARY_ATTEMPT_CANNOT_HAVE_RETRY_LINEAGE");
  }
  if (now >= reservation.deadlineAt || now >= reservation.leaseExpiresAt) throw new Error("RESERVATION_EXPIRED");
  const allowed = [reservation.primaryRoute, ...reservation.allowedFallbacks];
  const expected = allowed[input.physicalOrdinal - 1];
  if (!expected || expected.routeDigest !== input.route.routeDigest
    || digest("inference-route-binding/v1", expected) !== digest("inference-route-binding/v1", input.route)) {
    throw new Error("UNAPPROVED_ROUTE_OR_FALLBACK");
  }
  const snapshot = durableInferenceValue({ ...input, schema: INFERENCE_INTENT_SCHEMA, state: "PERSISTED" as const });
  return { ...snapshot, digest: digest(INFERENCE_INTENT_SCHEMA, snapshot) };
}

export function claimPhysicalInferenceIntent(
  intent: PhysicalInferenceIntent,
  reservation: InferenceReservation,
  input: { claimId: string; leaseId: string; now: number; cancelled: boolean },
): PhysicalInferenceIntent {
  if (intent.state !== "PERSISTED") throw new Error("PHYSICAL_INTENT_ALREADY_DECIDED");
  if (input.cancelled) return transitionIntent(intent, { state: "CANCELLED" });
  if (input.leaseId !== reservation.leaseId || input.now >= reservation.leaseExpiresAt || input.now >= reservation.deadlineAt) {
    throw new Error("RESERVATION_LEASE_STALE");
  }
  if (!input.claimId.trim()) throw new Error("Physical claim identity is required.");
  return transitionIntent(intent, { state: "CLAIMED", claimId: input.claimId, claimedAt: input.now });
}

export function markPhysicalIntentAmbiguous(intent: PhysicalInferenceIntent): PhysicalInferenceIntent {
  if (intent.state !== "CLAIMED") throw new Error("Only a claimed intent can become ambiguous.");
  return transitionIntent(intent, { state: "AMBIGUOUS" });
}

function transitionIntent(
  intent: PhysicalInferenceIntent,
  patch: Pick<PhysicalInferenceIntent, "state"> & Partial<Pick<PhysicalInferenceIntent, "claimId" | "claimedAt">>,
): PhysicalInferenceIntent {
  const { digest: _priorDigest, ...prior } = intent;
  const value = { ...prior, ...patch };
  return { ...value, digest: digest(INFERENCE_INTENT_SCHEMA, value) };
}

export function usageCompleteness(usage: ProviderUsageObservation): ObservationCompleteness {
  const dimensions = [usage.inputTokens, usage.outputTokens];
  for (const [label, value] of Object.entries(usage)) nonNegativeSafeInteger(value, label);
  if (dimensions.every((value) => value !== undefined)) return "COMPLETE";
  if (Object.values(usage).some((value) => value !== undefined)) return "PARTIAL";
  return "UNKNOWN";
}

function pricedDimension(tokens: number | undefined, rate: number | undefined) {
  if (tokens === undefined) return { known: false, cost: 0n };
  if (rate === undefined) return tokens === 0 ? { known: true, cost: 0n } : { known: false, cost: 0n };
  return { known: true, cost: tokenCostMicrousd(tokens, rate) };
}

export function calculateInferenceCost(input: {
  usage: ProviderUsageObservation;
  routeDigest: string;
  priceBook: InferencePriceBook;
  batch?: boolean;
  serviceTier?: string;
}): { costMicrousd?: number; completeness: ObservationCompleteness } {
  usageCompleteness(input.usage);
  const rate = input.priceBook.rates.find((candidate) => candidate.routeDigest === input.routeDigest);
  if (!rate || (rate.serviceTier !== undefined && rate.serviceTier !== input.serviceTier)) {
    return { completeness: "UNKNOWN" };
  }
  const parts = [
    pricedDimension(input.usage.inputTokens, rate.inputMicrousdPerMillionTokens),
    pricedDimension(input.usage.outputTokens, rate.outputMicrousdPerMillionTokens),
    pricedDimension(input.usage.cacheReadTokens, rate.cacheReadMicrousdPerMillionTokens),
    pricedDimension(input.usage.cacheWriteTokens, rate.cacheWriteMicrousdPerMillionTokens),
    pricedDimension(input.usage.reasoningTokens, rate.reasoningMicrousdPerMillionTokens),
  ];
  const supplied = Object.values(input.usage).filter((value) => value !== undefined).length;
  if (supplied === 0) return { completeness: "UNKNOWN" };
  // Missing prices cannot be represented as zero or as a partial bill.
  if (parts.some((part, index) => !part.known && [input.usage.inputTokens,
    input.usage.outputTokens, input.usage.cacheReadTokens, input.usage.cacheWriteTokens,
    input.usage.reasoningTokens][index] !== undefined)) return { completeness: "UNKNOWN" };
  const knownCost = parts.reduce((sum, part) => sum + part.cost, 0n);
  const multiplier = input.batch ? rate.batchMultiplierBps : 10_000;
  if (input.batch && multiplier === undefined) {
    return { completeness: "UNKNOWN" };
  }
  const scaledCost = (knownCost * BigInt(multiplier ?? 10_000) + 9_999n) / 10_000n;
  if (scaledCost > BigInt(Number.MAX_SAFE_INTEGER)) return { completeness: "UNKNOWN" };
  const costMicrousd = Number(scaledCost);
  const requiredKnown = parts[0].known && parts[1].known;
  return { costMicrousd, completeness: requiredKnown && parts.every((part) => part.known) ? "COMPLETE" : "PARTIAL" };
}

export function physicalInferenceReceipt(input: {
  receiptId: string;
  intent: PhysicalInferenceIntent;
  reservation: InferenceReservation;
  priceBook: InferencePriceBook;
  resolvedProvider?: string;
  resolvedModelId?: string;
  providerRequestId?: string;
  providerBillingId?: string;
  delivery: DeliveryState;
  status: PhysicalInferenceReceipt["status"];
  usage: ProviderUsageObservation;
  responseDigest?: string;
  failureCode?: string;
  startedAt: number;
  completedAt: number;
  batch?: boolean;
  serviceTier?: string;
  /** Prior receipt observations, including validated accounting corrections. */
  priorReceipts?: Pick<PhysicalInferenceReceipt, "reservationId" | "reservationDigest" | "usage" | "costMicrousd">[];
}): PhysicalInferenceReceipt {
  if (input.intent.reservationId !== input.reservation.reservationId || input.intent.state !== "CLAIMED") {
    throw new Error("Receipt requires the exact claimed physical intent.");
  }
  if (input.intent.claimedAt === undefined || input.startedAt < input.intent.claimedAt) {
    throw new Error("Receipt cannot begin before the durable transport claim.");
  }
  if (input.priceBook.digest !== input.reservation.priceBookDigest) throw new Error("Receipt price-book drift detected.");
  if (!Number.isSafeInteger(input.startedAt) || !Number.isSafeInteger(input.completedAt)
    || input.startedAt < 0 || input.completedAt < input.startedAt) throw new Error("Receipt timing is invalid.");
  if (input.delivery === "UNKNOWN" && input.status !== "UNKNOWN" && input.status !== "TIMED_OUT") {
    throw new Error("Ambiguous delivery cannot be reported as a definitive result.");
  }
  const usageState = usageCompleteness(input.usage);
  const violationCodes: string[] = [];
  if (input.resolvedProvider !== undefined && input.resolvedProvider !== input.intent.route.provider) violationCodes.push("RESOLVED_PROVIDER_DRIFT");
  if (input.resolvedModelId !== undefined && input.resolvedModelId !== input.intent.route.modelId) violationCodes.push("RESOLVED_MODEL_DRIFT");
  const routeDrift = violationCodes.length > 0;
  const priorReceipts = input.priorReceipts ?? [];
  for (const prior of priorReceipts) {
    if (prior.reservationId !== input.reservation.reservationId || prior.reservationDigest !== input.reservation.digest) {
      throw new Error("Prior observation reservation scope is invalid.");
    }
    usageCompleteness(prior.usage);
    if (prior.costMicrousd !== undefined) nonNegativeSafeInteger(prior.costMicrousd, "Prior cost");
  }
  for (const [key, ceiling, label] of [
    ["inputTokens", input.reservation.maxInputTokens, "INPUT"],
    ["outputTokens", input.reservation.maxOutputTokens, "OUTPUT"],
    ["cacheReadTokens", input.reservation.maxCacheReadTokens, "CACHE_READ"],
    ["cacheWriteTokens", input.reservation.maxCacheWriteTokens, "CACHE_WRITE"],
    ["reasoningTokens", input.reservation.maxReasoningTokens, "REASONING"],
  ] as const) {
    const consumed = priorReceipts.reduce((sum, prior) => sum + BigInt(prior.usage[key] ?? 0), 0n);
    if (consumed + BigInt(input.usage[key] ?? 0) > BigInt(ceiling)) violationCodes.push(`RESERVATION_${label}_TOKEN_LIMIT_EXCEEDED`);
  }
  const cost = routeDrift ? { completeness: "UNKNOWN" as const, costMicrousd: undefined } : calculateInferenceCost({
    usage: input.usage,
    routeDigest: input.intent.route.routeDigest,
    priceBook: input.priceBook,
    batch: input.batch,
    serviceTier: input.serviceTier,
  });
  const knownPriorCost = priorReceipts.reduce((sum, prior) => sum + BigInt(prior.costMicrousd ?? 0), 0n);
  if (knownPriorCost + BigInt(cost.costMicrousd ?? 0) > BigInt(input.reservation.maxCostMicrousd)) {
    violationCodes.push("RESERVATION_COST_LIMIT_EXCEEDED");
  }
  if (!routeDrift && usageState !== "UNKNOWN" && cost.completeness === "UNKNOWN") violationCodes.push("REQUESTED_ROUTE_COST_UNKNOWN");
  const snapshot = durableInferenceValue({
    schema: INFERENCE_RECEIPT_SCHEMA,
    receiptId: input.receiptId,
    intentId: input.intent.intentId,
    reservationId: input.reservation.reservationId,
    reservationDigest: input.reservation.digest,
    attemptId: input.reservation.attemptId,
    executionProfileId: input.reservation.executionProfileId,
    executionProfileDigest: input.reservation.executionProfileDigest,
    policyDigest: input.reservation.policyDigest,
    logicalRequestKey: input.intent.logicalRequestKey,
    physicalOrdinal: input.intent.physicalOrdinal,
    route: input.intent.route,
    resolvedProvider: input.resolvedProvider,
    resolvedModelId: input.resolvedModelId,
    providerRequestId: input.providerRequestId,
    providerBillingId: input.providerBillingId,
    delivery: input.delivery,
    status: input.status,
    usage: input.usage,
    usageCompleteness: usageState,
    costMicrousd: cost.costMicrousd,
    costCompleteness: cost.completeness,
    costClassification: cost.costMicrousd === undefined ? "UNKNOWN" as const : "ESTIMATED" as const,
    violationCodes,
    priceBookId: input.priceBook.priceBookId,
    priceBookDigest: input.priceBook.digest,
    batch: input.batch,
    serviceTier: input.serviceTier,
    responseDigest: input.responseDigest,
    failureCode: input.failureCode,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
  });
  return { ...snapshot, receiptDigest: digest(INFERENCE_RECEIPT_SCHEMA, snapshot) };
}

export function factoryOutcomeEvent(input: Omit<FactoryOutcomeEvent, "schema" | "digest">): FactoryOutcomeEvent {
  if (input.recordedAt < input.occurredAt || !/^sha256:[a-f0-9]{64}$/.test(input.sourceDigest)) {
    throw new Error("Outcome source identity or timing is invalid.");
  }
  const snapshot = { ...input, schema: OUTCOME_EVENT_SCHEMA };
  return { ...snapshot, digest: digest(OUTCOME_EVENT_SCHEMA, snapshot) };
}

export function projectFactoryOutcome(input: {
  projectionId: string;
  cohortDigest: string;
  projectId: string;
  workOrderId: string;
  attemptId: string;
  routeDigest: string;
  events: FactoryOutcomeEvent[];
  receipts: PhysicalInferenceReceipt[];
  reconciliations?: InferenceReconciliation[];
  projectedAt: number;
}): FactoryOutcomeProjection {
  const scopedEvents = input.events.filter((event) => event.projectId === input.projectId
    && event.workOrderId === input.workOrderId && event.attemptId === input.attemptId);
  if (scopedEvents.length !== input.events.length) throw new Error("Outcome event scope mismatch.");
  const receiptGroups = new Map<string, PhysicalInferenceReceipt[]>();
  for (const receipt of input.receipts) {
    receiptGroups.set(receipt.reservationId, [...(receiptGroups.get(receipt.reservationId) ?? []), receipt]);
  }
  const primaryReceipts = [...receiptGroups.values()].map((receipts) =>
    [...receipts].sort((left, right) => left.physicalOrdinal - right.physicalOrdinal)[0]);
  if (primaryReceipts.some((receipt) => receipt.route.routeDigest !== input.routeDigest)) {
    throw new Error("Outcome receipts do not belong to the selected route reservation lineage.");
  }
  const receiptIds = new Set(input.receipts.map((receipt) => receipt.receiptId));
  const reconciliations = input.reconciliations ?? [];
  if (reconciliations.some((reconciliation) => !receiptIds.has(reconciliation.receiptId))) {
    throw new Error("Outcome reconciliation does not belong to a selected physical receipt.");
  }
  const latestMonetaryReconciliation = new Map<string, InferenceReconciliation>();
  for (const reconciliation of [...reconciliations].sort((left, right) => left.reconciledAt - right.reconciledAt)) {
    // Usage-only evidence adds lineage without erasing a prior monetary assertion.
    if (reconciliation.observedCostMicrousd !== undefined || reconciliation.completeness === "UNKNOWN") {
      latestMonetaryReconciliation.set(reconciliation.receiptId, reconciliation);
    }
  }
  const stages: FactoryOutcomeProjection["stages"] = {};
  for (const event of [...scopedEvents].sort((left, right) => left.occurredAt - right.occurredAt)) {
    if (!stages[event.stage]) stages[event.stage] = { eventId: event.eventId, occurredAt: event.occurredAt };
  }
  let outcome: FactoryOutcomeProjection["outcome"] = "IN_PROGRESS";
  if (stages.REJECTED) outcome = "REJECTED";
  else if (stages.ABANDONED) outcome = "ABANDONED";
  else if (stages.VERIFICATION_PASSED && stages.HUMAN_ACCEPTED
    && stages.HUMAN_ACCEPTED.occurredAt >= stages.VERIFICATION_PASSED.occurredAt) outcome = "ACCEPTED";
  const effectiveCosts = input.receipts.map((receipt) => {
    const reconciliation = latestMonetaryReconciliation.get(receipt.receiptId);
    return {
      costMicrousd: reconciliation ? reconciliation.observedCostMicrousd : receipt.costMicrousd,
      completeness: reconciliation
        ? reconciliation.completeness
        : receipt.costCompleteness,
    };
  });
  const known = effectiveCosts.filter((cost) => cost.costMicrousd !== undefined);
  const complete = effectiveCosts.filter((cost) => cost.completeness === "COMPLETE" && cost.costMicrousd !== undefined);
  const knownCostMicrousd = sumMicrousd(known.map((cost) => cost.costMicrousd!), "Outcome known cost");
  const costCoverage = input.receipts.length === 0 ? 0 : complete.length / input.receipts.length;
  const costCompleteness: ObservationCompleteness = input.receipts.length === 0 || knownCostMicrousd === undefined
    ? "UNKNOWN"
    : complete.length === input.receipts.length
      ? "COMPLETE"
      : known.length > 0 ? "PARTIAL" : "UNKNOWN";
  const source = {
    formulaVersion: OUTCOME_FORMULA_VERSION,
    cohortDigest: input.cohortDigest,
    eventDigests: scopedEvents.map((event) => event.digest).sort(),
    receiptDigests: input.receipts.map((receipt) => receipt.receiptDigest).sort(),
    reconciliationDigests: reconciliations.map((reconciliation) => reconciliation.digest).sort(),
  };
  const snapshot = durableInferenceValue({
    schema: OUTCOME_PROJECTION_SCHEMA,
    projectionId: input.projectionId,
    formulaVersion: OUTCOME_FORMULA_VERSION,
    cohortDigest: input.cohortDigest,
    projectId: input.projectId,
    workOrderId: input.workOrderId,
    attemptId: input.attemptId,
    routeDigest: input.routeDigest,
    outcome,
    stages,
    receiptIds: input.receipts.map((receipt) => receipt.receiptId).sort(),
    reconciliationIds: reconciliations.map((reconciliation) => reconciliation.reconciliationId).sort(),
    physicalCallCount: input.receipts.length,
    knownCostMicrousd,
    totalCostMicrousd: costCompleteness === "COMPLETE" ? knownCostMicrousd : undefined,
    costCoverage,
    costCompleteness,
    freshnessAt: input.projectedAt,
    confidence: costCompleteness === "COMPLETE" && outcome !== "IN_PROGRESS" ? "HIGH" as const
      : costCompleteness === "PARTIAL" ? "LOW" as const : "NONE" as const,
    lineageDigest: digest(`${OUTCOME_PROJECTION_SCHEMA}/lineage`, source),
  });
  return { ...snapshot, digest: digest(OUTCOME_PROJECTION_SCHEMA, snapshot) };
}

export function summarizeRouteEconomics(
  projections: FactoryOutcomeProjection[],
  input: { routeDigest: string; cohortDigest: string; minimumSampleSize: number; now: number; maxAgeMs: number },
): RouteEconomicsSummary {
  positiveSafeInteger(input.minimumSampleSize, "Minimum sample size");
  positiveSafeInteger(input.maxAgeMs, "Maximum projection age");
  const matching = projections.filter((projection) => projection.routeDigest === input.routeDigest
    && projection.cohortDigest === input.cohortDigest
    && projection.formulaVersion === OUTCOME_FORMULA_VERSION);
  const blockers: string[] = [];
  if (matching.length < input.minimumSampleSize) blockers.push("INSUFFICIENT_SAMPLE");
  if (matching.some((projection) => input.now - projection.freshnessAt > input.maxAgeMs)) blockers.push("STALE_PROJECTION");
  if (matching.some((projection) => projection.costCompleteness !== "COMPLETE")) blockers.push("INCOMPLETE_COST_COVERAGE");
  if (matching.some((projection) => projection.outcome === "IN_PROGRESS")) blockers.push("NON_TERMINAL_OUTCOME");
  const accepted = matching.filter((projection) => projection.outcome === "ACCEPTED");
  if (accepted.length === 0) blockers.push("NO_ACCEPTED_OUTCOMES");
  const totalKnownCostMicrousd = sumMicrousd(matching.map((projection) => projection.knownCostMicrousd), "Route outcome cost");
  if (totalKnownCostMicrousd === undefined) blockers.push("AGGREGATE_COST_UNKNOWN");
  const coverage = matching.length === 0 ? 0
    : matching.reduce((sum, projection) => sum + projection.costCoverage, 0) / matching.length;
  const eligibleForPromotion = blockers.length === 0;
  return {
    routeDigest: input.routeDigest,
    formulaVersion: OUTCOME_FORMULA_VERSION,
    cohortDigest: input.cohortDigest,
    sampleSize: matching.length,
    acceptedCount: accepted.length,
    totalKnownCostMicrousd,
    costPerAcceptedOutcomeMicrousd: eligibleForPromotion
      ? Math.ceil(totalKnownCostMicrousd! / accepted.length)
      : undefined,
    coverage,
    confidence: totalKnownCostMicrousd === undefined ? "NONE" : eligibleForPromotion ? "HIGH" : matching.length > 0 ? "LOW" : "NONE",
    eligibleForPromotion,
    blockers,
  };
}

export function compareRouteEconomics(
  left: RouteEconomicsSummary,
  right: RouteEconomicsSummary,
) {
  const blockers: string[] = [];
  if (left.formulaVersion !== right.formulaVersion) blockers.push("FORMULA_VERSION_MISMATCH");
  if (left.cohortDigest !== right.cohortDigest) blockers.push("COHORT_MISMATCH");
  if (!left.eligibleForPromotion || !right.eligibleForPromotion) blockers.push("ROUTE_NOT_QUALIFIED_BY_ECONOMICS");
  if (left.costPerAcceptedOutcomeMicrousd === undefined || right.costPerAcceptedOutcomeMicrousd === undefined) {
    blockers.push("ACCEPTED_OUTCOME_COST_UNKNOWN");
  }
  if (blockers.length > 0) return {
    status: "NO_GO" as const,
    blockers,
    automaticPromotionAuthorized: false as const,
  };
  const winner = left.costPerAcceptedOutcomeMicrousd! <= right.costPerAcceptedOutcomeMicrousd!
    ? left.routeDigest : right.routeDigest;
  return {
    status: "ADVISORY_ONLY" as const,
    winner,
    blockers: [],
    automaticPromotionAuthorized: false as const,
  };
}
