import { describe, expect, it } from "vitest";
import { offlineAttemptBudget, offlineAttemptClaimWindowExpired } from "../lib/offlineAttemptBudget";

const input = () => ({ runId: "attempt-1", factoryConfigurationDigest: "factory-v1-12345678", executionProfileDigest: `sha256:${"b".repeat(64)}`,
  factoryBudget: { maxCostUsd: 2, maxAttempts: 3, maxRuntimeMinutes: 1 }, approvedWorkOrderCapUsd: 6,
  missionBudgetRemainingUsd: 6, policyBudgetRemainingUsd: 6, priorAttempts: [] as any[], now: 1000 });

describe("offline Attempt resource authority", () => {
  it("expires only an unleased PENDING Attempt after its frozen claim window", () => {
    expect(offlineAttemptClaimWindowExpired({
      status: "PENDING", startedAt: 1_000, maxTotalWallClockMs: 60_000,
    }, 61_001)).toBe(true);
    expect(offlineAttemptClaimWindowExpired({
      status: "PENDING", startedAt: 1_000, maxTotalWallClockMs: 60_000,
    }, 61_000)).toBe(false);
    expect(offlineAttemptClaimWindowExpired({
      status: "PENDING", startedAt: 1_000, maxTotalWallClockMs: 60_000, lease: { leaseId: "claimed" },
    }, 61_001)).toBe(false);
    expect(offlineAttemptClaimWindowExpired({
      status: "RUNNING", startedAt: 1_000, maxTotalWallClockMs: 60_000,
    }, 61_001)).toBe(false);
  });
  it("reserves full resource authority without a provider route or measured cost claim", () => {
    const result = offlineAttemptBudget(input());
    expect(result).toMatchObject({ reservationId: "attempt-1", reservedCostUsd: 2, hardLimitUsd: 2,
      maxProviderCalls: 0, maxProviderLiabilityUsd: 0, actualCost: { status: "UNAVAILABLE" } });
    expect(result).not.toHaveProperty("routeCostPolicyDigest");
    expect(offlineAttemptBudget({ ...input(), runId: "attempt-2" }).authorizationDigest).not.toBe(result.authorizationDigest);
  });
  it("retains unknown terminal reservations and rejects exhausted authority", () => {
    for (const status of ["RUNNING", "FAILED", "CANCELED", "COMPLETED"]) {
      const args = input();
      args.priorAttempts = [{ status, spentUsd: 0, reservedCostUsd: 5, executionCostAuthorization: { actualCost: { status: "UNAVAILABLE" } } }];
      expect(() => offlineAttemptBudget(args)).toThrow("exceeds remaining authority");
    }
  });
  it("does not release a reservation based on an unverified MEASURED label", () => {
    const args = input();
    args.priorAttempts = [{ status: "FAILED", spentUsd: 1, reservedCostUsd: 5, executionCostAuthorization: { actualCost: { status: "MEASURED", usd: 0 } } }];
    expect(() => offlineAttemptBudget(args)).toThrow();
    args.priorAttempts[0].status = "RUNNING";
    expect(() => offlineAttemptBudget(args)).toThrow();
  });
  it("requires all authority ceilings and rejects invalid or exhausted caps", () => {
    for (const key of ["approvedWorkOrderCapUsd", "missionBudgetRemainingUsd", "policyBudgetRemainingUsd"]) {
      for (const value of [undefined, NaN, Infinity, -1, 0, 1]) expect(() => offlineAttemptBudget({ ...input(), [key]: value } as any)).toThrow();
    }
    for (const factoryBudget of [{ maxCostUsd: 0, maxAttempts: 3, maxRuntimeMinutes: 1 },
      { maxCostUsd: 2, maxAttempts: 4, maxRuntimeMinutes: 1 }, { maxCostUsd: 2, maxAttempts: 3, maxRuntimeMinutes: 481 }]) {
      expect(() => offlineAttemptBudget({ ...input(), factoryBudget })).toThrow();
    }
    expect(() => offlineAttemptBudget({ ...input(), priorAttempts: [{}, {}, {}] as any })).toThrow();
    expect(() => offlineAttemptBudget({ ...input(), priorAttempts: [{ status: "FAILED" }] })).toThrow("unknown");
  });
});
