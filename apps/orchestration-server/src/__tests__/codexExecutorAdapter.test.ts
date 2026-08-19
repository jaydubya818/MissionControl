import { execFile } from "node:child_process";
import { access, chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import {
  CodexV1ExecutorAdapter,
  codexChildEnvironment,
  codexOwnedProcessGroupExists,
} from "../codexExecutorAdapter.js";
import type { ExecutorRequest, HarnessExecutionContext } from "@mission-control/workflow-engine";

const execFileAsync = promisify(execFile);

const request = {
  executionId: "execution-1",
  repositoryRoot: "/tmp/repository",
  workingDirectory: "/tmp/repository/apps/ui",
  prompt: "Implement the approved UI change.",
  allowedPaths: ["apps/ui/**"],
  deniedPaths: [],
  timeoutMs: 60_000,
  isolation: "WORKSPACE_WRITE" as const,
  provider: "openai",
  model: "gpt-5.6-terra",
};

function completion(overrides: Record<string, unknown> = {}) {
  const startedAt = Date.now();
  return {
    exitCode: 0,
    signal: null,
    output: "Implemented and tested.",
    stdout: '{"type":"turn.completed","usage":{"input_tokens":12,"output_tokens":4}}\n',
    stderr: "",
    startedAt,
    finishedAt: startedAt + 10,
    timedOut: false,
    ...overrides,
  };
}

async function gitRepository() {
  const root = await mkdtemp(path.join(tmpdir(), "mc-codex-adapter-"));
  await execFileAsync("git", ["init", "-q", root]);
  await execFileAsync("git", ["-C", root, "config", "user.name", "Fixture"]);
  await execFileAsync("git", ["-C", root, "config", "user.email", "fixture@example.invalid"]);
  await writeFile(path.join(root, "README.md"), "fixture\n");
  await execFileAsync("git", ["-C", root, "add", "README.md"]);
  await execFileAsync("git", ["-C", root, "commit", "-qm", "fixture"]);
  return root;
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

describe("CodexV1ExecutorAdapter", () => {
  it("declares the frozen codex/v1 lifecycle and repository mutation capability", () => {
    const adapter = new CodexV1ExecutorAdapter("/tmp/codex", vi.fn() as any);
    expect(adapter.capabilities().capabilityManifest).toMatchObject({
      identity: { adapterId: "codex", adapterVersion: "v1", harnessVersion: "0.146.0" },
      cancellation: { support: "PARTIAL", idempotentCleanup: true },
      filesystem: { write: "SUPPORTED" },
    });
  });

  it("rejects paths that escape the explicit repository sandbox", () => {
    const adapter = new CodexV1ExecutorAdapter("/tmp/codex", vi.fn() as any);
    expect(adapter.validateConfiguration({
      ...request,
      workingDirectory: "/tmp/other",
      allowedPaths: ["../secrets/**"],
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "workingDirectory" }),
      expect.objectContaining({ field: "allowedPaths" }),
    ]));
  });

  it("emits structured events without putting diagnostics or secrets in successful metadata", async () => {
    const repositoryRoot = await gitRepository();
    const runner = vi.fn().mockResolvedValue(completion());
    const adapter = new CodexV1ExecutorAdapter("/tmp/codex", runner as any);
    const events: any[] = [];
    const result = await executeAdapter(adapter, {
      ...request,
      repositoryRoot,
      workingDirectory: repositoryRoot,
    }, { emit: (event) => { events.push(event); } });

    expect(result).toMatchObject({ status: "COMPLETED", output: "Implemented and tested." });
    expect(events.map((event) => event.type)).toEqual([
      "EXECUTION_STARTED",
      "COMMAND_STARTED",
      "COMMAND_COMPLETED",
      "ARTIFACT_PRODUCED",
      "EXECUTION_COMPLETED",
    ]);
    expect(JSON.stringify(events)).not.toContain("OPENAI_API_KEY");
  });

  it("supports cancellation of an active execution", async () => {
    const repositoryRoot = await gitRepository();
    const runner = vi.fn(({ signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    const adapter = new CodexV1ExecutorAdapter("/tmp/codex", runner as any);
    const prepared = await adapter.prepare({
      ...request,
      repositoryRoot,
      workingDirectory: repositoryRoot,
    }, { emit: () => undefined });
    const handle = await adapter.execute(prepared);
    const execution = adapter.collectResult(handle);
    await vi.waitFor(() => expect(runner).toHaveBeenCalled());
    expect(await adapter.cancel(handle)).toBe(true);
    await expect(execution).resolves.toMatchObject({ status: "CANCELED" });
    await adapter.cleanup(handle);
  });

  it("passes only an explicit non-control-plane environment to Codex", () => {
    const child = codexChildEnvironment({
      PATH: "/usr/bin",
      HOME: "/tmp/home",
      CODEX_HOME: "/tmp/codex-home",
      MISSION_CONTROL_SERVICE_COMMAND_SECRET: "service-secret",
      GITHUB_APP_PRIVATE_KEY: "github-secret", // secret-scan: allow-fixture
      CONVEX_SERVICE_AUTH_TOKEN: "convex-secret",
      OPENAI_API_KEY: "provider-secret",
    });
    expect(child).toMatchObject({ PATH: "/usr/bin", HOME: "/tmp/home", CODEX_HOME: "/tmp/codex-home", CI: "true" });
    expect(child).not.toHaveProperty("MISSION_CONTROL_SERVICE_COMMAND_SECRET");
    expect(child).not.toHaveProperty("GITHUB_APP_PRIVATE_KEY");
    expect(child).not.toHaveProperty("CONVEX_SERVICE_AUTH_TOKEN");
    expect(child).not.toHaveProperty("OPENAI_API_KEY");
  });

  it("builds a bounded remote invocation without acquiring control-plane authority", () => {
    const adapter = new CodexV1ExecutorAdapter("/opt/codex", vi.fn() as any);
    const invocation = adapter.createRemoteInvocation(request, {
      repositoryRoot: "/var/lib/mission-control/attempt/repository",
      resultPath: "/var/lib/mission-control/attempt/executor-result.json",
    });

    expect(invocation).toMatchObject({
      command: "/opt/codex",
      resultPath: "/var/lib/mission-control/attempt/executor-result.json",
      outputSchemaPath: "/var/lib/mission-control/attempt/factory-result.schema.json",
      outputSchema: expect.objectContaining({
        type: "object",
        additionalProperties: false,
        required: expect.arrayContaining(["status", "summary", "verificationCommands"]),
      }),
      prompt: request.prompt,
      allowedPaths: request.allowedPaths,
      timeoutMs: request.timeoutMs,
    });
    expect(invocation.args).toEqual(expect.arrayContaining([
      "-C",
      "/var/lib/mission-control/attempt/repository",
      "-o",
      "/var/lib/mission-control/attempt/executor-result.json",
      "--output-schema",
      "/var/lib/mission-control/attempt/factory-result.schema.json",
    ]));
    expect(invocation.args.flatMap((argument, index, args) => argument === "-c" ? [args[index + 1]] : []))
      .toEqual([
        'model_provider="mission-control-openrouter"',
        'model_providers.mission-control-openrouter.name="OpenRouter"',
        'model_providers.mission-control-openrouter.base_url="https://openrouter.ai/api/v1"',
        'model_providers.mission-control-openrouter.env_key="OPENAI_API_KEY"',
        'model_providers.mission-control-openrouter.wire_api="responses"',
        "model_providers.mission-control-openrouter.supports_websockets=false",
      ]);
    expect(adapter.capabilities().authority).toEqual({
      worker: "NONE",
      verification: "NONE",
      publication: "NONE",
      acceptance: "NONE",
      memory: "NONE",
      observability: "NONE",
      learning: "NONE",
    });
  });

  it.skipIf(process.platform === "win32")("cancels the dedicated owned executor process group", async () => {
    const repositoryRoot = await gitRepository();
    const executable = path.join(repositoryRoot, "codex-tree-stub.sh");
    const childPidPath = path.join(repositoryRoot, "child.pid");
    await writeFile(executable, `#!/bin/sh
sleep 60 &
printf '%s' "$!" > "${childPidPath}"
wait
`);
    await chmod(executable, 0o700);

    try {
      const adapter = new CodexV1ExecutorAdapter(executable);
      const started = vi.fn();
      const terminated = vi.fn();
      const prepared = await adapter.prepare({
        ...request,
        repositoryRoot,
        workingDirectory: repositoryRoot,
      }, { emit: () => undefined, processObserver: { started, terminated } });
      const handle = await adapter.execute(prepared);
      const execution = adapter.collectResult(handle);
      await vi.waitFor(() => expect(access(childPidPath)).resolves.toBeUndefined(), { timeout: 5_000 });
      const childPid = Number(await readFile(childPidPath, "utf8"));
      expect(Number.isSafeInteger(childPid)).toBe(true);
      const processGroupId = started.mock.calls[0][0].pid;
      expect(codexOwnedProcessGroupExists(processGroupId)).toBe(true);
      expect(await processCanExecute(childPid)).toBe(true);
      expect(await adapter.cancel(handle)).toBe(true);
      await expect(execution).resolves.toMatchObject({ status: "CANCELED" });
      await adapter.cleanup(handle);
      expect(terminated).toHaveBeenCalledWith(expect.objectContaining({ pid: processGroupId }));
      await vi.waitFor(async () => {
        expect(await processCanExecute(processGroupId)).toBe(false);
        expect(await processCanExecute(childPid)).toBe(false);
      }, { timeout: 7_000 });
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  }, 15_000);

  it("closes the Codex CLI stdin pipe so an explicit prompt can start", async () => {
    const repositoryRoot = await gitRepository();
    const executable = path.join(repositoryRoot, "codex-stub.sh");
    await writeFile(executable, `#!/bin/sh
output=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then
    shift
    output="$1"
  fi
  shift
done
if IFS= read -r _line; then
  exit 41
fi
printf '%s' 'Codex started after EOF.' > "$output"
printf '%s\n' '{"type":"thread.started"}' '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}'
`);
    await chmod(executable, 0o700);

    try {
      const adapter = new CodexV1ExecutorAdapter(executable);
      const started = vi.fn();
      const terminated = vi.fn();
      const result = await executeAdapter(adapter, {
        ...request,
        repositoryRoot,
        workingDirectory: repositoryRoot,
        timeoutMs: 2_000,
      }, { emit: () => undefined, processObserver: { started, terminated } });

      expect(result).toMatchObject({
        status: "COMPLETED",
        output: "Codex started after EOF.",
      });
      expect(started).toHaveBeenCalledOnce();
      expect(terminated).toHaveBeenCalledOnce();
      expect(terminated.mock.calls[0][0].pid).toBe(started.mock.calls[0][0].pid);
      expect(terminated.mock.calls[0][0].exitCode).toBe(0);
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  });
});

async function executeAdapter(
  adapter: CodexV1ExecutorAdapter,
  input: ExecutorRequest,
  context: HarnessExecutionContext,
) {
  const prepared = await adapter.prepare(input, context);
  const handle = await adapter.execute(prepared);
  try {
    return await adapter.collectResult(handle);
  } finally {
    await adapter.cleanup(handle);
  }
}
