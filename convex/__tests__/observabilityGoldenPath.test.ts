import { describe, expect, it } from "vitest";
import {
  aggregateTraceMetrics,
  compareExperimentVariants,
  evaluateDurationThreshold,
  evaluateFixtureJudge,
  mapRunEventToObservation,
  normalizeTokenUsage,
  sanitizeTraceValue,
} from "../lib/observability";
import { ensureAttemptTrace, finishAttemptTrace, recordTraceObservation } from "../lib/observabilityPersistence";
import {
  backfillAttemptTraces,
  createExperiment,
  getWorkspaceDashboard,
  promoteTraceToDataset,
  recordExperimentOutcome,
  runDurationEvaluator,
} from "../observability";

function functionHandler<T extends (...args: any[]) => any>(registered: unknown): T {
  return (registered as { _handler: T })._handler;
}

function createDb(initial: Record<string, any[]> = {}) {
  const tables: Record<string, any[]> = { traces: [], traceObservations: [], ...initial };
  let sequence = 1;
  const db = {
    get: async (id: string) => Object.values(tables).flat().find((row) => row._id === id) ?? null,
    insert: async (table: string, value: any) => {
      const id = `${table}-${sequence++}`;
      (tables[table] ??= []).push({ _id: id, _creationTime: sequence, ...value });
      return id;
    },
    patch: async (id: string, patch: any) => {
      const row = Object.values(tables).flat().find((item) => item._id === id);
      if (!row) throw new Error(`Missing ${id}`);
      Object.assign(row, patch);
    },
    query: (table: string) => {
      let rows = [...(tables[table] ?? [])];
      const builder: any = {
        withIndex: (_name: string, apply: (q: any) => any) => {
          const conditions: Array<[string, unknown]> = [];
          const q: any = { eq: (field: string, value: unknown) => { conditions.push([field, value]); return q; } };
          apply(q);
          rows = rows.filter((row) => conditions.every(([field, value]) => row[field] === value));
          return builder;
        },
        order: (direction: string) => {
          rows.sort((a, b) => ((a.startedAt ?? a.createdAt ?? a._creationTime) - (b.startedAt ?? b.createdAt ?? b._creationTime)) * (direction === "desc" ? -1 : 1));
          return builder;
        },
        first: async () => rows[0] ?? null,
        collect: async () => [...rows],
        take: async (count: number) => rows.slice(0, count),
      };
      return builder;
    },
  };
  return { db, tables };
}

