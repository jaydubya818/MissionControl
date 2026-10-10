import { projectEnterpriseResult, resultMissionScope } from './lib/sofieEnterpriseResult';
import { v } from 'convex/values';
import { sofieApplicationAction as action, sofieApplicationMutation as internalMutation, mutation } from './lib/missionScopedFunctions';
import { readiness, currentConnection, authorizeSofieApplicationCommand } from './lib/sofieEnterpriseAuthority';
import type { MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { makeFunctionReference } from 'convex/server';
import { COMPANY_PERMISSIONS, requireWorkspaceAccess } from './lib/companyAccess';
import { enterpriseMissionOwner } from './lib/enterpriseMissionOwner';
import { getCurrentVerificationResult } from './lib/currentVerification';
import { createAuthorizedMissionDraft } from './missions';
import { enterpriseDigest, SOFIE_APPLICATION, validateEnterpriseRequest } from '../packages/shared/src/sofieEnterprise';

const envelope = v.object({ serviceId: v.string(), capability: v.string(), projectId: v.string(), repositoryId: v.string(),
  commandId: v.string(), issuedAt: v.number(), expiresAt: v.number(), payloadDigest: v.string(), signature: v.string() });
const denied = () => { throw Error('ENTERPRISE_ACCESS_DENIED'); };

export const connect = mutation({
  args: { missionId: v.optional(v.id('missions')), projectId: v.id('projects'), ownerMemberId: v.id('orgMembers'), owningTeamId: v.id('scrumTeams'), expiresAt: v.number() },
  handler: async (ctx, args) => {
    const project = await readiness(ctx, args.projectId);
    const access = await requireWorkspaceAccess(ctx, project.tenantId!, project._id, { permission: COMPANY_PERMISSIONS.ASSIGN_DELIVERY });
    if (access.membership.mode !== 'AUTHENTICATED' || !access.membership.operatorId) return denied();
    const member = await ctx.db.get(args.ownerMemberId);
    if (!member || member.operatorId !== access.membership.operatorId || member.projectId !== project._id) return denied();
    const keyId = process.env.MC_SOFIE_APPLICATION_KEY_ID;
    if (!keyId || !Number.isSafeInteger(args.expiresAt) || args.expiresAt <= Date.now() || args.expiresAt > Date.now() + 3600000) return denied();
    const { missionId, ...connectionArgs } = args;
    const resultScope = missionId ? (await resultMissionScope(ctx, { projectId:project._id, tenantId:project.tenantId!, ownerId:access.membership.operatorId }, missionId)).scope : undefined;
    const id = await ctx.db.insert('enterpriseAppConnections', { ...connectionArgs, ...(resultScope ? {resultScope} : {}), tenantId: project.tenantId!, ownerId: access.membership.operatorId,
      applicationId: SOFIE_APPLICATION, keyId, createdAt: Date.now() });
    await currentConnection(ctx, id);
    return { connectionId: id, applicationId: SOFIE_APPLICATION, ...(resultScope ? {resultScope} : {}), capabilities: ['enterprise.propose', 'enterprise.submit', 'enterprise.read', 'enterprise.inspect', ...(resultScope ? ['enterprise.result'] : [])], executionAuthority: 'NONE' };
  },
});

export const decide = mutation({
  args: { projectId: v.id('projects'), connectionId: v.id('enterpriseAppConnections'), proposalId: v.optional(v.id('enterpriseMissionProposals')),
    expectedDigest: v.optional(v.string()), decision: v.union(v.literal('AUTHORIZE_DRAFT'), v.literal('REVOKE')) },
  handler: async (ctx, args) => {
    const project = await readiness(ctx, args.projectId);
    const access = await requireWorkspaceAccess(ctx, project.tenantId!, project._id, { permission: COMPANY_PERMISSIONS.APPROVE_DELIVERY });
    const connection = await ctx.db.get(args.connectionId);
    if (!connection || connection.projectId !== project._id || access.membership.mode !== 'AUTHENTICATED'
      || access.membership.operatorId !== connection.ownerId) return denied();
    if (!args.proposalId) {
      if (args.decision !== 'REVOKE') return denied();
      await ctx.db.patch(connection._id, { revokedAt: Date.now() }); return { revoked: true };
    }
    const { connection: live } = await currentConnection(ctx, args.connectionId);
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.connectionId !== live._id || proposal.ownerId !== live.ownerId || args.expectedDigest !== proposal.digest) return denied();
    if (args.decision === 'REVOKE') { await ctx.db.patch(proposal._id, { revokedAt: Date.now() }); return { revoked: true }; }
    if (proposal.revokedAt !== undefined || proposal.expiresAt <= Date.now()) return denied();
    await ctx.db.patch(proposal._id, { authorizedAt: proposal.authorizedAt ?? Date.now(), authorizedDigest: proposal.digest });
    return { authorized: true, proposalDigest: proposal.digest, permittedEffect: 'CREATE_DRAFT_ONLY', executionAuthority: 'NONE' };
  },
});

