import { canonicalHash } from "@mission-control/shared";

export type IsolationMode = "READ_ONLY" | "WORKSPACE_WRITE";
export type FilesystemReadScope = "WORKSPACE_ONLY";
export type HarnessSupportLevel = "SUPPORTED" | "PARTIAL" | "UNSUPPORTED" | "UNKNOWN";
export type HarnessExecutionStatus = "COMPLETED" | "FAILED" | "CANCELED" | "TIMED_OUT";

export type ExecutorEventType =
  | "EXECUTION_STARTED"
  | "COMMAND_STARTED"
  | "COMMAND_COMPLETED"
  | "TOOL_CALLED"
  | "ARTIFACT_PRODUCED"
  | "EXECUTION_COMPLETED"
  | "EXECUTION_FAILED"
  | "EXECUTION_CANCELED";

export const GENERIC_HARNESS_CONTRACT_VERSION = "generic-harness-contract/v1" as const;

export type HarnessExecutionBackend = "persistent-worker" | "remote-sandbox";
export type HarnessAuthorityLevel = "NONE";

export interface HarnessRuntimeArtifactIdentity {
  schemaVersion: "harness-runtime-artifact/v1";
  kind: "EXECUTABLE" | "CONTAINER_IMAGE";
  name: string;
  version: string | null;
  executableSha256: string | null;
  imageDigest: string | null;
}

export interface HarnessAuthorityProfile {
  readonly worker: HarnessAuthorityLevel;
  readonly verification: HarnessAuthorityLevel;
  readonly publication: HarnessAuthorityLevel;
  readonly acceptance: HarnessAuthorityLevel;
  readonly memory: HarnessAuthorityLevel;
  readonly observability: HarnessAuthorityLevel;
  readonly learning: HarnessAuthorityLevel;
}

export const NO_HARNESS_AUTHORITY: HarnessAuthorityProfile = Object.freeze({
  worker: "NONE",
  verification: "NONE",
  publication: "NONE",
  acceptance: "NONE",
  memory: "NONE",
  observability: "NONE",
  learning: "NONE",
});

export interface HarnessExecutorCapabilities {
  contractVersion: typeof GENERIC_HARNESS_CONTRACT_VERSION;
  adapter: string;
  version: string;
  displayName: string;
  provider?: string;
  capabilityManifest?: HarnessCapabilityManifest;
  runtimeArtifact: HarnessRuntimeArtifactIdentity;
  executionBackends: HarnessExecutionBackend[];
  authority: HarnessAuthorityProfile;
  supportsCancel: boolean;
  supportsResume: boolean;
  supportsRepositoryMutation: boolean;
  isolationModes: IsolationMode[];
  emittedEvents: ExecutorEventType[];
}

export interface ExecutorConfigurationIssue {
  field: string;
  message: string;
}

export interface ExecutorEstimate {
  estimatedCostUsd: number | null;
  estimatedRuntimeMinutes: number | null;
  confidence: "LOW" | "MEDIUM" | "HIGH";
}

/**
 * Inference controls that are part of an exact model-route identity.
 *
 * Adapters must either translate every supplied control into the underlying
 * harness invocation or reject the request before execution.
 */
