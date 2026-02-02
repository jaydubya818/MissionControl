/**
 * Peer Review System
 * 
 * Structured peer review workflows: PRAISE, REFUTE, CHANGESET, APPROVE
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

// ============================================================================
// QUERIES
// ============================================================================

export const listByTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("reviews")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .collect();
  },
});

export const listByAgent = query({
  args: { 
    agentId: v.id("agents"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_reviewer", (q) => q.eq("reviewerAgentId", args.agentId))
      .order("desc")
      .take(args.limit || 50);
    
    return reviews;
  },
});

export const getPending = query({
  args: { 
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("reviews").withIndex("by_status", (q) => 
      q.eq("status", "PENDING")
    );
    
    const reviews = await query.order("desc").take(args.limit || 50);
    
    if (args.projectId) {
      return reviews.filter(r => r.projectId === args.projectId);
    }
    
    return reviews;
  },
});

export const getStats = query({
  args: { 
    projectId: v.optional(v.id("projects")),
    agentId: v.optional(v.id("agents")),
  },
  handler: async (ctx, args) => {
    let reviews: Doc<"reviews">[];
    
    if (args.agentId) {
      reviews = await ctx.db
        .query("reviews")
        .withIndex("by_reviewer", (q) => q.eq("reviewerAgentId", args.agentId))
        .collect();
    } else if (args.projectId) {
      reviews = await ctx.db
        .query("reviews")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
    } else {
      reviews = await ctx.db.query("reviews").collect();
    }
    
    const stats = {
      total: reviews.length,
      byType: {
        PRAISE: reviews.filter(r => r.type === "PRAISE").length,
        REFUTE: reviews.filter(r => r.type === "REFUTE").length,
        CHANGESET: reviews.filter(r => r.type === "CHANGESET").length,
        APPROVE: reviews.filter(r => r.type === "APPROVE").length,
      },
      byStatus: {
        PENDING: reviews.filter(r => r.status === "PENDING").length,
        ACCEPTED: reviews.filter(r => r.status === "ACCEPTED").length,
        REJECTED: reviews.filter(r => r.status === "REJECTED").length,
        SUPERSEDED: reviews.filter(r => r.status === "SUPERSEDED").length,
      },
      avgScore: reviews
        .filter(r => r.type === "PRAISE" && r.score)
        .reduce((sum, r) => sum + (r.score || 0), 0) / 
        (reviews.filter(r => r.type === "PRAISE" && r.score).length || 1),
    };
    
    return stats;
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    taskId: v.id("tasks"),
    type: v.union(
      v.literal("PRAISE"),
      v.literal("REFUTE"),
      v.literal("CHANGESET"),
      v.literal("APPROVE")
    ),
    reviewerAgentId: v.optional(v.id("agents")),
    reviewerUserId: v.optional(v.string()),
    targetType: v.union(
      v.literal("TASK"),
      v.literal("DELIVERABLE"),
      v.literal("ARTIFACT"),
      v.literal("CODE_CHANGE")
    ),
    targetId: v.optional(v.string()),
    summary: v.string(),
    details: v.optional(v.string()),
    score: v.optional(v.number()),
    severity: v.optional(v.union(
      v.literal("MINOR"),
      v.literal("MAJOR"),
      v.literal("CRITICAL")
    )),
    changeset: v.optional(v.object({
      files: v.array(v.object({
        path: v.string(),
        action: v.union(v.literal("ADD"), v.literal("MODIFY"), v.literal("DELETE")),
        diff: v.optional(v.string()),
      })),
      description: v.string(),
    })),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Validate task exists
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Task not found");
    }
    
    // Create review
    const reviewId = await ctx.db.insert("reviews", {
      projectId: args.projectId,
      taskId: args.taskId,
      type: args.type,
      status: "PENDING",
      reviewerAgentId: args.reviewerAgentId,
      reviewerUserId: args.reviewerUserId,
      targetType: args.targetType,
      targetId: args.targetId,
      summary: args.summary,
      details: args.details,
      score: args.score,
      severity: args.severity,
      changeset: args.changeset,
      metadata: args.metadata,
    });
    
    // Log activity
    await ctx.db.insert("activities", {
      projectId: args.projectId,
      action: "REVIEW_CREATED",
      actorType: args.reviewerAgentId ? "AGENT" : "HUMAN",
      actorId: args.reviewerAgentId || args.reviewerUserId,
      targetType: "REVIEW",
      targetId: reviewId,
      body: `${args.type} review created: ${args.summary}`,
      metadata: { taskId: args.taskId, reviewType: args.type },
    });
    
    return { reviewId, success: true };
  },
});

export const respond = mutation({
  args: {
    reviewId: v.id("reviews"),
    responseBy: v.id("agents"),
    responseText: v.string(),
    accept: v.boolean(),
  },
  handler: async (ctx, args) => {
    const review = await ctx.db.get(args.reviewId);
    if (!review) {
      throw new Error("Review not found");
    }
    
    if (review.status !== "PENDING") {
      throw new Error("Review already resolved");
    }
    
    await ctx.db.patch(args.reviewId, {
      status: args.accept ? "ACCEPTED" : "REJECTED",
      responseBy: args.responseBy,
      responseText: args.responseText,
      resolvedAt: Date.now(),
    });
    
    // Log activity
    await ctx.db.insert("activities", {
      projectId: review.projectId,
      action: args.accept ? "REVIEW_ACCEPTED" : "REVIEW_REJECTED",
      actorType: "AGENT",
      actorId: args.responseBy,
      targetType: "REVIEW",
      targetId: args.reviewId,
      body: `Review ${args.accept ? "accepted" : "rejected"}: ${args.responseText}`,
      metadata: { taskId: review.taskId },
    });
    
    return { success: true };
  },
});

export const supersede = mutation({
  args: {
    reviewId: v.id("reviews"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const review = await ctx.db.get(args.reviewId);
    if (!review) {
      throw new Error("Review not found");
    }
    
    await ctx.db.patch(args.reviewId, {
      status: "SUPERSEDED",
      resolvedAt: Date.now(),
      metadata: {
        ...review.metadata,
        supersededReason: args.reason,
      },
    });
    
    // Log activity
    await ctx.db.insert("activities", {
      projectId: review.projectId,
      action: "REVIEW_SUPERSEDED",
      actorType: "SYSTEM",
      targetType: "REVIEW",
      targetId: args.reviewId,
      body: `Review superseded: ${args.reason}`,
      metadata: { taskId: review.taskId },
    });
    
    return { success: true };
  },
});

export const remove = mutation({
  args: { reviewId: v.id("reviews") },
  handler: async (ctx, args) => {
    const review = await ctx.db.get(args.reviewId);
    if (!review) {
      throw new Error("Review not found");
    }
    
    await ctx.db.delete(args.reviewId);
    
    // Log activity
    await ctx.db.insert("activities", {
      projectId: review.projectId,
      action: "REVIEW_DELETED",
      actorType: "SYSTEM",
      targetType: "REVIEW",
      targetId: args.reviewId,
      body: `Review deleted: ${review.summary}`,
      metadata: { taskId: review.taskId },
    });
    
    return { success: true };
  },
});
