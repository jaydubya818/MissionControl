/**
 * Task State Machine Validator (Convex-safe, no external deps)
 * Mirrors packages/state-machine logic for use in Convex mutations.
 */
export type TaskStatus = "inbox" | "assigned" | "in_progress" | "review" | "needs_approval" | "blocked" | "done" | "canceled";
export type TransitionActor = "agent" | "human" | "system";
export interface TransitionArtifacts {
    workPlan?: string;
    deliverable?: string;
    selfReview?: string;
    evidence?: string[];
    approvalRecord?: string;
    assigneeIds?: string[];
}
export interface ValidationResult {
    valid: boolean;
    error?: string;
}
export declare function validateTransition(from: TaskStatus, to: TaskStatus, actor: TransitionActor, artifacts?: TransitionArtifacts): ValidationResult;
//# sourceMappingURL=stateMachine.d.ts.map