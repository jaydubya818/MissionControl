import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { canonicalDigest } from "@mission-control/shared";
import { appendReceiptInternal, appendReconciliationInternal, claimIntentInternal, createOutcomeProjection, freezeRouteComparison, getAttemptEconomics, persistIntentInternal } from "../inferenceGateway";
import { reservationFixture } from "./helpers/inference.fixture";

vi.mock("../lib/companyAccess", async (original) => ({
  ...await original<typeof import("../lib/companyAccess")>(),
  requireWorkspacePermission: vi.fn(async () => ({ actorId: "operator", project: { tenantId: "tenant" } })),
}));
const sha = `sha256:${"a".repeat(64)}`;
beforeEach(() => { vi.stubEnv("MC_GOVERNED_INFERENCE_GATEWAY_ENABLED", "1"); vi.useFakeTimers(); vi.setSystemTime(1_800_000_000_000); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

async function chain() {
  const f = reservationFixture();
  const reservation = await f.reserve({ maxCostMicrousd: 40, maxPhysicalCalls: 2, maxInputTokens: 10,
    maxOutputTokens: 10, allowedFallbacks: [f.fallback] });
  const persist = (id: string, reservationId = reservation.reservationId, logicalRequestKey = f.args.logicalRequestKey,
    physicalOrdinal = 1, retryOfIntentId?: string) => f.invoke<any>(persistIntentInternal, {
      workflowRunId: "attempt", reservationId, logicalRequestKey, physicalOrdinal, retryOfIntentId,
      route: physicalOrdinal === 1 ? f.route : f.fallback, requestDigest: sha, intentKey: id,
    });
  const claim = (intentId: string) => f.invoke<any>(claimIntentInternal, { workflowRunId: "attempt", intentId, leaseId: "lease", claimId: `claim:${intentId}` });
  const receipt = (intentId: string, overrides: Record<string, unknown> = {}) => f.invoke<any>(appendReceiptInternal, {
    workflowRunId: "attempt", intentId, resolvedProvider: f.route.provider, resolvedModelId: f.route.modelId,
    providerRequestId: `provider:${intentId}`, delivery: "DELIVERED", status: "SUCCEEDED",
    usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 },
    startedAt: Date.now(), completedAt: Date.now(), ...overrides,
  });
  const first = await persist("first"); await claim(first.intentId);
  return { ...f, reservation, persist, claim, receipt, first };
}

it("retains individual overruns, fences the WorkOrder and blocks a previously persisted claim and new allocation", async () => {
  const f = await chain();
  const next = await f.reserve({ maxCostMicrousd: 40, logicalRequestKey: "next", registrationIdempotencyKey: "next" });
  const pending = await f.persist("pending", next.reservationId, "next");
  const result = await f.receipt(f.first.intentId, { usage: { inputTokens: 50, outputTokens: 1 } });
  const snapshot = (await f.db.get(result.receiptId))!.immutableSnapshot as any;
  expect(snapshot).toMatchObject({ schema: "inference-physical-receipt/v3", usage: { inputTokens: 50 }, costClassification: "ESTIMATED" });
  expect(snapshot.violationCodes).toEqual(expect.arrayContaining(["RESERVATION_INPUT_TOKEN_LIMIT_EXCEEDED", "RESERVATION_COST_LIMIT_EXCEEDED"]));
  expect(f.records.get("order")!.inferenceSpendingFence).toMatchObject({ receiptId: result.receiptId });
  await expect(f.claim(pending.intentId)).rejects.toThrow("WORK_ORDER_INFERENCE_SPENDING_FENCED");
  await expect(f.reserve({ maxCostMicrousd: 10, logicalRequestKey: "third", registrationIdempotencyKey: "third" })).rejects.toThrow("WORK_ORDER_INFERENCE_SPENDING_FENCED");
  await expect(f.receipt(f.first.intentId, { usage: { inputTokens: 50, outputTokens: 1 } })).resolves.toMatchObject({ created: false });
});

it("sums validated canonical usage and preserves cumulative overruns despite mutable duplicated fields", async () => {
  const f = await chain();
  const first = await f.receipt(f.first.intentId, { delivery: "NOT_DELIVERED", status: "FAILED", usage: { inputTokens: 6, outputTokens: 0 } });
  await f.db.patch(first.receiptId, { usage: { inputTokens: 0, outputTokens: 0 }, costMicrousd: 0 });
  const second = await f.persist("retry", undefined, undefined, 2, f.first.intentId); await f.claim(second.intentId);
  const result = await f.receipt(second.intentId, { resolvedModelId: f.fallback.modelId, usage: { inputTokens: 6, outputTokens: 0 } });
  expect(((await f.db.get(result.receiptId))!.immutableSnapshot as any).violationCodes).toContain("RESERVATION_INPUT_TOKEN_LIMIT_EXCEEDED");
  expect(f.records.get("order")!.inferenceSpendingFence).toBeDefined();
});

it.each(["provider", "model"])("retains resolved %s drift and marks requested-route pricing unknown", async kind => {
  const f = await chain();
  const result = await f.receipt(f.first.intentId, kind === "provider" ? { resolvedProvider: "different" } : { resolvedModelId: "different" });
  const snapshot = (await f.db.get(result.receiptId))!.immutableSnapshot as any;
  expect(snapshot.costClassification).toBe("UNKNOWN"); expect(snapshot.costMicrousd).toBeUndefined();
  expect(snapshot.violationCodes).toContain(kind === "provider" ? "RESOLVED_PROVIDER_DRIFT" : "RESOLVED_MODEL_DRIFT");
  expect(f.records.get("order")!.inferenceSpendingFence).toBeDefined();
});

it("reads an unchanged canonical v2 receipt without migrating its digest", async () => {
  const f = await chain(), result = await f.receipt(f.first.intentId);
  const row = (await f.db.get(result.receiptId))!, { receiptDigest: _, violationCodes: __, costClassification: ___, ...bytes } = row.immutableSnapshot as any;
  bytes.schema = "inference-physical-receipt/v2";
  const digest = canonicalDigest(bytes.schema, bytes);
  await f.db.patch(result.receiptId, { immutableSnapshot: { ...bytes, receiptDigest: digest }, receiptDigest: digest });
  await expect(f.receipt(f.first.intentId)).resolves.toMatchObject({ created: false, receiptDigest: digest });
  expect((await f.db.get(result.receiptId))!.receiptDigest).toBe(digest);
});

it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN])("rejects structurally invalid reconciliation counters %s", async inputTokens => {
  const f = await chain(), result = await f.receipt(f.first.intentId);
  await expect(f.invoke(appendReconciliationInternal, { workflowRunId: "attempt", receiptId: result.receiptId,
    providerRequestId: `provider:${f.first.intentId}`, providerEventId: "event", observedUsage: { inputTokens },
    completeness: "PARTIAL", sourceDigest: sha, reconciledBy: "fixture" })).rejects.toThrow(/safe integer|invalid/i);
  expect(f.tableRows("inferenceReconciliations")).toHaveLength(0);
});

