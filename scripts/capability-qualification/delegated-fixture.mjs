import {
  ISOLATED_INVOCATION_EFFECTIVE_CONFIG as config,
  ISOLATED_INVOCATION_MANIFEST as manifest,
  ISOLATED_INVOCATION_RUNTIME_ARTIFACT as artifact,
  ISOLATED_CONTAINER_POLICY, ISOLATED_INVOCATION_ADAPTER_ARTIFACT, RENDER_MARKDOWN_OPERATION_DIGEST,
  harnessCapabilityManifestDigest, harnessRuntimeArtifactDigest,
} from '@mission-control/workflow-engine/harness-contract';
import { executionProfileSnapshot, executionProfileDigest, executionProfileQualificationSnapshot, executionProfileQualificationDigest } from '../../convex/lib/executionProfile.ts';
import { isolatedSandboxAdmission, isolatedSandboxDigest, ISOLATED_SANDBOX_ADMISSION_SCHEMA } from '../../convex/lib/isolatedSandbox.ts';
import { computeCanonicalHash } from '../../convex/lib/genomeHash.ts';
import { factoryVersionConfigurationDigest } from '../../convex/lib/factoryConfiguration.ts';
import { qualificationEnvironmentDigest } from '../../convex/lib/factoryQualificationScope.ts';

