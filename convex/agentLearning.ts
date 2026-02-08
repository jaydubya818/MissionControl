import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Agent Learning System
 * 
 * Tracks agent performance and learns from successes/failures
 * to improve task routing and assignment over time.
 * 
 * Uses tables: agentPerformance, agentPatterns
 */

// ============================================================================
// QUERIES
// ============================================================================

export const getAgentPerformance = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    // Get aggregated performance by task type
    const perfRecords = await ctx.db
      .query("agentPerformance")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .collect();

    const totalCompleted = perfRecords.reduce((s, r) => s + r.successCount, 0);
    const totalFailed = perfRecords.reduce((s, r) => s + r.failureCount, 0);
    const totalCost = perfRecords.reduce(
      (s, r) => s + r.avgCostUsd * r.totalTasksCompleted,
      0
    );

    const byType: Record<
      string,
      { completed: number; failed: number; avgCost: number }
    > = {};
    for (const rec of perfRecords) {
      byType[rec.taskType] = {
        completed: rec.successCount,
        failed: rec.failureCount,
        avgCost: rec.avgCostUsd,
      };
    }

    return {
      agentId: args.agentId,
      totalCompleted,
      totalFailed,
      successRate:
        totalCompleted + totalFailed > 0
          ? totalCompleted / (totalCompleted + totalFailed)
          : 0,
      avgCost: totalCompleted > 0 ? totalCost / totalCompleted : 0,
      totalCost,
      byType,
    };
  },
});

/** List all discovered patterns, optionally filtered by project */
export const listPatterns = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    if (args.projectId) {
      return await ctx.db
        .query("agentPatterns")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
    }
    return await ctx.db.query("agentPatterns").collect();
  },
});

export const getAgentStrengths = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const patterns = await ctx.db
      .query("agentPatterns")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .collect();

    return patterns
      .filter((p) => p.pattern.startsWith("strength:"))
      .map((p) => ({
        type: p.pattern.replace("strength:", ""),
        score: p.confidence,
        reason: `Based on ${p.evidence.length} task(s)`,
        evidence: p.evidence,
      }))
      .sort((a, b) => b.score - a.score);
  },
});

export const getAgentWeaknesses = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const patterns = await ctx.db
      .query("agentPatterns")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .collect();

    return patterns
      .filter((p) => p.pattern.startsWith("weakness:"))
      .map((p) => ({
        type: p.pattern.replace("weakness:", ""),
        score: p.confidence,
        reason: `Based on ${p.evidence.length} task(s)`,
        evidence: p.evidence,
      }))
      .sort((a, b) => b.score - a.score);
  },
});