it.each(["tokens", "money"])("retains cumulative reconciliation %s overrun and keeps the first fence after a lower correction", async kind => {
  const f = await chain();
  const primary = await f.receipt(f.first.intentId, { delivery: "NOT_DELIVERED", status: "FAILED", usage: {} });
  const second = await f.persist("retry", undefined, undefined, 2, f.first.intentId); await f.claim(second.intentId);
  const last = await f.receipt(second.intentId, { resolvedModelId: f.fallback.modelId, usage: {} });
  const reconcile = (receiptId: string, intentId: string, event: string, amount: number) => f.invoke(appendReconciliationInternal, {
    workflowRunId: "attempt", receiptId, providerRequestId: `provider:${intentId}`, providerEventId: event,
    ...(kind === "tokens" ? { observedUsage: { inputTokens: amount } } : { observedCostMicrousd: amount }),
    completeness: "PARTIAL", sourceDigest: sha, reconciledBy: "fixture",
  });
  const amount = kind === "tokens" ? 6 : 25;
  await reconcile(primary.receiptId, f.first.intentId, "first-event", amount);
  expect(f.records.get("order")!.inferenceSpendingFence).toBeUndefined();
  await reconcile(last.receiptId, second.intentId, "second-event", amount);
  const fence = structuredClone(f.records.get("order")!.inferenceSpendingFence);
  expect(fence).toMatchObject({ violationCodes: [kind === "tokens" ? "RESERVATION_INPUT_TOKEN_LIMIT_EXCEEDED" : "RESERVATION_COST_LIMIT_EXCEEDED"] });
  await reconcile(last.receiptId, second.intentId, "lower-event", 0);
  expect(f.records.get("order")!.inferenceSpendingFence).toEqual(fence);
  const event = f.tableRows("inferenceReconciliations")[0];
  expect(kind === "tokens" ? (event.observedUsage as any).outputTokens : event.observedUsage).toBeUndefined();
});

