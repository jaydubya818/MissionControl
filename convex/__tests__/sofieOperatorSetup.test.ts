import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { installOwnerEnrollment, linkMemberSubject } from '../lib/sofieOperatorSetup';

// In-memory db with the subset of the Convex API the setup uses (get, query().withIndex(eq...).collect(), insert, patch).
function fakeDb(seed: Record<string, any[]>) {
  const tables: Record<string, any[]> = Object.fromEntries(Object.entries(seed).map(([t, rows]) => [t, rows.map(r => ({ ...r }))]));
  const all = () => Object.values(tables).flat();
  let n = 0;
  const db = {
    get: async (id: string) => all().find(r => r._id === id) ?? null,
    query: (t: string) => ({ withIndex: (_: string, f: (q: any) => any) => {
      const eqs: [string, unknown][] = []; const q = { eq: (k: string, v: unknown) => { eqs.push([k, v]); return q; } }; f(q);
      const rows = (tables[t] ?? []).filter(r => eqs.every(([k, v]) => r[k] === v));
      return { collect: async () => rows, first: async () => rows[0] ?? null };
    } }),
    insert: async (t: string, value: any) => { const _id = `${t}-${++n}`; (tables[t] ??= []).push({ _id, ...value }); return _id; },
    patch: async (id: string, value: any) => { Object.assign(all().find(r => r._id === id), value); },
  };
  return { ctx: { db } as any, tables };
}
const hex = (s: string) => createHash('sha256').update(s).digest('hex');
const now = Date.now(), DAY = 86_400_000;
const ORIGINS = { environment: 'APPROVED_NONPRODUCTION', issuer: 'https://mc.example.com', audience: 'https://sofie.example.com' };
const seed = () => ({
  tenants: [{ _id: 't1', active: true }, { _id: 't2', active: true }],
  projects: [{ _id: 'p1', tenantId: 't1', metadata: { sofieMode: 'INSTALLED_NONPRODUCTION', productionAuthority: false } }],
  roles: [{ _id: 'r-admin', tenantId: 't1', name: 'Company Owner', permissions: ['company.manage', 'members.manage'] },
    { _id: 'r-dev', tenantId: 't1', name: 'Developer', permissions: ['delivery.write'] }],
  roleAssignments: [{ _id: 'ra1', operatorId: 'op-jay', roleId: 'r-admin' }, { _id: 'ra2', operatorId: 'op-planner', roleId: 'r-dev' }],
  operators: [{ _id: 'op-jay', tenantId: 't1', authId: 'user_jay', active: true }, { _id: 'op-planner', tenantId: 't1', authId: 'user_planner', active: true },
    { _id: 'op-other-tenant', tenantId: 't2', authId: 'user_x', active: true }],
  orgMembers: [{ _id: 'm-jay', tenantId: 't1', projectId: 'p1', name: 'Jay', active: true }, { _id: 'm-planner', tenantId: 't1', projectId: 'p1', name: 'Planner', active: true },
    { _id: 'm-extra', tenantId: 't1', projectId: 'p1', name: 'Extra', active: true }],
  enterpriseAppConnections: [{ _id: 'c1', tenantId: 't1', projectId: 'p1', ownerId: 'op-jay', ownerMemberId: 'm-jay', owningTeamId: 'team1',
    applicationId: 'myeve-sofie-readiness-v1', keyId: 'k', expiresAt: now + 7 * DAY - 60_000, createdAt: now }],
  activities: [] as any[],
});
const installations = { 'inst-jay': { ownerSubject: 'user_jay', missionControlOwnerId: 'op-jay', repository: 'jay/app', repositoryId: 'repo-1', codeScopeIds: ['scope-1'],
  planner: { subject: 'user_planner', memberId: 'm-planner' }, keys: [{ keyId: hex('k'), publicKey: 'pem', activeFrom: 0, notAfter: now + DAY, revokedAt: null }] } };
