import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { json, sha256, validateHybrid } from './evidence.mjs';
const directory = resolve(process.argv[2]);
const journey = await json(join(directory, 'journey.json')), records = await json(join(directory, 'durable-records.json'));
const result = validateHybrid(journey, records);
const bundle = join(directory, 'candidates.bundle');
assert.equal('sha256:' + sha256(await readFile(bundle)), journey.candidateArchiveDigest);
const root = await mkdtemp(join(tmpdir(), 'golden-proof-'));
try {
  const git = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(['clone', '--bare', bundle, join(root, 'candidate.git')]);
  const show = object => git(['--git-dir=' + join(root, 'candidate.git'), 'show', object]);
  const native = result.candidates[0], integration = result.candidates[2];
  for (const c of [native, integration]) assert.equal(git(['--git-dir=' + join(root, 'candidate.git'), 'rev-parse', c.candidate + '^{tree}']), c.tree);
  const hr = show(native.candidate + ':docs/qualification.md');
  assert.match(hr, /employee-core\/v1/); assert.match(hr, /employeeId and tenantId/);
  const proof = show(integration.candidate + ':docs/integration.md');
  for (const identity of [native.candidate, result.candidates[1].candidate, journey.stages.delegatedExecution.resultDigest,
    journey.stages['exact-documentHandoff'].handoff._id, journey.stages['delegated-slugHandoff'].handoff._id]) assert.ok(proof.includes(identity));
} finally { await rm(root, { recursive: true }); }
const challenges = {
  'candidate-substitution': j => { j.stages.integrationGate.current.candidateRevision = 'f'.repeat(40); },
  'evidence-spoof': j => { j.stages.integrationGate.current.evidenceSetDigest = 'sha256:' + 'f'.repeat(64); },
  'partial-verification': (_, r) => { r.validationAssertions[0].status = 'UNKNOWN'; },
  'non-independent-verifier': j => { j.stages.integrationGate.current.verificationAttemptId = j.stages.integrationGate.current.sourceAttemptId; },
  'wrong-factory-version': j => { j.stages.delegatedExecution.binding.factoryVersion = '0'.repeat(64); },
  'stale-plan': j => { j.stages.delegatedExecution.binding.missionPlanId = 'stale'; },
  'budget-escalation': j => { j.stages.delegatedExecution.binding.maxSpendMicrousd++; },
  'unsettled-exposure': j => { j.stages.hybridDurableAccounting.projectExposureMicrousd = 1; },
  'publication-authority': j => { j.stages.delegatedExecution.binding.allowedEffects.push('publication'); },
  'missing-cleanup': j => { j.repositoryCleanup = 'UNKNOWN'; },
  'wrong-mission': (_, r) => { r.workOrders[0].missionId = 'other'; },
};
for (const [name, mutate] of Object.entries(challenges)) {
  const j = structuredClone(journey), r = structuredClone(records); mutate(j, r);
  assert.throws(() => validateHybrid(j, r), undefined, `Missing negative assertion: ${name}`);
}
console.log(JSON.stringify({ ...result, offlineChallenges: Object.keys(challenges), nativeCandidateBytes: 'VERIFIED',
  authenticationScope: 'Canonical ingress verified signatures during execution; this offline validator cross-checks retained records and bundle bytes. A digest manifest is integrity evidence, not an independent signature.' }, null, 2));
