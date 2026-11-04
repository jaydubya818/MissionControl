import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "./lib/missionScopedFunctions";
import type { Doc, Id } from "./_generated/dataModel";
import { FACTORY_PERMISSIONS, requireWorkspacePermission } from "./lib/companyAccess";
import {
  aggregateTraceMetrics,
  compareExperimentVariants,
  evaluateDurationThreshold,
  evaluateFixtureJudge,
  finiteNonNegative,
  optionalString,
  sanitizeTraceValue,
} from "./lib/observability";
import {
  ensureAttemptTrace,
  finishAttemptTrace,
  insertEvalScore,
  recordRunEventObservation,
  recordTraceObservation,
} from "./lib/observabilityPersistence";
import { validateExecutionRoutingExperimentVariants } from "./lib/executionRouting";

const traceStatus = v.union(
  v.literal("RUNNING"),
  v.literal("SUCCESS"),
  v.literal("FAILED"),
  v.literal("CANCELED")
);
const tracePurpose = v.union(
  v.literal("SOFTWARE"),
  v.literal("VERIFICATION"),
  v.literal("AUTOMATION"),
  v.literal("EVALUATION"),
  v.literal("SYSTEM")
);
const evalScope = v.union(
  v.literal("OBSERVATION"),
  v.literal("TRACE"),
  v.literal("ATTEMPT"),
  v.literal("EXPERIMENT")
);
const evaluatorType = v.union(
  v.literal("DETERMINISTIC"),
  v.literal("LLM_JUDGE"),
  v.literal("HUMAN"),
  v.literal("EXTERNAL")
);
const scoreType = v.union(
  v.literal("NUMERIC"),
  v.literal("BOOLEAN"),
  v.literal("CATEGORICAL"),
  v.literal("TEXT")
);

async function recordActivity(ctx: Pick<MutationCtx, "db">, input: {
  tenantId?: Id<"tenants">;
  projectId: Id<"projects">;
  actorType: "AGENT" | "HUMAN" | "SYSTEM";
  actorId: string;
  action: string;
  description: string;
  targetType: string;
  targetId: string;
  metadata?: unknown;
}) {
  await ctx.db.insert("activities", {
    tenantId: input.tenantId,
    projectId: input.projectId,
    actorType: input.actorType,
    actorId: input.actorId,
    action: input.action,
    description: input.description,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: sanitizeTraceValue(input.metadata),
  });
}

