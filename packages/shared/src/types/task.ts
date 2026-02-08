/**
 * Task Types
 * 
 * Tasks are units of work assigned to agents with deterministic state machine.
 * Status values are UPPERCASE to match Convex schema (source of truth).
 */

export type TaskStatus =
  | "INBOX"           // New task, not assigned
  | "ASSIGNED"        // Assigned to agent(s), not started
  | "IN_PROGRESS"     // Agent actively working
  | "REVIEW"          // Agent submitted for review
  | "NEEDS_APPROVAL"  // Waiting for human approval
  | "BLOCKED"         // Cannot proceed (budget/loop/failure)
  | "FAILED"          // Unrecoverable failure (terminal)
  | "DONE"            // Completed and approved (terminal)
  | "CANCELED";       // Abandoned (terminal)

export type TaskType =
  | "CONTENT"
  | "SOCIAL"
  | "EMAIL_MARKETING"
  | "CUSTOMER_RESEARCH"
  | "SEO_RESEARCH"
  | "ENGINEERING"
  | "DOCS"
  | "OPS";

export type TaskPriority = 1 | 2 | 3 | 4;

export interface Task {
  _id: string;
  _creationTime: number;
  title: string;
  description: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeIds: string[];
  reviewerIds: string[];
  subscriberIds: string[];
  threadRef?: string;
  parentTaskId?: string;
  dependsOn: string[];
  budget: number;
  spend: number;
  workPlan?: string;
  deliverable?: string;
  selfReview?: string;
  evidence?: string[];
  blockedReason?: string;
  metadata: Record<string, any>;
}

export interface CreateTaskInput {
  title: string;
  description: string;
  type: TaskType;
  priority?: TaskPriority;
  assigneeIds?: string[];
  reviewerIds?: string[];
  subscriberIds?: string[];
  threadRef?: string;
  parentTaskId?: string;
  dependsOn?: string[];
  budget?: number;
  metadata?: Record<string, any>;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  type?: TaskType;
  priority?: TaskPriority;
  assigneeIds?: string[];
  reviewerIds?: string[];
  subscriberIds?: string[];
  threadRef?: string;
  dependsOn?: string[];
  budget?: number;
  spend?: number;
  workPlan?: string;
  deliverable?: string;
  selfReview?: string;
  evidence?: string[];
  blockedReason?: string;
  metadata?: Record<string, any>;
}

export type TransitionActor = "agent" | "human" | "system";

export interface TaskTransition {
  _id: string;
  _creationTime: number;
  taskId: string;
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  actor: TransitionActor;
  actorId?: string;
  reason?: string;
  artifactsProvided?: string[];
  idempotencyKey: string;
}

export interface TransitionTaskInput {
  taskId: string;
  toStatus: TaskStatus;
  actor: TransitionActor;
  actorId?: string;
  reason?: string;
  artifacts?: {
    workPlan?: string;
    deliverable?: string;
    selfReview?: string;
    evidence?: string[];
    approvalRecord?: string;
  };
  idempotencyKey: string;
}
