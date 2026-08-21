/**
 * Test execution results.
 *
 * ## What changed and why
 *
 * `executeApi`, `executeUi` and `executeHybrid` used to *invent* their results:
 * `evaluateSteps` marked every step "passed" unless the caller passed
 * `shouldFail`, timed it as `60 + index * 20` ms, and returned a `success`
 * boolean derived from nothing. `testGeneration.execute` and
 * `hybridWorkflows.execute` then persisted that into `executionResults`, and
 * `ExecutionView` rendered it with no marker distinguishing it from a real run.
 * A green "12 passed / 0 failed" panel was produced without a runner ever
 * existing.
 *
 * Mission Control's rule is that a missing capability beats fabricated
 * evidence, so these actions now fail closed. The real automation path is
 * `apps/orchestration-server/src/automationAdapter.ts` (allowlisted executables,
 * artifact hash verification, redacted logs, normalized results); until an
 * execution runner is wired to it, there is no result to report.
 *
 * `storeResult` is `internal` because it writes pass/fail evidence: as a public
 * mutation, anyone holding the deployment URL could POST `success: true`. It
 * now also requires a `producer` attesting where the numbers came from, so a
 * fixture row can never be mistaken for a runner row by a later reader.
 */

import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

/** Thrown by every execution action while no runner is configured. */
export const EXECUTION_RUNNER_UNAVAILABLE =
  "EXECUTION_RUNNER_UNAVAILABLE: no test execution runner is configured for this deployment. " +
  "Mission Control does not synthesize test results. Run the suite through the orchestration " +
  "server's automation adapter (apps/orchestration-server/src/automationAdapter.ts), which " +
  "produces a normalized result with real exit codes, artifacts and redacted logs.";

export function executionRunnerUnavailable(): Error {
  return new Error(EXECUTION_RUNNER_UNAVAILABLE);
}

/**
 * Where a stored result came from. Rows are only trustworthy as evidence when
 * this is `AUTOMATION_ADAPTER`; anything else must be rendered as such.
 */
export const EXECUTION_PRODUCERS = ["AUTOMATION_ADAPTER", "MANUAL_IMPORT", "FIXTURE"] as const;

function buildResultId(): string {
  return `exec_${Math.random().toString(36).slice(2, 10)}`;
}

export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
    executionType: v.optional(v.union(v.literal("api"), v.literal("ui"), v.literal("hybrid"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rows = args.projectId
      ? await ctx.db.query("executionResults").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).order("desc").take(args.limit ?? 50)
      : await ctx.db.query("executionResults").order("desc").take(args.limit ?? 50);
    return args.executionType ? rows.filter((row) => row.executionType === args.executionType) : rows;
  },
});

export const get = query({
  args: { id: v.id("executionResults") },
  handler: async (ctx, args) => await ctx.db.get(args.id),
});

export const storeResult = internalMutation({
  args: {
    projectId: v.optional(v.id("projects")),
    executionType: v.union(v.literal("api"), v.literal("ui"), v.literal("hybrid")),
    suiteId: v.optional(v.id("testSuites")),
    workflowId: v.optional(v.id("hybridWorkflows")),
    jobId: v.optional(v.id("scheduledJobs")),
    /** Attestation of origin. Required — an unattributed pass count is not evidence. */
    producer: v.union(
      v.literal("AUTOMATION_ADAPTER"),
      v.literal("MANUAL_IMPORT"),
      v.literal("FIXTURE"),
    ),
    /** Identifier of the runner/importer, for audit attribution. */
    producedBy: v.string(),
    steps: v.array(v.any()),
    totalTime: v.number(),
    passed: v.number(),
    failed: v.number(),
    success: v.boolean(),
    context: v.optional(v.any()),
    executedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const resultId = buildResultId();
    const id = await ctx.db.insert("executionResults", {
      tenantId: undefined,
      projectId: args.projectId,
      resultId,
      executionType: args.executionType,
      suiteId: args.suiteId,
      workflowId: args.workflowId,
      jobId: args.jobId,
      steps: args.steps,
      totalTime: args.totalTime,
      passed: args.passed,
      failed: args.failed,
      success: args.success,
      context: args.context,
      executedAt: Date.now(),
      executedBy: args.executedBy,
      metadata: { producer: args.producer, producedBy: args.producedBy },
    });
    return { id, resultId };
  },
});
