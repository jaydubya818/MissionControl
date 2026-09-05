import type {
  HarnessCapabilityManifest,
  HarnessCapabilityRequirement,
  HarnessRuntimeArtifactIdentity,
  IsolationMode,
} from "@mission-control/workflow-engine/harness-contract";
import {
  GENERIC_HARNESS_CONTRACT_VERSION,
  harnessCapabilityManifestDigest,
  harnessCapabilityRequirementsSatisfied,
  harnessManifestIssues,
  harnessRuntimeArtifactDigest,
  harnessRuntimeArtifactIssues,
  harnessSupportsModel,
  findKnownHarnessManifest,
  findKnownHarnessRuntimeArtifact,
} from "@mission-control/workflow-engine/harness-contract";
import { computeCanonicalHash } from "./genomeHash.js";
import { factoryHarnessCapabilityRequirements } from "./harnessCapabilities.js";
import {
  EXACT_MODEL_ROUTE_SCHEMA,
  MODEL_ROUTE_QUALIFICATION_SCHEMA,
  exactModelRouteDigest,
  exactModelRouteIssues,
  modelRouteExecutionCompatibilityMatches,
  modelRouteEligibleForNewFactoryVersion,
  modelRouteQualificationDigest,
  modelRouteQualificationIssues,
  type ModelRouteExecutionBackend,
  type ModelRouteRiskClass,
} from "./modelRouteAdmission.js";
import { sandboxProfileProductionEligible } from "./sandboxProfileAdmission.js";

export const EXECUTION_PROFILE_SCHEMA = "factory-execution-profile/v1" as const;
export const EXECUTION_PROFILE_QUALIFICATION_SCHEMA = "factory-execution-profile-qualification/v1" as const;
export const MAX_EXECUTION_PROFILE_QUALIFICATION_LIFETIME_MS = 366 * 24 * 60 * 60 * 1_000;

const PROFILE_AUTHORITY = Object.freeze({
  routing: false,
  verification: false,
  publication: false,
  acceptance: false,
  merge: false,
  policyMutation: false,
  workerLeases: false,
});

export type ExecutionProfileBlockerCode =
  | "EXECUTION_PROFILE_MISSING"
  | "EXECUTION_PROFILE_UNSUPPORTED"
  | "EXECUTION_PROFILE_SNAPSHOT_INVALID"
  | "EXECUTION_PROFILE_DIGEST_MISMATCH"
  | "EXECUTION_PROFILE_IDENTITY_MISMATCH"
  | "EXECUTION_PROFILE_VERSION_MISMATCH"
  | "EXECUTION_PROFILE_DISABLED"
  | "EXECUTION_PROFILE_UNQUALIFIED"
  | "EXECUTION_PROFILE_REVOKED"
  | "EXECUTION_PROFILE_QUALIFICATION_MISSING"
  | "EXECUTION_PROFILE_QUALIFICATION_INVALID"
  | "EXECUTION_PROFILE_QUALIFICATION_MISMATCH"
  | "EXECUTION_PROFILE_QUALIFICATION_EXPIRED"
  | "EXECUTION_PROFILE_HARNESS_MISMATCH"
  | "EXECUTION_PROFILE_RUNTIME_ARTIFACT_MISMATCH"
  | "EXECUTION_PROFILE_BACKEND_MISMATCH"
  | "EXECUTION_PROFILE_MODEL_ROUTE_MISMATCH"
  | "EXECUTION_PROFILE_SANDBOX_MISMATCH"
  | "EXECUTION_PROFILE_ISOLATION_MISMATCH"
  | "EXECUTION_PROFILE_CAPABILITY_MISMATCH"
  | "EXECUTION_PROFILE_EVIDENCE_MISMATCH"
  | "EXECUTION_PROFILE_QUALIFICATION_REPLAY"
  | "EXECUTION_PROFILE_ALREADY_QUALIFIED";

export interface ExecutionProfileSnapshotInput {
  profileKey: string;
  version: number;
  harness: {
    adapter: string;
    version: string;
    capabilityManifest: HarnessCapabilityManifest;
    capabilityManifestDigest: string;
    effectiveConfigSha256: string;
  };
  runtimeArtifact: {
    snapshot: HarnessRuntimeArtifactIdentity;
    digest: string;
  };
  executionBackend: ModelRouteExecutionBackend;
  modelRoute: {
    catalogId: string;
    routeSnapshot: unknown;
    routeDigest: string;
    qualificationSnapshot: unknown;
    qualificationDigest: string;
  };
  sandboxProfile?: {
    profileId: string;
    profileSnapshot: unknown;
    profileDigest: string;
  };
  isolationModes: IsolationMode[];
}

export interface ExecutionProfileQualificationInput {
  profileId: string;
  profileSnapshot: unknown;
  profileDigest: string;
  workloadClasses: string[];
  riskClasses: ModelRouteRiskClass[];
  evidenceReference: string;
  evidenceDigest: string;
  approvedBy: string;
  approvedAt: number;
  validUntil: number;
}

export interface ExecutionProfileAdmissionRecord {
  _id?: unknown;
  profileKey?: string;
  version?: number;
  profileDigest?: string;
  immutableSnapshot?: unknown;
  enabled?: boolean;
  qualificationStatus?: string;
  admissionStatus?: string;
  qualificationSnapshot?: unknown;
  qualificationDigest?: string;
  qualificationExpiresAt?: number;
  qualificationIdempotencyKey?: string;
  promotedBy?: string;
  promotedAt?: number;
  revokedAt?: number;
}

/** Denormalized database projection of one immutable profile. These fields are
 * intentionally checked even before qualification so corrupted or partially
 * rewritten drafts cannot be promoted. */
export interface ExecutionProfilePersistedRecord extends ExecutionProfileAdmissionRecord {
  executor?: { adapter?: string; version?: string };
  harnessCapabilityManifest?: unknown;
  harnessCapabilityManifestDigest?: string;
  harnessEffectiveConfigSha256?: string;
  harnessRuntimeArtifact?: unknown;
  harnessRuntimeArtifactDigest?: string;
  executionBackend?: string;
  modelCatalogId?: unknown;
  modelRouteDigest?: string;
  modelQualificationDigest?: string;
  sandboxProfileId?: unknown;
  sandboxProfileDigest?: string;
  isolationModes?: unknown;
  requiredHarnessCapabilities?: unknown;
  requiredSandboxCapabilities?: unknown;
}

/** Flat compatibility projection used by Factory Versions, Attempts, manifests,
 * and workers. Every field is compared against the immutable profile. */
export interface ExecutionProfileProjection {
  profileId: string;
  profileKey: string;
  profileVersion: number;
  profileDigest: string;
  profileSnapshot: unknown;
  qualificationDigest: string;
  qualificationSnapshot: unknown;
  executor: { adapter: string; version: string };
  harnessCapabilityManifest: unknown;
  harnessCapabilityManifestDigest: string;
  harnessEffectiveConfigSha256: string;
  harnessRuntimeArtifact: unknown;
  harnessRuntimeArtifactDigest: string;
  executionBackend: string;
  modelCatalogId: string;
  modelRouteSnapshot: unknown;
  modelRouteDigest: string;
  modelQualificationSnapshot: unknown;
  modelQualificationDigest: string;
  sandboxProfileId?: string;
  sandboxProfileSnapshot?: unknown;
  sandboxProfileDigest?: string;
  isolationModes: IsolationMode[];
  requiredHarnessCapabilities: HarnessCapabilityRequirement[];
  requiredSandboxCapabilities: string[];
}

export interface ExecutionProfileCurrentness {
  eligible: boolean;
  blocker: ExecutionProfileBlockerCode | null;
  profileDigest?: string;
  qualificationDigest?: string;
  validUntil?: number;
}

