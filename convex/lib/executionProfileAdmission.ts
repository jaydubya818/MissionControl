import { OFFLINE_EXECUTION_PROFILE_SCHEMA } from "./offlineExecutionPolicy";
import { offlineSandboxEligible as isolatedSandboxEligible, assertLocalSandboxScope } from "./localQualificationSandbox";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
  executionProfileCurrentness,
  executionProfileCurrentnessIssues,
  executionProfilePersistedRecordBlockers,
  executionProfileProjectionBlockers,
  type ExecutionProfileBlockerCode,
  type ExecutionProfileProjection,
} from "./executionProfile";
import { computeCanonicalHash } from "./genomeHash";
import { resolveFrozenHarnessBinding } from "./harnessCapabilities";
import { modelRouteEligibleForNewFactoryVersion } from "./modelRouteAdmission";
import { sandboxProfileProductionEligible } from "./sandboxProfileAdmission";
import { mcpToolGrantDigest, mcpToolVersionDigest } from "./governedMcp";

type DbCtx = Pick<QueryCtx, "db">;

export interface LoadedExecutionProfileAdmission {
  profile: Doc<"factoryExecutionProfiles"> | null;
  modelRoute: Doc<"modelCatalog"> | null;
  sandboxProfile: Doc<"factorySandboxProfiles"> | null;
  toolGrant: Doc<"mcpToolGrants"> | null;
  eligible: boolean;
  blockers: ExecutionProfileBlockerCode[];
  validUntil?: number;
}

/**
 * Reconciles an immutable profile row with every independently governed live
 * component. This never selects a substitute component and grants no routing
 * authority; callers still enforce Factory/workload scope separately.
 */
