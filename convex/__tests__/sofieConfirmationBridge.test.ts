import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, createHmac, createPublicKey, generateKeyPairSync, randomUUID, sign, verify } from 'node:crypto';
import { enterpriseDigest } from '../../packages/shared/src/sofieEnterprise';
import { canonicalServiceCommand } from '../../packages/shared/src/serviceCommandEnvelope';
import {
  APPROVE_CONFIRMED_PERMIT, CONFIRM_PLAN, CONFIRMATION_SCHEMA, CONFIRMATION_SERVICE_ID, SUBMISSION_SCHEMA, confirmationDigest, confirmationSigningText,
  confirmedIdentity, planContentDigest,
} from '../lib/sofieConfirmation';
import { applyPlanConfirmation, approveConfirmedPermit, recordConfirmationRefusal, type ConfirmationHandlers } from '../lib/sofieConfirmationBridge';
import { authenticateSofieConfirmationSubmission } from '../lib/sofieConfirmationCrypto';
import { ownerIdentityMatches } from '../lib/executionPermitAuthority';

// Unit qualification of the hosted confirmation bridge. The database is an in-memory model of a Convex mutation transaction: each call runs
// serialized and rolls back entirely on throw (Convex's serializable OCC outcome). MissionControl's handlers are recording stubs that assert the
// principal they run under; their own authorization logic is exercised by its existing suites, not here. No backend is contacted.
const ISSUER = 'https://dear-sunbird-98.clerk.accounts.dev', AZP = 'https://missioncontrol.example.com';
const hex = (s: string) => createHash('sha256').update(s).digest('hex');
const now = () => Date.now();
const keyPair = () => { const k = generateKeyPairSync('ed25519'); const pem = k.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  return { privateKey: k.privateKey, pem, keyId: createHash('sha256').update(k.publicKey.export({ type: 'spki', format: 'der' })).digest('hex') }; };
const keyA = keyPair(), keyB = keyPair(), stranger = keyPair();
const SUBMITTER_A = 's'.repeat(40), SUBMITTER_B = 't'.repeat(40);
const enrollmentFor = (who: 'a' | 'b') => ({ schema: 'mc-owner-enrollment/v1', environment: 'APPROVED_NONPRODUCTION', installationId: `inst-${who}`, revision: 1,
  ownerId: `myeve-${who}`, ownerSubject: `user_${who}`, missionControlOwnerId: `op-${who}`, tenantId: 'tenant', projectId: 'project', connectionId: `conn-${who}`,
  issuer: 'https://missioncontrol.example.com', audience: 'https://myeve.example.com', clerkIssuer: ISSUER, clerkAudience: 'convex', clerkAuthorizedParty: AZP,
  activeFrom: 0, expiresAt: now() + 3600_000, revokedAt: null, factoryVersion: hex('factory'), executionContractSha256: hex('contract'),
  capabilityPolicySha256: hex('policy'), maxCostMicrousd: 1_300_000, maxDurationSeconds: 180,
  permitKeys: [{ keyId: hex('permit'), publicKey: 'pem', activeFrom: 0, notAfter: now() + 3600_000, revokedAt: null }] });
const installation = (who: 'a' | 'b', key: { pem: string; keyId: string }, extra: Record<string, unknown> = {}) => ({ ownerSubject: `user_${who}`, missionControlOwnerId: `op-${who}`,
  repository: 'jay/app', repositoryId: 'repo-1', codeScopeIds: ['scope-1'], planner: { subject: `planner_${who}`, memberId: `planner-member-${who}` },
  keys: [{ keyId: key.keyId, publicKey: key.pem, activeFrom: 0, notAfter: now() + 3600_000, revokedAt: null, ...extra }] });
const blueprints = [1, 2, 3].map(stage => ({ id: `stage-${stage}`, title: `Stage ${stage}`, desiredOutcome: 'Build it', workflowId: 'wf', sequence: stage, role: 'WORKER',
  isMutating: true, priority: 2, riskLevel: 'MEDIUM', constraints: [], requiredApprovals: [], assertionIds: ['ok'], dependsOnBlueprintIds: stage === 1 ? [] : ['stage-1'] }));
const proposalBody = (who: string) => ({ connectionId: `conn-${who}`, tenantId: 'tenant', projectId: 'project', ownerId: `op-${who}`, intentKey: `intent-${who}`,
  proposal: { title: 'Build', objective: 'Build it', workstreams: [], milestones: [], stopCondition: 'stop', budgetMicrousd: 0 } });

