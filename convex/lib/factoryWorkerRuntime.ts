import type {
  HarnessCapabilityManifest,
  HarnessCapabilityRequirement,
  HarnessRuntimeArtifactIdentity,
} from "@mission-control/workflow-engine/harness-contract";
import {
  harnessCapabilityManifestDigest,
  harnessCapabilityRequirementsSatisfied,
  harnessManifestIssues,
  harnessRuntimeArtifactDigest,
  harnessRuntimeArtifactIssues,
  harnessSupportsModel,
  ISOLATED_INVOCATION_MANIFEST,
  ISOLATED_INVOCATION_ADAPTER_ARTIFACT,
} from "@mission-control/workflow-engine/harness-contract";
import { isNoInferenceConstraint, type NO_INFERENCE_CONSTRAINT } from "./offlineExecutionPolicy";

export const FACTORY_WORKER_HEARTBEAT_MAX_AGE_MS = 2 * 60_000;

export type FactoryWorkerReadiness = "STARTING" | "READY" | "DRAINING" | "BLOCKED";

export interface FactoryWorkerExecutorCapability {
  adapter: string;
  version: string;
  capabilityManifestSha256?: string;
  effectiveConfigSha256?: string;
  runtimeArtifact?: HarnessRuntimeArtifactIdentity;
  runtimeArtifactSha256?: string;
  capabilityManifest?: HarnessCapabilityManifest;
  supportsCancel: boolean;
  supportsResume: boolean;
  isolationModes: Array<"READ_ONLY" | "WORKSPACE_WRITE">;
}

export interface FactoryWorkerRuntimeSnapshot {
  sessionId: string;
  generation: number;
  hostRuntimeType: string;
  executionBackends: string[];
  supportedExecutors: FactoryWorkerExecutorCapability[];
  sandboxCapabilities: string[];
  repositoryAccess: Array<{
    repositoryId: string;
    access: "READ" | "READ_WRITE";
  }>;
  factoryVersionBindings?: FactoryWorkerVersionBinding[];
  readiness: FactoryWorkerReadiness;
  draining: boolean;
  lastHeartbeatAt: number;
}

interface FactoryWorkerVersionBindingCommon {
  factoryDefinitionVersionId: string;
  factoryConfigurationDigest: string;
  adapter: string;
  version: string;
  capabilityManifestSha256: string;
  effectiveConfigSha256: string;
  runtimeArtifactSha256?: string;
  executionBackend: string;
  sandboxProfileDigest?: string;
  repositoryId: string;
}

export type FactoryWorkerVersionBinding = FactoryWorkerVersionBindingCommon & (
  | { provider: string; model: string; modelRouteDigest: string; inferenceConstraint?: never }
  | { executionBackend: "isolated-container"; provider?: never; model?: never; modelRouteDigest?: never;
      inferenceConstraint: typeof NO_INFERENCE_CONSTRAINT; runtimeArtifactSha256: string; sandboxProfileDigest: string }
);

export interface FactoryWorkerCandidate {
  workerId: string;
  status: string;
  dirty: boolean;
  capacity?: {
    maxConcurrentRuns: number;
    currentRuns: number;
  };
  workerRuntime?: FactoryWorkerRuntimeSnapshot;
}

export interface FactoryWorkerRequirements {
  repositoryId: string;
  executor: {
    adapter: string;
    version: string;
    capabilityManifestSha256: string;
    effectiveConfigSha256: string;
    runtimeArtifactSha256?: string;
    requireFactoryVersionRuntimeArtifactBinding?: boolean;
  };
  /** Exact artifact that executes the Attempt. For remote execution this is
   * the immutable sandbox image, not the worker-host adapter executable. */
  executionRuntimeArtifactSha256?: string;
  provider: string | null;
  model: string | null;
  harnessCapabilities: HarnessCapabilityRequirement[];
  isolation: "READ_ONLY" | "WORKSPACE_WRITE";
  sandboxCapabilities: string[];
  executionBackend?: string;
  factoryDefinitionVersionId?: string;
  factoryConfigurationDigest?: string;
  modelRouteDigest?: string;
  inferenceConstraint?: typeof NO_INFERENCE_CONSTRAINT;
  sandboxProfileDigest?: string;
}