export const getWorkspaceDashboard = query({
  args: {
    projectId: v.id("projects"),
    status: v.optional(traceStatus),
    purpose: v.optional(tracePurpose),
    executor: v.optional(v.string()),
    model: v.optional(v.string()),
    search: v.optional(v.string()),
    startedAfter: v.optional(v.number()),
    startedBefore: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    const requestedLimit = Math.max(1, Math.min(Math.floor(args.limit ?? 100), 250));
    const rows = await ctx.db
      .query("traces")
      .withIndex("by_project_started", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(500);
    const search = args.search?.trim().toLowerCase();
    const matchingWorkOrderIds = search
      ? new Set((await ctx.db.query("workOrders")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .take(1_000))
        .filter((workOrder) => [workOrder.title, workOrder.desiredOutcome]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search)))
        .map((workOrder) => String(workOrder._id)))
      : new Set<string>();
    const filtered = rows.filter((trace) => {
      if (args.status && trace.status !== args.status) return false;
      if (args.purpose && trace.purpose !== args.purpose) return false;
      if (args.executor && trace.executor !== args.executor) return false;
      if (args.model && trace.model !== args.model) return false;
      if (args.startedAfter !== undefined && trace.startedAt < args.startedAfter) return false;
      if (args.startedBefore !== undefined && trace.startedAt > args.startedBefore) return false;
      if (search
        && ![trace.name, trace.executor, trace.model, trace.externalTraceId, ...(trace.tags ?? [])]
          .filter(Boolean).some((value) => String(value).toLowerCase().includes(search))
        && (!trace.workOrderId || !matchingWorkOrderIds.has(String(trace.workOrderId)))) return false;
      return true;
    }).slice(0, requestedLimit);

    const [definitions, scores, datasets, experiments] = await Promise.all([
      ctx.db.query("evalDefinitions").withIndex("by_project", (q) => q.eq("projectId", args.projectId)).take(500),
      ctx.db.query("evalScores").withIndex("by_project_created", (q) => q.eq("projectId", args.projectId)).order("desc").take(5_000),
      ctx.db.query("evalDatasets").withIndex("by_project_updated", (q) => q.eq("projectId", args.projectId)).order("desc").take(100),
      ctx.db.query("experiments").withIndex("by_project_created", (q) => q.eq("projectId", args.projectId)).order("desc").take(100),
    ]);
    const traceIds = new Set(filtered.map((trace) => String(trace._id)));
    const filteredScores = scores.filter((score) => score.traceId && traceIds.has(String(score.traceId)));
    const definitionById = new Map(definitions.map((definition) => [String(definition._id), definition]));
    const traceSummaries = await Promise.all(filtered.map(async (trace) => {
      const [workOrder, run, observations] = await Promise.all([
        trace.workOrderId ? ctx.db.get(trace.workOrderId) : null,
        trace.workflowRunId ? ctx.db.get(trace.workflowRunId) : null,
        ctx.db.query("traceObservations").withIndex("by_trace", (q) => q.eq("traceId", trace._id)).take(5_001),
      ]);
      const traceScores = filteredScores.filter((score) => score.traceId === trace._id);
      return {
        ...trace,
        workOrderTitle: workOrder?.title,
        runId: run?.runId,
        observationCount: Math.min(observations.length, 5_000),
        observationCountCapped: observations.length > 5_000,
        generationCount: observations.filter((observation) => observation.type === "GENERATION").length,
        toolCount: observations.filter((observation) => observation.type === "TOOL").length,
        evalCount: traceScores.length,
        latestScores: traceScores.sort((left, right) => right.createdAt - left.createdAt).slice(0, 4).map((score) => ({
          ...score,
          definitionName: definitionById.get(String(score.evalDefinitionId))?.name ?? "Unknown evaluator",
          definitionVersion: definitionById.get(String(score.evalDefinitionId))?.version,
        })),
      };
    }));
    const evalAnalytics = definitions.map((definition) => {
      const definitionScores = scores.filter((score) => score.evalDefinitionId === definition._id);
      const numeric = definitionScores.filter((score) => typeof score.value === "number").map((score) => score.value as number);
      const boolean = definitionScores.filter((score) => typeof score.value === "boolean").map((score) => score.value as boolean);
      return {
        ...definition,
        executionCount: definitionScores.length,
        averageScore: numeric.length ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length : undefined,
        passRate: boolean.length ? boolean.filter(Boolean).length / boolean.length : undefined,
        failureRate: boolean.length ? boolean.filter((value) => !value).length / boolean.length : undefined,
        lastRunAt: definitionScores.reduce<number | undefined>((latest, score) => !latest || score.createdAt > latest ? score.createdAt : latest, undefined),
      };
    });
    return {
      metrics: aggregateTraceMetrics(filtered),
      traces: traceSummaries,
      evalAnalytics,
      datasets: await Promise.all(datasets.map(async (dataset) => ({
        ...dataset,
        itemCount: (await ctx.db.query("evalDatasetItems").withIndex("by_dataset", (q) => q.eq("datasetId", dataset._id)).take(5_000)).length,
      }))),
      experiments: await Promise.all(experiments.map(async (experiment) => ({
        ...experiment,
        variants: await ctx.db.query("experimentVariants").withIndex("by_experiment", (q) => q.eq("experimentId", experiment._id)).take(100),
      }))),
      filters: {
        executors: [...new Set(rows.map((trace) => trace.executor).filter((value): value is string => Boolean(value)))].sort(),
        models: [...new Set(rows.map((trace) => trace.model).filter((value): value is string => Boolean(value)))].sort(),
      },
    };
  },
});

export const getTraceDetail = query({
  args: { traceId: v.id("traces") },
  handler: async (ctx, args) => {
    const trace = await ctx.db.get(args.traceId);
    if (!trace) return null;
    await requireWorkspacePermission(ctx, trace.projectId, FACTORY_PERMISSIONS.VIEW);
    const [observations, scores, run, workOrder, factoryVersion, verificationRuns] = await Promise.all([
      ctx.db.query("traceObservations").withIndex("by_trace_started", (q) => q.eq("traceId", trace._id)).take(5_001),
      ctx.db.query("evalScores").withIndex("by_trace", (q) => q.eq("traceId", trace._id)).take(1_000),
      trace.workflowRunId ? ctx.db.get(trace.workflowRunId) : null,
      trace.workOrderId ? ctx.db.get(trace.workOrderId) : null,
      trace.factoryDefinitionVersionId ? ctx.db.get(trace.factoryDefinitionVersionId) : null,
      trace.workflowRunId
        ? ctx.db.query("verificationRuns").withIndex("by_run", (q) => q.eq("workflowRunId", trace.workflowRunId!)).take(100)
        : Promise.resolve([]),
    ]);
    const definitionIds = [...new Set(scores.map((score) => score.evalDefinitionId))];
    const definitions = (await Promise.all(definitionIds.map((id) => ctx.db.get(id)))).filter(
      (definition): definition is Doc<"evalDefinitions"> => Boolean(definition)
    );
    const definitionById = new Map(definitions.map((definition) => [String(definition._id), definition]));
    return {
      trace,
      observations: observations.slice(0, 5_000),
      observationsTruncated: observations.length > 5_000,
      scores: scores.sort((left, right) => right.createdAt - left.createdAt).map((score) => ({
        ...score,
        definition: definitionById.get(String(score.evalDefinitionId)),
      })),
      run,
      workOrder,
      factoryVersion,
      verificationRuns,
    };
  },
});

