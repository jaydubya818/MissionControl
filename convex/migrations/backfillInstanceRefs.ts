import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "../_generated/server";
import { api } from "../_generated/api";
import { resolveAgentRef } from "../lib/agentResolver";
import { preferInstanceRefs } from "../lib/armCompat";
import { resolveActiveTenantId } from "../lib/getActiveTenant";

async function collectMigrationHealthSnapshot(ctx: { db: any }) {
  const [tasks, runs, toolCalls, messages, projects, agents, approvals] = await Promise.all([
    ctx.db.query("tasks").collect(),
    ctx.db.query("runs").collect(),
    ctx.db.query("toolCalls").collect(),
    ctx.db.query("messages").collect(),
    ctx.db.query("projects").collect(),
    ctx.db.query("agents").collect(),
    ctx.db.query("approvals").collect(),
  ]);

  const missingInstanceRefs = {
    tasks: tasks.filter((row: any) => row.assigneeIds.length > 0 && (!row.assigneeInstanceIds || row.assigneeInstanceIds.length === 0)).length,
    runs: runs.filter((row: any) => row.agentId && (!row.instanceId || !row.versionId || !row.templateId)).length,
    toolCalls: toolCalls.filter((row: any) => row.agentId && (!row.instanceId || !row.versionId)).length,
    messages: messages.filter((row: any) => row.authorAgentId && !row.authorInstanceId).length,
  };

  const totalRecords = {
    tasks: tasks.length,
    runs: runs.length,
    toolCalls: toolCalls.length,
    messages: messages.length,
  };

  const missingTenant = {
    projects: projects.filter((row: any) => !row.tenantId).length,
    agents: agents.filter((row: any) => !row.tenantId).length,
    tasks: tasks.filter((row: any) => !row.tenantId).length,
    runs: runs.filter((row: any) => !row.tenantId).length,
    toolCalls: toolCalls.filter((row: any) => !row.tenantId).length,
    messages: messages.filter((row: any) => !row.tenantId).length,
    approvals: approvals.filter((row: any) => !row.tenantId).length,
  };

  const driftTotals = {
    missingInstanceRefs:
      missingInstanceRefs.tasks +
      missingInstanceRefs.runs +
      missingInstanceRefs.toolCalls +
      missingInstanceRefs.messages,
    missingTenant:
      missingTenant.projects +
      missingTenant.agents +
      missingTenant.tasks +
      missingTenant.runs +
      missingTenant.toolCalls +
      missingTenant.messages +
      missingTenant.approvals,
  };

  return {
    armCompatMode: preferInstanceRefs() ? "instance" : "legacy",
    totalRecords,
    missingInstanceRefs,
    missingTenant,
    driftTotals,
  };
}

export const listTasksNeedingBackfill = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("tasks").collect();
    return rows
      .filter((row) => row.assigneeIds.length > 0 && (!row.assigneeInstanceIds || row.assigneeInstanceIds.length === 0))
      .map((row) => row._id);
  },
});

export const listRunsNeedingBackfill = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("runs").collect();
    return rows
      .filter((row) => row.agentId && (!row.instanceId || !row.versionId || !row.templateId))
      .map((row) => row._id);
  },
});

export const listToolCallsNeedingBackfill = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("toolCalls").collect();
    return rows
      .filter((row) => row.agentId && (!row.instanceId || !row.versionId))
      .map((row) => row._id);
  },
});

export const listMessagesNeedingBackfill = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("messages").collect();
    return rows
      .filter((row) => row.authorAgentId && !row.authorInstanceId)
      .map((row) => row._id);
  },
});

export const getMigrationHealth = query({
  args: {},
  handler: async (ctx) => {
    const snapshot = await collectMigrationHealthSnapshot(ctx);
    return snapshot;
  },
});

