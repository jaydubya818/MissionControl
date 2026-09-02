import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type {
  ExecutorCapabilities,
  ExecutorConfigurationIssue,
  ExecutorEstimate,
  ExecutorEvent,
  ExecutorHealth,
  ExecutorRequest,
  ExecutorResult,
  HarnessExecutionContext,
  HarnessExecutorAdapter,
  HarnessNormalizedResult,
} from "@mission-control/workflow-engine";
import {
  DEEPSEEK_V1_HARNESS_MANIFEST,
  GENERIC_HARNESS_CONTRACT_VERSION,
  NO_HARNESS_AUTHORITY,
  boundedProviderMetadata,
  harnessCapabilityManifestDigest,
  harnessExecutionRequestDigest,
} from "@mission-control/workflow-engine";
import { captureHarnessRepositoryBaseline, collectHarnessRepositoryResult } from "./harnessRepository.js";

const execFileAsync = promisify(execFile);
const EXPECTED_COMMIT = "47f943859bef60e4160492346772ded9b24f765a";
const EXPECTED_VERSION = "0.1.0-rc.5";
const ADAPTER_VERSION = "0.2.0";
const EXPECTED_EXECUTABLE_SHA256 = "c0226687bb20f45c603ec6fe50f3de16d1c3510c3a803304ec575ef9bc366c62";
const EXPECTED_PROVIDER = "local-ollama";
const EXPECTED_MODEL = "qwen3.5:35b-a3b-q8_0";
const EXPECTED_OLLAMA_VERSION = "0.32.6";
const EXPECTED_MODEL_DIGEST = "655d273ede3adc056594f511c120d616d92bf4c4d5bcfe580f3cfa29abe8109d";
const PROCESS_TERMINATION_GRACE_MS = 5_000;

interface DeepSeekInstallation {
  root: string;
  executable: string;
  executableSha256: string;
}

export interface DeepSeekPreparedExecution {
  request: ExecutorRequest;
  context: HarnessExecutionContext;
  installation: DeepSeekInstallation;
  outputDirectory: string;
  runtimeHome: string;
  patchPath: string;
  baselineCommit: string | null;
  requestSha256: string;
}

interface ProcessCompletion {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  startedAt: number;
  finishedAt: number;
  timedOut: boolean;
}

interface DeepSeekSessionEvent {
  type?: unknown;
  event?: unknown;
  data?: {
    reason?: { kind?: unknown };
    usage?: Record<string, unknown>;
  };
}

type ProcessRunner = (input: {
  executable: string;
  argv: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  signal: AbortSignal;
  onSpawn?: (pid: number) => Promise<void> | void;
  onExit?: (pid: number, exitCode?: number) => Promise<void> | void;
}) => Promise<ProcessCompletion>;

interface DeepSeekExecutionHandle {
  prepared: DeepSeekPreparedExecution;
  controller: AbortController;
  completion: Promise<ProcessCompletion>;
  events: ExecutorEvent[];
  cancellationRequested: boolean;
  completed: boolean;
  removeExternalAbort: () => void;
  cleanupPromise?: Promise<void>;
  result?: ExecutorResult;
}

export class DeepSeekHarnessExecutorAdapter implements HarnessExecutorAdapter<DeepSeekPreparedExecution, DeepSeekExecutionHandle> {
  constructor(private readonly options: {
    upstreamRoot?: string;
    enabled?: boolean;
    verifyInstallation?: (root: string) => Promise<DeepSeekInstallation>;
    verifyProvider?: () => Promise<void>;
    runner?: ProcessRunner;
  } = {}) {}

  capabilities(): ExecutorCapabilities {
    return {
      contractVersion: GENERIC_HARNESS_CONTRACT_VERSION,
      adapter: "deepseek-harness",
      version: ADAPTER_VERSION,
      displayName: "DeepSeek Harness",
      provider: EXPECTED_PROVIDER,
      capabilityManifest: DEEPSEEK_V1_HARNESS_MANIFEST,
      executionBackends: ["persistent-worker"],
      authority: NO_HARNESS_AUTHORITY,
      supportsCancel: true,
      supportsResume: false,
      supportsRepositoryMutation: true,
      isolationModes: ["READ_ONLY", "WORKSPACE_WRITE"],
      emittedEvents: [
        "EXECUTION_STARTED",
        "COMMAND_STARTED",
        "COMMAND_COMPLETED",
        "TOOL_CALLED",
        "ARTIFACT_PRODUCED",
        "EXECUTION_COMPLETED",
        "EXECUTION_FAILED",
        "EXECUTION_CANCELED",
      ],
    };
  }

