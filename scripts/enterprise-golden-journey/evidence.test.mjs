import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aggregate, suites, seal, verifySeal, validateHybrid } from './evidence.mjs';
const reports = () => suites.map(suite => ({ suite, status: 'PASS', source: { treeDigest: 'exact-tree' } }));
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
  assert.throws(() => validateHybrid({ hybridMission: 'PASS', nativeExecution: 'PASS' }, {}));
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
