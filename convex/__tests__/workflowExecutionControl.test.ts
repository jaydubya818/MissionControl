import { describe, expect, it } from "vitest";
import {
  effectiveStepTimeoutMs,
  effectiveWorkflowExecutionPolicy,
  evaluateWorkflowClaim,
  workflowHeartbeatDirective,
  workflowLeaseMatches,
} from "../lib/workflowExecutionControl";

const policy = effectiveWorkflowExecutionPolicy({
  dailyBudgetUsd: 10,
  perRunBudgetUsd: 3,
  maxConcurrentRuns: 1,
  leaseDurationMs: 15_000,
  staleRecoveryLimit: 1,
});

const claim = {
  mode: "NORMAL" as const,
  policy,
  dispatchMode: "MANUAL" as const,
  runStatus: "PENDING",
  cancellationRequested: false,
  quarantined: false,
  hasRecoveryCheckpoint: false,
  staleRecoveryCount: 0,
  activeLeaseCount: 0,
  dailyCommittedUsd: 0,
  runSpentUsd: 0,
  estimatedCostUsd: 1,
  now: 1_000,
};

describe("workflow execution control", () => {
  it("uses the lower workflow or operational timeout", () => {
    expect(effectiveStepTimeoutMs(20, 60_000)).toBe(60_000);
    expect(effectiveStepTimeoutMs(1, 120_000)).toBe(60_000);
  });

  it("keeps continuous scheduling independently disabled", () => {
    expect(evaluateWorkflowClaim({ ...claim, dispatchMode: "SCHEDULED" }))
      .toMatchObject({ ok: false, reason: "continuous-scheduling-disabled" });
    expect(evaluateWorkflowClaim(claim)).toMatchObject({ ok: true, recovering: false });
  });

  it("denies pause, drain, kill, quarantine, concurrency, and budgets", () => {
    for (const mode of ["PAUSED", "DRAINING", "KILLED", "QUARANTINED"] as const) {
      expect(evaluateWorkflowClaim({ ...claim, mode }).ok).toBe(false);
    }
    expect(evaluateWorkflowClaim({ ...claim, activeLeaseCount: 1 }))
      .toMatchObject({ ok: false, reason: "workspace-concurrency-exhausted" });
    expect(evaluateWorkflowClaim({ ...claim, estimatedCostUsd: 4 }))
      .toMatchObject({ ok: false, reason: "run-budget-exhausted" });
    expect(evaluateWorkflowClaim({ ...claim, dailyCommittedUsd: 10 }))
      .toMatchObject({ ok: false, reason: "workspace-budget-exhausted" });
  });

  it("requires a checkpoint for one stale recovery then quarantines", () => {
    const existingLease = {
      leaseId: "lease-old",
      ownerId: "worker-old",
      claimedAt: 1,
      heartbeatAt: 1,
      expiresAt: 999,
    };
    expect(evaluateWorkflowClaim({ ...claim, runStatus: "RUNNING", existingLease }))
      .toMatchObject({ ok: false, reason: "recovery-checkpoint-missing", quarantine: true });
    expect(evaluateWorkflowClaim({
      ...claim,
      runStatus: "RUNNING",
      existingLease,
      hasRecoveryCheckpoint: true,
    })).toMatchObject({ ok: true, recovering: true, staleRecoveryCount: 1 });
    expect(evaluateWorkflowClaim({
      ...claim,
      runStatus: "RUNNING",
      existingLease,
      hasRecoveryCheckpoint: true,
      staleRecoveryCount: 1,
    })).toMatchObject({
      ok: false,
      reason: "stale-recovery-limit-exceeded",
      quarantine: true,
    });
  });

  it("fences leases and returns deterministic heartbeat directives", () => {
    const lease = {
      leaseId: "lease-1",
      ownerId: "worker-1",
      claimedAt: 1,
      heartbeatAt: 1,
      expiresAt: 2_000,
    };
    expect(workflowLeaseMatches({ lease, leaseId: "lease-1", ownerId: "worker-1", now: 1_999 })).toBe(true);
    expect(workflowLeaseMatches({ lease, leaseId: "wrong", ownerId: "worker-1", now: 1_999 })).toBe(false);
    expect(workflowLeaseMatches({ lease, leaseId: "lease-1", ownerId: "worker-1", now: 2_000 })).toBe(false);

    const base = {
      mode: "NORMAL" as const,
      quarantined: false,
      cancellationRequested: false,
      runSpentUsd: 0,
      runBudgetUsd: 3,
      dailyCommittedUsd: 0,
      dailyBudgetUsd: 10,
    };
    expect(workflowHeartbeatDirective(base)).toBe("CONTINUE");
    expect(workflowHeartbeatDirective({ ...base, mode: "PAUSED" })).toBe("PAUSE");
    expect(workflowHeartbeatDirective({ ...base, mode: "DRAINING" })).toBe("DRAIN");
    expect(workflowHeartbeatDirective({ ...base, mode: "KILLED" })).toBe("KILL");
    expect(workflowHeartbeatDirective({ ...base, runSpentUsd: 3 })).toBe("BUDGET_STOP");
    expect(workflowHeartbeatDirective({ ...base, quarantined: true })).toBe("QUARANTINE");
  });
});
