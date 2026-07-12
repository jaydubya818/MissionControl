/**
 * Context package evaluations — scenarios and baseline/candidate runs (Epic 4).
 *
 * Gated behind `eval.framework`. Completing a run writes impactScore to the
 * evaluated version row. External runners (CLI, Tessl-style agents) submit
 * per-scenario scores via submitScenarioResults + completeRun.
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import {
  aggregateEvalRun,
  clampScore,
  defaultSkillScenarios,
  validateCriteriaWeights,
  type ScenarioResultInput,
} from "../lib/contextEvals";
import { requireEvalFrameworkEnabled } from "../lib/evalFrameworkGate";

const evalRunStatusArg = v.union(
  v.literal("PENDING"),
  v.literal("RUNNING"),
  v.literal("COMPLETED"),
  v.literal("FAILED"),
  v.literal("CANCELED")
);

const criterionArg = v.object({
  id: v.string(),
  label: v.string(),
  weight: v.number(),
});

const scenarioResultArg = v.object({
  scenarioId: v.id("contextEvalScenarios"),
  scenarioName: v.string(),
  baselineScore: v.number(),
  candidateScore: v.number(),
  criteriaPassed: v.number(),
  criteriaTotal: v.number(),
});

async function insertAudit(
  ctx: { db: any },
  entry: {
    projectId?: string;
    actorId?: string;
    action: string;
    description: string;
    targetType: string;
    targetId: string;
    afterState?: unknown;
  }
): Promise<void> {
  await ctx.db.insert("activities", {
    projectId: entry.projectId,
    actorType: "HUMAN",
    actorId: entry.actorId,
    action: entry.action,
    description: entry.description,
    targetType: entry.targetType,
    targetId: entry.targetId,
    afterState: entry.afterState,
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const listScenarios = query({
  args: {
    packageId: v.id("contextPackages"),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("contextEvalScenarios")
      .withIndex("by_package", (q) => q.eq("packageId", args.packageId))
      .collect();
    const filtered = args.activeOnly
      ? rows.filter((r) => r.active)
      : rows;
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const listRuns = query({
  args: {
    packageId: v.optional(v.id("contextPackages")),
    versionId: v.optional(v.id("contextPackageVersions")),
    status: v.optional(evalRunStatusArg),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let rows;
    if (args.versionId !== undefined) {
      rows = await ctx.db
        .query("contextEvalRuns")
        .withIndex("by_version", (q) => q.eq("versionId", args.versionId!))
        .collect();
    } else if (args.packageId !== undefined) {
      rows = await ctx.db
        .query("contextEvalRuns")
        .withIndex("by_package", (q) => q.eq("packageId", args.packageId!))
        .collect();
    } else {
      rows = await ctx.db.query("contextEvalRuns").collect();
    }

    if (args.status !== undefined) {
      rows = rows.filter((r) => r.status === args.status);
    }

    rows.sort((a, b) => b.createdAt - a.createdAt);
    const limit = args.limit ?? 50;
    return rows.slice(0, limit);
  },
});

export const getRun = query({
  args: { runId: v.id("contextEvalRuns") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.runId);
  },
});

/** Recent eval activity across all packages — powers the Registry Evals tab. */
export const listRecentRuns = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const runs = await ctx.db.query("contextEvalRuns").collect();
    runs.sort((a, b) => b.createdAt - a.createdAt);
    const limit = args.limit ?? 20;
    const slice = runs.slice(0, limit);

    const enriched = [];
    for (const run of slice) {
      const pkg = await ctx.db.get(run.packageId);
      const version = await ctx.db.get(run.versionId);
      enriched.push({
        ...run,
        packageSlug: pkg?.slug ?? "unknown",
        packageName: pkg?.name ?? "unknown",
        versionLabel: version?.version ?? "?",
      });
    }
    return enriched;
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const createScenario = mutation({
  args: {
    packageId: v.id("contextPackages"),
    name: v.string(),
    description: v.string(),
    taskPrompt: v.string(),
    criteria: v.array(criterionArg),
    projectId: v.optional(v.id("projects")),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const pkg = await ctx.db.get(args.packageId);
    if (!pkg) throw new Error("Package not found");
    await requireEvalFrameworkEnabled(ctx, args.projectId ?? pkg.projectId);
    validateCriteriaWeights(args.criteria);

    const now = Date.now();
    const scenarioId = await ctx.db.insert("contextEvalScenarios", {
      packageId: args.packageId,
      name: args.name,
      description: args.description,
      taskPrompt: args.taskPrompt,
      criteria: args.criteria,
      active: true,
      projectId: args.projectId ?? pkg.projectId,
      createdAt: now,
      updatedAt: now,
    });

    await insertAudit(ctx, {
      projectId: args.projectId ?? pkg.projectId,
      actorId: args.actorId,
      action: "CONTEXT_EVAL_SCENARIO_CREATED",
      description: `Eval scenario "${args.name}" created for "${pkg.slug}"`,
      targetType: "contextEvalScenario",
      targetId: scenarioId,
    });

    return scenarioId;
  },
});

