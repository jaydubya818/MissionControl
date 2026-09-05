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
  EXECUTION_PROFILE_QUALIFICATION_SCHEMA,
  EXECUTION_PROFILE_SCHEMA,
  executionProfileCurrentness,
  executionProfileCurrentnessIssues,
  executionProfileDigest,
  executionProfileIssues,
  executionProfilePersistedRecordBlockers,
  executionProfileProjectionBlockers,
  executionProfileProjectionMatches,
  executionProfileQualificationDigest,
  executionProfileQualificationIssues,
  executionProfileQualificationMatches,
  executionProfileQualificationSnapshot,
  executionProfileQualificationSubmissionBlocker,
  executionProfileQualifiedFor,
  executionProfileSnapshot,
  type ExecutionProfileProjection,
} from "../lib/executionProfile";
import { computeCanonicalHash } from "../lib/genomeHash";
import {
  qualify as qualifyExecutionProfile,
  registerVersion as registerExecutionProfileVersion,
  revoke as revokeExecutionProfile,
} from "../factory/executionProfiles";

const digest = (character: string) => `sha256:${character.repeat(64)}`;
const manifestDigest = harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST);
const runtimeDigest = harnessRuntimeArtifactDigest(CODEX_V1_RUNTIME_ARTIFACT);
const routeSnapshot = exactModelRouteSnapshot({
  provider: "openai",
  providerRoute: "openai",
  modelId: "gpt-5.6-terra",
  reasoningConfig: { effort: "high", maxTokens: 16_384 },
});
const routeDigest = exactModelRouteDigest(routeSnapshot);
const routeQualificationSnapshot = exactModelRouteQualificationSnapshot({
  routeDigest,
  evidenceReference: "docs/evidence/model-route.json",
  evidenceDigest: digest("a"),
  workloadClasses: ["SOFTWARE_CHANGE", "BUG_FIX"],
  riskClasses: ["YELLOW", "GREEN"],
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
  profileKey: " Software-Change ",
  version: 1,
  harness: {
    adapter: "codex",
    version: "v1",
    capabilityManifest: CODEX_V1_HARNESS_MANIFEST,
    capabilityManifestDigest: manifestDigest,
    effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
  },
  runtimeArtifact: {
    snapshot: CODEX_V1_RUNTIME_ARTIFACT,
    digest: runtimeDigest,
  },
  executionBackend: "persistent-worker",
  modelRoute: {
    catalogId: "model-route-1",
    routeSnapshot,
    routeDigest,
    qualificationSnapshot: routeQualificationSnapshot,
    qualificationDigest: routeQualificationDigest,
  },
  isolationModes: ["WORKSPACE_WRITE", "READ_ONLY"],
});
const profileDigest = executionProfileDigest(profileSnapshot);
const qualificationSnapshot = executionProfileQualificationSnapshot({
  profileId: "profile-1",
  profileSnapshot,
  profileDigest,
  workloadClasses: ["SOFTWARE_CHANGE", "BUG_FIX"],
  riskClasses: ["YELLOW", "GREEN"],
  evidenceReference: "docs/evidence/execution-profile.json",
  evidenceDigest: digest("b"),
  approvedBy: "operator-2",
  approvedAt: 1_000,
  validUntil: 2_000,
});
const qualificationDigest = executionProfileQualificationDigest(qualificationSnapshot);
const record = {
  _id: "profile-1",
  profileKey: profileSnapshot.profileKey,
  version: profileSnapshot.version,
  profileDigest,
  immutableSnapshot: profileSnapshot,
  enabled: true,
  qualificationStatus: "EVIDENCE_QUALIFIED",
  admissionStatus: "PRODUCTION_PILOT_ELIGIBLE",
  qualificationSnapshot,
  qualificationDigest,
  qualificationExpiresAt: qualificationSnapshot.validUntil,
  promotedBy: qualificationSnapshot.approvedBy,
  promotedAt: qualificationSnapshot.approvedAt,
  executor: { adapter: profileSnapshot.harness.adapter, version: profileSnapshot.harness.version },
  harnessCapabilityManifest: profileSnapshot.harness.capabilityManifest,
  harnessCapabilityManifestDigest: profileSnapshot.harness.capabilityManifestDigest,
  harnessEffectiveConfigSha256: profileSnapshot.harness.effectiveConfigSha256,
  harnessRuntimeArtifact: profileSnapshot.runtimeArtifact.snapshot,
  harnessRuntimeArtifactDigest: profileSnapshot.runtimeArtifact.digest,
  executionBackend: profileSnapshot.executionBackend,
  modelCatalogId: profileSnapshot.modelRoute.catalogId,
  modelRouteDigest: profileSnapshot.modelRoute.routeDigest,
  modelQualificationDigest: profileSnapshot.modelRoute.qualificationDigest,
  isolationModes: profileSnapshot.isolationModes,
  requiredHarnessCapabilities: profileSnapshot.requiredHarnessCapabilities,
  requiredSandboxCapabilities: profileSnapshot.requiredSandboxCapabilities,
};
const modelRouteRecord = {
  _id: "model-route-1",
  routeSnapshot,
  routeDigest,
  enabled: true,
  qualificationStatus: "EVIDENCE_QUALIFIED",
  admissionStatus: "PRODUCTION_PILOT_ELIGIBLE",
  qualificationSnapshot: routeQualificationSnapshot,
  qualificationDigest: routeQualificationDigest,
};

