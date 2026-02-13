import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export type TaskEventType =
  | "TASK_CREATED"
  | "TASK_TRANSITION"
  | "MESSAGE_POSTED"
  | "POLICY_DECISION"
  | "APPROVAL_REQUESTED"
  | "APPROVAL_ESCALATED"
  | "APPROVAL_APPROVED"
  | "APPROVAL_DENIED"
  | "APPROVAL_EXPIRED"
  | "RUN_STARTED"
  | "RUN_COMPLETED"
  | "RUN_FAILED"
  | "TOOL_CALL"
  | "OPERATOR_CONTROL";

export type TaskEventActorType = "AGENT" | "HUMAN" | "SYSTEM";

type EventState = {
  status?: string;
};

function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function getStateStatus(state: unknown): string {
  if (!state || typeof state !== "object") return "";
  const candidate = state as EventState;
  return typeof candidate.status === "string" ? candidate.status : "";
}

export function buildTaskEventId(args: {
  taskId: Id<"tasks">;
  eventType: TaskEventType;
  actorType: TaskEventActorType;
  actorId?: string;
  relatedId?: string;
  ruleId?: string;
  beforeState?: unknown;
  afterState?: unknown;
}): string {
  const base = [
    String(args.taskId),
    args.eventType,
    args.relatedId ?? "none",
    args.actorType,
    args.actorId ?? "none",
    args.ruleId ?? "none",
    getStateStatus(args.beforeState),
    getStateStatus(args.afterState),
  ].join("|");
  return `te_${hashString(base)}`;
}

export async function logTaskEvent(
  ctx: MutationCtx,
  args: {
    taskId: Id<"tasks">;
    projectId?: Id<"projects">;
    eventType: TaskEventType;
    actorType: TaskEventActorType;
    actorId?: string;
    eventId?: string;
    ruleId?: string;
    relatedId?: string;
    timestamp?: number;
    beforeState?: unknown;
    afterState?: unknown;
    metadata?: unknown;
  }
) {
  const eventId =
    args.eventId ??
    buildTaskEventId({
      taskId: args.taskId,
      eventType: args.eventType,
      actorType: args.actorType,
      actorId: args.actorId,
      relatedId: args.relatedId,
      ruleId: args.ruleId,
      beforeState: args.beforeState,
      afterState: args.afterState,
    });

  const existing = await ctx.db
    .query("taskEvents")
    .withIndex("by_event_id", (q) => q.eq("eventId", eventId))
    .first();
  if (existing) {
    return existing._id;
  }

  return await ctx.db.insert("taskEvents", {
    projectId: args.projectId,
    taskId: args.taskId,
    eventId,
    eventType: args.eventType,
    actorType: args.actorType,
    actorId: args.actorId,
    ruleId: args.ruleId,
    relatedId: args.relatedId,
    timestamp: args.timestamp ?? Date.now(),
    beforeState: args.beforeState,
    afterState: args.afterState,
    metadata: args.metadata,
  });
}
