/**
 * Task State Transitions
 * 
 * Defines all valid transitions between task states.
 * States are UPPERCASE to match Convex schema (source of truth).
 */

import { TaskStatus, TransitionActor } from "@mission-control/shared";

export interface TransitionRule {
  from: TaskStatus;
  to: TaskStatus;
  allowedActors: TransitionActor[];
  requiresArtifacts?: string[];
  description: string;
}

/**
 * Complete transition matrix
 * 
 * This is the canonical source of truth for valid transitions.
 */
export const TRANSITION_RULES: TransitionRule[] = [
  // FROM: INBOX
  {
    from: "INBOX",
    to: "ASSIGNED",
    allowedActors: ["agent", "human", "system"],
    requiresArtifacts: ["assigneeIds"],
    description: "Assign task to agent(s)",
  },
  {
    from: "INBOX",
    to: "NEEDS_APPROVAL",
    allowedActors: ["system"],
    description: "System requires approval before starting",
  },
  {
    from: "INBOX",
    to: "BLOCKED",
    allowedActors: ["system", "human"],
    description: "Block task before assignment",
  },
  {
    from: "INBOX",
    to: "CANCELED",
    allowedActors: ["human"],
    description: "Cancel task before assignment",
  },

  // FROM: ASSIGNED
  {
    from: "ASSIGNED",
    to: "IN_PROGRESS",
    allowedActors: ["agent", "human"],
    requiresArtifacts: ["workPlan"],
    description: "Agent starts working on task",
  },
  {
    from: "ASSIGNED",
    to: "NEEDS_APPROVAL",
    allowedActors: ["system"],
    description: "System requires approval before starting",
  },
  {
    from: "ASSIGNED",
    to: "BLOCKED",
    allowedActors: ["system", "human"],
    description: "Block assigned task",
  },
  {
    from: "ASSIGNED",
    to: "CANCELED",
    allowedActors: ["human"],
    description: "Cancel assigned task",
  },
  {
    from: "ASSIGNED",
    to: "INBOX",
    allowedActors: ["human"],
    description: "Unassign task (human only)",
  },

  // FROM: IN_PROGRESS
  {
    from: "IN_PROGRESS",
    to: "REVIEW",
    allowedActors: ["agent", "human"],
    requiresArtifacts: ["deliverable", "selfReview"],
    description: "Agent submits work for review",
  },
  {
    from: "IN_PROGRESS",
    to: "NEEDS_APPROVAL",
    allowedActors: ["system"],
    description: "System requires approval during execution",
  },
  {
    from: "IN_PROGRESS",
    to: "BLOCKED",
    allowedActors: ["system", "human"],
    description: "Block task during execution",
  },
  {
    from: "IN_PROGRESS",
    to: "FAILED",
    allowedActors: ["system", "agent"],
    description: "Task failed unrecoverably during execution",
  },
  {
    from: "IN_PROGRESS",
    to: "CANCELED",
    allowedActors: ["human"],
    description: "Cancel task during execution",
  },
  {
    from: "IN_PROGRESS",
    to: "ASSIGNED",
    allowedActors: ["human"],
    description: "Revert to assigned (human only)",
  },

  // FROM: REVIEW
  {
    from: "REVIEW",
    to: "IN_PROGRESS",
    allowedActors: ["agent", "human"],
    description: "Request revisions",
  },
  {
    from: "REVIEW",
    to: "DONE",
    allowedActors: ["human"],
    requiresArtifacts: ["approvalRecord"],
    description: "Approve and complete task (human only)",
  },
  {
    from: "REVIEW",
    to: "NEEDS_APPROVAL",
    allowedActors: ["system", "human"],
    description: "Require additional approval",
  },
  {
    from: "REVIEW",
    to: "BLOCKED",
    allowedActors: ["system", "human"],
    description: "Block task during review",
  },
  {
    from: "REVIEW",
    to: "FAILED",
    allowedActors: ["system"],
    description: "Task failed during review",
  },
  {
    from: "REVIEW",
    to: "CANCELED",
    allowedActors: ["human"],
    description: "Cancel task during review",
  },
  {
    from: "REVIEW",
    to: "ASSIGNED",
    allowedActors: ["human"],
    description: "Reassign task (human only)",
  },

  // FROM: NEEDS_APPROVAL
  {
    from: "NEEDS_APPROVAL",
    to: "BLOCKED",
    allowedActors: ["system", "human"],
    description: "Block while awaiting approval",
  },
  {
    from: "NEEDS_APPROVAL",
    to: "ASSIGNED",
    allowedActors: ["human"],
    description: "Approve and assign (human only)",
  },
  {
    from: "NEEDS_APPROVAL",
    to: "IN_PROGRESS",
    allowedActors: ["human"],
    description: "Approve and continue (human only)",
  },
  {
    from: "NEEDS_APPROVAL",
    to: "REVIEW",
    allowedActors: ["human"],
    description: "Approve and move to review (human only)",
  },
  {
    from: "NEEDS_APPROVAL",
    to: "DONE",
    allowedActors: ["human"],
    requiresArtifacts: ["approvalRecord"],
    description: "Approve and complete (human only)",
  },
  {
    from: "NEEDS_APPROVAL",
    to: "FAILED",
    allowedActors: ["system", "human"],
    description: "Denied approval leads to failure",
  },
  {
    from: "NEEDS_APPROVAL",
    to: "CANCELED",
    allowedActors: ["human"],
    description: "Deny approval and cancel",
  },

  // FROM: BLOCKED
  {
    from: "BLOCKED",
    to: "ASSIGNED",
    allowedActors: ["human"],
    description: "Unblock and assign (human only)",
  },
  {
    from: "BLOCKED",
    to: "IN_PROGRESS",
    allowedActors: ["human"],
    description: "Unblock and continue (human only)",
  },
  {
    from: "BLOCKED",
    to: "NEEDS_APPROVAL",
    allowedActors: ["human", "system"],
    description: "Require approval to unblock",
  },
  {
    from: "BLOCKED",
    to: "FAILED",
    allowedActors: ["human", "system"],
    description: "Blocked task determined unrecoverable",
  },
  {
    from: "BLOCKED",
    to: "CANCELED",
    allowedActors: ["human"],
    description: "Cancel blocked task",
  },

  // FROM: FAILED (terminal, but reopenable by human)
  {
    from: "FAILED",
    to: "INBOX",
    allowedActors: ["human"],
    description: "Reopen failed task for retry (human only)",
  },
  {
    from: "FAILED",
    to: "CANCELED",
    allowedActors: ["human"],
    description: "Cancel a failed task",
  },

  // FROM: DONE (terminal, but reopenable by human)
  {
    from: "DONE",
    to: "REVIEW",
    allowedActors: ["human"],
    description: "Reopen for review (human only)",
  },
  {
    from: "DONE",
    to: "CANCELED",
    allowedActors: ["human"],
    description: "Mark as canceled (incorrect close)",
  },

  // FROM: CANCELED
  // No transitions from canceled (terminal state)
];

/**
 * Get valid transitions from a given status
 */
export function getValidTransitions(from: TaskStatus): TransitionRule[] {
  return TRANSITION_RULES.filter((rule) => rule.from === from);
}

/**
 * Find a specific transition rule
 */
export function findTransitionRule(
  from: TaskStatus,
  to: TaskStatus
): TransitionRule | undefined {
  return TRANSITION_RULES.find(
    (rule) => rule.from === from && rule.to === to
  );
}

/**
 * Check if a transition is valid (ignoring actor and artifacts)
 */
export function isValidTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITION_RULES.some(
    (rule) => rule.from === from && rule.to === to
  );
}