export const guardMigrationHealth = internalMutation({
  args: {},
  handler: async (ctx) => {
    const snapshot = await collectMigrationHealthSnapshot(ctx);
    const now = Date.now();
    const totalDrift = snapshot.driftTotals.missingInstanceRefs + snapshot.driftTotals.missingTenant;

    const openAlerts = await ctx.db
      .query("alerts")
      .withIndex("by_status", (q) => q.eq("status", "OPEN"))
      .collect();
    const existing = openAlerts.find((row) => row.type === "MIGRATION_HEALTH_DRIFT");

    if (totalDrift === 0) {
      if (existing) {
        await ctx.db.patch(existing._id, {
          status: "RESOLVED",
          resolvedAt: now,
          resolutionNote: "Migration health drift resolved automatically by scheduled guard.",
          metadata: {
            ...(existing.metadata ?? {}),
            latestSnapshot: snapshot,
            updatedAt: now,
          },
        });
      }
      return { healthy: true, totalDrift, resolvedAlertId: existing?._id };
    }

    const tenantId = await resolveActiveTenantId(
      { db: ctx.db as any },
      { createDefaultIfMissing: true }
    );
    const description =
      `ARM migration drift detected. Missing refs: ` +
      `${snapshot.missingInstanceRefs.tasks}/${snapshot.missingInstanceRefs.runs}/${snapshot.missingInstanceRefs.toolCalls}/${snapshot.missingInstanceRefs.messages}. ` +
      `Missing tenant IDs: projects=${snapshot.missingTenant.projects}, agents=${snapshot.missingTenant.agents}, tasks=${snapshot.missingTenant.tasks}, runs=${snapshot.missingTenant.runs}, toolCalls=${snapshot.missingTenant.toolCalls}, messages=${snapshot.missingTenant.messages}, approvals=${snapshot.missingTenant.approvals}.`;

    if (existing) {
      await ctx.db.patch(existing._id, {
        tenantId: existing.tenantId ?? tenantId,
        severity: totalDrift > 25 ? "ERROR" : "WARNING",
        description,
        metadata: {
          ...(existing.metadata ?? {}),
          latestSnapshot: snapshot,
          updatedAt: now,
        },
      });
      return { healthy: false, totalDrift, alertId: existing._id, updated: true };
    }

    const alertId = await ctx.db.insert("alerts", {
      tenantId,
      severity: totalDrift > 25 ? "ERROR" : "WARNING",
      type: "MIGRATION_HEALTH_DRIFT",
      title: "ARM migration health drift detected",
      description,
      status: "OPEN",
      metadata: {
        latestSnapshot: snapshot,
        createdBy: "migrations.guardMigrationHealth",
      },
    });

    return { healthy: false, totalDrift, alertId, created: true };
  },
});

export const listProjectsNeedingTenantBackfill = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("projects").collect();
    return rows.filter((row) => !row.tenantId).map((row) => row._id);
  },
});

export const listAgentsNeedingTenantBackfill = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("agents").collect();
    return rows.filter((row) => !row.tenantId).map((row) => row._id);
  },
});

export const listTasksNeedingTenantBackfill = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("tasks").collect();
    return rows.filter((row) => !row.tenantId).map((row) => row._id);
  },
});

export const listRunsNeedingTenantBackfill = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("runs").collect();
    return rows.filter((row) => !row.tenantId).map((row) => row._id);
  },
});

export const listToolCallsNeedingTenantBackfill = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("toolCalls").collect();
    return rows.filter((row) => !row.tenantId).map((row) => row._id);
  },
});

export const listMessagesNeedingTenantBackfill = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("messages").collect();
    return rows.filter((row) => !row.tenantId).map((row) => row._id);
  },
});

export const listApprovalsNeedingTenantBackfill = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("approvals").collect();
    return rows.filter((row) => !row.tenantId).map((row) => row._id);
  },
});

export const backfillProjectTenant = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.tenantId) return { updated: false };

    const tenantId = await resolveActiveTenantId(
      { db: ctx.db as any },
      { createDefaultIfMissing: true }
    );
    if (!tenantId) return { updated: false };

    await ctx.db.patch(project._id, { tenantId });
    return { updated: true };
  },
});

