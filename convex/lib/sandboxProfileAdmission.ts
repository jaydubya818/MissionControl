import { computeCanonicalHash } from "./genomeHash";

export const SANDBOX_PROFILE_ADMISSION_SCHEMA = "factory-sandbox-profile-admission/v1" as const;

export function qualifiedSandboxSnapshotIssues(input: unknown): string[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return ["profile-snapshot-invalid"];
  const profile = input as Record<string, any>;
  const security = profile.security;
  const qualification = profile.qualification;
  const issues: string[] = [];
  if (profile.schema !== "factory-sandbox-profile/v1" || profile.provider !== "EXE_DEV") issues.push("profile-identity-invalid");
  if (security?.schema !== "factory-sandbox-security/v1"
    || security?.profile !== "remote-sandbox/exe-dev/restricted-candidate-v1"
    || security?.qualificationOnly !== true) issues.push("security-profile-invalid");
  const imageDigest = String(profile.machine?.image ?? "").match(/@(sha256:[a-f0-9]{64})$/i)?.[1]?.toLowerCase();
  if (!imageDigest || imageDigest !== String(security?.image?.digest ?? "").toLowerCase()) issues.push("image-digest-mismatch");
  if (!bounded(security?.image?.provenanceReference, 1_000)
    || !bounded(security?.toolchain?.nodeVersion, 100)
    || !bounded(security?.toolchain?.codexVersion, 100)
    || !bounded(security?.toolchain?.gitVersion, 100)
    || !bounded(security?.toolchain?.busyboxVersion, 100)) issues.push("toolchain-identity-invalid");
  for (const [name, value] of [
    ["image", security?.image?.digest],
    ["sbom", security?.image?.sbomDigest],
    ["codex-binary", security?.toolchain?.codexBinarySha256],
    ["git-binary", security?.toolchain?.gitBinarySha256],
    ["busybox-binary", security?.toolchain?.busyboxBinarySha256],
    ["toolchain-inputs", security?.toolchain?.toolchainInputsSha256],
    ["egress-policy", qualification?.egressPolicyDigest],
    ["evidence-packet", qualification?.evidencePacketDigest],
  ] as const) {
    if (!sha256(value)) issues.push(`${name}-digest-invalid`);
  }
  if (!bounded(qualification?.evidencePacketReference, 1_000)) issues.push("evidence-reference-invalid");
  if (qualification?.providerEgress?.providerEnforced !== false
    || qualification?.providerEgress?.guestEnforced !== true
    || qualification?.providerEgress?.enforcement !== "GUEST_NFTABLES"
    || qualification?.providerEgress?.limitation !== "PROVIDER_ENFORCEMENT_UNAVAILABLE") {
    issues.push("provider-egress-limitation-invalid");
  }
  if (!Number.isSafeInteger(qualification?.credentialRevocationBoundMs)
    || qualification.credentialRevocationBoundMs < 1_000
    || qualification.credentialRevocationBoundMs > 60_000) issues.push("revocation-bound-invalid");
  if (!boundedEnumArray(qualification?.supportedWorkloadClasses, 20)) issues.push("workload-scope-invalid");
  if (!Array.isArray(qualification?.supportedRiskClasses)
    || qualification.supportedRiskClasses.length < 1
    || new Set(qualification.supportedRiskClasses).size !== qualification.supportedRiskClasses.length
    || qualification.supportedRiskClasses.some((item: unknown) => item !== "GREEN" && item !== "YELLOW")) {
    issues.push("risk-scope-invalid");
  }
  if (!Array.isArray(qualification?.workloadTimeouts)
    || qualification.workloadTimeouts.length < 1
    || qualification.workloadTimeouts.length > 20
    || qualification.workloadTimeouts.some((item: any) =>
      !bounded(item?.workloadClass, 64)
      || !Number.isSafeInteger(item?.maxRuntimeMs)
      || item.maxRuntimeMs < 60_000
      || item.maxRuntimeMs > profile.runtime?.maxRuntimeMs
    )) issues.push("timeout-scope-invalid");
  if (profile.network?.egress !== "RESTRICTED_ALLOWLIST"
    || JSON.stringify(profile.network?.egressAllowlist) !== JSON.stringify(["openrouter.ai:443"])
    || profile.readiness?.state !== "DEGRADED"
    || profile.readiness?.liveCertified !== true
    || profile.readiness?.providerEgressEnforcementProven !== false
    || profile.readiness?.guestEgressEnforcementProven !== true) {
    issues.push("network-readiness-invalid");
  }
  if (!Number.isSafeInteger(profile.machine?.cpu) || profile.machine.cpu < 2
    || !Number.isSafeInteger(profile.machine?.memoryMb) || profile.machine.memoryMb < 4_096
    || !Number.isSafeInteger(profile.machine?.diskGb) || profile.machine.diskGb < 20) {
    issues.push("resource-floor-invalid");
  }
  if (profile.credentials?.inference !== "ATTEMPT_SCOPED_OPENROUTER"
    || profile.credentials?.repositoryAccess !== "CONTROL_PLANE_SNAPSHOT"
    || profile.credentials?.githubAuthority !== "NONE"
    || profile.credentials?.providerAuthority !== "NONE") issues.push("credential-policy-invalid");
  if (security?.execution?.user !== "mc-attempt"
    || security?.execution?.uid !== 10_001
    || security?.execution?.gid !== 10_001
    || security?.execution?.noNewPrivileges !== true
    || security?.execution?.capabilityMode !== "DROP_ALL") issues.push("privilege-policy-invalid");
  if (security?.network?.enforcement !== "GUEST_NFTABLES"
    || security?.network?.providerEnforced !== false
    || JSON.stringify(security?.network?.allowedHttpsHosts) !== JSON.stringify(["openrouter.ai"])
    || security?.network?.dnsMode !== "CONTROL_PLANE_RESOLVE_ETC_HOSTS"
    || security?.network?.denyPrivateNetworks !== true
    || security?.network?.denyLinkLocal !== true
    || security?.network?.denyMetadata !== true
    || security?.network?.denyUnexpectedDns !== true) issues.push("guest-network-policy-invalid");
  if (profile.teardown?.terminateOnEveryTerminalState !== true
    || profile.teardown?.verifyResourceAbsent !== true
    || profile.teardown?.supportsResume !== false) issues.push("teardown-policy-invalid");
  return issues;
}

