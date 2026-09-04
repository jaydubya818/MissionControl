import { describe, expect, it } from "vitest";
import {
  countActiveFactoryWorkerLeases,
  factoryWorkerEligibility,
  factoryWorkerRegistrationIssues,
  nextFactoryWorkerGeneration,
  type FactoryWorkerCandidate,
  type FactoryWorkerRequirements,
} from "../lib/factoryWorkerRuntime";
import {
  CODEX_V1_HARNESS_MANIFEST,
  CODEX_V1_RUNTIME_ARTIFACT,
  DEEPSEEK_V1_HARNESS_MANIFEST,
  DEEPSEEK_V1_RUNTIME_ARTIFACT,
  harnessCapabilityManifestDigest,
  harnessRuntimeArtifactDigest,
} from "@mission-control/workflow-engine";

const now = 100_000;
const codexRuntimeArtifactSha256 = harnessRuntimeArtifactDigest(CODEX_V1_RUNTIME_ARTIFACT);
const requirements: FactoryWorkerRequirements = {
  repositoryId: "repository-1",
  executor: {
    adapter: "codex",
    version: "v1",
    capabilityManifestSha256: harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST),
    effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
    runtimeArtifactSha256: codexRuntimeArtifactSha256,
  },
  provider: "openai",
  model: "gpt-5.6-terra",
  harnessCapabilities: [
    { capability: "filesystem.write", minimumSupport: "SUPPORTED" },
    { capability: "cancellation.support", minimumSupport: "PARTIAL" },
  ],
  isolation: "WORKSPACE_WRITE",
  sandboxCapabilities: ["git-worktree", "workspace-write"],
  executionBackend: "persistent-worker",
};
const worker: FactoryWorkerCandidate = {
  workerId: "worker-1",
  status: "READY",
  dirty: false,
  capacity: { maxConcurrentRuns: 2, currentRuns: 0 },
  workerRuntime: {
    sessionId: "session-1",
    generation: 1,
    hostRuntimeType: "persistent-worker",
    executionBackends: ["persistent-worker"],
    supportedExecutors: [{
      adapter: "codex",
      version: "v1",
      capabilityManifestSha256: harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST),
      effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
      runtimeArtifact: CODEX_V1_RUNTIME_ARTIFACT,
      runtimeArtifactSha256: codexRuntimeArtifactSha256,
      capabilityManifest: CODEX_V1_HARNESS_MANIFEST,
      supportsCancel: true,
      supportsResume: false,
      isolationModes: ["READ_ONLY", "WORKSPACE_WRITE"],
    }],
    sandboxCapabilities: ["git-worktree", "workspace-write", "read-only"],
    repositoryAccess: [{ repositoryId: "repository-1", access: "READ_WRITE" }],
    readiness: "READY",
    draining: false,
    lastHeartbeatAt: now,
  },
};

