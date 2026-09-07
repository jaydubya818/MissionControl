import { loadExecutionProfileAdmission, executionProfileScopeBlockers } from "./executionProfileAdmission";
import { executionProfileProjectionBlockers } from "./executionProfile";

const EXECUTION_PROFILE_BINDING_FIELDS = [
  "executionProfileId",
  "executionProfileKey",
  "executionProfileVersion",
  "executionProfileDigest",
  "executionProfileSnapshot",
  "executionProfileQualificationDigest",
  "executionProfileQualificationSnapshot",
] as const;

export function hasAnyExecutionProfileBinding(record: Record<string, any> | null | undefined) {
  return Boolean(record)
    && EXECUTION_PROFILE_BINDING_FIELDS.some((field) => record![field] !== undefined);
}

export async function resolveCurrentAttemptExecutionProfile(
  ctx: any,
  version: any,
  run: any,
  manifest: any,
  now: number,
) {
  const profileFieldsPresent = [version, run].some(hasAnyExecutionProfileBinding)
    || ["factory-execution-manifest/v3", "factory-execution-manifest/v4"].includes(manifest?.version)
    || manifest?.executionProfile !== undefined;
  if (!profileFieldsPresent) return null;
  if (!version.executionProfileId
    || !run.executionProfileId
    || !["factory-execution-manifest/v3", "factory-execution-manifest/v4"].includes(manifest?.version)
    || (manifest?.version === "factory-execution-manifest/v4" && version.executionBackend !== "isolated-container")
    || !manifest.executionProfile) {
    throw new Error("Factory Attempt is missing its exact Execution Profile binding.");
  }
  const admission = await loadExecutionProfileAdmission(ctx, version.executionProfileId, now);
  const profile = admission.profile;
  if (!profile || !admission.eligible || profile.projectId !== run.projectId
    || !profile.qualificationSnapshot || !profile.qualificationDigest) {
    throw new Error(`Factory Attempt Execution Profile is not current (${admission.blockers.join(",") || "missing"}).`);
  }
  const snapshot = profile.immutableSnapshot as Record<string, any>;
  const versionBlockers = executionProfileProjectionBlockers({
    profileId: String(profile._id),
    profileSnapshot: profile.immutableSnapshot,
    profileDigest: profile.profileDigest,
    qualificationSnapshot: profile.qualificationSnapshot,
    qualificationDigest: profile.qualificationDigest,
    projection: executionProfileProjectionFromFactoryVersion(version),
  });
  const runBlockers = executionProfileProjectionBlockers({
    profileId: String(profile._id),
    profileSnapshot: profile.immutableSnapshot,
    profileDigest: profile.profileDigest,
    qualificationSnapshot: profile.qualificationSnapshot,
    qualificationDigest: profile.qualificationDigest,
    projection: executionProfileProjectionFromAttempt(run, manifest),
  });
  const workloadClass = (version.purpose ?? "SOFTWARE") === "VERIFICATION"
    ? "VERIFICATION"
    : (version.purpose ?? "SOFTWARE") === "INTELLIGENT_AUTOMATION"
      ? "AUTOMATION"
      : "SOFTWARE_CHANGE";
  const scopeBlockers = executionProfileScopeBlockers(profile, {
    workloadClass,
    riskClass: version.riskBoundary,
    isolation: manifest.harness?.isolation,
  });
  const frozen = manifest.executionProfile;
  const manifestIdentityMatches = frozen.profileId === String(profile._id)
    && frozen.profileKey === profile.profileKey
    && frozen.version === profile.version
    && frozen.profileDigest === profile.profileDigest
    && frozen.qualificationDigest === profile.qualificationDigest;
  const blockers = [...new Set([...versionBlockers, ...runBlockers, ...scopeBlockers])];
  if (!manifestIdentityMatches || blockers.length > 0
    || snapshot.profileKey !== profile.profileKey || snapshot.version !== profile.version) {
    throw new Error(`Factory Attempt substituted its frozen Execution Profile (${blockers.join(",") || "identity-mismatch"}).`);
  }
  return profile;
}

