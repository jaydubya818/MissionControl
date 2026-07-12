/**
 * Evaluation scoring, lift, and regression math (Software Factory Epic 5).
 *
 * Pure functions only — no Convex imports — so the two-tier scoring model
 * is unit testable and reusable from queries, mutations, and the CLI.
 *
 * SCORING MODEL (mirrors the skill-lint cap-then-deduct spirit,
 * packages/context-tools/src/skillLint.ts): a run's score is the
 * weight-normalized mean of its per-criterion scores (each 0–100), but a
 * failed REQUIRED criterion caps the whole run at
 * REQUIRED_FAILURE_SCORE_CAP — a run that misses a hard requirement can
 * never look healthy no matter how well the soft criteria scored.
 *
 * STATISTICS HONESTY: computeLift returns null for stddev when an arm has
 * fewer than 2 trials, and null means/lift when an arm has no trials. No
 * fabricated statistics below the sample size that supports them.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CriterionSpec {
  /** Stable identifier — the evaluationCriteria row id as a string. */
  criterionId: string;
  /** Relative weight (> 0); normalized across the scenario's criteria. */
  weight: number;
  /** Failing a required criterion caps the run score. */
  required: boolean;
}

export interface CriterionResult {
  criterionId: string;
  /** 0–100; clamped into range before aggregation. */
  score: number;
  passed: boolean;
  evidence?: string;
}

export interface LiftResult {
  baselineMean: number | null;
  candidateMean: number | null;
  /** candidateMean - baselineMean (points); null unless both means exist. */
  lift: number | null;
  /** Sample stddev; null when the arm has fewer than 2 trials. */
  baselineStddev: number | null;
  candidateStddev: number | null;
  trials: { baseline: number; candidate: number };
}

export interface RegressionArmSummary {
  /** Aggregate (mean) score for the arm, 0–100. */
  score: number;
  costUsd?: number;
  durationMs?: number;
  /** Ids of REQUIRED criteria that failed in this arm (any trial). */
  requiredCriterionFailures?: string[];
}

export interface RegressionThresholds {
  /** Flag when candidate score drops more than this many points. */
  maxScoreDropPoints: number;
  /** Flag when candidate cost grows more than this percent over baseline. */
  maxCostIncreasePct: number;
  /** Flag when candidate duration grows more than this percent. */
  maxDurationIncreasePct: number;
}

export type RegressionFlag =
  | "SCORE_DROP"
  | "COST_INCREASE"
  | "DURATION_INCREASE"
  | "REQUIRED_CRITERION_REGRESSION";

export type Recommendation = "APPROVE" | "BLOCK" | "NEUTRAL" | "NEEDS_REVIEW";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Ceiling applied to a run's weighted score when any REQUIRED criterion
 * failed. 40 matches the skill-lint structural cap so both tiers of the
 * scoring model share one "hard requirement missed" signal.
 */
export const REQUIRED_FAILURE_SCORE_CAP = 40;

export const DEFAULT_REGRESSION_THRESHOLDS: RegressionThresholds = {
  maxScoreDropPoints: 5,
  maxCostIncreasePct: 20,
  maxDurationIncreasePct: 25,
};

/** Minimum lift (points) for an APPROVE recommendation. */
export const APPROVE_LIFT_THRESHOLD = 5;

// ---------------------------------------------------------------------------
// Weighted scoring
// ---------------------------------------------------------------------------

function clampScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  return Math.min(100, Math.max(0, score));
}

/**
 * Weight-normalized aggregate score for one run, 0–100.
 *
 * - Weights need not sum to 1; they are normalized over ALL criteria.
 * - A criterion with no result contributes 0 and, when required, counts
 *   as failed — silence about a requirement is failure, not a pass.
 * - Any failed/missing REQUIRED criterion caps the result at
 *   `requiredFailureCap` (default REQUIRED_FAILURE_SCORE_CAP).
 * - Empty criteria list scores 0 (nothing measured, nothing earned).
 *
 * Throws on non-positive weights — validate at criterion creation time.
 */
export function computeWeightedScore(
  criteria: CriterionSpec[],
  results: CriterionResult[],
  requiredFailureCap: number = REQUIRED_FAILURE_SCORE_CAP
): number {
  if (criteria.length === 0) return 0;

  let totalWeight = 0;
  for (const criterion of criteria) {
    if (!(criterion.weight > 0)) {
      throw new Error(
        `Criterion "${criterion.criterionId}" has non-positive weight ${criterion.weight}`
      );
    }
    totalWeight += criterion.weight;
  }

  const resultById = new Map(results.map((r) => [r.criterionId, r]));

  let weightedSum = 0;
  let requiredFailure = false;
  for (const criterion of criteria) {
    const result = resultById.get(criterion.criterionId);
    if (result === undefined) {
      if (criterion.required) requiredFailure = true;
      continue; // contributes 0
    }
    weightedSum += clampScore(result.score) * criterion.weight;
    if (criterion.required && !result.passed) requiredFailure = true;
  }

  const score = weightedSum / totalWeight;
  return requiredFailure ? Math.min(score, requiredFailureCap) : score;
}

