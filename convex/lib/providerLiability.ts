import { computeCanonicalHash } from "./genomeHash.js";

export const PROVIDER_PRICE_SCHEMA = "factory-provider-price/v1" as const;
export const PROVIDER_RESERVATION_SCHEMA =
  "factory-provider-reservation/v1" as const;
export interface ProviderPrice {
  schema: typeof PROVIDER_PRICE_SCHEMA;
  provider: string;
  model: string;
  api: "RESPONSES" | "CONVERSE" | "INVOKE_MODEL";
  currency: "USD";
  effectiveAt: number;
  expiresAt: number;
  source: string;
  evidenceDigest: string;
  inputNanoUsdPerToken: number;
  outputNanoUsdPerToken: number;
  maximumInputTokens: number;
  maximumOutputTokens: number;
  maximumPayloadBytes: number;
  inputBound: "EXACTLY_ENFORCEABLE" | "CONSERVATIVELY_BOUNDED";
  outputIncludesReasoning: true;
  inclusiveCacheWorstCase: true;
  otherBillableDimensions: "NONE";
}
export interface ProviderReservationScope {
  projectId: string;
  repositoryId: string;
  workOrderId: string;
  workOrderRevision: number;
  executionProfileId: string;
  executionProfileDigest: string;
  modelRouteDigest: string;
  priceDigest: string;
}
export interface ProviderRequestAuthority {
  attemptId: string;
  leaseId: string;
  generation: number;
  leaseExpiresAt: number;
  current: boolean;
  canceled: boolean;
  scope: ProviderReservationScope;
}
export interface ProviderHold {
  requestId: string;
  requestDigest: string;
  attemptId: string;
  leaseId: string;
  generation: number;
  maximumNanoUsd: number;
  maximumOutputTokens: number;
  state: "RESERVED" | "UNKNOWN" | "SETTLED" | "OVERRUN";
  receiptRevision: number;
  providerRequestId?: string;
  usageId?: string;
  accountedNanoUsd?: number;
  classification: "UNKNOWN" | "ACTUAL";
  costClassification: "UNKNOWN" | "ESTIMATED";
  usageDigest?: string;
}
export interface ProviderReservation {
  schema: typeof PROVIDER_RESERVATION_SCHEMA;
  scope: ProviderReservationScope;
  maximumNanoUsd: number;
  expiresAt: number;
  maximumRequests: number;
  frozen: boolean;
  holds: ProviderHold[];
}
export function liabilityDigest(value: unknown) {
  return `sha256:${computeCanonicalHash(value)}`;
}
const integer = (n: unknown): n is number =>
  Number.isSafeInteger(n) && Number(n) >= 0;
const identity = (s: unknown): s is string =>
  typeof s === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/.test(s);
const sha = (s: unknown) =>
  typeof s === "string" && /^sha256:[a-f0-9]{64}$/.test(s);
