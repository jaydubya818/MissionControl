import { describe, expect, it } from "vitest";
import { canonicalHash } from "@mission-control/shared";
import {
  CODEX_V1_HARNESS_MANIFEST,
  CODEX_V1_RUNTIME_ARTIFACT,
  harnessCapabilityManifestDigest,
  harnessExecutionRequestDigest,
  harnessRuntimeArtifactDigest,
  type ExecutorRequest,
  type HarnessNormalizedResult,
} from "@mission-control/workflow-engine";
import {
  assertMissionPlanningExecutionProfile,
  assertMissionPlanningHarnessRegistration,
  assertMissionPlanningHarnessResult,
  buildMissionPlanningExecutorRequest,
} from "../missionPlanningWorker.js";
import type { RegisteredHarnessAdapter } from "../harnessAdapterRegistry.js";

const capabilityManifestSha256 = harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST);
const runtimeArtifactSha256 = harnessRuntimeArtifactDigest(CODEX_V1_RUNTIME_ARTIFACT);

describe("MissionPlanningWorker exact execution identity", () => {
  it.each(["research", "generation"] as const)(
    "passes the frozen V2 route controls into the %s request",
    (phase) => {
      const run = v2Run();
      const request = planningRequest(run, phase);

      expect(request).toMatchObject({
        model: run.modelId,
        provider: run.modelProvider,
        modelRouteDigest: run.modelRouteDigest,
        providerRoute: "openai",
        reasoningConfig: { effort: "high" },
        isolation: "READ_ONLY",
        filesystemReadScope: "WORKSPACE_ONLY",
      });
    },
  );

  it("rejects a V2 route or qualification that drifts from the frozen run", () => {
    const run = v2Run();
    expect(() => planningRequest({
      ...run,
      modelRouteDigest: `sha256:${"f".repeat(64)}`,
    }, "research")).toThrow(/core execution identity/i);

    expect(() => planningRequest({
      ...run,
      modelQualificationSnapshot: {
        ...run.modelQualificationSnapshot,
        compatibility: {
          ...run.modelQualificationSnapshot.compatibility,
          runtimeArtifactDigest: `sha256:${"e".repeat(64)}`,
        },
      },
    }, "research")).toThrow(/core execution identity/i);
  });

  it("rejects missing, partial, or substituted profile bindings before adapter resolution", () => {
    const run = v2Run();
    expect(() => assertMissionPlanningExecutionProfile({
      ...run,
      executionProfileQualificationSnapshot: undefined,
    })).toThrow(/partial Execution Profile/i);
    expect(() => assertMissionPlanningExecutionProfile({
      ...run,
      executor: { ...run.executor, adapter: "deepagents" },
    })).toThrow(/core execution identity/i);
    expect(() => assertMissionPlanningExecutionProfile({
      ...run,
      executionProfileDigest: `sha256:${"d".repeat(64)}`,
    })).toThrow(/does not match its frozen harness/i);
  });

  it("rejects a registered adapter whose executable differs from the frozen runtime artifact", () => {
    expect(() => assertMissionPlanningHarnessRegistration(v2Run(), {
      ...registration(),
      runtimeArtifactSha256: `sha256:${"d".repeat(64)}`,
    })).toThrow(/frozen Factory execution identity/i);
  });

  it("rejects execution when the planning run lacks the additive frozen identity", () => {
    const run = v2Run();
    expect(() => assertMissionPlanningHarnessRegistration({
      ...run,
      modelRouteSnapshot: undefined,
    }, registration())).toThrow(/core execution identity/i);
    expect(() => assertMissionPlanningHarnessRegistration({
      ...run,
      executionBackend: undefined,
    }, registration())).toThrow(/core execution identity/i);
    expect(() => assertMissionPlanningHarnessRegistration({
      ...run,
      executor: { ...run.executor, runtimeArtifactSha256: undefined },
    }, registration())).toThrow(/core execution identity/i);
  });

  it("accepts exact normalized provenance and rejects route or runtime tampering", () => {
    const run = v2Run();
    const request = planningRequest(run, "generation");
    const exact = normalizedResult(run, request);

    expect(() => assertMissionPlanningHarnessResult(
      exact,
      request,
      run,
      registration(),
      "mission-plan-candidate/v1",
    )).not.toThrow();

    expect(() => assertMissionPlanningHarnessResult(
      {
        ...exact,
        provenance: { ...exact.provenance, providerRoute: "openrouter" },
      },
      request,
      run,
      registration(),
      "mission-plan-candidate/v1",
    )).toThrow(/frozen execution identity/i);

    expect(() => assertMissionPlanningHarnessResult(
      {
        ...exact,
        provenance: { ...exact.provenance, modelRouteDigest: `sha256:${"b".repeat(64)}` },
      },
      request,
      run,
      registration(),
      "mission-plan-candidate/v1",
    )).toThrow(/frozen execution identity/i);

    expect(() => assertMissionPlanningHarnessResult(
      {
        ...exact,
        provenance: { ...exact.provenance, reasoningConfig: { effort: "low" } },
      },
      request,
      run,
      registration(),
      "mission-plan-candidate/v1",
    )).toThrow(/frozen execution identity/i);

    expect(() => assertMissionPlanningHarnessResult(
      {
        ...exact,
        provenance: {
          ...exact.provenance,
          runtimeArtifact: { ...CODEX_V1_RUNTIME_ARTIFACT, executableSha256: "d".repeat(64) },
          runtimeArtifactDigest: `sha256:${"d".repeat(64)}`,
        },
      },
      request,
      run,
      registration(),
      "mission-plan-candidate/v1",
    )).toThrow(/frozen execution identity/i);
  });

  it("keeps a genuinely frozen legacy V1 run on the legacy request projection", () => {
    const run = legacyRun();
    const request = planningRequest(run, "research");

    expect(request).toMatchObject({ provider: "openai", model: "gpt-5.6-terra" });
    expect(request).not.toHaveProperty("modelRouteDigest");
    expect(request).not.toHaveProperty("providerRoute");
    expect(request).not.toHaveProperty("reasoningConfig");
  });

  it("rejects an incomplete profileless run instead of treating it as historical", () => {
    const run = legacyRun();
    expect(() => planningRequest({ ...run, inputDigest: undefined }, "research"))
      .toThrow(/complete historical frozen identity/i);
  });
});

