export const MIN_READ_ONLY_LEASE_MS = 15_000;
export const MAX_READ_ONLY_LEASE_MS = 120_000;
export const DEFAULT_STALE_RECOVERY_LIMIT = 1;

export type ReadOnlyQueueMode = "RUNNING" | "PAUSED" | "DRAINING" | "KILLED" | "QUARANTINED";

export interface ReadOnlyExecutionLease {
  claimId: string;
  ownerId: string;
  claimedAt: number;
  heartbeatAt: number;
  expiresAt: number;
  attemptNumber: number;
  staleRecoveryCount: number;
}

export function readOnlyCancellationAction(runStatus: string) {
  if (runStatus === "PENDING") return "CANCEL_IMMEDIATELY" as const;
  if (runStatus === "RUNNING") return "SIGNAL_ACTIVE_CLAIM" as const;
  return "REJECT_TERMINAL_RUN" as const;
}

export function readOnlyQueueMode(input: {
  definitionStatus: string;
  activeClaimCount: number;
  operatorMode?: "NORMAL" | "PAUSED" | "DRAINING" | "KILLED" | "QUARANTINED";
}): ReadOnlyQueueMode {
  if (input.operatorMode === "QUARANTINED") return "QUARANTINED";
  if (input.operatorMode === "PAUSED") return "PAUSED";
  if (input.operatorMode === "DRAINING") return "DRAINING";
  if (input.operatorMode === "KILLED") return "KILLED";
  if (input.definitionStatus === "ACTIVE") return "RUNNING";
  if (input.definitionStatus === "PAUSED") {
    return input.activeClaimCount > 0 ? "DRAINING" : "PAUSED";
  }
  if (input.definitionStatus === "SUSPENDED") return "QUARANTINED";
  return "KILLED";
}

export function evaluateReadOnlyExecutionClaim(input: {
  definitionStatus: string;
  operatorMode: "NORMAL" | "PAUSED" | "DRAINING" | "KILLED" | "QUARANTINED";
  definitionApproved: boolean;
  definitionValidated: boolean;
  isMutating: boolean;
  runStatus: string;
  cancellationRequested: boolean;
  claimId: string;
  ownerId: string;
  leaseDurationMs: number;
  maxDurationSeconds: number;
  now: number;
  existingLease?: ReadOnlyExecutionLease;
  currentAttemptNumber: number;
  staleRecoveryCount: number;
  staleRecoveryLimit?: number;
  maxRetries: number;
  activeClaimCount: number;
  concurrencyLimit: number;
  spentCostUsd: number;
  estimatedCostUsd: number;
  maxCostUsd: number;
  retryOfClaimId?: string;
  retryReason?: string;
}) {
  const mode = readOnlyQueueMode({
    definitionStatus: input.definitionStatus,
    activeClaimCount: input.activeClaimCount,
    operatorMode: input.operatorMode,
  });
  if (mode !== "RUNNING") {
    return { ok: false as const, reason: mode === "QUARANTINED" ? "queue-quarantined" : "queue-not-running", mode };
  }
  if (!input.definitionApproved || !input.definitionValidated) {
    return { ok: false as const, reason: "definition-not-governed" };
  }
  if (input.isMutating) return { ok: false as const, reason: "read-only-boundary-violated" };
  if (!input.claimId.trim() || !input.ownerId.trim()) {
    return { ok: false as const, reason: "claim-identity-invalid" };
  }
  if (!Number.isSafeInteger(input.leaseDurationMs)
    || input.leaseDurationMs < MIN_READ_ONLY_LEASE_MS
    || input.leaseDurationMs > MAX_READ_ONLY_LEASE_MS) {
    return { ok: false as const, reason: "lease-duration-invalid" };
  }
  if (!Number.isSafeInteger(input.maxDurationSeconds)
    || input.maxDurationSeconds < 1
    || input.maxDurationSeconds > 3_600) {
    return { ok: false as const, reason: "runtime-limit-invalid" };
  }
  if (!Number.isInteger(input.maxRetries) || input.maxRetries < 0) {
    return { ok: false as const, reason: "retry-limit-invalid" };
  }
  if (!Number.isInteger(input.concurrencyLimit) || input.concurrencyLimit < 1) {
    return { ok: false as const, reason: "concurrency-limit-invalid" };
  }
  if (![input.spentCostUsd, input.estimatedCostUsd, input.maxCostUsd].every((value) => Number.isFinite(value) && value >= 0)) {
    return { ok: false as const, reason: "budget-invalid" };
  }
  if (!["PENDING", "RUNNING"].includes(input.runStatus)) {
    return { ok: false as const, reason: "run-not-claimable" };
  }
  if (input.cancellationRequested) return { ok: false as const, reason: "cancellation-requested" };
  if (input.existingLease && input.existingLease.expiresAt > input.now) {
    return { ok: false as const, reason: "run-already-claimed" };
  }
  if (input.activeClaimCount >= input.concurrencyLimit) {
    return { ok: false as const, reason: "concurrency-limit-reached" };
  }
  if (input.spentCostUsd + input.estimatedCostUsd > input.maxCostUsd) {
    return { ok: false as const, reason: "budget-exhausted" };
  }

  const reclaiming = Boolean(input.existingLease);
  const staleRecoveryCount = reclaiming
    ? input.staleRecoveryCount + 1
    : input.staleRecoveryCount;
  const staleRecoveryLimit = input.staleRecoveryLimit ?? DEFAULT_STALE_RECOVERY_LIMIT;
  if (reclaiming && staleRecoveryCount > staleRecoveryLimit) {
    return {
      ok: false as const,
      reason: "stale-recovery-limit-exceeded",
      quarantine: true as const,
      staleRecoveryCount,
    };
  }

  const attemptNumber = reclaiming
    ? Math.max(1, input.currentAttemptNumber)
    : input.currentAttemptNumber + 1;
  const maxAttempts = input.maxRetries + 1;
  if (attemptNumber > maxAttempts) {
    return { ok: false as const, reason: "attempt-limit-exceeded", quarantine: true as const };
  }
  if (!reclaiming && input.currentAttemptNumber > 0) {
    if (!input.retryOfClaimId?.trim() || !input.retryReason?.trim()) {
      return { ok: false as const, reason: "retry-provenance-required" };
    }
  }

  return {
    ok: true as const,
    reclaimed: reclaiming,
    timeoutMs: input.maxDurationSeconds * 1_000,
    lease: {
      claimId: input.claimId,
      ownerId: input.ownerId,
      claimedAt: reclaiming ? input.existingLease!.claimedAt : input.now,
      heartbeatAt: input.now,
      expiresAt: input.now + input.leaseDurationMs,
      attemptNumber,
      staleRecoveryCount,
    },
  };
}

