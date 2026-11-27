import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { delegationAuthorityChecks, validateDelegationAuthorityControls } from '../qualification/delegation-authority-controls.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aggregate, suites, seal, verifySeal, validateHybrid, validateComposedExecution, lock, sha256 } from './evidence.mjs';
const reports = () => suites.map(suite => ({ suite, status: 'PASS', source: { sha: 'a'.repeat(40), dirty: false, treeDigest: 'exact-tree' } }));
test('all fixture checks passing cannot promote a release or claim cross-system PASS', () => {
  const report = aggregate(reports());
  assert.equal(report.deterministicChecks, 'PASS'); assert.equal(report.qualification, 'PARTIAL');
  assert.equal(report.releaseEligible, false); assert.equal(report.fullCrossSystem, 'NOT_RUN');
});
test('missing, failed, interrupted, duplicate, stale and invalid reports fail closed', () => {
  const r = reports(); r.pop(); assert.equal(aggregate(r).deterministicChecks, 'NOT_RUN');
  for (const status of ['FAIL', 'IN_PROGRESS']) { const r = reports(); r[0].status = status; assert.equal(aggregate(r).qualification, 'FAIL'); }
  assert.throws(() => aggregate([...reports(), reports()[0]]));
  const stale = reports(); stale[0].source.treeDigest = 'other'; assert.throws(() => aggregate(stale));
  const finding = reports(); finding[0].blockingFindings = ['STRICT_OWNER_ISOLATION']; assert.equal(aggregate(finding).qualification, 'FAIL');
  const unknown = reports(); unknown[0].status = 'SKIPPED'; assert.throws(() => aggregate(unknown));
  assert.throws(() => aggregate([]));
});
test('PASS labels and mocked empty Results are insufficient evidence', () => {
  assert.throws(() => validateHybrid({ hybridMission: 'PASS', nativeExecution: 'PASS', controllerSourceSha: 'a'.repeat(40), controllerDirty: false }, {}, 'a'.repeat(40)));
});
test('evidence mutation, deletion and historical manifest overwrite are rejected', async () => {
  const root = await mkdtemp(join(tmpdir(), 'golden-seal-'));
  try {
    await writeFile(join(root, 'report.json'), '{"status":"FAIL"}'); await seal(root); await verifySeal(root);
    await assert.rejects(seal(root), /EEXIST/);
    await writeFile(join(root, 'report.json'), '{"status":"PASS"}'); await assert.rejects(verifySeal(root), /Evidence changed/);
    await rm(join(root, 'report.json')); await assert.rejects(verifySeal(root), /ENOENT/);
  } finally { await rm(root, { recursive: true }); }
});

test('aggregate rejects dirty, missing and mismatched commit identities', () => {
  for (const mutate of [r=>{r.source.dirty=true;},r=>{delete r.source.dirty;},r=>{r.source.sha='b'.repeat(40);},r=>{delete r.source.sha;}]) {
    const candidates=reports();mutate(candidates[0]);assert.throws(()=>aggregate(candidates));
  }
});
test('hybrid verifier rejects wrong or dirty controller before considering PASS labels', () => {
  for(const controllerDirty of [true,undefined])assert.throws(()=>validateHybrid({controllerSourceSha:'a'.repeat(40),controllerDirty},{},'a'.repeat(40)),/Committed controller/);
  assert.throws(()=>validateHybrid({controllerSourceSha:'b'.repeat(40),controllerDirty:false},{},'a'.repeat(40)),/Controller source/);
  assert.throws(()=>validateHybrid({controllerSourceSha:'a'.repeat(40),controllerDirty:false},{},undefined),/Expected source/);
});
test('evidence seal rejects added files, nested manifests and symlink parents', async()=>{
  const root=await mkdtemp(join(tmpdir(),'golden-seal-added-'));
  try {
    await writeFile(join(root,'report.json'),'{}');await mkdir(join(root,'nested'));await writeFile(join(root,'nested','manifest.json'),'{}');await seal(root);await verifySeal(root);
    await writeFile(join(root,'added.json'),'{}');await assert.rejects(verifySeal(root),/inventory/);await rm(join(root,'added.json'));
    await writeFile(join(root,'nested','manifest.json'),'{"changed":true}');await assert.rejects(verifySeal(root),/Evidence changed/);
    await rm(join(root,'nested'),{recursive:true});await symlink(tmpdir(),join(root,'nested'));await assert.rejects(verifySeal(root),/symlinks/);
  } finally {await rm(root,{recursive:true});}
});

