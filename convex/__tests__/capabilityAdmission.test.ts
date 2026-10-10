import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireCapabilityAdmission } from '../lib/capabilityAdmission';

afterEach(() => vi.unstubAllEnvs());

describe('isolated capability admission containment', () => {
  const record = { tenantId: 'tenant-a', projectId: 'project-a', ownerMemberId: 'owner-a' };
  const context = (subject = 'auth-a', tenantId = 'tenant-a') => ({
    auth: { getUserIdentity: async () => ({ subject }) },
    db: { query: () => ({ withIndex: () => ({ unique: async () => null }) }), get: async (id: string) => id === 'owner-a'
      ? { active: true, operatorId: 'operator-a', tenantId, projectId: 'project-a' }
      : { active: true, authId: 'auth-a', tenantId: 'tenant-a' } },
  });
  function enroll() {
    vi.stubEnv('MC_CAPABILITY_CONTROL_ENABLED', 'true');
    vi.stubEnv('MC_CAPABILITY_ENVIRONMENT', 'qualification');
    vi.stubEnv('MC_CAPABILITY_INSTALLATION_ID', 'synthetic-isolated');
  }
  it('preserves unenrolled native installations', async () => {
    vi.stubEnv('MC_CAPABILITY_CONTROL_ENABLED', 'false');
    await expect(requireCapabilityAdmission(context() as never, record as never)).resolves.toBeUndefined();
  });
  it('denies missing installation and production configuration', async () => {
    enroll(); vi.stubEnv('MC_CAPABILITY_ENVIRONMENT', 'production');
    await expect(requireCapabilityAdmission(context() as never, record as never)).rejects.toThrow('INSTALLATION_UNQUALIFIED');
  });
  it('denies another operator even with company administrative access', async () => {
    enroll();
    await expect(requireCapabilityAdmission(context('auth-b') as never, record as never)).rejects.toThrow('EXACT_OWNER');
    await expect(requireCapabilityAdmission(context('auth-a', 'tenant-b') as never, record as never)).rejects.toThrow('EXACT_OWNER');
  });
  it('fails closed for an exact owner without qualified cross-database revalidation', async () => {
    enroll();
    await expect(requireCapabilityAdmission(context() as never, record as never)).rejects.toThrow('POLICY_REVALIDATION_UNAVAILABLE');
  });
});