export const getBestAgentForTask = query({
  args: {
    projectId: v.id("projects"),
    taskType: v.string(),
  },
  handler: async (ctx, args) => {
    // Get all active agents for this project
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_project_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", "ACTIVE")
      )
      .collect();

    const scores: Array<{
      agentId: string;
      score: number;
      reason: string;
    }> = [];

    for (const agent of agents) {
      // Look up performance record for this task type
      const perfRecord = await ctx.db
        .query("agentPerformance")
        .withIndex("by_agent_type", (q) =>
          q.eq("agentId", agent._id).eq("taskType", args.taskType)
        )
        .first();

      if (perfRecord) {
        const total = perfRecord.successCount + perfRecord.failureCount;
        const successRate = total > 0 ? perfRecord.successCount / total : 0;
        const costScore =
          perfRecord.avgCostUsd > 0 ? 1 / perfRecord.avgCostUsd : 1;

        // Combined score: 70% success rate, 30% cost efficiency
        const score = successRate * 0.7 + Math.min(costScore, 1) * 0.3;

        scores.push({
          agentId: agent._id,
          score,
          reason: `${(successRate * 100).toFixed(0)}% success, $${perfRecord.avgCostUsd.toFixed(2)} avg cost`,
        });
      } else {
        // No history for this type, use default score
        scores.push({
          agentId: agent._id,
          score: 0.5,
          reason: "No history for this task type",
        });
      }
    }

    scores.sort((a, b) => b.score - a.score);
    return scores[0] || null;
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

export const recordTaskCompletion = mutation({
  args: {
    taskId: v.id("tasks"),
    success: v.boolean(),
    completionTimeMs: v.optional(v.number()),
    costUsd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return { success: false, error: "Task not found" };

    for (const agentId of task.assigneeIds || []) {
      // Find or create performance record for this agent + task type
      const existing = await ctx.db
        .query("agentPerformance")
        .withIndex("by_agent_type", (q) =>
          q.eq("agentId", agentId).eq("taskType", task.type)
        )
        .first();

      if (existing) {
        const newTotal = existing.totalTasksCompleted + 1;
        const newAvgTime =
          args.completionTimeMs != null
            ? (existing.avgCompletionTimeMs * existing.totalTasksCompleted +
                args.completionTimeMs) /
              newTotal
            : existing.avgCompletionTimeMs;
        const newAvgCost =
          args.costUsd != null
            ? (existing.avgCostUsd * existing.totalTasksCompleted +
                args.costUsd) /
              newTotal
            : existing.avgCostUsd;

        await ctx.db.patch(existing._id, {
          successCount: existing.successCount + (args.success ? 1 : 0),
          failureCount: existing.failureCount + (args.success ? 0 : 1),
          avgCompletionTimeMs: newAvgTime,
          avgCostUsd: newAvgCost,
          totalTasksCompleted: newTotal,
          lastUpdatedAt: Date.now(),
        });
      } else {
        await ctx.db.insert("agentPerformance", {
          agentId,
          projectId: task.projectId,
          taskType: task.type,
          successCount: args.success ? 1 : 0,
          failureCount: args.success ? 0 : 1,
          avgCompletionTimeMs: args.completionTimeMs ?? 0,
          avgCostUsd: args.costUsd ?? 0,
          totalTasksCompleted: 1,
          lastUpdatedAt: Date.now(),
        });
      }

      // Log learning event
      await ctx.db.insert("activities", {
        projectId: task.projectId,
        taskId: args.taskId,
        agentId,
        actorType: "SYSTEM",
        action: "AGENT_LEARNING",
        description: `Recorded ${args.success ? "success" : "failure"} for ${task.type} task performance`,
      });
    }

    return { success: true };
  },
});

/** Create a pattern manually from the UI (upserts if agent+pattern already exists) */
export const createPattern = mutation({
  args: {
    agentId: v.id("agents"),
    projectId: v.optional(v.id("projects")),
    pattern: v.string(),
    confidence: v.number(),
    evidence: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw new Error("Agent not found");

    const projectId = args.projectId ?? agent.projectId;

    // Check for existing pattern to prevent duplicates (same logic as discoverPattern)
    const existing = await ctx.db
      .query("agentPatterns")
      .withIndex("by_agent_pattern", (q) =>
        q.eq("agentId", args.agentId).eq("pattern", args.pattern)
      )
      .first();

    if (existing) {
      // Merge: update confidence and evidence on the existing record
      const mergedEvidence = [
        ...new Set([...existing.evidence, ...(args.evidence ?? [])]),
      ];
      const newConfidence = existing.confidence * 0.4 + args.confidence * 0.6;

      await ctx.db.patch(existing._id, {
        confidence: newConfidence,
        evidence: mergedEvidence,
        lastSeenAt: Date.now(),
      });

      await ctx.db.insert("activities", {
        projectId,
        actorType: "HUMAN",
        action: "PATTERN_UPDATED",
        description: `Updated existing pattern: ${args.pattern}`,
        agentId: args.agentId,
      });

      return { patternId: existing._id, created: false };
    }

    const id = await ctx.db.insert("agentPatterns", {
      agentId: args.agentId,
      projectId,
      pattern: args.pattern,
      confidence: args.confidence,
      evidence: args.evidence ?? [],
      discoveredAt: Date.now(),
      lastSeenAt: Date.now(),
    });

    await ctx.db.insert("activities", {
      projectId,
      actorType: "HUMAN",
      action: "PATTERN_CREATED",
      description: `Manually created pattern: ${args.pattern}`,
      agentId: args.agentId,
    });

    return { patternId: id, created: true };
  },
});

/** Update an existing pattern */
export const updatePattern = mutation({
  args: {
    patternId: v.id("agentPatterns"),
    pattern: v.optional(v.string()),
    confidence: v.optional(v.number()),
    evidence: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.patternId);
    if (!existing) throw new Error("Pattern not found");

    const updates: Record<string, unknown> = { lastSeenAt: Date.now() };
    if (args.pattern !== undefined) updates.pattern = args.pattern;
    if (args.confidence !== undefined) updates.confidence = args.confidence;
    if (args.evidence !== undefined) updates.evidence = args.evidence;

    await ctx.db.patch(args.patternId, updates);
    return { success: true };
  },
});

/** Remove a pattern */
export const removePattern = mutation({
  args: {
    patternId: v.id("agentPatterns"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.patternId);
    if (!existing) throw new Error("Pattern not found");

    await ctx.db.delete(args.patternId);

    await ctx.db.insert("activities", {
      projectId: existing.projectId,
      actorType: "HUMAN",
      action: "PATTERN_DELETED",
      description: `Deleted pattern: ${existing.pattern}`,
      agentId: existing.agentId,
    });

    return { success: true };
  },
});

export const discoverPattern = mutation({
  args: {
    agentId: v.id("agents"),
    pattern: v.string(),
    confidence: v.number(),
    evidence: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) return { success: false, error: "Agent not found" };

    // Check for existing pattern
    const existing = await ctx.db
      .query("agentPatterns")
      .withIndex("by_agent_pattern", (q) =>
        q.eq("agentId", args.agentId).eq("pattern", args.pattern)
      )
      .first();

    if (existing) {
      // Merge evidence (deduplicate)
      const mergedEvidence = [
        ...new Set([...existing.evidence, ...args.evidence]),
      ];
      // Average confidence with slight recency bias
      const newConfidence =
        existing.confidence * 0.4 + args.confidence * 0.6;

      await ctx.db.patch(existing._id, {
        confidence: newConfidence,
        evidence: mergedEvidence,
        lastSeenAt: Date.now(),
      });
    } else {
      await ctx.db.insert("agentPatterns", {
        agentId: args.agentId,
        projectId: agent.projectId,
        pattern: args.pattern,
        confidence: args.confidence,
        evidence: args.evidence,
        discoveredAt: Date.now(),
        lastSeenAt: Date.now(),
      });
    }

    // Log pattern discovery
    await ctx.db.insert("activities", {
      projectId: agent.projectId,
      agentId: args.agentId,
      actorType: "SYSTEM",
      action: "PATTERN_DISCOVERED",
      description: `Discovered pattern: ${args.pattern} (${(args.confidence * 100).toFixed(0)}% confidence)`,
    });

    return { success: true };
  },
});