  validateConfiguration(request: ExecutorRequest): ExecutorConfigurationIssue[] {
    const issues: ExecutorConfigurationIssue[] = [];
    if (!this.enabled()) issues.push({ field: "adapter", message: "DeepSeek Harness is disabled. Set DEEPSEEK_HARNESS_EXECUTOR_ENABLED=1 on the canonical worker to enable the experimental adapter." });
    if (!path.isAbsolute(request.repositoryRoot)) issues.push({ field: "repositoryRoot", message: "Repository root must be absolute." });
    if (!path.isAbsolute(request.workingDirectory)) issues.push({ field: "workingDirectory", message: "Working directory must be absolute." });
    if (path.isAbsolute(request.repositoryRoot) && path.isAbsolute(request.workingDirectory)) {
      const relative = path.relative(path.resolve(request.repositoryRoot), path.resolve(request.workingDirectory));
      if (relative.startsWith("..") || path.isAbsolute(relative)) issues.push({ field: "workingDirectory", message: "Working directory must remain inside the repository root." });
    }
    if (!request.prompt.trim()) issues.push({ field: "prompt", message: "Execution prompt is required." });
    if (request.allowedPaths.length === 0) issues.push({ field: "allowedPaths", message: "At least one repository-relative path boundary is required." });
    if ([...request.allowedPaths, ...(request.deniedPaths ?? [])].some((candidate) => path.isAbsolute(candidate) || candidate.split(/[\\/]/).includes(".."))) {
      issues.push({ field: "allowedPaths", message: "Path boundaries must be repository-relative and cannot traverse upward." });
    }
    if (!Number.isSafeInteger(request.timeoutMs) || request.timeoutMs < 1_000 || request.timeoutMs > 8 * 60 * 60 * 1_000) {
      issues.push({ field: "timeoutMs", message: "Timeout must be between one second and eight hours." });
    }
    if (request.provider !== EXPECTED_PROVIDER || request.model !== EXPECTED_MODEL) {
      issues.push({ field: "model", message: `DeepSeek Harness V1 admits only ${EXPECTED_PROVIDER}/${EXPECTED_MODEL}.` });
    }
    if (request.structuredOutput) {
      issues.push({ field: "structuredOutput", message: "DeepSeek Harness V1 does not admit request-bound structured-output contracts." });
    }
    return issues;
  }

  async estimate(request: ExecutorRequest): Promise<ExecutorEstimate> {
    return {
      estimatedCostUsd: null,
      estimatedRuntimeMinutes: Math.min(Math.ceil(request.timeoutMs / 60_000), Math.max(5, Math.ceil(request.prompt.length / 1_000) * 10)),
      confidence: "LOW",
    };
  }

