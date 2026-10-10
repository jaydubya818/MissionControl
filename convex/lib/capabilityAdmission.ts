import type { Doc } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

type AdmissionRecord = Pick<Doc<'missions'>, 'tenantId' | 'projectId' | 'ownerMemberId'>;

export async function requireCapabilityAdmission(ctx: MutationCtx, record: AdmissionRecord, existingAdmission = false) {
  if (process.env.MC_CAPABILITY_CONTROL_ENABLED !== 'true') return;
  if (process.env.MC_CAPABILITY_ENVIRONMENT !== 'qualification'
    || !process.env.MC_CAPABILITY_INSTALLATION_ID?.trim())
    throw new Error('CAPABILITY_INSTALLATION_UNQUALIFIED');
  const identity = await ctx.auth.getUserIdentity();
  const owner = record.ownerMemberId ? await ctx.db.get(record.ownerMemberId) : null;
  const operator = owner?.operatorId ? await ctx.db.get(owner.operatorId) : null;
  if (!identity || !record.tenantId || !record.projectId || !operator?.active
    || operator.authId !== identity.subject || operator.tenantId !== record.tenantId
    || owner?.tenantId !== record.tenantId || (owner.projectId && owner.projectId !== record.projectId))
    throw new Error('CAPABILITY_EXACT_OWNER_REQUIRED');

  if (existingAdmission) return;

  // A signed remote snapshot cannot serialize a later Convex commit with source revocation.
  // Keep enrolled installations closed until a receiving-transaction fence is qualified.
  throw new Error('CAPABILITY_POLICY_REVALIDATION_UNAVAILABLE');
}


export async function requireWorkOrderCapabilityAdmission(ctx: MutationCtx, workOrder: Doc<'workOrders'>, existingAdmission = false) {
  if (process.env.MC_CAPABILITY_CONTROL_ENABLED !== 'true') return;
  const mission = workOrder.missionId ? await ctx.db.get(workOrder.missionId) : null;
  if (workOrder.missionId && (!mission || mission.tenantId !== workOrder.tenantId || mission.projectId !== workOrder.projectId))
    throw new Error('CAPABILITY_MISSION_SCOPE_MISMATCH');
  return requireCapabilityAdmission(ctx, mission ?? workOrder, existingAdmission);
}
