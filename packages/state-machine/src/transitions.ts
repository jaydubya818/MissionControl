/**
 * Task State Transitions
 * 
 * Defines all valid transitions between task states.
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
    from: "inbox",
    to: "assigned",
    allowedActors: ["agent", "human", "system"],
    requiresArtifacts: ["assigneeIds"],
    description: "Assign task to agent(s)",
  },
  {
    from: "inbox",
    to: "needs_approval",
    allowedActors: ["system"],
    description: "System requires approval before starting",
  },
  {
    from: "inbox",
    to: "blocked",
    allowedActors: ["system", "human"],
    description: "Block task before assignment",
  },
  {
    from: "inbox",
    to: "canceled",
    allowedActors: ["human"],
    description: "Cancel task before assignment",
  },

  // FROM: ASSIGNED
  {
    from: "assigned",
    to: "in_progress",
    allowedActors: ["agent", "human"],
    requiresArtifacts: ["workPlan"],
    description: "Agent starts working on task",
  },
  {
    from: "assigned",
    to: "needs_approval",
    allowedActors: ["system"],
    description: "System requires approval before starting",
  },
  {
    from: "assigned",
    to: "blocked",
    allowedActors: ["system", "human"],
    description: "Block assigned task",
  },
  {
    from: "assigned",
    to: "canceled",
    allowedActors: ["human"],
    description: "Cancel assigned task",
  },
  {
    from: "assigned",
    to: "inbox",
    allowedActors: ["human"],
    description: "Unassign task (human only)",
  },

  // FROM: IN_PROGRESS
  {
    from: "in_progress",
    to: "review",
    allowedActors: ["agent", "human"],
    requiresArtifacts: ["deliverable", "selfReview"],
    description: "Agent submits work for review",
  },
  {
    from: "in_progress",
    to: "needs_approval",
    allowedActors: ["system"],
    description: "System requires approval during execution",
  },
  {
    from: "in_progress",
    to: "blocked",
    allowedActors: ["system", "human"],
    description: "Block task during execution",
  },
  {
    from: "in_progress",
    to: "canceled",
    allowedActors: ["human"],
    description: "Cancel task during execution",
  },
  {
    from: "in_progress",
    to: "assigned",
    allowedActors: ["human"],
    description: "Revert to assigned (human only)",
  },

  // FROM: REVIEW
  {
    from: "review",
    to: "in_progress",
    allowedActors: ["agent", "human"],
    description: "Request revisions",
  },
  {
    from: "review",
    to: "done",
    allowedActors: ["human"],
    requiresArtifacts: ["approvalRecord"],
    description: "Approve and complete task (human only)",
  },
  {
    from: "review",
    to: "needs_approval",
    allowedActors: ["system", "human"],
    description: "Require additional approval",
  },
  {
    from: "review",
    to: "blocked",
    allowedActors: ["system", "human"],
    description: "Block task during review",
  },
  {
    from: "review",
    to: "canceled",
    allowedActors: ["human"],
    description: "Cancel task during review",
  },
  {
    from: "review",
    to: "assigned",
    allowedActors: ["human"],
    description: "Reassign task (human only)",
  },

  // FROM: NEEDS_APPROVAL
  {
    from: "needs_approval",
    to: "blocked",
    allowedActors: ["system", "human"],
    description: "Block while awaiting approval",
  },
  {
    from: "needs_approval",
    to: "assigned",
    allowedActors: ["human"],
    description: "Approve and assign (human only)",
  },
  {
    from: "needs_approval",
    to: "in_progress",
    allowedActors: ["human"],
    description: "Approve and continue (human only)",
  },
  {
    from: "needs_approval",
    to: "review",
    allowedActors: ["human"],
    description: "Approve and move to review (human only)",
  },
  {
    from: "needs_approval",
    to: "done",
    allowedActors: ["human"],
    requiresArtifacts: ["approvalRecord"],
    description: "Approve and complete (human only)",
  },
  {
    from: "needs_approval",
    to: "canceled",
    allowedActors: ["human"],
    description: "Deny approval and cancel",
  },

  // FROM: BLOCKED
  {
    from: "blocked",
    to: "assigned",
    allowedActors: ["human"],
    description: "Unblock and assign (human only)",
  },
  {
    from: "blocked",
    to: "in_progress",
    allowedActors: ["human"],
    description: "Unblock and continue (human only)",
  },
  {
    from: "blocked",
    to: "needs_approval",
    allowedActors: ["human", "system"],
    description: "Require approval to unblock",
  },
  {
    from: "blocked",
    to: "canceled",
    allowedActors: ["human"],
    description: "Cancel blocked task",
  },

  // FROM: DONE
  {
    from: "done",
    to: "review",
    allowedActors: ["human"],
    description: "Reopen for review (human only)",
  },
  {
    from: "done",
    to: "canceled",
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
