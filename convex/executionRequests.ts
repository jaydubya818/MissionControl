/**
 * Execution Requests — Convex Functions
 * 
 * Multi-executor routing for different types of work.
 * V1 stub: queue + routing + audit; execution is manual until v1.1.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================================================
// QUERIES
// ============================================================================

export const get = query({
  args: { requestId: v.id("executionRequests") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.requestId);
  },
});

export const listPending = query({
  args: {
    projectId: v.optional(v.id("projects")),
    executor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("executionRequests")
      .withIndex("by_status", (q) => q.eq("status", "PENDING"));
    
    let requests = await query.order("desc").take(args.limit ?? 50);
    
    // Filter by project if provided
    if (args.projectId) {
      requests = requests.filter(r => r.projectId === args.projectId);
    }
    
    // Filter by executor if provided
    if (args.executor) {
      requests = requests.filter(r => r.executor === args.executor);
    }
    
    return requests;
  },
});

export const listByTask = query({
  args: {
    taskId: v.id("tasks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("executionRequests")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.status) {
      return await ctx.db
        .query("executionRequests")
        .withIndex("by_project_status", (q) =>
          q.eq("projectId", args.projectId).eq("status", args.status as any)
        )
        .order("desc")
        .take(args.limit ?? 50);
    }
    
    return await ctx.db
      .query("executionRequests")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

export const enqueue = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.id("tasks")),
    requestedBy: v.id("agents"),
    type: v.string(),
    executor: v.string(),
    payload: v.any(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const requestId = await ctx.db.insert("executionRequests", {
      projectId: args.projectId,
      taskId: args.taskId,
      requestedBy: args.requestedBy,
      type: args.type as any,
      executor: args.executor as any,
      status: "PENDING",
      payload: args.payload,
      requestedAt: Date.now(),
      metadata: args.metadata,
    });
    
    // Log activity
    const agent = await ctx.db.get(args.requestedBy);
    await ctx.db.insert("activities", {
      projectId: args.projectId,
      actorType: "AGENT",
      actorId: args.requestedBy.toString(),
      action: "EXECUTION_REQUESTED",
      description: `${agent?.name || "Agent"} requested ${args.type} execution via ${args.executor}`,
      targetType: "EXECUTION_REQUEST",
      targetId: requestId,
      taskId: args.taskId,
      agentId: args.requestedBy,
    });
    
    return { requestId, request: await ctx.db.get(requestId) };
  },
});

export const updateStatus = mutation({
  args: {
    requestId: v.id("executionRequests"),
    status: v.string(),
    assignedTo: v.optional(v.string()),
    result: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) {
      return { success: false, error: "Request not found" };
    }
    
    const now = Date.now();
    const updates: any = {
      status: args.status as any,
    };
    
    if (args.assignedTo) {
      updates.assignedTo = args.assignedTo;
      updates.assignedAt = now;
    }
    
    if (args.result) {
      updates.result = args.result;
    }
    
    if (args.status === "COMPLETED" || args.status === "FAILED") {
      updates.completedAt = now;
    }
    
    await ctx.db.patch(args.requestId, updates);
    
    // Log activity
    await ctx.db.insert("activities", {
      projectId: request.projectId,
      actorType: "SYSTEM",
      action: "EXECUTION_STATUS_CHANGED",
      description: `Execution request ${request.type} → ${args.status}`,
      targetType: "EXECUTION_REQUEST",
      targetId: args.requestId,
      taskId: request.taskId,
      beforeState: { status: request.status },
      afterState: { status: args.status },
    });
    
    return { success: true, request: await ctx.db.get(args.requestId) };
  },
});

export const cancel = mutation({
  args: {
    requestId: v.id("executionRequests"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) {
      return { success: false, error: "Request not found" };
    }
    
    if (request.status !== "PENDING") {
      return { success: false, error: `Request already ${request.status}` };
    }
    
    await ctx.db.patch(args.requestId, {
      status: "FAILED",
      result: { canceled: true, reason: args.reason },
      completedAt: Date.now(),
    });
    
    return { success: true };
  },
});

// ============================================================================
// ROUTING LOGIC (V1 Stub)
// ============================================================================

/**
 * Get routing recommendation for a task type.
 * V1: Returns recommendation only; execution is manual.
 * V1.1: Will automatically assign and execute.
 */
export const getRoutingRecommendation = query({
  args: {
    type: v.string(),
    taskId: v.optional(v.id("tasks")),
  },
  handler: async (_ctx, args) => {
    // Simple routing rules
    const routing: Record<string, string> = {
      CODE_CHANGE: "CURSOR",
      RESEARCH: "OPENCLAW_AGENT",
      CONTENT: "OPENCLAW_AGENT",
      EMAIL: "OPENCLAW_AGENT",
      SOCIAL: "OPENCLAW_AGENT",
      OPS: "OPENCLAW_AGENT",
    };
    
    const executor = routing[args.type] || "OPENCLAW_AGENT";
    
    return {
      executor,
      reason: `${args.type} tasks are routed to ${executor}`,
    };
  },
});
