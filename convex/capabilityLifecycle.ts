import { internalMutation, internalQuery } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import { v } from 'convex/values';
import { capabilityBindings, capabilityPolicyScope } from './capabilityPolicy';
import { admissionActionDigest, verifyPolicyMessage } from './lib/capabilityOrderingWire';
import { verifyLifecycleReceipt, type LifecycleReceipt } from './lib/capabilityLifecycleWire';
import { capabilityLifecycleInventory } from './lib/capabilityLifecycleInventory';

const envelopeValidator = v.object({ message: v.string(), keyId: v.string(), signature: v.string() });
async function observe(ctx: QueryCtx, envelope: { message: string; keyId: string; signature: string }) {
  if (envelope.message.length > 16_384) throw Error('CAPABILITY_PROTOCOL_INVALID');
  const hint = JSON.parse(envelope.message);
  const binding = capabilityBindings().find(item => item.ownerId === hint.ownerId
    && item.organizationId === hint.organizationId && item.installationId === hint.installationId
    && item.backendId === hint.backendId && item.incarnation === hint.incarnation
    && item.enrollmentVersion === hint.enrollmentVersion);
  if (!binding) throw Error('CAPABILITY_INSTALLATION_UNQUALIFIED');
  const request = await verifyPolicyMessage(envelope, binding.sourceKeys.myeve);
  if (request.kind !== 'FENCE' || request.authority !== 'myeve'
    || (request.operation !== 'pause' && request.operation !== 'revoke')) throw Error('CAPABILITY_CONTROL_REQUIRED');
  const scope = capabilityPolicyScope(request);
  const control = await ctx.db.query('capabilityWorkControls').withIndex('by_control', q =>
    q.eq('scope', scope).eq('capabilityId', request.capabilityId).eq('operation', request.operation as 'pause' | 'revoke')).unique();
  if (!control || control.version !== request.version || control.policyId !== request.policyId)
    throw Error('CAPABILITY_CONTROL_IDENTITY_MISMATCH');
  const enrollment = await ctx.db.query('capabilityEnrolledOwners').withIndex('by_owner', q =>
    q.eq('memberId', binding.ownerMemberId).eq('projectId', binding.projectId)).unique();
  if (!enrollment || enrollment.installationId !== binding.installationId || enrollment.incarnation !== binding.incarnation)
    throw Error('CAPABILITY_ENROLLMENT_CHANGED');
  const observation = await capabilityLifecycleInventory(ctx, binding, control);
  const inventoryDigest = await admissionActionDigest(observation.inventory);
  const evidenceDigest = await admissionActionDigest({ control: { scope, version: control.version, policyId: control.policyId },
    inventoryDigest, state: observation.state, inventoryComplete: observation.inventoryComplete });
  if (control.lifecycleEvidenceDigest === evidenceDigest && control.lifecycleAcknowledgment) return { control, binding, acknowledgment: control.lifecycleAcknowledgment };
  const { kind: _kind, controls: _controls, ...identity } = request;
  const sequence = (control.lifecycleSequence ?? 0) + 1;
  const receipt: LifecycleReceipt = { ...identity, authority: 'myeve', operation: request.operation,
    schema: 'capability-control.lifecycle.v1', kind: 'CONTROL_ACK', sequence, observedAt: Date.now(),
    state: observation.state, evidenceDigest, inventoryDigest, inventoryComplete: observation.inventoryComplete };
  return { control, binding, receipt };
}

export const prepare = internalQuery({
  args: { envelope: envelopeValidator },
  handler: async (ctx, { envelope }) => {
    const observation = await observe(ctx, envelope);
    return observation.acknowledgment ? { acknowledgment: observation.acknowledgment } : { receipt: observation.receipt };
  },
});

export const acknowledge = internalMutation({
  args: { envelope: envelopeValidator, acknowledgment: envelopeValidator },
  handler: async (ctx, { envelope, acknowledgment }) => {
    const observation = await observe(ctx, envelope);
    if (observation.acknowledgment) return observation.acknowledgment;
    const receipt = await verifyLifecycleReceipt(acknowledgment, observation.binding.acknowledgmentKey);
    if (receipt.observedAt < Date.now() - 30_000
      || await admissionActionDigest({ ...receipt, observedAt: 0 }) !== await admissionActionDigest({ ...observation.receipt, observedAt: 0 }))
      throw Error('CAPABILITY_LIFECYCLE_OBSERVATION_CHANGED');
    await ctx.db.patch(observation.control._id, { lifecycleSequence: receipt.sequence,
      lifecycleEvidenceDigest: receipt.evidenceDigest, lifecycleAcknowledgment: acknowledgment });
    return acknowledgment;
  },
});
