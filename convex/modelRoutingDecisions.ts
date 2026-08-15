import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  FACTORY_PERMISSIONS,
  requireWorkspacePermission,
} from "./lib/companyAccess";

async function workflowRunProjectId(
  ctx: { db: any },
  workflowRun: {
    projectId?: Id<"projects">;
    workOrderId?: Id<"workOrders">;
    parentTaskId?: Id<"tasks">;
  }
) {
  if (workflowRun.projectId) return workflowRun.projectId;
  if (workflowRun.workOrderId) {
    const workOrder = await ctx.db.get(workflowRun.workOrderId);
    if (workOrder?.projectId) return workOrder.projectId as Id<"projects">;
  }
  if (workflowRun.parentTaskId) {
    const task = await ctx.db.get(workflowRun.parentTaskId);
    if (task?.projectId) return task.projectId as Id<"projects">;
  }
  return null;
}

export const listRecent = query({
  args: {
    projectId: v.id("projects"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    return ctx.db
      .query("modelRoutingDecisions")
      .withIndex("by_project_created", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(Math.min(args.limit ?? 50, 200));
  },
});

export const getForWorkflowRun = query({
  args: { workflowRunId: v.id("workflowRuns") },
  handler: async (ctx, args) => {
    const workflowRun = await ctx.db.get(args.workflowRunId);
    if (!workflowRun) return null;
    const projectId = await workflowRunProjectId(ctx, workflowRun);
    if (!projectId) throw new Error("Run is unavailable or unauthorized.");
    await requireWorkspacePermission(ctx, projectId, FACTORY_PERMISSIONS.VIEW);
    const decision = await ctx.db
      .query("modelRoutingDecisions")
      .withIndex("by_workflow_run", (q) => q.eq("workflowRunId", args.workflowRunId))
      .first();
    return decision?.projectId === projectId ? decision : null;
  },
});

/** The task-facing view of its governing Work Order's selected route. */
export const getForTask = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    const taskWorkOrder = task.workOrderId ? await ctx.db.get(task.workOrderId) : null;
    const projectId = task.projectId ?? taskWorkOrder?.projectId;
    if (!projectId) throw new Error("Task is unavailable or unauthorized.");
    await requireWorkspacePermission(ctx, projectId, FACTORY_PERMISSIONS.VIEW);
    if (
      task.projectId &&
      taskWorkOrder?.projectId &&
      task.projectId !== taskWorkOrder.projectId
    ) {
      throw new Error("Task is unavailable or unauthorized.");
    }
    const workflowRun = await ctx.db
      .query("workflowRuns")
      .withIndex("by_parent_task", (q) => q.eq("parentTaskId", args.taskId))
      .order("desc")
      .first();
    const directDecision = workflowRun?.routingDecisionId
      ? await ctx.db.get(workflowRun.routingDecisionId)
      : null;
    const workOrder = taskWorkOrder;
    const workOrderDecision = workOrder
      ? await ctx.db
          .query("modelRoutingDecisions")
          .withIndex("by_work_order", (q) => q.eq("workOrderId", workOrder._id))
          .order("desc")
          .first()
      : null;
    return {
      decision:
        directDecision?.projectId === projectId
          ? directDecision
          : workOrderDecision?.projectId === projectId
            ? workOrderDecision
            : null,
      projectId,
      workOrderId: workOrder?._id ?? null,
      overrideModelId: workOrder?.authorizedModelOverride ?? null,
      overrideReason: workOrder?.authorizedModelOverrideReason ?? null,
      canChange: !workflowRun || !["PENDING", "RUNNING", "PAUSED"].includes(workflowRun.status),
    };
  },
});
