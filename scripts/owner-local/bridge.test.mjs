// Owner confirmation bridge: single use, exact Work tuple and repository binding (no network, no backend; temporary runtime dir).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const RUNTIME = mkdtempSync(join(tmpdir(), 'owner-local-bridge-'));
process.env.OWNER_LOCAL_RUNTIME = RUNTIME;
for (const d of ['keys', 'config', 'mc', 'evidence']) mkdirSync(join(RUNTIME, d), { recursive: true, mode: 0o700 });
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
writeFileSync(join(RUNTIME, 'config', 'owner-confirmation.public.pem'), publicKey.export({ type: 'spki', format: 'pem' }));
writeFileSync(join(RUNTIME, 'keys', 'mc-sofie-connection-secret'), 'test-secret', { mode: 0o600 });
const { confirmStep, approvePermitsStep, claimOnce } = await import('./bridge.mjs');
const { OWNER_ID } = await import('./common.mjs');

const canonical = v => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object'
  ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v);
const sha = v => createHash('sha256').update(v).digest('hex');
const SETUP = { projectId: 'p', repository: 'local/dashboard', repositoryId: 'repo', codeScopeId: 'scope', applicationKeyId: 'k' };
const PLAN = 'a'.repeat(64), FV = 'f'.repeat(64);
let n = 0;
function confirmation(over = {}) {
  const request = 'Build a dashboard ' + (n++);
  const binding = { schema: 'myeve-owner-confirmation/v1', profile: 'myeve.private-beta.owner/v1', ownerId: OWNER_ID, request, requestSha256: sha(request),
    planSha256: PLAN, confirmCode: PLAN.slice(0, 12), confirmedAt: Date.now(), nonce: String(n), title: request, repository: 'local/dashboard',
    works: [1, 2, 3].map(stage => ({ stage, id: `w${stage}-${n}`, version: 2, generation: 1, maxCostUsd: 0.65, maxDurationSeconds: 600 })),
    enrollmentPins: { factoryVersion: FV, revision: 1, maxCostMicrousd: 650000, maxDurationSeconds: 600 }, ...over };
  return { binding, signature: sign(null, Buffer.from('myeve-owner-confirmation/v1\n' + canonical(binding)), privateKey).toString('base64url'), digest: sha(canonical(binding)) };
}
const tupleOf = id => sha('tuple:' + id);
function tuples(c, over = {}) {
  const document = { schema: 'myeve-owner-confirmation-tuples/v1', confirmationDigest: c.digest, connectionId: 'conn', enrollmentRevision: 1,
    works: c.binding.works.map(w => ({ stage: w.stage, id: w.id, version: w.version, generation: w.generation, tupleSha256: tupleOf(w.id) })), ...over };
  return { document, signature: sign(null, Buffer.from('myeve-owner-confirmation-tuples/v1\n' + canonical(document)), privateKey).toString('base64url') };
}
function stepADone(c) {
  appendFileSync(join(RUNTIME, 'evidence', 'mc-owner-approvals.jsonl'), JSON.stringify({ step: 'A', kind: 'STEP_COMPLETED', confirmationDigest: c.digest,
    result: { connectionId: 'conn', planDigest: 'pd', workOrders: [1, 2, 3].map(stage => ({ stage, workOrderId: `wo${stage}` })) } }) + '\n');
}
function owner(requests) {
  const calls = [];
  return { calls, query: async () => ({ requests }), mutation: async (_ref, args) => { calls.push(args); await new Promise(r => setTimeout(r, 20));
    return { document: { permitId: 'permit-' + args.requestId, approvalId: 'approval-' + args.requestId } }; } };
}
const request = (c, stage, over = {}) => ({ requestId: `r${stage}-${c.digest.slice(0, 6)}`, workOrderId: `wo${stage}`, planDigest: 'pd',
  work: { id: c.binding.works[stage - 1].id, version: 2, generation: 1, tupleSha256: tupleOf(c.binding.works[stage - 1].id) },
  admission: { factoryVersion: FV, maxCostMicrousd: 650000, maxDurationSeconds: 600 }, ...over });

test('claims are exclusive and durable', () => {
  claimOnce('test-claim', { x: 1 });
  assert.throws(() => claimOnce('test-claim', { x: 2 }), /CONFIRMATION_ALREADY_CLAIMED/);
  assert.throws(() => claimOnce('../escape', {}), /CLAIM_KEY_INVALID/);
});

test('step A: concurrent use of one confirmation reaches MissionControl exactly once', async () => {
  const c = confirmation(), calls = [];
  const fake = { mutation: async (ref) => { calls.push(ref); await new Promise(r => setTimeout(r, 20)); throw Error('stop after first write'); } };
  const deps = { setup: SETUP, owner: fake, planner: fake, admin: fake, envSet: () => undefined };
  const results = await Promise.allSettled([confirmStep(c, deps), confirmStep(c, deps), confirmStep(c, deps)]);
  assert.equal(calls.length, 1);
  assert.equal(results.filter(r => r.status === 'rejected' && /CONFIRMATION_ALREADY_CLAIMED/.test(r.reason.message)).length, 2);
  // A claimed confirmation that failed is never retried.
  await assert.rejects(confirmStep(c, deps), /CONFIRMATION_ALREADY_CLAIMED/);
  assert.equal(calls.length, 1);
});