export const backfillAgentTenant = mutation({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const agent = await ctx.db.get(args.agentId);
    if (!agent || agent.tenantId) return { updated: false };

    const project = agent.projectId ? await ctx.db.get(agent.projectId) : null;
    const tenantId = await resolveActiveTenantId(
      { db: ctx.db as any },
      { projectId: project?._id, createDefaultIfMissing: true }
    );
    if (!tenantId) return { updated: false };

    await ctx.db.patch(agent._id, { tenantId });
    return { updated: true };
  },
});

export const backfillTaskTenant = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task || task.tenantId) return { updated: false };

    const primaryAssigneeId = task.assigneeIds?.[0];
    const primaryAssignee = primaryAssigneeId ? await ctx.db.get(primaryAssigneeId) : null;
    const tenantId = await resolveActiveTenantId(
      { db: ctx.db as any },
      {
        projectId: task.projectId,
        tenantId: primaryAssignee?.tenantId,
        createDefaultIfMissing: true,
      }
    );
    if (!tenantId) return { updated: false };

    await ctx.db.patch(task._id, { tenantId });
    return { updated: true };
  },
});

export const backfillRunTenant = mutation({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.tenantId) return { updated: false };

    const agent = await ctx.db.get(run.agentId);
    const task = run.taskId ? await ctx.db.get(run.taskId) : null;
    const tenantId = await resolveActiveTenantId(
      { db: ctx.db as any },
      {
        projectId: run.projectId ?? task?.projectId,
        tenantId: agent?.tenantId ?? task?.tenantId,
        createDefaultIfMissing: true,
      }
    );
    if (!tenantId) return { updated: false };

    await ctx.db.patch(run._id, { tenantId });
    return { updated: true };
  },
});

export const backfillToolCallTenant = mutation({
  args: { toolCallId: v.id("toolCalls") },
  handler: async (ctx, args) => {
    const toolCall = await ctx.db.get(args.toolCallId);
    if (!toolCall || toolCall.tenantId) return { updated: false };

    const agent = await ctx.db.get(toolCall.agentId);
    const run = await ctx.db.get(toolCall.runId);
    const task = toolCall.taskId ? await ctx.db.get(toolCall.taskId) : null;
    const tenantId = await resolveActiveTenantId(
      { db: ctx.db as any },
      {
        projectId: toolCall.projectId ?? run?.projectId ?? task?.projectId,
        tenantId: agent?.tenantId ?? run?.tenantId ?? task?.tenantId,
        createDefaultIfMissing: true,
      }
    );
    if (!tenantId) return { updated: false };

    await ctx.db.patch(toolCall._id, { tenantId });
    return { updated: true };
  },
});

export const backfillMessageTenant = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message || message.tenantId) return { updated: false };

    const task = await ctx.db.get(message.taskId);
    const author = message.authorAgentId ? await ctx.db.get(message.authorAgentId) : null;
    const tenantId = await resolveActiveTenantId(
      { db: ctx.db as any },
      {
        projectId: message.projectId ?? task?.projectId,
        tenantId: task?.tenantId ?? author?.tenantId,
        createDefaultIfMissing: true,
      }
    );
    if (!tenantId) return { updated: false };

    await ctx.db.patch(message._id, { tenantId });
    return { updated: true };
  },
});

export const backfillApprovalTenant = mutation({
  args: { approvalId: v.id("approvals") },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval || approval.tenantId) return { updated: false };

    const requestor = await ctx.db.get(approval.requestorAgentId);
    const task = approval.taskId ? await ctx.db.get(approval.taskId) : null;
    const toolCall = approval.toolCallId ? await ctx.db.get(approval.toolCallId) : null;
    const run = toolCall?.runId ? await ctx.db.get(toolCall.runId) : null;

    const tenantId = await resolveActiveTenantId(
      { db: ctx.db as any },
      {
        projectId: approval.projectId ?? task?.projectId ?? toolCall?.projectId ?? run?.projectId,
        tenantId: requestor?.tenantId ?? task?.tenantId ?? toolCall?.tenantId ?? run?.tenantId,
        createDefaultIfMissing: true,
      }
    );
    if (!tenantId) return { updated: false };

    await ctx.db.patch(approval._id, { tenantId });
    return { updated: true };
  },
});

