import { delegatedFixture } from './delegated-fixture.mjs';
import { mkdtemp, cp, symlink, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { spawn, execFile as callback } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { verifyLifecycleReceipt, signLifecycleReceipt } from '../../convex/lib/capabilityLifecycleWire.ts';
import { signPolicyMessage, policyMessageHash, admissionActionDigest, verifyPolicyMessage } from '../../convex/lib/capabilityOrderingWire.ts';
const execFile = promisify(callback), root = resolve('.');
const binary = process.env.CAPABILITY_TEST_CONVEX_BIN;
if (!binary) throw Error('CAPABILITY_TEST_CONVEX_BIN must identify a local Convex binary');
const directory = await mkdtemp(join(tmpdir(), 'capability-convex-'));
const port = Number(process.env.CAPABILITY_TEST_CONVEX_PORT ?? 55561), sitePort = Number(process.env.CAPABILITY_TEST_CONVEX_SITE_PORT ?? 55562), url = `http://127.0.0.1:${port}`;
const env = { PATH: process.env.PATH, HOME: directory, TMPDIR: directory, CONVEX_DISABLE_TELEMETRY: '1' };
const secret = randomBytes(32).toString('hex'), instance = 'capability-qualification';
const cli = join(root, 'node_modules/convex/dist/cli.bundle.cjs');
let backend;
const checks = [];
async function key(keyId) {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return { keyId, jwk: await crypto.subtle.exportKey('jwk', pair.privateKey) };
}
try {
  await cp(join(root, 'convex'), join(directory, 'convex'), { recursive: true });
  const httpSource = await readFile(join(directory, 'convex/http.ts'), 'utf8');
  await writeFile(join(directory, 'convex/http.ts'), httpSource.replace("catch { return Response.json({ code: 'CAPABILITY_FENCE_UNAVAILABLE' }", "catch (error) { console.error('qualification fence error', String(error)); return Response.json({ code: 'CAPABILITY_FENCE_UNAVAILABLE' }"));
  await rm(join(directory, 'convex/crons.ts'), { force: true });
  await rm(join(directory, 'convex/__tests__'), { recursive: true, force: true });
  await symlink(join(root, 'packages'), join(directory, 'packages'));
  await symlink(join(root, 'node_modules'), join(directory, 'node_modules'));
  await writeFile(join(directory, 'package.json'), JSON.stringify({ type: 'module', dependencies: { convex: '^1.42.3' } }));
  await writeFile(join(directory, 'convex/qualificationFixture.ts'), `import { internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';
export const insert = internalMutation({ args: { table: v.string(), value: v.any() }, handler: (ctx, args) => ctx.db.insert(args.table as any, args.value) });
export const patch = internalMutation({ args: { id: v.string(), value: v.any() }, handler: (ctx, args) => ctx.db.patch(args.id as any, args.value) });
export const read = internalQuery({ args: { id: v.string() }, handler: (ctx, args) => ctx.db.get(args.id as any) });
export const rows = internalQuery({ args: { table: v.string() }, handler: (ctx, args) => ctx.db.query(args.table as any).collect() });
`);
  const log = [];
  backend = spawn(binary, ['--interface', '127.0.0.1', '--port', String(port), '--site-proxy-port', String(sitePort), '--instance-name', instance, '--instance-secret', secret, '--local-storage', join(directory, 'storage'), '--disable-beacon', join(directory, 'db.sqlite')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  backend.stderr.on('data', chunk => log.push(chunk.toString()));
  backend.stdout.on('data', chunk => log.push(chunk.toString()));
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(url + '/version', { signal: AbortSignal.timeout(500) })).ok) break; } catch {}
    if (backend.exitCode !== null) throw Error('Local backend exited: ' + log.slice(-3).join(''));
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const { stdout } = await execFile(binary, ['keygen', 'admin-key', '--instance-name', instance, '--instance-secret', secret], { env });
  const admin = stdout.trim();
  const invoke = async args => {
    try { return await execFile(process.execPath, [cli, ...args, '--url', url, '--admin-key', admin], { cwd: directory, env, maxBuffer: 5_000_000 }); }
    catch (error) { throw Error(String(error.stderr ?? error.message).replaceAll(admin, '[isolated key]')); }
  };
  console.log('Disposable backend ready; loading candidate functions');
  await invoke(['dev', '--once', '--typecheck', 'disable', '--codegen', 'disable']);
  const client = new ConvexHttpClient(url, { logger: false }); client.setAdminAuth(admin);
  const mutate = (name, args) => client.mutation(makeFunctionReference(name), args);
  const query = (name, args) => client.query(makeFunctionReference(name), args);
  const insert = (table, value) => mutate('qualificationFixture:insert', { table, value });
  const now = Date.now();
  const tenantId = await insert('tenants', { name: 'Isolated qualification', slug: 'qualification', active: true });
  const projectId = await insert('projects', { tenantId, name: 'Qualification', slug: 'qualification', createdAt: now });
  const operatorId = await insert('operators', { tenantId, email: 'synthetic@example.invalid', name: 'Synthetic owner', authId: 'synthetic-owner', active: true, createdAt: now });
  const roleId = await insert('roles', { tenantId, name: 'Owner', permissions: ['company.manage'] });
  await insert('roleAssignments', { operatorId, roleId, assignedAt: now });
  const ownerMemberId = await insert('orgMembers', { tenantId, projectId, operatorId, name: 'Synthetic owner', role: 'Owner', level: 0, active: true });
  const teamId = await insert('scrumTeams', { tenantId, projectId, name: 'Qualification', slug: 'qualification', status: 'ACTIVE', createdAt: now, updatedAt: now });
  const sourceKey = await key('myeve'), relayKey = await key('relay'), backendKey = await key('backend');
  const binding = { tenantId, projectId, ownerMemberId, ownerId: 'synthetic-owner', organizationId: 'synthetic-org', installationId: 'isolated', backendId: 'missioncontrol', incarnation: 'boot-qualification', enrollmentVersion: 1, agentId: 'synthetic-sofie', registryVersion: 'test-registry', sourceKeys: { myeve: sourceKey, relay: relayKey }, acknowledgmentKey: backendKey };
  await invoke(['env', 'set', 'MC_CAPABILITY_ENVIRONMENT', 'qualification']);
  await invoke(['env', 'set', 'MC_CAPABILITY_INSTALLATION_ID', 'isolated']);
  await invoke(['env', 'set', 'MC_CAPABILITY_BINDINGS_JSON', JSON.stringify([binding])]);
  await invoke(['env', 'set', 'MC_CAPABILITY_RECEIVER_RECOVERY_STATE', 'ACTIVE']);
  await invoke(['env', 'set', 'MC_CAPABILITY_RECEIVER_EPOCH', binding.incarnation]);
  const identity = { ownerId: binding.ownerId, organizationId: binding.organizationId, installationId: binding.installationId, backendId: binding.backendId, incarnation: binding.incarnation, enrollmentVersion: 1 };
  const fences = {};
  async function fence(authority, version, operation, controls, capabilityId = 'missioncontrol') {
    const message = { ...identity, kind: 'FENCE', authority, version, policyId: `${authority}-${version}`, capabilityId, operation, ...(controls ? { controls } : {}) };
    const envelope = await signPolicyMessage(message, authority === 'myeve' ? sourceKey : relayKey);
    const response = await fetch(`http://127.0.0.1:${sitePort}/capability-control/fence`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ envelope }) });
    if (response.status !== 200) { const diagnostics = await fetch(url + '/api/stream_function_logs?cursor=0', { headers: { Authorization: 'Convex ' + admin }, signal: AbortSignal.timeout(5000) }); const data = await diagnostics.json(); log.push(JSON.stringify(data.entries?.filter(entry => entry.error || entry.logLines?.length).map(entry => ({ identifier: entry.identifier, error: entry.error, logLines: entry.logLines })))); }
    assert.equal(response.status, 200, (await response.clone().text()) + '\n' + log.slice(-8).join('').replaceAll(secret, '[synthetic secret]').replaceAll(admin, '[synthetic key]'));
    const ack = await verifyPolicyMessage(await response.json(), backendKey);
    assert.equal(ack.fenceHash, await policyMessageHash(message));
    fences[authority] = message;
    return envelope;
  }
  await fence('myeve', 1, 'enable'); await fence('relay', 1, 'enable');
  checks.push('real Convex HTTP signed fences commit before exact ACK');
  async function mission() {
    const missionId = await insert('missions', { tenantId, projectId, ownerMemberId, owningTeamId: teamId, title: 'Qualification', objective: 'No paid execution', state: 'READY', budgetUsd: 0, spentUsd: 0, correctiveIterations: 0, maxCorrectiveIterations: 1, maxReadOnlyConcurrency: 1, executionPolicy: 'SERIAL_MUTATIONS', stopCondition: 'qualification only', createdAt: now, updatedAt: now });
    await insert('missionAssignments', { tenantId, projectId, missionId, memberId: ownerMemberId, teamId, role: 'OWNER', active: true, activeFrom: now, createdAt: now, updatedAt: now });
    const workOrderId = await insert('workOrders', { tenantId, projectId, missionId, ownerMemberId, owningTeamId: teamId, title: 'Qualification', desiredOutcome: 'No paid execution', priority: 3, riskLevel: 'LOW', acceptanceCriteria: [], state: 'READY', verificationStatus: 'PENDING', approvalStatus: 'APPROVED', releasedAt: now, createdAt: now, updatedAt: now });
    return { missionId, workOrderId };
  }
  async function permits(missionId, args, workId = missionId, capabilityId = 'enterprise.missions', nativeSnapshot, budgetMicros = capabilityId === 'enterprise.fleet' ? 10000 : 0) {
    const issuedAt = Date.now();
    const base = { ...identity, kind: 'PERMIT', authority: 'myeve', version: fences.myeve.version, policyId: fences.myeve.policyId, referenceId: randomBytes(16).toString('hex'), capabilityId, requiredCapabilities: ['work', 'missioncontrol', capabilityId], registryVersion: binding.registryVersion, agentId: binding.agentId, agentRevision: 1, workId, missionId, workGeneration: now, actionDigest: await admissionActionDigest({ workId, missionId, generation: now, nativeSnapshot: nativeSnapshot ?? await query('qualificationFixture:read', { id: missionId }), args }), budgetMicros, issuedAt, expiresAt: issuedAt + 30000, sourcePermitHash: 'SELF' };
    const myeve = await signPolicyMessage(base, sourceKey);
    const relay = await signPolicyMessage({ ...base, authority: 'relay', referenceId: randomBytes(16).toString('hex'), version: fences.relay.version, policyId: fences.relay.policyId, sourcePermitHash: await policyMessageHash(base) }, relayKey);
    return { myeve, relay };
  }
  const first = await mission(), second = await mission();
  const fleetArgs = { workOrderId: second.workOrderId, actorType: 'SYSTEM', idempotencyKey: 'ready-parent' };
  const fleetSnapshot = { mission: await query('qualificationFixture:read', { id: second.missionId }), workOrder: await query('qualificationFixture:read', { id: second.workOrderId }) };
  const fleetPermits = await permits(second.missionId, fleetArgs, second.workOrderId, 'enterprise.fleet', fleetSnapshot);
  const args = { missionId: first.missionId, idempotencyKey: 'ordered-start' };
  const valid = await permits(first.missionId, args);
  const parent = JSON.parse(valid.myeve.message);
  const parentOnly = { ...parent, capabilityId: 'missioncontrol', requiredCapabilities: ['work', 'missioncontrol'] };
  const wrongCapability = { myeve: await signPolicyMessage(parentOnly, sourceKey), relay: await signPolicyMessage({ ...JSON.parse(valid.relay.message), capabilityId: 'missioncontrol', requiredCapabilities: ['work', 'missioncontrol'], sourcePermitHash: await policyMessageHash(parentOnly) }, relayKey) };
  client.setAdminAuth(admin, { subject: 'synthetic-owner', issuer: 'https://synthetic.invalid', tokenIdentifier: 'synthetic|owner' });
  const proposal = await client.action(makeFunctionReference('capabilityChallenges:create'), { ...args, budgetMicros: 0 });
  const generatedChallenge = await verifyPolicyMessage(proposal.challenge, backendKey);
  assert.equal(generatedChallenge.kind, 'CHALLENGE');
  assert.equal(generatedChallenge.incarnation, binding.incarnation);
  assert.equal(generatedChallenge.actionDigest, parent.actionDigest);
  assert.deepEqual(proposal.nativeArgs, args);
  checks.push('native owner-authenticated challenge signs exact snapshot and incarnation');
  await assert.rejects(mutate('workOrders:dispatchServiceInternal', { ...fleetArgs, capabilityPermits: fleetPermits }), /ADMITTED_MISSION_REQUIRED/);
  checks.push('fleet admission cannot implicitly start an unadmitted Mission');
  await assert.rejects(mutate('missions:start', args), /POLICY_REVALIDATION/);
  await assert.rejects(mutate('missions:start', { ...args, capabilityPermits: wrongCapability }), /CAPABILITY_ADMISSION_SCOPE/);
  await invoke(['env', 'set', 'MC_CAPABILITY_RECEIVER_RECOVERY_STATE', 'QUARANTINED']);
  await assert.rejects(mutate('missions:start', { ...args, capabilityPermits: valid }), /RECOVERY_QUARANTINED/);
  await invoke(['env', 'set', 'MC_CAPABILITY_RECEIVER_RECOVERY_STATE', 'ACTIVE']);
  await invoke(['env', 'set', 'MC_CAPABILITY_RECEIVER_EPOCH', 'restored-other-epoch']);
  await assert.rejects(mutate('missions:start', { ...args, capabilityPermits: valid }), /RECOVERY_QUARANTINED/);
  await invoke(['env', 'set', 'MC_CAPABILITY_RECEIVER_EPOCH', binding.incarnation]);
  const renewedValid = await permits(first.missionId, args);
  const admitted = await mutate('missions:start', { ...args, capabilityPermits: renewedValid });
  checks.push('host quarantine and independently configured incarnation deny restored admission before reference consumption');
  assert.equal(admitted.created, true); assert.equal(admitted.mission.state, 'IN_PROGRESS');
  assert.equal((await mutate('missions:start', { ...args, capabilityPermits: valid })).created, false);
  checks.push('authenticated exact-owner positive native Mission admission and idempotent retry');
  const originalAuthorities = admitted.mission.capabilityAuthorities;
  await mutate('qualificationFixture:patch', { id: first.missionId, value: { capabilityAuthorities: [] } });
  const legacyArgs = { workOrderId: first.workOrderId, actorType: 'SYSTEM', idempotencyKey: 'legacy-parent' };
  const legacyProof = await permits(first.missionId, legacyArgs, first.workOrderId, 'enterprise.fleet', {
    mission: await query('qualificationFixture:read', { id: first.missionId }), workOrder: await query('qualificationFixture:read', { id: first.workOrderId }) });
  await assert.rejects(mutate('workOrders:dispatchServiceInternal', { ...legacyArgs, capabilityPermits: legacyProof }), /MISSION_LINEAGE_RECONCILIATION_REQUIRED/);
  await mutate('qualificationFixture:patch', { id: first.missionId, value: { capabilityAuthorities: originalAuthorities } });
  checks.push('new fleet admission cannot erase unresolved legacy Mission control lineage');
  const delegatedArgs = { workOrderId: first.workOrderId, actorType: 'HUMAN', idempotencyKey: 'delegated-challenge',
    workflowId: 'synthetic-qualified-workflow', executionEnvironment: 'LOCAL', executorHostId: 'synthetic-local-host' };
  const delegatedChallenge = await client.action(makeFunctionReference('capabilityChallenges:create'), {
    missionId: first.missionId, workOrderId: first.workOrderId, idempotencyKey: delegatedArgs.idempotencyKey,
    budgetMicros: 10000, dispatch: delegatedArgs });
  assert.deepEqual(delegatedChallenge.nativeArgs, delegatedArgs);
  const delegatedMessage = await verifyPolicyMessage(delegatedChallenge.challenge, backendKey);
  assert.equal(delegatedMessage.capabilityId, 'enterprise.fleet');
  assert.equal(delegatedMessage.actionDigest, await admissionActionDigest({ workId: first.workOrderId, missionId: first.missionId,
    generation: now, nativeSnapshot: { mission: await query('qualificationFixture:read', { id: first.missionId }),
      workOrder: await query('qualificationFixture:read', { id: first.workOrderId }) }, args: delegatedArgs }));
  await assert.rejects(client.action(makeFunctionReference('capabilityChallenges:create'), {
    missionId: first.missionId, workOrderId: first.workOrderId, idempotencyKey: 'different-command', budgetMicros: 10000, dispatch: delegatedArgs }), /CHALLENGE_INVALID/);
  checks.push('delegated challenge signs canonical dispatch fields and bounded budget without granting execution');
  const nativeFactory = await delegatedFixture({ insert, mutate, query, invoke, tenantId, projectId, ownerMemberId,
    operatorId, missionId: first.missionId, workOrderId: first.workOrderId, teamId });
  const positiveArgs = { workOrderId: first.workOrderId, actorType: 'HUMAN', idempotencyKey: 'qualified-delegated-admission',
    factoryDefinitionVersionId: nativeFactory.versionId, taskId: nativeFactory.taskId, workflowId: 'capability-delegated-offline', executionEnvironment: 'LOCAL', executorHostId: nativeFactory.hostId };
  const positiveSnapshot = { mission: await query('qualificationFixture:read', { id: first.missionId }),
    workOrder: await query('qualificationFixture:read', { id: first.workOrderId }) };
  const positivePermits = await permits(first.missionId, positiveArgs, first.workOrderId, 'enterprise.fleet', positiveSnapshot);
  await mutate('qualificationFixture:patch', { id: nativeFactory.profileId, value: { enabled: false } });
  await assert.rejects(mutate('workOrders:dispatch', { ...positiveArgs, capabilityPermits: positivePermits }), /execution-profile|agent-manifest|recovery|Factory dispatch blocked/);
  await mutate('qualificationFixture:patch', { id: nativeFactory.profileId, value: { enabled: true } });
  const insufficientPermits = await permits(first.missionId, positiveArgs, first.workOrderId, 'enterprise.fleet', positiveSnapshot, 9999);
  await assert.rejects(mutate('workOrders:dispatch', { ...positiveArgs, capabilityPermits: insufficientPermits }), /CAPABILITY_NATIVE_AUTHORITY_OR_BUDGET_REQUIRED/);
  assert.equal((await query('qualificationFixture:rows', { table: 'capabilityAdmissionReferences' })).length, 2);
  assert.equal((await query('qualificationFixture:rows', { table: 'workflowRuns' })).length, 0);
  const concurrentClient = new ConvexHttpClient(url, { logger: false });
  concurrentClient.setAdminAuth(admin, { subject: 'synthetic-owner', issuer: 'https://synthetic.invalid', tokenIdentifier: 'synthetic|owner' });
  const concurrentAdmissions = await Promise.all([
    mutate('workOrders:dispatch', { ...positiveArgs, capabilityPermits: positivePermits }),
    concurrentClient.mutation(makeFunctionReference('workOrders:dispatch'), { ...positiveArgs, capabilityPermits: positivePermits }),
  ]);
  assert.equal(concurrentAdmissions.filter(result => result.created).length, 1);
  const positiveWork = concurrentAdmissions.find(result => result.created);
  checks.push('profile revocation and insufficient budget roll back all permit consumption; concurrent duplicate WorkOrder admission creates one Attempt');
  assert.equal(positiveWork.created, true);
  assert.equal(positiveWork.run.factoryDefinitionVersionId, nativeFactory.versionId);
  assert.equal(positiveWork.run.executionCostAuthorization.maxProviderCalls, 0);
  assert.equal(positiveWork.run.executionCostAuthorization.actualCost.status, 'UNAVAILABLE');
  assert.equal(positiveWork.run.reservedCostUsd, 0.01);
  assert.equal((await mutate('workOrders:dispatch', { ...positiveArgs, capabilityPermits: positivePermits })).created, false);
  checks.push('real positive delegated WorkOrder admission binds qualified offline Factory, exact Mission/Attempt, frozen policy and budget without provider authority');



  const secondArgs = { missionId: second.missionId, idempotencyKey: 'stale-start' };
  const old = await permits(second.missionId, secondArgs);
  await mutate('qualificationFixture:patch', { id: second.missionId, value: { objective: 'Changed scope at unchanged timestamp' } });
  await assert.rejects(mutate('missions:start', { ...secondArgs, capabilityPermits: old }), /CAPABILITY_ADMISSION_SCOPE/);
  checks.push('child capability and native snapshot changes reject otherwise signed permits');
  await fence('myeve', 2, 'disable');
  await assert.rejects(mutate('missions:start', { ...secondArgs, capabilityPermits: old }), /CAPABILITY/);
  assert.equal((await mutate('missions:start', args)).mission.state, 'IN_PROGRESS');
  await assert.rejects(mutate('workflowRuns:start', { workflowId: 'legacy', workOrderId: second.workOrderId, initialInput: '' }), /canonical WorkOrder/);
  checks.push('disable fences stale permits, preserves admitted Mission, denies legacy WorkOrder bypass');
  client.setAdminAuth(admin, { subject: 'foreign-owner', issuer: 'https://synthetic.invalid', tokenIdentifier: 'synthetic|foreign' });
  await assert.rejects(mutate('missions:start', args));
  await assert.rejects(client.action(makeFunctionReference('capabilityChallenges:create'), { ...args, budgetMicros: 0 }));
  checks.push('cross-owner Mission replay denied');
  client.setAdminAuth(admin);
  assert.equal((await query('qualificationFixture:rows', { table: 'capabilityAdmissionReferences' })).length, 4);
  const third = await mission();
  await fence('myeve', 3, 'enable');
  const raceArgs = { missionId: third.missionId, idempotencyKey: 'race-start' };
  const racePermits = await permits(third.missionId, raceArgs);
  client.setAdminAuth(admin, { subject: 'synthetic-owner', issuer: 'https://synthetic.invalid', tokenIdentifier: 'synthetic|owner' });
  const results = await Promise.allSettled([mutate('missions:start', { ...raceArgs, capabilityPermits: racePermits }), fence('myeve', 4, 'disable')]);
  assert.equal(results[1].status, 'fulfilled');
  const raceMission = await query('qualificationFixture:read', { id: third.missionId });
  if (results[0].status === 'fulfilled') assert.equal(raceMission.state, 'IN_PROGRESS');
  else { assert.equal(raceMission.state, 'READY'); await assert.rejects(mutate('missions:start', { ...raceArgs, capabilityPermits: racePermits }), /CAPABILITY/); }
  checks.push('real Convex admission/fence race commits only in serial order');
  const runId = 'capability-active-writer';
  const authority = { scope: JSON.stringify(['myeve', binding.ownerId, binding.organizationId, binding.installationId, binding.backendId, binding.incarnation]), version: 1, policyId: 'myeve-1', capabilityId: 'enterprise.fleet' };
  const runDocId = await insert('workflowRuns', { tenantId, projectId, missionId: first.missionId,
    workOrderId: first.workOrderId, runId, workflowId: 'synthetic-no-execution', status: 'RUNNING',
    currentStepIndex: 0, totalSteps: 1, steps: [{ stepId: 'bounded', status: 'RUNNING', retryCount: 0 }],
    context: {}, initialInput: '', startedAt: now, reservedCostUsd: 12, capabilityAuthorities: [authority] });
  await mutate('workflowRuns:updateContext', { runId, context: { beforeControl: true } });
  const pauseEnvelope = await fence('myeve', 5, 'pause');
  await assert.rejects(mutate('workflowRuns:claimExecution', { runId, leaseId: 'stale', ownerId: 'stale', dispatchMode: 'MANUAL' }), /CAPABILITY_PAUSE/);
  await assert.rejects(mutate('workflowRuns:updateContext', { runId, context: { bypass: true } }), /CAPABILITY_PAUSE/);
  const revokeEnvelope = await fence('myeve', 6, 'revoke');
  await fence('myeve', 6, 'revoke');
  for (const [name, args] of [
    ['workflowRuns:updateContext', { runId, context: { bypass: true } }],
    ['workflowRuns:advance', { runId }],
    ['workflowRuns:incrementRetry', { runId, stepIndex: 0 }],
    ['workflowRuns:updateStatus', { runId, status: 'CANCELED' }],
    ['workflowRuns:recordEvent', { workflowRunId: runDocId, eventType: 'RUN_RESUMED' }],
  ]) await assert.rejects(mutate(name, args), /CAPABILITY_AUTHORITY_FENCED/);
  assert.equal((await mutate('factory/attempts:renewInternal', { workflowRunId: runDocId, leaseId: 'stale', ownerId: 'stale', leaseDurationMs: 1000 })).renewed, false);
  await fence('myeve', 7, 'enable');
  await assert.rejects(mutate('workflowRuns:updateContext', { runId, context: { revived: true } }), /CAPABILITY_AUTHORITY_FENCED/);
  const preservedRun = await query('qualificationFixture:read', { id: runDocId });
  assert.equal(preservedRun.reservedCostUsd, 12);
  assert.equal(preservedRun.status, 'RUNNING');
  assert.deepEqual(preservedRun.context, { beforeControl: true });
  checks.push('pause prevents reclaim; revoke fences native stale writers across later enable without clearing reservation or claiming resource stop');
  async function lifecycle(envelope) {
    const response = await fetch(`http://127.0.0.1:${sitePort}/capability-control/lifecycle`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ envelope }) });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  }
  const preparedLifecycle = await query('capabilityLifecycle:prepare', { envelope: revokeEnvelope });
  const staleLifecycle = await signLifecycleReceipt(preparedLifecycle.receipt, backendKey);
  await mutate('qualificationFixture:patch', { id: runDocId, value: { factoryConfigurationDigest: 'synthetic-new-inventory' } });
  await assert.rejects(mutate('capabilityLifecycle:acknowledge', { envelope: revokeEnvelope, acknowledgment: staleLifecycle }), /OBSERVATION_CHANGED/);
  checks.push('lifecycle acknowledgment rejects a stale inventory between signed preparation and transaction commit');
  const pauseAck = await verifyLifecycleReceipt(await lifecycle(pauseEnvelope), backendKey);
  assert.equal(pauseAck.state, 'PENDING_BACKEND');
  const revokeAck = await lifecycle(revokeEnvelope);
  const revokeMessage = await verifyLifecycleReceipt(revokeAck, backendKey);
  assert.equal(revokeMessage.state, 'PENDING_BACKEND');
  assert.equal(revokeMessage.inventoryComplete, false);
  assert.equal(revokeMessage.version, 6);
  assert.deepEqual(await lifecycle(revokeEnvelope), revokeAck);
  const stoppedForRestart = new Promise(resolve => backend.once('exit', resolve));
  backend.kill('SIGTERM'); await stoppedForRestart;
  backend = spawn(binary, ['--interface', '127.0.0.1', '--port', String(port), '--site-proxy-port', String(sitePort),
    '--instance-name', instance, '--instance-secret', secret, '--local-storage', join(directory, 'storage'),
    '--disable-beacon', join(directory, 'db.sqlite')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  backend.stderr.on('data', chunk => log.push(chunk.toString()));
  backend.stdout.on('data', chunk => log.push(chunk.toString()));
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(url + '/version', { signal: AbortSignal.timeout(500) })).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.deepEqual(await lifecycle(revokeEnvelope), revokeAck);
  await assert.rejects(mutate('workflowRuns:updateContext', { runId, context: { afterRestart: true } }), /AUTHORITY_FENCED/);
  checks.push('real receiver restart preserves signed acknowledgment and revoked writer fence');
  const controlSnapshot = await query('qualificationFixture:rows', { table: 'capabilityWorkControls' });
  for (const control of controlSnapshot) if (control.scope === authority.scope)
    await mutate('qualificationFixture:patch', { id: control._id, value: { version: 1 } });
  await invoke(['env', 'set', 'MC_CAPABILITY_RECEIVER_EPOCH', 'independently-retained-post-restore-epoch']);
  await assert.rejects(mutate('workflowRuns:updateContext', { runId, context: { restoredAuthority: true } }), /RECOVERY_PENDING_BACKEND/);
  await assert.rejects(query('capabilityLifecycle:prepare', { envelope: revokeEnvelope }), /CONTROL_IDENTITY_MISMATCH/);
  for (const control of controlSnapshot) await mutate('qualificationFixture:patch', { id: control._id, value: { version: control.version } });
  await invoke(['env', 'set', 'MC_CAPABILITY_RECEIVER_EPOCH', binding.incarnation]);
  checks.push('restored older policy rows cannot revive writers while independently retained host incarnation fences the database');


  assert.equal((await query('qualificationFixture:read', { id: runDocId })).reservedCostUsd, 12);
  const tampered = { ...revokeEnvelope, message: revokeEnvelope.message.replace('synthetic-owner', 'foreign-owner') };
  assert.equal((await fetch(`http://127.0.0.1:${sitePort}/capability-control/lifecycle`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ envelope: tampered }) })).status, 503);
  checks.push('signed lifecycle acknowledgment is durable, exact-owner, retry-idempotent, and pending without native absence evidence');

  const { _id: _runId, _creationTime: _created, ...legacy } = preservedRun;
  delete legacy.capabilityAuthorities;
  const legacyId = await insert('workflowRuns', { ...legacy, runId: 'legacy-capability-writer' });
  await assert.rejects(mutate('workflowRuns:updateContext', { runId: 'legacy-capability-writer', context: { bypass: true } }), /LEGACY_AUTHORITY_PENDING_BACKEND/);
  assert.equal((await query('qualificationFixture:read', { id: legacyId })).reservedCostUsd, 12);
  await insert('workflowRuns', { ...legacy, runId: 'later-capability-writer', capabilityAuthorities: [{ ...authority, version: 7, policyId: 'myeve-7' }] });
  await fence('relay', 2, 'revoke');
  await mutate('workflowRuns:updateContext', { runId: 'later-capability-writer', context: { relayEpochOnly: true } });
  await fence('myeve', 9, 'disable', [{ capabilityId: 'work', operation: 'revoke', version: 8, policyId: 'myeve-8' }], 'memory');
  await assert.rejects(mutate('workflowRuns:updateContext', { runId: 'later-capability-writer', context: { lostRevoke: true } }), /AUTHORITY_FENCED/);
  checks.push('superseded revoke reaches writers, Relay generic epoch does not revoke unrelated Work, legacy lineage remains pending');

  if (process.env.CAPABILITY_COMPOSED_RELAY_ROOT && process.env.CAPABILITY_COMPOSED_MYEVE_ROOT) {
    const fixture = join(directory, 'composed-fixture.json');
    await writeFile(fixture, JSON.stringify({ url, sitePort, admin, cli, binding, sourceKey, relayKey, backendKey,
      tenantId, projectId, ownerMemberId, teamId, myeveRoot: process.env.CAPABILITY_COMPOSED_MYEVE_ROOT }), { mode: 0o600 });
    const relayRoot = process.env.CAPABILITY_COMPOSED_RELAY_ROOT;
    for (const policyKind of ['platform', 'ordinary']) {
    const child = await execFile(process.execPath, [join(relayRoot, 'node_modules/tsx/dist/cli.mjs'),
      '--tsconfig', join(relayRoot, 'tsconfig.json'), join(relayRoot, 'scripts/qualify-capability-composed.mjs'), fixture, policyKind],
      { cwd: relayRoot, env: { ...env, HOME: process.env.HOME, CAPABILITY_TEST_POSTGRES_BIN: process.env.CAPABILITY_TEST_POSTGRES_BIN,
        NODE_ENV: 'test', CAPABILITY_COMPOSED_BROWSER: process.env.CAPABILITY_COMPOSED_BROWSER }, maxBuffer: 5_000_000 });
    process.stdout.write(child.stdout); process.stderr.write(child.stderr);
    }
    await invoke(['env', 'set', 'MC_CAPABILITY_BINDINGS_JSON', JSON.stringify([binding])]);
    checks.push('composed PostgreSQL source and native Relay delivery/admission proof qualification');
  }
  await invoke(['env', 'remove', 'MC_CAPABILITY_BINDINGS_JSON']);
  await invoke(['env', 'remove', 'MC_CAPABILITY_INSTALLATION_ID']);
  client.setAdminAuth(admin, { subject: 'synthetic-owner', issuer: 'https://synthetic.invalid', tokenIdentifier: 'synthetic|owner' });
  await assert.rejects(mutate('missions:start', secondArgs), /INSTALLATION_UNQUALIFIED/);
  checks.push('durable enrollment prevents configuration-removal bypass');
  await mkdir(join(root, 'docs/capability-control/evidence'), { recursive: true });
  await writeFile(join(root, 'docs/capability-control/evidence/convex-ordering.json'), JSON.stringify({ status: 'PASS', database: 'disposable real Convex SQLite backend', checks, paidExecution: 'NOT_RUN' }, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'PASS', checks }, null, 2));
} finally {
  if (backend && backend.exitCode === null && backend.signalCode === null) { const stopped = new Promise(resolve => backend.once('exit', resolve)); backend.kill('SIGTERM'); const force = setTimeout(() => backend.kill('SIGKILL'), 5000); await stopped; clearTimeout(force); }
  await rm(directory, { recursive: true, force: true });
  backend?.stdout?.destroy();
  backend?.stderr?.destroy();
  console.log('Disposable backend and files removed');
}
process.exit(0);
