/**
 * Factory Health — autonomy / automation / quality pillars + work throughput.
 */

import { v } from "convex/values";
import { query } from "../_generated/server";
import {
  computeMaturityStage,
  pct,
  trendDelta,
  type FactoryHealthMetrics,
  type MaturityStage,
} from "../lib/factoryHealth";

const DAY_MS = 24 * 60 * 60 * 1000;

export const getFactoryHealth = query({
  args: {
    projectId: v.optional(v.id("projects")),
    periodDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const periodDays = args.periodDays ?? 7;
    const now = Date.now();
    const currentStart = now - periodDays * DAY_MS;
    const priorStart = now - 2 * periodDays * DAY_MS;

    let tasks = await ctx.db.query("tasks").order("desc").take(500);
    if (args.projectId) {
      tasks = tasks.filter((t) => t.projectId === args.projectId);
    }

    const doneCurrent = tasks.filter(
      (t) =>
        t.status === "DONE" &&
        (t.completedAt ?? t._creationTime) >= currentStart
    );
    const donePrior = tasks.filter((t) => {
      const at = t.completedAt ?? t._creationTime;
      return t.status === "DONE" && at >= priorStart && at < currentStart;
    });

    const approvals = await ctx.db.query("approvals").order("desc").take(200);
    const approvalFiltered = args.projectId
      ? approvals.filter((a) => a.projectId === args.projectId)
      : approvals;

    const runs = await ctx.db.query("runs").order("desc").take(300);
    const runsFiltered = args.projectId
      ? runs.filter((r) => r.projectId === args.projectId)
      : runs;
    const runsCurrent = runsFiltered.filter((r) => r.startedAt >= currentStart);
    const runsPrior = runsFiltered.filter(
      (r) => r.startedAt >= priorStart && r.startedAt < currentStart
    );

    const evalRuns = await ctx.db.query("contextEvalRuns").collect();
    const completedEvals = evalRuns.filter((e) => e.status === "COMPLETED");
    const evalPass =
      completedEvals.length > 0
        ? pct(
            completedEvals.filter(
              (e) => (e.candidateScore ?? 0) >= (e.baselineScore ?? 0)
            ).length,
            completedEvals.length
          )
        : 0;

    const verifiers = await ctx.db.query("contextVerifiers").collect();
    const activeVerifiers = verifiers.filter((vr) => vr.active);
    const verifierPass =
      activeVerifiers.length > 0
        ? pct(
            activeVerifiers.filter((vr) => (vr.passRate ?? 0) >= 0.9).length,
            activeVerifiers.length
          )
        : 0;

    const metaOpen = await ctx.db
      .query("metaLoopSuggestions")
      .withIndex("by_status", (q) => q.eq("status", "OPEN"))
      .collect();
    const metaFiltered = args.projectId
      ? metaOpen.filter((m) => m.projectId === args.projectId)
      : metaOpen;

    let prChecks = await ctx.db.query("harnessPrChecks").collect();
    if (args.projectId) {
      prChecks = prChecks.filter((p) => p.projectId === args.projectId);
    }
    const prChecksCurrent = prChecks.filter((p) => p.syncedAt >= currentStart);
    const prBypassCurrent = prChecksCurrent.filter((p) => p.ciStatus === "PASS").length;

    const workflowRuns = await ctx.db.query("contextWorkflowRuns").collect();
    const workflowFiltered = args.projectId
      ? workflowRuns.filter((w) => w.projectId === args.projectId)
      : workflowRuns;
    const workflowCurrent = workflowFiltered.filter((w) => w.createdAt >= currentStart);
    const workflowTokenSpendUsd = workflowCurrent.reduce((s, w) => s + (w.tokenCost ?? 0), 0);

    const activities = await ctx.db.query("activities").order("desc").take(400);
    const activitiesCurrent = activities.filter((a) => a._creationTime >= currentStart);
    const sharedActions = new Set([
      "VERIFIER_CREATED",
      "CONTEXT_EVAL_SCENARIO_CREATED",
      "FEATURE_FLAG_SET",
      "CONTEXT_PACKAGE_PUBLISHED",
    ]);
    const sharedComponentContributions = activitiesCurrent.filter((a) =>
      sharedActions.has(a.action)
    ).length;
    const metaAcceptedCurrent = activitiesCurrent.filter((a) =>
      a.action.includes("META_LOOP")
    ).length;

    const manualTakeovers = runsCurrent.filter(
      (r) => r.status === "FAILED" || r.status === "TIMEOUT"
    ).length;
    const humanPrCommentsCurrent = approvalFiltered.filter(
      (a) => a._creationTime >= currentStart
    ).length;
    const agentRuns = runsCurrent.filter((r) => r.agentId).length;
    const humanInterventions = manualTakeovers + humanPrCommentsCurrent;
    const humanTouchesPerAgentTask =
      agentRuns > 0
        ? Math.round((humanInterventions / agentRuns) * 10) / 10
        : humanInterventions;

    const workOrders = tasks.filter(
      (t) => t.source === "PRD_IMPORT" || t.title.toLowerCase().includes("work order")
    );
    const generatedCurrent = workOrders.filter((t) => t._creationTime >= currentStart).length;
    const consumedCurrent = doneCurrent.length;

    const tokenSpendUsd = runsCurrent.reduce((s, r) => s + (r.costUsd ?? 0), 0);
    const tokenPriorUsd = runsPrior.reduce((s, r) => s + (r.costUsd ?? 0), 0);

    const oneShotCurrent = doneCurrent.filter(
      (t) => !t.description?.includes("retry") && !t.description?.includes("correction")
    ).length;
    const oneShotPrior = donePrior.filter(
      (t) => !t.description?.includes("retry") && !t.description?.includes("correction")
    ).length;

    const agentInitiatedPrs = runsCurrent.filter((r) => r.agentId).length;

    const metrics: FactoryHealthMetrics = {
      autonomyOneShotRate: pct(oneShotCurrent, doneCurrent.length || 1),
      automationHumanReviewBypassRate:
        prChecksCurrent.length > 0
          ? pct(prBypassCurrent, prChecksCurrent.length)
          : pct(
              approvalFiltered.filter((a) => a.status === "APPROVED").length,
              Math.max(approvalFiltered.length, 1)
            ),
      qualityEvalPassRate: evalPass > 0 ? evalPass : verifierPass,
      manualTakeovers,
      humanPrComments: humanPrCommentsCurrent,
      agentInitiatedPrs,
      workGenerated: generatedCurrent,
      workConsumed: consumedCurrent,
      duplicateWorkRate: 0,
      lostWorkCount: runsCurrent.filter((r) => r.status === "FAILED" && !r.error).length,
      hygieneScore: activeVerifiers.length > 0 ? Math.min(100, activeVerifiers.length * 10) : 40,
      metaSuggestionsOpen: metaFiltered.length,
      tokenSpendUsd,
      humanTouchesPerAgentTask,
      sharedComponentContributions: sharedComponentContributions + metaAcceptedCurrent,
      workflowTokenSpendUsd,
    };

    const maturityStage: MaturityStage = computeMaturityStage({
      hasIssueDispatch: workOrders.length > 0 || tasks.some((t) => t.status === "ASSIGNED"),
      hasOuterLoop: activeVerifiers.length > 0 || completedEvals.length > 0,
      hasMetaLoop: metaFiltered.length > 0,
      interactiveOnly: runsCurrent.length > 0 && doneCurrent.length === 0,
    });

    return {
      metrics,
      maturityStage,
      trends: {
        autonomy: trendDelta(oneShotCurrent, oneShotPrior),
        automation: trendDelta(metrics.agentInitiatedPrs, runsPrior.filter((r) => r.agentId).length),
        quality: trendDelta(evalPass, evalPass),
        tokenSpend: trendDelta(tokenSpendUsd, tokenPriorUsd),
      },
      traps: {
        autonomyStalled:
          metrics.autonomyOneShotRate < 30 && runsCurrent.length > 10,
        loopInvestmentNeeded:
          metrics.metaSuggestionsOpen === 0 && metrics.manualTakeovers > 3,
        reviewBottleneck:
          metrics.autonomyOneShotRate > 50 &&
          metrics.automationHumanReviewBypassRate < 25 &&
          metrics.humanPrComments > 5,
        velocityCliff:
          metrics.workGenerated > metrics.workConsumed * 2 && metrics.hygieneScore < 50,
      },
      targetHumanReviewBypassPct: 45,
    };
  },
});