export const backfillTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return { updated: false };
    if (!task.assigneeIds.length) return { updated: false };

    const refs = await Promise.all(
      task.assigneeIds.map((agentId) =>
        resolveAgentRef({ db: ctx.db as any }, { agentId, createIfMissing: true })
      )
    );
    const assigneeInstanceIds = refs
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .map((row) => row.instanceId);

    await ctx.db.patch(task._id, { assigneeInstanceIds });
    return { updated: true };
  },
});

export const backfillRun = mutation({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return { updated: false };

    const ref = await resolveAgentRef(
      { db: ctx.db as any },
      { agentId: run.agentId, createIfMissing: true }
    );
    if (!ref) return { updated: false };

    await ctx.db.patch(run._id, {
      instanceId: ref.instanceId,
      versionId: ref.versionId,
      templateId: ref.templateId,
    });
    return { updated: true };
  },
});

export const backfillToolCall = mutation({
  args: { toolCallId: v.id("toolCalls") },
  handler: async (ctx, args) => {
    const toolCall = await ctx.db.get(args.toolCallId);
    if (!toolCall || !toolCall.agentId) return { updated: false };

    const ref = await resolveAgentRef(
      { db: ctx.db as any },
      { agentId: toolCall.agentId, createIfMissing: true }
    );
    if (!ref) return { updated: false };

    await ctx.db.patch(toolCall._id, {
      instanceId: ref.instanceId,
      versionId: ref.versionId,
    });
    return { updated: true };
  },
});

export const backfillMessage = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message || !message.authorAgentId) return { updated: false };

    const ref = await resolveAgentRef(
      { db: ctx.db as any },
      { agentId: message.authorAgentId, createIfMissing: true }
    );
    if (!ref) return { updated: false };

    await ctx.db.patch(message._id, {
      authorInstanceId: ref.instanceId,
    });
    return { updated: true };
  },
});

