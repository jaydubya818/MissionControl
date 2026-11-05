// Owner confirmation bridge (owner-local private beta only, 127.0.0.1).
// Input: the Sofie `confirm <plan>` binding that MyEve signed after the owner's authenticated confirmation (Ed25519, MyEve's owner-confirmation key).
// It translates that ONE fresh confirmation into the required MissionControl owner decisions, each through the REAL mutation under the owner's
// local identity token (same owner principal), each bound to owner, exact plan, Work, repository and limits, each audited durably:
//   A /confirm         1 connect app  2 authorize proposal  3 approve Plan (releases the APPLIED WorkOrder revision)
//   B /approve-permits 4..n approve INSTALLED_EXECUTION_PERMIT for exactly the confirmed stage Works
// Without a valid, fresh, unused confirmation nothing is called. MissionControl's own checks decide every mutation; nothing is bypassed.
// Single use is a durable exclusive claim (O_EXCL file, fsync) taken synchronously after verification and BEFORE any MissionControl write:
// step A once per confirmation, step B once per (Work, generation). Concurrent requests: exactly one claim succeeds. A claimed step that then
// fails is never retried (fail closed); the owner confirms again. Step B approves only a request whose Work tuple equals the tuple MyEve
// signed under the same confirmation, and every step refuses a confirmation whose repository is not the one MissionControl is scoped to.
import { createServer } from 'node:http';
import { createHash, createHmac, createPublicKey, randomUUID, verify } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { BRIDGE_PORT, MC_URL, MC_DIR, CONFIG, EVIDENCE, OWNER_ID, LOCAL_ISSUER, LOCAL_AUDIENCE, LOCAL_AZP, MC_ISSUER_LABEL, MYEVE_AUDIENCE_LABEL,
  readSecret, sha256 } from './common.mjs';

const ROOT = new URL('../..', import.meta.url).pathname, cli = join(ROOT, 'node_modules/convex/bin/main.js');
const AUDIT = join(EVIDENCE, 'mc-owner-approvals.jsonl');
const FRESH_MS = 10 * 60 * 1000, JOURNEY_MS = 120 * 60 * 1000;
const setup = () => JSON.parse(readFileSync(join(MC_DIR, 'setup.json'), 'utf8'));
const CLAIMS = join(MC_DIR, 'claims');
const SHA = /^[a-f0-9]{64}$/;
/** Durable single-use claim. Synchronous (no await between the caller's checks and the claim); EEXIST means another request owns it. */
export function claimOnce(key, content) {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(key)) throw Error('CLAIM_KEY_INVALID');
  mkdirSync(CLAIMS, { recursive: true, mode: 0o700 });
  let fd;
  try { fd = openSync(join(CLAIMS, key), 'wx', 0o600); } catch (error) { if (error?.code === 'EEXIST') throw Error('CONFIRMATION_ALREADY_CLAIMED'); throw error; }
  try { writeSync(fd, JSON.stringify({ at: new Date().toISOString(), ...content })); fsyncSync(fd); } finally { closeSync(fd); }
}
const confirmationKey = () => createPublicKey(readFileSync(join(CONFIG, 'owner-confirmation.public.pem'), 'utf8'));
const ref = name => makeFunctionReference(name);
const canonical = v => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object'
  ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v);
const audit = entry => { const row = { at: new Date().toISOString(), ...entry }; appendFileSync(AUDIT, JSON.stringify(row) + '\n', { mode: 0o600 }); return row; };
const used = () => existsSync(AUDIT) ? readFileSync(AUDIT, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];

function client(tokenName) { const c = new ConvexHttpClient(MC_URL, { logger: false }); c.setAuth(readSecret(tokenName)); return c; }
function adminClient() { const c = new ConvexHttpClient(MC_URL, { logger: false }); c.setAdminAuth(readSecret('mc-admin-key')); return c; }
const envSet = (name, value) => execFileSync(process.execPath, [cli, 'env', 'set', name, value, '--url', MC_URL, '--admin-key', readSecret('mc-admin-key')],
  { cwd: join(MC_DIR, 'project'), stdio: ['ignore', 'ignore', 'inherit'], env: { PATH: process.env.PATH, HOME: process.env.HOME } });