function bindingFor(who: 'a' | 'b' = 'a', over: Record<string, any> = {}) {
  const works = [1, 2, 3].map(stage => ({ stage, id: `work-${who}-${stage}`, version: 1, generation: 1, tupleSha256: hex(`tuple-${who}-${stage}`) }));
  const plan = { summary: 'Confirmed', rollbackApproach: 'none', workOrderBlueprints: blueprints, assertions: [{ assertionId: 'ok' }],
    metadata: { myevePlanSha256: hex(`plan-${who}`), works: works.map(w => w.id) } };
  const issuedAt = now();
  return { schema: CONFIRMATION_SCHEMA, installationId: `inst-${who}`, subject: `user_${who}`, myeveOwnerId: `myeve-${who}`, connectionId: `conn-${who}`,
    enrollmentRevision: 1, proposalId: `prop-${who}`, proposalDigest: enterpriseDigest(proposalBody(who)), planSha256: hex(`plan-${who}`),
    planContentSha256: planContentDigest(plan), plan, repository: 'jay/app', works,
    limits: { factoryVersion: hex('factory'), maxCostMicrousd: 1_300_000, maxDurationSeconds: 180 }, issuedAt, expiresAt: issuedAt + 300_000, permitsExpiresAt: issuedAt + 30 * 60_000, nonce: randomUUID(), ...over };
}
const signed = (binding: any, key = keyA) => ({ binding, keyId: key.keyId, signature: sign(null, Buffer.from(confirmationSigningText(binding)), key.privateKey).toString('base64url') });
const submitCommand = (b: any) => ({ envelope: { serviceId: 'myeve-sofie-readiness-v1', capability: 'enterprise.submit', projectId: 'project', repositoryId: `connection:${b.connectionId}`,
  commandId: randomUUID(), issuedAt: now(), expiresAt: now() + 60_000, payloadDigest: 'sha256=' + '0'.repeat(64), signature: 'sha256=' + '0'.repeat(64) },
  payloadJson: JSON.stringify({ operation: 'enterprise.submit', connectionId: b.connectionId, proposalId: b.proposalId, proposalDigest: b.proposalDigest }) });

// ---- in-memory Convex transaction model ----
function database() {
  let rows: Record<string, any> = {}; let seq = 0; let queue: Promise<unknown> = Promise.resolve();
  const seed = () => {
    rows = {};
    for (const who of ['a', 'b'] as const) {
      rows[`conn-${who}`] = { _id: `conn-${who}`, _table: 'enterpriseAppConnections', ownerId: `op-${who}`, projectId: 'project', tenantId: 'tenant',
        ownerMemberId: `member-${who}`, owningTeamId: 'team', expiresAt: now() + 3600_000, installedEnrollment: enrollmentFor(who) };
      rows[`op-${who}`] = { _id: `op-${who}`, _table: 'operators', authId: `user_${who}`, active: true };
      rows[`prop-${who}`] = { _id: `prop-${who}`, _table: 'enterpriseMissionProposals', ...proposalBody(who), digest: enterpriseDigest(proposalBody(who)) };
    }
  };
  seed();
  const db = {
    get: async (id: string) => rows[id] ? structuredClone(rows[id]) : null,
    insert: async (table: string, value: any) => { const id = `${table}-${++seq}`; rows[id] = { ...structuredClone(value), _id: id, _table: table }; return id; },
    patch: async (id: string, value: any) => { rows[id] = { ...rows[id], ...structuredClone(value) }; },
    query: (table: string) => {
      const eqs: Array<[string, unknown]> = [];
      const q: any = { eq: (field: string, value: unknown) => { eqs.push([field, value]); return q; } };
      const result = () => Object.values(rows).filter(r => r._table === table && eqs.every(([f, v]) => r[f] === v)).map(r => structuredClone(r));
      const chain: any = { withIndex: (_: string, fn: (q: any) => any) => { fn(q); return chain; }, collect: async () => result(), take: async (n: number) => result().slice(0, n), first: async () => result()[0] ?? null };
      return chain;
    },
  };
  const auth = { getUserIdentity: async () => null };
  /** Serialized, all-or-nothing transaction. */
  const tx = <T>(fn: (ctx: any) => Promise<T>): Promise<T> => {
    const run = queue.then(async () => { const snapshot = structuredClone(rows), s = seq;
      try { return await fn({ db, auth }); } catch (e) { rows = snapshot; seq = s; throw e; } });
    queue = run.then(() => undefined, () => undefined);
    return run;
  };
  return { tx, rows: () => rows, table: (t: string) => Object.values(rows).filter(r => r._table === t), set: (id: string, v: any) => { rows[id] = { ...rows[id], ...v }; } };
}

