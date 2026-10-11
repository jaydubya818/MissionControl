import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../lib/deliveryAuthorization', () => ({
  requireAuthorizedDeliveryScope: async () => null,
  assertAuthorizedDeliveryRecord: () => {}, canAccessDeliveryRecord: () => true,
}));

import { start } from '../missions';
import { requireCapabilityAdmission } from '../lib/capabilityAdmission';
import { dispatchServiceInternal } from '../workOrders';
import { create as createChallenge } from '../capabilityChallenges';

afterEach(() => vi.unstubAllEnvs());
const handler = (fn: unknown) => (fn as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler;

it('rejects anonymous challenge requests before querying owner policy', async () => {
  const runQuery = vi.fn();
  await expect(handler(createChallenge)({ auth: { getUserIdentity: async () => null }, runQuery }, {}))
    .rejects.toThrow('CAPABILITY_EXACT_OWNER_REQUIRED');
  expect(runQuery).not.toHaveBeenCalled();
});

it('real Mission and shared WorkOrder handlers cannot write execution before policy revalidation', async () => {
  vi.stubEnv('MC_CAPABILITY_CONTROL_ENABLED', 'true');
  vi.stubEnv('MC_CAPABILITY_ENVIRONMENT', 'qualification');
  vi.stubEnv('MC_CAPABILITY_INSTALLATION_ID', 'synthetic-isolated');
  const mission = { _id: 'mission-a', tenantId: 'tenant-a', projectId: 'project-a', ownerMemberId: 'member-a', ownerOperatorId: 'operator-a', state: 'READY' };
  const order = { _id: 'order-a', tenantId: 'tenant-a', projectId: 'project-a', missionId: mission._id };
  const rows: Record<string, unknown> = { 'mission-a': mission, 'order-a': order,
    'tenant-a': { _id: 'tenant-a', active: true },
    'project-a': { _id: 'project-a', tenantId: 'tenant-a' },
    'member-a': { _id: 'member-a', active: true, operatorId: 'operator-a', tenantId: 'tenant-a', projectId: 'project-a' },
    'operator-a': { _id: 'operator-a', authId: 'auth-a', active: true, tenantId: 'tenant-a' } };
  const writes = vi.fn();
  const tables: Record<string,string> = {'mission-a':'missions','order-a':'workOrders','member-a':'orgMembers','operator-a':'operators','tenant-a':'tenants','project-a':'projects'};
  function query(table: string) {
    const filters: Array<[string,unknown]> = [];
    const selected = () => Object.entries(rows).filter(([id,row]) => tables[id] === table && filters.every(([key,value]) => (row as any)[key] === value)).map(([,row]) => row);
    const q = { withIndex: (_name: string, filter: any) => { const b = {eq:(key:string,value:unknown)=>{filters.push([key,value]);return b;}};filter(b);return q; },
      first: async () => selected()[0] ?? null, unique: async () => selected()[0] ?? null,
      collect: async () => selected(), async *[Symbol.asyncIterator]() { yield* selected(); } };
    return q;
  }
  const ctx = { auth: { getUserIdentity: async () => ({ subject: 'auth-a' }) },
    db: { normalizeId: (table:string,id:string) => tables[id] === table ? id : null, get: async (id: string) => rows[id] ?? null, query, patch: writes, insert: writes } };
  await expect(handler(start)(ctx, { missionId: mission._id, idempotencyKey: 'start' })).rejects.toThrow('POLICY_REVALIDATION_UNAVAILABLE');
  await expect(handler(dispatchServiceInternal)(ctx, { workOrderId: order._id, actorType: 'SYSTEM', idempotencyKey: 'dispatch' })).rejects.toThrow('POLICY_REVALIDATION_UNAVAILABLE');
  expect(writes).not.toHaveBeenCalled();
  mission.state = 'IN_PROGRESS';
  expect(await handler(start)(ctx, { missionId: mission._id, idempotencyKey: 'start' })).toMatchObject({ created: false });
  ctx.auth.getUserIdentity = async () => ({ subject: 'other-owner' });
  await expect(requireCapabilityAdmission(ctx as never, mission as never, true)).rejects.toThrow('EXACT_OWNER');
  await expect(handler(start)(ctx, { missionId: mission._id, idempotencyKey: 'start' })).rejects.toThrow('MISSION_UNAVAILABLE');
  expect(writes).not.toHaveBeenCalled();
});
