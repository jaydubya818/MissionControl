// OPERATOR setup of the disposable owner-local MissionControl: workspace rows, installation environment and temporary credentials.
// It performs NO owner decision. Connect, proposal authorization, Plan approval/WorkOrder release and execution permits are performed
// later by the owner confirmation bridge, only for a fresh signed Sofie `confirm`, through the real mutations under the owner identity.
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { LOCAL_ISSUER, newSecret, MC_URL, MC_DIR, CONFIG, KEYS, OWNER_ID, PLANNER_SUBJECT, MC_ISSUER_LABEL, MYEVE_AUDIENCE_LABEL, readSecret, ensureSecret, writeSecret, mintToken } from './common.mjs';

const ROOT = resolve(new URL('../..', import.meta.url).pathname), cli = join(ROOT, 'node_modules/convex/bin/main.js');
const admin = readSecret('mc-admin-key');
const client = new ConvexHttpClient(MC_URL, { logger: false }); client.setAdminAuth(admin);
const insert = (table, value) => client.mutation(makeFunctionReference('ownerLocalOperator:insert'), { table, value });
const envSet = (name, value) => execFileSync(process.execPath, [cli, 'env', 'set', name, value, '--url', MC_URL, '--admin-key', admin],
  { cwd: join(MC_DIR, 'project'), stdio: ['ignore', 'ignore', 'inherit'], env: { PATH: process.env.PATH, HOME: process.env.HOME } });
const now = Date.now();

const tenantId = await insert('tenants', { name: 'Owner-local private beta', slug: 'owner-local', active: true });
const projectId = await insert('projects', { tenantId, name: 'Owner-local dashboard', slug: 'owner-local-dashboard', createdAt: now,
  githubRepo: 'local/dashboard', githubBranch: 'main', metadata: { sofieMode: 'INSTALLED_NONPRODUCTION', productionAuthority: false } });
const ownerOperatorId = await insert('operators', { tenantId, email: 'owner@owner-local.invalid', name: 'Jay (owner-local)', authId: OWNER_ID, active: true, createdAt: now });
const plannerOperatorId = await insert('operators', { tenantId, email: 'planner@owner-local.invalid', name: 'Sofie planner (owner-local)', authId: PLANNER_SUBJECT, active: true, createdAt: now });
const ownerRole = await insert('roles', { tenantId, name: 'Owner', permissions: ['company.manage', 'delivery.assign', 'delivery.write', 'delivery.approve', 'delivery.dispatch', 'delivery.verify'] });
const plannerRole = await insert('roles', { tenantId, name: 'Planner', permissions: ['delivery.write'] });
await insert('roleAssignments', { operatorId: ownerOperatorId, roleId: ownerRole, assignedAt: now });
await insert('roleAssignments', { operatorId: plannerOperatorId, roleId: plannerRole, assignedAt: now });
const ownerMemberId = await insert('orgMembers', { tenantId, projectId, operatorId: ownerOperatorId, name: 'Jay', role: 'Owner', level: 0, active: true });
const plannerMemberId = await insert('orgMembers', { tenantId, projectId, operatorId: plannerOperatorId, name: 'Sofie planner', role: 'Planner', level: 1, active: true });
const teamId = await insert('scrumTeams', { tenantId, projectId, name: 'Owner-local', slug: 'owner-local', status: 'ACTIVE', createdAt: now, updatedAt: now });
await insert('teamMemberships', { tenantId, projectId, teamId, memberId: ownerMemberId, operatorId: ownerOperatorId, role: 'LEAD', active: true, activeFrom: now - 1000, createdAt: now, updatedAt: now });
await insert('teamMemberships', { tenantId, projectId, teamId, memberId: plannerMemberId, operatorId: plannerOperatorId, role: 'DEVELOPER', active: true, activeFrom: now - 1000, createdAt: now, updatedAt: now });
await insert('workflows', { workflowId: 'myfactory-owner-local-build', name: 'MyFactory owner-local build', version: 1, active: true, projectId,
  description: 'Bounded MyFactory build and tests for the owner-local dashboard', agents: [], steps: [], createdAt: now, updatedAt: now });
// The single repository this disposable MissionControl is scoped to; the bridge refuses a confirmation naming any other.
const REPOSITORY = 'local/dashboard';
const repositoryId = await insert('workspaceRepositories', { tenantId, projectId, provider: 'GITHUB', repositoryMode: 'GITHUB', repository: REPOSITORY, displayName: 'Owner-local dashboard',
  defaultBranch: 'main', isDefault: true, status: 'READY', webhookStatus: 'MISSING', dataClassification: 'INTERNAL', createdAt: now, updatedAt: now });
const codeScopeId = await insert('repositoryCodeScopes', { tenantId, projectId, repositoryId, name: 'Dashboard app', slug: 'dashboard-app',
  includePaths: ['src/**', 'test/**', 'playwright.config.ts', 'playwright.unit.config.ts', 'package.json', 'README.md'], excludePaths: [],
  owningTeamId: teamId, requiredReviewers: [], allowedEnvironments: ['LOCAL'], active: true, createdAt: now, updatedAt: now });
