export interface FabCostEvent {
  _id: string;
  workflowRunId: string;
  actor?: string;
  commandSummary?: string;
  metadata?: {
    executionManifestDigest?: string;
    harnessAdapter?: string;
    harnessAdapterVersion?: string;
    fabSessionId?: string;
    modelCall?: number;
    usage?: { costUsd?: number | null };
  };
}

export function fabObservedCost(
  run: { _id: string; executionManifestDigest?: string },
  events: FabCostEvent[],
) {
  const calls = new Map<string, { usd: number; eventId: string }>();
  for (const event of events) {
    const metadata = event.metadata;
    if (event.workflowRunId !== run._id || !event.actor?.startsWith("service:")
      || event.commandSummary !== "model_completed"
      || !run.executionManifestDigest || metadata?.executionManifestDigest !== run.executionManifestDigest
      || metadata.harnessAdapter !== "fab" || metadata.harnessAdapterVersion !== "v1") continue;
    const usd = metadata.usage?.costUsd;
    if (!metadata.fabSessionId || !Number.isSafeInteger(metadata.modelCall) || metadata.modelCall! < 1
      || typeof usd !== "number" || !Number.isFinite(usd) || usd < 0) continue;
    const key = `${metadata.fabSessionId}:${metadata.modelCall}`;
    const existing = calls.get(key);
    if (existing && existing.usd !== usd) throw new Error("Conflicting Fab model-call cost evidence.");
    if (!existing) calls.set(key, { usd, eventId: event._id });
  }
  return {
    observedUsd: [...calls.values()].reduce((sum, call) => sum + call.usd, 0),
    eventIds: [...calls.values()].map((call) => call.eventId),
  };
}
