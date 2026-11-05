import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { COMPANY_PERMISSIONS, requireWorkspaceAccess } from './companyAccess';
import { missionAuthorityDatabase } from './missionScopedFunctions';

export async function requirePolicyAdministration(ctx: MutationCtx, projectId: Id<'projects'> | undefined, tenantId?: Id<'tenants'>) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('Authenticated policy administrator required.');
  if (!projectId) throw new Error('An explicit policy workspace is required; global policy changes are internal administrator operations.');
  const db = missionAuthorityDatabase(ctx), project = await db.get(projectId);
  if (!project?.tenantId || tenantId && tenantId !== project.tenantId) throw new Error('Policy workspace is unavailable or unauthorized.');
  const access = await requireWorkspaceAccess({ ...ctx, db }, project.tenantId, projectId, { permission: COMPANY_PERMISSIONS.MANAGE_COMPANY });
  if (access.membership.mode !== 'AUTHENTICATED') throw new Error('Authenticated policy administrator required.');
  return { projectId, tenantId: project.tenantId, subject: identity.subject };
}

/** Legacy defaults are read-compatible; workspace policies never select another workspace's policy. */
export async function loadActiveLegacyPolicy(ctx: QueryCtx | MutationCtx, projectId?: Id<'projects'>) {
  const rows = await ctx.db.query('policies').withIndex('by_active', q => q.eq('active', true)).order('desc').collect();
  return rows.find(row => projectId && row.projectId === projectId)
    ?? rows.find(row => !row.projectId && !row.tenantId) ?? null;
}
