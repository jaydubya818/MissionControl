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
      const now = Date.now();
      const review = {
        enteredAt: now,
        resubmissionCount: task.review?.resubmissionCount ?? task.reviewCycles,
        history: task.review?.history ?? [],
      };
      await ctx.db.patch(args.taskId, {
        status: "REVIEW",
        stateEnteredAt: now,
        submittedAt: now,
        review,
      });

      await ctx.db.insert("taskTransitions", {
        projectId: task.projectId,
        idempotencyKey: `executor-completed:${args.taskId}:${now}`,
        taskId: args.taskId,
        fromStatus: task.status,
        toStatus: "REVIEW",
        actorType: "SYSTEM",
        reason: "Executor completed the task and submitted it for review.",
        validationResult: { valid: true },
        artifactsSnapshot: { review },
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
      const now = Date.now();
      const reason = args.error?.trim() || "Executor failed without returning an error message.";
      const blocker = {
        type: "UNKNOWN" as const,
        reason,
        ownerRef: "operator",
        requiredAction: "Inspect the failed execution evidence, then retry or reassign the task.",
        blockedSince: now,
      };
      await ctx.db.patch(args.taskId, {
        status: "BLOCKED",
        stateEnteredAt: now,
        blockedReason: reason,
        blocker,
      });

      await ctx.db.insert("taskTransitions", {
        projectId: task.projectId,
        idempotencyKey: `executor-failed:${args.taskId}:${now}`,
        taskId: args.taskId,
        fromStatus: task.status,
        toStatus: "BLOCKED",
        actorType: "SYSTEM",
        reason,
        validationResult: { valid: true },
        artifactsSnapshot: { blocker },
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
