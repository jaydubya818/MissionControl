import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalDigest, inferencePriceBook } from "@mission-control/shared";
import { createReservation, persistIntentInternal, claimIntentInternal, appendReceiptInternal } from "../inferenceGateway";

// Workspace authorization is a fixed fixture; exercise the actual ledger handlers.
vi.mock("../lib/companyAccess", async (original) => ({
  ...await original<typeof import("../lib/companyAccess")>(),
  requireWorkspacePermission: async (_ctx: unknown, projectId: string) => {
    if (projectId !== "project") throw new Error("Fixture workspace denied");
    return { project: { _id: "project", tenantId: "tenant" }, actorId: "operator" };
  },
}));
type Row = Record<string, any>;
const sha = (digit: string) => `sha256:${digit.repeat(64)}`;

function fixture() {
  vi.stubEnv("MC_GOVERNED_INFERENCE_GATEWAY_ENABLED", "1");
  const now = Date.now();
  const route = { provider: "fixture", providerRoute: "fixture", modelId: "model", routeDigest: sha("a"), adapter: "fixture", adapterVersion: "1", endpoint: "https://example.invalid" };
  const fallbackRoute = { ...route, modelId: "fallback-model", routeDigest: sha("f") };
  const priceBook = inferencePriceBook({ priceBookId: "logical-price-book", version: 1, currency: "USD",
    source: { kind: "OPERATOR_APPROVED", reference: "synthetic", digest: sha("b") }, effectiveFrom: now - 1000,
    rates: [route, fallbackRoute].map(item => ({ routeDigest: item.routeDigest, inputMicrousdPerMillionTokens: 1_000_000, outputMicrousdPerMillionTokens: 1_000_000,
      cacheReadMicrousdPerMillionTokens: 0, cacheWriteMicrousdPerMillionTokens: 0, reasoningMicrousdPerMillionTokens: 0 })) });
  let tables: Record<string, Row[]> = {
    workOrders: [{ _id: "work-order", projectId: "project", approvalStatus: "APPROVED", currentRevisionNumber: 1, metadata: { implementationPolicy: { maxCostUsd: 5 } } }],
    tasks: [{ _id: "task", projectId: "project" }],
    workflowRuns: [{ _id: "attempt", projectId: "project", workOrderId: "work-order", workOrderRevisionNumber: 1, parentTaskId: "task", status: "RUNNING",
      lease: { leaseId: "lease", expiresAt: now + 120_000 }, executionManifestDigest: sha("c"), executionProfileId: "profile", executionProfileDigest: sha("d") }],
    factoryExecutionProfiles: [{ _id: "profile", projectId: "project", profileDigest: sha("d"), enabled: true,
      qualificationStatus: "EVIDENCE_QUALIFIED", admissionStatus: "PRODUCTION_PILOT_ELIGIBLE", qualificationExpiresAt: now + 120_000 }],
    inferencePriceBooks: [{ _id: "price-book", projectId: "project", state: "ACTIVE", effectiveFrom: now - 1000, immutableSnapshot: priceBook, priceBookDigest: priceBook.digest }],
    modelCatalog: [route, fallbackRoute].map((item, index) => ({ _id: `route-${index}`, projectId: "project", ...item, enabled: true, qualificationStatus: "EVIDENCE_QUALIFIED", admissionStatus: "PRODUCTION_PILOT_ELIGIBLE" })),
  };
  let sequence = 0;
  const rows = (table: string) => tables[table] ?? [];
  const get = (id: string) => Object.values(tables).flat().find(row => row._id === id);
  const db = {
    get: async (id: string) => structuredClone(get(id) ?? null),
    insert: async (table: string, value: Row) => {
      const id = `${table}-db-${++sequence}`;
      (tables[table] ??= []).push(structuredClone({ ...value, _id: id })); return id;
    },
    patch: async (id: string, value: Row) => Object.assign(get(id)!, structuredClone(value)),
    query: (table: string) => {
      let selected = [...rows(table)];
      const query: any = {
        withIndex: (_index: string, callback: (q: any) => unknown) => {
          const q: any = { eq: (field: string, value: unknown) => { selected = selected.filter(row => row[field] === value); return q; } };
          callback(q); return query;
        },
        first: async () => structuredClone(selected[0] ?? null),
        collect: async () => structuredClone(selected),
      };
      return query;
    },
  };
  const invoke = async (mutation: any, args: Row) => {
    const before = structuredClone(tables);
    try { return await mutation._handler({ db }, args); } catch (error) { tables = before; throw error; }
  };
  const args = (key: string, amount: number) => ({ projectId: "project", workOrderId: "work-order", taskId: "task", workflowRunId: "attempt", executionProfileId: "profile",
    logicalRequestKey: key, executionProfileDigest: sha("d"), primaryRoute: route, allowedFallbacks: [], maxPhysicalCalls: 1,
    maxInputTokens: 100, maxOutputTokens: 100, maxCacheReadTokens: 0, maxCacheWriteTokens: 0, maxReasoningTokens: 0,
    maxCostMicrousd: amount, deadlineAt: now + 60_000, priceBookId: "price-book", policyDigest: sha("c"), leaseId: "lease", leaseExpiresAt: now + 60_000, registrationIdempotencyKey: key });
  const reserve = (key: string, amount: number) => invoke(createReservation, args(key, amount));
  const persist = (reservationId: string, key: string) => invoke(persistIntentInternal, { workflowRunId: "attempt", reservationId,
    logicalRequestKey: key, physicalOrdinal: 1, route, requestDigest: sha("e"), intentKey: `physical-${key}` });
  const claim = (intentId: string) => invoke(claimIntentInternal, { workflowRunId: "attempt", intentId, leaseId: "lease", claimId: `claim-${intentId}` });
  return { rows, get, db, invoke, args, reserve, persist, claim, route, fallbackRoute, now };
}
afterEach(() => vi.unstubAllEnvs());

