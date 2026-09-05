import { verifyVerificationSubjectIdentity } from "@mission-control/workflow-engine/verification-subject";

export const MIN_FACTORY_LEASE_MS = 15_000;
export const MAX_FACTORY_LEASE_MS = 120_000;

/** Candidate evidence cannot choose an intermediate base that hides changes. */
export function frozenFactorySourceRevision(run: {
  executionManifest?: { repository?: { baseSha?: unknown } };
  executionBaseSha?: unknown;
}, reportedSourceRevision: unknown): string {
  const frozen = run.executionManifest?.repository?.baseSha;
  if (typeof frozen !== "string" || !/^[a-f0-9]{40,64}$/.test(frozen)
    || reportedSourceRevision !== frozen
    || (run.executionBaseSha !== undefined && run.executionBaseSha !== frozen)) {
    throw new Error("Candidate source revision must match the frozen execution manifest base.");
  }
  return frozen;
}

export interface AttemptLease {
  leaseId: string;
  ownerId: string;
  workerId?: string;
  workerSessionId?: string;
  workerGeneration?: number;
  claimedAt: number;
  heartbeatAt: number;
  expiresAt: number;
}

export interface FactoryAttemptWorkerIdentity {
  workerId: string;
  sessionId: string;
  generation: number;
}

export type FactoryAttemptDisposition = "RETRYABLE" | "LOST" | "CANCELLED" | "FAILED" | "RECOVERABLE";

export type FactoryExecutorProcessState = "NOT_STARTED" | "RUNNING" | "TERMINATED" | "UNKNOWN";

type PublicationArtifactLike = {
  artifactType?: string;
  externalLocation?: string;
  metadata?: Record<string, unknown>;
};

type FactoryWorkerRegistrationLike = {
  hostId?: string;
  workerRuntime?: {
    sessionId?: string;
    generation?: number;
  };
};

type FactoryPublicationPatch = {
  executionBaseSha?: string;
  headSha?: string;
  pullRequestNumber?: number;
  pullRequestUrl?: string;
  publishedAt?: number;
};

type VerificationAttemptBindingLike = {
  sourceAttemptId?: unknown;
  workOrderId?: unknown;
  workOrderRevisionNumber?: number;
  verificationContractDigest?: string;
  verificationSubjectDigest?: string;
  verificationSubject?: any;
};

type VerificationSourceAttemptLike = {
  executionManifest?: { repository?: { baseSha?: unknown } };
  executionBaseSha?: unknown;
  _id?: unknown;
  attemptPurpose?: string;
  status?: string;
  candidateReadyAt?: number;
  repositoryId?: unknown;
  workOrderId?: unknown;
  workOrderRevisionNumber?: number;
  verificationContractDigest?: string;
  branch?: string;
  headSha?: string;
  verificationSubject?: any;
};

