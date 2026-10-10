import { SofieEnterpriseContractFixture } from '../enterprise-golden-journey/sofie-contract.mjs';
import { pathToFileURL } from 'node:url';
import { finalizeHybridSpec } from './native-hybrid-spec.mjs';
import { mkdir, readFile, writeFile, chmod, rm, lstat } from 'node:fs/promises';
import assert from 'node:assert/strict';
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
import { prepareHybridProvider, executeHybridDelegation } from './native-hybrid-delegation.mjs';
import { qualifyNativeGateControls } from './native-gate-controls.mjs';
import { ISOLATED_CONTAINER_POLICY, SUCCESSOR_ISOLATED_RUNTIME_ARTIFACT, SUCCESSOR_ISOLATED_EFFECTIVE_CONFIG,
  RENDER_MARKDOWN_OPERATION, RENDER_MARKDOWN_OPERATION_DIGEST, VERIFY_DOCUMENT_OPERATION, VERIFY_DOCUMENT_OPERATION_DIGEST,
  renderMarkdownCandidate } from '@mission-control/workflow-engine/harness-contract';

const [buildArgument, dockerExecutable, outputArgument, mode] = process.argv.slice(2);
if (!buildArgument || !dockerExecutable || !outputArgument || !['prepare', 'execute', 'recovery', 'unknown', 'cancel', 'hybrid'].includes(mode)) throw Error('Build directory, exact Docker executable, fresh output directory and qualified mode required');
const build = resolve(buildArgument), output = resolve(outputArgument), repo = process.cwd();
await mkdir(output);
const digest = (value: unknown) => `sha256:${sha256Hex(canonicalJson(value))}`;
const savedEnvironment = Object.fromEntries(['MISSION_CONTROL_SERVICE_ID', 'MISSION_CONTROL_SERVICE_COMMAND_SECRET', 'MC_LOCAL_REPOSITORY_ADMISSION', 'CODEX_WORKER_CHECKOUT_ROOT'].map(k => [k, process.env[k]]));
process.env.MISSION_CONTROL_SERVICE_ID = 'native-successor-qualification';
process.env.MISSION_CONTROL_SERVICE_COMMAND_SECRET = randomBytes(32).toString('hex');
const db: any = await startFixtureDatabase(repo, { canonicalAccounting: true, nativeExecution: true });
const state: any = { schema: 'native-successor-journey/v1', classification: 'ISOLATED_QUALIFICATION', databaseRoot: db.root,
  controllerSourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  controllerDirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0,
  productionIntegration: 'NOT_RUN', paidOperations: 0, externalAlphaChanges: 0, executableProductionGrants: 0, stages: {} };
