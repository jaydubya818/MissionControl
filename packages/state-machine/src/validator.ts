/**
 * State Machine Validator
 * 
 * Validates task state transitions according to the deterministic state machine rules.
 */

import { TaskStatus, TransitionActor } from "@mission-control/shared";
import { findTransitionRule, isValidTransition, TRANSITION_RULES } from "./transitions";
import { getRequiredArtifacts, isTerminalStatus } from "./states";

export interface ValidationResult {
  valid: boolean;
  error?: string;
  warning?: string;
}

export interface TransitionContext {
  from: TaskStatus;
  to: TaskStatus;
  actor: TransitionActor;
  artifacts?: {
    workPlan?: string;
    deliverable?: string;
    selfReview?: string;
    evidence?: string[];
    approvalRecord?: string;
    assigneeIds?: string[];
  };
}

/**
 * Validate a task state transition
 * 
 * This is the core validation function that enforces the state machine rules.
 */
export function validateTransition(context: TransitionContext): ValidationResult {
  const { from, to, actor, artifacts = {} } = context;

  // Check 1: Transition exists in the rules
  if (!isValidTransition(from, to)) {
    return {
      valid: false,
      error: `Invalid transition: ${from} → ${to}. This transition is not allowed.`,
    };
  }

  // Check 2: Actor has permission
  const rule = findTransitionRule(from, to);
  if (!rule) {
    return {
      valid: false,
      error: `Internal error: transition rule not found for ${from} → ${to}`,
    };
  }

  if (!rule.allowedActors.includes(actor)) {
    return {
      valid: false,
      error: `Actor '${actor}' is not allowed to perform transition ${from} → ${to}. Allowed actors: ${rule.allowedActors.join(", ")}`,
    };
  }

  // Check 3: Required artifacts are provided
  const requiredArtifacts = rule.requiresArtifacts || [];
  const missingArtifacts = requiredArtifacts.filter((artifact) => {
    const value = artifacts[artifact as keyof typeof artifacts];
    if (artifact === "assigneeIds") {
      return !value || (Array.isArray(value) && value.length === 0);
    }
    return !value;
  });

  if (missingArtifacts.length > 0) {
    return {
      valid: false,
      error: `Missing required artifacts for ${from} → ${to}: ${missingArtifacts.join(", ")}`,
    };
  }

  // Check 4: Warn if transitioning from terminal state
  if (isTerminalStatus(from)) {
    return {
      valid: true,
      warning: `Transitioning from terminal state ${from}. This should be rare.`,
    };
  }

  // All checks passed
  return { valid: true };
}

/**
 * Validate multiple transitions (e.g., for bulk operations)
 */
export function validateTransitions(
  contexts: TransitionContext[]
): ValidationResult[] {
  return contexts.map(validateTransition);
}

/**
 * Check if actor can perform any transition from current status
 */
export function canActorTransition(
  from: TaskStatus,
  actor: TransitionActor
): boolean {
  return TRANSITION_RULES.some(
    (rule) => rule.from === from && rule.allowedActors.includes(actor)
  );
}

/**
 * Get all valid next statuses for a given status and actor
 */
export function getValidNextStatuses(
  from: TaskStatus,
  actor: TransitionActor
): TaskStatus[] {
  return TRANSITION_RULES
    .filter(
      (rule) =>
        rule.from === from && rule.allowedActors.includes(actor)
    )
    .map((rule) => rule.to);
}

/**
 * Explain why a transition is invalid
 */
export function explainTransition(
  from: TaskStatus,
  to: TaskStatus,
  actor: TransitionActor
): string {
  const result = validateTransition({ from, to, actor });
  
  if (result.valid) {
    const rule = findTransitionRule(from, to);
    return `Valid transition: ${rule?.description}`;
  }
  
  return result.error || "Unknown error";
}
