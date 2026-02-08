/**
 * Task Router — Smart Task Assignment
 * 
 * Automatically assigns tasks to the best available agent based on:
 * - Skill matching (agent's allowedTaskTypes)
 * - Availability (agent status)
 * - Workload (current task count)
 * - Priority (agent role weight)
 */

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/** Performance data for an agent on a task type */
interface AgentPerfData {
  successRate: number;
  refuteCount: number;
  avgCostUsd: number;
  totalTasks: number;
}

/**
 * Calculate assignment score for an agent
 * 
 * Score = (skill_match * 0.3) + (availability * 0.2) + (workload * 0.2) + (performance * 0.2) + (role_weight * 0.1)
 * 
 * Performance factor (new): success rate from agentPerformance table
 */
function calculateScore(
  agent: {
    _id: Id<"agents">;
    status: string;
    role: string;
    allowedTaskTypes: string[];
  },
  taskType: string,
  agentWorkloads: Map<Id<"agents">, number>,
  maxWorkload: number,
  performanceData?: AgentPerfData
): number {
  // Skill match (0-1)
  const skillMatch = agent.allowedTaskTypes.includes(taskType) ? 1.0 : 0.0;
  
  // Availability (0-1)
  const availability = agent.status === "ACTIVE" ? 1.0 : 0.0;
  
  // Workload (0-1, inverse - lower workload = higher score)
  const currentWorkload = agentWorkloads.get(agent._id) || 0;
  const workloadScore = maxWorkload > 0 ? 1 - (currentWorkload / maxWorkload) : 1.0;
  
  // Role weight (0-1)
  const roleWeights: Record<string, number> = {
    LEAD: 1.0,
    SPECIALIST: 0.8,
    REVIEWER: 0.6,
    CHALLENGER: 0.6,
    INTERN: 0.4,
  };
  const roleWeight = roleWeights[agent.role] || 0.5;
  
  // Performance factor (0-1): based on success rate and refute count
  let performanceScore = 0.5; // default for agents with no history
  if (performanceData && performanceData.totalTasks > 0) {
    // Success rate (70% weight of performance)
    const successWeight = performanceData.successRate * 0.7;
    // Refute penalty (30% weight of performance) — lower refutes = higher score
    const refutePenalty = Math.max(0, 1 - performanceData.refuteCount * 0.1) * 0.3;
    performanceScore = successWeight + refutePenalty;
  }
  
  // Calculate weighted score (updated weights)
  const score = (
    skillMatch * 0.3 +
    availability * 0.2 +
    workloadScore * 0.2 +
    performanceScore * 0.2 +
    roleWeight * 0.1
  );
  
  return score;
}

/**
 * Find the best agent for a task
 */