function functionHandler<T extends (...args: any[]) => any>(registered: unknown): T {
  return (registered as { _handler: T })._handler;
}

function createApiContext() {
  const tenantId = "tenant-1";
  const projectId = "project-1";
  const tables: Record<string, any[]> = {
    tenants: [{ _id: tenantId, active: true }],
    projects: [{ _id: projectId, tenantId, name: "Factory", slug: "factory" }],
    modelCatalog: [{ ...modelRouteRecord, projectId }],
    factorySandboxProfiles: [],
    factoryExecutionProfiles: [],
    activities: [],
  };
  let sequence = 1;
  const db = {
    get: async (id: string) => Object.values(tables).flat().find((row) => row._id === id) ?? null,
    insert: async (table: string, value: Record<string, unknown>) => {
      const id = `${table}-${sequence++}`;
      (tables[table] ??= []).push({ _id: id, _creationTime: sequence, ...value });
      return id;
    },
    patch: async (id: string, value: Record<string, unknown>) => {
      const row = Object.values(tables).flat().find((item) => item._id === id);
      if (!row) throw new Error(`Missing row ${id}`);
      Object.assign(row, value);
    },
    query: (table: string) => {
      let rows = [...(tables[table] ?? [])];
      const builder: any = {
        withIndex: (_name: string, apply: (query: any) => any) => {
          const conditions: Array<[string, unknown]> = [];
          const query: any = {
            eq: (field: string, value: unknown) => {
              conditions.push([field, value]);
              return query;
            },
          };
          apply(query);
          rows = rows.filter((row) => conditions.every(([field, value]) => row[field] === value));
          return builder;
        },
        collect: async () => [...rows],
        first: async () => rows[0] ?? null,
      };
      return builder;
    },
  };
  return {
    ctx: { auth: { getUserIdentity: async () => null }, db } as any,
    tables,
    projectId,
  };
}

function registrationArgs(projectId: string, registrationIdempotencyKey: string) {
  return {
    projectId,
    profileKey: "software-change",
    registrationIdempotencyKey,
    executor: { adapter: "codex", version: "v1" },
    executionBackend: "persistent-worker" as const,
    modelCatalogId: "model-route-1",
    isolationModes: ["WORKSPACE_WRITE", "READ_ONLY"] as const,
  };
}