type Call = { name: string; subject: string | null; identity: any; args: any };
function handlers(d: ReturnType<typeof database>, opts: { tamperPlan?: (plan: any) => void } = {}) {
  const calls: Call[] = [];
  const who = async (name: string, ctx: any, args: any) => { const identity = await ctx.auth.getUserIdentity(); calls.push({ name, subject: identity?.subject ?? null, identity, args }); };
  const h: ConfirmationHandlers = {
    decide: async (ctx, args) => { await who('decide', ctx, args); await ctx.db.patch(args.proposalId, { authorizedAt: now(), authorizedDigest: args.expectedDigest }); return { authorized: true }; },
    submit: async (ctx, args) => { await who('submit', ctx, args); const p = JSON.parse(args.payloadJson); const prop = await ctx.db.get(p.proposalId);
      const missionId = await ctx.db.insert('missions', { ownerOperatorId: prop.ownerId, projectId: 'project', title: 'Build', objective: 'Build it', stopCondition: 'stop' });
      await ctx.db.patch(p.proposalId, { missionId }); return { response: { missionId } }; },
    updateDraft: async (ctx, args) => { await who('updateDraft', ctx, args); return { updated: true }; },
    assignMissionMember: async (ctx, args) => { await who('assignMissionMember', ctx, args); return { assignmentId: 'assignment' }; },
    savePlanDraft: async (ctx, args) => { await who('savePlanDraft', ctx, args);
      const { projectId: _p, missionId, idempotencyKey: _i, ...spec } = args;
      const plan: any = { ...structuredClone(spec), missionId, status: 'DRAFT', repository: 'jay/app', workOrderBlueprints: spec.workOrderBlueprints.map((b: any) => ({ ...b, workflowVersion: 3 })) };
      opts.tamperPlan?.(plan);
      const id = await ctx.db.insert('missionPlans', plan); return { plan: await ctx.db.get(id) }; },
    submitPlan: async (ctx, args) => { await who('submitPlan', ctx, args); await ctx.db.patch(args.planId, { status: 'PROPOSED' }); return {}; },
    approvePlan: async (ctx, args) => { await who('approvePlan', ctx, args); const plan = await ctx.db.get(args.planId);
      // Like missions:approvePlan: approvedBy is the authenticated actor id (the identity subject), as observed on the live backend.
      await ctx.db.patch(args.planId, { status: 'APPROVED', approvedBy: (await ctx.auth.getUserIdentity()).subject, decisionReason: args.decisionReason });
      const workOrders = []; for (const bp of plan.workOrderBlueprints) { const id = await ctx.db.insert('workOrders', { metadata: { missionBlueprintId: bp.id }, currentRevisionId: `rev-${bp.id}` });
        workOrders.push(await ctx.db.get(id)); } return { workOrders }; },
    approvePrepared: async (ctx, args) => { await who('approvePrepared', ctx, args); const permitId = await ctx.db.insert('enterpriseExecutionPermits', { requestId: args.requestId });
      return { document: { permitId, approvalId: `approval-for-${args.requestId}` } }; },
  };
  return { h, calls };
}

let saved: NodeJS.ProcessEnv;
beforeEach(() => {
  saved = { ...process.env };
  process.env.MC_SOFIE_CONFIRMATION_INSTALLATIONS = JSON.stringify({ 'inst-a': installation('a', keyA), 'inst-b': installation('b', keyB) });
  process.env.MC_SOFIE_CONFIRMATION_SUBMITTER_SECRETS = JSON.stringify({ 'inst-a': { secret: SUBMITTER_A }, 'inst-b': { secret: SUBMITTER_B } });
});
afterEach(() => { process.env = saved; });

