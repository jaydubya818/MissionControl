export const MIN_FACTORY_LEASE_MS = 15_000;
export const MAX_FACTORY_LEASE_MS = 120_000;

export interface AttemptLease {
  leaseId: string;
  ownerId: string;
  claimedAt: number;
  heartbeatAt: number;
  expiresAt: number;
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