export const createEvalDefinitionVersion = mutation({
  args: {
    projectId: v.id("projects"),
    key: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    scope: evalScope,
    evaluatorType,
    scoreType,
    rubric: v.optional(v.string()),
    configuration: v.optional(v.any()),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.IMPROVE);
    const key = args.key.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
    if (!key) throw new Error("Evaluator key is required.");
    if (args.evaluatorType === "LLM_JUDGE" && !args.rubric?.trim()) {
      throw new Error("LLM judge evaluators require an explicit versioned rubric.");
    }
    const latestVersion = await ctx.db.query("evalDefinitions")
      .withIndex("by_project_key_version", (q) => q.eq("projectId", args.projectId).eq("key", key))
      .order("desc")
      .first();
    const version = (latestVersion?.version ?? 0) + 1;
    const definitionId = await ctx.db.insert("evalDefinitions", {
      tenantId: access.project.tenantId,
      projectId: args.projectId,
      key,
      name: optionalString(args.name, 200) ?? key,
      description: optionalString(args.description, 2_000),
      scope: args.scope,
      evaluatorType: args.evaluatorType,
      scoreType: args.scoreType,
      rubric: optionalString(args.rubric, 20_000),
      configuration: sanitizeTraceValue(args.configuration),
      enabled: args.enabled,
      version,
      createdBy: access.actorId,
      createdAt: Date.now(),
    });
    await recordActivity(ctx, {
      tenantId: access.project.tenantId,
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "EVAL_DEFINITION_VERSION_CREATED",
      description: `Created ${key} evaluator version ${version}`,
      targetType: "EVAL_DEFINITION",
      targetId: String(definitionId),
      metadata: { key, version, evaluatorType: args.evaluatorType, scoreType: args.scoreType },
    });
    return await ctx.db.get(definitionId);
  },
});

export const backfillAttemptTraces = mutation({
  args: {
    projectId: v.id("projects"),
    limit: v.optional(v.number()),
    beforeCreationTime: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.IMPROVE);
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 5), 10));
    const runs = await ctx.db.query("workflowRuns")
      .withIndex("by_project", (q) => args.beforeCreationTime === undefined
        ? q.eq("projectId", args.projectId)
        : q.eq("projectId", args.projectId).lt("_creationTime", args.beforeCreationTime))
      .order("desc")
      .take(limit);
    let tracesCreated = 0;
    let observationsCreated = 0;
    const truncatedAttemptRunIds: string[] = [];

    for (const run of runs) {
      const existingTrace = await ctx.db.query("traces")
        .withIndex("by_attempt", (q) => q.eq("workflowRunId", run._id))
        .first();
      const trace = await ensureAttemptTrace(ctx, run);
      if (!existingTrace) tracesCreated += 1;

      const loadedEvents = await ctx.db.query("runEvents")
        .withIndex("by_run_sequence", (q) => q.eq("workflowRunId", run._id))
        .take(101);
      if (loadedEvents.length > 100) truncatedAttemptRunIds.push(run.runId ?? String(run._id));
      for (const event of loadedEvents.slice(0, 100)) {
        const idempotencyKey = `run-event:${event.idempotencyKey ?? event._id}`;
        const existingObservation = await ctx.db.query("traceObservations")
          .withIndex("by_trace_idempotency", (q) => q.eq("traceId", trace._id).eq("idempotencyKey", idempotencyKey))
          .first();
        await recordRunEventObservation(ctx, run, event);
        if (!existingObservation) observationsCreated += 1;
      }
      if (["COMPLETED", "FAILED", "CANCELED"].includes(run.status)) {
        await finishAttemptTrace(ctx, run, {
          status: run.status as "COMPLETED" | "FAILED" | "CANCELED",
          completedAt: finiteNonNegative(run.completedAt) ?? Date.now(),
          failureReason: run.failureReason,
        });
      }
    }

    const nextBeforeCreationTime = runs.length === limit ? runs[runs.length - 1]?._creationTime : undefined;
    await recordActivity(ctx, {
      tenantId: access.project.tenantId,
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "OBSERVABILITY_ATTEMPTS_BACKFILLED",
      description: `Backfilled observability for ${runs.length} Attempts`,
      targetType: "PROJECT",
      targetId: String(args.projectId),
      metadata: { tracesCreated, observationsCreated, truncatedAttemptRunIds, nextBeforeCreationTime },
    });
    return {
      runsScanned: runs.length,
      tracesCreated,
      observationsCreated,
      truncatedAttemptRunIds,
      ...(nextBeforeCreationTime === undefined ? {} : { nextBeforeCreationTime }),
    };
  },
});

