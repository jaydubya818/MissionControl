import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, mkdir, symlink, readdir, chmod, unlink } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import path from "node:path";
import os from "node:os";
import { AccountingDeliveryJournal } from "../accountingDeliveryJournal.js";
import { AccountingDeliveryWorker } from "../accountingDeliveryWorker.js";

const roots: string[] = [];
const scope = { backendUrl: "https://fixture.convex.cloud", projectId: "project", repositoryId: "repo" };
const digest = `sha256:${"a".repeat(64)}`;
const subject = { reservationId: "reservation", workflowRunId: "attempt", leaseId: "lease", generation: 1 };
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function fixture(onBoundary?: Parameters<typeof AccountingDeliveryJournal.open>[0]["onBoundary"]) {
  const parent = await mkdtemp(path.join(os.tmpdir(), "accounting-review-")); roots.push(parent);
  const directory = path.join(parent, "journal");
  const journal = await AccountingDeliveryJournal.open({ directory, scope, allowTemporaryFixture: true, onBoundary });
  const ticket = await journal.prepare({ subject, requestId: "request", requestDigest: digest, evidenceClass: "OFFLINE_FIXTURE" });
  const reference = await journal.capture(ticket, { ...subject, usage: { requestId: "request", requestDigest: digest,
    provider: "provider", model: "model", providerRequestId: "provider-request", usageId: "usage", inputTokens: 1, outputTokens: 1,
    classification: "ACTUAL", expectedReceiptRevision: 0 } });
  return { directory, journal, reference };
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done; }); return { promise, resolve }; }

it("stops a delivery waiting on its journal read before a request can start", async () => {
  const f = await fixture(), entered = deferred(), release = deferred();
  const read = f.journal.boundObservation.bind(f.journal);
  vi.spyOn(f.journal, "boundObservation").mockImplementation(async (ref) => { entered.resolve(); await release.promise; return read(ref); });
  const submit = vi.fn(async () => ({ duplicate: false, incident: false }));
  const worker = new AccountingDeliveryWorker(f.journal, submit);
  const delivery = worker.deliver(f.reference).catch(() => undefined); await entered.promise;
  let stopped = false; const stopping = worker.stop().then(() => { stopped = true; });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const returnedBeforeRead = stopped; release.resolve(); await Promise.all([delivery, stopping]);
  expect(submit).not.toHaveBeenCalled(); expect(returnedBeforeRead).toBe(false);
});

it("waits for a direct bridge delivery to settle after abort before stop returns", async () => {
  const f = await fixture(), entered = deferred(), aborted = deferred(), release = deferred();
  const worker = new AccountingDeliveryWorker(f.journal, async (_payload, _timeout, signal) => {
    entered.resolve(); signal.addEventListener("abort", () => aborted.resolve(), { once: true });
    await release.promise; throw new Error("aborted");
  });
  const delivery = worker.deliver(f.reference).catch(() => undefined); await entered.promise;
  let stopped = false; const stopping = worker.stop().then(() => { stopped = true; }); await aborted.promise;
  await new Promise((resolve) => setTimeout(resolve, 5));
  const returnedBeforeSettlement = stopped; release.resolve(); await Promise.all([delivery, stopping]);
  expect(returnedBeforeSettlement).toBe(false);
});

it("validates an untrusted original ancestor before resolving its symlink", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "accounting-ancestor-")); roots.push(root);
  const trusted = path.join(root, "trusted"), untrusted = path.join(root, "untrusted");
  await mkdir(trusted, { mode: 0o700 }); await mkdir(untrusted, { mode: 0o700 }); await chmod(untrusted, 0o777);
  await symlink(trusted, path.join(untrusted, "redirect"));
  await expect(AccountingDeliveryJournal.open({ directory: path.join(untrusted, "redirect", "journal"), scope, allowTemporaryFixture: true })).rejects.toThrow("DIRECTORY_UNSAFE");
});

it("bounds retained temporary files across repeated failed writes by the same writer", async () => {
  const f = await fixture(async (point, file) => { if (point === "FILE_SYNC" && file.endsWith("delivery.json")) throw new Error("disk failure"); });
  for (let n = 0; n < 8; n++) await f.journal.recordFailure(f.reference, "PENDING", "ACCOUNTING_DELIVERY_UNCONFIRMED").catch(() => undefined);
  const files = (await readdir(path.join(f.directory, "entries/0000"))).filter((name) => name.startsWith(".delivery.json."));
  expect(files).toHaveLength(1);
});

it("keeps temporary capacity bounded across repeated process-writer replacements", async () => {
  const f = await fixture();
  for (let n = 0; n < 8; n++) {
    const restarted = await AccountingDeliveryJournal.open({ directory: f.directory, scope, allowTemporaryFixture: true,
      onBoundary: async (point, file) => { if (point === "FILE_SYNC" && file.endsWith("delivery.json")) throw new Error("disk failure"); } });
    await restarted.recordFailure(f.reference, "PENDING", "ACCOUNTING_DELIVERY_UNCONFIRMED").catch(() => undefined);
  }
  const files = (await readdir(path.join(f.directory, "entries/0000"))).filter((name) => name.startsWith(".delivery.json."));
  expect(files).toHaveLength(4);
});

it.skipIf(process.platform === "win32")("rejects a FIFO observation without blocking its reader process", async () => {
  const f = await fixture(), file = path.join(f.directory, "entries/0000/observation.json");
  await unlink(file); await promisify(execFile)("mkfifo", ["-m", "600", file]);
  const moduleUrl = pathToFileURL(path.resolve("src/accountingDeliveryJournal.ts")).href;
  const source = `import { AccountingDeliveryJournal } from ${JSON.stringify(moduleUrl)};
    const journal = await AccountingDeliveryJournal.open(${JSON.stringify({ directory: f.directory, scope, allowTemporaryFixture: true })});
    try { await journal.inspect('0000'); process.exit(2); } catch (error) { process.stdout.write(error.message); }`;
  const result = await promisify(execFile)(process.execPath, ["--import", "tsx", "--input-type=module", "-e", source], { timeout: 3000, killSignal: "SIGKILL" });
  expect(result.stdout).toContain("ACCOUNTING_FILE_INVALID");
}, 10000);
