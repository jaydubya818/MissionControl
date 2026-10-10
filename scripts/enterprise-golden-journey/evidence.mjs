import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const json = async path => JSON.parse(await readFile(path, 'utf8'));
export const lock = await json(new URL('./source-lock.json', import.meta.url));
export const suites = ['contracts', 'database-concurrency', 'native-execution', 'delegated-execution', 'hybrid-mission', 'sofie-integration', 'browser-journey', 'security-recovery'];
export async function sourceIdentity(root = process.cwd()) {
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const names = [...new Set(git(['ls-files', '--cached', '--others', '--exclude-standard']).split('\n'))].sort();
  const files = {};
  for (const name of names) {
    try { const stat = await lstat(join(root, name)); if (stat.isFile()) files[name] = sha256(await readFile(join(root, name))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; files[name] = 'DELETED'; }
  }
  return { sha: git(['rev-parse', 'HEAD']), dirty: Boolean(git(['status', '--porcelain'])), treeDigest: sha256(JSON.stringify(files)), files };
}
export async function seal(directory) {
  const files = {};
  async function visit(dir) {
    for (const name of (await readdir(dir)).sort()) {
      const path = join(dir, name), stat = await lstat(path);
      assert.equal(stat.isSymbolicLink(), false, 'Evidence symlinks are forbidden');
      if (stat.isDirectory()) await visit(path);
      else if (name !== 'manifest.json') files[relative(directory, path)] = sha256(await readFile(path));
    }
  }
  await visit(directory);
  await writeFile(join(directory, 'manifest.json'), JSON.stringify({ schema: 'golden-evidence-manifest/v1', files }, null, 2) + '\n', { flag: 'wx' });
}
export async function verifySeal(directory) {
  const manifest = await json(join(directory, 'manifest.json'));
  assert.equal(manifest.schema, 'golden-evidence-manifest/v1');
  assert.ok(manifest.files['report.json']);
  for (const [name, hash] of Object.entries(manifest.files)) {
    const path = resolve(directory, name);
    assert.ok(path.startsWith(resolve(directory) + '/'));
    assert.equal((await lstat(path)).isSymbolicLink(), false);
    assert.equal(sha256(await readFile(path)), hash, `Evidence changed: ${name}`);
  }
  return manifest;
}
export function validateHybrid(j, records) {
  assert.equal(j.error, undefined); assert.equal(j.failure, undefined);
  assert.equal(j.paidOperations, 0); assert.equal(j.productionIntegration, 'NOT_RUN');
  assert.equal(j.executableProductionGrants, 0); assert.equal(j.externalAlphaChanges, 0);
  assert.equal(j.repositoryCleanup, 'VERIFIED'); assert.equal(j.databaseCleanup, 'VERIFIED');
  const s = j.stages, missionId = s.mission.mission._id, planId = s.plan.plan._id;
  assert.equal(s.duplicateMission.mission._id, missionId); assert.equal(s.duplicateMission.created, false);
  assert.equal(s.duplicateDispatch.run._id, s.dispatch.run._id); assert.equal(s.duplicateDispatch.created, false);
  assert.equal(s.hybridMissionAcceptance.mission._id, missionId);
  assert.equal(s.hybridMissionAcceptance.mission.currentPlanId, planId);
  assert.equal(s.hybridMissionAcceptance.mission.state, 'DONE');
  assert.equal(s.sofieNeedsYou.state, 'AWAITING_ACCEPTANCE'); assert.ok(s.sofieNeedsYou.needsYou);
  assert.equal(s.sofieDurableReadback.state, 'DONE'); assert.equal(s.sofieDurableReadback.needsYou, null);
  assert.equal(s.hybridDurableAccounting.projectExposureMicrousd, 0);
  assert.deepEqual(s.dependencyInvalidation, { predecessors: 2, denied: 2, replacementAttempts: 0 });
  assert.equal(records.workOrders.length, 3);
  assert.equal(records.validationAssertions.length, 3);
  assert.equal(records.missionHandoffs.length, 3);
  for (const a of records.validationAssertions) { assert.equal(a.status, 'PASS'); assert.ok(a.verificationReceiptId); }
  for (const h of records.missionHandoffs) { assert.equal(h.missionId, missionId); assert.equal(h.outcome, 'COMPLETE'); assert.deepEqual(h.unknownAssertionIds, []); assert.deepEqual(h.incompleteAssertionIds, []); }
  for (const wo of records.workOrders) { assert.equal(wo.state, 'DONE'); assert.equal(wo.missionId, missionId); assert.equal(wo.missionPlanId, planId); }
  const candidates = [];
  for (const stage of ['gateAfterSettlement', 'delegatedEnterpriseGate', 'integrationGate']) {
    const gate = s[stage].current;
    assert.equal(gate.eligible, true); assert.equal(gate.current, true);
    assert.match(gate.evidenceSetDigest, /^sha256:[a-f0-9]{64}$/);
    const producer = records.workflowRuns.find(r => r._id === gate.sourceAttemptId);
    const verifier = records.workflowRuns.find(r => r._id === gate.verificationAttemptId);
    assert.ok(producer && verifier); assert.notEqual(producer._id, verifier._id);
    assert.equal(producer.status, 'COMPLETED'); assert.equal(verifier.status, 'COMPLETED');
    assert.equal(verifier.attemptPurpose, 'VERIFICATION'); assert.equal(verifier.workOrderId, producer.workOrderId);
    assert.equal(gate.exactIdentity.workOrderId, producer.workOrderId);
    assert.equal(gate.candidateRevision, producer.verificationSubject.candidateSha);
    assert.equal(gate.exactIdentity.verificationSubjectDigest, producer.verificationSubject.digest);
    assert.equal(producer.enterpriseSettlement.chargedMicrousd, 0);
    assert.equal(producer.enterpriseSettlement.reservationDigest, producer.executionCostAuthorization.enterprise.digest);
    const receipt = records.verificationReceipts.find(r => r._id === gate.verificationReceiptId);
    assert.ok(receipt); assert.equal(receipt.independenceValid, true);
    assert.equal(receipt.candidateRevision, gate.candidateRevision);
    const stored = records.qualityGateDecisions.find(r => r._id === s[stage].gate._id);
    assert.ok(stored); assert.equal(stored.evidenceSetDigest, gate.evidenceSetDigest);
    assert.equal(stored.candidateRevision, gate.candidateRevision);
    assert.equal(stored.workOrderId, producer.workOrderId);
    candidates.push({ workOrderId: producer.workOrderId, attemptId: producer._id, verifierAttemptId: verifier._id,
      candidate: gate.candidateRevision, tree: producer.verificationSubject.treeSha, evidenceDigest: gate.evidenceSetDigest,
      reservation: producer.executionCostAuthorization.enterprise, settlement: producer.enterpriseSettlement });
  }
  assert.equal(new Set(candidates.map(c => c.workOrderId)).size, 3);
  const b = s.delegatedExecution.binding;
  assert.equal(b.missionId, missionId); assert.equal(b.missionPlanId, planId); assert.equal(b.factoryVersion, lock.factoryVersion);
  assert.equal(b.baseCommit, lock.myFactoryFixtureSource);
  assert.deepEqual(b.allowedEffects, ['repository.read', 'sandbox.write', 'candidate.create', 'verification.request']);
  assert.equal(b.maxSpendMicrousd, 80);
  assert.equal(s.gateBeforeSettlement.current.eligible, false);
  assert.equal(s.productionAcceptanceDenied.accepted, false);
  return { missionId, planId, candidates, factoryVersion: b.factoryVersion,
    qualifiedScope: 'DETERMINISTIC_HYBRID_PROOF', fullCrossSystem: 'NOT_RUN', recruitingUi: 'NOT_RUN' };
}
export function aggregate(reports) {
  const bySuite = new Map();
  for (const r of reports) {
    assert.ok(suites.includes(r.suite)); assert.ok(!bySuite.has(r.suite), 'Duplicate suite evidence');
    assert.ok(['PASS', 'FAIL', 'NOT_RUN', 'IN_PROGRESS'].includes(r.status)); bySuite.set(r.suite, r);
  }
  const identities = new Set(reports.map(r => r.source.treeDigest));
  assert.equal(identities.size, 1, 'Reports cover different source trees');
  const results = suites.map(suite => bySuite.get(suite) ?? { suite, status: 'NOT_RUN', reason: 'Missing suite evidence' });
  const failed = results.some(r => ['FAIL', 'IN_PROGRESS'].includes(r.status) || r.blockingFindings?.length);
  return { schema: 'enterprise-golden-qualification/v1', qualification: failed ? 'FAIL' : 'PARTIAL',
    deterministicChecks: failed ? 'FAIL' : results.every(r => r.status === 'PASS') ? 'PASS' : 'NOT_RUN',
    fullCrossSystem: 'NOT_RUN', releaseEligible: false, requiredCheckRecommended: false,
    blockers: ['LIVE_SOFIE_ADAPTER', 'AUTHENTICATED_OWNER_BROWSER_JOURNEY', 'RECRUITING_UI_FACTORY_VERSION', 'CLAUDE_OPUS_REVIEW'],
    source: reports[0]?.source, sourceLock: lock, suites: results,
    paidOperations: 0, productionIntegration: 'NOT_RUN', externalAlphaChanges: 0, publication: 'DISABLED' };
}