const enrollment = (o: Record<string, unknown> = {}) => ({ schema: 'mc-owner-enrollment/v1', environment: 'APPROVED_NONPRODUCTION', installationId: 'inst-jay', revision: 1,
  ownerId: 'jay', ownerSubject: 'user_jay', missionControlOwnerId: 'op-jay', tenantId: 't1', projectId: 'p1', connectionId: 'c1',
  issuer: ORIGINS.issuer, audience: ORIGINS.audience, clerkIssuer: 'https://dear-sunbird-98.clerk.accounts.dev', clerkAudience: 'convex',
  clerkAuthorizedParty: 'https://mission-control.example.com', activeFrom: now - 1000, expiresAt: now + 6 * DAY, revokedAt: null,
  permitKeys: [{ keyId: hex('permit'), publicKey: 'pem', activeFrom: now - 1000, notAfter: now + 6 * DAY, revokedAt: null }],
  factoryVersion: hex('f'), executionContractSha256: hex('c'), capabilityPolicySha256: hex('p'), maxCostMicrousd: 1_300_000, maxDurationSeconds: 180, ...o });

beforeEach(() => { process.env.MC_SOFIE_INSTALLED_ORIGINS = JSON.stringify(ORIGINS); process.env.MC_SOFIE_CONFIRMATION_INSTALLATIONS = JSON.stringify(installations); });
afterEach(() => { delete process.env.MC_SOFIE_INSTALLED_ORIGINS; delete process.env.MC_SOFIE_CONFIRMATION_INSTALLATIONS; });

describe('linkMemberSubject (operator-only, audited)', () => {
  it('links a member to the operator of its Clerk subject once, idempotently, with an audit row', async () => {
    const { ctx, tables } = fakeDb(seed());
    expect(await linkMemberSubject(ctx, { actorOperatorId: 'op-jay' as any, memberId: 'm-planner' as any, subject: 'user_planner' })).toMatchObject({ operatorId: 'op-planner', changed: true });
    expect(tables.orgMembers.find(m => m._id === 'm-planner').operatorId).toBe('op-planner');
    expect(await linkMemberSubject(ctx, { actorOperatorId: 'op-jay' as any, memberId: 'm-planner' as any, subject: 'user_planner' })).toMatchObject({ changed: false });
    expect(tables.activities.filter(a => a.action === 'SOFIE_MEMBER_SUBJECT_LINKED')).toHaveLength(1);
  });
  it('refuses re-linking a member to a different subject and one subject to two members', async () => {
    const { ctx } = fakeDb(seed());
    await linkMemberSubject(ctx, { actorOperatorId: 'op-jay' as any, memberId: 'm-jay' as any, subject: 'user_jay' });
    await expect(linkMemberSubject(ctx, { actorOperatorId: 'op-jay' as any, memberId: 'm-jay' as any, subject: 'user_planner' })).rejects.toThrow('MEMBER_LINKED_TO_OTHER_SUBJECT');
    await expect(linkMemberSubject(ctx, { actorOperatorId: 'op-jay' as any, memberId: 'm-extra' as any, subject: 'user_jay' })).rejects.toThrow('SUBJECT_LINKED_TO_OTHER_MEMBER');
  });
  it('refuses non-admin operators, unknown or cross-tenant subjects and invalid subjects', async () => {
    const { ctx, tables } = fakeDb(seed());
    await expect(linkMemberSubject(ctx, { actorOperatorId: 'op-planner' as any, memberId: 'm-jay' as any, subject: 'user_jay' })).rejects.toThrow('OPERATOR_NOT_AUTHORIZED');
    await expect(linkMemberSubject(ctx, { actorOperatorId: 'op-other-tenant' as any, memberId: 'm-jay' as any, subject: 'user_jay' })).rejects.toThrow('OPERATOR_REQUIRED');
    await expect(linkMemberSubject(ctx, { actorOperatorId: 'op-jay' as any, memberId: 'm-jay' as any, subject: 'user_x' })).rejects.toThrow('SUBJECT_OPERATOR_NOT_FOUND');
    await expect(linkMemberSubject(ctx, { actorOperatorId: 'op-jay' as any, memberId: 'm-jay' as any, subject: 'bad subject' })).rejects.toThrow('SUBJECT_INVALID');
    expect(tables.activities).toHaveLength(0);
  });
});

