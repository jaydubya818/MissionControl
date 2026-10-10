import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

type ControlledWork = { capabilityAuthorities?: CapabilityWorkAuthority[]; workOrderId?: Id<'workOrders'>; missionId?: Id<'missions'>; ownerMemberId?: Id<'orgMembers'>; projectId?: Id<'projects'> };

export type CapabilityWorkAuthority = { scope: string; version: number; policyId: string; capabilityId: string };

/** Native Attempt authority is frozen at admission. Later enables cannot revive it. */
export async function capabilityWorkRestriction(ctx: Pick<MutationCtx, 'db'>,
  run: ControlledWork) {
  // Legacy admitted Work has no exact frozen policy lineage. Explicit controls
  // contain it pending reconciliation; never invent current-version authority.
  if (!run.capabilityAuthorities?.length) {
    const order = run.workOrderId ? await ctx.db.get(run.workOrderId) : null;
    const missionId = run.missionId ?? order?.missionId;
    const mission = missionId ? await ctx.db.get(missionId) : null;
    const record = mission ?? order ?? run;
    if (record.ownerMemberId && record.projectId) {
      const enrollment = await ctx.db.query('capabilityEnrolledOwners').withIndex('by_owner', q =>
        q.eq('memberId', record.ownerMemberId!).eq('projectId', record.projectId!)).unique();
      for (const scope of enrollment?.policyScopes ?? []) {
        const controls = await ctx.db.query('capabilityWorkControls').withIndex('by_control', q => q.eq('scope', scope)).take(73);
        if (controls.some(control => ['work', 'missioncontrol', 'enterprise.missions', 'enterprise.fleet'].includes(control.capabilityId)))
          return 'CAPABILITY_LEGACY_AUTHORITY_PENDING_BACKEND' as const;
      }
    }
  }
  let paused = false;
  for (const authority of run.capabilityAuthorities ?? []) {
    for (const capabilityId of new Set(['work', 'missioncontrol', authority.capabilityId])) {
      for (const operation of ['revoke', 'pause'] as const) {
        const control = await ctx.db.query('capabilityWorkControls').withIndex('by_control', q =>
          q.eq('scope', authority.scope).eq('capabilityId', capabilityId).eq('operation', operation)).unique();
        if (control && control.version > authority.version) {
          if (operation === 'revoke') return 'CAPABILITY_AUTHORITY_FENCED' as const;
          paused = true;
        }
      }
    }
  }
  return paused ? 'CAPABILITY_PAUSE_PENDING_BACKEND' as const : undefined;
}

export async function assertCapabilityWorkAuthority(ctx: Pick<MutationCtx, 'db'>,
  run: ControlledWork) {
  const restriction = await capabilityWorkRestriction(ctx, run);
  if (restriction) throw Error(restriction);
}