export function factoryAttemptSourceBindingMatches(input: {
  attemptPurpose?: string;
  manifestBaseSha?: string;
  hostBaseCommit?: string;
  repositoryId?: unknown;
  workOrderId?: unknown;
  workOrderRevisionNumber?: number;
  verificationContractDigest?: string;
  branch?: string;
  verificationAttemptBinding?: VerificationAttemptBindingLike;
  verificationSourceAttempt?: VerificationSourceAttemptLike | null;
}) {
  if ((input.attemptPurpose ?? "IMPLEMENTATION") !== "VERIFICATION") {
    return Boolean(input.hostBaseCommit && input.manifestBaseSha === input.hostBaseCommit);
  }

  const binding = input.verificationAttemptBinding;
  const subject = binding?.verificationSubject;
  const source = input.verificationSourceAttempt;
  if (!binding || !subject || !source || subject.kind !== "GIT_CANDIDATE") return false;
  try { frozenFactorySourceRevision(source, source.executionBaseSha); } catch { return false; }

  const sourceAttemptId = String(binding.sourceAttemptId ?? "");
  const workOrderId = String(input.workOrderId ?? "");
  const repositoryId = String(input.repositoryId ?? "");
  return Boolean(
    verifyVerificationSubjectIdentity(subject)
    && sourceAttemptId
    && sourceAttemptId === String(subject.sourceAttemptId ?? "")
    && sourceAttemptId === String(source._id ?? "")
    && workOrderId
    && workOrderId === String(binding.workOrderId ?? "")
    && workOrderId === String(subject.workOrderId ?? "")
    && workOrderId === String(source.workOrderId ?? "")
    && repositoryId
    && repositoryId === String(subject.repositoryId ?? "")
    && repositoryId === String(source.repositoryId ?? "")
    && input.workOrderRevisionNumber === binding.workOrderRevisionNumber
    && input.workOrderRevisionNumber === subject.workOrderRevisionNumber
    && input.workOrderRevisionNumber === source.workOrderRevisionNumber
    && input.verificationContractDigest
    && input.verificationContractDigest === binding.verificationContractDigest
    && input.verificationContractDigest === subject.verificationContractDigest
    && input.verificationContractDigest === source.verificationContractDigest
    && binding.verificationSubjectDigest === subject.digest
    && source.verificationSubject?.digest === subject.digest
    && source.attemptPurpose === "IMPLEMENTATION"
    && source.status === "COMPLETED"
    && Number.isFinite(source.candidateReadyAt)
    && input.manifestBaseSha === subject.candidateSha
    && source.headSha === subject.candidateSha
    && subject.pullRequest?.headSha === subject.candidateSha
    && input.branch === source.branch
    && input.branch === subject.pullRequest?.headRef
  );
}

function gitRevision(value: unknown) {
  return typeof value === "string" && /^[a-f0-9]{40,64}$/i.test(value) ? value : undefined;
}

function httpUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function deriveFactoryPublicationLineage(input: {
  pullRequestArtifact?: PublicationArtifactLike | null;
  codeDiffArtifact?: PublicationArtifactLike | null;
  verifiedSourceRevision?: string;
  completedAt?: number;
  expectedRepositoryIdentity?: string;
}): { changedFiles: string[]; patch: FactoryPublicationPatch } {
  const pullRequest = input.pullRequestArtifact?.artifactType === "PULL_REQUEST"
    ? input.pullRequestArtifact
    : undefined;
  const codeDiff = input.codeDiffArtifact?.artifactType === "CODE_DIFF"
    ? input.codeDiffArtifact
    : undefined;
  const pullRequestMetadata = pullRequest?.metadata ?? {};
  const codeDiffMetadata = codeDiff?.metadata ?? {};
  const headSha = gitRevision(pullRequestMetadata.headSha) ?? gitRevision(codeDiffMetadata.headSha);
  const sourceRevision = gitRevision(pullRequestMetadata.sourceRevision)
    ?? gitRevision(codeDiffMetadata.sourceRevision)
    ?? gitRevision(input.verifiedSourceRevision);
  const pullRequestUrl = input.expectedRepositoryIdentity
    ? exactGithubPullRequest(
        pullRequest?.externalLocation ?? pullRequestMetadata.pullRequestUrl,
        input.expectedRepositoryIdentity,
      )?.url
    : httpUrl(pullRequest?.externalLocation ?? pullRequestMetadata.pullRequestUrl);
  const pullRequestNumber = Number.isSafeInteger(pullRequestMetadata.pullRequestNumber)
    && Number(pullRequestMetadata.pullRequestNumber) > 0
    ? Number(pullRequestMetadata.pullRequestNumber)
    : undefined;
  const changedFileValues = Array.isArray(codeDiffMetadata.changedFiles)
    ? codeDiffMetadata.changedFiles
    : Array.isArray(pullRequestMetadata.changedFiles)
      ? pullRequestMetadata.changedFiles
      : [];
  const changedFiles = [...new Set(changedFileValues
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean))].slice(0, 1_000);

  if (!pullRequest || !headSha || !pullRequestUrl) return { changedFiles, patch: {} };
  return {
    changedFiles,
    patch: {
      ...(sourceRevision ? { executionBaseSha: sourceRevision } : {}),
      headSha,
      ...(pullRequestNumber ? { pullRequestNumber } : {}),
      pullRequestUrl,
      ...(input.completedAt ? { publishedAt: input.completedAt } : {}),
    },
  };
}