/** Verifies MyEve's signature, owner, profile, freshness and single use of a confirmation for one bridge step. */
export function verifyConfirmation(body, step, s = setup()) {
  const { binding, signature } = body ?? {};
  if (!binding || typeof signature !== 'string') throw Error('CONFIRMATION_REQUIRED');
  const key = confirmationKey();
  if (!verify(null, Buffer.from('myeve-owner-confirmation/v1\n' + canonical(binding)), key, Buffer.from(signature, 'base64url'))) throw Error('CONFIRMATION_SIGNATURE');
  if (binding.schema !== 'myeve-owner-confirmation/v1' || binding.profile !== 'myeve.private-beta.owner/v1' || binding.ownerId !== OWNER_ID
    || !/^[a-f0-9]{64}$/.test(binding.planSha256) || binding.confirmCode !== binding.planSha256.slice(0, 12)
    || binding.requestSha256 !== sha256(binding.request) || !Array.isArray(binding.works) || binding.works.length !== 3
    || !(Date.now() - binding.confirmedAt < (step === 'A' ? FRESH_MS : JOURNEY_MS) && binding.confirmedAt <= Date.now() + 5000)) throw Error('CONFIRMATION_INVALID_OR_STALE');
  if (binding.works.some((w, i) => w?.stage !== i + 1 || typeof w.id !== 'string' || !w.id || !Number.isSafeInteger(w.version) || w.version < 1
    || !Number.isSafeInteger(w.generation) || w.generation < 1) || new Set(binding.works.map(w => w.id)).size !== 3) throw Error('CONFIRMATION_WORKS_INVALID');
  // The signed repository must be exactly the repository (and its code scope) MissionControl's Mission is scoped to.
  if (typeof s.repository !== 'string' || !s.repository || binding.repository !== s.repository) throw Error('CONFIRMATION_REPOSITORY_MISMATCH');
  const digest = sha256(canonical(binding));
  if (step === 'A' && used().some(r => r.confirmationDigest === digest && r.step === 'A' && r.kind === 'STEP_COMPLETED')) throw Error('CONFIRMATION_ALREADY_USED');
  if (step === 'B' && !used().some(r => r.confirmationDigest === digest && r.step === 'A' && r.kind === 'STEP_COMPLETED')) throw Error('CONFIRMATION_STEP_ORDER');
  return { binding, digest };
}

function serviceCommand(s, connectionId, secret, payload) {
  const payloadJson = JSON.stringify(payload), at = Date.now();
  const envelope = { serviceId: 'myeve-sofie-readiness-v1', capability: payload.operation, projectId: s.projectId, repositoryId: `connection:${connectionId}`,
    commandId: randomUUID(), issuedAt: at, expiresAt: at + 60000, payloadDigest: 'sha256=' + createHash('sha256').update(payloadJson).digest('hex') };
  const canonicalCommand = ['mc-service-command-v1', envelope.serviceId, envelope.capability, envelope.projectId, envelope.repositoryId, envelope.commandId,
    String(envelope.issuedAt), String(envelope.expiresAt), envelope.payloadDigest].join('\n');
  return { envelope: { ...envelope, signature: 'sha256=' + createHmac('sha256', secret).update(canonicalCommand).digest('hex') }, payloadJson };
}

/** Returns the digest of a submitted Plan that is EXACTLY the expected specification (MissionControl may only add each blueprint's
 *  workflowVersion at submission); throws on any added, removed, reordered or changed blueprint, assertion, summary, rollback or metadata. */