export function sandboxProfileProductionEligible(profile: {
  profileDigest?: string;
  immutableSnapshot?: unknown;
  admissionState?: string;
  admissionSnapshot?: unknown;
  admissionDigest?: string;
} | null | undefined) {
  const snapshot = profile?.immutableSnapshot as Record<string, any> | undefined;
  if (!snapshot?.security) return false;
  if (qualifiedSandboxSnapshotIssues(snapshot).length > 0
    || profile?.admissionState !== "PRODUCTION_PILOT_ELIGIBLE") return false;
  if (profile.profileDigest !== `sha256:${computeCanonicalHash({
    namespace: "factory-sandbox-profile/v1",
    value: snapshot,
  })}`) return false;
  const admission = profile.admissionSnapshot as Record<string, any> | undefined;
  if (!admission || admission.schema !== SANDBOX_PROFILE_ADMISSION_SCHEMA
    || admission.state !== "PRODUCTION_PILOT_ELIGIBLE"
    || admission.profileDigest !== profile.profileDigest
    || admission.imageDigest !== snapshot.security.image.digest
    || admission.toolchainDigest !== snapshot.security.toolchain.toolchainInputsSha256
    || admission.securityProfileDigest !== `sha256:${computeCanonicalHash(snapshot.security)}`
    || admission.scope?.workloadClasses?.join("\0") !== snapshot.qualification.supportedWorkloadClasses.join("\0")
    || admission.scope?.riskClasses?.join("\0") !== snapshot.qualification.supportedRiskClasses.join("\0")
    || admission.providerEgress?.providerEnforced !== false
    || admission.providerEgress?.limitation !== "PROVIDER_ENFORCEMENT_UNAVAILABLE"
    || admission.credentialRevocationBoundMs !== snapshot.qualification.credentialRevocationBoundMs
    || admission.evidence?.reference !== snapshot.qualification.evidencePacketReference
    || admission.evidence?.digest !== snapshot.qualification.evidencePacketDigest
    || !bounded(admission.promotedBy, 200)
    || !Number.isFinite(admission.promotedAt)
    || admission.authority?.executionOnly !== true
    || admission.authority?.routing !== false
    || admission.authority?.verification !== false
    || admission.authority?.acceptance !== false
    || admission.authority?.publication !== false
    || admission.authority?.merge !== false) return false;
  return profile.admissionDigest === `sha256:${computeCanonicalHash({
    namespace: SANDBOX_PROFILE_ADMISSION_SCHEMA,
    value: admission,
  })}`;
}

function sha256(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/i.test(value);
}

function bounded(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value === value.trim()
    && value.length > 0 && value.length <= maximum && !/[\0\r\n]/.test(value);
}

function boundedEnumArray(value: unknown, maximum: number): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= maximum
    && new Set(value).size === value.length
    && value.every((item) => bounded(item, 64) && /^[A-Z][A-Z0-9_]{1,63}$/.test(item));
}
