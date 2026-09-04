import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { harnessNormalizedResultIssues } from "@mission-control/workflow-engine";
import {
  DeepSeekHarnessExecutorAdapter,
  deepSeekChildEnvironment,
  deepSeekOwnedProcessGroupExists,
  type DeepSeekPreparedExecution,
} from "../deepseekHarnessExecutorAdapter.js";

const execFileAsync = promisify(execFile);

async function repository() {
  const root = await mkdtemp(path.join(tmpdir(), "mc-deepseek-adapter-"));
  await execFileAsync("git", ["init", "-q", root]);
  await execFileAsync("git", ["-C", root, "config", "user.name", "Fixture"]);
  await execFileAsync("git", ["-C", root, "config", "user.email", "fixture@example.invalid"]);
  await writeFile(path.join(root, "README.md"), "fixture\n");
  await execFileAsync("git", ["-C", root, "add", "README.md"]);
  await execFileAsync("git", ["-C", root, "commit", "-qm", "fixture"]);
  return root;
}

function request(root: string) {
  return {
    executionId: "deepseek-attempt-1",
    repositoryRoot: root,
    workingDirectory: root,
    prompt: "Return the required factory-result/v1 JSON.",
    allowedPaths: ["**/*"],
    deniedPaths: [".git/**"],
    timeoutMs: 10_000,
    isolation: "WORKSPACE_WRITE" as const,
    provider: "local-ollama",
    model: "qwen3.5:35b-a3b-q8_0",
    modelRouteDigest: `sha256:${"a".repeat(64)}`,
    providerRoute: "local-ollama",
  };
}

function installation(root: string) {
  return { root, executable: path.join(root, "deepseek-stub.js"), executableSha256: "b".repeat(64) };
}

