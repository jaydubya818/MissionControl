import { afterEach, expect, it, vi } from 'vitest';
import { requireCapabilityReceiverRecovery } from '../lib/capabilityReceiverRecovery';
afterEach(() => vi.unstubAllEnvs());
it('defaults new admissions to quarantine and rejects a restored incarnation', () => {
  vi.stubEnv('MC_CAPABILITY_RECEIVER_RECOVERY_STATE', '');
  vi.stubEnv('MC_CAPABILITY_RECEIVER_EPOCH', 'current');
  expect(() => requireCapabilityReceiverRecovery('jay', 'current')).toThrow('QUARANTINED');
  vi.stubEnv('MC_CAPABILITY_RECEIVER_RECOVERY_STATE', 'ACTIVE');
  expect(() => requireCapabilityReceiverRecovery('jay', 'restored')).toThrow('QUARANTINED');
  expect(() => requireCapabilityReceiverRecovery('jay', 'current')).not.toThrow();
  vi.stubEnv('MC_CAPABILITY_RECEIVER_RECOVERY_STATE', 'QUARANTINED');
  expect(() => requireCapabilityReceiverRecovery('jay', 'current')).toThrow('QUARANTINED');
});