export function factoryWorkerVersionBindingMatches(input: {
  binding: FactoryWorkerVersionBinding;
  requirements: {
    factoryDefinitionVersionId: string;
    factoryConfigurationDigest: string;
    adapter: string;
    version: string;
    provider?: string;
    model?: string;
    capabilityManifestSha256: string;
    effectiveConfigSha256: string;
    runtimeArtifactSha256: string;
    requireRuntimeArtifactBinding: boolean;
    executionBackend: string;
    modelRouteDigest?: string;
    inferenceConstraint?: typeof NO_INFERENCE_CONSTRAINT;
    sandboxProfileDigest?: string;
    repositoryId: string;
  };
}) {
  const { binding, requirements } = input;
  const offline = requirements.executionBackend === "isolated-container";
  if (offline ? (!isNoInferenceConstraint(requirements.inferenceConstraint)
      || !isNoInferenceConstraint(binding.inferenceConstraint)
      || requirements.provider !== undefined || requirements.model !== undefined || requirements.modelRouteDigest !== undefined
      || binding.provider !== undefined || binding.model !== undefined || binding.modelRouteDigest !== undefined
      || !requirements.requireRuntimeArtifactBinding || !requirements.sandboxProfileDigest)
    : (requirements.inferenceConstraint !== undefined || binding.inferenceConstraint !== undefined
      || !requirements.provider || !requirements.model || !requirements.modelRouteDigest)) return false;
  return binding.factoryDefinitionVersionId === requirements.factoryDefinitionVersionId
    && binding.factoryConfigurationDigest === requirements.factoryConfigurationDigest
    && binding.adapter === requirements.adapter
    && binding.version === requirements.version
    && binding.provider === requirements.provider
    && binding.model === requirements.model
    && binding.capabilityManifestSha256 === requirements.capabilityManifestSha256
    && binding.effectiveConfigSha256 === requirements.effectiveConfigSha256
    && (binding.runtimeArtifactSha256 === requirements.runtimeArtifactSha256
      || (!requirements.requireRuntimeArtifactBinding && binding.runtimeArtifactSha256 === undefined))
    && binding.executionBackend === requirements.executionBackend
    && binding.modelRouteDigest === requirements.modelRouteDigest
    && binding.sandboxProfileDigest === requirements.sandboxProfileDigest
    && binding.repositoryId === requirements.repositoryId;
}

export function nextFactoryWorkerGeneration(
  current: Pick<FactoryWorkerRuntimeSnapshot, "sessionId" | "generation"> | undefined,
  sessionId: string,
) {
  if (current?.sessionId === sessionId) return current.generation;
  return Math.max(0, current?.generation ?? 0) + 1;
}