// Only the disposable runner supplies these administration functions. This creates no installed authority.
export async function delegatedFixture({ insert, mutate, query, invoke, tenantId, projectId, ownerMemberId, operatorId, missionId, workOrderId, teamId }) {
  const now = Date.now(), until = now + 3600000, sha = `sha256:${'a'.repeat(64)}`;
  const patch = (id, value) => mutate('qualificationFixture:patch', { id, value });
  const read = id => query('qualificationFixture:read', { id });
  const repositoryId = await insert('workspaceRepositories', { tenantId, projectId, provider: 'GITHUB', repository: 'synthetic/qualification',
    displayName: 'Synthetic no-inference fixture', defaultBranch: 'main', isDefault: true, status: 'READY', webhookStatus: 'READY',
    dataClassification: 'PUBLIC', createdAt: now, updatedAt: now });
  const environmentId = await insert('environments', { tenantId, name: 'Disposable qualification', type: 'dev',
    metadata: { schema: 'factory-qualification-environment/v1', synthetic: true, projectId, repositoryId } });
  await invoke(['env', 'set', 'MC_OFFLINE_QUALIFICATION_ENVIRONMENT_ID', environmentId]);
  await insert('githubAppInstallations', { tenantId, projectId, repositoryId, installationId: 'synthetic-not-installed', appId: 'synthetic',
    accountLogin: 'synthetic', repositorySelection: 'SELECTED', permissions: [{ name: 'metadata', access: 'read' }, { name: 'contents', access: 'write' }, { name: 'pull_requests', access: 'write' }, { name: 'checks', access: 'read' }],
    subscribedEvents: ['pull_request', 'pull_request_review', 'check_run'], status: 'CONNECTED', installedAt: now, verifiedAt: now, updatedAt: now });
  const scopeId = await insert('repositoryCodeScopes', { tenantId, projectId, repositoryId, name: 'Synthetic document', slug: 'synthetic-docs',
    includePaths: ['docs/**'], excludePaths: [], requiredReviewers: [], allowedEnvironments: ['LOCAL'], active: true, createdAt: now, updatedAt: now });
  const policyEnvelopeId = await insert('policyEnvelopes', { tenantId, projectId, name: 'No provider operations', active: true, priority: 1,
    rules: { maxResourceCostUsd: 1, maxProviderCalls: 0, productionAuthority: 'NONE', publicationAuthority: 'NONE' }, createdAt: now, updatedAt: now });
  const verifierId = await insert('contextVerifiers', { projectId, label: 'Exact document bytes', invariant: 'Verify the exact synthetic document', globPatterns: ['docs/**'], active: true, createdAt: now, updatedAt: now });
  const sandboxSnapshot = { schema: 'factory-sandbox-profile/v2', provider: 'LOCAL_CONTAINER', profileKey: 'capability-qualification', version: 1,
    imageDigest: artifact.imageDigest, bridgeDigest: config.bridgeImplementationDigest, backendDigest: config.backendImplementationDigest,
    isolationPolicy: ISOLATED_CONTAINER_POLICY, qualification: { evidenceReference: 'synthetic:capability-admission-only', evidenceDigest: sha, validUntil: until } };
  const admission = isolatedSandboxAdmission(sandboxSnapshot, operatorId, now);
  const sandboxDigest = isolatedSandboxDigest(sandboxSnapshot);
  const admissionDigest = `sha256:${computeCanonicalHash({ namespace: ISOLATED_SANDBOX_ADMISSION_SCHEMA, value: admission })}`;
  const sandboxId = await insert('factorySandboxProfiles', { tenantId, projectId, profileKey: sandboxSnapshot.profileKey, version: 1,
    profileDigest: sandboxDigest, provider: 'LOCAL_CONTAINER', providerProfile: 'synthetic', providerProfileVersion: '1', machineImage: artifact.imageDigest,
    cpu: 1, memoryMb: 128, diskGb: 1, supervisorVersion: '1', executorTransport: 'STDIO', maxRuntimeMs: 60000, resultPollIntervalMs: 1000,
    resultRetentionMs: 60000, networkEgress: 'DENY_ALL', egressAllowlist: [], publicIngress: false, exposedPorts: [], inferenceCredentialMode: 'NONE',
    repositoryAccessMode: 'NONE', spendLimitUsd: 0, spendEnforcement: 'NO_PROVIDER_EXECUTION', previewMode: 'DISABLED', readinessState: 'READY',
    readinessReason: 'Synthetic admission fixture only', readinessCheckedAt: now, readinessExpiresAt: until, egressEnforcementProven: true,
    immutableSnapshot: sandboxSnapshot, admissionState: 'OFFLINE_ELIGIBLE', admissionSnapshot: admission, admissionDigest,
    promotedBy: operatorId, promotedAt: now, status: 'ACTIVE', createdBy: operatorId, createdAt: now });
  const offlinePolicy = { schema: 'factory-offline-execution-policy/v1',
    bridge: { id: 'isolated-invocation', version: '1', implementationDigest: config.bridgeImplementationDigest, invocationSchema: 'factory-isolated-invocation/v2', resultSchema: 'factory-isolated-result/v2' },
    backend: { id: 'docker-chroot-offline', version: '1', implementationDigest: config.backendImplementationDigest, environment: 'LOCAL_CONTAINER' },
    isolation: { profileId: sandboxId, profileDigest: sandboxDigest, evidenceDigest: sha, admissionDigest, qualifiedAt: now, validUntil: until },
    transmission: { schema: 'factory-transmission-policy/v1', mode: 'DENY_ALL', destinations: [], credentialClasses: [], maxOutboundBytes: 0 },
    budget: { schema: 'factory-provider-budget/v1', mode: 'NO_PROVIDER_EXECUTION', maxProviderCalls: 0, maxProviderLiabilityUsd: 0 }, capabilities: ['render-markdown', 'synthetic-receipt'] };
  const profile = executionProfileSnapshot({ profileKey: 'capability-offline', version: 1,
    harness: { adapter: 'isolated-invocation', version: '2', capabilityManifest: manifest, capabilityManifestDigest: harnessCapabilityManifestDigest(manifest), effectiveConfigSha256: manifest.effectiveConfigSha256 },
    runtimeArtifact: { snapshot: artifact, digest: harnessRuntimeArtifactDigest(artifact) }, executionBackend: 'isolated-container', offlinePolicy,
    sandboxProfile: { profileId: sandboxId, profileDigest: sandboxDigest, profileSnapshot: sandboxSnapshot }, isolationModes: ['WORKSPACE_WRITE'] });
  const digest = executionProfileDigest(profile);
  const executor = { adapter: 'isolated-invocation', version: '2' };
  const harness = { harnessCapabilityManifest: manifest, harnessCapabilityManifestDigest: profile.harness.capabilityManifestDigest,
    harnessEffectiveConfigSha256: manifest.effectiveConfigSha256, harnessRuntimeArtifact: artifact, harnessRuntimeArtifactDigest: profile.runtimeArtifact.digest };
  const profileId = await insert('factoryExecutionProfiles', { tenantId, projectId, profileKey: profile.profileKey, version: 1, profileDigest: digest,
    immutableSnapshot: profile, executor, ...harness, executionBackend: 'isolated-container', sandboxProfileId: sandboxId, sandboxProfileDigest: sandboxDigest,
    isolationModes: profile.isolationModes, requiredHarnessCapabilities: profile.requiredHarnessCapabilities, requiredSandboxCapabilities: profile.requiredSandboxCapabilities,
    registrationIdempotencyKey: 'synthetic-capability-registration', enabled: true, qualificationStatus: 'UNQUALIFIED', admissionStatus: 'DISABLED',
    createdBy: operatorId, createdAt: now, updatedAt: now });
  const qualification = executionProfileQualificationSnapshot({ profileId, profileSnapshot: profile, profileDigest: digest,
    workloadClasses: ['SOFTWARE_CHANGE'], riskClasses: ['GREEN'], evidenceReference: 'synthetic:capability-admission-only', evidenceDigest: sha,
    approvedBy: operatorId, approvedAt: now, validUntil: until });
  const qualificationDigest = executionProfileQualificationDigest(qualification);
  await patch(profileId, { qualificationStatus: 'EVIDENCE_QUALIFIED', admissionStatus: 'OFFLINE_ELIGIBLE', qualificationSnapshot: qualification,
    qualificationDigest, qualificationExpiresAt: until, promotedBy: operatorId, promotedAt: now });
  const operation = { reference: 'render-markdown/v1', digest: RENDER_MARKDOWN_OPERATION_DIGEST,
    input: { title: 'Qualification', paragraphs: ['No provider execution.'], outputPath: 'docs/qualification.md' } };
  const workflowId = await insert('workflows', { projectId, workflowId: 'capability-delegated-offline', name: 'Capability offline', description: 'Synthetic admission only',
    contractVersion: 'factory-workflow-contract/v2', agents: [], steps: [{ id: 'render', kind: 'DETERMINISTIC', agent: '', input: JSON.stringify(operation),
      expects: 'Exact synthetic document', retryLimit: 0, timeoutMinutes: 1, outputSchema: { type: 'object', required: ['status'], properties: { status: { type: 'string' } } } }],
    active: true, version: 1, createdAt: now, updatedAt: now });
  const factoryId = await insert('factoryDefinitions', { tenantId, projectId, repositoryId, purpose: 'SOFTWARE', name: 'Synthetic offline Factory',
    status: 'DRAFT', latestVersion: 1, createdBy: operatorId, createdAt: now, updatedAt: now });
  const environmentDigest = qualificationEnvironmentDigest({ environment: await read(environmentId), projectId, tenantId, repositoryId, configuredEnvironmentId: environmentId });
  const version = { tenantId, projectId, factoryDefinitionId: factoryId, version: 1, repositoryId, repositoryDataClassification: 'PUBLIC',
    purpose: 'SOFTWARE', workflowId, executor, ...harness, executionProfileId: profileId, executionProfileKey: profile.profileKey,
    executionProfileVersion: 1, executionProfileDigest: digest, executionProfileSnapshot: profile, executionProfileQualificationDigest: qualificationDigest,
    executionProfileQualificationSnapshot: qualification, inferenceConstraint: { schema: 'factory-inference-constraint/v1', mode: 'DENIED' },
    deterministicOperation: operation, executionBackend: 'isolated-container', sandboxProfileId: sandboxId, sandboxProfileDigest: sandboxDigest,
    sandboxProfileSnapshot: sandboxSnapshot, codeScopeIds: [scopeId], agentBindings: [], policyEnvelopeId, environmentId, qualificationEnvironmentDigest: environmentDigest,
    budget: { maxCostUsd: 0.01, maxRuntimeMinutes: 1, maxAttempts: 3 }, verifierIds: [verifierId], riskBoundary: 'GREEN',
    recovery: { pause: false, cancel: true, retry: true, resume: false }, createdBy: operatorId, createdAt: now };
  version.configurationDigest = factoryVersionConfigurationDigest(version);
  const versionId = await insert('factoryDefinitionVersions', version);
  const assessmentId = await insert('factoryReadinessAssessments', { tenantId, projectId, factoryDefinitionId: factoryId, factoryDefinitionVersionId: versionId,
    configurationDigest: version.configurationDigest, status: 'PASS', checks: [], assessedBy: operatorId, assessedAt: now, expiresAt: until });
  await patch(factoryId, { status: 'ACTIVE', activeVersionId: versionId, qualificationActivation: { schema: 'factory-qualification-activation/v1', target: 'QUALIFICATION',
    environmentId, environmentDigest, factoryDefinitionVersionId: versionId, configurationDigest: version.configurationDigest,
    executionProfileDigest: digest, actorId: operatorId, assessmentId, evidenceReference: 'synthetic:admission-fixture', activatedAt: now, expiresAt: until } });
  const hostId = 'synthetic-offline-host';
  await insert('workspaceHostBindings', { projectId, hostId, repositoryId, repository: 'synthetic/qualification', checkoutRoot: '/private/tmp/synthetic-no-execution',
    baseBranch: 'main', baseCommit: 'a'.repeat(40), dirty: false, status: 'READY', checkedAt: now, capacity: { maxConcurrentRuns: 1, currentRuns: 0 },
    workerRuntime: { sessionId: 'synthetic-only', generation: 1, hostRuntimeType: 'persistent-worker', executionBackends: ['isolated-container'],
      supportedExecutors: [{ ...executor, capabilityManifestSha256: harness.harnessCapabilityManifestDigest, effectiveConfigSha256: manifest.effectiveConfigSha256,
        runtimeArtifact: ISOLATED_INVOCATION_ADAPTER_ARTIFACT, runtimeArtifactSha256: harnessRuntimeArtifactDigest(ISOLATED_INVOCATION_ADAPTER_ARTIFACT), capabilityManifest: manifest,
        supportsCancel: true, supportsResume: false, isolationModes: ['WORKSPACE_WRITE'] }],
      sandboxCapabilities: ['git-worktree', 'workspace-write', ...profile.requiredSandboxCapabilities], repositoryAccess: [{ repositoryId, access: 'READ_WRITE' }],
      factoryVersionBindings: [{ ...executor, capabilityManifestSha256: harness.harnessCapabilityManifestDigest, effectiveConfigSha256: manifest.effectiveConfigSha256, inferenceConstraint: { schema: 'factory-inference-constraint/v1', mode: 'DENIED' }, factoryDefinitionVersionId: versionId, factoryConfigurationDigest: version.configurationDigest, repositoryId,
        executionBackend: 'isolated-container', runtimeArtifactSha256: harness.harnessRuntimeArtifactDigest, sandboxProfileDigest: sandboxDigest }],
      readiness: 'READY', draining: false, lastHeartbeatAt: now } });
  const planId = await insert('missionPlans', { tenantId, projectId, missionId, revisionNumber: 1, status: 'APPROVED', summary: 'Synthetic no-provider admission',
    createdBy: 'synthetic-plan-author', approvedBy: operatorId, approvedAt: now, createdAt: now,
    workOrderBlueprints: [{ id: 'synthetic-render', title: 'Synthetic render', desiredOutcome: 'Exact document', sequence: 1, role: 'WORKER', isMutating: true,
      dependsOnBlueprintIds: [], assertionIds: [] }] });
  await patch(missionId, { currentPlanId: planId, budgetUsd: 0.03 });
  await patch(workOrderId, { missionPlanId: planId, missionPlanRevision: 1, repositoryId, codeScopeIds: [scopeId], ownerMemberId, owningTeamId: teamId,
    planningRepositorySha: 'a'.repeat(40), executionEnvironment: 'LOCAL', isMutating: true, workflowId: 'capability-delegated-offline', metadata: { missionBlueprintId: 'synthetic-render', implementationPolicy: { allowedCommands: [], maxCostUsd: 0.03, maxAttempts: 3, timeoutMinutes: 1, stopCondition: 'Admission only' } },
    verificationContract: { schemaVersion: 2, enforcementMode: 'ENFORCED', checks: [], requiredRisks: [], requireHumanReview: true, independence: { required: true, minimumBoundary: 'SEPARATE_ATTEMPT' } } });
  const revisionId = await insert('workOrderRevisions', { tenantId, projectId, workOrderId, revisionNumber: 1,
    status: 'APPLIED', changedFields: [], changeSummary: 'Synthetic original authority', reason: 'Disposable admission fixture', approvedBy: operatorId,
    createdAt: now, effectiveAt: now, riskReassessment: 'UNCHANGED', materiality: 'NO_ACTION', requiresReapproval: false,
    requiresReverification: false, requiresFullReopen: false, impactedAcceptanceCriteria: [], impactedApprovals: [], impactedVerificationReceiptIds: [],
    requestedChanges: {}, previousSnapshot: {}, nextSnapshot: await read(workOrderId) });
  await patch(workOrderId, { currentRevisionId: revisionId, currentRevisionNumber: 1 });
  const task = await mutate('tasks:create', { projectId, workOrderId, title: 'Render exact synthetic document', type: 'DOCS', priority: 3,
    source: 'DASHBOARD', createdBy: 'HUMAN', createdByRef: 'synthetic-owner', idempotencyKey: 'capability-native-task' });
  await patch(task.task._id, { status: 'READY', planningRepositorySha: 'a'.repeat(40) });
  return { versionId, profileId, sandboxId, repositoryId, hostId, taskId: task.task._id, configurationDigest: version.configurationDigest };
}
