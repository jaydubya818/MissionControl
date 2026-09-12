import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile, mkdir, symlink, chmod, readdir, rename } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { AccountingDeliveryJournal, ACCOUNTING_CAPTURE_CAPACITY, type AccountingReference } from "../accountingDeliveryJournal.js";
import { AccountingDeliveryWorker, accountingBackendUrl, createAccountingSubmit, bridgeAccountingDelivery, accountingDeliveryFailure } from "../accountingDeliveryWorker.js";
import { BedrockInferenceBridge } from "../bedrockInferenceBridge.js";
import { bridgeFixture, sha } from "./fixtures/bedrockBridgeFixture.js";
import { ConvexError } from "convex/values";

const scope = { backendUrl: "https://fixture.convex.cloud", projectId: "project", repositoryId: "repo" };
const subject = { reservationId: "reservation", workflowRunId: "attempt", leaseId: "lease", generation: 1 };
const usage = { requestId: "request", requestDigest: sha("a"), provider: "aws-bedrock", model: "model",
  providerRequestId: "provider-request", usageId: "usage", inputTokens: 10, outputTokens: 5, classification: "ACTUAL" as const, expectedReceiptRevision: 0 };
const payload = { ...subject, usage };
const roots: string[] = [];
async function fixture(options: Partial<Parameters<typeof AccountingDeliveryJournal.open>[0]> = {}) {
  const parent = await mkdtemp(path.join(os.tmpdir(), "accounting-delivery-")); roots.push(parent);
  const directory = path.join(parent, "journal");
  const config = { directory, scope, allowTemporaryFixture: true, ...options };
  return { config, directory, journal: await AccountingDeliveryJournal.open(config) };
}
async function capture(journal: AccountingDeliveryJournal, id = "request") {
  const ticket = await journal.prepare({ subject, requestId: id, requestDigest: usage.requestDigest, evidenceClass: "OFFLINE_FIXTURE" });
  return await journal.capture(ticket, { ...payload, usage: { ...usage, requestId: id } });
}
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("durable accounting journal", () => {
  it("opens the same pinned scope after restart and delivers immutable original usage", async () => {
    const f = await fixture(), reference = await capture(f.journal);
    const before = await readFile(path.join(f.directory, "entries/0000/observation.json"));
    const reopened = await AccountingDeliveryJournal.open(f.config), submit = vi.fn(async () => ({ duplicate: false, incident: false }));
    const worker = new AccountingDeliveryWorker(reopened, submit);
    await worker.pass();
    expect(submit).toHaveBeenCalledExactlyOnceWith(payload, expect.any(Number), expect.any(AbortSignal));
    expect((await reopened.inspect(reference.slot)).state).toBe("ACKNOWLEDGED");
    expect(await readFile(path.join(f.directory, "entries/0000/observation.json"))).toEqual(before);
    await worker.pass(); expect(submit).toHaveBeenCalledTimes(1);
  });
  it.each([{ duplicate: false, incident: false }, { duplicate: true, incident: false },
    { duplicate: false, incident: true }, { duplicate: true, incident: true }])("acknowledges exact accounting result %j", async (result) => {
    const f = await fixture(), reference = await capture(f.journal), worker = new AccountingDeliveryWorker(f.journal, async () => result);
    expect(await worker.deliver(reference)).toEqual(result);
    expect((await f.journal.inspect(reference.slot)).state).toBe("ACKNOWLEDGED");
  });
  it.each([null, {}, { incident: false }, { duplicate: "false", incident: false }])("retains malformed acknowledgment %j as pending", async (response) => {
    const f = await fixture(), reference = await capture(f.journal), worker = new AccountingDeliveryWorker(f.journal, async () => response);
    await expect(worker.deliver(reference)).rejects.toThrow("ACK_INVALID");
    expect((await f.journal.inspect(reference.slot)).state).toBe("PENDING");
  });
  it("preserves a concurrent acknowledgment despite a late failed drainer", async () => {
    const f = await fixture(), reference = await capture(f.journal);
    let fail!: () => void, started!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const bad = new AccountingDeliveryWorker(f.journal, async () => { started(); await new Promise<void>((resolve) => { fail = resolve; }); throw new Error("lost reply"); });
    const pending = bad.deliver(reference).catch(() => undefined); await entered;
    const good = new AccountingDeliveryWorker(await AccountingDeliveryJournal.open(f.config), async () => ({ duplicate: true, incident: true }));
    await good.deliver(reference); fail(); await pending;
    expect((await f.journal.inspect(reference.slot)).state).toBe("ACKNOWLEDGED");
  });
  it("retains a revision conflict for review without changing its original revision", async () => {
    const f = await fixture(), reference = await capture(f.journal), submit = vi.fn(async () => { throw new ConvexError({ code: "ACCOUNTING_HISTORICAL_CONFLICT", reason: "USAGE_REVISION_CONFLICT" }); });
    const worker = new AccountingDeliveryWorker(f.journal, submit);
    await expect(worker.deliver(reference)).rejects.toThrow("REVISION_CONFLICT");
    expect(await f.journal.inspect(reference.slot)).toMatchObject({ state: "BLOCKED_REVIEW", observation: { payload: { usage: { expectedReceiptRevision: 0 } } } });
    await worker.pass(); expect(submit).toHaveBeenCalledTimes(1);
  });
  it("retains incomplete capture markers without submitting zero usage", async () => {
    const f = await fixture(), submit = vi.fn();
    await f.journal.prepare({ subject, requestId: "request", requestDigest: usage.requestDigest, evidenceClass: "OFFLINE_FIXTURE" });
    const worker = new AccountingDeliveryWorker(f.journal, submit); await worker.pass();
    expect(submit).not.toHaveBeenCalled(); expect(worker.status().incomplete).toBe(1);
  });
  it("blocks new storage at 4096 permanent slots while a pending entry still delivers", async () => {
    const f = await fixture(), reference = await capture(f.journal);
    for (let n = 1; n < ACCOUNTING_CAPTURE_CAPACITY; n++) await mkdir(path.join(f.directory, "entries", String(n).padStart(4, "0")), { mode: 0o700 });
    await expect(capture(f.journal, "another")).rejects.toThrow("CAPACITY_EXHAUSTED");
    await new AccountingDeliveryWorker(f.journal, async () => ({ duplicate: false, incident: false })).pass();
    expect((await f.journal.inspect(reference.slot)).state).toBe("ACKNOWLEDGED");
    expect((await readdir(path.join(f.directory, "entries"))).length).toBe(4096);
  });
  it("bounds passes to 128 slots and eight submissions, and rotates fairly", async () => {
    const f = await fixture(); for (let n = 0; n < 10; n++) await capture(f.journal, `request-${n}`);
    const submit = vi.fn(async () => ({ duplicate: false, incident: false })), worker = new AccountingDeliveryWorker(f.journal, submit);
    await worker.pass(); expect(submit).toHaveBeenCalledTimes(8); expect(worker.status().inspectedSlots).toBe(128);
    for (let n = 0; n < 32; n++) await worker.pass();
    expect(submit).toHaveBeenCalledTimes(10); expect(worker.status().countsComplete).toBe(true);
  });
  it("does not overlap passes or submit after stopping", async () => {
    const f = await fixture(); await capture(f.journal);
    let started!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const submit = vi.fn(async (_p, _t, signal: AbortSignal) => { started(); await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true })); throw new Error("aborted"); });
    const worker = new AccountingDeliveryWorker(f.journal, submit), first = worker.pass();
    expect(worker.pass()).toBe(first); await entered; await worker.stop(); await first;
    await worker.pass(); expect(submit).toHaveBeenCalledTimes(1);
  });
  it.each(["scope", "digest", "extra", "unsafe", "symlink", "mode", "ack"])('rejects %s substitution before any submission', async (kind) => {
    const f = await fixture(), reference = await capture(f.journal), file = path.join(f.directory, "entries/0000/observation.json");
    if (kind === "scope") await expect(AccountingDeliveryJournal.open({ ...f.config, scope: { ...scope, projectId: "other" } })).rejects.toThrow("SCOPE_MISMATCH");
    else {
      const data = JSON.parse(await readFile(file, "utf8"));
      if (kind === "digest") data.payload.usage.inputTokens++;
      if (kind === "extra") data.payload.secret = "never send";
      if (kind === "unsafe") data.payload.usage.inputTokens = Number.MAX_SAFE_INTEGER + 1;
      if (["digest", "extra", "unsafe"].includes(kind)) await writeFile(file, JSON.stringify(data));
      if (kind === "symlink") { await rename(file, file + ".original"); await symlink(file + ".original", file); }
      if (kind === "mode") await chmod(file, 0o644);
      if (kind === "ack") await writeFile(path.join(f.directory, "entries/0000/ack.json"), JSON.stringify({ digest: reference.observationDigest }), { mode: 0o600 });
      const submit = vi.fn(), worker = new AccountingDeliveryWorker(f.journal, submit); await worker.pass();
      expect(submit).not.toHaveBeenCalled(); expect(worker.status().blocked).toBe(1);
    }
  });
  it("never silently chooses temporary storage in runtime configuration", async () => {
    const f = await fixture();
    await expect(AccountingDeliveryJournal.open({ directory: f.directory, scope })).rejects.toThrow("DIRECTORY_UNSAFE");
    await expect(AccountingDeliveryJournal.open({ directory: "", scope })).rejects.toThrow("DIRECTORY_REQUIRED");
  });
  it("recovers a complete fsynced temporary observation after interrupted publication", async () => {
    let injected = false;
    const f = await fixture({ onBoundary: async (point, file) => { if (!injected && point === "FILE_SYNC" && file.endsWith("observation.json")) { injected = true; throw new Error("crash after fsync"); } } });
    await expect(capture(f.journal)).rejects.toThrow("crash after fsync");
    const reopened = await AccountingDeliveryJournal.open({ ...f.config, onBoundary: undefined });
    expect(await reopened.inspect("0000")).toMatchObject({ state: "PENDING", observation: { payload } });
    await new AccountingDeliveryWorker(reopened, async () => ({ incident: false, duplicate: false })).pass();
    expect((await reopened.inspect("0000")).state).toBe("ACKNOWLEDGED");
  });
  it("does not advertise acknowledgment when directory durability cannot be established", async () => {
    let fail = false;
    const f = await fixture({ onBoundary: async (point, file) => { if (fail && point === "DIRECTORY_SYNC" && file.endsWith("0000")) throw new Error("directory sync failed"); } });
    const reference = await capture(f.journal); fail = true;
    await expect(f.journal.acknowledge(reference, { duplicate: false, incident: false })).rejects.toThrow("directory sync failed");
    await expect(f.journal.inspect("0000")).rejects.toThrow("directory sync failed");
  });
});