export function renewReadOnlyExecutionLease(input: {
  lease?: ReadOnlyExecutionLease;
  claimId: string;
  ownerId: string;
  leaseDurationMs: number;
  now: number;
}) {
  if (!input.lease || input.lease.claimId !== input.claimId || input.lease.ownerId !== input.ownerId) {
    return { ok: false as const, reason: "claim-mismatch" };
  }
  if (input.lease.expiresAt <= input.now) return { ok: false as const, reason: "claim-expired" };
  if (!Number.isSafeInteger(input.leaseDurationMs)
    || input.leaseDurationMs < MIN_READ_ONLY_LEASE_MS
    || input.leaseDurationMs > MAX_READ_ONLY_LEASE_MS) {
    return { ok: false as const, reason: "lease-duration-invalid" };
  }
  return {
    ok: true as const,
    lease: {
      ...input.lease,
      heartbeatAt: input.now,
      expiresAt: input.now + input.leaseDurationMs,
    },
  };
}

export function activeReadOnlyExecutionLeaseMatches(input: {
  lease?: ReadOnlyExecutionLease;
  claimId: string;
  ownerId: string;
  now: number;
}) {
  return Boolean(
    input.lease
    && input.lease.claimId === input.claimId
    && input.lease.ownerId === input.ownerId
    && input.lease.expiresAt > input.now
  );
}

export function readOnlyExecutionDisposition(input: {
  executionStatus: "passed" | "failed" | "timed_out" | "cancelled" | "infrastructure_error";
  attemptNumber: number;
  maxRetries: number;
  cancellationRequested: boolean;
  independentReceiptStatus?: "PASSED" | "FAILED" | "PENDING";
}) {
  if (input.executionStatus === "passed") {
    if (input.independentReceiptStatus === "PASSED") return "VERIFIED" as const;
    if (input.independentReceiptStatus === "FAILED") return "QUARANTINE" as const;
    return "AWAITING_VERIFICATION" as const;
  }
  if (input.executionStatus === "cancelled" || input.cancellationRequested) {
    return "CANCELED" as const;
  }
  if (input.attemptNumber <= input.maxRetries) return "RETRY" as const;
  return "FAILED" as const;
}

export function readOnlyTerminalProjection(
  disposition: "AWAITING_VERIFICATION" | "VERIFIED" | "CANCELED" | "FAILED" | "QUARANTINE",
) {
  if (disposition === "VERIFIED") {
    return {
      runStatus: "COMPLETED" as const,
      workOrderState: "DONE" as const,
      failureReason: undefined,
      requiredHumanAction: undefined,
    };
  }
  if (disposition === "AWAITING_VERIFICATION") {
    return {
      runStatus: "COMPLETED" as const,
      workOrderState: "AWAITING_VERIFICATION" as const,
      failureReason: undefined,
      requiredHumanAction: "Record an independent verification receipt.",
    };
  }
  if (disposition === "CANCELED") {
    return {
      runStatus: "CANCELED" as const,
      workOrderState: "CANCELED" as const,
      failureReason: undefined,
      requiredHumanAction: undefined,
    };
  }
  return {
    runStatus: "FAILED" as const,
    workOrderState: "BLOCKED" as const,
    failureReason: disposition === "QUARANTINE"
      ? "Read-only execution was quarantined."
      : "Read-only execution failed after its bounded attempts.",
    requiredHumanAction: disposition === "QUARANTINE"
      ? "Review the quarantine evidence before any reactivation."
      : "Review failure evidence before redispatch.",
  };
}