export async function loadExecutionProfileAdmission(
  ctx: DbCtx,
  executionProfileId: Id<"factoryExecutionProfiles">,
  now: number,
): Promise<LoadedExecutionProfileAdmission> {
  const profile = await ctx.db.get(executionProfileId);
  if (!profile) {
    return {
      profile: null,
      modelRoute: null,
      sandboxProfile: null,
      toolGrant: null,
      eligible: false,
      blockers: ["EXECUTION_PROFILE_MISSING"],
    };
  }
  const currentness = executionProfileCurrentness(profile, now);
  const snapshot = profile.immutableSnapshot as Record<string, any> | undefined;
  if (!snapshot) {
    return {
      profile,
      modelRoute: null,
      sandboxProfile: null,
      toolGrant: null,
      eligible: false,
      blockers: uniqueBlockers(currentness.blocker
        ? [currentness.blocker]
        : ["EXECUTION_PROFILE_SNAPSHOT_INVALID"]),
      validUntil: currentness.validUntil,
    };
  }

  const offline = snapshot.schema === OFFLINE_EXECUTION_PROFILE_SCHEMA;
  const [modelRoute, sandboxProfile, toolGrant] = await Promise.all([
    profile.modelCatalogId ? ctx.db.get(profile.modelCatalogId) : Promise.resolve(null),
    profile.sandboxProfileId ? ctx.db.get(profile.sandboxProfileId) : Promise.resolve(null),
    profile.toolGrantId ? ctx.db.get(profile.toolGrantId) : Promise.resolve(null),
  ]);
  const blockers: ExecutionProfileBlockerCode[] = [];
  let capabilityValidUntil: number | undefined;
  blockers.push(...executionProfileCurrentnessIssues({
    profile,
    modelRoute,
    sandboxProfile,
    now,
  }));
  blockers.push(...executionProfilePersistedRecordBlockers(profile));
  if (profile.qualificationSnapshot && profile.qualificationDigest) {
    const projection = {
      profileId: String(profile._id),
      profileKey: profile.profileKey,
      profileVersion: profile.version,
      profileDigest: profile.profileDigest,
      profileSnapshot: profile.immutableSnapshot,
      qualificationDigest: profile.qualificationDigest,
      qualificationSnapshot: profile.qualificationSnapshot,
      executor: profile.executor,
      harnessCapabilityManifest: profile.harnessCapabilityManifest,
      harnessCapabilityManifestDigest: profile.harnessCapabilityManifestDigest,
      harnessEffectiveConfigSha256: profile.harnessEffectiveConfigSha256,
      harnessRuntimeArtifact: profile.harnessRuntimeArtifact,
      harnessRuntimeArtifactDigest: profile.harnessRuntimeArtifactDigest,
      executionBackend: profile.executionBackend,
      modelCatalogId: profile.modelCatalogId ? String(profile.modelCatalogId) : offline ? undefined : "",
      modelRouteSnapshot: snapshot.modelRoute?.routeSnapshot,
      modelRouteDigest: profile.modelRouteDigest ?? (offline ? undefined : ""),
      modelQualificationSnapshot: snapshot.modelRoute?.qualificationSnapshot,
      modelQualificationDigest: profile.modelQualificationDigest ?? (offline ? undefined : ""),
      sandboxProfileId: profile.sandboxProfileId ? String(profile.sandboxProfileId) : undefined,
      sandboxProfileSnapshot: snapshot.sandboxProfile?.profileSnapshot,
      sandboxProfileDigest: profile.sandboxProfileDigest,
      isolationModes: profile.isolationModes,
      requiredHarnessCapabilities: profile.requiredHarnessCapabilities as any,
      requiredSandboxCapabilities: profile.requiredSandboxCapabilities,
    };
    blockers.push(...executionProfileProjectionBlockers({
      profileId: String(profile._id),
      profileSnapshot: profile.immutableSnapshot,
      profileDigest: profile.profileDigest,
      qualificationSnapshot: profile.qualificationSnapshot,
      qualificationDigest: profile.qualificationDigest,
      // Preserve malformed persisted fields for the validator to reject.
      projection: projection as ExecutionProfileProjection,
    }));
  } else {
    blockers.push("EXECUTION_PROFILE_QUALIFICATION_MISSING");
  }

  let frozenHarness: ReturnType<typeof resolveFrozenHarnessBinding> | null = null;
  try {
    frozenHarness = resolveFrozenHarnessBinding({
      executor: profile.executor,
      harnessCapabilityManifest: profile.harnessCapabilityManifest,
      harnessCapabilityManifestDigest: profile.harnessCapabilityManifestDigest,
      harnessEffectiveConfigSha256: profile.harnessEffectiveConfigSha256,
      harnessRuntimeArtifact: profile.harnessRuntimeArtifact,
      harnessRuntimeArtifactDigest: profile.harnessRuntimeArtifactDigest,
      executionBackend: profile.executionBackend,
      sandboxProfileSnapshot: snapshot.sandboxProfile?.profileSnapshot,
    });
  } catch {
    blockers.push("EXECUTION_PROFILE_HARNESS_MISMATCH");
  }

  if (offline) {
    try { await assertLocalSandboxScope(ctx, sandboxProfile?.immutableSnapshot, now); }
    catch { blockers.push("EXECUTION_PROFILE_SANDBOX_MISMATCH"); }
    const qualifiedClasses = (profile.qualificationSnapshot as any)?.scope?.workloadClasses;
    const sandboxClasses = (sandboxProfile?.admissionSnapshot as any)?.scope?.workloadClasses;
    if (qualifiedClasses?.some((value: string) => !sandboxClasses?.includes(value))) {
      blockers.push("EXECUTION_PROFILE_SANDBOX_MISMATCH");
    }
    if (modelRoute || profile.modelCatalogId || profile.modelRouteDigest || profile.modelQualificationDigest) blockers.push("EXECUTION_PROFILE_MODEL_ROUTE_MISMATCH");
  } else if (profile.executionBackend === "isolated-container" || !modelRoute
    || modelRoute.projectId !== profile.projectId
    || String(modelRoute._id) !== snapshot.modelRoute?.catalogId
    || modelRoute.routeDigest !== profile.modelRouteDigest
    || modelRoute.qualificationDigest !== profile.modelQualificationDigest
    || !sameCanonical(modelRoute.routeSnapshot, snapshot.modelRoute?.routeSnapshot)
    || !sameCanonical(modelRoute.qualificationSnapshot, snapshot.modelRoute?.qualificationSnapshot)
    || !frozenHarness
    || !modelRouteEligibleForNewFactoryVersion(modelRoute, {
      adapter: frozenHarness.adapter,
      version: frozenHarness.version,
      capabilityManifestDigest: frozenHarness.capabilityManifestSha256,
      effectiveConfigSha256: frozenHarness.effectiveConfigSha256,
      runtimeArtifactDigest: frozenHarness.runtimeArtifactSha256,
      executionBackend: profile.executionBackend,
    })) {
    blockers.push("EXECUTION_PROFILE_MODEL_ROUTE_MISMATCH");
  }

  if (offline) {
    if (!sandboxProfile || sandboxProfile.projectId !== profile.projectId || String(sandboxProfile._id) !== snapshot.sandboxProfile?.profileId
      || sandboxProfile.profileDigest !== snapshot.sandboxProfile?.profileDigest || !sameCanonical(sandboxProfile.immutableSnapshot, snapshot.sandboxProfile?.profileSnapshot)
      || snapshot.offlinePolicy?.isolation?.qualifiedAt !== sandboxProfile.promotedAt
      || snapshot.offlinePolicy?.isolation?.admissionDigest !== sandboxProfile.admissionDigest || !isolatedSandboxEligible(sandboxProfile, now)) blockers.push("EXECUTION_PROFILE_SANDBOX_MISMATCH");
  } else if (profile.executionBackend === "remote-sandbox") {
    if (!sandboxProfile
      || sandboxProfile.projectId !== profile.projectId
      || sandboxProfile._id !== profile.sandboxProfileId
      || sandboxProfile.profileDigest !== profile.sandboxProfileDigest
      || !sameCanonical(sandboxProfile.immutableSnapshot, snapshot.sandboxProfile?.profileSnapshot)
      || sandboxProfile.status !== "ACTIVE"
      || sandboxProfile.readinessState === "BLOCKED"
      || sandboxProfile.readinessExpiresAt <= now
      || !sandboxProfileProductionEligible(sandboxProfile)) {
      blockers.push("EXECUTION_PROFILE_SANDBOX_MISMATCH");
    }
  } else if (profile.sandboxProfileId || profile.sandboxProfileDigest || snapshot.sandboxProfile) {
    blockers.push("EXECUTION_PROFILE_SANDBOX_MISMATCH");
  }

  if (snapshot.toolGrant) {
    const toolVersion: any = toolGrant ? await ctx.db.get(toolGrant.toolVersionId) : null;
    capabilityValidUntil = toolGrant && toolVersion?.qualificationExpiresAt
      ? Math.min(toolGrant.expiresAt, toolVersion.qualificationExpiresAt)
      : undefined;
    if (!toolGrant || !toolVersion
      || toolGrant.projectId !== profile.projectId
      || toolGrant._id !== profile.toolGrantId
      || toolGrant.grantDigest !== profile.toolGrantDigest
      || String(toolGrant._id) !== snapshot.toolGrant.grantId
      || toolGrant.grantDigest !== snapshot.toolGrant.grantDigest
      || mcpToolGrantDigest(toolGrant.immutableSnapshot) !== toolGrant.grantDigest
      || toolGrant.state !== "ACTIVE" || toolGrant.expiresAt <= now
      || toolVersion.projectId !== profile.projectId
      || toolVersion._id !== toolGrant.toolVersionId
      || toolVersion.toolVersionDigest !== toolGrant.toolVersionDigest
      || mcpToolVersionDigest(toolVersion.immutableSnapshot) !== toolVersion.toolVersionDigest
      || !toolVersion.enabled || toolVersion.qualificationStatus !== "EVIDENCE_QUALIFIED"
      || (toolVersion.qualificationExpiresAt ?? 0) <= now) {
      blockers.push("EXECUTION_PROFILE_CAPABILITY_MISMATCH");
    }
  } else if (profile.toolGrantId || profile.toolGrantDigest || toolGrant) {
    blockers.push("EXECUTION_PROFILE_CAPABILITY_MISMATCH");
  }

  const allBlockers = uniqueBlockers([
    ...(currentness.blocker ? [currentness.blocker] : []),
    ...blockers,
  ]);
  return {
    profile,
    modelRoute,
    sandboxProfile,
    toolGrant,
    eligible: currentness.eligible && allBlockers.length === 0,
    blockers: allBlockers,
    validUntil: currentness.validUntil && capabilityValidUntil
      ? Math.min(currentness.validUntil, capabilityValidUntil)
      : currentness.validUntil,
  };
}