  async prepare(request: ExecutorRequest, context: HarnessExecutionContext): Promise<DeepSeekPreparedExecution> {
    const issues = this.validateConfiguration(request);
    if (issues.length) throw new Error(issues.map((issue) => `${issue.field}: ${issue.message}`).join(" "));
    const repositoryRoot = await realpath(request.repositoryRoot);
    const workingDirectory = await realpath(request.workingDirectory);
    const relative = path.relative(repositoryRoot, workingDirectory);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("workingDirectory must remain inside repositoryRoot.");
    const configuredRoot = this.options.upstreamRoot ?? process.env.DEEPSEEK_HARNESS_ROOT;
    if (!configuredRoot?.trim()) throw new Error("DEEPSEEK_HARNESS_ROOT must identify the exact pinned checkout.");
    const root = path.resolve(configuredRoot);
    const installation = await (this.options.verifyInstallation ?? verifyPinnedDeepSeekInstallation)(root);
    await (this.options.verifyProvider ?? verifyPinnedLocalOllamaProvider)();
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "mc-deepseek-v1-"));
    try {
      const runtimeHome = path.join(outputDirectory, "runtime");
      const patchPath = path.join(outputDirectory, "mission-control.patch.yml");
      const normalizedRequest = { ...request, repositoryRoot, workingDirectory, deniedPaths: [...(request.deniedPaths ?? [])] };
      await writeFile(patchPath, deepSeekPatch({ runtimeHome, repositoryRoot, isolation: request.isolation }), { mode: 0o600 });
      return {
        request: normalizedRequest,
        context,
        installation,
        outputDirectory,
        runtimeHome,
        patchPath,
        baselineCommit: await captureHarnessRepositoryBaseline(repositoryRoot),
        requestSha256: harnessExecutionRequestDigest(normalizedRequest),
      };
    } catch (error) {
      await rm(outputDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  async execute(prepared: DeepSeekPreparedExecution): Promise<DeepSeekExecutionHandle> {
    const { emit, signal, processObserver } = prepared.context;
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", abort, { once: true });
    let sequence = 0;
    const events: ExecutorEvent[] = [];
    const send = async (type: ExecutorEvent["type"], summary: string, metadata?: Record<string, unknown>) => {
      const item = { executionId: prepared.request.executionId, sequence: ++sequence, type, occurredAt: Date.now(), summary, metadata };
      events.push(item);
      await emit(item);
    };
    try {
      await send("EXECUTION_STARTED", "DeepSeek Harness execution started.", {
        adapter: `deepseek-harness/${ADAPTER_VERSION}`,
        harness: "deepseek-harness/0.1.0-rc.5",
        experimental: true,
        isolation: prepared.request.isolation,
      });
      await send("COMMAND_STARTED", "Pinned DeepSeek Harness CLI command started.");
    } catch (error) {
      signal?.removeEventListener("abort", abort);
      await rm(prepared.outputDirectory, { recursive: true, force: true });
      throw error;
    }
    const handle: DeepSeekExecutionHandle = {
      prepared,
      controller,
      events,
      cancellationRequested: controller.signal.aborted,
      completed: false,
      removeExternalAbort: () => signal?.removeEventListener("abort", abort),
      completion: Promise.resolve(undefined as never),
    };
    const startedAt = Date.now();
    handle.completion = (this.options.runner ?? runDeepSeekProcess)({
      executable: prepared.installation.executable,
      argv: ["--profile", "headless", "--patch", prepared.patchPath, prepared.request.prompt],
      cwd: prepared.request.workingDirectory,
      env: deepSeekChildEnvironment(prepared),
      timeoutMs: prepared.request.timeoutMs,
      signal: controller.signal,
      onSpawn: (pid) => processObserver?.started({ pid, startedAt: Date.now() }),
      onExit: (pid, exitCode) => processObserver?.terminated({ pid, exitCode, terminatedAt: Date.now() }),
    }).catch((cause): ProcessCompletion => ({
      exitCode: null,
      signal: null,
      stdout: "",
      stderr: redact(cause instanceof Error ? cause.message : String(cause)),
      startedAt,
      finishedAt: Date.now(),
      timedOut: false,
    })).then(async (completion) => {
      const session = await summarizeDeepSeekSessions(prepared.runtimeHome);
      for (let index = 0; index < session.toolCalls; index += 1) {
        await send("TOOL_CALLED", "DeepSeek Harness tool call completed.");
      }
      await send("COMMAND_COMPLETED", "DeepSeek Harness CLI command completed.", { exitCode: completion.exitCode, signal: completion.signal });
      if (controller.signal.aborted) await send("EXECUTION_CANCELED", "DeepSeek Harness execution canceled.");
      else if (completion.timedOut) await send("EXECUTION_FAILED", "DeepSeek Harness execution timed out.");
      else if (completion.exitCode === 0 && session.sessionCount > 0 && session.finalTurnReason === "completed") {
        await send("ARTIFACT_PRODUCED", "DeepSeek Harness produced an execution result.", { artifactType: "DEEPSEEK_RESULT" });
        await send("EXECUTION_COMPLETED", "DeepSeek Harness execution completed.");
      } else {
        await send("EXECUTION_FAILED", redact(completion.stderr || `DeepSeek Harness exited with status ${completion.exitCode ?? "unknown"}.`));
      }
      handle.completed = true;
      return completion;
    });
    return handle;
  }

  async cancel(handle: DeepSeekExecutionHandle): Promise<boolean> {
    if (handle.completed || handle.cancellationRequested) return false;
    handle.cancellationRequested = true;
    handle.controller.abort();
    return true;
  }

  async collectResult(handle: DeepSeekExecutionHandle): Promise<ExecutorResult> {
    if (handle.result) return handle.result;
    const completion = await handle.completion;
    const session = await summarizeDeepSeekSessions(handle.prepared.runtimeHome);
    const repository = await collectHarnessRepositoryResult({
      repositoryRoot: handle.prepared.request.repositoryRoot,
      workingDirectory: handle.prepared.request.workingDirectory,
      baselineCommit: handle.prepared.baselineCommit,
      allowedPaths: handle.prepared.request.allowedPaths,
      deniedPaths: handle.prepared.request.deniedPaths ?? [],
    });
    const canceled = handle.cancellationRequested || handle.controller.signal.aborted;
    const status = canceled
      ? "CANCELED"
      : completion.timedOut
        ? "TIMED_OUT"
        : completion.exitCode === 0 && session.sessionCount > 0 && session.finalTurnReason === "completed"
          ? "COMPLETED"
          : "FAILED";
    const normalizedResult: HarnessNormalizedResult = {
      schemaVersion: "harness-result/v1",
      executionId: handle.prepared.request.executionId,
      status,
      harness: DEEPSEEK_V1_HARNESS_MANIFEST.identity,
      provenance: {
        provider: handle.prepared.request.provider ?? null,
        model: handle.prepared.request.model ?? null,
        capabilityManifestSha256: harnessCapabilityManifestDigest(DEEPSEEK_V1_HARNESS_MANIFEST),
        effectiveConfigSha256: DEEPSEEK_V1_HARNESS_MANIFEST.effectiveConfigSha256,
        executableSha256: handle.prepared.installation.executableSha256,
        requestSha256: handle.prepared.requestSha256,
        providerMetadata: boundedProviderMetadata({
          routeType: "pi-ai-openai-completions-loopback",
          experimental: true,
          sessionEventFiles: session.sessionCount,
        }),
      },
      timing: { startedAt: completion.startedAt, finishedAt: completion.finishedAt, wallClockMs: Math.max(0, completion.finishedAt - completion.startedAt) },
      repository,
      events: {
        items: handle.events,
        toolCalls: session.toolCalls,
        modelRequests: session.modelRequests,
        retries: session.retries,
        sessionCount: session.sessionCount,
      },
      usage: {
        inputTokens: session.inputTokens,
        outputTokens: session.outputTokens,
        cacheReadTokens: session.cacheReadTokens,
        cacheWriteTokens: session.cacheWriteTokens,
        costUsd: null,
      },
      exitCode: completion.exitCode,
      signal: completion.signal,
      output: completion.stdout.trim(),
      structuredOutput: structuredOutputSummary(completion.stdout.trim()),
      error: status === "COMPLETED" ? null : redact(completion.stderr || (completion.exitCode === 0
        ? "DeepSeek Harness session ended without a completed turn/end event."
        : `DeepSeek Harness execution ${status.toLowerCase()}.`)),
      cancellation: { requested: canceled, mode: canceled ? "PROCESS_SIGNAL" : "NONE" },
      cleanup: { status: "NOT_RUN", completedAt: null, error: null },
    };
    handle.result = {
      executionId: normalizedResult.executionId,
      status: status === "COMPLETED" ? "COMPLETED" : status === "CANCELED" ? "CANCELED" : "FAILED",
      exitCode: completion.exitCode ?? undefined,
      output: normalizedResult.output,
      error: normalizedResult.error ?? undefined,
      normalizedResult,
    };
    return handle.result;
  }

  async cleanup(handle: DeepSeekExecutionHandle): Promise<void> {
    handle.cleanupPromise ??= (async () => {
      if (!handle.controller.signal.aborted && !handle.completed) await this.cancel(handle);
      await handle.completion.catch(() => undefined);
      handle.removeExternalAbort();
      try {
        await rm(handle.prepared.outputDirectory, { recursive: true, force: true });
        if (handle.result?.normalizedResult) handle.result.normalizedResult.cleanup = { status: "COMPLETED", completedAt: Date.now(), error: null };
      } catch (error) {
        if (handle.result?.normalizedResult) handle.result.normalizedResult.cleanup = { status: "FAILED", completedAt: Date.now(), error: redact(error instanceof Error ? error.message : String(error)) };
        throw error;
      }
    })();
    await handle.cleanupPromise;
  }

  async health(): Promise<ExecutorHealth> {
    if (!this.enabled()) return { status: "UNAVAILABLE", checkedAt: Date.now(), adapter: "deepseek-harness", version: ADAPTER_VERSION, details: "Experimental DeepSeek Harness adapter is disabled." };
    try {
      const configuredRoot = this.options.upstreamRoot ?? process.env.DEEPSEEK_HARNESS_ROOT;
      if (!configuredRoot?.trim()) throw new Error("DeepSeek Harness checkout root is not configured.");
      const root = path.resolve(configuredRoot);
      await (this.options.verifyInstallation ?? verifyPinnedDeepSeekInstallation)(root);
      await (this.options.verifyProvider ?? verifyPinnedLocalOllamaProvider)();
      return { status: "READY", checkedAt: Date.now(), adapter: "deepseek-harness", version: ADAPTER_VERSION };
    } catch (error) {
      return { status: "UNAVAILABLE", checkedAt: Date.now(), adapter: "deepseek-harness", version: ADAPTER_VERSION, details: redact(error instanceof Error ? error.message : String(error)) };
    }
  }

  private enabled() {
    return this.options.enabled ?? process.env.DEEPSEEK_HARNESS_EXECUTOR_ENABLED === "1";
  }
}

export async function verifyPinnedDeepSeekInstallation(root: string): Promise<DeepSeekInstallation> {
  if (!root || root === path.parse(root).root) throw new Error("DeepSeek Harness checkout root is not configured.");
  const [commit, status, packageJson] = await Promise.all([
    git(root, ["rev-parse", "HEAD"]),
    git(root, ["status", "--porcelain=v1", "--untracked-files=no"]),
    readFile(path.join(root, "package.json"), "utf8").then((value) => JSON.parse(value) as { version?: string }),
  ]);
  if (commit !== EXPECTED_COMMIT) throw new Error(`DeepSeek Harness commit mismatch: expected ${EXPECTED_COMMIT}, found ${commit}.`);
  if (status) throw new Error("Pinned DeepSeek Harness checkout has tracked modifications.");
  if (packageJson.version !== EXPECTED_VERSION) throw new Error(`DeepSeek Harness version mismatch: expected ${EXPECTED_VERSION}.`);
  const executable = path.join(root, "apps", "cli", "lib", "bin.js");
  const executableSha256 = createHash("sha256").update(await readFile(executable)).digest("hex");
  if (executableSha256 !== EXPECTED_EXECUTABLE_SHA256) {
    throw new Error(`DeepSeek Harness built CLI digest mismatch: expected ${EXPECTED_EXECUTABLE_SHA256}, found ${executableSha256}.`);
  }
  return { root, executable, executableSha256 };
}

export async function verifyPinnedLocalOllamaProvider() {
  const version = await execFileAsync("ollama", ["--version"], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
    timeout: 5_000,
  });
  if (version.stdout.trim() !== `ollama version is ${EXPECTED_OLLAMA_VERSION}`) {
    throw new Error(`Ollama version mismatch: expected ${EXPECTED_OLLAMA_VERSION}.`);
  }
  const response = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`Ollama model catalog returned HTTP ${response.status}.`);
  const catalog = await response.json() as { models?: Array<{ name?: string; digest?: string }> };
  const model = catalog.models?.find((candidate) => candidate.name === EXPECTED_MODEL);
  if (model?.digest !== EXPECTED_MODEL_DIGEST) {
    throw new Error(`Ollama model digest mismatch for ${EXPECTED_MODEL}.`);
  }
}

