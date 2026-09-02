/**
 * Receipt-first evaluation control plane.
 *
 * These records are diagnostic evidence only. They cannot approve Plans,
 * dispatch WorkOrders, accept delivery, merge code, or publish releases.
 */

import {
  MISSION_CONTROL_GOLDEN_SUITE_V1,
  buildEvalBaseline,
  evaluateSuiteRun,
  evalSuiteDigest,
  publicEvalSuite,
  validateEvalBaseline,
  validateEvalReceipt,
  type EvalBaseline,
  type EvalRunProvenance,
  type EvalRunReceipt,
  type EvalSuiteCaseDefinition,
  type EvalSuiteDefinition,
} from "@mission-control/shared";
import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { FACTORY_PERMISSIONS, requireWorkspacePermission } from "./lib/companyAccess";

const runStatus = v.union(
  v.literal("QUEUED"),
  v.literal("RUNNING"),
  v.literal("COMPLETED"),
  v.literal("FAILED"),
  v.literal("CANCELED")
);
const failureOrigin = v.union(
  v.literal("HARNESS"),
  v.literal("JUDGE"),
  v.literal("DATA"),
  v.literal("INFRASTRUCTURE")
);
const provenance = v.object({
  repository: v.string(),
  revision: v.string(),
  baseRevision: v.optional(v.string()),
  adapter: v.object({
    id: v.string(),
    version: v.string(),
    digest: v.string(),
  }),
  runtime: v.object({
    name: v.string(),
    version: v.string(),
  }),
  model: v.optional(v.object({
    provider: v.string(),
    id: v.string(),
    version: v.string(),
  })),
  promptDigest: v.optional(v.string()),
  rubricDigest: v.optional(v.string()),
  datasetDigest: v.string(),
  resolvedConfigDigest: v.string(),
  seed: v.string(),
  artifacts: v.array(v.object({ path: v.string(), digest: v.string() })),
});
const outcome = v.object({
  caseKey: v.string(),
  status: v.union(v.literal("SCORED"), v.literal("ERROR"), v.literal("SKIPPED")),
  actual: v.optional(v.any()),
  failureOrigin: v.optional(failureOrigin),
  error: v.optional(v.string()),
  durationMs: v.optional(v.number()),
  costUsd: v.optional(v.number()),
  evidenceRefs: v.array(v.string()),
});

type EvalDbCtx = Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">;

function storedCaseDefinition(testCase: Doc<"evalSuiteCases">): EvalSuiteCaseDefinition {
  if (testCase.definition) {
    return testCase.definition as EvalSuiteCaseDefinition;
  }

  return {
    key: testCase.key,
    name: testCase.name,
    description: testCase.description ?? "",
    severity: testCase.severity,
    slices: testCase.slices ?? [],
    publicInput: testCase.publicInput ?? {},
    sealedAssertions: testCase.sealedAssertions ?? [],
    negativeControl: testCase.negativeControl as EvalSuiteCaseDefinition["negativeControl"],
  };
}

async function loadSuiteDefinition(
  ctx: EvalDbCtx,
  suite: Doc<"evalSuites">
): Promise<{ definition: EvalSuiteDefinition; cases: Doc<"evalSuiteCases">[] }> {
  const cases = await ctx.db
    .query("evalSuiteCases")
    .withIndex("by_suite", (q) => q.eq("suiteId", suite._id))
    .collect();
  cases.sort((left, right) => left.ordinal - right.ordinal);
  const definition = {
    schemaVersion: suite.schemaVersion,
    key: suite.key,
    name: suite.name,
    description: suite.description,
    version: suite.version,
    invalidRatioLimit: suite.invalidRatioLimit,
    cases: cases.map(storedCaseDefinition),
  } as EvalSuiteDefinition;
  if (evalSuiteDigest(definition) !== suite.suiteDigest) {
    throw new Error("Stored eval suite does not match its immutable digest.");
  }
  return { definition, cases };
}

async function audit(ctx: Pick<MutationCtx, "db">, input: {
  tenantId?: Id<"tenants">;
  projectId: Id<"projects">;
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
    actorType: "HUMAN",
    actorId: input.actorId,
    action: input.action,
    description: input.description,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: input.metadata,
  });
}