export function factoryExecutorIdentity(input: {
  ownerId: string;
  executorAdapter: string;
  executorVersion: string;
  executorHostId: string;
}) {
  const ownerId = input.ownerId.replace(/^service:/, "").trim();
  return `service:${ownerId}|executor:${input.executorAdapter}/${input.executorVersion}|host:${input.executorHostId}`;
}

export function factoryAttemptRequiresReplacementOnClaim(input: {
  status: string;
  lease?: AttemptLease;
  continuationStatus?: string;
  now: number;
}) {
  const hadExecutionOwnership = input.status === "RUNNING" || Boolean(input.lease);
  const leaseIsInactive = !input.lease || input.lease.expiresAt <= input.now;
  const hasRecoverablePublicationCheckpoint = ["AWAITING_HUMAN_REVIEW", "READY_TO_PUBLISH", "PUBLICATION_AUTHORIZED"]
    .includes(input.continuationStatus ?? "");
  return hadExecutionOwnership && leaseIsInactive && !hasRecoverablePublicationCheckpoint;
}

export function lostFactoryAttemptFailure(input: { executionBackend?: string }) {
  if (input.executionBackend !== "remote-sandbox") return {};
  return {
    failureClass: "RETRYABLE_INFRA" as const,
    failureCode: "WORKER_LEASE_LOST",
    failureStage: "EXECUTOR",
    retryable: true,
  };
}

export function expiredFactoryLeaseIdIsReplay(input: {
  lease?: AttemptLease;
  leaseId: string;
  now: number;
}) {
  return Boolean(input.lease
    && input.lease.expiresAt <= input.now
    && input.lease.leaseId === input.leaseId);
}

export function factoryLeaseMatchesCurrentRegistration(
  lease: AttemptLease | undefined,
  registration: FactoryWorkerRegistrationLike | undefined,
) {
  if (!lease) return false;
  // Active legacy leases remain usable during a backend-first rollout. They
  // are still fenced by service owner, random lease ID, status, and expiry.
  if (!lease.workerId && !lease.workerSessionId && lease.workerGeneration === undefined) return true;
  return Boolean(
    lease.workerId
    && lease.workerSessionId
    && Number.isSafeInteger(lease.workerGeneration)
    && registration?.hostId === lease.workerId
    && registration.workerRuntime?.sessionId === lease.workerSessionId
    && registration.workerRuntime?.generation === lease.workerGeneration
  );
}

export function validateFactoryPullRequestLineage(input: {
  artifact: PublicationArtifactLike | null | undefined;
  expected: {
    repositoryId: string;
    repositoryIdentity: string;
    installationId: string;
    branch: string;
    headSha: string;
    sourceRevision?: string;
    executionManifestDigest: string;
    publicationPermitId?: string;
  };
}): { ok: true; pullRequestNumber: number; pullRequestUrl: string } | { ok: false; reason: string } {
  const artifact = input.artifact;
  const metadata = artifact?.metadata ?? {};
  if (!gitRevision(input.expected.headSha)
    || (input.expected.sourceRevision !== undefined && !gitRevision(input.expected.sourceRevision))) {
    return { ok: false, reason: "pull-request-revision-invalid" };
  }
  if (artifact?.artifactType !== "PULL_REQUEST") return { ok: false, reason: "artifact-type-mismatch" };
  const pullRequest = exactGithubPullRequest(
    artifact.externalLocation ?? metadata.pullRequestUrl,
    input.expected.repositoryIdentity,
  );
  if (!pullRequest) return { ok: false, reason: "pull-request-url-mismatch" };
  if (metadata.pullRequestNumber !== pullRequest.number
    || metadata.repositoryId !== input.expected.repositoryId
    || metadata.repository !== input.expected.repositoryIdentity
    || metadata.installationId !== input.expected.installationId
    || metadata.branch !== input.expected.branch
    || metadata.headSha !== input.expected.headSha
    || metadata.executionManifestDigest !== input.expected.executionManifestDigest) {
    return { ok: false, reason: "pull-request-metadata-mismatch" };
  }
  if (input.expected.sourceRevision !== undefined
    && metadata.sourceRevision !== input.expected.sourceRevision) {
    return { ok: false, reason: "pull-request-source-revision-mismatch" };
  }
  if (input.expected.publicationPermitId !== undefined
    && metadata.publicationPermitId !== input.expected.publicationPermitId) {
    return { ok: false, reason: "pull-request-permit-mismatch" };
  }
  return { ok: true, pullRequestNumber: pullRequest.number, pullRequestUrl: pullRequest.url };
}