/** Constructs the one canonical immutable profile. Component digests are
 * caller-supplied exact identities and are independently recomputed below. */
export function executionProfileSnapshot(input: ExecutionProfileSnapshotInput) {
  const isolationModes = sortedUnique(input.isolationModes);
  const requiredHarnessCapabilities = requiredHarnessCapabilitiesFor(isolationModes);
  const requiredSandboxCapabilities = requiredSandboxCapabilitiesFor(
    isolationModes,
    input.executionBackend,
    input.sandboxProfile?.profileSnapshot,
  );
  const manifest = persistedClone(input.harness.capabilityManifest);
  const runtimeArtifact = persistedClone(input.runtimeArtifact.snapshot);
  const routeSnapshot = persistedClone(input.modelRoute.routeSnapshot);
  const routeQualification = persistedClone(input.modelRoute.qualificationSnapshot);
  const snapshot = {
    schema: EXECUTION_PROFILE_SCHEMA,
    profileKey: input.profileKey.trim().toLowerCase(),
    version: input.version,
    harness: {
      adapter: input.harness.adapter.trim(),
      version: input.harness.version.trim(),
      capabilityManifest: manifest,
      capabilityManifestDigest: input.harness.capabilityManifestDigest.trim().toLowerCase(),
      effectiveConfigSha256: input.harness.effectiveConfigSha256.trim().toLowerCase(),
    },
    runtimeArtifact: {
      snapshot: runtimeArtifact,
      digest: input.runtimeArtifact.digest.trim().toLowerCase(),
    },
    executionBackend: input.executionBackend,
    modelRoute: {
      catalogId: input.modelRoute.catalogId.trim(),
      routeSnapshot,
      routeDigest: input.modelRoute.routeDigest.trim().toLowerCase(),
      qualificationSnapshot: routeQualification,
      qualificationDigest: input.modelRoute.qualificationDigest.trim().toLowerCase(),
    },
    ...(input.sandboxProfile
      ? {
          sandboxProfile: {
            profileId: input.sandboxProfile.profileId.trim(),
            profileSnapshot: persistedClone(input.sandboxProfile.profileSnapshot),
            profileDigest: input.sandboxProfile.profileDigest.trim().toLowerCase(),
          },
        }
      : {}),
    isolationModes,
    requiredHarnessCapabilities,
    requiredSandboxCapabilities,
    lifecycle: {
      contractVersion: GENERIC_HARNESS_CONTRACT_VERSION,
      cancellationMode: manifest.cancellation.mode,
      idempotentCleanup: manifest.cancellation.idempotentCleanup,
      retryCreatesNewAttempt: true,
      inFlightRevocationPolicy: "LEASED_ATTEMPT_MAY_COMPLETE" as const,
      componentSubstitution: "DENIED" as const,
    },
    authority: executionProfileAuthority(),
  };
  const issues = executionProfileIssues(snapshot);
  if (issues.length > 0) {
    throw new Error(`Execution Profile identity is invalid (${issues.join(", ")}).`);
  }
  return snapshot;
}

export function executionProfileIssues(input: unknown): string[] {
  if (!plainObject(input)) return ["profile-snapshot-invalid"];
  const profile = input as Record<string, any>;
  const issues: string[] = [];
  if (profile.schema !== EXECUTION_PROFILE_SCHEMA) issues.push("profile-schema-invalid");
  if (!onlyKeys(profile, [
    "schema",
    "profileKey",
    "version",
    "harness",
    "runtimeArtifact",
    "executionBackend",
    "modelRoute",
    "sandboxProfile",
    "isolationModes",
    "requiredHarnessCapabilities",
    "requiredSandboxCapabilities",
    "lifecycle",
    "authority",
  ])) issues.push("profile-fields-invalid");
  if (!boundedLowercaseKey(profile.profileKey, 100)) issues.push("profile-key-invalid");
  if (!Number.isSafeInteger(profile.version) || profile.version < 1 || profile.version > 1_000_000) {
    issues.push("profile-version-invalid");
  }
  issues.push(...harnessBindingIssues(profile.harness));
  issues.push(...runtimeArtifactBindingIssues(profile.runtimeArtifact));
  if (profile.executionBackend !== "persistent-worker" && profile.executionBackend !== "remote-sandbox") {
    issues.push("execution-backend-invalid");
  }
  issues.push(...modelRouteBindingIssues(profile.modelRoute, profile));
  issues.push(...sandboxBindingIssues(profile.sandboxProfile, profile));
  if (!canonicalIsolationModes(profile.isolationModes)) issues.push("isolation-modes-invalid");

  const derivedHarness = canonicalIsolationModes(profile.isolationModes)
    ? requiredHarnessCapabilitiesFor(profile.isolationModes)
    : [];
  if (!harnessCapabilityRequirements(profile.requiredHarnessCapabilities)
    || !sameCanonical(profile.requiredHarnessCapabilities, derivedHarness)) {
    issues.push("required-harness-capabilities-invalid");
  }
  const derivedSandbox = canonicalIsolationModes(profile.isolationModes)
    && (profile.executionBackend === "persistent-worker" || profile.executionBackend === "remote-sandbox")
    ? requiredSandboxCapabilitiesFor(
        profile.isolationModes,
        profile.executionBackend,
        profile.sandboxProfile?.profileSnapshot,
      )
    : [];
  if (!boundedSortedStrings(profile.requiredSandboxCapabilities, 16, 100)
    || !sameCanonical(profile.requiredSandboxCapabilities, derivedSandbox)) {
    issues.push("required-sandbox-capabilities-invalid");
  }

  if (plainObject(profile.harness?.capabilityManifest)) {
    const manifest = profile.harness.capabilityManifest as HarnessCapabilityManifest;
    if (canonicalIsolationModes(profile.isolationModes)
      && profile.isolationModes.some((mode: IsolationMode) => !manifest.sandbox?.isolationModes?.includes(mode))) {
      issues.push("harness-isolation-unsupported");
    }
    if (profile.executionBackend === "persistent-worker" || profile.executionBackend === "remote-sandbox") {
      if (!manifest.admission?.executionBackends?.includes(profile.executionBackend)) {
        issues.push("harness-backend-unsupported");
      }
    }
    if (harnessCapabilityRequirements(profile.requiredHarnessCapabilities)
      && !harnessCapabilityRequirementsSatisfied(manifest, profile.requiredHarnessCapabilities)) {
      issues.push("harness-capabilities-unsupported");
    }
  }
  issues.push(...lifecycleIssues(profile.lifecycle, profile.harness?.capabilityManifest));
  if (!allDeniedAuthority(profile.authority)) issues.push("profile-authority-invalid");
  return [...new Set(issues)];
}

export function executionProfileDigest(snapshot: unknown) {
  const issues = executionProfileIssues(snapshot);
  if (issues.length > 0) {
    throw new Error(`Execution Profile identity is invalid (${issues.join(", ")}).`);
  }
  return `sha256:${computeCanonicalHash({ namespace: EXECUTION_PROFILE_SCHEMA, value: snapshot })}`;
}

/** Qualification derives all component bindings from the canonical profile;
 * callers cannot submit a looser or alternate tuple. */
