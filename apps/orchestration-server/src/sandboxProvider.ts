import { canonicalDigest } from "@mission-control/shared";

export const SANDBOX_PROFILE_SCHEMA = "factory-sandbox-profile/v1" as const;
export const SANDBOX_RESULT_SCHEMA = "factory-sandbox-result/v1" as const;
export const SANDBOX_SUPERVISOR_VERSION = "mission-control-supervisor/v1" as const;

export type SandboxProviderKind = "EXE_DEV" | "FAKE";
export type SandboxReadinessState = "READY" | "DEGRADED" | "BLOCKED";
export type SandboxAllocationState =
  | "REQUESTED"
  | "ALLOCATING"
  | "READY"
  | "RUNNING"
  | "RESULT_READY"
  | "CANCELING"
  | "TERMINATING"
  | "TERMINATED"
  | "FAILED"
  | "ORPHANED";

export interface SandboxProfileSnapshot {
  schema: typeof SANDBOX_PROFILE_SCHEMA;
  profileKey: string;
  version: number;
  provider: SandboxProviderKind;
  providerProfile: string;
  providerProfileVersion: string;
  machine: {
    image: string;
    cpu: number;
    memoryMb: number;
    diskGb: number;
  };
  supervisor: {
    version: typeof SANDBOX_SUPERVISOR_VERSION;
    transport: "SSH";
  };
  runtime: {
    maxRuntimeMs: number;
    resultPollIntervalMs: number;
    resultRetentionMs: number;
  };
  network: {
    egress: "UNRESTRICTED" | "RESTRICTED_ALLOWLIST";
    egressAllowlist: string[];
    publicIngress: false;
    exposedPorts: number[];
  };
  credentials: {
    inference: "ATTEMPT_SCOPED_OPENROUTER" | "NONE";
    repositoryAccess: "CONTROL_PLANE_SNAPSHOT";
    githubAuthority: "NONE";
    providerAuthority: "NONE";
  };
  spend: {
    maxUsd: number;
    enforcement: "PROVIDER_KEY_LIMIT" | "OBSERVATION_ONLY";
  };
  teardown: {
    terminateOnEveryTerminalState: true;
    verifyResourceAbsent: true;
    supportsResume: false;
  };
  preview: {
    mode: "DISABLED" | "PRIVATE_PROXY";
    port?: number;
  };
  readiness: {
    state: SandboxReadinessState;
    checkedAt: number;
    reason: string;
    egressEnforcementProven: boolean;
    liveCertified?: boolean;
    evidenceReference?: string;
  };
}

export interface SandboxProfileValidation {
  valid: boolean;
  dispatchable: boolean;
  readiness: SandboxReadinessState;
  errors: string[];
  warnings: string[];
  profileDigest: string;
}

export interface SandboxAllocationRequest {
  resourceName: string;
  projectId: string;
  workOrderId: string;
  workflowRunId: string;
  attemptId: string;
  attemptLeaseId: string;
  manifestDigest: string;
  sourceSha: string;
  profile: SandboxProfileSnapshot;
  requestedAt: number;
}

export interface SandboxAllocation {
  provider: SandboxProviderKind;
  providerResourceId: string;
  resourceName: string;
  state: SandboxAllocationState;
  createdAt: number;
  readyAt?: number;
  startedAt?: number;
  terminatedAt?: number;
  lastHeartbeatAt?: number;
  resultDigest?: string;
  privatePreviewUrl?: string;
  providerMetadata?: Record<string, unknown>;
}

export interface SandboxStartRequest {
  allocation: SandboxAllocation;
  executionManifest: Record<string, unknown>;
  manifestDigest: string;
  workOrderId: string;
  workOrderRevisionNumber: number;
  workflowRunId: string;
  attemptId: string;
  sourceSha: string;
  profileDigest: string;
  environmentDescriptor: {
    provider: SandboxProviderKind;
    image: string;
  };
  repositoryArchive: Buffer;
  supervisorSource: string;
  executor: {
    command: string;
    args: string[];
    resultPath?: string;
    outputSchemaPath?: string;
    outputSchema?: Record<string, unknown>;
    model?: string;
    prompt: string;
    allowedPaths: string[];
    timeoutMs: number;
  };
  environment: Record<string, string>;
}

export interface SandboxStartReceipt {
  processId: string;
  startedAt: number;
  state: "RUNNING";
}

export interface SandboxTerminationReceipt {
  providerResourceId: string;
  resourceName: string;
  requestedAt: number;
  confirmedAbsentAt: number;
  resourceAbsent: true;
}

export interface SandboxProvider {
  readonly kind: SandboxProviderKind;
  validateProfile(profile: SandboxProfileSnapshot): Promise<SandboxProfileValidation>;
  allocate(request: SandboxAllocationRequest): Promise<SandboxAllocation>;
  inspect(allocation: SandboxAllocation): Promise<SandboxAllocation>;
  start(request: SandboxStartRequest): Promise<SandboxStartReceipt>;
  fetchResult(allocation: SandboxAllocation): Promise<Buffer | null>;
  cancel(allocation: SandboxAllocation, reason: string): Promise<void>;
  terminate(allocation: SandboxAllocation): Promise<SandboxTerminationReceipt>;
}

export function sandboxProfileDigest(profile: SandboxProfileSnapshot) {
  return canonicalDigest("factory-sandbox-profile/v1", profile);
}