function planningRequest(run: any, phase: "research" | "generation") {
  return buildMissionPlanningExecutorRequest({
    run,
    worktree: "/tmp/planning-worktree",
    phase,
    prompt: "Produce governed planning output.",
    schemaId: phase === "research" ? "repository-research-packet/v1" : "mission-plan-candidate/v1",
    jsonSchema: { type: "object" },
  });
}

function v2Run() {
  const routeSnapshot = {
    schema: "factory-model-route/v2",
    provider: "openai",
    providerRoute: "openai",
    modelId: "gpt-5.6-terra",
    reasoningConfig: { effort: "high" },
  };
  const routeDigest = identityDigest(routeSnapshot.schema, routeSnapshot);
  const qualificationSnapshot = {
    schema: "factory-model-route-qualification/v2",
    routeDigest,
    evidence: {
      reference: "evidence://planning-route",
      digest: `sha256:${"a".repeat(64)}`,
    },
    scope: {
      workloadClasses: ["MISSION_PLANNING", "SOFTWARE_CHANGE"],
      riskClasses: ["YELLOW"],
    },
    promotedBy: "operator",
    promotedAt: 1,
    compatibility: {
      adapter: "codex",
      version: "v1",
      capabilityManifestDigest: capabilityManifestSha256,
      effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
      runtimeArtifactDigest: runtimeArtifactSha256,
      executionBackend: "persistent-worker",
    },
    authority: {
      executionOnly: true,
      routing: false,
      verification: false,
      acceptance: false,
      publication: false,
      merge: false,
    },
  };
  const profileSnapshot = {
    schema: "factory-execution-profile/v1",
    profileKey: "software-change",
    version: 1,
    harness: {
      adapter: "codex",
      version: "v1",
      capabilityManifest: CODEX_V1_HARNESS_MANIFEST,
      capabilityManifestDigest: capabilityManifestSha256,
      effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
    },
    runtimeArtifact: {
      snapshot: CODEX_V1_RUNTIME_ARTIFACT,
      digest: runtimeArtifactSha256,
    },
    executionBackend: "persistent-worker",
    modelRoute: {
      catalogId: "model-route-1",
      routeSnapshot,
      routeDigest,
      qualificationSnapshot,
      qualificationDigest: identityDigest(qualificationSnapshot.schema, qualificationSnapshot),
    },
    isolationModes: ["READ_ONLY", "WORKSPACE_WRITE"],
    requiredHarnessCapabilities: [
      { capability: "cancellation.support", minimumSupport: "PARTIAL" },
      { capability: "filesystem.pathAllowlist", minimumSupport: "PARTIAL" },
      { capability: "filesystem.read", minimumSupport: "SUPPORTED" },
      { capability: "filesystem.write", minimumSupport: "SUPPORTED" },
      { capability: "git.diff", minimumSupport: "SUPPORTED" },
      { capability: "git.status", minimumSupport: "SUPPORTED" },
      { capability: "headless.support", minimumSupport: "PARTIAL" },
      { capability: "shell.available", minimumSupport: "PARTIAL" },
      { capability: "shell.processTreeCancellation", minimumSupport: "PARTIAL" },
      { capability: "tools.structuredOutput", minimumSupport: "PARTIAL" },
    ],
    requiredSandboxCapabilities: ["git-worktree", "read-only", "workspace-write"],
    lifecycle: {
      contractVersion: "generic-harness-contract/v1",
      cancellationMode: CODEX_V1_HARNESS_MANIFEST.cancellation.mode,
      idempotentCleanup: CODEX_V1_HARNESS_MANIFEST.cancellation.idempotentCleanup,
      retryCreatesNewAttempt: true,
      inFlightRevocationPolicy: "LEASED_ATTEMPT_MAY_COMPLETE",
      componentSubstitution: "DENIED",
    },
    authority: deniedProfileAuthority(),
  };
  const profileDigest = identityDigest(profileSnapshot.schema, profileSnapshot);
  const profileQualificationSnapshot = {
    schema: "factory-execution-profile-qualification/v1",
    profile: {
      id: "execution-profile-1",
      key: profileSnapshot.profileKey,
      version: profileSnapshot.version,
      digest: profileDigest,
    },
    components: {
      harness: {
        adapter: profileSnapshot.harness.adapter,
        version: profileSnapshot.harness.version,
        capabilityManifestDigest: profileSnapshot.harness.capabilityManifestDigest,
        effectiveConfigSha256: profileSnapshot.harness.effectiveConfigSha256,
      },
      runtimeArtifactDigest: profileSnapshot.runtimeArtifact.digest,
      executionBackend: profileSnapshot.executionBackend,
      modelRoute: {
        catalogId: profileSnapshot.modelRoute.catalogId,
        routeDigest: profileSnapshot.modelRoute.routeDigest,
        qualificationDigest: profileSnapshot.modelRoute.qualificationDigest,
      },
      isolationModes: profileSnapshot.isolationModes,
      requiredHarnessCapabilities: profileSnapshot.requiredHarnessCapabilities,
      requiredSandboxCapabilities: profileSnapshot.requiredSandboxCapabilities,
    },
    scope: {
      workloadClasses: ["MISSION_PLANNING", "SOFTWARE_CHANGE"],
      riskClasses: ["YELLOW"],
    },
    evidence: {
      reference: "evidence://planning-execution-profile",
      digest: `sha256:${"b".repeat(64)}`,
    },
    approvedBy: "operator",
    approvedAt: 1,
    validUntil: 10_000_000,
    authority: deniedProfileAuthority(),
  };
  const executionProfile = {
    profileId: profileQualificationSnapshot.profile.id,
    profileKey: profileSnapshot.profileKey,
    version: profileSnapshot.version,
    profileDigest,
    profileSnapshot,
    qualificationDigest: identityDigest(profileQualificationSnapshot.schema, profileQualificationSnapshot),
    qualificationSnapshot: profileQualificationSnapshot,
  };
  const factoryConfigurationDigest = `sha256:${"c".repeat(64)}`;
  const inputSnapshot = {
    planner: { maxRuntimeMinutes: 10 },
    factoryAdmission: {
      factoryDefinitionVersionId: "factory-version-1",
      factoryConfigurationDigest,
      modelCatalogId: profileSnapshot.modelRoute.catalogId,
      modelRouteDigest: routeDigest,
      modelQualificationDigest: profileSnapshot.modelRoute.qualificationDigest,
      executionBackend: "persistent-worker",
      harnessRuntimeArtifactSha256: runtimeArtifactSha256,
      executionProfile,
    },
  };
  return {
    _id: "planning-run-1",
    attemptCount: 1,
    planningRepositorySha: "a".repeat(40),
    factoryDefinitionVersionId: "factory-version-1",
    factoryConfigurationDigest,
    inputSnapshot,
    inputDigest: `sha256:${canonicalHash(inputSnapshot)}`,
    executor: {
      adapter: "codex",
      version: "v1",
      capabilityManifestSha256,
      effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
      runtimeArtifact: CODEX_V1_RUNTIME_ARTIFACT,
      runtimeArtifactSha256,
    },
    executionBackend: "persistent-worker",
    modelProvider: routeSnapshot.provider,
    modelId: routeSnapshot.modelId,
    modelCatalogId: profileSnapshot.modelRoute.catalogId,
    modelRouteDigest: routeDigest,
    modelRouteSnapshot: routeSnapshot,
    modelQualificationDigest: identityDigest(qualificationSnapshot.schema, qualificationSnapshot),
    modelQualificationSnapshot: qualificationSnapshot,
    executionProfileId: executionProfile.profileId,
    executionProfileKey: executionProfile.profileKey,
    executionProfileVersion: executionProfile.version,
    executionProfileDigest: executionProfile.profileDigest,
    executionProfileSnapshot: executionProfile.profileSnapshot,
    executionProfileQualificationDigest: executionProfile.qualificationDigest,
    executionProfileQualificationSnapshot: executionProfile.qualificationSnapshot,
  };
}

