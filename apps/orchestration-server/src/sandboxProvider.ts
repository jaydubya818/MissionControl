import { canonicalDigest } from "@mission-control/shared";

export const SANDBOX_PROFILE_SCHEMA = "factory-sandbox-profile/v1" as const;
export const SANDBOX_RESULT_SCHEMA = "factory-sandbox-result/v1" as const;
export const SANDBOX_SUPERVISOR_VERSION = "mission-control-supervisor/v1" as const;
export const SANDBOX_SECURITY_SCHEMA = "factory-sandbox-security/v1" as const;
export const RESTRICTED_CANDIDATE_PROFILE = "remote-sandbox/exe-dev/restricted-candidate-v1" as const;

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
    providerEgressEnforcementProven?: boolean;
    guestEgressEnforcementProven?: boolean;
    liveCertified?: boolean;
    evidenceReference?: string;
  };
  qualification?: {
    evidencePacketReference: string;
    evidencePacketDigest: string;
    egressPolicyDigest: string;
    credentialRevocationBoundMs: number;
    supportedWorkloadClasses: string[];
    supportedRiskClasses: Array<"GREEN" | "YELLOW">;
    workloadTimeouts: Array<{ workloadClass: string; maxRuntimeMs: number }>;
    providerEgress: {
      providerEnforced: false;
      guestEnforced: true;
      enforcement: "GUEST_NFTABLES";
      limitation: "PROVIDER_ENFORCEMENT_UNAVAILABLE";
    };
  };
  security?: {
    schema: typeof SANDBOX_SECURITY_SCHEMA;
    profile: typeof RESTRICTED_CANDIDATE_PROFILE;
    qualificationOnly: true;
    image: {
      digest: string;
      provenanceReference: string;
      sbomDigest: string;
    };
    toolchain: {
      nodeVersion: string;
      codexVersion: string;
      codexBinarySha256: string;
      gitVersion: string;
      gitBinarySha256: string;
      busyboxVersion: string;
      busyboxBinarySha256: string;
      toolchainInputsSha256: string;
    };
    execution: {
      user: "mc-attempt";
      uid: 10_001;
      gid: 10_001;
      homePath: "/var/lib/mission-control/attempt/home";
      temporaryPath: "/var/lib/mission-control/attempt/tmp";
      noNewPrivileges: true;
      capabilityMode: "DROP_ALL";
    };
    network: {
      enforcement: "GUEST_NFTABLES";
      providerEnforced: false;
      allowedHttpsHosts: string[];
      dnsMode: "CONTROL_PLANE_RESOLVE_ETC_HOSTS";
      denyPrivateNetworks: true;
      denyLinkLocal: true;
      denyMetadata: true;
      denyUnexpectedDns: true;
    };
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
  /** Server-issued lease heartbeat time at the claim/reclaim admission boundary. */
  profileAdmittedAt?: number;
  workOrderId: string;
  workOrderRevisionNumber: number;
  workflowRunId: string;
  attemptId: string;
  sourceSha: string;
  profileDigest: string;
  security?: SandboxProfileSnapshot["security"];
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
    provider?: string;
    modelRouteDigest?: string;
    providerRoute?: string;
    reasoningConfig?: {
      effort?: string;
      temperature?: number;
      maxTokens?: number;
    };
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
  securityProof?: SandboxSecurityProof;
}

