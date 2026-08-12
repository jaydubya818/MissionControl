/**
 * Harness PR checks — change review lenses + mutation testing synced from PR/CI sources.
 */

import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  buildChangeReviewLenses,
  buildMutationTestingReport,
  assessPrReconciliationCandidate,
  isVerifiedPrLineage,
  isPendingPrReconciliation,
  isProducingAttemptStatus,
  normalizeGitBranch,
  normalizeGitHubRepository,
  recordedPrLineageBranch,
  selectExactPrLineageWorkOrder,
  parseGitHubPrUrl,
  repoFullName,
  type PrCheckSignals,
} from "../lib/harnessPrChecks";
import { computeMergeGates } from "../lib/mergeGates";
import { fetchPullRequestCi } from "../lib/githubCiIngest";
import { mintGithubInstallationToken } from "../lib/githubAppAuth";
import { buildFileChanges } from "../lib/runInspector";
import { mergeAuthoritySatisfied } from "../lib/prEvaluation";
import { FACTORY_PERMISSIONS, requireWorkspacePermission } from "../lib/companyAccess";
import { requireFactoryActionWithAudit } from "../lib/factoryActionAuthorization";

const lensValidator = v.array(
  v.object({
    id: v.string(),
    label: v.string(),
    enabled: v.boolean(),
    score: v.optional(v.number()),
  })
);

export const listForProject = query({
  args: {
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!args.projectId) return [];
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    const rows = await ctx.db
      .query("harnessPrChecks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    rows.sort((a, b) => b.syncedAt - a.syncedAt);
    return rows.slice(0, args.limit ?? 20);
  },
});

export const getLatest = query({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    if (!args.projectId) return null;
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    const rows = await ctx.db
      .query("harnessPrChecks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    rows.sort((a, b) => b.syncedAt - a.syncedAt);
    return rows[0] ?? null;
  },
});

