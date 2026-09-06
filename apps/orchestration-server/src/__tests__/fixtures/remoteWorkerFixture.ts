import { CODEX_V1_HARNESS_MANIFEST, harnessCapabilityManifestDigest } from "@mission-control/workflow-engine";
import { sandboxProfileDigest, stableSandboxResourceName, type SandboxProfileSnapshot } from "../../sandboxProvider.js";
const fakeImageDigest = `sha256:${"e".repeat(64)}`;
const fakeImage = `fake:test@${fakeImageDigest}`;
export function profile(): SandboxProfileSnapshot {
  return {
    schema: "factory-sandbox-profile/v1", profileKey: "fake-standard", version: 1, provider: "FAKE",
    providerProfile: "deterministic", providerProfileVersion: "v1", machine: { image: fakeImage, cpu: 2, memoryMb: 4_096, diskGb: 20 },
    supervisor: { version: "mission-control-supervisor/v1", transport: "SSH" },
    runtime: { maxRuntimeMs: 60_000, resultPollIntervalMs: 250, resultRetentionMs: 86_400_000 },
    network: { egress: "UNRESTRICTED", egressAllowlist: [], publicIngress: false, exposedPorts: [] },
    credentials: { inference: "ATTEMPT_SCOPED_OPENROUTER", repositoryAccess: "CONTROL_PLANE_SNAPSHOT", githubAuthority: "NONE", providerAuthority: "NONE" },
    spend: { maxUsd: 1, enforcement: "PROVIDER_KEY_LIMIT" }, teardown: { terminateOnEveryTerminalState: true, verifyResourceAbsent: true, supportsResume: false },
    preview: { mode: "DISABLED" }, readiness: { state: "DEGRADED", checkedAt: Date.now(), reason: "Deterministic fake provider", egressEnforcementProven: false },
  };
}

export function executionManifest(selectedProfile: SandboxProfileSnapshot, baseSha: string, worktree: string) {
  const resourceName = stableSandboxResourceName({ projectId: "project-1", workflowRunId: "factory-run-remote", attemptId: "factory-run-remote" });
  return {
    version: "factory-execution-manifest/v1",
    causation: {
      workOrderId: "work-order-1", workOrderRevisionNumber: 1, workflowRunId: "factory-run-remote",
      factoryDefinitionVersionId: "factory-version-1", factoryConfigurationDigest: "factory-v1-test", factoryPurpose: "SOFTWARE",
    },
    harness: {
      adapter: "codex",
      version: "v1",
      harnessId: "codex-cli",
      harnessVersion: "0.146.0",
      harnessCommit: "e363b08c9175ac1cbe5893615dd2cb9ddf95043b",
      capabilityManifest: CODEX_V1_HARNESS_MANIFEST,
      capabilityManifestSha256: harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST),
      effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
      provider: "openai",
      model: "gpt-5",
      modelRouteSnapshot: {
        schema: "factory-model-route/v1",
        runtimeIdentity: { kind: "CODEX_CLI", cliVersion: "0.146.0", imageDigest: fakeImageDigest },
      },
      isolation: "WORKSPACE_WRITE",
      executionBackend: "remote-sandbox",
      requiredCapabilities: ["git-worktree", "workspace-write", "remote-sandbox", "sandbox-provider:exe-dev"],
      requiredHarnessCapabilities: [],
      pullRequestAuthority: "CONTROL_PLANE_ONLY", timeoutMs: 60_000,
    },
    retryPolicy: {
      schema: "factory-remote-retry-policy/v1",
      maxAttempts: 3,
      maxTotalWallClockMs: 300_000,
      maxModelSpendUsd: 3,
      maxProviderResources: 1,
      retryableFailureClasses: ["RETRYABLE_INFRA", "RETRYABLE_EXECUTION"],
      failClosedFailureClasses: ["NON_RETRYABLE_RESULT", "UNKNOWN"],
    },
    repository: { baseSha, worktree, allowedPaths: ["src/**"], excludedPaths: [] },
    sandbox: {
      resourceName, profileId: "sandbox-profile-1", profileDigest: sandboxProfileDigest(selectedProfile), profileSnapshot: selectedProfile,
      supervisorVersion: "mission-control-supervisor/v1",
      credentialGrants: [{ kind: "INFERENCE", secretValueIncluded: false, githubAuthority: "NONE", providerAuthority: "NONE" }],
      resultContract: { schema: "factory-sandbox-result/v1", independentHostValidationRequired: true },
      teardown: { credentialsRevokedBeforePublication: true, resourceAbsenceRequiredBeforePublication: true },
    },
    workflow: { steps: [{ modelRoute: "gpt-5" }] },
    compiledPrompt: "Implement the approved remote sandbox change.",
    intent: { title: "Remote sandbox worker fixture", acceptanceCriterionIds: ["ac-remote"] },
    workOrderSpecification: {
      riskLevel: "MEDIUM", riskReasons: ["Bounded source change"], requiredApprovals: [],
      acceptanceCriteria: [{ id: "ac-remote", title: "Remote change is independently verified", requiredEvidence: [{ category: "TEST_RESULT", minimumCount: 1, independent: true }] }],
      negativeConstraints: [],
      changeBudget: { maxFilesChanged: 1, maxLinesChanged: 2, allowedPaths: ["src/**"], deniedPaths: [], allowedCommandClasses: ["TEST"], prohibitedCommandClasses: ["PUBLISH"], allowDependencyChanges: false, allowSchemaChanges: false, allowMigrations: false, allowInfrastructureChanges: false },
      verificationContract: {
        schemaVersion: 1, enforcementMode: "ENFORCED", requireHumanReview: false,
        checks: [{ id: "remote-test", name: "Remote deterministic test", category: "UNIT_TEST", verifierId: "factory-command/v1", mandatory: true, acceptanceCriterionIds: ["ac-remote"], evidenceCategory: "TEST_RESULT", command: { executable: "node", args: ["-e", "console.log('verified')"], commandClass: "TEST", timeoutMs: 5_000 } }],
      },
    },
  };
}