describe("canonical inference reservation authority", () => {
  it.each([-1, 0.5, Number.NaN, undefined])("rejects invalid disabled-feature ceilings: %s", async value => {
    const f = fixture();
    await expect(f.invoke(createReservation, { ...f.args("invalid", 1_000_000), maxReasoningTokens: value })).rejects.toThrow(/non-negative safe integer/);
    expect(f.rows("inferenceReservations")).toHaveLength(0);
  });
  it("allows exactly $5 across logical requests and denies the next microdollar", async () => {
    const f = fixture();
    await f.reserve("first", 3_000_000); await f.reserve("second", 2_000_000);
    await expect(f.reserve("third", 200)).rejects.toThrow(/aggregate|WorkOrder.*ceiling/i);
    expect(f.rows("inferenceReservations")).toHaveLength(2);
    const g = fixture(); await g.reserve("first", 3_000_000);
    await expect(g.reserve("second", 2_000_001)).rejects.toThrow(/aggregate|WorkOrder.*ceiling/i);
  });

  it("returns an exact replay without allocating twice and rejects changed replay bytes", async () => {
    const f = fixture(); const first = await f.reserve("first", 5_000_000);
    expect(await f.reserve("first", 5_000_000)).toEqual({ ...first, created: false });
    await expect(f.reserve("first", 4_000_000)).rejects.toThrow(/different immutable bytes/);
    expect(f.rows("inferenceReservations")).toHaveLength(1);
  });

  it.each(["ACTIVE", "EXHAUSTED", "EXPIRED", "CANCELLED"])("retains %s reservations across replacement Attempts and revisions", async state => {
    const f = fixture(); const first = await f.reserve("first", 4_000_000);
    await f.db.patch(first.reservationId, { state });
    await f.db.patch("work-order", { currentRevisionNumber: 2 });
    const replacementId = await f.db.insert("workflowRuns", { ...f.get("attempt"), _id: undefined, workOrderRevisionNumber: 2 });
    const args = { ...f.args("second", 2_000_000), workflowRunId: replacementId };
    await expect(f.invoke(createReservation, args)).rejects.toThrow(/aggregate|WorkOrder.*ceiling/i);
  });

  it("rejects malformed historical liability instead of dropping it from the total", async () => {
    const f = fixture(); const first = await f.reserve("first", 1_000_000);
    await f.db.patch(first.reservationId, { maxCostMicrousd: Number.NaN });
    await expect(f.reserve("second", 1_000_000)).rejects.toThrow(/liability|allocation.*invalid/i);
  });

  it("persists, claims and receipts one exact immutable reservation with distinct database IDs", async () => {
    const f = fixture(); const reservation = await f.reserve("first", 1_000_000);
    expect(reservation.reservationId).not.toBe(f.get(reservation.reservationId)!.immutableSnapshot.reservationId);
    const intent = await f.persist(reservation.reservationId, "first");
    const original = structuredClone(f.get(intent.intentId)!.immutableSnapshot);
    expect(await f.claim(intent.intentId)).toMatchObject({ claimed: true });
    const startedAt = f.get(intent.intentId)!.claimedAt;
    const receipt = await f.invoke(appendReceiptInternal, { workflowRunId: "attempt", intentId: intent.intentId,
      resolvedProvider: "fixture", resolvedModelId: "model", providerRequestId: "request-1", delivery: "DELIVERED", status: "SUCCEEDED",
      usage: { inputTokens: 10, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 }, startedAt, completedAt: startedAt + 1 });
    expect(receipt.created).toBe(true);
    expect(f.rows("inferencePhysicalReceipts")[0]).toMatchObject({ reservationId: reservation.reservationId, costMicrousd: 20, costCompleteness: "COMPLETE" });
    const storedReceipt = f.rows("inferencePhysicalReceipts")[0].immutableSnapshot;
    expect(storedReceipt.reservationId).toBe(original.reservationId);
    expect(storedReceipt.intentId).toBe(original.intentId);
    expect(f.get(intent.intentId)!.immutableSnapshot).toEqual(original);
    expect(await f.claim(intent.intentId)).toMatchObject({ claimed: false });
  });

  it.each(["missing", "changed-digest", "changed-request"])("denies %s immutable intent evidence before dispatch", async kind => {
    const f = fixture(); const reservation = await f.reserve("first", 1_000_000);
    const intent = await f.persist(reservation.reservationId, "first");
    const snapshot = structuredClone(f.get(intent.intentId)!.immutableSnapshot);
    if (kind === "changed-digest") snapshot.digest = sha("f");
    if (kind === "changed-request") snapshot.requestDigest = sha("f");
    await f.db.patch(intent.intentId, { immutableSnapshot: kind === "missing" ? undefined : snapshot });
    await expect(f.claim(intent.intentId)).rejects.toThrow(/immutable/);
    expect(f.get(intent.intentId)!.state).toBe("PERSISTED");
  });

  it("denies changed intent keys and preserves exact logical replay", async () => {
    const f = fixture(); const reservation = await f.reserve("first", 1_000_000);
    const intent = await f.persist(reservation.reservationId, "first");
    expect(await f.persist(reservation.reservationId, "first")).toEqual({ ...intent, created: false });
    await expect(f.invoke(persistIntentInternal, { workflowRunId: "attempt", reservationId: reservation.reservationId,
      logicalRequestKey: "first", physicalOrdinal: 1, route: f.route, requestDigest: sha("e"), intentKey: "changed-key" })).rejects.toThrow(/replay conflicts/);
  });

  it("denies a primary request with a predecessor and a substituted persisted predecessor", async () => {
    const f = fixture(); const reservation = await f.reserve("first", 1_000_000);
    await expect(f.invoke(persistIntentInternal, { workflowRunId: "attempt", reservationId: reservation.reservationId,
      logicalRequestKey: "first", physicalOrdinal: 1, route: f.route, requestDigest: sha("e"), intentKey: "first", retryOfIntentId: "foreign-intent" })).rejects.toThrow(/Primary.*predecessor/);
    expect(f.rows("inferencePhysicalIntents")).toHaveLength(0);
    const intent = await f.persist(reservation.reservationId, "first");
    await f.db.patch(intent.intentId, { retryOfIntentId: "foreign-intent" });
    await expect(f.claim(intent.intentId)).rejects.toThrow(/Primary.*predecessor/);
  });

  it("uses logical snapshot identities through an explicitly reserved definitive-failure fallback", async () => {
    const f = fixture();
    const reservation = await f.invoke(createReservation, { ...f.args("fallback", 1_000_000), maxPhysicalCalls: 2, allowedFallbacks: [f.fallbackRoute] });
    const intent = await f.persist(reservation.reservationId, "fallback"); await f.claim(intent.intentId);
    const startedAt = f.get(intent.intentId)!.claimedAt;
    await f.invoke(appendReceiptInternal, { workflowRunId: "attempt", intentId: intent.intentId, delivery: "NOT_DELIVERED", status: "FAILED",
      usage: {}, startedAt, completedAt: startedAt + 1 });
    await expect(f.invoke(persistIntentInternal, { workflowRunId: "attempt", reservationId: reservation.reservationId, logicalRequestKey: "fallback",
      physicalOrdinal: 2, retryOfIntentId: intent.intentId, route: f.fallbackRoute, requestDigest: sha("e"), intentKey: "physical-fallback" })).rejects.toThrow(/already bound/);
    const next = await f.invoke(persistIntentInternal, { workflowRunId: "attempt", reservationId: reservation.reservationId, logicalRequestKey: "fallback",
      physicalOrdinal: 2, retryOfIntentId: intent.intentId, route: f.fallbackRoute, requestDigest: sha("e"), intentKey: "physical-fallback-2" });
    expect(f.get(next.intentId)!.immutableSnapshot.retryOfIntentId).toBe("physical-fallback");
    expect(f.get(next.intentId)!.retryOfIntentId).toBe(intent.intentId);
    expect(await f.claim(next.intentId)).toMatchObject({ claimed: true });
    const { digest, ...snapshot } = f.get(next.intentId)!.immutableSnapshot;
    expect(canonicalDigest("inference-physical-intent/v1", snapshot)).toBe(digest);
  });

  it("keeps unknown receipts fully reserved and prevents redispatch", async () => {
    const f = fixture(); const reservation = await f.reserve("unknown", 4_000_000);
    const intent = await f.persist(reservation.reservationId, "unknown"); await f.claim(intent.intentId);
    const startedAt = f.get(intent.intentId)!.claimedAt;
    await f.invoke(appendReceiptInternal, { workflowRunId: "attempt", intentId: intent.intentId,
      delivery: "UNKNOWN", status: "UNKNOWN", usage: {}, startedAt, completedAt: startedAt + 1 });
    expect(f.get(intent.intentId)!.state).toBe("AMBIGUOUS");
    expect(await f.claim(intent.intentId)).toMatchObject({ claimed: false });
    await expect(f.reserve("next", 2_000_000)).rejects.toThrow(/aggregate|WorkOrder.*ceiling/i);
  });
});
