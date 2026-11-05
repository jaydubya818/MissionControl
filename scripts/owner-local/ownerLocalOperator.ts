// Disposable owner-local deployment only (copied in by scripts/owner-local/backend.mjs; never in convex/ of a hosted deployment).
// OPERATOR setup: workspace rows and the installed enrollment of an owner-created connection. It can never write an approval,
// proposal authorization, Plan decision, WorkOrder release or execution permit: those tables are refused here and are written only by
// the real mutations under the authenticated owner identity.
import { internalMutation, internalQuery } from './_generated/server';
import { v } from 'convex/values';

const SETUP = new Set(['tenants', 'projects', 'operators', 'roles', 'roleAssignments', 'orgMembers', 'scrumTeams', 'teamMemberships', 'workflows',
  'featureFlags', 'workspaceRepositories', 'repositoryCodeScopes']);
export const insert = internalMutation({ args: { table: v.string(), value: v.any() }, handler: async (ctx, args) => {
  if (!SETUP.has(args.table)) throw Error('OWNER_LOCAL_OPERATOR_TABLE_REFUSED');
  return ctx.db.insert(args.table as any, args.value);
} });
/** Installs the operator enrollment on a connection the authenticated owner created (connect). Only `installedEnrollment` may change. */
export const installEnrollment = internalMutation({ args: { connectionId: v.id('enterpriseAppConnections'), enrollment: v.any() }, handler: async (ctx, args) => {
  const c = await ctx.db.get(args.connectionId);
  if (!c || c.installedEnrollment !== undefined || args.enrollment.connectionId !== c._id || args.enrollment.missionControlOwnerId !== c.ownerId
    || args.enrollment.projectId !== c.projectId || args.enrollment.tenantId !== c.tenantId || args.enrollment.expiresAt > c.expiresAt) throw Error('OWNER_LOCAL_ENROLLMENT_REFUSED');
  await ctx.db.patch(c._id, { installedEnrollment: args.enrollment });
} });
export const patchProject = internalMutation({ args: { id: v.id('projects'), value: v.any() }, handler: (ctx, args) => ctx.db.patch(args.id, args.value) });
export const read = internalQuery({ args: { id: v.string() }, handler: (ctx, args) => ctx.db.get(args.id as any) });
export const rows = internalQuery({ args: { table: v.string() }, handler: (ctx, args) => ctx.db.query(args.table as any).collect() });
/** Read-only identity probe for the disposable deployment (no data). */
import { query } from './_generated/server';
export const whoami = query({ args: {}, handler: async ctx => { const i: any = await ctx.auth.getUserIdentity(); return i ? { ...i } : null; } });