export function executionProfileQualificationSnapshot(input: ExecutionProfileQualificationInput) {
  const profile = input.profileSnapshot as Record<string, any>;
  if (executionProfileIssues(profile).length > 0
    || executionProfileDigest(profile) !== input.profileDigest.trim().toLowerCase()) {
    throw new Error("Execution Profile qualification requires the exact immutable profile digest.");
  }
  const snapshot = {
    schema: EXECUTION_PROFILE_QUALIFICATION_SCHEMA,
    profile: {
      id: input.profileId.trim(),
      key: profile.profileKey,
      version: profile.version,
      digest: input.profileDigest.trim().toLowerCase(),
    },
    components: qualificationComponents(profile),
    scope: {
      workloadClasses: sortedUnique(input.workloadClasses),
      riskClasses: sortedUnique(input.riskClasses),
    },
    evidence: {
      reference: input.evidenceReference.trim(),
      digest: input.evidenceDigest.trim().toLowerCase(),
    },
    approvedBy: input.approvedBy.trim(),
    approvedAt: input.approvedAt,
    validUntil: input.validUntil,
    authority: executionProfileAuthority(),
  };
  const issues = executionProfileQualificationIssues(snapshot);
  if (issues.length > 0) {
    throw new Error(`Execution Profile qualification is invalid (${issues.join(", ")}).`);
  }
  if (!qualificationScopeWithinProfile(profile, snapshot)) {
    throw new Error("Execution Profile qualification scope exceeds a referenced component qualification.");
  }
  return snapshot;
}

export function executionProfileQualificationIssues(input: unknown): string[] {
  if (!plainObject(input)) return ["qualification-snapshot-invalid"];
  const qualification = input as Record<string, any>;
  const issues: string[] = [];
  if (qualification.schema !== EXECUTION_PROFILE_QUALIFICATION_SCHEMA) issues.push("qualification-schema-invalid");
  if (!onlyKeys(qualification, [
    "schema",
    "profile",
    "components",
    "scope",
    "evidence",
    "approvedBy",
    "approvedAt",
    "validUntil",
    "authority",
  ])) issues.push("qualification-fields-invalid");
  if (!plainObject(qualification.profile)
    || !onlyKeys(qualification.profile, ["id", "key", "version", "digest"])) {
    issues.push("qualification-profile-fields-invalid");
  }
  if (!boundedIdentity(qualification.profile?.id, 200)) issues.push("qualification-profile-id-invalid");
  if (!boundedLowercaseKey(qualification.profile?.key, 100)) issues.push("qualification-profile-key-invalid");
  if (!Number.isSafeInteger(qualification.profile?.version) || qualification.profile.version < 1) {
    issues.push("qualification-profile-version-invalid");
  }
  if (!sha256(qualification.profile?.digest)) issues.push("qualification-profile-digest-invalid");
  issues.push(...qualificationComponentIssues(qualification.components));
  if (!plainObject(qualification.scope)
    || !onlyKeys(qualification.scope, ["workloadClasses", "riskClasses"])) {
    issues.push("qualification-scope-fields-invalid");
  }
  if (!boundedSortedEnums(qualification.scope?.workloadClasses, 50)) {
    issues.push("qualification-workload-scope-invalid");
  }
  if (!Array.isArray(qualification.scope?.riskClasses)
    || qualification.scope.riskClasses.length < 1
    || qualification.scope.riskClasses.length > 3
    || !isUniqueSorted(qualification.scope.riskClasses)
    || qualification.scope.riskClasses.some((risk: unknown) => !["GREEN", "YELLOW", "RED"].includes(String(risk)))) {
    issues.push("qualification-risk-scope-invalid");
  }
  if (!plainObject(qualification.evidence)
    || !onlyKeys(qualification.evidence, ["reference", "digest"])
    || !boundedIdentity(qualification.evidence?.reference, 1_000)
    || !sha256(qualification.evidence?.digest)) {
    issues.push("qualification-evidence-invalid");
  }
  if (!boundedIdentity(qualification.approvedBy, 200)) issues.push("qualification-approver-invalid");
  if (!Number.isFinite(qualification.approvedAt) || qualification.approvedAt < 0) {
    issues.push("qualification-approved-at-invalid");
  }
  if (!Number.isFinite(qualification.validUntil)
    || qualification.validUntil <= qualification.approvedAt
    || qualification.validUntil - qualification.approvedAt > MAX_EXECUTION_PROFILE_QUALIFICATION_LIFETIME_MS) {
    issues.push("qualification-valid-until-invalid");
  }
  if (!allDeniedAuthority(qualification.authority)) issues.push("qualification-authority-invalid");
  return [...new Set(issues)];
}

export function executionProfileQualificationDigest(snapshot: unknown) {
  const issues = executionProfileQualificationIssues(snapshot);
  if (issues.length > 0) {
    throw new Error(`Execution Profile qualification is invalid (${issues.join(", ")}).`);
  }
  return `sha256:${computeCanonicalHash({
    namespace: EXECUTION_PROFILE_QUALIFICATION_SCHEMA,
    value: snapshot,
  })}`;
}

export function executionProfileQualificationMatches(input: {
  profileId: string;
  profileSnapshot: unknown;
  profileDigest: string;
  qualificationSnapshot: unknown;
}) {
  if (executionProfileIssues(input.profileSnapshot).length > 0
    || executionProfileQualificationIssues(input.qualificationSnapshot).length > 0) return false;
  let digest: string;
  try {
    digest = executionProfileDigest(input.profileSnapshot);
  } catch {
    return false;
  }
  if (digest !== input.profileDigest) return false;
  const profile = input.profileSnapshot as Record<string, any>;
  const qualification = input.qualificationSnapshot as Record<string, any>;
  return qualification.profile.id === input.profileId
    && qualification.profile.key === profile.profileKey
    && qualification.profile.version === profile.version
    && qualification.profile.digest === input.profileDigest
    && sameCanonical(qualification.components, qualificationComponents(profile))
    && qualificationScopeWithinProfile(profile, qualification);
}

/** Record-only currentness. Live workers/routes/sandboxes are checked by exact
 * projection reconciliation, not silently substituted here. */
export function executionProfileCurrentness(
  record: ExecutionProfileAdmissionRecord | null | undefined,
  now: number,
): ExecutionProfileCurrentness {
  if (!record) return currentness("EXECUTION_PROFILE_MISSING");
  const profile = record.immutableSnapshot as Record<string, any> | undefined;
  if (profile?.schema !== EXECUTION_PROFILE_SCHEMA) return currentness("EXECUTION_PROFILE_UNSUPPORTED");
  if (executionProfileIssues(profile).length > 0) return currentness("EXECUTION_PROFILE_SNAPSHOT_INVALID");
  let profileDigest: string;
  try {
    profileDigest = executionProfileDigest(profile);
  } catch {
    return currentness("EXECUTION_PROFILE_SNAPSHOT_INVALID");
  }
  if (record.profileDigest !== profileDigest) return currentness("EXECUTION_PROFILE_DIGEST_MISMATCH");
  if (record.profileKey !== profile.profileKey) return currentness("EXECUTION_PROFILE_IDENTITY_MISMATCH");
  if (record.version !== profile.version) return currentness("EXECUTION_PROFILE_VERSION_MISMATCH");
  if (record.admissionStatus === "REVOKED" || record.revokedAt !== undefined) {
    return currentness("EXECUTION_PROFILE_REVOKED");
  }
  if (record.enabled !== true || record.admissionStatus !== "PRODUCTION_PILOT_ELIGIBLE") {
    return currentness("EXECUTION_PROFILE_DISABLED");
  }
  if (record.qualificationStatus !== "EVIDENCE_QUALIFIED") {
    return currentness("EXECUTION_PROFILE_UNQUALIFIED");
  }
  if (!record.qualificationSnapshot || !record.qualificationDigest) {
    return currentness("EXECUTION_PROFILE_QUALIFICATION_MISSING");
  }
  if (executionProfileQualificationIssues(record.qualificationSnapshot).length > 0) {
    return currentness("EXECUTION_PROFILE_QUALIFICATION_INVALID");
  }
  let qualificationDigest: string;
  try {
    qualificationDigest = executionProfileQualificationDigest(record.qualificationSnapshot);
  } catch {
    return currentness("EXECUTION_PROFILE_QUALIFICATION_INVALID");
  }
  if (record.qualificationDigest !== qualificationDigest
    || !executionProfileQualificationMatches({
      profileId: String(record._id ?? ""),
      profileSnapshot: profile,
      profileDigest,
      qualificationSnapshot: record.qualificationSnapshot,
    })) {
    return currentness("EXECUTION_PROFILE_QUALIFICATION_MISMATCH");
  }
  const qualification = record.qualificationSnapshot as Record<string, any>;
  if (record.qualificationExpiresAt !== qualification.validUntil
    || record.promotedBy !== qualification.approvedBy
    || record.promotedAt !== qualification.approvedAt) {
    return currentness("EXECUTION_PROFILE_QUALIFICATION_MISMATCH");
  }
  if (qualification.validUntil <= now) return currentness("EXECUTION_PROFILE_QUALIFICATION_EXPIRED");
  return {
    eligible: true,
    blocker: null,
    profileDigest,
    qualificationDigest,
    validUntil: qualification.validUntil,
  };
}