const planStep = (d: ReturnType<typeof database>, h: ConfirmationHandlers, c: any) => d.tx(ctx => applyPlanConfirmation(ctx, { confirmation: c, submit: submitCommand(c.binding) }, h));
function prepareRequest(d: ReturnType<typeof database>, accepted: any, b: any, stage: number, over: Record<string, any> = {}) {
  const work = b.works[stage - 1], wo = accepted.workOrders[stage - 1];
  const request = { connectionId: b.connectionId, proposalId: b.proposalId, projectId: 'project', workOrderId: wo.workOrderId, expectedWorkOrderRevisionId: wo.expectedWorkOrderRevisionId,
    expectedPlanDigest: accepted.planDigest, idempotencyKey: `k-${stage}`, work: { id: work.id, version: work.version, generation: work.generation, tupleSha256: work.tupleSha256 },
    admission: { factoryVersion: hex('factory'), executionContractSha256: hex('contract'), capabilityPolicySha256: hex('policy'), maxCostMicrousd: 1_000_000, maxDurationSeconds: 180 }, ...over };
  const id = `request-${stage}-${randomUUID()}`;
  d.set(id, { _id: id, _table: 'enterprisePermitRequests', connectionId: b.connectionId, projectId: 'project', missionId: accepted.missionId, workOrderId: wo.workOrderId, request, requestDigest: enterpriseDigest(request) });
  return id;
}