export const runBackfill = action({
  args: {
    tasksOffset: v.optional(v.number()),
    runsOffset: v.optional(v.number()),
    toolCallsOffset: v.optional(v.number()),
    messagesOffset: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const anyApi = api as any;
    const batchSize = args.batchSize ?? 100;

    const [taskIds, runIds, toolCallIds, messageIds] = await Promise.all([
      ctx.runQuery(anyApi.migrations.backfillInstanceRefs.listTasksNeedingBackfill, {}),
      ctx.runQuery(anyApi.migrations.backfillInstanceRefs.listRunsNeedingBackfill, {}),
      ctx.runQuery(anyApi.migrations.backfillInstanceRefs.listToolCallsNeedingBackfill, {}),
      ctx.runQuery(anyApi.migrations.backfillInstanceRefs.listMessagesNeedingBackfill, {}),
    ]);

    const tasksOffset = args.tasksOffset ?? 0;
    const runsOffset = args.runsOffset ?? 0;
    const toolCallsOffset = args.toolCallsOffset ?? 0;
    const messagesOffset = args.messagesOffset ?? 0;

    let tasksUpdated = 0;
    let runsUpdated = 0;
    let toolCallsUpdated = 0;
    let messagesUpdated = 0;

    for (const taskId of taskIds.slice(tasksOffset, tasksOffset + batchSize)) {
      const result = await ctx.runMutation(anyApi.migrations.backfillInstanceRefs.backfillTask, { taskId });
      if (result.updated) tasksUpdated++;
    }

    for (const runId of runIds.slice(runsOffset, runsOffset + batchSize)) {
      const result = await ctx.runMutation(anyApi.migrations.backfillInstanceRefs.backfillRun, { runId });
      if (result.updated) runsUpdated++;
    }

    for (const toolCallId of toolCallIds.slice(toolCallsOffset, toolCallsOffset + batchSize)) {
      const result = await ctx.runMutation(anyApi.migrations.backfillInstanceRefs.backfillToolCall, { toolCallId });
      if (result.updated) toolCallsUpdated++;
    }

    for (const messageId of messageIds.slice(messagesOffset, messagesOffset + batchSize)) {
      const result = await ctx.runMutation(anyApi.migrations.backfillInstanceRefs.backfillMessage, { messageId });
      if (result.updated) messagesUpdated++;
    }

    const next = {
      tasksOffset: tasksOffset + Math.min(batchSize, Math.max(taskIds.length - tasksOffset, 0)),
      runsOffset: runsOffset + Math.min(batchSize, Math.max(runIds.length - runsOffset, 0)),
      toolCallsOffset: toolCallsOffset + Math.min(batchSize, Math.max(toolCallIds.length - toolCallsOffset, 0)),
      messagesOffset: messagesOffset + Math.min(batchSize, Math.max(messageIds.length - messagesOffset, 0)),
    };

    const done =
      next.tasksOffset >= taskIds.length &&
      next.runsOffset >= runIds.length &&
      next.toolCallsOffset >= toolCallIds.length &&
      next.messagesOffset >= messageIds.length;

    return {
      done,
      batchSize,
      totals: {
        tasks: taskIds.length,
        runs: runIds.length,
        toolCalls: toolCallIds.length,
        messages: messageIds.length,
      },
      updated: {
        tasks: tasksUpdated,
        runs: runsUpdated,
        toolCalls: toolCallsUpdated,
        messages: messagesUpdated,
      },
      next,
    };
  },
});