/** Full admission currentness against the live component rows. This remains a
 * pure helper: callers own workspace authorization and database reads. */
export function executionProfileCurrentnessIssues(input: {
  profile: ExecutionProfilePersistedRecord | null | undefined;
  modelRoute: {
    _id?: unknown;
    routeSnapshot?: unknown;
    routeDigest?: string;
    enabled?: boolean;
    qualificationStatus?: string;
    admissionStatus?: string;
    qualificationSnapshot?: unknown;
    qualificationDigest?: string;
  } | null | undefined;
  sandboxProfile?: {
    _id?: unknown;
    profileDigest?: string;
    immutableSnapshot?: unknown;
    admissionState?: string;
    admissionSnapshot?: unknown;
    admissionDigest?: string;
    status?: string;
    readinessState?: string;
    readinessExpiresAt?: number;
  } | null;
  now: number;
}): ExecutionProfileBlockerCode[] {
  const recordCurrentness = executionProfileCurrentness(input.profile, input.now);
  const fatalRecordBlockers = new Set<ExecutionProfileBlockerCode>([
    "EXECUTION_PROFILE_MISSING",
    "EXECUTION_PROFILE_UNSUPPORTED",
    "EXECUTION_PROFILE_SNAPSHOT_INVALID",
    "EXECUTION_PROFILE_DIGEST_MISMATCH",
    "EXECUTION_PROFILE_IDENTITY_MISMATCH",
    "EXECUTION_PROFILE_VERSION_MISMATCH",
  ]);
  if (recordCurrentness.blocker && fatalRecordBlockers.has(recordCurrentness.blocker)) {
    return [recordCurrentness.blocker];
  }
  const profile = input.profile!.immutableSnapshot as Record<string, any>;
  const blockers: ExecutionProfileBlockerCode[] = recordCurrentness.blocker
    ? [recordCurrentness.blocker]
    : [];
  blockers.push(...executionProfilePersistedRecordBlockers(input.profile));
  const knownManifest = findKnownHarnessManifest(profile.harness.adapter, profile.harness.version);
  if (!knownManifest
    || harnessCapabilityManifestDigest(knownManifest) !== profile.harness.capabilityManifestDigest
    || knownManifest.effectiveConfigSha256 !== profile.harness.effectiveConfigSha256
    || !sameCanonical(knownManifest, profile.harness.capabilityManifest)) {
    blockers.push("EXECUTION_PROFILE_HARNESS_MISMATCH");
  }
  if (profile.executionBackend === "persistent-worker") {
    const knownRuntime = findKnownHarnessRuntimeArtifact(profile.harness.adapter, profile.harness.version);
    if (!knownRuntime
      || harnessRuntimeArtifactDigest(knownRuntime) !== profile.runtimeArtifact.digest
      || !sameCanonical(knownRuntime, profile.runtimeArtifact.snapshot)) {
      blockers.push("EXECUTION_PROFILE_RUNTIME_ARTIFACT_MISMATCH");
    }
  }
  const exactCompatibility = {
    adapter: profile.harness.adapter,
    version: profile.harness.version,
    capabilityManifestDigest: profile.harness.capabilityManifestDigest,
    effectiveConfigSha256: profile.harness.effectiveConfigSha256,
    runtimeArtifactDigest: profile.runtimeArtifact.digest,
    executionBackend: profile.executionBackend as ModelRouteExecutionBackend,
  };
  if (!input.modelRoute
    || String(input.modelRoute._id ?? "") !== profile.modelRoute.catalogId
    || !sameCanonical(input.modelRoute.routeSnapshot, profile.modelRoute.routeSnapshot)
    || input.modelRoute.routeDigest !== profile.modelRoute.routeDigest
    || !sameCanonical(input.modelRoute.qualificationSnapshot, profile.modelRoute.qualificationSnapshot)
    || input.modelRoute.qualificationDigest !== profile.modelRoute.qualificationDigest
    || !modelRouteEligibleForNewFactoryVersion(input.modelRoute, exactCompatibility)) {
    blockers.push("EXECUTION_PROFILE_MODEL_ROUTE_MISMATCH");
  }
  if (profile.executionBackend === "remote-sandbox") {
    const sandbox = input.sandboxProfile;
    if (!sandbox
      || String(sandbox._id ?? "") !== profile.sandboxProfile?.profileId
      || sandbox.profileDigest !== profile.sandboxProfile?.profileDigest
      || !sameCanonical(sandbox.immutableSnapshot, profile.sandboxProfile?.profileSnapshot)
      || sandbox.status !== "ACTIVE"
      || sandbox.readinessState === "BLOCKED"
      || !Number.isFinite(sandbox.readinessExpiresAt)
      || sandbox.readinessExpiresAt! <= input.now
      || !sandboxProfileProductionEligible(sandbox)) {
      blockers.push("EXECUTION_PROFILE_SANDBOX_MISMATCH");
    }
  } else if (input.sandboxProfile) {
    blockers.push("EXECUTION_PROFILE_SANDBOX_MISMATCH");
  }
  return [...new Set(blockers)];
}

export function executionProfileQualifiedFor(
  profile: ExecutionProfileAdmissionRecord | null | undefined,
  input: { workloadClass: string; riskClass: ModelRouteRiskClass; now?: number },
) {
  const current = executionProfileCurrentness(profile, input.now ?? Date.now());
  if (!current.eligible) return false;
  const qualification = profile!.qualificationSnapshot as Record<string, any>;
  return qualification.scope.workloadClasses.includes(input.workloadClass)
    && qualification.scope.riskClasses.includes(input.riskClass);
}

/** Verifies that every persisted compatibility field is only a projection of
 * the immutable snapshot. Qualification is deliberately not required here so
 * registration retries and pre-qualification admission can fail closed. */