export function deepSeekChildEnvironment(prepared: DeepSeekPreparedExecution, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const allowed = ["PATH", "TMPDIR", "USER", "SHELL", "TERM", "LANG", "LC_ALL"];
  return {
    ...Object.fromEntries(allowed.flatMap((name) => env[name] ? [[name, env[name]]] : [])),
    HOME: prepared.runtimeHome,
    DSH_HOME: prepared.runtimeHome,
    DSH_TELEMETRY_DISABLED: "1",
    DSH_PERMISSION_MODE: prepared.request.isolation === "READ_ONLY" ? "read-only" : "workspace-write",
    DSH_TOOLS_MODE: "native",
    OLLAMA_API_KEY: "ollama-local-no-secret",
    CI: "1",
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never",
    GH_PROMPT_DISABLED: "1",
  };
}

function deepSeekPatch(input: { runtimeHome: string; repositoryRoot: string; isolation: ExecutorRequest["isolation"] }) {
  const mode = input.isolation === "READ_ONLY" ? "read-only" : "workspace-write";
  return `# Generated by Mission Control. No secrets are stored here.
- id: session-persistence-jsonl
  config:
    root: ${JSON.stringify(path.join(input.runtimeHome, "sessions"))}
    packChunks: false
    compression: none

- id: sandbox-policy
  config:
    mode: ${mode}
    workspaceRoot: ${JSON.stringify(input.repositoryRoot)}

- id: approval
  config:
    policy: never

- id: tool-web
  disabled: true

- id: web-search-deepseek
  disabled: true

- id: session-title-llm
  disabled: true

- id: llm-pi-ai
  config:
    providers:
      local-ollama:
        displayName: "Local Ollama"
        apiKeyEnv: OLLAMA_API_KEY
        api: openai-completions
        baseURL: "http://127.0.0.1:11434/v1"
        defaultContextWindow: 131072
        defaultMaxTokens: 8192
        models:
          - id: ${JSON.stringify(EXPECTED_MODEL)}
            name: "Qwen 3.5 35B A3B Q8"
            contextWindow: 131072
            maxTokens: 8192

- id: agent-default-model
  config:
    provider: ${EXPECTED_PROVIDER}
    model: ${JSON.stringify(EXPECTED_MODEL)}
`;
}