export function factoryAttemptMutationIsAuthorized(run: {
  status: string;
  cancellationRequestedAt?: number;
}) {
  return run.status === "RUNNING" && !run.cancellationRequestedAt;
}

export function evaluateAttemptClaim(input: {
  status: string;
  lease?: AttemptLease;
  leaseId: string;
  ownerId: string;
  worker?: FactoryAttemptWorkerIdentity;
  leaseDurationMs: number;
  now: number;
}) {
  if (!Number.isSafeInteger(input.leaseDurationMs)
    || input.leaseDurationMs < MIN_FACTORY_LEASE_MS
    || input.leaseDurationMs > MAX_FACTORY_LEASE_MS) {
    return { ok: false as const, reason: "lease-duration-invalid" };
  }
  if (!input.leaseId.trim() || !input.ownerId.trim()) {
    return { ok: false as const, reason: "lease-identity-invalid" };
  }
  if (input.worker && (!input.worker.workerId.trim()
    || !input.worker.sessionId.trim()
    || !Number.isSafeInteger(input.worker.generation)
    || input.worker.generation < 1)) {
    return { ok: false as const, reason: "worker-identity-invalid" };
  }
  if (!["PENDING", "RUNNING"].includes(input.status)) {
    return { ok: false as const, reason: "attempt-not-claimable" };
  }
  if (input.lease && input.lease.expiresAt > input.now) {
    return { ok: false as const, reason: "attempt-already-leased" };
  }
  const claimedAt = input.lease?.claimedAt ?? input.now;
  return {
    ok: true as const,
    reclaimed: Boolean(input.lease),
    lease: {
      leaseId: input.leaseId,
      ownerId: input.ownerId,
      workerId: input.worker?.workerId,
      workerSessionId: input.worker?.sessionId,
      workerGeneration: input.worker?.generation,
      claimedAt,
      heartbeatAt: input.now,
      expiresAt: input.now + input.leaseDurationMs,
    },
  };
}

