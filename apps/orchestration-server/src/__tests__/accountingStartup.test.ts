import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const accounting = vi.hoisted(() => ({ create: vi.fn(), start: vi.fn(), stop: vi.fn() }));
// Exercise the actual index bootstrap and status routes. Journal durability and
// delivery are qualified separately; this dependency cannot start a service.
vi.mock("../accountingDeliveryRuntime.js", async (original) => ({
  ...await original<typeof import("../accountingDeliveryRuntime.js")>(),
  createAccountingDeliveryRuntime: accounting.create,
}));
vi.mock("dotenv", () => ({ config: vi.fn() }));
vi.mock("../bedrockQualifiedTransport.js", () => ({
  qualifiedBedrockTransport: vi.fn(() => ({ send: vi.fn() })),
}));
const roots: string[] = [];
beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected network request"); }));
  for (const [key, value] of Object.entries({
    ORCHESTRATION_DISABLE_STARTUP: "1", CONVEX_URL: "https://fixture.convex.cloud",
    CONVEX_SERVICE_AUTH_TOKEN: "", ORCHESTRATION_API_TOKEN: "test-token", MC_API_TOKEN: "",
    CODEX_WORKER_PROJECT_ID: "project", CODEX_WORKER_REPOSITORY_ID: "repository",
    CODEX_FACTORY_WORKER_ENABLED: "true", DEEPSEEK_HARNESS_EXECUTOR_ENABLED: "0",
    FACTORY_EXECUTION_ENABLED: "0", FAB_EXECUTOR_ENABLED: "0",
    CODEX_BEDROCK_HARNESS_ENABLED: "1", CODEX_BEDROCK_APPROVED_CONFIG_FILE: "",
    CODEX_WORKER_FACTORY_VERSION_BINDINGS_JSON: "", CODEX_WORKER_REMOTE_SANDBOX_ENABLED: "0",
    MISSION_CONTROL_ACCOUNTING_JOURNAL_DIR: "/fixture/persistent/accounting",
  })) vi.stubEnv(key, value);
  accounting.create.mockReset().mockReturnValue({ delivery: {}, ready: Promise.resolve({}), start: accounting.start,
    stop: accounting.stop, status: () => ({ enabled: true, initializing: false, lastError: null }) });
});
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks();
});

async function status() {
  const { app } = await import("../index.js");
  const response = await app.request("/status", { headers: { authorization: "Bearer test-token" } });
  expect(response.status).toBe(200);
  expect(accounting.create).toHaveBeenCalledOnce();
  expect(globalThis.fetch).not.toHaveBeenCalled();
  return await response.json();
}

it.each(["missing", "blank", "absent authorization"])("disables every execution path for explicitly enabled provider with %s configuration", async (condition) => {
  if (condition === "missing") vi.stubEnv("CODEX_BEDROCK_APPROVED_CONFIG_FILE", undefined);
  if (condition === "blank") vi.stubEnv("CODEX_BEDROCK_APPROVED_CONFIG_FILE", "   ");
  if (condition === "absent authorization") {
    const root = await mkdtemp(path.join(os.tmpdir(), "accounting-startup-")); roots.push(root);
    const configPath = path.join(root, "provider.json");
    await writeFile(configPath, JSON.stringify({ route: {} }));
    vi.stubEnv("CODEX_BEDROCK_APPROVED_CONFIG_FILE", configPath);
  }
  const result = await status();
  expect(result.executionConfigurationErrors).toContain("PROVIDER_CONFIGURATION_INVALID");
  expect(result.factoryAttemptWorker.enabled).toBe(false);
  expect(result.missionPlanningWorker.enabled).toBe(false);
  expect(result.accountingDelivery).toMatchObject({ enabled: true, lastError: null });
});

it.each(["registry", "registration"])("contains actual optional %s construction failure before accounting startup", async (condition) => {
  vi.stubEnv("CODEX_BEDROCK_HARNESS_ENABLED", "0");
  if (condition === "registry") {
    vi.stubEnv("CODEX_FACTORY_WORKER_ENABLED", "false");
    vi.stubEnv("FACTORY_EXECUTION_ENABLED", "1");
  } else vi.stubEnv("CODEX_WORKER_FACTORY_VERSION_BINDINGS_JSON", "invalid binding");
  const result = await status();
  expect(result.executionConfigurationErrors).toContain("FACTORY_BOOTSTRAP_INVALID");
  expect(result.factoryAttemptWorker.enabled).toBe(false);
  expect(result.missionPlanningWorker.enabled).toBe(false);
  expect(result.accountingDelivery.enabled).toBe(true);
});

it("does not register or start provider execution when durable accounting initialization fails", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "accounting-startup-")); roots.push(root);
  const configPath = path.join(root, "provider.json");
  const accountId = "000000000000";
  const model = "anthropic.claude-sonnet-4-6";
  await writeFile(configPath, JSON.stringify({
    route: {
      provider: "AWS Bedrock", region: "us-east-1", modelId: model,
      foundationModelArn: `arn:aws:bedrock:us-east-1::foundation-model/${model}`,
      inferenceProfileId: `us.${model}`,
      inferenceProfileArn: `arn:aws:bedrock:us-east-1:${accountId}:inference-profile/us.${model}`,
      topology: "US_GEOGRAPHIC_CROSS_REGION", globalInference: false,
      allowedDestinationRegions: ["us-east-1", "us-east-2", "us-west-2"],
      awsAccountId: accountId, projectEnvironmentId: "OFFLINE-FIXTURE",
      roleArn: `arn:aws:iam::${accountId}:role/fixture`,
    },
    callAuthorization: { fixture: true }, reservationId: "reservation",
    priceDigest: `sha256:${"a".repeat(64)}`, maximumOutputTokens: 64, timeoutMs: 1_000,
  }));
  vi.stubEnv("CODEX_BEDROCK_APPROVED_CONFIG_FILE", configPath);
  accounting.create.mockReturnValue({
    delivery: {}, ready: Promise.resolve(undefined), start: accounting.start, stop: accounting.stop,
    status: () => ({ enabled: true, initializing: false, lastError: "ACCOUNTING_CONFIGURATION_OR_STORAGE_INVALID" }),
  });

  const module = await import("../index.js");
  expect(await module.startFactoryExecution()).toBe(false);
  const result = await status();
  expect(result.executionConfigurationErrors).toContain("ACCOUNTING_CONFIGURATION_OR_STORAGE_INVALID");
  expect(result.factoryAttemptWorker).toMatchObject({ enabled: true, lastPollAt: null, activeRunIds: [] });
  expect(result.missionPlanningWorker).toMatchObject({ enabled: true, lastPollAt: null, activeRunId: null });
});
