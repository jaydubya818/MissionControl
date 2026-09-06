import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalDigest, canonicalOutcomeSourceDigest, type PhysicalInferenceIntent,
  type PhysicalInferenceReceipt, type FactoryOutcomeProjection } from "@mission-control/shared";
import { appendReceiptInternal, appendReconciliationInternal, claimIntentInternal,
  createOutcomeProjection, freezeRouteComparison, persistIntentInternal, recordOutcomeEvent } from "../inferenceGateway";
import { reservationFixture } from "./helpers/inferenceFixture";

vi.mock("../lib/companyAccess", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/companyAccess")>(),
  requireWorkspacePermission: vi.fn(async () => ({ actorId: "fixture-operator", project: { tenantId: "tenant" } })),
}));
const sha = (letter: string) => `sha256:${letter.repeat(64)}`;

async function persistedChain() {
  const fixture = reservationFixture();
  const reservation = await fixture.reserve({ maxCostMicrousd: 100, maxPhysicalCalls: 2,
    allowedFallbacks: [fixture.fallback] });
  const persist = (ordinal: number, prior?: string, overrides: Record<string, unknown> = {}) =>
    fixture.invoke<{ intentId: string; created: boolean }>(persistIntentInternal, {
      workflowRunId: fixture.args.workflowRunId, reservationId: reservation.reservationId,
      logicalRequestKey: fixture.args.logicalRequestKey, physicalOrdinal: ordinal,
      retryOfIntentId: prior, route: ordinal === 1 ? fixture.route : fixture.fallback,
      requestDigest: sha("f"), intentKey: `logical-intent-${ordinal}`, ...overrides,
    });
  const claim = (intentId: string) => fixture.invoke(claimIntentInternal, {
    workflowRunId: fixture.args.workflowRunId, intentId, leaseId: fixture.args.leaseId,
    claimId: `claim:${intentId}`,
  });
  const receipt = (intentId: string, failed: boolean, overrides: Record<string, unknown> = {}) => fixture.invoke<{ receiptId: string; created: boolean }>(appendReceiptInternal, {
    workflowRunId: fixture.args.workflowRunId, intentId,
    resolvedProvider: fixture.route.provider,
    resolvedModelId: failed ? fixture.route.modelId : fixture.fallback.modelId,
    providerRequestId: `fixture-provider-request:${intentId}`,
    delivery: failed ? "NOT_DELIVERED" : "DELIVERED", status: failed ? "FAILED" : "SUCCEEDED",
    usage: { inputTokens: failed ? 0 : 1, outputTokens: failed ? 0 : 1,
      cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 },
    startedAt: Date.now(), completedAt: Date.now(), ...overrides,
  });
  return { ...fixture, reservation, persist, claim, receipt };
}