export function executionProfilePersistedRecordBlockers(
  record: ExecutionProfilePersistedRecord | null | undefined,
): ExecutionProfileBlockerCode[] {
  if (!record) return ["EXECUTION_PROFILE_MISSING"];
  const profile = record.immutableSnapshot as Record<string, any> | undefined;
  if (profile?.schema !== EXECUTION_PROFILE_SCHEMA) return ["EXECUTION_PROFILE_UNSUPPORTED"];
  if (executionProfileIssues(profile).length > 0) return ["EXECUTION_PROFILE_SNAPSHOT_INVALID"];

  const blockers: ExecutionProfileBlockerCode[] = [];
  let digest: string;
  try {
    digest = executionProfileDigest(profile);
  } catch {
    return ["EXECUTION_PROFILE_SNAPSHOT_INVALID"];
  }
  if (record.profileDigest !== digest) blockers.push("EXECUTION_PROFILE_DIGEST_MISMATCH");
  if (record.profileKey !== profile.profileKey) blockers.push("EXECUTION_PROFILE_IDENTITY_MISMATCH");
  if (record.version !== profile.version) blockers.push("EXECUTION_PROFILE_VERSION_MISMATCH");
  if (record.executor?.adapter !== profile.harness.adapter
    || record.executor?.version !== profile.harness.version
    || record.harnessCapabilityManifestDigest !== profile.harness.capabilityManifestDigest
    || record.harnessEffectiveConfigSha256 !== profile.harness.effectiveConfigSha256
    || !sameCanonical(record.harnessCapabilityManifest, profile.harness.capabilityManifest)) {
    blockers.push("EXECUTION_PROFILE_HARNESS_MISMATCH");
  }
  if (record.harnessRuntimeArtifactDigest !== profile.runtimeArtifact.digest
    || !sameCanonical(record.harnessRuntimeArtifact, profile.runtimeArtifact.snapshot)) {
    blockers.push("EXECUTION_PROFILE_RUNTIME_ARTIFACT_MISMATCH");
  }
  if (record.executionBackend !== profile.executionBackend) {
    blockers.push("EXECUTION_PROFILE_BACKEND_MISMATCH");
  }
  if (String(record.modelCatalogId ?? "") !== profile.modelRoute.catalogId
    || record.modelRouteDigest !== profile.modelRoute.routeDigest
    || record.modelQualificationDigest !== profile.modelRoute.qualificationDigest) {
    blockers.push("EXECUTION_PROFILE_MODEL_ROUTE_MISMATCH");
  }
  const expectedSandbox = profile.sandboxProfile as Record<string, any> | undefined;
  const sandboxMismatch = expectedSandbox
    ? (String(record.sandboxProfileId ?? "") !== expectedSandbox.profileId
      || record.sandboxProfileDigest !== expectedSandbox.profileDigest)
    : (record.sandboxProfileId !== undefined || record.sandboxProfileDigest !== undefined);
  if (sandboxMismatch) {
    blockers.push("EXECUTION_PROFILE_SANDBOX_MISMATCH");
  }
  if (!sameCanonical(record.isolationModes, profile.isolationModes)) {
    blockers.push("EXECUTION_PROFILE_ISOLATION_MISMATCH");
  }
  if (!sameCanonical(record.requiredHarnessCapabilities, profile.requiredHarnessCapabilities)
    || !sameCanonical(record.requiredSandboxCapabilities, profile.requiredSandboxCapabilities)) {
    blockers.push("EXECUTION_PROFILE_CAPABILITY_MISMATCH");
  }
  return [...new Set(blockers)];
}

/** Reconciles a frozen Factory/Attempt/manifest/worker projection against one
 * exact profile. The ordered blocker list is stable and suitable for evidence. */
export function executionProfileProjectionBlockers(input: {
  profileId: string;
  profileSnapshot: unknown;
  profileDigest: string;
  qualificationSnapshot: unknown;
  qualificationDigest: string;
  projection: ExecutionProfileProjection | null | undefined;
}): ExecutionProfileBlockerCode[] {
  if (!input.projection) return ["EXECUTION_PROFILE_MISSING"];
  const projection = input.projection;
  const profile = input.profileSnapshot as Record<string, any>;
  if (executionProfileIssues(profile).length > 0) return ["EXECUTION_PROFILE_SNAPSHOT_INVALID"];
  const blockers: ExecutionProfileBlockerCode[] = [];
  let canonicalProfileDigest: string;
  try {
    canonicalProfileDigest = executionProfileDigest(profile);
  } catch {
    return ["EXECUTION_PROFILE_SNAPSHOT_INVALID"];
  }
  if (canonicalProfileDigest !== input.profileDigest) {
    blockers.push("EXECUTION_PROFILE_DIGEST_MISMATCH");
  }
  if (executionProfileQualificationIssues(input.qualificationSnapshot).length > 0) {
    blockers.push("EXECUTION_PROFILE_QUALIFICATION_INVALID");
  } else {
    let canonicalQualificationDigest: string | undefined;
    try {
      canonicalQualificationDigest = executionProfileQualificationDigest(input.qualificationSnapshot);
    } catch {
      blockers.push("EXECUTION_PROFILE_QUALIFICATION_INVALID");
    }
    if (canonicalQualificationDigest !== input.qualificationDigest
      || !executionProfileQualificationMatches({
        profileId: input.profileId,
        profileSnapshot: profile,
        profileDigest: canonicalProfileDigest,
        qualificationSnapshot: input.qualificationSnapshot,
      })) {
      blockers.push("EXECUTION_PROFILE_QUALIFICATION_MISMATCH");
    }
  }
  if (projection.profileId !== input.profileId
    || projection.profileKey !== profile.profileKey) blockers.push("EXECUTION_PROFILE_IDENTITY_MISMATCH");
  if (projection.profileVersion !== profile.version) blockers.push("EXECUTION_PROFILE_VERSION_MISMATCH");
  if (projection.profileDigest !== input.profileDigest
    || !sameCanonical(projection.profileSnapshot, profile)) blockers.push("EXECUTION_PROFILE_DIGEST_MISMATCH");
  if (projection.qualificationDigest !== input.qualificationDigest) {
    blockers.push("EXECUTION_PROFILE_QUALIFICATION_MISMATCH");
  }
  if (!sameCanonical(projection.qualificationSnapshot, input.qualificationSnapshot)) {
    const expectedEvidence = (input.qualificationSnapshot as Record<string, any> | undefined)?.evidence;
    const projectedEvidence = (projection.qualificationSnapshot as Record<string, any> | undefined)?.evidence;
    blockers.push(sameCanonical(expectedEvidence, projectedEvidence)
      ? "EXECUTION_PROFILE_QUALIFICATION_MISMATCH"
      : "EXECUTION_PROFILE_EVIDENCE_MISMATCH");
  }
  if (projection.executor?.adapter !== profile.harness.adapter
    || projection.executor?.version !== profile.harness.version
    || projection.harnessCapabilityManifestDigest !== profile.harness.capabilityManifestDigest
    || projection.harnessEffectiveConfigSha256 !== profile.harness.effectiveConfigSha256
    || !sameCanonical(projection.harnessCapabilityManifest, profile.harness.capabilityManifest)) {
    blockers.push("EXECUTION_PROFILE_HARNESS_MISMATCH");
  }
  if (projection.harnessRuntimeArtifactDigest !== profile.runtimeArtifact.digest
    || !sameCanonical(projection.harnessRuntimeArtifact, profile.runtimeArtifact.snapshot)) {
    blockers.push("EXECUTION_PROFILE_RUNTIME_ARTIFACT_MISMATCH");
  }
  if (projection.executionBackend !== profile.executionBackend) {
    blockers.push("EXECUTION_PROFILE_BACKEND_MISMATCH");
  }
  if (projection.modelCatalogId !== profile.modelRoute.catalogId
    || projection.modelRouteDigest !== profile.modelRoute.routeDigest
    || projection.modelQualificationDigest !== profile.modelRoute.qualificationDigest
    || !sameCanonical(projection.modelRouteSnapshot, profile.modelRoute.routeSnapshot)
    || !sameCanonical(projection.modelQualificationSnapshot, profile.modelRoute.qualificationSnapshot)) {
    blockers.push("EXECUTION_PROFILE_MODEL_ROUTE_MISMATCH");
  }
  if (!sandboxProjectionMatches(profile.sandboxProfile, projection)) {
    blockers.push("EXECUTION_PROFILE_SANDBOX_MISMATCH");
  }
  if (!sameCanonical(projection.isolationModes, profile.isolationModes)) {
    blockers.push("EXECUTION_PROFILE_ISOLATION_MISMATCH");
  }
  if (!sameCanonical(projection.requiredHarnessCapabilities, profile.requiredHarnessCapabilities)
    || !sameCanonical(projection.requiredSandboxCapabilities, profile.requiredSandboxCapabilities)) {
    blockers.push("EXECUTION_PROFILE_CAPABILITY_MISMATCH");
  }
  return [...new Set(blockers)];
}

