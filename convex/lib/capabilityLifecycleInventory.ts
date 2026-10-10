import { requireCapabilityReceiverRecovery } from './capabilityReceiverRecovery';
import type { QueryCtx } from '../_generated/server';
import type { LifecycleState } from './capabilityLifecycleWire';
import type { Id } from '../_generated/dataModel';
import type { CapabilityBackendBinding } from '../capabilityPolicy';

export async function capabilityLifecycleInventory(ctx: Pick<QueryCtx, 'db'>, binding: CapabilityBackendBinding,
  control: { scope: string; capabilityId: string; operation: 'pause' | 'revoke'; version: number }) {
  const runs = await ctx.db.query('workflowRuns').withIndex('by_project', q =>
    q.eq('projectId', binding.projectId as Id<'projects'>)).collect();
  const inventory = [];
  let inventoryComplete = true;
  try { requireCapabilityReceiverRecovery(binding.incarnation); } catch { inventoryComplete = false; }
  let resourcesAbsent = true;
  for (const run of runs) {
    const order = run.workOrderId ? await ctx.db.get(run.workOrderId) : null;
    const missionId = run.missionId ?? order?.missionId;
    const mission = missionId ? await ctx.db.get(missionId) : null;
    const owner = mission?.ownerMemberId ?? order?.ownerMemberId;
    if (owner !== binding.ownerMemberId) {
      if (!owner) inventoryComplete = false;
      continue;
    }
    if (run.tenantId !== binding.tenantId || mission?.tenantId !== binding.tenantId || mission?.projectId !== binding.projectId
      || (order && (order.projectId !== binding.projectId || order.missionId !== missionId))) {
      inventoryComplete = false;
      continue;
    }
    const authorities = run.capabilityAuthorities ?? [];
    const affected = authorities.some(authority => authority.scope === control.scope && authority.version < control.version
      && ['work', 'missioncontrol', authority.capabilityId].includes(control.capabilityId));
    if (authorities.length && !affected) continue;
    if (!authorities.length) inventoryComplete = false;
    const allocations = await ctx.db.query('sandboxAllocations').withIndex('by_run', q => q.eq('workflowRunId', run._id)).collect();
    const resources = [];
    if (!allocations.length) {
      // A dispatched Attempt without a resource journal cannot prove absence.
      inventoryComplete = false;
      resourcesAbsent = false;
    }
    for (const allocation of allocations) {
      const credentials = await ctx.db.query('sandboxCredentialGrants').withIndex('by_allocation', q =>
        q.eq('sandboxAllocationId', allocation._id)).collect();
      const receipt = allocation.teardownReceipt;
      const absent = allocation.tenantId === run.tenantId && allocation.projectId === run.projectId
        && allocation.workflowRunId === run._id && allocation.workOrderId === run.workOrderId
        && allocation.factoryDefinitionVersionId === run.factoryDefinitionVersionId
        && allocation.attemptId === run.runId && allocation.state === 'TERMINATED'
        && !!allocation.providerResourceId && receipt?.providerResourceId === allocation.providerResourceId
        && receipt?.resourceName === allocation.resourceName && receipt?.resourceAbsent === true
        && Number.isFinite(allocation.resourceAbsentAt) && allocation.resourceAbsentAt === receipt.confirmedAbsentAt
        && credentials.every(credential => credential.state === 'REVOKED');
      resourcesAbsent &&= absent;
      resources.push({ allocationId: allocation._id, resourceName: allocation.resourceName,
        providerResourceId: allocation.providerResourceId, state: allocation.state, resourceAbsentAt: allocation.resourceAbsentAt,
        receipt, credentials: credentials.map(credential => ({ grantKey: credential.grantKey, state: credential.state,
          revokedAt: credential.revokedAt })) });
    }
    inventory.push({ missionId, workOrderId: run.workOrderId, workflowRunId: run._id, attemptId: run.runId,
      factoryVersion: run.factoryDefinitionVersionId, factoryConfigurationDigest: run.factoryConfigurationDigest,
      authorities, resources });
  }
  inventory.sort((a, b) => String(a.workflowRunId).localeCompare(String(b.workflowRunId)));
  const state: LifecycleState = !inventoryComplete ? 'PENDING_BACKEND'
    : control.operation === 'revoke' ? resourcesAbsent ? 'CLEANUP_CONFIRMED' : 'AUTHORITY_FENCED'
    : resourcesAbsent ? 'PAUSE_CONFIRMED' : 'PENDING_BACKEND';
  return { inventory, inventoryComplete, state };
}