describe("canonical identities through persisted inference handlers", () => {
  beforeEach(() => {
    vi.stubEnv("MC_GOVERNED_INFERENCE_GATEWAY_ENABLED", "1");
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-06T06:00:00Z"));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

  it("retains exact snapshots through failure, fallback, reconciliation and a synthetic accepted outcome", async () => {
    const f = await persistedChain();
    const frozenReservation = structuredClone(f.rows[0].immutableSnapshot);
    const primary = await f.persist(1);
    const primaryRow = (await f.db.get(primary.intentId))!;
    const frozenPrimary = structuredClone(primaryRow.immutableSnapshot) as PhysicalInferenceIntent;
    expect(primary.intentId).not.toBe(frozenPrimary.intentId);
    expect(f.reservation.reservationId).not.toBe(frozenPrimary.reservationId);
    await f.claim(primary.intentId);
    const failedReceipt = await f.receipt(primary.intentId, true);
    const fallback = await f.persist(2, primary.intentId);
    const fallbackSnapshot = (await f.db.get(fallback.intentId))!.immutableSnapshot as PhysicalInferenceIntent;
    expect(fallbackSnapshot.retryOfIntentId).toBe(frozenPrimary.intentId);
    await f.claim(fallback.intentId);
    const success = await f.receipt(fallback.intentId, false);
    await expect(f.receipt(fallback.intentId, false)).resolves.toMatchObject({ receiptId: success.receiptId, created: false });
    const receiptRow = (await f.db.get(success.receiptId))!;
    const receipt = receiptRow.immutableSnapshot as PhysicalInferenceReceipt;
    const { receiptDigest, ...receiptBytes } = receipt;
    expect(receiptDigest).toBe(canonicalDigest(receipt.schema, receiptBytes));
    expect(receipt.intentId).toBe(fallbackSnapshot.intentId);
    expect(receipt.receiptId).not.toBe(success.receiptId);

    const reconciliationArgs = {
      workflowRunId: f.args.workflowRunId, receiptId: success.receiptId,
      providerEventId: "fixture-billing-event", providerRequestId: receipt.providerRequestId,
      providerBillingId: "fixture-billing-id", observedCostMicrousd: 7,
      completeness: "COMPLETE", sourceDigest: sha("a"), reconciledBy: "fixture-billing-service",
    };
    const reconciliation = await f.invoke<{ reconciliationId: string }>(appendReconciliationInternal, reconciliationArgs);
    await expect(f.invoke(appendReconciliationInternal, reconciliationArgs)).resolves.toMatchObject({
      reconciliationId: reconciliation.reconciliationId, created: false,
    });

    // These deliberately synthetic decisions qualify projection mechanics only.
    const verification = { _id: "fixture-verification", workOrderId: "order", workflowRunId: "attempt",
      verdict: "VERIFIED", independenceValid: true, verificationSubjectDigest: sha("b"),
      decisionInputDigest: sha("c"), recordedAt: Date.now() };
    const approval = { _id: "fixture-approval", workOrderId: "order", workflowRunId: "attempt",
      approvalType: "WORK_ORDER_ACCEPTANCE", requestedAction: "accept fixture", status: "APPROVED",
      decision: "APPROVE", approver: "synthetic-human", decidedAt: Date.now() };
    f.records.set(verification._id, verification); f.records.set(approval._id, approval);
    const { _id: verificationId, ...verificationFacts } = verification;
    const { _id: approvalId, ...approvalFacts } = approval;
    for (const event of [
      { stage: "VERIFICATION_PASSED", sourceType: "verification-receipt", sourceId: verificationId,
        sourceDigest: canonicalOutcomeSourceDigest({ sourceType: "verification-receipt", sourceId: verificationId,
          ...verificationFacts, sourceAttemptId: undefined }) },
      { stage: "HUMAN_ACCEPTED", sourceType: "approval-decision", sourceId: approvalId,
        sourceDigest: canonicalOutcomeSourceDigest({ sourceType: "approval-decision", sourceId: approvalId, ...approvalFacts }) },
    ]) await f.invoke(recordOutcomeEvent, { projectId: "project", workOrderId: "order", workflowRunId: "attempt",
      occurredAt: Date.now(), ...event });

    const projectionArgs = { workflowRunId: "attempt", cohortDigest: sha("d"), routeDigest: f.route.routeDigest };
    const projected = await f.invoke<{ projectionId: string }>(createOutcomeProjection, projectionArgs);
    const projectionRow = (await f.db.get(projected.projectionId))!;
    const projection = projectionRow.immutableSnapshot as FactoryOutcomeProjection;
    const { digest, ...projectionBytes } = projection;
    expect(digest).toBe(canonicalDigest(projection.schema, projectionBytes));
    expect(projection.projectionId).toBe("attempt:v1");
    expect(projection.outcome).toBe("ACCEPTED");
    expect(projection.totalCostMicrousd).toBe(7);
    expect(projection.receiptIds).toContain(receipt.receiptId);
    expect(projectionRow.receiptIds).toEqual([failedReceipt.receiptId, success.receiptId]);
    expect(projection.stages.HUMAN_ACCEPTED?.eventId).toBe(`approval-decision:${approvalId}`);
    expect(f.rows[0].immutableSnapshot).toEqual(frozenReservation);
    expect(primaryRow.immutableSnapshot).toEqual(frozenPrimary);
    expect(primaryRow.state).toBe("RECEIPTED");
    await expect(f.invoke(freezeRouteComparison, { projectId: "project", leftRouteDigest: f.route.routeDigest,
      rightRouteDigest: f.fallback.routeDigest, cohortDigest: sha("d"), minimumSampleSize: 1, maximumAgeMs: 1000,
    })).resolves.toMatchObject({ status: "NO_GO", automaticPromotionAuthorized: false });
  });

  it("binds exact intent replay to the original logical intent key", async () => {
    const f = await persistedChain();
    const first = await f.persist(1);
    await expect(f.persist(1)).resolves.toEqual({ ...first, created: false, state: "PERSISTED" });
    await expect(f.persist(1, undefined, { intentKey: "substituted-intent" })).rejects.toThrow(/immutable|identity/i);
  });

  it("rejects a legacy intent with unrecoverable canonical identity before claim", async () => {
    const f = await persistedChain();
    const first = await f.persist(1);
    await f.db.patch(first.intentId, { immutableSnapshot: undefined });
    await expect(f.claim(first.intentId)).rejects.toThrow(/snapshot|identity/i);
    expect((await f.db.get(first.intentId))!.state).toBe("PERSISTED");
  });

  it("rejects changed frozen intent bytes before claim", async () => {
    const f = await persistedChain();
    const first = await f.persist(1);
    const row = (await f.db.get(first.intentId))!;
    row.immutableSnapshot = { ...row.immutableSnapshot as object, intentId: "corrupted" };
    await expect(f.claim(first.intentId)).rejects.toThrow(/snapshot/i);
    expect(row.state).toBe("PERSISTED");
  });

  it("checks the frozen lease even if mutable lease fields were extended", async () => {
    const f = await persistedChain();
    const first = await f.persist(1);
    vi.advanceTimersByTime(70_000);
    await f.db.patch(f.reservation.reservationId, { leaseExpiresAt: Date.now() + 60_000 });
    f.records.set("attempt", { ...f.records.get("attempt")!, lease: { leaseId: "lease", expiresAt: Date.now() + 60_000 } });
    await expect(f.claim(first.intentId)).rejects.toThrow("RESERVATION_LEASE_STALE");
    expect((await f.db.get(first.intentId))!.state).toBe("PERSISTED");
  });

  it("retains a late receipt using the original committed claim time", async () => {
    const f = await persistedChain();
    const first = await f.persist(1);
    await f.claim(first.intentId);
    const claimedAt = (await f.db.get(first.intentId))!.claimedAt;
    vi.advanceTimersByTime(120_000);
    await expect(f.receipt(first.intentId, true, { startedAt: claimedAt })).resolves.toMatchObject({ created: true });
    expect(f.rows[0].maxCostMicrousd).toBe(100);
  });

  it.each([{ batch: true }, { serviceTier: "different-tier" }])("rejects receipt replay with changed pricing context %j", async changed => {
    const f = await persistedChain();
    const first = await f.persist(1);
    await f.claim(first.intentId); await f.receipt(first.intentId, true);
    await expect(f.receipt(first.intentId, true, changed)).rejects.toThrow("immutable history");
    expect(f.tableRows("inferencePhysicalReceipts")).toHaveLength(1);
  });

  it("compares replay against frozen observations despite duplicated row drift", async () => {
    const f = await persistedChain();
    const first = await f.persist(1); await f.claim(first.intentId);
    const receipt = await f.receipt(first.intentId, true);
    await f.db.patch(receipt.receiptId, { providerRequestId: "changed-provider-request" });
    await expect(f.receipt(first.intentId, true, { providerRequestId: "changed-provider-request" }))
      .rejects.toThrow("immutable history");
    await expect(f.receipt(first.intentId, true)).resolves.toMatchObject({ receiptId: receipt.receiptId, created: false });
    expect(f.tableRows("inferencePhysicalReceipts")).toHaveLength(1);
  });

  it("keeps primary requests from acquiring retry ancestry", async () => {
    const f = await persistedChain();
    await expect(f.persist(1, "unrelated-prior-intent")).rejects.toThrow("PRIMARY_ATTEMPT_CANNOT_HAVE_RETRY_LINEAGE");
    expect(f.tableRows("inferencePhysicalIntents")).toHaveLength(0);
  });

  it("denies substituted Attempt scope before recording an intent", async () => {
    const f = await persistedChain();
    await expect(f.persist(1, undefined, { workflowRunId: "other-attempt" })).rejects.toThrow(/unscoped/i);
    expect(f.tableRows("inferencePhysicalIntents")).toHaveLength(0);
  });

  it.each(["missing", "corrupted"])("rejects %s receipt snapshots instead of inventing canonical IDs", async kind => {
    const f = await persistedChain();
    const first = await f.persist(1); await f.claim(first.intentId);
    const receipt = await f.receipt(first.intentId, true);
    const row = (await f.db.get(receipt.receiptId))!;
    await f.db.patch(row._id, { immutableSnapshot: kind === "missing" ? undefined : { ...row.immutableSnapshot as object, receiptId: "wrong" } });
    await expect(f.invoke(createOutcomeProjection, { workflowRunId: "attempt", cohortDigest: sha("a"),
      routeDigest: f.route.routeDigest })).rejects.toThrow(/snapshot/i);
    expect(f.tableRows("factoryOutcomeProjections")).toHaveLength(0);
  });

  it("isolates a new cohort from unrelated historical projections without snapshots", async () => {
    const f = await persistedChain();
    const first = await f.persist(1); await f.claim(first.intentId); await f.receipt(first.intentId, true);
    const old = await f.invoke<{ projectionId: string }>(createOutcomeProjection, {
      workflowRunId: "attempt", cohortDigest: sha("a"), routeDigest: f.route.routeDigest });
    await f.db.patch(old.projectionId, { immutableSnapshot: undefined });
    await f.invoke(createOutcomeProjection, { workflowRunId: "attempt", cohortDigest: sha("b"), routeDigest: f.route.routeDigest });
    await expect(f.invoke(freezeRouteComparison, { projectId: "project", leftRouteDigest: f.route.routeDigest,
      rightRouteDigest: f.fallback.routeDigest, cohortDigest: sha("b"), minimumSampleSize: 1,
      maximumAgeMs: 1000 })).resolves.toMatchObject({ status: "NO_GO", automaticPromotionAuthorized: false });
    expect(f.tableRows("inferenceRouteComparisons")).toHaveLength(1);
  });

  it("denies route comparison when a legacy projection lacks a canonical snapshot", async () => {
    const f = await persistedChain();
    const first = await f.persist(1); await f.claim(first.intentId); await f.receipt(first.intentId, true);
    const result = await f.invoke<{ projectionId: string }>(createOutcomeProjection, {
      workflowRunId: "attempt", cohortDigest: sha("a"), routeDigest: f.route.routeDigest });
    await f.db.patch(result.projectionId, { immutableSnapshot: undefined });
    await expect(f.invoke(freezeRouteComparison, { projectId: "project", leftRouteDigest: f.route.routeDigest,
      rightRouteDigest: f.fallback.routeDigest, cohortDigest: sha("a"), minimumSampleSize: 1,
      maximumAgeMs: 1000 })).rejects.toThrow(/snapshot/i);
    expect(f.tableRows("inferenceRouteComparisons")).toHaveLength(0);
  });
});
