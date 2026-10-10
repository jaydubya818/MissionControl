import { internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { verifyPolicyMessage, signPolicyMessage, policyMessageHash, assertPolicyIdentity, type SignedPolicyMessage, type PolicyKey, type PolicyIdentity } from './lib/capabilityOrderingWire';

export type CapabilityBackendBinding = {
  ownerId: string; organizationId: string; installationId: string; backendId: string;
  incarnation: string; enrollmentVersion: number; tenantId: string; projectId: string;
  ownerMemberId: string; agentId: string; registryVersion: string;
  sourceKeys: { myeve: PolicyKey; relay: PolicyKey }; acknowledgmentKey: PolicyKey;
};
export function capabilityBindings(): CapabilityBackendBinding[] {
  if (process.env.MC_CAPABILITY_ENVIRONMENT !== 'qualification') throw Error('CAPABILITY_INSTALLATION_UNQUALIFIED');
  const bindings = JSON.parse(process.env.MC_CAPABILITY_BINDINGS_JSON ?? '[]') as CapabilityBackendBinding[];
  if (!Array.isArray(bindings)) throw Error('CAPABILITY_INSTALLATION_UNQUALIFIED');
  return bindings;
}
export const capabilityPolicyScope = (value: Pick<PolicyIdentity, 'authority' | 'ownerId' | 'organizationId' | 'installationId' | 'backendId' | 'incarnation'>) =>
  JSON.stringify([value.authority, value.ownerId, value.organizationId, value.installationId, value.backendId, value.incarnation]);

export async function prepareFenceAcknowledgment(envelope: SignedPolicyMessage) {
  const hint = JSON.parse(envelope.message) as PolicyIdentity;
  const binding = capabilityBindings().find(item => item.ownerId === hint.ownerId
    && item.organizationId === hint.organizationId && item.installationId === hint.installationId
    && item.backendId === hint.backendId && item.incarnation === hint.incarnation
    && item.enrollmentVersion === hint.enrollmentVersion);
  if (!binding || !['myeve', 'relay'].includes(hint.authority)) throw Error('CAPABILITY_INSTALLATION_UNQUALIFIED');
  const fence = await verifyPolicyMessage(envelope, binding.sourceKeys[hint.authority]);
  if (fence.kind !== 'FENCE') throw Error('CAPABILITY_FENCE_REQUIRED');
  const { kind: _kind, capabilityId: _capability, operation: _operation, ...identity } = fence;
  return signPolicyMessage({ ...identity, kind: 'FENCE_ACK', fenceHash: await policyMessageHash(fence) }, binding.acknowledgmentKey);
}

export const receiveFence = internalMutation({
  args: { envelope: v.object({ message: v.string(), keyId: v.string(), signature: v.string() }), acknowledgment: v.object({ message: v.string(), keyId: v.string(), signature: v.string() }) },
  handler: async (ctx, { envelope, acknowledgment }) => {
    if (envelope.message.length > 16_384) throw Error('CAPABILITY_PROTOCOL_INVALID');
    const untrusted = JSON.parse(envelope.message) as PolicyIdentity;
    const binding = capabilityBindings().find(item => item.ownerId === untrusted.ownerId
      && item.organizationId === untrusted.organizationId && item.installationId === untrusted.installationId
      && item.backendId === untrusted.backendId && item.incarnation === untrusted.incarnation
      && item.enrollmentVersion === untrusted.enrollmentVersion);
    if (!binding || !['myeve', 'relay'].includes(untrusted.authority)) throw Error('CAPABILITY_INSTALLATION_UNQUALIFIED');
    const message = await verifyPolicyMessage(envelope, binding.sourceKeys[untrusted.authority]);
    if (message.kind !== 'FENCE') throw Error('CAPABILITY_FENCE_REQUIRED');
    const enrollment = await ctx.db.query('capabilityEnrolledOwners').withIndex('by_owner', q =>
      q.eq('memberId', binding.ownerMemberId).eq('projectId', binding.projectId)).unique();
    if (enrollment && (enrollment.installationId !== binding.installationId || enrollment.incarnation !== binding.incarnation))
      throw Error('CAPABILITY_ENROLLMENT_CHANGED');
    if (!enrollment) await ctx.db.insert('capabilityEnrolledOwners', { memberId: binding.ownerMemberId,
      projectId: binding.projectId, installationId: binding.installationId, incarnation: binding.incarnation });
    const scope = capabilityPolicyScope(message);
    const current = await ctx.db.query('capabilityPolicyFences').withIndex('by_scope', q => q.eq('scope', scope)).unique();
    const fenceHash = await policyMessageHash(message);
    if (current) {
      if (message.version < current.version) throw Error('CAPABILITY_FENCE_STALE');
      if (message.version === current.version) {
        if (fenceHash !== current.fenceHash) throw Error('CAPABILITY_FENCE_CONFLICT');
        return current.acknowledgment;
      }
    }
    const { kind: _kind, capabilityId, operation, ...identity } = message;
    const ack = await verifyPolicyMessage(acknowledgment, binding.acknowledgmentKey);
    assertPolicyIdentity(ack, identity);
    if (ack.kind !== 'FENCE_ACK' || ack.fenceHash !== fenceHash) throw Error('CAPABILITY_ACK_MISMATCH');
    const row = { ...identity, scope, capabilityId, operation, fenceHash, acknowledgment };
    if (current) await ctx.db.replace(current._id, row);
    else await ctx.db.insert('capabilityPolicyFences', row);
    return acknowledgment;
  },
});
