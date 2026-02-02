/**
 * Task Types
 *
 * Tasks are units of work assigned to agents with deterministic state machine.
 */
export type TaskStatus = "inbox" | "assigned" | "in_progress" | "review" | "needs_approval" | "blocked" | "done" | "canceled";
export type TaskType = "content" | "social" | "email_marketing" | "customer_research" | "seo_research" | "engineering" | "docs" | "ops";
export type TaskPriority = "high" | "medium" | "low";
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
//# sourceMappingURL=task.d.ts.map