export const getDashboard = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    const suites = await ctx.db
      .query("evalSuites")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    suites.sort((left, right) => Number(right.active) - Number(left.active) || right.version - left.version);
    const caseCounts = await Promise.all(suites.map(async (suite) => ({
      suiteId: suite._id,
      count: (await ctx.db.query("evalSuiteCases").withIndex("by_suite", (q) => q.eq("suiteId", suite._id)).collect()).length,
    })));
    const caseCountBySuite = new Map(caseCounts.map((row) => [String(row.suiteId), row.count]));
    const activeSuite = suites.find((suite) => suite.active) ?? suites[0] ?? null;
    const activeBaseline = activeSuite
      ? await ctx.db.query("evalBaselines").withIndex("by_suite_active", (q) => q.eq("suiteId", activeSuite._id).eq("active", true)).first()
      : null;
    const runs = await ctx.db
      .query("evalControlRuns")
      .withIndex("by_project_started", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(50);
    const recentRuns = await Promise.all(runs.slice(0, 12).map(async (run) => {
      const [receipt, results] = await Promise.all([
        ctx.db.query("evalRunReceipts").withIndex("by_run", (q) => q.eq("runId", run._id)).first(),
        ctx.db.query("evalCaseResults").withIndex("by_run", (q) => q.eq("runId", run._id)).collect(),
      ]);
      results.sort((left, right) => left.caseKey.localeCompare(right.caseKey));
      return {
        ...run,
        metrics: (receipt?.receipt as EvalRunReceipt | undefined)?.metrics ?? null,
        regressions: (receipt?.receipt as EvalRunReceipt | undefined)?.regressions ?? [],
        accountingErrors: (receipt?.receipt as EvalRunReceipt | undefined)?.accountingErrors ?? [],
        results: results.map((result) => result.result),
      };
    }));

    return {
      suites: suites.map((suite) => ({ ...suite, caseCount: caseCountBySuite.get(String(suite._id)) ?? 0 })),
      activeSuite: activeSuite ? { ...activeSuite, caseCount: caseCountBySuite.get(String(activeSuite._id)) ?? 0 } : null,
      activeBaseline,
      latestRun: recentRuns[0] ?? null,
      recentRuns,
      health: {
        invalidRuns: runs.filter((run) => run.verdict === "INVALID").length,
        failedRuns: runs.filter((run) => run.verdict === "FAIL").length,
        publishableRuns: runs.filter((run) => run.publishable).length,
        totalRuns: runs.length,
      },
      authority: {
        releaseBlocking: false,
        acceptanceAuthority: false,
      },
    };
  },
});

export const getPublicSuite = query({
  args: { projectId: v.id("projects"), suiteId: v.id("evalSuites") },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    const suite = await ctx.db.get(args.suiteId);
    if (!suite || suite.projectId !== args.projectId) throw new Error("Eval suite is unavailable or unauthorized.");
    const { definition } = await loadSuiteDefinition(ctx, suite);
    return publicEvalSuite(definition);
  },
});

export const installGoldenSuiteV1 = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.IMPROVE);
    const definition = MISSION_CONTROL_GOLDEN_SUITE_V1;
    const existing = await ctx.db
      .query("evalSuites")
      .withIndex("by_project_key_version", (q) => q
        .eq("projectId", args.projectId)
        .eq("key", definition.key)
        .eq("version", definition.version))
      .first();
    if (existing) return { suiteId: existing._id, created: false };

    const priorVersions = await ctx.db
      .query("evalSuites")
      .withIndex("by_project_key", (q) => q.eq("projectId", args.projectId).eq("key", definition.key))
      .collect();
    for (const prior of priorVersions) {
      if (prior.active) await ctx.db.patch(prior._id, { active: false });
    }
    const now = Date.now();
    const tenantId = access.project.tenantId;
    const suiteId = await ctx.db.insert("evalSuites", {
      tenantId,
      projectId: args.projectId,
      schemaVersion: definition.schemaVersion,
      key: definition.key,
      name: definition.name,
      description: definition.description,
      version: definition.version,
      suiteDigest: evalSuiteDigest(definition),
      invalidRatioLimit: definition.invalidRatioLimit,
      active: true,
      createdBy: access.actorId,
      createdAt: now,
    });
    for (const [ordinal, testCase] of definition.cases.entries()) {
      await ctx.db.insert("evalSuiteCases", {
        tenantId,
        projectId: args.projectId,
        suiteId,
        key: testCase.key,
        name: testCase.name,
        severity: testCase.severity,
        definition: testCase,
        ordinal,
        createdAt: now,
      });
    }
    await audit(ctx, {
      tenantId,
      projectId: args.projectId,
      actorId: access.actorId,
      action: "EVAL_SUITE_INSTALLED",
      description: `Installed ${definition.name} v${definition.version} with ${definition.cases.length} cases`,
      targetType: "EVAL_SUITE",
      targetId: String(suiteId),
      metadata: { suiteDigest: evalSuiteDigest(definition), acceptanceAuthority: false },
    });
    return { suiteId, created: true };
  },
});

