import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../lib/deliveryAuthorization', () => ({
  requireAuthorizedDeliveryScope: async () => null,
  assertAuthorizedDeliveryRecord: () => {}, canAccessDeliveryRecord: () => true,
}));

import { start } from '../missions';
import { dispatchServiceInternal } from '../workOrders';

afterEach(() => vi.unstubAllEnvs());
const handler = (fn: unknown) => (fn as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler;

it('real Mission and shared WorkOrder handlers cannot write execution before policy revalidation', async () => {
  vi.stubEnv('MC_CAPABILITY_CONTROL_ENABLED', 'true');
  vi.stubEnv('MC_CAPABILITY_ENVIRONMENT', 'qualification');
  vi.stubEnv('MC_CAPABILITY_INSTALLATION_ID', 'synthetic-isolated');
  const mission = { _id: 'mission-a', tenantId: 'tenant-a', projectId: 'project-a', ownerMemberId: 'member-a', state: 'READY' };
  const order = { _id: 'order-a', tenantId: 'tenant-a', projectId: 'project-a', missionId: mission._id };
  const rows: Record<string, unknown> = { 'mission-a': mission, 'order-a': order,
    'member-a': { operatorId: 'operator-a', tenantId: 'tenant-a' },
    'operator-a': { authId: 'auth-a', active: true, tenantId: 'tenant-a' } };
  const writes = vi.fn();
  const query = { withIndex: () => query, first: async () => null };
  const ctx = { auth: { getUserIdentity: async () => ({ subject: 'auth-a' }) },
    db: { get: async (id: string) => rows[id] ?? null, query: () => query, patch: writes, insert: writes } };
  await expect(handler(start)(ctx, { missionId: mission._id, idempotencyKey: 'start' })).rejects.toThrow('POLICY_REVALIDATION_UNAVAILABLE');
  await expect(handler(dispatchServiceInternal)(ctx, { workOrderId: order._id, actorType: 'SYSTEM', idempotencyKey: 'dispatch' })).rejects.toThrow('POLICY_REVALIDATION_UNAVAILABLE');
  expect(writes).not.toHaveBeenCalled();
  mission.state = 'IN_PROGRESS';
  expect(await handler(start)(ctx, { missionId: mission._id, idempotencyKey: 'start' })).toMatchObject({ created: false });
  ctx.auth.getUserIdentity = async () => ({ subject: 'other-owner' });
  await expect(handler(start)(ctx, { missionId: mission._id, idempotencyKey: 'start' })).rejects.toThrow('EXACT_OWNER');
});
