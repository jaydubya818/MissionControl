/**
 * Task CRUD and status transitions. Task status MUST be updated only via transitionTaskStatus.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { validateTransition, type TaskStatus, type TransitionActor } from "./lib/stateMachine";
import { appendTransition } from "./transitions";

const taskType = v.union(
  v.literal("content"),
  v.literal("social"),
  v.literal("email_marketing"),
  v.literal("customer_research"),
  v.literal("seo_research"),
  v.literal("engineering"),
  v.literal("docs"),
  v.literal("ops")
);

const taskStatus = v.union(
  v.literal("inbox"),
  v.literal("assigned"),
  v.literal("in_progress"),
  v.literal("review"),
  v.literal("needs_approval"),
  v.literal("blocked"),
  v.literal("done"),
  v.literal("canceled")
);

export const createTask = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    type: taskType,
    priority: v.optional(v.union(v.literal("high"), v.literal("medium"), v.literal("low"))),
    assigneeIds: v.optional(v.array(v.id("agents"))),
    reviewerIds: v.optional(v.array(v.id("agents"))),
    subscriberIds: v.optional(v.array(v.id("agents"))),
    threadRef: v.optional(v.string()),
    parentTaskId: v.optional(v.id("tasks")),
    dependsOn: v.optional(v.array(v.id("tasks"))),
    budget: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("tasks", {
      title: args.title,
      description: args.description,
      type: args.type,
      status: "inbox",
      priority: args.priority ?? "medium",
      assigneeIds: args.assigneeIds ?? [],
      reviewerIds: args.reviewerIds ?? [],
      subscriberIds: args.subscriberIds ?? [],
      threadRef: args.threadRef,
      parentTaskId: args.parentTaskId,
      dependsOn: args.dependsOn ?? [],
      budget: args.budget ?? 0,
      spend: 0,
      workPlan: undefined,
      deliverable: undefined,
      selfReview: undefined,
      evidence: undefined,
      blockedReason: undefined,
      metadata: args.metadata ?? {},
    });
  },
});

export const listTasksByStatus = query({
  args: {
    status: v.optional(taskStatus),
    statuses: v.optional(v.array(taskStatus)),
  },
  handler: async (ctx, args) => {
    if (args.statuses && args.statuses.length > 0) {
      const results: Awaited<ReturnType<typeof ctx.db.query>>[] = [];
      for (const status of args.statuses) {
        const list = await ctx.db
          .query("tasks")
          .withIndex("by_status", (q) => q.eq("status", status))
          .collect();
        results.push(...list);
      }
      return results.sort((a, b) => a._creationTime - b._creationTime);
    }
    if (args.status) {
      return await ctx.db
        .query("tasks")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    }
    return await ctx.db.query("tasks").order("desc").collect();
  },
});

export const getTask = query({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getTaskTransitions = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("taskTransitions")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("asc")
      .collect();
  },
});

export const transitionTaskStatus = mutation({
  args: {
    taskId: v.id("tasks"),
    toStatus: taskStatus,
    actor: v.union(v.literal("agent"), v.literal("human"), v.literal("system")),
    actorId: v.optional(v.string()),
    reason: v.optional(v.string()),
    idempotencyKey: v.string(),
    workPlan: v.optional(v.string()),
    deliverable: v.optional(v.string()),
    selfReview: v.optional(v.string()),
    evidence: v.optional(v.array(v.string())),
    approvalRecord: v.optional(v.string()),
    assigneeIds: v.optional(v.array(v.id("agents"))),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Task not found");
    }
    const fromStatus = task.status as TaskStatus;
    const toStatus = args.toStatus as TaskStatus;
    const actor = args.actor as TransitionActor;

    const artifacts = {
      workPlan: args.workPlan,
      deliverable: args.deliverable,
      selfReview: args.selfReview,
      evidence: args.evidence,
      approvalRecord: args.approvalRecord,
      assigneeIds: args.assigneeIds ?? task.assigneeIds,
    };

    const result = validateTransition(fromStatus, toStatus, actor, artifacts);
    if (!result.valid) {
      throw new Error(result.error ?? "Invalid transition");
    }

    await appendTransition(ctx, {
      taskId: args.taskId,
      fromStatus,
      toStatus,
      actor,
      actorId: args.actorId,
      reason: args.reason,
      artifactsProvided: [
        ...(args.workPlan ? ["workPlan"] : []),
        ...(args.deliverable ? ["deliverable"] : []),
        ...(args.selfReview ? ["selfReview"] : []),
        ...(args.approvalRecord ? ["approvalRecord"] : []),
        ...(args.assigneeIds && args.assigneeIds.length ? ["assigneeIds"] : []),
      ],
      idempotencyKey: args.idempotencyKey,
    });

    const updates: Record<string, unknown> = { status: toStatus };
    if (args.workPlan !== undefined) updates.workPlan = args.workPlan;
    if (args.deliverable !== undefined) updates.deliverable = args.deliverable;
    if (args.selfReview !== undefined) updates.selfReview = args.selfReview;
    if (args.evidence !== undefined) updates.evidence = args.evidence;
    if (args.assigneeIds !== undefined) updates.assigneeIds = args.assigneeIds;

    await ctx.db.patch(args.taskId, updates);
    return args.taskId;
  },
});