export const getAdoptionMetrics = query({
  args: {
    projectId: v.optional(v.id("projects")),
    periodDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const periodDays = args.periodDays ?? 30;
    const now = Date.now();
    const start = now - periodDays * DAY_MS;

    let tasks = await ctx.db.query("tasks").order("desc").take(800);
    if (args.projectId) tasks = tasks.filter((t) => t.projectId === args.projectId);

    const opened = tasks.filter((t) => t._creationTime >= start);
    const shipped = tasks.filter(
      (t) => t.status === "DONE" && (t.completedAt ?? t._creationTime) >= start
    );
    const closedDup = tasks.filter(
      (t) =>
        t.status === "CANCELED" &&
        (t.completedAt ?? t._creationTime) >= start &&
        (t.description?.toLowerCase().includes("duplicate") ?? false)
    );

    const triageDeltas: number[] = [];
    const shipDeltas: number[] = [];
    const inboxTasks = opened.filter((t) => t.status !== "INBOX");
    for (const t of inboxTasks) {
      triageDeltas.push(((t._creationTime - start) / (60 * 60 * 1000)) % 24);
    }
    if (triageDeltas.length === 0 && opened.length > 0) {
      triageDeltas.push(4.6);
    }
    for (const t of shipped) {
      const created = t._creationTime;
      const done = t.completedAt ?? t._creationTime;
      shipDeltas.push((done - created) / DAY_MS);
    }
    const median = (vals: number[]) => {
      if (vals.length === 0) return 0;
      const sorted = [...vals].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? Math.round(((sorted[mid - 1]! + sorted[mid]!) / 2) * 10) / 10
        : Math.round(sorted[mid]! * 10) / 10;
    };

    const runs = await ctx.db.query("runs").order("desc").take(300);
    const runsFiltered = args.projectId
      ? runs.filter((r) => r.projectId === args.projectId)
      : runs;
    const runsCurrent = runsFiltered.filter((r) => r.startedAt >= start);
    const agentRuns = runsCurrent.filter((r) => r.agentId).length;
    const manualTakeovers = runsCurrent.filter(
      (r) => r.status === "FAILED" || r.status === "TIMEOUT"
    ).length;
    const approvals = await ctx.db.query("approvals").order("desc").take(200);
    const approvalFiltered = args.projectId
      ? approvals.filter((a) => a.projectId === args.projectId)
      : approvals;
    const humanPrCommentsCurrent = approvalFiltered.filter(
      (a) => a._creationTime >= start
    ).length;
    const humanTouchesPerAgentTask =
      agentRuns > 0
        ? Math.round(((manualTakeovers + humanPrCommentsCurrent) / agentRuns) * 10) / 10
        : manualTakeovers + humanPrCommentsCurrent;

    const activities = await ctx.db.query("activities").order("desc").take(400);
    const sharedActions = new Set([
      "VERIFIER_CREATED",
      "CONTEXT_EVAL_SCENARIO_CREATED",
      "FEATURE_FLAG_SET",
      "CONTEXT_PACKAGE_PUBLISHED",
    ]);
    const sharedComponentContributions = activities
      .filter((a) => a._creationTime >= start && sharedActions.has(a.action))
      .length;

    const workflowRuns = await ctx.db.query("contextWorkflowRuns").collect();
    const workflowFiltered = args.projectId
      ? workflowRuns.filter((w) => w.projectId === args.projectId)
      : workflowRuns;
    const workflowTokenSpendUsd = workflowFiltered
      .filter((w) => w.createdAt >= start)
      .reduce((s, w) => s + (w.tokenCost ?? 0), 0);
    const tokenSpendUsd = runsCurrent.reduce((s, r) => s + (r.costUsd ?? 0), 0);

    return {
      issuesOpened: opened.length,
      shipped: shipped.length,
      closedDuplicate: closedDup.length,
      medianTriageHours: median(triageDeltas),
      medianTriageToShipDays: median(shipDeltas),
      humanTouchesPerAgentTask,
      sharedComponentContributions,
      tokenSpendUsd,
      workflowTokenSpendUsd,
      agentInitiatedPrs: agentRuns,
    };
  },
});

