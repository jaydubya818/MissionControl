import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { COMPANY_PERMISSIONS, FACTORY_PERMISSIONS, requireCompanyAccess, requireWorkspaceAccess, requireWorkspacePermission } from './companyAccess';

type Row = Record<string, any>;
const protectedTables = new Set(['tasks', 'taskEvents', 'taskTransitions', 'activities', 'workflowRuns', 'runEvents', 'runArtifacts', 'workflowMetrics', 'approvals', 'approvalRecords', 'policies', 'policyEnvelopes']);

/** Legacy resources have workspace authority. Exact Mission grants keep their
 * existing lineage policy; this fallback cannot replace or widen those grants. */
export function legacyWorkspaceAccess(ctx: QueryCtx | MutationCtx, read: (id: string) => Promise<any>, lineage: { tableOf(id: string): string | null; references(row: Row, table?: string): string[] }) {
  async function hasMission(row: Row, table?: string, seen = new Set<string>()): Promise<boolean> {
    if (table === 'missions') return true;
    if (table === 'projects' || table === 'tenants') return false;
    if (row._id) { if (seen.has(row._id)) return false; seen.add(row._id); }
    if (seen.size > 256) throw new Error('MISSION_UNAVAILABLE');
    for (const id of lineage.references(row, table)) {
      const parentTable = lineage.tableOf(id) ?? undefined;
      if (parentTable === 'missions') return true;
      const parent = await read(id);
      if (parent && await hasMission(parent, parentTable, seen)) return true;
    }
    return false;
  }
  const permissions = new Map<string, Promise<boolean>>();
  const allows = async (row: Row, table: string | undefined, write: boolean): Promise<boolean> => {
    if (!protectedTables.has(table ?? '') || await hasMission(row, table)) return true;
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;
    let projectId = row.projectId as Id<'projects'> | undefined;
    if (!projectId && ['taskEvents', 'taskTransitions', 'activities', 'approvals', 'approvalRecords'].includes(table!)) {
      const approval = row.legacyApprovalId ? await read(row.legacyApprovalId) : null;
      const taskId = row.taskId ?? approval?.taskId;
      const task = taskId ? await read(taskId) : null;
      projectId = approval?.projectId ?? task?.projectId;
    }
    if (!projectId && ['runEvents', 'runArtifacts'].includes(table!) && row.workflowRunId) projectId = (await read(row.workflowRunId))?.projectId;
    if (!projectId && ['policies','policyEnvelopes'].includes(table!)) {
      if (write) return false; // Only raw internal administration can alter defaults.
      if (row.tenantId) { try { await requireCompanyAccess(ctx, row.tenantId); return true; } catch { return false; } }
      const operator = await ctx.db.query('operators').withIndex('by_auth_id', q => q.eq('authId', identity.subject)).unique();
      if (!operator?.active || !operator.tenantId) return false;
      try { await requireCompanyAccess(ctx, operator.tenantId); return true; } catch { return false; }
    }
    if (!projectId) return false;
    const permission = !write ? 'read' : ['policies','policyEnvelopes'].includes(table!) ? 'policy' : ['approvals', 'approvalRecords'].includes(table!) && ['APPROVED', 'DENIED'].includes(row.status) ? 'approval' : ['workflowRuns', 'runEvents', 'runArtifacts', 'workflowMetrics'].includes(table!) ? 'automation' : 'delivery';
    const key = `${projectId}:${permission}`;
    if (!permissions.has(key)) permissions.set(key, (async () => {
      try {
        if (permission === 'read') await requireWorkspacePermission(ctx, projectId, FACTORY_PERMISSIONS.VIEW);
        else if (permission === 'automation') await requireWorkspacePermission(ctx, projectId, FACTORY_PERMISSIONS.MANAGE_AUTOMATION);
        else {
          const project = await read(projectId);
          if (!project?.tenantId) return false;
          await requireWorkspaceAccess(ctx, project.tenantId, projectId, { permission: permission === 'policy' ? COMPANY_PERMISSIONS.MANAGE_COMPANY : permission === 'approval' ? COMPANY_PERMISSIONS.APPROVE_DELIVERY : COMPANY_PERMISSIONS.UPDATE_DELIVERY });
        }
        return true;
      } catch { return false; }
    })());
    return await permissions.get(key)!;
  };
  return Object.assign(allows, { invalidate: () => permissions.clear() });
}
