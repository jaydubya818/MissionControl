import type { MutationCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { COMPANY_PERMISSIONS, getOperatorRoles, roleGrantsPermission } from './companyAccess';
import { installedEnrollment } from './installedSofieConnection';
import { confirmationInstallation } from './sofieConfirmation';
import { canonicalPermitJson, parseOwnerEnrollment } from '../../packages/shared/src/executionPermit';

/**
 * Private-beta operator setup for hosted Sofie (deployment-admin only; called through internal mutations, never from a request).
 * The named operator must be an active company administrator of the record's tenant; every change is audited in `activities`.
 * - linkMemberSubject: binds an org member record to the operator whose Clerk subject is given (one subject <-> one member).
 * - installOwnerEnrollment: installs the operator enrollment on a Sofie connection of an ENROLLED confirmation installation.
 */
type Ctx = Pick<MutationCtx, 'db'>;
const refuse = (code: string): never => { throw new Error(`SOFIE_OPERATOR_SETUP_${code}`); };

async function requireOperatorAdmin(ctx: Ctx, actorOperatorId: Id<'operators'>, tenantId: Id<'tenants'>) {
  const actor = await ctx.db.get(actorOperatorId);
  if (!actor?.active || actor.tenantId !== tenantId) return refuse('OPERATOR_REQUIRED');
  const roles = await getOperatorRoles(ctx as any, actor, tenantId);
  if (!roles.some(role => roleGrantsPermission(role, COMPANY_PERMISSIONS.MANAGE_MEMBERS))) return refuse('OPERATOR_NOT_AUTHORIZED');
  return actor;
}

export async function linkMemberSubject(ctx: Ctx, args: { actorOperatorId: Id<'operators'>; memberId: Id<'orgMembers'>; subject: string }) {
  const member = await ctx.db.get(args.memberId);
  if (!member?.active || !member.tenantId || !member.projectId) return refuse('MEMBER_REQUIRED');
  const actor = await requireOperatorAdmin(ctx, args.actorOperatorId, member.tenantId);
  if (typeof args.subject !== 'string' || !/^[A-Za-z0-9_|:.-]{1,200}$/.test(args.subject)) return refuse('SUBJECT_INVALID');
  const operators = (await ctx.db.query('operators').withIndex('by_tenant_auth_id', q => q.eq('tenantId', member.tenantId!).eq('authId', args.subject)).collect())
    .filter(o => o.active);
  if (operators.length !== 1) return refuse('SUBJECT_OPERATOR_NOT_FOUND');
  const operator = operators[0];
  if (member.operatorId === operator._id) return { memberId: member._id, operatorId: operator._id, changed: false };
  if (member.operatorId) return refuse('MEMBER_LINKED_TO_OTHER_SUBJECT');
  const others = (await ctx.db.query('orgMembers').withIndex('by_operator', q => q.eq('operatorId', operator._id)).collect()).filter(m => m._id !== member._id);
  if (others.length > 0) return refuse('SUBJECT_LINKED_TO_OTHER_MEMBER');
  await ctx.db.patch(member._id, { operatorId: operator._id });
  await ctx.db.insert('activities', { tenantId: member.tenantId, projectId: member.projectId, actorType: 'HUMAN', actorId: actor._id,
    action: 'SOFIE_MEMBER_SUBJECT_LINKED', description: `Member "${member.name}" linked to its authenticated operator`,
    targetType: 'ORG_MEMBER', targetId: member._id, metadata: { operatorId: operator._id, subject: args.subject } });
  return { memberId: member._id, operatorId: operator._id, changed: true };
}

export async function installOwnerEnrollment(ctx: Ctx, args: { actorOperatorId: Id<'operators'>; connectionId: Id<'enterpriseAppConnections'>; enrollment: unknown }) {
  const connection = await ctx.db.get(args.connectionId);
  if (!connection || connection.revokedAt !== undefined || connection.expiresAt <= Date.now()) return refuse('CONNECTION_REQUIRED');
  const actor = await requireOperatorAdmin(ctx, args.actorOperatorId, connection.tenantId);
  let enrollment; try { enrollment = parseOwnerEnrollment(args.enrollment); } catch { return refuse('ENROLLMENT_INVALID'); }
  let installation; try { installation = confirmationInstallation(enrollment.installationId); } catch { return refuse('INSTALLATION_NOT_ENROLLED'); }
  const owner = await ctx.db.get(connection.ownerId), member = await ctx.db.get(connection.ownerMemberId);
  if (!owner?.active || owner.authId !== enrollment.ownerSubject || installation.ownerSubject !== enrollment.ownerSubject
    || installation.missionControlOwnerId !== connection.ownerId || member?.operatorId !== owner._id) return refuse('INSTALLATION_SCOPE');
  try { await installedEnrollment(ctx, { ...connection, installedEnrollment: enrollment } as Doc<'enterpriseAppConnections'>); }
  catch { return refuse('ENROLLMENT_NOT_ADMISSIBLE'); }
  const existing = connection.installedEnrollment as { revision?: number } | undefined;
  if (existing !== undefined) {
    if (canonicalPermitJson(existing) === canonicalPermitJson(enrollment)) return { connectionId: connection._id, revision: enrollment.revision, changed: false };
    if (!(typeof existing.revision === 'number' && enrollment.revision > existing.revision)) return refuse('REVISION_NOT_NEWER');
  }
  await ctx.db.patch(connection._id, { installedEnrollment: enrollment });
  await ctx.db.insert('activities', { tenantId: connection.tenantId, projectId: connection.projectId, actorType: 'HUMAN', actorId: actor._id,
    action: 'SOFIE_ENROLLMENT_INSTALLED', description: `Sofie enrollment ${enrollment.installationId} r${enrollment.revision} installed on a connection`,
    targetType: 'ENTERPRISE_APP_CONNECTION', targetId: connection._id,
    metadata: { installationId: enrollment.installationId, revision: enrollment.revision, expiresAt: enrollment.expiresAt, replaced: existing !== undefined } });
  return { connectionId: connection._id, revision: enrollment.revision, changed: true };
}
