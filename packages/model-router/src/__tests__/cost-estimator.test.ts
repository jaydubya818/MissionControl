import { describe, expect, it } from "vitest";
import { CostEstimator } from "../cost-estimator";
import type { ModelConfig } from "../types";

const MODEL: ModelConfig = {
  id: "cache-test",
  provider: "anthropic",
  tier: "standard",
  displayName: "Cache pricing test model",
  maxTokens: 4_000,
  inputCostPer1k: 0.003,
  outputCostPer1k: 0.015,
  contextWindow: 100_000,
  supportsVision: false,
  supportsTools: true,
};

describe("CostEstimator.calculateCost", () => {
  it("bills input and output separately when no cache tokens are involved", () => {
    const result = new CostEstimator().calculateCost(MODEL, 10_000, 2_000);

    expect(result.inputCost).toBeCloseTo(0.03, 10);
    expect(result.outputCost).toBeCloseTo(0.03, 10);
    expect(result.cacheSavings).toBe(0);
    expect(result.totalCost).toBeCloseTo(0.06, 10);
  });

  it("bills cache reads at 10% of the input rate and reports the 90% saved", () => {
    const result = new CostEstimator().calculateCost(MODEL, 0, 0, 10_000);

    // 10k cache-read tokens at 0.003/1k => 0.03 undiscounted.
    expect(result.totalCost).toBeCloseTo(0.003, 10);
    expect(result.cacheSavings).toBeCloseTo(0.027, 10);
    // Savings are reported for accounting only; they are not netted off the total.
    expect(result.totalCost + result.cacheSavings).toBeCloseTo(0.03, 10);
  });

  it("bills cache writes at a 25% premium over the input rate", () => {
    const result = new CostEstimator().calculateCost(MODEL, 0, 0, undefined, 10_000);

    expect(result.totalCost).toBeCloseTo(0.0375, 10);
    // A cache write earns no savings on the request that pays for it.
    expect(result.cacheSavings).toBe(0);
  });

  it("sums every component for a request that reads and writes cache", () => {
    const result = new CostEstimator().calculateCost(MODEL, 10_000, 2_000, 10_000, 10_000);

    expect(result.inputCost).toBeCloseTo(0.03, 10);
    expect(result.outputCost).toBeCloseTo(0.03, 10);
    expect(result.cacheSavings).toBeCloseTo(0.027, 10);
    expect(result.totalCost).toBeCloseTo(0.03 + 0.03 + 0.003 + 0.0375, 10);
  });

  it("treats zero cache tokens the same as absent cache tokens", () => {
    const estimator = new CostEstimator();

    expect(estimator.calculateCost(MODEL, 1_000, 1_000, 0, 0)).toEqual(
      estimator.calculateCost(MODEL, 1_000, 1_000),
    );
  });

  it("keeps inputCost and outputCost free of cache costs so they can be reported separately", () => {
    const withCache = new CostEstimator().calculateCost(MODEL, 1_000, 1_000, 5_000, 5_000);
    const withoutCache = new CostEstimator().calculateCost(MODEL, 1_000, 1_000);

    expect(withCache.inputCost).toBe(withoutCache.inputCost);
    expect(withCache.outputCost).toBe(withoutCache.outputCost);
    expect(withCache.totalCost).toBeGreaterThan(withoutCache.totalCost);
  });
});