async function runDeepSeekProcess(input: Parameters<ProcessRunner>[0]): Promise<ProcessCompletion> {
  return await new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let lifecycleError: unknown;
    let spawnError: Error | undefined;
    let startedNotification: Promise<void> = Promise.resolve();
    let forced: ReturnType<typeof setTimeout> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let child: ChildProcess;
    const cleanup = () => {
      input.signal.removeEventListener("abort", terminate);
      if (forced) clearTimeout(forced);
      if (timeout) clearTimeout(timeout);
    };
    const signalTree = (signal: NodeJS.Signals) => {
      if (!child.pid) return;
      if (process.platform !== "win32") {
        try {
          process.kill(-child.pid, signal);
          return;
        } catch {
          // Fall back to the exact child while it is still live.
        }
      }
      if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    };
    let terminationRequested = false;
    const terminate = () => {
      if (settled || terminationRequested) return;
      terminationRequested = true;
      try {
        signalTree("SIGTERM");
      } catch (error) {
        lifecycleError ??= error;
      }
      forced = setTimeout(() => {
        if (settled) return;
        try {
          signalTree("SIGKILL");
        } catch (error) {
          lifecycleError ??= error;
        }
      }, PROCESS_TERMINATION_GRACE_MS);
      forced.unref?.();
    };
    child = spawn(process.execPath, [input.executable, ...input.argv], {
      cwd: input.cwd,
      env: input.env,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    input.signal.addEventListener("abort", terminate, { once: true });
    if (input.signal.aborted) terminate();
    child.stdout?.on("data", (chunk: Buffer) => { stdout = appendBounded(stdout, chunk); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr = appendBounded(stderr, chunk); });
    child.once("error", (error) => { spawnError = error; });
    if (child.pid) {
      startedNotification = Promise.resolve(input.onSpawn?.(child.pid)).catch((error) => {
        lifecycleError = error;
        terminate();
      });
    } else {
      lifecycleError = new Error("DeepSeek Harness executor did not expose an owned process identity.");
      terminate();
    }
    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      void (async () => {
        await startedNotification;
        if (child.pid) await input.onExit?.(child.pid, code ?? undefined);
        if (lifecycleError) throw lifecycleError;
        if (spawnError) throw spawnError;
        resolve({ exitCode: code, signal, stdout, stderr, startedAt, finishedAt: Date.now(), timedOut });
      })().catch(reject);
    });
    timeout = setTimeout(() => { timedOut = true; terminate(); }, input.timeoutMs);
    timeout.unref?.();
  });
}