export interface ModelRouteReasoningConfig {
  effort?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ExecutorRequest {
  executionId: string;
  repositoryRoot: string;
  workingDirectory: string;
  prompt: string;
  model?: string;
  provider?: string;
  /** Additive exact-route fields. Legacy V1 requests may omit them. */
  modelRouteDigest?: string;
  providerRoute?: string;
  reasoningConfig?: ModelRouteReasoningConfig;
  allowedPaths: string[];
  deniedPaths?: string[];
  timeoutMs: number;
  isolation: IsolationMode;
  /**
   * Requires the adapter to enforce an operating-system read boundary around
   * repositoryRoot. Request metadata and prompt instructions are not enough.
   */
  filesystemReadScope?: FilesystemReadScope;
  outputDirectory?: string;
  structuredOutput?: {
    schemaId: string;
    jsonSchema: Record<string, unknown>;
  };
}

export interface ExecutorEvent {
  executionId: string;
  sequence: number;
  type: ExecutorEventType;
  occurredAt: number;
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutorResult {
  executionId: string;
  status: "COMPLETED" | "FAILED" | "CANCELED";
  exitCode?: number;
  output?: string;
  error?: string;
  normalizedResult?: HarnessNormalizedResult;
}

export interface ExecutorHealth {
  status: "READY" | "DEGRADED" | "UNAVAILABLE";
  checkedAt: number;
  adapter: string;
  version: string;
  details?: string;
}

export interface ExecutorProcessObserver {
  started(process: { pid: number; startedAt: number }): Promise<void> | void;
  terminated(process: { pid: number; terminatedAt: number; exitCode?: number }): Promise<void> | void;
}

export interface HarnessModelCapability {
  provider: string;
  modelId: string;
  selection: "ADVERTISED" | "PASSTHROUGH" | "DYNAMIC";
  contextWindowTokens: number | null;
  modalities: string[];
}

export interface HarnessCapabilityManifest {
  schemaVersion: "harness-capability-manifest/v1";
  scope: "ADAPTER_EFFECTIVE";
  identity: {
    harnessId: string;
    harnessVersion: string;
    harnessCommit: string;
    adapterId: string;
    adapterVersion: string;
  };
  effectiveConfigSha256: string;
  models: {
    providerSelection: HarnessSupportLevel;
    modelSelection: HarnessSupportLevel;
    supported: HarnessModelCapability[];
    reasoningControls: HarnessSupportLevel;
  };
  filesystem: {
    read: HarnessSupportLevel;
    write: HarnessSupportLevel;
    pathAllowlist: HarnessSupportLevel;
    changedFileCapture: HarnessSupportLevel;
  };
  shell: {
    available: HarnessSupportLevel;
    commandTimeout: HarnessSupportLevel;
    processTreeCancellation: HarnessSupportLevel;
    credentialEnvironmentScrub: HarnessSupportLevel;
  };
  git: {
    status: HarnessSupportLevel;
    diff: HarnessSupportLevel;
    commit: HarnessSupportLevel;
    branch: HarnessSupportLevel;
    remotePublication: HarnessSupportLevel;
  };
  browser: {
    webSearch: HarnessSupportLevel;
    webFetch: HarnessSupportLevel;
    interactiveBrowser: HarnessSupportLevel;
  };
  tools: {
    native: HarnessSupportLevel;
    mcp: HarnessSupportLevel;
    structuredOutput: HarnessSupportLevel;
    telemetry: HarnessSupportLevel;
  };
  subagents: {
    available: HarnessSupportLevel;
    parallel: HarnessSupportLevel;
    background: HarnessSupportLevel;
    eventVisibility: HarnessSupportLevel;
  };
  streaming: {
    events: HarnessSupportLevel;
    modelDeltas: HarnessSupportLevel;
    durableReplay: HarnessSupportLevel;
  };
  context: {
    persistentSessions: HarnessSupportLevel;
    resume: HarnessSupportLevel;
    fork: HarnessSupportLevel;
    compaction: HarnessSupportLevel;
    instructionFiles: HarnessSupportLevel;
  };
  headless: {
    support: HarnessSupportLevel;
    mode: "CLI_JSONL" | "CLI_TEXT" | "API" | "NONE";
  };
  cancellation: {
    support: HarnessSupportLevel;
    mode: "PROCESS_SIGNAL" | "IN_PROCESS_AGENT" | "NONE";
    idempotentCleanup: boolean;
  };
  sandbox: {
    isolationModes: IsolationMode[];
    externalSandboxRecommended: boolean;
    requirements: string[];
  };
  network: {
    providerApi: boolean;
    packageInstall: boolean;
    runtimeEgressControl: HarnessSupportLevel;
    destinations: string[];
  };
  credentials: {
    classes: string[];
    passedToToolProcesses: boolean;
    redaction: HarnessSupportLevel;
  };
  telemetry: {
    tokens: HarnessSupportLevel;
    cost: HarnessSupportLevel;
    toolCalls: HarnessSupportLevel;
    modelRequests: HarnessSupportLevel;
    retries: HarnessSupportLevel;
  };
  admission: {
    maturity: "EXPERIMENTAL" | "PREVIEW" | "PRODUCTION";
    executionBackends: string[];
    requiredExternalControls: string[];
    prohibitedAuthorities: string[];
  };
  limitations: string[];
}

export interface HarnessCapabilityRequirement {
  capability: string;
  minimumSupport: "PARTIAL" | "SUPPORTED";
}

export interface HarnessChangedFile {
  path: string;
  status: string;
  additions: number | null;
  deletions: number | null;
}

export interface HarnessNormalizedResult {
  schemaVersion: "harness-result/v1";
  executionId: string;
  status: HarnessExecutionStatus;
  harness: HarnessCapabilityManifest["identity"];
  provenance: {
    provider: string | null;
    model: string | null;
    /** Additive exact-route provenance. Older persisted V1 results may omit it. */
    modelRouteDigest?: string;
    providerRoute?: string;
    reasoningConfig?: ModelRouteReasoningConfig;
    capabilityManifestSha256: string;
    effectiveConfigSha256: string;
    executableSha256: string | null;
    /** Additive V1 provenance. Older persisted results may omit these fields. */
    runtimeArtifact?: HarnessRuntimeArtifactIdentity;
    runtimeArtifactDigest?: string;
    imageDigest?: string | null;
    requestSha256: string;
    providerMetadata: Record<string, string | number | boolean | null>;
  };
  timing: {
    startedAt: number;
    finishedAt: number;
    wallClockMs: number;
  };
  repository: {
    root: string;
    workingDirectory: string;
    baselineCommit: string | null;
    headCommit: string | null;
    headChanged: boolean;
    changedFiles: HarnessChangedFile[];
    scopeViolations: string[];
  };
  events: {
    items: ExecutorEvent[];
    toolCalls: number | null;
    modelRequests: number | null;
    retries: number | null;
    sessionCount: number | null;
  };
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    cacheReadTokens: number | null;
    cacheWriteTokens: number | null;
    costUsd: number | null;
  };
  exitCode: number | null;
  signal: string | null;
  output: string;
  structuredOutput: {
    schema: string | null;
    summary: string | null;
  };
  error: string | null;
  cancellation: {
    requested: boolean;
    mode: "PROCESS_SIGNAL" | "IN_PROCESS_AGENT" | "NONE";
  };
  cleanup: {
    status: "NOT_RUN" | "COMPLETED" | "FAILED";
    completedAt: number | null;
    error: string | null;
  };
}

export interface HarnessExecutionContext {
  emit: (event: ExecutorEvent) => Promise<void> | void;
  signal?: AbortSignal;
  processObserver?: ExecutorProcessObserver;
}

export interface HarnessExecutorAdapter<TPrepared = unknown, THandle = unknown> {
  capabilities(): HarnessExecutorCapabilities;
  validateConfiguration(request: ExecutorRequest): ExecutorConfigurationIssue[];
  estimate(request: ExecutorRequest): Promise<ExecutorEstimate>;
  prepare(
    request: ExecutorRequest,
    context: HarnessExecutionContext,
  ): Promise<TPrepared>;
  execute(prepared: TPrepared): Promise<THandle>;
  collectResult(handle: THandle): Promise<ExecutorResult>;
  cancel(handle: THandle, reason?: string): Promise<boolean>;
  cleanup(handle: THandle): Promise<void>;
  health(): Promise<ExecutorHealth>;
}

export async function runHarnessExecution<TPrepared, THandle>(
  adapter: HarnessExecutorAdapter<TPrepared, THandle>,
  request: ExecutorRequest,
  context: HarnessExecutionContext,
): Promise<ExecutorResult> {
  const prepared = await adapter.prepare(request, context);
  const handle = await adapter.execute(prepared);
  let cancellation: Promise<boolean> | undefined;
  const requestCancellation = () => {
    cancellation ??= Promise.resolve().then(() => adapter.cancel(handle, abortReason(context.signal)));
    void cancellation.catch(() => undefined);
  };
  if (context.signal?.aborted) requestCancellation();
  else context.signal?.addEventListener("abort", requestCancellation, { once: true });
  try {
    return await adapter.collectResult(handle);
  } finally {
    context.signal?.removeEventListener("abort", requestCancellation);
    try {
      if (cancellation) await cancellation;
    } finally {
      await adapter.cleanup(handle);
    }
  }
}

function abortReason(signal?: AbortSignal): string | undefined {
  if (!signal?.aborted || signal.reason === undefined) return undefined;
  return signal.reason instanceof Error ? signal.reason.message : String(signal.reason);
}

// Compatibility aliases keep downstream type imports stable while the product
// terminology moves from a Codex-specific executor to a generic harness.
export type ExecutorCapabilities = HarnessExecutorCapabilities;
export type ExecutorAdapter<TPrepared = unknown, THandle = unknown> = HarnessExecutorAdapter<TPrepared, THandle>;

export function harnessCapabilityManifestDigest(manifest: HarnessCapabilityManifest): string {
  return `sha256:${canonicalHash(manifest)}`;
}

export function harnessExecutionRequestDigest(request: ExecutorRequest): string {
  return `sha256:${canonicalHash(request)}`;
}

export function modelRouteReasoningConfigIssues(input: unknown): string[] {
  if (input === undefined) return [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return ["reasoning-config-shape-invalid"];
  const reasoning = input as Record<string, unknown>;
  const keys = Object.keys(reasoning);
  if (keys.length === 0 || keys.some((key) => !["effort", "temperature", "maxTokens"].includes(key))) {
    return ["reasoning-config-fields-invalid"];
  }
  const issues: string[] = [];
  if (reasoning.effort !== undefined
    && !boundedLowercaseIdentity(reasoning.effort, 64)) {
    issues.push("reasoning-effort-invalid");
  }
  if (reasoning.temperature !== undefined
    && (typeof reasoning.temperature !== "number"
      || !Number.isFinite(reasoning.temperature)
      || reasoning.temperature < 0
      || reasoning.temperature > 2)) {
    issues.push("reasoning-temperature-invalid");
  }
  if (reasoning.maxTokens !== undefined
    && (!Number.isSafeInteger(reasoning.maxTokens)
      || (reasoning.maxTokens as number) < 1
      || (reasoning.maxTokens as number) > 10_000_000)) {
    issues.push("reasoning-max-tokens-invalid");
  }
  return issues;
}

export function harnessRuntimeArtifactIssues(input: unknown): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return ["runtime-artifact-shape-invalid"];
  const artifact = input as Record<string, unknown>;
  const issues: string[] = [];
  if (Object.keys(artifact).some((key) => ![
    "schemaVersion",
    "kind",
    "name",
    "version",
    "executableSha256",
    "imageDigest",
  ].includes(key))) {
    issues.push("runtime-artifact-fields-invalid");
  }
  if (artifact.schemaVersion !== "harness-runtime-artifact/v1") issues.push("runtime-artifact-version-invalid");
  if (artifact.kind !== "EXECUTABLE" && artifact.kind !== "CONTAINER_IMAGE") issues.push("runtime-artifact-kind-invalid");
  if (typeof artifact.name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(artifact.name)) {
    issues.push("runtime-artifact-name-invalid");
  }
  if (artifact.version !== null
    && (typeof artifact.version !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,199}$/.test(artifact.version))) {
    issues.push("runtime-artifact-release-invalid");
  }
  if (artifact.executableSha256 !== null
    && (typeof artifact.executableSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(artifact.executableSha256))) {
    issues.push("runtime-artifact-executable-digest-invalid");
  }
  if (typeof artifact.executableSha256 === "string"
    && /^[a-f0-9]{64}$/i.test(artifact.executableSha256)
    && artifact.executableSha256 !== artifact.executableSha256.toLowerCase()) {
    issues.push("runtime-artifact-executable-digest-noncanonical");
  }
  if (artifact.imageDigest !== null
    && (typeof artifact.imageDigest !== "string" || !/^sha256:[a-f0-9]{64}$/i.test(artifact.imageDigest))) {
    issues.push("runtime-artifact-image-digest-invalid");
  }
  if (typeof artifact.imageDigest === "string"
    && /^sha256:[a-f0-9]{64}$/i.test(artifact.imageDigest)
    && artifact.imageDigest !== artifact.imageDigest.toLowerCase()) {
    issues.push("runtime-artifact-image-digest-noncanonical");
  }
  if (artifact.kind === "EXECUTABLE" && artifact.executableSha256 === null) {
    issues.push("runtime-artifact-executable-missing");
  }
  if (artifact.kind === "EXECUTABLE" && artifact.imageDigest !== null) {
    issues.push("runtime-artifact-image-not-allowed");
  }
  if (artifact.kind === "CONTAINER_IMAGE" && artifact.imageDigest === null) {
    issues.push("runtime-artifact-image-missing");
  }
  if (artifact.kind === "CONTAINER_IMAGE" && artifact.executableSha256 !== null) {
    issues.push("runtime-artifact-executable-not-allowed");
  }
  return issues;
}

