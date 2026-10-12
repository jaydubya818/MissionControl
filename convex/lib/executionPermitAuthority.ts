import type { MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { COMPANY_PERMISSIONS, requireWorkspaceAccess } from './companyAccess';
import { currentConnection } from './sofieEnterpriseAuthority';
import { installedEnrollment, installedServiceSecret, installedOrigins } from './installedSofieConnection';
import { enterpriseDigest, SOFIE_APPLICATION } from '../../packages/shared/src/sofieEnterprise';
import { canonicalServiceCommand, validateServiceCommandEnvelope, type ServiceCommandEnvelope } from './serviceCommandAuth';
import { sha256Hex } from '../../packages/shared/src/canonicalDigest';
import { enterprisePlanApprovedByOwner } from './enterpriseDelegationAdmission';
import { canonicalPermitJson, parseOwnerEnrollment, parseExecutionPermit, permitDenied, permitDigest, requirePermitEnrollment } from '../../packages/shared/src/executionPermit';

export async function permitConnection(ctx: MutationCtx, connectionId: Id<'enterpriseAppConnections'>, authenticatedOwner: boolean) {
  const live = await currentConnection(ctx, connectionId), { enrollment } = await installedEnrollment(ctx, live.connection);
  if (live.owner.authId !== enrollment.ownerSubject) return permitDenied();
  if (authenticatedOwner) {
    const identity = await ctx.auth.getUserIdentity();
    const access = await requireWorkspaceAccess(ctx, live.connection.tenantId, live.connection.projectId, { permission: COMPANY_PERMISSIONS.APPROVE_DELIVERY });
    if (!identity || identity.subject !== enrollment.ownerSubject || identity.issuer !== enrollment.clerkIssuer
      || (identity as any).aud !== enrollment.clerkAudience || (identity as any).azp !== enrollment.clerkAuthorizedParty
      || access.membership.mode !== 'AUTHENTICATED' || access.membership.operatorId !== live.owner._id) return permitDenied();
  }
  return { ...live, enrollment };
}
export async function permitMission(ctx: MutationCtx, connectionId: Id<'enterpriseAppConnections'>, proposalId: Id<'enterpriseMissionProposals'>,
  workOrderId: Id<'workOrders'>, expectedPlanDigest: string, authenticatedOwner: boolean) {
  const live = await permitConnection(ctx, connectionId, authenticatedOwner), proposal = await ctx.db.get(proposalId);
  if (!proposal || proposal.connectionId !== connectionId || proposal.ownerId !== live.owner._id || proposal.projectId !== live.project._id
    || proposal.tenantId !== live.connection.tenantId || proposal.revokedAt !== undefined || proposal.expiresAt <= Date.now()
    || proposal.authorizedAt === undefined || proposal.authorizedDigest !== proposal.digest || !proposal.missionId
    || proposal.digest !== enterpriseDigest({connectionId:proposal.connectionId,tenantId:proposal.tenantId,projectId:proposal.projectId,
      ownerId:proposal.ownerId,intentKey:proposal.intentKey,proposal:proposal.proposal})) return permitDenied();
  const mission = await ctx.db.get(proposal.missionId), workOrder = await ctx.db.get(workOrderId);
  const plan = mission?.currentPlanId ? await ctx.db.get(mission.currentPlanId) : null;
  if (!mission || mission.ownerOperatorId !== live.owner._id || mission.projectId !== live.project._id || mission.tenantId !== live.connection.tenantId
    || ['CANCELED','SUPERSEDED','BLOCKED','DONE'].includes(mission.state) || !plan || plan.missionId !== mission._id
    || plan.projectId !== mission.projectId || plan.tenantId !== mission.tenantId || enterpriseDigest(plan) !== expectedPlanDigest
    || !await enterprisePlanApprovedByOwner(ctx, plan, live.owner._id) || !workOrder || workOrder.missionId !== mission._id
    || workOrder.missionPlanId !== plan._id || workOrder.missionPlanRevision !== plan.revisionNumber
    || workOrder.projectId !== mission.projectId || workOrder.tenantId !== mission.tenantId || !workOrder.currentRevisionId
    || !plan.releasedWorkOrderIds?.includes(workOrder._id) || ['CANCELED','SUPERSEDED','BLOCKED','DONE'].includes(workOrder.state)) return permitDenied();
  const revision = await ctx.db.get(workOrder.currentRevisionId);
  if (!revision || revision.workOrderId !== workOrder._id || revision.projectId !== workOrder.projectId || revision.tenantId !== workOrder.tenantId || revision.status !== 'APPLIED' || revision.revisionNumber !== workOrder.currentRevisionNumber) return permitDenied();
  return { ...live, proposal, mission, plan, workOrder, revision };
}
export async function currentPermit(ctx: MutationCtx, permitId: Id<'enterpriseExecutionPermits'>, authenticatedOwner: boolean) {
  const row = await ctx.db.get(permitId);
  if (!row || row.revokedAt !== undefined) return permitDenied();
  const document = parseExecutionPermit(row.document);
  const live = await permitMission(ctx, row.connectionId, row.proposalId, row.workOrderId, document.planDigest, authenticatedOwner);
  requirePermitEnrollment(document, live.enrollment, Date.now());
  const approval = await ctx.db.get(row.approvalId);
  if (document.permitId !== row._id || document.connectionId !== row.connectionId || document.missionId !== live.mission._id
    || document.planId !== live.plan._id || document.workOrderId !== live.workOrder._id || document.workOrderRevisionId !== live.workOrder.currentRevisionId
    || document.approvalId !== row.approvalId || row.permitSha256 !== permitDigest(document) || !approval
    || approval.projectId !== live.project._id || approval.tenantId !== live.connection.tenantId || approval.workOrderId !== live.workOrder._id
    || approval.workOrderRevisionNumber !== live.workOrder.currentRevisionNumber || approval.approvalType !== 'INSTALLED_EXECUTION_PERMIT'
    || approval.approver !== live.owner._id || approval.status !== 'APPROVED' || approval.decision !== 'APPROVE'
    || approval.revokedAt !== undefined || approval.expiredAt !== undefined || approval.invalidatedByRevisionId !== undefined || approval.supersededByApprovalDecisionId
    || !approval.expiresAt || approval.expiresAt <= Date.now() || document.approvalDigest !== enterpriseDigest(approval)
    || approval.metadata?.authenticatedSubject !== live.enrollment.ownerSubject || approval.metadata?.planDigest !== document.planDigest
    || approval.metadata?.workBinding !== canonicalPermitJson(document.work) || approval.metadata?.admissionBinding !== canonicalPermitJson(document.admission)) return permitDenied();
  return { ...live, row, document, approval };
}
export async function authenticatePermitCommand(ctx: MutationCtx, envelope: ServiceCommandEnvelope, payloadJson: string, connectionId: Id<'enterpriseAppConnections'>, capability: string, controlOnly = false) {
  const live = controlOnly ? await controlConnection(ctx,connectionId,capability) : await permitConnection(ctx, connectionId, false), now = Date.now();
  if (payloadJson.length > (capability === 'enterprise.authorizeAdmission' ? 40000 : 16000) || validateServiceCommandEnvelope(envelope, now, { serviceId:SOFIE_APPLICATION, capability })
    || envelope.issuedAt > now || envelope.projectId !== live.project._id || envelope.repositoryId !== `connection:${connectionId}`
    || envelope.payloadDigest !== `sha256=${sha256Hex(payloadJson)}`) return permitDenied();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(installedServiceSecret(live.connection._id,live.connection.keyId)), {name:'HMAC',hash:'SHA-256'}, false, ['verify']);
  const signature = Uint8Array.from(envelope.signature.slice(7).match(/../g)!, b=>parseInt(b,16));
  if (!await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(canonicalServiceCommand(envelope)))) return permitDenied();
  return live;
}

