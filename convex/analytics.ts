/**
 * Analytics — Convex Functions
 *
 * Read-only aggregations powering the Analytics page: KPI summary with
 * period-over-period deltas, daily cost by model, and a 365-day activity
 * heatmap with streak stats. No mutations, no flag gate.
 */

import { v } from "convex/values";
import { countPendingApprovals } from "./lib/approvalQueue";
import { query } from "./_generated/server";

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC calendar-day key, e.g. "2026-07-11". */
function dayKey(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

interface KpiDatum {
  value: number;
  delta: number;
}

export const kpiSummary = query({
  args: {
    projectId: v.id("projects"),
    periodDays: v.number(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    runs: KpiDatum;
    tasksCompleted: KpiDatum;
    costUsd: KpiDatum;
    policyDenials: KpiDatum;
  }> => {
    const now = Date.now();
    const periodMs = Math.max(1, Math.floor(args.periodDays)) * DAY_MS;
    const currentStart = now - periodMs;
    const priorStart = now - 2 * periodMs;

    // Runs + cost (local scale — full collect is fine).
    const runs = (await ctx.db
      .query("runs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect())
      .filter((run) => run.startedAt >= priorStart);
    let runsCurrent = 0;
    let runsPrior = 0;
    let costCurrent = 0;
    let costPrior = 0;
    for (const run of runs) {
      if (run.startedAt >= currentStart) {
        runsCurrent += 1;
        costCurrent += run.costUsd;
      } else {
        runsPrior += 1;
        costPrior += run.costUsd;
      }
    }

    // Tasks completed — approximated by DONE tasks whose completion timestamp
    // (completedAt, falling back to _creationTime) lands in the window.
    const doneTasks = (await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect())
      .filter((task) => task.status === "DONE");
    let tasksCurrent = 0;
    let tasksPrior = 0;
    for (const task of doneTasks) {
      const completedAt = task.completedAt ?? task._creationTime;
      if (completedAt >= currentStart) tasksCurrent += 1;
      else if (completedAt >= priorStart) tasksPrior += 1;
    }

    // Policy denials — DENIED tool calls in each window.
    const deniedCalls = (await ctx.db
      .query("toolCalls")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect())
      .filter((call) => call.status === "DENIED" && call.startedAt >= priorStart);
    let denialsCurrent = 0;
    let denialsPrior = 0;
    for (const call of deniedCalls) {
      if (call.startedAt >= currentStart) denialsCurrent += 1;
      else denialsPrior += 1;
    }

    return {
      runs: { value: runsCurrent, delta: runsCurrent - runsPrior },
      tasksCompleted: { value: tasksCurrent, delta: tasksCurrent - tasksPrior },
      costUsd: {
        value: Math.round(costCurrent * 100) / 100,
        delta: Math.round((costCurrent - costPrior) * 100) / 100,
      },
      policyDenials: {
        value: denialsCurrent,
        delta: denialsCurrent - denialsPrior,
      },
    };
  },
});

const MAX_MODELS = 4;

export const dailyModelCost = query({
  args: {
    projectId: v.id("projects"),
    periodDays: v.number(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    days: Array<{ date: string; series: Record<string, number> }>;
    models: string[];
  }> => {
    const now = Date.now();
    const periodDays = Math.max(1, Math.floor(args.periodDays));
    const start = now - periodDays * DAY_MS;

    const runs = (await ctx.db
      .query("runs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect())
      .filter((run) => run.startedAt >= start);

    // Total cost per model → keep the top MAX_MODELS, fold the rest into "other".
    const totals = new Map<string, number>();
    for (const run of runs) {
      totals.set(run.model, (totals.get(run.model) ?? 0) + run.costUsd);
    }
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const kept = ranked.slice(0, MAX_MODELS).map(([model]) => model);
    const hasOther = ranked.length > MAX_MODELS;
    const models = hasOther ? [...kept.slice(0, MAX_MODELS - 1), "other"] : kept;
    const keptSet = new Set(hasOther ? kept.slice(0, MAX_MODELS - 1) : kept);

    // Zero-filled day buckets so the chart has a continuous x-axis.
    const byDay = new Map<string, Record<string, number>>();
    for (let i = periodDays - 1; i >= 0; i--) {
      const date = dayKey(now - i * DAY_MS);
      const series: Record<string, number> = {};
      for (const model of models) series[model] = 0;
      byDay.set(date, series);
    }
    for (const run of runs) {
      const series = byDay.get(dayKey(run.startedAt));
      if (!series) continue;
      const bucket = keptSet.has(run.model) ? run.model : "other";
      if (!(bucket in series)) continue;
      series[bucket] = Math.round((series[bucket] + run.costUsd) * 10000) / 10000;
    }

    return {
      days: [...byDay.entries()].map(([date, series]) => ({ date, series })),
      models,
    };
  },
});

const HEATMAP_DAYS = 365;
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

export const activityHeatmap = query({
  args: { projectId: v.id("projects") },
  handler: async (
    ctx,
    args
  ): Promise<{
    days: Array<{ date: string; count: number }>;
    stats: {
      mostActiveMonth: string | null;
      mostActiveDay: string | null;
      longestStreakDays: number;
      currentStreakDays: number;
    };
  }> => {
    const now = Date.now();
    const cutoff = now - HEATMAP_DAYS * DAY_MS;

    const activities = (await ctx.db
      .query("activities")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect())
      .filter((activity) => activity._creationTime >= cutoff);

    // Zero-filled counts for the past 365 days, oldest first.
    const counts = new Map<string, number>();
    for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
      counts.set(dayKey(now - i * DAY_MS), 0);
    }
    for (const activity of activities) {
      const key = dayKey(activity._creationTime);
      const prev = counts.get(key);
      if (prev !== undefined) counts.set(key, prev + 1);
    }

    const days = [...counts.entries()].map(([date, count]) => ({ date, count }));

    // Most active month ("June 2026") and weekday ("Tuesday") by total count.
    const monthTotals = new Map<string, number>();
    const weekdayTotals = new Map<number, number>();
    for (const { date, count } of days) {
      if (count === 0) continue;
      const d = new Date(`${date}T00:00:00Z`);
      const monthLabel = `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
      monthTotals.set(monthLabel, (monthTotals.get(monthLabel) ?? 0) + count);
      weekdayTotals.set(
        d.getUTCDay(),
        (weekdayTotals.get(d.getUTCDay()) ?? 0) + count
      );
    }
    let mostActiveMonth: string | null = null;
    let bestMonthCount = 0;
    for (const [label, total] of monthTotals) {
      if (total > bestMonthCount) {
        mostActiveMonth = label;
        bestMonthCount = total;
      }
    }
    let mostActiveDay: string | null = null;
    let bestDayCount = 0;
    for (const [weekday, total] of weekdayTotals) {
      if (total > bestDayCount) {
        mostActiveDay = WEEKDAY_NAMES[weekday];
        bestDayCount = total;
      }
    }

    // Streaks — consecutive days with count > 0. Current streak counts back
    // from today; a zero today defers to yesterday (GitHub semantics).
    let longestStreakDays = 0;
    let running = 0;
    for (const { count } of days) {
      running = count > 0 ? running + 1 : 0;
      if (running > longestStreakDays) longestStreakDays = running;
    }
    let currentStreakDays = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      const { count } = days[i];
      if (count > 0) {
        currentStreakDays += 1;
      } else if (i === days.length - 1) {
        continue; // today has no activity yet — streak may still be alive
      } else {
        break;
      }
    }

    return {
      days,
      stats: { mostActiveMonth, mostActiveDay, longestStreakDays, currentStreakDays },
    };
  },
});

/** KPI + gate inputs for the waku-inspired schematic overview. */
export const schematicOverview = query({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    // Every source below is SCOPED BEFORE IT IS LIMITED.
    //
    // The previous shape — `.order("desc").take(500)` and then a JS filter on
    // `projectId` — reads the newest N rows across the whole deployment and
    // then discards everything belonging to another workspace. On any busy
    // installation the selected workspace's KPI strip and every sidebar badge
    // silently read zero while that workspace is demonstrably active.
    const projectId = args.projectId;

    const runs = await (projectId
      ? ctx.db
          .query("runs")
          .withIndex("by_project", (q) => q.eq("projectId", projectId))
          .order("desc")
          .take(500)
      : ctx.db.query("runs").order("desc").take(500));

    const activities = await (projectId
      ? ctx.db
          .query("activities")
          .withIndex("by_project", (q) => q.eq("projectId", projectId))
          .order("desc")
          .take(200)
      : ctx.db.query("activities").order("desc").take(200));

    const toolCallCount = (await (projectId
      ? ctx.db
          .query("toolCalls")
          .withIndex("by_project", (q) => q.eq("projectId", projectId))
          .take(2000)
      : ctx.db.query("toolCalls").take(2000))).length;

    const skillCount = (await (projectId
      ? ctx.db
          .query("contextPackages")
          .withIndex("by_project", (q) => q.eq("projectId", projectId))
          .take(500)
      : ctx.db.query("contextPackages").take(500))).length;

    const factCount = (await (projectId
      ? ctx.db
          .query("knowledgeGraphNodes")
          .withIndex("by_project_source", (q) => q.eq("projectId", projectId))
          .take(5000)
      : ctx.db.query("knowledgeGraphNodes").take(5000))).length;

    const totalCost = runs.reduce((s, r) => s + r.costUsd, 0);
    const withDuration = runs.filter((r) => r.durationMs != null);
    const avgTurnMs =
      withDuration.length > 0
        ? withDuration.reduce((s, r) => s + (r.durationMs ?? 0), 0) / withDuration.length
        : null;

    const scopedTasks = await (projectId
      ? ctx.db
          .query("tasks")
          .withIndex("by_project", (q) => q.eq("projectId", projectId))
          .collect()
      : ctx.db.query("tasks").collect());

    const opEvents = await (projectId
      ? ctx.db
          .query("opEvents")
          .withIndex("by_project", (q) => q.eq("projectId", projectId))
          .take(2000)
      : ctx.db.query("opEvents").take(2000));

    const alertCount = (await (projectId
      ? ctx.db
          .query("alerts")
          .withIndex("by_project", (q) => q.eq("projectId", projectId))
          .collect()
      : ctx.db.query("alerts").take(5000))).length;

    // One definition of "pending" across the product: PENDING ∪ ESCALATED.
    // `escalateOverdue` moves rows PENDING -> ESCALATED on a timer, so counting
    // PENDING alone makes the badge DROP as work becomes more urgent.
    const pendingApprovals = (
      await countPendingApprovals(ctx, projectId ?? null)
    ).total;

    const blockedTasks = scopedTasks.filter((t) => t.status === "BLOCKED").length;
    const approvalTasks = scopedTasks.filter((t) => t.status === "NEEDS_APPROVAL").length;
    const gated = pendingApprovals + approvalTasks + blockedTasks;
    const autoRouted = Math.max(0, runs.length - gated);

    return {
      totalCost,
      avgTurnMs,
      turns: runs.length,
      toolCalls: toolCallCount,
      facts: factCount,
      events: activities.length,
      gateAuto: autoRouted,
      gateGated: gated,
      pendingApprovals,
      blockedTasks,
      skillCount,
      episodeCount: runs.filter((r) => r.status === "COMPLETED").length,
      traceFiles: runs.length,
      taskCount: scopedTasks.length,
      opEventCount: opEvents.length,
      alertCount,
    };
  },
});

/** Recent execution runs for Loop view and chat session picker. */
export const recentRunTurns = query({
  args: {
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const projectId = args.projectId;
    const runs = await (projectId
      ? ctx.db
          .query("runs")
          .withIndex("by_project", (q) => q.eq("projectId", projectId))
          .order("desc")
          .take(limit)
      : ctx.db.query("runs").order("desc").take(limit));

    // Join per run through the run index instead of a globally truncated scan,
    // which silently reported 0 tool calls once `toolCalls` exceeded 5000 rows.
    const toolCallsByRun = new Map(
      await Promise.all(
        runs.map(async (r) => [
          String(r._id),
          await ctx.db
            .query("toolCalls")
            .withIndex("by_run", (q) => q.eq("runId", r._id))
            .take(50),
        ] as const),
      ),
    );

    return runs.map((r) => {
      const tools = toolCallsByRun.get(String(r._id)) ?? [];
      return {
        id: r._id,
        label: r.model ?? `Run ${String(r._id).slice(-6)}`,
        userMessage: r.sessionKey,
        reply: r.error ?? r.status,
        timestamp: new Date(r._creationTime).toISOString().replace("T", " ").slice(0, 19),
        latencyMs: r.durationMs ?? null,
        cost: r.costUsd,
        model: r.model,
        toolCount: tools.length,
        tools: tools.slice(0, 8).map((t) => ({
          tool: t.toolName,
          status: t.status === "FAILED" ? ("error" as const) : ("ok" as const),
          summary: (t.outputPreview ?? t.error)?.slice(0, 120),
          output: t.outputPreview ?? t.error,
        })),
        // No gate/policy engine participated in this run, so there is no gate
        // verdict to report. Synthesizing one from `status` rendered a
        // governance badge ("gate · skip / auto-routed") that no gate produced.
        gate: null,
      };
    });
  },
});

/** Activity feed cursor for live architecture diagram animation. */
export const recentHarnessEvents = query({
  args: {
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    const scopedProjectId = args.projectId;
    const activities = await (scopedProjectId
      ? ctx.db
          .query("activities")
          .withIndex("by_project", (q) => q.eq("projectId", scopedProjectId))
          .order("desc")
          .take(limit * 2)
      : ctx.db.query("activities").order("desc").take(limit * 2));
    return activities.slice(0, limit).map((a) => ({
      id: a._id,
      type: a.action,
      description: a.description,
      at: a._creationTime,
    }));
  },
});

/** Gateway inbox sessions derived from recent runs. */
export const gatewaySessions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const runs = await ctx.db.query("runs").order("desc").take(limit * 3);
    const bySession = new Map<string, typeof runs>();
    for (const r of runs) {
      const key = r.sessionKey;
      if (!bySession.has(key)) bySession.set(key, []);
      bySession.get(key)!.push(r);
    }
    return [...bySession.entries()].slice(0, limit).map(([sessionKey, group]) => {
      const latest = group[0];
      const channel = sessionKey.includes("telegram")
        ? "telegram"
        : sessionKey.includes("voice")
          ? "voice"
          : "web";
      return {
        id: sessionKey,
        title: sessionKey.replace(/^agent::/, "Agent · "),
        channel,
        preview: latest.error ?? `${latest.status} · ${latest.model}`,
        meta: `${group.length} run(s) · ${new Date(latest._creationTime).toLocaleString()}`,
      };
    });
  },
});

/** Convex table browser for Data explorer (waku Database tab). */
export const dataExplorerTables = query({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    const tables = [
      { id: "tasks", label: "tasks", description: "Work order task lifecycle" },
      { id: "runs", label: "runs", description: "Agent execution runs" },
      { id: "toolCalls", label: "toolCalls", description: "Tool invocations per run" },
      { id: "activities", label: "activities", description: "Audit and activity log" },
      { id: "approvals", label: "approvals", description: "Human approval queue" },
      { id: "agents", label: "agents", description: "Registered agents" },
    ] as const;

    const samples: Record<string, { columns: string[]; rows: Record<string, string>[]; count: number }> = {};

    let tasks = await ctx.db.query("tasks").order("desc").take(8);
    if (args.projectId) tasks = tasks.filter((t) => t.projectId === args.projectId);
    samples.tasks = {
      columns: ["title", "status", "priority"],
      rows: tasks.map((t) => ({
        title: t.title.slice(0, 80),
        status: t.status,
        priority: String(t.priority ?? "—"),
      })),
      count: tasks.length,
    };

    let runs = await ctx.db.query("runs").order("desc").take(8);
    if (args.projectId) runs = runs.filter((r) => r.projectId === args.projectId);
    samples.runs = {
      columns: ["model", "status", "costUsd"],
      rows: runs.map((r) => ({
        model: r.model,
        status: r.status,
        costUsd: String(r.costUsd),
      })),
      count: runs.length,
    };

    let toolCalls = await ctx.db.query("toolCalls").order("desc").take(8);
    if (args.projectId) toolCalls = toolCalls.filter((t) => t.projectId === args.projectId);
    samples.toolCalls = {
      columns: ["toolName", "status", "riskLevel"],
      rows: toolCalls.map((t) => ({
        toolName: t.toolName,
        status: t.status,
        riskLevel: t.riskLevel,
      })),
      count: toolCalls.length,
    };

    let activities = await ctx.db.query("activities").order("desc").take(8);
    if (args.projectId) activities = activities.filter((a) => a.projectId === args.projectId);
    samples.activities = {
      columns: ["action", "description", "actorType"],
      rows: activities.map((a) => ({
        action: a.action,
        description: a.description.slice(0, 80),
        actorType: a.actorType,
      })),
      count: activities.length,
    };

    return tables.map((t) => ({
      ...t,
      sample: samples[t.id] ?? { columns: [], rows: [], count: 0 },
    }));
  },
});
