import { canonicalHash } from "@mission-control/shared";
import type { HarnessCapabilityManifest, HarnessRuntimeArtifactIdentity } from "./executorAdapter.js";

export const CODEX_HARNESS_EFFECTIVE_CONFIG = {
  cliVersion: "0.146.0",
  mode: "exec",
  ephemeral: true,
  approval: "never",
  ignoreUserConfig: true,
  ignoreRules: true,
  color: "never",
  sandboxFromAttempt: true,
  structuredEvents: "jsonl",
  outputSchema: "factory-result/v1",
  darwinArm64ExecutableSha256: "ae1d3ffe6d48aec6a4dc3f50e7eb8e0d11962485a6a9406c5a7012139383da02",
  resultContract: "factory-result/v1",
  remoteModelProvider: {
    id: "mission-control-openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    envKey: "OPENAI_API_KEY",
    wireApi: "responses",
    supportsWebsockets: false,
  },
} as const;

export const DEEPSEEK_HARNESS_EFFECTIVE_CONFIG = {
  cliVersion: "0.1.0-rc.5",
  provider: "local-ollama",
  model: "qwen3.5:35b-a3b-q8_0",
  providerRuntime: "ollama 0.32.6",
  modelArtifactSha256: "655d273ede3adc056594f511c120d616d92bf4c4d5bcfe580f3cfa29abe8109d",
  loopbackBaseUrl: "http://127.0.0.1:11434/v1",
  approval: "never",
  telemetry: false,
  web: false,
  sessionPersistence: "jsonl",
  resultContract: "factory-result/v1",
} as const;

/** Runtime artifacts are sidecars to the immutable V1 capability manifests.
 * Keeping them separate preserves every historical manifest digest while
 * allowing Factory composition to bind the exact executable independently. */
export const CODEX_V1_RUNTIME_ARTIFACT: HarnessRuntimeArtifactIdentity = {
  schemaVersion: "harness-runtime-artifact/v1",
  kind: "EXECUTABLE",
  name: "codex",
  version: "0.146.0",
  executableSha256: CODEX_HARNESS_EFFECTIVE_CONFIG.darwinArm64ExecutableSha256,
  imageDigest: null,
};

export const DEEPSEEK_V1_RUNTIME_ARTIFACT: HarnessRuntimeArtifactIdentity = {
  schemaVersion: "harness-runtime-artifact/v1",
  kind: "EXECUTABLE",
  name: "deepseek-harness",
  version: "0.1.0-rc.5",
  executableSha256: "c0226687bb20f45c603ec6fe50f3de16d1c3510c3a803304ec575ef9bc366c62",
  closureSha256: "f340dda4710952d53ea3611ace0d04959c1410aeeb9f6464254c644e4aedfa83",
  imageDigest: null,
};

const PROHIBITED_AUTHORITIES = [
  "worker-leases",
  "verification-subjects",
  "verification-plans",
  "evidence-authority",
  "github-publication",
  "acceptance",
] as const;

const REQUIRED_EXTERNAL_CONTROLS = [
  "canonical-worker-lease",
  "mission-control-sandbox-policy",
  "repository-scope-reconciliation",
  "independent-verification",
  "publication-permit",
] as const;

