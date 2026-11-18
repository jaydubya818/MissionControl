import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { requireCapabilityAdmission } from '../lib/capabilityAdmission';
import { requireCapabilityReceiverRecovery } from '../lib/capabilityReceiverRecovery';
import { capabilityReceiverConfigured, capabilityReceivers, capabilityReceiversConfigured } from '../lib/capabilityReceivers';
import { capabilityWorkRestriction } from '../lib/capabilityWorkControl';
import { installedAudienceFor, installedEnrollment, installedOrigins } from '../lib/installedSofieConnection';
import { PRIVATE_BETA_SOFIE_CONNECTION_MAX_MS, connectionLifetimeCap } from '../lib/sofieConfirmation';
import { admissionActionDigest, policyMessageHash, signPolicyMessage, type PolicyKey } from '../lib/capabilityOrderingWire';
import { permitFixture } from './executionPermitFixture.fixture';

// Option (a): per-installation capability receivers (MC_CAPABILITY_RECEIVERS_JSON) and per-installation audiences
// (MC_SOFIE_INSTALLED_ORIGINS.audiences). Legacy singleton env must decide exactly as before.
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

const JAY_EPOCH = 'mc-hosted-jay-20261110';
const T1_EPOCH = 'mc-hosted-tester-1-20261117';
const T2_EPOCH = 'mc-hosted-tester-2-20261117';
const ISSUER = 'https://gallant-cassowary-27.convex.cloud';
const JAY_ORIGIN = 'https://sofie-personal-agent.vercel.app';
const T1_ORIGIN = 'https://myeve-alpha-tester-1.vercel.app';

function legacyEnv(state = 'ACTIVE') {
  vi.stubEnv('MC_CAPABILITY_ENVIRONMENT', 'qualification');
  vi.stubEnv('MC_CAPABILITY_INSTALLATION_ID', 'jay');
  vi.stubEnv('MC_CAPABILITY_RECEIVER_EPOCH', JAY_EPOCH);
  vi.stubEnv('MC_CAPABILITY_RECEIVER_RECOVERY_STATE', state);
}
function mapEnv(receivers: Record<string, unknown> | string) {
  legacyEnv();
  vi.stubEnv('MC_CAPABILITY_RECEIVERS_JSON', typeof receivers === 'string' ? receivers : JSON.stringify(receivers));
}
const both = { jay: { epoch: JAY_EPOCH, recoveryState: 'ACTIVE' }, 'tester-1': { epoch: T1_EPOCH, recoveryState: 'ACTIVE' } };

/** The pre-change implementation of the two singleton checks, kept verbatim for equivalence. */
const oldRecovery = (incarnation: string) => {
  if (process.env.MC_CAPABILITY_RECEIVER_RECOVERY_STATE !== 'ACTIVE'
    || !incarnation || process.env.MC_CAPABILITY_RECEIVER_EPOCH !== incarnation) throw Error('CAPABILITY_RECEIVER_RECOVERY_QUARANTINED');
};
const outcome = (fn: () => void) => { try { fn(); return 'ok'; } catch (e) { return (e as Error).message; } };

describe('legacy singleton env (jay only) is unchanged', () => {
  it('synthesizes nothing new: installation gate and recovery decide exactly as the singleton checks did', () => {
    for (const state of ['ACTIVE', 'QUARANTINED', '']) for (const epoch of [JAY_EPOCH, 'other', '']) for (const installation of ['jay', '', undefined]) {
      vi.unstubAllEnvs();
      vi.stubEnv('MC_CAPABILITY_RECEIVER_RECOVERY_STATE', state);
      vi.stubEnv('MC_CAPABILITY_RECEIVER_EPOCH', epoch);
      if (installation !== undefined) vi.stubEnv('MC_CAPABILITY_INSTALLATION_ID', installation);
      expect(capabilityReceivers()).toBeNull();
      expect(capabilityReceiversConfigured()).toBe(!!process.env.MC_CAPABILITY_INSTALLATION_ID?.trim());
      for (const bindingInstallation of ['jay', 'tester-1', 'installation', ''])
        expect(capabilityReceiverConfigured(bindingInstallation)).toBe(bindingInstallation === process.env.MC_CAPABILITY_INSTALLATION_ID);
      for (const bindingInstallation of ['jay', 'tester-1', 'installation']) for (const incarnation of [JAY_EPOCH, 'other', ''])
        expect(outcome(() => requireCapabilityReceiverRecovery(bindingInstallation, incarnation))).toBe(outcome(() => oldRecovery(incarnation)));
    }
  });
  it('keeps the single audience for every installation when no audiences map is configured', () => {
    vi.stubEnv('MC_SOFIE_INSTALLED_ORIGINS', JSON.stringify({ environment: 'APPROVED_NONPRODUCTION', issuer: ISSUER, audience: JAY_ORIGIN }));
    const origins = installedOrigins();
    expect(origins).toEqual({ environment: 'APPROVED_NONPRODUCTION', issuer: ISSUER, audience: JAY_ORIGIN });
    expect(installedAudienceFor(origins, 'jay')).toBe(JAY_ORIGIN);
    expect(installedAudienceFor(origins, 'tester-1')).toBe(JAY_ORIGIN);
  });
  it('admits jay through requireCapabilityAdmission under legacy env', async () => {
    legacyEnv();
    await expect((await admission('jay', JAY_EPOCH)).run()).resolves.toMatchObject({ budgetMicros: 5_000_000 });
    await expect((await admission('tester-1', T1_EPOCH)).run()).rejects.toThrow('CAPABILITY_INSTALLATION_UNQUALIFIED');
  });
});

