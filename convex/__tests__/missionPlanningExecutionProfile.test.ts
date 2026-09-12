import { describe, expect, it } from "vitest";
import {
  CODEX_V1_HARNESS_MANIFEST,
  CODEX_V1_RUNTIME_ARTIFACT,
  harnessCapabilityManifestDigest,
  harnessRuntimeArtifactDigest,
} from "@mission-control/workflow-engine/harness-contract";
import {
  exactModelRouteDigest,
  exactModelRouteQualificationSnapshot,
  exactModelRouteSnapshot,
  modelRouteQualificationDigest,
} from "../lib/modelRouteAdmission";
import {
  executionProfileDigest,
  executionProfileQualificationDigest,
  executionProfileQualificationSnapshot,
  executionProfileSnapshot,
} from "../lib/executionProfile";
import { computeCanonicalHash } from "../lib/genomeHash";
import { planningExecutionProfileAdmissionBlockers } from "../missionPlanning";

const manifestDigest = harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST);
const runtimeDigest = harnessRuntimeArtifactDigest(CODEX_V1_RUNTIME_ARTIFACT);
const routeSnapshot = exactModelRouteSnapshot({
  provider: "openai",
  providerRoute: "openai",
  modelId: "gpt-5.6-terra",
  reasoningConfig: { effort: "high" },
});
const routeDigest = exactModelRouteDigest(routeSnapshot);
const routeQualificationSnapshot = exactModelRouteQualificationSnapshot({
  routeDigest,
  evidenceReference: "evidence://mission-planning-route",
  evidenceDigest: sha("a"),
  workloadClasses: ["MISSION_PLANNING", "SOFTWARE_CHANGE"],
  riskClasses: ["YELLOW"],
  promotedBy: "operator-1",
  promotedAt: 100,
  compatibility: {
    adapter: "codex",
    version: "v1",
    capabilityManifestDigest: manifestDigest,
    effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
    runtimeArtifactDigest: runtimeDigest,
    executionBackend: "persistent-worker",
  },
});
const routeQualificationDigest = modelRouteQualificationDigest(routeQualificationSnapshot);
const profileSnapshot = executionProfileSnapshot({
  profileKey: "software-change",
  version: 1,
  harness: {
    adapter: "codex",
    version: "v1",
    capabilityManifest: CODEX_V1_HARNESS_MANIFEST,
    capabilityManifestDigest: manifestDigest,
    effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
  },
  runtimeArtifact: { snapshot: CODEX_V1_RUNTIME_ARTIFACT, digest: runtimeDigest },
  executionBackend: "persistent-worker",
  modelRoute: {
    catalogId: "model-route-1",
    routeSnapshot,
    routeDigest,
    qualificationSnapshot: routeQualificationSnapshot,
    qualificationDigest: routeQualificationDigest,
  },
  isolationModes: ["READ_ONLY", "WORKSPACE_WRITE"],
});
const profileDigest = executionProfileDigest(profileSnapshot);
const profileQualificationSnapshot = executionProfileQualificationSnapshot({
  profileId: "execution-profile-1",
  profileSnapshot,
  profileDigest,
  workloadClasses: ["MISSION_PLANNING", "SOFTWARE_CHANGE"],
  riskClasses: ["YELLOW"],
  evidenceReference: "evidence://mission-planning-profile",
  evidenceDigest: sha("b"),
  approvedBy: "operator-2",
  approvedAt: 1_000,
  validUntil: 10_000,
});
const profileQualificationDigest = executionProfileQualificationDigest(profileQualificationSnapshot);

