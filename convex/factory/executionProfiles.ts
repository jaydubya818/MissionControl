import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { FACTORY_PERMISSIONS, requireWorkspacePermission } from "../lib/companyAccess";
import {
  executionProfileDigest,
  executionProfilePersistedRecordBlockers,
  executionProfileQualificationDigest,
  executionProfileQualificationSnapshot,
  executionProfileQualificationSubmissionBlocker,
  executionProfileSnapshot,
} from "../lib/executionProfile";
import { loadExecutionProfileAdmission } from "../lib/executionProfileAdmission";
import { resolveFrozenHarnessBinding } from "../lib/harnessCapabilities";
import { modelRouteEligibleForNewFactoryVersion } from "../lib/modelRouteAdmission";
import { sandboxProfileProductionEligible } from "../lib/sandboxProfileAdmission";
import { executionProfileToolGrantBinding, mcpToolGrantDigest } from "../lib/governedMcp";

const executionBackend = v.union(v.literal("persistent-worker"), v.literal("remote-sandbox"));
const isolationMode = v.union(v.literal("READ_ONLY"), v.literal("WORKSPACE_WRITE"));
const riskClass = v.union(v.literal("GREEN"), v.literal("YELLOW"), v.literal("RED"));

export const list = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, args.projectId, FACTORY_PERMISSIONS.VIEW);
    const profiles = await ctx.db.query("factoryExecutionProfiles")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const now = Date.now();
    return await Promise.all(profiles
      .sort((left, right) => left.profileKey.localeCompare(right.profileKey) || right.version - left.version)
      .map(async (profile) => {
        const admission = await loadExecutionProfileAdmission(ctx, profile._id, now);
        return {
          profile,
          eligible: admission.eligible,
          blockers: admission.blockers,
          validUntil: admission.validUntil,
        };
      }));
  },
});

export const get = query({
  args: { executionProfileId: v.id("factoryExecutionProfiles") },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.executionProfileId);
    if (!profile) throw new Error("Execution Profile is unavailable or unauthorized.");
    await requireWorkspacePermission(ctx, profile.projectId, FACTORY_PERMISSIONS.VIEW);
    const admission = await loadExecutionProfileAdmission(ctx, profile._id, Date.now());
    return {
      profile,
      eligible: admission.eligible,
      blockers: admission.blockers,
      validUntil: admission.validUntil,
    };
  },
});

