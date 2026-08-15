import { describe, expect, it } from "vitest";
import {
  activeReadOnlyExecutionLeaseMatches,
  evaluateReadOnlyExecutionClaim,
  readOnlyCancellationAction,
  readOnlyExecutionDisposition,
  readOnlyQueueMode,
  readOnlyTerminalProjection,
  renewReadOnlyExecutionLease,
} from "../lib/readOnlyRunControl";

const claimInput = {
  definitionStatus: "ACTIVE",
  operatorMode: "NORMAL" as const,
  definitionApproved: true,
  definitionValidated: true,
  isMutating: false,
  runStatus: "PENDING",
  cancellationRequested: false,
  claimId: "claim-1",
  ownerId: "orchestration-1",
  leaseDurationMs: 60_000,
  maxDurationSeconds: 60,
  now: 1_000,
  currentAttemptNumber: 0,
  staleRecoveryCount: 0,
  maxRetries: 1,
  activeClaimCount: 0,
  concurrencyLimit: 1,
  spentCostUsd: 0,
  estimatedCostUsd: 0,
  maxCostUsd: 1,
};

describe("read-only workflow operational controls", () => {
  it("claims once and rejects a duplicate worker", () => {
    const first = evaluateReadOnlyExecutionClaim(claimInput);
    expect(first).toMatchObject({ ok: true, reclaimed: false, timeoutMs: 60_000, lease: { attemptNumber: 1 } });
    expect(evaluateReadOnlyExecutionClaim({
      ...claimInput,
      claimId: "claim-2",
      ownerId: "orchestration-2",
      now: 2_000,
      runStatus: "RUNNING",
      existingLease: first.ok ? first.lease : undefined,
    })).toMatchObject({ ok: false, reason: "run-already-claimed" });
  });

  it("renews only a matching, unexpired heartbeat", () => {
    const first = evaluateReadOnlyExecutionClaim(claimInput);
    if (!first.ok) throw new Error("claim failed");
    expect(renewReadOnlyExecutionLease({
      lease: first.lease,
      claimId: "wrong",
      ownerId: claimInput.ownerId,
      leaseDurationMs: 60_000,
      now: 20_000,
    })).toMatchObject({ ok: false, reason: "claim-mismatch" });
    const renewed = renewReadOnlyExecutionLease({
      lease: first.lease,
      claimId: claimInput.claimId,
      ownerId: claimInput.ownerId,
      leaseDurationMs: 60_000,
      now: 20_000,
    });
    expect(renewed.ok && activeReadOnlyExecutionLeaseMatches({
      lease: renewed.lease,
      claimId: claimInput.claimId,
      ownerId: claimInput.ownerId,
      now: 20_001,
    })).toBe(true);
  });

  it("models queue pause and drain without advertising in-process resume", () => {
    expect(readOnlyQueueMode({ definitionStatus: "ACTIVE", activeClaimCount: 0, operatorMode: "PAUSED" })).toBe("PAUSED");
    expect(readOnlyQueueMode({ definitionStatus: "ACTIVE", activeClaimCount: 1, operatorMode: "DRAINING" })).toBe("DRAINING");
    expect(evaluateReadOnlyExecutionClaim({ ...claimInput, operatorMode: "PAUSED" }))
      .toMatchObject({ ok: false, reason: "queue-not-running", mode: "PAUSED" });
    expect(evaluateReadOnlyExecutionClaim({ ...claimInput, operatorMode: "DRAINING" }))
      .toMatchObject({ ok: false, reason: "queue-not-running", mode: "DRAINING" });
    expect(evaluateReadOnlyExecutionClaim({ ...claimInput, operatorMode: "KILLED" }))
      .toMatchObject({ ok: false, reason: "queue-not-running", mode: "KILLED" });
    expect(evaluateReadOnlyExecutionClaim({ ...claimInput, operatorMode: "QUARANTINED" }))
      .toMatchObject({ ok: false, reason: "queue-quarantined", mode: "QUARANTINED" });
  });

  it("fails closed for cancellation, budget, and concurrency", () => {
    expect(evaluateReadOnlyExecutionClaim({ ...claimInput, cancellationRequested: true }))
      .toMatchObject({ ok: false, reason: "cancellation-requested" });
    expect(evaluateReadOnlyExecutionClaim({ ...claimInput, estimatedCostUsd: 1.01 }))
      .toMatchObject({ ok: false, reason: "budget-exhausted" });
    expect(evaluateReadOnlyExecutionClaim({ ...claimInput, activeClaimCount: 1 }))
      .toMatchObject({ ok: false, reason: "concurrency-limit-reached" });
    expect(evaluateReadOnlyExecutionClaim({ ...claimInput, maxDurationSeconds: 0 }))
      .toMatchObject({ ok: false, reason: "runtime-limit-invalid" });
  });

  it("cancels an unclaimed run immediately and signals only an active claim", () => {
    expect(readOnlyCancellationAction("PENDING")).toBe("CANCEL_IMMEDIATELY");
    expect(readOnlyCancellationAction("RUNNING")).toBe("SIGNAL_ACTIVE_CLAIM");
    expect(readOnlyCancellationAction("COMPLETED")).toBe("REJECT_TERMINAL_RUN");
  });

  it("requires reasoned bounded retry provenance", () => {
    expect(evaluateReadOnlyExecutionClaim({ ...claimInput, currentAttemptNumber: 1 }))
      .toMatchObject({ ok: false, reason: "retry-provenance-required" });
    expect(evaluateReadOnlyExecutionClaim({
      ...claimInput,
      currentAttemptNumber: 1,
      claimId: "claim-retry",
      retryOfClaimId: "claim-1",
      retryReason: "Transient provider timeout",
    })).toMatchObject({ ok: true, lease: { attemptNumber: 2 } });
    expect(evaluateReadOnlyExecutionClaim({
      ...claimInput,
      currentAttemptNumber: 2,
      claimId: "claim-too-many",
      retryOfClaimId: "claim-retry",
      retryReason: "Still failing",
    })).toMatchObject({ ok: false, reason: "attempt-limit-exceeded", quarantine: true });
  });

  it("reclaims one stale process against the same attempt then quarantines", () => {
    const first = evaluateReadOnlyExecutionClaim(claimInput);
    if (!first.ok) throw new Error("claim failed");
    const recovered = evaluateReadOnlyExecutionClaim({
      ...claimInput,
      runStatus: "RUNNING",
      claimId: "claim-recovered",
      ownerId: "orchestration-2",
      now: first.lease.expiresAt,
      currentAttemptNumber: 1,
      existingLease: first.lease,
    });
    expect(recovered).toMatchObject({
      ok: true,
      reclaimed: true,
      lease: { attemptNumber: 1, staleRecoveryCount: 1 },
    });
    if (!recovered.ok) throw new Error("recovery failed");
    expect(evaluateReadOnlyExecutionClaim({
      ...claimInput,
      runStatus: "RUNNING",
      claimId: "claim-third-worker",
      ownerId: "orchestration-3",
      now: recovered.lease.expiresAt,
      currentAttemptNumber: 1,
      staleRecoveryCount: 1,
      existingLease: recovered.lease,
    })).toMatchObject({
      ok: false,
      reason: "stale-recovery-limit-exceeded",
      quarantine: true,
      staleRecoveryCount: 2,
    });
  });

  it("keeps completion awaiting an independent verifier", () => {
    expect(readOnlyExecutionDisposition({
      executionStatus: "passed",
      attemptNumber: 1,
      maxRetries: 1,
      cancellationRequested: false,
    })).toBe("AWAITING_VERIFICATION");
    expect(readOnlyExecutionDisposition({
      executionStatus: "passed",
      attemptNumber: 1,
      maxRetries: 1,
      cancellationRequested: false,
      independentReceiptStatus: "PASSED",
    })).toBe("VERIFIED");
    expect(readOnlyExecutionDisposition({
      executionStatus: "passed",
      attemptNumber: 1,
      maxRetries: 1,
      cancellationRequested: false,
      independentReceiptStatus: "FAILED",
    })).toBe("QUARANTINE");
    expect(readOnlyExecutionDisposition({
      executionStatus: "failed",
      attemptNumber: 1,
      maxRetries: 1,
      cancellationRequested: false,
    })).toBe("RETRY");
    expect(readOnlyExecutionDisposition({
      executionStatus: "timed_out",
      attemptNumber: 2,
      maxRetries: 1,
      cancellationRequested: false,
    })).toBe("FAILED");
  });

  it("projects terminal execution evidence into durable run and WorkOrder states", () => {
    expect(readOnlyTerminalProjection("AWAITING_VERIFICATION")).toMatchObject({
      runStatus: "COMPLETED",
      workOrderState: "AWAITING_VERIFICATION",
    });
    expect(readOnlyTerminalProjection("VERIFIED")).toMatchObject({
      runStatus: "COMPLETED",
      workOrderState: "DONE",
    });
    expect(readOnlyTerminalProjection("CANCELED")).toMatchObject({
      runStatus: "CANCELED",
      workOrderState: "CANCELED",
    });
    expect(readOnlyTerminalProjection("FAILED")).toMatchObject({
      runStatus: "FAILED",
      workOrderState: "BLOCKED",
    });
    expect(readOnlyTerminalProjection("QUARANTINE")).toMatchObject({
      runStatus: "FAILED",
      workOrderState: "BLOCKED",
      requiredHumanAction: "Review the quarantine evidence before any reactivation.",
    });
  });

  it("proves the complete bounded canary sequence", () => {
    const first = evaluateReadOnlyExecutionClaim(claimInput);
    if (!first.ok) throw new Error("initial canary claim failed");
    const heartbeat = renewReadOnlyExecutionLease({
      lease: first.lease,
      claimId: first.lease.claimId,
      ownerId: first.lease.ownerId,
      leaseDurationMs: 60_000,
      now: 20_000,
    });
    if (!heartbeat.ok) throw new Error("canary heartbeat failed");
    expect(readOnlyExecutionDisposition({
      executionStatus: "timed_out",
      attemptNumber: heartbeat.lease.attemptNumber,
      maxRetries: 1,
      cancellationRequested: false,
    })).toBe("RETRY");
    const retry = evaluateReadOnlyExecutionClaim({
      ...claimInput,
      claimId: "claim-2",
      currentAttemptNumber: 1,
      now: 90_000,
      retryOfClaimId: "claim-1",
      retryReason: "Canary timeout retry",
    });
    if (!retry.ok) throw new Error("canary retry claim failed");
    expect(readOnlyExecutionDisposition({
      executionStatus: "passed",
      attemptNumber: retry.lease.attemptNumber,
      maxRetries: 1,
      cancellationRequested: false,
    })).toBe("AWAITING_VERIFICATION");
    expect(readOnlyExecutionDisposition({
      executionStatus: "passed",
      attemptNumber: retry.lease.attemptNumber,
      maxRetries: 1,
      cancellationRequested: false,
      independentReceiptStatus: "PASSED",
    })).toBe("VERIFIED");
  });
});