export function renewAttemptLease(input: {
  lease?: AttemptLease;
  leaseId: string;
  ownerId: string;
  worker?: FactoryAttemptWorkerIdentity;
  leaseDurationMs: number;
  now: number;
}) {
  if (!input.lease || input.lease.leaseId !== input.leaseId || input.lease.ownerId !== input.ownerId
    || !leaseWorkerMatches(input.lease, input.worker)) {
    return { ok: false as const, reason: "lease-mismatch" };
  }
  if (input.lease.expiresAt <= input.now) {
    return { ok: false as const, reason: "lease-expired" };
  }
  if (!Number.isSafeInteger(input.leaseDurationMs)
    || input.leaseDurationMs < MIN_FACTORY_LEASE_MS
    || input.leaseDurationMs > MAX_FACTORY_LEASE_MS) {
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

export function activeLeaseMatches(input: {
  lease?: AttemptLease;
  leaseId: string;
  ownerId: string;
  worker?: FactoryAttemptWorkerIdentity;
  now: number;
}) {
  return Boolean(
    input.lease
    && input.lease.leaseId === input.leaseId
    && input.lease.ownerId === input.ownerId
    && leaseWorkerMatches(input.lease, input.worker)
    && input.lease.expiresAt > input.now
  );
}

export function releaseAttemptLease(input: {
  lease?: AttemptLease;
  leaseId: string;
  ownerId: string;
  worker?: FactoryAttemptWorkerIdentity;
  now: number;
}) {
  if (!activeLeaseMatches(input)) return { ok: false as const, reason: "lease-mismatch-or-expired" };
  return {
    ok: true as const,
    releasedLeaseId: input.leaseId,
    releasedAt: input.now,
  };
}

/**
 * Reconciliation never converts a missing executor into successful history.
 * Only the immutable publication checkpoint is recoverable on another worker
 * session. Interrupted execution requires a replacement Attempt.
 */
export function classifyFactoryAttemptReconciliation(input: {
  status: string;
  cancellationRequestedAt?: number;
  lease?: AttemptLease;
  currentWorkerSessionId?: string;
  processState: FactoryExecutorProcessState;
  hasPublicationCheckpoint: boolean;
  now: number;
}): { disposition: FactoryAttemptDisposition; action: "NONE" | "RESUME_PUBLICATION" | "CREATE_REPLACEMENT_ATTEMPT" | "FINALIZE_CANCELLED" | "FINALIZE_FAILED" } {
  if (input.cancellationRequestedAt) {
    return { disposition: "CANCELLED", action: "FINALIZE_CANCELLED" };
  }
  if (!["PENDING", "RUNNING"].includes(input.status)) {
    return { disposition: input.status === "FAILED" ? "FAILED" : "RECOVERABLE", action: "NONE" };
  }
  if (input.hasPublicationCheckpoint) {
    return { disposition: "RECOVERABLE", action: "RESUME_PUBLICATION" };
  }
  const leaseExpired = !input.lease || input.lease.expiresAt <= input.now;
  const sessionChanged = Boolean(
    input.lease?.workerSessionId
    && input.currentWorkerSessionId
    && input.lease.workerSessionId !== input.currentWorkerSessionId
  );
  if (input.processState === "RUNNING" && !leaseExpired && !sessionChanged) {
    return { disposition: "RECOVERABLE", action: "NONE" };
  }
  if (input.processState === "NOT_STARTED" && leaseExpired) {
    return { disposition: "RETRYABLE", action: "CREATE_REPLACEMENT_ATTEMPT" };
  }
  if (leaseExpired || sessionChanged || input.processState === "TERMINATED" || input.processState === "UNKNOWN") {
    return { disposition: "LOST", action: "CREATE_REPLACEMENT_ATTEMPT" };
  }
  return { disposition: "FAILED", action: "FINALIZE_FAILED" };
}

function leaseWorkerMatches(lease: AttemptLease, worker: FactoryAttemptWorkerIdentity | undefined) {
  // Legacy leases did not carry a worker session. They remain fenced by the
  // unique lease ID and service owner until they naturally terminate.
  if (!lease.workerId && !lease.workerSessionId && lease.workerGeneration === undefined) return true;
  return Boolean(worker
    && lease.workerId === worker.workerId
    && lease.workerSessionId === worker.sessionId
    && lease.workerGeneration === worker.generation);
}

function exactGithubPullRequest(value: unknown, repositoryIdentity: string) {
  if (typeof value !== "string"
    || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repositoryIdentity)) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:"
      || parsed.hostname.toLowerCase() !== "github.com"
      || parsed.port
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash) return undefined;
    const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/([1-9]\d*)$/);
    if (!match || `${match[1]}/${match[2]}` !== repositoryIdentity) return undefined;
    const number = Number(match[3]);
    if (!Number.isSafeInteger(number)) return undefined;
    return { number, url: parsed.toString() };
  } catch {
    return undefined;
  }
}
