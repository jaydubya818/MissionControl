/**
 * Operator persona evaluation harness.
 *
 * This module never calls approval, dispatch, or acceptance mutations. Eval
 * records are forecasts and research evidence, not production authorization.
 */

import { v } from "convex/values";
import { mutation, query } from "./lib/missionScopedFunctions";
import {
  aggregateOperatorEval,
  DEFAULT_FLEET_OPERATOR,
  defaultFleetOperatorScenarios,
  scoreScenarioStructure,
  type OperatorScenarioResult,
} from "./lib/operatorEvals";

const runMode = v.union(v.literal("PROXY"), v.literal("MODEL"), v.literal("HUMAN"));
const scenarioResult = v.object({
  scenarioId: v.string(),
  scenarioName: v.string(),
  scores: v.object({
    attention: v.number(),
    authority: v.number(),
    policy: v.number(),
    grounding: v.number(),
    dispatch: v.number(),
    proof: v.number(),
    closure: v.number(),
    durability: v.number(),
  }),
  overallScore: v.number(),
  unsupportedAssumptions: v.array(v.string()),
  variantAgreementPct: v.number(),
  decision: v.optional(v.string()),
  notes: v.optional(v.string()),
});

async function audit(ctx: { db: any }, args: { projectId: string; actorId?: string; action: string; description: string; targetType: string; targetId: string; metadata?: unknown }) {
  await ctx.db.insert("activities", {
    projectId: args.projectId,
    actorType: "HUMAN",
    actorId: args.actorId ?? "operator-evals",
    action: args.action,
    description: args.description,
    targetType: args.targetType,
    targetId: args.targetId,
    metadata: args.metadata,
  });
}

export const getDashboard = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const profiles = await ctx.db
      .query("operatorPersonaProfiles")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const persona = profiles.filter((profile) => profile.active).sort((a, b) => b.version - a.version)[0] ?? null;
    if (!persona) return null;

    const [scenarios, runs, observations] = await Promise.all([
      ctx.db.query("operatorEvalScenarios").withIndex("by_persona", (q) => q.eq("personaId", persona._id)).collect(),
      ctx.db.query("operatorEvalRuns").withIndex("by_persona", (q) => q.eq("personaId", persona._id)).collect(),
      ctx.db.query("operatorHumanObservations").withIndex("by_persona", (q) => q.eq("personaId", persona._id)).collect(),
    ]);
    runs.sort((a, b) => b.createdAt - a.createdAt);
    scenarios.sort((a, b) => a.name.localeCompare(b.name));
    const completedHumanRuns = runs.filter((run) => run.mode === "HUMAN" && run.status === "COMPLETED");

    return {
      persona,
      scenarios,
      latestRun: runs[0] ?? null,
      recentRuns: runs.slice(0, 12),
      calibration: {
        observationCount: observations.length,
        completedHumanRuns: completedHumanRuns.length,
        status: observations.length >= scenarios.length * 2 ? "CALIBRATED" : observations.length > 0 ? "COLLECTING" : "NO_HUMAN_DATA",
        noiseFloorAvailable: completedHumanRuns.length >= 2,
      },
    };
  },
});

export const seedV1 = mutation({
  args: { projectId: v.id("projects"), actorId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("operatorPersonaProfiles")
      .withIndex("by_project_slug", (q) => q.eq("projectId", args.projectId).eq("slug", DEFAULT_FLEET_OPERATOR.slug))
      .first();
    const now = Date.now();
    const personaId = existing?._id ?? await ctx.db.insert("operatorPersonaProfiles", {
      projectId: args.projectId,
      ...DEFAULT_FLEET_OPERATOR,
      version: 1,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...DEFAULT_FLEET_OPERATOR,
        version: 1,
        active: true,
        updatedAt: now,
      });
    }

    let createdScenarios = 0;
    for (const definition of defaultFleetOperatorScenarios()) {
      const scenario = await ctx.db
        .query("operatorEvalScenarios")
        .withIndex("by_project_slug", (q) => q.eq("projectId", args.projectId).eq("slug", definition.slug))
        .first();
      if (scenario) {
        await ctx.db.patch(scenario._id, { personaId, ...definition, active: true, updatedAt: now });
      } else {
        await ctx.db.insert("operatorEvalScenarios", {
          projectId: args.projectId,
          personaId,
          ...definition,
          active: true,
          createdAt: now,
          updatedAt: now,
        });
        createdScenarios += 1;
      }
    }

    await audit(ctx, {
      projectId: args.projectId,
      actorId: args.actorId,
      action: "OPERATOR_EVAL_CONTRACT_SEEDED",
      description: `Fleet Operator v1 contract ready with ${createdScenarios} new scenarios`,
      targetType: "operatorPersonaProfile",
      targetId: personaId,
      metadata: { createdScenarios, personaVersion: 1 },
    });
    return { personaId, created: !existing, createdScenarios };
  },
});

