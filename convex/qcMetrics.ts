/**
 * QC Metrics — Convex Functions
 *
 * Time-series quality data for dashboards and trends.
 */

import { v } from "convex/values";
import { query, internalMutation } from "./lib/missionScopedFunctions";

const environmentUnion = v.optional(v.union(
  v.literal("local"),
  v.literal("dev"),
  v.literal("staging"),
  v.literal("pilot"),
  v.literal("production")
));

// ============================================================================
// QUERIES
// ============================================================================

/**
 * List metrics for an environment in a time range
 */
export const listByEnvironment = query({
  args: {
    projectId: v.optional(v.id("projects")),
    environment: environmentUnion,
    metricName: v.optional(v.string()),
    fromTs: v.optional(v.number()),
    toTs: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let rows;
    if (args.projectId !== undefined && args.environment) {
      rows = await ctx.db
        .query("qcMetrics")
        .withIndex("by_project_env", (q) =>
          q.eq("projectId", args.projectId!).eq("environment", args.environment!)
        )
        .collect();
    } else if (args.projectId !== undefined) {
      rows = await ctx.db
        .query("qcMetrics")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
        .collect();
      if (args.environment) rows = rows.filter((r) => r.environment === args.environment);
    } else if (args.environment) {
      rows = await ctx.db
        .query("qcMetrics")
        .withIndex("by_environment", (q) => q.eq("environment", args.environment!))
        .collect();
    } else {
      rows = await ctx.db.query("qcMetrics").collect();
    }

    if (args.metricName) {
      rows = rows.filter((r) => r.metricName === args.metricName);
    }
    if (args.fromTs !== undefined) {
      rows = rows.filter((r) => r.recordedAt >= args.fromTs!);
    }
    if (args.toTs !== undefined) {
      rows = rows.filter((r) => r.recordedAt <= args.toTs!);
    }

    rows.sort((a, b) => b.recordedAt - a.recordedAt);
    const limit = args.limit ?? 200;
    return rows.slice(0, limit);
  },
});

/**
 * Aggregate stats (min, max, avg, p95) per metric name and environment
 */
export const aggregate = query({
  args: {
    projectId: v.optional(v.id("projects")),
    environment: environmentUnion,
    metricName: v.optional(v.string()),
    fromTs: v.optional(v.number()),
    toTs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let rows = await ctx.db.query("qcMetrics").collect();
    if (args.projectId !== undefined) {
      rows = rows.filter((r) => r.projectId === args.projectId);
    }
    if (args.environment) {
      rows = rows.filter((r) => r.environment === args.environment);
    }
    if (args.metricName) {
      rows = rows.filter((r) => r.metricName === args.metricName);
    }
    if (args.fromTs !== undefined) {
      rows = rows.filter((r) => r.recordedAt >= args.fromTs!);
    }
    if (args.toTs !== undefined) {
      rows = rows.filter((r) => r.recordedAt <= args.toTs!);
    }

    const byKey: Record<string, number[]> = {};
    for (const r of rows) {
      const key = `${r.metricName}|${r.environment ?? "none"}`;
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(r.value);
    }

    const result: { metricName: string; environment: string | null; min: number; max: number; avg: number; p95: number; count: number }[] = [];
    for (const [key, values] of Object.entries(byKey)) {
      const [metricName, env] = key.split("|");
      const sorted = [...values].sort((a, b) => a - b);
      const min = sorted[0] ?? 0;
      const max = sorted[sorted.length - 1] ?? 0;
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = values.length ? sum / values.length : 0;
      const p95Idx = Math.floor(sorted.length * 0.95);
      const p95 = sorted[p95Idx] ?? 0;
      result.push({
        metricName,
        environment: env === "none" ? null : env,
        min,
        max,
        avg,
        p95,
        count: values.length,
      });
    }
    return result;
  },
});

/**
 * Latest value of each metric per environment (for sparklines)
 */
export const latestByEnvironment = query({
  args: {
    projectId: v.optional(v.id("projects")),
    environment: environmentUnion,
    metricNames: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    let rows = await ctx.db.query("qcMetrics").collect();
    if (args.projectId !== undefined) {
      rows = rows.filter((r) => r.projectId === args.projectId);
    }
    if (args.environment) {
      rows = rows.filter((r) => r.environment === args.environment);
    }
    if (args.metricNames?.length) {
      const set = new Set(args.metricNames);
      rows = rows.filter((r) => set.has(r.metricName));
    }

    const latest: Record<string, { value: number; recordedAt: number }> = {};
    for (const r of rows) {
      const key = `${r.metricName}|${r.environment ?? "none"}`;
      const existing = latest[key];
      if (!existing || r.recordedAt > existing.recordedAt) {
        latest[key] = { value: r.value, recordedAt: r.recordedAt };
      }
    }
    return latest;
  },
});

// ============================================================================
// MUTATIONS (internal)
// ============================================================================

/**
 * Record a metric data point (called from QC execute action)
 */
export const record = internalMutation({
  args: {
    projectId: v.optional(v.id("projects")),
    environment: environmentUnion,
    metricName: v.string(),
    value: v.number(),
    unit: v.string(),
    qcRunId: v.optional(v.id("qcRuns")),
    recordedAt: v.number(),
    tags: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("qcMetrics", {
      projectId: args.projectId,
      environment: args.environment,
      metricName: args.metricName,
      value: args.value,
      unit: args.unit,
      qcRunId: args.qcRunId,
      recordedAt: args.recordedAt,
      tags: args.tags,
    });
  },
});