export const listUncorrelated = query({
  args: { projectId: v.id("projects"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    const rows = await ctx.db
      .query("harnessPrChecks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    return rows
      .filter(isPendingPrReconciliation)
      .sort((a, b) => b.syncedAt - a.syncedAt)
      .slice(0, args.limit ?? 20);
  },
});

export const listReconciliationHistory = query({
  args: { projectId: v.id("projects"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    return await ctx.db
      .query("prEvidenceReconciliations")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(args.limit ?? 20);
  },
});

async function reconciliationCandidates(ctx: { db: any }, evaluation: any) {
  const workOrders = await ctx.db
    .query("workOrders")
    .withIndex("by_project", (q: any) => q.eq("projectId", evaluation.projectId))
    .collect();
  const candidates = (await Promise.all(workOrders.map(async (workOrder: any) => {
    const workflowRuns = await ctx.db
      .query("workflowRuns")
      .withIndex("by_work_order", (q: any) => q.eq("workOrderId", workOrder._id))
      .order("desc")
      .take(10);
    const attempts = workflowRuns.length > 0 ? workflowRuns : [undefined];
    return attempts.map((workflowRun: any) => {
      const assessment = assessPrReconciliationCandidate({
        evidence: evaluation,
        candidate: workOrder,
        hasAttempt: Boolean(workflowRun),
        attemptStatus: workflowRun?.status,
      });
      return {
        workOrderId: workOrder._id,
        title: workOrder.title,
        state: workOrder.state,
        repository: workOrder.repository,
        branch: recordedPrLineageBranch(workOrder),
        updatedAt: workflowRun?.startedAt ?? workOrder.updatedAt,
        workflowRunId: workflowRun?._id,
        workflowRunLabel: workflowRun?.runId,
        workflowRunStatus: workflowRun?.status,
        taskId: workflowRun?.parentTaskId,
        ...assessment,
      };
    });
  }))).flat();
  return candidates
    .sort((left, right) => Number(right.eligible) - Number(left.eligible) || right.updatedAt - left.updatedAt)
    .slice(0, 20);
}

export const getReconciliationCandidates = query({
  args: {
    projectId: v.id("projects"),
    evaluationId: v.id("harnessPrChecks"),
  },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    const evaluation = await ctx.db.get(args.evaluationId);
    if (!evaluation || evaluation.projectId !== args.projectId) {
      throw new Error("PR evidence is unavailable or unauthorized");
    }
    if (!isPendingPrReconciliation(evaluation)) return [];
    return await reconciliationCandidates(ctx, evaluation);
  },
});

export const getByPrUrl = query({
  args: { prUrl: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("harnessPrChecks")
      .withIndex("by_pr_url", (q) => q.eq("prUrl", args.prUrl))
      .collect();
    rows.sort((a, b) => b.syncedAt - a.syncedAt);
    const check = rows[0] ?? null;
    if (!check?.projectId) return null;
    await requireWorkspacePermission(ctx, check.projectId, FACTORY_PERMISSIONS.VIEW);
    return check;
  },
});

export const getMergeGateStatus = query({
  args: {
    projectId: v.optional(v.id("projects")),
    prUrl: v.optional(v.string()),
    workOrderId: v.optional(v.id("workOrders")),
    cycleId: v.optional(v.id("loopEngineeringCycles")),
  },
  handler: async (ctx, args) => {
    let check = null;
    let projectId = args.projectId;
    let scope: "EXPLICIT_PR" | "WORK_ORDER" | "CYCLE" | "WORKSPACE_LATEST" | "NONE" = "NONE";
    if (args.prUrl) {
      const rows = await ctx.db
        .query("harnessPrChecks")
        .withIndex("by_pr_url", (q) => q.eq("prUrl", args.prUrl!))
        .collect();
      rows.sort((a, b) => b.syncedAt - a.syncedAt);
      check = rows[0] ?? null;
      projectId = check?.projectId ?? projectId;
      scope = "EXPLICIT_PR";
    } else if (args.workOrderId) {
      const workOrder = await ctx.db.get(args.workOrderId);
      if (!workOrder) throw new Error("WorkOrder is unavailable or unauthorized");
      projectId = workOrder.projectId;
      const rows = await ctx.db
        .query("harnessPrChecks")
        .withIndex("by_work_order", (q) => q.eq("workOrderId", args.workOrderId))
        .collect();
      const correlatedRows = rows.filter(isVerifiedPrLineage);
      correlatedRows.sort((a, b) => b.syncedAt - a.syncedAt);
      check = correlatedRows[0] ?? null;
      scope = "WORK_ORDER";
    } else if (args.cycleId) {
      const cycle = await ctx.db.get(args.cycleId);
      if (!cycle) throw new Error("Loop Engineering cycle is unavailable or unauthorized");
      projectId = cycle.projectId;
      const rows = (await Promise.all(
        cycle.workOrderIds.map((workOrderId) =>
          ctx.db
            .query("harnessPrChecks")
            .withIndex("by_work_order", (q) => q.eq("workOrderId", workOrderId))
            .collect()
        )
      )).flat();
      const correlatedRows = rows.filter(isVerifiedPrLineage);
      correlatedRows.sort((a, b) => b.syncedAt - a.syncedAt);
      check = correlatedRows[0] ?? null;
      scope = "CYCLE";
    } else if (projectId) {
      const rows = await ctx.db
        .query("harnessPrChecks")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect();
      rows.sort((a, b) => b.syncedAt - a.syncedAt);
      check = rows[0] ?? null;
      scope = "WORKSPACE_LATEST";
    }

    if (!projectId) {
      return {
        scope,
        scopeLabel: "No workspace scope",
        gates: [],
        allPass: false,
        correlated: false,
      };
    }
    await requireWorkspacePermission(ctx, projectId, FACTORY_PERMISSIONS.VIEW);
    if (check?.projectId && check.projectId !== projectId) {
      throw new Error("PR evidence is outside the selected workspace");
    }

    let verifiers = await ctx.db.query("contextVerifiers").collect();
    verifiers = verifiers.filter((v) => v.projectId === projectId);
    const activeVerifierCount = verifiers.filter((v) => v.active).length;

    const lenses = check?.changeReviewLenses ?? [];
    const meta =
      check?.metadata && typeof check.metadata === "object"
        ? (check.metadata as { securityFindingCount?: number })
        : {};
    const gates = computeMergeGates({
      lenses,
      ciStatus: check?.ciStatus,
      mutationCoveragePct: check?.mutationTesting?.diffCoveragePct,
      activeVerifierCount,
      securityFindingCount: meta.securityFindingCount,
    });

    return {
      scope,
      scopeLabel: scope === "WORKSPACE_LATEST"
        ? "Workspace latest PR — not linked to the selected cycle"
        : scope === "CYCLE"
          ? "Selected Loop Engineering cycle"
          : scope === "WORK_ORDER"
            ? "Selected WorkOrder"
            : scope === "EXPLICIT_PR"
              ? "Explicit PR"
              : "No scope",
      correlated: check ? isVerifiedPrLineage(check) : false,
      gates,
      allPass: gates.every((g) => g.passed),
      evaluationId: check?._id,
      prUrl: check?.prUrl,
      ciStatus: check?.ciStatus,
      headSha: check?.headSha,
      workOrderId: check?.workOrderId,
      workflowRunId: check?.workflowRunId,
      taskId: check?.taskId,
      loopEngineeringCycleId: check?.loopEngineeringCycleId,
      syncedAt: check?.syncedAt,
      mergeActor: check?.mergeActor,
      mergedAt: check?.mergedAt,
      mergeCommitSha: check?.mergeCommitSha,
    };
  },
});

async function collectSignalsForPr(
  ctx: { db: any },
  projectId: string | undefined,
  prUrl: string,
  diffText?: string
): Promise<PrCheckSignals> {
  const qcRuns = await ctx.db.query("qcRuns").order("desc").take(30);
  const scopedRuns = projectId
    ? qcRuns.filter((r: { projectId?: string }) => r.projectId === projectId)
    : qcRuns;

  const qcFindings: PrCheckSignals["qcFindings"] = [];
  for (const run of scopedRuns.slice(0, 5)) {
    const findings = await ctx.db
      .query("qcFindings")
      .withIndex("by_run", (q: any) => q.eq("qcRunId", run._id))
      .collect();
    for (const f of findings) {
      qcFindings.push({
        title: f.title,
        category: f.category,
        severity: f.severity,
      });
    }
  }

  let testPassCount = 0;
  let testFailCount = 0;
  const workflowRuns = projectId
    ? (await ctx.db.query("workflowRuns").collect()).filter(
        (r: { projectId?: string }) => r.projectId === projectId
      )
    : await ctx.db.query("workflowRuns").order("desc").take(20);

  for (const run of workflowRuns.slice(0, 10)) {
    const events = await ctx.db
      .query("runEvents")
      .withIndex("by_run", (q: any) => q.eq("workflowRunId", run._id))
      .collect();
    const fileChanges = buildFileChanges(events);
    if (fileChanges.some((c) => c.pullRequestUrl === prUrl)) {
      for (const ev of events) {
        if (ev.eventType === "TEST_COMPLETED" || ev.toolName === "vitest") {
          if (ev.status === "COMPLETED" || ev.status === "PASS") testPassCount += 1;
          else testFailCount += 1;
        }
      }
    }
  }

  const diffLineCount = diffText
    ? diffText.split("\n").filter((l) => l.startsWith("+") || l.startsWith("-")).length
    : undefined;

  const securityFindingCount = qcFindings.filter(
    (f) => f.category?.toLowerCase().includes("security") || f.severity === "RED"
  ).length;

  const verificationPassRate =
    testPassCount + testFailCount > 0
      ? Math.round((testPassCount / (testPassCount + testFailCount)) * 100)
      : undefined;

  return {
    qcFindings,
    verificationPassRate,
    diffLineCount,
    testPassCount,
    testFailCount,
    securityFindingCount,
  };
}

async function upsertPrCheck(
  ctx: { db: any },
  input: {
    projectId?: string;
    prUrl: string;
    repoFullName: string;
    prNumber?: number;
    branch?: string;
    title?: string;
    source: "CODEGEN" | "WORKFLOW" | "GITHUB" | "MANUAL";
    sourceRef?: string;
    ciStatus?: "PASS" | "FAIL" | "PENDING" | "UNKNOWN";
    ciRunUrl?: string;
    diffText?: string;
  }
) {
  const signals = await collectSignalsForPr(ctx, input.projectId, input.prUrl, input.diffText);
  const changeReviewLenses = buildChangeReviewLenses(signals);
  const mutationTesting = buildMutationTestingReport(signals);
  const now = Date.now();

  const existingRows = await ctx.db
    .query("harnessPrChecks")
    .withIndex("by_pr_url", (q: any) => q.eq("prUrl", input.prUrl))
    .collect();
  existingRows.sort((a: any, b: any) => b.syncedAt - a.syncedAt);
  const existing = existingRows[0];

  const doc = {
    projectId: input.projectId,
    prUrl: input.prUrl,
    prNumber: input.prNumber,
    repoFullName: input.repoFullName,
    branch: input.branch,
    title: input.title,
    ciStatus: input.ciStatus ?? (signals.testFailCount ? "FAIL" : signals.testPassCount ? "PASS" : "UNKNOWN"),
    ciRunUrl: input.ciRunUrl,
    ciProvider: "github",
    source: input.source,
    sourceRef: input.sourceRef,
    changeReviewLenses,
    mutationTesting,
    syncedAt: now,
    createdAt: existing?.createdAt ?? now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, doc);
    return existing._id;
  }
  return ctx.db.insert("harnessPrChecks", doc);
}

export const syncFromSources = mutation({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    if (!args.projectId) throw new Error("Select a workspace before syncing PR evidence");
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.IMPROVE);
    const synced: string[] = [];

    const codegenRows = args.projectId
      ? await ctx.db
          .query("codegenRequests")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
          .collect()
      : await ctx.db.query("codegenRequests").collect();

    for (const row of codegenRows) {
      if (!row.prUrl) continue;
      const parsed = parseGitHubPrUrl(row.prUrl);
      const fullName = parsed
        ? repoFullName(parsed.owner, parsed.repo)
        : "unknown/repo";
      await upsertPrCheck(ctx, {
        projectId: args.projectId,
        prUrl: row.prUrl,
        prNumber: parsed?.prNumber,
        repoFullName: fullName,
        branch: row.branchName,
        title: row.filePath,
        source: "CODEGEN",
        sourceRef: row.requestId,
        diffText: row.diff,
        ciStatus: row.status === "COMPLETED" ? "PASS" : row.status === "FAILED" ? "FAIL" : "PENDING",
      });
      synced.push(row.prUrl);
    }

    const tasks = args.projectId
      ? await ctx.db
          .query("tasks")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
          .collect()
      : await ctx.db.query("tasks").take(100);

    for (const task of tasks) {
      const meta = (task.metadata ?? {}) as Record<string, unknown>;
      const prNumber = meta.githubPrNumber as number | undefined;
      const repoUrl = meta.githubRepoUrl as string | undefined;
      const branch = meta.githubBranch as string | undefined;
      if (!prNumber || !repoUrl) continue;
      const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/?#]+)/i);
      if (!match) continue;
      const owner = match[1];
      const repo = match[2].replace(/\.git$/, "");
      const prUrl = `https://github.com/${owner}/${repo}/pull/${prNumber}`;
      if (synced.includes(prUrl)) continue;
      await upsertPrCheck(ctx, {
        projectId: args.projectId ?? task.projectId,
        prUrl,
        prNumber,
        repoFullName: repoFullName(owner, repo),
        branch,
        title: task.title,
        source: "GITHUB",
        sourceRef: String(task._id),
      });
      synced.push(prUrl);
    }

    const runs = args.projectId
      ? (await ctx.db.query("workflowRuns").collect()).filter(
          (r) => r.projectId === args.projectId
        )
      : await ctx.db.query("workflowRuns").order("desc").take(30);

    for (const run of runs) {
      const events = await ctx.db
        .query("runEvents")
        .withIndex("by_run", (q) => q.eq("workflowRunId", run._id))
        .collect();
      for (const change of buildFileChanges(events)) {
        if (!change.pullRequestUrl || synced.includes(change.pullRequestUrl)) continue;
        const parsed = parseGitHubPrUrl(change.pullRequestUrl);
        const fullName = parsed
          ? repoFullName(parsed.owner, parsed.repo)
          : "unknown/repo";
        await upsertPrCheck(ctx, {
          projectId: args.projectId ?? run.projectId,
          prUrl: change.pullRequestUrl,
          prNumber: parsed?.prNumber,
          repoFullName: fullName,
          source: "WORKFLOW",
          sourceRef: run.runId,
          ciStatus: run.status === "COMPLETED" ? "PASS" : run.status === "FAILED" ? "FAIL" : "PENDING",
        });
        synced.push(change.pullRequestUrl);
      }
    }

    return { syncedCount: synced.length, prUrls: synced };
  },
});