export const recordSuiteRun = mutation({
  args: {
    projectId: v.id("projects"),
    suiteId: v.id("evalSuites"),
    baselineId: v.optional(v.id("evalBaselines")),
    runKey: v.string(),
    idempotencyKey: v.string(),
    runStatus,
    provenance,
    outcomes: v.array(outcome),
    startedAt: v.number(),
    finishedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.IMPROVE);
    const existing = await ctx.db
      .query("evalControlRuns")
      .withIndex("by_project_idempotency", (q) => q.eq("projectId", args.projectId).eq("idempotencyKey", args.idempotencyKey))
      .first();
    if (existing) {
      const existingReceipt = await ctx.db.query("evalRunReceipts").withIndex("by_run", (q) => q.eq("runId", existing._id)).first();
      return { runId: existing._id, receipt: existingReceipt?.receipt ?? null, created: false };
    }
    if (!args.runKey.trim() || !args.idempotencyKey.trim()) throw new Error("Run key and idempotency key are required.");
    if (args.finishedAt < args.startedAt) throw new Error("Eval run finish time cannot precede its start time.");
    const suite = await ctx.db.get(args.suiteId);
    if (!suite || suite.projectId !== args.projectId) throw new Error("Eval suite is unavailable or unauthorized.");
    const { definition, cases } = await loadSuiteDefinition(ctx, suite);
    let baselineDoc: Doc<"evalBaselines"> | null = null;
    if (args.baselineId) {
      baselineDoc = await ctx.db.get(args.baselineId);
      if (!baselineDoc || baselineDoc.projectId !== args.projectId || baselineDoc.suiteId !== args.suiteId) {
        throw new Error("Eval baseline is unavailable or does not belong to this suite.");
      }
    } else {
      baselineDoc = await ctx.db
        .query("evalBaselines")
        .withIndex("by_suite_active", (q) => q.eq("suiteId", args.suiteId).eq("active", true))
        .first();
    }
    const baseline = baselineDoc?.baseline as EvalBaseline | undefined;
    if (baseline) {
      const findings = validateEvalBaseline(baseline);
      if (findings.length > 0) throw new Error(`Stored eval baseline is invalid: ${findings.join(" ")}`);
    }
    const receipt = evaluateSuiteRun({
      suite: definition,
      baseline,
      runId: args.runKey,
      idempotencyKey: args.idempotencyKey,
      runStatus: args.runStatus,
      provenance: args.provenance as EvalRunProvenance,
      outcomes: args.outcomes,
      startedAt: new Date(args.startedAt).toISOString(),
      finishedAt: new Date(args.finishedAt).toISOString(),
    });
    const receiptFindings = validateEvalReceipt(receipt);
    if (receiptFindings.length > 0) throw new Error(`Eval receipt failed integrity validation: ${receiptFindings.join(" ")}`);
    const persistedReceipt = JSON.parse(JSON.stringify(receipt)) as EvalRunReceipt;
    const tenantId = access.project.tenantId;
    const now = Date.now();
    const runId = await ctx.db.insert("evalControlRuns", {
      tenantId,
      projectId: args.projectId,
      suiteId: args.suiteId,
      baselineId: baselineDoc?._id,
      runKey: args.runKey,
      idempotencyKey: args.idempotencyKey,
      status: args.runStatus,
      verdict: receipt.verdict,
      publishable: receipt.publishable,
      releaseBlocking: false,
      acceptanceAuthority: false,
      provenance: persistedReceipt.provenance,
      startedAt: args.startedAt,
      finishedAt: args.finishedAt,
      receiptDigest: receipt.receiptDigest,
      createdBy: access.actorId,
      createdAt: now,
    });
    const caseByKey = new Map(cases.map((testCase) => [testCase.key, testCase]));
    for (const result of persistedReceipt.results) {
      await ctx.db.insert("evalCaseResults", {
        tenantId,
        projectId: args.projectId,
        runId,
        suiteCaseId: caseByKey.get(result.caseKey)?._id,
        caseKey: result.caseKey,
        verdict: result.verdict,
        result,
        createdAt: now,
      });
    }
    await ctx.db.insert("evalRunReceipts", {
      tenantId,
      projectId: args.projectId,
      suiteId: args.suiteId,
      runId,
      receiptDigest: receipt.receiptDigest,
      verdict: receipt.verdict,
      publishable: receipt.publishable,
      releaseBlocking: false,
      acceptanceAuthority: false,
      receipt: persistedReceipt,
      createdAt: now,
    });
    await audit(ctx, {
      tenantId,
      projectId: args.projectId,
      actorId: access.actorId,
      action: "EVAL_RUN_RECORDED",
      description: `Recorded ${definition.name} run ${args.runKey}: ${receipt.verdict}`,
      targetType: "EVAL_CONTROL_RUN",
      targetId: String(runId),
      metadata: { receiptDigest: receipt.receiptDigest, verdict: receipt.verdict, publishable: receipt.publishable },
    });
    return { runId, receipt: persistedReceipt, created: true };
  },
});

