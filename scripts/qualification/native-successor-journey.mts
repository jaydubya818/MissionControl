import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { makeFunctionReference } from 'convex/server';
import { canonicalJson, sha256Hex } from '@mission-control/shared';
import { startFixtureDatabase } from '../enterprise-compatibility/database.mjs';
import { createIsolatedFactoryHarness } from '../../apps/orchestration-server/src/factoryHarnessComposition.js';
import { HarnessAdapterRegistry } from '../../apps/orchestration-server/src/harnessAdapterRegistry.js';
import { FactoryAttemptWorker, DEFAULT_DEPENDENCIES } from '../../apps/orchestration-server/src/factoryAttemptWorker.js';
import { attestLocalQualificationRepository, localQualificationRepositoryBinding } from '../../apps/orchestration-server/src/localQualificationRepository.js';
import { createSignedServiceCommand } from '../../apps/orchestration-server/src/serviceCommandClient.js';
import { offlineSandboxDigest } from '../../convex/lib/localQualificationSandbox.js';
import { NATIVE_ENGINEERING_TARIFF_POLICY } from '../../convex/lib/nativeEngineeringTariff.js';
import { qualifySettlementControls } from './native-settlement-controls.mjs';
import { qualifyNativeGateControls } from './native-gate-controls.mjs';
import { ISOLATED_CONTAINER_POLICY, SUCCESSOR_ISOLATED_RUNTIME_ARTIFACT, SUCCESSOR_ISOLATED_EFFECTIVE_CONFIG,
  RENDER_MARKDOWN_OPERATION, RENDER_MARKDOWN_OPERATION_DIGEST, VERIFY_DOCUMENT_OPERATION, VERIFY_DOCUMENT_OPERATION_DIGEST,
  renderMarkdownCandidate } from '@mission-control/workflow-engine/harness-contract';

const [buildArgument, dockerExecutable, outputArgument, mode] = process.argv.slice(2);
if (!buildArgument || !dockerExecutable || !outputArgument || !['prepare', 'execute'].includes(mode)) throw Error('Build directory, exact Docker executable, fresh output directory and prepare/execute mode required');
const build = resolve(buildArgument), output = resolve(outputArgument), repo = process.cwd();
await mkdir(output);
const digest = (value: unknown) => `sha256:${sha256Hex(canonicalJson(value))}`;
const savedEnvironment = Object.fromEntries(['MISSION_CONTROL_SERVICE_ID', 'MISSION_CONTROL_SERVICE_COMMAND_SECRET', 'MC_LOCAL_REPOSITORY_ADMISSION', 'CODEX_WORKER_CHECKOUT_ROOT'].map(k => [k, process.env[k]]));
process.env.MISSION_CONTROL_SERVICE_ID = 'native-successor-qualification';
process.env.MISSION_CONTROL_SERVICE_COMMAND_SECRET = randomBytes(32).toString('hex');
const db: any = await startFixtureDatabase(repo, { canonicalAccounting: true, nativeExecution: true });
const state: any = { schema: 'native-successor-journey/v1', classification: 'ISOLATED_QUALIFICATION', databaseRoot: db.root,
  productionIntegration: 'NOT_RUN', paidOperations: 0, externalAlphaChanges: 0, executableProductionGrants: 0, stages: {} };