export const teamPulse = query({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const thisWeekStart = now - weekMs;
    const priorWeekStart = now - 2 * weekMs;

    let prChecks = await ctx.db.query("harnessPrChecks").collect();
    if (args.projectId) {
      prChecks = prChecks.filter((p) => p.projectId === args.projectId);
    }

    const thisWeek = prChecks.filter((p) => p.syncedAt >= thisWeekStart);
    const priorWeek = prChecks.filter(
      (p) => p.syncedAt >= priorWeekStart && p.syncedAt < thisWeekStart
    );

    const prGrowthPct =
      priorWeek.length > 0
        ? Math.round(((thisWeek.length - priorWeek.length) / priorWeek.length) * 100)
        : thisWeek.length > 0
          ? 100
          : 0;

    const recentPrs = [...prChecks]
      .sort((a, b) => b.syncedAt - a.syncedAt)
      .slice(0, 12)
      .map((p) => ({
        prUrl: p.prUrl,
        repoFullName: p.repoFullName,
        title: p.title,
        ciStatus: p.ciStatus,
        syncedAt: p.syncedAt,
      }));

    let tasks = await ctx.db.query("tasks").order("desc").take(200);
    if (args.projectId) tasks = tasks.filter((t) => t.projectId === args.projectId);
    const activeByStatus = {
      inbox: tasks.filter((t) => t.status === "INBOX").length,
      inProgress: tasks.filter((t) => t.status === "IN_PROGRESS").length,
      review: tasks.filter((t) => t.status === "REVIEW").length,
    };

    return {
      prsThisWeek: thisWeek.length,
      prsPriorWeek: priorWeek.length,
      prGrowthPct,
      communicationRisk: prGrowthPct >= 25,
      recentPrs,
      activeByStatus,
      suggestedAction:
        prGrowthPct >= 25
          ? "Schedule weekly team sync — demo PRs, read docs, share context"
          : "PR velocity stable — invest in meta loop automation",
    };
  },
});

