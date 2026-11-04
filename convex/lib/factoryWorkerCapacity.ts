import type { QueryCtx, MutationCtx } from '../_generated/server';
import { missionAuthorityDatabase } from './missionScopedFunctions';

/** Enforcement-only input shared by routing and claim admission. Never return
 * these rows through a public query; Mission-scoped user reads stay filtered. */
export async function loadActiveFactoryWorkerRuns(ctx: QueryCtx | MutationCtx) {
  return missionAuthorityDatabase(ctx).query('workflowRuns')
    .withIndex('by_status', query => query.eq('status', 'RUNNING'))
    .collect();
}
