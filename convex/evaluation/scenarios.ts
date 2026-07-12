/**
 * Evaluation scenarios + criteria — CRUD surface (Software Factory Epic 5).
 *
 * A scenario defines WHAT an agent is asked to do (prompt, repo, fixtures,
 * budgets); its criteria define HOW the result is scored (weights, methods,
 * required flags). Scoring/lift math is pure and lives in
 * lib/evaluation.ts (unit tested — no Convex runtime). Execution arrives
 * in PR 8; comparison recording in evaluation/comparisons.ts.
 *
 * All mutations are gated behind the `eval.framework` feature flag
 * (lib/evalGate.ts) and audited via `activities` (EVAL_SCENARIO_* /
 * EVAL_CRITERION_*).
 *
 * MUTABILITY CONTRACT:
 * - Scenario fields are editable while DRAFT or ACTIVE; ARCHIVED is
 *   read-only and terminal.
 * - Criteria may only change while the scenario is DRAFT — once ACTIVE,
 *   the scoring contract is frozen so runs stay comparable.
 * - Activation (DRAFT -> ACTIVE) requires at least one criterion.
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireEvalFrameworkEnabled } from "../lib/evalGate";

const riskLevelArg = v.union(
  v.literal("GREEN"),
  v.literal("YELLOW"),
  v.literal("RED")
);

const scenarioStatusArg = v.union(
  v.literal("DRAFT"),
  v.literal("ACTIVE"),
  v.literal("ARCHIVED")
);

const scenarioSourceArg = v.union(
  v.literal("MANUAL"),
  v.literal("FROM_PR"),
  v.literal("FROM_COMMIT"),
  v.literal("FROM_RUN"),
  v.literal("FROM_INCIDENT")
);

const fixtureRefArg = v.object({
  kind: v.union(v.literal("REPO_SHA"), v.literal("SCRIPT"), v.literal("NONE")),
  value: v.optional(v.string()),
});

const scoringMethodArg = v.union(
  v.literal("BINARY"),
  v.literal("SCALE"),
  v.literal("LLM_RUBRIC"),
  v.literal("COMMAND")
);

async function insertAudit(
  ctx: { db: any },
  entry: {
    actorId?: string;
    action: string;
    description: string;
    targetType: string;
    targetId: string;
    beforeState?: unknown;
    afterState?: unknown;
  }
): Promise<void> {
  await ctx.db.insert("activities", {
    actorType: "HUMAN",
    actorId: entry.actorId,
    action: entry.action,
    description: entry.description,
    targetType: entry.targetType,
    targetId: entry.targetId,
    beforeState: entry.beforeState,
    afterState: entry.afterState,
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const get = query({
  args: { scenarioId: v.id("evaluationScenarios") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.scenarioId);
  },
});

export const getWithCriteria = query({
  args: { scenarioId: v.id("evaluationScenarios") },
  handler: async (ctx, args) => {
    const scenario = await ctx.db.get(args.scenarioId);
    if (scenario === null) return null;
    const criteria = await ctx.db
      .query("evaluationCriteria")
      .withIndex("by_scenario", (q) => q.eq("scenarioId", args.scenarioId))
      .collect();
    return {
      ...scenario,
      criteria: criteria.sort((a, b) => a.ordinal - b.ordinal),
    };
  },
});

export const list = query({
  args: {
    capability: v.optional(v.string()),
    status: v.optional(scenarioStatusArg),
    repoSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Use the most selective available index, then filter the rest in memory.
    let rows;
    if (args.capability !== undefined) {
      rows = await ctx.db
        .query("evaluationScenarios")
        .withIndex("by_capability", (q) =>
          q.eq("capability", args.capability!)
        )
        .collect();
    } else if (args.repoSlug !== undefined) {
      rows = await ctx.db
        .query("evaluationScenarios")
        .withIndex("by_repo", (q) => q.eq("repoSlug", args.repoSlug!))
        .collect();
    } else if (args.status !== undefined) {
      rows = await ctx.db
        .query("evaluationScenarios")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else {
      rows = await ctx.db.query("evaluationScenarios").collect();
    }

    return rows
      .filter(
        (row) =>
          (args.capability === undefined ||
            row.capability === args.capability) &&
          (args.status === undefined || row.status === args.status) &&
          (args.repoSlug === undefined || row.repoSlug === args.repoSlug)
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

// ---------------------------------------------------------------------------
// Scenario mutations
// ---------------------------------------------------------------------------

export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    capability: v.string(),
    repoSlug: v.optional(v.string()),
    taskPrompt: v.string(),
    setupInstructions: v.optional(v.string()),
    fixtureRef: v.optional(fixtureRefArg),
    baselineConfig: v.optional(v.any()),
    candidateConfig: v.optional(v.any()),
    requiredArtifacts: v.optional(v.array(v.string())),
    timeoutMs: v.optional(v.number()),
    maxCostUsd: v.optional(v.number()),
    trials: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    owner: v.string(),
    riskLevel: riskLevelArg,
    source: v.optional(scenarioSourceArg),
    sourceRef: v.optional(v.string()),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireEvalFrameworkEnabled(ctx, null);

    if (args.name.trim().length === 0) {
      throw new Error("Scenario name must not be empty");
    }
    if (args.taskPrompt.trim().length === 0) {
      throw new Error("Scenario taskPrompt must not be empty");
    }
    const trials = args.trials ?? 1;
    if (!Number.isInteger(trials) || trials < 1) {
      throw new Error(`trials must be a positive integer, got ${args.trials}`);
    }

    const now = Date.now();
    const { actorId, trials: _trials, ...fields } = args;
    const scenarioId = await ctx.db.insert("evaluationScenarios", {
      ...fields,
      trials,
      status: "DRAFT",
      createdAt: now,
      updatedAt: now,
    });

    await insertAudit(ctx, {
      actorId,
      action: "EVAL_SCENARIO_CREATED",
      description: `Evaluation scenario "${args.name}" (${args.capability}) created`,
      targetType: "evaluationScenario",
      targetId: scenarioId,
      afterState: {
        name: args.name,
        capability: args.capability,
        status: "DRAFT",
        trials,
      },
    });

    return scenarioId;
  },
});

export const update = mutation({
  args: {
    scenarioId: v.id("evaluationScenarios"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    capability: v.optional(v.string()),
    repoSlug: v.optional(v.string()),
    taskPrompt: v.optional(v.string()),
    setupInstructions: v.optional(v.string()),
    fixtureRef: v.optional(fixtureRefArg),
    baselineConfig: v.optional(v.any()),
    candidateConfig: v.optional(v.any()),
    requiredArtifacts: v.optional(v.array(v.string())),
    timeoutMs: v.optional(v.number()),
    maxCostUsd: v.optional(v.number()),
    trials: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    owner: v.optional(v.string()),
    riskLevel: v.optional(riskLevelArg),
    // DRAFT <-> ACTIVE only; use `archive` for ARCHIVED
    status: v.optional(
      v.union(v.literal("DRAFT"), v.literal("ACTIVE"))
    ),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireEvalFrameworkEnabled(ctx, null);

    const existing = await ctx.db.get(args.scenarioId);
    if (!existing) {
      throw new Error("Scenario not found");
    }
    if (existing.status === "ARCHIVED") {
      throw new Error("ARCHIVED scenarios are read-only");
    }

    if (args.trials !== undefined) {
      if (!Number.isInteger(args.trials) || args.trials < 1) {
        throw new Error(
          `trials must be a positive integer, got ${args.trials}`
        );
      }
    }

    if (args.status === "ACTIVE" && existing.status === "DRAFT") {
      const criteria = await ctx.db
        .query("evaluationCriteria")
        .withIndex("by_scenario", (q) => q.eq("scenarioId", args.scenarioId))
        .collect();
      if (criteria.length === 0) {
        throw new Error(
          "Cannot activate a scenario with no criteria — add at least one criterion first"
        );
      }
    }

    const { scenarioId, actorId, ...updates } = args;
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) patch[key] = value;
    }
    await ctx.db.patch(scenarioId, patch);

    await insertAudit(ctx, {
      actorId,
      action: "EVAL_SCENARIO_UPDATED",
      description: `Evaluation scenario "${existing.name}" updated`,
      targetType: "evaluationScenario",
      targetId: scenarioId,
      beforeState: { status: existing.status },
      afterState: { status: args.status ?? existing.status },
    });

    return await ctx.db.get(scenarioId);
  },
});

export const archive = mutation({
  args: {
    scenarioId: v.id("evaluationScenarios"),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireEvalFrameworkEnabled(ctx, null);

    const existing = await ctx.db.get(args.scenarioId);
    if (!existing) {
      throw new Error("Scenario not found");
    }
    if (existing.status === "ARCHIVED") {
      throw new Error("Scenario is already archived");
    }

    await ctx.db.patch(args.scenarioId, {
      status: "ARCHIVED",
      updatedAt: Date.now(),
    });

    await insertAudit(ctx, {
      actorId: args.actorId,
      action: "EVAL_SCENARIO_ARCHIVED",
      description: `Evaluation scenario "${existing.name}" archived`,
      targetType: "evaluationScenario",
      targetId: args.scenarioId,
      beforeState: { status: existing.status },
      afterState: { status: "ARCHIVED" },
    });

    return await ctx.db.get(args.scenarioId);
  },
});

// ---------------------------------------------------------------------------
// Criterion mutations (scenario must be DRAFT)
// ---------------------------------------------------------------------------

async function requireDraftScenario(
  ctx: { db: any },
  scenarioId: string
): Promise<{ name: string; status: string }> {
  const scenario = await ctx.db.get(scenarioId);
  if (!scenario) {
    throw new Error("Scenario not found");
  }
  if (scenario.status !== "DRAFT") {
    throw new Error(
      `Criteria may only change while the scenario is DRAFT (status is ${scenario.status})`
    );
  }
  return scenario;
}

export const addCriterion = mutation({
  args: {
    scenarioId: v.id("evaluationScenarios"),
    name: v.string(),
    description: v.string(),
    weight: v.number(),
    scoringMethod: scoringMethodArg,
    scoringConfig: v.optional(v.any()),
    required: v.boolean(),
    ordinal: v.optional(v.number()),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireEvalFrameworkEnabled(ctx, null);
    const scenario = await requireDraftScenario(ctx, args.scenarioId);

    if (!(args.weight > 0)) {
      throw new Error(`Criterion weight must be > 0, got ${args.weight}`);
    }

    const siblings = await ctx.db
      .query("evaluationCriteria")
      .withIndex("by_scenario", (q) => q.eq("scenarioId", args.scenarioId))
      .collect();
    const ordinal =
      args.ordinal ??
      (siblings.length === 0
        ? 0
        : Math.max(...siblings.map((c) => c.ordinal)) + 1);

    const criterionId = await ctx.db.insert("evaluationCriteria", {
      scenarioId: args.scenarioId,
      name: args.name,
      description: args.description,
      weight: args.weight,
      scoringMethod: args.scoringMethod,
      scoringConfig: args.scoringConfig,
      required: args.required,
      ordinal,
      createdAt: Date.now(),
    });

    await insertAudit(ctx, {
      actorId: args.actorId,
      action: "EVAL_CRITERION_ADDED",
      description: `Criterion "${args.name}" added to scenario "${scenario.name}"`,
      targetType: "evaluationCriterion",
      targetId: criterionId,
      afterState: {
        name: args.name,
        weight: args.weight,
        scoringMethod: args.scoringMethod,
        required: args.required,
      },
    });

    return criterionId;
  },
});

export const updateCriterion = mutation({
  args: {
    criterionId: v.id("evaluationCriteria"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    weight: v.optional(v.number()),
    scoringMethod: v.optional(scoringMethodArg),
    scoringConfig: v.optional(v.any()),
    required: v.optional(v.boolean()),
    ordinal: v.optional(v.number()),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireEvalFrameworkEnabled(ctx, null);

    const existing = await ctx.db.get(args.criterionId);
    if (!existing) {
      throw new Error("Criterion not found");
    }
    const scenario = await requireDraftScenario(ctx, existing.scenarioId);

    if (args.weight !== undefined && !(args.weight > 0)) {
      throw new Error(`Criterion weight must be > 0, got ${args.weight}`);
    }

    const { criterionId, actorId, ...updates } = args;
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) patch[key] = value;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(criterionId, patch);
    }

    await insertAudit(ctx, {
      actorId,
      action: "EVAL_CRITERION_UPDATED",
      description: `Criterion "${existing.name}" of scenario "${scenario.name}" updated`,
      targetType: "evaluationCriterion",
      targetId: criterionId,
      beforeState: { weight: existing.weight, required: existing.required },
      afterState: {
        weight: args.weight ?? existing.weight,
        required: args.required ?? existing.required,
      },
    });

    return await ctx.db.get(criterionId);
  },
});

export const removeCriterion = mutation({
  args: {
    criterionId: v.id("evaluationCriteria"),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireEvalFrameworkEnabled(ctx, null);

    const existing = await ctx.db.get(args.criterionId);
    if (!existing) {
      throw new Error("Criterion not found");
    }
    const scenario = await requireDraftScenario(ctx, existing.scenarioId);

    await ctx.db.delete(args.criterionId);

    await insertAudit(ctx, {
      actorId: args.actorId,
      action: "EVAL_CRITERION_REMOVED",
      description: `Criterion "${existing.name}" removed from scenario "${scenario.name}"`,
      targetType: "evaluationCriterion",
      targetId: args.criterionId,
      beforeState: { name: existing.name, weight: existing.weight },
    });

    return null;
  },
});