// These are verifier contract fixtures, not claims of live execution.
const expectedSourceSha = 'a'.repeat(40);
async function hybridFixture() {
  const q = JSON.parse(await readFile(new URL('../../convex/__tests__/fixtures/hostFactoryQualification.json', import.meta.url)));
  const local = JSON.parse(q.configurationCanonical).local;
  const missionId = 'mission', planId = 'plan';
  const stages = {
    mission: { mission: { _id: missionId } }, plan: { plan: { _id: planId } },
    duplicateMission: { mission: { _id: missionId }, created: false },
    dispatch: { run: { _id: 'dispatch' } }, duplicateDispatch: { run: { _id: 'dispatch' }, created: false },
    hybridMissionAcceptance: { mission: { _id: missionId, currentPlanId: planId, state: 'DONE' } },
    sofieNeedsYou: { state: 'AWAITING_ACCEPTANCE', needsYou: {} }, sofieDurableReadback: { state: 'DONE', needsYou: null },
    hybridDurableAccounting: { projectExposureMicrousd: 0 }, dependencyInvalidation: { predecessors: 2, denied: 2, replacementAttempts: 0 },
    gateBeforeSettlement: { current: { eligible: false } }, productionAcceptanceDenied: { accepted: false },
    delegatedExecution: {
      authorityControls: [...delegationAuthorityChecks], admissionRequests: 1,
      binding: { missionId, missionPlanId: planId, factoryVersion: q.factoryVersion,
        executionProfileDigest: 'sha256:' + q.configurationDigest, baseCommit: lock.myFactoryFixtureSource,
        allowedEffects: ['repository.read', 'sandbox.write', 'candidate.create', 'verification.request'], maxSpendMicrousd: 80 },
      verifiedExecutionIdentity: { factoryVersion: q.factoryVersion, sourceDigest: q.sourceDigest,
        configurationDigest: q.configurationDigest, runtimeSha256: local.runtimeSha256, hostQualificationSha256: local.hostQualificationSha256 },
      resultDigest: 'sha256:' + 'd'.repeat(64),
    },
    'exact-documentHandoff': { handoff: { _id: 'native-handoff' } },
    'delegated-slugHandoff': { handoff: { _id: 'delegated-handoff' } },
  };
  const records = { workOrders: [], validationAssertions: [], missionHandoffs: [], workflowRuns: [], verificationReceipts: [], qualityGateDecisions: [] };
  for (const [i, name] of ['gateAfterSettlement', 'delegatedEnterpriseGate', 'integrationGate'].entries()) {
    const workOrderId = 'wo-' + i, sourceAttemptId = 'producer-' + i, verificationAttemptId = 'verifier-' + i;
    const candidateRevision = String(i + 1).repeat(40), evidenceSetDigest = 'sha256:' + String(i + 1).repeat(64);
    const verificationReceiptId = 'receipt-' + i, gateId = 'gate-' + i;
    stages[name] = { gate: { _id: gateId }, current: { eligible: true, current: true, evidenceSetDigest,
      sourceAttemptId, verificationAttemptId, candidateRevision, verificationReceiptId,
      exactIdentity: { workOrderId, verificationSubjectDigest: evidenceSetDigest } } };
    records.workOrders.push({ _id: workOrderId, state: 'DONE', missionId, missionPlanId: planId });
    records.validationAssertions.push({ status: 'PASS', verificationReceiptId });
    records.missionHandoffs.push({ missionId, outcome: 'COMPLETE', unknownAssertionIds: [], incompleteAssertionIds: [] });
    records.workflowRuns.push({ _id: sourceAttemptId, workOrderId, status: 'COMPLETED',
      verificationSubject: { candidateSha: candidateRevision, treeSha: '4'.repeat(40), digest: evidenceSetDigest },
      enterpriseSettlement: { chargedMicrousd: 0, reservationDigest: evidenceSetDigest }, executionCostAuthorization: { enterprise: { digest: evidenceSetDigest } } },
    { _id: verificationAttemptId, workOrderId, status: 'COMPLETED', attemptPurpose: 'VERIFICATION' });
    records.verificationReceipts.push({ _id: verificationReceiptId, independenceValid: true, candidateRevision });
    records.qualityGateDecisions.push({ _id: gateId, evidenceSetDigest, candidateRevision, workOrderId });
  }
  return { journey: { controllerSourceSha: expectedSourceSha, controllerDirty: false, paidOperations: 0,
    productionIntegration: 'NOT_RUN', executableProductionGrants: 0, externalAlphaChanges: 0,
    repositoryCleanup: 'VERIFIED', databaseCleanup: 'VERIFIED', delegatedHostQualification: q,
    nativeExecution: 'PASS', hybridMission: 'PASS', nativeDelegatedAccounting: 'PASS', stages }, records };
}

test('composed execution validates durable proof and retains exact controller identity', async () => {
  const { journey, records } = await hybridFixture(), source = { sha: expectedSourceSha, dirty: false };
  const result = validateComposedExecution(journey, records, source);
  assert.deepEqual([result.native, result.hybrid, result.accounting], ['PASS', 'PASS', 'PASS']);
  assert.equal(result.proof.controllerSourceSha, expectedSourceSha);
  assert.equal(result.proof.missionId, 'mission'); assert.equal(result.proof.candidates.length, 3);
  for (const mutate of [j => { j.stages.integrationGate.current.candidateRevision = 'forged'; },
    j => { j.controllerSourceSha = 'b'.repeat(40); }, j => { j.nativeDelegatedAccounting = 'FAIL'; }]) {
    const altered = structuredClone(journey); mutate(altered);
    assert.throws(() => validateComposedExecution(altered, records, source));
  }
  assert.throws(() => validateComposedExecution(journey, {}, source));
  for (const dirty of [true, undefined]) assert.throws(() => validateComposedExecution(journey, records, { ...source, dirty }), /must be clean/);
});

