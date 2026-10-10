import { mkdtemp, cp, symlink, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { spawn, execFile as callback } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { signPolicyMessage, policyMessageHash, admissionActionDigest, verifyPolicyMessage } from '../../convex/lib/capabilityOrderingWire.ts';
const execFile = promisify(callback), root = resolve('.');
const binary = process.env.CAPABILITY_TEST_CONVEX_BIN;
if (!binary) throw Error('CAPABILITY_TEST_CONVEX_BIN must identify a local Convex binary');
const directory = await mkdtemp(join(tmpdir(), 'capability-convex-'));
const port = 55561, sitePort = 55562, url = `http://127.0.0.1:${port}`;
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
  const identity = { ownerId: binding.ownerId, organizationId: binding.organizationId, installationId: binding.installationId, backendId: binding.backendId, incarnation: binding.incarnation, enrollmentVersion: 1 };
  const fences = {};
  async function fence(authority, version, operation) {
    const message = { ...identity, kind: 'FENCE', authority, version, policyId: `${authority}-${version}`, capabilityId: 'missioncontrol', operation };
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
  async function permits(missionId, args, workId = missionId, capabilityId = 'enterprise.missions', nativeSnapshot) {
    const issuedAt = Date.now();
    const base = { ...identity, kind: 'PERMIT', authority: 'myeve', version: fences.myeve.version, policyId: fences.myeve.policyId, referenceId: randomBytes(16).toString('hex'), capabilityId, requiredCapabilities: ['work', 'missioncontrol', capabilityId], registryVersion: binding.registryVersion, agentId: binding.agentId, agentRevision: 1, workId, missionId, workGeneration: now, actionDigest: await admissionActionDigest({ workId, missionId, generation: now, nativeSnapshot: nativeSnapshot ?? await query('qualificationFixture:read', { id: missionId }), args }), budgetMicros: 0, issuedAt, expiresAt: issuedAt + 30000, sourcePermitHash: 'SELF' };
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
  await assert.rejects(mutate('workOrders:dispatchServiceInternal', { ...fleetArgs, capabilityPermits: fleetPermits }), /ADMITTED_MISSION_REQUIRED/);
  checks.push('fleet admission cannot implicitly start an unadmitted Mission');
  await assert.rejects(mutate('missions:start', args), /POLICY_REVALIDATION/);
  await assert.rejects(mutate('missions:start', { ...args, capabilityPermits: wrongCapability }), /CAPABILITY_ADMISSION_SCOPE/);
  const admitted = await mutate('missions:start', { ...args, capabilityPermits: valid });
  assert.equal(admitted.created, true); assert.equal(admitted.mission.state, 'IN_PROGRESS');
  assert.equal((await mutate('missions:start', { ...args, capabilityPermits: valid })).created, false);
  checks.push('authenticated exact-owner positive native Mission admission and idempotent retry');
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
  checks.push('cross-owner Mission replay denied');
  client.setAdminAuth(admin);
  assert.equal((await query('qualificationFixture:rows', { table: 'capabilityAdmissionReferences' })).length, 2);
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
