// Harness-only synthetic offline composition, adapted from classifyAuthorityRecords and
// bedrockProfileFixture. All identity/admission checks use production constructors.
// Qualification assertions describe controlled fixture rows, not real infrastructure.
import { dockerSandboxAdmission, DOCKER_ADMISSION_SCHEMA } from "/private/tmp/fdlc-program-observations/convex/lib/dockerSandboxAdmission.ts";
import {
  CODEX_BEDROCK_V1_HARNESS_MANIFEST,
  harnessCapabilityManifestDigest,
  harnessRuntimeArtifactDigest,
} from "/private/tmp/fdlc-program-observations/packages/workflow-engine/src/harnessContract.ts";
import {
  exactModelRouteDigest,
  exactModelRouteQualificationSnapshot,
  exactModelRouteSnapshot,
  modelRouteQualificationDigest,
} from "/private/tmp/fdlc-program-observations/convex/lib/modelRouteAdmission";
import {
  executionProfileDigest,
  executionProfileQualificationDigest,
  executionProfileQualificationSnapshot,
  executionProfileSnapshot,
} from "/private/tmp/fdlc-program-observations/convex/lib/executionProfile";
import { buildFactoryExecutionManifest, factorySandboxResourceName } from "/private/tmp/fdlc-program-observations/convex/lib/executionManifest";
import { factoryConfigurationDigest } from "/private/tmp/fdlc-program-observations/convex/lib/factoryConfiguration";
import { computeCanonicalHash } from "/private/tmp/fdlc-program-observations/convex/lib/genomeHash";

/**
 * Synthetic offline authority records built with the real canonical constructors.
 * The known harness/runtime identities are frozen dependencies, not evidence that
 * this selected provider route has executed. Caller-supplied IDs let the same
 * fixture exercise real admission against an isolated Convex database.
 *
 * The returned version/run bindings are partial rows. Workflow and agent IDs are
 * explicit fixture identities; callers can supply allocated causation IDs.
 */
