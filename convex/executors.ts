/**
 * Multi-Executor Routing System
 * 
 * Routes tasks to different execution environments
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================================================
// QUERIES
// ============================================================================

export const listPending = query({
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (_ctx, _args) => {
    // This would query executionRequests table
    // For now, return empty array as table doesn't exist yet
    return [];
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

export const routeTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Task not found");
    }
    
    // Smart routing logic
    let executor: string;
    let score: number;
    let reason: string;
    
    if (task.type === "ENGINEERING" && task.title.toLowerCase().includes("refactor")) {
      executor = "CURSOR";
      score = 0.9;
      reason = "Code refactoring best handled by Cursor";
    } else if (task.type === "SEO_RESEARCH" || task.type === "CUSTOMER_RESEARCH") {
      executor = "CLAUDE_CODE";
      score = 0.85;
      reason = "Research tasks suited for Claude Code";
    } else if (task.type === "CONTENT" || task.type === "SOCIAL") {
      executor = "OPENCLAW_AGENT";
      score = 0.95;
      reason = "Content generation optimized for OpenClaw";
    } else {
      executor = "MANUAL";
      score = 0.5;
      reason = "Default to manual execution";
    }
    
    // Log activity
    await ctx.db.insert("activities", {
      projectId: task.projectId,
      action: "TASK_ROUTED",
      actorType: "SYSTEM",
      targetType: "TASK",
      targetId: args.taskId,
      description: `Task routed to ${executor} (score: ${score})`,
      metadata: { executor, score, reason },
    });
    
    return { executor, score, reason };
  },
});

export const handleExecutionCallback = mutation({
  args: {
    taskId: v.id("tasks"),
    status: v.string(),
    result: v.optional(v.any()),
    artifacts: v.optional(v.array(v.string())),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Task not found");
    }
    
    // Update task based on result
    if (args.status === "COMPLETED") {
      await ctx.db.patch(args.taskId, {
        status: "REVIEW",
      });
      
      // Log activity
      await ctx.db.insert("activities", {
        projectId: task.projectId,
        action: "EXECUTION_COMPLETED",
        actorType: "SYSTEM",
        targetType: "TASK",
        targetId: args.taskId,
        description: `Execution completed successfully`,
        metadata: { result: args.result, artifacts: args.artifacts },
      });
    } else if (args.status === "FAILED") {
      await ctx.db.patch(args.taskId, {
        status: "BLOCKED",
      });
      
      // Log activity
      await ctx.db.insert("activities", {
        projectId: task.projectId,
        action: "EXECUTION_FAILED",
        actorType: "SYSTEM",
        targetType: "TASK",
        targetId: args.taskId,
        description: `Execution failed: ${args.error}`,
        metadata: { error: args.error },
      });
    }
    
    return { success: true };
  },
});
