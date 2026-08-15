export const DEFAULT_WORKFLOW_EXECUTION_POLICY = {
  continuousSchedulingEnabled: false,
  dailyBudgetUsd: 25,
  perRunBudgetUsd: 5,
  maxConcurrentRuns: 1,
  leaseDurationMs: 60_000,
  staleRecoveryLimit: 1,
} as const;

export type WorkspaceExecutionMode =
  | "NORMAL"
  | "PAUSED"
  | "DRAINING"
  | "KILLED"
  | "QUARANTINED";

export type WorkflowDispatchMode = "MANUAL" | "SCHEDULED";

export interface WorkflowExecutionPolicy {
  continuousSchedulingEnabled: boolean;
  dailyBudgetUsd: number;
  perRunBudgetUsd: number;
  maxConcurrentRuns: number;
  leaseDurationMs: number;
  staleRecoveryLimit: number;
}

export interface WorkflowExecutionLease {
  leaseId: string;
  ownerId: string;
  claimedAt: number;
  heartbeatAt: number;
  expiresAt: number;
}

export function validateWorkflowExecutionPolicy(
  policy: WorkflowExecutionPolicy,
): WorkflowExecutionPolicy {
  if (!Number.isFinite(policy.dailyBudgetUsd) || policy.dailyBudgetUsd < 0) {
    throw new Error("Daily workflow budget must be a non-negative number.");
  }
  if (!Number.isFinite(policy.perRunBudgetUsd) || policy.perRunBudgetUsd < 0) {
    throw new Error("Per-run workflow budget must be a non-negative number.");
  }
  if (!Number.isSafeInteger(policy.maxConcurrentRuns) || policy.maxConcurrentRuns < 1) {
    throw new Error("Workflow concurrency must be a positive integer.");
  }
  if (!Number.isSafeInteger(policy.leaseDurationMs)
    || policy.leaseDurationMs < 15_000
    || policy.leaseDurationMs > 120_000) {
    throw new Error("Workflow lease duration must be between 15 and 120 seconds.");
  }
  if (!Number.isSafeInteger(policy.staleRecoveryLimit) || policy.staleRecoveryLimit < 0) {
    throw new Error("Stale recovery limit must be a non-negative integer.");
  }
  return policy;
}

export function effectiveWorkflowExecutionPolicy(input?: Partial<WorkflowExecutionPolicy>) {
  return validateWorkflowExecutionPolicy({
    ...DEFAULT_WORKFLOW_EXECUTION_POLICY,
    ...input,
  });
}

export function effectiveStepTimeoutMs(
  timeoutMinutes: number,
  operationalCeilingMs: number,
) {
  const workflowTimeoutMs = timeoutMinutes * 60 * 1_000;
  if (!Number.isFinite(workflowTimeoutMs) || workflowTimeoutMs <= 0) {
    throw new Error("Workflow step timeout must be positive.");
  }
  if (!Number.isFinite(operationalCeilingMs) || operationalCeilingMs <= 0) {
    throw new Error("Operational timeout ceiling must be positive.");
  }
  return Math.min(workflowTimeoutMs, operationalCeilingMs);
}

export function workflowLeaseMatches(input: {
  lease?: WorkflowExecutionLease;
  leaseId?: string;
  ownerId?: string;
  now: number;
}) {
  return Boolean(
    input.lease
    && input.leaseId
    && input.lease.leaseId === input.leaseId
    && (!input.ownerId || input.lease.ownerId === input.ownerId)
    && input.lease.expiresAt > input.now
  );
}

export function evaluateWorkflowClaim(input: {
  mode: WorkspaceExecutionMode;
  policy: WorkflowExecutionPolicy;
  dispatchMode: WorkflowDispatchMode;
  runStatus: string;
  cancellationRequested: boolean;
  quarantined: boolean;
  existingLease?: WorkflowExecutionLease;
  hasRecoveryCheckpoint: boolean;
  staleRecoveryCount: number;
  activeLeaseCount: number;
  dailyCommittedUsd: number;
  runSpentUsd: number;
  estimatedCostUsd: number;
  now: number;
}) {
  if (input.mode !== "NORMAL") {
    return { ok: false as const, reason: `workspace-${input.mode.toLowerCase()}` };
  }
  if (input.dispatchMode === "SCHEDULED" && !input.policy.continuousSchedulingEnabled) {
    return { ok: false as const, reason: "continuous-scheduling-disabled" };
  }
  if (!input.policy.continuousSchedulingEnabled && input.dispatchMode !== "MANUAL") {
    return { ok: false as const, reason: "manual-dispatch-required" };
  }
  if (!Number.isFinite(input.estimatedCostUsd) || input.estimatedCostUsd < 0) {
    return { ok: false as const, reason: "estimated-cost-invalid" };
  }
  if (!input.runStatus || !["PENDING", "RUNNING", "PAUSED"].includes(input.runStatus)) {
    return { ok: false as const, reason: "run-not-claimable" };
  }
  if (input.cancellationRequested) {
    return { ok: false as const, reason: "cancellation-requested" };
  }
  if (input.quarantined) {
    return { ok: false as const, reason: "run-quarantined" };
  }
  if (input.existingLease && input.existingLease.expiresAt > input.now) {
    return { ok: false as const, reason: "run-already-claimed" };
  }
  if (input.activeLeaseCount >= input.policy.maxConcurrentRuns) {
    return { ok: false as const, reason: "workspace-concurrency-exhausted" };
  }
  if (input.runSpentUsd + input.estimatedCostUsd > input.policy.perRunBudgetUsd) {
    return { ok: false as const, reason: "run-budget-exhausted" };
  }
  if (input.dailyCommittedUsd + input.estimatedCostUsd > input.policy.dailyBudgetUsd) {
    return { ok: false as const, reason: "workspace-budget-exhausted" };
  }

  const recovering = Boolean(input.existingLease);
  if (recovering && !input.hasRecoveryCheckpoint) {
    return {
      ok: false as const,
      reason: "recovery-checkpoint-missing",
      quarantine: true as const,
      staleRecoveryCount: input.staleRecoveryCount + 1,
    };
  }
  const staleRecoveryCount = recovering
    ? input.staleRecoveryCount + 1
    : input.staleRecoveryCount;
  if (recovering && staleRecoveryCount > input.policy.staleRecoveryLimit) {
    return {
      ok: false as const,
      reason: "stale-recovery-limit-exceeded",
      quarantine: true as const,
      staleRecoveryCount,
    };
  }
  return { ok: true as const, recovering, staleRecoveryCount };
}

export type WorkflowHeartbeatDirective =
  | "CONTINUE"
  | "PAUSE"
  | "DRAIN"
  | "KILL"
  | "BUDGET_STOP"
  | "QUARANTINE";

export function workflowHeartbeatDirective(input: {
  mode: WorkspaceExecutionMode;
  quarantined: boolean;
  cancellationRequested: boolean;
  runSpentUsd: number;
  runBudgetUsd: number;
  dailyCommittedUsd: number;
  dailyBudgetUsd: number;
}): WorkflowHeartbeatDirective {
  if (input.quarantined || input.mode === "QUARANTINED") return "QUARANTINE";
  if (input.cancellationRequested || input.mode === "KILLED") return "KILL";
  if (input.mode === "PAUSED") return "PAUSE";
  if (input.runSpentUsd >= input.runBudgetUsd || input.dailyCommittedUsd >= input.dailyBudgetUsd) {
    return "BUDGET_STOP";
  }
  if (input.mode === "DRAINING") return "DRAIN";
  return "CONTINUE";
}