export function executionProfileScopeBlockers(
  profile: Doc<"factoryExecutionProfiles">,
  input: {
    workloadClass: string;
    riskClass: "GREEN" | "YELLOW" | "RED";
    isolation: "READ_ONLY" | "WORKSPACE_WRITE";
  },
): ExecutionProfileBlockerCode[] {
  const qualification = profile.qualificationSnapshot as Record<string, any> | undefined;
  const snapshot = profile.immutableSnapshot as Record<string, any> | undefined;
  const blockers: ExecutionProfileBlockerCode[] = [];
  if (!qualification?.scope?.workloadClasses?.includes(input.workloadClass)
    || !qualification?.scope?.riskClasses?.includes(input.riskClass)) {
    blockers.push("EXECUTION_PROFILE_QUALIFICATION_MISMATCH");
  }
  if (!snapshot?.isolationModes?.includes(input.isolation)) {
    blockers.push("EXECUTION_PROFILE_ISOLATION_MISMATCH");
  }
  return blockers;
}

function sameCanonical(left: unknown, right: unknown) {
  return computeCanonicalHash(left) === computeCanonicalHash(right);
}

function uniqueBlockers(blockers: ExecutionProfileBlockerCode[]) {
  return [...new Set(blockers)];
}

export function factoryVersionExecutionProfileProjection(version: Doc<"factoryDefinitionVersions">): ExecutionProfileProjection | null {
  if (!version.executionProfileId) return null;
  const profileSnapshot = version.executionProfileSnapshot as Record<string, any> | undefined;
  return {
    profileId: String(version.executionProfileId),
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
    modelCatalogId: version.modelCatalogId ? String(version.modelCatalogId) : version.executionBackend === "isolated-container" ? undefined : "",
    modelRouteSnapshot: version.modelRouteSnapshot,
    modelRouteDigest: version.modelRouteDigest ?? (version.executionBackend === "isolated-container" ? undefined : ""),
    modelQualificationSnapshot: version.modelQualificationSnapshot,
    modelQualificationDigest: version.modelQualificationDigest ?? (version.executionBackend === "isolated-container" ? undefined : ""),
    ...(version.sandboxProfileId ? { sandboxProfileId: String(version.sandboxProfileId) } : {}),
    ...(version.sandboxProfileSnapshot !== undefined ? { sandboxProfileSnapshot: version.sandboxProfileSnapshot } : {}),
    ...(version.sandboxProfileDigest ? { sandboxProfileDigest: version.sandboxProfileDigest } : {}),
    isolationModes: profileSnapshot?.isolationModes ?? [],
    requiredHarnessCapabilities: profileSnapshot?.requiredHarnessCapabilities ?? [],
    requiredSandboxCapabilities: profileSnapshot?.requiredSandboxCapabilities ?? [],
  } as ExecutionProfileProjection; // Raw persisted projection; admission validates every field.
}