export function executionProfileProjectionFromFactoryVersion(version: any) {
  const snapshot = version.executionProfileSnapshot as Record<string, any> | undefined;
  const missingModelIdentity = version.executionBackend === "isolated-container" ? undefined : "";
  return {
    profileId: String(version.executionProfileId ?? ""),
    profileKey: version.executionProfileKey ?? "",
    profileVersion: version.executionProfileVersion ?? 0,
    profileDigest: version.executionProfileDigest ?? "",
    profileSnapshot: version.executionProfileSnapshot,
    qualificationDigest: version.executionProfileQualificationDigest ?? "",
    qualificationSnapshot: version.executionProfileQualificationSnapshot,
    executor: version.executor,
    harnessCapabilityManifest: version.harnessCapabilityManifest,
    harnessCapabilityManifestDigest: version.harnessCapabilityManifestDigest ?? "",
    harnessEffectiveConfigSha256: version.harnessEffectiveConfigSha256 ?? "",
    harnessRuntimeArtifact: version.harnessRuntimeArtifact,
    harnessRuntimeArtifactDigest: version.harnessRuntimeArtifactDigest ?? "",
    executionBackend: version.executionBackend ?? "persistent-worker",
    modelCatalogId: version.modelCatalogId === undefined ? missingModelIdentity : String(version.modelCatalogId),
    modelRouteSnapshot: version.modelRouteSnapshot,
    modelRouteDigest: version.modelRouteDigest ?? missingModelIdentity,
    modelQualificationSnapshot: version.modelQualificationSnapshot,
    modelQualificationDigest: version.modelQualificationDigest ?? missingModelIdentity,
    sandboxProfileId: version.sandboxProfileId ? String(version.sandboxProfileId) : undefined,
    sandboxProfileSnapshot: version.sandboxProfileSnapshot,
    sandboxProfileDigest: version.sandboxProfileDigest,
    isolationModes: snapshot?.isolationModes ?? [],
    requiredHarnessCapabilities: snapshot?.requiredHarnessCapabilities ?? [],
    requiredSandboxCapabilities: snapshot?.requiredSandboxCapabilities ?? [],
  };
}

function executionProfileProjectionFromAttempt(run: any, manifest: any) {
  const snapshot = run.executionProfileSnapshot as Record<string, any> | undefined;
  const offline = manifest?.version === "factory-execution-manifest/v4";
  const missingModelIdentity = offline ? undefined : "";
  const sandbox = offline ? manifest.executionProfile?.profileSnapshot?.sandboxProfile : manifest.sandbox;
  return {
    profileId: String(run.executionProfileId ?? ""),
    profileKey: run.executionProfileKey ?? "",
    profileVersion: run.executionProfileVersion ?? 0,
    profileDigest: run.executionProfileDigest ?? "",
    profileSnapshot: run.executionProfileSnapshot,
    qualificationDigest: run.executionProfileQualificationDigest ?? "",
    qualificationSnapshot: run.executionProfileQualificationSnapshot,
    executor: { adapter: run.executorAdapter ?? "", version: run.executorVersion ?? "" },
    harnessCapabilityManifest: manifest.harness?.capabilityManifest,
    harnessCapabilityManifestDigest: manifest.harness?.capabilityManifestSha256 ?? "",
    harnessEffectiveConfigSha256: manifest.harness?.effectiveConfigSha256 ?? "",
    harnessRuntimeArtifact: manifest.harness?.runtimeArtifact,
    harnessRuntimeArtifactDigest: manifest.harness?.runtimeArtifactDigest ?? "",
    executionBackend: manifest.executionBackend ?? manifest.harness?.executionBackend ?? "",
    modelCatalogId: manifest.modelRoute?.catalogId ?? manifest.harness?.modelCatalogId ?? missingModelIdentity,
    modelRouteSnapshot: manifest.modelRoute?.routeSnapshot ?? manifest.harness?.modelRouteSnapshot,
    modelRouteDigest: manifest.modelRoute?.routeDigest ?? manifest.harness?.modelRouteDigest ?? missingModelIdentity,
    modelQualificationSnapshot: manifest.modelRoute?.qualificationSnapshot,
    modelQualificationDigest: manifest.modelRoute?.qualificationDigest ?? manifest.harness?.modelQualificationDigest ?? missingModelIdentity,
    sandboxProfileId: sandbox?.profileId,
    sandboxProfileSnapshot: sandbox?.profileSnapshot,
    sandboxProfileDigest: sandbox?.profileDigest,
    isolationModes: snapshot?.isolationModes ?? [],
    requiredHarnessCapabilities: snapshot?.requiredHarnessCapabilities ?? [],
    requiredSandboxCapabilities: snapshot?.requiredSandboxCapabilities ?? [],
  };
}