export const promoteRunToBaseline = mutation({
  args: {
    projectId: v.id("projects"),
    runId: v.id("evalControlRuns"),
    baselineId: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.IMPROVE);
    const reason = args.reason.trim();
    if (!reason || reason.length > 1_000) throw new Error("Baseline promotion reason must be between 1 and 1,000 characters.");
    if (!args.baselineId.trim()) throw new Error("Baseline id is required.");
    const run = await ctx.db.get(args.runId);
    if (!run || run.projectId !== args.projectId) throw new Error("Eval run is unavailable or unauthorized.");
    const receiptDoc = await ctx.db.query("evalRunReceipts").withIndex("by_run", (q) => q.eq("runId", run._id)).first();
    if (!receiptDoc) throw new Error("Eval run does not have a receipt.");
    const receipt = receiptDoc.receipt as EvalRunReceipt;
    if (!receipt.publishable) throw new Error("Only a complete, publishable eval receipt can become a baseline.");
    const suite = await ctx.db.get(run.suiteId);
    if (!suite) throw new Error("Eval suite no longer exists.");
    const { definition } = await loadSuiteDefinition(ctx, suite);
    const existingId = await ctx.db
      .query("evalBaselines")
      .withIndex("by_project_baseline", (q) => q.eq("projectId", args.projectId).eq("baselineId", args.baselineId.trim()))
      .first();
    if (existingId) throw new Error("Baseline id already exists and baseline contents are immutable.");
    const baseline = buildEvalBaseline({
      baselineId: args.baselineId.trim(),
      suite: definition,
      receipt,
      createdAt: new Date().toISOString(),
    });
    const priorBaselines = await ctx.db
      .query("evalBaselines")
      .withIndex("by_suite_active", (q) => q.eq("suiteId", run.suiteId).eq("active", true))
      .collect();
    for (const prior of priorBaselines) await ctx.db.patch(prior._id, { active: false });
    const now = Date.now();
    const baselineDocId = await ctx.db.insert("evalBaselines", {
      tenantId: access.project.tenantId,
      projectId: args.projectId,
      suiteId: run.suiteId,
      baselineId: baseline.baselineId,
      baselineDigest: baseline.baselineDigest,
      suiteDigest: baseline.suiteDigest,
      sourceReceiptDigest: baseline.sourceReceiptDigest,
      baseline,
      active: true,
      promotionReason: reason,
      createdBy: access.actorId,
      createdAt: now,
    });
    await audit(ctx, {
      tenantId: access.project.tenantId,
      projectId: args.projectId,
      actorId: access.actorId,
      action: "EVAL_BASELINE_PROMOTED",
      description: `Promoted eval run ${run.runKey} to baseline ${baseline.baselineId}`,
      targetType: "EVAL_BASELINE",
      targetId: String(baselineDocId),
      metadata: { reason, sourceReceiptDigest: baseline.sourceReceiptDigest, acceptanceAuthority: false },
    });
    return { baselineId: baselineDocId, baseline };
  },
});
