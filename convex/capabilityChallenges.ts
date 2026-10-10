import { requireCapabilityReceiverRecovery } from './lib/capabilityReceiverRecovery';
import { dispatchArgs } from './lib/workOrderDispatchArgs';
import { action, internalQuery } from './_generated/server';
import { makeFunctionReference } from 'convex/server';
import { v } from 'convex/values';
import { capabilityBindings, capabilityPolicyScope } from './capabilityPolicy';
import { admissionActionDigest, signPolicyMessage, type AdmissionChallenge } from './lib/capabilityOrderingWire';

const { capabilityPermits: _permits, ...nativeDispatchArgs } = dispatchArgs;
const request = {
  dispatch: v.optional(v.object({ ...nativeDispatchArgs, actorType: v.literal('HUMAN') })),
  missionId: v.id('missions'), workOrderId: v.optional(v.id('workOrders')),
  idempotencyKey: v.string(), budgetMicros: v.number(),
  factoryDefinitionVersionId: v.optional(v.id('factoryDefinitionVersions')),
};

export const describe = internalQuery({
  args: request,
  handler: async (ctx, args) => {
    if (!args.idempotencyKey || args.idempotencyKey.length > 255 || !Number.isSafeInteger(args.budgetMicros)
      || args.budgetMicros < 0 || args.budgetMicros > 1e12) throw Error('CAPABILITY_CHALLENGE_INVALID');
    const mission = await ctx.db.get(args.missionId);
    const identity = await ctx.auth.getUserIdentity();
    const member = mission?.ownerMemberId ? await ctx.db.get(mission.ownerMemberId) : null;
    const operator = member?.operatorId ? await ctx.db.get(member.operatorId) : null;
    if (!mission || !identity || !member?.active || !operator?.active || operator.authId !== identity.subject
      || member.tenantId !== mission.tenantId || operator.tenantId !== mission.tenantId
      || (member.projectId && member.projectId !== mission.projectId)) throw Error('CAPABILITY_EXACT_OWNER_REQUIRED');
    const binding = capabilityBindings().find(value => value.ownerMemberId === mission.ownerMemberId
      && value.projectId === mission.projectId && value.tenantId === mission.tenantId);
    if (!binding || binding.installationId !== process.env.MC_CAPABILITY_INSTALLATION_ID) throw Error('CAPABILITY_INSTALLATION_UNQUALIFIED');
    requireCapabilityReceiverRecovery(binding.incarnation);
    const enrollment = await ctx.db.query('capabilityEnrolledOwners').withIndex('by_owner', q =>
      q.eq('memberId', binding.ownerMemberId).eq('projectId', binding.projectId)).unique();
    if (!enrollment || enrollment.incarnation !== binding.incarnation || enrollment.installationId !== binding.installationId)
      throw Error('CAPABILITY_ENROLLMENT_CHANGED');
    const fence = await ctx.db.query('capabilityPolicyFences').withIndex('by_scope', q =>
      q.eq('scope', capabilityPolicyScope({ ...binding, authority: 'myeve' }))).unique();
    if (!fence || fence.enrollmentVersion !== binding.enrollmentVersion) throw Error('CAPABILITY_POLICY_REVALIDATION_UNAVAILABLE');
    const workOrder = args.workOrderId ? await ctx.db.get(args.workOrderId) : null;
    if (args.workOrderId && (!workOrder || workOrder.missionId !== mission._id
      || workOrder.tenantId !== mission.tenantId || workOrder.projectId !== mission.projectId)) throw Error('CAPABILITY_MISSION_SCOPE_MISMATCH');
    if (args.dispatch && (!workOrder || args.dispatch.workOrderId !== workOrder._id
      || args.dispatch.idempotencyKey !== args.idempotencyKey
      || (args.factoryDefinitionVersionId && args.dispatch.factoryDefinitionVersionId !== args.factoryDefinitionVersionId))) throw Error('CAPABILITY_CHALLENGE_INVALID');
    if (!workOrder && args.factoryDefinitionVersionId) throw Error('CAPABILITY_CHALLENGE_INVALID');
    const nativeArgs = args.dispatch ?? (workOrder ? { workOrderId: workOrder._id, actorType: 'HUMAN' as const,
      idempotencyKey: args.idempotencyKey, ...(args.factoryDefinitionVersionId ? { factoryDefinitionVersionId: args.factoryDefinitionVersionId } : {}) }
      : { missionId: mission._id, idempotencyKey: args.idempotencyKey });
    const workId = workOrder?._id ?? mission._id, generation = workOrder?.updatedAt ?? mission.updatedAt;
    const actionDigest = await admissionActionDigest({ workId, missionId: mission._id, generation,
      nativeSnapshot: workOrder ? { mission, workOrder } : mission, args: nativeArgs });
    return { nativeArgs, identity: { authority: 'myeve' as const, ownerId: binding.ownerId,
      organizationId: binding.organizationId, installationId: binding.installationId, backendId: binding.backendId,
      incarnation: binding.incarnation, enrollmentVersion: binding.enrollmentVersion, version: fence.version, policyId: fence.policyId },
      registryVersion: binding.registryVersion, agentId: binding.agentId, workId, missionId: mission._id,
      workGeneration: generation, actionDigest, budgetMicros: args.budgetMicros,
      capabilityId: workOrder ? 'enterprise.fleet' : 'enterprise.missions' };
  },
});

export const create = action({
  args: request,
  handler: async (ctx, args) => {
    if (!await ctx.auth.getUserIdentity()) throw Error('CAPABILITY_EXACT_OWNER_REQUIRED');
    const value = await ctx.runQuery(makeFunctionReference<'query'>('capabilityChallenges:describe'), args);
    const binding = capabilityBindings().find(item => item.ownerId === value.identity.ownerId
      && item.organizationId === value.identity.organizationId && item.installationId === value.identity.installationId
      && item.backendId === value.identity.backendId && item.incarnation === value.identity.incarnation
      && item.enrollmentVersion === value.identity.enrollmentVersion);
    if (!binding) throw Error('CAPABILITY_ENROLLMENT_CHANGED');
    const { nativeArgs, identity, ...scope } = value;
    const issuedAt = Date.now();
    const challenge: AdmissionChallenge = { ...identity, ...scope, kind: 'CHALLENGE',
      referenceId: crypto.randomUUID(), issuedAt, expiresAt: issuedAt + 30_000 };
    return { nativeArgs, challenge: await signPolicyMessage(challenge, binding.acknowledgmentKey) };
  },
});