for (const control of delegationAuthorityChecks) test(`hybrid proof rejects missing delegation control: ${control}`, async () => {
  const { journey, records } = await hybridFixture();
  journey.stages.delegatedExecution.authorityControls = delegationAuthorityChecks.filter(x => x !== control);
  assert.throws(() => validateHybrid(journey, records, expectedSourceSha), /control manifest/);
});
test('delegation manifest rejects missing, duplicate, substituted and extra controls and invalid admissions', async () => {
  const { journey, records } = await hybridFixture(), execution = journey.stages.delegatedExecution;
  validateDelegationAuthorityControls(execution);
  for (const authorityControls of [undefined, null, 'PASS', [], [...delegationAuthorityChecks, delegationAuthorityChecks[0]],
    [...delegationAuthorityChecks.slice(1), delegationAuthorityChecks[1]], [...delegationAuthorityChecks, 'unknown'],
    ['unknown', ...delegationAuthorityChecks.slice(1)]]) {
    execution.authorityControls = authorityControls;
    assert.throws(() => validateHybrid(journey, records, expectedSourceSha), /control manifest/);
  }
  execution.authorityControls = [...delegationAuthorityChecks].reverse();
  for (const admissionRequests of [undefined, null, 0, 2, '1', true]) {
    execution.admissionRequests = admissionRequests;
    assert.throws(() => validateHybrid(journey, records, expectedSourceSha), /one actual delegation admission/);
  }
  execution.admissionRequests = 1; validateHybrid(journey, records, expectedSourceSha);
});

test('composed CLI rejects dirty controller before any fixture or runtime execution', async () => {
  const root = await mkdtemp(join(tmpdir(), 'composed-dirty-'));
  const git = args => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  try {
    git(['init']); git(['-c', 'user.name=Qualification fixture', '-c', 'user.email=fixture@invalid', 'commit', '--allow-empty', '-m', 'fixture']);
    await writeFile(join(root, 'uncommitted'), 'dirty');
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./run-composed.mjs', import.meta.url)), join(root, 'output')],
      { cwd: root, encoding: 'utf8', env: { ...process.env, MC_COMPOSED_MYEVE_ROOT: '', MC_LOCAL_MYFACTORY_ROOT: '' } });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /Committed controller source must be clean/);
    assert.doesNotMatch(result.stderr, /Missing MC_COMPOSED/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('offline verifier emits expected and observed SHA with validated candidate bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hybrid-verifier-'));
  try {
    const repo = join(root, 'repo'); await mkdir(repo); await mkdir(join(repo, 'docs'));
    const git = args => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: 'pipe' }).trim();
    const commit = () => { git(['add', '.']); git(['-c', 'user.name=Qualification fixture', '-c', 'user.email=fixture@invalid', 'commit', '-m', 'fixture']); return git(['rev-parse', 'HEAD']); };
    git(['init']); await writeFile(join(repo, 'docs/qualification.md'), 'employee-core/v1 employeeId and tenantId');
    const native = commit(); await writeFile(join(repo, 'slug.mjs'), 'export const slug = "fixture";'); const delegated = commit();
    const { journey, records } = await hybridFixture();
    await writeFile(join(repo, 'docs/integration.md'), [native, delegated, journey.stages.delegatedExecution.resultDigest, 'native-handoff', 'delegated-handoff'].join('\n'));
    const integration = commit();
    for (const [i, name] of ['gateAfterSettlement', 'delegatedEnterpriseGate', 'integrationGate'].entries()) {
      const candidate = [native, delegated, integration][i]; journey.stages[name].current.candidateRevision = candidate;
      records.workflowRuns[i * 2].verificationSubject.candidateSha = candidate;
      records.workflowRuns[i * 2].verificationSubject.treeSha = git(['rev-parse', candidate + '^{tree}']);
      records.verificationReceipts[i].candidateRevision = candidate; records.qualityGateDecisions[i].candidateRevision = candidate;
    }
    git(['bundle', 'create', join(root, 'candidates.bundle'), '--all']);
    journey.candidateArchiveDigest = 'sha256:' + sha256(await readFile(join(root, 'candidates.bundle')));
    await writeFile(join(root, 'journey.json'), JSON.stringify(journey)); await writeFile(join(root, 'durable-records.json'), JSON.stringify(records));
    const output = execFileSync(process.execPath, [fileURLToPath(new URL('./verify.mjs', import.meta.url)), root, expectedSourceSha], { encoding: 'utf8', stdio: 'pipe' });
    const result = JSON.parse(output);
    assert.equal(result.expectedSourceSha, expectedSourceSha); assert.equal(result.controllerSourceSha, expectedSourceSha);
    assert.equal(result.nativeCandidateBytes, 'VERIFIED'); assert.equal(result.candidates.length, 3);
    assert.ok(result.offlineChallenges.includes('missing-delegation-controls'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