/** Register one immutable composition. Registration never qualifies or routes it. */
export const registerVersion = mutation({
  args: {
    projectId: v.id("projects"),
    profileKey: v.string(),
    registrationIdempotencyKey: v.string(),
    executor: v.object({ adapter: v.string(), version: v.string() }),
    executionBackend,
    modelCatalogId: v.id("modelCatalog"),
    sandboxProfileId: v.optional(v.id("factorySandboxProfiles")),
    toolGrantId: v.optional(v.id("mcpToolGrants")),
    isolationModes: v.array(isolationMode),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspacePermission(
      ctx,
      args.projectId,
      FACTORY_PERMISSIONS.MANAGE_AUTOMATION,
    );
    const profileKey = args.profileKey.trim().toLowerCase();
    const idempotencyKey = boundedText(args.registrationIdempotencyKey, 200, "Execution Profile registration idempotency key");
    if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(profileKey)) {
      throw new Error("Execution Profile key must be a stable lowercase identifier.");
    }
    const isolationModes = [...new Set(args.isolationModes)].sort();
    if (isolationModes.length < 1 || isolationModes.length !== args.isolationModes.length) {
      throw new Error("Execution Profile requires a non-empty unique isolation set.");
    }
    if ((args.executionBackend === "remote-sandbox") !== Boolean(args.sandboxProfileId)) {
      throw new Error("Remote Execution Profiles require one exact Sandbox Profile; persistent profiles cannot attach one.");
    }

    const existingIdempotency = await ctx.db.query("factoryExecutionProfiles")
      .withIndex("by_registration_idempotency", (q) => q
        .eq("projectId", args.projectId)
        .eq("registrationIdempotencyKey", idempotencyKey))
      .first();
    if (existingIdempotency) {
      if (!registrationRequestMatches(existingIdempotency, args, profileKey, isolationModes)) {
        throw new Error("Execution Profile registration idempotency key is bound to a different request.");
      }
      const integrityBlockers = executionProfilePersistedRecordBlockers(existingIdempotency);
      if (integrityBlockers.length > 0) {
        throw new Error(`Execution Profile registration result failed immutable integrity (${integrityBlockers[0]}).`);
      }
      return { executionProfileId: existingIdempotency._id, created: false as const };
    }

    const now = Date.now();
    const [modelRoute, sandboxProfile, toolGrant] = await Promise.all([
      ctx.db.get(args.modelCatalogId),
      args.sandboxProfileId ? ctx.db.get(args.sandboxProfileId) : Promise.resolve(null),
      args.toolGrantId ? ctx.db.get(args.toolGrantId) : Promise.resolve(null),
    ]);
    if (!modelRoute?.projectId || modelRoute.projectId !== args.projectId
      || !modelRoute.routeSnapshot || !modelRoute.routeDigest
      || !modelRoute.qualificationSnapshot || !modelRoute.qualificationDigest) {
      throw new Error("Execution Profile requires an exact qualified workspace model route.");
    }
    if (args.executionBackend === "remote-sandbox" && (!sandboxProfile
      || sandboxProfile.projectId !== args.projectId
      || sandboxProfile.status !== "ACTIVE"
      || sandboxProfile.readinessState === "BLOCKED"
      || sandboxProfile.readinessExpiresAt <= now
      || !sandboxProfileProductionEligible(sandboxProfile))) {
      throw new Error("Execution Profile requires a current production-pilot-eligible Sandbox Profile.");
    }
    if (args.toolGrantId && (!toolGrant || toolGrant.projectId !== args.projectId
      || toolGrant.state !== "ACTIVE" || toolGrant.expiresAt <= now
      || mcpToolGrantDigest(toolGrant.immutableSnapshot) !== toolGrant.grantDigest)) {
      throw new Error("Execution Profile requires one current exact Tool Grant.");
    }

    const harness = resolveFrozenHarnessBinding({
      executor: args.executor,
      executionBackend: args.executionBackend,
      sandboxProfileSnapshot: sandboxProfile?.immutableSnapshot,
    });
    if (!modelRouteEligibleForNewFactoryVersion(modelRoute, {
      adapter: harness.adapter,
      version: harness.version,
      capabilityManifestDigest: harness.capabilityManifestSha256,
      effectiveConfigSha256: harness.effectiveConfigSha256,
      runtimeArtifactDigest: harness.runtimeArtifactSha256,
      executionBackend: args.executionBackend,
    })) {
      throw new Error("Execution Profile model route is not qualified for the exact harness, runtime artifact, and backend.");
    }
    const routeDigest = modelRoute.routeDigest;
    const modelQualificationDigest = modelRoute.qualificationDigest;

    const buildSnapshot = (version: number) => executionProfileSnapshot({
      profileKey,
      version,
      harness: {
        adapter: harness.adapter,
        version: harness.version,
        capabilityManifest: harness.capabilityManifest,
        capabilityManifestDigest: harness.capabilityManifestSha256,
        effectiveConfigSha256: harness.effectiveConfigSha256,
      },
      runtimeArtifact: {
        snapshot: harness.runtimeArtifact,
        digest: harness.runtimeArtifactSha256,
      },
      executionBackend: args.executionBackend,
      modelRoute: {
        catalogId: String(modelRoute._id),
        routeSnapshot: modelRoute.routeSnapshot,
        routeDigest,
        qualificationSnapshot: modelRoute.qualificationSnapshot,
        qualificationDigest: modelQualificationDigest,
      },
      sandboxProfile: sandboxProfile ? {
        profileId: String(sandboxProfile._id),
        profileSnapshot: sandboxProfile.immutableSnapshot,
        profileDigest: sandboxProfile.profileDigest,
      } : undefined,
      toolGrant: toolGrant ? executionProfileToolGrantBinding(toolGrant) : undefined,
      isolationModes,
    });

    const existingVersions = await ctx.db.query("factoryExecutionProfiles")
      .withIndex("by_profile_version", (q) => q.eq("projectId", args.projectId).eq("profileKey", profileKey))
      .collect();

    const version = existingVersions.reduce((latest, profile) => Math.max(latest, profile.version), 0) + 1;
    const immutableSnapshot = buildSnapshot(version);
    const profileDigest = executionProfileDigest(immutableSnapshot);
    const executionProfileId = await ctx.db.insert("factoryExecutionProfiles", {
      tenantId: access.project.tenantId,
      projectId: args.projectId,
      profileKey,
      version,
      profileDigest,
      immutableSnapshot,
      executor: { adapter: harness.adapter, version: harness.version },
      harnessCapabilityManifest: harness.capabilityManifest,
      harnessCapabilityManifestDigest: harness.capabilityManifestSha256,
      harnessEffectiveConfigSha256: harness.effectiveConfigSha256,
      harnessRuntimeArtifact: harness.runtimeArtifact,
      harnessRuntimeArtifactDigest: harness.runtimeArtifactSha256,
      executionBackend: args.executionBackend,
      sandboxProfileId: sandboxProfile?._id,
      sandboxProfileDigest: sandboxProfile?.profileDigest,
      modelCatalogId: modelRoute._id,
      modelRouteDigest: routeDigest,
      modelQualificationDigest,
      isolationModes: immutableSnapshot.isolationModes,
      requiredHarnessCapabilities: immutableSnapshot.requiredHarnessCapabilities,
      requiredSandboxCapabilities: immutableSnapshot.requiredSandboxCapabilities,
      toolGrantId: toolGrant?._id,
      toolGrantDigest: toolGrant?.grantDigest,
      registrationIdempotencyKey: idempotencyKey,
      enabled: false,
      qualificationStatus: "UNQUALIFIED",
      admissionStatus: "DISABLED",
      createdBy: access.actorId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("activities", {
      tenantId: access.project.tenantId,
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "EXECUTION_PROFILE_VERSION_REGISTERED",
      description: `Registered disabled Execution Profile ${profileKey} v${version}`,
      targetType: "FACTORY_EXECUTION_PROFILE",
      targetId: executionProfileId,
      metadata: {
        profileDigest,
        modelCatalogId: modelRoute._id,
        executionBackend: args.executionBackend,
        registrationIdempotencyKey: idempotencyKey,
      },
    });
    return { executionProfileId, created: true as const };
  },
});

/** Bind one single-use reviewed qualification receipt to exact profile bytes. */
export const qualify = mutation({
  args: {
    executionProfileId: v.id("factoryExecutionProfiles"),
    expectedProfileDigest: v.string(),
    qualificationIdempotencyKey: v.string(),
    evidenceReference: v.string(),
    evidenceDigest: v.string(),
    workloadClasses: v.array(v.string()),
    riskClasses: v.array(riskClass),
    validUntil: v.number(),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.executionProfileId);
    if (!profile) throw new Error("Execution Profile is unavailable or unauthorized.");
    const access = await requireWorkspacePermission(ctx, profile.projectId, FACTORY_PERMISSIONS.APPROVE);
    const idempotencyKey = boundedText(args.qualificationIdempotencyKey, 200, "Execution Profile qualification idempotency key");
    const duplicate = await ctx.db.query("factoryExecutionProfiles")
      .withIndex("by_qualification_idempotency", (q) => q
        .eq("projectId", profile.projectId)
        .eq("qualificationIdempotencyKey", idempotencyKey))
      .first();
    if (duplicate) {
      throw new Error(duplicate._id === profile._id
        ? "Execution Profile qualification result was already consumed."
        : "Execution Profile qualification idempotency key is bound to another profile.");
    }
    if (profile.profileDigest !== args.expectedProfileDigest
      || executionProfileDigest(profile.immutableSnapshot) !== args.expectedProfileDigest) {
      throw new Error("Execution Profile digest does not match the reviewed immutable identity.");
    }
    if (profile.admissionStatus === "REVOKED" || profile.revokedAt) {
      throw new Error("Revoked Execution Profiles cannot be requalified; register a new version.");
    }

    const now = Date.now();
    const admission = await loadExecutionProfileAdmission(ctx, profile._id, now);
    const allowedPrequalificationBlockers = new Set([
      "EXECUTION_PROFILE_DISABLED",
      "EXECUTION_PROFILE_UNQUALIFIED",
      "EXECUTION_PROFILE_QUALIFICATION_MISSING",
    ]);
    const unsafeBlocker = admission.blockers.find((blocker) => !allowedPrequalificationBlockers.has(blocker));
    if (unsafeBlocker) {
      throw new Error(`Execution Profile components are not currently admissible (${unsafeBlocker}).`);
    }
    const profileSnapshot = profile.immutableSnapshot as Record<string, any>;
    const routeScope = profileSnapshot.modelRoute?.qualificationSnapshot?.scope;
    if (!uniqueBoundedEnumScope(args.workloadClasses)
      || args.riskClasses.length < 1
      || new Set(args.riskClasses).size !== args.riskClasses.length
      || args.workloadClasses.some((value) => !routeScope?.workloadClasses?.includes(value))
      || args.riskClasses.some((value) => !routeScope?.riskClasses?.includes(value))) {
      throw new Error("Execution Profile qualification scope must be unique and remain within its exact model-route qualification.");
    }
    if (profile.executionBackend === "remote-sandbox") {
      const sandboxScope = (admission.sandboxProfile?.admissionSnapshot as Record<string, any> | undefined)?.scope;
      if (args.workloadClasses.some((value) => !sandboxScope?.workloadClasses?.includes(value))
        || args.riskClasses.some((value) => !sandboxScope?.riskClasses?.includes(value))) {
        throw new Error("Execution Profile qualification exceeds its exact Sandbox Profile admission scope.");
      }
    }
    const qualificationSnapshot = executionProfileQualificationSnapshot({
      profileId: String(profile._id),
      profileSnapshot: profile.immutableSnapshot,
      profileDigest: profile.profileDigest,
      workloadClasses: args.workloadClasses,
      riskClasses: args.riskClasses,
      evidenceReference: args.evidenceReference,
      evidenceDigest: args.evidenceDigest,
      approvedBy: access.actorId,
      approvedAt: now,
      validUntil: args.validUntil,
    });
    const qualificationDigest = executionProfileQualificationDigest(qualificationSnapshot);
    const qualificationBlocker = executionProfileQualificationSubmissionBlocker(profile, qualificationDigest);
    if (qualificationBlocker) {
      throw new Error(`Execution Profile qualification is immutable (${qualificationBlocker}).`);
    }
    await ctx.db.patch(profile._id, {
      enabled: true,
      qualificationStatus: "EVIDENCE_QUALIFIED",
      admissionStatus: "PRODUCTION_PILOT_ELIGIBLE",
      qualificationSnapshot,
      qualificationDigest,
      qualificationExpiresAt: qualificationSnapshot.validUntil,
      qualificationIdempotencyKey: idempotencyKey,
      promotedBy: access.actorId,
      promotedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("activities", {
      tenantId: profile.tenantId,
      projectId: profile.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "EXECUTION_PROFILE_QUALIFIED",
      description: `Qualified Execution Profile ${profile.profileKey} v${profile.version}`,
      targetType: "FACTORY_EXECUTION_PROFILE",
      targetId: profile._id,
      metadata: { profileDigest: profile.profileDigest, qualificationDigest, validUntil: qualificationSnapshot.validUntil },
    });
    return { executionProfileId: profile._id, profileDigest: profile.profileDigest, qualificationDigest };
  },
});

export const revoke = mutation({
  args: {
    executionProfileId: v.id("factoryExecutionProfiles"),
    expectedProfileDigest: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.executionProfileId);
    if (!profile) throw new Error("Execution Profile is unavailable or unauthorized.");
    const access = await requireWorkspacePermission(ctx, profile.projectId, FACTORY_PERMISSIONS.APPROVE);
    const reason = boundedText(args.reason, 1_000, "Execution Profile revocation reason");
    if (profile.profileDigest !== args.expectedProfileDigest
      || executionProfileDigest(profile.immutableSnapshot) !== args.expectedProfileDigest) {
      throw new Error("Execution Profile revocation does not match the exact immutable identity.");
    }
    if (profile.admissionStatus === "REVOKED" || profile.revokedAt) {
      throw new Error("Execution Profile is already revoked.");
    }
    const now = Date.now();
    await ctx.db.patch(profile._id, {
      enabled: false,
      admissionStatus: "REVOKED",
      revokedBy: access.actorId,
      revokedAt: now,
      revocationReason: reason,
      updatedAt: now,
    });
    await ctx.db.insert("activities", {
      tenantId: profile.tenantId,
      projectId: profile.projectId,
      actorType: "HUMAN",
      actorId: access.actorId,
      action: "EXECUTION_PROFILE_REVOKED",
      description: `Revoked Execution Profile ${profile.profileKey} v${profile.version}`,
      targetType: "FACTORY_EXECUTION_PROFILE",
      targetId: profile._id,
      metadata: { profileDigest: profile.profileDigest, qualificationDigest: profile.qualificationDigest, reason },
    });
    return { executionProfileId: profile._id, revokedAt: now };
  },
});

function boundedText(value: string, maximum: number, label: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || /[\0\r\n]/.test(normalized)) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

function uniqueBoundedEnumScope(values: string[]) {
  return values.length >= 1
    && values.length <= 50
    && new Set(values).size === values.length
    && values.every((value) => /^[A-Z][A-Z0-9_]{1,63}$/.test(value));
}

function registrationRequestMatches(
  profile: Record<string, any>,
  args: {
    modelCatalogId: unknown;
    sandboxProfileId?: unknown;
    toolGrantId?: unknown;
    executor: { adapter: string; version: string };
    executionBackend: string;
  },
  profileKey: string,
  isolationModes: string[],
) {
  return profile.profileKey === profileKey
    && profile.executor?.adapter === args.executor.adapter
    && profile.executor?.version === args.executor.version
    && profile.executionBackend === args.executionBackend
    && String(profile.modelCatalogId) === String(args.modelCatalogId)
    && String(profile.sandboxProfileId ?? "") === String(args.sandboxProfileId ?? "")
    && String(profile.toolGrantId ?? "") === String(args.toolGrantId ?? "")
    && JSON.stringify(profile.isolationModes) === JSON.stringify(isolationModes);
}