describe('multi-installation receivers', () => {
  it('admits jay and tester-1, each only with its own epoch', async () => {
    mapEnv(both);
    await expect((await admission('jay', JAY_EPOCH)).run()).resolves.toMatchObject({ budgetMicros: 5_000_000 });
    await expect((await admission('tester-1', T1_EPOCH)).run()).resolves.toMatchObject({ budgetMicros: 5_000_000 });
    // tester-1 presenting jay's epoch, and jay presenting tester-1's, are quarantined
    await expect((await admission('tester-1', JAY_EPOCH)).run()).rejects.toThrow('CAPABILITY_RECEIVER_RECOVERY_QUARANTINED');
    await expect((await admission('jay', T1_EPOCH)).run()).rejects.toThrow('CAPABILITY_RECEIVER_RECOVERY_QUARANTINED');
  });
  it('ignores the legacy singleton epoch/state once the map is set', () => {
    mapEnv(both);
    vi.stubEnv('MC_CAPABILITY_RECEIVER_RECOVERY_STATE', 'QUARANTINED');
    expect(() => requireCapabilityReceiverRecovery('jay', JAY_EPOCH)).not.toThrow();
    expect(() => requireCapabilityReceiverRecovery('tester-1', T1_EPOCH)).not.toThrow();
  });
  it('quarantining one installation does not affect another', async () => {
    mapEnv({ ...both, 'tester-1': { epoch: T1_EPOCH, recoveryState: 'QUARANTINED' }, 'tester-2': { epoch: T2_EPOCH, recoveryState: 'ACTIVE' } });
    await expect((await admission('tester-1', T1_EPOCH)).run()).rejects.toThrow('CAPABILITY_RECEIVER_RECOVERY_QUARANTINED');
    await expect((await admission('jay', JAY_EPOCH)).run()).resolves.toMatchObject({ budgetMicros: 5_000_000 });
    await expect((await admission('tester-2', T2_EPOCH)).run()).resolves.toMatchObject({ budgetMicros: 5_000_000 });
    mapEnv({ ...both, jay: { epoch: JAY_EPOCH, recoveryState: 'QUARANTINED' } });
    await expect((await admission('jay', JAY_EPOCH)).run()).rejects.toThrow('CAPABILITY_RECEIVER_RECOVERY_QUARANTINED');
    await expect((await admission('tester-1', T1_EPOCH)).run()).resolves.toMatchObject({ budgetMicros: 5_000_000 });
  });
  it('freezes admitted Work per installation (capabilityWorkRestriction reads identity[3] and identity[5])', async () => {
    mapEnv({ ...both, 'tester-1': { epoch: T1_EPOCH, recoveryState: 'QUARANTINED' } });
    const ctx = { db: { query: () => ({ withIndex: () => ({ unique: async () => null }) }) } };
    const work = (installation: string, epoch: string) => ({ capabilityAuthorities: [{ scope: JSON.stringify(['myeve', 'owner', 'org', installation, 'backend', epoch]),
      version: 1, policyId: 'p', capabilityId: 'enterprise.fleet' }] });
    expect(await capabilityWorkRestriction(ctx as never, work('jay', JAY_EPOCH))).toBeUndefined();
    expect(await capabilityWorkRestriction(ctx as never, work('tester-1', T1_EPOCH))).toBe('CAPABILITY_RECOVERY_PENDING_BACKEND');
    expect(await capabilityWorkRestriction(ctx as never, work('tester-2', JAY_EPOCH))).toBe('CAPABILITY_RECOVERY_PENDING_BACKEND');
  });
  it('refuses an unknown installation', async () => {
    mapEnv(both);
    expect(capabilityReceiverConfigured('tester-2')).toBe(false);
    expect(capabilityReceiverConfigured('__proto__')).toBe(false);
    await expect((await admission('tester-2', T2_EPOCH)).run()).rejects.toThrow('CAPABILITY_INSTALLATION_UNQUALIFIED');
    expect(() => requireCapabilityReceiverRecovery('tester-2', T2_EPOCH)).toThrow('QUARANTINED');
  });
  it('a malformed or empty map configures no receiver at all', async () => {
    for (const bad of ['{not json', '[]', 'null', JSON.stringify({ jay: { epoch: JAY_EPOCH } }), JSON.stringify({ ...both, 'tester-1': { epoch: '', recoveryState: 'ACTIVE' } }),
      JSON.stringify({ ...both, 'tester-1': { epoch: T1_EPOCH, recoveryState: 'ACTIVE', extra: 1 } }), '{}']) {
      mapEnv(bad);
      expect(capabilityReceiversConfigured()).toBe(false);
      await expect((await admission('jay', JAY_EPOCH)).run()).rejects.toThrow('CAPABILITY_INSTALLATION_UNQUALIFIED');
      expect(() => requireCapabilityReceiverRecovery('jay', JAY_EPOCH)).toThrow('QUARANTINED');
    }
  });
});

