import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { capabilityPolicyOwnerId, requireCapabilityAdmission } from '../lib/capabilityAdmission';
import { admissionActionDigest, policyMessageHash, signPolicyMessage, type PolicyKey } from '../lib/capabilityOrderingWire';

// Hosted Sofie presents its capability owner as myeve.hosted:<installation>:<owner> (MyEve hostedOwnerScope) while the MC owner
// enrollment stays keyed on the plain owner id. enterprise.authorizeAdmission derives the policy owner from the enrollment.
afterEach(() => vi.unstubAllEnvs());

const hex = (s: string) => createHash('sha256').update(s).digest('hex');
const SCOPE = 'myeve.hosted:jay:owner';
const enrollmentFor = (installationId = 'jay') => ({ installationId, ownerId: 'owner', ownerSubject: 'user_jay', missionControlOwnerId: 'op-jay' });
const installation = { ownerSubject: 'user_jay', missionControlOwnerId: 'op-jay', repository: 'jay/app', repositoryId: 'repo-1', codeScopeIds: ['scope-1'],
  planner: { subject: 'planner_jay', memberId: 'planner-member-jay' }, keys: [{ keyId: hex('jay'), publicKey: 'pem', activeFrom: 0, notAfter: Date.now() + 3600_000, revokedAt: null }] };
const hostedRegistry = JSON.stringify({ jay: installation });

describe('capabilityPolicyOwnerId', () => {
  it('derives the hosted scope only for an enrolled hosted Sofie installation of the same owner', () => {
    expect(capabilityPolicyOwnerId(enrollmentFor(), hostedRegistry)).toBe(SCOPE);
    expect(capabilityPolicyOwnerId(enrollmentFor('other'), hostedRegistry)).toBe('owner');
    expect(capabilityPolicyOwnerId({ ...enrollmentFor(), ownerSubject: 'user_other' }, hostedRegistry)).toBe('owner');
    expect(capabilityPolicyOwnerId({ ...enrollmentFor(), missionControlOwnerId: 'op-other' }, hostedRegistry)).toBe('owner');
  });
  it('keeps the plain owner id for non-hosted or unconfigured installations', () => {
    expect(capabilityPolicyOwnerId(enrollmentFor(), undefined)).toBe('owner');
    expect(capabilityPolicyOwnerId(enrollmentFor(), '{not json')).toBe('owner');
    expect(capabilityPolicyOwnerId(enrollmentFor(), JSON.stringify({ jay: { ...installation, extra: 1 } }))).toBe('owner');
  });
});

async function key(keyId: string): Promise<{ priv: PolicyKey; pub: PolicyKey }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  return { priv: { keyId, jwk: await crypto.subtle.exportKey('jwk', pair.privateKey) }, pub: { keyId, jwk: await crypto.subtle.exportKey('jwk', pair.publicKey) } };
}