/** Seed the three default SKILL scenarios when a package has none. */
export const seedDefaultScenarios = mutation({
  args: {
    packageId: v.id("contextPackages"),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const pkg = await ctx.db.get(args.packageId);
    if (!pkg) throw new Error("Package not found");
    await requireEvalFrameworkEnabled(ctx, pkg.projectId);

    const existing = await ctx.db
      .query("contextEvalScenarios")
      .withIndex("by_package", (q) => q.eq("packageId", args.packageId))
      .collect();
    if (existing.length > 0) {
      return { created: 0, scenarioIds: existing.map((r) => r._id) };
    }

    const templates = defaultSkillScenarios(pkg.name, pkg.slug);
    const now = Date.now();
    const scenarioIds = [];
    for (const template of templates) {
      validateCriteriaWeights(template.criteria);
      const id = await ctx.db.insert("contextEvalScenarios", {
        packageId: args.packageId,
        name: template.name,
        description: template.description,
        taskPrompt: template.taskPrompt,
        criteria: [...template.criteria],
        active: true,
        projectId: pkg.projectId,
        createdAt: now,
        updatedAt: now,
      });
      scenarioIds.push(id);
    }

    await insertAudit(ctx, {
      projectId: pkg.projectId,
      actorId: args.actorId,
      action: "CONTEXT_EVAL_SCENARIOS_SEEDED",
      description: `Seeded ${scenarioIds.length} default eval scenarios for "${pkg.slug}"`,
      targetType: "contextPackage",
      targetId: args.packageId,
      afterState: { count: scenarioIds.length },
    });

    return { created: scenarioIds.length, scenarioIds };
  },
});

/** Fixed baseline proxy score when no external agent runner is connected. */
const BASELINE_PROXY_SCORE = 35;

async function loadActiveScenarios(
  ctx: { db: any },
  packageId: any,
  pkg: { name: string; slug: string; projectId?: string }
) {
  let scenarios = await ctx.db
    .query("contextEvalScenarios")
    .withIndex("by_package_active", (q: any) =>
      q.eq("packageId", packageId).eq("active", true)
    )
    .collect();

  if (scenarios.length === 0) {
    const templates = defaultSkillScenarios(pkg.name, pkg.slug);
    const now = Date.now();
    for (const template of templates) {
      await ctx.db.insert("contextEvalScenarios", {
        packageId,
        name: template.name,
        description: template.description,
        taskPrompt: template.taskPrompt,
        criteria: [...template.criteria],
        active: true,
        projectId: pkg.projectId,
        createdAt: now,
        updatedAt: now,
      });
    }
    scenarios = await ctx.db
      .query("contextEvalScenarios")
      .withIndex("by_package_active", (q: any) =>
        q.eq("packageId", packageId).eq("active", true)
      )
      .collect();
  }
  return scenarios;
}

function buildProxyResults(
  scenarios: Array<{
    _id: any;
    name: string;
    criteria: Array<{ weight: number }>;
  }>,
  candidateScore: number
) {
  return scenarios.map((scenario, index) => {
    const jitter = (scenario.name.length + index) % 5 - 2;
    const baseline = clampScore(BASELINE_PROXY_SCORE + jitter);
    const candidate = clampScore(candidateScore + jitter);
    const criteriaTotal = scenario.criteria.length;
    const criteriaPassed = Math.round((candidate / 100) * criteriaTotal);
    return {
      scenarioId: scenario._id,
      scenarioName: scenario.name,
      baselineScore: baseline,
      candidateScore: candidate,
      criteriaPassed,
      criteriaTotal,
    };
  });
}