export function verifySubmittedPlan(plan, expected, at) {
  if (!plan || plan._id !== at.planId || plan.missionId !== at.missionId || plan.status !== (at.status ?? 'PROPOSED')) throw Error('PLAN_NOT_SUBMITTED_AS_CONFIRMED');
  if (typeof at.repository !== 'string' || plan.repository !== at.repository) throw Error('PLAN_REPOSITORY_MISMATCH');
  const blueprints = Array.isArray(plan.workOrderBlueprints) ? plan.workOrderBlueprints : [];
  if (blueprints.length !== expected.workOrderBlueprints.length) throw Error('PLAN_DIFFERS_FROM_CONFIRMATION');
  const stripped = blueprints.map(b => { const { workflowVersion, ...rest } = b ?? {}; if (!Number.isSafeInteger(workflowVersion)) throw Error('PLAN_DIFFERS_FROM_CONFIRMATION'); return rest; });
  const submitted = { summary: plan.summary, rollbackApproach: plan.rollbackApproach, workOrderBlueprints: stripped, assertions: plan.assertions, metadata: plan.metadata,
    estimatedCostUsd: plan.estimatedCostUsd ?? null };
  const want = { ...expected, estimatedCostUsd: expected.estimatedCostUsd ?? null };
  if (canonical(submitted) !== canonical(want)) throw Error('PLAN_DIFFERS_FROM_CONFIRMATION');
  return sha256(canonical({ schema: 'mc-owner-local-verified-plan/v1', planId: at.planId, missionId: at.missionId, repository: at.repository, ...want }));
}