function exactProjection(): ExecutionProfileProjection {
  return {
    profileId: "profile-1",
    profileKey: profileSnapshot.profileKey,
    profileVersion: profileSnapshot.version,
    profileDigest,
    profileSnapshot,
    qualificationDigest,
    qualificationSnapshot,
    executor: { adapter: profileSnapshot.harness.adapter, version: profileSnapshot.harness.version },
    harnessCapabilityManifest: profileSnapshot.harness.capabilityManifest,
    harnessCapabilityManifestDigest: profileSnapshot.harness.capabilityManifestDigest,
    harnessEffectiveConfigSha256: profileSnapshot.harness.effectiveConfigSha256,
    harnessRuntimeArtifact: profileSnapshot.runtimeArtifact.snapshot,
    harnessRuntimeArtifactDigest: profileSnapshot.runtimeArtifact.digest,
    executionBackend: profileSnapshot.executionBackend,
    modelCatalogId: profileSnapshot.modelRoute.catalogId,
    modelRouteSnapshot: profileSnapshot.modelRoute.routeSnapshot,
    modelRouteDigest: profileSnapshot.modelRoute.routeDigest,
    modelQualificationSnapshot: profileSnapshot.modelRoute.qualificationSnapshot,
    modelQualificationDigest: profileSnapshot.modelRoute.qualificationDigest,
    isolationModes: profileSnapshot.isolationModes,
    requiredHarnessCapabilities: profileSnapshot.requiredHarnessCapabilities,
    requiredSandboxCapabilities: profileSnapshot.requiredSandboxCapabilities,
  };
}