export const command = action({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args): Promise<any> => {
    await authorizeSofieApplicationCommand(args);
    const response = await ctx.runMutation(makeFunctionReference<'mutation'>('sofieEnterprise:apply'), args);
    if (args.envelope.capability !== 'enterprise.result') return response;
    const authentication = { commandId:args.envelope.commandId, requestDigest:args.envelope.payloadDigest, expiresAt:Math.min(args.envelope.expiresAt,response.response.freshUntil) };
    const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(process.env.MC_SOFIE_APPLICATION_SECRET!),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const bytes = new TextEncoder().encode(enterpriseDigest({...response,authentication}));
    const signature = 'sha256:' + Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes)), b=>b.toString(16).padStart(2,'0')).join('');
    return {...response,authentication:{...authentication,signature}};
  },
});

export const apply = internalMutation({
  args: { envelope, payloadJson: v.string() },
  handler: async (ctx, args) => {
    const request = validateEnterpriseRequest(JSON.parse(args.payloadJson));
    const { connection, project, owner } = await currentConnection(ctx, request.connectionId as Id<'enterpriseAppConnections'>);
    if (args.envelope.projectId !== project._id || args.envelope.expiresAt <= Date.now()) return denied();
    const receipt = await ctx.db.query('serviceCommandReceipts').withIndex('by_command', q => q.eq('commandId', args.envelope.commandId)).first();
    if (receipt && (receipt.serviceId !== SOFIE_APPLICATION || receipt.payloadDigest !== args.envelope.payloadDigest
      || receipt.claimedProjectId !== project._id || receipt.claimedRepositoryId !== args.envelope.repositoryId || receipt.capability !== request.operation)) return denied();
    let response: any;
    if (request.operation === 'enterprise.result') {
      response = await projectEnterpriseResult(ctx, connection, request.missionId as Id<'missions'>, request.expectedPlanDigest);
    } else if (request.operation === 'enterprise.inspect') {
      const proposal = request.proposalId
        ? await ctx.db.get(request.proposalId as Id<'enterpriseMissionProposals'>)
        : await ctx.db.query('enterpriseMissionProposals').withIndex('by_connection_intent', q => q.eq('connectionId', connection._id).eq('intentKey', request.intentKey!)).unique();
      if (request.proposalId && !proposal) return denied();
      if (proposal && (proposal.connectionId !== connection._id || proposal.ownerId !== owner._id || proposal.projectId !== project._id
        || proposal.tenantId !== connection.tenantId || proposal.revokedAt !== undefined || proposal.expiresAt <= Date.now()
        || proposal.digest !== enterpriseDigest({connectionId:proposal.connectionId,tenantId:proposal.tenantId,projectId:proposal.projectId,
          ownerId:proposal.ownerId,intentKey:proposal.intentKey,proposal:proposal.proposal}))) return denied();
      response = { proposal: proposal ? { id:proposal._id, intentKey:proposal.intentKey, digest:proposal.digest,
        authorized:proposal.authorizedAt !== undefined && proposal.authorizedDigest === proposal.digest,
        missionId:proposal.missionId ?? null } : null, executionAuthority:'NONE' };
    } else if (request.operation === 'enterprise.propose') {
      const binding = { connectionId: connection._id, tenantId: connection.tenantId, projectId: project._id, ownerId: owner._id,
        intentKey: request.intentKey, proposal: request.proposal };
      const digest = enterpriseDigest(binding);
      const existing = await ctx.db.query('enterpriseMissionProposals').withIndex('by_connection_intent', q => q.eq('connectionId', connection._id).eq('intentKey', request.intentKey)).unique();
      if (existing && (existing.digest !== digest || existing.revokedAt !== undefined || existing.expiresAt <= Date.now())) return denied();
      const proposalId = existing?._id ?? await ctx.db.insert('enterpriseMissionProposals', { ...binding, digest, createdAt: Date.now(), expiresAt: connection.expiresAt });
      response = { proposalId, digest, proposal: request.proposal, needsYou: 'Authorize creation of this Mission draft. Plan approval and execution require separate decisions.', executionAuthority: 'NONE' };
    } else {
      const proposal = await ctx.db.get(request.proposalId as Id<'enterpriseMissionProposals'>);
      if (!proposal || proposal.connectionId !== connection._id || proposal.ownerId !== owner._id || proposal.projectId !== project._id
        || proposal.tenantId !== connection.tenantId || proposal.revokedAt !== undefined || proposal.expiresAt <= Date.now()
        || proposal.digest !== enterpriseDigest({ connectionId: proposal.connectionId, tenantId: proposal.tenantId, projectId: proposal.projectId,
          ownerId: proposal.ownerId, intentKey: proposal.intentKey, proposal: proposal.proposal })) return denied();
      if (request.operation === 'enterprise.submit') {
        if (request.proposalDigest !== proposal.digest || proposal.authorizedDigest !== proposal.digest || proposal.authorizedAt === undefined) return denied();
        if (!proposal.missionId) {
          const created = await createAuthorizedMissionDraft(ctx, { projectId: project._id, title: proposal.proposal.title, objective: proposal.proposal.objective,
            constraints: ['No execution authority. Separate canonical Plan approval and execution admission required.'], budgetUsd: 0,
            stopCondition: proposal.proposal.stopCondition, owner: String(owner._id),
            idempotencyKey: `sofie-proposal:${proposal._id}`, metadata: { schema: 'sofie-enterprise-intake/v1', proposalId: proposal._id, proposalDigest: proposal.digest,
              applicationId: SOFIE_APPLICATION, synthetic: true, productionAuthority: false } },
          { project, ownerMember: null, requestingOperatorId: owner._id, operator: { actorId: String(owner._id), actorSource: 'OWNER_AUTHORIZED_APPLICATION' } });
          await ctx.db.patch(proposal._id, { missionId: created.mission._id });
          response = { missionId: created.mission._id, proposalDigest: proposal.digest, created: true, executionAuthority: 'NONE' };
        } else response = { missionId: proposal.missionId, proposalDigest: proposal.digest, created: false, executionAuthority: 'NONE' };
      } else {
        if (proposal.missionId !== request.missionId) return denied();
        const mission = await ctx.db.get(proposal.missionId!);
        if (!mission || mission.projectId !== project._id || mission.tenantId !== connection.tenantId || await enterpriseMissionOwner(ctx, mission) !== owner._id) return denied();
        response = await projectMission(ctx, mission, request.expectedPlanDigest);
      }
    }
    if (!receipt) await ctx.db.insert('serviceCommandReceipts', { serviceId: SOFIE_APPLICATION, capability: request.operation, commandId: args.envelope.commandId,
      claimedProjectId: project._id, claimedRepositoryId: args.envelope.repositoryId, payloadDigest: args.envelope.payloadDigest, signatureStatus: 'VALID', status: 'SUCCEEDED',
      issuedAt: args.envelope.issuedAt, expiresAt: args.envelope.expiresAt, receivedAt: Date.now(), completedAt: Date.now(), attemptCount: 1 });
    return { schema: 'sofie-enterprise-response/v1', applicationId: SOFIE_APPLICATION, connectionId: connection._id,
      projectId: project._id, ownerId: owner._id, observedAt: Date.now(), responseDigest: enterpriseDigest(response), response };
  },
});

