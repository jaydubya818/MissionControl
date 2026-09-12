import {
  GENERIC_HARNESS_CONTRACT_VERSION,
  harnessCapabilityManifestDigest,
  harnessManifestIssues,
  harnessRuntimeArtifactDigest,
  harnessRuntimeArtifactIssues,
  type ExecutorRequest,
  type HarnessCapabilityManifest,
  type HarnessExecutionBackend,
  type HarnessExecutorAdapter,
  type HarnessExecutorCapabilities,
  type HarnessRuntimeArtifactIdentity,
} from "@mission-control/workflow-engine";
import { ISOLATED_INVOCATION_MANIFEST, ISOLATED_INVOCATION_ADAPTER_ARTIFACT } from "@mission-control/workflow-engine/harness-contract";

export interface HarnessAdapterBinding {
  adapter: string;
  version: string;
}

export interface RemoteHarnessInvocation {
  command: string;
  args: string[];
  resultPath?: string;
  outputSchemaPath?: string;
  outputSchema?: Record<string, unknown>;
  model?: string;
  provider?: string;
  modelRouteDigest?: string;
  providerRoute?: string;
  reasoningConfig?: ExecutorRequest["reasoningConfig"];
  prompt: string;
  allowedPaths: string[];
  timeoutMs: number;
}

export interface RemoteHarnessInvocationContext {
  repositoryRoot: string;
  resultPath: string;
}

export type HarnessRuntimeAdapter = HarnessExecutorAdapter<any, any> & {
  validateRemoteConfiguration?: (request: ExecutorRequest) => ReturnType<HarnessExecutorAdapter["validateConfiguration"]>;
  createRemoteInvocation?: (
    request: ExecutorRequest,
    context: RemoteHarnessInvocationContext,
  ) => RemoteHarnessInvocation;
};

export interface RegisteredHarnessAdapter {
  adapter: HarnessRuntimeAdapter;
  capabilities: HarnessExecutorCapabilities;
  manifest?: HarnessCapabilityManifest;
  capabilityManifestSha256?: string;
  effectiveConfigSha256?: string;
  runtimeArtifact: HarnessRuntimeArtifactIdentity;
  runtimeArtifactSha256: string;
}

export class HarnessAdapterRegistry {
  private readonly adapters = new Map<string, RegisteredHarnessAdapter>();

  constructor(
    adapters: HarnessRuntimeAdapter[],
    options: { requiredExecutionBackends?: HarnessExecutionBackend[] } = {},
  ) {
    for (const adapter of adapters) {
      const capabilities = snapshotCapabilities(adapter.capabilities());
      validateCapabilities(capabilities);
      const manifest = capabilities.capabilityManifest;
      if (manifest) validateManifest(capabilities, manifest);
      const key = bindingKey(capabilities);
      if (this.adapters.has(key)) throw new Error(`Duplicate harness adapter registration: ${key}.`);
      if (capabilities.executionBackends.includes("remote-sandbox") && !adapter.createRemoteInvocation) {
        throw new Error(`Harness adapter ${key} advertises remote-sandbox without a remote invocation builder.`);
      }
      for (const backend of options.requiredExecutionBackends ?? []) {
        if (!capabilities.executionBackends.includes(backend)) {
          throw new Error(`Harness adapter ${key} does not support required worker backend ${backend}.`);
        }
      }
      this.adapters.set(key, {
        adapter,
        capabilities,
        manifest: manifest ? snapshotManifest(manifest) : undefined,
        capabilityManifestSha256: manifest ? harnessCapabilityManifestDigest(manifest) : undefined,
        effectiveConfigSha256: manifest?.effectiveConfigSha256,
        runtimeArtifact: structuredClone(capabilities.runtimeArtifact),
        runtimeArtifactSha256: harnessRuntimeArtifactDigest(capabilities.runtimeArtifact),
      });
    }
  }

  resolve(binding: HarnessAdapterBinding): HarnessRuntimeAdapter | undefined {
    return this.adapters.get(bindingKey(binding))?.adapter;
  }

