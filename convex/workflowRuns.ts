/**
 * Workflow Runs — Convex Functions
 * 
 * Execution state and progress tracking for multi-agent workflows.
 */

import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

// ============================================================================
// HELPERS
// ============================================================================

function generateRunId(): string {
  // Generate short 8-character ID (similar to Antfarm's run IDs)
  return Math.random().toString(36).substring(2, 10);
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * List workflow runs
 */
export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
    workflowId: v.optional(v.string()),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Build query based on filters
    if (args.projectId && args.status) {
      return await ctx.db
        .query("workflowRuns")
        .withIndex("by_project_status", (q) => 
          q.eq("projectId", args.projectId).eq("status", args.status as any)
        )
        .order("desc")
        .take(args.limit ?? 100);
    }
    
    if (args.projectId) {
      return await ctx.db
        .query("workflowRuns")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .order("desc")
        .take(args.limit ?? 100);
    }
    
    if (args.workflowId) {
      return await ctx.db
        .query("workflowRuns")
        .withIndex("by_workflow_id", (q) => q.eq("workflowId", args.workflowId!))
        .order("desc")
        .take(args.limit ?? 100);
    }
    
    if (args.status) {
      return await ctx.db
        .query("workflowRuns")
        .withIndex("by_status", (q) => q.eq("status", args.status as any))
        .order("desc")
        .take(args.limit ?? 100);
    }
    
    return await ctx.db
      .query("workflowRuns")
      .order("desc")
      .take(args.limit ?? 100);
  },
});

/**
 * Get a workflow run by run ID
 */
export const get = query({
  args: { runId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workflowRuns")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .first();
  },
});

/**
 * Get workflow run by Convex _id
 */