describe("Mission planning Execution Profile admission", () => {
  it("accepts one exact current profile across Factory Version and frozen run", () => {
    const exact = fixtures();
    expect(planningExecutionProfileAdmissionBlockers(exact)).toEqual([]);
  });

  it("propagates revoked and expired live-profile blockers at claim/reclaim", () => {
    const exact = fixtures();
    expect(planningExecutionProfileAdmissionBlockers({
      ...exact,
      admissionBlockers: ["EXECUTION_PROFILE_REVOKED"],
    })).toEqual(["EXECUTION_PROFILE_REVOKED"]);
    expect(planningExecutionProfileAdmissionBlockers({
      ...exact,
      admissionBlockers: ["EXECUTION_PROFILE_QUALIFICATION_EXPIRED"],
    })).toEqual(["EXECUTION_PROFILE_QUALIFICATION_EXPIRED"]);
  });

  it("rejects missing, partial, and substituted frozen projections", () => {
    const exact = fixtures();
    expect(planningExecutionProfileAdmissionBlockers({
      ...exact,
      profile: null,
      admissionBlockers: ["EXECUTION_PROFILE_MISSING"],
    })).toEqual(["EXECUTION_PROFILE_MISSING"]);
    expect(planningExecutionProfileAdmissionBlockers({
      ...exact,
      run: { ...exact.run, executionProfileQualificationSnapshot: undefined },
    })).toEqual(["EXECUTION_PROFILE_MISSING"]);
    expect(planningExecutionProfileAdmissionBlockers({
      ...exact,
      run: { ...exact.run, executor: { ...exact.run.executor, adapter: "deepagents" } },
    })).toEqual(expect.arrayContaining([
      "EXECUTION_PROFILE_IDENTITY_MISMATCH",
      "EXECUTION_PROFILE_HARNESS_MISMATCH",
    ]));
  });

  it("requires MISSION_PLANNING, YELLOW, and READ_ONLY qualification scope", () => {
    const exact = fixtures();
    const narrowedQualification = {
      ...profileQualificationSnapshot,
      scope: { workloadClasses: ["SOFTWARE_CHANGE"], riskClasses: ["GREEN"] },
    };
    const narrowedProfile = {
      ...exact.profile,
      qualificationSnapshot: narrowedQualification,
      qualificationDigest: executionProfileQualificationDigest(narrowedQualification),
    };
    expect(planningExecutionProfileAdmissionBlockers({
      ...exact,
      profile: narrowedProfile as any,
      version: {
        ...exact.version,
        executionProfileQualificationSnapshot: narrowedQualification,
        executionProfileQualificationDigest: narrowedProfile.qualificationDigest,
      },
      run: profileRun({
        qualificationSnapshot: narrowedQualification,
        qualificationDigest: narrowedProfile.qualificationDigest,
      }),
    })).toContain("EXECUTION_PROFILE_QUALIFICATION_MISMATCH");
  });

  it("retains only the complete profileless Phase 1 path", () => {
    const exact = fixtures();
    const version = withoutProfile(exact.version);
    const run = withoutProfile(exact.run);
    const { executionProfile: _profile, ...factoryAdmission } = run.inputSnapshot.factoryAdmission;
    run.inputSnapshot = { ...run.inputSnapshot, factoryAdmission };
    run.inputDigest = `sha256:${computeCanonicalHash(run.inputSnapshot)}`;
    expect(planningExecutionProfileAdmissionBlockers({ profile: null, version, run })).toEqual([]);
    expect(planningExecutionProfileAdmissionBlockers({
      profile: null,
      version,
      run: { ...run, inputDigest: undefined },
    })).toEqual(["EXECUTION_PROFILE_MISSING"]);
  });
});

function fixtures() {
  const profile = {
    _id: "execution-profile-1",
    projectId: "project-1",
    profileKey: profileSnapshot.profileKey,
    version: profileSnapshot.version,
    profileDigest,
    immutableSnapshot: profileSnapshot,
    qualificationSnapshot: profileQualificationSnapshot,
    qualificationDigest: profileQualificationDigest,
  } as any;
  const version = factoryVersion();
  return { profile, version, run: profileRun() };
}