export function bedrockAuthorityRecords(input: {
  projectId: string;
  repositoryId: string;
  profileId: string;
  modelCatalogId: string;
  sandboxProfileId: string;
  now: number;
  workOrderId?: string;
  taskId?: string;
  attemptId?: string;
  factoryVersionId?: string;
  qualifiedRepositoryIds?: string[];
  workloadClasses?: string[];
  riskClasses?: Array<"GREEN" | "YELLOW" | "RED">;
}) {
  const evidenceDigest = (kind: string) => `sha256:${computeCanonicalHash({
    schema: "observation-bedrock-authority-fixture/v1", kind, ...input,
  })}`;
  const createdAt = input.now - 1_000;
  const workloadClasses = input.workloadClasses ?? ["SOFTWARE_CHANGE"];
  const riskClasses: Array<"GREEN" | "YELLOW" | "RED"> = input.riskClasses ?? ["GREEN"];
  const manifest = structuredClone(CODEX_BEDROCK_V1_HARNESS_MANIFEST);
  const sandbox = offlineDockerSnapshot(input.now);
  const sandboxDigest = `sha256:${computeCanonicalHash({ namespace: "factory-sandbox-profile/v1", value: sandbox })}`;
  const sandboxAdmission = dockerSandboxAdmission(sandbox, sandboxDigest, "synthetic-fixture-reviewer", createdAt);
  const artifact = { schemaVersion: "harness-runtime-artifact/v1" as const, kind: "CONTAINER_IMAGE" as const,
    name: "codex-cli-sandbox", version: "0.146.0", executableSha256: null,
    imageDigest: sandbox.dockerQualification.imageDigest };
  const manifestDigest = harnessCapabilityManifestDigest(manifest);
  const runtimeDigest = harnessRuntimeArtifactDigest(artifact);
  const routeSnapshot = exactModelRouteSnapshot({
    provider: "aws-bedrock", providerRoute: "offline-bedrock-converse-us",
    modelId: "anthropic.claude-sonnet-4-6",
  });
  const routeDigest = exactModelRouteDigest(routeSnapshot);
  const routeQualification = exactModelRouteQualificationSnapshot({
    routeDigest, evidenceReference: "offline-fixture://observation-bedrock/model-route",
    evidenceDigest: evidenceDigest("model-route"),
    workloadClasses, riskClasses,
    repositoryIds: input.qualifiedRepositoryIds ?? [input.repositoryId],
    promotedBy: "synthetic-fixture-route-reviewer", promotedAt: createdAt,
    compatibility: {
      adapter: "codex", version: "bedrock-v1", capabilityManifestDigest: manifestDigest,
      effectiveConfigSha256: manifest.effectiveConfigSha256,
      runtimeArtifactDigest: runtimeDigest, executionBackend: "remote-sandbox",
    },
  });
  const routeQualificationDigest = modelRouteQualificationDigest(routeQualification);
  const profileSnapshot = executionProfileSnapshot({
    profileKey: "observation-bedrock-authority-fixture", version: 1,
    harness: {
      adapter: "codex", version: "bedrock-v1", capabilityManifest: manifest,
      capabilityManifestDigest: manifestDigest, effectiveConfigSha256: manifest.effectiveConfigSha256,
    },
    runtimeArtifact: { snapshot: artifact, digest: runtimeDigest },
    executionBackend: "remote-sandbox",
    modelRoute: {
      catalogId: input.modelCatalogId, routeSnapshot, routeDigest,
      qualificationSnapshot: routeQualification, qualificationDigest: routeQualificationDigest,
    },
    sandboxProfile: { profileId: input.sandboxProfileId, profileSnapshot: sandbox, profileDigest: sandboxDigest },
    isolationModes: ["READ_ONLY"],
  });
  const profileDigest = executionProfileDigest(profileSnapshot);
  const qualificationSnapshot = executionProfileQualificationSnapshot({
    profileId: input.profileId, profileSnapshot, profileDigest,
    workloadClasses, riskClasses,
    evidenceReference: "offline-fixture://observation-bedrock/execution-profile",
    evidenceDigest: evidenceDigest("execution-profile"),
    approvedBy: "synthetic-fixture-profile-reviewer", approvedAt: createdAt,
    validUntil: input.now + 60_000,
  });
  const qualificationDigest = executionProfileQualificationDigest(qualificationSnapshot);
  const harnessBindings = {
    executor: { adapter: "codex", version: "bedrock-v1" },
    harnessCapabilityManifest: manifest, harnessCapabilityManifestDigest: manifestDigest,
    harnessEffectiveConfigSha256: manifest.effectiveConfigSha256,
    harnessRuntimeArtifact: artifact, harnessRuntimeArtifactDigest: runtimeDigest,
    executionBackend: "remote-sandbox" as const,
  };
  const profile = {
    projectId: input.projectId, profileKey: profileSnapshot.profileKey, version: 1,
    profileDigest, immutableSnapshot: profileSnapshot, ...harnessBindings,
    modelCatalogId: input.modelCatalogId, modelRouteDigest: routeDigest,
    sandboxProfileId: input.sandboxProfileId, sandboxProfileDigest: sandboxDigest,
    modelQualificationDigest: routeQualificationDigest,
    isolationModes: profileSnapshot.isolationModes,
    requiredHarnessCapabilities: profileSnapshot.requiredHarnessCapabilities,
    requiredSandboxCapabilities: profileSnapshot.requiredSandboxCapabilities,
    registrationIdempotencyKey: "observation-bedrock-authority-fixture-registration",
    enabled: true, qualificationStatus: "EVIDENCE_QUALIFIED" as const,
    admissionStatus: "PRODUCTION_PILOT_ELIGIBLE" as const,
    qualificationSnapshot, qualificationDigest,
    qualificationExpiresAt: qualificationSnapshot.validUntil,
    qualificationIdempotencyKey: "observation-bedrock-authority-fixture-qualification",
    promotedBy: qualificationSnapshot.approvedBy, promotedAt: qualificationSnapshot.approvedAt,
    createdBy: "synthetic-fixture-operator", createdAt, updatedAt: createdAt,
  };
  const modelRoute = {
    projectId: input.projectId, provider: routeSnapshot.provider,
    providerRoute: routeSnapshot.providerRoute, modelId: routeSnapshot.modelId,
    displayName: "Synthetic classification authority fixture", tier: "FAST" as const,
    capabilities: ["text"], supportsTools: false, riskApproved: false,
    contextWindow: 128_000, availability: "HEALTHY" as const, deprecated: false,
    routeSnapshot, routeDigest, enabled: true,
    qualificationStatus: "EVIDENCE_QUALIFIED" as const,
    admissionStatus: "PRODUCTION_PILOT_ELIGIBLE" as const,
    qualificationSnapshot: routeQualification, qualificationDigest: routeQualificationDigest,
    registeredBy: "synthetic-fixture-operator", registeredAt: createdAt,
    promotedBy: routeQualification.promotedBy, promotedAt: routeQualification.promotedAt,
    updatedAt: createdAt,
  };
  const profileBindings = {
    executionProfileId: input.profileId, executionProfileKey: profileSnapshot.profileKey,
    executionProfileVersion: 1, executionProfileDigest: profileDigest,
    executionProfileSnapshot: profileSnapshot,
    executionProfileQualificationDigest: qualificationDigest,
    executionProfileQualificationSnapshot: qualificationSnapshot,
  };
  const budget = { maxCostUsd: 1, maxRuntimeMinutes: 1, maxAttempts: 1 };
  const configurationDigest = factoryConfigurationDigest({
    purpose: "SOFTWARE", repositoryId: input.repositoryId, workflowId: "fixture-workflow",
    ...harnessBindings, executionProfileId: input.profileId, executionProfileVersion: 1,
    executionProfileDigest: profileDigest, executionProfileQualificationDigest: qualificationDigest,
    modelCatalogId: input.modelCatalogId, modelRouteDigest: routeDigest,
    codeScopeIds: [], agentBindings: [{ workflowAgentId: "classify", agentVersionId: "fixture-agent" }],
    budget, verifierIds: [], riskBoundary: "GREEN",
    recovery: { pause: false, cancel: true, retry: false, resume: false },
  });
  const versionBindings = {
    projectId: input.projectId, repositoryId: input.repositoryId,
    ...harnessBindings, ...profileBindings,
    modelCatalogId: input.modelCatalogId, modelRouteSnapshot: routeSnapshot,
    modelRouteDigest: routeDigest, modelQualificationSnapshot: routeQualification,
    modelQualificationDigest: routeQualificationDigest,
    purpose: "SOFTWARE" as const, riskBoundary: "GREEN" as const,
    budget, configurationDigest,
  };
  const executionManifest = buildFactoryExecutionManifest({
    runId: input.attemptId ?? "fixture-attempt", workOrderId: input.workOrderId ?? "fixture-work-order",
    workOrderRevisionNumber: 1,
    ...(input.taskId ? { taskId: input.taskId, task: { title: "Synthetic classification fixture" } } : {}),
    factoryDefinitionVersionId: input.factoryVersionId ?? "fixture-factory-version",
    factoryConfigurationDigest: configurationDigest,
    factoryPurpose: "SOFTWARE", repositoryId: input.repositoryId, repository: "fixture/classify",
    defaultBranch: "main", baseSha: "a".repeat(40), branch: "fixture/classify",
    worktree: "/synthetic-fixture/classify",
    executor: {
      adapter: "codex", version: "bedrock-v1", capabilityManifest: manifest,
      capabilityManifestSha256: manifestDigest, effectiveConfigSha256: manifest.effectiveConfigSha256,
      runtimeArtifact: artifact, runtimeArtifactDigest: runtimeDigest,
    },
    executionBackend: "remote-sandbox", modelRoute: profileSnapshot.modelRoute,
    executionProfile: {
      profileId: input.profileId, profileKey: profileSnapshot.profileKey, version: 1,
      profileDigest, profileSnapshot, qualificationDigest, qualificationSnapshot,
    },
    sandboxProfile: { isolation: "READ_ONLY", requiredCapabilities: profileSnapshot.requiredSandboxCapabilities },
    sandbox: {
      resourceName: factorySandboxResourceName({ projectId: input.projectId, workflowRunId: input.attemptId!, attemptId: input.attemptId! }),
      profileId: input.sandboxProfileId, profileDigest: sandboxDigest, profileSnapshot: sandbox,
      supervisorVersion: "mission-control-supervisor/v1", credentialGrants: [],
      resultContract: { schema: "factory-sandbox-result/v1", independentHostValidationRequired: true },
      teardown: { credentialsRevokedBeforePublication: true, resourceAbsenceRequiredBeforePublication: true },
    },
    workflow: {
      workflowId: "fixture-workflow", version: 1, name: "Synthetic classification fixture",
      description: "Offline qualification only", agents: [{ id: "classify", persona: "Synthetic fixture" }],
      steps: [{ id: "classify", agent: "classify", input: "Classify the synthetic fixture", timeoutMinutes: 1 }],
    },
    workOrder: {
      title: "Synthetic classification fixture", desiredOutcome: "Exercise admission without a provider call",
      acceptanceCriteria: [], riskLevel: "GREEN",
    },
    agentBindings: [{
      workflowAgentId: "classify", agentVersionId: "fixture-agent", agentVersion: 1,
      genomeHash: evidenceDigest("genome"), promptBundleHash: evidenceDigest("prompt"),
      toolManifestHash: evidenceDigest("tools"),
      model: { provider: routeSnapshot.provider, modelId: routeSnapshot.modelId },
    }],
    codeScopes: [], allowedTools: [], ...budget, initialContext: { synthetic: true },
  });
  const runBindings = {
    projectId: input.projectId, repositoryId: input.repositoryId, ...profileBindings,
    executorAdapter: "codex", executorVersion: "bedrock-v1", factoryConfigurationDigest: configurationDigest,
    executionManifest: executionManifest.manifest, executionManifestDigest: executionManifest.digest,
  };
  // Model separately persisted rows so fault injection cannot mutate another
  // row's frozen evidence through a shared JavaScript object reference.
  return {
    sandboxRecord: { profileDigest: sandboxDigest, immutableSnapshot: sandbox, admissionState: "PRODUCTION_PILOT_ELIGIBLE",
      admissionSnapshot: sandboxAdmission, admissionDigest: `sha256:${computeCanonicalHash({ namespace: DOCKER_ADMISSION_SCHEMA, value: sandboxAdmission })}`,
      status: "ACTIVE", readinessState: "DEGRADED", readinessExpiresAt: input.now + 60_000 },
    profile: structuredClone(profile), modelRoute: structuredClone(modelRoute),
    versionBindings: structuredClone(versionBindings), runBindings: structuredClone(runBindings),
  };
}

