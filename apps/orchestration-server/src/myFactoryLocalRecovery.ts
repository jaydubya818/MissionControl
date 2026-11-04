import { canonicalDigest, parseFactoryDelegationBinding, type EngineeringTariff } from "@mission-control/shared";
import { callFixtureTransport, type FixtureKey, type TrialObservation } from "./myFactoryCompatibilityAdapter.js";
import { verifyLocalDelegationResult, verifyLocalTerminalResult, verifyLocalCustodyObservation } from "./myFactoryLocalCompatibility.js";

type Trial = { binding: unknown; state: string; observationRevision: number; closed: boolean; cancelRequested: boolean;
  partnerRunId?: string; partnerWorkOrderId?: string };
type RecoveryStore = {
  read(): Promise<Trial>;
  observe(observation: TrialObservation): Promise<void>;
  authority(): Promise<unknown>;
  ingest(projection: ReturnType<typeof verifyLocalDelegationResult> & { custodyObservation: unknown; authenticatedResponse: unknown }): Promise<unknown>;
  settle(projection: Omit<ReturnType<typeof verifyLocalTerminalResult>, "manifest">): Promise<unknown>;
};

export class MyFactoryLocalRecovery {
  constructor(private readonly options: {
    store: RecoveryStore; endpoint: string; requestKey: FixtureKey; responseKey: FixtureKey;
    verifier: Parameters<typeof verifyLocalTerminalResult>[2]; keys: unknown[];
    tariff?: EngineeringTariff; admittedAt: number; now?: () => number;
  }) {}

  async reconcileOnce(): Promise<"CLOSED" | "OBSERVED" | "UNKNOWN" | "NOT_DISPATCHED"> {
    try {
      const now = this.options.now ?? Date.now, store = this.options.store;
      const trial = await store.read(), binding = parseFactoryDelegationBinding(trial.binding);
      if (trial.closed) return "CLOSED";
      if (trial.state === "RESERVED") return "NOT_DISPATCHED";
      const call = async (operation: "STATUS" | "RESULT" | "CANCEL") => callFixtureTransport({ ...this.options, now }, operation,
        binding, { requestId: binding.partnerRequestId });
      if (trial.cancelRequested || binding.expiresAt <= now()) await call("CANCEL");
      const { payload } = await call("STATUS"), status = payload as any;
      if (!status || status.requestId !== binding.partnerRequestId || !status.runId || !status.workOrderId
        || (trial.partnerRunId && (trial.partnerRunId !== status.runId || trial.partnerWorkOrderId !== status.workOrderId))) return "UNKNOWN";
      const terminal = ["COMPLETED", "FAILED", "CANCELLED"].includes(status.state);
      const state = ["PREPARED", "RUNNING", "STOPPING", "COMPLETED", "FAILED", "CANCELLED", "UNKNOWN"].includes(status.state) ? status.state : "UNKNOWN";
      if (trial.state !== state || !trial.partnerRunId) await store.observe({ revision: trial.observationRevision + 1, state,
        partnerWorkOrderId: status.workOrderId, partnerRunId: status.runId,
        receiptDigest: canonicalDigest("enterprise-recovery-status/v1", { requestId: status.requestId, runId: status.runId, workOrderId: status.workOrderId, state }) });
      if (!terminal) return state === "UNKNOWN" ? "UNKNOWN" : "OBSERVED";
      const response = await call("RESULT"), result = response.payload as any;
      const expected = { workOrderId: status.workOrderId, runId: status.runId, keys: this.options.keys, now: now(),
        tariff: this.options.tariff, admittedAt: this.options.admittedAt };
      const verified = verifyLocalTerminalResult(result?.result, binding, this.options.verifier, expected);
      if (verified.state !== status.state || result.state !== verified.state) return "UNKNOWN";
      let authority = false;
      if ((verified.state === "COMPLETED" || verified.manifest.verification?.outcome === "FAIL") && !trial.cancelRequested && binding.expiresAt > now()) {
        try { await store.authority(); authority = true; } catch (error) {
          if (!String(error).includes("COMPATIBILITY_UNAVAILABLE")) throw error;
        }
      }
      if (authority) {
        const projection = verifyLocalDelegationResult(result.result, binding, this.options.verifier, expected);
        const custodyObservation = verifyLocalCustodyObservation(result.observation, projection, binding, now());
        await store.ingest({ ...projection, custodyObservation, authenticatedResponse: response.authenticatedResponse });
      } else {
        const { manifest: _manifest, ...settlement } = verified;
        await store.settle(settlement);
      }
      return "CLOSED";
    } catch { return "UNKNOWN"; }
  }

  async run(options: { signal: AbortSignal; intervalMs?: number; onObservation?: (status: string) => void }) {
    const intervalMs = options.intervalMs ?? 1000;
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 50 || intervalMs > 60000) throw Error("RECOVERY_INTERVAL_INVALID");
    while (!options.signal.aborted) {
      const status = await this.reconcileOnce(); options.onObservation?.(status);
      if (status === "CLOSED" || status === "NOT_DISPATCHED") return status;
      await new Promise<void>(resolve => {
        const done = () => { clearTimeout(timer); options.signal.removeEventListener("abort", done); resolve(); };
        const timer = setTimeout(done, intervalMs);
        options.signal.addEventListener("abort", done, { once: true });
      });
    }
    return "STOPPED";
  }
}