function factoryVersion() {
  return {
    _id: "factory-version-1",
    projectId: "project-1",
    factoryDefinitionId: "factory-1",
    repositoryId: "repository-1",
    configurationDigest: sha("c"),
    executor: { adapter: "codex", version: "v1" },
    harnessCapabilityManifest: CODEX_V1_HARNESS_MANIFEST,
    harnessCapabilityManifestDigest: manifestDigest,
    harnessEffectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
    harnessRuntimeArtifact: CODEX_V1_RUNTIME_ARTIFACT,
    harnessRuntimeArtifactDigest: runtimeDigest,
    executionBackend: "persistent-worker",
    modelCatalogId: "model-route-1",
    modelRouteSnapshot: routeSnapshot,
    modelRouteDigest: routeDigest,
    modelQualificationSnapshot: routeQualificationSnapshot,
    modelQualificationDigest: routeQualificationDigest,
    executionProfileId: "execution-profile-1",
    executionProfileKey: profileSnapshot.profileKey,
    executionProfileVersion: profileSnapshot.version,
    executionProfileDigest: profileDigest,
    executionProfileSnapshot: profileSnapshot,
    executionProfileQualificationDigest: profileQualificationDigest,
    executionProfileQualificationSnapshot: profileQualificationSnapshot,
  };
}

function profileRun(overrides: {
  qualificationSnapshot?: unknown;
  qualificationDigest?: string;
} = {}) {
  const version = factoryVersion();
  const binding = {
    profileId: version.executionProfileId,
    profileKey: version.executionProfileKey,
    version: version.executionProfileVersion,
    profileDigest: version.executionProfileDigest,
    profileSnapshot: version.executionProfileSnapshot,
    qualificationDigest: overrides.qualificationDigest ?? version.executionProfileQualificationDigest,
    qualificationSnapshot: overrides.qualificationSnapshot ?? version.executionProfileQualificationSnapshot,
  };
  const inputSnapshot = {
    factoryAdmission: {
      factoryDefinitionVersionId: version._id,
      factoryConfigurationDigest: version.configurationDigest,
      modelCatalogId: version.modelCatalogId,
      modelRouteDigest: version.modelRouteDigest,
      modelQualificationDigest: version.modelQualificationDigest,
      executionBackend: version.executionBackend,
      harnessRuntimeArtifactSha256: version.harnessRuntimeArtifactDigest,
      executionProfile: binding,
    },
  };
  return {
    projectId: version.projectId,
    factoryDefinitionId: version.factoryDefinitionId,
    repositoryId: version.repositoryId,
    factoryDefinitionVersionId: version._id,
    factoryConfigurationDigest: version.configurationDigest,
    executor: {
      adapter: version.executor.adapter,
      version: version.executor.version,
      capabilityManifestSha256: version.harnessCapabilityManifestDigest,
      effectiveConfigSha256: version.harnessEffectiveConfigSha256,
      runtimeArtifact: version.harnessRuntimeArtifact,
      runtimeArtifactSha256: version.harnessRuntimeArtifactDigest,
    },
    executionBackend: version.executionBackend,
    modelCatalogId: version.modelCatalogId,
    modelProvider: routeSnapshot.provider,
    modelId: routeSnapshot.modelId,
    modelRouteSnapshot: version.modelRouteSnapshot,
    modelRouteDigest: version.modelRouteDigest,
    modelQualificationSnapshot: version.modelQualificationSnapshot,
    modelQualificationDigest: version.modelQualificationDigest,
    executionProfileId: binding.profileId,
    executionProfileKey: binding.profileKey,
    executionProfileVersion: binding.version,
    executionProfileDigest: binding.profileDigest,
    executionProfileSnapshot: binding.profileSnapshot,
    executionProfileQualificationDigest: binding.qualificationDigest,
    executionProfileQualificationSnapshot: binding.qualificationSnapshot,
    inputSnapshot,
    inputDigest: `sha256:${computeCanonicalHash(inputSnapshot)}`,
  };
}

function withoutProfile<T extends Record<string, any>>(source: T) {
  const copy = { ...source } as Record<string, any>;
  for (const field of [
    "executionProfileId",
    "executionProfileKey",
    "executionProfileVersion",
    "executionProfileDigest",
    "executionProfileSnapshot",
    "executionProfileQualificationDigest",
    "executionProfileQualificationSnapshot",
  ]) delete copy[field];
  return copy;
}

function sha(character: string) {
  return `sha256:${character.repeat(64)}`;
}