// ---------------------------------------------------------------------------
// Lift
// ---------------------------------------------------------------------------

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Sample standard deviation (n-1 denominator); null when n < 2. */
function sampleStddev(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values) as number;
  const variance =
    values.reduce((sum, value) => sum + (value - m) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Context lift: candidate mean minus baseline mean, with per-arm means and
 * sample stddevs. Stddev is null below 2 trials and means are null for
 * empty arms — no fake statistics.
 */
export function computeLift(
  baselineScores: number[],
  candidateScores: number[]
): LiftResult {
  const baselineMean = mean(baselineScores);
  const candidateMean = mean(candidateScores);
  return {
    baselineMean,
    candidateMean,
    lift:
      baselineMean !== null && candidateMean !== null
        ? candidateMean - baselineMean
        : null,
    baselineStddev: sampleStddev(baselineScores),
    candidateStddev: sampleStddev(candidateScores),
    trials: {
      baseline: baselineScores.length,
      candidate: candidateScores.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Regression detection
// ---------------------------------------------------------------------------

function pctIncrease(baseline: number, candidate: number): number | null {
  if (baseline <= 0) return null; // no meaningful percentage from zero
  return ((candidate - baseline) / baseline) * 100;
}

/**
 * Compare arm summaries and return the regression flags that fired:
 *
 * - SCORE_DROP: candidate score fell more than maxScoreDropPoints.
 * - COST_INCREASE: candidate cost grew more than maxCostIncreasePct
 *   (only when both arms report a cost and baseline cost > 0).
 * - DURATION_INCREASE: same, for durationMs.
 * - REQUIRED_CRITERION_REGRESSION: a required criterion the baseline
 *   passed now fails in the candidate arm.
 */
export function detectRegressions(
  baseline: RegressionArmSummary,
  candidate: RegressionArmSummary,
  thresholds: RegressionThresholds = DEFAULT_REGRESSION_THRESHOLDS
): RegressionFlag[] {
  const flags: RegressionFlag[] = [];

  if (baseline.score - candidate.score > thresholds.maxScoreDropPoints) {
    flags.push("SCORE_DROP");
  }

  if (baseline.costUsd !== undefined && candidate.costUsd !== undefined) {
    const increase = pctIncrease(baseline.costUsd, candidate.costUsd);
    if (increase !== null && increase > thresholds.maxCostIncreasePct) {
      flags.push("COST_INCREASE");
    }
  }

  if (
    baseline.durationMs !== undefined &&
    candidate.durationMs !== undefined
  ) {
    const increase = pctIncrease(baseline.durationMs, candidate.durationMs);
    if (increase !== null && increase > thresholds.maxDurationIncreasePct) {
      flags.push("DURATION_INCREASE");
    }
  }

  const baselineFailures = new Set(baseline.requiredCriterionFailures ?? []);
  const newFailures = (candidate.requiredCriterionFailures ?? []).filter(
    (id) => !baselineFailures.has(id)
  );
  if (newFailures.length > 0) {
    flags.push("REQUIRED_CRITERION_REGRESSION");
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Recommendation
// ---------------------------------------------------------------------------

/**
 * Map lift + regression flags to a recommendation:
 *
 * | Condition                                            | Recommendation |
 * |------------------------------------------------------|----------------|
 * | REQUIRED_CRITERION_REGRESSION or SCORE_DROP fired    | BLOCK          |
 * | lift is null (an arm had no scored trials)           | NEEDS_REVIEW   |
 * | other flags fired (cost/duration)                    | NEEDS_REVIEW   |
 * | no flags, lift >= APPROVE_LIFT_THRESHOLD             | APPROVE        |
 * | no flags, lift below threshold                       | NEUTRAL        |
 */
export function recommendationFor(
  lift: number | null,
  regressionFlags: RegressionFlag[]
): Recommendation {
  if (
    regressionFlags.includes("REQUIRED_CRITERION_REGRESSION") ||
    regressionFlags.includes("SCORE_DROP")
  ) {
    return "BLOCK";
  }
  if (lift === null) return "NEEDS_REVIEW";
  if (regressionFlags.length > 0) return "NEEDS_REVIEW";
  if (lift >= APPROVE_LIFT_THRESHOLD) return "APPROVE";
  return "NEUTRAL";
}