export function factoryWorkerEligibility(input: {
  worker: FactoryWorkerCandidate;
  requirements: FactoryWorkerRequirements;
  activeWorkerLeaseCount: number;
  now: number;
}) {
  const { worker, requirements, now } = input;
  const runtime = worker.workerRuntime;
  if (worker.status !== "READY" || worker.dirty) {
    return { eligible: false as const, reason: "worker-host-not-ready" };
  }
  if (!runtime || !runtime.sessionId.trim()) {
    return { eligible: false as const, reason: "worker-session-not-registered" };
  }
  if (runtime.readiness !== "READY" || runtime.draining) {
    return { eligible: false as const, reason: runtime.draining ? "worker-draining" : "worker-not-ready" };
  }
  if (now - runtime.lastHeartbeatAt > FACTORY_WORKER_HEARTBEAT_MAX_AGE_MS) {
    return { eligible: false as const, reason: "worker-heartbeat-stale" };
  }
  if (!worker.capacity
    || !Number.isSafeInteger(worker.capacity.maxConcurrentRuns)
    || worker.capacity.maxConcurrentRuns < 1) {
    return { eligible: false as const, reason: "worker-capacity-invalid" };
  }
  if (input.activeWorkerLeaseCount >= worker.capacity.maxConcurrentRuns) {
    return { eligible: false as const, reason: "worker-capacity-exhausted" };
  }
  const executor = runtime.supportedExecutors.find((candidate) =>
    candidate.adapter === requirements.executor.adapter
    && candidate.version === requirements.executor.version
  );
  if (!executor) return { eligible: false as const, reason: "worker-executor-unsupported" };
  if (!executor.capabilityManifest
    || executor.capabilityManifestSha256 !== requirements.executor.capabilityManifestSha256
    || executor.effectiveConfigSha256 !== requirements.executor.effectiveConfigSha256
    || harnessManifestIssues(executor.capabilityManifest).length > 0
    || executor.capabilityManifest.identity.adapterId !== executor.adapter
    || executor.capabilityManifest.identity.adapterVersion !== executor.version
    || harnessCapabilityManifestDigest(executor.capabilityManifest) !== executor.capabilityManifestSha256
    || executor.capabilityManifest.effectiveConfigSha256 !== executor.effectiveConfigSha256) {
    return { eligible: false as const, reason: "worker-harness-manifest-mismatch" };
  }
  if (!executor.runtimeArtifact
    || harnessRuntimeArtifactIssues(executor.runtimeArtifact).length > 0
    || !/^sha256:[a-f0-9]{64}$/i.test(executor.runtimeArtifactSha256 ?? "")
    || harnessRuntimeArtifactDigest(executor.runtimeArtifact) !== executor.runtimeArtifactSha256) {
    return { eligible: false as const, reason: "worker-runtime-artifact-invalid" };
  }
  if (requirements.executor.runtimeArtifactSha256 !== undefined
    && (!/^sha256:[a-f0-9]{64}$/i.test(requirements.executor.runtimeArtifactSha256)
      || executor.runtimeArtifactSha256 !== requirements.executor.runtimeArtifactSha256)) {
    return { eligible: false as const, reason: "worker-runtime-artifact-mismatch" };
  }
  const offline = requirements.executionBackend === "isolated-container";
  if (offline ? (!isNoInferenceConstraint(requirements.inferenceConstraint)
      || requirements.provider !== null || requirements.model !== null || requirements.modelRouteDigest !== undefined
      || harnessCapabilityManifestDigest(executor.capabilityManifest) !== harnessCapabilityManifestDigest(ISOLATED_INVOCATION_MANIFEST)
      || executor.runtimeArtifactSha256 !== harnessRuntimeArtifactDigest(ISOLATED_INVOCATION_ADAPTER_ARTIFACT))
    : (requirements.inferenceConstraint !== undefined || !harnessSupportsModel(executor.capabilityManifest, requirements.provider, requirements.model))) {
    return { eligible: false as const, reason: "worker-harness-model-unsupported" };
  }
  if (!harnessCapabilityRequirementsSatisfied(executor.capabilityManifest, requirements.harnessCapabilities)) {
    return { eligible: false as const, reason: "worker-harness-capability-missing" };
  }
  if (!executor.isolationModes.includes(requirements.isolation)) {
    return { eligible: false as const, reason: "worker-isolation-unsupported" };
  }
  if (requirements.executionBackend
    && !runtime.executionBackends.includes(requirements.executionBackend)) {
    return { eligible: false as const, reason: "worker-backend-unsupported" };
  }
  if (requirements.executionBackend
    && !executor.capabilityManifest?.admission.executionBackends.includes(requirements.executionBackend)) {
    return { eligible: false as const, reason: "worker-harness-backend-unsupported" };
  }
  if (!requirements.sandboxCapabilities.every((capability) => runtime.sandboxCapabilities.includes(capability))) {
    return { eligible: false as const, reason: "worker-sandbox-capability-missing" };
  }
  const repository = runtime.repositoryAccess.find((candidate) => candidate.repositoryId === requirements.repositoryId);
  if (!repository || repository.access !== "READ_WRITE") {
    return { eligible: false as const, reason: "worker-repository-access-missing" };
  }
  const exactBindingValues = [
    requirements.factoryDefinitionVersionId,
    requirements.factoryConfigurationDigest,
    ...(offline ? [] : [requirements.modelRouteDigest]),
    requirements.executionRuntimeArtifactSha256,
  ];
  if (exactBindingValues.some(Boolean) && !exactBindingValues.every(Boolean)) {
    return { eligible: false as const, reason: "worker-version-requirements-incomplete" };
  }
  if (requirements.factoryDefinitionVersionId) {
    const exactBinding = runtime.factoryVersionBindings?.find((binding) =>
      factoryWorkerVersionBindingMatches({
        binding,
        requirements: {
          factoryDefinitionVersionId: requirements.factoryDefinitionVersionId!,
          factoryConfigurationDigest: requirements.factoryConfigurationDigest!,
          adapter: requirements.executor.adapter,
          version: requirements.executor.version,
          provider: offline ? undefined : requirements.provider!,
          model: offline ? undefined : requirements.model!,
          capabilityManifestSha256: requirements.executor.capabilityManifestSha256,
          effectiveConfigSha256: requirements.executor.effectiveConfigSha256,
          runtimeArtifactSha256: requirements.executionRuntimeArtifactSha256!,
          requireRuntimeArtifactBinding: requirements.executor.requireFactoryVersionRuntimeArtifactBinding === true,
          executionBackend: requirements.executionBackend!,
          modelRouteDigest: requirements.modelRouteDigest!,
          inferenceConstraint: requirements.inferenceConstraint,
          sandboxProfileDigest: requirements.sandboxProfileDigest,
          repositoryId: requirements.repositoryId,
        },
      })
    );
    if (!exactBinding) return { eligible: false as const, reason: "worker-factory-version-mismatch" };
  }
  return {
    eligible: true as const,
    workerId: worker.workerId,
    sessionId: runtime.sessionId,
    generation: runtime.generation,
  };
}