export function executionProfileProjectionMatches(
  input: Parameters<typeof executionProfileProjectionBlockers>[0],
) {
  return executionProfileProjectionBlockers(input).length === 0;
}

/** Qualification is single-use. Exact duplicate receipts are replays; a
 * different receipt is a conflicting attempt to rewrite qualified history. */
export function executionProfileQualificationSubmissionBlocker(
  record: Pick<ExecutionProfileAdmissionRecord, "qualificationDigest" | "qualificationSnapshot">,
  candidateQualificationDigest: string,
): ExecutionProfileBlockerCode | null {
  if (!record.qualificationDigest && !record.qualificationSnapshot) return null;
  return record.qualificationDigest === candidateQualificationDigest
    ? "EXECUTION_PROFILE_QUALIFICATION_REPLAY"
    : "EXECUTION_PROFILE_ALREADY_QUALIFIED";
}

export function executionProfileAuthority() {
  return { ...PROFILE_AUTHORITY };
}

function harnessBindingIssues(input: unknown): string[] {
  if (!plainObject(input)) return ["harness-binding-invalid"];
  const harness = input as Record<string, any>;
  const issues: string[] = [];
  if (!onlyKeys(harness, [
    "adapter",
    "version",
    "capabilityManifest",
    "capabilityManifestDigest",
    "effectiveConfigSha256",
  ])) issues.push("harness-binding-fields-invalid");
  if (!boundedIdentity(harness.adapter, 100)) issues.push("harness-adapter-invalid");
  if (!boundedIdentity(harness.version, 100)) issues.push("harness-version-invalid");
  if (!sha256(harness.capabilityManifestDigest)) issues.push("harness-manifest-digest-invalid");
  if (!sha256Bare(harness.effectiveConfigSha256)) issues.push("harness-config-digest-invalid");
  if (!plainObject(harness.capabilityManifest)) return [...issues, "harness-manifest-invalid"];
  const capabilityManifest = harness.capabilityManifest as HarnessCapabilityManifest;
  try {
    if (!validHarnessManifest(capabilityManifest)) issues.push("harness-manifest-invalid");
    if (harnessCapabilityManifestDigest(capabilityManifest) !== harness.capabilityManifestDigest) {
      issues.push("harness-manifest-digest-mismatch");
    }
  } catch {
    issues.push("harness-manifest-invalid");
  }
  if (harness.capabilityManifest.identity?.adapterId !== harness.adapter
    || harness.capabilityManifest.identity?.adapterVersion !== harness.version) {
    issues.push("harness-identity-mismatch");
  }
  if (harness.capabilityManifest.effectiveConfigSha256 !== harness.effectiveConfigSha256) {
    issues.push("harness-config-digest-mismatch");
  }
  return issues;
}

function runtimeArtifactBindingIssues(input: unknown): string[] {
  if (!plainObject(input)) return ["runtime-artifact-binding-invalid"];
  const runtime = input as Record<string, any>;
  const issues: string[] = [];
  if (!onlyKeys(runtime, ["snapshot", "digest"])) issues.push("runtime-artifact-binding-fields-invalid");
  if (!sha256(runtime.digest)) issues.push("runtime-artifact-digest-invalid");
  if (harnessRuntimeArtifactIssues(runtime.snapshot).length > 0) issues.push("runtime-artifact-invalid");
  else {
    try {
      if (harnessRuntimeArtifactDigest(runtime.snapshot) !== runtime.digest) {
        issues.push("runtime-artifact-digest-mismatch");
      }
    } catch {
      issues.push("runtime-artifact-invalid");
    }
  }
  return issues;
}

function modelRouteBindingIssues(input: unknown, profile: Record<string, any>): string[] {
  if (!plainObject(input)) return ["model-route-binding-invalid"];
  const route = input as Record<string, any>;
  const issues: string[] = [];
  if (!onlyKeys(route, [
    "catalogId",
    "routeSnapshot",
    "routeDigest",
    "qualificationSnapshot",
    "qualificationDigest",
  ])) issues.push("model-route-binding-fields-invalid");
  if (!boundedIdentity(route.catalogId, 200)) issues.push("model-route-catalog-id-invalid");
  if (!sha256(route.routeDigest)) issues.push("model-route-digest-invalid");
  if (!sha256(route.qualificationDigest)) issues.push("model-route-qualification-digest-invalid");
  if (exactModelRouteIssues(route.routeSnapshot).length > 0
    || route.routeSnapshot?.schema !== EXACT_MODEL_ROUTE_SCHEMA) issues.push("model-route-snapshot-invalid");
  else {
    try {
      if (exactModelRouteDigest(route.routeSnapshot) !== route.routeDigest) issues.push("model-route-digest-mismatch");
    } catch {
      issues.push("model-route-snapshot-invalid");
    }
  }
  if (modelRouteQualificationIssues(route.qualificationSnapshot).length > 0
    || route.qualificationSnapshot?.schema !== MODEL_ROUTE_QUALIFICATION_SCHEMA) {
    issues.push("model-route-qualification-invalid");
  } else {
    try {
      if (modelRouteQualificationDigest(route.qualificationSnapshot) !== route.qualificationDigest
        || route.qualificationSnapshot.routeDigest !== route.routeDigest) {
        issues.push("model-route-qualification-mismatch");
      }
    } catch {
      issues.push("model-route-qualification-invalid");
    }
  }
  if (plainObject(profile.harness)
    && plainObject(profile.runtimeArtifact)
    && (profile.executionBackend === "persistent-worker" || profile.executionBackend === "remote-sandbox")
    && !modelRouteExecutionCompatibilityMatches(route.qualificationSnapshot, {
      adapter: profile.harness.adapter,
      version: profile.harness.version,
      capabilityManifestDigest: profile.harness.capabilityManifestDigest,
      effectiveConfigSha256: profile.harness.effectiveConfigSha256,
      runtimeArtifactDigest: profile.runtimeArtifact.digest,
      executionBackend: profile.executionBackend,
    })) {
    issues.push("model-route-compatibility-mismatch");
  }
  if (validHarnessManifest(profile.harness?.capabilityManifest)
    && plainObject(route.routeSnapshot)
    && !harnessSupportsModel(
      profile.harness.capabilityManifest,
      route.routeSnapshot.provider,
      route.routeSnapshot.modelId,
    )) issues.push("model-route-unsupported");
  return issues;
}

