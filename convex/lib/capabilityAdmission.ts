import { assertCapabilityWorkAuthority } from './capabilityWorkControl';
import type { Doc } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { v } from 'convex/values';
import { capabilityBindings, capabilityPolicyScope } from '../capabilityPolicy';
import { admissionActionDigest, assertPolicyIdentity, verifyPolicyMessage, policyMessageHash, type SignedPolicyMessage } from './capabilityOrderingWire';

type AdmissionRecord = Pick<Doc<'missions'>, 'tenantId' | 'projectId' | 'ownerMemberId'> & { _id?: string; updatedAt?: number };
const envelope = v.object({ message: v.string(), keyId: v.string(), signature: v.string() });
export const capabilityPermitsValidator = v.object({ myeve: envelope, relay: envelope });
export type CapabilityPermits = { myeve: SignedPolicyMessage; relay: SignedPolicyMessage };
type AdmissionInput = { workId: string; missionId: string; generation: number; args: Record<string, unknown>; capabilityId: string; nativeSnapshot: unknown; permits?: CapabilityPermits };

export async function requireCapabilityAdmission(ctx: MutationCtx, record: AdmissionRecord, existingAdmission = false, input?: AdmissionInput) {
  const configured = !!process.env.MC_CAPABILITY_BINDINGS_JSON;
  const enrollment = record.ownerMemberId && record.projectId ? await ctx.db.query('capabilityEnrolledOwners')
    .withIndex('by_owner', q => q.eq('memberId', record.ownerMemberId!).eq('projectId', record.projectId!)).unique() : null;
  if (process.env.MC_CAPABILITY_CONTROL_ENABLED !== 'true' && !configured && !enrollment) return;
  if (process.env.MC_CAPABILITY_ENVIRONMENT !== 'qualification'
    || !process.env.MC_CAPABILITY_INSTALLATION_ID?.trim())
    throw new Error('CAPABILITY_INSTALLATION_UNQUALIFIED');
  const identity = await ctx.auth.getUserIdentity();
  const owner = record.ownerMemberId ? await ctx.db.get(record.ownerMemberId) : null;
  const operator = owner?.operatorId ? await ctx.db.get(owner.operatorId) : null;
  if (!identity || !record.tenantId || !record.projectId || !operator?.active
    || operator.authId !== identity.subject || operator.tenantId !== record.tenantId
    || !owner?.active || owner?.tenantId !== record.tenantId || (owner.projectId && owner.projectId !== record.projectId))
    throw new Error('CAPABILITY_EXACT_OWNER_REQUIRED');

  if (existingAdmission) return;

  if (!input?.permits) throw new Error('CAPABILITY_POLICY_REVALIDATION_UNAVAILABLE');
  const binding = capabilityBindings().find(item => item.tenantId === record.tenantId
    && item.projectId === record.projectId && item.ownerMemberId === record.ownerMemberId);
  if (!binding) throw new Error('CAPABILITY_INSTALLATION_UNQUALIFIED');
  if (!enrollment || enrollment.installationId !== binding.installationId || enrollment.incarnation !== binding.incarnation)
    throw Error('CAPABILITY_ENROLLMENT_CHANGED');
  const { capabilityPermits: _permits, ...nativeArgs } = input.args;
  const actionDigest = await admissionActionDigest({ workId: input.workId, missionId: input.missionId,
    generation: input.generation, nativeSnapshot: input.nativeSnapshot, args: nativeArgs });
  let budgetMicros = Number.MAX_SAFE_INTEGER;
  let sourcePermitHash = '';
  const authorities: Array<{ scope: string; version: number; policyId: string; capabilityId: string }> = [];
  for (const authority of ['myeve', 'relay'] as const) {
    const permit = await verifyPolicyMessage(input.permits[authority], binding.sourceKeys[authority]);
    if (permit.kind !== 'PERMIT' || permit.authority !== authority) throw Error('CAPABILITY_PERMIT_REQUIRED');
    if (authority === 'myeve') sourcePermitHash = await policyMessageHash(permit);
    else if (permit.sourcePermitHash !== sourcePermitHash) throw Error('CAPABILITY_PROOF_PAIR_MISMATCH');
    const scope = capabilityPolicyScope({ ...binding, authority });
    const fence = await ctx.db.query('capabilityPolicyFences').withIndex('by_scope', q => q.eq('scope', scope)).unique();
    if (!fence) throw Error('CAPABILITY_POLICY_REVALIDATION_UNAVAILABLE');
    assertPolicyIdentity(permit, { ...binding, authority, version: fence.version, policyId: fence.policyId });
    if (permit.ownerId !== binding.ownerId || permit.organizationId !== binding.organizationId
      || permit.installationId !== binding.installationId || permit.backendId !== binding.backendId
      || permit.incarnation !== binding.incarnation || permit.enrollmentVersion !== binding.enrollmentVersion
      || permit.agentId !== binding.agentId || permit.registryVersion !== binding.registryVersion
      || permit.workId !== input.workId || permit.missionId !== input.missionId || permit.workGeneration !== input.generation
      || permit.capabilityId !== input.capabilityId || !['work', 'missioncontrol', input.capabilityId].every(id => permit.requiredCapabilities.includes(id)) || permit.actionDigest !== actionDigest
      || permit.issuedAt > Date.now() || permit.expiresAt <= Date.now()) throw Error('CAPABILITY_ADMISSION_SCOPE');
    const consumed = await ctx.db.query('capabilityAdmissionReferences').withIndex('by_reference', q => q.eq('scope', scope).eq('referenceId', permit.referenceId)).unique();
    if (consumed) throw Error('CAPABILITY_REFERENCE_CONSUMED');
    await ctx.db.insert('capabilityAdmissionReferences', { scope, referenceId: permit.referenceId,
      workId: input.workId, missionId: input.missionId, version: permit.version, policyId: permit.policyId, actionDigest });
    authorities.push({ scope, version: permit.version, policyId: permit.policyId, capabilityId: input.capabilityId });
    budgetMicros = Math.min(budgetMicros, permit.budgetMicros);
  }
  return { budgetMicros, authorities };
}


export async function requireWorkOrderCapabilityAdmission(ctx: MutationCtx, workOrder: Doc<'workOrders'>, existingAdmission = false, args?: Record<string, unknown>) {
  const mission = workOrder.missionId ? await ctx.db.get(workOrder.missionId) : null;
  if (workOrder.missionId && (!mission || mission.tenantId !== workOrder.tenantId || mission.projectId !== workOrder.projectId))
    throw new Error('CAPABILITY_MISSION_SCOPE_MISMATCH');
  const admission = await requireCapabilityAdmission(ctx, mission ?? workOrder, existingAdmission, args ? {
    workId: workOrder._id, missionId: mission?._id ?? workOrder._id, generation: workOrder.updatedAt,
    args, capabilityId: 'enterprise.fleet', nativeSnapshot: { mission, workOrder }, permits: args.capabilityPermits as CapabilityPermits | undefined,
  } : undefined);
  if (admission && mission?.state !== 'IN_PROGRESS') throw Error('CAPABILITY_ADMITTED_MISSION_REQUIRED');
  if (admission && !mission?.capabilityAuthorities?.length) throw Error('CAPABILITY_MISSION_LINEAGE_RECONCILIATION_REQUIRED');
  if (!existingAdmission && mission) await assertCapabilityWorkAuthority(ctx, mission);
  if (admission) admission.authorities.push(...(mission?.capabilityAuthorities ?? []));
  return admission;
}
