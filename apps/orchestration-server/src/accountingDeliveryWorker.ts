import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { createSignedServiceCommand } from "./serviceCommandClient.js";
import { ACCOUNTING_CAPTURE_CAPACITY, AccountingDeliveryJournal, normalizeAccountingScope,
  type AccountingScope, type AccountingReference, type AccountingAcknowledgment, type AccountingDeliveryStatus } from "./accountingDeliveryJournal.js";
import type { BedrockSettlementPayload } from "./bedrockInferenceBridge.js";

export type AccountingSubmit = (payload: BedrockSettlementPayload, timeoutMs: number, signal: AbortSignal) => Promise<unknown>;
const ACTION = makeFunctionReference<"action">("serviceCommands:recordProviderUsage");
const RESPONSE_LIMIT = 65536;
class AccountingTransportAuthenticationError extends Error {
  constructor() { super("ACCOUNTING_SERVICE_AUTHENTICATION_REQUIRED"); }
}
export function accountingBackendUrl(scope: AccountingScope, allowLoopbackFixture = false) {
  const normalized = normalizeAccountingScope(scope), url = new URL(normalized.backendUrl);
  if (url.pathname !== "/" || (url.protocol !== "https:" && !(allowLoopbackFixture && url.protocol === "http:"
    && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error("ACCOUNTING_BACKEND_INVALID");
  return url.origin;
}

/** A fresh, deadline-bound signed accounting action. No execution client or route. */
export function createAccountingSubmit(scope: AccountingScope, options: { allowLoopbackFixture?: boolean;
  fetch?: typeof globalThis.fetch; auth?: () => string | undefined } = {}): AccountingSubmit {
  const backend = accountingBackendUrl(scope, options.allowLoopbackFixture);
  return async (payload, timeoutMs, signal) => {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw new Error("ACCOUNTING_DEADLINE_INVALID");
    const controller = new AbortController(), abort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    const timer = setTimeout(() => controller.abort(new Error("ACCOUNTING_DELIVERY_TIMEOUT")), timeoutMs);
    try {
      const boundedFetch: typeof globalThis.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url !== `${backend}/api/action` || init?.method !== "POST") throw new Error("ACCOUNTING_ENDPOINT_MISMATCH");
        controller.signal.throwIfAborted();
        const response = await (options.fetch ?? globalThis.fetch)(input, { ...init, redirect: "error", signal: controller.signal });
        if (response.redirected || (response.status >= 300 && response.status < 400)) throw new Error("ACCOUNTING_REDIRECT_DENIED");
        const reader = response.body?.getReader();
        const cancelReader = () => { void reader?.cancel().catch(() => undefined); };
        controller.signal.addEventListener("abort", cancelReader, { once: true });
        if (controller.signal.aborted) cancelReader();
        const chunks: Uint8Array[] = []; let bytes = 0;
        try {
          if (reader) for (;;) {
            const chunk = await reader.read();
            controller.signal.throwIfAborted();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > RESPONSE_LIMIT) throw new Error("ACCOUNTING_RESPONSE_TOO_LARGE");
            chunks.push(chunk.value);
          }
        } catch (error) { controller.abort(); await reader?.cancel().catch(() => undefined); throw error; }
        finally { controller.signal.removeEventListener("abort", cancelReader); reader?.releaseLock(); }
        if (response.status === 401 || response.status === 403) throw new AccountingTransportAuthenticationError();
        return new Response(Buffer.concat(chunks), { status: response.status, statusText: response.statusText, headers: response.headers });
      };
      const client = new ConvexHttpClient(backend, { fetch: boundedFetch, logger: false,
        auth: options.auth?.() ?? process.env.CONVEX_SERVICE_AUTH_TOKEN?.trim() });
      const signed = createSignedServiceCommand({ capability: "provider-liability.settle", projectId: scope.projectId,
        repositoryId: scope.repositoryId, payload: structuredClone(payload) });
      return await client.action(ACTION, signed);
    } finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
  };
}

export function accountingDeliveryFailure(error: unknown): { state: AccountingDeliveryStatus["state"]; code: string } {
  if (error instanceof AccountingTransportAuthenticationError) return { state: "SUSPENDED", code: "ACCOUNTING_AUTHENTICATION_REQUIRED" };
  const message = error instanceof Error ? error.message : "";
  const blocked = new Set(["USAGE_SUBJECT_MISMATCH", "USAGE_INVALID_OR_REPLAYED", "USAGE_IDENTITY_CHANGED",
    "USAGE_REVISION_CONFLICT", "PROVIDER_RECEIPT_ALREADY_OWNED", "Historical usage reservation scope mismatch",
    "Historical usage price identity mismatch", "Usage Attempt mismatch"]);
  if (error instanceof ConvexError && error.data && typeof error.data === "object" && !Array.isArray(error.data)) {
    const data = error.data as Record<string, unknown>;
    if (Object.keys(data).sort().join(",") === "code,reason" && typeof data.reason === "string") {
      if (data.code === "ACCOUNTING_HISTORICAL_CONFLICT" && blocked.has(data.reason)) return { state: "BLOCKED_REVIEW", code: data.code };
      if (data.code === "ACCOUNTING_AUTHENTICATION_REQUIRED" && ["SERVICE_SIGNATURE_INVALID", "SERVICE_SECRET_UNCONFIGURED"].includes(data.reason)) return { state: "SUSPENDED", code: data.code };
      if (data.code === "ACCOUNTING_SCOPE_REJECTED" && data.reason === "SERVICE_SCOPE_MISMATCH") return { state: "SUSPENDED", code: data.code };
    }
  }
  if (message === "MISSION_CONTROL_SERVICE_COMMAND_SECRET is required for service commands.") return { state: "SUSPENDED", code: "ACCOUNTING_AUTHENTICATION_REQUIRED" };
  return { state: "PENDING", code: "ACCOUNTING_DELIVERY_UNCONFIRMED" };
}
export function validateAccountingAcknowledgment(value: unknown): AccountingAcknowledgment {
  if (!value || typeof value !== "object" || typeof (value as any).duplicate !== "boolean"
    || typeof (value as any).incident !== "boolean") throw new Error("ACCOUNTING_ACK_INVALID");
  return { duplicate: (value as any).duplicate, incident: (value as any).incident };
}

