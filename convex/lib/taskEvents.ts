import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export type TaskEventType =
  | "TASK_CREATED"
  | "TASK_TRANSITION"
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

export async function logTaskEvent(
  ctx: MutationCtx,
  args: {
    taskId: Id<"tasks">;
    projectId?: Id<"projects">;
    eventType: TaskEventType;
    actorType: TaskEventActorType;
    actorId?: string;
    relatedId?: string;
    beforeState?: unknown;
    afterState?: unknown;
    metadata?: unknown;
  }
) {
  return await ctx.db.insert("taskEvents", {
    projectId: args.projectId,
    taskId: args.taskId,
    eventType: args.eventType,
    actorType: args.actorType,
    actorId: args.actorId,
    relatedId: args.relatedId,
    timestamp: Date.now(),
    beforeState: args.beforeState,
    afterState: args.afterState,
    metadata: args.metadata,
  });
}
