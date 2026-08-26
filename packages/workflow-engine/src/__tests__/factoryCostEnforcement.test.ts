import { describe, expect, it } from "vitest";
import {
  assessFactoryCostEnforcement,
  observedFactoryCostWithinBound,
} from "../factoryCostEnforcement";

describe("Factory cost enforcement", () => {
  it("keeps unknown-cost persistent adapters local-only", () => {
    expect(assessFactoryCostEnforcement({
      deploymentClass: "local",
      executionBackend: "persistent-worker",
      maxCostUsd: 3,
      maxAttempts: 2,
    })).toMatchObject({ allowed: true, enforcement: "LOCAL_DEMO_ONLY" });
    expect(assessFactoryCostEnforcement({
      deploymentClass: "production",
      executionBackend: "persistent-worker",
      maxCostUsd: 3,
      maxAttempts: 2,
    })).toEqual({ allowed: false, reason: "persistent-worker-cost-cap-unavailable" });
    expect(assessFactoryCostEnforcement({
      deploymentClass: undefined,
      executionBackend: "persistent-worker",
      maxCostUsd: 3,
      maxAttempts: 2,
    })).toEqual({ allowed: false, reason: "persistent-worker-cost-cap-unavailable" });
  });

  it("requires aggregate provider-key caps to fit the Factory budget", () => {
    expect(assessFactoryCostEnforcement({
      deploymentClass: "production",
      executionBackend: "remote-sandbox",
      maxCostUsd: 3,
      maxAttempts: 3,
      sandboxSpend: { maxUsd: 1, enforcement: "PROVIDER_KEY_LIMIT" },
    })).toMatchObject({ allowed: true, enforcement: "PROVIDER_KEY_LIMIT", perAttemptLimitUsd: 1 });
    expect(assessFactoryCostEnforcement({
      deploymentClass: "production",
      executionBackend: "remote-sandbox",
      maxCostUsd: 2,
      maxAttempts: 3,
      sandboxSpend: { maxUsd: 1, enforcement: "PROVIDER_KEY_LIMIT" },
    })).toEqual({ allowed: false, reason: "aggregate-provider-cap-exceeds-budget" });
    expect(assessFactoryCostEnforcement({
      deploymentClass: "production",
      executionBackend: "remote-sandbox",
      maxCostUsd: 3,
      maxAttempts: 3,
      sandboxSpend: { maxUsd: 1, enforcement: "OBSERVATION_ONLY" },
    })).toEqual({ allowed: false, reason: "provider-key-limit-required" });
  });

  it("fails closed when observed spend exceeds the hard Attempt cap", () => {
    expect(observedFactoryCostWithinBound({ observedCostUsd: null, enforcedLimitUsd: 1 }))
      .toMatchObject({ allowed: true, telemetry: "UNKNOWN_ALLOWED_BY_HARD_CAP" });
    expect(observedFactoryCostWithinBound({ observedCostUsd: 0.4, enforcedLimitUsd: 1 }))
      .toMatchObject({ allowed: true, telemetry: "OBSERVED_WITHIN_HARD_CAP" });
    expect(observedFactoryCostWithinBound({ observedCostUsd: 1.01, enforcedLimitUsd: 1 }))
      .toEqual({ allowed: false, reason: "budget-exceeded" });
  });
});