export function deepSeekOwnedProcessGroupExists(processGroupId: number) {
  if (process.platform === "win32") return false;
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch {
    return false;
  }
}

async function summarizeDeepSeekSessions(runtimeHome: string) {
  const files = await walkFiles(path.join(runtimeHome, "sessions"));
  let toolCalls = 0;
  let modelRequests = 0;
  let retries = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let usageObserved = false;
  let finalTurnReason: string | null = null;
  for (const file of files.filter((candidate) => candidate.endsWith(".jsonl"))) {
    const content = await readFile(file, "utf8").catch(() => "");
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line) as DeepSeekSessionEvent;
        const type = String(item.type ?? item.event ?? "");
        if (type === "tool/call") toolCalls += 1;
        if (type === "request/header") modelRequests += 1;
        if (type === "llm/retry" || type.endsWith("/retry")) retries += 1;
        if (type === "turn/end") {
          const reason = item.data?.reason?.kind;
          if (typeof reason === "string") finalTurnReason = reason;
        }
        const usage = type === "assistant/message" ? item.data?.usage : undefined;
        if (usage) {
          usageObserved = true;
          inputTokens += finiteInteger(usage.inputTokens ?? usage.input_tokens) ?? 0;
          outputTokens += finiteInteger(usage.outputTokens ?? usage.output_tokens) ?? 0;
          cacheReadTokens += finiteInteger(usage.cacheReadTokens ?? usage.cache_read_tokens) ?? 0;
          cacheWriteTokens += finiteInteger(usage.cacheWriteTokens ?? usage.cache_write_tokens) ?? 0;
        }
      } catch {
        // Raw session artifacts remain diagnostic; malformed rows do not invent telemetry.
      }
    }
  }
  return {
    sessionCount: files.filter((candidate) => candidate.endsWith(".jsonl")).length,
    toolCalls,
    modelRequests,
    retries,
    inputTokens: usageObserved ? inputTokens : null,
    outputTokens: usageObserved ? outputTokens : null,
    cacheReadTokens: usageObserved ? cacheReadTokens : null,
    cacheWriteTokens: usageObserved ? cacheWriteTokens : null,
    finalTurnReason,
  };
}