describe('per-installation audiences', () => {
  const origins = (audiences?: unknown) => vi.stubEnv('MC_SOFIE_INSTALLED_ORIGINS',
    JSON.stringify({ environment: 'APPROVED_NONPRODUCTION', issuer: 'https://mc.example.test', audience: 'https://eve.example.test', ...(audiences === undefined ? {} : { audiences }) }));
  async function enrolled(installationId: string, audience: string) {
    const f = permitFixture();
    vi.useFakeTimers(); vi.setSystemTime(f.now);
    const enrollment = { ...f.enrollment, installationId, audience };
    const connection = { _id: 'connection', projectId: 'project', tenantId: 'tenant', ownerId: 'operator', expiresAt: f.now + 600000, installedEnrollment: enrollment };
    const ctx = { db: { get: async (id: string) => id === 'project'
      ? { tenantId: 'tenant', metadata: { sofieMode: 'INSTALLED_NONPRODUCTION', productionAuthority: false } } : { active: true } } };
    return installedEnrollment(ctx as never, connection as never);
  }
  it('admits each installation only with its own audience; tester cannot use jay\'s audience', async () => {
    origins({ 'tester-1': 'https://tester-1.example.test' });
    await expect(enrolled('installation', 'https://eve.example.test')).resolves.toBeTruthy();
    await expect(enrolled('tester-1', 'https://tester-1.example.test')).resolves.toBeTruthy();
    await expect(enrolled('tester-1', 'https://eve.example.test')).rejects.toThrow();
    await expect(enrolled('installation', 'https://tester-1.example.test')).rejects.toThrow();
  });
  it('legacy single audience still governs every installation', async () => {
    origins();
    await expect(enrolled('installation', 'https://eve.example.test')).resolves.toBeTruthy();
    await expect(enrolled('installation', 'https://tester-1.example.test')).rejects.toThrow();
  });
  it('a malformed audiences map denies everything', () => {
    for (const bad of [[], 'x', { 'tester-1': 'not-an-origin' }, { 'tester-1': 'https://mc.example.test' }, { ' ': T1_ORIGIN }]) {
      origins(bad);
      expect(() => installedOrigins()).toThrow();
    }
  });
});