  require(binding: HarnessAdapterBinding): HarnessRuntimeAdapter {
    const adapter = this.resolve(binding);
    if (!adapter) throw new Error(`Worker does not provide harness adapter ${bindingKey(binding)}.`);
    return adapter;
  }

  supports(binding: HarnessAdapterBinding, backend?: HarnessExecutionBackend): boolean {
    const registration = this.adapters.get(bindingKey(binding));
    return Boolean(registration && (!backend || registration.capabilities.executionBackends.includes(backend)));
  }

  requireCapabilities(binding: HarnessAdapterBinding): HarnessExecutorCapabilities {
    const registration = this.adapters.get(bindingKey(binding));
    if (!registration) throw new Error(`Worker does not provide harness adapter ${bindingKey(binding)}.`);
    return snapshotCapabilities(registration.capabilities);
  }

  requireRegistration(binding: HarnessAdapterBinding): RegisteredHarnessAdapter {
    const registration = this.adapters.get(bindingKey(binding));
    if (!registration) throw new Error(`Worker does not provide harness adapter ${bindingKey(binding)}.`);
    return {
      ...registration,
      capabilities: snapshotCapabilities(registration.capabilities),
      manifest: registration.manifest ? snapshotManifest(registration.manifest) : undefined,
      runtimeArtifact: structuredClone(registration.runtimeArtifact),
    };
  }

  capabilities(): HarnessExecutorCapabilities[] {
    return [...this.adapters.values()].map(({ capabilities }) => snapshotCapabilities(capabilities));
  }

  registrations(): RegisteredHarnessAdapter[] {
    return [...this.adapters.values()].map((registration) => ({
      ...registration,
      capabilities: snapshotCapabilities(registration.capabilities),
      manifest: registration.manifest ? snapshotManifest(registration.manifest) : undefined,
      runtimeArtifact: structuredClone(registration.runtimeArtifact),
    }));
  }
}

function bindingKey(binding: HarnessAdapterBinding): string {
  return `${binding.adapter}/${binding.version}`;
}

function validateCapabilities(capabilities: HarnessExecutorCapabilities) {
  if (capabilities.contractVersion !== GENERIC_HARNESS_CONTRACT_VERSION) {
    throw new Error(`Harness adapter ${bindingKey(capabilities)} does not implement ${GENERIC_HARNESS_CONTRACT_VERSION}.`);
  }
  if (!boundedIdentity(capabilities.adapter) || !boundedIdentity(capabilities.version) || !boundedIdentity(capabilities.displayName, 200)) {
    throw new Error("Harness adapter identity is invalid.");
  }
  if (capabilities.provider !== undefined && !boundedIdentity(capabilities.provider)) {
    throw new Error(`Harness adapter ${bindingKey(capabilities)} provider identity is invalid.`);
  }
  const runtimeArtifactIssues = harnessRuntimeArtifactIssues(capabilities.runtimeArtifact);
  if (runtimeArtifactIssues.length > 0) {
    throw new Error(`Harness adapter ${bindingKey(capabilities)} runtime artifact is invalid (${runtimeArtifactIssues.join(", ")}).`);
  }
  if (capabilities.executionBackends.length === 0
    || new Set(capabilities.executionBackends).size !== capabilities.executionBackends.length
    || capabilities.executionBackends.some((backend) => !["persistent-worker", "remote-sandbox", "isolated-container"].includes(backend))) {
    throw new Error(`Harness adapter ${bindingKey(capabilities)} execution backends are invalid.`);
  }
  if (capabilities.executionBackends.includes("isolated-container")
    && (capabilities.executionBackends.length !== 1 || capabilities.provider !== undefined
      || capabilities.supportsRepositoryMutation || capabilities.supportsResume
      || !capabilities.capabilityManifest
      || harnessCapabilityManifestDigest(capabilities.capabilityManifest) !== harnessCapabilityManifestDigest(ISOLATED_INVOCATION_MANIFEST)
      || harnessRuntimeArtifactDigest(capabilities.runtimeArtifact) !== harnessRuntimeArtifactDigest(ISOLATED_INVOCATION_ADAPTER_ARTIFACT))) {
    throw new Error("Isolated worker registration requires the exact offline backend artifact and manifest without inference or repository authority.");
  }
  const authorityDomains = ["worker", "verification", "publication", "acceptance", "memory", "observability", "learning"] as const;
  const authorityKeys = Object.keys(capabilities.authority);
  const invalidAuthority = authorityDomains.find((domain) => capabilities.authority[domain] !== "NONE");
  if (authorityKeys.length !== authorityDomains.length
    || authorityKeys.some((domain) => !authorityDomains.includes(domain as typeof authorityDomains[number]))
    || invalidAuthority) {
    throw new Error(`Harness adapter ${bindingKey(capabilities)} must declare every canonical authority as NONE.`);
  }
  if (capabilities.supportsCancel !== true
    || typeof capabilities.supportsResume !== "boolean"
    || typeof capabilities.supportsRepositoryMutation !== "boolean"
    || capabilities.isolationModes.length === 0
    || new Set(capabilities.isolationModes).size !== capabilities.isolationModes.length
    || capabilities.isolationModes.some((mode) => !["READ_ONLY", "WORKSPACE_WRITE"].includes(mode))) {
    throw new Error(`Harness adapter ${bindingKey(capabilities)} execution capabilities are invalid.`);
  }
}