describe("governed Execution Profile identity", () => {
  it("constructs one canonical, closed, immutable execution composition", () => {
    expect(profileSnapshot.schema).toBe(EXECUTION_PROFILE_SCHEMA);
    expect(profileSnapshot.profileKey).toBe("software-change");
    expect(profileSnapshot.isolationModes).toEqual(["READ_ONLY", "WORKSPACE_WRITE"]);
    expect(profileSnapshot.requiredHarnessCapabilities.map((item) => item.capability)).toEqual(
      [...profileSnapshot.requiredHarnessCapabilities.map((item) => item.capability)].sort(),
    );
    expect(profileSnapshot.requiredSandboxCapabilities).toEqual([
      "git-worktree",
      "read-only",
      "workspace-write",
    ]);
    expect(profileSnapshot.lifecycle).toEqual({
      contractVersion: "generic-harness-contract/v1",
      cancellationMode: "PROCESS_SIGNAL",
      idempotentCleanup: true,
      retryCreatesNewAttempt: true,
      inFlightRevocationPolicy: "LEASED_ATTEMPT_MAY_COMPLETE",
      componentSubstitution: "DENIED",
    });
    expect(Object.values(profileSnapshot.authority)).toEqual(Array(7).fill(false));
    expect(executionProfileIssues(profileSnapshot)).toEqual([]);
    expect(executionProfileDigest(structuredClone(profileSnapshot))).toBe(profileDigest);

    expect(executionProfileIssues({ ...profileSnapshot, unknown: true })).toContain("profile-fields-invalid");
    expect(executionProfileIssues({
      ...profileSnapshot,
      harness: {
        ...profileSnapshot.harness,
        capabilityManifest: { ...profileSnapshot.harness.capabilityManifest, unknown: true },
      },
    })).toContain("harness-manifest-invalid");
  });

  it("binds qualification to the exact profile and every executable component", () => {
    expect(qualificationSnapshot.schema).toBe(EXECUTION_PROFILE_QUALIFICATION_SCHEMA);
    expect(qualificationSnapshot.scope).toEqual({
      workloadClasses: ["BUG_FIX", "SOFTWARE_CHANGE"],
      riskClasses: ["GREEN", "YELLOW"],
    });
    expect(qualificationSnapshot.profile).toEqual({
      id: "profile-1",
      key: "software-change",
      version: 1,
      digest: profileDigest,
    });
    expect(qualificationSnapshot.components).toMatchObject({
      harness: {
        adapter: "codex",
        version: "v1",
        capabilityManifestDigest: manifestDigest,
        effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
      },
      runtimeArtifactDigest: runtimeDigest,
      executionBackend: "persistent-worker",
      modelRoute: {
        catalogId: "model-route-1",
        routeDigest,
        qualificationDigest: routeQualificationDigest,
      },
    });
    expect(executionProfileQualificationIssues(qualificationSnapshot)).toEqual([]);
    expect(executionProfileQualificationMatches({
      profileId: "profile-1",
      profileSnapshot,
      profileDigest,
      qualificationSnapshot,
    })).toBe(true);
    expect(() => executionProfileQualificationSnapshot({
      profileId: "profile-1",
      profileSnapshot,
      profileDigest,
      workloadClasses: ["MISSION_PLANNING"],
      riskClasses: ["GREEN"],
      evidenceReference: "docs/evidence/out-of-scope.json",
      evidenceDigest: digest("3"),
      approvedBy: "operator-2",
      approvedAt: 1_000,
      validUntil: 2_000,
    })).toThrow("scope exceeds a referenced component qualification");
  });

  it("binds an optional remote Sandbox Profile without taking over its policy", () => {
    const imageDigest = digest("7");
    const sandboxSnapshot = {
      schema: "factory-sandbox-profile/v1",
      profileKey: "exe-remote-sandbox",
      version: 1,
      provider: "EXE_DEV",
      machine: { image: `ghcr.io/example/factory@${imageDigest}` },
      security: { image: { digest: imageDigest } },
      qualification: {
        supportedWorkloadClasses: ["SOFTWARE_CHANGE"],
        supportedRiskClasses: ["GREEN"],
      },
    };
    const runtimeArtifact = {
      schemaVersion: "harness-runtime-artifact/v1" as const,
      kind: "CONTAINER_IMAGE" as const,
      name: "codex-cli-sandbox",
      version: "sandbox-v1",
      executableSha256: null,
      imageDigest,
    };
    const remoteRuntimeDigest = harnessRuntimeArtifactDigest(runtimeArtifact);
    const remoteRouteQualification = exactModelRouteQualificationSnapshot({
      routeDigest,
      evidenceReference: "docs/evidence/remote-route.json",
      evidenceDigest: digest("8"),
      workloadClasses: ["SOFTWARE_CHANGE"],
      riskClasses: ["GREEN"],
      promotedBy: "operator-1",
      promotedAt: 100,
      compatibility: {
        adapter: "codex",
        version: "v1",
        capabilityManifestDigest: manifestDigest,
        effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
        runtimeArtifactDigest: remoteRuntimeDigest,
        executionBackend: "remote-sandbox",
      },
    });
    const remoteProfile = executionProfileSnapshot({
      profileKey: "remote-software-change",
      version: 1,
      harness: profileSnapshot.harness,
      runtimeArtifact: { snapshot: runtimeArtifact, digest: remoteRuntimeDigest },
      executionBackend: "remote-sandbox",
      modelRoute: {
        catalogId: "remote-route-1",
        routeSnapshot,
        routeDigest,
        qualificationSnapshot: remoteRouteQualification,
        qualificationDigest: modelRouteQualificationDigest(remoteRouteQualification),
      },
      sandboxProfile: {
        profileId: "sandbox-1",
        profileSnapshot: sandboxSnapshot,
        profileDigest: `sha256:${computeCanonicalHash({
          namespace: "factory-sandbox-profile/v1",
          value: sandboxSnapshot,
        })}`,
      },
      isolationModes: ["WORKSPACE_WRITE"],
    });
    expect(executionProfileIssues(remoteProfile)).toEqual([]);
    expect(remoteProfile.requiredSandboxCapabilities).toEqual([
      "git-worktree",
      "remote-sandbox",
      "sandbox-provider:exe-dev",
      "workspace-write",
    ]);
    const remoteQualification = executionProfileQualificationSnapshot({
      profileId: "remote-profile-1",
      profileSnapshot: remoteProfile,
      profileDigest: executionProfileDigest(remoteProfile),
      workloadClasses: ["SOFTWARE_CHANGE"],
      riskClasses: ["GREEN"],
      evidenceReference: "docs/evidence/remote-profile.json",
      evidenceDigest: digest("9"),
      approvedBy: "operator-2",
      approvedAt: 1_000,
      validUntil: 2_000,
    });
    expect(remoteQualification.components.sandboxProfile).toEqual({
      profileId: "sandbox-1",
      profileDigest: remoteProfile.sandboxProfile.profileDigest,
    });
  });

  it("reports a current qualified row and enforces its workload/risk scope", () => {
    expect(executionProfileCurrentness(record, 1_500)).toEqual({
      eligible: true,
      blocker: null,
      profileDigest,
      qualificationDigest,
      validUntil: 2_000,
    });
    expect(executionProfileCurrentnessIssues({
      profile: record,
      modelRoute: modelRouteRecord,
      now: 1_500,
    })).toEqual([]);
    expect(executionProfileQualifiedFor(record, {
      workloadClass: "SOFTWARE_CHANGE",
      riskClass: "YELLOW",
      now: 1_500,
    })).toBe(true);
    expect(executionProfileQualifiedFor(record, {
      workloadClass: "MISSION_PLANNING",
      riskClass: "YELLOW",
      now: 1_500,
    })).toBe(false);
  });

  it("fails closed on changed profile bytes, version, config, and digest", () => {
    const changedBytes = { ...profileSnapshot, profileKey: "software-change-tampered" };
    expect(executionProfileDigest(changedBytes)).not.toBe(profileDigest);
    expect(executionProfileCurrentness({ ...record, immutableSnapshot: changedBytes }, 1_500).blocker)
      .toBe("EXECUTION_PROFILE_DIGEST_MISMATCH");

    const changedVersion = { ...profileSnapshot, version: 2 };
    expect(executionProfileDigest(changedVersion)).not.toBe(profileDigest);
    expect(executionProfileCurrentness({ ...record, version: 2 }, 1_500).blocker)
      .toBe("EXECUTION_PROFILE_VERSION_MISMATCH");

    const changedConfig = structuredClone(profileSnapshot);
    changedConfig.harness.capabilityManifest.effectiveConfigSha256 = "c".repeat(64);
    expect(executionProfileIssues(changedConfig)).toEqual(expect.arrayContaining([
      "harness-manifest-digest-mismatch",
      "harness-config-digest-mismatch",
    ]));
    expect(executionProfileCurrentness({ ...record, profileDigest: digest("0") }, 1_500).blocker)
      .toBe("EXECUTION_PROFILE_DIGEST_MISMATCH");
  });

  it("rejects wrong harness, runtime, backend, route, sandbox, and capabilities", () => {
    const base = exactProjection();
    const cases: Array<[ExecutionProfileProjection, string]> = [
      [{ ...base, executor: { adapter: "other", version: "v1" } }, "EXECUTION_PROFILE_HARNESS_MISMATCH"],
      [{ ...base, harnessEffectiveConfigSha256: "c".repeat(64) }, "EXECUTION_PROFILE_HARNESS_MISMATCH"],
      [{ ...base, harnessRuntimeArtifactDigest: digest("d") }, "EXECUTION_PROFILE_RUNTIME_ARTIFACT_MISMATCH"],
      [{ ...base, executionBackend: "remote-sandbox" }, "EXECUTION_PROFILE_BACKEND_MISMATCH"],
      [{ ...base, modelCatalogId: "sibling-same-model-route" }, "EXECUTION_PROFILE_MODEL_ROUTE_MISMATCH"],
      [{ ...base, sandboxProfileId: "substituted-sandbox" }, "EXECUTION_PROFILE_SANDBOX_MISMATCH"],
      [{ ...base, isolationModes: ["READ_ONLY"] }, "EXECUTION_PROFILE_ISOLATION_MISMATCH"],
      [{ ...base, requiredSandboxCapabilities: ["git-worktree"] }, "EXECUTION_PROFILE_CAPABILITY_MISMATCH"],
    ];
    for (const [projection, blocker] of cases) {
      expect(executionProfileProjectionBlockers({
        profileId: "profile-1",
        profileSnapshot,
        profileDigest,
        qualificationSnapshot,
        qualificationDigest,
        projection,
      })).toContain(blocker);
    }
    expect(() => executionProfileSnapshot({
      profileKey: "wrong-harness",
      version: 1,
      harness: { ...profileSnapshot.harness, adapter: "other" },
      runtimeArtifact: profileSnapshot.runtimeArtifact,
      executionBackend: "persistent-worker",
      modelRoute: profileSnapshot.modelRoute,
      isolationModes: ["WORKSPACE_WRITE"],
    })).toThrow("Execution Profile identity is invalid");
  });

  it("rejects missing, wrong, or substituted profile identity after admission", () => {
    expect(executionProfileProjectionBlockers({
      profileId: "profile-1",
      profileSnapshot,
      profileDigest,
      qualificationSnapshot,
      qualificationDigest,
      projection: null,
    })).toEqual(["EXECUTION_PROFILE_MISSING"]);

    const wrongIdentity = { ...exactProjection(), profileId: "profile-2" };
    expect(executionProfileProjectionBlockers({
      profileId: "profile-1",
      profileSnapshot,
      profileDigest,
      qualificationSnapshot,
      qualificationDigest,
      projection: wrongIdentity,
    })).toContain("EXECUTION_PROFILE_IDENTITY_MISMATCH");

    const substituted = { ...exactProjection(), profileVersion: 2 };
    expect(executionProfileProjectionMatches({
      profileId: "profile-1",
      profileSnapshot,
      profileDigest,
      qualificationSnapshot,
      qualificationDigest,
      projection: substituted,
    })).toBe(false);
  });

  it("rejects wrong qualification and mismatched evidence identity", () => {
    const wrongQualification = { ...exactProjection(), qualificationDigest: digest("e") };
    expect(executionProfileProjectionBlockers({
      profileId: "profile-1",
      profileSnapshot,
      profileDigest,
      qualificationSnapshot,
      qualificationDigest,
      projection: wrongQualification,
    })).toContain("EXECUTION_PROFILE_QUALIFICATION_MISMATCH");

    const evidenceSubstitution = {
      ...qualificationSnapshot,
      evidence: { ...qualificationSnapshot.evidence, digest: digest("f") },
    };
    const wrongEvidence = { ...exactProjection(), qualificationSnapshot: evidenceSubstitution };
    expect(executionProfileProjectionBlockers({
      profileId: "profile-1",
      profileSnapshot,
      profileDigest,
      qualificationSnapshot,
      qualificationDigest,
      projection: wrongEvidence,
    })).toContain("EXECUTION_PROFILE_EVIDENCE_MISMATCH");
    expect(executionProfileQualificationMatches({
      profileId: "profile-1",
      profileSnapshot,
      profileDigest,
      qualificationSnapshot: {
        ...qualificationSnapshot,
        components: {
          ...qualificationSnapshot.components,
          runtimeArtifactDigest: digest("0"),
        },
      },
    })).toBe(false);
  });

  it("rejects revoked, expired, unqualified, and unsupported profiles", () => {
    expect(executionProfileCurrentness({ ...record, admissionStatus: "REVOKED", revokedAt: 1_400 }, 1_500).blocker)
      .toBe("EXECUTION_PROFILE_REVOKED");
    expect(executionProfileCurrentness(record, 2_000).blocker)
      .toBe("EXECUTION_PROFILE_QUALIFICATION_EXPIRED");
    expect(executionProfileCurrentness({ ...record, qualificationStatus: "UNQUALIFIED" }, 1_500).blocker)
      .toBe("EXECUTION_PROFILE_UNQUALIFIED");
    expect(executionProfileCurrentness({
      ...record,
      immutableSnapshot: { ...profileSnapshot, schema: "factory-execution-profile/v2" },
    }, 1_500).blocker).toBe("EXECUTION_PROFILE_UNSUPPORTED");
    expect(executionProfileIssues({ ...profileSnapshot, executionBackend: "unsupported" }))
      .toEqual(expect.arrayContaining(["execution-backend-invalid"]));
  });

  it("rejects a stale or sibling live model-route qualification", () => {
    expect(executionProfileCurrentnessIssues({
      profile: record,
      modelRoute: { ...modelRouteRecord, _id: "sibling-same-model-route" },
      now: 1_500,
    })).toContain("EXECUTION_PROFILE_MODEL_ROUTE_MISMATCH");
    expect(executionProfileCurrentnessIssues({
      profile: record,
      modelRoute: { ...modelRouteRecord, enabled: false },
      now: 1_500,
    })).toContain("EXECUTION_PROFILE_MODEL_ROUTE_MISMATCH");

    const unqualified = {
      ...record,
      enabled: false,
      qualificationStatus: "UNQUALIFIED",
      admissionStatus: "DISABLED",
      qualificationSnapshot: undefined,
      qualificationDigest: undefined,
      qualificationExpiresAt: undefined,
      promotedBy: undefined,
      promotedAt: undefined,
    };
    expect(executionProfileCurrentnessIssues({
      profile: unqualified,
      modelRoute: { ...modelRouteRecord, enabled: false },
      now: 1_500,
    })).toEqual(expect.arrayContaining([
      "EXECUTION_PROFILE_DISABLED",
      "EXECUTION_PROFILE_MODEL_ROUTE_MISMATCH",
    ]));
  });

  it("fails qualification replay and conflicting requalification", () => {
    expect(executionProfileQualificationSubmissionBlocker(record, qualificationDigest))
      .toBe("EXECUTION_PROFILE_QUALIFICATION_REPLAY");
    expect(executionProfileQualificationSubmissionBlocker(record, digest("9")))
      .toBe("EXECUTION_PROFILE_ALREADY_QUALIFIED");
    expect(executionProfileQualificationSubmissionBlocker({}, qualificationDigest)).toBeNull();
  });

  it("fails closed when persisted projections or authoritative digest inputs diverge", () => {
    expect(executionProfilePersistedRecordBlockers(record)).toEqual([]);
    expect(executionProfilePersistedRecordBlockers({
      ...record,
      requiredSandboxCapabilities: ["git-worktree"],
    })).toContain("EXECUTION_PROFILE_CAPABILITY_MISMATCH");
    expect(executionProfilePersistedRecordBlockers({
      ...record,
      immutableSnapshot: { ...profileSnapshot, profileKey: "changed-bytes" },
    })).toContain("EXECUTION_PROFILE_DIGEST_MISMATCH");

    expect(executionProfileProjectionBlockers({
      profileId: "profile-1",
      profileSnapshot,
      profileDigest: digest("0"),
      qualificationSnapshot,
      qualificationDigest,
      projection: exactProjection(),
    })).toContain("EXECUTION_PROFILE_DIGEST_MISMATCH");
    expect(executionProfileProjectionBlockers({
      profileId: "profile-1",
      profileSnapshot,
      profileDigest,
      qualificationSnapshot: { ...qualificationSnapshot, approvedAt: Number.NaN },
      qualificationDigest,
      projection: exactProjection(),
    })).toContain("EXECUTION_PROFILE_QUALIFICATION_INVALID");
  });

  it("versions every unseen registration request and durably binds same-key retries", async () => {
    const originalDemoFlag = process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
    process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT = "1";
    try {
      const state = createApiContext();
      const register = functionHandler<any>(registerExecutionProfileVersion);
      const first = await register(state.ctx, registrationArgs(state.projectId, "register-1"));
      expect(first).toMatchObject({ created: true });
      expect(state.tables.factoryExecutionProfiles).toHaveLength(1);
      expect(state.tables.factoryExecutionProfiles[0]).toMatchObject({
        profileKey: "software-change",
        version: 1,
        registrationIdempotencyKey: "register-1",
        enabled: false,
      });

      // A retry returns its prior immutable result even if the referenced route
      // is no longer eligible at retry time.
      state.tables.modelCatalog[0].enabled = false;
      await expect(register(state.ctx, registrationArgs(state.projectId, "register-1")))
        .resolves.toEqual({ executionProfileId: first.executionProfileId, created: false });
      await expect(register(state.ctx, {
        ...registrationArgs(state.projectId, "register-1"),
        isolationModes: ["READ_ONLY"],
      })).rejects.toThrow("idempotency key is bound to a different request");

      state.tables.modelCatalog[0].enabled = true;
      const second = await register(state.ctx, registrationArgs(state.projectId, "register-2"));
      expect(second).toMatchObject({ created: true });
      expect(second.executionProfileId).not.toBe(first.executionProfileId);
      expect(state.tables.factoryExecutionProfiles.map((profile) => profile.version)).toEqual([1, 2]);
      expect(state.tables.factoryExecutionProfiles[1].profileDigest)
        .not.toBe(state.tables.factoryExecutionProfiles[0].profileDigest);

      state.tables.modelCatalog.push({
        ...modelRouteRecord,
        _id: "model-route-2",
        projectId: state.projectId,
      });
      const third = await register(state.ctx, {
        ...registrationArgs(state.projectId, "register-3"),
        modelCatalogId: "model-route-2",
      });
      expect(third).toMatchObject({ created: true });
      expect(state.tables.factoryExecutionProfiles[2].immutableSnapshot.modelRoute).toMatchObject({
        catalogId: "model-route-2",
        routeDigest,
      });
      expect(state.tables.factoryExecutionProfiles[2].modelCatalogId).not.toBe(
        state.tables.factoryExecutionProfiles[0].modelCatalogId,
      );

      state.tables.factoryExecutionProfiles[0].requiredSandboxCapabilities = ["git-worktree"];
      await expect(register(state.ctx, registrationArgs(state.projectId, "register-1")))
        .rejects.toThrow("failed immutable integrity");
    } finally {
      if (originalDemoFlag === undefined) delete process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
      else process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT = originalDemoFlag;
    }
  });

  it("qualifies once, preserves exact evidence on revocation, and rejects replays", async () => {
    const originalDemoFlag = process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
    process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT = "1";
    try {
      const state = createApiContext();
      const register = functionHandler<any>(registerExecutionProfileVersion);
      const qualify = functionHandler<any>(qualifyExecutionProfile);
      const revoke = functionHandler<any>(revokeExecutionProfile);
      const registration = await register(state.ctx, registrationArgs(state.projectId, "register-qualified"));
      const profile = state.tables.factoryExecutionProfiles[0];
      const qualificationArgs = {
        executionProfileId: registration.executionProfileId,
        expectedProfileDigest: profile.profileDigest,
        qualificationIdempotencyKey: "qualification-1",
        evidenceReference: "docs/evidence/profile-qualification.json",
        evidenceDigest: digest("6"),
        workloadClasses: ["SOFTWARE_CHANGE"],
        riskClasses: ["YELLOW"],
        validUntil: Date.now() + 60_000,
      };
      await expect(qualify(state.ctx, {
        ...qualificationArgs,
        expectedProfileDigest: digest("0"),
      })).rejects.toThrow("digest does not match");

      state.tables.modelCatalog[0].enabled = false;
      await expect(qualify(state.ctx, qualificationArgs))
        .rejects.toThrow("components are not currently admissible");
      state.tables.modelCatalog[0].enabled = true;

      const exactCapabilities = profile.requiredSandboxCapabilities;
      profile.requiredSandboxCapabilities = ["git-worktree"];
      await expect(qualify(state.ctx, qualificationArgs))
        .rejects.toThrow("EXECUTION_PROFILE_CAPABILITY_MISMATCH");
      profile.requiredSandboxCapabilities = exactCapabilities;

      const qualified = await qualify(state.ctx, qualificationArgs);
      expect(qualified).toMatchObject({
        executionProfileId: registration.executionProfileId,
        profileDigest: profile.profileDigest,
      });
      expect(profile).toMatchObject({
        enabled: true,
        qualificationStatus: "EVIDENCE_QUALIFIED",
        admissionStatus: "PRODUCTION_PILOT_ELIGIBLE",
        qualificationIdempotencyKey: "qualification-1",
      });
      expect(profile.qualificationSnapshot.evidence).toEqual({
        reference: qualificationArgs.evidenceReference,
        digest: qualificationArgs.evidenceDigest,
      });

      await expect(qualify(state.ctx, qualificationArgs)).rejects.toThrow("already consumed");
      await expect(qualify(state.ctx, {
        ...qualificationArgs,
        qualificationIdempotencyKey: "qualification-2",
      })).rejects.toThrow("qualification is immutable");

      const frozenEvidence = structuredClone(profile.qualificationSnapshot.evidence);
      await revoke(state.ctx, {
        executionProfileId: registration.executionProfileId,
        expectedProfileDigest: profile.profileDigest,
        reason: "Superseded by a reviewed profile version.",
      });
      expect(executionProfileCurrentness(profile, Date.now()).blocker).toBe("EXECUTION_PROFILE_REVOKED");
      expect(profile.qualificationSnapshot.evidence).toEqual(frozenEvidence);
      await expect(qualify(state.ctx, {
        ...qualificationArgs,
        qualificationIdempotencyKey: "qualification-after-revoke",
      })).rejects.toThrow("Revoked Execution Profiles cannot be requalified");
    } finally {
      if (originalDemoFlag === undefined) delete process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT;
      else process.env.MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT = originalDemoFlag;
    }
  });
});
