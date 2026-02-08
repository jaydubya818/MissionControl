/**
 * Task State Definitions
 * 
 * Defines all valid task states and their properties.
 * States are UPPERCASE to match Convex schema (source of truth).
 */

import { TaskStatus, TransitionActor } from "@mission-control/shared";

export interface StateDefinition {
  status: TaskStatus;
  description: string;
  terminal: boolean;
  requiresArtifacts?: string[];
}

export const STATE_DEFINITIONS: Record<TaskStatus, StateDefinition> = {
  INBOX: {
    status: "INBOX",
    description: "New task, not assigned",
    terminal: false,
  },
  ASSIGNED: {
    status: "ASSIGNED",
    description: "Assigned to agent(s), not started",
    terminal: false,
  },
  IN_PROGRESS: {
    status: "IN_PROGRESS",
    description: "Agent actively working",
    terminal: false,
    requiresArtifacts: ["workPlan", "assigneeIds"],
  },
  REVIEW: {
    status: "REVIEW",
    description: "Agent submitted for review",
    terminal: false,
    requiresArtifacts: ["deliverable", "selfReview"],
  },
  NEEDS_APPROVAL: {
    status: "NEEDS_APPROVAL",
    description: "Waiting for human approval",
    terminal: false,
  },
  BLOCKED: {
    status: "BLOCKED",
    description: "Cannot proceed (budget/loop/failure)",
    terminal: false,
  },
  FAILED: {
    status: "FAILED",
    description: "Unrecoverable failure",
    terminal: true,
  },
  DONE: {
    status: "DONE",
    description: "Completed and approved",
    terminal: true,
    requiresArtifacts: ["deliverable", "approvalRecord"],
  },
  CANCELED: {
    status: "CANCELED",
    description: "Abandoned",
    terminal: true,
  },
};

/**
 * Check if a status is terminal (done, canceled, or failed)
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
