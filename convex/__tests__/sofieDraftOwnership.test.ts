import { expect, it } from 'vitest';
import { missionScopedContext } from '../lib/missionScopedFunctions';

it('binds exactly one new draft OWNER assignment to the validated application connection', async () => {
  const records = new Map<string, { table: string; row: any }>();
  let next = 0;
  const insert = async (table: string, value: any) => {
    const id = String(++next).padStart(32, '0');
    records.set(id, { table, row: { ...value, _id: id } });
    return id;
  };
  const tenantId = await insert('tenants', {});
  const projectId = await insert('projects', { tenantId });
  const ownerId = await insert('operators', { tenantId });
  const memberId = await insert('orgMembers', { tenantId, projectId, operatorId: ownerId });
  const teamId = await insert('scrumTeams', { tenantId, projectId });
  const proposalId = await insert('enterpriseMissionProposals', {});
  const connection = { ownerId, tenantId, projectId, ownerMemberId: memberId, owningTeamId: teamId };
  const raw = { db: {
    insert,
    get: async (id: string) => records.get(id)?.row ?? null,
    normalizeId: (table: string, id: string) => records.get(id)?.table === table ? id : null,
    patch: async (id: string, patch: any) => Object.assign(records.get(id)!.row, patch),
  } };
  const application = { connection, request: { operation: 'enterprise.submit' }, proposal: { _id: proposalId, digest: 'proposal-digest' } };
  const scoped = missionScopedContext(raw as any, 'OWNER', undefined, undefined, application as any);
  const draft = { tenantId, projectId, ownerOperatorId: ownerId, ownerMemberId: memberId, owningTeamId: teamId,
    state: 'DRAFT', budgetUsd: 0, metadata: { proposalId, proposalDigest: 'proposal-digest' } };
  await expect(scoped.db.insert('missions', { ...draft, ownerMemberId: ownerId } as any)).rejects.toThrow('MISSION_OWNER_REQUIRED');
  const missionId = await scoped.db.insert('missions', draft as any);
  const assignment = { tenantId, projectId, missionId, memberId, operatorId: ownerId, teamId, role: 'OWNER', active: true };
  await expect(scoped.db.insert('missionAssignments', { ...assignment, memberId: ownerId } as any)).rejects.toThrow('MISSION_UNAVAILABLE');
  await expect(scoped.db.insert('missionAssignments', { ...assignment, missionId: projectId } as any)).rejects.toThrow('MISSION_UNAVAILABLE');
  const assignmentId = await scoped.db.insert('missionAssignments', assignment as any);
  await expect(scoped.db.insert('missionAssignments', assignment as any)).rejects.toThrow('MISSION_UNAVAILABLE');
  await expect(scoped.db.patch(assignmentId, { active: false })).rejects.toThrow('MISSION_UNAVAILABLE');
  await expect(scoped.db.insert('missions', draft as any)).rejects.toThrow('MISSION_OWNER_REQUIRED');
});
