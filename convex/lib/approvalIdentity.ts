import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { COMPANY_PERMISSIONS, requireWorkspaceAccess, type CompanyPermission } from './companyAccess';
import { missionAuthorityDatabase } from './missionScopedFunctions';

export const APPROVAL_IDENTITY_VERSION = 'authenticated-operator/v1' as const;

export async function requireApprovalActor(ctx: MutationCtx, projectId: Id<'projects'> | undefined, permission: CompanyPermission, tenantId?: Id<'tenants'>) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('Authenticated approval operator required.');
  if (!projectId) throw new Error('An authorized workspace is required for approval operations.');
  const db = missionAuthorityDatabase(ctx), project = await db.get(projectId);
  if (!project?.tenantId || tenantId && tenantId !== project.tenantId) throw new Error('Approval workspace is unavailable or unauthorized.');
  const policy = { ...ctx, db };
  const access = await requireWorkspaceAccess(policy, project.tenantId, projectId, { permission });
  // Legacy Task decisions also append delivery/audit records. Keep this explicit
  // rather than letting a caller-supplied human label supply either privilege.
  if (permission === COMPANY_PERMISSIONS.APPROVE_DELIVERY) await requireWorkspaceAccess(policy, project.tenantId, projectId, { permission: COMPANY_PERMISSIONS.UPDATE_DELIVERY });
  const operator = access.membership.operatorId ? await db.get(access.membership.operatorId) : null;
  if (!operator?.active || operator.authId !== identity.subject || operator.tenantId !== project.tenantId) throw new Error('Authenticated operator membership is required.');
  return { operatorId: operator._id, subject: identity.subject, projectId, tenantId: project.tenantId };
}

/** Old display strings are not evidence of an authenticated approval. */
export function hasAuthenticatedApproval(approval: Doc<'approvals'>): boolean {
  if (approval.status !== 'APPROVED' || approval.decisionIdentityVersion !== APPROVAL_IDENTITY_VERSION || !approval.decidedByOperatorId || !approval.decidedByUserId) return false;
  const required = Math.max(approval.riskLevel === 'RED' ? 2 : 1, approval.requiredDecisionCount ?? 1);
  if ((approval.decisionCount ?? 0) < required || required > 2) return false;
  return required === 1 || Boolean(approval.firstDecisionOperatorId && approval.firstDecisionByUserId
    && approval.firstDecisionOperatorId !== approval.decidedByOperatorId
    && approval.firstDecisionByUserId !== approval.decidedByUserId);
}
