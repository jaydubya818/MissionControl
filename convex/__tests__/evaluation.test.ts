import { describe, expect, it } from "vitest";
import {
  APPROVE_LIFT_THRESHOLD,
  computeLift,
  computeWeightedScore,
  DEFAULT_REGRESSION_THRESHOLDS,
  detectRegressions,
  recommendationFor,
  REQUIRED_FAILURE_SCORE_CAP,
  type CriterionResult,
  type CriterionSpec,
  type RegressionArmSummary,
} from "../lib/evaluation";

function criterion(
  criterionId: string,
  weight = 1,
  required = false
): CriterionSpec {
  return { criterionId, weight, required };
}

function result(
  criterionId: string,
  score: number,
  passed = true
): CriterionResult {
  return { criterionId, score, passed };
}

function arm(overrides: Partial<RegressionArmSummary> = {}): RegressionArmSummary {
  return { score: 80, ...overrides };
}

// ---------------------------------------------------------------------------
// computeWeightedScore
// ---------------------------------------------------------------------------

describe("computeWeightedScore", () => {
  it("returns the plain mean for equal weights", () => {
    const criteria = [criterion("a"), criterion("b")];
    const results = [result("a", 100), result("b", 50)];
    expect(computeWeightedScore(criteria, results)).toBe(75);
  });

  it("normalizes weights that do not sum to 1", () => {
    // 3:1 weighting -> (100*3 + 60*1) / 4 = 90
    const criteria = [criterion("a", 3), criterion("b", 1)];
    const results = [result("a", 100), result("b", 60)];
    expect(computeWeightedScore(criteria, results)).toBe(90);
  });

  it("produces identical scores for proportionally scaled weights", () => {
    const results = [result("a", 90), result("b", 40)];
    const small = computeWeightedScore(
      [criterion("a", 0.6), criterion("b", 0.4)],
      results
    );
    const large = computeWeightedScore(
      [criterion("a", 60), criterion("b", 40)],
      results
    );
    expect(small).toBeCloseTo(large, 10);
  });

  it("caps the score when a required criterion fails", () => {
    const criteria = [criterion("req", 1, true), criterion("soft", 9)];
    const results = [result("req", 0, false), result("soft", 100)];
    // Uncapped would be 90; required failure caps at 40.
    expect(computeWeightedScore(criteria, results)).toBe(
      REQUIRED_FAILURE_SCORE_CAP
    );
  });

  it("does not raise a score already below the cap", () => {
    const criteria = [criterion("req", 1, true), criterion("soft", 1)];
    const results = [result("req", 0, false), result("soft", 20)];
    expect(computeWeightedScore(criteria, results)).toBe(10);
  });

  it("honors a custom required-failure cap", () => {
    const criteria = [criterion("req", 1, true), criterion("soft", 9)];
    const results = [result("req", 0, false), result("soft", 100)];
    expect(computeWeightedScore(criteria, results, 25)).toBe(25);
  });

  it("does not cap when a non-required criterion fails", () => {
    const criteria = [criterion("opt", 1, false), criterion("soft", 9)];
    const results = [result("opt", 0, false), result("soft", 100)];
    expect(computeWeightedScore(criteria, results)).toBe(90);
  });

  it("treats a missing result as zero contribution", () => {
    const criteria = [criterion("a"), criterion("b")];
    const results = [result("a", 100)];
    expect(computeWeightedScore(criteria, results)).toBe(50);
  });

  it("treats a missing required result as a required failure", () => {
    const criteria = [criterion("req", 1, true), criterion("soft", 1)];
    const results = [result("soft", 100)];
    expect(computeWeightedScore(criteria, results)).toBe(
      REQUIRED_FAILURE_SCORE_CAP
    );
  });

  it("returns 0 for an empty criteria list", () => {
    expect(computeWeightedScore([], [])).toBe(0);
    expect(computeWeightedScore([], [result("ghost", 100)])).toBe(0);
  });

  it("returns 0 for empty results", () => {
    expect(computeWeightedScore([criterion("a")], [])).toBe(0);
  });

  it("clamps out-of-range criterion scores into 0-100", () => {
    const criteria = [criterion("a"), criterion("b")];
    expect(
      computeWeightedScore(criteria, [result("a", 150), result("b", -50)])
    ).toBe(50);
  });

  it("ignores results for unknown criterion ids", () => {
    const criteria = [criterion("a")];
    const results = [result("a", 80), result("ghost", 100)];
    expect(computeWeightedScore(criteria, results)).toBe(80);
  });

  it("throws on non-positive weights", () => {
    expect(() =>
      computeWeightedScore([criterion("a", 0)], [result("a", 100)])
    ).toThrow(/non-positive weight/);
    expect(() =>
      computeWeightedScore([criterion("a", -1)], [result("a", 100)])
    ).toThrow(/non-positive weight/);
  });
});