const ref = (name: string) => makeFunctionReference<any>(name);
const mutate = (name: string, args: any, client = db.owner) => client.mutation(ref(name), args);
const query = (name: string, args: any, client = db.owner) => client.query(ref(name), args);
async function step(name: string, operation: () => Promise<any>) {
  const value = await operation(); state.stages[name] = value;
  await writeFile(join(output, 'journey.json'), JSON.stringify(state, null, 2) + '\n');
  console.log(JSON.stringify({ stage: name, recorded: true })); return value;
}
let adapter: any, worker: FactoryAttemptWorker | undefined;
try {
  const s = db.seed; state.seed = s;
  db.setEnvironment('MC_OFFLINE_QUALIFICATION_ENVIRONMENT_ID', s.environmentId);
  db.setEnvironment('MISSION_CONTROL_SERVICE_ID', process.env.MISSION_CONTROL_SERVICE_ID);
  db.setEnvironment('MISSION_CONTROL_SERVICE_COMMAND_SECRET', process.env.MISSION_CONTROL_SERVICE_COMMAND_SECRET);
  const parent = '/private/tmp/mc-local-qualification-' + randomBytes(16).toString('hex'), root = join(parent, 'repository');
  await mkdir(root, { recursive: true }); await chmod(parent, 0o700);
  process.env.CODEX_WORKER_CHECKOUT_ROOT = root;
  const content = '# Native successor fixture\n\nSynthetic non-customer content.\n';
  const ignore = '.mission-control/\n';
  await writeFile(join(root, 'README.md'), content);
  await writeFile(join(root, '.gitignore'), ignore);
  const gitEnv = { PATH: process.env.PATH!, HOME: parent, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' };
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, env: gitEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'main'); git('add', 'README.md', '.gitignore');
  git('-c', 'user.name=Synthetic Qualification', '-c', 'user.email=qualification@example.test', 'commit', '-m', 'Synthetic native successor baseline');
  const fixtureId = randomUUID(), hostId = 'native-successor-worker', sessionId = randomUUID();
  const admission = { schema: 'local-synthetic-repository-admission/v1', mode: 'LOCAL_SYNTHETIC_QUALIFICATION', program: 'unpublished-handoff-fixture/v1',
    tenantId: s.tenantId, projectId: s.projectId, engagementId: s.projectId, operatorId: s.operatorId, environmentId: s.environmentId,
    hostId, fixtureId, root, baselineCommit: git('rev-parse', 'HEAD'), baselineTree: git('rev-parse', 'HEAD^{tree}'),
    fixtureContentDigest: digest([{ path: '.gitignore', contentDigest: `sha256:${sha256Hex(ignore)}` }, { path: 'README.md', contentDigest: `sha256:${sha256Hex(content)}` }]), expiresAt: Date.now() + 3_600_000,
    publicationAuthority: 'NONE', productionAuthority: 'NONE' };
  process.env.MC_LOCAL_REPOSITORY_ADMISSION = JSON.stringify(admission);
  db.setEnvironment('MC_LOCAL_REPOSITORY_ADMISSION', JSON.stringify(admission));
  const localBinding = localQualificationRepositoryBinding(JSON.stringify(admission))!;
  await writeFile(join(parent, 'qualification-owner.json'), JSON.stringify({ schema: 'local-qualification-owner/v1', fixtureId, admissionDigest: localBinding.digest, root }), { mode: 0o600 });
  state.repositoryAdmission = admission;
  const repositoryId = await step('repository', () => mutate('localQualificationRepositories:register', {}));
  adapter = await createIsolatedFactoryHarness({ backendBundlePath: join(build, 'bundles/backend.mjs'), dockerExecutable, version: '3',
    authority: async request => {
      if (request.lease.workerId !== hostId || request.lease.sessionId !== sessionId) return false;
      const verifier = request.workload.reference === VERIFY_DOCUMENT_OPERATION;
      const command = createSignedServiceCommand({ capability: verifier ? 'verification:renew' : 'attempts.renew', projectId: s.projectId, repositoryId,
        payload: { workflowRunId: request.attemptId, leaseId: request.lease.leaseId, workerId: hostId, workerSessionId: sessionId,
          workerGeneration: request.lease.generation, leaseDurationMs: 60_000 } });
      return (await db.owner.action(ref(verifier ? 'serviceCommands:renewVerificationAttempt' : 'serviceCommands:renewFactoryAttempt'), command))?.renewed === true;
    } });
  if ((await adapter.health()).status !== 'READY') throw Error('Registered successor is unavailable');
  const registry = new HarnessAdapterRegistry([adapter]);
  const registrations = registry.registrations().map(r => ({ adapter: r.capabilities.adapter, version: r.capabilities.version,
    capabilityManifestSha256: r.capabilityManifestSha256!, effectiveConfigSha256: r.effectiveConfigSha256!, runtimeArtifact: r.runtimeArtifact,
    runtimeArtifactSha256: r.runtimeArtifactSha256, capabilityManifest: r.manifest!, supportsCancel: r.capabilities.supportsCancel,
    supportsResume: r.capabilities.supportsResume, isolationModes: [...r.capabilities.isolationModes] }));
  let factoryVersionBindings: any[] = [];
  async function reportHost() {
    const observed = await attestLocalQualificationRepository(localBinding);
    return mutate('workspaceHostBindings:report', { projectId: s.projectId, repositoryId, hostId, repository: `local-qualification/${fixtureId}`,
      checkoutRoot: root, localQualificationObservation: observed, observedBranch: 'main', observedCommit: admission.baselineCommit,
      baseBranch: 'main', baseCommit: admission.baselineCommit, dirty: false, runtime: `node ${process.version} ${process.platform}/${process.arch}`,
      approvedModelIds: [], networkPolicyStatus: 'READY', secretPolicyStatus: 'READY', maxConcurrentRuns: 2, currentRuns: worker?.status().activeRunIds.length ?? 0,
      workerRuntime: { sessionId, hostRuntimeType: 'persistent-worker', executionBackends: ['isolated-container'], supportedExecutors: registrations,
        sandboxCapabilities: ['git-worktree', 'workspace-write', 'read-only', 'deny-egress', 'isolated-container', 'no-host-mounts', 'read-only-runtime'],
        repositoryAccess: [{ repositoryId, access: 'READ_WRITE' }], ...(factoryVersionBindings.length ? { factoryVersionBindings } : {}), readiness: 'READY', draining: false },
      status: 'READY', attestedAt: Date.now() });
  }
  await step('initialHost', reportHost);
  const controls = await Promise.all(['match', 'mutation', 'canceled', 'stale'].map(async name => {
    const record = JSON.parse(await readFile(join(build, 'registered-controls', name + '.json'), 'utf8'));
    if (!record.passed || record.request.composition.runtimeImage !== SUCCESSOR_ISOLATED_RUNTIME_ARTIFACT.imageDigest) throw Error('Exact registered component control missing');
    return { name, record };
  }));
  const evidenceDigest = digest(controls), evidenceReference = `local:native-successor-component-controls#${evidenceDigest}`;
  const snapshot = { schema: 'local-qualification-sandbox/v1', provider: 'LOCAL_CONTAINER', profileKey: 'native-successor', version: 1,
    imageDigest: SUCCESSOR_ISOLATED_RUNTIME_ARTIFACT.imageDigest, bridgeDigest: SUCCESSOR_ISOLATED_EFFECTIVE_CONFIG.bridgeImplementationDigest,
    backendDigest: SUCCESSOR_ISOLATED_EFFECTIVE_CONFIG.backendImplementationDigest, isolationPolicy: ISOLATED_CONTAINER_POLICY,
    qualification: { evidenceReference, evidenceDigest, validUntil: admission.expiresAt }, localQualification: {
      repositoryId, repositoryAdmissionDigest: localBinding.digest, environmentId: s.environmentId, projectId: s.projectId, tenantId: s.tenantId, operatorId: s.operatorId,
      program: admission.program, operations: ['render-markdown/v1', 'verify-document-bytes/v1'], risk: 'GREEN', inference: 'DENIED', transmission: 'DENIED', publication: 'NONE', production: 'NONE' } };
  const sandboxProfileId = await step('sandbox', () => mutate('factory/configuration:registerIsolatedSandboxProfile', { projectId: s.projectId, snapshot }));
  await step('sandboxAdmission', () => mutate('factory/configuration:promoteSandboxProfile', { sandboxProfileId, expectedProfileDigest: offlineSandboxDigest(snapshot) }));
  const profiles: any = {};
  for (const [purpose, isolation, workload] of [['producer', 'WORKSPACE_WRITE', 'SOFTWARE_CHANGE'], ['verifier', 'READ_ONLY', 'VERIFICATION']]) {
    profiles[purpose] = await step(purpose + 'Profile', () => mutate('factory/executionProfiles:registerVersion', { projectId: s.projectId, profileKey: `native-successor-${purpose}`,
      registrationIdempotencyKey: `native-successor-${purpose}`, executor: { adapter: 'isolated-invocation', version: '3' }, executionBackend: 'isolated-container', sandboxProfileId, isolationModes: [isolation] }));
    const p = await query('factory/executionProfiles:get', { executionProfileId: profiles[purpose].executionProfileId });
    await step(purpose + 'ProfileAdmission', () => mutate('factory/executionProfiles:qualify', { executionProfileId: p.profile._id, expectedProfileDigest: p.profile.profileDigest,
      qualificationIdempotencyKey: `native-successor-${purpose}-qualification`, evidenceReference, evidenceDigest, workloadClasses: [workload], riskClasses: ['GREEN'], validUntil: admission.expiresAt }));
  }
  const scope = await step('scope', () => mutate('projects:createRepositoryCodeScope', { repositoryId, name: 'Synthetic documents', slug: 'synthetic-documents',
    includePaths: ['docs/**'], excludePaths: ['.git/**', '.mission-control/**'], requiredReviewers: [s.operatorId], allowedEnvironments: ['LOCAL'] }));
  if (!scope.success) throw Error('Code scope failed: ' + scope.error);
  const policy = await step('policy', () => mutate('governance/policyEnvelopes:createPolicyEnvelope', { projectId: s.projectId, tenantId: s.tenantId, name: 'Native successor qualification',
    rules: { maxResourceCostUsd: 1, maxProviderCalls: 0, productionAuthority: 'NONE', publicationAuthority: 'NONE' }, metadata: { synthetic: true, repositoryId } }));
  const contextVerifierId = await step('contextVerifier', () => mutate('context/verifiers:create', { projectId: s.projectId, label: 'Exact native document bytes',
    invariant: 'Independent verification compares the immutable candidate with frozen expected bytes.', globPatterns: ['docs/qualification.md'], idempotencyKey: 'native-successor-verifier' }));
  const operation = { reference: RENDER_MARKDOWN_OPERATION, digest: RENDER_MARKDOWN_OPERATION_DIGEST,
    input: { title: 'Native Successor Qualification', paragraphs: ['Independent verification precedes enterprise acceptance.'], outputPath: 'docs/qualification.md' } };
  const verification = { reference: VERIFY_DOCUMENT_OPERATION, digest: VERIFY_DOCUMENT_OPERATION_DIGEST,
    input: { path: 'docs/qualification.md', expectedContentSha256: `sha256:${sha256Hex(renderMarkdownCandidate(operation).content)}` } };
  const factories: any = {};
  for (const [purpose, workload, factoryPurpose] of [['producer', operation, 'SOFTWARE'], ['verifier', verification, 'VERIFICATION']] as const) {
    const workflowId = await step(purpose + 'Workflow', () => mutate('workflows:registerProduction', { projectId: s.projectId, workflowId: `native-successor-${purpose}`,
      name: `Native deterministic ${purpose}`, description: 'Isolated deterministic qualification. No inference or publication authority.', topology: 'LINEAR', maxConcurrency: 1, agents: [], active: true,
      steps: [{ id: 'execute', kind: 'DETERMINISTIC', agent: '', retryLimit: 0, timeoutMinutes: 1, input: JSON.stringify(workload), expects: 'Validated deterministic result',
        outputSchema: { type: 'object', required: ['status'], properties: { status: { type: 'string' } } } }] }));
    const definitionId = await step(purpose + 'Factory', () => mutate('factory/configuration:create', { repositoryId, name: `Native successor ${purpose}`, purpose: factoryPurpose }));
    const versionId = await step(purpose + 'FactoryVersion', () => mutate('factory/configuration:createVersion', { factoryDefinitionId: definitionId, workflowId,
      executionProfileId: profiles[purpose].executionProfileId, codeScopeIds: [scope.scopeId], agentBindings: [], policyEnvelopeId: policy._id, environmentId: s.environmentId,
      budget: { maxCostUsd: 0.01, maxRuntimeMinutes: 1, maxAttempts: 3 }, verifierIds: [contextVerifierId], riskBoundary: 'GREEN', recovery: { pause: false, cancel: true, retry: true, resume: false } }));
    factories[purpose] = { definitionId, versionId };
    const detail = await query('factory/configuration:getDetail', { factoryDefinitionId: definitionId });
    const v = detail.versions.find((v: any) => v._id === versionId);
    factoryVersionBindings.push({ factoryDefinitionVersionId: versionId, factoryConfigurationDigest: v.configurationDigest, adapter: v.executor.adapter, version: v.executor.version,
      capabilityManifestSha256: v.harnessCapabilityManifestDigest, effectiveConfigSha256: v.harnessEffectiveConfigSha256, runtimeArtifactSha256: v.harnessRuntimeArtifactDigest,
      executionBackend: 'isolated-container', inferenceConstraint: { schema: 'factory-inference-constraint/v1', mode: 'DENIED' }, sandboxProfileDigest: v.sandboxProfileDigest, repositoryId });
  }
  await step('boundHost', reportHost);
  for (const purpose of ['producer', 'verifier']) await step(purpose + 'Activation', () => mutate('factory/configuration:activate', {
    factoryDefinitionVersionId: factories[purpose].versionId, target: 'QUALIFICATION', evidenceReference }));
  state.prepared = true;
  await writeFile(join(output, 'journey.json'), JSON.stringify(state, null, 2) + '\n');
  if (mode === 'prepare') console.log(JSON.stringify({ preparation: 'PASS', nativeExecution: 'NOT_RUN' }));
  else {
    const author = db.client('user_SyntheticPlanAuthorQualification');
    const missionResult = await step('mission', () => mutate('missions:createDraft', { projectId: s.projectId, idempotencyKey: 'native-successor-mission',
      title: 'Native successor executed settlement', objective: 'Render and independently verify one exact unpublished synthetic document.',
      context: 'Isolated qualification only.', constraints: ['No paid inference', 'No publication', 'No production authority'],
      sourceOfTruthRefs: [{ kind: 'REPO', label: 'Admitted fixture', location: 'docs/qualification.md' }], owner: s.operatorId,
      ownerMemberId: s.memberId, owningTeamId: s.teamId, repositoryId, codeScopeIds: [scope.scopeId], executionEnvironment: 'LOCAL', budgetUsd: 0.1, maxReadOnlyConcurrency: 2, maxCorrectiveIterations: 1,
      stopCondition: 'Stop after independent verification and exact native settlement.', metadata: { synthetic: true, qualificationOnly: true } }));
    const missionId = missionResult.mission._id;
    const planResult = await step('plan', () => mutate('missions:savePlanDraft', { projectId: s.projectId, missionId, idempotencyKey: 'native-successor-plan',
      summary: 'Render frozen Markdown through the exact admitted runtime, independently compare the candidate Git blob, and settle authenticated execution proof.',
      rollbackApproach: 'Discard unpublished candidate worktrees.', estimatedCostUsd: 0,
      assertions: [{ assertionId: 'exact-document', title: 'Exact native document', outcome: 'Only the approved document changes.', verificationMethod: 'TEST',
        passCondition: 'A separate verifier Attempt compares exact immutable candidate bytes.', requiredEvidence: 'Candidate commit and tree, separate verifier, exact runtime response, Quality Contract.',
        requiresIndependentValidation: true, waiverAllowed: false }],
      workOrderBlueprints: [{ id: 'native-document', title: 'Render native qualification document', desiredOutcome: 'Create only docs/qualification.md with the frozen content.',
        workflowId: 'native-successor-producer', sequence: 1, role: 'WORKER', isMutating: true, priority: 3, riskLevel: 'LOW', branchStrategy: 'qualification-only-unpublished',
        constraints: ['Only docs/qualification.md may change'], requiredApprovals: [], estimatedCostUsd: 0,
        implementationPolicy: { allowedCommands: ['node -e deterministic-byte-verification'], independentVerification: { executable: 'node', args: ['-e', 'process.exit(0)'],
          category: 'CONTRACT_TEST', commandClass: 'TEST', evidenceCategory: 'TEST_RESULT', timeoutMs: 10000 }, maxFilesChanged: 1, maxLinesChanged: 10,
          maxCostUsd: 0.05, maxAttempts: 3, timeoutMinutes: 1, stopCondition: 'Stop after immutable candidate capture.' }, dependsOnBlueprintIds: [], assertionIds: ['exact-document'] }],
      metadata: { synthetic: true, qualificationOnly: true, nativeEngineeringTariffPolicy: NATIVE_ENGINEERING_TARIFF_POLICY } }, author));
    const planId = planResult.plan._id;
    await step('submittedPlan', () => mutate('missions:submitPlan', { projectId: s.projectId, missionId, planId, idempotencyKey: 'native-successor-submit' }, author));
    const release = await step('approvedPlan', () => mutate('missions:approvePlan', { projectId: s.projectId, missionId, planId,
      decisionReason: 'Approve this exact synthetic plan and its explicit zero-charge native engineering tariff. No paid, publication or production authority.', idempotencyKey: 'native-successor-approve' }));
    const workOrder = release.workOrders[0]; state.workOrderId = workOrder._id;
    await step('startedMission', () => mutate('missions:start', { missionId, idempotencyKey: 'native-successor-start' }));
    const taskResult = await step('task', () => mutate('tasks:create', { projectId: s.projectId, workOrderId: workOrder._id, title: 'Render exact native document', type: 'DOCS', priority: 3,
      idempotencyKey: 'native-successor-task', source: 'DASHBOARD', createdBy: 'HUMAN', createdByRef: 'user_SyntheticHandoffQualification', metadata: { synthetic: true, qualificationOnly: true } }));
    const taskId = taskResult.task._id;
    for (const toStatus of ['ASSIGNED', 'READY']) await step('task' + toStatus, async () => {
      const result = await mutate('tasks:transition', { taskId, projectId: s.projectId, toStatus, actorType: 'HUMAN', actorUserId: 'user_SyntheticHandoffQualification',
        reason: 'Ready for the exact isolated canonical Factory Attempt', idempotencyKey: 'native-successor-task-' + toStatus });
      if (!result.success) throw Error('Canonical task transition failed: ' + JSON.stringify(result)); return result;
    });
    await reportHost();
    const dispatchArgs = { workOrderId: workOrder._id, taskId, workflowId: 'native-successor-producer', actorType: 'HUMAN', idempotencyKey: 'native-successor-dispatch',
      repositoryId, codeScopeIds: [scope.scopeId], owningTeamId: s.teamId, ownerMemberId: s.memberId, executionEnvironment: 'LOCAL', executorHostId: hostId,
      factoryDefinitionVersionId: factories.producer.versionId };
    const dispatch = await step('dispatch', () => mutate('workOrders:dispatch', dispatchArgs));
    if (!dispatch.created || !dispatch.run) throw Error('Native dispatch did not create the canonical Attempt: ' + JSON.stringify(dispatch));
    state.producerAttemptId = dispatch.run._id;
    await step('reservedBeforeExecution', () => query('factory/nativeAccounting:readback', { workflowRunId: dispatch.run._id }));
    const duplicate = await step('duplicateDispatch', () => mutate('workOrders:dispatch', dispatchArgs));
    if (duplicate.created || duplicate.run._id !== dispatch.run._id) throw Error('Duplicate native admission');
    worker = new FactoryAttemptWorker(db.owner, registry, true, 15000, { ...DEFAULT_DEPENDENCIES,
      loadGithubAppPrivateKey: () => undefined, getGithubAppId: () => undefined }, { projectId: s.projectId, repositoryId }, { workerId: hostId, sessionId, maxConcurrentRuns: 2 });
    const deadline = Date.now() + 90000;
    let runs: any[] = [];
    while (Date.now() < deadline) {
      await reportHost(); await worker.tick();
      runs = await query('nativeFixture:inspect', { table: 'workflowRuns' });
      const verifier = runs.find(r => r.attemptPurpose === 'VERIFICATION');
      if (verifier && ['COMPLETED', 'FAILED', 'CANCELED'].includes(verifier.status) && worker.status().activeRunIds.length === 0) break;
      const producer = runs.find(r => r._id === dispatch.run._id);
      if (producer?.status === 'FAILED' && worker.status().activeRunIds.length === 0) break;
      await new Promise(r => setTimeout(r, 200));
    }
    await step('workerStatus', async () => worker!.status());
    await step('executedAttempts', async () => runs);
    const detail = await step('workOrderAfterVerification', () => query('workOrders:get', { workOrderId: workOrder._id }));
    const verifier = runs.find(r => r.attemptPurpose === 'VERIFICATION');
    if (runs.find(r => r._id === dispatch.run._id)?.status !== 'COMPLETED' || verifier?.status !== 'COMPLETED') {
      throw Error('Native producer/verifier execution incomplete: ' + JSON.stringify(runs.map(r => ({ id: r._id, purpose: r.attemptPurpose, status: r.status, error: r.error }))));
    }
    const artifacts = await step('retainedArtifacts', () => query('nativeFixture:inspect', { table: 'runArtifacts' }));
    await step('verificationEvidence', () => query('nativeFixture:inspect', { table: 'evidenceEnvelopes' }));
    const gateBefore = await step('gateBeforeSettlement', () => mutate('factory/enterpriseQualification:evaluate', { workOrderId: workOrder._id, idempotencyKey: 'native-before-settlement' }));
    if (gateBefore.current.eligible) throw Error('Native execution alone granted enterprise acceptance');
    await worker.stop();
    await step('settlementControls', () => qualifySettlementControls({ db, runs, artifacts, mutate, query, step }));
    await db.restart();
    const readback = await step('durableReadback', () => query('factory/nativeAccounting:readback', { workflowRunId: dispatch.run._id }));
    if (readback.projectExposureMicrousd !== 0) throw Error('Proven native allowance remained reserved');
    const gateAfter = await step('gateAfterSettlement', () => mutate('factory/enterpriseQualification:evaluate', { workOrderId: workOrder._id, idempotencyKey: 'native-after-settlement' }));
    if (!gateAfter.current.eligible || !gateAfter.current.current) throw Error('Native enterprise gate is not current: ' + JSON.stringify(gateAfter.current));
    await step('gateControls', () => qualifyNativeGateControls({ db, workOrderId: workOrder._id, mutate, query }));
    const productionAcceptance = await step('productionAcceptanceDenied', () => mutate('workOrders:accept', { workOrderId: workOrder._id, actorType: 'HUMAN', idempotencyKey: 'native-production-denied' }));
    if (productionAcceptance.accepted) throw Error('Synthetic native evidence granted production acceptance');
    const acceptance = await step('isolatedAcceptance', () => mutate('workOrders:accept', { workOrderId: workOrder._id, actorType: 'HUMAN', idempotencyKey: 'native-isolated-accept', isolatedEnterpriseQualification: true }));
    if (!acceptance.accepted) throw Error('Isolated canonical acceptance failed: ' + JSON.stringify(acceptance));
    state.nativeExecution = 'PASS'; state.nativeSettlement = 'PASS'; state.independentVerifierAttemptId = verifier._id;
    state.enterpriseQualityGate = 'PASS_ISOLATED_QUALIFICATION';
    await writeFile(join(output, 'journey.json'), JSON.stringify(state, null, 2) + '\n');
    console.log(JSON.stringify({ nativeExecution: 'PASS', nativeSettlement: 'PASS', producerAttemptId: dispatch.run._id, verifierAttemptId: verifier._id }));
  }
} catch (error) {
  state.failedAttempts = await query('nativeFixture:inspect', { table: 'workflowRuns' }).catch(() => []);
  state.failedWorkerStatus = worker?.status();
  state.failure = String(error); await writeFile(join(output, 'journey.json'), JSON.stringify(state, null, 2) + '\n'); throw error;
} finally {
  await worker?.stop(); await adapter?.dispose(); await db.stop();
  for (const [key, value] of Object.entries(savedEnvironment)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
}
// All worker, image and database cleanup has completed. Convex CLI child
// transport handles must not keep a finished qualification command resident.
process.exit(0);