function sandboxBindingIssues(input: unknown, profile: Record<string, any>): string[] {
  if (profile.executionBackend === "persistent-worker") {
    if (input !== undefined) return ["sandbox-profile-not-allowed"];
    if (profile.runtimeArtifact?.snapshot?.kind !== "EXECUTABLE"
      || !profile.runtimeArtifact?.snapshot?.executableSha256
      || profile.runtimeArtifact?.snapshot?.imageDigest !== null) {
      return ["persistent-runtime-artifact-invalid"];
    }
    return [];
  }
  if (profile.executionBackend !== "remote-sandbox") return [];
  if (!plainObject(input)) return ["sandbox-profile-required"];
  const sandbox = input as Record<string, any>;
  const issues: string[] = [];
  if (!onlyKeys(sandbox, ["profileId", "profileSnapshot", "profileDigest"])) {
    issues.push("sandbox-profile-binding-fields-invalid");
  }
  if (!boundedIdentity(sandbox.profileId, 200)) issues.push("sandbox-profile-id-invalid");
  if (!sha256(sandbox.profileDigest)) issues.push("sandbox-profile-digest-invalid");
  if (!plainObject(sandbox.profileSnapshot)
    || sandbox.profileSnapshot.schema !== "factory-sandbox-profile/v1"
    || !boundedLowercaseKey(sandbox.profileSnapshot.profileKey, 100)
    || !Number.isSafeInteger(sandbox.profileSnapshot.version)
    || sandbox.profileSnapshot.version < 1) {
    issues.push("sandbox-profile-snapshot-invalid");
  } else {
    const expectedDigest = `sha256:${computeCanonicalHash({
      namespace: "factory-sandbox-profile/v1",
      value: sandbox.profileSnapshot,
    })}`;
    if (expectedDigest !== sandbox.profileDigest) issues.push("sandbox-profile-digest-mismatch");
  }
  const imageDigest = sandbox.profileSnapshot?.security?.image?.digest;
  const imageReferenceDigest = typeof sandbox.profileSnapshot?.machine?.image === "string"
    ? sandbox.profileSnapshot.machine.image.match(/@(sha256:[a-f0-9]{64})$/)?.[1]
    : undefined;
  if (!sha256(imageDigest) || imageReferenceDigest !== imageDigest) {
    issues.push("sandbox-image-identity-invalid");
  }
  if (profile.runtimeArtifact?.snapshot?.kind !== "CONTAINER_IMAGE"
    || profile.runtimeArtifact?.snapshot?.executableSha256 !== null
    || profile.runtimeArtifact?.snapshot?.imageDigest !== imageDigest) {
    issues.push("sandbox-runtime-artifact-mismatch");
  }
  return issues;
}

function lifecycleIssues(input: unknown, manifestInput: unknown): string[] {
  if (!plainObject(input)) return ["profile-lifecycle-invalid"];
  const lifecycle = input as Record<string, any>;
  if (!onlyKeys(lifecycle, [
    "contractVersion",
    "cancellationMode",
    "idempotentCleanup",
    "retryCreatesNewAttempt",
    "inFlightRevocationPolicy",
    "componentSubstitution",
  ])) return ["profile-lifecycle-invalid"];
  const manifest = manifestInput as HarnessCapabilityManifest | undefined;
  return lifecycle.contractVersion === GENERIC_HARNESS_CONTRACT_VERSION
    && lifecycle.cancellationMode === manifest?.cancellation?.mode
    && lifecycle.idempotentCleanup === manifest?.cancellation?.idempotentCleanup
    && lifecycle.retryCreatesNewAttempt === true
    && lifecycle.inFlightRevocationPolicy === "LEASED_ATTEMPT_MAY_COMPLETE"
    && lifecycle.componentSubstitution === "DENIED"
    ? []
    : ["profile-lifecycle-invalid"];
}

function qualificationComponents(profile: Record<string, any>) {
  return {
    harness: {
      adapter: profile.harness.adapter,
      version: profile.harness.version,
      capabilityManifestDigest: profile.harness.capabilityManifestDigest,
      effectiveConfigSha256: profile.harness.effectiveConfigSha256,
    },
    runtimeArtifactDigest: profile.runtimeArtifact.digest,
    executionBackend: profile.executionBackend,
    modelRoute: {
      catalogId: profile.modelRoute.catalogId,
      routeDigest: profile.modelRoute.routeDigest,
      qualificationDigest: profile.modelRoute.qualificationDigest,
    },
    ...(profile.sandboxProfile
      ? {
          sandboxProfile: {
            profileId: profile.sandboxProfile.profileId,
            profileDigest: profile.sandboxProfile.profileDigest,
          },
        }
      : {}),
    isolationModes: persistedClone(profile.isolationModes),
    requiredHarnessCapabilities: persistedClone(profile.requiredHarnessCapabilities),
    requiredSandboxCapabilities: persistedClone(profile.requiredSandboxCapabilities),
  };
}

function qualificationScopeWithinProfile(
  profile: Record<string, any>,
  qualification: Record<string, any>,
) {
  const workloadClasses = qualification.scope?.workloadClasses as unknown;
  const riskClasses = qualification.scope?.riskClasses as unknown;
  const routeScope = profile.modelRoute?.qualificationSnapshot?.scope;
  if (!Array.isArray(workloadClasses)
    || !Array.isArray(riskClasses)
    || !Array.isArray(routeScope?.workloadClasses)
    || !Array.isArray(routeScope?.riskClasses)
    || workloadClasses.some((value) => !routeScope.workloadClasses.includes(value))
    || riskClasses.some((value) => !routeScope.riskClasses.includes(value))) {
    return false;
  }
  if (profile.executionBackend !== "remote-sandbox") return true;
  const sandboxQualification = profile.sandboxProfile?.profileSnapshot?.qualification;
  return Array.isArray(sandboxQualification?.supportedWorkloadClasses)
    && Array.isArray(sandboxQualification?.supportedRiskClasses)
    && workloadClasses.every((value) => sandboxQualification.supportedWorkloadClasses.includes(value))
    && riskClasses.every((value) => sandboxQualification.supportedRiskClasses.includes(value));
}

function qualificationComponentIssues(input: unknown): string[] {
  if (!plainObject(input)) return ["qualification-components-invalid"];
  const components = input as Record<string, any>;
  const issues: string[] = [];
  if (!onlyKeys(components, [
    "harness",
    "runtimeArtifactDigest",
    "executionBackend",
    "modelRoute",
    "sandboxProfile",
    "isolationModes",
    "requiredHarnessCapabilities",
    "requiredSandboxCapabilities",
  ])) issues.push("qualification-component-fields-invalid");
  if (!plainObject(components.harness)
    || !onlyKeys(components.harness, ["adapter", "version", "capabilityManifestDigest", "effectiveConfigSha256"])
    || !boundedIdentity(components.harness?.adapter, 100)
    || !boundedIdentity(components.harness?.version, 100)
    || !sha256(components.harness?.capabilityManifestDigest)
    || !sha256Bare(components.harness?.effectiveConfigSha256)) {
    issues.push("qualification-harness-invalid");
  }
  if (!sha256(components.runtimeArtifactDigest)) issues.push("qualification-runtime-artifact-invalid");
  if (components.executionBackend !== "persistent-worker" && components.executionBackend !== "remote-sandbox") {
    issues.push("qualification-backend-invalid");
  }
  if (!plainObject(components.modelRoute)
    || !onlyKeys(components.modelRoute, ["catalogId", "routeDigest", "qualificationDigest"])
    || !boundedIdentity(components.modelRoute?.catalogId, 200)
    || !sha256(components.modelRoute?.routeDigest)
    || !sha256(components.modelRoute?.qualificationDigest)) {
    issues.push("qualification-model-route-invalid");
  }
  if (components.executionBackend === "remote-sandbox") {
    if (!plainObject(components.sandboxProfile)
      || !onlyKeys(components.sandboxProfile, ["profileId", "profileDigest"])
      || !boundedIdentity(components.sandboxProfile?.profileId, 200)
      || !sha256(components.sandboxProfile?.profileDigest)) {
      issues.push("qualification-sandbox-profile-invalid");
    }
  } else if (components.sandboxProfile !== undefined) {
    issues.push("qualification-sandbox-profile-invalid");
  }
  if (!canonicalIsolationModes(components.isolationModes)) issues.push("qualification-isolation-invalid");
  if (!harnessCapabilityRequirements(components.requiredHarnessCapabilities)) {
    issues.push("qualification-harness-capabilities-invalid");
  }
  if (!boundedSortedStrings(components.requiredSandboxCapabilities, 16, 100)) {
    issues.push("qualification-sandbox-capabilities-invalid");
  }
  return issues;
}

