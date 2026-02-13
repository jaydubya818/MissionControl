import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { buildTaskEventId, logTaskEvent, type TaskEventActorType, type TaskEventType } from "./lib/taskEvents";

type BackfillCounters = {
  existingPatched: number;
  transitionsInserted: number;
  messagesInserted: number;
  runsInserted: number;
  approvalsInserted: number;
  toolCallsInserted: number;
};

function getCreationTime(row: unknown): number {
  if (row && typeof row === "object" && "_creationTime" in row) {
    const value = (row as { _creationTime?: number })._creationTime;
    if (typeof value === "number") return value;
  }
  return Date.now();
}

async function hydrateMissingEventIds(
  ctx: MutationCtx,
  taskId: Id<"tasks">
): Promise<{ eventIds: Set<string>; patched: number }> {
  const existingEvents = await ctx.db
    .query("taskEvents")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();

  const eventIds = new Set<string>();
  let patched = 0;

  for (const event of existingEvents) {
    const computedEventId =
      event.eventId ??
      buildTaskEventId({
        taskId: event.taskId,
        eventType: event.eventType as TaskEventType,
        actorType: event.actorType as TaskEventActorType,
        actorId: event.actorId,
        relatedId: event.relatedId,
        ruleId: event.ruleId,
        beforeState: event.beforeState,
        afterState: event.afterState,
      });

    if (!event.eventId) {
      await ctx.db.patch(event._id, { eventId: computedEventId });
      patched++;
    }

    eventIds.add(computedEventId);
  }

  return { eventIds, patched };
}

async function upsertBackfillEvent(
  ctx: MutationCtx,
  eventIds: Set<string>,
  args: {
    taskId: Id<"tasks">;
    projectId?: Id<"projects">;
    eventType: TaskEventType;
    actorType: TaskEventActorType;
    actorId?: string;
    relatedId?: string;
    ruleId?: string;
    timestamp: number;
    beforeState?: unknown;
    afterState?: unknown;
    metadata?: Record<string, unknown>;
  }
): Promise<boolean> {
  const eventId = buildTaskEventId({
    taskId: args.taskId,
    eventType: args.eventType,
    actorType: args.actorType,
    actorId: args.actorId,
    relatedId: args.relatedId,
    ruleId: args.ruleId,
    beforeState: args.beforeState,
    afterState: args.afterState,
  });

  if (eventIds.has(eventId)) {
    return false;
  }

  await logTaskEvent(ctx, {
    taskId: args.taskId,
    projectId: args.projectId,
    eventType: args.eventType,
    actorType: args.actorType,
    actorId: args.actorId,
    eventId,
    ruleId: args.ruleId,
    relatedId: args.relatedId,
    timestamp: args.timestamp,
    beforeState: args.beforeState,
    afterState: args.afterState,
    metadata: {
      ...(args.metadata ?? {}),
      backfilled: true,
    },
  });

  eventIds.add(eventId);
  return true;
}

