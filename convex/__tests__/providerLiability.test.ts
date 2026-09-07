import { describe, it, expect } from "vitest";
import {
  assertProviderPrice,
  assertQualifiedBedrockPrice,
  liabilityDigest,
  reserveProviderRequest,
  settleProviderUsage,
  type ProviderPrice,
  type ProviderReservation,
  type ProviderRequestAuthority,
  type ProviderUsage,
} from "../lib/providerLiability";
const sha = (s: string) => `sha256:${s.repeat(64)}`;
const price: ProviderPrice = {
  schema: "factory-provider-price/v1",
  provider: "fixture",
  model: "fixture-only",
  api: "RESPONSES",
  currency: "USD",
  effectiveAt: 1,
  expiresAt: 2000,
  source: "https://example.test/fixture-pricing",
  evidenceDigest: sha("a"),
  inputNanoUsdPerToken: 1,
  outputNanoUsdPerToken: 2,
  maximumInputTokens: 10,
  maximumOutputTokens: 10,
  maximumPayloadBytes: 100,
  inputBound: "CONSERVATIVELY_BOUNDED",
  outputIncludesReasoning: true,
  inclusiveCacheWorstCase: true,
  otherBillableDimensions: "NONE",
};
const reservation: ProviderReservation = {
  schema: "factory-provider-reservation/v1",
  scope: {
    projectId: "project",
    repositoryId: "repository",
    workOrderId: "wo",
    workOrderRevision: 1,
    executionProfileId: "profile",
    executionProfileDigest: sha("b"),
    modelRouteDigest: sha("c"),
    priceDigest: liabilityDigest(price),
  },
  maximumNanoUsd: 60,
  expiresAt: 1900,
  maximumRequests: 3,
  frozen: false,
  holds: [],
};
const authority: ProviderRequestAuthority = {
  attemptId: "attempt",
  leaseId: "lease",
  generation: 1,
  leaseExpiresAt: 1500,
  current: true,
  canceled: false,
  scope: reservation.scope,
};
const request = (r = reservation, id = "one") => ({
  reservation: r,
  price,
  authority,
  requestId: id,
  requestDigest: sha(id === "one" ? "d" : "e"),
  payloadBytes: 7,
  inputTokens: 10,
  outputTokens: 10,
  now: 1000,
});
const usage: ProviderUsage = {
  requestId: "one",
  requestDigest: sha("d"),
  provider: "fixture",
  model: "fixture-only",
  providerRequestId: "provider-request",
  usageId: "usage-1",
  inputTokens: 5,
  outputTokens: 1,
  classification: "ACTUAL",
  expectedReceiptRevision: 0,
};
describe("authoritative provider liability transitions", () => {
  it.each([
    "workOrderId",
    "executionProfileId",
    "modelRouteDigest",
    "priceDigest",
    "repositoryId",
  ] as const)("fences wrong %s", (field) => {
    const input = request();
    input.authority = {
      ...authority,
      scope: { ...authority.scope, [field]: "wrong" },
    };
    expect(() => reserveProviderRequest(input)).toThrow();
  });
  it.each([
    { current: false },
    { canceled: true },
    { generation: 0 },
    { leaseExpiresAt: 1000 },
  ])("fences stale authority %j", (mutation) =>
    expect(() =>
      reserveProviderRequest({
        ...request(),
        authority: { ...authority, ...mutation },
      }),
    ).toThrow(),
  );
  it.each([
    { maximumOutputTokens: 0 },
    { otherBillableDimensions: "UNKNOWN" },
    { expiresAt: 1000 },
    { expiresAt: NaN },
    { inputBound: "ESTIMATED_ONLY" },
    { outputIncludesReasoning: false },
  ])("rejects unbounded price %j", (mutation) =>
    expect(() =>
      assertProviderPrice({ ...price, ...mutation } as ProviderPrice, 1000),
    ).toThrow(),
  );
  it("denies input/output overflow, missing price and expired reservation", () => {
    expect(() =>
      reserveProviderRequest({ ...request(), payloadBytes: 101 }),
    ).toThrow();
    expect(() =>
      reserveProviderRequest({ ...request(), inputTokens: 11 }),
    ).toThrow();
    expect(() =>
      reserveProviderRequest({ ...request(), outputTokens: 11 }),
    ).toThrow();
    expect(() =>
      reserveProviderRequest({
        ...request(),
        reservation: { ...reservation, expiresAt: 1000 },
      }),
    ).toThrow();
    expect(() =>
      reserveProviderRequest({
        ...request(),
        price: { ...price, evidenceDigest: "" },
      }),
    ).toThrow();
  });
  it("retains maximum liability after settlement and corrected usage", () => {
    const held = reserveProviderRequest(request()).reservation;
    const settled = settleProviderUsage(held, price, usage).reservation;
    expect(settled.holds[0]).toMatchObject({
      state: "SETTLED",
      inputTokens: 10,
      maximumNanoUsd: 30,
      accountedNanoUsd: 7,
      classification: "ACTUAL",
      costClassification: "ESTIMATED",
    });
    const second = reserveProviderRequest(request(settled, "two")).reservation;
    expect(() => reserveProviderRequest(request(second, "three"))).toThrow(
      "LIABILITY_EXHAUSTED",
    );
    const corrected = settleProviderUsage(
      second,
      price,
      {
        ...usage,
        inputTokens: 10,
        outputTokens: 10,
        expectedReceiptRevision: 1,
      },
      true,
    ).reservation;
    expect(corrected.holds[0].accountedNanoUsd).toBe(30);
  });
  it("makes duplicate receipts idempotent and denies usage replay", () => {
    const held = reserveProviderRequest(request()).reservation;
    const settled = settleProviderUsage(held, price, usage).reservation;
    expect(settleProviderUsage(settled, price, usage).duplicate).toBe(true);
    const second = reserveProviderRequest(request(settled, "two")).reservation;
    expect(() =>
      settleProviderUsage(second, price, {
        ...usage,
        requestId: "two",
        requestDigest: sha("e"),
      }),
    ).toThrow("USAGE_INVALID_OR_REPLAYED");
  });
  it("retains unknown liability and freezes oversize provider usage rather than discarding the charge", () => {
    const held = reserveProviderRequest(request()).reservation;
    const unknown = settleProviderUsage(held, price, {
      ...usage,
      classification: "UNKNOWN",
    }).reservation;
    expect(unknown.holds[0].maximumNanoUsd).toBe(30);
    const result = settleProviderUsage(unknown, price, {
      ...usage,
      inputTokens: 11,
      outputTokens: 10,
      expectedReceiptRevision: 1,
    });
    expect(result.incident).toBe(true);
    expect(result.reservation.frozen).toBe(true);
    expect(result.reservation.holds[0].accountedNanoUsd).toBe(31);
    expect(() =>
      reserveProviderRequest(request(result.reservation, "two")),
    ).toThrow();
  });
  it("retains a provider request identity on an unknown observation", () => {
    const held = reserveProviderRequest(request()).reservation;
    const unknown = settleProviderUsage(held, price, {
      ...usage,
      classification: "UNKNOWN",
      providerRequestId: "provider-error-request",
      usageId: "",
      inputTokens: 0,
      outputTokens: 0,
    }).reservation;
    expect(unknown.holds[0]).toMatchObject({
      state: "UNKNOWN",
      providerRequestId: "provider-error-request",
      classification: "UNKNOWN",
      costClassification: "UNKNOWN",
    });
    expect(unknown.holds[0].accountedNanoUsd).toBeUndefined();
  });
  it("rejects request ID mismatch and receipt revision races", () => {
    const held = reserveProviderRequest(request()).reservation;
    for (const mutation of [
      { requestDigest: sha("e") },
      { requestId: "other" },
      { expectedReceiptRevision: 2 },
    ])
      expect(() =>
        settleProviderUsage(held, price, { ...usage, ...mutation }),
      ).toThrow();
  });
  it.each(["provider", "model", "overflow"])("retains %s observations with UNKNOWN money and freezes spending", fault => {
    const held = reserveProviderRequest(request()).reservation;
    const result = settleProviderUsage(held, price, { ...usage,
      ...(fault === "provider" ? { provider: "other" } : fault === "model" ? { model: "other" }
        : { inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: Number.MAX_SAFE_INTEGER }) });
    expect(result.incident).toBe(true); expect(result.reservation.frozen).toBe(true);
    expect(result.reservation.holds[0]).toMatchObject({ state: "OVERRUN", costClassification: "UNKNOWN", classification: "ACTUAL" });
    expect(result.reservation.holds[0].accountedNanoUsd).toBeUndefined();
  });
  it("does not admit request replay", () => {
    const r = reserveProviderRequest(request()).reservation;
    expect(() => reserveProviderRequest(request(r))).toThrow("REQUEST_REPLAY");
  });
});