/** Step A: connect, enrollment install (operator), proposal authorize, Mission draft, Plan authored by the planner, Plan approved by the owner. */
export async function confirmStep(body, deps = {}) {
  const s = deps.setup ?? setup(), { binding, digest } = verifyConfirmation(body, 'A', s);
  claimOnce(`A-${digest}`, { step: 'A', confirmationDigest: digest, planSha256: binding.planSha256 });
  const owner = deps.owner ?? client('mc-owner-token'), planner = deps.planner ?? client('mc-planner-token'), admin = deps.admin ?? adminClient(), setEnv = deps.envSet ?? envSet;
  const record = (kind, extra) => audit({ step: 'A', kind, confirmationDigest: digest, ownerId: binding.ownerId, planSha256: binding.planSha256,
    repository: binding.repository, works: binding.works.map(w => ({ stage: w.stage, id: w.id, version: w.version, generation: w.generation })), ...extra });
  record('CONFIRMATION_ACCEPTED', { requestSha256: binding.requestSha256, confirmedAt: binding.confirmedAt });
  const expiresAt = Date.now() + 55 * 60 * 1000;
  // 1 Owner decision: connect the Sofie application (no execution authority).
  const connected = await owner.mutation(ref('sofieEnterprise:connect'), { projectId: s.projectId, ownerMemberId: s.ownerMemberId, owningTeamId: s.teamId, expiresAt });
  record('OWNER_APPROVAL', { approval: 'CONNECT_APP', mutation: 'sofieEnterprise:connect', connectionId: connected.connectionId, executionAuthority: connected.executionAuthority });
  // Operator: install the enrollment for that owner-created connection and its service secret. Enrollment pins come from the signed binding.
  const p = binding.enrollmentPins, now = Date.now();
  if (!Number.isSafeInteger(p.revision) || p.revision < 1) throw Error('CONFIRMATION_ENROLLMENT_REVISION');
  const enrollment = { schema: 'mc-owner-enrollment/v1', environment: 'APPROVED_NONPRODUCTION', installationId: s.installationId, revision: p.revision, ownerId: OWNER_ID,
    ownerSubject: OWNER_ID, missionControlOwnerId: s.ownerOperatorId, tenantId: s.tenantId, projectId: s.projectId, connectionId: connected.connectionId,
    issuer: MC_ISSUER_LABEL, audience: MYEVE_AUDIENCE_LABEL, clerkIssuer: LOCAL_ISSUER, clerkAudience: LOCAL_AUDIENCE, clerkAuthorizedParty: LOCAL_AZP,
    activeFrom: now - 1000, expiresAt, revokedAt: null, factoryVersion: p.factoryVersion, executionContractSha256: p.executionContractSha256,
    capabilityPolicySha256: p.capabilityPolicySha256, relayLeaseEnrollmentSha256: p.relayLeaseEnrollmentSha256, ownerFactoryAdapter: p.ownerFactoryAdapter,
    maxCostMicrousd: p.maxCostMicrousd, maxDurationSeconds: p.maxDurationSeconds,
    permitKeys: [{ keyId: s.permitKey.keyId, publicKey: s.permitKey.publicKeyPem, activeFrom: now - 1000, notAfter: expiresAt, revokedAt: null }] };
  setEnv('MC_SOFIE_CONNECTION_SECRETS', JSON.stringify({ [connected.connectionId]: { keyId: s.applicationKeyId, secret: readSecret('mc-sofie-connection-secret') } }));
  // MissionControl's enrollment schema is strict; the relay-lease and owner-Factory-adapter pins are MyEve-only and stay in MyEve's copy.
  const { relayLeaseEnrollmentSha256: _relay, ownerFactoryAdapter: _adapter, ...missionControlEnrollment } = enrollment;
  await admin.mutation(ref('ownerLocalOperator:installEnrollment'), { connectionId: connected.connectionId, enrollment: missionControlEnrollment });
  record('OPERATOR_ENROLLMENT_INSTALLED', { connectionId: connected.connectionId, enrollmentDigest: sha256(canonical(enrollment)) });
  // Sofie application proposes the Mission (signed service command, no authority).
  const secret = readSecret('mc-sofie-connection-secret');
  const proposal = { title: binding.title, objective: binding.request, workstreams: ['MyFactory build and tests', 'Local verification and preview'],
    milestones: ['Stage 1 plan and code', 'Stage 2 code', 'Stage 3 Factory build and tests'], stopCondition: 'Stop after the verified preview or on any refusal; no automatic retry.', budgetMicrousd: 0 };
  const proposed = await owner.action(ref('sofieEnterprise:command'), serviceCommand(s, connected.connectionId, secret,
    { operation: 'enterprise.propose', connectionId: connected.connectionId, intentKey: `owner-confirm:${binding.planSha256}`, proposal }));
  const proposalId = proposed.response.proposalId, proposalDigest = proposed.response.digest;
  record('SERVICE_COMMAND', { command: 'enterprise.propose', proposalId, proposalDigest });
  // 2 Owner decision: authorize creation of exactly this Mission draft.
  const decided = await owner.mutation(ref('sofieEnterprise:decide'), { projectId: s.projectId, connectionId: connected.connectionId, proposalId, expectedDigest: proposalDigest, decision: 'AUTHORIZE_DRAFT' });
  record('OWNER_APPROVAL', { approval: 'AUTHORIZE_PROPOSAL', mutation: 'sofieEnterprise:decide', proposalId, proposalDigest, result: decided });
  const submitted = await owner.action(ref('sofieEnterprise:command'), serviceCommand(s, connected.connectionId, secret,
    { operation: 'enterprise.submit', connectionId: connected.connectionId, proposalId, proposalDigest }));
  const missionId = submitted.response.missionId;
  record('SERVICE_COMMAND', { command: 'enterprise.submit', missionId });
  // The Plan is authored and submitted by the Sofie planner principal (contributor), never by the approver.
  // Owner scopes the Mission to exactly the confirmed repository, owning team and approved code scope.
  const mission = await owner.query(ref('missions:get'), { missionId }).catch(() => null);
  const scoped = await owner.mutation(ref('missions:updateDraft'), { missionId, projectId: s.projectId, idempotencyKey: `scope:${binding.planSha256}`,
    title: proposal.title, objective: proposal.objective, stopCondition: proposal.stopCondition, ownerMemberId: s.ownerMemberId, owningTeamId: s.teamId,
    repositoryId: s.repositoryId, codeScopeIds: [s.codeScopeId], ...(mission?.constraints ? { constraints: mission.constraints } : {}) });
  record('OWNER_APPROVAL', { approval: 'SCOPE_MISSION_REPOSITORY', mutation: 'missions:updateDraft', missionId, repositoryId: s.repositoryId, codeScopeId: s.codeScopeId, updated: scoped.updated });
  // Owner delegates authorship of this Mission's Plan to the Sofie planner (time-boxed CONTRIBUTOR); the planner can never approve.
  const assigned = await owner.mutation(ref('softwareFactoryControlPlane:assignMissionMember'), { tenantId: s.tenantId, projectId: s.projectId, missionId,
    memberId: s.plannerMemberId, teamId: s.teamId, role: 'CONTRIBUTOR', expiresAt: Date.now() + 60 * 60 * 1000 });
  record('OWNER_APPROVAL', { approval: 'ASSIGN_PLANNER_CONTRIBUTOR', mutation: 'softwareFactoryControlPlane:assignMissionMember', missionId, assignmentId: assigned.assignmentId });
  const blueprintFor = stage => ({ ...blueprint, id: `stage-${stage}`, title: `Stage ${stage}/3: ${binding.title}`.slice(0, 160), sequence: stage,
    dependsOnBlueprintIds: stage === 1 ? [] : [`stage-${stage - 1}`] });
  const blueprint = { id: 'owner-request-build', title: binding.title, desiredOutcome: binding.request, workflowId: s.workflowId, sequence: 1, role: 'WORKER',
    isMutating: true, priority: 2, riskLevel: 'MEDIUM', constraints: [`Repository ${binding.repository} only`, 'MyFactory is the only execution engine', 'Owner-local; no production'],
    requiredApprovals: [], assertionIds: ['build-and-tests'], dependsOnBlueprintIds: [], branchStrategy: 'sofie/owner-requests',
    implementationPolicy: { allowedCommands: ['npm run build', 'npx playwright test'], maxAttempts: 2, maxFilesChanged: 40, maxLinesChanged: 4000,
      timeoutMinutes: 10, stopCondition: 'Stop at the MyFactory 10-minute Work cap or on any refusal; no automatic retry.',
      independentVerification: { executable: 'npx', args: ['playwright', 'test'], category: 'INTEGRATION_TEST', commandClass: 'TEST', evidenceCategory: 'BROWSER_RESULT', timeoutMs: 600000 } } };
  const assertion = { assertionId: 'build-and-tests', title: 'Factory build and Playwright tests pass', outcome: binding.request, verificationMethod: 'TEST',
    passCondition: 'npm run build && npx playwright test exits 0 in MyFactory', requiredEvidence: 'Signed MyFactory Result and local verifier verdict',
    requiresIndependentValidation: true, waiverAllowed: false };
  // The exact Plan the owner's confirmation specifies. Whatever the planner submits is compared with this before the owner approves it.
  const expectedPlan = { summary: `Owner-confirmed plan ${binding.planSha256}`, rollbackApproach: 'Candidate commits only; the baseline is unchanged until the owner publishes.',
    workOrderBlueprints: [1, 2, 3].map(blueprintFor), assertions: [assertion], metadata: { myevePlanSha256: binding.planSha256, works: binding.works.map(w => w.id) } };
  const draft = await planner.mutation(ref('missions:savePlanDraft'), { projectId: s.projectId, missionId, idempotencyKey: `plan:${binding.planSha256}`, ...expectedPlan });
  const planId = draft.plan._id;
  await planner.mutation(ref('missions:submitPlan'), { projectId: s.projectId, missionId, planId, idempotencyKey: `submit:${binding.planSha256}` });
  record('PLANNER_AUTHORED', { missionId, planId });
  // Re-read the SUBMITTED Plan (a PROPOSED Plan is immutable in MissionControl) and approve it only if it is exactly the confirmed specification.
  const detail = await owner.query(ref('missions:get'), { missionId });
  const verifiedPlanDigest = verifySubmittedPlan(detail?.plans?.find(x => x._id === planId), expectedPlan, { planId, missionId, repository: s.repository });
  record('PLAN_VERIFIED', { missionId, planId, verifiedPlanDigest });
  // 3 Owner decision: approve the exact Plan; this releases its WorkOrder with an APPLIED revision.
  const approved = await owner.mutation(ref('missions:approvePlan'), { projectId: s.projectId, missionId, planId,
    decisionReason: `Owner confirmed Sofie plan ${binding.confirmCode} (${binding.planSha256}); verified MissionControl Plan ${verifiedPlanDigest}`, idempotencyKey: `approve:${binding.planSha256}` });
  // The approval is bound to the verified digest: the approved Plan and its released WorkOrders must be exactly the verified ones.
  let approvedDigest = null;
  try { approvedDigest = verifySubmittedPlan(approved.plan, expectedPlan, { planId, missionId, repository: s.repository, status: 'APPROVED' }); } catch { /* mismatch below */ }
  if (approvedDigest !== verifiedPlanDigest || approved.workOrders?.length !== 3) { record('PLAN_APPROVAL_MISMATCH', { missionId, planId }); throw Error('PLAN_APPROVED_MISMATCH'); }
  const byStage = [1, 2, 3].map(stage => approved.workOrders.find(w => (w.metadata?.missionBlueprintId ?? w.missionBlueprintId) === `stage-${stage}`));
  if (byStage.some(w => !w?.currentRevisionId)) throw Error('PLAN_WORKORDERS_INCOMPLETE');
  const workOrder = byStage[0];
  const read = await owner.action(ref('sofieEnterprise:command'), serviceCommand(s, connected.connectionId, secret,
    { operation: 'enterprise.read', connectionId: connected.connectionId, proposalId, missionId, expectedPlanDigest: null }));
  const planDigest = read.response.plan.digest;
  record('OWNER_APPROVAL', { approval: 'APPROVE_PLAN_RELEASE_WORKORDER', mutation: 'missions:approvePlan', missionId, planId, planDigest,
    workOrders: byStage.map((w, i) => ({ stage: i + 1, workOrderId: w._id, workOrderRevisionId: w.currentRevisionId })), releasedWorkOrderIds: approved.workOrders.map(w => w._id) });
  const result = { connectionId: connected.connectionId, enrollment, proposalId, missionId, planId, planDigest, workOrderId: workOrder._id,
    expectedWorkOrderRevisionId: workOrder.currentRevisionId, projectId: s.projectId,
    workOrders: byStage.map((w, i) => ({ stage: i + 1, workOrderId: w._id, expectedWorkOrderRevisionId: w.currentRevisionId })) };
  record('STEP_COMPLETED', { result: { ...result, enrollment: undefined } });
  return result;
}

