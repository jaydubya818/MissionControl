/** Host-owned configuration is outside a Convex database restore. No public command clears quarantine. */
export function requireCapabilityReceiverRecovery(incarnation: string) {
  if (process.env.MC_CAPABILITY_RECEIVER_RECOVERY_STATE !== 'ACTIVE'
    || !incarnation || process.env.MC_CAPABILITY_RECEIVER_EPOCH !== incarnation)
    throw Error('CAPABILITY_RECEIVER_RECOVERY_QUARANTINED');
}
