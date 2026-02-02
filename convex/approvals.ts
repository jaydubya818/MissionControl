/**
 * Approvals — Convex Functions
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================================================
// QUERIES
// ============================================================================

export const listPending = query({
  args: { 
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.projectId) {
      return await ctx.db
        .query("approvals")
        .withIndex("by_project_status", (q) => 
          q.eq("projectId", args.projectId).eq("status", "PENDING")
        )
        .order("desc")
        .take(args.limit ?? 50);
    }
    return await ctx.db
      .query("approvals")
      .withIndex("by_status", (q) => q.eq("status", "PENDING"))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const listByTask = query({
  args: { 
    taskId: v.id("tasks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("approvals")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const listByRequestor = query({
  args: { 
    agentId: v.id("agents"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("approvals")
      .withIndex("by_requestor", (q) => q.eq("requestorAgentId", args.agentId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const get = query({
  args: { approvalId: v.id("approvals") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.approvalId);
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

export const request = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.id("tasks")),
    toolCallId: v.optional(v.id("toolCalls")),
    requestorAgentId: v.id("agents"),
    actionType: v.string(),
    actionSummary: v.string(),
    riskLevel: v.string(),
    actionPayload: v.optional(v.any()),
    estimatedCost: v.optional(v.number()),
    rollbackPlan: v.optional(v.string()),
    justification: v.string(),
    expiresInMinutes: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check idempotency
    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query("approvals")
        .filter((q) => q.eq(q.field("idempotencyKey"), args.idempotencyKey))
        .first();
      if (existing) {
        return { approval: existing, created: false };
      }
    }
    
    // Get projectId from task if not provided
    let projectId = args.projectId;
    if (!projectId && args.taskId) {
      const task = await ctx.db.get(args.taskId);
      projectId = task?.projectId;
    }
    
    const expiresAt = Date.now() + (args.expiresInMinutes ?? 60) * 60 * 1000;
    
    const approvalId = await ctx.db.insert("approvals", {
      projectId,
      idempotencyKey: args.idempotencyKey,
      taskId: args.taskId,
      toolCallId: args.toolCallId,
      requestorAgentId: args.requestorAgentId,
      actionType: args.actionType,
      actionSummary: args.actionSummary,
      riskLevel: args.riskLevel as any,
      actionPayload: args.actionPayload,
      estimatedCost: args.estimatedCost,
      rollbackPlan: args.rollbackPlan,
      justification: args.justification,
      status: "PENDING",
      expiresAt,
    });
    
    // Log activity
    const agent = await ctx.db.get(args.requestorAgentId);
    await ctx.db.insert("activities", {
      projectId,
      actorType: "AGENT",
      actorId: args.requestorAgentId.toString(),
      action: "APPROVAL_REQUESTED",
      description: `${agent?.name || "Agent"} requested approval for: ${args.actionSummary}`,
      targetType: "APPROVAL",
      targetId: approvalId,
      taskId: args.taskId,
      agentId: args.requestorAgentId,
    });
    
    return { approval: await ctx.db.get(approvalId), created: true };
  },
});

export const approve = mutation({
  args: {
    approvalId: v.id("approvals"),
    decidedByAgentId: v.optional(v.id("agents")),
    decidedByUserId: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) {
      return { success: false, error: "Approval not found" };
    }
    
    if (approval.status !== "PENDING") {
      return { success: false, error: `Approval already ${approval.status}` };
    }
    
    if (Date.now() > approval.expiresAt) {
      await ctx.db.patch(args.approvalId, { status: "EXPIRED" });
      return { success: false, error: "Approval has expired" };
    }
    
    await ctx.db.patch(args.approvalId, {
      status: "APPROVED",
      decidedByAgentId: args.decidedByAgentId,
      decidedByUserId: args.decidedByUserId,
      decidedAt: Date.now(),
      decisionReason: args.reason,
    });
    
    // Log activity
    await ctx.db.insert("activities", {
      projectId: approval.projectId,
      actorType: args.decidedByUserId ? "HUMAN" : "AGENT",
      actorId: args.decidedByUserId ?? args.decidedByAgentId?.toString(),
      action: "APPROVAL_APPROVED",
      description: `Approval granted: ${approval.actionSummary}`,
      targetType: "APPROVAL",
      targetId: args.approvalId,
      taskId: approval.taskId,
      agentId: approval.requestorAgentId,
    });
    
    return { success: true, approval: await ctx.db.get(args.approvalId) };
  },
});

export const deny = mutation({
  args: {
    approvalId: v.id("approvals"),
    decidedByAgentId: v.optional(v.id("agents")),
    decidedByUserId: v.optional(v.string()),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) {
      return { success: false, error: "Approval not found" };
    }
    
    if (approval.status !== "PENDING") {
      return { success: false, error: `Approval already ${approval.status}` };
    }
    
    await ctx.db.patch(args.approvalId, {
      status: "DENIED",
      decidedByAgentId: args.decidedByAgentId,
      decidedByUserId: args.decidedByUserId,
      decidedAt: Date.now(),
      decisionReason: args.reason,
    });
    
    // Log activity
    await ctx.db.insert("activities", {
      projectId: approval.projectId,
      actorType: args.decidedByUserId ? "HUMAN" : "AGENT",
      actorId: args.decidedByUserId ?? args.decidedByAgentId?.toString(),
      action: "APPROVAL_DENIED",
      description: `Approval denied: ${approval.actionSummary} — ${args.reason}`,
      targetType: "APPROVAL",
      targetId: args.approvalId,
      taskId: approval.taskId,
      agentId: approval.requestorAgentId,
    });
    
    return { success: true, approval: await ctx.db.get(args.approvalId) };
  },
});

export const cancel = mutation({
  args: {
    approvalId: v.id("approvals"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) {
      return { success: false, error: "Approval not found" };
    }
    
    if (approval.status !== "PENDING") {
      return { success: false, error: `Approval already ${approval.status}` };
    }
    
    await ctx.db.patch(args.approvalId, {
      status: "CANCELED",
      decisionReason: args.reason,
    });
    
    return { success: true, approval: await ctx.db.get(args.approvalId) };
  },
});

export const expireStale = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    
    const pendingApprovals = await ctx.db
      .query("approvals")
      .withIndex("by_status", (q) => q.eq("status", "PENDING"))
      .collect();
    
    let expired = 0;
    for (const approval of pendingApprovals) {
      if (now > approval.expiresAt) {
        await ctx.db.patch(approval._id, { status: "EXPIRED" });
        expired++;
      }
    }
    
    return { expired };
  },
});