function requiredHarnessCapabilitiesFor(isolationModes: IsolationMode[]) {
  const requirements = new Map<string, "PARTIAL" | "SUPPORTED">();
  for (const mode of isolationModes) {
    for (const requirement of factoryHarnessCapabilityRequirements(mode)) {
      const current = requirements.get(requirement.capability);
      if (current !== "SUPPORTED") requirements.set(requirement.capability, requirement.minimumSupport);
    }
  }
  return [...requirements.entries()]
    .map(([capability, minimumSupport]) => ({ capability, minimumSupport }))
    .sort((left, right) => left.capability.localeCompare(right.capability));
}

function requiredSandboxCapabilitiesFor(
  isolationModes: IsolationMode[],
  executionBackend: ModelRouteExecutionBackend,
  sandboxSnapshot: unknown,
) {
  const requirements = new Set<string>(["git-worktree"]);
  if (isolationModes.includes("READ_ONLY")) requirements.add("read-only");
  if (isolationModes.includes("WORKSPACE_WRITE")) requirements.add("workspace-write");
  if (executionBackend === "remote-sandbox") {
    requirements.add("remote-sandbox");
    const provider = (sandboxSnapshot as Record<string, any> | undefined)?.provider;
    if (boundedIdentity(provider, 100)) {
      requirements.add(`sandbox-provider:${provider.toLowerCase().replace(/_/g, "-")}`);
    }
  }
  return [...requirements].sort();
}

function sandboxProjectionMatches(
  expected: Record<string, any> | undefined,
  projection: ExecutionProfileProjection,
) {
  if (!expected) {
    return projection.sandboxProfileId === undefined
      && projection.sandboxProfileDigest === undefined
      && projection.sandboxProfileSnapshot === undefined;
  }
  return projection.sandboxProfileId === expected.profileId
    && projection.sandboxProfileDigest === expected.profileDigest
    && sameCanonical(projection.sandboxProfileSnapshot, expected.profileSnapshot);
}

function currentness(blocker: ExecutionProfileBlockerCode): ExecutionProfileCurrentness {
  return { eligible: false, blocker };
}

function executionProfileAuthorityKeys() {
  return ["routing", "verification", "publication", "acceptance", "merge", "policyMutation", "workerLeases"];
}

function allDeniedAuthority(input: unknown) {
  return plainObject(input)
    && onlyKeys(input, executionProfileAuthorityKeys())
    && executionProfileAuthorityKeys().every((key) => input[key] === false);
}

function closedHarnessManifest(input: Record<string, any>) {
  const groupKeys: Record<string, string[]> = {
    identity: ["harnessId", "harnessVersion", "harnessCommit", "adapterId", "adapterVersion"],
    models: ["providerSelection", "modelSelection", "supported", "reasoningControls"],
    filesystem: ["read", "write", "pathAllowlist", "changedFileCapture"],
    shell: ["available", "commandTimeout", "processTreeCancellation", "credentialEnvironmentScrub"],
    git: ["status", "diff", "commit", "branch", "remotePublication"],
    browser: ["webSearch", "webFetch", "interactiveBrowser"],
    tools: ["native", "mcp", "structuredOutput", "telemetry"],
    subagents: ["available", "parallel", "background", "eventVisibility"],
    streaming: ["events", "modelDeltas", "durableReplay"],
    context: ["persistentSessions", "resume", "fork", "compaction", "instructionFiles"],
    headless: ["support", "mode"],
    cancellation: ["support", "mode", "idempotentCleanup"],
    sandbox: ["isolationModes", "externalSandboxRecommended", "requirements"],
    network: ["providerApi", "packageInstall", "runtimeEgressControl", "destinations"],
    credentials: ["classes", "passedToToolProcesses", "redaction"],
    telemetry: ["tokens", "cost", "toolCalls", "modelRequests", "retries"],
    admission: ["maturity", "executionBackends", "requiredExternalControls", "prohibitedAuthorities"],
  };
  if (!onlyKeys(input, [
    "schemaVersion",
    "scope",
    "identity",
    "effectiveConfigSha256",
    "models",
    "filesystem",
    "shell",
    "git",
    "browser",
    "tools",
    "subagents",
    "streaming",
    "context",
    "headless",
    "cancellation",
    "sandbox",
    "network",
    "credentials",
    "telemetry",
    "admission",
    "limitations",
  ])) return false;
  if (Object.entries(groupKeys).some(([group, keys]) => !plainObject(input[group]) || !onlyKeys(input[group], keys))) {
    return false;
  }
  return Array.isArray(input.models.supported)
    && input.models.supported.every((model: unknown) => plainObject(model)
      && onlyKeys(model, ["provider", "modelId", "selection", "contextWindowTokens", "modalities"]));
}

function validHarnessManifest(input: unknown): input is HarnessCapabilityManifest {
  if (!plainObject(input)) return false;
  try {
    return harnessManifestIssues(input as unknown as HarnessCapabilityManifest).length === 0
      && closedHarnessManifest(input);
  } catch {
    return false;
  }
}

function canonicalIsolationModes(input: unknown): input is IsolationMode[] {
  return Array.isArray(input)
    && input.length > 0
    && input.length <= 2
    && isUniqueSorted(input)
    && input.every((mode) => mode === "READ_ONLY" || mode === "WORKSPACE_WRITE");
}

function harnessCapabilityRequirements(input: unknown): input is HarnessCapabilityRequirement[] {
  return Array.isArray(input)
    && input.length > 0
    && input.length <= 50
    && input.every((item) => plainObject(item)
      && onlyKeys(item, ["capability", "minimumSupport"])
      && boundedIdentity(item.capability, 100)
      && (item.minimumSupport === "PARTIAL" || item.minimumSupport === "SUPPORTED"))
    && isUniqueSorted(input.map((item) => item.capability));
}

function boundedSortedEnums(input: unknown, maximum: number) {
  return Array.isArray(input)
    && input.length > 0
    && input.length <= maximum
    && isUniqueSorted(input)
    && input.every((item) => boundedIdentity(item, 64) && /^[A-Z][A-Z0-9_]{1,63}$/.test(item));
}

function boundedSortedStrings(input: unknown, maximumItems: number, maximumLength: number) {
  return Array.isArray(input)
    && input.length > 0
    && input.length <= maximumItems
    && isUniqueSorted(input)
    && input.every((item) => boundedIdentity(item, maximumLength));
}

function sortedUnique<T extends string>(values: T[]) {
  return [...new Set(values)].sort() as T[];
}

function isUniqueSorted(values: unknown[]) {
  return new Set(values).size === values.length
    && values.every((value, index) => index === 0 || String(values[index - 1]).localeCompare(String(value)) < 0);
}

function sameCanonical(left: unknown, right: unknown) {
  if (left === undefined || right === undefined) return left === right;
  try {
    return computeCanonicalHash(left) === computeCanonicalHash(right);
  } catch {
    return false;
  }
}

function persistedClone<T>(input: T): T {
  return JSON.parse(JSON.stringify(input)) as T;
}

function plainObject(input: unknown): input is Record<string, any> {
  return Boolean(input) && typeof input === "object" && !Array.isArray(input);
}

function onlyKeys(input: unknown, allowed: string[]) {
  return plainObject(input) && Object.keys(input).every((key) => allowed.includes(key));
}

function boundedIdentity(input: unknown, maximum: number): input is string {
  return typeof input === "string"
    && input === input.trim()
    && input.length > 0
    && input.length <= maximum
    && !/[\0\r\n]/.test(input);
}

function boundedLowercaseKey(input: unknown, maximum: number): input is string {
  return boundedIdentity(input, maximum)
    && /^[a-z0-9][a-z0-9._-]*$/.test(input);
}

function sha256(input: unknown): input is string {
  return typeof input === "string"
    && /^sha256:[a-f0-9]{64}$/.test(input);
}

function sha256Bare(input: unknown): input is string {
  return typeof input === "string"
    && /^[a-f0-9]{64}$/.test(input);
}