describe("Factory worker runtime", () => {
  it("keeps a generation for one session and increments it on restart", () => {
    expect(nextFactoryWorkerGeneration(undefined, "session-1")).toBe(1);
    expect(nextFactoryWorkerGeneration({ sessionId: "session-1", generation: 3 }, "session-1")).toBe(3);
    expect(nextFactoryWorkerGeneration({ sessionId: "session-1", generation: 3 }, "session-2")).toBe(4);
  });

  it("matches provider-neutral executor, sandbox, backend, repository, readiness, and heartbeat requirements", () => {
    expect(factoryWorkerEligibility({ worker, requirements, activeWorkerLeaseCount: 0, now }))
      .toEqual({ eligible: true, workerId: "worker-1", sessionId: "session-1", generation: 1 });
    expect(factoryWorkerEligibility({
      worker,
      requirements: { ...requirements, executor: { ...requirements.executor, adapter: "loom", version: "v1" } },
      activeWorkerLeaseCount: 0,
      now,
    })).toMatchObject({ eligible: false, reason: "worker-executor-unsupported" });
    expect(factoryWorkerEligibility({
      worker: { ...worker, workerRuntime: { ...worker.workerRuntime!, draining: true, readiness: "DRAINING" } },
      requirements,
      activeWorkerLeaseCount: 0,
      now,
    })).toMatchObject({ eligible: false, reason: "worker-draining" });
  });

  it("requires a valid exact runtime-artifact object and matching advertised digest", () => {
    const executor = worker.workerRuntime!.supportedExecutors[0];
    const invalidWorkers = [
      {
        ...worker,
        workerRuntime: {
          ...worker.workerRuntime!,
          supportedExecutors: [{ ...executor, runtimeArtifact: undefined }],
        },
      },
      {
        ...worker,
        workerRuntime: {
          ...worker.workerRuntime!,
          supportedExecutors: [{
            ...executor,
            runtimeArtifact: { ...CODEX_V1_RUNTIME_ARTIFACT, version: "0.146.1" },
          }],
        },
      },
      {
        ...worker,
        workerRuntime: {
          ...worker.workerRuntime!,
          supportedExecutors: [{
            ...executor,
            runtimeArtifact: { ...CODEX_V1_RUNTIME_ARTIFACT, executableSha256: null },
          }],
        },
      },
      {
        ...worker,
        workerRuntime: {
          ...worker.workerRuntime!,
          supportedExecutors: [{ ...executor, runtimeArtifactSha256: `sha256:${"0".repeat(64)}` }],
        },
      },
    ];

    for (const candidate of invalidWorkers) {
      expect(factoryWorkerEligibility({
        worker: candidate,
        requirements,
        activeWorkerLeaseCount: 0,
        now,
      })).toMatchObject({ eligible: false, reason: "worker-runtime-artifact-invalid" });
    }
  });

  it("rejects a runtime-artifact requirement that the worker did not advertise", () => {
    expect(factoryWorkerEligibility({
      worker,
      requirements: {
        ...requirements,
        executor: {
          ...requirements.executor,
          runtimeArtifactSha256: `sha256:${"f".repeat(64)}`,
        },
      },
      activeWorkerLeaseCount: 0,
      now,
    })).toMatchObject({ eligible: false, reason: "worker-runtime-artifact-mismatch" });
  });

  it("requires one exact worker attestation for a frozen Factory Version", () => {
    const exactRequirements: FactoryWorkerRequirements = {
      ...requirements,
      factoryDefinitionVersionId: "factory-version-1",
      factoryConfigurationDigest: "factory-v1-deadbeef",
      modelRouteDigest: `sha256:${"a".repeat(64)}`,
      executionRuntimeArtifactSha256: codexRuntimeArtifactSha256,
    };
    expect(factoryWorkerEligibility({ worker, requirements: exactRequirements, activeWorkerLeaseCount: 0, now }))
      .toMatchObject({ eligible: false, reason: "worker-factory-version-mismatch" });
    const exactWorker: FactoryWorkerCandidate = {
      ...worker,
      workerRuntime: {
        ...worker.workerRuntime!,
        factoryVersionBindings: [{
          factoryDefinitionVersionId: exactRequirements.factoryDefinitionVersionId!,
          factoryConfigurationDigest: exactRequirements.factoryConfigurationDigest!,
          adapter: requirements.executor.adapter,
          version: requirements.executor.version,
          provider: requirements.provider!,
          model: requirements.model!,
          capabilityManifestSha256: requirements.executor.capabilityManifestSha256,
          effectiveConfigSha256: requirements.executor.effectiveConfigSha256,
          runtimeArtifactSha256: exactRequirements.executionRuntimeArtifactSha256,
          executionBackend: requirements.executionBackend!,
          modelRouteDigest: exactRequirements.modelRouteDigest!,
          repositoryId: requirements.repositoryId,
        }],
      },
    };
    expect(factoryWorkerEligibility({ worker: exactWorker, requirements: exactRequirements, activeWorkerLeaseCount: 0, now }))
      .toMatchObject({ eligible: true });
    const legacyWorkerBinding: FactoryWorkerCandidate = {
      ...exactWorker,
      workerRuntime: {
        ...exactWorker.workerRuntime!,
        factoryVersionBindings: exactWorker.workerRuntime!.factoryVersionBindings!.map((binding) => {
          const legacyBinding = { ...binding };
          delete legacyBinding.runtimeArtifactSha256;
          return legacyBinding;
        }),
      },
    };
    expect(factoryWorkerEligibility({
      worker: legacyWorkerBinding,
      requirements: exactRequirements,
      activeWorkerLeaseCount: 0,
      now,
    })).toMatchObject({ eligible: true });
    expect(factoryWorkerEligibility({
      worker: legacyWorkerBinding,
      requirements: {
        ...exactRequirements,
        executor: {
          ...exactRequirements.executor,
          requireFactoryVersionRuntimeArtifactBinding: true,
        },
      },
      activeWorkerLeaseCount: 0,
      now,
    })).toMatchObject({ eligible: false, reason: "worker-factory-version-mismatch" });
    expect(factoryWorkerEligibility({
      worker: exactWorker,
      requirements: { ...exactRequirements, modelRouteDigest: `sha256:${"b".repeat(64)}` },
      activeWorkerLeaseCount: 0,
      now,
    })).toMatchObject({ eligible: false, reason: "worker-factory-version-mismatch" });
    expect(factoryWorkerEligibility({
      worker: {
        ...exactWorker,
        workerRuntime: {
          ...exactWorker.workerRuntime!,
          factoryVersionBindings: exactWorker.workerRuntime!.factoryVersionBindings!.map((binding) => ({
            ...binding,
            runtimeArtifactSha256: `sha256:${"f".repeat(64)}`,
          })),
        },
      },
      requirements: exactRequirements,
      activeWorkerLeaseCount: 0,
      now,
    })).toMatchObject({ eligible: false, reason: "worker-factory-version-mismatch" });
  });

  it("keeps the worker adapter executable separate from the remote execution artifact", () => {
    const remoteRuntimeArtifactSha256 = `sha256:${"9".repeat(64)}`;
    const remoteRequirements: FactoryWorkerRequirements = {
      ...requirements,
      executionBackend: "remote-sandbox",
      sandboxCapabilities: ["git-worktree", "workspace-write", "remote-sandbox"],
      factoryDefinitionVersionId: "factory-version-remote",
      factoryConfigurationDigest: "factory-v1-cafef00d",
      modelRouteDigest: `sha256:${"b".repeat(64)}`,
      executionRuntimeArtifactSha256: remoteRuntimeArtifactSha256,
      executor: {
        ...requirements.executor,
        requireFactoryVersionRuntimeArtifactBinding: true,
      },
    };
    const remoteWorker: FactoryWorkerCandidate = {
      ...worker,
      workerRuntime: {
        ...worker.workerRuntime!,
        executionBackends: ["persistent-worker", "remote-sandbox"],
        sandboxCapabilities: ["git-worktree", "workspace-write", "remote-sandbox"],
        factoryVersionBindings: [{
          factoryDefinitionVersionId: remoteRequirements.factoryDefinitionVersionId!,
          factoryConfigurationDigest: remoteRequirements.factoryConfigurationDigest!,
          adapter: remoteRequirements.executor.adapter,
          version: remoteRequirements.executor.version,
          provider: remoteRequirements.provider!,
          model: remoteRequirements.model!,
          capabilityManifestSha256: remoteRequirements.executor.capabilityManifestSha256,
          effectiveConfigSha256: remoteRequirements.executor.effectiveConfigSha256,
          runtimeArtifactSha256: remoteRuntimeArtifactSha256,
          executionBackend: "remote-sandbox",
          modelRouteDigest: remoteRequirements.modelRouteDigest!,
          repositoryId: remoteRequirements.repositoryId,
        }],
      },
    };

    expect(factoryWorkerEligibility({
      worker: remoteWorker,
      requirements: remoteRequirements,
      activeWorkerLeaseCount: 0,
      now,
    })).toMatchObject({ eligible: true });
    expect(factoryWorkerEligibility({
      worker: remoteWorker,
      requirements: {
        ...remoteRequirements,
        executor: { ...remoteRequirements.executor, runtimeArtifactSha256: remoteRuntimeArtifactSha256 },
      },
      activeWorkerLeaseCount: 0,
      now,
    })).toMatchObject({ eligible: false, reason: "worker-runtime-artifact-mismatch" });
  });

  it("rejects capacity exhaustion using active server-side session leases", () => {
    expect(factoryWorkerEligibility({ worker, requirements, activeWorkerLeaseCount: 2, now }))
      .toMatchObject({ eligible: false, reason: "worker-capacity-exhausted" });
  });

  it("counts active leases globally by stable worker ID across repositories and sessions", () => {
    expect(countActiveFactoryWorkerLeases({
      runs: [
        { status: "RUNNING", lease: { workerId: "worker-1", expiresAt: now + 1 } },
        { status: "RUNNING", lease: { workerId: "worker-1", expiresAt: now + 2 } },
        { status: "RUNNING", lease: { workerId: "worker-2", expiresAt: now + 3 } },
        { status: "RUNNING", lease: { workerId: "worker-1", expiresAt: now } },
        { status: "FAILED", lease: { workerId: "worker-1", expiresAt: now + 4 } },
      ],
      workerId: "worker-1",
      now,
    })).toBe(2);
  });

  it("ignores worker-reported occupied slots and fails closed on every capability mismatch", () => {
    const falselyIdleWorker = { ...worker, capacity: { maxConcurrentRuns: 1, currentRuns: 0 } };
    expect(factoryWorkerEligibility({
      worker: falselyIdleWorker,
      requirements,
      activeWorkerLeaseCount: 1,
      now,
    })).toMatchObject({ eligible: false, reason: "worker-capacity-exhausted" });
    for (const mismatched of [
      { ...requirements, repositoryId: "repository-2" },
      { ...requirements, executionBackend: "disposable-sandbox" },
      { ...requirements, sandboxCapabilities: [...requirements.sandboxCapabilities, "network-denied"] },
      { ...requirements, isolation: "READ_ONLY" as const },
    ]) {
      expect(factoryWorkerEligibility({
        worker: { ...worker, workerRuntime: { ...worker.workerRuntime!, supportedExecutors: [{ ...worker.workerRuntime!.supportedExecutors[0], isolationModes: ["WORKSPACE_WRITE"] }] } },
        requirements: mismatched,
        activeWorkerLeaseCount: 0,
        now,
      }).eligible).toBe(false);
    }
  });

  it("rejects malformed or unbounded registration snapshots", () => {
    expect(factoryWorkerRegistrationIssues({
      sessionId: " session ",
      hostRuntimeType: "persistent-worker",
      executionBackends: ["persistent-worker"],
      supportedExecutors: [],
      sandboxCapabilities: ["git-worktree"],
      repositoryAccess: [{ repositoryId: "repository-1", access: "READ_WRITE" }],
    })).toEqual(["session-id-invalid", "executor-capabilities-invalid"]);
    expect(factoryWorkerRegistrationIssues({
      sessionId: "session-1",
      hostRuntimeType: "persistent-worker",
      executionBackends: ["persistent-worker"],
      supportedExecutors: [worker.workerRuntime!.supportedExecutors[0], worker.workerRuntime!.supportedExecutors[0]],
      sandboxCapabilities: ["git-worktree"],
      repositoryAccess: [{ repositoryId: "repository-1", access: "READ_WRITE" }],
    })).toContain("executor-capabilities-invalid");
    expect(factoryWorkerRegistrationIssues({
      sessionId: "session-1",
      hostRuntimeType: "persistent-worker",
      executionBackends: ["persistent-worker"],
      supportedExecutors: [{
        ...worker.workerRuntime!.supportedExecutors[0],
        runtimeArtifact: { ...CODEX_V1_RUNTIME_ARTIFACT, version: "0.146.1" },
      }],
      sandboxCapabilities: ["git-worktree"],
      repositoryAccess: [{ repositoryId: "repository-1", access: "READ_WRITE" }],
    })).toContain("executor-capabilities-invalid");
    expect(factoryWorkerRegistrationIssues({
      sessionId: "session-1",
      hostRuntimeType: "persistent-worker",
      executionBackends: ["persistent-worker"],
      supportedExecutors: [worker.workerRuntime!.supportedExecutors[0]],
      sandboxCapabilities: ["git-worktree"],
      repositoryAccess: [{ repositoryId: "repository-1", access: "READ_WRITE" }],
      factoryVersionBindings: [{
        factoryDefinitionVersionId: "factory-version-1",
        factoryConfigurationDigest: "factory-v1-deadbeef",
        adapter: requirements.executor.adapter,
        version: requirements.executor.version,
        provider: requirements.provider!,
        model: requirements.model!,
        capabilityManifestSha256: requirements.executor.capabilityManifestSha256,
        effectiveConfigSha256: requirements.executor.effectiveConfigSha256,
        runtimeArtifactSha256: "not-a-digest",
        executionBackend: requirements.executionBackend!,
        modelRouteDigest: `sha256:${"a".repeat(64)}`,
        repositoryId: requirements.repositoryId,
      }],
    })).toContain("factory-version-bindings-invalid");
  });

  it("fails admission on stale capability/config identity, model, or required feature", () => {
    expect(factoryWorkerEligibility({
      worker,
      requirements: { ...requirements, executor: { ...requirements.executor, capabilityManifestSha256: `sha256:${"0".repeat(64)}` } },
      activeWorkerLeaseCount: 0,
      now,
    })).toMatchObject({ eligible: false, reason: "worker-harness-manifest-mismatch" });
    expect(factoryWorkerEligibility({
      worker,
      requirements: { ...requirements, provider: "anthropic", model: "not-admitted" },
      activeWorkerLeaseCount: 0,
      now,
    })).toMatchObject({ eligible: false, reason: "worker-harness-model-unsupported" });
    expect(factoryWorkerEligibility({
      worker,
      requirements: { ...requirements, harnessCapabilities: [{ capability: "browser.interactiveBrowser", minimumSupport: "SUPPORTED" }] },
      activeWorkerLeaseCount: 0,
      now,
    })).toMatchObject({ eligible: false, reason: "worker-harness-capability-missing" });
  });

  it("admits the exact experimental DeepSeek declaration only on its supported local route", () => {
    const deepSeekDigest = harnessCapabilityManifestDigest(DEEPSEEK_V1_HARNESS_MANIFEST);
    const deepSeekRuntimeArtifactSha256 = harnessRuntimeArtifactDigest(DEEPSEEK_V1_RUNTIME_ARTIFACT);
    const deepSeekWorker: FactoryWorkerCandidate = {
      ...worker,
      workerRuntime: {
        ...worker.workerRuntime!,
        supportedExecutors: [{
          adapter: "deepseek-harness",
          version: "0.2.0",
          capabilityManifest: DEEPSEEK_V1_HARNESS_MANIFEST,
          capabilityManifestSha256: deepSeekDigest,
          effectiveConfigSha256: DEEPSEEK_V1_HARNESS_MANIFEST.effectiveConfigSha256,
          runtimeArtifact: DEEPSEEK_V1_RUNTIME_ARTIFACT,
          runtimeArtifactSha256: deepSeekRuntimeArtifactSha256,
          supportsCancel: true,
          supportsResume: true,
          isolationModes: ["READ_ONLY", "WORKSPACE_WRITE"],
        }],
      },
    };
    const deepSeekRequirements: FactoryWorkerRequirements = {
      ...requirements,
      executor: {
        adapter: "deepseek-harness",
        version: "0.2.0",
        capabilityManifestSha256: deepSeekDigest,
        effectiveConfigSha256: DEEPSEEK_V1_HARNESS_MANIFEST.effectiveConfigSha256,
        runtimeArtifactSha256: deepSeekRuntimeArtifactSha256,
      },
      provider: "local-ollama",
      model: "qwen3.5:35b-a3b-q8_0",
    };
    expect(factoryWorkerEligibility({ worker: deepSeekWorker, requirements: deepSeekRequirements, activeWorkerLeaseCount: 0, now }).eligible).toBe(true);
    expect(factoryWorkerEligibility({
      worker: { ...deepSeekWorker, workerRuntime: { ...deepSeekWorker.workerRuntime!, executionBackends: ["persistent-worker", "remote-sandbox"] } },
      requirements: { ...deepSeekRequirements, executionBackend: "remote-sandbox" },
      activeWorkerLeaseCount: 0,
      now,
    })).toMatchObject({ eligible: false, reason: "worker-harness-backend-unsupported" });
  });
});
