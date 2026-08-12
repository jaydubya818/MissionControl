export const MIN_FACTORY_LEASE_MS = 15_000;
export const MAX_FACTORY_LEASE_MS = 120_000;

export interface AttemptLease {
  leaseId: string;
  ownerId: string;
  claimedAt: number;
  heartbeatAt: number;
  expiresAt: number;
}

type PublicationArtifactLike = {
  artifactType?: string;
  externalLocation?: string;
  metadata?: Record<string, unknown>;
};

type FactoryPublicationPatch = {
  executionBaseSha?: string;
  headSha?: string;
  pullRequestNumber?: number;
  pullRequestUrl?: string;
  publishedAt?: number;
};

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
  const pullRequestUrl = httpUrl(pullRequest?.externalLocation ?? pullRequestMetadata.pullRequestUrl);
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
  leaseDurationMs: number;
  now: number;
}) {
  if (!input.lease || input.lease.leaseId !== input.leaseId || input.lease.ownerId !== input.ownerId) {
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
  now: number;
}) {
  return Boolean(
    input.lease
    && input.lease.leaseId === input.leaseId
    && input.lease.ownerId === input.ownerId
    && input.lease.expiresAt > input.now
  );
}