describe("observability golden path", () => {
  it("fails public trace reads and dataset promotion closed for anonymous callers", async () => {
    const originalDemoFlag = process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
    delete process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
    try {
      const project = { _id: "project-1", tenantId: "tenant-1", name: "Factory", slug: "factory" };
      const trace = {
        _id: "trace-1", projectId: project._id, tenantId: project.tenantId,
        traceKey: "trace-1", externalTraceId: "1234567890abcdef", purpose: "SOFTWARE",
        name: "Unauthorized trace", status: "RUNNING", startedAt: 1, createdAt: 1, updatedAt: 1,
      };
      const { db } = createDb({ projects: [project], traces: [trace] });
      const ctx = { db, auth: { getUserIdentity: async () => null } } as any;

      await expect(functionHandler(getWorkspaceDashboard)(ctx, { projectId: project._id }))
        .rejects.toThrow(/unavailable or unauthorized/);
      await expect(functionHandler(promoteTraceToDataset)(ctx, { traceId: trace._id }))
        .rejects.toThrow(/unavailable or unauthorized/);
      await expect(functionHandler(backfillAttemptTraces)(ctx, { projectId: project._id }))
        .rejects.toThrow(/unavailable or unauthorized/);
    } finally {
      if (originalDemoFlag === undefined) delete process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
      else process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT = originalDemoFlag;
    }
  });

  it("persists Codex and Loom Attempts with nested, redacted observations", async () => {
    const run = {
      _id: "run-codex", projectId: "project-1", tenantId: "tenant-1", workOrderId: "wo-1",
      runId: "attempt-1", workflowId: "loom-delivery", status: "RUNNING", startedAt: 1_000,
      executorAdapter: "codex", executorVersion: "v1", model: "gpt-5", initialInput: "Build the approved change",
      context: { task: "bounded task", apiKey: "must-not-persist" },
    };
    const loomRun = { ...run, _id: "run-loom", runId: "attempt-2", executorAdapter: "loom", model: "claude-sonnet" };
    const canceledRun = {
      ...run,
      _id: "run-canceled",
      runId: "attempt-3",
      status: "CANCELED",
      completedAt: 12_000,
    };
    const { db, tables } = createDb({ workflowRuns: [run, loomRun, canceledRun], factoryDefinitionVersions: [] });
    const trace = await ensureAttemptTrace({ db }, run);
    const planning = await recordTraceObservation({ db }, trace, {
      idempotencyKey: "planning", type: "AGENT", name: "Planning", startedAt: 1_100, endedAt: 2_000, status: "SUCCESS",
    });
    const generation = await recordTraceObservation({ db }, trace, {
      idempotencyKey: "planning-generation", parentObservationId: planning._id, type: "GENERATION", name: "Plan model call",
      startedAt: 1_200, endedAt: 1_800, status: "SUCCESS", model: "gpt-5", provider: "openai",
      tokenUsage: { input: 100, output: 50 }, input: { authorization: "Bearer secret-value", prompt: "safe" },
    });
    await recordTraceObservation({ db }, trace, {
      idempotencyKey: "tool-test", parentObservationId: planning._id, type: "TOOL", name: "pnpm test",
      toolName: "shell", startedAt: 1_800, endedAt: 2_100, status: "SUCCESS", output: { exitCode: 0 },
    });
    const repeatedTool = await recordTraceObservation({ db }, trace, {
      idempotencyKey: "tool-test", parentObservationId: planning._id, type: "EVENT", name: "renamed duplicate",
      startedAt: 50, status: "RUNNING",
    });
    await recordTraceObservation({ db }, trace, {
      idempotencyKey: "verification", type: "EVALUATOR", name: "Independent verification",
      verificationRunId: "verification-1", evidenceEnvelopeIds: ["evidence-1"],
      startedAt: 8_000, endedAt: 9_000, status: "SUCCESS", output: { verdict: "VERIFIED" },
    });
    await finishAttemptTrace({ db }, run, { status: "COMPLETED", completedAt: 11_000, output: { pullRequest: 42 } });

    const loomTrace = await ensureAttemptTrace({ db }, loomRun);
    await recordTraceObservation({ db }, loomTrace, {
      idempotencyKey: "loom-worker", type: "AGENT", name: "Loom story worker", startedAt: 2_000, status: "RUNNING",
      metadata: { adapter: "loom", boundaryVersion: "v1" },
    });
    const canceledTrace = await ensureAttemptTrace({ db }, canceledRun);
    const canceledRoot = tables.traceObservations.find((row) =>
      row.traceId === canceledTrace._id && row.idempotencyKey === "attempt-root"
    );

    expect(run.primaryTraceId).toBe(trace._id);
    expect(tables.traces).toHaveLength(3);
    expect((await db.get(trace._id)).status).toBe("SUCCESS");
    expect(generation.parentObservationId).toBe(planning._id);
    expect(repeatedTool).toMatchObject({ type: "TOOL", name: "pnpm test", startedAt: 1_800, status: "SUCCESS", endedAt: 2_100 });
    await expect(recordTraceObservation({ db }, trace, {
      idempotencyKey: "planning", parentObservationId: generation._id, type: "AGENT", name: "Planning",
      startedAt: 1_100, endedAt: 2_000, status: "SUCCESS",
    })).rejects.toThrow(/create a cycle/);
    await expect(recordTraceObservation({ db }, loomTrace, {
      idempotencyKey: "cross-trace-child", parentObservationId: planning._id, type: "EVENT", name: "Invalid parent",
    })).rejects.toThrow(/same trace/);
    expect(JSON.stringify(generation.input)).not.toContain("secret-value");
    expect(tables.traceObservations.find((row) => row.verificationRunId === "verification-1")?.evidenceEnvelopeIds).toEqual(["evidence-1"]);
    expect(tables.traceObservations.find((row) => row.traceId === loomTrace._id)?.name).toContain("Attempt");
    expect(tables.traceObservations.some((row) => row.name === "Loom story worker")).toBe(true);
    expect(canceledTrace.status).toBe("CANCELED");
    expect(canceledRoot?.status).toBe("FAILED");
  });

  it("backfills existing Attempts with authorization, bounded idempotency, and audit history", async () => {
    const previousDemoFlag = process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
    const previousDeploymentClass = process.env.MC_BACKEND_DEPLOYMENT_CLASS;
    process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT = "1";
    process.env.MC_BACKEND_DEPLOYMENT_CLASS = "local";
    try {
      const tenant = { _id: "tenant-1", active: true };
      const project = { _id: "project-1", tenantId: tenant._id, name: "Factory", slug: "factory" };
      const run = {
        _id: "run-existing", _creationTime: 100, projectId: project._id, tenantId: tenant._id,
        runId: "attempt-existing", workflowId: "delivery", status: "COMPLETED", startedAt: 1_000,
        completedAt: 2_000, initialInput: "Existing approved Attempt",
      };
      const event = {
        _id: "event-1", _creationTime: 110, workflowRunId: run._id, idempotencyKey: "retry-existing",
        eventType: "RETRY_STARTED", status: "RUNNING", startedAt: 1_200, sequenceNumber: 1,
      };
      const { db, tables } = createDb({
        tenants: [tenant], projects: [project], workflowRuns: [run], runEvents: [event],
        activities: [], factoryDefinitionVersions: [],
      });
      const ctx = { db, auth: { getUserIdentity: async () => null } } as any;

      const first = await functionHandler(backfillAttemptTraces)(ctx, { projectId: project._id });
      const second = await functionHandler(backfillAttemptTraces)(ctx, { projectId: project._id });

      expect(first).toMatchObject({ runsScanned: 1, tracesCreated: 1, observationsCreated: 1 });
      expect(second).toMatchObject({ runsScanned: 1, tracesCreated: 0, observationsCreated: 0 });
      expect(tables.traces).toHaveLength(1);
      expect(tables.traceObservations.filter((row) => row.idempotencyKey === "run-event:retry-existing")).toHaveLength(1);
      expect(tables.activities).toHaveLength(2);
      expect(tables.activities[0]).toMatchObject({ action: "OBSERVABILITY_ATTEMPTS_BACKFILLED", actorType: "HUMAN" });
    } finally {
      if (previousDemoFlag === undefined) delete process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
      else process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT = previousDemoFlag;
      if (previousDeploymentClass === undefined) delete process.env.MC_BACKEND_DEPLOYMENT_CLASS;
      else process.env.MC_BACKEND_DEPLOYMENT_CLASS = previousDeploymentClass;
    }
  });

  it("keeps deterministic scores reproducible and rejects cross-workspace experiment variants", async () => {
    const previousDemoFlag = process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
    const previousDeploymentClass = process.env.MC_BACKEND_DEPLOYMENT_CLASS;
    process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT = "1";
    process.env.MC_BACKEND_DEPLOYMENT_CLASS = "local";
    try {
      const tenant = { _id: "tenant-1", active: true };
      const project = { _id: "project-1", tenantId: tenant._id, name: "Factory", slug: "factory" };
      const trace = {
        _id: "trace-1", tenantId: tenant._id, projectId: project._id, traceKey: "trace-1",
        externalTraceId: "1234567890abcdef", purpose: "SOFTWARE", name: "Completed trace",
        status: "SUCCESS", startedAt: 1_000, endedAt: 10_000, durationMs: 9_000, createdAt: 1_000, updatedAt: 10_000,
      };
      const durationDefinition = {
        _id: "definition-duration", tenantId: tenant._id, projectId: project._id, key: "duration",
        name: "Duration threshold", scope: "TRACE", evaluatorType: "DETERMINISTIC", scoreType: "BOOLEAN",
        configuration: { thresholdMs: 10_000 }, enabled: true, version: 1, createdBy: "operator", createdAt: 1,
      };
      const experimentDefinition = {
        ...durationDefinition, _id: "definition-experiment", key: "quality", name: "Quality", scope: "EXPERIMENT",
        scoreType: "NUMERIC",
      };
      const dataset = {
        _id: "dataset-1", tenantId: tenant._id, projectId: project._id, name: "Regression", version: 2,
        createdBy: "operator", createdAt: 1, updatedAt: 1,
      };
      const foreignVersion = { _id: "factory-version-foreign", projectId: "project-2", factoryDefinitionId: "factory-2" };
      const { db, tables } = createDb({
        tenants: [tenant], projects: [project], traces: [trace],
        evalDefinitions: [durationDefinition, experimentDefinition], evalScores: [], evalDatasets: [dataset],
        experiments: [], experimentVariants: [], factoryDefinitionVersions: [foreignVersion], activities: [],
      });
      const ctx = { db, auth: { getUserIdentity: async () => null } } as any;

      const first = await functionHandler(runDurationEvaluator)(ctx, {
        traceId: trace._id, evalDefinitionId: durationDefinition._id, thresholdMs: 10_000,
      });
      const second = await functionHandler(runDurationEvaluator)(ctx, {
        traceId: trace._id, evalDefinitionId: durationDefinition._id, thresholdMs: 10_000,
      });
      expect(first?._id).toBe(second?._id);
      expect(tables.evalScores).toHaveLength(1);
      expect(first).toMatchObject({ evaluator: { type: "DETERMINISTIC", version: "duration-threshold/v1" }, value: true });
      await expect(functionHandler(runDurationEvaluator)(ctx, {
        traceId: trace._id, evalDefinitionId: durationDefinition._id, thresholdMs: 9_999,
      })).rejects.toThrow(/immutable evaluator definition/);

      await expect(functionHandler(createExperiment)(ctx, {
        projectId: project._id,
        datasetId: dataset._id,
        name: "Cross-workspace comparison",
        evalDefinitionIds: [experimentDefinition._id],
        variants: [
          { name: "Local", model: "gpt-local" },
          { name: "Foreign", factoryDefinitionVersionId: foreignVersion._id },
        ],
      })).rejects.toThrow(/belong to the workspace/);
      expect(tables.experiments).toHaveLength(0);
    } finally {
      if (previousDemoFlag === undefined) delete process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
      else process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT = previousDemoFlag;
      if (previousDeploymentClass === undefined) delete process.env.MC_BACKEND_DEPLOYMENT_CLASS;
      else process.env.MC_BACKEND_DEPLOYMENT_CLASS = previousDeploymentClass;
    }
  });

  it("keeps deterministic, judge, experiment, and aggregate results attributable", () => {
    expect(evaluateDurationThreshold({ durationMs: 9_000, thresholdMs: 10_000 }).value).toBe(true);
    expect(() => evaluateDurationThreshold({ durationMs: 9_000, thresholdMs: 0 })).toThrow(/positive finite threshold/);
    expect(evaluateFixtureJudge({ rubric: "Assess planning quality", rubricVersion: "v4", score: 0.93, reason: "Complete and bounded." }))
      .toMatchObject({ value: 0.93, evaluatorVersion: "v4" });
    expect(() => evaluateFixtureJudge({ rubric: "x", rubricVersion: "latest", score: 1, reason: "x" })).toThrow(/versioned rubric/);

    const variants = compareExperimentVariants([
      { name: "Factory v14", samples: [{ success: false, durationMs: 14_000, costUsd: 4, score: 0.8 }] },
      { name: "Factory v15", samples: [{ success: true, durationMs: 8_000, costUsd: 2, score: 0.95 }] },
    ]);
    expect(variants[1]).toMatchObject({ sampleSize: 1, metrics: { successRate: 1, averageScore: 0.95 } });
    expect(aggregateTraceMetrics([
      { status: "SUCCESS", durationMs: 8_000, estimatedCostUsd: 2, tokenUsage: { total: 100 }, humanInterventionCount: 0 },
      { status: "FAILED", durationMs: 14_000, estimatedCostUsd: 4, tokenUsage: { total: 200 }, humanInterventionCount: 1 },
    ])).toMatchObject({ attempts: 2, successRate: 0.5, averageCostUsd: 3, averageTokens: 150, humanInterventionRate: 0.5 });
    expect(normalizeTokenUsage({ input: 100, output: 50, cached: 40 })).toEqual({ input: 100, output: 50, cached: 40, total: 150 });
    expect(normalizeTokenUsage({ cached: 40 })).toEqual({ cached: 40 });
    expect(mapRunEventToObservation({ eventType: "RETRY_STARTED", status: "RUNNING", startedAt: 1_000 }))
      .toMatchObject({ type: "EVENT", status: "RUNNING", level: "WARNING" });
    expect(sanitizeTraceValue({
      password: "secret",
      omitted: undefined,
      values: ["safe", undefined],
      nested: {
        token: "abc",
        message: "authorization: top-secret",
        log: "provider returned sk-fixturesecret123456",
      },
    })).toEqual({
      password: "[REDACTED]",
      values: ["safe"],
      nested: { token: "[REDACTED]", message: "authorization=[REDACTED]", log: "provider returned [REDACTED]" },
    });
  });

  it("records bounded human experiment outcomes without a significance claim", async () => {
    const previousDemoFlag = process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
    const previousDeploymentClass = process.env.MC_BACKEND_DEPLOYMENT_CLASS;
    process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT = "1";
    process.env.MC_BACKEND_DEPLOYMENT_CLASS = "local";
    try {
      const tenant = { _id: "tenant-1", active: true };
      const project = { _id: "project-1", tenantId: tenant._id, name: "Factory", slug: "factory" };
      const experiment = {
        _id: "experiment-1", tenantId: tenant._id, projectId: project._id,
        datasetId: "dataset-1", datasetVersion: 2, name: "Learning comparison",
        status: "DRAFT", evalDefinitionIds: ["eval-1"], createdBy: "operator", createdAt: 1,
      };
      const variants = [
        { _id: "variant-1", projectId: project._id, experimentId: experiment._id, name: "Current baseline", sampleSize: 0, createdAt: 1 },
        { _id: "variant-2", projectId: project._id, experimentId: experiment._id, name: "Proposed candidate", sampleSize: 0, createdAt: 1 },
      ];
      const { db, tables } = createDb({ tenants: [tenant], projects: [project], experiments: [experiment], experimentVariants: variants, activities: [] });
      const ctx = { db, auth: { getUserIdentity: async () => null } } as any;

      await functionHandler(recordExperimentOutcome)(ctx, {
        experimentId: experiment._id,
        variants: [
          { variantId: variants[0]._id, sampleSize: 8, successCount: 5, averageDurationMs: 12_000, averageCostUsd: 3 },
          { variantId: variants[1]._id, sampleSize: 8, successCount: 7, averageDurationMs: 9_000, averageCostUsd: 2 },
        ],
      });

      expect(experiment).toMatchObject({ status: "COMPLETED", metadata: { statisticalSignificanceClaimed: false } });
      expect(variants[1]).toMatchObject({ sampleSize: 8, metrics: { successRate: 0.875, averageCostUsd: 2 } });
      expect(tables.activities[0]).toMatchObject({ action: "EVAL_EXPERIMENT_OUTCOME_RECORDED", actorType: "HUMAN" });
      await expect(functionHandler(recordExperimentOutcome)(ctx, {
        experimentId: experiment._id,
        variants: [
          { variantId: variants[0]._id, sampleSize: 1, successCount: 1 },
          { variantId: variants[1]._id, sampleSize: 1, successCount: 1 },
        ],
      })).rejects.toThrow(/cannot be overwritten/);
    } finally {
      if (previousDemoFlag === undefined) delete process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
      else process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT = previousDemoFlag;
      if (previousDeploymentClass === undefined) delete process.env.MC_BACKEND_DEPLOYMENT_CLASS;
      else process.env.MC_BACKEND_DEPLOYMENT_CLASS = previousDeploymentClass;
    }
  });
});