/**
 * End-to-end proxy eval: creates a run, scores scenarios using the version's
 * qualityScore as candidate proxy, completes the run, and writes impactScore.
 * Used by the Registry UI and CLI until an external agent runner is wired.
 */
export const runProxyEval = mutation({
  args: {
    packageId: v.id("contextPackages"),
    versionId: v.optional(v.id("contextPackageVersions")),
    idempotencyKey: v.optional(v.string()),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const pkg = await ctx.db.get(args.packageId);
    if (!pkg) throw new Error("Package not found");
    await requireEvalFrameworkEnabled(ctx, pkg.projectId);

    let version = args.versionId
      ? await ctx.db.get(args.versionId)
      : pkg.currentVersionId
        ? await ctx.db.get(pkg.currentVersionId)
        : null;

    if (!version) {
      const versions = await ctx.db
        .query("contextPackageVersions")
        .withIndex("by_package", (q) => q.eq("packageId", args.packageId))
        .collect();
      version = versions.sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
    }

    if (!version || version.packageId !== args.packageId) {
      throw new Error("No evaluable version found for package");
    }

    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query("contextEvalRuns")
        .withIndex("by_idempotency", (q) =>
          q.eq("idempotencyKey", args.idempotencyKey!)
        )
        .unique();
      if (existing?.status === "COMPLETED") return existing;
    }

    const candidateScore = version.qualityScore ?? 60;
    const scenarios = await loadActiveScenarios(ctx, args.packageId, pkg);
    const now = Date.now();

    const runId = await ctx.db.insert("contextEvalRuns", {
      packageId: args.packageId,
      versionId: version._id,
      status: "RUNNING",
      scenarioCount: scenarios.length,
      completedScenarios: 0,
      idempotencyKey: args.idempotencyKey,
      actorId: args.actorId,
      projectId: pkg.projectId,
      startedAt: now,
      createdAt: now,
    });

    const proxyResults = buildProxyResults(scenarios, candidateScore);
    const normalized: ScenarioResultInput[] = proxyResults.map((r) => ({
      scenarioId: r.scenarioId,
      scenarioName: r.scenarioName,
      baselineScore: r.baselineScore,
      candidateScore: r.candidateScore,
      criteriaPassed: r.criteriaPassed,
      criteriaTotal: r.criteriaTotal,
    }));
    const aggregate = aggregateEvalRun(normalized);

    await ctx.db.patch(runId, {
      status: "COMPLETED",
      results: proxyResults,
      completedScenarios: aggregate.completedScenarios,
      baselineScore: aggregate.baselineScore,
      candidateScore: aggregate.candidateScore,
      impactDelta: aggregate.impactDelta,
      impactScore: aggregate.impactScore,
      completedAt: Date.now(),
    });

    await ctx.db.patch(version._id, { impactScore: aggregate.impactScore });

    await insertAudit(ctx, {
      projectId: pkg.projectId,
      actorId: args.actorId,
      action: "CONTEXT_EVAL_RUN_COMPLETED",
      description:
        `Proxy eval completed for "${pkg.slug}" v${version.version} — impact ${aggregate.impactScore}`,
      targetType: "contextEvalRun",
      targetId: runId,
      afterState: aggregate,
    });

    return await ctx.db.get(runId);
  },
});