async function walkFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map(async (entry) => {
    const candidate = path.join(root, entry.name);
    return entry.isDirectory() ? await walkFiles(candidate) : [candidate];
  }));
  return nested.flat();
}

function appendBounded(current: string, chunk: Buffer) {
  const next = current + chunk.toString("utf8");
  return Buffer.byteLength(next) > 20 * 1024 * 1024 ? next.slice(-20 * 1024 * 1024) : next;
}

function finiteInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function structuredOutputSummary(output: string) {
  try {
    const value = JSON.parse(output) as { summary?: unknown };
    return { schema: "factory-result/v1", summary: typeof value.summary === "string" ? value.summary.slice(0, 4_000) : null };
  } catch {
    return { schema: null, summary: null };
  }
}

function redact(value: string) {
  return value.replace(/(authorization|cookie|token|secret|password|api[-_]?key)\s*[:=]\s*([^\s,;]+)/gi, "$1=[REDACTED]").slice(0, 2_000);
}

async function git(cwd: string, args: string[]) {
  const result = await execFileAsync("git", args, { cwd, env: { PATH: process.env.PATH, HOME: process.env.HOME, GIT_TERMINAL_PROMPT: "0" }, maxBuffer: 2 * 1024 * 1024 });
  return result.stdout.trim();
}