export async function projectMission(ctx: MutationCtx, mission: Doc<'missions'>, expectedPlanDigest: string | null) {
  const plans = await ctx.db.query('missionPlans').withIndex('by_mission_revision', q => q.eq('missionId', mission._id)).order('desc').take(21);
  if (plans.some(p => p.projectId !== mission.projectId || p.tenantId !== mission.tenantId)) return denied();
  const plan = mission.currentPlanId ? await ctx.db.get(mission.currentPlanId) : plans[0] ?? null;
  if (plan && (plan.missionId !== mission._id || plan.projectId !== mission.projectId || plan.tenantId !== mission.tenantId)) return denied();
  const planDigest = plan ? enterpriseDigest(plan) : null;
  if (expectedPlanDigest !== null && expectedPlanDigest !== planDigest) throw Error('ENTERPRISE_PLAN_STALE');
  const rows = await ctx.db.query('workOrders').withIndex('by_mission', q => q.eq('missionId', mission._id)).take(101);
  const workOrders = await Promise.all(rows.slice(0, 100).map(async wo => {
    if (wo.projectId !== mission.projectId || wo.tenantId !== mission.tenantId) return denied();
    const verification = wo.verificationContract?.schemaVersion === 2 && wo.verificationContract.enforcementMode === 'ENFORCED'
      ? await getCurrentVerificationResult(ctx, wo) : null;
    return { id: wo._id, title: wo.title, state: wo.state, revisionId: wo.currentRevisionId ?? null,
      planId: wo.missionPlanId ?? null, blockingIssue: wo.blockingIssue ?? null,
      qualityGate: verification ? { eligible: verification.eligible, reasons: verification.reasons, identity: verification.exactIdentity ?? null } : { eligible: false, reasons: ['NOT_EVALUATED'] } };
  }));
  const proofRows = await ctx.db.query('missionHandoffs').withIndex('by_mission', q => q.eq('missionId', mission._id)).take(101);
  if (proofRows.some(h => h.projectId !== mission.projectId || h.tenantId !== mission.tenantId)) return denied();
  const proof = proofRows.slice(0, 100).map(h => ({ handoffId: h._id, workOrderId: h.workOrderId, outcome: h.outcome }));
  return { mission: { id: mission._id, title: mission.title, state: mission.state, budgetUsd: mission.budgetUsd ?? null, spentUsd: mission.spentUsd },
    plan: plan ? { id: plan._id, revision: plan.revisionNumber, status: plan.status, digest: planDigest,
      milestones: plan.workOrderBlueprints.map(b => ({ id: b.id, title: b.title, dependsOn: b.dependsOnBlueprintIds })) } : null,
    plans: plans.slice(0,20).map(p => ({ id:p._id, revision:p.revisionNumber, status:p.status, digest:enterpriseDigest(p), isCurrent:mission.currentPlanId===p._id })),
    workOrders, blockers: [mission.blockingReason, ...workOrders.map(w => w.blockingIssue)].filter(Boolean),
    needsYou: mission.requiredHumanAction ?? (['DRAFT','PLANNING','AWAITING_PLAN_APPROVAL'].includes(mission.state) ? 'Prepare and approve a canonical Plan before execution.' : null),
    resultProof: { status: 'NOT_AVAILABLE', reason: 'COMPLETED_RESULT_REQUIRES_SCOPED_READ', references: proof },
    truncated: rows.length > 100 || proofRows.length > 100 || plans.length > 20, executionAuthority: 'NONE',
    explanation: 'Factory success is evidence. Enterprise acceptance requires the current canonical Quality Contract and independent verification. This response grants no execution or spending authority.' };
}