export async function controlConnection(ctx:MutationCtx,id:Id<'enterpriseAppConnections'>,capability:string) {
  if(!['enterprise.readPermitControl','enterprise.acknowledgePermitControl'].includes(capability))return permitDenied();
  const connection=await ctx.db.get(id);if(!connection)return permitDenied();
  const enrollment=parseOwnerEnrollment(connection.installedEnrollment),origins=installedOrigins();
  const owner=await ctx.db.get(connection.ownerId),project=await ctx.db.get(connection.projectId);
  if(!owner||!project||owner.authId!==enrollment.ownerSubject||owner._id!==enrollment.missionControlOwnerId||enrollment.connectionId!==id
    ||enrollment.projectId!==project._id||enrollment.tenantId!==connection.tenantId||owner.tenantId!==connection.tenantId||project.tenantId!==connection.tenantId
    ||origins.issuer!==enrollment.issuer||origins.audience!==enrollment.audience||project.metadata?.sofieMode!=='INSTALLED_NONPRODUCTION'||project.metadata.productionAuthority!==false)return permitDenied();
  return {connection,enrollment,owner,project};
}

export async function permitLifecycleOwner(ctx:MutationCtx,connectionId:Id<'enterpriseAppConnections'>) {
 const live=await controlConnection(ctx,connectionId,'enterprise.readPermitControl');
 const identity=await ctx.auth.getUserIdentity();
 const access=await requireWorkspaceAccess(ctx,live.connection.tenantId,live.connection.projectId,{permission:COMPANY_PERMISSIONS.APPROVE_DELIVERY});
 if(!identity||identity.subject!==live.enrollment.ownerSubject||identity.issuer!==live.enrollment.clerkIssuer
  ||(identity as any).aud!==live.enrollment.clerkAudience||(identity as any).azp!==live.enrollment.clerkAuthorizedParty
  ||!live.owner.active||access.membership.mode!=='AUTHENTICATED'||access.membership.operatorId!==live.owner._id)return permitDenied();
 return live;
}