// ---------------------------------------------------------------------------
// computeLift
// ---------------------------------------------------------------------------

describe("computeLift", () => {
  it("computes means and lift for single trials without stddev", () => {
    const lift = computeLift([70], [82]);
    expect(lift.baselineMean).toBe(70);
    expect(lift.candidateMean).toBe(82);
    expect(lift.lift).toBe(12);
    // No fake statistics below n=2.
    expect(lift.baselineStddev).toBeNull();
    expect(lift.candidateStddev).toBeNull();
    expect(lift.trials).toEqual({ baseline: 1, candidate: 1 });
  });

  it("computes multi-trial means and sample stddev", () => {
    const lift = computeLift([60, 80], [85, 95, 90]);
    expect(lift.baselineMean).toBe(70);
    expect(lift.candidateMean).toBe(90);
    expect(lift.lift).toBe(20);
    // Sample stddev of [60, 80] is sqrt(200) ≈ 14.142
    expect(lift.baselineStddev).toBeCloseTo(14.1421, 3);
    // Sample stddev of [85, 95, 90] is 5
    expect(lift.candidateStddev).toBeCloseTo(5, 10);
    expect(lift.trials).toEqual({ baseline: 2, candidate: 3 });
  });

  it("returns null lift when the baseline arm is empty", () => {
    const lift = computeLift([], [90]);
    expect(lift.baselineMean).toBeNull();
    expect(lift.candidateMean).toBe(90);
    expect(lift.lift).toBeNull();
    expect(lift.trials).toEqual({ baseline: 0, candidate: 1 });
  });

  it("returns null lift when the candidate arm is empty", () => {
    const lift = computeLift([75], []);
    expect(lift.candidateMean).toBeNull();
    expect(lift.lift).toBeNull();
  });

  it("supports negative lift", () => {
    const lift = computeLift([90, 90], [70, 70]);
    expect(lift.lift).toBe(-20);
    expect(lift.baselineStddev).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// detectRegressions
// ---------------------------------------------------------------------------

describe("detectRegressions", () => {
  it("returns no flags when the candidate improves everywhere", () => {
    const flags = detectRegressions(
      arm({ score: 70, costUsd: 2, durationMs: 60_000 }),
      arm({ score: 85, costUsd: 1.5, durationMs: 50_000 })
    );
    expect(flags).toEqual([]);
  });

  it("flags SCORE_DROP beyond the threshold", () => {
    const flags = detectRegressions(arm({ score: 80 }), arm({ score: 70 }));
    expect(flags).toContain("SCORE_DROP");
  });

  it("does not flag a drop at or below the threshold", () => {
    const drop = DEFAULT_REGRESSION_THRESHOLDS.maxScoreDropPoints;
    expect(
      detectRegressions(arm({ score: 80 }), arm({ score: 80 - drop }))
    ).toEqual([]);
  });

  it("flags COST_INCREASE beyond the percentage threshold", () => {
    // +50% > 20% default
    const flags = detectRegressions(
      arm({ costUsd: 2 }),
      arm({ costUsd: 3 })
    );
    expect(flags).toEqual(["COST_INCREASE"]);
  });

  it("does not flag cost when either arm lacks cost data", () => {
    expect(detectRegressions(arm({}), arm({ costUsd: 100 }))).toEqual([]);
    expect(detectRegressions(arm({ costUsd: 1 }), arm({}))).toEqual([]);
  });

  it("does not flag cost when the baseline cost is zero", () => {
    // No meaningful percentage from a zero baseline.
    expect(detectRegressions(arm({ costUsd: 0 }), arm({ costUsd: 5 }))).toEqual(
      []
    );
  });

  it("flags DURATION_INCREASE beyond the percentage threshold", () => {
    // +100% > 25% default
    const flags = detectRegressions(
      arm({ durationMs: 30_000 }),
      arm({ durationMs: 60_000 })
    );
    expect(flags).toEqual(["DURATION_INCREASE"]);
  });

  it("flags REQUIRED_CRITERION_REGRESSION for a newly failed required criterion", () => {
    const flags = detectRegressions(
      arm({ requiredCriterionFailures: [] }),
      arm({ requiredCriterionFailures: ["crit-1"] })
    );
    expect(flags).toEqual(["REQUIRED_CRITERION_REGRESSION"]);
  });

  it("does not flag required failures already present in the baseline", () => {
    const flags = detectRegressions(
      arm({ requiredCriterionFailures: ["crit-1"] }),
      arm({ requiredCriterionFailures: ["crit-1"] })
    );
    expect(flags).toEqual([]);
  });

  it("accumulates multiple flags", () => {
    const flags = detectRegressions(
      arm({
        score: 90,
        costUsd: 1,
        durationMs: 10_000,
        requiredCriterionFailures: [],
      }),
      arm({
        score: 50,
        costUsd: 2,
        durationMs: 30_000,
        requiredCriterionFailures: ["crit-1"],
      })
    );
    expect(flags).toEqual([
      "SCORE_DROP",
      "COST_INCREASE",
      "DURATION_INCREASE",
      "REQUIRED_CRITERION_REGRESSION",
    ]);
  });

  it("honors custom thresholds", () => {
    const flags = detectRegressions(
      arm({ score: 80, costUsd: 1 }),
      arm({ score: 78, costUsd: 1.05 }),
      {
        maxScoreDropPoints: 1,
        maxCostIncreasePct: 4,
        maxDurationIncreasePct: 25,
      }
    );
    expect(flags).toEqual(["SCORE_DROP", "COST_INCREASE"]);
  });
});

// ---------------------------------------------------------------------------
// recommendationFor
// ---------------------------------------------------------------------------

describe("recommendationFor", () => {
  it("BLOCKs on required-criterion regression regardless of lift", () => {
    expect(recommendationFor(50, ["REQUIRED_CRITERION_REGRESSION"])).toBe(
      "BLOCK"
    );
  });

  it("BLOCKs on score drop", () => {
    expect(recommendationFor(-10, ["SCORE_DROP"])).toBe("BLOCK");
  });

  it("needs review when lift is unknown", () => {
    expect(recommendationFor(null, [])).toBe("NEEDS_REVIEW");
  });

  it("needs review on cost/duration flags even with positive lift", () => {
    expect(recommendationFor(15, ["COST_INCREASE"])).toBe("NEEDS_REVIEW");
    expect(recommendationFor(15, ["DURATION_INCREASE"])).toBe("NEEDS_REVIEW");
  });

  it("APPROVEs clean lift at or above the threshold", () => {
    expect(recommendationFor(APPROVE_LIFT_THRESHOLD, [])).toBe("APPROVE");
    expect(recommendationFor(30, [])).toBe("APPROVE");
  });

  it("is NEUTRAL for clean lift below the threshold", () => {
    expect(recommendationFor(APPROVE_LIFT_THRESHOLD - 0.1, [])).toBe(
      "NEUTRAL"
    );
    expect(recommendationFor(0, [])).toBe("NEUTRAL");
    expect(recommendationFor(-2, [])).toBe("NEUTRAL");
  });
});
