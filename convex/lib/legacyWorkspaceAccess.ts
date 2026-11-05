import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { COMPANY_PERMISSIONS, FACTORY_PERMISSIONS, requireWorkspaceAccess, requireWorkspacePermission } from './companyAccess';

type Row = Record<string, any>;
const protectedTables = new Set(['tasks', 'taskEvents', 'taskTransitions', 'activities', 'workflowRuns', 'runEvents', 'runArtifacts', 'workflowMetrics']);

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
    if (!row.projectId || !await ctx.auth.getUserIdentity()) return false;
    const projectId = row.projectId as Id<'projects'>;
    const permission = !write ? 'read' : ['workflowRuns', 'runEvents', 'runArtifacts', 'workflowMetrics'].includes(table!) ? 'automation' : 'delivery';
    const key = `${projectId}:${permission}`;
    if (!permissions.has(key)) permissions.set(key, (async () => {
      try {
        if (permission === 'read') await requireWorkspacePermission(ctx, projectId, FACTORY_PERMISSIONS.VIEW);
        else if (permission === 'automation') await requireWorkspacePermission(ctx, projectId, FACTORY_PERMISSIONS.MANAGE_AUTOMATION);
        else {
          const project = await read(projectId);
          if (!project?.tenantId) return false;
          await requireWorkspaceAccess(ctx, project.tenantId, projectId, { permission: COMPANY_PERMISSIONS.UPDATE_DELIVERY });
        }
        return true;
      } catch { return false; }
    })());
    return await permissions.get(key)!;
  };
  return Object.assign(allows, { invalidate: () => permissions.clear() });
}