async function backfillTaskInternal(
  ctx: MutationCtx,
  taskId: Id<"tasks">
): Promise<BackfillCounters> {
  const task = await ctx.db.get(taskId);
  if (!task) {
    throw new Error("Task not found");
  }

  const counters: BackfillCounters = {
    existingPatched: 0,
    transitionsInserted: 0,
    messagesInserted: 0,
    runsInserted: 0,
    approvalsInserted: 0,
    toolCallsInserted: 0,
  };

  const hydrated = await hydrateMissingEventIds(ctx, taskId);
  counters.existingPatched = hydrated.patched;
  const eventIds = hydrated.eventIds;

  const [transitions, messages, runs, approvals, toolCalls] = await Promise.all([
    ctx.db.query("taskTransitions").withIndex("by_task", (q) => q.eq("taskId", taskId)).collect(),
    ctx.db.query("messages").withIndex("by_task", (q) => q.eq("taskId", taskId)).collect(),
    ctx.db.query("runs").withIndex("by_task", (q) => q.eq("taskId", taskId)).collect(),
    ctx.db.query("approvals").withIndex("by_task", (q) => q.eq("taskId", taskId)).collect(),
    ctx.db.query("toolCalls").withIndex("by_task", (q) => q.eq("taskId", taskId)).collect(),
  ]);

  for (const transition of transitions) {
    const inserted = await upsertBackfillEvent(ctx, eventIds, {
      taskId,
      projectId: transition.projectId,
      eventType: "TASK_TRANSITION",
      actorType: transition.actorType as TaskEventActorType,
      actorId: transition.actorAgentId ? String(transition.actorAgentId) : transition.actorUserId,
      relatedId: String(transition._id),
      timestamp: getCreationTime(transition),
      beforeState: { status: transition.fromStatus },
      afterState: { status: transition.toStatus },
      metadata: {
        reason: transition.reason,
        sessionKey: transition.sessionKey,
      },
    });
    if (inserted) counters.transitionsInserted++;
  }

  for (const message of messages) {
    const inserted = await upsertBackfillEvent(ctx, eventIds, {
      taskId,
      projectId: message.projectId,
      eventType: "MESSAGE_POSTED",
      actorType: message.authorType as TaskEventActorType,
      actorId: message.authorAgentId ? String(message.authorAgentId) : message.authorUserId,
      relatedId: String(message._id),
      timestamp: getCreationTime(message),
      metadata: {
        messageType: message.type,
        replyToId: message.replyToId ? String(message.replyToId) : undefined,
      },
    });
    if (inserted) counters.messagesInserted++;
  }

  for (const run of runs) {
    const startInserted = await upsertBackfillEvent(ctx, eventIds, {
      taskId,
      projectId: run.projectId,
      eventType: "RUN_STARTED",
      actorType: "AGENT",
      actorId: String(run.agentId),
      relatedId: String(run._id),
      timestamp: run.startedAt,
      afterState: { status: "RUNNING" },
      metadata: {
        model: run.model,
        sessionKey: run.sessionKey,
      },
    });
    if (startInserted) counters.runsInserted++;

    if (run.endedAt && run.status !== "RUNNING") {
      const endInserted = await upsertBackfillEvent(ctx, eventIds, {
        taskId,
        projectId: run.projectId,
        eventType: run.status === "FAILED" || run.status === "TIMEOUT" ? "RUN_FAILED" : "RUN_COMPLETED",
        actorType: "AGENT",
        actorId: String(run.agentId),
        relatedId: String(run._id),
        timestamp: run.endedAt,
        beforeState: { status: "RUNNING" },
        afterState: { status: run.status },
        metadata: {
          costUsd: run.costUsd,
          durationMs: run.durationMs,
          inputTokens: run.inputTokens,
          outputTokens: run.outputTokens,
        },
      });
      if (endInserted) counters.runsInserted++;
    }
  }

  for (const approval of approvals) {
    const requestedInserted = await upsertBackfillEvent(ctx, eventIds, {
      taskId,
      projectId: approval.projectId,
      eventType: "APPROVAL_REQUESTED",
      actorType: "AGENT",
      actorId: String(approval.requestorAgentId),
      relatedId: String(approval._id),
      timestamp: getCreationTime(approval),
      afterState: { status: approval.status },
      metadata: {
        actionType: approval.actionType,
        riskLevel: approval.riskLevel,
      },
    });
    if (requestedInserted) counters.approvalsInserted++;

    if (approval.status === "ESCALATED" && approval.escalatedAt) {
      const escalatedInserted = await upsertBackfillEvent(ctx, eventIds, {
        taskId,
        projectId: approval.projectId,
        eventType: "APPROVAL_ESCALATED",
        actorType: "SYSTEM",
        actorId: approval.escalatedBy,
        relatedId: String(approval._id),
        timestamp: approval.escalatedAt,
        beforeState: { status: "PENDING" },
        afterState: { status: "ESCALATED" },
        metadata: {
          escalationReason: approval.escalationReason,
          escalationLevel: approval.escalationLevel,
        },
      });
      if (escalatedInserted) counters.approvalsInserted++;
    }

    if (approval.status === "APPROVED" && approval.decidedAt) {
      const approvedInserted = await upsertBackfillEvent(ctx, eventIds, {
        taskId,
        projectId: approval.projectId,
        eventType: "APPROVAL_APPROVED",
        actorType: approval.decidedByUserId ? "HUMAN" : "AGENT",
        actorId: approval.decidedByUserId ?? (approval.decidedByAgentId ? String(approval.decidedByAgentId) : undefined),
        relatedId: String(approval._id),
        timestamp: approval.decidedAt,
        beforeState: { status: "PENDING" },
        afterState: { status: "APPROVED" },
        metadata: {
          decisionReason: approval.decisionReason,
        },
      });
      if (approvedInserted) counters.approvalsInserted++;
    }

    if (approval.status === "DENIED" && approval.decidedAt) {
      const deniedInserted = await upsertBackfillEvent(ctx, eventIds, {
        taskId,
        projectId: approval.projectId,
        eventType: "APPROVAL_DENIED",
        actorType: approval.decidedByUserId ? "HUMAN" : "AGENT",
        actorId: approval.decidedByUserId ?? (approval.decidedByAgentId ? String(approval.decidedByAgentId) : undefined),
        relatedId: String(approval._id),
        timestamp: approval.decidedAt,
        beforeState: { status: "PENDING" },
        afterState: { status: "DENIED" },
        metadata: {
          decisionReason: approval.decisionReason,
        },
      });
      if (deniedInserted) counters.approvalsInserted++;
    }

    if (approval.status === "EXPIRED") {
      const expiredInserted = await upsertBackfillEvent(ctx, eventIds, {
        taskId,
        projectId: approval.projectId,
        eventType: "APPROVAL_EXPIRED",
        actorType: "SYSTEM",
        relatedId: String(approval._id),
        timestamp: approval.expiresAt,
        beforeState: { status: "PENDING" },
        afterState: { status: "EXPIRED" },
      });
      if (expiredInserted) counters.approvalsInserted++;
    }
  }

  for (const toolCall of toolCalls) {
    const startInserted = await upsertBackfillEvent(ctx, eventIds, {
      taskId,
      projectId: toolCall.projectId,
      eventType: "TOOL_CALL",
      actorType: "AGENT",
      actorId: String(toolCall.agentId),
      relatedId: String(toolCall._id),
      timestamp: toolCall.startedAt,
      afterState: { status: "RUNNING" },
      metadata: {
        phase: "START",
        toolName: toolCall.toolName,
        riskLevel: toolCall.riskLevel,
      },
    });
    if (startInserted) counters.toolCallsInserted++;

    if (toolCall.endedAt && toolCall.status !== "RUNNING" && toolCall.status !== "PENDING") {
      const endInserted = await upsertBackfillEvent(ctx, eventIds, {
        taskId,
        projectId: toolCall.projectId,
        eventType: "TOOL_CALL",
        actorType: "AGENT",
        actorId: String(toolCall.agentId),
        relatedId: String(toolCall._id),
        timestamp: toolCall.endedAt,
        beforeState: { status: "RUNNING" },
        afterState: { status: toolCall.status },
        metadata: {
          phase: "END",
          toolName: toolCall.toolName,
          riskLevel: toolCall.riskLevel,
          error: toolCall.error,
        },
      });
      if (endInserted) counters.toolCallsInserted++;
    }
  }

  return counters;
}

