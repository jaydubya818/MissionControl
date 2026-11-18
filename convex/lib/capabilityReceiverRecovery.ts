import { requireReceiverRecovery } from './capabilityReceivers';

/**
 * Host-owned configuration is outside a Convex database restore. No public command clears quarantine.
 * Per installation when `MC_CAPABILITY_RECEIVERS_JSON` is set; otherwise the legacy singleton epoch/recovery state.
 */
export function requireCapabilityReceiverRecovery(installationId: unknown, incarnation: unknown) {
  requireReceiverRecovery(installationId, incarnation);
}
