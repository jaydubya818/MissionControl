/**
 * Task State Definitions
 * 
 * Defines all valid task states and their properties.
 */

import { TaskStatus, TransitionActor } from "@mission-control/shared";

export interface StateDefinition {
  status: TaskStatus;
  description: string;
  terminal: boolean;
  requiresArtifacts?: string[];
}

export const STATE_DEFINITIONS: Record<TaskStatus, StateDefinition> = {
  inbox: {
    status: "inbox",
    description: "New task, not assigned",
    terminal: false,
  },
  assigned: {
    status: "assigned",
    description: "Assigned to agent(s), not started",
    terminal: false,
  },
  in_progress: {
    status: "in_progress",
    description: "Agent actively working",
    terminal: false,
    requiresArtifacts: ["workPlan", "assigneeIds"],
  },
  review: {
    status: "review",
    description: "Agent submitted for review",
    terminal: false,
    requiresArtifacts: ["deliverable", "selfReview"],
  },
  needs_approval: {
    status: "needs_approval",
    description: "Waiting for human approval",
    terminal: false,
  },
  blocked: {
    status: "blocked",
    description: "Cannot proceed (budget/loop/failure)",
    terminal: false,
  },
  done: {
    status: "done",
    description: "Completed and approved",
    terminal: true,
    requiresArtifacts: ["deliverable", "approvalRecord"],
  },
  canceled: {
    status: "canceled",
    description: "Abandoned",
    terminal: true,
  },
};

/**
 * Check if a status is terminal (done or canceled)
 */
export function isTerminalStatus(status: TaskStatus): boolean {
  return STATE_DEFINITIONS[status].terminal;
}

/**
 * Get required artifacts for a status
 */
export function getRequiredArtifacts(status: TaskStatus): string[] {
  return STATE_DEFINITIONS[status].requiresArtifacts || [];
}
