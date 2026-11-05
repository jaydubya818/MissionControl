import type { MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { COMPANY_PERMISSIONS, requireCompanyPermission } from './companyAccess';
import { missionAuthorityDatabase } from './missionScopedFunctions';

async function requireManager(ctx: MutationCtx, tenantId: Id<'tenants'> | undefined) {
  if (!await ctx.auth.getUserIdentity()) throw new Error('Authenticated member administrator required.');
  if (!tenantId) throw new Error('Member company assignment is required; use an explicit administrator migration.');
  const actor = await requireCompanyPermission({ ...ctx, db: missionAuthorityDatabase(ctx) }, tenantId, COMPANY_PERMISSIONS.MANAGE_MEMBERS);
  if (actor.mode !== 'AUTHENTICATED' || !actor.operatorId) throw new Error('Authenticated operator membership is required.');
  return tenantId;
}
export async function requireMemberAdministration(ctx: MutationCtx, id: Id<'orgMembers'>) {
  if (!await ctx.auth.getUserIdentity()) throw new Error('Authenticated member administrator required.');
  const db = missionAuthorityDatabase(ctx), member = await db.get(id);
  if (!member) throw new Error('Member unavailable or unauthorized.');
  const project = member.projectId ? await db.get(member.projectId) : null;
  if (member.tenantId && project?.tenantId && member.tenantId !== project.tenantId) throw new Error('Member company is unavailable or unauthorized.');
  return { member, tenantId: await requireManager(ctx, member.tenantId ?? project?.tenantId) };
}
export async function requireMemberCreation(ctx: MutationCtx, projectId?: Id<'projects'>, tenantId?: Id<'tenants'>) {
  const project = projectId ? await missionAuthorityDatabase(ctx).get(projectId) : null;
  if (projectId && !project?.tenantId || tenantId && project?.tenantId && tenantId !== project.tenantId) throw new Error('Member workspace is unavailable or unauthorized.');
  return await requireManager(ctx, tenantId ?? project?.tenantId);
}
export async function validateMemberLinks(ctx: MutationCtx, tenantId: Id<'tenants'>, args: Record<string, unknown>, memberId?: Id<'orgMembers'>) {
  const db = missionAuthorityDatabase(ctx);
  const grants = (args.projectAccess as {projectId:Id<'projects'>}[] | undefined) ?? [];
  const projects = [...grants.map(g => g.projectId), ...(args.projectId ? [args.projectId as Id<'projects'>] : [])];
  for (const id of projects) if ((await db.get(id))?.tenantId !== tenantId) throw new Error('Project access is unavailable or unauthorized for this company.');
  let parentId = (args.parentMemberId ?? args.newParentId) as Id<'orgMembers'> | undefined;
  const seen = new Set<string>();
  while (parentId) {
    if (parentId === memberId || seen.has(parentId) || seen.size >= 256) throw new Error('Member hierarchy must not contain a cycle.');
    seen.add(parentId);
    const parent = await db.get(parentId), project = parent?.projectId ? await db.get(parent.projectId) : null;
    if (!parent || (parent.tenantId ?? project?.tenantId) !== tenantId) throw new Error('Parent member is unavailable or unauthorized for this company.');
    parentId = parent.parentMemberId;
  }
}
