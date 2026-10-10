import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listSandboxReconcileCandidatesInternal, reportSandboxReconcileInternal } from '../factory/attempts';
import { capabilityLifecycleInventory } from '../lib/capabilityLifecycleInventory';
const handler = (fn: unknown) => (fn as { _handler: (ctx: any, args: any) => Promise<any> })._handler;
beforeEach(() => { vi.stubEnv('MC_CAPABILITY_RECEIVER_RECOVERY_STATE', 'ACTIVE'); vi.stubEnv('MC_CAPABILITY_RECEIVER_EPOCH', 'epoch'); });
afterEach(() => vi.unstubAllEnvs());
const scope = JSON.stringify(['myeve', 'owner', 'org', 'installation', 'missioncontrol', 'epoch']);
const binding = { incarnation: 'epoch', ownerMemberId: 'owner', tenantId: 'tenant', projectId: 'project' };
function fixture(operation?: 'pause' | 'revoke') {
  const run: any = { _id: 'run', runId: 'attempt', status: 'RUNNING', tenantId: 'tenant', projectId: 'project',
    missionId: 'mission', workOrderId: 'order', repositoryId: 'repository', factoryDefinitionVersionId: 'factory',
    reservedCostUsd: 12, lease: { leaseId: 'lease', ownerId: 'worker', expiresAt: Date.now() + 100000 },
    executionManifest: { version: 'factory-execution-manifest/v2', executionBackend: 'remote-sandbox' },
    capabilityAuthorities: [{ scope, version: 1, policyId: 'old', capabilityId: 'enterprise.fleet' }] };
  const allocation: any = { _id: 'allocation', workflowRunId: 'run', attemptId: 'attempt', tenantId: 'tenant', projectId: 'project', workOrderId: 'order',
    factoryDefinitionVersionId: 'factory', state: 'RUNNING', resourceName: 'resource', providerResourceId: 'provider-id' };
  const records: any = { run, allocation, mission: { ownerMemberId: 'owner', tenantId: 'tenant', projectId: 'project' }, order: { missionId: 'mission', projectId: 'project' } };
  const tables: any = { workflowRuns: [run], sandboxAllocations: [allocation], sandboxCredentialGrants: [], runEvents: [],
    capabilityWorkControls: operation ? [{ scope, capabilityId: 'missioncontrol', operation, version: 2 }] : [] };
  const ctx: any = { db: { get: async (id: string) => records[id] ?? null,
    patch: vi.fn(async (id, value) => Object.assign(records[id], value)), insert: vi.fn(async () => 'event'),
    query: (table: string) => {
      let rows = [...(tables[table] ?? [])];
      const query: any = { withIndex: (_: string, predicate: any) => {
        const builder: any = { eq: (key: string, value: any) => { rows = rows.filter(row => row[key] === value); return builder; } };
        predicate(builder); return query;
      }, filter: () => query, collect: async () => rows, first: async () => rows[0] ?? null,
        unique: async () => rows[0] ?? null, order: () => query, take: async () => rows };
      return query;
    } } };
  return { ctx, run, allocation, tables, records };
}
describe('capability control resource reconciliation', () => {
  it('exposes revoked resources immediately while preserving current and paused leases', async () => {
    const args = { projectId: 'project', repositoryId: 'repository' };
    for (const operation of [undefined, 'pause', 'revoke'] as const) {
      const f = fixture(operation);
      const result = await handler(listSandboxReconcileCandidatesInternal)(f.ctx, args);
      expect(result).toHaveLength(operation === 'revoke' ? 1 : 0);
      expect(f.run.reservedCostUsd).toBe(12);
      expect(f.allocation.state).toBe('RUNNING');
    }
  });
  it('requires exact absence evidence and keeps accounting unchanged', async () => {
    const f = fixture('revoke');
    const args = { workflowRunId: 'run', resourceName: 'resource', ownerId: 'worker',
      termination: { resourceName: 'resource', providerResourceId: 'provider-id', resourceAbsent: false, confirmedAbsentAt: Date.now() } };
    await expect(handler(reportSandboxReconcileInternal)(f.ctx, args)).rejects.toThrow('resource-absence');
    expect(f.ctx.db.patch).not.toHaveBeenCalled();
    args.termination.resourceAbsent = true;
    await handler(reportSandboxReconcileInternal)(f.ctx, args);
    expect(f.allocation.state).toBe('TERMINATED');
    expect(f.run.reservedCostUsd).toBe(12);
    expect(f.run.status).toBe('RUNNING');
    expect(await handler(reportSandboxReconcileInternal)(f.ctx, args)).toMatchObject({ reconciled: false });
  });
  it('does not confuse a stop request or foreign resource receipt with confirmed cleanup', async () => {
    const f = fixture('revoke');
    const control = { scope, capabilityId: 'missioncontrol', operation: 'revoke' as const, version: 2 };
    expect(await capabilityLifecycleInventory(f.ctx, binding as any, control)).toMatchObject({ state: 'AUTHORITY_FENCED' });
    f.allocation.state = 'TERMINATED';
    f.allocation.resourceAbsentAt = 42;
    f.allocation.teardownReceipt = { resourceName: 'resource', providerResourceId: 'foreign', resourceAbsent: true, confirmedAbsentAt: 42 };
    expect(await capabilityLifecycleInventory(f.ctx, binding as any, control)).toMatchObject({ state: 'AUTHORITY_FENCED' });
    f.allocation.teardownReceipt.providerResourceId = 'provider-id';
    expect(await capabilityLifecycleInventory(f.ctx, binding as any, control)).toMatchObject({ state: 'CLEANUP_CONFIRMED', inventoryComplete: true });
    f.tables.sandboxCredentialGrants.push({ sandboxAllocationId: 'allocation', state: 'ISSUED' });
    expect(await capabilityLifecycleInventory(f.ctx, binding as any, control)).toMatchObject({ state: 'AUTHORITY_FENCED' });
  });
  it('retains legacy and missing-resource uncertainty and isolates another owner', async () => {
    const f = fixture('revoke');
    const control = { scope, capabilityId: 'missioncontrol', operation: 'revoke' as const, version: 2 };
    f.run.capabilityAuthorities = [];
    expect(await capabilityLifecycleInventory(f.ctx, binding as any, control)).toMatchObject({ state: 'PENDING_BACKEND', inventoryComplete: false });
    f.records.mission.ownerMemberId = 'other-owner';
    expect(await capabilityLifecycleInventory(f.ctx, binding as any, control)).toMatchObject({ inventory: [], inventoryComplete: true });
  });
});
