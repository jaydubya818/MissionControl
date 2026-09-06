import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAccountingDeliveryRuntime, optionalExecutionConfiguration } from "../accountingDeliveryRuntime.js";
import { configuredFactoryHarnessAdapters } from "../factoryHarnessComposition.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
it("recovers pending accounting with execution disabled and invalid optional configuration", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "accounting-runtime-")); roots.push(root);
  const env = { MISSION_CONTROL_ACCOUNTING_JOURNAL_DIR: path.join(root, "journal"), CONVEX_URL: "https://fixture.convex.cloud",
    CODEX_WORKER_PROJECT_ID: "project", CODEX_WORKER_REPOSITORY_ID: "repo", CODEX_FACTORY_WORKER_ENABLED: "false",
    FACTORY_EXECUTION_ENABLED: "0", CODEX_BEDROCK_HARNESS_ENABLED: "0", CODEX_BEDROCK_APPROVED_CONFIG_FILE: "missing" };
  const submit = vi.fn(async () => ({ duplicate: true, incident: false }));
  const initial = createAccountingDeliveryRuntime({ env, allowTemporaryFixture: true, submit });
  const digest = `sha256:${"a".repeat(64)}`, subject = { reservationId: "reservation", workflowRunId: "terminal-attempt", leaseId: "expired-lease", generation: 1 };
  const ticket = await initial.delivery!.prepare({ subject, requestId: "request", requestDigest: digest, evidenceClass: "OFFLINE_FIXTURE" });
  const payload = { ...subject, usage: { requestId: "request", requestDigest: digest, provider: "aws-bedrock", model: "model",
    providerRequestId: "provider-request", usageId: "usage", inputTokens: 1, outputTokens: 2, classification: "ACTUAL" as const, expectedReceiptRevision: 0 } };
  await initial.delivery!.capture(ticket, payload); await initial.stop();
  const errors: string[] = [];
  expect(optionalExecutionConfiguration("OPTIONAL_ADAPTER_INVALID", () => { throw new Error("private configuration content"); }, errors)).toBeUndefined();
  expect(optionalExecutionConfiguration("PROVIDER_GRANT_INVALID", () => { throw new Error("expired grant"); }, errors)).toBeUndefined();
  const restarted = createAccountingDeliveryRuntime({ env, allowTemporaryFixture: true, submit });
  try {
    await (await restarted.ready)!.pass();
    expect(submit).toHaveBeenCalledExactlyOnceWith(payload, expect.any(Number), expect.any(AbortSignal));
    expect(errors).toEqual(["OPTIONAL_ADAPTER_INVALID", "PROVIDER_GRANT_INVALID"]);
    expect(JSON.parse(await readFile(path.join(root, "journal/entries/0000/ack.json"), "utf8"))).toMatchObject({ duplicate: true });
  } finally { await restarted.stop(); }
});
it("does not construct delivery or choose a directory without explicit configuration", async () => {
  const runtime = createAccountingDeliveryRuntime({ env: {} });
  expect(runtime.delivery).toBeUndefined(); expect(await runtime.ready).toBeUndefined();
  expect(runtime.status()).toMatchObject({ enabled: false }); await runtime.stop();
});
it("fails capture before any submission when configured scope or storage is invalid", async () => {
  const submit = vi.fn(), runtime = createAccountingDeliveryRuntime({ env: { MISSION_CONTROL_ACCOUNTING_JOURNAL_DIR: "relative" }, submit });
  await runtime.ready;
  await expect(runtime.delivery!.prepare({ subject: { reservationId: "r", workflowRunId: "w", leaseId: "l", generation: 1 }, requestId: "r", requestDigest: `sha256:${"a".repeat(64)}`, evidenceClass: "OFFLINE_FIXTURE" })).rejects.toThrow("ACCOUNTING_JOURNAL_REQUIRED");
  expect(submit).not.toHaveBeenCalled(); expect(runtime.status()).toMatchObject({ lastError: "ACCOUNTING_CONFIGURATION_OR_STORAGE_INVALID" });
  await runtime.stop();
});
it.each(["registry", "registration"])("contains optional %s bootstrap failure without selecting an alternative executor", (stage) => {
  const errors: string[] = [], register = vi.fn(), fallback = vi.fn();
  const configuration = optionalExecutionConfiguration("FACTORY_BOOTSTRAP_INVALID", () => {
    if (stage === "registry") configuredFactoryHarnessAdapters({ codexEnabled: false, deepseekEnabled: false, legacyFactoryWorkerEnabled: true });
    if (stage === "registration") JSON.parse("invalid registration binding");
    register(); return { executor: "explicit" };
  }, errors);
  expect(configuration).toBeUndefined(); expect(errors).toEqual(["FACTORY_BOOTSTRAP_INVALID"]);
  expect(register).not.toHaveBeenCalled(); expect(fallback).not.toHaveBeenCalled();
});