// ============================================================================
// ANALYTICS
// ============================================================================

export const getProjectLearningInsights = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const insights: Array<{
      type: string;
      message: string;
      agentId?: string;
    }> = [];

    for (const agent of agents) {
      // Check performance records for this agent
      const perfRecords = await ctx.db
        .query("agentPerformance")
        .withIndex("by_agent", (q) => q.eq("agentId", agent._id))
        .collect();

      for (const rec of perfRecords) {
        const total = rec.successCount + rec.failureCount;
        if (total < 2) continue;

        const successRate = rec.successCount / total;
        if (successRate > 0.8) {
          insights.push({
            type: "strength",
            message: `${agent.name} excels at ${rec.taskType} (${(successRate * 100).toFixed(0)}% success rate)`,
            agentId: agent._id,
          });
        } else if (successRate < 0.5) {
          insights.push({
            type: "weakness",
            message: `${agent.name} struggles with ${rec.taskType} (${(successRate * 100).toFixed(0)}% success rate)`,
            agentId: agent._id,
          });
        }
      }

      // Check discovered patterns
      const patterns = await ctx.db
        .query("agentPatterns")
        .withIndex("by_agent", (q) => q.eq("agentId", agent._id))
        .collect();

      for (const pat of patterns) {
        if (pat.confidence > 0.7) {
          insights.push({
            type: pat.pattern.startsWith("strength:") ? "strength" : "weakness",
            message: `${agent.name}: ${pat.pattern} (${(pat.confidence * 100).toFixed(0)}% confidence)`,
            agentId: agent._id,
          });
        }
      }
    }

    return insights;
  },
});
