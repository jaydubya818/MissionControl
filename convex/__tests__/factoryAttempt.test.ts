import { describe, expect, it } from "vitest";
import { activeLeaseMatches, deriveFactoryPublicationLineage, evaluateAttemptClaim, factoryAttemptMutationIsAuthorized, renewAttemptLease } from "../lib/factoryAttempt";

describe("Factory attempt leases", () => {
  it("claims a pending attempt with a bounded durable lease", () => {
    const result = evaluateAttemptClaim({
      status: "PENDING",
      leaseId: "lease-1",
      ownerId: "orchestration-1",
      leaseDurationMs: 60_000,
      now: 1_000,
    });
    expect(result).toMatchObject({ ok: true, reclaimed: false });
    expect(result.ok && result.lease.expiresAt).toBe(61_000);
  });

  it("rejects an active lease and reclaims only after expiry", () => {
    const lease = { leaseId: "old", ownerId: "worker-a", claimedAt: 1, heartbeatAt: 10, expiresAt: 100 };
    expect(evaluateAttemptClaim({ status: "RUNNING", lease, leaseId: "new", ownerId: "worker-b", leaseDurationMs: 60_000, now: 99 })).toMatchObject({ ok: false, reason: "attempt-already-leased" });
    expect(evaluateAttemptClaim({ status: "RUNNING", lease, leaseId: "new", ownerId: "worker-b", leaseDurationMs: 60_000, now: 100 })).toMatchObject({ ok: true, reclaimed: true });
  });

  it("renews only a matching unexpired lease", () => {
    const lease = { leaseId: "lease-1", ownerId: "worker-a", claimedAt: 1, heartbeatAt: 10, expiresAt: 100 };
    expect(renewAttemptLease({ lease, leaseId: "lease-1", ownerId: "worker-b", leaseDurationMs: 60_000, now: 20 })).toMatchObject({ ok: false, reason: "lease-mismatch" });
    const result = renewAttemptLease({ lease, leaseId: "lease-1", ownerId: "worker-a", leaseDurationMs: 60_000, now: 20 });
    expect(result.ok && activeLeaseMatches({ lease: result.lease, leaseId: "lease-1", ownerId: "worker-a", now: 21 })).toBe(true);
  });

  it("revokes report and publication authority as soon as cancellation is requested", () => {
    expect(factoryAttemptMutationIsAuthorized({ status: "RUNNING" })).toBe(true);
    expect(factoryAttemptMutationIsAuthorized({ status: "RUNNING", cancellationRequestedAt: 100 })).toBe(false);
    expect(factoryAttemptMutationIsAuthorized({ status: "CANCELED", cancellationRequestedAt: 100 })).toBe(false);
  });

  it("derives durable Attempt, pull-request, and file lineage from exact-run artifacts", () => {
    const lineage = deriveFactoryPublicationLineage({
      pullRequestArtifact: {
        artifactType: "PULL_REQUEST",
        externalLocation: "https://github.com/acme/repo/pull/42",
        metadata: {
          sourceRevision: "a".repeat(40),
          headSha: "b".repeat(40),
          pullRequestNumber: 42,
          changedFiles: ["src/fallback.ts"],
        },
      },
      codeDiffArtifact: {
        artifactType: "CODE_DIFF",
        metadata: {
          sourceRevision: "a".repeat(40),
          headSha: "b".repeat(40),
          changedFiles: ["src/feature.ts", "src/feature.ts", "src/test.ts"],
        },
      },
      completedAt: 123,
    });

    expect(lineage).toEqual({
      changedFiles: ["src/feature.ts", "src/test.ts"],
      patch: {
        executionBaseSha: "a".repeat(40),
        headSha: "b".repeat(40),
        pullRequestNumber: 42,
        pullRequestUrl: "https://github.com/acme/repo/pull/42",
        publishedAt: 123,
      },
    });
  });

  it("fails closed on unsafe or incomplete pull-request lineage", () => {
    const lineage = deriveFactoryPublicationLineage({
      pullRequestArtifact: {
        artifactType: "PULL_REQUEST",
        externalLocation: "javascript:alert(1)",
        metadata: { headSha: "not-a-git-sha", changedFiles: ["", 12] },
      },
      verifiedSourceRevision: "a".repeat(40),
    });

    expect(lineage).toEqual({ changedFiles: [], patch: {} });

    const insecure = deriveFactoryPublicationLineage({
      pullRequestArtifact: {
        artifactType: "PULL_REQUEST",
        externalLocation: "http://github.com/acme/repo/pull/42",
        metadata: { headSha: "b".repeat(40) },
      },
    });
    expect(insecure.patch).toEqual({});
  });
});