export const CODEX_V1_HARNESS_MANIFEST: HarnessCapabilityManifest = {
  schemaVersion: "harness-capability-manifest/v1",
  scope: "ADAPTER_EFFECTIVE",
  identity: {
    harnessId: "codex-cli",
    harnessVersion: "0.146.0",
    harnessCommit: "e363b08c9175ac1cbe5893615dd2cb9ddf95043b",
    adapterId: "codex",
    adapterVersion: "v1",
  },
  effectiveConfigSha256: canonicalHash(CODEX_HARNESS_EFFECTIVE_CONFIG),
  models: {
    providerSelection: "UNSUPPORTED",
    modelSelection: "SUPPORTED",
    supported: [
      { provider: "openai", modelId: "gpt-5.6-terra", selection: "ADVERTISED", contextWindowTokens: null, modalities: ["text"] },
      { provider: "openai", modelId: "*", selection: "PASSTHROUGH", contextWindowTokens: null, modalities: ["text"] },
    ],
    reasoningControls: "SUPPORTED",
  },
  filesystem: { read: "SUPPORTED", write: "SUPPORTED", pathAllowlist: "PARTIAL", changedFileCapture: "SUPPORTED" },
  shell: { available: "SUPPORTED", commandTimeout: "SUPPORTED", processTreeCancellation: "PARTIAL", credentialEnvironmentScrub: "PARTIAL" },
  git: { status: "SUPPORTED", diff: "SUPPORTED", commit: "SUPPORTED", branch: "SUPPORTED", remotePublication: "UNSUPPORTED" },
  browser: { webSearch: "UNSUPPORTED", webFetch: "UNSUPPORTED", interactiveBrowser: "UNSUPPORTED" },
  tools: { native: "SUPPORTED", mcp: "UNSUPPORTED", structuredOutput: "SUPPORTED", telemetry: "SUPPORTED" },
  subagents: { available: "PARTIAL", parallel: "PARTIAL", background: "PARTIAL", eventVisibility: "PARTIAL" },
  streaming: { events: "SUPPORTED", modelDeltas: "UNSUPPORTED", durableReplay: "UNSUPPORTED" },
  context: { persistentSessions: "UNSUPPORTED", resume: "UNSUPPORTED", fork: "UNSUPPORTED", compaction: "SUPPORTED", instructionFiles: "SUPPORTED" },
  headless: { support: "SUPPORTED", mode: "CLI_JSONL" },
  cancellation: { support: "PARTIAL", mode: "PROCESS_SIGNAL", idempotentCleanup: true },
  sandbox: {
    isolationModes: ["READ_ONLY", "WORKSPACE_WRITE"],
    externalSandboxRecommended: true,
    requirements: ["owned-process-group", "repository-worktree", "post-execution-path-audit"],
  },
  network: { providerApi: true, packageInstall: false, runtimeEgressControl: "PARTIAL", destinations: ["OpenAI Codex service"] },
  credentials: { classes: ["codex-chatgpt-auth"], passedToToolProcesses: false, redaction: "PARTIAL" },
  telemetry: { tokens: "SUPPORTED", cost: "UNSUPPORTED", toolCalls: "SUPPORTED", modelRequests: "UNSUPPORTED", retries: "UNSUPPORTED" },
  admission: {
    maturity: "PRODUCTION",
    executionBackends: ["persistent-worker", "remote-sandbox"],
    requiredExternalControls: [...REQUIRED_EXTERNAL_CONTROLS],
    prohibitedAuthorities: [...PROHIBITED_AUTHORITIES],
  },
  limitations: [
    "Exact model-request and harness-retry counts are not exposed and remain null.",
    "Cost is not reported under saved ChatGPT authentication and remains null.",
    "Cancellation uses process signaling rather than an acknowledged in-agent protocol.",
    "Repository path allowlists are reconciled after execution by Mission Control.",
    "Only openai/gpt-5.6-terra was exercised in the standalone two-harness conformance run; other model IDs use the existing controlled pass-through route.",
  ],
};