function legacyRun() {
  const routeSnapshot = {
    schema: "factory-model-route/v1",
    provider: "openai",
    providerRoute: "openai",
    modelId: "gpt-5.6-terra",
    capabilityIdentity: {
      adapter: "codex",
      version: "v1",
      capabilityManifestDigest: capabilityManifestSha256,
      effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
    },
    runtimeIdentity: {
      kind: "CODEX_CLI",
      cliVersion: "0.146.0",
      executableSha256: CODEX_V1_RUNTIME_ARTIFACT.executableSha256,
    },
  };
  const current = v2Run();
  const { executionProfile: _profile, ...factoryAdmission } = current.inputSnapshot.factoryAdmission;
  const inputSnapshot = {
    ...current.inputSnapshot,
    factoryAdmission: {
      ...factoryAdmission,
      modelRouteDigest: identityDigest(routeSnapshot.schema, routeSnapshot),
      modelQualificationDigest: undefined,
    },
  };
  return {
    ...current,
    modelProvider: routeSnapshot.provider,
    modelId: routeSnapshot.modelId,
    modelRouteDigest: identityDigest(routeSnapshot.schema, routeSnapshot),
    modelRouteSnapshot: routeSnapshot,
    modelQualificationDigest: undefined,
    modelQualificationSnapshot: undefined,
    executionProfileId: undefined,
    executionProfileKey: undefined,
    executionProfileVersion: undefined,
    executionProfileDigest: undefined,
    executionProfileSnapshot: undefined,
    executionProfileQualificationDigest: undefined,
    executionProfileQualificationSnapshot: undefined,
    inputSnapshot,
    inputDigest: `sha256:${canonicalHash(inputSnapshot)}`,
  };
}

