import { describe, expect, it } from "vitest";
import {
  LEGACY_ISOLATED_INVOCATION_EFFECTIVE_CONFIG as ISOLATED_INVOCATION_EFFECTIVE_CONFIG,
  LEGACY_ISOLATED_INVOCATION_MANIFEST as ISOLATED_INVOCATION_MANIFEST,
  LEGACY_ISOLATED_INVOCATION_RUNTIME_ARTIFACT as ISOLATED_INVOCATION_RUNTIME_ARTIFACT,
  ISOLATED_CONTAINER_POLICY,
  harnessCapabilityManifestDigest,
  harnessRuntimeArtifactDigest,
} from "@mission-control/workflow-engine/harness-contract";
import { executionProfileSnapshot, executionProfileDigest, executionProfileQualificationSnapshot, executionProfileQualificationDigest, executionProfileCurrentness, executionProfileCurrentnessIssues, executionProfileIssues } from "../lib/executionProfile";
import { isolatedSandboxAdmission, isolatedSandboxDigest, ISOLATED_SANDBOX_ADMISSION_SCHEMA, type IsolatedSandboxSnapshot } from "../lib/isolatedSandbox";
import { computeCanonicalHash } from "../lib/genomeHash";
import type { OfflineExecutionPolicy } from "../lib/offlineExecutionPolicy";
import { offlineExecutionManifestSnapshot } from "../lib/executionManifest";
import { RENDER_MARKDOWN_OPERATION_DIGEST, canonicalIsolatedInvocation } from "@mission-control/workflow-engine/harness-contract";
import { offlineAttemptSourceCurrentnessIssues } from "../lib/factoryAttempt";
import { factoryWorkloadClassForPurpose, validFactoryExecutionBinding } from "../lib/factoryConfiguration";
import { loadExecutionProfileAdmission } from "../lib/executionProfileAdmission";