export const findBestAgent = query({
  args: {
    projectId: v.id("projects"),
    taskType: v.string(),
    excludeAgentIds: v.optional(v.array(v.id("agents"))),
  },
  handler: async (ctx, args) => {
    // Get all agents in project
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    // Filter out excluded agents
    const excludeSet = new Set(args.excludeAgentIds || []);
    const availableAgents = agents.filter((a) => !excludeSet.has(a._id));
    
    if (availableAgents.length === 0) {
      return null;
    }
    
    // Get all tasks to calculate workloads
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "ASSIGNED"),
          q.eq(q.field("status"), "IN_PROGRESS")
        )
      )
      .collect();
    
    // Calculate workload per agent
    const agentWorkloads = new Map<Id<"agents">, number>();
    for (const task of tasks) {
      for (const agentId of task.assigneeIds) {
        agentWorkloads.set(agentId, (agentWorkloads.get(agentId) || 0) + 1);
      }
    }
    
    const maxWorkload = Math.max(...Array.from(agentWorkloads.values()), 1);
    
    // Load performance data for all agents
    const performanceMap = new Map<Id<"agents">, AgentPerfData>();
    for (const agent of availableAgents) {
      const perfRecord = await ctx.db
        .query("agentPerformance")
        .withIndex("by_agent_type", (q) =>
          q.eq("agentId", agent._id).eq("taskType", args.taskType)
        )
        .first();
      
      if (perfRecord) {
        const total = perfRecord.successCount + perfRecord.failureCount;
        performanceMap.set(agent._id, {
          successRate: total > 0 ? perfRecord.successCount / total : 0,
          refuteCount: perfRecord.failureCount,
          avgCostUsd: perfRecord.avgCostUsd,
          totalTasks: total,
        });
      }
    }
    
    // Score each agent (with performance data)
    const scoredAgents = availableAgents.map((agent) => {
      const perfData = performanceMap.get(agent._id);
      return {
        agent,
        score: calculateScore(agent, args.taskType, agentWorkloads, maxWorkload, perfData),
        workload: agentWorkloads.get(agent._id) || 0,
        performance: perfData,
      };
    });
    
    // Sort by score (highest first)
    scoredAgents.sort((a, b) => b.score - a.score);
    
    // Return top agent
    const best = scoredAgents[0];
    
    if (!best || best.score === 0) {
      return null;
    }
    
    return {
      agent: best.agent,
      score: best.score,
      workload: best.workload,
      performance: best.performance,
      reasoning: {
        skillMatch: best.agent.allowedTaskTypes.includes(args.taskType),
        isActive: best.agent.status === "ACTIVE",
        workload: best.workload,
        role: best.agent.role,
        successRate: best.performance?.successRate,
        totalTasks: best.performance?.totalTasks,
      },
    };
  },
});

/**
 * Get assignment recommendations for a task
 */
export const getRecommendations = query({
  args: {
    projectId: v.id("projects"),
    taskType: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 5;
    
    // Get all agents in project
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    if (agents.length === 0) {
      return [];
    }
    
    // Get all tasks to calculate workloads
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "ASSIGNED"),
          q.eq(q.field("status"), "IN_PROGRESS")
        )
      )
      .collect();
    
    // Calculate workload per agent
    const agentWorkloads = new Map<Id<"agents">, number>();
    for (const task of tasks) {
      for (const agentId of task.assigneeIds) {
        agentWorkloads.set(agentId, (agentWorkloads.get(agentId) || 0) + 1);
      }
    }
    
    const maxWorkload = Math.max(...Array.from(agentWorkloads.values()), 1);
    
    // Load performance data for all agents
    const performanceMap = new Map<Id<"agents">, AgentPerfData>();
    for (const agent of agents) {
      const perfRecord = await ctx.db
        .query("agentPerformance")
        .withIndex("by_agent_type", (q) =>
          q.eq("agentId", agent._id).eq("taskType", args.taskType)
        )
        .first();
      
      if (perfRecord) {
        const total = perfRecord.successCount + perfRecord.failureCount;
        performanceMap.set(agent._id, {
          successRate: total > 0 ? perfRecord.successCount / total : 0,
          refuteCount: perfRecord.failureCount,
          avgCostUsd: perfRecord.avgCostUsd,
          totalTasks: total,
        });
      }
    }
    
    // Score each agent (with performance data)
    const scoredAgents = agents.map((agent) => {
      const perfData = performanceMap.get(agent._id);
      return {
        agent,
        score: calculateScore(agent, args.taskType, agentWorkloads, maxWorkload, perfData),
        workload: agentWorkloads.get(agent._id) || 0,
        performance: perfData,
        reasoning: {
          skillMatch: agent.allowedTaskTypes.includes(args.taskType),
          isActive: agent.status === "ACTIVE",
          workload: agentWorkloads.get(agent._id) || 0,
          role: agent.role,
          successRate: perfData?.successRate,
          totalTasks: perfData?.totalTasks,
        },
      };
    });
    
    // Sort by score (highest first)
    scoredAgents.sort((a, b) => b.score - a.score);
    
    // Return top N
    return scoredAgents.slice(0, limit);
  },
});