export class AccountingDeliveryWorker {
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopped = false;
  private cursor = 0;
  private readonly controllers = new Set<AbortController>();
  private readonly deliveries = new Set<Promise<AccountingAcknowledgment>>();
  private readonly sampled = new Map<string, string>();
  private lastPassAt: number | null = null;
  private lastError: string | null = null;
  constructor(readonly journal: AccountingDeliveryJournal, private readonly submit: AccountingSubmit, private readonly now = Date.now) {}

  start() {
    if (this.timer || this.stopped) return;
    this.timer = setInterval(() => { void this.pass(); }, 30000);
    void this.pass();
  }
  async stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    for (const controller of this.controllers) controller.abort();
    await Promise.allSettled([...(this.running ? [this.running] : []), ...this.deliveries]);
  }
  status() {
    const states = [...this.sampled.values()];
    return { enabled: true, lastPassAt: this.lastPassAt, lastError: this.lastError,
      countsComplete: this.sampled.size === ACCOUNTING_CAPTURE_CAPACITY,
      inspectedSlots: this.sampled.size, capacity: ACCOUNTING_CAPTURE_CAPACITY,
      occupied: states.filter((s) => s !== "EMPTY").length,
      pending: states.filter((s) => s === "PENDING" || s === "SUSPENDED").length,
      blocked: states.filter((s) => s === "BLOCKED_REVIEW").length,
      incomplete: states.filter((s) => s === "INCOMPLETE").length,
      acknowledged: states.filter((s) => s === "ACKNOWLEDGED").length };
  }

  deliver(reference: AccountingReference, timeoutMs = 10000): Promise<AccountingAcknowledgment> {
    const delivery = this.deliverObservation(reference, timeoutMs);
    this.deliveries.add(delivery);
    void delivery.finally(() => this.deliveries.delete(delivery)).catch(() => undefined);
    return delivery;
  }
  private async deliverObservation(reference: AccountingReference, timeoutMs: number): Promise<AccountingAcknowledgment> {
    if (this.stopped) throw new Error("ACCOUNTING_DELIVERY_STOPPED");
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw new Error("ACCOUNTING_DEADLINE_INVALID");
    const deadline = this.now() + timeoutMs;
    const current = await this.journal.boundObservation(reference);
    if (this.stopped) throw new Error("ACCOUNTING_DELIVERY_STOPPED");
    const remaining = deadline - this.now();
    if (remaining < 1) throw new Error("ACCOUNTING_DELIVERY_TIMEOUT");
    // A prior async acknowledgment never changes synchronous execution success.
    if (current.state === "ACKNOWLEDGED") return { duplicate: true, incident: current.acknowledgment!.incident };
    if (current.state === "BLOCKED_REVIEW") throw new Error("ACCOUNTING_REVIEW_REQUIRED");
    const controller = new AbortController(); this.controllers.add(controller);
    try {
      const result = validateAccountingAcknowledgment(await this.submit(structuredClone(current.observation.payload), remaining, controller.signal));
      await this.journal.acknowledge(reference, result);
      this.sampled.set(reference.slot, "ACKNOWLEDGED");
      return result;
    } catch (error) {
      const failure = accountingDeliveryFailure(error);
      this.lastError = failure.code;
      await this.journal.recordFailure(reference, failure.state, failure.code).catch(() => { this.lastError = "ACCOUNTING_STATUS_WRITE_FAILED"; });
      throw error;
    } finally { this.controllers.delete(controller); }
  }

  pass(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.running) return this.running;
    const task = this.runPass().catch(() => { this.lastError = "ACCOUNTING_JOURNAL_UNAVAILABLE"; });
    this.running = task.finally(() => { this.running = undefined; });
    return this.running;
  }
  private async runPass() {
    this.lastPassAt = this.now(); const deadline = this.lastPassAt + 30000; let sent = 0;
    for (let inspected = 0; inspected < 128 && !this.stopped && this.now() < deadline; inspected++) {
      const slot = String(this.cursor).padStart(4, "0"); this.cursor = (this.cursor + 1) % ACCOUNTING_CAPTURE_CAPACITY;
      try {
        const current = await this.journal.inspect(slot); this.sampled.set(slot, current.state);
        if ((current.state === "PENDING" || current.state === "SUSPENDED") && sent < 8
          && (!current.delivery || current.delivery.nextAttemptAt <= this.now())) {
          const remaining = Math.min(10000, deadline - this.now()); if (remaining < 1) break;
          sent++;
          await this.deliver(current.reference, remaining).catch(() => undefined);
        }
      } catch { this.sampled.set(slot, "BLOCKED_REVIEW"); this.lastError = "ACCOUNTING_JOURNAL_INTEGRITY_EXCEPTION"; }
    }
  }
}

export function bridgeAccountingDelivery(journal: AccountingDeliveryJournal, worker: AccountingDeliveryWorker) {
  return { scope: journal.scope, prepare: journal.prepare.bind(journal), capture: journal.capture.bind(journal), deliver: worker.deliver.bind(worker) };
}