export function harnessRuntimeArtifactDigest(input: HarnessRuntimeArtifactIdentity): string {
  const issues = harnessRuntimeArtifactIssues(input);
  if (issues.length > 0) throw new Error(`Harness runtime artifact is invalid (${issues.join(", ")}).`);
  return `sha256:${canonicalHash({ namespace: "harness-runtime-artifact/v1", value: input })}`;
}

export function boundedProviderMetadata(
  value: Record<string, unknown>,
): Record<string, string | number | boolean | null> {
  const entries = Object.entries(value);
  if (entries.length > 50) throw new Error("Provider metadata cannot exceed 50 properties.");
  return Object.fromEntries(entries.map(([key, item]) => {
    if (!/^[A-Za-z][A-Za-z0-9._-]{0,99}$/.test(key)) {
      throw new Error(`Provider metadata key is invalid: ${key}`);
    }
    if (item !== null && !["string", "number", "boolean"].includes(typeof item)) {
      throw new Error(`Provider metadata value must be scalar: ${key}`);
    }
    if (typeof item === "string" && item.length > 500) {
      throw new Error(`Provider metadata string is too long: ${key}`);
    }
    if (typeof item === "number" && !Number.isFinite(item)) {
      throw new Error(`Provider metadata number must be finite: ${key}`);
    }
    return [key, item as string | number | boolean | null];
  }));
}