export function countActiveFactoryWorkerLeases(input: {
  runs: Array<{
    status?: string;
    lease?: {
      workerId?: string;
      expiresAt: number;
    };
  }>;
  workerId: string;
  now: number;
}) {
  return input.runs.filter((run) => run.status === "RUNNING"
    && run.lease?.workerId === input.workerId
    && run.lease.expiresAt > input.now).length;
}

export function factoryWorkerRegistrationIssues(input: {
  sessionId: string;
  hostRuntimeType: string;
  executionBackends: string[];
  supportedExecutors: FactoryWorkerExecutorCapability[];
  sandboxCapabilities: string[];
  repositoryAccess: Array<{ repositoryId: string; access: "READ" | "READ_WRITE" }>;
  factoryVersionBindings?: FactoryWorkerVersionBinding[];
}) {
  const issues: string[] = [];
  if (!boundedIdentity(input.sessionId, 200)) issues.push("session-id-invalid");
  if (!boundedIdentity(input.hostRuntimeType, 100)) issues.push("host-runtime-type-invalid");
  if (!boundedUniqueStrings(input.executionBackends, 16, 100)) issues.push("execution-backends-invalid");
  if (!boundedUniqueStrings(input.sandboxCapabilities, 32, 100)) issues.push("sandbox-capabilities-invalid");
  if (input.supportedExecutors.length < 1 || input.supportedExecutors.length > 16
    || new Set(input.supportedExecutors.map((executor) => `${executor.adapter}\0${executor.version}`)).size !== input.supportedExecutors.length
    || input.supportedExecutors.some((executor) =>
      !boundedIdentity(executor.adapter, 100)
      || !boundedIdentity(executor.version, 100)
      || !/^sha256:[a-f0-9]{64}$/i.test(executor.capabilityManifestSha256 ?? "")
      || !/^[a-f0-9]{64}$/i.test(executor.effectiveConfigSha256 ?? "")
      || !executor.runtimeArtifact
      || harnessRuntimeArtifactIssues(executor.runtimeArtifact).length > 0
      || !/^sha256:[a-f0-9]{64}$/i.test(executor.runtimeArtifactSha256 ?? "")
      || harnessRuntimeArtifactDigest(executor.runtimeArtifact) !== executor.runtimeArtifactSha256
      || !executor.capabilityManifest
      || harnessManifestIssues(executor.capabilityManifest).length > 0
      || executor.capabilityManifest.identity.adapterId !== executor.adapter
      || executor.capabilityManifest.identity.adapterVersion !== executor.version
      || harnessCapabilityManifestDigest(executor.capabilityManifest) !== executor.capabilityManifestSha256
      || executor.capabilityManifest.effectiveConfigSha256 !== executor.effectiveConfigSha256
      || executor.isolationModes.length < 1
      || new Set(executor.isolationModes).size !== executor.isolationModes.length
    )) {
    issues.push("executor-capabilities-invalid");
  }
  if (input.repositoryAccess.length < 1 || input.repositoryAccess.length > 100
    || new Set(input.repositoryAccess.map((repository) => repository.repositoryId)).size !== input.repositoryAccess.length
    || input.repositoryAccess.some((repository) => !boundedIdentity(repository.repositoryId, 200))) {
    issues.push("repository-access-invalid");
  }
  if (input.factoryVersionBindings !== undefined && (
    input.factoryVersionBindings.length < 1
    || input.factoryVersionBindings.length > 32
    || new Set(input.factoryVersionBindings.map((binding) => binding.factoryDefinitionVersionId)).size !== input.factoryVersionBindings.length
    || input.factoryVersionBindings.some((binding) =>
      !boundedIdentity(binding.factoryDefinitionVersionId, 200)
      || !/^factory-v1-[a-f0-9]{8}$/i.test(binding.factoryConfigurationDigest)
      || !boundedIdentity(binding.adapter, 100)
      || !boundedIdentity(binding.version, 100)
      || (binding.executionBackend === "isolated-container"
        ? (!isNoInferenceConstraint(binding.inferenceConstraint) || binding.provider !== undefined || binding.model !== undefined || binding.modelRouteDigest !== undefined
          || !binding.runtimeArtifactSha256 || !binding.sandboxProfileDigest)
        : (binding.inferenceConstraint !== undefined || !boundedIdentity(binding.provider ?? "", 100)
          || !boundedIdentity(binding.model ?? "", 200) || !/^sha256:[a-f0-9]{64}$/i.test(binding.modelRouteDigest ?? "")))
      || !/^sha256:[a-f0-9]{64}$/i.test(binding.capabilityManifestSha256)
      || !/^[a-f0-9]{64}$/i.test(binding.effectiveConfigSha256)
      || (binding.runtimeArtifactSha256 !== undefined && !/^sha256:[a-f0-9]{64}$/i.test(binding.runtimeArtifactSha256))
      || !boundedIdentity(binding.executionBackend, 100)
      || (binding.sandboxProfileDigest !== undefined && !/^sha256:[a-f0-9]{64}$/i.test(binding.sandboxProfileDigest))
      || !boundedIdentity(binding.repositoryId, 200)
    )
  )) issues.push("factory-version-bindings-invalid");
  return issues;
}

function boundedIdentity(value: string, maximum: number) {
  return value === value.trim() && value.length > 0 && value.length <= maximum;
}

function boundedUniqueStrings(values: string[], maximumItems: number, maximumLength: number) {
  return values.length > 0
    && values.length <= maximumItems
    && new Set(values).size === values.length
    && values.every((value) => boundedIdentity(value, maximumLength));
}
