/**
 * Analytics — Convex Functions
 *
 * Read-only aggregations powering the Analytics page: KPI summary with
 * period-over-period deltas, daily cost by model, and a 365-day activity
 * heatmap with streak stats. No mutations, no flag gate.
 */

import { v } from "convex/values";
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
  args: { periodDays: v.number() },
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
    const runs = await ctx.db
      .query("runs")
      .filter((q) => q.gte(q.field("startedAt"), priorStart))
      .collect();
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
    const doneTasks = await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", "DONE"))
      .collect();
    let tasksCurrent = 0;
    let tasksPrior = 0;
    for (const task of doneTasks) {
      const completedAt = task.completedAt ?? task._creationTime;
      if (completedAt >= currentStart) tasksCurrent += 1;
      else if (completedAt >= priorStart) tasksPrior += 1;
    }

    // Policy denials — DENIED tool calls in each window.
    const deniedCalls = await ctx.db
      .query("toolCalls")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "DENIED"),
          q.gte(q.field("startedAt"), priorStart)
        )
      )
      .collect();
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
  args: { periodDays: v.number() },
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

    const runs = await ctx.db
      .query("runs")
      .filter((q) => q.gte(q.field("startedAt"), start))
      .collect();

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
  args: {},
  handler: async (
    ctx
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

    const activities = await ctx.db
      .query("activities")
      .filter((q) => q.gte(q.field("_creationTime"), cutoff))
      .collect();

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
