import { describe, expect, it, vi } from "vitest";
import { buildLocalCandidateRecoveryRows } from "../lib/localCandidateRecovery";
import { recoverLocalCandidate } from "../factory/attempts";
import { COMPANY_PERMISSIONS, requireWorkspaceAccess } from "../lib/companyAccess";

// This fixture isolates terminal return behavior after authenticated access;
// permission enforcement has separate company/delivery authorization tests.
vi.mock("../lib/companyAccess", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/companyAccess")>(),
  requireWorkspaceAccess: vi.fn(async () => ({ membership: { canManageCompany: true }, roleNames: ["owner"] })),
}));

describe("local candidate recovery Attempt lineage", () => {
  it.each(["FAILED", "CANCELED", "PENDING", "RUNNING", "COMPLETED"])("reports existing %s recovery without rewriting its terminal history", async (status) => {
    const source = { _id: "source-attempt", status: "FAILED" };
    const recovery = { _id: "recovery-attempt", status, metadata: { localCandidateRecovery: { sourceAttemptId: source._id } } };
    const workOrder = { _id: "work-order", projectId: "project", tenantId: "tenant" };
    const patch = vi.fn();
    const ctx = { db: { get: async (id: string) => id === workOrder._id ? workOrder : source,
      patch, query: () => ({ withIndex: () => ({ collect: async () => [source, recovery] }) }) } };
    const result = (recoverLocalCandidate as unknown as { _handler: (ctx: any, args: any) => Promise<any> })._handler(ctx, {
      workOrderId: workOrder._id, failedImplementationAttemptId: source._id, reason: "Inspect the exact synthetic candidate.",
    });
    if (["FAILED", "CANCELED"].includes(status)) await expect(result).rejects.toThrow(/terminal record is preserved/);
    else await expect(result).resolves.toEqual({ recovered: true, workflowRunId: recovery._id });
    expect(requireWorkspaceAccess).toHaveBeenCalledWith(ctx, "tenant", "project", { permission: COMPANY_PERMISSIONS.DISPATCH_WORK });
    expect(patch).not.toHaveBeenCalled();
    expect(recovery.status).toBe(status);
  });
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
      structuredResult: {
        schema: "factory-result/v1",
        status: "COMPLETED",
        summary: "Synthetic candidate complete.",
        completedAcceptanceCriterionIds: [],
        incompleteAcceptanceCriterionIds: [],
        unknownAcceptanceCriterionIds: [],
        verificationCommands: [],
        knownRisks: [],
        nextAction: "Publish for verification.",
      },
      structuredResultArtifactId: "result-artifact",
      structuredResultContentHash: `sha256:${"e".repeat(64)}`,
      structuredResultClaimLeaseId: "lease-1",
      structuredResultClaimWorkerId: "worker-1",
      structuredResultClaimWorkerSessionId: "session-1",
      structuredResultClaimWorkerGeneration: 1,
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
        structuredResult: expect.objectContaining({ schema: "factory-result/v1" }),
        structuredResultArtifactId: "result-artifact",
        structuredResultContentHash: `sha256:${"e".repeat(64)}`,
        structuredResultClaimLeaseId: "lease-1",
      } },
    });
    for (const field of ["_id", "completedAt", "failureReason", "executorInvocationId", "primaryTraceId", "executionClaimId", "executionClaimedAt", "cancellationRequestedAt", "spentUsd", "reservedCostUsd", "executionCostAuthorization"]) {
      expect(recoveryAttempt, field).not.toHaveProperty(field);
    }
  });
});