it('detects output beyond the per-request cap even below the price maximum', () => {
  const held = reserveProviderRequest({ ...request(), outputTokens: 2 }).reservation;
  const result = settleProviderUsage(held, price, { ...usage, inputTokens: 0, outputTokens: 3 });
  expect(result.incident).toBe(true);
  expect(result.reservation.frozen).toBe(true);
});
it('requires operator reconciliation after an overrun and retains incident status for unknown usage', () => {
  const held = reserveProviderRequest(request()).reservation;
  const overrun = settleProviderUsage(held, price, { ...usage, inputTokens: 11 }).reservation;
  expect(() => settleProviderUsage(overrun, price, { ...usage, expectedReceiptRevision: 1 })).toThrow('USAGE_REVISION_CONFLICT');
  const unknown = settleProviderUsage(overrun, price, { ...usage, classification: 'UNKNOWN', expectedReceiptRevision: 1 }, true);
  expect(unknown.incident).toBe(true);
  expect(unknown.reservation.holds[0].costClassification).toBe('UNKNOWN');
  expect(unknown.reservation.holds[0].maximumNanoUsd).toBe(30);
});

it('pins the original usage identity across corrections to prevent historical receipt replay', () => {
  const held = reserveProviderRequest(request()).reservation;
  const settled = settleProviderUsage(held, price, usage).reservation;
  expect(() => settleProviderUsage(settled, price, { ...usage, usageId: 'replacement', expectedReceiptRevision: 1 }, true)).toThrow('USAGE_IDENTITY_CHANGED');
});