export const recordManual = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    prUrl: v.string(),
    repoFullName: v.string(),
    changeReviewLenses: v.optional(lensValidator),
  },
  handler: async (ctx, args) => {
    if (!args.projectId) throw new Error("Select a workspace before recording PR evidence");
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.IMPROVE);
    const id = await upsertPrCheck(ctx, {
      projectId: args.projectId,
      prUrl: args.prUrl,
      repoFullName: args.repoFullName,
      source: "MANUAL",
    });
    if (args.changeReviewLenses) {
      await ctx.db.patch(id, { changeReviewLenses: args.changeReviewLenses });
    }
    return { id };
  },
});

export const recordMerge = mutation({
  args: {
    evaluationId: v.id("harnessPrChecks"),
    /** @deprecated Browser actor labels are ignored; authority is server-derived. */
    actorId: v.optional(v.string()),
    mergeCommitSha: v.string(),
    humanConfirmed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const evaluation = await ctx.db.get(args.evaluationId);
    if (!evaluation) throw new Error("PR evaluation not found");
    if (!evaluation.projectId) throw new Error("PR evaluation is not workspace-scoped");
    const access = await requireWorkspacePermission(
      ctx,
      evaluation.projectId,
      FACTORY_PERMISSIONS.APPROVE
    );
    if (evaluation.mergedAt && evaluation.mergeCommitSha === args.mergeCommitSha) {
      return { recorded: false, evaluation };
    }
    const verifiers = await ctx.db.query("contextVerifiers").collect();
    const activeVerifierCount = verifiers.filter((row) => row.active && (!evaluation.projectId || row.projectId === evaluation.projectId)).length;
    const metadata = evaluation.metadata as { securityFindingCount?: number } | undefined;
    const gates = computeMergeGates({
      lenses: evaluation.changeReviewLenses,
      ciStatus: evaluation.ciStatus,
      mutationCoveragePct: evaluation.mutationTesting?.diffCoveragePct,
      activeVerifierCount,
      securityFindingCount: metadata?.securityFindingCount,
    });
    const workOrder = evaluation.workOrderId ? await ctx.db.get(evaluation.workOrderId) : null;
    if (evaluation.workOrderId && !workOrder) throw new Error("Linked WorkOrder not found");
    if (!mergeAuthoritySatisfied({
      ciStatus: evaluation.ciStatus ?? "UNKNOWN",
      gatesPass: gates.every((gate) => gate.passed),
      approvalStatus: workOrder?.approvalStatus,
      humanConfirmed: args.humanConfirmed,
    })) {
      throw new Error("Passing gates, WorkOrder approval, and explicit merge confirmation are required before merge");
    }
    const actorId = access.actorId;
    const mergeCommitSha = args.mergeCommitSha.trim();
    if (!mergeCommitSha) throw new Error("Merge commit SHA is required");
    const mergedAt = Date.now();
    await ctx.db.patch(evaluation._id, { mergeActor: actorId, mergeCommitSha, mergedAt });
    if (workOrder) {
      await ctx.db.patch(workOrder._id, {
        state: "AWAITING_VERIFICATION",
        blockingIssue: undefined,
        requiredHumanAction: "Record independent post-merge verification evidence.",
        metadata: {
          ...(workOrder.metadata ?? {}),
          merge: { actorId, mergeCommitSha, mergedAt, prUrl: evaluation.prUrl, headSha: evaluation.headSha },
        },
        updatedAt: mergedAt,
      });
    }
    await ctx.db.insert("activities", {
      projectId: evaluation.projectId,
      actorType: "HUMAN",
      actorId,
      action: "PR_MERGE_RECORDED",
      description: `Merged ${evaluation.prUrl} at ${mergeCommitSha}`,
      targetType: "PULL_REQUEST",
      targetId: evaluation.prUrl,
      metadata: { evaluationId: evaluation._id, workOrderId: evaluation.workOrderId, headSha: evaluation.headSha, mergeCommitSha },
    });
    return { recorded: true, mergedAt, mergeCommitSha };
  },
});