const sha = `sha256:${"a".repeat(64)}`;
function fixture() {
  const sandboxSnapshot: IsolatedSandboxSnapshot = {
    schema: "factory-sandbox-profile/v2", provider: "LOCAL_CONTAINER", profileKey: "isolated-control", version: 1,
    imageDigest: ISOLATED_INVOCATION_RUNTIME_ARTIFACT.imageDigest!, bridgeDigest: ISOLATED_INVOCATION_EFFECTIVE_CONFIG.bridgeImplementationDigest, backendDigest: ISOLATED_INVOCATION_EFFECTIVE_CONFIG.backendImplementationDigest,
    isolationPolicy: ISOLATED_CONTAINER_POLICY, qualification: { evidenceReference: "offline-control-evidence", evidenceDigest: sha, validUntil: 10000 },
  };
  const admission = isolatedSandboxAdmission(sandboxSnapshot, "reviewer", 1000);
  const sandbox = { _id: "sandbox-id", projectId: "project-1", tenantId: "tenant-1", immutableSnapshot: sandboxSnapshot, profileDigest: isolatedSandboxDigest(sandboxSnapshot),
    admissionState: "OFFLINE_ELIGIBLE", admissionSnapshot: admission, admissionDigest: `sha256:${computeCanonicalHash({ namespace: ISOLATED_SANDBOX_ADMISSION_SCHEMA, value: admission })}`,
    promotedBy: "reviewer", promotedAt: 1000, status: "ACTIVE", readinessState: "READY", readinessExpiresAt: 10000 };
  const policy: OfflineExecutionPolicy = {
    schema: "factory-offline-execution-policy/v1",
    bridge: { id: "isolated-invocation", version: "1", implementationDigest: ISOLATED_INVOCATION_EFFECTIVE_CONFIG.bridgeImplementationDigest, invocationSchema: "factory-isolated-invocation/v2", resultSchema: "factory-isolated-result/v2" },
    backend: { id: "docker-chroot-offline", version: "1", implementationDigest: ISOLATED_INVOCATION_EFFECTIVE_CONFIG.backendImplementationDigest, environment: "LOCAL_CONTAINER" },
    isolation: { profileId: sandbox._id, profileDigest: sandbox.profileDigest, evidenceDigest: sha, admissionDigest: sandbox.admissionDigest, qualifiedAt: 1000, validUntil: 10000 },
    transmission: { schema: "factory-transmission-policy/v1", mode: "DENY_ALL", destinations: [], credentialClasses: [], maxOutboundBytes: 0 },
    budget: { schema: "factory-provider-budget/v1", mode: "NO_PROVIDER_EXECUTION", maxProviderCalls: 0, maxProviderLiabilityUsd: 0 }, capabilities: ["render-markdown", "synthetic-receipt"],
  };
  const manifest = ISOLATED_INVOCATION_MANIFEST;
  const profile = executionProfileSnapshot({ profileKey: "offline-control", version: 1,
    harness: { adapter: "isolated-invocation", version: "1", capabilityManifest: manifest, capabilityManifestDigest: harnessCapabilityManifestDigest(manifest), effectiveConfigSha256: manifest.effectiveConfigSha256 },
    runtimeArtifact: { snapshot: ISOLATED_INVOCATION_RUNTIME_ARTIFACT, digest: harnessRuntimeArtifactDigest(ISOLATED_INVOCATION_RUNTIME_ARTIFACT) },
    executionBackend: "isolated-container", offlinePolicy: policy,
    sandboxProfile: { profileId: sandbox._id, profileDigest: sandbox.profileDigest, profileSnapshot: sandboxSnapshot }, isolationModes: ["WORKSPACE_WRITE"],
  });
  const profileDigest = executionProfileDigest(profile);
  const qualification = executionProfileQualificationSnapshot({ profileId: "profile-id", profileSnapshot: profile, profileDigest,
    workloadClasses: ["SOFTWARE_CHANGE"], riskClasses: ["GREEN"], evidenceReference: "composition-control-evidence", evidenceDigest: sha,
    approvedBy: "reviewer", approvedAt: 1500, validUntil: 9000 });
  const record = { _id: "profile-id", projectId: "project-1", tenantId: "tenant-1", profileKey: profile.profileKey, version: profile.version, profileDigest, immutableSnapshot: profile,
    executor: { adapter: "isolated-invocation", version: "1" }, harnessCapabilityManifest: manifest,
    harnessCapabilityManifestDigest: profile.harness.capabilityManifestDigest, harnessEffectiveConfigSha256: manifest.effectiveConfigSha256,
    harnessRuntimeArtifact: ISOLATED_INVOCATION_RUNTIME_ARTIFACT, harnessRuntimeArtifactDigest: profile.runtimeArtifact.digest,
    executionBackend: "isolated-container", sandboxProfileId: sandbox._id, sandboxProfileDigest: sandbox.profileDigest,
    isolationModes: profile.isolationModes, requiredHarnessCapabilities: profile.requiredHarnessCapabilities, requiredSandboxCapabilities: profile.requiredSandboxCapabilities,
    enabled: true, qualificationStatus: "EVIDENCE_QUALIFIED", admissionStatus: "OFFLINE_ELIGIBLE", qualificationSnapshot: qualification,
    qualificationDigest: executionProfileQualificationDigest(qualification), qualificationExpiresAt: 9000, promotedBy: "reviewer", promotedAt: 1500 };
  return { profile, record, sandbox };
}