function offlineDockerSnapshot(now: number) {
  const imageDigest = "sha256:11ea5f88493593ff48520222e1df3bca6303e92138847decf71d30e5cce92124";
  return {
    schema: "factory-sandbox-profile/v1", profileKey: "observation-bedrock-offline", version: 1,
    provider: "DOCKER", providerProfile: "factory/docker-bedrock/v1", providerProfileVersion: "1",
    machine: { image: `mission-control/factory-docker-bedrock@${imageDigest}`, cpu: 1, memoryMb: 512, diskGb: 20 },
    supervisor: { version: "mission-control-supervisor/v1", transport: "DOCKER_STDIN" },
    runtime: { maxRuntimeMs: 60_000, resultPollIntervalMs: 250, resultRetentionMs: 86_400_000 },
    network: { egress: "RESTRICTED_ALLOWLIST", egressAllowlist: [], publicIngress: false, exposedPorts: [] },
    credentials: { inference: "NONE", repositoryAccess: "CONTROL_PLANE_SNAPSHOT", githubAuthority: "NONE", providerAuthority: "NONE" },
    spend: { maxUsd: 1, enforcement: "OBSERVATION_ONLY" },
    teardown: { terminateOnEveryTerminalState: true, verifyResourceAbsent: true, supportsResume: false },
    preview: { mode: "DISABLED" },
    readiness: { state: "DEGRADED", checkedAt: now, reason: "Synthetic offline fixture", liveCertified: true, egressEnforcementProven: true },
    dockerQualification: {
      schema: "factory-docker-qualification/v1", imageDigest,
      toolchainDigest: `sha256:${"a".repeat(64)}`, evidencePacketReference: "OFFLINE_FIXTURE",
      evidencePacketDigest: `sha256:${"b".repeat(64)}`, bridgeProtocol: "docker-attach-framed/v1", harness: "codex/bedrock-v1",
      containment: { network: "DOCKER_NETWORK_NONE", readOnlyRoot: true, uid: 10001, gid: 10001,
        noNewPrivileges: true, capabilities: "DROP_ALL", hostMounts: "NONE", credentials: "NONE" },
      supportedWorkloadClasses: ["SOFTWARE_CHANGE"], supportedRiskClasses: ["GREEN"],
      workloadTimeouts: [{ workloadClass: "SOFTWARE_CHANGE", maxRuntimeMs: 60_000 }],
    },
  };
}