export function stableSandboxResourceName(input: {
  projectId: string;
  workflowRunId: string;
  attemptId: string;
}) {
  const identity = canonicalDigest("factory-sandbox-resource/v1", {
    projectId: input.projectId,
    workflowRunId: input.workflowRunId,
    attemptId: input.attemptId,
  }).slice("sha256:".length, "sha256:".length + 16);
  return `mc-attempt-${identity}`;
}

export function validateSandboxProfile(profile: SandboxProfileSnapshot): SandboxProfileValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (profile.schema !== SANDBOX_PROFILE_SCHEMA) errors.push("Unsupported Sandbox Profile schema.");
  if (!profile.profileKey.trim() || !Number.isSafeInteger(profile.version) || profile.version < 1) errors.push("Profile identity is invalid.");
  if (!profile.providerProfile.trim() || !profile.providerProfileVersion.trim()) errors.push("Provider profile identity is required.");
  if (!profile.machine.image.trim()) errors.push("An immutable machine image identifier is required.");
  if (!Number.isSafeInteger(profile.machine.cpu) || profile.machine.cpu < 1 || profile.machine.cpu > 64) errors.push("CPU must be between 1 and 64.");
  if (!Number.isSafeInteger(profile.machine.memoryMb) || profile.machine.memoryMb < 512 || profile.machine.memoryMb > 262_144) errors.push("Memory must be between 512 MB and 256 GB.");
  if (!Number.isSafeInteger(profile.machine.diskGb) || profile.machine.diskGb < 5 || profile.machine.diskGb > 2_048) errors.push("Disk must be between 5 GB and 2 TB.");
  if (profile.supervisor.version !== SANDBOX_SUPERVISOR_VERSION || profile.supervisor.transport !== "SSH") errors.push("The approved Mission Control supervisor and SSH transport are required.");
  if (!Number.isSafeInteger(profile.runtime.maxRuntimeMs) || profile.runtime.maxRuntimeMs < 60_000 || profile.runtime.maxRuntimeMs > 8 * 60 * 60 * 1_000) errors.push("Runtime must be between one minute and eight hours.");
  if (!Number.isSafeInteger(profile.runtime.resultPollIntervalMs) || profile.runtime.resultPollIntervalMs < 250 || profile.runtime.resultPollIntervalMs > 60_000) errors.push("Result polling interval is invalid.");
  if (profile.network.publicIngress !== false || profile.network.exposedPorts.length > 0) errors.push("Public ingress and exposed ports are not permitted for the N=1 profile.");
  if (profile.preview.mode === "PRIVATE_PROXY" && (!Number.isSafeInteger(profile.preview.port) || (profile.preview.port ?? 0) < 1 || (profile.preview.port ?? 0) > 65_535)) errors.push("Private preview requires a valid port.");
  if (profile.credentials.repositoryAccess !== "CONTROL_PLANE_SNAPSHOT" || profile.credentials.githubAuthority !== "NONE" || profile.credentials.providerAuthority !== "NONE") errors.push("Sandbox credentials exceed execution-only authority.");
  if (!Number.isFinite(profile.spend.maxUsd) || profile.spend.maxUsd <= 0 || profile.spend.maxUsd > 100) errors.push("Sandbox spend must be greater than $0 and no more than $100.");
  if (!profile.teardown.terminateOnEveryTerminalState || !profile.teardown.verifyResourceAbsent || profile.teardown.supportsResume) errors.push("Mandatory teardown and non-resumable execution are required.");
  if (profile.network.egress === "UNRESTRICTED") warnings.push("Provider egress is unrestricted; the profile must be visibly DEGRADED.");
  if (profile.network.egress === "RESTRICTED_ALLOWLIST" && !profile.readiness.egressEnforcementProven) errors.push("Restricted egress cannot be claimed without provider enforcement evidence.");
  if (profile.readiness.state === "READY" && profile.network.egress === "UNRESTRICTED") errors.push("An unrestricted-egress profile cannot be marked READY.");
  if (profile.provider === "EXE_DEV" && profile.readiness.liveCertified !== true) errors.push("Live exe.dev lifecycle certification is not recorded.");
  if (profile.readiness.state === "BLOCKED") errors.push(`Provider readiness is blocked: ${profile.readiness.reason}`);
  const readiness = errors.length > 0 ? "BLOCKED" : profile.network.egress === "UNRESTRICTED" ? "DEGRADED" : profile.readiness.state;
  return {
    valid: errors.length === 0,
    dispatchable: errors.length === 0 && readiness !== "BLOCKED",
    readiness,
    errors,
    warnings,
    profileDigest: sandboxProfileDigest(profile),
  };
}

export function assertSafeSandboxResourceName(name: string) {
  if (!/^mc-attempt-[a-f0-9]{16}$/.test(name)) throw new Error("Sandbox resource name is outside the Mission Control Attempt namespace.");
  return name;
}

export function redactSandboxText(value: unknown) {
  return String(value ?? "")
    .replace(/\bsk-or-v1-[A-Za-z0-9_-]+/g, "[REDACTED_OPENROUTER_KEY]")
    .replace(/\bgh[pousr]_[A-Za-z0-9_]+/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/(authorization|cookie|token|secret|password|api[-_]?key)\s*[:=]\s*([^\s,;]+)/gi, "$1=[REDACTED]")
    .slice(0, 2_000);
}
