/**
 * Harness PR checks — change review lenses + mutation testing synced from PR/CI sources.
 */

import { v } from "convex/values";
import { action, mutation, query } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  buildChangeReviewLenses,
  buildMutationTestingReport,
  parseGitHubPrUrl,
  repoFullName,
  type PrCheckSignals,
} from "../lib/harnessPrChecks";
import { computeMergeGates } from "../lib/mergeGates";
import { fetchPullRequestCi } from "../lib/githubCiIngest";
import { buildFileChanges } from "../lib/runInspector";

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
    let rows = args.projectId
      ? await ctx.db
          .query("harnessPrChecks")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
          .collect()
      : await ctx.db.query("harnessPrChecks").collect();
    rows.sort((a, b) => b.syncedAt - a.syncedAt);
    return rows.slice(0, args.limit ?? 20);
  },
});

export const getLatest = query({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    let rows = args.projectId
      ? await ctx.db
          .query("harnessPrChecks")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
          .collect()
      : await ctx.db.query("harnessPrChecks").collect();
    rows.sort((a, b) => b.syncedAt - a.syncedAt);
    return rows[0] ?? null;
  },
});

export const getByPrUrl = query({
  args: { prUrl: v.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query("harnessPrChecks")
      .withIndex("by_pr_url", (q) => q.eq("prUrl", args.prUrl))
      .unique(),
});

export const getMergeGateStatus = query({
  args: { projectId: v.optional(v.id("projects")), prUrl: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let check = null;
    if (args.prUrl) {
      check = await ctx.db
        .query("harnessPrChecks")
        .withIndex("by_pr_url", (q) => q.eq("prUrl", args.prUrl!))
        .unique();
    } else {
      let rows = args.projectId
        ? await ctx.db
            .query("harnessPrChecks")
            .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
            .collect()
        : await ctx.db.query("harnessPrChecks").collect();
      rows.sort((a, b) => b.syncedAt - a.syncedAt);
      check = rows[0] ?? null;
    }

    let verifiers = await ctx.db.query("contextVerifiers").collect();
    if (args.projectId) {
      verifiers = verifiers.filter((v) => v.projectId === args.projectId);
    }
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
      gates,
      allPass: gates.every((g) => g.passed),
      prUrl: check?.prUrl,
      ciStatus: check?.ciStatus,
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

  const existing = await ctx.db
    .query("harnessPrChecks")
    .withIndex("by_pr_url", (q: any) => q.eq("prUrl", input.prUrl))
    .unique();

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

export const ingestPullRequest = action({
  args: {
    prUrl: v.string(),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    id: Id<"harnessPrChecks">;
    prUrl: string;
    ciStatus: "PASS" | "FAIL" | "PENDING" | "UNKNOWN";
    checkCount: number;
    diffLineCount?: number;
  }> => {
    const parsed = parseGitHubPrUrl(args.prUrl.trim());
    if (!parsed) {
      throw new Error("Invalid GitHub PR URL — expected https://github.com/owner/repo/pull/123");
    }

    const payload = await fetchPullRequestCi(
      parsed.owner,
      parsed.repo,
      parsed.prNumber,
      process.env.GITHUB_TOKEN
    );

    const id: Id<"harnessPrChecks"> = await ctx.runMutation(
      internal.factory.githubCi.applyCiIngest,
      {
      projectId: args.projectId,
      prUrl: payload.prUrl,
      prNumber: payload.prNumber,
      repoFullName: payload.repoFullName,
      branch: payload.branch,
      title: payload.title,
      ciStatus: payload.ciStatus,
      ciRunUrl: payload.ciRunUrl,
      headSha: payload.headSha,
      checkRuns: payload.checkRuns,
      signals: payload.signals,
      sourceRef: payload.headSha,
      }
    );

    return {
      id,
      prUrl: payload.prUrl,
      ciStatus: payload.ciStatus,
      checkCount: payload.checkRuns.length,
      diffLineCount: payload.diffLineCount,
    };
  },
});