/** Verifies MyEve's Work-tuple attestation: signed under the same confirmation, for exactly its three Works and the step-A connection. */
export function verifyTuples(tuples, digest, binding, a) {
  const document = tuples?.document;
  if (!document || typeof tuples.signature !== 'string') throw Error('TUPLES_REQUIRED');
  if (!verify(null, Buffer.from('myeve-owner-confirmation-tuples/v1\n' + canonical(document)), confirmationKey(), Buffer.from(tuples.signature, 'base64url'))) throw Error('TUPLES_SIGNATURE');
  if (document.schema !== 'myeve-owner-confirmation-tuples/v1' || document.confirmationDigest !== digest || document.connectionId !== a.connectionId
    || document.enrollmentRevision !== binding.enrollmentPins?.revision || !Array.isArray(document.works) || document.works.length !== 3
    || document.works.some((w, i) => { const c = binding.works[i];
      return !c || w?.stage !== c.stage || w.id !== c.id || w.version !== c.version || w.generation !== c.generation || !SHA.test(w.tupleSha256); })) throw Error('TUPLES_INVALID');
  return new Map(document.works.map(w => [w.id, w.tupleSha256]));
}

/** Step B: approve exactly ONE prepared permit request whose Work tuple is the signed tuple of a confirmed stage Work, under the approved Plan. */
export async function approvePermitsStep(body, deps = {}) {
  const s = deps.setup ?? setup(), { binding, digest } = verifyConfirmation(body, 'B', s), owner = deps.owner ?? client('mc-owner-token');
  const a = used().find(r => r.confirmationDigest === digest && r.step === 'A' && r.kind === 'STEP_COMPLETED').result;
  const tuples = verifyTuples(body.tuples, digest, binding, a);
  // One request per call: a batch can never be half-approved.
  if (!Array.isArray(body.requestIds) || body.requestIds.length !== 1 || typeof body.requestIds[0] !== 'string') throw Error('PERMIT_REQUEST_EXACTLY_ONE');
  const [requestId] = body.requestIds;
  const pending = await owner.query(ref('sofieExecutionPermitState:pending'), { projectId: s.projectId, connectionId: a.connectionId });
  const r = pending?.requests?.find(x => x.requestId === requestId), w = r && binding.works.find(x => x.id === r.work?.id);
  const stageWorkOrder = w && a.workOrders.find(x => x.stage === w.stage);
  if (!r || !w || r.work.version !== w.version || r.work.generation !== w.generation || !SHA.test(r.work.tupleSha256 ?? '') || r.work.tupleSha256 !== tuples.get(w.id)
    || r.planDigest !== a.planDigest || r.workOrderId !== stageWorkOrder?.workOrderId
    || r.admission.maxCostMicrousd > binding.enrollmentPins.maxCostMicrousd || r.admission.maxDurationSeconds > binding.enrollmentPins.maxDurationSeconds
    || r.admission.factoryVersion !== binding.enrollmentPins.factoryVersion) throw Error('PERMIT_REQUEST_NOT_CONFIRMED');
  // Durable single use per Work revision, claimed synchronously after the checks and before the approval write.
  claimOnce(`B-${w.id}-${w.generation}`, { step: 'B', confirmationDigest: digest, requestId, tupleSha256: r.work.tupleSha256 });
  const approved = await owner.mutation(ref('sofieExecutionPermitState:approvePrepared'), { projectId: s.projectId, requestId });
  const approval = audit({ step: 'B', kind: 'OWNER_APPROVAL', approval: 'INSTALLED_EXECUTION_PERMIT', mutation: 'sofieExecutionPermitState:approvePrepared',
    confirmationDigest: digest, ownerId: binding.ownerId, planSha256: binding.planSha256, repository: binding.repository, requestId,
    work: r.work, signedTupleSha256: tuples.get(w.id), admission: r.admission, planDigest: r.planDigest, workOrderId: r.workOrderId, permitId: approved.document.permitId,
    approvalId: approved.document.approvalId, permitSha256: sha256('mc-execution-permit/v1\n' + canonical(approved.document)) });
  audit({ step: 'B', kind: 'STEP_COMPLETED', confirmationDigest: digest, permits: [approval.permitId] });
  return { permits: [{ workId: approval.work.id, permitId: approval.permitId, approvalId: approval.approvalId }] };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  createServer(async (req, res) => {
    const reply = (status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.method !== 'POST' || !['/confirm', '/approve-permits'].includes(req.url) || req.socket.remoteAddress !== '127.0.0.1') return reply(404, { error: 'NOT_FOUND' });
    let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 65536) return reply(413, { error: 'TOO_LARGE' }); }
    try { reply(200, await (req.url === '/confirm' ? confirmStep : approvePermitsStep)(JSON.parse(raw))); }
    catch (error) { audit({ kind: 'REFUSED', path: req.url, error: String(error?.message ?? error).slice(0, 500) }); reply(409, { error: String(error?.message ?? error).slice(0, 300) }); }
  }).listen(BRIDGE_PORT, '127.0.0.1', () => console.log('owner confirmation bridge on 127.0.0.1:' + BRIDGE_PORT));
}