it('pins the complete qualified Bedrock price at the authority boundary', () => {
  const qualified: ProviderPrice = {
    schema: 'factory-provider-price/v1', provider: 'aws-bedrock',
    model: 'anthropic.claude-sonnet-4-6', api: 'CONVERSE', currency: 'USD',
    effectiveAt: 1_779_840_000_000, expiresAt: 1_791_331_200_000,
    source: 'https://www-cdn.anthropic.com/files/4zrzovbb/website/3684c2faafb97418665782cea0001f439f74b1d2.pdf',
    evidenceDigest: 'sha256:dc372a994199f77b1e140e775875fd610591c69f31aa8e7ff8394908647b71ad',
    inputNanoUsdPerToken: 3300, outputNanoUsdPerToken: 16500,
    maximumInputTokens: 1_000_000, maximumOutputTokens: 4096,
    maximumPayloadBytes: 262_144, inputBound: 'CONSERVATIVELY_BOUNDED',
    outputIncludesReasoning: true, inclusiveCacheWorstCase: true,
    otherBillableDimensions: 'NONE',
  };
  expect(() => assertQualifiedBedrockPrice(qualified, 1_788_000_000_000)).not.toThrow();
  const qualifiedFab = { ...qualified, api: 'INVOKE_MODEL' as const };
  expect(liabilityDigest(qualifiedFab)).toBe('sha256:765d485cbf1c66e474e022f7dd34c4387269222763445bc8c9eefcd29e51523e');
  expect(() => assertQualifiedBedrockPrice(qualifiedFab, 1_788_000_000_000)).not.toThrow();
  for (const mutation of [
    { inputNanoUsdPerToken: 3299 }, { outputNanoUsdPerToken: 16499 },
    { maximumInputTokens: 999_999 }, { maximumOutputTokens: 4095 },
    { maximumPayloadBytes: 262_143 }, { api: 'RESPONSES' },
    { source: 'https://example.test/substituted' }, { evidenceDigest: sha('f') },
  ]) expect(() => assertQualifiedBedrockPrice({ ...qualified, ...mutation } as ProviderPrice, 1_788_000_000_000))
    .toThrow('BEDROCK_PRICE_NOT_QUALIFIED');
});
