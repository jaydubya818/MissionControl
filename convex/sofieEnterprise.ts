import { v } from 'convex/values';
import { action, internalMutation, mutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { makeFunctionReference } from 'convex/server';
import { COMPANY_PERMISSIONS, requireWorkspaceAccess, roleGrantsPermission, getOperatorRoles } from './lib/companyAccess';
import { enterpriseMissionOwner } from './lib/enterpriseMissionOwner';
import { getCurrentVerificationResult } from './lib/currentVerification';
import { createAuthorizedMissionDraft } from './missions';
import { canonicalServiceCommand, validateServiceCommandEnvelope, type ServiceCommandEnvelope } from './lib/serviceCommandAuth';
import { enterpriseDigest, SOFIE_APPLICATION, validateEnterpriseRequest } from '../packages/shared/src/sofieEnterprise';
import { sha256Hex } from '../packages/shared/src/canonicalDigest';

const envelope = v.object({ serviceId: v.string(), capability: v.string(), projectId: v.string(), repositoryId: v.string(),
  commandId: v.string(), issuedAt: v.number(), expiresAt: v.number(), payloadDigest: v.string(), signature: v.string() });
const denied = () => { throw Error('ENTERPRISE_ACCESS_DENIED'); };

async function readiness(ctx: MutationCtx, projectId: Id<'projects'>) {
  const project = await ctx.db.get(projectId);
  const envId = process.env.MC_SOFIE_READINESS_ENVIRONMENT_ID;
  const environment = envId ? await ctx.db.get(envId as Id<'environments'>) : null;
  if (!project?.tenantId || project.enterpriseAccountingMode !== 'ISOLATED_DETERMINISTIC'
    || project.metadata?.synthetic !== true || project.metadata?.productionAuthority !== false
    || !environment || environment.type !== 'dev' || environment.metadata?.synthetic !== true || environment.tenantId !== project.tenantId || environment.metadata?.projectId !== projectId
    || environment.metadata?.schema !== 'factory-qualification-environment/v1') return denied();
  if (!(await ctx.db.get(project.tenantId))?.active) return denied();
  return project;
}

async function currentConnection(ctx: MutationCtx, id: Id<'enterpriseAppConnections'>) {
  const connection = await ctx.db.get(id);
  if (!connection || connection.ownerId !== process.env.MC_SOFIE_APPLICATION_OWNER_ID || connection.revokedAt !== undefined || connection.expiresAt <= Date.now()
    || connection.keyId !== process.env.MC_SOFIE_APPLICATION_KEY_ID) return denied();
  const project = await readiness(ctx, connection.projectId);
  const [owner, member, team] = await Promise.all([ctx.db.get(connection.ownerId), ctx.db.get(connection.ownerMemberId), ctx.db.get(connection.owningTeamId)]);
  const membership = await ctx.db.query('teamMemberships').withIndex('by_team_member', q => q.eq('teamId', connection.owningTeamId).eq('memberId', connection.ownerMemberId)).first();
  if (connection.tenantId !== project.tenantId || !owner?.active || owner.tenantId !== project.tenantId
    || !member?.active || member.operatorId !== owner._id || member.projectId !== project._id || member.tenantId !== project.tenantId
    || !team || team.projectId !== project._id || team.tenantId !== project.tenantId || team.status !== 'ACTIVE' || !membership?.active || membership.projectId !== project._id || membership.tenantId !== project.tenantId || membership.activeFrom > Date.now() || (membership.activeUntil !== undefined && membership.activeUntil <= Date.now())) return denied();
  const roles = await getOperatorRoles(ctx, owner, project.tenantId!, { projectId: project._id });
  if (!roles.some(r => r && r.tenantId === project.tenantId && roleGrantsPermission(r, COMPANY_PERMISSIONS.ASSIGN_DELIVERY)
    && roleGrantsPermission(r, COMPANY_PERMISSIONS.UPDATE_DELIVERY))) return denied();
  return { connection, project, owner, member };
}

export const connect = mutation({
  args: { projectId: v.id('projects'), ownerMemberId: v.id('orgMembers'), owningTeamId: v.id('scrumTeams'), expiresAt: v.number() },
  handler: async (ctx, args) => {
    const project = await readiness(ctx, args.projectId);
    const access = await requireWorkspaceAccess(ctx, project.tenantId!, project._id, { permission: COMPANY_PERMISSIONS.ASSIGN_DELIVERY });
    if (access.membership.mode !== 'AUTHENTICATED' || !access.membership.operatorId) return denied();
    const member = await ctx.db.get(args.ownerMemberId);
    if (!member || member.operatorId !== access.membership.operatorId || member.projectId !== project._id) return denied();
    const keyId = process.env.MC_SOFIE_APPLICATION_KEY_ID;
    if (!keyId || !Number.isSafeInteger(args.expiresAt) || args.expiresAt <= Date.now() || args.expiresAt > Date.now() + 3600000) return denied();
    const id = await ctx.db.insert('enterpriseAppConnections', { ...args, tenantId: project.tenantId!, ownerId: access.membership.operatorId,
      applicationId: SOFIE_APPLICATION, keyId, createdAt: Date.now() });
    await currentConnection(ctx, id);
    return { connectionId: id, applicationId: SOFIE_APPLICATION, capabilities: ['enterprise.propose', 'enterprise.submit', 'enterprise.read'], executionAuthority: 'NONE' };
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
    return ctx.runMutation(makeFunctionReference<'mutation'>('sofieEnterprise:apply'), args);
  },
});

async function authorizeSofieApplicationCommand(args: { envelope: ServiceCommandEnvelope; payloadJson: string }) {
  if (args.payloadJson.length > 16000) return denied();
  let request;
  try { request = validateEnterpriseRequest(JSON.parse(args.payloadJson)); } catch { return denied(); }
  const secret = process.env.MC_SOFIE_APPLICATION_SECRET;
  if (!secret || secret.length < 32 || validateServiceCommandEnvelope(args.envelope, Date.now(), { serviceId: SOFIE_APPLICATION, capability: request.operation })
    || args.envelope.payloadDigest !== `sha256=${sha256Hex(args.payloadJson)}` || args.envelope.repositoryId !== `connection:${request.connectionId}`) return denied();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const signature = Uint8Array.from(args.envelope.signature.slice(7).match(/../g)!, b => parseInt(b, 16));
  if (!await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(canonicalServiceCommand(args.envelope)))) return denied();
}

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
    if (request.operation === 'enterprise.propose') {
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

async function projectMission(ctx: MutationCtx, mission: Doc<'missions'>, expectedPlanDigest: string | null) {
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
    resultProof: { status: 'NOT_AVAILABLE', reason: 'COMPLETED_RESULT_CONSUMPTION_NOT_QUALIFIED', references: proof },
    truncated: rows.length > 100 || proofRows.length > 100 || plans.length > 20, executionAuthority: 'NONE',
    explanation: 'Factory success is evidence. Enterprise acceptance requires the current canonical Quality Contract and independent verification. This response grants no execution or spending authority.' };
}
