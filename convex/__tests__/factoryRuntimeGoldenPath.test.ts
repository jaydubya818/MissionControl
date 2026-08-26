import { describe, expect, it } from "vitest";
import { activeLeaseMatches, classifyFactoryAttemptReconciliation, evaluateAttemptClaim, releaseAttemptLease, renewAttemptLease } from "../lib/factoryAttempt";
import { factoryWorkerEligibility, type FactoryWorkerCandidate } from "../lib/factoryWorkerRuntime";
import { CODEX_V1_HARNESS_MANIFEST, harnessCapabilityManifestDigest } from "@mission-control/workflow-engine";

const capabilityManifestSha256 = harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST);

describe("Factory worker runtime golden path", () => {
  it("moves WorkOrder execution through eligibility, lease, heartbeat, completion, and release", () => {
    const worker: FactoryWorkerCandidate = {
      workerId: "worker-local-1",
      status: "READY",
      dirty: false,
      networkPolicyStatus: "READY",
      secretPolicyStatus: "READY",
      attestedAt: 1_000,
      capacity: { maxConcurrentRuns: 1, currentRuns: 0 },
      workerRuntime: {
        sessionId: "session-1",
        generation: 1,
        hostRuntimeType: "local-macos",
        executionBackends: ["persistent-worker"],
        supportedExecutors: [{
          adapter: "codex",
          version: "v1",
          capabilityManifest: CODEX_V1_HARNESS_MANIFEST,
          capabilityManifestSha256,
          effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
          supportsCancel: true,
          supportsResume: false,
          isolationModes: ["WORKSPACE_WRITE"],
        }],
        sandboxCapabilities: ["git-worktree", "workspace-write"],
        repositoryAccess: [{ repositoryId: "repository-1", access: "READ_WRITE" }],
        readiness: "READY",
        draining: false,
        lastHeartbeatAt: 1_000,
      },
    };
    const eligibility = factoryWorkerEligibility({
      worker,
      requirements: {
        repositoryId: "repository-1",
        executor: {
          adapter: "codex",
          version: "v1",
          capabilityManifestSha256,
          effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
        },
        provider: "openai",
        model: "gpt-5.6-terra",
        harnessCapabilities: [{ capability: "filesystem.write", minimumSupport: "SUPPORTED" }],
        isolation: "WORKSPACE_WRITE",
        sandboxCapabilities: ["git-worktree", "workspace-write"],
        executionBackend: "persistent-worker",
      },
      activeWorkerLeaseCount: 0,
      now: 1_000,
    });
    expect(eligibility.eligible).toBe(true);
    if (!eligibility.eligible) return;

    const identity = {
      workerId: eligibility.workerId,
      sessionId: eligibility.sessionId,
      generation: eligibility.generation,
    };
    const claim = evaluateAttemptClaim({
      status: "PENDING",
      leaseId: "lease-1",
      ownerId: "factory-service",
      worker: identity,
      leaseDurationMs: 60_000,
      now: 1_000,
    });
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;

    const heartbeat = renewAttemptLease({
      lease: claim.lease,
      leaseId: "lease-1",
      ownerId: "factory-service",
      worker: identity,
      leaseDurationMs: 60_000,
      now: 20_000,
    });
    expect(heartbeat.ok).toBe(true);
    if (!heartbeat.ok) return;
    expect(activeLeaseMatches({
      lease: heartbeat.lease,
      leaseId: "lease-1",
      ownerId: "factory-service",
      worker: identity,
      now: 20_001,
    })).toBe(true);

    expect(releaseAttemptLease({
      lease: heartbeat.lease,
      leaseId: "lease-1",
      ownerId: "factory-service",
      worker: identity,
      now: 21_000,
    })).toEqual({ ok: true, releasedLeaseId: "lease-1", releasedAt: 21_000 });
  });

  it("rejects worker A after expiry while worker B receives replacement Attempt ownership", () => {
    const workerA = { workerId: "worker-a", sessionId: "session-a", generation: 1 };
    const first = evaluateAttemptClaim({
      status: "PENDING",
      leaseId: "lease-a",
      ownerId: "factory-service",
      worker: workerA,
      leaseDurationMs: 15_000,
      now: 0,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(activeLeaseMatches({
      lease: first.lease,
      leaseId: "lease-a",
      ownerId: "factory-service",
      worker: workerA,
      now: 15_000,
    })).toBe(false);
    expect(classifyFactoryAttemptReconciliation({
      status: "RUNNING",
      lease: first.lease,
      currentWorkerSessionId: "session-b",
      processState: "UNKNOWN",
      hasPublicationCheckpoint: false,
      now: 15_000,
    })).toEqual({ disposition: "LOST", action: "CREATE_REPLACEMENT_ATTEMPT" });

    const workerB = { workerId: "worker-b", sessionId: "session-b", generation: 1 };
    const replacement = evaluateAttemptClaim({
      status: "PENDING",
      leaseId: "lease-b",
      ownerId: "factory-service",
      worker: workerB,
      leaseDurationMs: 15_000,
      now: 15_000,
    });
    expect(replacement).toMatchObject({ ok: true, reclaimed: false, lease: { leaseId: "lease-b", workerId: "worker-b" } });
    expect(activeLeaseMatches({
      lease: replacement.ok ? replacement.lease : undefined,
      leaseId: "lease-a",
      ownerId: "factory-service",
      worker: workerA,
      now: 15_001,
    })).toBe(false);
  });
});
