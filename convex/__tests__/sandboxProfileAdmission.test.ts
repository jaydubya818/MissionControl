import { describe, expect, it } from "vitest";
import { computeCanonicalHash } from "../lib/genomeHash";
import {
  SANDBOX_PROFILE_ADMISSION_SCHEMA,
  qualifiedSandboxSnapshotIssues,
  sandboxProfileProductionEligible,
} from "../lib/sandboxProfileAdmission";

const digest = (character: string) => `sha256:${character.repeat(64)}`;
const snapshot = {
  schema: "factory-sandbox-profile/v1",
  profileKey: "exe-remote-sandbox-restricted-candidate-n1",
  version: 1,
  provider: "EXE_DEV",
  providerProfile: "individual-small",
  providerProfileVersion: "remote-sandbox-hardening-v1",
  machine: {
    image: `ghcr.io/example/image@${digest("1")}`,
    cpu: 2,
    memoryMb: 4_096,
    diskGb: 20,
  },
  supervisor: { version: "mission-control-supervisor/v1", transport: "SSH" },
  runtime: { maxRuntimeMs: 330_000, resultPollIntervalMs: 500, resultRetentionMs: 86_400_000 },
  network: { egress: "RESTRICTED_ALLOWLIST", egressAllowlist: ["openrouter.ai:443"], publicIngress: false, exposedPorts: [] },
  credentials: { inference: "ATTEMPT_SCOPED_OPENROUTER", repositoryAccess: "CONTROL_PLANE_SNAPSHOT", githubAuthority: "NONE", providerAuthority: "NONE" },
  spend: { maxUsd: 0.05, enforcement: "PROVIDER_KEY_LIMIT" },
  teardown: { terminateOnEveryTerminalState: true, verifyResourceAbsent: true, supportsResume: false },
  preview: { mode: "DISABLED" },
  readiness: {
    state: "DEGRADED",
    checkedAt: 1,
    reason: "Guest policy proven; provider enforcement unavailable.",
    egressEnforcementProven: true,
    liveCertified: true,
    providerEgressEnforcementProven: false,
    guestEgressEnforcementProven: true,
    evidenceReference: "docs/evidence.json",
  },
  qualification: {
    evidencePacketReference: "docs/evidence.json",
    evidencePacketDigest: digest("2"),
    egressPolicyDigest: digest("3"),
    credentialRevocationBoundMs: 30_000,
    supportedWorkloadClasses: ["BUG_FIX", "MIGRATION", "SECURITY_POLICY"],
    supportedRiskClasses: ["GREEN", "YELLOW"],
    workloadTimeouts: [{ workloadClass: "BUG_FIX", maxRuntimeMs: 300_000 }],
    providerEgress: {
      providerEnforced: false,
      guestEnforced: true,
      enforcement: "GUEST_NFTABLES",
      limitation: "PROVIDER_ENFORCEMENT_UNAVAILABLE",
    },
  },
  security: {
    schema: "factory-sandbox-security/v1",
    profile: "remote-sandbox/exe-dev/restricted-candidate-v1",
    qualificationOnly: true,
    image: { digest: digest("1"), provenanceReference: `ghcr.io/example/image@${digest("1")}`, sbomDigest: digest("4") },
    toolchain: {
      nodeVersion: "v26.7.0",
      codexVersion: "codex-cli 0.146.0",
      codexBinarySha256: digest("5"),
      gitVersion: "git version 2.55.0",
      gitBinarySha256: digest("6"),
      busyboxVersion: "BusyBox v1.37.0",
      busyboxBinarySha256: digest("7"),
      toolchainInputsSha256: digest("8"),
    },
    execution: { user: "mc-attempt", uid: 10_001, gid: 10_001, noNewPrivileges: true, capabilityMode: "DROP_ALL" },
    network: {
      enforcement: "GUEST_NFTABLES",
      providerEnforced: false,
      allowedHttpsHosts: ["openrouter.ai"],
      dnsMode: "CONTROL_PLANE_RESOLVE_ETC_HOSTS",
      denyPrivateNetworks: true,
      denyLinkLocal: true,
      denyMetadata: true,
      denyUnexpectedDns: true,
    },
  },
};
const profileDigest = `sha256:${computeCanonicalHash({ namespace: "factory-sandbox-profile/v1", value: snapshot })}`;
const admissionSnapshot = {
  schema: SANDBOX_PROFILE_ADMISSION_SCHEMA,
  state: "PRODUCTION_PILOT_ELIGIBLE",
  profileDigest,
  imageDigest: snapshot.security.image.digest,
  toolchainDigest: snapshot.security.toolchain.toolchainInputsSha256,
  securityProfileDigest: `sha256:${computeCanonicalHash(snapshot.security)}`,
  scope: {
    workloadClasses: snapshot.qualification.supportedWorkloadClasses,
    riskClasses: snapshot.qualification.supportedRiskClasses,
    workloadTimeouts: snapshot.qualification.workloadTimeouts,
  },
  providerEgress: snapshot.qualification.providerEgress,
  credentialRevocationBoundMs: snapshot.qualification.credentialRevocationBoundMs,
  evidence: { reference: snapshot.qualification.evidencePacketReference, digest: snapshot.qualification.evidencePacketDigest },
  promotedBy: "operator-1",
  promotedAt: 1,
  authority: { executionOnly: true, routing: false, verification: false, acceptance: false, publication: false, merge: false },
};
const admissionDigest = `sha256:${computeCanonicalHash({ namespace: SANDBOX_PROFILE_ADMISSION_SCHEMA, value: admissionSnapshot })}`;

describe("hardened Sandbox Profile admission", () => {
  it("validates the faithful qualified representation", () => {
    expect(qualifiedSandboxSnapshotIssues(snapshot)).toEqual([]);
  });

  it("keeps qualification-only and historical profiles out of production", () => {
    expect(sandboxProfileProductionEligible({ profileDigest, immutableSnapshot: snapshot, admissionState: "QUALIFICATION_ONLY" })).toBe(false);
    expect(sandboxProfileProductionEligible({ immutableSnapshot: {} })).toBe(false);
  });

  it("admits only an exact human promotion and fails closed on stale identity", () => {
    const promoted = { profileDigest, immutableSnapshot: snapshot, admissionState: "PRODUCTION_PILOT_ELIGIBLE", admissionSnapshot, admissionDigest };
    expect(sandboxProfileProductionEligible(promoted)).toBe(true);
    expect(sandboxProfileProductionEligible({ ...promoted, immutableSnapshot: { ...snapshot, machine: { ...snapshot.machine, cpu: 3 } } })).toBe(false);
    expect(sandboxProfileProductionEligible({ ...promoted, admissionDigest: digest("0") })).toBe(false);
  });
});
