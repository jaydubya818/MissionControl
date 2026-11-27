import type { MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { COMPANY_PERMISSIONS, roleGrantsPermission, getOperatorRoles } from './companyAccess';
import { canonicalServiceCommand, validateServiceCommandEnvelope, type ServiceCommandEnvelope } from './serviceCommandAuth';
import { enterpriseDigest, SOFIE_APPLICATION, validateEnterpriseRequest } from '../../packages/shared/src/sofieEnterprise';
import { sha256Hex } from '../../packages/shared/src/canonicalDigest';
const denied = (): never => { throw Error('ENTERPRISE_ACCESS_DENIED'); };
export async function readiness(ctx: MutationCtx, projectId: Id<'projects'>) {
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

export async function currentConnection(ctx: MutationCtx, id: Id<'enterpriseAppConnections'>) {
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

export async function authorizeSofieApplicationCommand(args: { envelope: ServiceCommandEnvelope; payloadJson: string }) {
  if (args.payloadJson.length > 16000) return denied();
  let request;
  try { request = validateEnterpriseRequest(JSON.parse(args.payloadJson)); } catch { return denied(); }
  const secret = process.env.MC_SOFIE_APPLICATION_SECRET;
  if (!secret || secret.length < 32 || validateServiceCommandEnvelope(args.envelope, Date.now(), { serviceId: SOFIE_APPLICATION, capability: request.operation })
    || args.envelope.payloadDigest !== `sha256=${sha256Hex(args.payloadJson)}` || args.envelope.repositoryId !== `connection:${request.connectionId}`) return denied();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const signature = Uint8Array.from(args.envelope.signature.slice(7).match(/../g)!, b => parseInt(b, 16));
  if (!await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(canonicalServiceCommand(args.envelope)))) return denied();
  return request;
}


/** Re-evaluate the connection and exact frozen owner inside each database transaction. */
export async function requireSofieApplicationAuthority(ctx: MutationCtx, args: { envelope: ServiceCommandEnvelope; payloadJson: string }) {
  const request = await authorizeSofieApplicationCommand(args);
  const { connection, project } = await currentConnection(ctx, request.connectionId as Id<'enterpriseAppConnections'>);
  if (args.envelope.projectId !== project._id) return denied();
  const proposal = 'proposalId' in request && request.proposalId
    ? await ctx.db.get(request.proposalId as Id<'enterpriseMissionProposals'>)
    : 'intentKey' in request && request.intentKey
      ? await ctx.db.query('enterpriseMissionProposals').withIndex('by_connection_intent', q => q.eq('connectionId', connection._id).eq('intentKey', request.intentKey!)).unique() : null;
  if (proposal && (proposal.connectionId !== connection._id || proposal.ownerId !== connection.ownerId
    || proposal.tenantId !== connection.tenantId || proposal.projectId !== project._id || proposal.revokedAt !== undefined || proposal.expiresAt <= Date.now()
    || proposal.digest !== enterpriseDigest({connectionId:proposal.connectionId,tenantId:proposal.tenantId,projectId:proposal.projectId,
      ownerId:proposal.ownerId,intentKey:proposal.intentKey,proposal:proposal.proposal}))) return denied();
  if (request.operation === 'enterprise.submit' && (!proposal || proposal.authorizedAt === undefined
    || proposal.authorizedDigest !== proposal.digest || request.proposalDigest !== proposal.digest)) return denied();
  const missionId = request.operation === 'enterprise.result' ? request.missionId : proposal?.missionId;
  if (missionId) {
    const mission = await ctx.db.get(missionId as Id<'missions'>);
    if (!mission || mission.ownerOperatorId !== connection.ownerId || mission.tenantId !== connection.tenantId || mission.projectId !== project._id) return denied();
  }
  if (request.operation === 'enterprise.read' && missionId !== request.missionId) return denied();
  if (request.operation === 'enterprise.result' && connection.resultScope?.missionId !== missionId) return denied();
  return { connection, request, proposal, missionId, envelope: args.envelope };
}
export type SofieApplicationAuthority = Awaited<ReturnType<typeof requireSofieApplicationAuthority>>;