const ref = (name: string) => makeFunctionReference<any>(name);
const mutate = (name: string, args: any, client = db.owner) => client.mutation(ref(name), args);
const query = (name: string, args: any, client = db.owner) => client.query(ref(name), args);
async function step(name: string, operation: () => Promise<any>) {
  const started = performance.now();
  const value = await operation(); state.stages[name] = value;
  (state.timingsMs ??= {})[name] = performance.now() - started;
  await writeFile(join(output, 'journey.json'), JSON.stringify(state, null, 2) + '\n');
  console.log(JSON.stringify({ stage: name, recorded: true })); return value;
}
let hybridProvider: any;
let resultConsumer: any;
let adapter: any, worker: FactoryAttemptWorker | undefined;
try {
  const s = db.seed; state.seed = s;
  if (mode === 'hybrid') hybridProvider = await prepareHybridProvider();
  if (mode === 'hybrid' && process.env.MC_SOFIE_RESULT_CONSUMER_ROOT) {
    const consumer = await import(pathToFileURL(resolve(process.env.MC_SOFIE_RESULT_CONSUMER_ROOT, 'apps/eve/test/missioncontrol-result.integration.mjs')).href);
    resultConsumer = await consumer.prepareCompletedResultConsumer(db);
  }
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
  git('init', '-b', 'main');
  let sourceFiles = [{ path: '.gitignore', contentDigest: `sha256:${sha256Hex(ignore)}` }, { path: 'README.md', contentDigest: `sha256:${sha256Hex(content)}` }];
  if (mode === 'hybrid') {
    const { rm } = await import('node:fs/promises');
    await rm(join(root, 'README.md')); await rm(join(root, '.gitignore'));
    git('fetch', '--no-tags', resolve(process.env.MYFACTORY_FIXTURE_GIT!), hybridProvider.f.request.source.commit);
    git('checkout', '-B', 'main', 'FETCH_HEAD');
    await writeFile(join(root, '.git/info/exclude'), '.mission-control/\n');
    sourceFiles = git('ls-tree', '-r', '--name-only', 'HEAD').split('\n').map(path => ({ path,
      contentDigest: `sha256:${sha256Hex(execFileSync('git', ['show', 'HEAD:' + path], { cwd: root, env: gitEnv }))}` }));
    sourceFiles.sort((a, b) => a.path.localeCompare(b.path));
  } else {
    git('add', 'README.md', '.gitignore');
    git('-c', 'user.name=Synthetic Qualification', '-c', 'user.email=qualification@example.test', 'commit', '-m', 'Synthetic native successor baseline');
  }
  const fixtureId = randomUUID(), hostId = 'native-successor-worker'; let sessionId = randomUUID();
  const admission = { schema: 'local-synthetic-repository-admission/v1', mode: 'LOCAL_SYNTHETIC_QUALIFICATION', program: 'unpublished-handoff-fixture/v1',
    tenantId: s.tenantId, projectId: s.projectId, engagementId: s.projectId, operatorId: s.operatorId, environmentId: s.environmentId,
    hostId, fixtureId, root, baselineCommit: git('rev-parse', 'HEAD'), baselineTree: git('rev-parse', 'HEAD^{tree}'),
    fixtureContentDigest: digest(sourceFiles), expiresAt: Date.now() + 3_600_000,
    publicationAuthority: 'NONE', productionAuthority: 'NONE' };
  process.env.MC_LOCAL_REPOSITORY_ADMISSION = JSON.stringify(admission);
  db.setEnvironment('MC_LOCAL_REPOSITORY_ADMISSION', JSON.stringify(admission));
  const localBinding = localQualificationRepositoryBinding(JSON.stringify(admission))!;
  await writeFile(join(parent, 'qualification-owner.json'), JSON.stringify({ schema: 'local-qualification-owner/v1', fixtureId, admissionDigest: localBinding.digest, root }), { mode: 0o600 });
  state.repositoryAdmission = admission;
  const repositoryId = await step('repository', () => mutate('localQualificationRepositories:register', {}));
  const createAdapter = () => createIsolatedFactoryHarness({ backendBundlePath: join(build, 'bundles/backend.mjs'), dockerExecutable, version: '3',
    authority: async request => {
      if (request.lease.workerId !== hostId || request.lease.sessionId !== sessionId) return false;
      const verifier = request.workload.reference === VERIFY_DOCUMENT_OPERATION;
      const command = createSignedServiceCommand({ capability: verifier ? 'verification:renew' : 'attempts.renew', projectId: s.projectId, repositoryId,
        payload: { workflowRunId: request.attemptId, leaseId: request.lease.leaseId, workerId: hostId, workerSessionId: sessionId,
          workerGeneration: request.lease.generation, leaseDurationMs: 60_000 } });
      return (await db.anonymous.action(ref(verifier ? 'serviceCommands:renewVerificationAttempt' : 'serviceCommands:renewFactoryAttempt'), command))?.renewed === true;
    } });
  adapter = await createAdapter();
  if ((await adapter.health()).status !== 'READY') throw Error('Registered successor is unavailable');
  let executions = 0;
  const execute = adapter.execute.bind(adapter);
  adapter.execute = (...args: any[]) => { executions++; return execute(...args); };
  if (mode === 'unknown') {
    const collect = adapter.collectResult.bind(adapter);
    adapter.collectResult = async (...args: any[]) => {
      const completed = await collect(...args);
      state.diagnosticProviderOutcome = completed;
      // Actual execution occurred. The provider response is lost before the
      // worker can persist authoritative evidence; recovery must hold exposure.
      throw Error('INJECTED_UNKNOWN_PROVIDER_OUTCOME');
    };
  }
  if (mode === 'cancel') {
    const prepare = adapter.prepare.bind(adapter);
    adapter.prepare = (request: any, context: any) => prepare(request, { ...context, emit: async (event: any) => {
      await context.emit(event);
      state.cancellation = await mutate('workflowRuns:requestCancellation', {
        workflowRunId: state.producerAttemptId, reason: 'Isolated qualification: cancel after container launch.' });
    } });
  }
  let registry = new HarnessAdapterRegistry([adapter]);
  const registrations = registry.registrations().map(r => ({ adapter: r.capabilities.adapter, version: r.capabilities.version,
    capabilityManifestSha256: r.capabilityManifestSha256!, effectiveConfigSha256: r.effectiveConfigSha256!, runtimeArtifact: r.runtimeArtifact,
    runtimeArtifactSha256: r.runtimeArtifactSha256, capabilityManifest: r.manifest!, supportsCancel: r.capabilities.supportsCancel,
    supportsResume: r.capabilities.supportsResume, isolationModes: [...r.capabilities.isolationModes] }));
  let factoryVersionBindings: any[] = [];
  let lastHostReportAt = 0;
  async function reportHost() {
    lastHostReportAt = Date.now();
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
    includePaths: mode === 'hybrid' ? ['docs/**', ...hybridProvider.f.request.input.allowedPaths] : ['docs/**'], excludePaths: ['.git/**', '.mission-control/**'], requiredReviewers: [s.operatorId], allowedEnvironments: ['LOCAL'] }));
  if (!scope.success) throw Error('Code scope failed: ' + scope.error);
  const policy = await step('policy', () => mutate('governance/policyEnvelopes:createPolicyEnvelope', { projectId: s.projectId, tenantId: s.tenantId, name: 'Native successor qualification',
    rules: { maxResourceCostUsd: 1, maxProviderCalls: 0, productionAuthority: 'NONE', publicationAuthority: 'NONE' }, metadata: { synthetic: true, repositoryId } }));
  const contextVerifierId = await step('contextVerifier', () => mutate('context/verifiers:create', { projectId: s.projectId, label: 'Exact native document bytes',
    invariant: 'Independent verification compares the immutable candidate with frozen expected bytes.', globPatterns: ['docs/qualification.md'], idempotencyKey: 'native-successor-verifier' }));
  const operation = { reference: RENDER_MARKDOWN_OPERATION, digest: RENDER_MARKDOWN_OPERATION_DIGEST,
    input: { title: mode === 'hybrid' ? 'Employee Identity API Contract v1' : 'Native Successor Qualification', paragraphs: mode === 'hybrid' ? ['Contract version: employee-core/v1.', 'Employee identity: employeeId and tenantId are required immutable strings. Cross-tenant identity reuse is forbidden.', 'GET /v1/employees/{employeeId} returns employeeId, tenantId, displayName and employmentStatus. Unknown identities return 404.', 'Recruiting and Onboarding reference employeeId and tenantId. Breaking changes require a new contract version.'] : ['Independent verification precedes enterprise acceptance.'], outputPath: 'docs/qualification.md' } };
  const verification = { reference: VERIFY_DOCUMENT_OPERATION, digest: VERIFY_DOCUMENT_OPERATION_DIGEST,
    input: { path: 'docs/qualification.md', expectedContentSha256: `sha256:${sha256Hex(renderMarkdownCandidate(operation).content)}` } };
  async function registerNativePair(prefix: string, operation: any, verification: any, contextVerifierId: string) {
  const factories: any = {};
  for (const [purpose, workload, factoryPurpose] of [['producer', operation, 'SOFTWARE'], ['verifier', verification, 'VERIFICATION']] as const) {
    const workflowId = await step(prefix + '-' + purpose + 'Workflow', () => mutate('workflows:registerProduction', { projectId: s.projectId, workflowId: `${prefix}-${purpose}`,
      name: `Native deterministic ${purpose}`, description: 'Isolated deterministic qualification. No inference or publication authority.', topology: 'LINEAR', maxConcurrency: 1, agents: [], active: true,
      steps: [{ id: 'execute', kind: 'DETERMINISTIC', agent: '', retryLimit: 0, timeoutMinutes: 1, input: JSON.stringify(workload), expects: 'Validated deterministic result',
        outputSchema: { type: 'object', required: ['status'], properties: { status: { type: 'string' } } } }] }));
    const definitionId = await step(prefix + '-' + purpose + 'Factory', () => mutate('factory/configuration:create', { repositoryId, name: `${prefix} ${purpose}`, purpose: factoryPurpose, isolatedQualification: true }));
    const versionId = await step(prefix + '-' + purpose + 'FactoryVersion', () => mutate('factory/configuration:createVersion', { factoryDefinitionId: definitionId, workflowId,
      executionProfileId: profiles[purpose].executionProfileId, codeScopeIds: [scope.scopeId], agentBindings: [], policyEnvelopeId: policy._id, environmentId: s.environmentId,
      budget: { maxCostUsd: 0.01, maxRuntimeMinutes: 1, maxAttempts: 3 }, verifierIds: [contextVerifierId], riskBoundary: 'GREEN', recovery: { pause: false, cancel: true, retry: true, resume: false } }));
    factories[purpose] = { definitionId, versionId };
    const detail = await query('factory/configuration:getDetail', { factoryDefinitionId: definitionId });
    const v = detail.versions.find((v: any) => v._id === versionId);
    factoryVersionBindings.push({ factoryDefinitionVersionId: versionId, factoryConfigurationDigest: v.configurationDigest, adapter: v.executor.adapter, version: v.executor.version,
      capabilityManifestSha256: v.harnessCapabilityManifestDigest, effectiveConfigSha256: v.harnessEffectiveConfigSha256, runtimeArtifactSha256: v.harnessRuntimeArtifactDigest,
      executionBackend: 'isolated-container', inferenceConstraint: { schema: 'factory-inference-constraint/v1', mode: 'DENIED' }, sandboxProfileDigest: v.sandboxProfileDigest, repositoryId });
  }
  await step(prefix + '-boundHost', reportHost);
  for (const purpose of ['producer', 'verifier']) await step(prefix + '-' + purpose + 'Activation', () => mutate('factory/configuration:activate', {
    factoryDefinitionVersionId: factories[purpose].versionId, target: 'QUALIFICATION', evidenceReference }));
  return factories;
  }
  const factories = await registerNativePair('native-successor', operation, verification, contextVerifierId);
  state.prepared = true;
  await writeFile(join(output, 'journey.json'), JSON.stringify(state, null, 2) + '\n');
  if (mode === 'prepare') console.log(JSON.stringify({ preparation: 'PASS', nativeExecution: 'NOT_RUN' }));
  else executionQualification: {
    const author = db.client('user_SyntheticPlanAuthorQualification');
    const sofie = new SofieEnterpriseContractFixture({
      createDraft: (args: any) => mutate('missions:createDraft', args),
      get: (missionId: string) => query('missions:get', { missionId }),
      accept: (args: any) => mutate('missions:accept', args),
    });
    await step('sofieProposal', async () => sofie.propose('Build an Agentic HR platform.'));
    const missionArgs = { projectId: s.projectId, idempotencyKey: 'native-successor-mission',
      title: mode === 'hybrid' ? 'Build the Employee Core, Recruiting and Onboarding foundation.' : 'Native successor executed settlement', objective: mode === 'hybrid' ? 'Execute native and delegated WorkOrders and independently verify an exact downstream integration proof.' : 'Render and independently verify one exact unpublished synthetic document.',
      context: 'Isolated qualification only.', constraints: ['No paid inference', 'No publication', 'No production authority'],
      sourceOfTruthRefs: [{ kind: 'REPO', label: 'Admitted fixture', location: 'docs/qualification.md' }], owner: s.operatorId,
      ownerMemberId: s.memberId, owningTeamId: s.teamId, repositoryId, codeScopeIds: [scope.scopeId], executionEnvironment: 'LOCAL', budgetUsd: 0.1, maxReadOnlyConcurrency: 2, maxCorrectiveIterations: 1,
      stopCondition: 'Stop after all approved WorkOrders are independently verified, accepted and settled; no publication.', metadata: { synthetic: true, qualificationOnly: true, ...(mode === 'hybrid' ? { enterpriseCompatibilityFixture: true } : {}) } };
    await assert.rejects(() => sofie.authorizePlanning(false, missionArgs));
    const missionResult = await step('mission', () => sofie.authorizePlanning(true, missionArgs));
    const duplicateMission = await step('duplicateMission', () => sofie.authorizePlanning(true, missionArgs));
    assert.equal(duplicateMission.mission._id, missionResult.mission._id);
    assert.equal(duplicateMission.created, false);
    const missionId = missionResult.mission._id;
    await mutate('softwareFactoryControlPlane:assignMissionMember', { tenantId: s.tenantId, projectId: s.projectId, missionId,
      memberId: s.authorMemberId, teamId: s.teamId, role: 'CONTRIBUTOR' });
    if (mode === 'hybrid') await finalizeHybridSpec({ mutate, step, projectId: s.projectId, missionId, repositoryId, scopeId: scope.scopeId });
    const planDraft: any = { projectId: s.projectId, missionId, idempotencyKey: 'native-successor-plan',
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
      metadata: { synthetic: true, qualificationOnly: true, nativeEngineeringTariffPolicy: NATIVE_ENGINEERING_TARIFF_POLICY } };
    if (mode === 'hybrid') {
      const primary = planDraft.workOrderBlueprints[0];
      primary.title = 'Shared HR Contracts';
      primary.desiredOutcome = 'Versioned Employee identity and API contract document.';
      state.referenceMission = { sharedHrContracts: 'EXECUTED_DOCUMENT', recruitingUi: 'NOT_RUN', integration: 'PROOF_DOCUMENT_ONLY', reason: 'Pinned MyFactory FactoryVersion qualifies only a protected slug utility. Recruiting UI needs a separately qualified fixture.' };
      planDraft.assertions.push(...['delegated-slug', 'integration-proof'].map(id => ({ ...planDraft.assertions[0], assertionId: id,
        title: id, outcome: id === 'delegated-slug' ? 'Protected MyFactory slug behavior passes.' : 'The proof document binds both exact completed predecessor handoffs.' })));
      planDraft.workOrderBlueprints.push({ ...primary, id: 'delegated-slug', title: 'Recruiting UI dependency qualification (slug fixture only)', sequence: 2,
        constraints: ['Only the approved MyFactory slug fixture path may change'], workflowId: 'native-successor-producer', desiredOutcome: 'Execute the preserved deterministic MyFactory slug fixture with signed independent verification.', assertionIds: ['delegated-slug'],
        implementationPolicy: { ...primary.implementationPolicy, timeoutMinutes: 3, maxLinesChanged: 100 } },
        { ...primary, id: 'integration-proof', title: 'Integrate exact predecessor proofs', sequence: 3, workflowId: 'native-successor-producer',
          constraints: ['Only docs/integration.md may change'], desiredOutcome: 'Produce a deterministic document containing both exact predecessor candidate and handoff identities.',
          assertionIds: ['integration-proof'], dependsOnBlueprintIds: ['native-document', 'delegated-slug'],
          implementationPolicy: { ...primary.implementationPolicy, maxLinesChanged: 50 } });
    }
    if (mode === 'hybrid') for (const assertion of planDraft.assertions) { assertion.sourceRequirementIds = ['REQ-001']; assertion.sourceAcceptanceExpectationIds = ['AC-001']; assertion.sourceVerificationExpectationIds = ['VERIFY-001']; }
    const planResult = await step('plan', () => mutate('missions:savePlanDraft', planDraft, author));
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
    const serviceGrants = new Map<string, string>();
    const serviceCapabilities = new Set(['attempts.claim', 'attempts.renew', 'attempts.report', 'verification:claim', 'verification:renew', 'verification:report']);
    const scopedServiceClient = new Proxy(db.owner, { get(target, name) {
      if (name === 'action') return async (reference: any, command: any) => {
        if (!serviceCapabilities.has(command?.envelope?.capability)) return target.action(reference, command);
        const payload = JSON.parse(command.payloadJson);
        if (!serviceGrants.has(payload.workflowRunId)) {
          const verification = command.envelope.capability.startsWith('verification:');
          const grantArgs = { workflowRunId: payload.workflowRunId,
            serviceId: command.envelope.serviceId, capabilities: verification
              ? ['verification:claim', 'verification:renew', 'verification:report'] : ['attempts.claim', 'attempts.renew', 'attempts.report'],
            expiresAt: Date.now() + 600_000, reason: 'Explicit synthetic owner approval for this exact zero-charge qualification Attempt; no paid or publication authority.' };
          await assert.rejects(() => db.anonymous.action(reference, command), /SERVICE_ATTEMPT_AUTHORITY_REQUIRED/);
          await assert.rejects(() => mutate('missionServiceAuthority:grant', grantArgs, db.peer));
          await assert.rejects(() => mutate('missionServiceAuthority:grant', grantArgs, db.other));
          const grant = await mutate('missionServiceAuthority:grant', grantArgs);
          const saved = await query('nativeFixture:inspectRecord', { id: grant });
          for (const patch of [{ expiresAt: Date.now() - 1 }, { revokedAt: Date.now() },
            ...['serviceId', 'ownerOperatorId', 'tenantId', 'missionId', 'workOrderId', 'workflowRunId', 'factoryId', 'factoryDefinitionVersionId', 'configurationDigest', 'executionManifestDigest', 'dependencyDigest'].map(key => ({ metadata: { ...saved.metadata, [key]: 'wrong-binding' } })),
            { metadata: { ...saved.metadata, allowedEffects: [] } }]) {
            await mutate('nativeFixture:fault', { id: grant, patch });
            await assert.rejects(() => db.anonymous.action(reference, command), /SERVICE_ATTEMPT_AUTHORITY_REQUIRED/);
            await mutate('nativeFixture:fault', { id: grant, patch: { metadata: saved.metadata, expiresAt: saved.expiresAt }, unset: ['revokedAt'] });
          }
          const delegatedWorkOrder = await query('nativeFixture:inspectRecord', { id: saved.workOrderId });
          if (delegatedWorkOrder.dependencies?.length) {
            const handoffs = (await query('nativeFixture:inspect', {table:'missionHandoffs'})).filter((h: any) => delegatedWorkOrder.dependencies.includes(h.workOrderId));
            const deniedIds = handoffs.flatMap((h: any) => [h._id,h.workOrderId,h.workflowRunId,...h.artifactIds]);
            const probe = await mutate('isolationFixture:serviceInputProbe', {claim:{serviceId:command.envelope.serviceId,workflowRunId:payload.workflowRunId,capability:command.envelope.capability,expiresAt:Date.now()+60000},ids:deniedIds});
            assert.ok(probe.length && probe.every((r: any)=>!r.visible&&!r.writable));
            await mutate('nativeFixture:fault',{id:saved.workOrderId,patch:{dependencies:[]}});
            await assert.rejects(()=>db.anonymous.action(reference,command),/SERVICE_ATTEMPT_AUTHORITY_REQUIRED/);
            await mutate('nativeFixture:fault',{id:saved.workOrderId,patch:{dependencies:delegatedWorkOrder.dependencies}});
            (state.dependencyInputIsolation ??= []).push({attemptId:payload.workflowRunId,identityOnly:true,directResourcesDenied:probe.length,changedDependenciesDenied:true});
          }
          serviceGrants.set(payload.workflowRunId, grant);
          (state.serviceIsolation ??= []).push({ attemptId: payload.workflowRunId, grantId: grant, credentialOnly: true,
            noGrantDenied: true, peerOwnerDenied: true, crossTenantDenied: true, expiryDenied: true, revokedDenied: true, tupleMutantsDenied: true });
        }
        return db.anonymous.action(reference, command);
      };
      const value = target[name]; return typeof value === 'function' ? value.bind(target) : value;
    } });
    let lostExecutionAck = false, duplicateDeliveries = 0, restarted = false, recoveryInitialPollCompleted = false;
    const recoveryClient = new Proxy(scopedServiceClient, { get(target, name) {
      if (name === 'action') return async (reference: any, command: any) => {
        const result = await target.action(reference, command);
        const payload = command?.payloadJson ? JSON.parse(command.payloadJson) : {};
        if (command?.envelope?.capability === 'attempts.report' && payload.packet?.terminal?.status === 'COMPLETED' && !lostExecutionAck) {
          lostExecutionAck = true;
          // The server committed the actual candidate/terminal report. Its ACK
          // is lost at this transport boundary; no replacement Result is made.
          throw Error('INJECTED_EXECUTION_ACK_LOSS');
        }
        if (payload.packet?.offlineExecution) {
          await assert.rejects(() => target.action(reference, command), /command-replay-detected/);
          const retry = createSignedServiceCommand({ capability: command.envelope.capability,
            projectId: command.envelope.projectId, repositoryId: command.envelope.repositoryId, payload });
          await target.action(reference, retry); duplicateDeliveries++;
        }
        return result;
      };
      const value = target[name]; return typeof value === 'function' ? value.bind(target) : value;
    } });
    const makeWorker = (client: any) => new FactoryAttemptWorker(client, registry, true, 15000, { ...DEFAULT_DEPENDENCIES,
      loadGithubAppPrivateKey: () => undefined, getGithubAppId: () => undefined }, { projectId: s.projectId, repositoryId }, { workerId: hostId, sessionId, maxConcurrentRuns: 2 });
    worker = makeWorker(mode === 'recovery' ? recoveryClient : scopedServiceClient);
    const deadline = Date.now() + 90000;
    let runs: any[] = [];
    while (Date.now() < deadline) {
      if (mode === 'recovery' && lostExecutionAck && !restarted && worker.status().activeRunIds.length === 0) {
        const before = await query('nativeFixture:inspect', { table: 'workflowRuns' });
        assert.equal(before.find((r: any) => r._id === dispatch.run._id)?.status, 'COMPLETED');
        assert.equal(before.find((r: any) => r.attemptPurpose === 'VERIFICATION')?.status, 'PENDING');
        assert.equal(executions, 1);
        await worker.stop(); await adapter.dispose(); await db.restart(); sessionId = randomUUID();
        adapter = await createAdapter();
        const restartedExecute = adapter.execute.bind(adapter);
        adapter.execute = (...args: any[]) => { executions++; return restartedExecute(...args); };
        registry = new HarnessAdapterRegistry([adapter]); worker = makeWorker(recoveryClient); restarted = true;
        await step('executionRecovery', async () => ({ lostExecutionAck, duplicateDeliveries, restarted,
          executionsBeforeRecovery: executions, verifierStateBeforeRecovery: 'PENDING', freshAdapter: true, freshRegistry: true }));
      }
      if (Date.now() - lastHostReportAt >= 5000) await reportHost();
      // Admit the producer once, then drain that controller without polling for
      // newly queued verification work. The fresh controller must admit it after
      // the lost ACK and restart; producer cleanup timing cannot change this cut.
      if (mode !== 'recovery' || restarted || !recoveryInitialPollCompleted) {
        await worker.tick();
        recoveryInitialPollCompleted = true;
      }
      runs = await query('nativeFixture:inspect', { table: 'workflowRuns' });
      const verifier = runs.find(r => r.attemptPurpose === 'VERIFICATION');
      if (verifier && ['COMPLETED', 'FAILED', 'CANCELED'].includes(verifier.status) && worker.status().activeRunIds.length === 0) break;
      const producer = runs.find(r => r._id === dispatch.run._id);
      if (['FAILED', 'CANCELED'].includes(producer?.status) && worker.status().activeRunIds.length === 0) break;
      await new Promise(r => setTimeout(r, 200));
    }
    await step('workerStatus', async () => worker!.status());
    await step('executedAttempts', async () => runs);
    state.attemptDurationsMs = runs.filter(r => r.completedAt && r.executionClaimedAt).map(r => ({ attemptId: r._id, purpose: r.attemptPurpose, durationMs: r.completedAt - r.executionClaimedAt, basis: 'canonical executionClaimedAt to completedAt' }));
    const detail = await step('workOrderAfterVerification', () => query('workOrders:get', { workOrderId: workOrder._id }));
    const verifier = runs.find(r => r.attemptPurpose === 'VERIFICATION');
    if (mode === 'unknown' || mode === 'cancel') {
      assert.equal(executions, 1); assert.equal(runs.length, 1);
      assert.ok(['FAILED', 'CANCELED'].includes(runs[0].status));
      if (mode === 'cancel') assert.equal(state.cancellation?.requested, true);
      const reservation = runs[0].executionCostAuthorization.enterprise;
      const readback = await step('unknownExposure', () => query('factory/nativeAccounting:readback', { workflowRunId: dispatch.run._id }));
      assert.equal(readback.attemptExposureMicrousd, reservation.ceilingMicrousd);
      await assert.rejects(() => mutate('factory/nativeAccounting:releaseUndispatched', { workflowRunId: dispatch.run._id, expectedReservationDigest: reservation.digest }));
      await worker.stop(); await db.restart(); sessionId = randomUUID(); worker = makeWorker(scopedServiceClient);
      await reportHost(); await worker.tick();
      const recovered = await step('unknownAfterRestart', () => query('factory/nativeAccounting:readback', { workflowRunId: dispatch.run._id }));
      assert.equal(recovered.attemptExposureMicrousd, reservation.ceilingMicrousd); assert.equal(executions, 1);
      const artifacts = await query('nativeFixture:inspect', { table: 'runArtifacts' });
      if (mode === 'unknown') assert.equal(artifacts.some((a: any) => a.metadata?.schema === 'factory-offline-attempt-evidence/v1'), false);
      const gate = await mutate('factory/enterpriseQualification:evaluate', { workOrderId: workOrder._id, idempotencyKey: 'unknown-gate' });
      assert.equal(gate.current.eligible, false);
      state[mode === 'unknown' ? 'unknownRecovery' : 'cancellationRecovery'] = 'PASS'; state.executions = executions; state.additionalExecutions = 0;
      await writeFile(join(output, 'journey.json'), JSON.stringify(state, null, 2) + '\n');
      console.log(JSON.stringify({ scenario: mode, result: 'PASS', exposureHeld: reservation.ceilingMicrousd, additionalExecutions: 0 }));
      break executionQualification;
    }
    if (runs.find(r => r._id === dispatch.run._id)?.status !== 'COMPLETED' || verifier?.status !== 'COMPLETED') {
      throw Error('Native producer/verifier execution incomplete: ' + JSON.stringify(runs.map(r => ({ id: r._id, purpose: r.attemptPurpose, status: r.status, error: r.error }))));
    }
    if (mode === 'recovery') {
      if (!lostExecutionAck || !restarted || duplicateDeliveries !== 2 || executions !== 2) throw Error('Execution recovery did not prove exactly two distinct executions');
      await step('executionRecoveryFinal', async () => ({ lostExecutionAck, restarted, duplicateDeliveries, executions, additionalExecutions: 0 }));
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
    if (mode === 'hybrid') {
      const byBlueprint = (id: string) => release.workOrders.find((wo: any) => wo.metadata?.missionBlueprintId === id);
      async function handoff(woId: string, runId: string, assertionId: string, artifactIds: string[]) {
        return step(assertionId + 'Handoff', () => mutate('missions:recordHandoff', { missionId, workOrderId: woId, workflowRunId: runId,
          idempotencyKey: assertionId + '-handoff', producingRole: 'WORKER', consumingRole: 'WORKER', outcome: 'COMPLETE',
          completedAssertionIds: [assertionId], incompleteAssertionIds: [], unknownAssertionIds: [], commands: [], artifactIds,
          knownRisks: ['Isolated deterministic qualification only; production integration is NOT_RUN.'], nextAction: 'Consume these exact immutable proof identities.' }));
      }
      const nativeSource = runs.find(r => r._id === dispatch.run._id);
      const nativeHandoff = await handoff(workOrder._id, nativeSource._id, 'exact-document', artifacts.filter((a: any) => a.workflowRunId === nativeSource._id).map((a: any) => a._id));
      const dispatchScope = { actorType: 'HUMAN', repositoryId, codeScopeIds: [scope.scopeId], owningTeamId: s.teamId,
        ownerMemberId: s.memberId, executionEnvironment: 'LOCAL', executorHostId: hostId };
      const delegated = await step('delegatedExecution', () => executeHybridDelegation({ provider: hybridProvider, db,
        workOrderId: byBlueprint('delegated-slug')._id, repositoryId, policyId: policy._id, dispatchScope, mutate, query, step }));
      const delegatedHandoff = await handoff(delegated.workOrderId, delegated.run._id, 'delegated-slug', delegated.artifactIds);
      const integrationOperation = { reference: RENDER_MARKDOWN_OPERATION, digest: RENDER_MARKDOWN_OPERATION_DIGEST,
        input: { title: 'Hybrid Mission Integration Proof', paragraphs: [
          'Native candidate: ' + nativeSource.verificationSubject.candidateSha,
          'Native handoff: ' + nativeHandoff.handoff._id,
          'Delegated candidate: ' + delegated.candidateCommit,
          'Delegated Result: ' + delegated.resultDigest,
          'Delegated handoff: ' + delegatedHandoff.handoff._id,
          'Production integration: NOT_RUN. Paid operations: 0.'
        ], outputPath: 'docs/integration.md' } };
      assert.ok(nativeSource.verificationSubject.candidateSha, 'Exact native candidate is required');
      const integrationVerification = { reference: VERIFY_DOCUMENT_OPERATION, digest: VERIFY_DOCUMENT_OPERATION_DIGEST,
        input: { path: 'docs/integration.md', expectedContentSha256: `sha256:${sha256Hex(renderMarkdownCandidate(integrationOperation).content)}` } };
      const integrationVerifier = await mutate('context/verifiers:create', { projectId: s.projectId, label: 'Exact hybrid integration proof',
        invariant: 'Frozen proof bytes bind both completed predecessor handoffs and candidate identities.', globPatterns: ['docs/integration.md'], idempotencyKey: 'hybrid-integration-verifier' });
      const integrationFactories = await registerNativePair('hybrid-integration', integrationOperation, integrationVerification, integrationVerifier);
      const integrationWO = byBlueprint('integration-proof');
      const integrationRevision = await mutate('workOrders:requestWorkOrderRevision', { workOrderId: integrationWO._id,
        idempotencyKey: 'hybrid-integration-frozen-operation', changeSummary: 'Bind exact completed predecessor identities to the integration workflow.',
        reason: 'Both immutable predecessor handoffs now exist.', patch: { workflowId: 'hybrid-integration-producer' } });
      if (integrationRevision.revision.status === 'PENDING_APPROVAL') await mutate('workOrders:approveWorkOrderRevision', { workOrderRevisionId: integrationRevision.revision._id });
      const revisedIntegration = await query('nativeFixture:inspectRecord', { id: integrationWO._id });
      for (const approvalType of revisedIntegration.requiredApprovals) {
        const approval = await mutate('workOrders:requestApprovalDecision', { workOrderId: integrationWO._id, approvalType,
          requestedAction: 'Approve the exact integration revision binding both completed predecessor handoffs.', idempotencyKey: 'hybrid-integration-' + approvalType });
        await mutate('workOrders:decideApprovalDecision', { approvalDecisionId: approval.approvalDecision._id, decision: 'APPROVE', reason: 'Exact unpublished integration proof only.' });
      }
      const integrationTask = await mutate('tasks:create', { projectId: s.projectId, workOrderId: integrationWO._id, title: 'Integrate exact hybrid proofs',
        type: 'DOCS', priority: 3, source: 'DASHBOARD', createdBy: 'HUMAN', createdByRef: 'user_SyntheticHandoffQualification', idempotencyKey: 'hybrid-integration-task' });
      for (const toStatus of ['ASSIGNED', 'READY']) {
        const transition = await mutate('tasks:transition', { projectId: s.projectId, taskId: integrationTask.task._id, toStatus, actorType: 'HUMAN',
          actorUserId: 'user_SyntheticHandoffQualification', reason: 'Both exact predecessor handoffs are complete.', idempotencyKey: 'hybrid-integration-' + toStatus });
        assert.equal(transition.success, true);
      }
      const integrationDispatchArgs = { ...dispatchScope,
        workOrderId: integrationWO._id, taskId: integrationTask.task._id, workflowId: 'hybrid-integration-producer',
        factoryDefinitionVersionId: integrationFactories.producer.versionId, idempotencyKey: 'hybrid-integration-dispatch' };
      const attemptsBeforeDependencyFault = (await query('nativeFixture:inspect', { table: 'workflowRuns' })).length;
      for (const predecessor of [workOrder, byBlueprint('delegated-slug')]) {
        const original = await query('nativeFixture:inspectRecord', { id: predecessor._id });
        await mutate('nativeFixture:fault', { id: predecessor._id, patch: { state: 'BLOCKED' } });
        try { await assert.rejects(() => mutate('workOrders:dispatch', integrationDispatchArgs), /predecessor-handoff-invalid/); }
        finally { await mutate('nativeFixture:fault', { id: predecessor._id, patch: { state: original.state } }); }
      }
      assert.equal((await query('nativeFixture:inspect', { table: 'workflowRuns' })).length, attemptsBeforeDependencyFault);
      await step('dependencyInvalidation', async () => ({ predecessors: 2, denied: 2, replacementAttempts: 0 }));
      const integrationDispatch = await step('integrationDispatch', () => mutate('workOrders:dispatch', integrationDispatchArgs));
      assert.equal(integrationDispatch.created, true);
      worker = makeWorker(scopedServiceClient);
      let integrationRuns: any[] = [];
      const integrationDeadline = Date.now() + 90000;
      while (Date.now() < integrationDeadline) {
        if (Date.now() - lastHostReportAt >= 5000) await reportHost();
        await worker.tick();
        integrationRuns = (await query('nativeFixture:inspect', { table: 'workflowRuns' })).filter((r: any) => r.workOrderId === integrationWO._id);
        const verifier = integrationRuns.find(r => r.attemptPurpose === 'VERIFICATION');
        if (verifier && ['COMPLETED', 'FAILED', 'CANCELED'].includes(verifier.status) && !worker.status().activeRunIds.length) break;
        if (integrationRuns.some(r => ['FAILED', 'CANCELED'].includes(r.status)) && !worker.status().activeRunIds.length) break;
        await new Promise(r => setTimeout(r, 200));
      }
      await worker.stop(); await step('integrationAttempts', async () => integrationRuns);
      assert.equal(integrationRuns.length, 2); assert.ok(integrationRuns.every(r => r.status === 'COMPLETED'));
      const integrationArtifacts = (await query('nativeFixture:inspect', { table: 'runArtifacts' })).filter((a: any) => a.workOrderId === integrationWO._id);
      const before = await mutate('factory/enterpriseQualification:evaluate', { workOrderId: integrationWO._id, idempotencyKey: 'hybrid-integration-before-settlement' });
      assert.equal(before.current.eligible, false);
      for (const run of integrationRuns) {
        const response = integrationArtifacts.find((a: any) => a.workflowRunId === run._id && a.metadata?.schema === 'factory-offline-attempt-evidence/v1');
        const args = { workflowRunId: run._id, responseArtifactId: response._id, expectedReservationDigest: run.executionCostAuthorization.enterprise.digest };
        await step('integrationSettlement-' + run._id, () => mutate('factory/nativeAccounting:settle', args));
        assert.equal((await mutate('factory/nativeAccounting:settle', args)).duplicate, true);
      }
      const gate = await step('integrationGate', () => mutate('factory/enterpriseQualification:evaluate', { workOrderId: integrationWO._id, idempotencyKey: 'hybrid-integration-gate' }));
      assert.equal(gate.current.eligible, true, JSON.stringify(gate.current));
      const accepted = await step('integrationAcceptance', () => mutate('workOrders:accept', { workOrderId: integrationWO._id, actorType: 'HUMAN',
        isolatedEnterpriseQualification: true, idempotencyKey: 'hybrid-integration-accept' }));
      assert.equal(accepted.accepted, true);
      await handoff(integrationWO._id, integrationDispatch.run._id, 'integration-proof', integrationArtifacts.filter((a: any) => a.workflowRunId === integrationDispatch.run._id).map((a: any) => a._id));
      if (resultConsumer) await step('completedEnterpriseResultConsumer', () => resultConsumer.qualify(missionId));
      const ownerReadback = await step('sofieNeedsYou', () => sofie.readback(missionId));
      assert.equal(ownerReadback.state, 'AWAITING_ACCEPTANCE');
      assert.equal(ownerReadback.acceptanceEligible, true);
      assert.ok(ownerReadback.needsYou);
      for (const client of [db.other, db.anonymous, db.peer]) assert.equal(await query('missions:get', { missionId }, client), null);
      await step('missionReadIsolation', async () => ({ crossTenant: 'DENIED', anonymous: 'DENIED',
        sameTenantOtherOwner: 'DENIED', strictOwnerIsolation: 'PASS' }));
      const missionAcceptance = await step('hybridMissionAcceptance', () => sofie.accept(missionId, s.operatorId));
      assert.equal(missionAcceptance.mission.state, 'DONE');
      await db.restart();
      const finalAccounting = await step('hybridDurableAccounting', () => query('factory/nativeAccounting:readback', { workflowRunId: integrationDispatch.run._id }));
      assert.equal(finalAccounting.projectExposureMicrousd, 0);
      const durableMission = await step('sofieDurableReadback', () => sofie.readback(missionId));
      assert.equal(durableMission.state, 'DONE');
      assert.equal(durableMission.needsYou, null);
      assert.equal(durableMission.workOrders.length, 3);
      assert.ok(durableMission.workOrders.every((wo: any) => wo.state === 'DONE'));
      assert.ok(durableMission.assertions.every((a: any) => a.status === 'PASS' && a.verificationReceiptId));
      await step('completedResultIsolation', async () => {
        for (const client of [db.other, db.anonymous, db.peer]) {
          assert.equal(await query('missions:get', { missionId }, client), null);
          assert.equal(await query('workOrders:get', { workOrderId: integrationWO._id }, client), null);
          assert.equal(await query('workflowRuns:getById', { id: integrationDispatch.run._id }, client), null);
          assert.deepEqual(await query('workflowRuns:listArtifacts', { workflowRunId: integrationDispatch.run._id }, client), []);
          assert.deepEqual(await query('workflowRuns:listEvents', { workflowRunId: integrationDispatch.run._id }, client), []);
          await assert.rejects(() => query('factory/nativeAccounting:readback', { workflowRunId: integrationDispatch.run._id }, client));
        }
        return { crossTenant: 'DENIED', sameTenantOtherOwner: 'DENIED', anonymous: 'DENIED', afterRestart: true };
      });
      state.sofieContract = 'PASS'; state.liveSofieIntegration = 'NOT_RUN';
      state.hybridMission = 'PASS'; state.nativeDelegatedAccounting = 'PASS';
    }

    await writeFile(join(output, 'journey.json'), JSON.stringify(state, null, 2) + '\n');
    console.log(JSON.stringify({ nativeExecution: 'PASS', nativeSettlement: 'PASS', producerAttemptId: dispatch.run._id, verifierAttemptId: verifier._id }));
  }
} catch (error) {
  state.failedAttempts = await query('nativeFixture:inspect', { table: 'workflowRuns' }).catch(() => []);
  state.failedWorkerStatus = worker?.status();
  state.failure = String(error); await writeFile(join(output, 'journey.json'), JSON.stringify(state, null, 2) + '\n'); throw error;
} finally {
  await worker?.stop(); await adapter?.dispose();
  const records: any = {};
  for (const table of ['workflowRuns', 'workOrders', 'runArtifacts', 'verificationReceipts', 'verificationRuns', 'qualityGateDecisions', 'evidenceEnvelopes', 'missionHandoffs', 'validationAssertions']) {
    records[table] = await query('nativeFixture:inspect', { table }).catch(() => []);
  }
  await writeFile(join(output, 'durable-records.json'), JSON.stringify(records, null, 2) + '\n');
  await resultConsumer?.stop();
  await db.stop(); await hybridProvider?.f.stop();
  const admitted = state.repositoryAdmission;
  if (admitted) {
    const parent = resolve(admitted.root, '..');
    const marker = JSON.parse(await readFile(join(parent, 'qualification-owner.json'), 'utf8'));
    assert.equal(marker.root, admitted.root); assert.equal(marker.fixtureId, admitted.fixtureId);
    assert.match(parent, /^\/private\/tmp\/mc-local-qualification-[a-f0-9]{32}$/);
    assert.equal((await lstat(parent)).isSymbolicLink(), false);
    const archive = join(output, 'candidates.bundle');
    execFileSync('git', ['-C', admitted.root, 'bundle', 'create', archive, '--all'], { stdio: 'pipe' });
    state.candidateArchiveDigest = 'sha256:' + sha256Hex(await readFile(archive));
    await rm(parent, { recursive: true });
    state.repositoryCleanup = 'VERIFIED';
  }
  assert.match(db.root, /\/mc-enterprise-1b-[A-Za-z0-9]+$/);
  assert.equal((await lstat(db.root)).isSymbolicLink(), false);
  await db.destroy(); state.databaseCleanup = 'VERIFIED';
  await writeFile(join(output, 'journey.json'), JSON.stringify(state, null, 2) + '\n');
  for (const [key, value] of Object.entries(savedEnvironment)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
}
// All worker, image and database cleanup has completed. Convex CLI child
// transport handles must not keep a finished qualification command resident.
process.exit(0);