describe('installOwnerEnrollment (operator-only, audited, idempotent, enrolled installations only)', () => {
  const linked = () => { const s = seed(); s.orgMembers[0] = { ...s.orgMembers[0], operatorId: 'op-jay' }; return s; };
  it('installs once, is idempotent for the same document and accepts only a newer revision', async () => {
    const { ctx, tables } = fakeDb(linked());
    expect(await installOwnerEnrollment(ctx, { actorOperatorId: 'op-jay' as any, connectionId: 'c1' as any, enrollment: enrollment() })).toMatchObject({ changed: true, revision: 1 });
    expect(await installOwnerEnrollment(ctx, { actorOperatorId: 'op-jay' as any, connectionId: 'c1' as any, enrollment: enrollment() })).toMatchObject({ changed: false });
    await expect(installOwnerEnrollment(ctx, { actorOperatorId: 'op-jay' as any, connectionId: 'c1' as any, enrollment: enrollment({ maxDurationSeconds: 120 }) })).rejects.toThrow('REVISION_NOT_NEWER');
    expect(await installOwnerEnrollment(ctx, { actorOperatorId: 'op-jay' as any, connectionId: 'c1' as any, enrollment: enrollment({ revision: 2 }) })).toMatchObject({ changed: true, revision: 2 });
    expect(tables.activities.filter(a => a.action === 'SOFIE_ENROLLMENT_INSTALLED')).toHaveLength(2);
  });
  it('refuses installations that are not enrolled, foreign subjects, unlinked owner members and non-admin operators', async () => {
    const { ctx } = fakeDb(linked());
    await expect(installOwnerEnrollment(ctx, { actorOperatorId: 'op-jay' as any, connectionId: 'c1' as any, enrollment: enrollment({ installationId: 'inst-x' }) })).rejects.toThrow('INSTALLATION_NOT_ENROLLED');
    await expect(installOwnerEnrollment(ctx, { actorOperatorId: 'op-jay' as any, connectionId: 'c1' as any, enrollment: enrollment({ ownerSubject: 'user_planner' }) })).rejects.toThrow('INSTALLATION_SCOPE');
    await expect(installOwnerEnrollment(ctx, { actorOperatorId: 'op-planner' as any, connectionId: 'c1' as any, enrollment: enrollment() })).rejects.toThrow('OPERATOR_NOT_AUTHORIZED');
    const unlinked = fakeDb(seed());
    await expect(installOwnerEnrollment(unlinked.ctx, { actorOperatorId: 'op-jay' as any, connectionId: 'c1' as any, enrollment: enrollment() })).rejects.toThrow('INSTALLATION_SCOPE');
  });
  it('refuses enrollments the bridge would not admit (cost, expiry beyond connection, malformed) and revoked connections', async () => {
    const { ctx, tables } = fakeDb(linked());
    await expect(installOwnerEnrollment(ctx, { actorOperatorId: 'op-jay' as any, connectionId: 'c1' as any, enrollment: enrollment({ maxCostMicrousd: 1_300_001 }) })).rejects.toThrow('ENROLLMENT_NOT_ADMISSIBLE');
    await expect(installOwnerEnrollment(ctx, { actorOperatorId: 'op-jay' as any, connectionId: 'c1' as any, enrollment: enrollment({ expiresAt: now + 8 * DAY }) })).rejects.toThrow('ENROLLMENT_NOT_ADMISSIBLE');
    await expect(installOwnerEnrollment(ctx, { actorOperatorId: 'op-jay' as any, connectionId: 'c1' as any, enrollment: { ...enrollment(), extra: 1 } })).rejects.toThrow('ENROLLMENT_INVALID');
    tables.enterpriseAppConnections[0].revokedAt = now;
    await expect(installOwnerEnrollment(ctx, { actorOperatorId: 'op-jay' as any, connectionId: 'c1' as any, enrollment: enrollment() })).rejects.toThrow('CONNECTION_REQUIRED');
    expect(tables.activities).toHaveLength(0);
  });
});