async function processCanExecute(pid: number): Promise<boolean> {
  try {
    if (process.platform === "linux") {
      const stat = await readFile(`/proc/${pid}/stat`, "utf8");
      const stateOffset = stat.lastIndexOf(")") + 2;
      const state = stat[stateOffset];
      return state !== "Z" && state !== "X";
    }
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("DeepSeekHarnessExecutorAdapter", () => {
  it("is disabled by default and advertises only the exact evaluated pin", async () => {
    const root = await repository();
    try {
      const adapter = new DeepSeekHarnessExecutorAdapter({ upstreamRoot: root });
      expect(adapter.validateConfiguration(request(root))).toContainEqual(expect.objectContaining({ field: "adapter" }));
      expect(adapter.capabilities().capabilityManifest?.identity).toMatchObject({
        harnessVersion: "0.1.0-rc.5",
        harnessCommit: "47f943859bef60e4160492346772ded9b24f765a",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("implements the shared lifecycle and returns a schema-valid untrusted result", async () => {
    const root = await repository();
    const runner = vi.fn(async (input: any) => {
      const sessionRoot = path.join(input.env.DSH_HOME, "sessions", "session-1");
      await mkdir(sessionRoot, { recursive: true });
      await writeFile(path.join(sessionRoot, "events.jsonl"), [
        JSON.stringify({ type: "request/header", time: 1, data: {} }),
        JSON.stringify({ type: "tool/call", time: 2, data: {} }),
        JSON.stringify({ type: "assistant/message", time: 3, data: { usage: { inputTokens: 9, outputTokens: 4 } } }),
        JSON.stringify({ type: "turn/end", time: 4, data: { reason: { kind: "completed" } } }),
      ].join("\n"));
      const startedAt = Date.now();
      return {
        exitCode: 0,
        signal: null,
        stdout: JSON.stringify({ status: "COMPLETED", summary: "done" }),
        stderr: "",
        startedAt,
        finishedAt: startedAt + 20,
        timedOut: false,
      };
    });
    const adapter = new DeepSeekHarnessExecutorAdapter({
      upstreamRoot: root,
      enabled: true,
      verifyInstallation: async () => installation(root),
      verifyProvider: async () => undefined,
      runner,
    });
    try {
      const events: string[] = [];
      const prepared = await adapter.prepare(request(root), { emit: (event) => { events.push(event.type); } });
      const handle = await adapter.execute(prepared);
      const result = await adapter.collectResult(handle);
      expect(result.normalizedResult).toMatchObject({
        status: "COMPLETED",
        usage: { inputTokens: 9, outputTokens: 4, costUsd: null },
        events: { toolCalls: 1, modelRequests: 1, retries: 0, sessionCount: 1 },
      });
      expect(result.normalizedResult?.provenance.providerMetadata).toEqual(expect.objectContaining({ experimental: true }));
      expect(result.normalizedResult?.provenance).toMatchObject({
        modelRouteDigest: `sha256:${"a".repeat(64)}`,
        providerRoute: "local-ollama",
      });
      expect(harnessNormalizedResultIssues(result.normalizedResult!)).toEqual([]);
      expect(events).toContain("EXECUTION_COMPLETED");
      await adapter.cleanup(handle);
      await adapter.cleanup(handle);
      expect(result.normalizedResult?.cleanup.status).toBe("COMPLETED");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects exact reasoning controls it cannot translate", async () => {
    const root = await repository();
    try {
      const adapter = new DeepSeekHarnessExecutorAdapter({ upstreamRoot: root, enabled: true });
      expect(adapter.validateConfiguration({
        ...request(root),
        reasoningConfig: { effort: "high" },
      })).toContainEqual(expect.objectContaining({ field: "reasoningConfig" }));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("cancels through the shared handle and preserves canonical lifecycle history", async () => {
    const root = await repository();
    const runner = vi.fn((input: any) => new Promise<any>((resolve) => {
      const startedAt = Date.now();
      input.signal.addEventListener("abort", () => resolve({
        exitCode: null,
        signal: "SIGTERM",
        stdout: "",
        stderr: "",
        startedAt,
        finishedAt: Date.now(),
        timedOut: false,
      }), { once: true });
    }));
    const adapter = new DeepSeekHarnessExecutorAdapter({ upstreamRoot: root, enabled: true, verifyInstallation: async () => installation(root), verifyProvider: async () => undefined, runner });
    try {
      const prepared = await adapter.prepare(request(root), { emit: () => undefined });
      const handle = await adapter.execute(prepared);
      await adapter.cancel(handle);
      await adapter.cancel(handle);
      const result = await adapter.collectResult(handle);
      expect(result.normalizedResult).toMatchObject({ status: "CANCELED", cancellation: { requested: true, mode: "PROCESS_SIGNAL" } });
      expect(result.normalizedResult?.events.items.map((event) => event.type)).toContain("EXECUTION_CANCELED");
      await adapter.cleanup(handle);
      await adapter.cleanup(handle);
      expect(result.normalizedResult?.cleanup.status).toBe("COMPLETED");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === "win32")("cancels the dedicated owned executor process group", async () => {
    const root = await repository();
    const executable = path.join(root, "deepseek-tree-stub.cjs");
    const childPidPath = path.join(root, "child.pid");
    await writeFile(executable, `const { spawn } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const child = spawn("sleep", ["60"], { stdio: "ignore" });
writeFileSync(process.argv.at(-1), String(child.pid));
child.once("close", () => process.exit(0));
setInterval(() => undefined, 1000);
`);
    const adapter = new DeepSeekHarnessExecutorAdapter({
      upstreamRoot: root,
      enabled: true,
      verifyInstallation: async () => ({ ...installation(root), executable }),
      verifyProvider: async () => undefined,
    });

    try {
      const started = vi.fn();
      const terminated = vi.fn();
      const prepared = await adapter.prepare({ ...request(root), prompt: childPidPath }, {
        emit: () => undefined,
        processObserver: { started, terminated },
      });
      const handle = await adapter.execute(prepared);
      await vi.waitFor(() => expect(access(childPidPath)).resolves.toBeUndefined());
      const childPid = Number(await readFile(childPidPath, "utf8"));
      expect(Number.isSafeInteger(childPid)).toBe(true);
      const processGroupId = started.mock.calls[0][0].pid;
      expect(deepSeekOwnedProcessGroupExists(processGroupId)).toBe(true);
      expect(await processCanExecute(childPid)).toBe(true);
      await adapter.cancel(handle);
      await expect(adapter.collectResult(handle)).resolves.toMatchObject({ status: "CANCELED" });
      await adapter.cleanup(handle);
      expect(terminated).toHaveBeenCalledWith(expect.objectContaining({ pid: processGroupId }));
      await vi.waitFor(async () => {
        expect(await processCanExecute(processGroupId)).toBe(false);
        expect(await processCanExecute(childPid)).toBe(false);
      }, { timeout: 7_000 });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);

  it("does not pass control-plane, GitHub, or provider-admin credentials to the harness", () => {
    const prepared = {
      request: { isolation: "WORKSPACE_WRITE" },
      runtimeHome: "/tmp/deepseek-runtime",
    } as DeepSeekPreparedExecution;
    const env = deepSeekChildEnvironment(prepared, {
      PATH: "/usr/bin",
      MISSION_CONTROL_SERVICE_COMMAND_SECRET: "control-plane-secret",
      CONVEX_SERVICE_AUTH_TOKEN: "convex-secret",
      GITHUB_APP_PRIVATE_KEY: "github-secret", // secret-scan: allow-fixture
      OPENROUTER_MANAGEMENT_API_KEY: "provider-admin-secret", // secret-scan: allow-fixture
    });
    expect(env).toMatchObject({ PATH: "/usr/bin", HOME: "/tmp/deepseek-runtime", OLLAMA_API_KEY: "ollama-local-no-secret" });
    expect(env).not.toHaveProperty("MISSION_CONTROL_SERVICE_COMMAND_SECRET");
    expect(env).not.toHaveProperty("CONVEX_SERVICE_AUTH_TOKEN");
    expect(env).not.toHaveProperty("GITHUB_APP_PRIVATE_KEY");
    expect(env).not.toHaveProperty("OPENROUTER_MANAGEMENT_API_KEY");
  });
});