it("returns the scoped spending fence in economics and rejects a substituted WorkOrder", async () => {
  const f = await chain();
  expect(await f.invoke(getAttemptEconomics, { workflowRunId: "attempt" })).toMatchObject({ inferenceSpendingFence: null });
  await f.receipt(f.first.intentId, { usage: { inputTokens: 11 } });
  expect(await f.invoke(getAttemptEconomics, { workflowRunId: "attempt" })).toMatchObject({ inferenceSpendingFence: f.records.get("order")!.inferenceSpendingFence });
  f.records.get("order")!.projectId = "different-project";
  await expect(f.invoke(getAttemptEconomics, { workflowRunId: "attempt" })).rejects.toThrow("WorkOrder scope");
});

it("includes prior reconciliation counters when a later physical receipt arrives", async () => {
  const f = await chain();
  const primary = await f.receipt(f.first.intentId, { delivery: "NOT_DELIVERED", status: "FAILED", usage: {} });
  await f.invoke(appendReconciliationInternal, { workflowRunId: "attempt", receiptId: primary.receiptId,
    providerRequestId: `provider:${f.first.intentId}`, providerEventId: "prior-observation", observedUsage: { inputTokens: 6 },
    completeness: "PARTIAL", sourceDigest: sha, reconciledBy: "fixture" });
  const next = await f.persist("retry", undefined, undefined, 2, f.first.intentId); await f.claim(next.intentId);
  const receipt = await f.receipt(next.intentId, { resolvedModelId: f.fallback.modelId, usage: { inputTokens: 6 } });
  expect(((await f.db.get(receipt.receiptId))!.immutableSnapshot as any).violationCodes).toContain("RESERVATION_INPUT_TOKEN_LIMIT_EXCEEDED");
});

it("rejects a substituted prior reconciliation instead of using its duplicated counters", async () => {
  const f = await chain();
  const primary = await f.receipt(f.first.intentId, { delivery: "NOT_DELIVERED", status: "FAILED", usage: {} });
  await f.invoke(appendReconciliationInternal, { workflowRunId: "attempt", receiptId: primary.receiptId,
    providerRequestId: `provider:${f.first.intentId}`, providerEventId: "prior-observation", observedUsage: { inputTokens: 6 },
    completeness: "PARTIAL", sourceDigest: sha, reconciledBy: "fixture" });
  f.tableRows("inferenceReconciliations")[0].observedUsage = { inputTokens: 0 };
  const next = await f.persist("retry", undefined, undefined, 2, f.first.intentId); await f.claim(next.intentId);
  await expect(f.receipt(next.intentId, { resolvedModelId: f.fallback.modelId, usage: { inputTokens: 6 } })).rejects.toThrow("Canonical reconciliation history");
});

it("keeps authoritative UNKNOWN correction money in the projection and subsequent cumulative observations", async () => {
  const f = await chain();
  const primary = await f.receipt(f.first.intentId, { delivery: "NOT_DELIVERED", status: "FAILED", usage: {} });
  const reconcile = (providerEventId: string, completeness: string, observedCostMicrousd?: number) =>
    f.invoke(appendReconciliationInternal, { workflowRunId: "attempt", receiptId: primary.receiptId,
      providerRequestId: `provider:${f.first.intentId}`, providerEventId, completeness, observedCostMicrousd,
      sourceDigest: sha, reconciledBy: "fixture" });
  await reconcile("priced", "COMPLETE", 35);
  await reconcile("unknown", "UNKNOWN");
  const projected = await f.invoke<any>(createOutcomeProjection, { workflowRunId: "attempt", cohortDigest: sha, routeDigest: f.route.routeDigest });
  expect((await f.db.get(projected.projectionId))!.immutableSnapshot).toMatchObject({ costCompleteness: "UNKNOWN", costCoverage: 0 });
  expect(((await f.db.get(projected.projectionId))!.immutableSnapshot as any).totalCostMicrousd).toBeUndefined();
  const next = await f.persist("retry", undefined, undefined, 2, f.first.intentId); await f.claim(next.intentId);
  const result = await f.receipt(next.intentId, { resolvedModelId: f.fallback.modelId, usage: { inputTokens: 6, outputTokens: 0 } });
  expect(((await f.db.get(result.receiptId))!.immutableSnapshot as any).violationCodes).not.toContain("RESERVATION_COST_LIMIT_EXCEEDED");
  expect(f.records.get("order")!.inferenceSpendingFence).toBeUndefined();
  expect(f.rows[0].maxCostMicrousd).toBe(40);
});

