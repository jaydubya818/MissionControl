import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { projectEnterpriseResult } from '../lib/sofieEnterpriseResult';
import { getCurrentVerificationRoutingOutcome } from '../lib/currentVerification';
import { enterpriseDigest } from '../../packages/shared/src/sofieEnterprise';

// Control only the asynchronous gate boundary. Owner/Plan checks and projection
// fail-closed behavior are real; this test does not qualify execution evidence.
vi.mock('../lib/currentVerification', () => ({ getCurrentVerificationRoutingOutcome: vi.fn() }));
const gate = vi.mocked(getCurrentVerificationRoutingOutcome);
function fixture() {
  const scope = { tenantId: 'tenant', projectId: 'project', missionId: 'mission' };
  const owner = { _id: 'owner', active: true, tenantId: scope.tenantId, authId: 'owner-auth' };
  const mission = { ...scope, _id: 'mission', ownerOperatorId: owner._id, currentPlanId: 'plan', state: 'AWAITING_ACCEPTANCE' };
  const workOrders = [0, 1, 2].map(i => ({ ...scope, _id: `wo-${i}`, missionPlanId: 'plan', missionPlanRevision: 1,
    qualityContractDigest: 'quality', currentRevisionId: `revision-${i}`, state: 'DONE',
    metadata: { missionBlueprintId: `blueprint-${i}` }, verificationContract: { schemaVersion: 2, enforcementMode: 'ENFORCED' } }));
  const plan = { ...scope, _id: 'plan', revisionNumber: 1, qualityContractDigest: 'quality', approvedBy: owner._id,
    status: 'APPROVED', decidedActorSource: 'AUTHENTICATED', approvedAt: 1, releasedWorkOrderIds: workOrders.map(w => w._id),
    workOrderBlueprints: workOrders.map(w => ({ id: w.metadata.missionBlueprintId })), assertions: [] };
  const resultScope = { missionId: mission._id, planId: plan._id, planRevision: 1, planDigest: enterpriseDigest(plan) };
  const connection = { ...scope, ownerId: owner._id, resultScope, expiresAt: Date.now() + 60000 };
  const rows: any = { mission, plan, owner };
  const ctx: any = { db: { get: async (id: string) => rows[id] ?? null,
    query: (table: string) => {
      const query = { withIndex: () => query, order: () => query, take: async () => table === 'workOrders' ? workOrders : [] };
      return query;
    } } };
  return { ctx, connection, rows, workOrders, run: () => projectEnterpriseResult(ctx, connection as any, 'mission' as any, resultScope.planDigest) };
}
beforeEach(() => { gate.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); });
const unavailable = (id: string) => ({ eligible: false, current: false, reasons: [`denied-${id}`] } as any);
it('starts every independent gate before awaiting one and retains deterministic reasons and exact scope', async () => {
  const f = fixture(), pending: Array<(value: any) => void> = [];
  gate.mockImplementation(async () => new Promise(resolve => pending.push(resolve)));
  const result = f.run();
  await vi.waitFor(() => expect(pending).toHaveLength(3));
  const calls = gate.mock.calls;
  expect(new Set(calls.map(call => call[2])).size).toBe(1);
  for (const call of calls) {
    expect(call[0]).toBe(f.ctx); expect(call[3]).toBe('ACCEPTANCE'); expect(call[4]).toBe(true);
    expect(call[5]).toEqual({ ownerId: 'owner', missionId: 'mission', planId: 'plan', planDigest: f.connection.resultScope.planDigest });
  }
  // Completion order does not reorder proof/denial identities.
  pending[2](unavailable('wo-2')); pending[0](unavailable('wo-0')); pending[1](unavailable('wo-1'));
  const projection = await result;
  expect(projection.status).toBe('NOT_AVAILABLE'); expect(projection.workOrders).toEqual([]);
  expect(projection.reasons.filter(r => r.startsWith('CURRENT_INDEPENDENT'))).toEqual(
    [0, 1, 2].map(i => `CURRENT_INDEPENDENT_VERIFICATION_REQUIRED: wo-${i}: denied-wo-${i}`));
});
it('rejects the entire projection when any gate fails; no partial success escapes', async () => {
  const f = fixture();
  gate.mockImplementation(async (_ctx, wo) => { if (wo._id === 'wo-1') throw Error('GATE_READ_FAILED'); return unavailable(wo._id); });
  await expect(f.run()).rejects.toThrow('GATE_READ_FAILED'); expect(gate).toHaveBeenCalledTimes(3);
});
it('keeps invalid WorkOrder Plan/contract rows out of the gate path', async () => {
  const f = fixture(); f.workOrders[1].missionPlanId = 'other-plan';
  gate.mockImplementation(async (_ctx, wo) => unavailable(wo._id));
  const result = await f.run();
  expect(result.status).toBe('NOT_AVAILABLE'); expect(result.reasons).toContain('WORK_ORDER_PLAN_OR_CONTRACT_CHANGED');
  expect(gate.mock.calls.map(c => c[1]._id)).toEqual(['wo-0', 'wo-2']);
});
for (const [name, mutate] of [
  ['foreign owner', (f: any) => { f.connection.ownerId = 'foreign'; }],
  ['revoked owner', (f: any) => { f.rows.owner.active = false; }],
  ['foreign tenant', (f: any) => { f.connection.tenantId = 'foreign'; }],
  ['changed Plan', (f: any) => { f.rows.plan.summary = 'changed'; }],
  ['revoked approval', (f: any) => { f.rows.plan.status = 'SUPERSEDED'; }],
  ['foreign Mission scope', (f: any) => { f.connection.resultScope.missionId = 'foreign'; }],
] as const) it(`denies ${name} before starting parallel projections`, async () => {
  const f = fixture(); mutate(f); await expect(f.run()).rejects.toThrow(); expect(gate).not.toHaveBeenCalled();
});
it('does not cache gate decisions between authorized calls', async () => {
  const f = fixture(); gate.mockImplementation(async (_ctx, wo) => unavailable(wo._id));
  await f.run(); expect(gate).toHaveBeenCalledTimes(3);
  f.rows.owner.active = false; await expect(f.run()).rejects.toThrow(); expect(gate).toHaveBeenCalledTimes(3);
  f.rows.owner.active = true; await f.run(); expect(gate).toHaveBeenCalledTimes(6);
});