function deniedProfileAuthority() {
  return {
    routing: false,
    verification: false,
    publication: false,
    acceptance: false,
    merge: false,
    policyMutation: false,
    workerLeases: false,
  };
}

function registration(): RegisteredHarnessAdapter {
  return {
    adapter: {} as RegisteredHarnessAdapter["adapter"],
    capabilities: {
      adapter: "codex",
      version: "v1",
    } as RegisteredHarnessAdapter["capabilities"],
    manifest: CODEX_V1_HARNESS_MANIFEST,
    capabilityManifestSha256,
    effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
    runtimeArtifact: CODEX_V1_RUNTIME_ARTIFACT,
    runtimeArtifactSha256,
  };
}

function normalizedResult(run: ReturnType<typeof v2Run>, request: ExecutorRequest): HarnessNormalizedResult {
  return {
    schemaVersion: "harness-result/v1",
    executionId: request.executionId,
    status: "COMPLETED",
    harness: CODEX_V1_HARNESS_MANIFEST.identity,
    provenance: {
      provider: request.provider ?? null,
      model: request.model ?? null,
      modelRouteDigest: request.modelRouteDigest,
      providerRoute: request.providerRoute,
      reasoningConfig: request.reasoningConfig,
      capabilityManifestSha256,
      effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
      executableSha256: CODEX_V1_RUNTIME_ARTIFACT.executableSha256,
      runtimeArtifact: CODEX_V1_RUNTIME_ARTIFACT,
      runtimeArtifactDigest: runtimeArtifactSha256,
      requestSha256: harnessExecutionRequestDigest(request),
      providerMetadata: {},
    },
    timing: { startedAt: 1, finishedAt: 2, wallClockMs: 1 },
    repository: {
      root: request.repositoryRoot,
      workingDirectory: request.workingDirectory,
      baselineCommit: run.planningRepositorySha,
      headCommit: run.planningRepositorySha,
      headChanged: false,
      changedFiles: [],
      scopeViolations: [],
    },
    events: { items: [], toolCalls: 0, modelRequests: 1, retries: 0, sessionCount: 1 },
    usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: null },
    exitCode: 0,
    signal: null,
    output: "{}",
    structuredOutput: { schema: request.structuredOutput?.schemaId ?? null, summary: "ok" },
    error: null,
    cancellation: { requested: false, mode: "NONE" },
    cleanup: { status: "COMPLETED", completedAt: 2, error: null },
  };
}

function identityDigest(schema: string, value: unknown) {
  return `sha256:${canonicalHash({ namespace: schema, value })}`;
}
