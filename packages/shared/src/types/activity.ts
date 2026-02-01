/**
 * Activity Types
 * 
 * Activities are audit log entries for all significant events.
 */

export type ActivityType =
  | "task_created"
  | "task_transition"
  | "agent_paused"
  | "agent_quarantined"
  | "budget_exceeded"
  | "loop_detected"
  | "approval_requested"
  | "approval_decided"
  | "comment_posted"
  | "alert_fired"
  | "run_started"
  | "run_completed"
  | "tool_call_executed";

export type ActivityActorType = "agent" | "human" | "system";

export interface Activity {
  _id: string;
  _creationTime: number;
  type: ActivityType;
  taskId?: string;
  agentId?: string;
  actorId?: string;
  actorType: ActivityActorType;
  summary: string;
  details?: Record<string, any>;
}

export interface CreateActivityInput {
  type: ActivityType;
  taskId?: string;
  agentId?: string;
  actorId?: string;
  actorType: ActivityActorType;
  summary: string;
  details?: Record<string, any>;
}