export interface SandboxSecurityProof {
  schema: "factory-sandbox-security-proof/v1";
  profile: typeof RESTRICTED_CANDIDATE_PROFILE;
  observedAt: number;
  image: {
    requestedReference: string;
    requestedDigest: string;
    providerReportedReference: string | null;
    providerReferenceMatched: boolean | null;
  };
  toolchain: {
    nodeVersion: string;
    codexVersion: string;
    codexBinarySha256: string;
    gitVersion: string;
    gitBinarySha256: string;
    busyboxVersion: string;
    busyboxBinarySha256: string;
    toolchainInputsSha256: string;
    executionUid: number;
    executionGid: number;
  };
  filesystem: {
    repositoryOwnerUid: number;
    repositoryOwnerGid: number;
    protectedPathsReadOnly: boolean;
    packageCachesAbsent: boolean;
  };
  privilege: {
    noNewPrivileges: boolean;
    capabilities: {
      inheritable: string;
      permitted: string;
      effective: string;
      bounding: string;
      ambient: string;
    };
    firewallMutationBlocked: boolean;
    packageManagerCommandsAbsent: string[];
  };
  network: {
    enforcement: "GUEST_NFTABLES";
    providerEnforced: false;
    policyDigest: string;
    allowedHttpsHosts: string[];
    resolvedAddresses: string[];
    controlExternalEndpointReachable: boolean;
    approvedEndpointReachable: boolean;
    arbitraryExternalBlocked: boolean;
    privateNetworkBlocked: boolean;
    linkLocalBlocked: boolean;
    metadataBlocked: boolean;
    unexpectedDnsBlocked: boolean;
  };
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
  fetchDiagnostics?(allocation: SandboxAllocation): Promise<Record<string, unknown> | null>;
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
  if (profile.security) {
    const security = profile.security;
    const imageDigest = profile.machine.image.match(/@(sha256:[a-f0-9]{64})$/i)?.[1]?.toLowerCase();
    if (security.schema !== SANDBOX_SECURITY_SCHEMA || security.profile !== RESTRICTED_CANDIDATE_PROFILE) {
      errors.push("Sandbox security profile identity is unsupported.");
    }
    if (security.qualificationOnly !== true) errors.push("The restricted exe.dev candidate must remain qualification-only.");
    if (!imageDigest || imageDigest !== security.image.digest.toLowerCase()) errors.push("Restricted candidate image must be pinned by its exact OCI digest.");
    if (![security.image.digest, security.image.sbomDigest, security.toolchain.codexBinarySha256,
      security.toolchain.gitBinarySha256, security.toolchain.busyboxBinarySha256, security.toolchain.toolchainInputsSha256]
      .every((value) => /^sha256:[a-f0-9]{64}$/i.test(value))) {
      errors.push("Restricted candidate provenance and toolchain digests must be exact SHA-256 values.");
    }
    if (!security.image.provenanceReference.trim()) errors.push("Restricted candidate image provenance is required.");
    if (security.toolchain.nodeVersion !== "v26.7.0" || security.toolchain.codexVersion !== "codex-cli 0.146.0"
      || security.toolchain.gitVersion !== "git version 2.55.0" || security.toolchain.busyboxVersion !== "BusyBox v1.37.0") {
      errors.push("Restricted candidate toolchain identity is not certified.");
    }
    if (security.execution.user !== "mc-attempt" || security.execution.uid !== 10_001 || security.execution.gid !== 10_001
      || security.execution.homePath !== "/var/lib/mission-control/attempt/home"
      || security.execution.temporaryPath !== "/var/lib/mission-control/attempt/tmp"
      || security.execution.noNewPrivileges !== true
      || security.execution.capabilityMode !== "DROP_ALL") {
      errors.push("Restricted candidate execution identity is invalid.");
    }
    const normalizedAllowlist = [...new Set(security.network.allowedHttpsHosts)].sort();
    if (security.network.enforcement !== "GUEST_NFTABLES" || security.network.providerEnforced !== false
      || security.network.dnsMode !== "CONTROL_PLANE_RESOLVE_ETC_HOSTS"
      || !security.network.denyPrivateNetworks || !security.network.denyLinkLocal
      || !security.network.denyMetadata || !security.network.denyUnexpectedDns
      || normalizedAllowlist.length !== 1 || normalizedAllowlist[0] !== "openrouter.ai") {
      errors.push("Restricted candidate network policy is outside the qualified guest-kernel boundary.");
    }
    if (profile.network.egress !== "RESTRICTED_ALLOWLIST"
      || JSON.stringify(profile.network.egressAllowlist) !== JSON.stringify(["openrouter.ai:443"])
      || !profile.readiness.egressEnforcementProven) {
      errors.push("Restricted candidate egress declaration does not match its frozen allowlist.");
    }
    if (profile.readiness.state !== "DEGRADED") errors.push("Guest-only egress enforcement must remain visibly DEGRADED.");
    warnings.push("exe.dev exposes no provider-level egress control; guest nftables enforcement is qualification-only defense in depth.");
    if (profile.qualification) {
      const qualification = profile.qualification;
      if (!/^sha256:[a-f0-9]{64}$/i.test(qualification.evidencePacketDigest)
        || !/^sha256:[a-f0-9]{64}$/i.test(qualification.egressPolicyDigest)
        || !qualification.evidencePacketReference.trim()
        || !Number.isSafeInteger(qualification.credentialRevocationBoundMs)
        || qualification.credentialRevocationBoundMs < 1_000
        || qualification.credentialRevocationBoundMs > 60_000
        || qualification.providerEgress.providerEnforced !== false
        || qualification.providerEgress.guestEnforced !== true
        || qualification.providerEgress.enforcement !== "GUEST_NFTABLES"
        || qualification.providerEgress.limitation !== "PROVIDER_ENFORCEMENT_UNAVAILABLE") {
        errors.push("Restricted candidate qualification evidence is invalid.");
      }
    }
  }
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
  return redactSandboxValue(value).slice(0, 2_000);
}

export function redactSandboxTail(value: unknown, maxLength = 4_000) {
  if (!Number.isSafeInteger(maxLength) || maxLength < 1 || maxLength > 16_000) {
    throw new Error("Sandbox diagnostic tail bound is invalid.");
  }
  return redactSandboxValue(value).slice(-maxLength);
}

function redactSandboxValue(value: unknown) {
  return String(value ?? "")
    .replace(/\bsk-or-v1-[A-Za-z0-9_-]+/g, "[REDACTED_OPENROUTER_KEY]")
    .replace(/\bgh[pousr]_[A-Za-z0-9_]+/g, "[REDACTED_PROVIDER_TOKEN]")
    .replace(/(authorization|cookie|token|secret|password|api[-_]?key)\s*[:=]\s*([^\s,;]+)/gi, "$1=[REDACTED]");
}