test('step A and B refuse a signed repository other than the one MissionControl is scoped to, before any write', async () => {
  const c = confirmation({ repository: 'other/repo' }), calls = [];
  const fake = { mutation: async ref => { calls.push(ref); return {}; }, query: async () => ({ requests: [] }) };
  await assert.rejects(confirmStep(c, { setup: SETUP, owner: fake, planner: fake, admin: fake, envSet: () => undefined }), /CONFIRMATION_REPOSITORY_MISMATCH/);
  stepADone(c);
  await assert.rejects(approvePermitsStep({ ...c, tuples: tuples(c), requestIds: ['x'] }, { setup: SETUP, owner: fake }), /CONFIRMATION_REPOSITORY_MISMATCH/);
  await assert.rejects(confirmStep(confirmation(), { setup: { ...SETUP, repository: undefined }, owner: fake, planner: fake, admin: fake }), /CONFIRMATION_REPOSITORY_MISMATCH/);
  assert.equal(calls.length, 0);
});

test('step B requires the signed Work tuple and approves only a request whose tuple equals it', async () => {
  const c = confirmation(); stepADone(c);
  const good = request(c, 1), forged = request(c, 1, { requestId: 'forged', work: { ...good.work, tupleSha256: 'e'.repeat(64) } });
  const o = owner([good, forged]);
  await assert.rejects(approvePermitsStep({ ...c, requestIds: [good.requestId] }, { setup: SETUP, owner: o }), /TUPLES_REQUIRED/);
  const t = tuples(c);
  await assert.rejects(approvePermitsStep({ ...c, tuples: { ...t, document: { ...t.document, connectionId: 'other' } }, requestIds: [good.requestId] }, { setup: SETUP, owner: o }), /TUPLES_SIGNATURE/);
  await assert.rejects(approvePermitsStep({ ...c, tuples: tuples(c, { connectionId: 'other' }), requestIds: [good.requestId] }, { setup: SETUP, owner: o }), /TUPLES_INVALID/);
  await assert.rejects(approvePermitsStep({ ...c, tuples: tuples(c, { confirmationDigest: 'b'.repeat(64) }), requestIds: [good.requestId] }, { setup: SETUP, owner: o }), /TUPLES_INVALID/);
  await assert.rejects(approvePermitsStep({ ...c, tuples: t, requestIds: ['forged'] }, { setup: SETUP, owner: o }), /PERMIT_REQUEST_NOT_CONFIRMED/);
  await assert.rejects(approvePermitsStep({ ...c, tuples: t, requestIds: [good.requestId, 'forged'] }, { setup: SETUP, owner: o }), /EXACTLY_ONE/);
  assert.equal(o.calls.length, 0);
  const out = await approvePermitsStep({ ...c, tuples: t, requestIds: [good.requestId] }, { setup: SETUP, owner: o });
  assert.deepEqual(o.calls, [{ projectId: 'p', requestId: good.requestId }]);
  assert.equal(out.permits[0].workId, good.work.id);
});

test('step B: concurrent requests for the same Work approve exactly one permit', async () => {
  const c = confirmation(); stepADone(c);
  const a = request(c, 2), b = request(c, 2, { requestId: 'second-request-same-work' }), o = owner([a, b]), t = tuples(c);
  const results = await Promise.allSettled([a, b, a].map(r => approvePermitsStep({ ...c, tuples: t, requestIds: [r.requestId] }, { setup: SETUP, owner: o })));
  assert.equal(o.calls.length, 1);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.ok(results.filter(r => r.status === 'rejected').every(r => /CONFIRMATION_ALREADY_CLAIMED/.test(r.reason.message)));
  // A different stage Work of the same confirmation is still approvable once.
  await approvePermitsStep({ ...c, tuples: t, requestIds: [request(c, 3).requestId] }, { setup: SETUP, owner: owner([request(c, 3)]) });
});

test('step B refuses before step A completed and refuses limits beyond the confirmation', async () => {
  const c = confirmation(), o = owner([]);
  await assert.rejects(approvePermitsStep({ ...c, tuples: tuples(c), requestIds: ['x'] }, { setup: SETUP, owner: o }), /CONFIRMATION_STEP_ORDER/);
  stepADone(c);
  const over = request(c, 1, { admission: { factoryVersion: FV, maxCostMicrousd: 650001, maxDurationSeconds: 600 } });
  await assert.rejects(approvePermitsStep({ ...c, tuples: tuples(c), requestIds: [over.requestId] }, { setup: SETUP, owner: owner([over]) }), /PERMIT_REQUEST_NOT_CONFIRMED/);
});
