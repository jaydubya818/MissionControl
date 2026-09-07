import { computeCanonicalHash } from "./genomeHash";

const ATTEMPT_LOCAL_FIELDS = [
  "_id", "_creationTime", "lease", "completedAt", "failureReason", "failureClass", "failureCode",
  "failureStage", "retryable", "retryDecision", "executionPhase", "verificationSubject", "candidateReadyAt",
  "executionBaseSha", "headSha", "treeSha", "pullRequestNumber", "pullRequestId", "pullRequestProviderId",
  "pullRequestUrl", "pullRequestDraftAtPublication", "publishedAt", "factoryContinuation", "returnHandoff",
  "executorInvocationId", "primaryTraceId", "sandboxAllocationId", "sandboxResultDigest", "sandboxTeardownVerifiedAt",
  "executionCostAuthorization", "spentUsd", "reservedCostUsd", "executionCheckpoint", "executionQuarantine",
  "cancellationRequestedAt", "cancellationRequestedBy", "executionClaimId", "executionClaimedBy",
  "executionClaimedAt", "executionLeaseExpiresAt", "executionHeartbeatAt", "executionAttemptNumber",
  "executionStaleRecoveryCount", "executionRetryOfClaimId", "executionRetryReason", "executionBindingDigest",
  "verificationAttemptBinding", "verificationIsolationAttestation", "routingDecisionId", "routingDecisionDigest",
  "executionRoutingSnapshot", "evidenceState", "humanInterventions",
] as const;

export function buildLocalCandidateRecoveryRows(input: {
  failedAttempt: any;
  recoveryRunId: string;
  requestedAt: number;
  actorId: string;
  reason: string;
  previousLease: {
    leaseId: string;
    workerId: string;
    workerSessionId: string;
    workerGeneration: number;
  };
  sourceCandidate: { candidateSha: string; treeSha: string; sourceRevision: string };
  structuredResult: unknown;
  structuredResultArtifactId: string;
  structuredResultContentHash: string;
  structuredResultClaimLeaseId: string;
  structuredResultClaimWorkerId: string;
  structuredResultClaimWorkerSessionId: string;
  structuredResultClaimWorkerGeneration: number;
}) {
  const recoveryManifest = {
    ...input.failedAttempt.executionManifest,
    causation: {
      ...input.failedAttempt.executionManifest.causation,
      workflowRunId: input.recoveryRunId,
    },
  };
  const recoveryAttempt: any = { ...input.failedAttempt };
  for (const key of ATTEMPT_LOCAL_FIELDS) delete recoveryAttempt[key];
  Object.assign(recoveryAttempt, {
    runId: input.recoveryRunId,
    executionManifest: recoveryManifest,
    executionManifestDigest: `sha256:${computeCanonicalHash(recoveryManifest)}`,
    status: "PENDING",
    currentStepIndex: 0,
    totalSteps: 1,
    steps: [{
      stepId: "candidate-attestation",
      status: "PENDING",
      kind: "GATE",
      isolation: "READ_ONLY",
      failurePolicy: "BLOCK",
      retryCount: 0,
    }],
    context: { source: "local-candidate-recovery", recoverySourceAttemptId: input.failedAttempt._id },
    initialInput: `Attest the exact unpublished candidate from failed Attempt ${input.failedAttempt.runId}.`,
    checkpointSummary: "Exact failed-publication candidate is awaiting local attestation without executor replay.",
    checkpointAt: input.requestedAt,
    runtimeDisposition: "RECOVERABLE",
    runtimeDispositionReason: input.reason,
    runtimeReconciledAt: input.requestedAt,
    startedAt: input.requestedAt,
    metadata: {
      localCandidateRecovery: {
        sourceAttemptId: input.failedAttempt._id,
        sourceExecutionManifestDigest: input.failedAttempt.executionManifestDigest,
        sourceCandidateSha: input.sourceCandidate.candidateSha,
        sourceTreeSha: input.sourceCandidate.treeSha,
        sourceRevision: input.sourceCandidate.sourceRevision,
        structuredResult: input.structuredResult,
        structuredResultArtifactId: input.structuredResultArtifactId,
        structuredResultContentHash: input.structuredResultContentHash,
        structuredResultClaimLeaseId: input.structuredResultClaimLeaseId,
        structuredResultClaimWorkerId: input.structuredResultClaimWorkerId,
        structuredResultClaimWorkerSessionId: input.structuredResultClaimWorkerSessionId,
        structuredResultClaimWorkerGeneration: input.structuredResultClaimWorkerGeneration,
        requestedAt: input.requestedAt,
        requestedBy: input.actorId,
        reason: input.reason,
        previousLease: input.previousLease,
      },
    },
  });
  return {
    recoveryAttempt,
    sourcePatch: {
      retryDecision: {
        allowed: true,
        reason: input.reason,
        evaluatedAt: input.requestedAt,
        sourceAttemptId: String(input.failedAttempt._id),
      },
    },
  };
}