describe('hosted Sofie confirmation: Plan step', () => {
  it('performs each owner decision once, under the confirmed owner identity, with the Plan authored by the planner; audited as confirmed-by-sofie', async () => {
    const d = database(), { h, calls } = handlers(d), c = signed(bindingFor());
    const result = await planStep(d, h, c);
    expect(calls.map(x => `${x.name}:${x.subject}`)).toEqual(['decide:user_a', 'submit:null', 'updateDraft:user_a', 'assignMissionMember:user_a',
      'savePlanDraft:planner_a', 'submitPlan:planner_a', 'approvePlan:user_a']);
    const owner = calls.find(x => x.name === 'approvePlan')!;
    expect(owner.identity).toEqual({ subject: 'user_a', issuer: ISSUER, tokenIdentifier: `${ISSUER}|user_a`, azp: AZP });
    // The constructed identity is exactly what MissionControl's existing permit owner check accepts for the pinned production provider.
    expect(ownerIdentityMatches(owner.identity, enrollmentFor('a'))).toBe(true);
    expect(ownerIdentityMatches(confirmedIdentity('user_b', enrollmentFor('a')), enrollmentFor('a'))).toBe(false);
    const digest = confirmationDigest(c.binding);
    expect(owner.args.decisionReason).toContain(`confirmed-by-sofie: confirmation ${digest}`);
    expect(calls.find(x => x.name === 'updateDraft')!.args).toMatchObject({ repositoryId: 'repo-1', codeScopeIds: ['scope-1'] });
    expect(result.workOrders.map((w: any) => w.workId)).toEqual(['work-a-1', 'work-a-2', 'work-a-3']);
    const [receipt] = d.table('sofieConfirmationReceipts');
    expect(receipt).toMatchObject({ status: 'APPLIED', step: 'PLAN', confirmationDigest: digest, subject: 'user_a', keyId: keyA.keyId, ownerId: 'op-a' });
    // The receipt alone re-verifies: complete signed bytes + the signer's public key (independent of later configuration).
    expect(verify(null, Buffer.from(receipt.signedBinding), createPublicKey(receipt.signerPublicKey), Buffer.from(receipt.signature, 'base64url'))).toBe(true);
    expect(receipt.signedBinding).toBe(confirmationSigningText(c.binding));
    const [event] = d.table('missionEvents');
    expect(event).toMatchObject({ eventType: 'SOFIE_CONFIRMATION_APPLIED', actorId: 'op-a', metadata: { approvalReason: 'confirmed-by-sofie', confirmationDigest: digest } });
  });

  it('refuses a replay of an accepted confirmation; nothing runs twice', async () => {
    const d = database(), { h, calls } = handlers(d), c = signed(bindingFor());
    await planStep(d, h, c);
    await expect(planStep(d, h, c)).rejects.toThrow('CONFIRMATION_REPLAYED');
    expect(calls.filter(x => x.name === 'approvePlan')).toHaveLength(1);
    // A second confirmation reusing the nonce (even re-signed with other content) is also a replay.
    await expect(planStep(d, h, signed({ ...bindingFor(), nonce: c.binding.nonce }))).rejects.toThrow('CONFIRMATION_REPLAYED');
  });

  it('concurrent duplicate confirmations: exactly one commits', async () => {
    const d = database(), { h, calls } = handlers(d), c = signed(bindingFor());
    const outcomes = await Promise.allSettled([planStep(d, h, c), planStep(d, h, c), planStep(d, h, c)]);
    expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(o => o.status === 'rejected').map(o => String((o as PromiseRejectedResult).reason))).toEqual(
      [expect.stringContaining('CONFIRMATION_REPLAYED'), expect.stringContaining('CONFIRMATION_REPLAYED')]);
    expect(calls.filter(x => x.name === 'approvePlan')).toHaveLength(1);
    expect(d.table('sofieConfirmationReceipts')).toHaveLength(1);
  });

  it('refuses a Plan that differs from the confirmed one, before or after submission, and approves nothing', async () => {
    const d = database();
    // Before signing-verification: the carried specification no longer matches its signed digest.
    const changed = bindingFor(); (changed.plan as any).summary = 'Something else';
    await expect(planStep(d, handlers(d).h, signed(changed))).rejects.toThrow('PLAN_CONTENT_DIGEST');
    // After submission: MissionControl holds a different Plan (an added blueprint field, a changed assertion, an extra blueprint).
    for (const tamper of [(p: any) => { p.workOrderBlueprints[0].constraints = ['widened']; }, (p: any) => { p.assertions = []; },
      (p: any) => { p.workOrderBlueprints.push({ ...p.workOrderBlueprints[0], id: 'extra' }); }, (p: any) => { p.repository = 'jay/other'; }]) {
      const { h, calls } = handlers(d, { tamperPlan: tamper });
      await expect(planStep(d, h, signed(bindingFor()))).rejects.toThrow(/PLAN_CHANGED|PLAN_REPOSITORY_MISMATCH/);
      expect(calls.some(x => x.name === 'approvePlan')).toBe(false);
    }
    // All-or-nothing: no decision, Mission, claim or audit row survived any refused transaction.
    expect(d.table('missions')).toHaveLength(0); expect(d.table('sofieConfirmationReceipts')).toHaveLength(0);
    expect(d.rows()['prop-a'].authorizedAt).toBeUndefined();
  });

  it('refuses expired confirmations and malformed signed windows', async () => {
    const d = database(), { h } = handlers(d), t = now();
    await expect(planStep(d, h, signed(bindingFor('a', { issuedAt: t - 700_000, expiresAt: t - 100_000 })))).rejects.toThrow('CONFIRMATION_EXPIRED');
    await expect(planStep(d, h, signed(bindingFor('a', { issuedAt: t, expiresAt: t + 601_000 })))).rejects.toThrow('CONFIRMATION_WINDOW');
    await expect(planStep(d, h, signed(bindingFor('a', { issuedAt: t, expiresAt: t + 300_000, permitsExpiresAt: t + 45 * 60_000 + 1 })))).rejects.toThrow('CONFIRMATION_WINDOW');
    await expect(planStep(d, h, signed(bindingFor('a', { issuedAt: t, expiresAt: t + 300_000, permitsExpiresAt: t + 299_000 })))).rejects.toThrow('CONFIRMATION_WINDOW');
    // The permit authorization can never outlive the person's MissionControl enrollment.
    d.set('conn-a', { installedEnrollment: { ...enrollmentFor('a'), expiresAt: t + 20 * 60_000 } });
    await expect(planStep(d, h, signed(bindingFor('a')))).rejects.toThrow('WINDOW_EXCEEDS_ENROLLMENT');
  });

  it('enumerates exactly the three stage Works of the one confirmed request (count, ids and blueprints fixed at signing)', async () => {
    const d = database(), { h, calls } = handlers(d), base = bindingFor();
    for (const works of [base.works.slice(0, 2), [...base.works, { ...base.works[0], stage: 4, id: 'work-a-4' }]])
      await expect(planStep(d, h, signed({ ...base, nonce: randomUUID(), works }))).rejects.toThrow('WORKS');
    const plan = { ...base.plan, workOrderBlueprints: base.plan.workOrderBlueprints.map((b: any, i: number) => i === 2 ? { ...b, id: 'extra' } : b) };
    await expect(planStep(d, h, signed({ ...base, nonce: randomUUID(), plan, planContentSha256: planContentDigest(plan) }))).rejects.toThrow('PLAN_SHAPE');
    const four = { ...base.plan, workOrderBlueprints: [...base.plan.workOrderBlueprints, { ...blueprints[0], id: 'stage-4', sequence: 4 }] };
    await expect(planStep(d, h, signed({ ...base, nonce: randomUUID(), plan: four, planContentSha256: planContentDigest(four) }))).rejects.toThrow('PLAN_SHAPE');
    expect(calls).toHaveLength(0);
  });

  it('cross-user: a confirmation can never act on another person\'s Work or connection', async () => {
    const d = database(), { h, calls } = handlers(d);
    // Installation B's key and subject naming A's connection/proposal.
    await expect(planStep(d, h, signed(bindingFor('b', { connectionId: 'conn-a', proposalId: 'prop-a', proposalDigest: enterpriseDigest(proposalBody('a')) }), keyB))).rejects.toThrow('IDENTITY_MISMATCH');
    // Installation A claiming B's subject.
    await expect(planStep(d, h, signed(bindingFor('a', { subject: 'user_b' })))).rejects.toThrow('IDENTITY_MISMATCH');
    // A's subject on B's installation.
    await expect(planStep(d, h, signed(bindingFor('b', { subject: 'user_a' }), keyB))).rejects.toThrow('IDENTITY_MISMATCH');
    // Enrolled owner whose MissionControl operator no longer has the subject.
    d.set('op-a', { authId: 'someone-else' });
    await expect(planStep(d, h, signed(bindingFor()))).rejects.toThrow('IDENTITY_MISMATCH');
    expect(calls).toHaveLength(0);
  });

  it('refuses a proposal or submit command other than the confirmed one, and limits beyond the enrollment', async () => {
    const d = database(), { h } = handlers(d);
    await expect(planStep(d, h, signed(bindingFor('a', { proposalDigest: 'sha256:' + '1'.repeat(64) })))).rejects.toThrow('PROPOSAL_NOT_CONFIRMED');
    await expect(planStep(d, h, signed(bindingFor('a', { limits: { factoryVersion: hex('factory'), maxCostMicrousd: 1_300_001, maxDurationSeconds: 180 } })))).rejects.toThrow('LIMITS_EXCEED_ENROLLMENT');
    await expect(planStep(d, h, signed(bindingFor('a', { repository: 'jay/other' })))).rejects.toThrow('REPOSITORY_MISMATCH');
    const c = signed(bindingFor());
    const other = submitCommand(c.binding); other.payloadJson = JSON.stringify({ ...JSON.parse(other.payloadJson), proposalId: 'prop-b' });
    await expect(d.tx(ctx => applyPlanConfirmation(ctx, { confirmation: c, submit: other }, h))).rejects.toThrow('SUBMIT_COMMAND');
  });

  it('a refusal is audited but consumes nothing: a poisoned submission cannot block the correct one', async () => {
    const d = database(), { h, calls } = handlers(d), c = signed(bindingFor());
    // Someone holding the submitter credential and a copy of the signed confirmation submits it with a wrong submit command.
    const wrong = submitCommand(c.binding); wrong.payloadJson = JSON.stringify({ ...JSON.parse(wrong.payloadJson), proposalId: 'prop-b' });
    await expect(d.tx(ctx => applyPlanConfirmation(ctx, { confirmation: c, submit: wrong }, h))).rejects.toThrow('SUBMIT_COMMAND');
    await d.tx(ctx => recordConfirmationRefusal(ctx, { confirmation: c, step: 'PLAN', workId: '', reason: 'SOFIE_CONFIRMATION_REFUSED:SUBMIT_COMMAND' }));
    expect(d.table('sofieConfirmationReceipts')[0]).toMatchObject({ status: 'REFUSED', reason: 'SOFIE_CONFIRMATION_REFUSED:SUBMIT_COMMAND', signedBinding: confirmationSigningText(c.binding) });
    await expect(planStep(d, h, c)).resolves.toMatchObject({ confirmationDigest: confirmationDigest(c.binding) });
    expect(calls.filter(x => x.name === 'approvePlan')).toHaveLength(1);
    // Still exactly once.
    await expect(planStep(d, h, c)).rejects.toThrow('CONFIRMATION_REPLAYED');
  });
});

