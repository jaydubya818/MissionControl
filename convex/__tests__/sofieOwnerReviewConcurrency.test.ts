import { beforeEach, expect, it, vi } from 'vitest';
import { inspect } from '../sofieOwnerReview';
import { projectMission } from '../sofieEnterprise';
import { projectEnterpriseResult, resultMissionScope } from '../lib/sofieEnterpriseResult';
import { currentConnection } from '../lib/sofieEnterpriseAuthority';
import { requireWorkspaceAccess } from '../lib/companyAccess';
import { enterpriseDigest } from '../../packages/shared/src/sofieEnterprise';

// Exercise the owner handler's sequencing; database filtering and full execution
// qualification remain covered by canonical authorization/hosted suites.
vi.mock('../lib/missionScopedFunctions', () => ({ mutation: (definition: any) => definition, query: (definition: any) => definition }));
vi.mock('../sofieEnterprise', () => ({ projectMission: vi.fn() }));
vi.mock('../missions', () => ({ acceptMission: vi.fn() }));
vi.mock('../lib/sofieEnterpriseResult', () => ({ projectEnterpriseResult: vi.fn(), resultMissionScope: vi.fn() }));
vi.mock('../lib/sofieEnterpriseAuthority', () => ({ currentConnection: vi.fn() }));
vi.mock('../lib/companyAccess', () => ({ COMPANY_PERMISSIONS: { APPROVE_DELIVERY: 'approve' }, requireWorkspaceAccess: vi.fn() }));
const detail = vi.mocked(projectMission), result = vi.mocked(projectEnterpriseResult), access = vi.mocked(requireWorkspaceAccess);
beforeEach(() => { vi.resetAllMocks(); });
function fixture() {
  const binding = { connectionId: 'connection', tenantId: 'tenant', projectId: 'project', ownerId: 'owner', intentKey: 'intent', proposal: { title: 'Proposal' } };
  const proposal = { ...binding, _id: 'proposal', missionId: 'mission', digest: enterpriseDigest(binding), expiresAt: Date.now() + 60000 };
  const mission = { _id: 'mission', tenantId: 'tenant', projectId: 'project', ownerOperatorId: 'owner', currentPlanId: 'plan' };
  const owner = { _id: 'owner', active: true, tenantId: 'tenant' };
  const connection = { ...binding, _id: 'connection' };
  const scope = { missionId: 'mission', planId: 'plan', planRevision: 1, planDigest: 'plan-digest' };
  vi.mocked(currentConnection).mockResolvedValue({ owner, connection } as any);
  vi.mocked(resultMissionScope).mockResolvedValue({ scope } as any);
  access.mockResolvedValue({ membership: { mode: 'AUTHENTICATED', operatorId: 'owner' } } as any);
  const rows: any = { proposal, mission, owner };
  const ctx: any = { db: { get: async (id: string) => rows[id] } };
  const handler = (inspect as any).handler;
  return { ctx, scope, run: () => handler(ctx, { projectId: 'project', proposalId: 'proposal', expectedDigest: proposal.digest }) };
}
it('waits for owner authorization, then overlaps both read-only projections', async () => {
  const f = fixture(); let authorize!: (value: any) => void, completeDetail!: (value: any) => void;
  access.mockImplementation(() => new Promise(resolve => { authorize = resolve; }));
  detail.mockImplementation(() => new Promise(resolve => { completeDetail = resolve; }));
  result.mockResolvedValue({ status: 'NOT_AVAILABLE', observedAt: 1, freshUntil: 2 } as any);
  const pending = f.run(); await vi.waitFor(() => expect(access).toHaveBeenCalledTimes(1));
  expect(detail).not.toHaveBeenCalled(); expect(result).not.toHaveBeenCalled();
  authorize({ membership: { mode: 'AUTHENTICATED', operatorId: 'owner' } });
  await vi.waitFor(() => expect(result).toHaveBeenCalledTimes(1));
  expect(detail).toHaveBeenCalledTimes(1); // Detail has not resolved yet.
  expect(result.mock.calls[0]).toEqual([f.ctx, expect.objectContaining({ resultScope: f.scope }), 'mission', 'plan-digest']);
  completeDetail({ detail: 'current' });
  const output = await pending; expect(output.detail).toEqual({ detail: 'current' }); expect(output.result.status).toBe('NOT_AVAILABLE');
});
it('rejects foreign owner access before either projection', async () => {
  const f = fixture(); access.mockResolvedValue({ membership: { mode: 'AUTHENTICATED', operatorId: 'foreign' } } as any);
  await expect(f.run()).rejects.toThrow('ENTERPRISE_ACCESS_DENIED');
  expect(detail).not.toHaveBeenCalled(); expect(result).not.toHaveBeenCalled();
});
for (const failed of ['detail', 'result'] as const) it(`rejects the whole inspection on ${failed} failure`, async () => {
  const f = fixture(); detail.mockResolvedValue({} as any); result.mockResolvedValue({ status: 'AVAILABLE' } as any);
  (failed === 'detail' ? detail : result).mockRejectedValue(Error('PROJECTION_FAILED'));
  await expect(f.run()).rejects.toThrow('PROJECTION_FAILED');
});