describe("versioned offline Execution Profile", () => {
  it("constructs frozen manifest data with no route or execution authority", async () => {
    const { profile, record, sandbox } = fixture();
    const operation = { reference: "render-markdown/v1", digest: RENDER_MARKDOWN_OPERATION_DIGEST,
      input: { title: "Synthetic", paragraphs: ["Synthetic content."], outputPath: "docs/synthetic.md" } };
    const plan = { _id: "plan-1", tenantId: "tenant-1", missionId: "mission-1", projectId: "project-1", revisionNumber: 1,
      status: "APPROVED", approvedBy: "synthetic-operator", approvedAt: 1000 };
    const input = {
      runId: "attempt-1", missionId: "mission-1", missionPlanId: "plan-1", missionPlanVersion: 1, missionPlanDigest: `sha256:${computeCanonicalHash(plan)}`,
      budgetReservationId: "attempt-1", workOrderId: "work-order-1", workOrderRevisionNumber: 1, workOrderRevisionId: "revision-1",
      taskId: "task-1", task: { title: "Synthetic task" }, factoryDefinitionVersionId: "factory-version-1", factoryConfigurationDigest: "factory-v1-deadbeef",
      factoryPurpose: "SOFTWARE" as const, repositoryId: "repository-1", repository: "synthetic/qualification", repositoryDataClassification: "PUBLIC" as const,
      defaultBranch: "main", baseSha: "a".repeat(40), planningRepositorySha: "a".repeat(40), branch: "codex/synthetic", worktree: "/synthetic/worktree",
      executor: { adapter: record.executor.adapter, version: record.executor.version, capabilityManifest: record.harnessCapabilityManifest,
        capabilityManifestSha256: record.harnessCapabilityManifestDigest, effectiveConfigSha256: record.harnessEffectiveConfigSha256,
        runtimeArtifact: record.harnessRuntimeArtifact, runtimeArtifactDigest: record.harnessRuntimeArtifactDigest },
      executionBackend: "isolated-container", executionProfile: { profileId: record._id, profileKey: record.profileKey, version: record.version,
        profileDigest: record.profileDigest, profileSnapshot: profile, qualificationDigest: record.qualificationDigest, qualificationSnapshot: record.qualificationSnapshot },
      sandboxProfile: { isolation: "WORKSPACE_WRITE" as const, requiredCapabilities: ["git-worktree", "workspace-write", ...profile.requiredSandboxCapabilities] },
      workflow: { workflowId: "synthetic-render", version: 1, name: "Synthetic render", description: "Synthetic workload", active: true,
        contractVersion: "factory-workflow-contract/v2", agents: [], steps: [{ id: "render", kind: "DETERMINISTIC", agent: "", retryLimit: 0,
          input: JSON.stringify(operation), timeoutMinutes: 1, outputSchema: { type: "object", required: ["status"], properties: { status: { type: "string" } } } }] },
      workOrder: { title: "Synthetic", desiredOutcome: "Synthetic output", acceptanceCriteria: [{ id: "criterion-1", title: "Independent document check" }], riskLevel: "LOW" },
      agentBindings: [], codeScopes: [{ id: "scope-1", slug: "docs", includePaths: ["docs/**"], excludePaths: [] }],
      allowedTools: [], maxAttempts: 1, maxCostUsd: 1, maxRuntimeMinutes: 1, initialContext: {},
    };
    const frozen = offlineExecutionManifestSnapshot(input);
    const completeBinding: any = { executionBackend: "isolated-container", sandboxProfileId: sandbox._id,
      sandboxProfileDigest: sandbox.profileDigest, riskBoundary: "GREEN", recovery: { cancel: true, retry: true, pause: false, resume: false },
      offlineAdmission: { profile: record, sandboxProfile: sandbox, workflow: input.workflow, repositoryDataClassification: "PUBLIC", now: 2000,
        projectId: "project-1", tenantId: "tenant-1", purpose: "SOFTWARE", agentBindings: [], deterministicOperation: operation,
        projection: { ...record, profileId: record._id, profileVersion: record.version, profileSnapshot: profile,
          sandboxProfileSnapshot: sandbox.immutableSnapshot } } };
    expect(validFactoryExecutionBinding(completeBinding)).toBe(true);
    expect(validFactoryExecutionBinding({ ...completeBinding, offlineAdmission: undefined })).toBe(false);
    expect(factoryWorkloadClassForPurpose("SOFTWARE")).toBe("SOFTWARE_CHANGE");
    expect(factoryWorkloadClassForPurpose("VERIFICATION")).toBe("VERIFICATION");
    expect(factoryWorkloadClassForPurpose("INTELLIGENT_AUTOMATION")).toBe("AUTOMATION");
    const mutations: Array<(value: any) => void> = [
      value => { value.offlineAdmission.purpose = "VERIFICATION"; },
      value => { value.offlineAdmission.agentBindings = [{ workflowAgentId: "agent" }]; },
      value => { value.offlineAdmission.deterministicOperation.input.title = "Substituted"; },
      value => { value.offlineAdmission.profile.projectId = "other"; },
      value => { value.offlineAdmission.sandboxProfile.tenantId = "other"; },
      value => { value.offlineAdmission.profile.enabled = false; },
      value => { value.offlineAdmission.profile.admissionStatus = "REVOKED"; },
      value => { value.offlineAdmission.now = 9000; },
      value => { value.offlineAdmission.profile.qualificationDigest = sha; },
      value => { value.offlineAdmission.profile.qualificationStatus = "UNQUALIFIED"; },
      value => { value.offlineAdmission.sandboxProfile.admissionDigest = sha; },
      value => { value.offlineAdmission.sandboxProfile.status = "REVOKED"; },
      value => { value.offlineAdmission.projection.harnessRuntimeArtifactDigest = sha; },
      value => { value.offlineAdmission.projection.modelRouteDigest = sha; },
      value => { value.offlineAdmission.profile.modelCatalogId = "route"; },
      value => { value.offlineAdmission.workflow.steps[0].kind = "AGENT"; },
      value => { value.offlineAdmission.repositoryDataClassification = "CONFIDENTIAL"; },
      value => { value.riskBoundary = "YELLOW"; },
      value => { value.recovery.pause = true; },
      value => { value.sandboxProfileId = "other"; },
      value => { value.offlineAdmission.profile.immutableSnapshot.offlinePolicy.bridge.implementationDigest = sha; },
      value => { value.offlineAdmission.profile.immutableSnapshot.offlinePolicy.backend.implementationDigest = sha; },
    ];
    for (const mutate of mutations) { const invalid = structuredClone(completeBinding); mutate(invalid); expect(validFactoryExecutionBinding(invalid)).toBe(false); }
    const admission = await loadExecutionProfileAdmission({ db: { get: async (id: string) => id === record._id ? record : id === sandbox._id ? sandbox : null } } as any, record._id as any, 2000);
    expect(admission.blockers).toEqual([]);
    expect(admission.eligible).toBe(true);
    expect(frozen.manifest.version).toBe("factory-execution-manifest/v4");
    expect(frozen.manifest.workflow.steps[0].operation).toEqual(operation);
    expect(frozen.manifest.inferenceConstraint).toEqual({ schema: "factory-inference-constraint/v1", mode: "DENIED" });
    expect(frozen.manifest).not.toHaveProperty("modelRoute");
    const profileFields = { executionProfileId: record._id, executionProfileKey: record.profileKey, executionProfileVersion: record.version,
      executionProfileDigest: record.profileDigest, executionProfileSnapshot: profile,
      executionProfileQualificationDigest: record.qualificationDigest, executionProfileQualificationSnapshot: record.qualificationSnapshot };
    const current = {
      run: { ...profileFields, _id: "attempt-record-1", tenantId: "tenant-1", workflowId: input.workflow.workflowId, runId: input.runId, projectId: "project-1", repositoryId: input.repositoryId, parentTaskId: input.taskId,
        workOrderId: input.workOrderId, factoryDefinitionVersionId: input.factoryDefinitionVersionId,
        factoryConfigurationDigest: input.factoryConfigurationDigest, executionManifest: frozen.manifest, executionManifestDigest: frozen.digest,
        status: "RUNNING", lease: { leaseId: "lease-1", ownerId: "owner-1", workerId: "worker-1", workerSessionId: "session-1",
          workerGeneration: 1, claimedAt: 1000, heartbeatAt: 1000, expiresAt: 5000 } },
      workOrder: { _id: input.workOrderId, tenantId: "tenant-1", riskLevel: "LOW", planningRepositorySha: input.baseSha, projectId: "project-1", repositoryId: input.repositoryId,
        currentExecutionRunId: "attempt-record-1",
        currentRevisionNumber: 1, currentRevisionId: input.workOrderRevisionId, state: "IN_PROGRESS", missionId: "mission-1", missionPlanId: "plan-1" },
      task: { _id: input.taskId, tenantId: "tenant-1", workOrderId: input.workOrderId, projectId: "project-1", title: input.task.title, status: "IN_PROGRESS" },
      plan, mission: { _id: "mission-1", tenantId: "tenant-1", projectId: "project-1", state: "IN_PROGRESS", currentPlanId: "plan-1" },
      repository: { _id: input.repositoryId, tenantId: "tenant-1", projectId: "project-1", repository: input.repository, status: "READY", dataClassification: "PUBLIC" },
      factoryDefinition: { _id: "factory-1", tenantId: "tenant-1", projectId: "project-1", activeVersionId: input.factoryDefinitionVersionId, status: "ACTIVE" },
      factoryVersion: { ...profileFields, _id: input.factoryDefinitionVersionId, tenantId: "tenant-1", factoryDefinitionId: "factory-1", projectId: "project-1", repositoryId: input.repositoryId,
        configurationDigest: input.factoryConfigurationDigest, workflowId: "workflow-record-1", executionBackend: "isolated-container",
        purpose: "SOFTWARE", riskBoundary: "GREEN", agentBindings: [],
        inferenceConstraint: { schema: "factory-inference-constraint/v1", mode: "DENIED" }, deterministicOperation: operation },
      workflow: { ...input.workflow, _id: "workflow-record-1" }, leaseId: "lease-1", ownerId: "owner-1",
      worker: { workerId: "worker-1", sessionId: "session-1", generation: 1 }, now: 2000,
    };
    expect(offlineAttemptSourceCurrentnessIssues(current)).toEqual([]);
    const verifierCurrent = {
      ...current,
      run: {
        ...current.run,
        _id: "verification-attempt-1",
        attemptPurpose: "VERIFICATION",
        factoryPurpose: "VERIFICATION",
        verificationAttemptBinding: { sourceAttemptId: current.run._id },
      },
      sourceAttempt: { ...current.run, status: "COMPLETED", attemptPurpose: "IMPLEMENTATION", executionBaseSha: input.baseSha },
      workOrder: { ...current.workOrder, currentExecutionRunId: "verification-attempt-1", state: "AWAITING_VERIFICATION" },
    };
    expect(offlineAttemptSourceCurrentnessIssues(verifierCurrent).filter(issue => issue === "WORK_ORDER_NOT_CURRENT")).toEqual([]);
    expect(offlineAttemptSourceCurrentnessIssues({
      ...verifierCurrent,
      run: { ...verifierCurrent.run, verificationAttemptBinding: { sourceAttemptId: "other-attempt" } },
    })).toContain("WORK_ORDER_NOT_CURRENT");
    const request = canonicalIsolatedInvocation(current.run);
    expect(request).toMatchObject({ attemptId: current.run._id, executionId: `${current.run.runId}:lease-1`,
      taskId: input.taskId, workOrderId: input.workOrderId, profileId: record._id, modelRoute: "NONE", transmission: "NONE" });
    for (const changed of [{ parentTaskId: "wrong-task" }, { executionProfileDigest: sha },
      { executionManifestDigest: sha }, { workOrderId: "wrong-work-order" }, { lease: { ...current.run.lease, workerGeneration: 0 } }]) {
      expect(() => canonicalIsolatedInvocation({ ...current.run, ...changed })).toThrow();
    }
    for (const changed of [
      { now: 5000 }, { leaseId: "other-lease" }, { worker: { ...current.worker, generation: 2 } },
      { run: { ...current.run, status: "CANCELED" } }, { run: { ...current.run, status: "COMPLETED" } },
      { run: { ...current.run, cancellationRequestedAt: 1500 } }, { run: { ...current.run, tenantId: "other-tenant" } },
      { workOrder: { ...current.workOrder, currentRevisionNumber: 2 } }, { workOrder: { ...current.workOrder, currentExecutionRunId: "replacement-attempt" } }, { task: { ...current.task, workOrderId: "other-work-order" } },
      { task: { ...current.task, title: "Changed instructions" } }, { plan: { ...plan, status: "SUPERSEDED" } },
      { task: { ...current.task, status: "BLOCKED" } }, { run: { ...current.run, tenantId: undefined } },
      { repository: { ...current.repository, dataClassification: "CONFIDENTIAL" } },
      { run: { ...current.run, executionProfileDigest: "wrong-profile" } },
      { mission: { ...current.mission, currentPlanId: "other-plan" } }, { workflow: { ...current.workflow, version: 2 } },
      { factoryVersion: { ...current.factoryVersion, modelQualificationDigest: sha } },
      { factoryDefinition: { ...current.factoryDefinition, activeVersionId: "other-version" } },
    ]) expect(offlineAttemptSourceCurrentnessIssues({ ...current, ...changed })).not.toEqual([]);
    // Recompute a forged manifest digest so these exercise joins, not just hash rejection.
    for (const mutate of [
      (value: any) => { value.repository.repositoryId = "other-repository"; },
      (value: any) => { value.workflow.workflowId = "other-workflow"; },
      (value: any) => { value.workflow.steps[0].operation.input.title = "Substituted"; },
      (value: any) => { value.executionProfile.profileId = "other-profile"; },
    ]) {
      const changed = structuredClone(frozen.manifest); mutate(changed);
      expect(offlineAttemptSourceCurrentnessIssues({ ...current, run: { ...current.run, executionManifest: changed,
        executionManifestDigest: `sha256:${computeCanonicalHash(changed)}` } })).not.toEqual([]);
    }
    expect(offlineExecutionManifestSnapshot({ ...input, taskId: "task-2" }).digest).not.toBe(frozen.digest);
    for (const changed of [{ taskId: undefined }, { missionPlanDigest: undefined }, { budgetReservationId: "" },
      { repositoryDataClassification: "CONFIDENTIAL" }, { agentBindings: [{}] }, { allowedTools: ["shell"] },
      { modelRoute: { provider: "fake" } }, { routedModel: "fake" }, { planningRepositorySha: "b".repeat(40) },
      { executor: { ...input.executor, runtimeArtifactDigest: `sha256:${"f".repeat(64)}` } },
      { executionProfile: { ...input.executionProfile, profileDigest: `sha256:${"f".repeat(64)}` } },
      { workOrder: { ...input.workOrder, dataBoundaries: [{}] } }]) {
      expect(() => offlineExecutionManifestSnapshot({ ...input, ...changed } as any)).toThrow();
    }
  });
  it("uses existing qualification and currentness with explicitly denied inference", () => {
    const { profile, record, sandbox } = fixture();
    expect(profile.schema).toBe("factory-execution-profile/v2");
    expect(profile.modelRoute).toEqual({ schema: "factory-inference-constraint/v1", mode: "DENIED" });
    expect(executionProfileCurrentness(record, 2000).eligible).toBe(true);
    expect(executionProfileCurrentnessIssues({ profile: record, modelRoute: null, sandboxProfile: sandbox, now: 2000 })).toEqual([]);
    expect(executionProfileCurrentness({ ...record, admissionStatus: "PRODUCTION_PILOT_ELIGIBLE" }, 2000).eligible).toBe(false);
  });
  it("rejects stale/revoked qualifications and substitutions", () => {
    const { profile, record, sandbox } = fixture();
    expect(executionProfileCurrentness(record, 9001).eligible).toBe(false);
    expect(executionProfileCurrentness({ ...record, revokedAt: 1900 }, 2000).eligible).toBe(false);
    for (const key of ["bridge", "backend", "isolation", "transmission", "budget", "capabilities"] as const) {
      const changed = structuredClone(profile);
      (changed.offlinePolicy as any)[key] = {};
      expect(executionProfileIssues(changed).length).toBeGreaterThan(0);
    }
    expect(executionProfileCurrentnessIssues({ profile: record, modelRoute: null, sandboxProfile: { ...sandbox, profileDigest: `sha256:${"b".repeat(64)}` }, now: 2000 })).toContain("EXECUTION_PROFILE_SANDBOX_MISMATCH");
    expect(executionProfileCurrentnessIssues({ profile: record, modelRoute: { _id: "unrequested-route" }, sandboxProfile: sandbox, now: 2000 })).toContain("EXECUTION_PROFILE_MODEL_ROUTE_MISMATCH");
  });
  it("rejects internally consistent but unregistered implementation substitutions", () => {
    const { profile } = fixture();
    for (const component of ["bridge", "backend"] as const) {
      const changed = structuredClone(profile);
      const policy = changed.offlinePolicy!;
      policy[component].implementationDigest = sha;
      const sandbox = changed.sandboxProfile!;
      (sandbox.profileSnapshot as any)[`${component}Digest`] = sha;
      sandbox.profileDigest = isolatedSandboxDigest(sandbox.profileSnapshot);
      policy.isolation.profileDigest = sandbox.profileDigest;
      expect(executionProfileIssues(changed)).toContain("isolated-implementation-unregistered");
    }
    for (const component of ["bridge", "backend"] as const) {
      for (const field of ["id", "version"] as const) {
        const changed = structuredClone(profile);
        changed.offlinePolicy![component][field] = "substituted";
        expect(executionProfileIssues(changed)).toContain("isolated-implementation-unregistered");
      }
    }
  });
  it("invalidates qualification when the same sandbox receives a different admission", () => {
    const { record, sandbox } = fixture();
    for (const [actor, promotedAt] of [["other-reviewer", 1000], ["reviewer", 1600]] as const) {
      const admission = isolatedSandboxAdmission(sandbox.immutableSnapshot, actor, promotedAt);
      const renewed = { ...sandbox, promotedBy: actor, promotedAt, admissionSnapshot: admission,
        admissionDigest: `sha256:${computeCanonicalHash({ namespace: ISOLATED_SANDBOX_ADMISSION_SCHEMA, value: admission })}` };
      expect(executionProfileCurrentnessIssues({ profile: record, modelRoute: null, sandboxProfile: renewed, now: 2000 }))
        .toContain("EXECUTION_PROFILE_SANDBOX_MISMATCH");
    }
  });
});