it("reads frozen v1 formula projections unchanged and excludes them from v2 comparisons", async () => {
  const f = await chain(); await f.receipt(f.first.intentId);
  const args = { workflowRunId: "attempt", cohortDigest: sha, routeDigest: f.route.routeDigest };
  const historical = await f.invoke<any>(createOutcomeProjection, args);
  const row = (await f.db.get(historical.projectionId))!;
  const { digest: _, ...bytes } = row.immutableSnapshot as any;
  bytes.formulaVersion = "accepted-outcome-economics/v1";
  const digest = canonicalDigest(bytes.schema, bytes);
  const snapshot = { ...bytes, digest };
  await f.db.patch(row._id, { formulaVersion: bytes.formulaVersion, projectionDigest: digest, immutableSnapshot: snapshot });
  const economics = await f.invoke<any>(getAttemptEconomics, { workflowRunId: "attempt" });
  expect(economics.latestProjection.immutableSnapshot).toEqual(snapshot);
  await f.invoke(createOutcomeProjection, args);
  await f.invoke(freezeRouteComparison, { projectId: "project", leftRouteDigest: f.route.routeDigest,
    rightRouteDigest: f.fallback.routeDigest, cohortDigest: sha, minimumSampleSize: 2, maximumAgeMs: 1000 });
  const comparison = f.tableRows("inferenceRouteComparisons")[0] as any;
  expect(comparison.formulaVersion).toBe("accepted-outcome-economics/v2"); expect(comparison.leftSummary.sampleSize).toBe(1);
  expect((await f.db.get(row._id))!.immutableSnapshot).toEqual(snapshot);
  expect((await f.db.get(row._id))!.projectionDigest).toBe(digest);
});

it.each(["cost", "completeness"])("rejects canonical reconciliation %s tampering before projecting money", async fault => {
  const f = await chain(); const receipt = await f.receipt(f.first.intentId);
  await f.invoke(appendReconciliationInternal, { workflowRunId: "attempt", receiptId: receipt.receiptId,
    providerRequestId: `provider:${f.first.intentId}`, providerEventId: "original-event",
    ...(fault === "cost" ? { observedCostMicrousd: 7, completeness: "COMPLETE" } : { completeness: "UNKNOWN" }),
    sourceDigest: sha, reconciledBy: "fixture" });
  const event = f.tableRows("inferenceReconciliations")[0];
  if (fault === "cost") event.observedCostMicrousd = 0;
  else event.completeness = "COMPLETE";
  await expect(f.invoke(createOutcomeProjection, { workflowRunId: "attempt", cohortDigest: sha,
    routeDigest: f.route.routeDigest })).rejects.toThrow("Canonical reconciliation history");
  expect(f.tableRows("factoryOutcomeProjections")).toHaveLength(0);
});

it("persists projection overflow as UNKNOWN with every canonical receipt and reconciliation retained", async () => {
  const f = await chain();
  const first = await f.receipt(f.first.intentId, { delivery: "NOT_DELIVERED", status: "FAILED", usage: {} });
  const next = await f.persist("retry", undefined, undefined, 2, f.first.intentId); await f.claim(next.intentId);
  const second = await f.receipt(next.intentId, { resolvedModelId: f.fallback.modelId, usage: {} });
  for (const [receipt, intentId, amount] of [[first, f.first.intentId, Number.MAX_SAFE_INTEGER], [second, next.intentId, 1]] as const) {
    await f.invoke(appendReconciliationInternal, { workflowRunId: "attempt", receiptId: receipt.receiptId,
      providerRequestId: `provider:${intentId}`, providerEventId: `cost:${intentId}`, observedCostMicrousd: amount,
      completeness: "COMPLETE", sourceDigest: sha, reconciledBy: "fixture" });
  }
  const result = await f.invoke<any>(createOutcomeProjection, { workflowRunId: "attempt", cohortDigest: sha, routeDigest: f.route.routeDigest });
  const row = (await f.db.get(result.projectionId))! as any;
  expect(row).toMatchObject({ costCompleteness: "UNKNOWN", confidence: "NONE", physicalCallCount: 2 });
  expect(row.knownCostMicrousd).toBeUndefined(); expect(row.totalCostMicrousd).toBeUndefined();
  expect(row.immutableSnapshot.knownCostMicrousd).toBeUndefined();
  expect(row.immutableSnapshot.receiptIds).toHaveLength(2); expect(row.immutableSnapshot.reconciliationIds).toHaveLength(2);
  const { digest, ...bytes } = row.immutableSnapshot;
  expect(digest).toBe(canonicalDigest(bytes.schema, bytes));
});
