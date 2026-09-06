import type { BedrockAccountingDelivery } from "./bedrockInferenceBridge.js";
import { AccountingDeliveryJournal } from "./accountingDeliveryJournal.js";
import { AccountingDeliveryWorker, bridgeAccountingDelivery, createAccountingSubmit, type AccountingSubmit } from "./accountingDeliveryWorker.js";

/** Optional execution failures must not prevent independent accounting startup. */
export function optionalExecutionConfiguration<T>(code: string, load: () => T, errors: string[]): T | undefined {
  try { return load(); } catch { errors.push(code); return undefined; }
}

/** Explicit host configuration; never reads execution flags, grants or worker state. */
export function createAccountingDeliveryRuntime(options: {
  env?: NodeJS.ProcessEnv; excludedDirectories?: string[];
  /** Explicit dependency injection for isolated fixtures; never environment defaults. */
  allowTemporaryFixture?: boolean; allowLoopbackFixture?: boolean; submit?: AccountingSubmit;
} = {}) {
  const env = options.env ?? process.env;
  const directory = env.MISSION_CONTROL_ACCOUNTING_JOURNAL_DIR?.trim();
  const scope = { backendUrl: env.CONVEX_URL ?? "", projectId: env.CODEX_WORKER_PROJECT_ID?.trim() ?? "",
    repositoryId: env.CODEX_WORKER_REPOSITORY_ID?.trim() ?? "" };
  let worker: AccountingDeliveryWorker | undefined;
  let error: string | null = null;
  let stopped = false;
  const ready = directory ? Promise.resolve().then(async () => {
    const submit = options.submit ?? createAccountingSubmit(scope, { allowLoopbackFixture: options.allowLoopbackFixture });
    const journal = await AccountingDeliveryJournal.open({ directory, scope, excludedDirectories: options.excludedDirectories,
      allowTemporaryFixture: options.allowTemporaryFixture });
    worker = new AccountingDeliveryWorker(journal, submit);
    return worker;
  }).catch(() => { error = "ACCOUNTING_CONFIGURATION_OR_STORAGE_INVALID"; return undefined; }) : Promise.resolve(undefined);
  const requireDelivery = async () => {
    const loaded = await ready;
    if (!loaded || stopped) throw new Error("ACCOUNTING_JOURNAL_REQUIRED");
    return bridgeAccountingDelivery(loaded.journal, loaded);
  };
  const delivery: BedrockAccountingDelivery | undefined = directory ? {
    scope,
    prepare: async (input) => (await requireDelivery()).prepare(input),
    capture: async (ticket, payload) => (await requireDelivery()).capture(ticket, payload),
    deliver: async (reference) => (await requireDelivery()).deliver(reference),
  } : undefined;
  return {
    ready, delivery,
    start() { void ready.then((loaded) => { if (!stopped) loaded?.start(); }); },
    async stop() { stopped = true; await (await ready)?.stop(); },
    status() { return worker?.status() ?? { enabled: Boolean(directory), initializing: Boolean(directory) && !error, lastError: error }; },
  };
}