describe("settlement-only signed HTTP", () => {
  it.each([
    [{ code: "ACCOUNTING_HISTORICAL_CONFLICT", reason: "USAGE_REVISION_CONFLICT" }, "BLOCKED_REVIEW"],
    [{ code: "ACCOUNTING_AUTHENTICATION_REQUIRED", reason: "SERVICE_SIGNATURE_INVALID" }, "SUSPENDED"],
    [{ code: "ACCOUNTING_AUTHENTICATION_REQUIRED", reason: "SERVICE_SECRET_UNCONFIGURED" }, "SUSPENDED"],
    [{ code: "ACCOUNTING_SCOPE_REJECTED", reason: "SERVICE_SCOPE_MISMATCH" }, "SUSPENDED"],
  ])("classifies only the exact typed settlement reason %j", (data, state) => {
    expect(accountingDeliveryFailure(new ConvexError(data))).toEqual({ state, code: data.code });
  });
  it.each([
    new Error("USAGE_REVISION_CONFLICT"),
    new Error("Service command denied (signature-invalid)."),
    new Error("Service command denied (command-expired)."),
    new ConvexError({ code: "ACCOUNTING_HISTORICAL_CONFLICT", reason: "UNFAMILIAR" }),
    new ConvexError({ code: "ACCOUNTING_HISTORICAL_CONFLICT", reason: "USAGE_REVISION_CONFLICT", detail: "private" }),
    new ConvexError({ code: "ACCOUNTING_AUTHENTICATION_REQUIRED", reason: "SERVICE_SCOPE_MISMATCH" }),
    new ConvexError({ code: "ACCOUNTING_SCOPE_REJECTED", reason: "USAGE_REVISION_CONFLICT" }),
    new ConvexError("USAGE_REVISION_CONFLICT"),
  ])("retains untyped or unfamiliar errors as pending: %s", (error) => {
    expect(accountingDeliveryFailure(error)).toEqual({ state: "PENDING", code: "ACCOUNTING_DELIVERY_UNCONFIRMED" });
  });
  it.each([401, 403])("suspends fixed-backend HTTP %i authentication failures without exposing body content", async (status) => {
    vi.stubEnv("MISSION_CONTROL_SERVICE_COMMAND_SECRET", "ephemeral-test-secret");
    const submit = createAccountingSubmit(scope, { fetch: async () => new Response("private authentication details", { status }) });
    const error = await submit(payload, 10000, new AbortController().signal).catch((failure: unknown) => failure);
    expect(accountingDeliveryFailure(error)).toEqual({ state: "SUSPENDED", code: "ACCOUNTING_AUTHENTICATION_REQUIRED" });
    expect(String(error)).not.toContain("private authentication details");
  });
  it.each(["http://remote.example", "https://fixture.convex.cloud/path", "https://user:password@fixture.convex.cloud", "https://fixture.convex.cloud/?query=x"])('rejects relocated or unsafe endpoint %s', (backendUrl) => {
    expect(() => accountingBackendUrl({ ...scope, backendUrl })).toThrow();
  });
  it("allows HTTP only through explicit loopback fixture injection", () => {
    expect(() => accountingBackendUrl({ ...scope, backendUrl: "http://127.0.0.1:3210" })).toThrow();
    expect(accountingBackendUrl({ ...scope, backendUrl: "http://127.0.0.1:3210" }, true)).toBe("http://127.0.0.1:3210");
  });
  it("uses fresh command IDs and byte-identical payloads with a fixed endpoint and no provider grant", async () => {
    vi.stubEnv("MISSION_CONTROL_SERVICE_COMMAND_SECRET", "ephemeral-test-secret");
    const fetch = vi.fn(async (_url: any, _init: any) => new Response(JSON.stringify({ status: "success", value: { duplicate: true, incident: false }, logLines: ["untrusted log"] })));
    const log = vi.spyOn(console, "log");
    const submit = createAccountingSubmit(scope, { fetch });
    for (let n = 0; n < 2; n++) await submit(payload, 10000, new AbortController().signal);
    const bodies = fetch.mock.calls.map(([url, init]) => {
      expect(url).toBe(`${scope.backendUrl}/api/action`); expect(init).toMatchObject({ method: "POST", redirect: "error" });
      return JSON.parse(init.body).args[0];
    });
    expect(bodies[0].payloadJson).toBe(bodies[1].payloadJson);
    expect(JSON.parse(bodies[0].payloadJson)).toEqual(payload);
    expect(bodies[0].envelope.commandId).not.toBe(bodies[1].envelope.commandId);
    expect(bodies[0].envelope.capability).toBe("provider-liability.settle");
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining("untrusted log")); log.mockRestore();
  });
  it.each(["redirect", "oversize", "malformed"])('retains %s responses as unconfirmed', async (kind) => {
    vi.stubEnv("MISSION_CONTROL_SERVICE_COMMAND_SECRET", "ephemeral-test-secret");
    const fetch = vi.fn(async () => kind === "redirect" ? new Response(null, { status: 307 }) : new Response(kind === "oversize" ? "x".repeat(65537) : "invalid"));
    const submit = createAccountingSubmit(scope, { fetch });
    await expect(submit(payload, 10000, new AbortController().signal)).rejects.toThrow();
  });
  it("keeps timeout active while response body is stalled", async () => {
    vi.stubEnv("MISSION_CONTROL_SERVICE_COMMAND_SECRET", "ephemeral-test-secret");
    let cancelled = false;
    const fetch = vi.fn(async () => new Response(new ReadableStream({ cancel() { cancelled = true; } })));
    await expect(createAccountingSubmit(scope, { fetch })(payload, 10, new AbortController().signal)).rejects.toThrow();
    expect(cancelled).toBe(true);
  }, 1000);
});

it("retains known bridge usage through failure and recovers after bridge replacement without another send", async () => {
  const f = bridgeFixture(), storage = await fixture();
  const failing = new AccountingDeliveryWorker(storage.journal, async () => { throw new Error("offline"); });
  const bridge = new BedrockInferenceBridge(f.binding, f.authority, f.transport, Date.now, bridgeAccountingDelivery(storage.journal, failing));
  const result = await bridge.infer("request", { messages: [{ role: "user", content: [{ type: "text", text: "private prompt" }] }], maxOutputTokens: 20 }, new AbortController().signal).catch((e) => e);
  const reference = result.accountingReference as AccountingReference;
  expect(reference).toMatchObject({ slot: "0000", state: "PENDING" });
  expect(JSON.stringify(await storage.journal.inspect("0000"))).not.toContain("private prompt");
  const reopened = await AccountingDeliveryJournal.open(storage.config);
  const recovery = new AccountingDeliveryWorker(reopened, async (p) => f.authority.settle(p));
  await recovery.deliver(reference);
  expect(f.sends).toBe(1); expect(f.reservation.holds).toHaveLength(1);
  expect(f.reservation.holds[0].state).toBe("SETTLED");
});