export const runStructuralProxy = mutation({
  args: {
    projectId: v.id("projects"),
    personaId: v.id("operatorPersonaProfiles"),
    idempotencyKey: v.string(),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("operatorEvalRuns")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    if (existing) return { run: existing, created: false };
    const persona = await ctx.db.get(args.personaId);
    if (!persona || persona.projectId !== args.projectId) throw new Error("Persona does not belong to the selected workspace");
    const scenarios = (await ctx.db
      .query("operatorEvalScenarios")
      .withIndex("by_persona", (q) => q.eq("personaId", args.personaId))
      .collect()).filter((scenario) => scenario.active);
    if (scenarios.length === 0) throw new Error("No active operator scenarios are configured");
    const observations = await ctx.db
      .query("operatorHumanObservations")
      .withIndex("by_persona", (q) => q.eq("personaId", args.personaId))
      .collect();
    const now = Date.now();
    const runId = await ctx.db.insert("operatorEvalRuns", {
      projectId: args.projectId,
      personaId: args.personaId,
      mode: "PROXY",
      status: "RUNNING",
      scenarioCount: scenarios.length,
      completedScenarios: 0,
      humanObservationCount: observations.length,
      idempotencyKey: args.idempotencyKey,
      actorId: args.actorId,
      runnerVersion: "structural-proxy-v1",
      caveat: "Structural proxy only. This run checks grounding, rubric completeness, and durability coverage; it does not predict human behavior or model accuracy.",
      startedAt: now,
      createdAt: now,
    });
    try {
      const results = scenarios.map((scenario) => scoreScenarioStructure(String(scenario._id), scenario as any));
      const aggregate = aggregateOperatorEval(results);
      await ctx.db.patch(runId, {
        status: "COMPLETED",
        ...aggregate,
        results,
        completedAt: Date.now(),
      });
      await audit(ctx, {
        projectId: args.projectId,
        actorId: args.actorId,
        action: "OPERATOR_EVAL_PROXY_COMPLETED",
        description: `Structural operator eval completed across ${results.length} scenarios`,
        targetType: "operatorEvalRun",
        targetId: runId,
        metadata: { mode: "PROXY", overallScore: aggregate.overallScore },
      });
      return { run: await ctx.db.get(runId), created: true };
    } catch (error) {
      await ctx.db.patch(runId, {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Structural proxy failed",
        completedAt: Date.now(),
      });
      throw error;
    }
  },
});