describe('hosted Sofie confirmation: per-Work permit step', () => {
  async function accepted() {
    const d = database(), { h, calls } = handlers(d), c = signed(bindingFor());
    return { d, h, calls, c, accepted: await planStep(d, h, c) };
  }
  const permit = (d: any, h: ConfirmationHandlers, c: any, requestId: string, workId: string) => d.tx((ctx: any) => approveConfirmedPermit(ctx, { confirmation: c, requestId, workId }, h));

  it('approves exactly the confirmed Work\'s prepared request, once, under the owner identity; audited', async () => {
    const { d, h, calls, c, accepted: a } = await accepted();
    const requestId = prepareRequest(d, a, c.binding, 1);
    const result = await permit(d, h, c, requestId, 'work-a-1');
    expect(result).toMatchObject({ workId: 'work-a-1', requestId });
    expect(calls.filter(x => x.name === 'approvePrepared').map(x => x.subject)).toEqual(['user_a']);
    expect(d.table('missionEvents').map(e => e.eventType)).toContain('SOFIE_CONFIRMED_PERMIT_APPROVED');
    await expect(permit(d, h, c, requestId, 'work-a-1')).rejects.toThrow('CONFIRMATION_REPLAYED');
    const again = prepareRequest(d, a, c.binding, 1, { idempotencyKey: 'k-again' });
    await expect(permit(d, h, c, again, 'work-a-1')).rejects.toThrow('CONFIRMATION_REPLAYED');
  });

  it('concurrent approvals for one Work: exactly one commits', async () => {
    const { d, h, calls, c, accepted: a } = await accepted();
    const ids = [prepareRequest(d, a, c.binding, 2), prepareRequest(d, a, c.binding, 2, { idempotencyKey: 'other' })];
    const outcomes = await Promise.allSettled(ids.map(id => permit(d, h, c, id, 'work-a-2')));
    expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(1);
    expect(calls.filter(x => x.name === 'approvePrepared')).toHaveLength(1);
  });

  it('refuses anything beyond the confirmed Work', async () => {
    const { d, h, calls, c, accepted: a } = await accepted();
    await expect(permit(d, h, c, prepareRequest(d, a, c.binding, 1), 'work-not-confirmed')).rejects.toThrow('WORK_NOT_CONFIRMED');
    const work = c.binding.works[0];
    for (const over of [{ work: { id: work.id, version: 2, generation: 1, tupleSha256: work.tupleSha256 } }, { work: { ...work, stage: undefined, tupleSha256: hex('other') } },
      { expectedPlanDigest: 'sha256:' + '2'.repeat(64) }, { workOrderId: a.workOrders[1].workOrderId },
      { admission: { factoryVersion: hex('factory'), executionContractSha256: hex('contract'), capabilityPolicySha256: hex('policy'), maxCostMicrousd: 1_300_001, maxDurationSeconds: 180 } },
      { admission: { factoryVersion: hex('other'), executionContractSha256: hex('contract'), capabilityPolicySha256: hex('policy'), maxCostMicrousd: 1, maxDurationSeconds: 1 } }]) {
      const clean = JSON.parse(JSON.stringify(over));
      await expect(permit(d, h, c, prepareRequest(d, a, c.binding, 1, clean), 'work-a-1')).rejects.toThrow('PERMIT_REQUEST_NOT_CONFIRMED');
    }
    // Another person's request under this confirmation.
    const foreign = prepareRequest(d, a, c.binding, 1); d.set(foreign, { connectionId: 'conn-b' });
    await expect(permit(d, h, c, foreign, 'work-a-1')).rejects.toThrow('PERMIT_REQUEST_NOT_CONFIRMED');
    expect(calls.some(x => x.name === 'approvePrepared')).toBe(false);
  });

  it('refuses a permit for an unaccepted confirmation, and honors the SIGNED permit expiry exactly (no substituted window)', async () => {
    const d = database(), { h } = handlers(d), c = signed(bindingFor());
    await expect(permit(d, h, c, 'request-x', 'work-a-1')).rejects.toThrow('CONFIRMATION_NOT_ACCEPTED');
    const x = await accepted(), r1 = prepareRequest(x.d, x.accepted, x.c.binding, 1), r2 = prepareRequest(x.d, x.accepted, x.c.binding, 2);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(x.c.binding.permitsExpiresAt - 1);
      await expect(permit(x.d, x.h, x.c, r1, 'work-a-1')).resolves.toMatchObject({ workId: 'work-a-1' });
      vi.setSystemTime(x.c.binding.permitsExpiresAt);
      await expect(permit(x.d, x.h, x.c, r2, 'work-a-2')).rejects.toThrow('CONFIRMATION_EXPIRED');
    } finally { vi.useRealTimers(); }
  });

  it('a refused permit call (absent request id) does not block the correct request for that Work', async () => {
    const { d, h, calls, c, accepted: a } = await accepted();
    await expect(permit(d, h, c, 'request-absent', 'work-a-1')).rejects.toThrow('PERMIT_REQUEST_NOT_CONFIRMED');
    await d.tx(ctx => recordConfirmationRefusal(ctx, { confirmation: c, step: 'PERMIT', workId: 'work-a-1', reason: 'SOFIE_CONFIRMATION_REFUSED:PERMIT_REQUEST_NOT_CONFIRMED' }));
    await expect(permit(d, h, c, prepareRequest(d, a, c.binding, 1), 'work-a-1')).resolves.toMatchObject({ workId: 'work-a-1' });
    expect(calls.filter(x => x.name === 'approvePrepared')).toHaveLength(1);
  });
});