describe('connectionLifetimeCap with a malformed tester entry', () => {
  const hex = (s: string) => createHash('sha256').update(s).digest('hex');
  const installation = (owner: string) => ({ ownerSubject: `user_${owner}`, missionControlOwnerId: `op-${owner}`, repository: 'jay/app', repositoryId: 'repo-1',
    codeScopeIds: ['scope-1'], planner: { subject: `planner_${owner}`, memberId: `planner-member-${owner}` },
    keys: [{ keyId: hex(owner), publicKey: 'pem', activeFrom: 0, notAfter: Date.now() + 3600_000, revokedAt: null }] });
  it('keeps jay\'s 7-day cap whichever order the bad entry is iterated in', () => {
    const bad = { ...installation('t1'), extra: 1 };
    for (const config of [{ 'tester-1': bad, jay: installation('jay') }, { jay: installation('jay'), 'tester-1': bad }]) {
      expect(connectionLifetimeCap('PRIVATE_BETA_SOFIE', 'op-jay', JSON.stringify(config))).toBe(PRIVATE_BETA_SOFIE_CONNECTION_MAX_MS);
      expect(connectionLifetimeCap('PRIVATE_BETA_SOFIE', 'op-t1', JSON.stringify(config))).toBeNull();
    }
  });
});

async function key(keyId: string): Promise<{ priv: PolicyKey; pub: PolicyKey }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  return { priv: { keyId, jwk: await crypto.subtle.exportKey('jwk', pair.privateKey) }, pub: { keyId, jwk: await crypto.subtle.exportKey('jwk', pair.publicKey) } };
}

/** One binding for `installationId` whose binding, enrollment and permits all carry `incarnation`. Env is set by the caller. */
async function admission(installationId: string, incarnation: string) {
  const [myeve, relay, ack] = await Promise.all([key('myeve-k'), key('relay-k'), key('ack-k')]);
  const ownerId = `myeve.hosted:${installationId}:owner`;
  const binding = { ownerId, organizationId: 'org', installationId, backendId: `missioncontrol-hosted-${installationId}`, incarnation,
    enrollmentVersion: 1, tenantId: 'tenant-a', projectId: 'project-a', ownerMemberId: 'member-a', agentId: 'agent-1', registryVersion: 'reg-1',
    sourceKeys: { myeve: myeve.pub, relay: relay.pub }, acknowledgmentKey: ack.priv };
  vi.stubEnv('MC_CAPABILITY_BINDINGS_JSON', JSON.stringify([binding]));
  const record = { tenantId: 'tenant-a', projectId: 'project-a', ownerMemberId: 'member-a' };
  const input = { workId: 'work-1', missionId: 'mission-1', generation: 1, capabilityId: 'enterprise.fleet',
    args: { operation: 'enterprise.authorizeAdmission', permitId: 'permit-1' }, nativeSnapshot: { permitSha256: 'a'.repeat(64) } } as any;
  const actionDigest = await admissionActionDigest({ workId: input.workId, missionId: input.missionId, generation: input.generation, nativeSnapshot: input.nativeSnapshot, args: input.args });
  const now = Date.now();
  const base = { ownerId, organizationId: 'org', installationId, backendId: binding.backendId, incarnation, enrollmentVersion: 1,
    version: 1, policyId: 'policy-1', kind: 'PERMIT' as const, referenceId: 'ref-1', capabilityId: 'enterprise.fleet', requiredCapabilities: ['work', 'missioncontrol', 'enterprise.fleet'],
    registryVersion: 'reg-1', agentId: 'agent-1', agentRevision: 1, workId: 'work-1', missionId: 'mission-1', workGeneration: 1, actionDigest, budgetMicros: 5_000_000,
    issuedAt: now - 1000, expiresAt: now + 20_000 };
  const myeveMessage = { ...base, authority: 'myeve' as const, sourcePermitHash: 'SELF' };
  input.permits = { myeve: await signPolicyMessage(myeveMessage, myeve.priv),
    relay: await signPolicyMessage({ ...base, authority: 'relay', sourcePermitHash: await policyMessageHash(myeveMessage) }, relay.priv) };
  const ctx = {
    auth: { getUserIdentity: async () => null },
    db: {
      get: async (id: string) => id === 'member-a' ? { active: true, operatorId: 'operator-a', tenantId: 'tenant-a', projectId: 'project-a' }
        : { _id: 'operator-a', active: true, authId: 'user', tenantId: 'tenant-a' },
      query: (table: string) => ({ withIndex: () => ({ unique: async () => table === 'capabilityEnrolledOwners' ? { installationId, incarnation }
        : table === 'capabilityPolicyFences' ? { capabilityId: 'enterprise.fleet', operation: 'enable', version: 1, policyId: 'policy-1', enrollmentVersion: 1 } : null }) }),
      insert: async () => 'id',
    },
  };
  const run = () => requireCapabilityAdmission(ctx as never, record as never, false, input,
    { authenticatedOwnerId: 'operator-a', policyOwnerId: ownerId, installationId, replay: false });
  return { run };
}