export const runTenantBackfill = action({
  args: {
    projectsOffset: v.optional(v.number()),
    agentsOffset: v.optional(v.number()),
    tasksOffset: v.optional(v.number()),
    runsOffset: v.optional(v.number()),
    toolCallsOffset: v.optional(v.number()),
    messagesOffset: v.optional(v.number()),
    approvalsOffset: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const anyApi = api as any;
    const batchSize = args.batchSize ?? 100;

    const [projectIds, agentIds, taskIds, runIds, toolCallIds, messageIds, approvalIds] = await Promise.all([
      ctx.runQuery(anyApi.migrations.backfillInstanceRefs.listProjectsNeedingTenantBackfill, {}),
      ctx.runQuery(anyApi.migrations.backfillInstanceRefs.listAgentsNeedingTenantBackfill, {}),
      ctx.runQuery(anyApi.migrations.backfillInstanceRefs.listTasksNeedingTenantBackfill, {}),
      ctx.runQuery(anyApi.migrations.backfillInstanceRefs.listRunsNeedingTenantBackfill, {}),
      ctx.runQuery(anyApi.migrations.backfillInstanceRefs.listToolCallsNeedingTenantBackfill, {}),
      ctx.runQuery(anyApi.migrations.backfillInstanceRefs.listMessagesNeedingTenantBackfill, {}),
      ctx.runQuery(anyApi.migrations.backfillInstanceRefs.listApprovalsNeedingTenantBackfill, {}),
    ]);

    const projectsOffset = args.projectsOffset ?? 0;
    const agentsOffset = args.agentsOffset ?? 0;
    const tasksOffset = args.tasksOffset ?? 0;
    const runsOffset = args.runsOffset ?? 0;
    const toolCallsOffset = args.toolCallsOffset ?? 0;
    const messagesOffset = args.messagesOffset ?? 0;
    const approvalsOffset = args.approvalsOffset ?? 0;

    let projectsUpdated = 0;
    let agentsUpdated = 0;
    let tasksUpdated = 0;
    let runsUpdated = 0;
    let toolCallsUpdated = 0;
    let messagesUpdated = 0;
    let approvalsUpdated = 0;

    for (const projectId of projectIds.slice(projectsOffset, projectsOffset + batchSize)) {
      const result = await ctx.runMutation(anyApi.migrations.backfillInstanceRefs.backfillProjectTenant, { projectId });
      if (result.updated) projectsUpdated++;
    }
    for (const agentId of agentIds.slice(agentsOffset, agentsOffset + batchSize)) {
      const result = await ctx.runMutation(anyApi.migrations.backfillInstanceRefs.backfillAgentTenant, { agentId });
      if (result.updated) agentsUpdated++;
    }
    for (const taskId of taskIds.slice(tasksOffset, tasksOffset + batchSize)) {
      const result = await ctx.runMutation(anyApi.migrations.backfillInstanceRefs.backfillTaskTenant, { taskId });
      if (result.updated) tasksUpdated++;
    }
    for (const runId of runIds.slice(runsOffset, runsOffset + batchSize)) {
      const result = await ctx.runMutation(anyApi.migrations.backfillInstanceRefs.backfillRunTenant, { runId });
      if (result.updated) runsUpdated++;
    }
    for (const toolCallId of toolCallIds.slice(toolCallsOffset, toolCallsOffset + batchSize)) {
      const result = await ctx.runMutation(anyApi.migrations.backfillInstanceRefs.backfillToolCallTenant, { toolCallId });
      if (result.updated) toolCallsUpdated++;
    }
    for (const messageId of messageIds.slice(messagesOffset, messagesOffset + batchSize)) {
      const result = await ctx.runMutation(anyApi.migrations.backfillInstanceRefs.backfillMessageTenant, { messageId });
      if (result.updated) messagesUpdated++;
    }
    for (const approvalId of approvalIds.slice(approvalsOffset, approvalsOffset + batchSize)) {
      const result = await ctx.runMutation(anyApi.migrations.backfillInstanceRefs.backfillApprovalTenant, { approvalId });
      if (result.updated) approvalsUpdated++;
    }

    const next = {
      projectsOffset: projectsOffset + Math.min(batchSize, Math.max(projectIds.length - projectsOffset, 0)),
      agentsOffset: agentsOffset + Math.min(batchSize, Math.max(agentIds.length - agentsOffset, 0)),
      tasksOffset: tasksOffset + Math.min(batchSize, Math.max(taskIds.length - tasksOffset, 0)),
      runsOffset: runsOffset + Math.min(batchSize, Math.max(runIds.length - runsOffset, 0)),
      toolCallsOffset: toolCallsOffset + Math.min(batchSize, Math.max(toolCallIds.length - toolCallsOffset, 0)),
      messagesOffset: messagesOffset + Math.min(batchSize, Math.max(messageIds.length - messagesOffset, 0)),
      approvalsOffset: approvalsOffset + Math.min(batchSize, Math.max(approvalIds.length - approvalsOffset, 0)),
    };

    const done =
      next.projectsOffset >= projectIds.length &&
      next.agentsOffset >= agentIds.length &&
      next.tasksOffset >= taskIds.length &&
      next.runsOffset >= runIds.length &&
      next.toolCallsOffset >= toolCallIds.length &&
      next.messagesOffset >= messageIds.length &&
      next.approvalsOffset >= approvalIds.length;

    return {
      done,
      batchSize,
      totals: {
        projects: projectIds.length,
        agents: agentIds.length,
        tasks: taskIds.length,
        runs: runIds.length,
        toolCalls: toolCallIds.length,
        messages: messageIds.length,
        approvals: approvalIds.length,
      },
      updated: {
        projects: projectsUpdated,
        agents: agentsUpdated,
        tasks: tasksUpdated,
        runs: runsUpdated,
        toolCalls: toolCallsUpdated,
        messages: messagesUpdated,
        approvals: approvalsUpdated,
      },
      next,
    };
  },
});