async function scenario(opts: { bindingOwnerId: string; enrollmentInstallationId?: string; registry?: string }) {
  const [myeve, relay, ack] = await Promise.all([key('myeve-k'), key('relay-k'), key('ack-k')]);
  const binding = { ownerId: opts.bindingOwnerId, organizationId: 'org', installationId: 'jay', backendId: 'missioncontrol-hosted-jay', incarnation: 'inc-1',
    enrollmentVersion: 1, tenantId: 'tenant-a', projectId: 'project-a', ownerMemberId: 'member-a', agentId: 'agent-1', registryVersion: 'reg-1',
    sourceKeys: { myeve: myeve.pub, relay: relay.pub }, acknowledgmentKey: ack.priv };
  vi.stubEnv('MC_CAPABILITY_ENVIRONMENT', 'qualification');
  vi.stubEnv('MC_CAPABILITY_INSTALLATION_ID', 'jay');
  vi.stubEnv('MC_CAPABILITY_BINDINGS_JSON', JSON.stringify([binding]));
  vi.stubEnv('MC_CAPABILITY_RECEIVER_RECOVERY_STATE', 'ACTIVE');
  vi.stubEnv('MC_CAPABILITY_RECEIVER_EPOCH', 'inc-1');
  const record = { tenantId: 'tenant-a', projectId: 'project-a', ownerMemberId: 'member-a' };
  const input = { workId: 'work-1', missionId: 'mission-1', generation: 1, capabilityId: 'enterprise.fleet',
    args: { operation: 'enterprise.authorizeAdmission', permitId: 'permit-1' }, nativeSnapshot: { permitSha256: 'a'.repeat(64) } } as any;
  const actionDigest = await admissionActionDigest({ workId: input.workId, missionId: input.missionId, generation: input.generation, nativeSnapshot: input.nativeSnapshot, args: input.args });
  const now = Date.now();
  // MyEve and Relay sign the permit for the owner identity hosted MyEve presents (always the binding's configured owner here).
  const base = { ownerId: opts.bindingOwnerId, organizationId: 'org', installationId: 'jay', backendId: binding.backendId, incarnation: 'inc-1', enrollmentVersion: 1,
    version: 1, policyId: 'policy-1', kind: 'PERMIT' as const, referenceId: 'ref-1', capabilityId: 'enterprise.fleet', requiredCapabilities: ['work', 'missioncontrol', 'enterprise.fleet'],
    registryVersion: 'reg-1', agentId: 'agent-1', agentRevision: 1, workId: 'work-1', missionId: 'mission-1', workGeneration: 1, actionDigest, budgetMicros: 5_000_000,
    issuedAt: now - 1000, expiresAt: now + 20_000 };
  const myeveMessage = { ...base, authority: 'myeve' as const, sourcePermitHash: 'SELF' };
  const myevePermit = await signPolicyMessage(myeveMessage, myeve.priv);
  const relayPermit = await signPolicyMessage({ ...base, authority: 'relay', sourcePermitHash: await policyMessageHash(myeveMessage) }, relay.priv);
  input.permits = { myeve: myevePermit, relay: relayPermit };
  const inserts: unknown[] = [];
  const ctx = {
    auth: { getUserIdentity: async () => null },
    db: {
      get: async (id: string) => id === 'member-a' ? { active: true, operatorId: 'operator-a', tenantId: 'tenant-a', projectId: 'project-a' }
        : { _id: 'operator-a', active: true, authId: 'user_jay', tenantId: 'tenant-a' },
      query: (table: string) => ({ withIndex: () => ({ unique: async () => table === 'capabilityEnrolledOwners' ? { installationId: 'jay', incarnation: 'inc-1' }
        : table === 'capabilityPolicyFences' ? { capabilityId: 'enterprise.fleet', operation: 'enable', version: 1, policyId: 'policy-1', enrollmentVersion: 1 } : null }) }),
      insert: async (_table: string, row: unknown) => { inserts.push(row); return 'id'; },
    },
  };
  const enrollment = enrollmentFor(opts.enrollmentInstallationId);
  const run = () => requireCapabilityAdmission(ctx as never, record as never, false, input, { authenticatedOwnerId: 'operator-a',
    policyOwnerId: capabilityPolicyOwnerId(enrollment, opts.registry ?? hostedRegistry), installationId: enrollment.installationId, replay: false });
  return { run, inserts };
}

describe('enterprise.authorizeAdmission capability owner for hosted Sofie', () => {
  it('admits a hosted enrollment whose binding and permits carry the hosted scope', async () => {
    const s = await scenario({ bindingOwnerId: SCOPE });
    await expect(s.run()).resolves.toMatchObject({ budgetMicros: 5_000_000 });
    expect(s.inserts).toHaveLength(2);
  });
  it('refuses a hosted enrollment whose binding carries the plain owner id', async () => {
    const s = await scenario({ bindingOwnerId: 'owner' });
    await expect(s.run()).rejects.toThrow('CAPABILITY_ADMISSION_SCOPE');
    expect(s.inserts).toHaveLength(0);
  });
  it('keeps non-hosted behavior: plain owner binding admitted, scope binding refused', async () => {
    const plain = await scenario({ bindingOwnerId: 'owner', registry: JSON.stringify({}) });
    await expect(plain.run()).resolves.toMatchObject({ budgetMicros: 5_000_000 });
    const scoped = await scenario({ bindingOwnerId: SCOPE, registry: JSON.stringify({}) });
    await expect(scoped.run()).rejects.toThrow('CAPABILITY_ADMISSION_SCOPE');
  });
  it('refuses a mismatched installation even when it is a hosted installation', async () => {
    const s = await scenario({ bindingOwnerId: SCOPE, enrollmentInstallationId: 'other', registry: JSON.stringify({ jay: installation, other: installation }) });
    await expect(s.run()).rejects.toThrow('CAPABILITY_ADMISSION_SCOPE');
    expect(s.inserts).toHaveLength(0);
  });
});
