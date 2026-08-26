/**
 * Alerts — Convex Functions
 */

import { v } from "convex/values";
import { action, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { appendChangeRecord } from "./lib/armAudit";
import { COMPANY_PERMISSIONS } from "./lib/companyAccess";
import {
  authorizedDeliveryActor,
  requireAuthorizedDeliveryScope,
} from "./lib/deliveryAuthorization";
import { runAuditedHumanMutation } from "./lib/humanActionAudit";

// ============================================================================
// QUERIES
// ============================================================================

export const listOpen = query({
  args: {
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuthorizedDeliveryScope(ctx, args.projectId);
    if (args.projectId) {
      const rows = await ctx.db
        .query("alerts")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
      return rows
        .filter((row) => row.status === "OPEN")
        .sort((left, right) => right._creationTime - left._creationTime)
        .slice(0, args.limit ?? 50);
    }
    return await ctx.db
      .query("alerts")
      .withIndex("by_status", (q) => q.eq("status", "OPEN"))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

const createAlertArgs = {
  projectId: v.optional(v.id("projects")),
  severity: v.string(),
  type: v.string(),
  title: v.string(),
  description: v.string(),
  agentId: v.optional(v.id("agents")),
  taskId: v.optional(v.id("tasks")),
  runId: v.optional(v.id("runs")),
  metadata: v.optional(v.any()),
};

async function createAlert(ctx: any, args: any) {
  let projectId = args.projectId;
  if (args.taskId) {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Alert Task is unavailable.");
    if (projectId && task.projectId !== projectId) {
      throw new Error("Alert Task does not belong to the selected workspace.");
    }
    projectId = projectId ?? task.projectId;
  }
  if (args.agentId) {
    const agent = await ctx.db.get(args.agentId);
    if (!agent) throw new Error("Alert Agent is unavailable.");
    if (projectId && agent.projectId && agent.projectId !== projectId) {
      throw new Error("Alert Agent does not belong to the selected workspace.");
    }
    projectId = projectId ?? agent.projectId;
  }
  if (!projectId) throw new Error("Alert creation requires a workspace.");

  if (args.taskId) {
    const existing = (await ctx.db
      .query("alerts")
      .withIndex("by_task", (q: any) => q.eq("taskId", args.taskId))
      .collect())
      .find(
        (alert: any) =>
          alert.type === args.type &&
          (alert.status === "OPEN" || alert.status === "ACKNOWLEDGED")
      );

    if (existing) {
      return { alert: existing, created: false };
    }
  }

  const project = await ctx.db.get(projectId);
  if (!project) throw new Error("Alert workspace is unavailable.");
  const alertId = await ctx.db.insert("alerts", {
    projectId,
    severity: args.severity as any,
    type: args.type,
    title: args.title,
    description: args.description,
    agentId: args.agentId,
    taskId: args.taskId,
    runId: args.runId,
    status: "OPEN",
    metadata: args.metadata,
  });
  await appendChangeRecord(ctx.db as any, {
    tenantId: project.tenantId,
    projectId,
    type: "ALERT_CREATED",
    summary: `Alert created: ${args.title}`,
    payload: {
      alertId,
      severity: args.severity,
      alertType: args.type,
      taskId: args.taskId,
    },
    relatedTable: "alerts",
    relatedId: String(alertId),
  });
  return { alert: await ctx.db.get(alertId), created: true };
}

export const createInternal = internalMutation({
  args: createAlertArgs,
  handler: createAlert,
});

async function requireAlertWrite(ctx: any, alertId: any) {
  const alert = await ctx.db.get(alertId);
  if (!alert) throw new Error("Alert not found");
  let projectId = alert.projectId;
  if (!projectId && alert.taskId) {
    projectId = (await ctx.db.get(alert.taskId))?.projectId;
  }
  if (!projectId && alert.agentId) {
    projectId = (await ctx.db.get(alert.agentId))?.projectId;
  }
  if (!projectId) throw new Error("Alert is not assigned to a workspace.");
  const access = await requireAuthorizedDeliveryScope(
    ctx,
    projectId,
    COMPANY_PERMISSIONS.UPDATE_DELIVERY,
  );
  return { alert, projectId, access, actor: authorizedDeliveryActor(access) };
}

const acknowledgeArgs = {
  alertId: v.id("alerts"),
};

export const acknowledgeInternal = internalMutation({
  args: acknowledgeArgs,
  handler: async (ctx, args) => {
    const { alert, projectId, access, actor } = await requireAlertWrite(ctx, args.alertId);
    await ctx.db.patch(args.alertId, {
      status: "ACKNOWLEDGED",
      acknowledgedBy: actor.actorId,
      acknowledgedAt: Date.now(),
    });
    await appendChangeRecord(ctx.db as any, {
      tenantId: access?.project.tenantId,
      projectId,
      operatorId: actor.operatorId,
      type: "ALERT_ACKNOWLEDGED",
      summary: `Alert acknowledged: ${alert.title}`,
      payload: { alertId: alert._id, previousStatus: alert.status },
      relatedTable: "alerts",
      relatedId: String(alert._id),
    });
    return { alert: await ctx.db.get(args.alertId) };
  },
});

export const acknowledge = action({
  args: acknowledgeArgs,
  handler: async (ctx, args): Promise<any> =>
    await runAuditedHumanMutation(
      ctx,
      internal.alerts.acknowledgeInternal,
      args,
      "alerts.acknowledge",
      { alertId: args.alertId },
    ),
});

const resolveArgs = {
  alertId: v.id("alerts"),
  resolutionNote: v.optional(v.string()),
};

export const resolveInternal = internalMutation({
  args: resolveArgs,
  handler: async (ctx, args) => {
    const note = args.resolutionNote?.trim();
    if (!note) throw new Error("A resolution note is required.");
    const { alert, projectId, access, actor } = await requireAlertWrite(ctx, args.alertId);
    await ctx.db.patch(args.alertId, {
      status: "RESOLVED",
      resolvedAt: Date.now(),
      resolutionNote: note,
    });
    await appendChangeRecord(ctx.db as any, {
      tenantId: access?.project.tenantId,
      projectId,
      operatorId: actor.operatorId,
      type: "ALERT_RESOLVED",
      summary: `Alert resolved: ${alert.title}`,
      payload: { alertId: alert._id, previousStatus: alert.status, resolutionNote: note },
      relatedTable: "alerts",
      relatedId: String(alert._id),
    });
    return { alert: await ctx.db.get(args.alertId) };
  },
});

export const resolve = action({
  args: resolveArgs,
  handler: async (ctx, args): Promise<any> =>
    await runAuditedHumanMutation(
      ctx,
      internal.alerts.resolveInternal,
      args,
      "alerts.resolve",
      { alertId: args.alertId },
    ),
});

const ignoreArgs = {
  alertId: v.id("alerts"),
  reason: v.optional(v.string()),
};

export const ignoreInternal = internalMutation({
  args: ignoreArgs,
  handler: async (ctx, args) => {
    const reason = args.reason?.trim();
    if (!reason) throw new Error("A reason is required to ignore an alert.");
    const { alert, projectId, access, actor } = await requireAlertWrite(ctx, args.alertId);
    await ctx.db.patch(args.alertId, {
      status: "IGNORED",
      resolutionNote: reason,
    });
    await appendChangeRecord(ctx.db as any, {
      tenantId: access?.project.tenantId,
      projectId,
      operatorId: actor.operatorId,
      type: "ALERT_IGNORED",
      summary: `Alert ignored: ${alert.title}`,
      payload: { alertId: alert._id, previousStatus: alert.status, reason },
      relatedTable: "alerts",
      relatedId: String(alert._id),
    });
    return { alert: await ctx.db.get(args.alertId) };
  },
});

export const ignore = action({
  args: ignoreArgs,
  handler: async (ctx, args): Promise<any> =>
    await runAuditedHumanMutation(
      ctx,
      internal.alerts.ignoreInternal,
      args,
      "alerts.ignore",
      { alertId: args.alertId },
    ),
});
