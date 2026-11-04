import { describe, it, expect } from 'vitest';
import { enterpriseMissionOwner } from '../lib/enterpriseMissionOwner';

describe('enterprise Mission owner identity', () => {
  const mission = { ownerOperatorId: 'operator', owner: 'Shared display name', ownerMemberId: 'member', projectId: 'project', tenantId: 'tenant' };
  const records: any = { member: { active: true, projectId: 'project', tenantId: 'tenant', operatorId: 'operator' },
    operator: { _id: 'operator', active: true, tenantId: 'tenant' } };
  const ctx = (data: any) => ({ db: { get: async (id: string) => data[id] } }) as any;
  it('binds the assigned operator regardless of display-name changes', async () => {
    expect(await enterpriseMissionOwner(ctx(records), mission)).toBe('operator');
    expect(await enterpriseMissionOwner(ctx(records), { ...mission, owner: 'Renamed' })).toBe('operator');
  });
  it('does not rebind ownership through mutable membership or legacy labels', async () => {
    const data = structuredClone(records); data.member.operatorId = 'replacement';
    expect(await enterpriseMissionOwner(ctx(data), mission)).toBe('operator');
    await expect(enterpriseMissionOwner(ctx(data), { ...mission, ownerOperatorId: undefined })).rejects.toThrow('ENTERPRISE_OWNER_UNAVAILABLE');
  });
  it.each(['missing-operator', 'inactive-operator', 'operator-tenant'])('denies %s', async fault => {
    const data = structuredClone(records);
    if (fault === 'missing-operator') delete data.operator;
    if (fault === 'inactive-operator') data.operator.active = false;
    if (fault === 'operator-tenant') data.operator.tenantId = 'other';
    await expect(enterpriseMissionOwner(ctx(data), mission)).rejects.toThrow('ENTERPRISE_OWNER_UNAVAILABLE');
  });
});