export function assertProviderPrice(p: ProviderPrice, now: number) {
  if (
    p.schema !== PROVIDER_PRICE_SCHEMA ||
    !identity(p.provider) ||
    !identity(p.model) ||
    !["RESPONSES", "CONVERSE", "INVOKE_MODEL"].includes(p.api) ||
    p.currency !== "USD" ||
    !integer(p.effectiveAt) ||
    p.effectiveAt > now ||
    !integer(p.expiresAt) ||
    p.expiresAt <= now ||
    !p.source.startsWith("https://") ||
    !sha(p.evidenceDigest) ||
    ![
      p.inputNanoUsdPerToken,
      p.outputNanoUsdPerToken,
      p.maximumInputTokens,
      p.maximumOutputTokens,
      p.maximumPayloadBytes,
    ].every((v) => integer(v) && v > 0) ||
    !["EXACTLY_ENFORCEABLE", "CONSERVATIVELY_BOUNDED"].includes(p.inputBound) ||
    p.outputIncludesReasoning !== true ||
    p.inclusiveCacheWorstCase !== true ||
    p.otherBillableDimensions !== "NONE"
  )
    throw new Error("PRICE_NOT_BOUNDED");
}
export function assertProviderReservation(r: ProviderReservation, now: number) {
  const s = r.scope;
  if (
    r.schema !== PROVIDER_RESERVATION_SCHEMA ||
    !s ||
    ![s.projectId, s.repositoryId, s.workOrderId, s.executionProfileId].every(
      identity,
    ) ||
    ![s.executionProfileDigest, s.modelRouteDigest, s.priceDigest].every(sha) ||
    !integer(s.workOrderRevision) ||
    s.workOrderRevision < 1 ||
    !integer(r.maximumNanoUsd) ||
    r.maximumNanoUsd < 1 ||
    !integer(r.expiresAt) ||
    r.expiresAt <= now ||
    !integer(r.maximumRequests) ||
    r.maximumRequests < 1 ||
    r.maximumRequests > 100 ||
    !Array.isArray(r.holds) ||
    r.holds.length > r.maximumRequests ||
    r.frozen
  )
    throw new Error("RESERVATION_NOT_CURRENT");
}
export function reserveProviderRequest(input: {
  reservation: ProviderReservation;
  price: ProviderPrice;
  authority: ProviderRequestAuthority;
  requestId: string;
  requestDigest: string;
  payloadBytes: number;
  outputTokens: number;
  now: number;
}) {
  const { reservation: original, price, authority: a, now } = input;
  assertProviderReservation(original, now);
  assertProviderPrice(price, now);
  if (
    liabilityDigest(price) !== original.scope.priceDigest ||
    liabilityDigest(a.scope) !== liabilityDigest(original.scope) ||
    !a.current ||
    a.canceled ||
    !identity(a.attemptId) ||
    !identity(a.leaseId) ||
    !integer(a.generation) ||
    a.generation < 1 ||
    !integer(a.leaseExpiresAt) ||
    a.leaseExpiresAt <= now
  )
    throw new Error("ATTEMPT_FENCED");
  if (
    !identity(input.requestId) ||
    !sha(input.requestDigest) ||
    !integer(input.payloadBytes) ||
    input.payloadBytes > price.maximumPayloadBytes ||
    !integer(input.outputTokens) ||
    input.outputTokens < 1 ||
    input.outputTokens > price.maximumOutputTokens
  )
    throw new Error("REQUEST_NOT_BOUNDED");
  if (original.holds.some((h) => h.requestId === input.requestId))
    throw new Error("REQUEST_REPLAY");
  const maximum =
    price.maximumInputTokens * price.inputNanoUsdPerToken +
    input.outputTokens * price.outputNanoUsdPerToken;
  const used = original.holds.reduce(
    (sum, h) => sum + Math.max(h.maximumNanoUsd, h.accountedNanoUsd ?? 0),
    0,
  );
  if (
    !integer(maximum) ||
    !integer(used) ||
    original.holds.length >= original.maximumRequests ||
    maximum > original.maximumNanoUsd - used
  )
    throw new Error("LIABILITY_EXHAUSTED");
  const r = structuredClone(original);
  const hold: ProviderHold = {
    requestId: input.requestId,
    requestDigest: input.requestDigest,
    attemptId: a.attemptId,
    leaseId: a.leaseId,
    generation: a.generation,
    maximumNanoUsd: maximum,
    maximumOutputTokens: input.outputTokens,
    state: "RESERVED",
    receiptRevision: 0,
    classification: "UNKNOWN",
    costClassification: "UNKNOWN",
  };
  r.holds.push(hold);
  return { reservation: r, hold };
}
export interface ProviderUsage {
  requestId: string;
  requestDigest: string;
  provider: string;
  model: string;
  providerRequestId: string;
  usageId: string;
  inputTokens: number;
  outputTokens: number;
  classification: "ACTUAL" | "UNKNOWN";
  expectedReceiptRevision: number;
}
export function settleProviderUsage(
  original: ProviderReservation,
  price: ProviderPrice,
  usage: ProviderUsage,
  correctionAuthorized = false,
) {
  const r = structuredClone(original);
  const h = r.holds.find((h) => h.requestId === usage.requestId);
  if (
    !h ||
    h.requestDigest !== usage.requestDigest ||
    usage.provider !== price.provider ||
    usage.model !== price.model ||
    liabilityDigest(price) !== r.scope.priceDigest
  )
    throw new Error("USAGE_SUBJECT_MISMATCH");
  if ((h.providerRequestId && h.providerRequestId !== usage.providerRequestId)
    || (h.usageId && h.usageId !== usage.usageId)) throw new Error("USAGE_IDENTITY_CHANGED");
  const d = liabilityDigest(usage);
  if (h.usageDigest === d)
    return { reservation: r, duplicate: true, incident: h.state === "OVERRUN" };
  if (
    h.receiptRevision !== usage.expectedReceiptRevision ||
    (["SETTLED", "OVERRUN"].includes(h.state) && !correctionAuthorized)
  )
    throw new Error("USAGE_REVISION_CONFLICT");
  if (usage.classification === "UNKNOWN") {
    h.state = "UNKNOWN";
    h.classification = "UNKNOWN";
    h.costClassification = "UNKNOWN";
    h.usageDigest = d;
    h.receiptRevision++;
    return { reservation: r, duplicate: false, incident: r.frozen };
  }
  if (
    usage.classification !== "ACTUAL" ||
    !identity(usage.providerRequestId) ||
    !identity(usage.usageId) ||
    (h.providerRequestId && h.providerRequestId !== usage.providerRequestId) ||
    r.holds.some(
      (other) =>
        other !== h &&
        (other.usageId === usage.usageId ||
          other.providerRequestId === usage.providerRequestId),
    ) ||
    !integer(usage.inputTokens) ||
    !integer(usage.outputTokens)
  )
    throw new Error("USAGE_INVALID_OR_REPLAYED");
  const actual =
    usage.inputTokens * price.inputNanoUsdPerToken +
    usage.outputTokens * price.outputNanoUsdPerToken;
  if (!integer(actual)) throw new Error("USAGE_ARITHMETIC_INVALID");
  const incident =
    actual > h.maximumNanoUsd ||
    usage.inputTokens > price.maximumInputTokens ||
    usage.outputTokens > h.maximumOutputTokens;
  Object.assign(h, {
    state: incident ? "OVERRUN" : "SETTLED",
    classification: "ACTUAL",
    costClassification: "ESTIMATED",
    accountedNanoUsd: actual,
    providerRequestId: usage.providerRequestId,
    usageId: usage.usageId,
    usageDigest: d,
    receiptRevision: h.receiptRevision + 1,
  });
  if (incident) r.frozen = true;
  return { reservation: r, duplicate: false, incident };
}
