/**
 * Per-installation capability receivers. Host-owned configuration (outside a Convex database restore).
 *
 * `MC_CAPABILITY_RECEIVERS_JSON` = `{"<installationId>": {"epoch": "<incarnation>", "recoveryState": "ACTIVE" | ...}}`.
 * Each installation has its own receiver epoch and its own recovery switch, so quarantining one installation never
 * quarantines another, and no installation can present another installation's epoch.
 *
 * Legacy (variable absent): the singleton `MC_CAPABILITY_INSTALLATION_ID` / `MC_CAPABILITY_RECEIVER_EPOCH` /
 * `MC_CAPABILITY_RECEIVER_RECOVERY_STATE` keep their exact pre-map semantics (see `requireCapabilityReceiverRecovery`).
 * A malformed map configures no receiver at all (every installation is unqualified and quarantined).
 */
export type CapabilityReceiver = { epoch: string; recoveryState: string };

const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

/** null = legacy singleton mode (map variable absent). An empty object = no receiver configured (or malformed map). */
export function capabilityReceivers(raw: string | undefined = process.env.MC_CAPABILITY_RECEIVERS_JSON): Record<string, CapabilityReceiver> | null {
  if (raw === undefined || raw === '') return null;
  let all: unknown; try { all = JSON.parse(raw); } catch { return {}; }
  if (!all || typeof all !== 'object' || Array.isArray(all)) return {};
  const receivers: Record<string, CapabilityReceiver> = Object.create(null);
  for (const [installationId, value] of Object.entries(all)) {
    if (!installationId.trim() || !value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join(',') !== 'epoch,recoveryState'
      || typeof (value as any).epoch !== 'string' || !(value as any).epoch.trim() || typeof (value as any).recoveryState !== 'string') return {};
    receivers[installationId] = { epoch: (value as any).epoch, recoveryState: (value as any).recoveryState };
  }
  return receivers;
}

/** True when any capability receiver is configured for this deployment (replaces "MC_CAPABILITY_INSTALLATION_ID is set"). */
export function capabilityReceiversConfigured(): boolean {
  const receivers = capabilityReceivers();
  if (receivers === null) return !!process.env.MC_CAPABILITY_INSTALLATION_ID?.trim();
  return Object.keys(receivers).length > 0;
}

/** True when this installation has a receiver (replaces `installationId === MC_CAPABILITY_INSTALLATION_ID`). */
export function capabilityReceiverConfigured(installationId: unknown): boolean {
  const receivers = capabilityReceivers();
  if (receivers === null) return installationId === process.env.MC_CAPABILITY_INSTALLATION_ID;
  return typeof installationId === 'string' && own(receivers, installationId);
}

/** Quarantine unless this installation's receiver is ACTIVE and its epoch is exactly `incarnation`. */
export function requireReceiverRecovery(installationId: unknown, incarnation: unknown) {
  const receivers = capabilityReceivers();
  if (receivers === null) {
    // Legacy singleton: unchanged decision (one epoch, one switch; installation is gated separately).
    if (process.env.MC_CAPABILITY_RECEIVER_RECOVERY_STATE !== 'ACTIVE'
      || !incarnation || process.env.MC_CAPABILITY_RECEIVER_EPOCH !== incarnation)
      throw Error('CAPABILITY_RECEIVER_RECOVERY_QUARANTINED');
    return;
  }
  const receiver = typeof installationId === 'string' && own(receivers, installationId) ? receivers[installationId] : null;
  if (!receiver || receiver.recoveryState !== 'ACTIVE' || !incarnation || receiver.epoch !== incarnation)
    throw Error('CAPABILITY_RECEIVER_RECOVERY_QUARANTINED');
}