export const DEEPSEEK_V1_HARNESS_MANIFEST: HarnessCapabilityManifest = {
  schemaVersion: "harness-capability-manifest/v1",
  scope: "ADAPTER_EFFECTIVE",
  identity: {
    harnessId: "deepseek-harness",
    harnessVersion: "0.1.0-rc.5",
    harnessCommit: "47f943859bef60e4160492346772ded9b24f765a",
    adapterId: "deepseek-harness",
    adapterVersion: "0.2.0",
  },
  effectiveConfigSha256: canonicalHash(DEEPSEEK_HARNESS_EFFECTIVE_CONFIG),
  models: {
    providerSelection: "SUPPORTED",
    modelSelection: "SUPPORTED",
    supported: [
      { provider: "local-ollama", modelId: "qwen3.5:35b-a3b-q8_0", selection: "ADVERTISED", contextWindowTokens: 131_072, modalities: ["text"] },
    ],
    reasoningControls: "PARTIAL",
  },
  filesystem: { read: "SUPPORTED", write: "SUPPORTED", pathAllowlist: "PARTIAL", changedFileCapture: "SUPPORTED" },
  shell: { available: "SUPPORTED", commandTimeout: "SUPPORTED", processTreeCancellation: "PARTIAL", credentialEnvironmentScrub: "SUPPORTED" },
  git: { status: "SUPPORTED", diff: "SUPPORTED", commit: "SUPPORTED", branch: "SUPPORTED", remotePublication: "UNSUPPORTED" },
  browser: { webSearch: "UNSUPPORTED", webFetch: "UNSUPPORTED", interactiveBrowser: "UNSUPPORTED" },
  tools: { native: "SUPPORTED", mcp: "UNSUPPORTED", structuredOutput: "PARTIAL", telemetry: "SUPPORTED" },
  subagents: { available: "SUPPORTED", parallel: "SUPPORTED", background: "SUPPORTED", eventVisibility: "SUPPORTED" },
  streaming: { events: "PARTIAL", modelDeltas: "UNSUPPORTED", durableReplay: "UNSUPPORTED" },
  context: { persistentSessions: "UNSUPPORTED", resume: "UNSUPPORTED", fork: "UNSUPPORTED", compaction: "SUPPORTED", instructionFiles: "SUPPORTED" },
  headless: { support: "PARTIAL", mode: "CLI_TEXT" },
  cancellation: { support: "PARTIAL", mode: "PROCESS_SIGNAL", idempotentCleanup: true },
  sandbox: {
    isolationModes: ["READ_ONLY", "WORKSPACE_WRITE"],
    externalSandboxRecommended: true,
    requirements: ["owned-process-group", "repository-worktree", "post-execution-path-audit", "isolated-dsh-home"],
  },
  network: { providerApi: false, packageInstall: false, runtimeEgressControl: "UNSUPPORTED", destinations: ["Loopback Ollama 127.0.0.1:11434"] },
  credentials: { classes: ["ollama-loopback-placeholder"], passedToToolProcesses: false, redaction: "PARTIAL" },
  telemetry: { tokens: "SUPPORTED", cost: "UNSUPPORTED", toolCalls: "SUPPORTED", modelRequests: "SUPPORTED", retries: "SUPPORTED" },
  admission: {
    maturity: "EXPERIMENTAL",
    executionBackends: ["persistent-worker"],
    requiredExternalControls: [...REQUIRED_EXTERNAL_CONTROLS, "explicit-deepseek-feature-flag"],
    prohibitedAuthorities: [...PROHIBITED_AUTHORITIES],
  },
  limitations: [
    "Developer-preview upstream is disabled unless an operator explicitly enables the exact pinned adapter.",
    "Only the evaluated loopback local-ollama/qwen3.5:35b-a3b-q8_0 route is admitted in V1.",
    "Stock headless output is final text; Mission Control performs result normalization after execution.",
    "Session persistence, resume, fork, and model-delta streaming exist upstream but are not exposed by the one-shot V1 adapter.",
    "Cancellation uses process signaling rather than an acknowledged in-agent protocol.",
    "Remote sandbox execution is not admitted for the DeepSeek V1 adapter.",
  ],
};

 /** Separate composition; shared declarations describe the same pinned CLI mechanics,
 * not inherited qualification. Provider transport and admission differ explicitly. */