export const runDurationEvaluator = mutation({
  args: {
    traceId: v.id("traces"),
    evalDefinitionId: v.id("evalDefinitions"),
    thresholdMs: v.number(),
  },
  handler: async (ctx, args) => {
    const [trace, definition] = await Promise.all([ctx.db.get(args.traceId), ctx.db.get(args.evalDefinitionId)]);
    if (!trace || !definition || trace.projectId !== definition.projectId) throw new Error("Trace evaluator scope is invalid.");
    const access = await requireWorkspacePermission(ctx, trace.projectId, FACTORY_PERMISSIONS.IMPROVE);
    if (!definition.enabled || definition.evaluatorType !== "DETERMINISTIC" || definition.scoreType !== "BOOLEAN") {
      throw new Error("Duration threshold requires a deterministic boolean evaluator definition.");
    }
    if (definition.scope !== "TRACE" && definition.scope !== "ATTEMPT") {
      throw new Error("Duration threshold requires a trace or Attempt evaluator definition.");
    }
    if (trace.status === "RUNNING" || trace.durationMs === undefined) {
      throw new Error("Duration threshold requires a terminal trace with a recorded duration.");
    }
    const configuredThreshold = finiteNonNegative(objectRecord(definition.configuration).thresholdMs);
    if (!configuredThreshold || configuredThreshold !== args.thresholdMs) {
      throw new Error("Duration threshold must match the immutable evaluator definition configuration.");
    }
    const result = evaluateDurationThreshold({ durationMs: trace.durationMs, thresholdMs: args.thresholdMs });
    const score = await insertEvalScore(ctx, {
      projectId: trace.projectId,
      tenantId: trace.tenantId,
      definition,
      traceId: trace._id,
      workflowRunId: trace.workflowRunId,
      value: result.value,
      reason: result.reason,
      evaluator: { type: "DETERMINISTIC", version: "duration-threshold/v1" },
      createdBy: access.actorId,
      idempotencyKey: `duration:${trace._id}:${definition._id}`,
    });
    await recordActivity(ctx, {
      tenantId: trace.tenantId,
      projectId: trace.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "EVAL_SCORE_RECORDED",
      description: `Recorded ${definition.name} for trace ${trace.externalTraceId}`,
      targetType: "EVAL_SCORE",
      targetId: String(score?._id),
      metadata: { traceId: trace._id, evalDefinitionId: definition._id, definitionVersion: definition.version },
    });
    return score;
  },
});