describe('hosted Sofie confirmation: submission authentication', () => {
  function submission(c: any, capability: string = CONFIRM_PLAN, secret = SUBMITTER_A, installationId = 'inst-a') {
    const payload = capability === CONFIRM_PLAN ? { schema: SUBMISSION_SCHEMA, installationId, confirmation: c, submit: submitCommand(c.binding) }
      : { schema: SUBMISSION_SCHEMA, installationId, confirmation: c, requestId: 'r', workId: 'work-a-1' };
    const payloadJson = JSON.stringify(payload);
    const envelope: any = { serviceId: CONFIRMATION_SERVICE_ID, capability, projectId: 'project', repositoryId: `installation:${installationId}`, commandId: randomUUID(),
      issuedAt: now(), expiresAt: now() + 60_000, payloadDigest: 'sha256=' + createHash('sha256').update(payloadJson).digest('hex') };
    envelope.signature = 'sha256=' + createHmac('sha256', secret).update(canonicalServiceCommand(envelope)).digest('hex');
    return { envelope, payloadJson };
  }
  it('accepts the enrolled submitter carrying a confirmation signed by the installation\'s enrolled key', async () => {
    const c = signed(bindingFor());
    await expect(authenticateSofieConfirmationSubmission(submission(c), CONFIRM_PLAN)).resolves.toMatchObject({ confirmation: { keyId: keyA.keyId } });
    await expect(authenticateSofieConfirmationSubmission(submission(c, APPROVE_CONFIRMED_PERMIT), APPROVE_CONFIRMED_PERMIT)).resolves.toBeTruthy();
  });
  it('refuses signature, key-enrollment and submitter mismatches', async () => {
    const c = signed(bindingFor());
    const cases: Array<[any, string]> = [
      [submission(signed(bindingFor(), stranger)), 'CONFIRMATION_KEY_NOT_ENROLLED'],
      [submission({ ...signed(bindingFor(), stranger), keyId: keyA.keyId }), 'CONFIRMATION_SIGNATURE'],
      [submission({ ...c, binding: { ...c.binding, works: c.binding.works.map((w: any) => ({ ...w, generation: 2 })) } }), 'CONFIRMATION_SIGNATURE'],
      [submission(signed(bindingFor('a'), keyB)), 'CONFIRMATION_KEY_NOT_ENROLLED'],
      [submission(c, CONFIRM_PLAN, SUBMITTER_B), 'SUBMITTER_SIGNATURE'],
      [submission(c, CONFIRM_PLAN, SUBMITTER_B, 'inst-b'), 'INSTALLATION_MISMATCH'],
      [submission(signed(bindingFor('a', { installationId: 'inst-unknown' })), CONFIRM_PLAN, SUBMITTER_A, 'inst-unknown'), 'SUBMITTER_NOT_ENROLLED'],
    ];
    for (const [args, code] of cases) await expect(authenticateSofieConfirmationSubmission(args, CONFIRM_PLAN)).rejects.toThrow(code);
    await expect(authenticateSofieConfirmationSubmission(submission(c), APPROVE_CONFIRMED_PERMIT)).rejects.toThrow('SUBMISSION_SHAPE');
    process.env.MC_SOFIE_CONFIRMATION_INSTALLATIONS = JSON.stringify({ 'inst-a': installation('a', keyA, { revokedAt: now() - 1 }) });
    await expect(authenticateSofieConfirmationSubmission(submission(c), CONFIRM_PLAN)).rejects.toThrow('CONFIRMATION_KEY_NOT_ENROLLED');
    delete process.env.MC_SOFIE_CONFIRMATION_SUBMITTER_SECRETS;
    await expect(authenticateSofieConfirmationSubmission(submission(c), CONFIRM_PLAN)).rejects.toThrow('SUBMITTER');
  });
});