export const createRun = mutation({
  args: {
    packageId: v.id("contextPackages"),
    versionId: v.id("contextPackageVersions"),
    idempotencyKey: v.optional(v.string()),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const pkg = await ctx.db.get(args.packageId);
    if (!pkg) throw new Error("Package not found");
    const version = await ctx.db.get(args.versionId);
    if (!version || version.packageId !== args.packageId) {
      throw new Error("Version not found for package");
    }
    await requireEvalFrameworkEnabled(ctx, pkg.projectId);

    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query("contextEvalRuns")
        .withIndex("by_idempotency", (q) =>
          q.eq("idempotencyKey", args.idempotencyKey!)
        )
        .unique();
      if (existing) return existing._id;
    }

    let scenarios = await ctx.db
      .query("contextEvalScenarios")
      .withIndex("by_package_active", (q) =>
        q.eq("packageId", args.packageId).eq("active", true)
      )
      .collect();

    if (scenarios.length === 0) {
      const templates = defaultSkillScenarios(pkg.name, pkg.slug);
      const now = Date.now();
      for (const template of templates) {
        await ctx.db.insert("contextEvalScenarios", {
          packageId: args.packageId,
          name: template.name,
          description: template.description,
          taskPrompt: template.taskPrompt,
          criteria: [...template.criteria],
          active: true,
          projectId: pkg.projectId,
          createdAt: now,
          updatedAt: now,
        });
      }
      scenarios = await ctx.db
        .query("contextEvalScenarios")
        .withIndex("by_package_active", (q) =>
          q.eq("packageId", args.packageId).eq("active", true)
        )
        .collect();
    }

    const now = Date.now();
    const runId = await ctx.db.insert("contextEvalRuns", {
      packageId: args.packageId,
      versionId: args.versionId,
      status: "RUNNING",
      scenarioCount: scenarios.length,
      completedScenarios: 0,
      idempotencyKey: args.idempotencyKey,
      actorId: args.actorId,
      projectId: pkg.projectId,
      startedAt: now,
      createdAt: now,
    });

    await insertAudit(ctx, {
      projectId: pkg.projectId,
      actorId: args.actorId,
      action: "CONTEXT_EVAL_RUN_STARTED",
      description: `Eval run started for "${pkg.slug}" v${version.version} (${scenarios.length} scenarios)`,
      targetType: "contextEvalRun",
      targetId: runId,
    });

    return runId;
  },
});

export const submitRunResults = mutation({
  args: {
    runId: v.id("contextEvalRuns"),
    results: v.array(scenarioResultArg),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Eval run not found");
    await requireEvalFrameworkEnabled(ctx, run.projectId);

    if (run.status !== "RUNNING" && run.status !== "PENDING") {
      throw new Error(`Cannot submit results for run in status ${run.status}`);
    }
    if (args.results.length === 0) {
      throw new Error("At least one scenario result is required");
    }

    for (const result of args.results) {
      if (
        result.baselineScore < 0 ||
        result.baselineScore > 100 ||
        result.candidateScore < 0 ||
        result.candidateScore > 100
      ) {
        throw new Error("Scenario scores must be in 0–100");
      }
    }

    const normalized: ScenarioResultInput[] = args.results.map((r) => ({
      scenarioId: r.scenarioId,
      scenarioName: r.scenarioName,
      baselineScore: clampScore(r.baselineScore),
      candidateScore: clampScore(r.candidateScore),
      criteriaPassed: r.criteriaPassed,
      criteriaTotal: r.criteriaTotal,
    }));

    const aggregate = aggregateEvalRun(normalized);
    const now = Date.now();

    await ctx.db.patch(args.runId, {
      status: "COMPLETED",
      results: args.results.map((r) => ({
        scenarioId: r.scenarioId,
        scenarioName: r.scenarioName,
        baselineScore: clampScore(r.baselineScore),
        candidateScore: clampScore(r.candidateScore),
        criteriaPassed: r.criteriaPassed,
        criteriaTotal: r.criteriaTotal,
      })),
      completedScenarios: aggregate.completedScenarios,
      baselineScore: aggregate.baselineScore,
      candidateScore: aggregate.candidateScore,
      impactDelta: aggregate.impactDelta,
      impactScore: aggregate.impactScore,
      completedAt: now,
    });

    await ctx.db.patch(run.versionId, {
      impactScore: aggregate.impactScore,
    });

    const pkg = await ctx.db.get(run.packageId);
    const version = await ctx.db.get(run.versionId);

    await insertAudit(ctx, {
      projectId: run.projectId,
      actorId: args.actorId,
      action: "CONTEXT_EVAL_RUN_COMPLETED",
      description:
        `Eval run completed for "${pkg?.slug ?? run.packageId}" v${version?.version ?? "?"} — ` +
        `impact ${aggregate.impactScore} (baseline ${aggregate.baselineScore}, candidate ${aggregate.candidateScore})`,
      targetType: "contextEvalRun",
      targetId: args.runId,
      afterState: aggregate,
    });

    return await ctx.db.get(args.runId);
  },
});

export const failRun = mutation({
  args: {
    runId: v.id("contextEvalRuns"),
    errorMessage: v.string(),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Eval run not found");
    await requireEvalFrameworkEnabled(ctx, run.projectId);

    await ctx.db.patch(args.runId, {
      status: "FAILED",
      errorMessage: args.errorMessage,
      completedAt: Date.now(),
    });

    return await ctx.db.get(args.runId);
  },
});