export const applyReconciliation = internalMutation({
  args: {
    projectId: v.id("projects"),
    evaluationId: v.id("harnessPrChecks"),
    decision: v.union(v.literal("LINKED"), v.literal("DISMISSED")),
    workOrderId: v.optional(v.id("workOrders")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    reason: v.string(),
    actorId: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const existingByKey = await ctx.db
      .query("prEvidenceReconciliations")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    if (existingByKey) {
      if (existingByKey.projectId !== args.projectId) {
        throw new Error("Reconciliation idempotency key belongs to another workspace");
      }
      return { decision: existingByKey, created: false as const };
    }

    const evaluation = await ctx.db.get(args.evaluationId);
    if (!evaluation || evaluation.projectId !== args.projectId) {
      throw new Error("PR evidence is unavailable or unauthorized");
    }
    if (!isPendingPrReconciliation(evaluation)) {
      throw new Error("PR evidence is no longer awaiting reconciliation");
    }
    const existingDecision = await ctx.db
      .query("prEvidenceReconciliations")
      .withIndex("by_evaluation", (q) => q.eq("evaluationId", evaluation._id))
      .first();
    if (existingDecision) {
      throw new Error("PR evidence already has an immutable reconciliation decision");
    }
    const reason = args.reason.trim();
    if (reason.length < 10) {
      throw new Error("Retain a reconciliation reason of at least 10 characters");
    }

    let candidateSnapshot: any;
    let workOrderId: Id<"workOrders"> | undefined;
    let workflowRunId: Id<"workflowRuns"> | undefined;
    let taskId: Id<"tasks"> | undefined;
    let loopEngineeringCycleId: Id<"loopEngineeringCycles"> | undefined;
    if (args.decision === "LINKED") {
      if (!args.workOrderId || !args.workflowRunId) {
        throw new Error("Linking PR evidence requires one exact WorkOrder and producing Attempt");
      }
      const candidates = await reconciliationCandidates(ctx, evaluation);
      const candidate = candidates.find(
        (item) => item.workOrderId === args.workOrderId
          && item.workflowRunId === args.workflowRunId
      );
      if (!candidate?.eligible) {
        throw new Error("Selected lineage does not satisfy exact repository, branch, Attempt, and state checks");
      }
      const workflowRun = await ctx.db.get(args.workflowRunId);
      if (
        !workflowRun
        || workflowRun.projectId !== args.projectId
        || workflowRun.workOrderId !== args.workOrderId
      ) {
        throw new Error("Selected Attempt does not belong to this workspace and WorkOrder");
      }
      const cycles = await ctx.db
        .query("loopEngineeringCycles")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
      const cycle = cycles.find((item) => item.workOrderIds.includes(args.workOrderId!));
      workOrderId = args.workOrderId;
      workflowRunId = args.workflowRunId;
      taskId = workflowRun.parentTaskId;
      loopEngineeringCycleId = cycle?._id;
      candidateSnapshot = candidate;
    }

    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Workspace is unavailable");
    const decidedAt = Date.now();
    const decisionId = await ctx.db.insert("prEvidenceReconciliations", {
      projectId: args.projectId,
      evaluationId: evaluation._id,
      decision: args.decision,
      workOrderId,
      workflowRunId,
      taskId,
      loopEngineeringCycleId,
      reason,
      actorId: args.actorId,
      idempotencyKey: args.idempotencyKey,
      evidenceSnapshot: {
        prUrl: evaluation.prUrl,
        repoFullName: evaluation.repoFullName,
        branch: evaluation.branch,
        headSha: evaluation.headSha,
        ciStatus: evaluation.ciStatus,
      },
      candidateSnapshot,
      decidedAt,
    });
    await ctx.db.patch(evaluation._id, {
      workOrderId,
      workflowRunId,
      taskId,
      loopEngineeringCycleId,
      metadata: {
        ...((evaluation.metadata && typeof evaluation.metadata === "object")
          ? evaluation.metadata
          : {}),
        lineageStatus: args.decision === "LINKED"
          ? "OPERATOR_RECONCILIATION"
          : "RECONCILIATION_DISMISSED",
        reconciliationDecisionId: decisionId,
        reconciliationReason: reason,
        reconciledAt: decidedAt,
      },
    });
    await ctx.db.insert("activities", {
      tenantId: project.tenantId,
      projectId: project._id,
      actorType: "HUMAN",
      actorId: args.actorId,
      action: args.decision === "LINKED"
        ? "PR_EVIDENCE_RECONCILED"
        : "PR_EVIDENCE_DISMISSED",
      description: args.decision === "LINKED"
        ? `Linked ${evaluation.prUrl} to exact WorkOrder and Attempt lineage`
        : `Dismissed uncorrelated evidence ${evaluation.prUrl}`,
      targetType: "PR_EVIDENCE_RECONCILIATION",
      targetId: decisionId,
      metadata: {
        evaluationId: evaluation._id,
        workOrderId,
        workflowRunId,
        reason,
      },
    });
    return {
      decision: await ctx.db.get(decisionId),
      evaluation: await ctx.db.get(evaluation._id),
      created: true as const,
    };
  },
});

export const reconcileEvidence = action({
  args: {
    projectId: v.id("projects"),
    evaluationId: v.id("harnessPrChecks"),
    decision: v.union(v.literal("LINKED"), v.literal("DISMISSED")),
    workOrderId: v.optional(v.id("workOrders")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    reason: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args): Promise<any> => {
    const authorization = await requireFactoryActionWithAudit(ctx, {
      projectId: args.projectId,
      permission: FACTORY_PERMISSIONS.APPROVE,
      operation: "PR_EVIDENCE_RECONCILE",
    });
    return await ctx.runMutation(internal.factory.prChecks.applyReconciliation, {
      ...args,
      actorId: authorization.actorId,
    });
  },
});

const pullRequestIngestArgs = {
  prUrl: v.string(),
  projectId: v.optional(v.id("projects")),
  workOrderId: v.optional(v.id("workOrders")),
  workflowRunId: v.optional(v.id("workflowRuns")),
  taskId: v.optional(v.id("tasks")),
  releaseDeploymentId: v.optional(v.id("deployments")),
  sourceEventId: v.optional(v.string()),
};

type PullRequestIngestArgs = {
  prUrl: string;
  projectId?: Id<"projects">;
  workOrderId?: Id<"workOrders">;
  workflowRunId?: Id<"workflowRuns">;
  taskId?: Id<"tasks">;
  releaseDeploymentId?: Id<"deployments">;
  sourceEventId?: string;
};

async function ingestPullRequestEvidence(
  ctx: {
    runQuery: (reference: any, args: any) => Promise<any>;
    runMutation: (reference: any, args: any) => Promise<any>;
  },
  args: PullRequestIngestArgs
): Promise<{
  id: Id<"harnessPrChecks">;
  prUrl: string;
  ciStatus: "PASS" | "FAIL" | "PENDING" | "UNKNOWN";
  checkCount: number;
  diffLineCount?: number;
}> {
    const parsed = parseGitHubPrUrl(args.prUrl.trim());
    if (!parsed) {
      throw new Error("Invalid GitHub PR URL — expected https://github.com/owner/repo/pull/123");
    }

    if (!args.projectId) {
      throw new Error("GitHub App PR evidence ingestion requires an authorized workspace binding");
    }
    const binding = await ctx.runQuery(internal.factory.prChecks.resolveGithubIngestBinding, {
      projectId: args.projectId,
      repoFullName: `${parsed.owner}/${parsed.repo}`,
    });
    const configuredAppId = process.env.GITHUB_APP_ID?.trim();
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
    if (!configuredAppId || !privateKey) {
      throw new Error("GitHub App PR evidence ingestion is not configured");
    }
    if (configuredAppId !== binding.appId) {
      throw new Error("GitHub App PR evidence binding does not match the configured App identity");
    }
    const installation = await mintGithubInstallationToken({
      installationId: binding.installationId,
      providerRepositoryId: binding.providerRepositoryId,
      appId: configuredAppId,
      privateKey,
    });
    let installationToken = installation.token;
    let payload: Awaited<ReturnType<typeof fetchPullRequestCi>>;
    try {
      payload = await fetchPullRequestCi(
        parsed.owner,
        parsed.repo,
        parsed.prNumber,
        installationToken
      );
    } finally {
      installationToken = "";
    }
    const lineage = await ctx.runQuery(internal.factory.prChecks.resolveLineage, {
      projectId: args.projectId,
      workOrderId: args.workOrderId ?? payload.lineage?.workOrderId as Id<"workOrders"> | undefined,
      workflowRunId: args.workflowRunId ?? payload.lineage?.workflowRunId as Id<"workflowRuns"> | undefined,
      taskId: args.taskId ?? payload.lineage?.taskId as Id<"tasks"> | undefined,
      repoFullName: payload.repoFullName,
      branch: payload.branch,
    });

    const id: Id<"harnessPrChecks"> = await ctx.runMutation(
      internal.factory.githubCi.applyCiIngest,
      {
      projectId: lineage.projectId,
      workOrderId: lineage.workOrderId,
      workflowRunId: lineage.workflowRunId,
      taskId: lineage.taskId,
      loopEngineeringCycleId: lineage.loopEngineeringCycleId,
      lineageStatus: lineage.lineageStatus,
      releaseDeploymentId: args.releaseDeploymentId,
      prUrl: payload.prUrl,
      prNumber: payload.prNumber,
      repoFullName: payload.repoFullName,
      branch: payload.branch,
      title: payload.title,
      prState: payload.prState,
      mergeActor: payload.mergeActor,
      mergedAt: payload.mergedAt,
      mergeCommitSha: payload.mergeCommitSha,
      ciStatus: payload.ciStatus,
      ciRunUrl: payload.ciRunUrl,
      headSha: payload.headSha,
      checkRuns: payload.checkRuns,
      signals: payload.signals,
      sourceRef: payload.headSha,
      sourceEventId: args.sourceEventId,
      }
    );

    return {
      id,
      prUrl: payload.prUrl,
      ciStatus: payload.ciStatus,
      checkCount: payload.checkRuns.length,
      diffLineCount: payload.diffLineCount,
    };
}

/** Operator-triggered ingestion is authorized before any GitHub network call. */
export const ingestPullRequest = action({
  args: {
    ...pullRequestIngestArgs,
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await requireFactoryActionWithAudit(ctx, {
      projectId: args.projectId,
      permission: FACTORY_PERMISSIONS.IMPROVE,
      operation: "PR_EVIDENCE_INGEST",
    });
    return await ingestPullRequestEvidence(ctx, args);
  },
});

/** Called only after the HTTP route verifies the GitHub webhook signature. */
export const ingestPullRequestFromWebhook = internalAction({
  args: pullRequestIngestArgs,
  handler: async (ctx, args) => await ingestPullRequestEvidence(ctx, args),
});

export const resolveGithubIngestBinding = internalQuery({
  args: {
    projectId: v.id("projects"),
    repoFullName: v.string(),
  },
  handler: async (ctx, args) => {
    const repositories = await ctx.db
      .query("workspaceRepositories")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const requestedRepository = normalizeGitHubRepository(args.repoFullName);
    const matches = repositories.filter((repository) =>
      normalizeGitHubRepository(repository.repository) === requestedRepository
    );
    if (matches.length !== 1) {
      throw new Error("GitHub App PR evidence repository does not match one workspace binding");
    }
    const repository = matches[0];
    if (repository.status !== "READY" || !repository.providerRepositoryId) {
      throw new Error("GitHub App PR evidence repository binding is not ready");
    }
    const installation = await ctx.db
      .query("githubAppInstallations")
      .withIndex("by_repository", (q) => q.eq("repositoryId", repository._id))
      .first();
    if (!installation || installation.status !== "CONNECTED") {
      throw new Error("GitHub App PR evidence installation is not connected");
    }
    return {
      repositoryId: repository._id,
      repository: repository.repository,
      providerRepositoryId: repository.providerRepositoryId,
      installationId: installation.installationId,
      appId: installation.appId,
    };
  },
});

export const resolveLineage = internalQuery({
  args: {
    projectId: v.optional(v.id("projects")),
    workOrderId: v.optional(v.id("workOrders")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    taskId: v.optional(v.id("tasks")),
    repoFullName: v.string(),
    branch: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let projectId = args.projectId;
    if (args.workOrderId) {
      if (!args.workflowRunId) {
        throw new Error("Explicit PR artifacts require the producing Attempt/run");
      }
      const workOrder = await ctx.db.get(args.workOrderId);
      if (!workOrder) throw new Error("Explicit PR artifact WorkOrder not found");
      if (projectId && projectId !== workOrder.projectId) {
        throw new Error("Explicit PR artifact crosses workspace boundaries");
      }
      if (
        normalizeGitHubRepository(workOrder.repository) !==
        normalizeGitHubRepository(args.repoFullName)
      ) {
        throw new Error("Explicit PR artifact repository does not match the WorkOrder");
      }
      const recordedBranch = recordedPrLineageBranch(workOrder);
      if (recordedBranch && recordedBranch !== normalizeGitBranch(args.branch)) {
        throw new Error("Explicit PR artifact branch does not match the WorkOrder");
      }
      const workflowRun = args.workflowRunId ? await ctx.db.get(args.workflowRunId) : null;
      if (args.workflowRunId && workflowRun?.workOrderId !== workOrder._id) {
        throw new Error("Explicit PR artifact run does not belong to the WorkOrder");
      }
      if (
        workflowRun?.branch &&
        normalizeGitBranch(workflowRun.branch) !== normalizeGitBranch(args.branch)
      ) {
        throw new Error("Explicit PR artifact branch does not match the producing Attempt");
      }
      const task = args.taskId ? await ctx.db.get(args.taskId) : null;
      if (args.taskId && task?.workOrderId !== workOrder._id) {
        throw new Error("Explicit PR artifact Task does not belong to the WorkOrder");
      }
      if (task && workflowRun?.parentTaskId && task._id !== workflowRun.parentTaskId) {
        throw new Error("Explicit PR artifact Task does not match the producing Attempt");
      }
      const cycles = await ctx.db.query("loopEngineeringCycles").collect();
      const cycle = cycles.find((candidate) => candidate.workOrderIds.includes(workOrder._id));
      return {
        projectId: workOrder.projectId,
        workOrderId: workOrder._id,
        workflowRunId: workflowRun?._id,
        taskId: task?._id ?? workflowRun?.parentTaskId,
        loopEngineeringCycleId: cycle?._id,
        lineageStatus: "EXPLICIT_ARTIFACT" as const,
      };
    }
    if (!projectId) {
      const projects = await ctx.db.query("projects").collect();
      const matchingProjects = projects.filter((project) =>
        normalizeGitHubRepository(project.githubRepo) ===
        normalizeGitHubRepository(args.repoFullName)
      );
      projectId = matchingProjects.length === 1 ? matchingProjects[0]._id : undefined;
    }
    if (!projectId) return { lineageStatus: "UNCORRELATED" as const };
    const workOrders = await ctx.db.query("workOrders")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .collect();
    const candidates = workOrders.filter((workOrder) =>
      !["CANCELED", "SUPERSEDED"].includes(workOrder.state)
    );
    const workOrder = selectExactPrLineageWorkOrder({
      candidates,
      repository: args.repoFullName,
      branch: args.branch,
    });
    if (!workOrder) return { projectId, lineageStatus: "UNCORRELATED" as const };
    const runs = await ctx.db.query("workflowRuns").collect();
    const workflowRun = runs
      .filter((run) =>
        run.workOrderId === workOrder._id
        && isProducingAttemptStatus(run.status)
      )
      .sort((a, b) => b.startedAt - a.startedAt)[0];
    if (!workflowRun) {
      return { projectId, lineageStatus: "UNCORRELATED" as const };
    }
    const tasks = await ctx.db.query("tasks")
      .withIndex("by_work_order", (q) => q.eq("workOrderId", workOrder._id))
      .collect();
    const cycles = await ctx.db.query("loopEngineeringCycles").collect();
    const cycle = cycles.find((candidate) => candidate.workOrderIds.includes(workOrder._id));
    return {
      projectId,
      workOrderId: workOrder._id,
      workflowRunId: workflowRun?._id,
      taskId: workflowRun?.parentTaskId ?? tasks[0]?._id,
      loopEngineeringCycleId: cycle?._id,
      lineageStatus: "EXACT_BRANCH" as const,
    };
  },
});