export const CODEX_BEDROCK_EFFECTIVE_CONFIG = {
  cliVersion: "0.146.0",
  mode: "exec",
  ephemeral: true,
  approval: "never",
  ignoreUserConfig: true,
  ignoreRules: true,
  resultContract: "factory-result/v1",
  localProtocol: "responses-completion-events/v1",
  providerAdapter: "aws-bedrock/converse-v1",
  bridge: "factory-bedrock-inference/v1",
  transport: "docker-attach-framed/v1",
  providerStreaming: false,
  automaticRetries: 0,
  providerMaxAttempts: 1,
  resume: false,
  credentialsInContainer: false,
  network: "NONE",
  maximumOutputTokens: 4096,
  webSearch: "disabled",
  reasoningEffort: "none",
  reasoningSummary: "none",
} as const;
export const CODEX_BEDROCK_V1_HARNESS_MANIFEST: HarnessCapabilityManifest = {
  ...CODEX_V1_HARNESS_MANIFEST,
  identity: {
    ...CODEX_V1_HARNESS_MANIFEST.identity,
    adapterVersion: "bedrock-v1",
  },
  effectiveConfigSha256: canonicalHash(CODEX_BEDROCK_EFFECTIVE_CONFIG),
  models: {
    providerSelection: "UNSUPPORTED",
    modelSelection: "UNSUPPORTED",
    supported: [
      {
        provider: "aws-bedrock",
        modelId: "anthropic.claude-sonnet-4-6",
        selection: "ADVERTISED",
        contextWindowTokens: null,
        modalities: ["text"],
      },
    ],
    reasoningControls: "UNSUPPORTED",
  },
  subagents: {
    available: "UNSUPPORTED",
    parallel: "UNSUPPORTED",
    background: "UNSUPPORTED",
    eventVisibility: "UNSUPPORTED",
  },
  network: {
    providerApi: false,
    packageInstall: false,
    runtimeEgressControl: "SUPPORTED",
    destinations: [
      "Container loopback bridge; host admission over Docker attach only",
    ],
  },
  credentials: {
    classes: [],
    passedToToolProcesses: false,
    redaction: "SUPPORTED",
  },
  telemetry: {
    tokens: "SUPPORTED",
    cost: "PARTIAL",
    toolCalls: "SUPPORTED",
    modelRequests: "SUPPORTED",
    retries: "SUPPORTED",
  },
  admission: {
    ...CODEX_V1_HARNESS_MANIFEST.admission,
    maturity: "EXPERIMENTAL",
    executionBackends: ["remote-sandbox"],
    requiredExternalControls: [
      ...REQUIRED_EXTERNAL_CONTROLS,
      "canonical-provider-liability",
      "exact-bedrock-us-route",
      "docker-network-none",
      "separate-account-qualification",
    ],
  },
  limitations: [
    "Offline composition only until separately qualified against approved AWS identity; no inherited codex/v1 route qualification.",
    "Bedrock Converse is non-streaming; local Responses completion events are translated after complete provider output.",
    "No model fallback, hidden retries, resume, remote publication, MCP, images, caching or reasoning controls.",
    "Function tools and text-input custom tools require bounded explicit translation; unsupported protocol fields fail closed.",
    "AWS credentials remain outside the container; every request requires canonical current admission and retained maximum liability.",
    "Cancellation fences new requests; in-flight provider cancellation is not asserted and unknown liability remains held.",
  ],
}; export const KNOWN_HARNESS_MANIFESTS = [
   CODEX_BEDROCK_V1_HARNESS_MANIFEST, CODEX_V1_HARNESS_MANIFEST,
  DEEPSEEK_V1_HARNESS_MANIFEST,
] as const;

const KNOWN_HARNESS_RUNTIME_ARTIFACTS = [
   {
    adapterId: "codex",
    adapterVersion: "bedrock-v1",
    artifact: CODEX_V1_RUNTIME_ARTIFACT,
  }, { adapterId: "codex", adapterVersion: "v1", artifact: CODEX_V1_RUNTIME_ARTIFACT },
  { adapterId: "deepseek-harness", adapterVersion: "0.2.0", artifact: DEEPSEEK_V1_RUNTIME_ARTIFACT },
] as const;

export function findKnownHarnessManifest(adapterId: string, adapterVersion: string) {
  return KNOWN_HARNESS_MANIFESTS.find((manifest) =>
    manifest.identity.adapterId === adapterId
    && manifest.identity.adapterVersion === adapterVersion
  );
}

export function findKnownHarnessRuntimeArtifact(adapterId: string, adapterVersion: string) {
  return KNOWN_HARNESS_RUNTIME_ARTIFACTS.find((candidate) =>
    candidate.adapterId === adapterId && candidate.adapterVersion === adapterVersion
  )?.artifact;
}

export function harnessSupportsModel(
  manifest: HarnessCapabilityManifest,
  provider: string | null | undefined,
  model: string | null | undefined,
) {
  if (!model) return false;
  return manifest.models.supported.some((candidate) =>
    (!provider || candidate.provider === provider)
    && (candidate.modelId === model || candidate.modelId === "*")
  );
}
