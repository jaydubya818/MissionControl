/**
 * Evaluation comparisons — baseline vs candidate verdicts (Epic 5).
 *
 * recordComparison is the write path the comparison pipeline (PR 9) calls
 * after both arms of a scenario have scored runs. It validates run
 * references, recomputes arm means/lift/deltas/regressions with the pure
 * math in lib/evaluation.ts, and stores an immutable verdict row —
 * comparisons are evidence and are never patched.
 *
 * Gated behind the `eval.framework` feature flag (lib/evalGate.ts) and
 * audited via `activities` (EVAL_COMPARISON_RECORDED).
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireEvalFrameworkEnabled } from "../lib/evalGate";
import {
  computeLift,
  detectRegressions,
  recommendationFor,
  DEFAULT_REGRESSION_THRESHOLDS,
  type RegressionArmSummary,
} from "../lib/evaluation";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const get = query({
  args: { comparisonId: v.id("evaluationComparisons") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.comparisonId);
  },
});

export const listByScenario = query({
  args: { scenarioId: v.id("evaluationScenarios") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("evaluationComparisons")
      .withIndex("by_scenario", (q) => q.eq("scenarioId", args.scenarioId))
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

interface RunDoc {
  _id: string;
  scenarioId: string;
  mode: "BASELINE" | "CANDIDATE";
  status: string;
  score?: number;
  costUsd?: number;
  turns?: number;
  durationMs?: number;
  criterionResults?: Array<{
    criterionId: string;
    score: number;
    passed: boolean;
  }>;
}

async function loadArm(
  ctx: { db: any },
  scenarioId: string,
  runIds: string[],
  expectedMode: "BASELINE" | "CANDIDATE"
): Promise<RunDoc[]> {
  if (runIds.length === 0) {
    throw new Error(`At least one ${expectedMode} run is required`);
  }
  const runs: RunDoc[] = [];
  for (const runId of runIds) {
    const run = (await ctx.db.get(runId)) as RunDoc | null;
    if (run === null) {
      throw new Error(`Evaluation run ${runId} not found`);
    }
    if (run.scenarioId !== scenarioId) {
      throw new Error(
        `Evaluation run ${runId} belongs to a different scenario`
      );
    }
    if (run.mode !== expectedMode) {
      throw new Error(
        `Evaluation run ${runId} has mode ${run.mode}, expected ${expectedMode}`
      );
    }
    if (run.status !== "SCORED" || run.score === undefined) {
      throw new Error(
        `Evaluation run ${runId} is not SCORED — only scored runs can be compared`
      );
    }
    runs.push(run);
  }
  return runs;
}

function armMean(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function optionalDelta(
  baseline: Array<number | undefined>,
  candidate: Array<number | undefined>
): number | undefined {
  const base = armMean(baseline.filter((n): n is number => n !== undefined));
  const cand = armMean(candidate.filter((n): n is number => n !== undefined));
  if (base === undefined || cand === undefined) return undefined;
  return cand - base;
}

/**
 * Required criteria that failed in ANY trial of the arm — conservative:
 * one failed trial marks the criterion failed for regression purposes.
 */
function requiredFailures(
  runs: RunDoc[],
  requiredIds: Set<string>
): string[] {
  const failed = new Set<string>();
  for (const run of runs) {
    for (const result of run.criterionResults ?? []) {
      if (requiredIds.has(result.criterionId) && !result.passed) {
        failed.add(result.criterionId);
      }
    }
  }
  return [...failed].sort();
}

export const recordComparison = mutation({
  args: {
    scenarioId: v.id("evaluationScenarios"),
    baselineRunIds: v.array(v.id("evaluationRuns")),
    candidateRunIds: v.array(v.id("evaluationRuns")),
    summary: v.optional(v.string()),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireEvalFrameworkEnabled(ctx, null);

    const scenario = await ctx.db.get(args.scenarioId);
    if (!scenario) {
      throw new Error("Scenario not found");
    }

    const baselineRuns = await loadArm(
      ctx,
      args.scenarioId,
      args.baselineRunIds,
      "BASELINE"
    );
    const candidateRuns = await loadArm(
      ctx,
      args.scenarioId,
      args.candidateRunIds,
      "CANDIDATE"
    );

    const lift = computeLift(
      baselineRuns.map((run) => run.score as number),
      candidateRuns.map((run) => run.score as number)
    );
    // Both arms are non-empty and scored, so means/lift are non-null here.
    const baselineScore = lift.baselineMean as number;
    const candidateScore = lift.candidateMean as number;
    const contextLift = lift.lift as number;

    const criteria = await ctx.db
      .query("evaluationCriteria")
      .withIndex("by_scenario", (q) => q.eq("scenarioId", args.scenarioId))
      .collect();
    const requiredIds = new Set<string>(
      criteria.filter((c) => c.required).map((c) => c._id as string)
    );

    const costDelta = optionalDelta(
      baselineRuns.map((run) => run.costUsd),
      candidateRuns.map((run) => run.costUsd)
    );
    const durationMsDelta = optionalDelta(
      baselineRuns.map((run) => run.durationMs),
      candidateRuns.map((run) => run.durationMs)
    );
    const turnDelta = optionalDelta(
      baselineRuns.map((run) => run.turns),
      candidateRuns.map((run) => run.turns)
    );

    const baselineArm: RegressionArmSummary = {
      score: baselineScore,
      costUsd: armMean(
        baselineRuns
          .map((run) => run.costUsd)
          .filter((n): n is number => n !== undefined)
      ),
      durationMs: armMean(
        baselineRuns
          .map((run) => run.durationMs)
          .filter((n): n is number => n !== undefined)
      ),
      requiredCriterionFailures: requiredFailures(baselineRuns, requiredIds),
    };
    const candidateArm: RegressionArmSummary = {
      score: candidateScore,
      costUsd: armMean(
        candidateRuns
          .map((run) => run.costUsd)
          .filter((n): n is number => n !== undefined)
      ),
      durationMs: armMean(
        candidateRuns
          .map((run) => run.durationMs)
          .filter((n): n is number => n !== undefined)
      ),
      requiredCriterionFailures: requiredFailures(candidateRuns, requiredIds),
    };

    const regressionFlags = detectRegressions(
      baselineArm,
      candidateArm,
      DEFAULT_REGRESSION_THRESHOLDS
    );
    const recommendation = recommendationFor(contextLift, regressionFlags);

    const comparisonId = await ctx.db.insert("evaluationComparisons", {
      scenarioId: args.scenarioId,
      baselineRunIds: args.baselineRunIds,
      candidateRunIds: args.candidateRunIds,
      baselineScore,
      candidateScore,
      contextLift,
      costDelta,
      durationMsDelta,
      turnDelta,
      regressionFlags,
      recommendation,
      summary: args.summary,
      createdAt: Date.now(),
    });

    await ctx.db.insert("activities", {
      actorType: "SYSTEM" as const,
      actorId: args.actorId,
      action: "EVAL_COMPARISON_RECORDED",
      description:
        `Evaluation comparison recorded for scenario "${scenario.name}" — ` +
        `lift ${contextLift.toFixed(1)}, recommendation ${recommendation}`,
      targetType: "evaluationComparison",
      targetId: comparisonId,
      afterState: {
        baselineScore,
        candidateScore,
        contextLift,
        regressionFlags,
        recommendation,
        baselineTrials: baselineRuns.length,
        candidateTrials: candidateRuns.length,
      },
    });

    return comparisonId;
  },
});