/**
 * Auto-assign a task to the best agent
 */
export const autoAssign = mutation({
  args: {
    taskId: v.id("tasks"),
    actorType: v.union(v.literal("AGENT"), v.literal("HUMAN"), v.literal("SYSTEM")),
    actorUserId: v.optional(v.string()),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Task not found");
    }
    
    // Find best agent (inline logic instead of calling query)
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_project", (q) => q.eq("projectId", task.projectId))
      .collect();
    
    const excludeSet = new Set(task.assigneeIds);
    const availableAgents = agents.filter((a) => !excludeSet.has(a._id));
    
    if (availableAgents.length === 0) {
      return {
        success: false,
        error: "No suitable agent found",
      };
    }
    
    // Get all tasks to calculate workloads
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", task.projectId))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "ASSIGNED"),
          q.eq(q.field("status"), "IN_PROGRESS")
        )
      )
      .collect();
    
    const agentWorkloads = new Map();
    for (const t of tasks) {
      for (const agentId of t.assigneeIds) {
        agentWorkloads.set(agentId, (agentWorkloads.get(agentId) || 0) + 1);
      }
    }
    
    const maxWorkload = Math.max(...Array.from(agentWorkloads.values()), 1);
    
    // Load performance data for autoAssign
    const perfMap = new Map<string, AgentPerfData>();
    for (const agent of availableAgents) {
      const perfRecord = await ctx.db
        .query("agentPerformance")
        .withIndex("by_agent_type", (q) =>
          q.eq("agentId", agent._id).eq("taskType", task.type)
        )
        .first();
      if (perfRecord) {
        const total = perfRecord.successCount + perfRecord.failureCount;
        perfMap.set(agent._id as string, {
          successRate: total > 0 ? perfRecord.successCount / total : 0,
          refuteCount: perfRecord.failureCount,
          avgCostUsd: perfRecord.avgCostUsd,
          totalTasks: total,
        });
      }
    }
    
    const scoredAgents = availableAgents.map((agent) => ({
      agent,
      score: calculateScore(agent, task.type, agentWorkloads, maxWorkload, perfMap.get(agent._id as string)),
      workload: agentWorkloads.get(agent._id) || 0,
    }));
    
    scoredAgents.sort((a, b) => b.score - a.score);
    
    const best = scoredAgents[0];
    
    if (!best || best.score === 0) {
      return {
        success: false,
        error: "No suitable agent found",
      };
    }
    
    const result = {
      agent: best.agent,
      score: best.score,
      workload: best.workload,
      reasoning: {
        skillMatch: best.agent.allowedTaskTypes.includes(task.type),
        isActive: best.agent.status === "ACTIVE",
        workload: best.workload,
        role: best.agent.role,
        successRate: perfMap.get(best.agent._id as string)?.successRate,
      },
    };
    
    // Assign task
    await ctx.db.patch(args.taskId, {
      assigneeIds: [...task.assigneeIds, result.agent._id],
      status: "ASSIGNED",
    });
    
    // Create activity
    await ctx.db.insert("activities", {
      projectId: task.projectId,
      actorType: args.actorType,
      actorId: args.actorUserId,
      action: "AUTO_ASSIGNED",
      description: `Auto-assigned task to ${result.agent.name} (score: ${result.score.toFixed(2)})`,
      taskId: args.taskId,
      agentId: result.agent._id,
      metadata: {
        score: result.score,
        reasoning: result.reasoning,
      },
    });
    
    // Create notification for agent
    await ctx.db.insert("notifications", {
      projectId: task.projectId,
      agentId: result.agent._id,
      type: "TASK_ASSIGNED",
      title: "Task auto-assigned to you",
      body: `Task "${task.title}" was automatically assigned to you`,
      taskId: args.taskId,
    });
    
    return {
      success: true,
      agent: result.agent,
      score: result.score,
      reasoning: result.reasoning,
    };
  },
});