await insert('featureFlags', { key: 'missions.plan-release-v1', enabled: true, createdAt: now, updatedAt: now });

// Temporary credentials (0600). Execution-permit signer (Ed25519), MissionControl capability receiver (P-256), Sofie connection secret.
ensureSecret('mc-permit-signer.pem', () => generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
const { createPrivateKey, createPublicKey } = await import('node:crypto');
const permitPrivate = createPrivateKey(readSecret('mc-permit-signer.pem')), permitPublic = createPublicKey(permitPrivate);
const permitKeyId = createHash('sha256').update(permitPublic.export({ type: 'spki', format: 'der' })).digest('hex');
ensureSecret('mc-receiver.private.json', () => JSON.stringify(generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' })));
const receiverJwk = JSON.parse(readSecret('mc-receiver.private.json'));
const connectionSecret = ensureSecret('mc-sofie-connection-secret', newSecret);
const pub = n => JSON.parse(readFileSync(join(CONFIG, n), 'utf8'));
// The receiver binding names the disposable Relay seed's Agent (MyEve's primary Agent is bound to the same id in operator setup).
const relayAgentId = () => { const id = JSON.parse(readFileSync(join(KEYS, 'relay-local-state.json'), 'utf8')).agentId; if (!/^agt_[a-f0-9]{32}$/.test(id)) throw Error('RELAY_AGENT_ID'); return id; };
const binding = { tenantId, projectId, ownerMemberId, ownerId: OWNER_ID, organizationId: 'org-owner-local', installationId: 'install-owner-local',
  backendId: 'missioncontrol-owner-local', incarnation: 'mc-owner-local-20261104', enrollmentVersion: 1, agentId: relayAgentId(),
  registryVersion: '1', sourceKeys: { myeve: pub('myeve-source.public.json'), relay: pub('relay-permit.public.json') },
  acknowledgmentKey: { keyId: 'mc-receiver-owner-local-20261104', jwk: receiverJwk } };
envSet('MC_SOFIE_INSTALLED_ORIGINS', JSON.stringify({ environment: 'APPROVED_NONPRODUCTION', issuer: MC_ISSUER_LABEL, audience: MYEVE_AUDIENCE_LABEL }));
envSet('MC_SOFIE_APPLICATION_KEY_ID', 'owner-local-sofie');
envSet('MC_OWNER_AUTH_APPLICATION_ID', 'convex');
envSet('MC_OWNER_LOCAL_ISSUER', LOCAL_ISSUER); // disposable local issuer only (.invalid); hosted Clerk keeps the aud check
envSet('MC_SOFIE_INSTALLED_MAX_DURATION_SECONDS', '600'); // Jay: max 10 minutes per Work (owner-local)
envSet('MC_SOFIE_APPLICATION_OWNER_ID', ownerOperatorId);
envSet('MC_SOFIE_PERMIT_SIGNING_KEYS', JSON.stringify({ [permitKeyId]: permitPrivate.export({ type: 'pkcs8', format: 'pem' }).toString() }));
envSet('MC_CAPABILITY_ENVIRONMENT', 'qualification');
envSet('MC_CAPABILITY_INSTALLATION_ID', binding.installationId);
envSet('MC_CAPABILITY_BINDINGS_JSON', JSON.stringify([binding]));
envSet('MC_CAPABILITY_RECEIVER_RECOVERY_STATE', 'ACTIVE');
envSet('MC_CAPABILITY_RECEIVER_EPOCH', binding.incarnation);

// Bridge credentials: the owner token for the SAME owner principal, and a separate planner (author) token. 3 hours, local issuer only.
writeSecret('mc-owner-token', mintToken(OWNER_ID, 3 * 3600));
writeSecret('mc-planner-token', mintToken(PLANNER_SUBJECT, 3 * 3600));
const { x, y, kty, crv } = receiverJwk;
const setup = { tenantId, projectId, repository: REPOSITORY, repositoryId, codeScopeId, ownerOperatorId, plannerOperatorId, ownerMemberId, plannerMemberId, teamId, workflowId: 'myfactory-owner-local-build',
  permitKey: { keyId: permitKeyId, publicKeyPem: permitPublic.export({ type: 'spki', format: 'pem' }).toString() },
  receiver: { backendId: binding.backendId, incarnation: binding.incarnation, enrollmentVersion: 1, keyId: binding.acknowledgmentKey.keyId, publicJwk: { kty, crv, x, y } },
  installationId: binding.installationId, organizationId: binding.organizationId, applicationKeyId: 'owner-local-sofie', createdAt: new Date(now).toISOString() };
writeFileSync(join(MC_DIR, 'setup.json'), JSON.stringify(setup, null, 1));
writeFileSync(join(CONFIG, 'mc-setup.public.json'), JSON.stringify(setup, null, 1));
console.log(JSON.stringify(setup, null, 1));