function validateManifest(capabilities: HarnessExecutorCapabilities, manifest: HarnessCapabilityManifest) {
  const issues = harnessManifestIssues(manifest);
  if (issues.length > 0) {
    throw new Error(`Harness manifest ${bindingKey(capabilities)} is invalid (${issues.join(", ")}).`);
  }
  if (manifest.identity.adapterId !== capabilities.adapter
    || manifest.identity.adapterVersion !== capabilities.version) {
    throw new Error(`Harness manifest identity does not match ${bindingKey(capabilities)}.`);
  }
  if (manifest.admission.executionBackends.length !== capabilities.executionBackends.length
    || manifest.admission.executionBackends.some((backend) => !capabilities.executionBackends.includes(backend as HarnessExecutionBackend))) {
    throw new Error(`Harness manifest execution backends do not match ${bindingKey(capabilities)}.`);
  }
  const manifestSupportsCancel = manifest.cancellation.support === "SUPPORTED" || manifest.cancellation.support === "PARTIAL";
  const manifestSupportsResume = manifest.context.resume === "SUPPORTED" || manifest.context.resume === "PARTIAL";
  if (manifestSupportsCancel !== capabilities.supportsCancel
    || manifestSupportsResume !== capabilities.supportsResume
    || manifest.sandbox.isolationModes.length !== capabilities.isolationModes.length
    || manifest.sandbox.isolationModes.some((mode) => !capabilities.isolationModes.includes(mode))) {
    throw new Error(`Harness manifest lifecycle capabilities do not match ${bindingKey(capabilities)}.`);
  }
}

function snapshotCapabilities(capabilities: HarnessExecutorCapabilities): HarnessExecutorCapabilities {
  return {
    ...capabilities,
    capabilityManifest: capabilities.capabilityManifest
      ? snapshotManifest(capabilities.capabilityManifest)
      : undefined,
    runtimeArtifact: structuredClone(capabilities.runtimeArtifact),
    executionBackends: [...capabilities.executionBackends],
    authority: { ...capabilities.authority },
    isolationModes: [...capabilities.isolationModes],
    emittedEvents: [...capabilities.emittedEvents],
  };
}

function snapshotManifest(manifest: HarnessCapabilityManifest): HarnessCapabilityManifest {
  return structuredClone(manifest);
}

function boundedIdentity(value: string, maximum = 100) {
  return value === value.trim() && value.length > 0 && value.length <= maximum && !/[\0\r\n]/.test(value);
}