const SUPPORT_RANK: Record<HarnessSupportLevel, number> = {
  UNKNOWN: 0,
  UNSUPPORTED: 0,
  PARTIAL: 1,
  SUPPORTED: 2,
};

export function harnessCapabilitySupport(
  manifest: HarnessCapabilityManifest,
  capability: string,
): HarnessSupportLevel | undefined {
  const [group, property, extra] = capability.split(".");
  if (extra || !group || !property) return undefined;
  const candidate = (manifest as unknown as Record<string, unknown>)[group];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return undefined;
  const value = (candidate as Record<string, unknown>)[property];
  return typeof value === "string" && value in SUPPORT_RANK
    ? value as HarnessSupportLevel
    : undefined;
}

export function harnessCapabilityRequirementsSatisfied(
  manifest: HarnessCapabilityManifest,
  requirements: HarnessCapabilityRequirement[],
): boolean {
  return requirements.every((requirement) => {
    const support = harnessCapabilitySupport(manifest, requirement.capability);
    return support !== undefined && SUPPORT_RANK[support] >= SUPPORT_RANK[requirement.minimumSupport];
  });
}

export function harnessManifestIssues(manifest: HarnessCapabilityManifest): string[] {
  const issues: string[] = [];
  if (!manifest || typeof manifest !== "object" || !manifest.identity || !manifest.models || !manifest.sandbox || !manifest.admission) {
    return ["manifest-shape-invalid"];
  }
  const identity = manifest.identity;
  const boundedId = (value: string, maximum = 100) =>
    value === value.trim() && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && value.length <= maximum;
  if (manifest.schemaVersion !== "harness-capability-manifest/v1" || manifest.scope !== "ADAPTER_EFFECTIVE") {
    issues.push("manifest-version-invalid");
  }
  if (![identity.harnessId, identity.harnessVersion, identity.adapterId, identity.adapterVersion].every((value) => boundedId(value))) {
    issues.push("manifest-identity-invalid");
  }
  if (!/^[a-f0-9]{40}$/i.test(identity.harnessCommit)) issues.push("manifest-commit-invalid");
  if (!/^[a-f0-9]{64}$/i.test(manifest.effectiveConfigSha256)) issues.push("effective-config-digest-invalid");
  if (manifest.models.supported.length < 1 || manifest.models.supported.length > 100) issues.push("supported-models-invalid");
  if (manifest.models.supported.some((model) => !boundedString(model.provider, 100)
    || !boundedString(model.modelId, 200)
    || !["ADVERTISED", "PASSTHROUGH", "DYNAMIC"].includes(model.selection)
    || (model.contextWindowTokens !== null && (!Number.isSafeInteger(model.contextWindowTokens) || model.contextWindowTokens < 1))
    || !boundedStringList(model.modalities, 20, 50))) {
    issues.push("supported-models-invalid");
  }
  const capabilityPaths = [
    "models.providerSelection", "models.modelSelection", "models.reasoningControls",
    "filesystem.read", "filesystem.write", "filesystem.pathAllowlist", "filesystem.changedFileCapture",
    "shell.available", "shell.commandTimeout", "shell.processTreeCancellation", "shell.credentialEnvironmentScrub",
    "git.status", "git.diff", "git.commit", "git.branch", "git.remotePublication",
    "browser.webSearch", "browser.webFetch", "browser.interactiveBrowser",
    "tools.native", "tools.mcp", "tools.structuredOutput", "tools.telemetry",
    "subagents.available", "subagents.parallel", "subagents.background", "subagents.eventVisibility",
    "streaming.events", "streaming.modelDeltas", "streaming.durableReplay",
    "context.persistentSessions", "context.resume", "context.fork", "context.compaction", "context.instructionFiles",
    "headless.support", "cancellation.support", "network.runtimeEgressControl", "credentials.redaction",
    "telemetry.tokens", "telemetry.cost", "telemetry.toolCalls", "telemetry.modelRequests", "telemetry.retries",
  ];
  if (capabilityPaths.some((capability) => harnessCapabilitySupport(manifest, capability) === undefined)) {
    issues.push("capability-support-invalid");
  }
  if (manifest.sandbox.isolationModes.length < 1 || new Set(manifest.sandbox.isolationModes).size !== manifest.sandbox.isolationModes.length) {
    issues.push("isolation-modes-invalid");
  }
  if (manifest.admission.executionBackends.length < 1 || manifest.admission.executionBackends.length > 16) {
    issues.push("execution-backends-invalid");
  }
  if (!boundedStringList(manifest.sandbox.requirements, 100, 500)
    || !boundedStringList(manifest.network.destinations, 100, 500)
    || !boundedStringList(manifest.credentials.classes, 100, 200)
    || !boundedStringList(manifest.admission.requiredExternalControls, 100, 200)
    || !boundedStringList(manifest.admission.prohibitedAuthorities, 100, 200)) {
    issues.push("manifest-bounds-invalid");
  }
  const requiredProhibitedAuthorities = ["worker-leases", "verification-subjects", "verification-plans", "evidence-authority", "github-publication", "acceptance"];
  if (!requiredProhibitedAuthorities.every((authority) => manifest.admission.prohibitedAuthorities.includes(authority))) {
    issues.push("prohibited-authorities-invalid");
  }
  if (manifest.limitations.length > 100 || manifest.limitations.some((item) => !item.trim() || item.length > 1_000)) {
    issues.push("limitations-invalid");
  }
  try {
    boundedProviderMetadata(Object.fromEntries(manifest.credentials.classes.map((item, index) => [`Credential${index}`, item])));
  } catch {
    issues.push("credential-classes-invalid");
  }
  return issues;
}

