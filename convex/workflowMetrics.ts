/**
 * Workflow Metrics — Convex Functions
 * 
 * Track and analyze workflow performance over time.
 */

import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get metrics for a specific workflow
 */
export const getWorkflowMetrics = query({
  args: {
    workflowId: v.string(),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("workflowMetrics")
      .withIndex("by_workflow", (q) => q.eq("workflowId", args.workflowId));
    
    const metrics = await query.order("desc").first();
    
    return metrics;
  },
});

/**
 * Get metrics for all workflows
 */
export const getAllMetrics = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const allMetrics = args.projectId
      ? await ctx.db
          .query("workflowMetrics")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
          .collect()
      : await ctx.db.query("workflowMetrics").collect();
    
    // Get latest metrics for each workflow
    const latestByWorkflow = new Map<string, Doc<"workflowMetrics">>();
    
    for (const metric of allMetrics) {
      const existing = latestByWorkflow.get(metric.workflowId);
      if (!existing || metric.lastUpdated > existing.lastUpdated) {
        latestByWorkflow.set(metric.workflowId, metric);
      }
    }
    
    return Array.from(latestByWorkflow.values());
  },
});

/**
 * Get workflow performance summary
 */
export const getSummary = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const runs = args.projectId
      ? await ctx.db
          .query("workflowRuns")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
          .collect()
      : await ctx.db.query("workflowRuns").collect();
    
    const total = runs.length;
    const completed = runs.filter((r) => r.status === "COMPLETED").length;
    const failed = runs.filter((r) => r.status === "FAILED").length;
    const running = runs.filter((r) => r.status === "RUNNING").length;
    const paused = runs.filter((r) => r.status === "PAUSED").length;
    
    const successRate = total > 0 ? completed / total : 0;
    
    // Calculate average duration for completed runs
    const completedRuns = runs.filter((r) => r.completedAt);
    const avgDuration =
      completedRuns.length > 0
        ? completedRuns.reduce((sum, r) => sum + (r.completedAt! - r.startedAt), 0) /
          completedRuns.length
        : 0;
    
    // Count total retries
    const totalRetries = runs.reduce(
      (sum, r) => sum + r.steps.reduce((s, step) => s + step.retryCount, 0),
      0
    );
    
    // Count escalations (paused runs)
    const totalEscalations = paused;
    
    return {
      total,
      completed,
      failed,
      running,
      paused,
      successRate,
      avgDurationMs: avgDuration,
      totalRetries,
      totalEscalations,
    };
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Update metrics for a workflow (called when a run completes)
 */
export const updateMetrics = internalMutation({
  args: {
    workflowId: v.string(),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const periodStart = now - 30 * 24 * 60 * 60 * 1000; // Last 30 days
    
    // Get all runs for this workflow in the period
    const runs = await ctx.db
      .query("workflowRuns")
      .withIndex("by_workflow_id", (q) => q.eq("workflowId", args.workflowId))
      .filter((q) => q.gte(q.field("startedAt"), periodStart))
      .collect();
    
    if (runs.length === 0) {
      return { success: true, message: "No runs to analyze" };
    }
    
    // Calculate stats
    const totalRuns = runs.length;
    const successfulRuns = runs.filter((r) => r.status === "COMPLETED").length;
    const failedRuns = runs.filter((r) => r.status === "FAILED").length;
    const pausedRuns = runs.filter((r) => r.status === "PAUSED").length;
    const successRate = successfulRuns / totalRuns;
    
    // Duration stats (only completed runs)
    const completedRuns = runs.filter((r) => r.completedAt);
    const durations = completedRuns.map((r) => r.completedAt! - r.startedAt);
    const avgDurationMs =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const minDurationMs = durations.length > 0 ? Math.min(...durations) : 0;
    const maxDurationMs = durations.length > 0 ? Math.max(...durations) : 0;
    
    // Step stats
    const totalSteps = runs.reduce((sum, r) => sum + r.steps.length, 0);
    const completedSteps = runs.reduce(
      (sum, r) => sum + r.steps.filter((s) => s.status === "DONE").length,
      0
    );
    const avgStepsCompleted = completedSteps / runs.length;
    
    // Retry stats
    const totalRetries = runs.reduce(
      (sum, r) => sum + r.steps.reduce((s, step) => s + step.retryCount, 0),
      0
    );
    
    // Escalation stats
    const totalEscalations = pausedRuns;
    
    // Bottleneck analysis
    const stepStats = new Map<string, { failures: number; retries: number; total: number }>();
    
    for (const run of runs) {
      for (const step of run.steps) {
        const stats = stepStats.get(step.stepId) || { failures: 0, retries: 0, total: 0 };
        stats.total++;
        if (step.status === "FAILED") stats.failures++;
        stats.retries += step.retryCount;
        stepStats.set(step.stepId, stats);
      }
    }
    
    const bottlenecks = Array.from(stepStats.entries())
      .map(([stepId, stats]) => ({
        stepId,
        failureRate: stats.failures / stats.total,
        avgRetries: stats.retries / stats.total,
      }))
      .filter((b) => b.failureRate > 0.1 || b.avgRetries > 0.5) // Only significant bottlenecks
      .sort((a, b) => b.failureRate - a.failureRate)
      .slice(0, 5); // Top 5
    
    // Upsert metrics
    const existing = await ctx.db
      .query("workflowMetrics")
      .withIndex("by_workflow", (q) => q.eq("workflowId", args.workflowId))
      .filter((q) => q.eq(q.field("periodStart"), periodStart))
      .first();
    
    const metricsData = {
      workflowId: args.workflowId,
      projectId: args.projectId,
      periodStart,
      periodEnd: now,
      totalRuns,
      successfulRuns,
      failedRuns,
      pausedRuns,
      successRate,
      avgDurationMs,
      minDurationMs,
      maxDurationMs,
      avgStepsCompleted,
      totalRetries,
      totalEscalations,
      bottlenecks,
      lastUpdated: now,
    };
    
    if (existing) {
      await ctx.db.patch(existing._id, metricsData);
    } else {
      await ctx.db.insert("workflowMetrics", metricsData);
    }
    
    return { success: true };
  },
});

/**
 * Refresh metrics for all workflows
 */
export const refreshAll = mutation({
  handler: async (ctx) => {
    // Get all unique workflow IDs
    const workflows = await ctx.db.query("workflows").collect();
    
    for (const workflow of workflows) {
      await ctx.runMutation(internal.workflowMetrics.updateMetrics, {
        workflowId: workflow.workflowId,
      });
    }
    
    return { success: true, count: workflows.length };
  },
});
