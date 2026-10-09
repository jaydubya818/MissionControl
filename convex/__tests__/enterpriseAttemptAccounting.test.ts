import { describe, expect, it } from "vitest";
import { attemptExposure, microusd, reservationDigest, scopeExposure, type EnterpriseReservation } from "../lib/enterpriseAttemptAccounting";
import { computeCanonicalHash } from "../lib/genomeHash";
import { persistIntentInTransaction, claimIntentInTransaction } from "../inferenceGateway";

function run() {
  const body: Omit<EnterpriseReservation, "digest"> = {
    schema: "enterprise-attempt-reservation/v1", tenantId: "tenant", projectId: "project", ownerId: "owner",
    missionId: "mission", workOrderId: "wo", workOrderRevisionId: "revision", workOrderRevisionNumber: 1,
    attemptId: "run", delegationId: "delegation", factoryId: "factory", factoryVersion: "version",
    provider: "local-docker", modelPolicyDigest: "model", executionProfileDigest: "profile", bindingDigest: "binding",
    idempotencyKey: "delegation", ceilingMicrousd: 80, authorizedAt: 1000, expiresAt: 2000,
    missionCeilingMicrousd: 100, workOrderCeilingMicrousd: 100, dailyCeilingMicrousd: 100, policyCeilingMicrousd: 100,
  };
  return { runId: "run", tenantId: "tenant", projectId: "project", missionId: "mission", workOrderId: "wo", workOrderRevisionId: "revision",
    status: "RUNNING", reservedCostUsd: 0, spentUsd: 0, executionCostAuthorization: { enterprise: { ...body, digest: reservationDigest(body) } } } as any;
}
describe("canonical enterprise Attempt accounting", () => {
  it("keeps immutable exposure through terminal states, counters being cleared and daily rollover", () => {
    for (const status of ["COMPLETED", "FAILED", "CANCELED", "PENDING"]) {
      const attempt = { ...run(), status };
      expect(attemptExposure(attempt, 864000000)).toBe(80);
      expect(scopeExposure([attempt, attempt], 864000000)).toBe(160);
    }
  });
  it("rejects modified authority and unsupported settlement facts", () => {
    const attempt = run();
    attempt.executionCostAuthorization.enterprise.ceilingMicrousd = 0;
    expect(() => attemptExposure(attempt)).toThrow();
    for (const patch of [{ reservationDigest: "other" }, { chargedMicrousd: 1 }, { basis: "ZERO_PAID_CALLS" }, { settledAt: 0 }]) {
      const attempt = run();
      const body = { reservationDigest: attempt.executionCostAuthorization.enterprise.digest, proofDigest: "proof", settledAt: 3000,
        chargedMicrousd: 0, basis: "PROVEN_NOT_DISPATCHED", ...patch };
      attempt.enterpriseSettlement = { ...body, digest: computeCanonicalHash(body) };
      expect(() => attemptExposure(attempt)).toThrow();
    }
  });
  it("releases proven-unused allowance without mutating frozen reservation", () => {
    const attempt = run(), original = structuredClone(attempt.executionCostAuthorization);
    const body = { reservationDigest: original.enterprise.digest, proofDigest: "proof", settledAt: 3000,
      chargedMicrousd: 0, basis: "PROVEN_NOT_DISPATCHED" };
    attempt.enterpriseSettlement = { ...body, digest: computeCanonicalHash(body) };
    expect(attemptExposure(attempt)).toBe(0);
    expect(attempt.executionCostAuthorization).toEqual(original);
  });
  it("uses exact microusd and fails closed on invalid or unknown legacy money", () => {
    expect(microusd(0.00008)).toBe(80);
    expect(microusd(0.1 + 0.2)).toBe(300000);
    for (const invalid of [NaN, Infinity, -1, 0.0000001, Number.MAX_SAFE_INTEGER]) expect(() => microusd(invalid)).toThrow();
    expect(() => attemptExposure({ status: "COMPLETED" })).toThrow();
    expect(() => attemptExposure({ reservedCostUsd: 0.00004, spentUsd: 0.00006, startedAt: 1 }, 864000000)).toThrow("LEGACY_AUTHORITY_UNQUALIFIED");
  });
  it("counts an imported verifier only under its exact parent reservation", () => {
    const parent = { ...run(), _id: "parent" };
    const child = { ...parent, _id: "child", runId: "observation", status: "COMPLETED", attemptPurpose: "VERIFICATION",
      executionCostAuthorization: undefined, verificationAttemptBinding: { sourceAttemptId: "parent" },
      metadata: { signedFactoryResultDigest: "sha256:" + "a".repeat(64) },
      enterpriseAccountingParent: { workflowRunId: "parent", reservationDigest: parent.executionCostAuthorization.enterprise.digest,
        bindingDigest: "binding", resultDigest: "sha256:" + "a".repeat(64) } };
    expect(scopeExposure([parent, child])).toBe(80);
    for (const patch of [{ tenantId: "other" }, { status: "PENDING" }, { spentUsd: 1 }, { lease: {} },
      { executionCostAuthorization: parent.executionCostAuthorization }, { verificationAttemptBinding: { sourceAttemptId: "wrong" } }]) {
      expect(() => scopeExposure([parent, { ...child, ...patch }])).toThrow("ENTERPRISE_ACCOUNTING_PARENT_INVALID");
    }
    expect(() => scopeExposure([child])).toThrow("ENTERPRISE_ACCOUNTING_PARENT_INVALID");
  });
  it("fences preexisting inference send authority even with the qualification environment disabled", async () => {
    const rows: Record<string, any> = {
      project: { enterpriseAccountingMode: "ISOLATED_DETERMINISTIC" },
      reservation: { workflowRunId: "run", state: "ACTIVE", projectId: "project", workOrderId: "wo" },
      intent: { workflowRunId: "run", state: "PERSISTED", reservationId: "reservation" },
      run: { _id: "run" }, wo: {},
    };
    const ctx = { db: { get: async (id: string) => rows[id] } } as any;
    await expect(persistIntentInTransaction(ctx, { reservationId: "reservation", workflowRunId: "run" } as any))
      .rejects.toThrow("ENTERPRISE_PAID_AUTHORITY_NOT_QUALIFIED");
    await expect(claimIntentInTransaction(ctx, { intentId: "intent", workflowRunId: "run" } as any))
      .rejects.toThrow("ENTERPRISE_PAID_AUTHORITY_NOT_QUALIFIED");
  });
});
