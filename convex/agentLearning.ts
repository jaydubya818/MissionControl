import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Agent Learning System
 * 
 * Tracks agent performance and learns from successes/failures
 * to improve task routing and assignment over time.
 */

// ============================================================================
// SCHEMA ADDITIONS NEEDED:
// ============================================================================
// New table: agentPerformance
// - agentId: v.id("agents")
// - projectId: v.id("projects")
// - taskType: v.string()
// - successCount: v.number()
// - failureCount: v.number()
// - avgCompletionTime: v.number() // milliseconds
// - avgCost: v.number()
// - totalTasksCompleted: v.number()
// - lastUpdated: v.number()
//
// New table: agentPatterns
// - agentId: v.id("agents")
// - pattern: v.string() // e.g., "good_at_backend", "struggles_with_ui"
// - confidence: v.number() // 0-1
// - evidence: v.array(v.string()) // task IDs
// - discoveredAt: v.number()

// ============================================================================
// QUERIES
// ============================================================================

export const getAgentPerformance = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    // Get all completed tasks for this agent
    const tasks = await ctx.db
      .query("tasks")
      .filter((q) => q.eq(q.field("assigneeIds"), [args.agentId]))
      .collect();
    
    const completedTasks = tasks.filter(t => t.status === "DONE");
    const failedTasks = tasks.filter(t => t.status === "CANCELED" || t.status === "BLOCKED");
    
    // Calculate metrics
    const totalCost = completedTasks.reduce((sum, t) => sum + t.actualCost, 0);
    const avgCost = completedTasks.length > 0 ? totalCost / completedTasks.length : 0;
    
    // Group by task type
    const byType: Record<string, { completed: number; failed: number; avgCost: number }> = {};
    completedTasks.forEach(t => {
      if (!byType[t.type]) {
        byType[t.type] = { completed: 0, failed: 0, avgCost: 0 };
      }
      byType[t.type].completed++;
    });
    
    failedTasks.forEach(t => {
      if (!byType[t.type]) {
        byType[t.type] = { completed: 0, failed: 0, avgCost: 0 };
      }
      byType[t.type].failed++;
    });
    
    // Calculate success rate by type
    Object.keys(byType).forEach(type => {
      const total = byType[type].completed + byType[type].failed;
      const typeTasks = completedTasks.filter(t => t.type === type);
      byType[type].avgCost = typeTasks.reduce((sum, t) => sum + t.actualCost, 0) / typeTasks.length || 0;
    });
    
    return {
      agentId: args.agentId,
      totalCompleted: completedTasks.length,
      totalFailed: failedTasks.length,
      successRate: completedTasks.length / (completedTasks.length + failedTasks.length) || 0,
      avgCost,
      totalCost,
      byType,
    };
  },
});

export const getAgentStrengths = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const performance = await getAgentPerformance(ctx, args);
    
    // Identify strengths (high success rate, low cost)
    const strengths: Array<{ type: string; score: number; reason: string }> = [];
    
    Object.entries(performance.byType).forEach(([type, metrics]) => {
      const total = metrics.completed + metrics.failed;
      const successRate = metrics.completed / total;
      
      if (successRate > 0.8 && total >= 3) {
        strengths.push({
          type,
          score: successRate,
          reason: `High success rate (${(successRate * 100).toFixed(0)}%) with ${metrics.completed} completed tasks`,
        });
      }
    });
    
    // Sort by score
    strengths.sort((a, b) => b.score - a.score);
    
    return strengths;
  },
});

export const getAgentWeaknesses = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const performance = await getAgentPerformance(ctx, args);
    
    // Identify weaknesses (low success rate, high cost)
    const weaknesses: Array<{ type: string; score: number; reason: string }> = [];
    
    Object.entries(performance.byType).forEach(([type, metrics]) => {
      const total = metrics.completed + metrics.failed;
      const successRate = metrics.completed / total;
      
      if (successRate < 0.5 && total >= 2) {
        weaknesses.push({
          type,
          score: 1 - successRate,
          reason: `Low success rate (${(successRate * 100).toFixed(0)}%) with ${metrics.failed} failed tasks`,
        });
      }
    });
    
    // Sort by score (higher = worse)
    weaknesses.sort((a, b) => b.score - a.score);
    
    return weaknesses;
  },
});

export const getBestAgentForTask = query({
  args: {
    projectId: v.id("projects"),
    taskType: v.string(),
  },
  handler: async (ctx, args) => {
    // Get all agents for this project
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) => q.eq(q.field("status"), "ACTIVE"))
      .collect();
    
    // Score each agent for this task type
    const scores: Array<{ agentId: string; score: number; reason: string }> = [];
    
    for (const agent of agents) {
      const performance = await getAgentPerformance(ctx, { agentId: agent._id });
      const typeMetrics = performance.byType[args.taskType];
      
      if (typeMetrics) {
        const total = typeMetrics.completed + typeMetrics.failed;
        const successRate = typeMetrics.completed / total;
        const costScore = typeMetrics.avgCost > 0 ? 1 / typeMetrics.avgCost : 1;
        
        // Combined score: 70% success rate, 30% cost efficiency
        const score = (successRate * 0.7) + (costScore * 0.3);
        
        scores.push({
          agentId: agent._id,
          score,
          reason: `${(successRate * 100).toFixed(0)}% success, $${typeMetrics.avgCost.toFixed(2)} avg cost`,
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
    
    // Sort by score
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
    completionTime: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return;
    
    // Update performance metrics for each assigned agent
    for (const agentId of task.assigneeIds || []) {
      // TODO: Implement when agentPerformance table is added
      // This would update the agentPerformance table with new data
      
      // Log learning event
      await ctx.db.insert("activities", {
        projectId: task.projectId,
        taskId: args.taskId,
        actorType: "SYSTEM",
        action: "AGENT_LEARNING",
        body: `Recorded ${args.success ? "success" : "failure"} for agent performance tracking`,
      });
    }
    
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
    // TODO: Implement when agentPatterns table is added
    // This would insert a new pattern discovery
    
    const agent = await ctx.db.get(args.agentId);
    if (!agent) return;
    
    // Log pattern discovery
    await ctx.db.insert("activities", {
      projectId: agent.projectId,
      actorType: "SYSTEM",
      action: "PATTERN_DISCOVERED",
      body: `Discovered pattern: ${args.pattern} (${(args.confidence * 100).toFixed(0)}% confidence)`,
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
    
    const insights: Array<{ type: string; message: string; agentId?: string }> = [];
    
    for (const agent of agents) {
      const strengths = await getAgentStrengths(ctx, { agentId: agent._id });
      const weaknesses = await getAgentWeaknesses(ctx, { agentId: agent._id });
      
      if (strengths.length > 0) {
        insights.push({
          type: "strength",
          message: `${agent.name} excels at ${strengths[0].type}`,
          agentId: agent._id,
        });
      }
      
      if (weaknesses.length > 0) {
        insights.push({
          type: "weakness",
          message: `${agent.name} struggles with ${weaknesses[0].type}`,
          agentId: agent._id,
        });
      }
    }
    
    return insights;
  },
});