export const listByTask = query({
  args: {
    taskId: v.id("tasks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("taskEvents")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("asc")
      .take(args.limit ?? 500);
  },
});

export const backfillTask = mutation({
  args: {
    taskId: v.id("tasks"),
  },
  handler: async (ctx, args) => {
    const counters = await backfillTaskInternal(ctx, args.taskId);
    return {
      taskId: args.taskId,
      ...counters,
    };
  },
});

export const backfillProject = mutation({
  args: {
    projectId: v.id("projects"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(args.limit ?? 200);

    const totals: BackfillCounters = {
      existingPatched: 0,
      transitionsInserted: 0,
      messagesInserted: 0,
      runsInserted: 0,
      approvalsInserted: 0,
      toolCallsInserted: 0,
    };

    for (const task of tasks) {
      const result = await backfillTaskInternal(ctx, task._id);
      totals.existingPatched += result.existingPatched;
      totals.transitionsInserted += result.transitionsInserted;
      totals.messagesInserted += result.messagesInserted;
      totals.runsInserted += result.runsInserted;
      totals.approvalsInserted += result.approvalsInserted;
      totals.toolCallsInserted += result.toolCallsInserted;
    }

    return {
      projectId: args.projectId,
      tasksProcessed: tasks.length,
      ...totals,
    };
  },
});
