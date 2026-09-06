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
} from "../../lib/modelRouteAdmission";
import {
  executionProfileDigest,
  executionProfileQualificationDigest,
  executionProfileQualificationSnapshot,
  executionProfileSnapshot,
} from "../../lib/executionProfile";
import { buildFactoryExecutionManifest } from "../../lib/executionManifest";
import { factoryConfigurationDigest } from "../../lib/factoryConfiguration";
import { computeCanonicalHash } from "../../lib/genomeHash";

/**
 * Synthetic offline authority records built with the real canonical constructors.
 * The known harness/runtime identities are frozen dependencies, not evidence that
 * this selected provider route has executed. Caller-supplied IDs let the same
 * fixture exercise real admission against an isolated Convex database.
 *
 * The returned version/run bindings are partial rows. Workflow and agent IDs are
 * explicit fixture identities; callers can supply allocated causation IDs.
 */
export function classifyAuthorityRecords(input: {
  projectId: string;
  repositoryId: string;
  profileId: string;
  modelCatalogId: string;
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
    schema: "classify-authority-fixture/v1", kind, ...input,
  })}`;
  const createdAt = input.now - 1_000;
  const workloadClasses = input.workloadClasses ?? ["SOFTWARE_CHANGE"];
  const riskClasses: Array<"GREEN" | "YELLOW" | "RED"> = input.riskClasses ?? ["GREEN"];
  const manifest = structuredClone(CODEX_V1_HARNESS_MANIFEST);
  const artifact = structuredClone(CODEX_V1_RUNTIME_ARTIFACT);
  const manifestDigest = harnessCapabilityManifestDigest(manifest);
  const runtimeDigest = harnessRuntimeArtifactDigest(artifact);
  const routeSnapshot = exactModelRouteSnapshot({
    provider: "openai", providerRoute: "openai-chat-completions",
    modelId: "gpt-4o-mini-2024-07-18", reasoningConfig: { maxTokens: 1024 },
  });
  const routeDigest = exactModelRouteDigest(routeSnapshot);
  const routeQualification = exactModelRouteQualificationSnapshot({
    routeDigest, evidenceReference: "offline-fixture://classify/model-route",
    evidenceDigest: evidenceDigest("model-route"),
    workloadClasses, riskClasses,
    repositoryIds: input.qualifiedRepositoryIds ?? [input.repositoryId],
    promotedBy: "synthetic-fixture-route-reviewer", promotedAt: createdAt,
    compatibility: {
      adapter: "codex", version: "v1", capabilityManifestDigest: manifestDigest,
      effectiveConfigSha256: manifest.effectiveConfigSha256,
      runtimeArtifactDigest: runtimeDigest, executionBackend: "persistent-worker",
    },
  });
  const routeQualificationDigest = modelRouteQualificationDigest(routeQualification);
  const profileSnapshot = executionProfileSnapshot({
    profileKey: "classify-authority-fixture", version: 1,
    harness: {
      adapter: "codex", version: "v1", capabilityManifest: manifest,
      capabilityManifestDigest: manifestDigest, effectiveConfigSha256: manifest.effectiveConfigSha256,
    },
    runtimeArtifact: { snapshot: artifact, digest: runtimeDigest },
    executionBackend: "persistent-worker",
    modelRoute: {
      catalogId: input.modelCatalogId, routeSnapshot, routeDigest,
      qualificationSnapshot: routeQualification, qualificationDigest: routeQualificationDigest,
    },
    isolationModes: ["READ_ONLY"],
  });
  const profileDigest = executionProfileDigest(profileSnapshot);
  const qualificationSnapshot = executionProfileQualificationSnapshot({
    profileId: input.profileId, profileSnapshot, profileDigest,
    workloadClasses, riskClasses,
    evidenceReference: "offline-fixture://classify/execution-profile",
    evidenceDigest: evidenceDigest("execution-profile"),
    approvedBy: "synthetic-fixture-profile-reviewer", approvedAt: createdAt,
    validUntil: input.now + 60_000,
  });
  const qualificationDigest = executionProfileQualificationDigest(qualificationSnapshot);
  const harnessBindings = {
    executor: { adapter: "codex", version: "v1" },
    harnessCapabilityManifest: manifest, harnessCapabilityManifestDigest: manifestDigest,
    harnessEffectiveConfigSha256: manifest.effectiveConfigSha256,
    harnessRuntimeArtifact: artifact, harnessRuntimeArtifactDigest: runtimeDigest,
    executionBackend: "persistent-worker" as const,
  };
  const profile = {
    projectId: input.projectId, profileKey: profileSnapshot.profileKey, version: 1,
    profileDigest, immutableSnapshot: profileSnapshot, ...harnessBindings,
    modelCatalogId: input.modelCatalogId, modelRouteDigest: routeDigest,
    modelQualificationDigest: routeQualificationDigest,
    isolationModes: profileSnapshot.isolationModes,
    requiredHarnessCapabilities: profileSnapshot.requiredHarnessCapabilities,
    requiredSandboxCapabilities: profileSnapshot.requiredSandboxCapabilities,
    registrationIdempotencyKey: "classify-authority-fixture-registration",
    enabled: true, qualificationStatus: "EVIDENCE_QUALIFIED" as const,
    admissionStatus: "PRODUCTION_PILOT_ELIGIBLE" as const,
    qualificationSnapshot, qualificationDigest,
    qualificationExpiresAt: qualificationSnapshot.validUntil,
    qualificationIdempotencyKey: "classify-authority-fixture-qualification",
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
      adapter: "codex", version: "v1", capabilityManifest: manifest,
      capabilityManifestSha256: manifestDigest, effectiveConfigSha256: manifest.effectiveConfigSha256,
      runtimeArtifact: artifact, runtimeArtifactDigest: runtimeDigest,
    },
    executionBackend: "persistent-worker", modelRoute: profileSnapshot.modelRoute,
    executionProfile: {
      profileId: input.profileId, profileKey: profileSnapshot.profileKey, version: 1,
      profileDigest, profileSnapshot, qualificationDigest, qualificationSnapshot,
    },
    sandboxProfile: { isolation: "READ_ONLY", requiredCapabilities: profileSnapshot.requiredSandboxCapabilities },
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
      model: { provider: routeSnapshot.provider, modelId: routeSnapshot.modelId, maxTokens: 1024 },
    }],
    codeScopes: [], allowedTools: [], ...budget, initialContext: { synthetic: true },
  });
  const runBindings = {
    projectId: input.projectId, repositoryId: input.repositoryId, ...profileBindings,
    executorAdapter: "codex", executorVersion: "v1", factoryConfigurationDigest: configurationDigest,
    executionManifest: executionManifest.manifest, executionManifestDigest: executionManifest.digest,
  };
  // Model separately persisted rows so fault injection cannot mutate another
  // row's frozen evidence through a shared JavaScript object reference.
  return {
    profile: structuredClone(profile), modelRoute: structuredClone(modelRoute),
    versionBindings: structuredClone(versionBindings), runBindings: structuredClone(runBindings),
  };
}
