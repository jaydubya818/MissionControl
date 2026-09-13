import { describe, expect, it } from "vitest";
import {
  buildWorkOrderProgress,
  classifyFactoryTerminalOutcome,
  compareVerificationHistory,
  evaluateFactoryDependency,
  factoryOperationalControlEffect,
  reconcileFactoryCrashPoint,
  summarizeFactoryRun,
} from "../lib/factoryLifecycle";

describe("factory lifecycle", () => {
  it("defaults governed dependencies to exact-revision acceptance", () => {
    const dependency = { workOrderId: "wo-2", dependsOnWorkOrderId: "wo-1", requiredRevisionNumber: 3 };
    expect(evaluateFactoryDependency({ dependency, predecessor: { _id: "wo-1", state: "AWAITING_VERIFICATION", currentRevisionNumber: 3 } }).satisfied).toBe(false);
    expect(evaluateFactoryDependency({ dependency, predecessor: { _id: "wo-1", state: "BLOCKED", currentRevisionNumber: 3 } }).satisfied).toBe(false);
    expect(evaluateFactoryDependency({ dependency, predecessor: { _id: "wo-1", state: "DONE", currentRevisionNumber: 3, acceptedRevisionNumber: 2 } }).satisfied).toBe(false);
    expect(evaluateFactoryDependency({ dependency, predecessor: { _id: "wo-1", state: "DONE", currentRevisionNumber: 3, acceptedRevisionNumber: 3 } }).satisfied).toBe(true);
  });

  it("keeps environment and factory failures separate from product failure", () => {
    expect(classifyFactoryTerminalOutcome({ terminal: true, failureOwner: "ENVIRONMENT" }).outcome).toBe("BLOCKED");
    expect(classifyFactoryTerminalOutcome({ terminal: true, failureOwner: "FACTORY" }).outcome).toBe("FACTORY_FAILED");
    expect(classifyFactoryTerminalOutcome({ terminal: true, failureOwner: "PRODUCT", failedChecks: 1 }).outcome).toBe("PRODUCT_FAILED");
    expect(classifyFactoryTerminalOutcome({ accepted: true }).outcome).toBe("ACCEPTED");
  });

  it("distinguishes pause, drain, stop, and selected cancellation", () => {
    expect(factoryOperationalControlEffect({ mode: "PAUSED", operation: "CLAIM" })).toMatchObject({ allow: false, abortActive: false });
    expect(factoryOperationalControlEffect({ mode: "PAUSED", operation: "ACTIVE_EXECUTION" })).toMatchObject({ allow: true, abortActive: false });
    expect(factoryOperationalControlEffect({ mode: "DRAINING", operation: "CLAIM" })).toMatchObject({ allow: false, abortActive: false });
    expect(factoryOperationalControlEffect({ mode: "DRAINING", operation: "ACTIVE_EXECUTION" })).toMatchObject({ allow: true, abortActive: false });
    expect(factoryOperationalControlEffect({ mode: "KILLED", operation: "ACTIVE_EXECUTION" })).toMatchObject({ allow: false, abortActive: true, durableCancellationRequired: true });
    expect(factoryOperationalControlEffect({ mode: "NORMAL", operation: "CANCEL_SELECTED" })).toMatchObject({ allow: true, abortActive: true, durableCancellationRequired: true });
  });

  it.each([
    ["LEASED_BEFORE_EXECUTOR", false, false, false, false, "STALE"],
    ["PRODUCER_RUNNING", false, false, false, false, "STALE"],
    ["CANDIDATE_CAPTURED_BEFORE_FINALIZATION", false, false, true, false, "RECOVERABLE"],
    ["VERIFIER_RUNNING", false, false, true, false, "RECOVERABLE"],
    ["VERDICT_PERSISTED_BEFORE_RECONCILIATION", false, false, true, true, "RECOVERABLE"],
    ["ACCEPTANCE_TRANSITION", false, false, true, true, "RECOVERABLE"],
  ] as const)("reconciles %s without rewriting history", (crashPoint, leaseLive, processLive, candidateCaptured, verdictPersisted, disposition) => {
    const result = reconcileFactoryCrashPoint({ crashPoint, leaseLive, processLive, candidateCaptured, verdictPersisted, accepted: false });
    expect(result.disposition).toBe(disposition);
    expect(result.preserveAttempt).toBe(true);
  });

  it("counts only explicit Factory Run members", () => {
    const members = [1, 2, 3].map((value) => ({ factoryRunId: "run-a", workOrderId: `wo-${value}`, workOrderRevisionNumber: 1, sourcePlanRevision: 1, sequence: value, addedAt: value }));
    const workOrders = [
      { _id: "wo-1", state: "DONE", currentRevisionNumber: 1, acceptedRevisionNumber: 1 },
      { _id: "wo-2", state: "READY", currentRevisionNumber: 1 },
      { _id: "wo-3", state: "READY", currentRevisionNumber: 1 },
      { _id: "legacy-a", state: "DONE", currentRevisionNumber: 1, acceptedRevisionNumber: 1 },
      { _id: "legacy-b", state: "BLOCKED", currentRevisionNumber: 1 },
      { _id: "legacy-c", state: "IN_PROGRESS", currentRevisionNumber: 1 },
    ];
    const summary = summarizeFactoryRun({ factoryRunId: "run-a", members, workOrders });
    expect(summary.counts).toEqual({ total: 3, accepted: 1, active: 0, blocked: 0, failed: 0 });
    expect(summary.memberWorkOrderIds).toEqual(["wo-1", "wo-2", "wo-3"]);
  });

  it("builds one progress model without conflating execution and verdict", () => {
    const progress = buildWorkOrderProgress({
      workOrder: { _id: "wo-1", title: "Foundation", state: "BLOCKED", currentRevisionNumber: 4, blockingIssue: "Dependency environment unavailable" },
      tasks: Array.from({ length: 15 }, (_, index) => ({ status: index < 13 ? "DONE" : index === 13 ? "BLOCKED" : "IN_PROGRESS" })),
      attempts: [{ _id: "producer", attemptPurpose: "IMPLEMENTATION", status: "COMPLETED", headSha: "abc", treeSha: "tree", workOrderRevisionNumber: 4 }],
      verificationRuns: [{ _id: "verification", workflowRunId: "verifier", sourceAttemptId: "producer", status: "COMPLETED", verdict: "NOT_VERIFIED", createdAt: 2, checks: [
        ...Array.from({ length: 5 }, () => ({ status: "PASS" })),
        { status: "TIMED_OUT" }, { status: "BLOCKED_BY_DEPENDENCY" }, { status: "BLOCKED_BY_DEPENDENCY" }, { status: "BLOCKED_BY_DEPENDENCY" },
      ] }],
      acceptance: { eligible: false, accepted: false, reasons: ["Dependency environment unavailable"] },
    });
    expect(progress.tasks).toEqual({ total: 15, accepted: 13, active: 1, blocked: 1, failed: 0 });
    expect(progress.attempt.executionStatus).toBe("COMPLETED");
    expect(progress.verification).toMatchObject({ verdict: "NOT_VERIFIED", verifiedChecks: 5, failedChecks: 0, blockedChecks: 4 });
    expect(progress.acceptance.eligible).toBe(false);
    expect(progress.progress.currentGate).toBe("VERIFICATION");
  });

  it("compares exact-candidate verifier retries without overwriting evidence", () => {
    const attempts = [
      { _id: "producer", executorInvocationId: "producer-invocation", executorAdapter: "codex", headSha: "abc", treeSha: "tree" },
      { _id: "verifier-1", executorInvocationId: "verify-one", executorAdapter: "codex" },
      { _id: "verifier-2", executorInvocationId: "verify-two", executorAdapter: "codex" },
    ];
    const verificationRuns = [
      { _id: "vr-1", workflowRunId: "verifier-1", sourceAttemptId: "producer", candidateRevision: "abc", status: "COMPLETED", verdict: "BLOCKED", createdAt: 1 },
      { _id: "vr-2", workflowRunId: "verifier-2", sourceAttemptId: "producer", candidateRevision: "abc", status: "COMPLETED", verdict: "VERIFIED", createdAt: 2 },
    ];
    const evidence = [
      { verificationRunId: "vr-1", checkId: "install", result: "TIMED_OUT", summary: "Timed out" },
      { verificationRunId: "vr-2", checkId: "install", result: "PASS", summary: "Passed" },
    ];
    const history = compareVerificationHistory({ attempts, verificationRuns, evidence });
    expect(history).toHaveLength(2);
    expect(history.map((row) => row.candidateCommit)).toEqual(["abc", "abc"]);
    expect(history.map((row) => row.verifierIdentity?.invocationId)).toEqual(["verify-two", "verify-one"]);
    expect(history[1].evidenceResults[0].result).toBe("TIMED_OUT");
  });
});