export const recordHumanScore = mutation({
  args: {
    traceId: v.id("traces"),
    observationId: v.optional(v.id("traceObservations")),
    evalDefinitionId: v.id("evalDefinitions"),
    value: v.union(v.number(), v.boolean(), v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const [trace, definition, observation] = await Promise.all([
      ctx.db.get(args.traceId),
      ctx.db.get(args.evalDefinitionId),
      args.observationId ? ctx.db.get(args.observationId) : null,
    ]);
    if (
      !trace
      || !definition
      || trace.projectId !== definition.projectId
      || (args.observationId && !observation)
      || (observation && observation.traceId !== trace._id)
    ) {
      throw new Error("Human evaluation target is invalid.");
    }
    const access = await requireWorkspacePermission(ctx, trace.projectId, FACTORY_PERMISSIONS.IMPROVE);
    if (!definition.enabled || definition.evaluatorType !== "HUMAN") throw new Error("Selected evaluator is not an enabled human evaluator.");
    if (observation && definition.scope !== "OBSERVATION") {
      throw new Error("Observation scores require an observation-scoped evaluator.");
    }
    if (!observation && definition.scope !== "TRACE" && definition.scope !== "ATTEMPT") {
      throw new Error("Trace scores require a trace or Attempt evaluator.");
    }
    assertScoreValue(definition.scoreType, args.value);
    const score = await insertEvalScore(ctx, {
      projectId: trace.projectId,
      tenantId: trace.tenantId,
      definition,
      traceId: trace._id,
      observationId: observation?._id,
      workflowRunId: trace.workflowRunId,
      value: args.value,
      reason: args.reason,
      evaluator: { type: "HUMAN", version: `v${definition.version}` },
      createdBy: access.actorId,
      idempotencyKey: `human:${trace._id}:${observation?._id ?? "trace"}:${definition._id}:${Date.now()}`,
    });
    await recordActivity(ctx, {
      tenantId: trace.tenantId,
      projectId: trace.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "EVAL_SCORE_RECORDED",
      description: `Recorded human score for ${definition.name}`,
      targetType: "EVAL_SCORE",
      targetId: String(score?._id),
      metadata: { traceId: trace._id, observationId: observation?._id, evalDefinitionId: definition._id },
    });
    return score;
  },
});

export const promoteTraceToDataset = mutation({
  args: {
    traceId: v.id("traces"),
    datasetId: v.optional(v.id("evalDatasets")),
    datasetName: v.optional(v.string()),
    expectedOutcome: v.optional(v.any()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const trace = await ctx.db.get(args.traceId);
    if (!trace) throw new Error("Trace not found.");
    const access = await requireWorkspacePermission(ctx, trace.projectId, FACTORY_PERMISSIONS.IMPROVE);
    let dataset = args.datasetId ? await ctx.db.get(args.datasetId) : null;
    if (args.datasetId && !dataset) throw new Error("Dataset not found.");
    if (dataset && dataset.projectId !== trace.projectId) throw new Error("Dataset belongs to another workspace.");
    if (!dataset) {
      const name = optionalString(args.datasetName, 200) ?? "Software Factory Regression";
      dataset = await ctx.db.query("evalDatasets")
        .withIndex("by_project_name", (q) => q.eq("projectId", trace.projectId).eq("name", name))
        .first();
      if (!dataset) {
        const now = Date.now();
        const datasetId = await ctx.db.insert("evalDatasets", {
          tenantId: trace.tenantId,
          projectId: trace.projectId,
          name,
          description: "Regression cases promoted from governed execution traces.",
          version: 1,
          createdBy: access.actorId,
          createdAt: now,
          updatedAt: now,
        });
        dataset = await ctx.db.get(datasetId);
      }
    }
    if (!dataset) throw new Error("Dataset could not be created.");
    const idempotencyKey = `dataset:${dataset._id}:trace:${trace._id}`;
    const existing = await ctx.db.query("evalDatasetItems")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();
    if (existing) return { dataset, item: existing, created: false };
    const [workOrder, run] = await Promise.all([
      trace.workOrderId ? ctx.db.get(trace.workOrderId) : null,
      trace.workflowRunId ? ctx.db.get(trace.workflowRunId) : null,
    ]);
    const now = Date.now();
    const itemId = await ctx.db.insert("evalDatasetItems", {
      tenantId: trace.tenantId,
      projectId: trace.projectId,
      datasetId: dataset._id,
      sourceTraceId: trace._id,
      sourceWorkOrderId: trace.workOrderId,
      sourceWorkflowRunId: trace.workflowRunId,
      idempotencyKey,
      input: sanitizeTraceValue({
        trace: { purpose: trace.purpose, name: trace.name, input: trace.input, tags: trace.tags },
        workOrder: workOrder ? {
          title: workOrder.title,
          desiredOutcome: workOrder.desiredOutcome,
          acceptanceCriteria: workOrder.acceptanceCriteria,
          constraints: workOrder.constraints,
        } : undefined,
        attempt: run ? { workflowId: run.workflowId, initialInput: run.initialInput } : undefined,
      }),
      expectedOutcome: sanitizeTraceValue(args.expectedOutcome),
      metadata: sanitizeTraceValue({ ...objectRecord(args.metadata), sourceTraceStatus: trace.status }),
      createdBy: access.actorId,
      createdAt: now,
    });
    await ctx.db.patch(dataset._id, { version: dataset.version + 1, updatedAt: now });
    await recordActivity(ctx, {
      tenantId: trace.tenantId,
      projectId: trace.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "TRACE_PROMOTED_TO_EVAL_DATASET",
      description: `Promoted trace ${trace.externalTraceId} into ${dataset.name}`,
      targetType: "EVAL_DATASET_ITEM",
      targetId: String(itemId),
      metadata: { traceId: trace._id, datasetId: dataset._id },
    });
    return { dataset: await ctx.db.get(dataset._id), item: await ctx.db.get(itemId), created: true };
  },
});

export const createExperiment = mutation({
  args: {
    projectId: v.id("projects"),
    datasetId: v.id("evalDatasets"),
    name: v.string(),
    evalDefinitionIds: v.array(v.id("evalDefinitions")),
    variants: v.array(v.object({
      name: v.string(),
      factoryDefinitionVersionId: v.optional(v.id("factoryDefinitionVersions")),
      executor: v.optional(v.string()),
      model: v.optional(v.string()),
      configuration: v.optional(v.any()),
    })),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.IMPROVE);
    const dataset = await ctx.db.get(args.datasetId);
    if (!dataset || dataset.projectId !== args.projectId) throw new Error("Experiment dataset is invalid.");
    if (args.variants.length !== 2) throw new Error("V1 experiments require exactly two variants.");
    const variantNames = args.variants.map((variant) => variant.name.trim().toLowerCase());
    if (variantNames.some((name) => !name) || new Set(variantNames).size !== variantNames.length) {
      throw new Error("Experiment variants require unique names.");
    }
    if (args.evalDefinitionIds.length < 1 || args.evalDefinitionIds.length > 20) {
      throw new Error("Experiments require one to twenty evaluator definitions.");
    }
    if (new Set(args.evalDefinitionIds.map(String)).size !== args.evalDefinitionIds.length) {
      throw new Error("Experiment evaluator definitions must be unique.");
    }
    const definitions = await Promise.all(args.evalDefinitionIds.map((id) => ctx.db.get(id)));
    if (definitions.some((definition) => !definition || !definition.enabled || definition.projectId !== args.projectId)) {
      throw new Error("Experiment evaluators must be enabled and belong to the workspace.");
    }
    const factoryVersions = await Promise.all(args.variants.map((variant) =>
      variant.factoryDefinitionVersionId ? ctx.db.get(variant.factoryDefinitionVersionId) : null
    ));
    if (args.variants.some((variant, index) => variant.factoryDefinitionVersionId
      && (!factoryVersions[index] || factoryVersions[index]!.projectId !== args.projectId))) {
      throw new Error("Experiment Factory variants must belong to the workspace.");
    }
    const now = Date.now();
    const executionRoutingComparison = args.variants.some((variant) => Boolean(variant.factoryDefinitionVersionId));
    const routingTupleSnapshots = executionRoutingComparison
      ? await validateExecutionRoutingExperimentVariants(ctx, {
          projectId: args.projectId,
          factoryDefinitionVersionIds: args.variants
            .map((variant) => variant.factoryDefinitionVersionId)
            .filter((id): id is Id<"factoryDefinitionVersions"> => Boolean(id)),
          now,
        })
      : undefined;
    const experimentId = await ctx.db.insert("experiments", {
      tenantId: access.project.tenantId,
      projectId: args.projectId,
      datasetId: dataset._id,
      datasetVersion: dataset.version,
      name: optionalString(args.name, 200) ?? "Factory comparison",
      status: "DRAFT",
      evalDefinitionIds: args.evalDefinitionIds,
      createdBy: access.actorId,
      createdAt: now,
      metadata: executionRoutingComparison ? {
        kind: "EXECUTION_ROUTING_TUPLE_COMPARISON",
        verificationRequired: true,
        acceptanceAuthority: false,
      } : undefined,
    });
    const variantIds = [];
    for (const [index, variant] of args.variants.entries()) {
      variantIds.push(await ctx.db.insert("experimentVariants", {
        tenantId: access.project.tenantId,
        projectId: args.projectId,
        experimentId,
        name: optionalString(variant.name, 200) ?? "Variant",
        factoryDefinitionVersionId: variant.factoryDefinitionVersionId,
        executor: optionalString(variant.executor, 100),
        model: optionalString(variant.model, 200),
        configuration: sanitizeTraceValue(routingTupleSnapshots ? {
          kind: "EXECUTION_ROUTING_TUPLE",
          tuple: routingTupleSnapshots[index],
          experimentConfiguration: variant.configuration,
          verificationRequired: true,
          acceptanceAuthority: false,
        } : variant.configuration),
        sampleSize: 0,
        createdAt: now,
      }));
    }
    await recordActivity(ctx, {
      tenantId: access.project.tenantId,
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "EVAL_EXPERIMENT_CREATED",
      description: `Created two-variant experiment ${optionalString(args.name, 200) ?? "Factory comparison"}`,
      targetType: "EVAL_EXPERIMENT",
      targetId: String(experimentId),
      metadata: { datasetId: dataset._id, datasetVersion: dataset.version, variantIds, evalDefinitionIds: args.evalDefinitionIds },
    });
    return { experiment: await ctx.db.get(experimentId), variantIds };
  },
});

export const recordExperimentOutcome = mutation({
  args: {
    experimentId: v.id("experiments"),
    variants: v.array(v.object({
      variantId: v.id("experimentVariants"),
      sampleSize: v.number(),
      successCount: v.number(),
      averageDurationMs: v.optional(v.number()),
      averageCostUsd: v.optional(v.number()),
      averageScore: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    const experiment = await ctx.db.get(args.experimentId);
    if (!experiment) throw new Error("Experiment not found.");
    const access = await requireWorkspacePermission(ctx, experiment.projectId, FACTORY_PERMISSIONS.IMPROVE);
    if (experiment.status === "COMPLETED" || experiment.status === "CANCELED") {
      throw new Error("Completed or canceled experiments cannot be overwritten.");
    }
    const variants = await ctx.db.query("experimentVariants")
      .withIndex("by_experiment", (q) => q.eq("experimentId", experiment._id))
      .collect();
    const resultsById = new Map(args.variants.map((result) => [String(result.variantId), result]));
    if (variants.length !== 2 || args.variants.length !== 2 || new Set(args.variants.map((item) => String(item.variantId))).size !== 2) {
      throw new Error("V1 experiment outcomes require exactly the two attributed variants.");
    }
    const finiteMetric = (value: number | undefined, label: string, maximum?: number) => {
      if (value === undefined) return;
      if (!Number.isFinite(value) || value < 0 || (maximum !== undefined && value > maximum)) {
        throw new Error(`${label} is outside the supported range.`);
      }
    };
    for (const variant of variants) {
      const result = resultsById.get(String(variant._id));
      if (!result) throw new Error("Experiment outcomes must match the attributed variants.");
      if (!Number.isInteger(result.sampleSize) || result.sampleSize < 1 || result.sampleSize > 10_000) {
        throw new Error("Experiment sample size must be an integer between 1 and 10,000.");
      }
      if (!Number.isInteger(result.successCount) || result.successCount < 0 || result.successCount > result.sampleSize) {
        throw new Error("Experiment success count must be an integer within the sample size.");
      }
      finiteMetric(result.averageDurationMs, "Average duration");
      finiteMetric(result.averageCostUsd, "Average cost");
      finiteMetric(result.averageScore, "Average score", 1);
    }
    const now = Date.now();
    for (const variant of variants) {
      const result = resultsById.get(String(variant._id))!;
      await ctx.db.patch(variant._id, {
        sampleSize: result.sampleSize,
        metrics: {
          successRate: result.successCount / result.sampleSize,
          averageDurationMs: result.averageDurationMs,
          averageCostUsd: result.averageCostUsd,
          averageScore: result.averageScore,
        },
        completedAt: now,
      });
    }
    await ctx.db.patch(experiment._id, {
      status: "COMPLETED",
      completedAt: now,
      metadata: {
        ...objectRecord(experiment.metadata),
        outcomeSource: "HUMAN_RECORDED_AGGREGATE",
        statisticalSignificanceClaimed: false,
      },
    });
    await recordActivity(ctx, {
      tenantId: experiment.tenantId,
      projectId: experiment.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "EVAL_EXPERIMENT_OUTCOME_RECORDED",
      description: `Recorded bounded aggregate outcomes for ${experiment.name}`,
      targetType: "EVAL_EXPERIMENT",
      targetId: String(experiment._id),
      metadata: { variants: args.variants, statisticalSignificanceClaimed: false },
    });
    return { experimentId: experiment._id, status: "COMPLETED" as const };
  },
});

export const ensureAttemptTraceInternal = internalMutation({
  args: { workflowRunId: v.id("workflowRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run) throw new Error("Attempt not found.");
    return ensureAttemptTrace(ctx, run);
  },
});

export const recordObservationInternal = internalMutation({
  args: { workflowRunId: v.id("workflowRuns"), observation: v.any() },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run) throw new Error("Attempt not found.");
    const trace = await ensureAttemptTrace(ctx, run);
    return recordTraceObservation(ctx, trace, args.observation);
  },
});

export const finishAttemptTraceInternal = internalMutation({
  args: {
    workflowRunId: v.id("workflowRuns"),
    status: v.union(v.literal("COMPLETED"), v.literal("FAILED"), v.literal("CANCELED")),
    completedAt: v.number(),
    failureReason: v.optional(v.string()),
    output: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.workflowRunId);
    if (!run) throw new Error("Attempt not found.");
    return finishAttemptTrace(ctx, run, args);
  },
});

export const completeDeterministicExperimentInternal = internalMutation({
  args: {
    experimentId: v.id("experiments"),
    samples: v.array(v.object({
      variantId: v.id("experimentVariants"),
      success: v.boolean(),
      durationMs: v.number(),
      costUsd: v.number(),
      score: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const experiment = await ctx.db.get(args.experimentId);
    if (!experiment) throw new Error("Experiment not found.");
    const variants = await ctx.db.query("experimentVariants")
      .withIndex("by_experiment", (q) => q.eq("experimentId", experiment._id))
      .collect();
    const variantIds = new Set(variants.map((variant) => String(variant._id)));
    if (variants.length !== 2 || args.samples.some((sample) => !variantIds.has(String(sample.variantId)))) {
      throw new Error("Experiment samples must target the two attributed variants.");
    }
    if (variants.some((variant) => !args.samples.some((sample) => sample.variantId === variant._id))) {
      throw new Error("Every experiment variant requires at least one sample.");
    }
    const comparison = compareExperimentVariants(variants.map((variant) => ({
      name: variant.name,
      samples: args.samples.filter((sample) => sample.variantId === variant._id),
    })));
    const now = Date.now();
    for (const [index, result] of comparison.entries()) {
      await ctx.db.patch(variants[index]._id, { sampleSize: result.sampleSize, metrics: result.metrics, completedAt: now });
    }
    await ctx.db.patch(experiment._id, { status: "COMPLETED", completedAt: now, metadata: { deterministicFixture: true } });
    await recordActivity(ctx, {
      tenantId: experiment.tenantId,
      projectId: experiment.projectId,
      actorType: "SYSTEM",
      actorId: "system:deterministic-experiment",
      action: "EVAL_EXPERIMENT_COMPLETED",
      description: `Completed deterministic experiment ${experiment.name}`,
      targetType: "EVAL_EXPERIMENT",
      targetId: String(experiment._id),
      metadata: { comparison },
    });
    return comparison;
  },
});

export const recordFixtureJudgeInternal = internalMutation({
  args: {
    traceId: v.id("traces"),
    observationId: v.optional(v.id("traceObservations")),
    evalDefinitionId: v.id("evalDefinitions"),
    rubric: v.string(),
    rubricVersion: v.string(),
    score: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const [trace, definition] = await Promise.all([ctx.db.get(args.traceId), ctx.db.get(args.evalDefinitionId)]);
    if (!trace || !definition || definition.projectId !== trace.projectId || !definition.enabled || definition.evaluatorType !== "LLM_JUDGE") {
      throw new Error("Fixture judge scope is invalid.");
    }
    if ((args.observationId && definition.scope !== "OBSERVATION")
      || (!args.observationId && definition.scope !== "TRACE" && definition.scope !== "ATTEMPT")) {
      throw new Error("Fixture judge definition scope does not match its target.");
    }
    const result = evaluateFixtureJudge(args);
    const evaluatorObservation = await recordTraceObservation(ctx, trace, {
      idempotencyKey: `evaluator:${definition.key}:${definition.version}:${args.rubricVersion}`,
      parentObservationId: args.observationId,
      type: "EVALUATOR",
      name: definition.name,
      startedAt: Date.now(),
      endedAt: Date.now(),
      status: "SUCCESS",
      input: { rubric: args.rubric, rubricVersion: args.rubricVersion },
      output: { score: result.value, reason: result.reason },
      promptVersion: args.rubricVersion,
      metadata: { fixture: true, liveModelCall: false },
    });
    const score = await insertEvalScore(ctx, {
      projectId: trace.projectId,
      tenantId: trace.tenantId,
      definition,
      traceId: trace._id,
      observationId: evaluatorObservation._id,
      workflowRunId: trace.workflowRunId,
      value: result.value,
      reason: result.reason,
      evaluator: { type: "LLM_JUDGE", model: "fixture-judge", version: result.evaluatorVersion },
      createdBy: "system:fixture-judge",
      idempotencyKey: `fixture-judge:${trace._id}:${definition._id}:${result.evaluatorVersion}`,
    });
    await recordActivity(ctx, {
      tenantId: trace.tenantId,
      projectId: trace.projectId,
      actorType: "SYSTEM",
      actorId: "system:fixture-judge",
      action: "EVAL_SCORE_RECORDED",
      description: `Recorded fixture judge score for ${definition.name}`,
      targetType: "EVAL_SCORE",
      targetId: String(score?._id),
      metadata: { traceId: trace._id, observationId: evaluatorObservation._id, evalDefinitionId: definition._id },
    });
    return score;
  },
});


function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function assertScoreValue(type: string, value: number | boolean | string) {
  if (type === "NUMERIC" && typeof value !== "number") throw new Error("Numeric evaluator requires a number.");
  if (type === "BOOLEAN" && typeof value !== "boolean") throw new Error("Boolean evaluator requires true or false.");
  if ((type === "CATEGORICAL" || type === "TEXT") && typeof value !== "string") {
    throw new Error(`${type === "TEXT" ? "Text" : "Categorical"} evaluator requires a string.`);
  }
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Eval score must be finite.");
}
