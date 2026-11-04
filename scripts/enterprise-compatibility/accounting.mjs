import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { canonicalDigest, factoryDelegationBindingDigest } from '@mission-control/shared';
import { startFixtureDatabase } from './database.mjs';
import { compatibility } from './fixtures.mjs';
const checks = [], hash = 'sha256:' + 'a'.repeat(64);
let db;
const check = async (name, fn) => { await fn(); checks.push(name); console.log('PASS ' + name); };
const call = (name, args, client = db.owner) => client.mutation('accountingFixture:' + name, args, { skipQueue: true });
const mutation = (s, name, args, client = db.owner) => client.mutation('factory/enterpriseCompatibility:' + name, { projectId: s.projectId, ...args }, { skipQueue: true });
const fault = (id, patch) => db.owner.mutation('fixtureSeed:fault', { id, patch });
const inspect = id => db.owner.mutation('fixtureSeed:inspect', { id });
async function setup(limits) {
  await db?.destroy(); db = await startFixtureDatabase(process.cwd(), { canonicalAccounting: true });
  await call('configure', { seed: db.seed, ...limits });
  const a = await call('cloneWork', { seed: db.seed }), b = await call('cloneWork', { seed: db.seed });
  return [a, b];
}
async function delegation(s) {
  const now = Date.now(), id = randomUUID();
  const b = { schema: 'factory-delegation-binding/v1', delegationId: id, tenantId: s.tenantId, projectId: s.projectId,
    missionId: s.missionId, missionSpecRevisionId: s.missionSpecRevisionId, missionPlanId: s.missionPlanId, missionPlanRevision: 1,
    missionPlanDigest: canonicalDigest('mission-plan-fixture/v1', { revision: 1, summary: 'Fixture plan', blueprints: [], assertions: [] }),
    workOrderId: s.workOrderId, workOrderRevisionId: s.workOrderRevisionId, workOrderRevisionNumber: 1, taskId: s.taskId,
    workflowRunId: s.workflowRunId, executionManifestDigest: hash, qualityContractDigest: hash, authorityGeneration: 1,
    factoryId: 'accounting-local', factoryVersion: 'a'.repeat(64), executionProtocol: 'MYFACTORY_EXECUTION_V2', clientId: 'isolated', ownerScope: s.operatorId,
    partnerWorkId: randomUUID(), partnerWorkGeneration: 1, partnerRequestId: randomUUID(), partnerRequestDigest: 'a'.repeat(64),
    repositoryId: s.repositoryId, repository: 'fixture/source', baseCommit: 'b'.repeat(40), baseTree: 'c'.repeat(40),
    sourceSnapshotDigest: hash, executionProfileDigest: hash, modelPolicyDigest: hash, verificationPolicyDigest: hash,
    allowedEffects: ['repository.read', 'sandbox.write', 'candidate.create', 'verification.request'],
    budgetReservationId: id, maxSpendMicrousd: 80, issuedAt: now - 1000, expiresAt: now + 60000, deadline: now + 60000 };
  const config = { kind: 'MYFACTORY', factoryId: b.factoryId, factoryVersion: b.factoryVersion, definitionVersionId: s.definitionVersionId,
    capabilities: ['BOUNDED_DELEGATION', 'SIGNED_RESULT'], capacity: 10, admissionPolicy: 'FIXTURE_ONLY', compatibility,
    executionProvider: 'LOCAL_DOCKER_QUALIFICATION', localProviderSourceSha: 'e498c31db8b749fa91b0544ecd1d1a661b971c2c' };
  await mutation(s, 'register', { factoryDefinitionId: s.factoryDefinitionId, config });
  const registry = await db.owner.query('factory/enterpriseCompatibility:getRegistry', { projectId: s.projectId, factoryDefinitionId: s.factoryDefinitionId });
  if (registry.revision === 1) await mutation(s, 'assess', { factoryDefinitionId: s.factoryDefinitionId, expectedRevision: 1, health: 'HEALTHY', evidenceDigest: hash, validUntil: now + 600000, revoke: false });
  const plan = await inspect(s.missionPlanId);
  await fault(s.missionPlanId, { status: 'APPROVED', decidedActorSource: 'AUTHENTICATED', approvedBy: s.operatorId, approvedAt: now,
    metadata: { ...plan.metadata, enterpriseDelegationApprovals: { ...plan.metadata?.enterpriseDelegationApprovals,
    [id]: { bindingDigest: factoryDelegationBindingDigest(b), ownerActorId: s.operatorId } } } });
  return { missionId: s.missionId, factoryDefinitionId: s.factoryDefinitionId, binding: b };
}
try {
  for (const kinds of [['native', 'native'], ['delegated', 'delegated'], ['native', 'delegated']]) {
    const seeds = await setup();
    const requests = [];
    for (let i = 0; i < seeds.length; i++) requests.push(kinds[i] === 'native' ? null : await delegation(seeds[i]));
    await check(kinds.join('/') + ' race across WorkOrders reserves at most remaining Mission allowance', async () => {
      const result = await Promise.allSettled(seeds.map((s, i) => requests[i] ? mutation(s, 'admitTrial', requests[i]) : call('reserveNative', { seed: s })));
      assert.equal(result.filter(r => r.status === 'fulfilled').length, 1, JSON.stringify(result));
      assert.match(String(result.find(r => r.status === 'rejected').reason), /ENTERPRISE_BUDGET_EXHAUSTED/);
      assert.equal(await call('exposure', { seed: seeds[0] }), 80);
      const winner = result.findIndex(r => r.status === 'fulfilled');
      const s = seeds[winner], request = requests[winner];
      if (request) {
        const duplicate = await mutation(s, 'admitTrial', request); assert.equal(duplicate, result[winner].value);
        await assert.rejects(mutation(s, 'admitTrial', { ...request, binding: { ...request.binding, maxSpendMicrousd: 79 } }));
      } else await call('reserveNative', { seed: s });
      assert.equal(await call('exposure', { seed: s }), 80);
      await db.restart(); assert.equal(await call('exposure', { seed: s, dailyAt: Date.now() + 86400000 }), 80);
    });
  }
  await check('daily ceiling independently bounds a larger Mission', async () => {
    const [a, b] = await setup({ mission: 1000, daily: 100 });
    const result = await Promise.allSettled([a, b].map(seed => call('reserveNative', { seed })));
    assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
  });
  await check('foreign-owner reservation remains in shared project admission', async () => {
    const [a, b] = await setup({mission:1000,daily:100});
    const foreign = await call('moveWorkToPeerMission',{seed:a});
    await call('reserveNative',{seed:foreign},db.peer);
    await assert.rejects(call('reserveNative',{seed:b}),/ENTERPRISE_BUDGET_EXHAUSTED/);
    await assert.rejects(call('reserveNative',{seed:foreign},db.owner));
    assert.equal(await call('exposure',{seed:b}),80);
  });
  for (const table of ['factoryProviderReservations','inferenceReservations']) await check('foreign '+table+' cannot disappear from shared authority exclusion',async()=>{
    const [a,b]=await setup({mission:1000,daily:100});
    const foreign=await call('moveWorkToPeerMission',{seed:a});
    const id=await call('createForeignSharedAuthority',{seed:b,foreign,table});
    assert.equal(await db.owner.query('accountingFixture:readVisible',{id}),null);
    await assert.rejects(call('reserveNative',{seed:b}),/ENTERPRISE_SHARED_AUTHORITY_UNQUALIFIED/);
  });
  await check('concurrent duplicate reservation and unused settlement survive lost acknowledgment and restart', async () => {
    const [s] = await setup();
    const reservations = await Promise.all(Array.from({ length: 8 }, () => call('reserveNative', { seed: s })));
    assert.equal(new Set(reservations.map(a => a.authorizationDigest)).size, 1);
    const before = await inspect(s.workflowRunId);
    await call('settleUnused', { seed: s }); await db.restart();
    await Promise.all(Array.from({ length: 6 }, () => call('settleUnused', { seed: s })));
    assert.equal(await call('exposure', { seed: s }), 0);
    assert.deepEqual((await inspect(s.workflowRunId)).executionCostAuthorization, before.executionCostAuthorization);
    await assert.rejects(call('claim', { seed: s }));
  });
  await check('claim/settlement race cannot release dispatched exposure', async () => {
    const [s] = await setup(); await call('reserveNative', { seed: s });
    await Promise.allSettled([call('claim', { seed: s }), call('settleUnused', { seed: s })]);
    const run = await inspect(s.workflowRunId);
    assert.equal(await call('exposure', { seed: s }), run.lease ? 80 : 0);
    assert.equal(Boolean(run.lease && run.enterpriseSettlement), false);
  });
  await check('cancellation, expiry, terminal counters and restart retain UNKNOWN', async () => {
    const [s, other] = await setup(); await call('reserveNative', { seed: s }); await call('claim', { seed: s });
    await fault(s.workflowRunId, { status: 'CANCELED', reservedCostUsd: 0, cancellationRequestedAt: Date.now() });
    await assert.rejects(call('settleUnused', { seed: s })); await db.restart();
    assert.equal(await call('exposure', { seed: s, dailyAt: Date.now() + 86400000 }), 80);
    await assert.rejects(call('reserveNative', { seed: other }));
  });
  await check('cross-tenant, cross-owner and paid authority are denied', async () => {
    const [s] = await setup();
    for (const client of [db.peer, db.other, db.anonymous]) {
      await assert.rejects(call('reserveNative', { seed: s }, client));
      await assert.rejects(call('exposure', { seed: s }, client));
    }
    await assert.rejects(call('paid', { seed: s }), /ENTERPRISE_PAID_AUTHORITY_NOT_QUALIFIED/);
    assert.equal(await call('exposure', { seed: s }), 0);
  });
  await check('unsupported prior native liability blocks isolated adoption rather than undercounting', async () => {
    const [a, b] = await setup();
    await fault(a.workflowRunId, { status: 'RUNNING', spentUsd: 0.00006, reservedCostUsd: 0.00004 });
    await assert.rejects(call('reserveNative', { seed: b }), /ENTERPRISE_LEGACY_AUTHORITY_UNQUALIFIED/);
  });
  await check('preallocated verifier invocation is not dispatch evidence', async () => {
    const [s] = await setup(); await call('reserveNative', { seed: s });
    await fault(s.workflowRunId, { executorInvocationId: 'preallocated-verifier', attemptPurpose: 'VERIFICATION' });
    await call('settleUnused', { seed: s }); assert.equal(await call('exposure', { seed: s }), 0);
  });
  await check('selected legacy executing Attempt cannot be converted to releasable delegation', async () => {
    const [s] = await setup(), request = await delegation(s);
    await fault(s.workflowRunId, { status: 'RUNNING', spentUsd: 0.00006, reservedCostUsd: 0.00004 });
    await assert.rejects(mutation(s, 'admitTrial', request), /ENTERPRISE_EXISTING_ATTEMPT_NOT_VIRGIN/);
    assert.equal((await inspect(s.workflowRunId)).spentUsd, 0.00006);
  });
  await check('delegation cannot be claimed through the native provider path', async () => {
    const [s] = await setup(), request = await delegation(s);
    const trialId = await mutation(s, 'admitTrial', request);
    await assert.rejects(call('claim', { seed: s }), /ENTERPRISE_EXECUTION_NOT_RESERVED/);
    await mutation(s, 'cancelTrial', { trialId });
    assert.equal(await call('exposure', { seed: s }), 0);
  });
  await check('expired executing authority remains exposed and cannot be claimed again', async () => {
    const [s] = await setup();
    const version = await inspect(s.nativeVersionId);
    await fault(s.nativeVersionId, { budget: { ...version.budget, maxRuntimeMinutes: 0.02 } });
    await call('reserveNative', { seed: s }); await call('claim', { seed: s });
    await new Promise(resolve => setTimeout(resolve, 1250));
    await assert.rejects(call('claim', { seed: s })); await assert.rejects(call('settleUnused', { seed: s }));
    assert.equal(await call('exposure', { seed: s }), 80);
  });
  const report = { checks, canonicalStorage: 'workflowRuns.executionCostAuthorization', nativeAdmission: 'shared canonical reserveOfflineAttemptBudget helper',
    nativeEndToEnd: 'NOT_RUN', delegatedAdmission: 'existing enterpriseCompatibility.admitTrial', productionIntegration: 'NOT_RUN', paidOperations: 0 };
  if (process.env.MC_ACCOUNTING_EVIDENCE) await writeFile(process.env.MC_ACCOUNTING_EVIDENCE, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { await db?.destroy(); }