export const getById = query({
  args: { id: v.id("workflowRuns") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Search workflow runs by query string (matches runId or initial input)
 */
export const search = query({
  args: {
    query: v.string(),
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let runs = await ctx.db
      .query("workflowRuns")
      .order("desc")
      .take(args.limit ?? 100);
    
    if (args.projectId) {
      runs = runs.filter((r) => r.projectId === args.projectId);
    }
    
    const lowerQuery = args.query.toLowerCase();
    return runs.filter((r) =>
      r.runId.toLowerCase().includes(lowerQuery) ||
      r.initialInput.toLowerCase().includes(lowerQuery)
    );
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Start a new workflow run
 */
export const start = mutation({
  args: {
    workflowId: v.string(),
    projectId: v.optional(v.id("projects")),
    parentTaskId: v.optional(v.id("tasks")),
    initialInput: v.string(),
  },
  handler: async (ctx, args) => {
    // Get workflow definition
    const workflow = await ctx.db
      .query("workflows")
      .withIndex("by_workflow_id", (q) => q.eq("workflowId", args.workflowId))
      .first();
    
    if (!workflow) {
      throw new Error(`Workflow not found: ${args.workflowId}`);
    }
    
    if (!workflow.active) {
      throw new Error(`Workflow is not active: ${args.workflowId}`);
    }
    
    // Initialize step states
    const steps = workflow.steps.map((step) => ({
      stepId: step.id,
      status: "PENDING" as const,
      taskId: undefined,
      agentId: undefined,
      startedAt: undefined,
      completedAt: undefined,
      retryCount: 0,
      error: undefined,
      output: undefined,
    }));
    
    const now = Date.now();
    const runId = generateRunId();
    
    // Create workflow run
    const id = await ctx.db.insert("workflowRuns", {
      runId,
      workflowId: args.workflowId,
      projectId: args.projectId,
      parentTaskId: args.parentTaskId,
      status: "PENDING",
      currentStepIndex: 0,
      totalSteps: workflow.steps.length,
      steps,
      context: { task: args.initialInput },
      initialInput: args.initialInput,
      startedAt: now,
    });
    
    // Log activity
    await ctx.db.insert("activities", {
      projectId: args.projectId,
      actorType: "SYSTEM",
      action: "WORKFLOW_STARTED",
      description: `Started workflow run ${runId} for ${workflow.name}`,
      targetType: "WORKFLOW_RUN",
      targetId: id,
      metadata: {
        workflowId: args.workflowId,
        runId,
        initialInput: args.initialInput,
      },
    });
    
    return { runId, id };
  },
});

/**
 * Update step status
 */
export const updateStep = internalMutation({
  args: {
    runId: v.string(),
    stepIndex: v.number(),
    status: v.string(),
    taskId: v.optional(v.id("tasks")),
    agentId: v.optional(v.id("agents")),
    error: v.optional(v.string()),
    output: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("workflowRuns")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .first();
    
    if (!run) {
      throw new Error(`Workflow run not found: ${args.runId}`);
    }
    
    const steps = [...run.steps];
    const step = steps[args.stepIndex];
    
    if (!step) {
      throw new Error(`Step index out of bounds: ${args.stepIndex}`);
    }
    
    const now = Date.now();
    
    // Update step
    steps[args.stepIndex] = {
      ...step,
      status: args.status as any,
      taskId: args.taskId ?? step.taskId,
      agentId: args.agentId ?? step.agentId,
      startedAt: args.status === "RUNNING" ? now : step.startedAt,
      completedAt: (args.status === "DONE" || args.status === "FAILED") ? now : step.completedAt,
      error: args.error ?? step.error,
      output: args.output ?? step.output,
    };
    
    await ctx.db.patch(run._id, { steps });
    
    return { success: true };
  },
});

/**
 * Advance workflow to next step
 */
export const advance = internalMutation({
  args: {
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("workflowRuns")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .first();
    
    if (!run) {
      throw new Error(`Workflow run not found: ${args.runId}`);
    }
    
    const nextIndex = run.currentStepIndex + 1;
    
    if (nextIndex >= run.totalSteps) {
      // Workflow complete
      await ctx.db.patch(run._id, {
        status: "COMPLETED",
        completedAt: Date.now(),
      });
      
      return { complete: true };
    }
    
    // Move to next step
    await ctx.db.patch(run._id, {
      currentStepIndex: nextIndex,
    });
    
    return { complete: false, nextIndex };
  },
});

/**
 * Update workflow run status
 */
export const updateStatus = mutation({
  args: {
    runId: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("workflowRuns")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .first();
    
    if (!run) {
      throw new Error(`Workflow run not found: ${args.runId}`);
    }
    
    const updates: any = {
      status: args.status,
    };
    
    if (args.status === "COMPLETED" || args.status === "FAILED") {
      updates.completedAt = Date.now();
    }
    
    await ctx.db.patch(run._id, updates);
    
    return { success: true };
  },
});

/**
 * Update workflow context (variables passed between steps)
 */
export const updateContext = internalMutation({
  args: {
    runId: v.string(),
    context: v.any(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("workflowRuns")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .first();
    
    if (!run) {
      throw new Error(`Workflow run not found: ${args.runId}`);
    }
    
    await ctx.db.patch(run._id, {
      context: { ...run.context, ...args.context },
    });
    
    return { success: true };
  },
});

/**
 * Increment retry count for a step
 */
export const incrementRetry = internalMutation({
  args: {
    runId: v.string(),
    stepIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("workflowRuns")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .first();
    
    if (!run) {
      throw new Error(`Workflow run not found: ${args.runId}`);
    }
    
    const steps = [...run.steps];
    const step = steps[args.stepIndex];
    
    if (!step) {
      throw new Error(`Step index out of bounds: ${args.stepIndex}`);
    }
    
    steps[args.stepIndex] = {
      ...step,
      retryCount: step.retryCount + 1,
    };
    
    await ctx.db.patch(run._id, { steps });
    
    return { retryCount: steps[args.stepIndex].retryCount };
  },
});