function boundedString(value: string, maximum: number) {
  return typeof value === "string" && value === value.trim() && value.length > 0 && value.length <= maximum;
}

function boundedStringList(values: string[], maximumItems: number, maximumLength: number) {
  return Array.isArray(values)
    && values.length <= maximumItems
    && new Set(values).size === values.length
    && values.every((value) => boundedString(value, maximumLength));
}

export function harnessNormalizedResultIssues(result: HarnessNormalizedResult): string[] {
  const issues: string[] = [];
  if (!result || typeof result !== "object" || result.schemaVersion !== "harness-result/v1") {
    return ["result-shape-invalid"];
  }
  if (!result.executionId?.trim() || !["COMPLETED", "FAILED", "CANCELED", "TIMED_OUT"].includes(result.status)) {
    issues.push("result-identity-invalid");
  }
  if (!result.harness
    || ![result.harness.harnessId, result.harness.harnessVersion, result.harness.adapterId, result.harness.adapterVersion]
      .every((value) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(value))
    || !/^[a-f0-9]{40}$/i.test(result.harness.harnessCommit)) {
    issues.push("result-harness-identity-invalid");
  }
  if (!result.provenance
    || (result.provenance.provider !== null && typeof result.provenance.provider !== "string")
    || (result.provenance.model !== null && typeof result.provenance.model !== "string")
    || (result.provenance.modelRouteDigest !== undefined
      && !/^sha256:[a-f0-9]{64}$/i.test(result.provenance.modelRouteDigest))
    || (result.provenance.providerRoute !== undefined
      && !boundedLowercaseIdentity(result.provenance.providerRoute, 100))
    || modelRouteReasoningConfigIssues(result.provenance.reasoningConfig).length > 0
    || !/^sha256:[a-f0-9]{64}$/i.test(result.provenance.capabilityManifestSha256)
    || !/^[a-f0-9]{64}$/i.test(result.provenance.effectiveConfigSha256)
    || (result.provenance.executableSha256 !== null && !/^[a-f0-9]{64}$/i.test(result.provenance.executableSha256))
    || (result.provenance.imageDigest !== undefined
      && result.provenance.imageDigest !== null
      && !/^sha256:[a-f0-9]{64}$/i.test(result.provenance.imageDigest))
    || (result.provenance.runtimeArtifact !== undefined
      && harnessRuntimeArtifactIssues(result.provenance.runtimeArtifact).length > 0)
    || (result.provenance.runtimeArtifactDigest !== undefined
      && (!result.provenance.runtimeArtifact
        || !/^sha256:[a-f0-9]{64}$/i.test(result.provenance.runtimeArtifactDigest)
        || harnessRuntimeArtifactDigest(result.provenance.runtimeArtifact) !== result.provenance.runtimeArtifactDigest))
    || !/^sha256:[a-f0-9]{64}$/i.test(result.provenance.requestSha256)) {
    issues.push("result-provenance-invalid");
  }
  try {
    boundedProviderMetadata(result.provenance.providerMetadata);
  } catch {
    issues.push("result-provider-metadata-invalid");
  }
  if (!Number.isFinite(result.timing?.startedAt)
    || !Number.isFinite(result.timing?.finishedAt)
    || !Number.isFinite(result.timing?.wallClockMs)
    || result.timing.finishedAt < result.timing.startedAt
    || result.timing.wallClockMs < 0) {
    issues.push("result-timing-invalid");
  }
  const telemetry = [
    result.events?.toolCalls,
    result.events?.modelRequests,
    result.events?.retries,
    result.events?.sessionCount,
    result.usage?.inputTokens,
    result.usage?.outputTokens,
    result.usage?.cacheReadTokens,
    result.usage?.cacheWriteTokens,
  ];
  if (telemetry.some((value) => value !== null && (!Number.isSafeInteger(value) || value < 0))) {
    issues.push("result-telemetry-invalid");
  }
  if (result.usage?.costUsd !== null && (!Number.isFinite(result.usage?.costUsd) || result.usage.costUsd < 0)) {
    issues.push("result-cost-invalid");
  }
  if (!Array.isArray(result.events?.items)
    || result.events.items.length > 10_000
    || result.events.items.some((item, index) => item.executionId !== result.executionId
      || item.sequence !== index + 1
      || !Number.isFinite(item.occurredAt)
      || typeof item.summary !== "string"
      || item.summary.length > 4_000
      || !(item.type as string).match(/^(EXECUTION_STARTED|COMMAND_STARTED|COMMAND_COMPLETED|TOOL_CALLED|ARTIFACT_PRODUCED|EXECUTION_COMPLETED|EXECUTION_FAILED|EXECUTION_CANCELED)$/)
      || (item.metadata !== undefined && (!item.metadata || typeof item.metadata !== "object" || Array.isArray(item.metadata) || Object.keys(item.metadata).length > 100)))) {
    issues.push("result-events-invalid");
  }
  if (!Array.isArray(result.repository?.changedFiles)
    || !Array.isArray(result.repository?.scopeViolations)
    || result.repository.changedFiles.length > 10_000
    || result.repository.scopeViolations.length > 10_000
    || result.repository.changedFiles.some((item) => !item.path
      || pathEscapesRepository(item.path)
      || !item.status?.trim()
      || (item.additions !== null && (!Number.isSafeInteger(item.additions) || item.additions < 0))
      || (item.deletions !== null && (!Number.isSafeInteger(item.deletions) || item.deletions < 0)))
    || result.repository.scopeViolations.some((item) => typeof item !== "string" || !item.trim())) {
    issues.push("result-repository-invalid");
  }
  if (typeof result.output !== "string"
    || result.output.length > 1_000_000
    || !result.structuredOutput
    || (result.structuredOutput.schema !== null && (typeof result.structuredOutput.schema !== "string" || result.structuredOutput.schema.length > 200))
    || (result.structuredOutput.summary !== null && (typeof result.structuredOutput.summary !== "string" || result.structuredOutput.summary.length > 4_000))
    || (result.error !== null && (typeof result.error !== "string" || result.error.length > 4_000))) {
    issues.push("result-output-invalid");
  }
  if (!Number.isSafeInteger(result.exitCode) && result.exitCode !== null
    || (result.signal !== null && typeof result.signal !== "string")) {
    issues.push("result-process-invalid");
  }
  if (!result.cancellation
    || !["PROCESS_SIGNAL", "IN_PROCESS_AGENT", "NONE"].includes(result.cancellation.mode)
    || (result.status === "CANCELED" && result.cancellation.requested !== true)
    || (result.cancellation.requested && result.cancellation.mode === "NONE")) {
    issues.push("result-cancellation-invalid");
  }
  if (!result.cleanup || !["NOT_RUN", "COMPLETED", "FAILED"].includes(result.cleanup.status)
    || (result.cleanup.completedAt !== null && !Number.isFinite(result.cleanup.completedAt))
    || (result.cleanup.error !== null && typeof result.cleanup.error !== "string")) {
    issues.push("result-cleanup-invalid");
  }
  return issues;
}

function pathEscapesRepository(value: string) {
  return value.startsWith("/") || value.startsWith("\\") || value.split(/[\\/]/).includes("..");
}

function boundedLowercaseIdentity(value: unknown, maximum: number): value is string {
  return typeof value === "string"
    && value === value.trim()
    && value === value.toLowerCase()
    && value.length > 0
    && value.length <= maximum
    && !/[\0\r\n]/.test(value);
}
