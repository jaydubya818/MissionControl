import { describe, expect, it } from "vitest";
import { buildLocalCandidateRecoveryRows } from "../lib/localCandidateRecovery";

describe("local candidate recovery Attempt lineage", () => {
  it("preserves the terminal source and creates a fresh linked Attempt-local identity", () => {
    const failedAttempt: any = {
      _id: "source-attempt",
      _creationTime: 1,
      runId: "source-run",
      status: "FAILED",
      completedAt: 2,
      failureReason: "GitHub App runtime credentials are not configured.",
      executorInvocationId: "source-invocation",
      primaryTraceId: "source-trace",
      executionClaimId: "source-claim",
      executionClaimedAt: 1,
      cancellationRequestedAt: 2,
      spentUsd: 4,
      reservedCostUsd: 5,
      executionCostAuthorization: { source: true },
      executionManifestDigest: `sha256:${"a".repeat(64)}`,
      executionManifest: { causation: { workflowRunId: "source-run" }, repository: { baseSha: "b".repeat(40) } },
      workflowId: "factory",
      currentStepIndex: 1,
      totalSteps: 2,
      steps: [],
      context: { stale: true },
      initialInput: "source",
      startedAt: 1,
    };
    const sourceBefore = structuredClone(failedAttempt);
    const { recoveryAttempt, sourcePatch } = buildLocalCandidateRecoveryRows({
      failedAttempt,
      recoveryRunId: "recovery-run",
      requestedAt: 10,
      actorId: "operator",
      reason: "Recover exact publication candidate.",
      previousLease: { leaseId: "lease-1", workerId: "worker-1", workerSessionId: "session-1", workerGeneration: 1 },
      sourceCandidate: { candidateSha: "c".repeat(40), treeSha: "d".repeat(40), sourceRevision: "b".repeat(40) },
    });
    expect(failedAttempt).toEqual(sourceBefore);
    expect({ ...failedAttempt, ...sourcePatch }).toMatchObject({
      status: "FAILED",
      completedAt: 2,
      failureReason: "GitHub App runtime credentials are not configured.",
    });
    expect(recoveryAttempt).toMatchObject({
      runId: "recovery-run",
      status: "PENDING",
      context: { source: "local-candidate-recovery", recoverySourceAttemptId: "source-attempt" },
      metadata: { localCandidateRecovery: {
        sourceAttemptId: "source-attempt",
        sourceExecutionManifestDigest: `sha256:${"a".repeat(64)}`,
        sourceCandidateSha: "c".repeat(40),
        sourceTreeSha: "d".repeat(40),
        sourceRevision: "b".repeat(40),
      } },
    });
    for (const field of ["_id", "completedAt", "failureReason", "executorInvocationId", "primaryTraceId", "executionClaimId", "executionClaimedAt", "cancellationRequestedAt", "spentUsd", "reservedCostUsd", "executionCostAuthorization"]) {
      expect(recoveryAttempt, field).not.toHaveProperty(field);
    }
  });
});