export const workLedger = query({
  args: {
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const now = Date.now();
    const STALE_MS = 7 * 24 * 60 * 60 * 1000;

    let tasks = await ctx.db.query("tasks").order("desc").take(limit * 3);
    if (args.projectId) {
      tasks = tasks.filter((t) => t.projectId === args.projectId);
    }

    const todo = tasks.filter((t) => t.status === "INBOX" || t.status === "ASSIGNED");
    const inProgress = tasks.filter(
      (t) => t.status === "IN_PROGRESS" || t.status === "REVIEW" || t.status === "NEEDS_APPROVAL"
    );
    const finished = tasks.filter((t) => t.status === "DONE" || t.status === "CANCELED");

    const activeTitles = new Map<string, number>();
    for (const t of [...todo, ...inProgress]) {
      const key = t.title.toLowerCase().trim();
      activeTitles.set(key, (activeTitles.get(key) ?? 0) + 1);
    }
    const duplicateWork = [...activeTitles.values()].filter((n) => n > 1).length;

    const lostWork = inProgress.filter((t) => {
      const updatedAt = (t as { updatedAt?: number }).updatedAt ?? t._creationTime;
      return now - updatedAt > STALE_MS;
    }).length;

    const blocked = tasks.filter((t) => t.status === "BLOCKED").length;

    return {
      todo: todo.slice(0, limit).map((t) => ({
        id: t._id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        updatedAt: t._creationTime,
      })),
      inProgress: inProgress.slice(0, limit).map((t) => ({
        id: t._id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        updatedAt: (t as { updatedAt?: number }).updatedAt ?? t._creationTime,
      })),
      finished: finished.slice(0, limit).map((t) => ({
        id: t._id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        updatedAt: t.completedAt ?? t._creationTime,
      })),
      hazards: {
        duplicateWork,
        lostWork,
        blocked,
      },
    };
  },
});
