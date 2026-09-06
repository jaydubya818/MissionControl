import { computeCanonicalHash } from "./genomeHash.js";

export const DOCKER_ADMISSION_SCHEMA = "factory-docker-sandbox-admission/v1";
const digest = (x: unknown) =>
  typeof x === "string" && /^sha256:[a-f0-9]{64}$/.test(x);
const bounded = (x: unknown) =>
  typeof x === "string" &&
  x.length > 0 &&
  x.length <= 1000 &&
  !/[\r\n\0]/.test(x);
const hash = (x: unknown) => `sha256:${computeCanonicalHash(x)}`;
/** Docker evidence has no VM, nftables, or provider credential assertions. */
export function dockerSandboxSnapshotIssues(p: any): string[] {
  const q = p?.dockerQualification,
    issues: string[] = [];
  const imageDigest = String(p?.machine?.image).match(
    /@(sha256:[a-f0-9]{64})$/,
  )?.[1];
  if (
    p?.schema !== "factory-sandbox-profile/v1" ||
    p.provider !== "DOCKER" ||
    p.providerProfile !== "factory/docker-bedrock/v1" ||
    p.providerProfileVersion !== "1" ||
    p.security !== undefined ||
    p.qualification !== undefined
  )
    issues.push("docker-identity-invalid");
  if (
    !imageDigest ||
    q?.imageDigest !== imageDigest ||
    !digest(q?.toolchainDigest) ||
    !digest(q?.evidencePacketDigest) ||
    !bounded(q?.evidencePacketReference) ||
    q?.schema !== "factory-docker-qualification/v1" ||
    q?.bridgeProtocol !== "docker-attach-framed/v1" ||
    q?.harness !== "codex/bedrock-v1"
  )
    issues.push("docker-evidence-invalid");
  if (
    q?.containment?.network !== "DOCKER_NETWORK_NONE" ||
    q?.containment?.readOnlyRoot !== true ||
    q?.containment?.uid !== 10001 ||
    q?.containment?.gid !== 10001 ||
    q?.containment?.noNewPrivileges !== true ||
    q?.containment?.capabilities !== "DROP_ALL" ||
    q?.containment?.hostMounts !== "NONE" ||
    q?.containment?.credentials !== "NONE"
  )
    issues.push("docker-containment-invalid");
  if (
    p?.supervisor?.transport !== "DOCKER_STDIN" ||
    p?.supervisor?.version !== "mission-control-supervisor/v1" ||
    p?.network?.egress !== "RESTRICTED_ALLOWLIST" ||
    p?.network?.egressAllowlist?.length !== 0 ||
    p?.network?.publicIngress !== false ||
    p?.network?.exposedPorts?.length !== 0 ||
    p?.credentials?.inference !== "NONE" ||
    p?.credentials?.providerAuthority !== "NONE" ||
    p?.credentials?.githubAuthority !== "NONE" ||
    p?.credentials?.repositoryAccess !== "CONTROL_PLANE_SNAPSHOT" ||
    p?.preview?.mode !== "DISABLED" ||
    p?.spend?.enforcement !== "OBSERVATION_ONLY"
  )
    issues.push("docker-policy-invalid");
  if (
    p?.machine?.cpu !== 1 ||
    p?.machine?.memoryMb !== 512 ||
    !Number.isSafeInteger(p?.runtime?.maxRuntimeMs) ||
    p.runtime.maxRuntimeMs < 60000 ||
    p.runtime.maxRuntimeMs > 900000 ||
    p?.teardown?.terminateOnEveryTerminalState !== true ||
    p?.teardown?.verifyResourceAbsent !== true ||
    p?.teardown?.supportsResume !== false
  )
    issues.push("docker-resource-lifecycle-invalid");
  if (
    p?.readiness?.liveCertified !== true ||
    p?.readiness?.egressEnforcementProven !== true ||
    p?.readiness?.state !== "DEGRADED"
  )
    issues.push("docker-lifecycle-evidence-required");
  if (
    !Array.isArray(q?.supportedWorkloadClasses) ||
    !q.supportedWorkloadClasses.length ||
    q.supportedWorkloadClasses.length > 20 ||
    new Set(q.supportedWorkloadClasses).size !==
      q.supportedWorkloadClasses.length ||
    q.supportedWorkloadClasses.some(
      (s: unknown) =>
        typeof s !== "string" || !/^[A-Z][A-Z0-9_]{1,63}$/.test(s),
    ) ||
    !Array.isArray(q?.supportedRiskClasses) ||
    !q.supportedRiskClasses.length ||
    new Set(q.supportedRiskClasses).size !== q.supportedRiskClasses.length ||
    q.supportedRiskClasses.some(
      (s: unknown) => s !== "GREEN" && s !== "YELLOW",
    ) ||
    !Array.isArray(q?.workloadTimeouts) ||
    q.workloadTimeouts.length !== q?.supportedWorkloadClasses?.length ||
    new Set(q.workloadTimeouts.map((t: any) => t.workloadClass)).size !==
      q.workloadTimeouts.length ||
    q.workloadTimeouts.some(
      (t: any) =>
        !q.supportedWorkloadClasses.includes(t.workloadClass) ||
        !Number.isSafeInteger(t.maxRuntimeMs) ||
        t.maxRuntimeMs < 60000 ||
        t.maxRuntimeMs > p.runtime.maxRuntimeMs,
    )
  )
    issues.push("docker-scope-invalid");
  return issues;
}
export function dockerSandboxAdmission(
  snapshot: any,
  profileDigest: string,
  promotedBy: string,
  promotedAt: number,
) {
  if (
    dockerSandboxSnapshotIssues(snapshot).length ||
    !bounded(promotedBy) ||
    !Number.isSafeInteger(promotedAt)
  )
    throw new Error("DOCKER_ADMISSION_EVIDENCE_INVALID");
  return {
    schema: DOCKER_ADMISSION_SCHEMA,
    state: "PRODUCTION_PILOT_ELIGIBLE",
    profileDigest,
    qualification: structuredClone(snapshot.dockerQualification),
    promotedBy,
    promotedAt,
    authority: {
      executionOnly: true,
      routing: false,
      verification: false,
      acceptance: false,
      publication: false,
      merge: false,
    },
  };
}
export function dockerSandboxProductionEligible(profile: any): boolean {
  const s = profile?.immutableSnapshot,
    a = profile?.admissionSnapshot;
  if (
    dockerSandboxSnapshotIssues(s).length ||
    profile?.admissionState !== "PRODUCTION_PILOT_ELIGIBLE" ||
    profile.profileDigest !==
      hash({ namespace: "factory-sandbox-profile/v1", value: s }) ||
    !bounded(a?.promotedBy) ||
    !Number.isSafeInteger(a?.promotedAt)
  )
    return false;
  const expected = dockerSandboxAdmission(
    s,
    profile.profileDigest,
    a.promotedBy,
    a.promotedAt,
  );
  return (
    hash(a) === hash(expected) &&
    profile.admissionDigest ===
      hash({ namespace: DOCKER_ADMISSION_SCHEMA, value: expected })
  );
}