export const startExternalRun = mutation({
  args: {
    projectId: v.id("projects"),
    personaId: v.id("operatorPersonaProfiles"),
    mode: runMode,
    idempotencyKey: v.string(),
    actorId: v.optional(v.string()),
    modelId: v.optional(v.string()),
    runnerVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.mode === "PROXY") throw new Error("Use runStructuralProxy for proxy runs");
    const existing = await ctx.db.query("operatorEvalRuns").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).first();
    if (existing) return { run: existing, created: false };
    const persona = await ctx.db.get(args.personaId);
    if (!persona || persona.projectId !== args.projectId) throw new Error("Persona does not belong to the selected workspace");
    const scenarios = (await ctx.db.query("operatorEvalScenarios").withIndex("by_persona", (q) => q.eq("personaId", args.personaId)).collect()).filter((scenario) => scenario.active);
    const observations = await ctx.db.query("operatorHumanObservations").withIndex("by_persona", (q) => q.eq("personaId", args.personaId)).collect();
    const now = Date.now();
    const runId = await ctx.db.insert("operatorEvalRuns", {
      projectId: args.projectId,
      personaId: args.personaId,
      mode: args.mode,
      status: "RUNNING",
      scenarioCount: scenarios.length,
      completedScenarios: 0,
      humanObservationCount: observations.length,
      idempotencyKey: args.idempotencyKey,
      actorId: args.actorId,
      modelId: args.modelId,
      runnerVersion: args.runnerVersion,
      caveat: args.mode === "MODEL"
        ? "Synthetic model run. Treat results as a bounded forecast and compare with human ground truth."
        : "Human observation run. Repeated sessions are required to estimate operator disagreement and the practical noise floor.",
      startedAt: now,
      createdAt: now,
    });
    return { run: await ctx.db.get(runId), created: true };
  },
});

export const completeExternalRun = mutation({
  args: {
    projectId: v.id("projects"),
    runId: v.id("operatorEvalRuns"),
    results: v.array(scenarioResult),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.projectId !== args.projectId) throw new Error("Eval run does not belong to the selected workspace");
    if (run.mode === "PROXY") throw new Error("Proxy runs complete synchronously");
    if (run.status !== "RUNNING") throw new Error(`Eval run cannot complete from ${run.status}`);
    if (args.results.length !== run.scenarioCount) throw new Error(`Expected ${run.scenarioCount} scenario results, received ${args.results.length}`);
    const activeScenarios = (await ctx.db
      .query("operatorEvalScenarios")
      .withIndex("by_persona", (q) => q.eq("personaId", run.personaId))
      .collect()).filter((scenario) => scenario.active);
    const expectedIds = new Set(activeScenarios.map((scenario) => String(scenario._id)));
    const submittedIds = new Set(args.results.map((result) => result.scenarioId));
    if (submittedIds.size !== args.results.length || submittedIds.size !== expectedIds.size || [...submittedIds].some((id) => !expectedIds.has(id))) {
      throw new Error("Scenario results must cover every active scenario exactly once");
    }
    const results = args.results as OperatorScenarioResult[];
    const aggregate = aggregateOperatorEval(results);
    await ctx.db.patch(args.runId, { status: "COMPLETED", ...aggregate, results, completedAt: Date.now() });
    await audit(ctx, {
      projectId: args.projectId,
      actorId: args.actorId,
      action: "OPERATOR_EVAL_EXTERNAL_COMPLETED",
      description: `${run.mode} operator eval completed across ${results.length} scenarios`,
      targetType: "operatorEvalRun",
      targetId: args.runId,
      metadata: { mode: run.mode, overallScore: aggregate.overallScore },
    });
    return await ctx.db.get(args.runId);
  },
});

export const recordHumanObservation = mutation({
  args: {
    projectId: v.id("projects"),
    personaId: v.id("operatorPersonaProfiles"),
    scenarioId: v.id("operatorEvalScenarios"),
    sessionKey: v.string(),
    operatorRef: v.string(),
    decision: v.string(),
    evidenceRequired: v.array(v.string()),
    assumptions: v.array(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const [persona, scenario] = await Promise.all([ctx.db.get(args.personaId), ctx.db.get(args.scenarioId)]);
    if (!persona || persona.projectId !== args.projectId || !scenario || scenario.projectId !== args.projectId || scenario.personaId !== args.personaId) {
      throw new Error("Human observation scope does not match the selected workspace and persona");
    }
    const existing = await ctx.db.query("operatorHumanObservations").withIndex("by_session", (q) => q.eq("sessionKey", args.sessionKey)).first();
    if (existing) {
      if (existing.projectId !== args.projectId || existing.personaId !== args.personaId) {
        throw new Error("Session key already belongs to another workspace or persona");
      }
      return { observation: existing, created: false };
    }
    const observationId = await ctx.db.insert("operatorHumanObservations", { ...args, recordedAt: Date.now() });
    return { observation: await ctx.db.get(observationId), created: true };
  },
});
