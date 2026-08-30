import { execFile, spawn, type ChildProcess } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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
  GENERIC_HARNESS_CONTRACT_VERSION,
  NO_HARNESS_AUTHORITY,
} from "@mission-control/workflow-engine";
import {
  CODEX_V1_HARNESS_MANIFEST,
  boundedProviderMetadata,
  harnessCapabilityManifestDigest,
  harnessExecutionRequestDigest,
} from "@mission-control/workflow-engine";
import { captureHarnessRepositoryBaseline, collectHarnessRepositoryResult } from "./harnessRepository.js";

interface ProcessCompletion {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  output: string;
  stdout: string;
  stderr: string;
  diagnostics?: string;
  startedAt: number;
  finishedAt: number;
  timedOut: boolean;
}

interface CodexProcessError extends Error {
  code?: number;
  signal?: NodeJS.Signals | null;
}

interface CodexJsonlEvent {
  type?: unknown;
  usage?: Record<string, unknown>;
  item?: { type?: unknown; text?: unknown };
}

type ProcessRunner = (args: {
  executable: string;
  argv: string[];
  cwd: string;
  timeoutMs: number;
  signal: AbortSignal;
  outputPath: string;
  onSpawn?: (pid: number) => Promise<void> | void;
  onExit?: (pid: number, exitCode?: number) => Promise<void> | void;
}) => Promise<ProcessCompletion>;

interface CodexPreparedExecution {
  request: ExecutorRequest;
  context: HarnessExecutionContext;
  configurationIssues: ExecutorConfigurationIssue[];
  outputDirectory: string;
  outputPath: string;
  outputSchemaPath: string;
  baselineCommit: string | null;
  requestSha256: string;
  executableSha256: string | null;
}

interface CodexExecutionHandle {
  prepared: CodexPreparedExecution;
  controller: AbortController;
  completion: Promise<ProcessCompletion>;
  events: ExecutorEvent[];
  cancellationRequested: boolean;
  completed: boolean;
  removeExternalAbort: () => void;
  cleanupPromise?: Promise<void>;
  result?: ExecutorResult;
}

const PROCESS_TERMINATION_GRACE_MS = 5_000;
export const CODEX_WORKSPACE_PERMISSION_PROFILE = "mission-planner-contained";
export const CODEX_WORKSPACE_PERMISSION_CONFIG = [
  `default_permissions="${CODEX_WORKSPACE_PERMISSION_PROFILE}"`,
  `permissions.${CODEX_WORKSPACE_PERMISSION_PROFILE}.description="Repository-contained read-only planning"`,
  `permissions.${CODEX_WORKSPACE_PERMISSION_PROFILE}.filesystem={":minimal"="read",glob_scan_max_depth=8,":workspace_roots"={"."="read",".env"="deny",".env.*"="deny","**/.env"="deny","**/.env.*"="deny"}}`,
  `permissions.${CODEX_WORKSPACE_PERMISSION_PROFILE}.network.enabled=false`,
] as const;
const CODEX_PINNED_NATIVE_DIGESTS: Record<string, string> = {
  "darwin-arm64": "ae1d3ffe6d48aec6a4dc3f50e7eb8e0d11962485a6a9406c5a7012139383da02",
};
const REMOTE_OPENROUTER_CONFIG_OVERRIDES = [
  'model_provider="mission-control-openrouter"',
  'model_providers.mission-control-openrouter.name="OpenRouter"',
  'model_providers.mission-control-openrouter.base_url="https://openrouter.ai/api/v1"',
  'model_providers.mission-control-openrouter.env_key="OPENAI_API_KEY"',
  'model_providers.mission-control-openrouter.wire_api="responses"',
  "model_providers.mission-control-openrouter.supports_websockets=false",
] as const;
const FACTORY_RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schema", "status", "summary", "completedAcceptanceCriterionIds", "incompleteAcceptanceCriterionIds", "unknownAcceptanceCriterionIds", "verificationCommands", "knownRisks", "nextAction"],
  properties: {
    schema: { type: "string", enum: ["factory-result/v1"] },
    status: { type: "string", enum: ["COMPLETED", "BLOCKED", "FAILED"] },
    summary: { type: "string", minLength: 1, maxLength: 4_000 },
    completedAcceptanceCriterionIds: { type: "array", maxItems: 200, items: { type: "string", maxLength: 2_000 } },
    incompleteAcceptanceCriterionIds: { type: "array", maxItems: 200, items: { type: "string", maxLength: 2_000 } },
    unknownAcceptanceCriterionIds: { type: "array", maxItems: 200, items: { type: "string", maxLength: 2_000 } },
    verificationCommands: { type: "array", maxItems: 200, items: { type: "string", maxLength: 2_000 } },
    knownRisks: { type: "array", maxItems: 200, items: { type: "string", maxLength: 2_000 } },
    nextAction: { type: "string", maxLength: 4_000 },
  },
};

export class CodexV1ExecutorAdapter implements HarnessExecutorAdapter<CodexPreparedExecution, CodexExecutionHandle> {
  constructor(
    private readonly executable = process.env.CODEX_EXECUTABLE ?? "codex",
    private readonly runner: ProcessRunner = runCodexProcess,
  ) {}

  capabilities(): ExecutorCapabilities {
    return {
      contractVersion: GENERIC_HARNESS_CONTRACT_VERSION,
      adapter: "codex",
      version: "v1",
      displayName: "Codex CLI",
      provider: "openai",
      capabilityManifest: CODEX_V1_HARNESS_MANIFEST,
      executionBackends: ["persistent-worker", "remote-sandbox"],
      authority: NO_HARNESS_AUTHORITY,
      supportsCancel: true,
      supportsResume: false,
      supportsRepositoryMutation: true,
      isolationModes: ["READ_ONLY", "WORKSPACE_WRITE"],
      emittedEvents: [
        "EXECUTION_STARTED",
        "COMMAND_STARTED",
        "COMMAND_COMPLETED",
        "ARTIFACT_PRODUCED",
        "EXECUTION_COMPLETED",
        "EXECUTION_FAILED",
        "EXECUTION_CANCELED",
      ],
    };
  }

  validateConfiguration(request: ExecutorRequest): ExecutorConfigurationIssue[] {
    const issues: ExecutorConfigurationIssue[] = [];
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
    if (request.provider && request.provider !== "openai") issues.push({ field: "provider", message: "codex/v1 uses the OpenAI provider route." });
    if (request.structuredOutput) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/.test(request.structuredOutput.schemaId)) {
        issues.push({ field: "structuredOutput.schemaId", message: "Structured-output schema identity is invalid." });
      }
      try {
        const encoded = JSON.stringify(request.structuredOutput.jsonSchema);
        if (!encoded || Buffer.byteLength(encoded) > 256_000) {
          issues.push({ field: "structuredOutput.jsonSchema", message: "Structured-output schema must be valid JSON no larger than 256 KB." });
        }
      } catch {
        issues.push({ field: "structuredOutput.jsonSchema", message: "Structured-output schema must be JSON serializable." });
      }
    }
    return issues;
  }

  async estimate(request: ExecutorRequest): Promise<ExecutorEstimate> {
    const complexity = Math.max(1, Math.ceil(request.prompt.length / 2_000));
    return {
      estimatedCostUsd: null,
      estimatedRuntimeMinutes: Math.min(Math.ceil(request.timeoutMs / 60_000), complexity * 15),
      confidence: "LOW",
    };
  }

  async prepare(
    request: ExecutorRequest,
    context: HarnessExecutionContext,
  ): Promise<CodexPreparedExecution> {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), "mc-codex-v1-"));
    try {
      const outputSchemaPath = path.join(outputDirectory, "factory-result.schema.json");
      await writeFile(
        outputSchemaPath,
        JSON.stringify(request.structuredOutput?.jsonSchema ?? FACTORY_RESULT_SCHEMA),
        { mode: 0o600 },
      );
      return {
        request: {
          ...request,
          allowedPaths: [...request.allowedPaths],
          deniedPaths: [...(request.deniedPaths ?? [])],
        },
        context,
        configurationIssues: this.validateConfiguration(request),
        outputDirectory,
        outputPath: path.join(outputDirectory, "result.txt"),
        outputSchemaPath,
        baselineCommit: await captureHarnessRepositoryBaseline(request.repositoryRoot).catch(() => null),
        requestSha256: harnessExecutionRequestDigest(request),
        executableSha256: await executableDigest(this.executable),
      };
    } catch (error) {
      await rm(outputDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  async execute(prepared: CodexPreparedExecution): Promise<CodexExecutionHandle> {
    const { emit, signal, processObserver } = prepared.context;
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", abort, { once: true });
    let sequence = 0;
    const events: ExecutorEvent[] = [];
    const send = async (type: ExecutorEvent["type"], summary: string, metadata?: Record<string, unknown>) => {
      const item = event(prepared.request.executionId, ++sequence, type, summary, metadata);
      events.push(item);
      await emit(item);
    };
    try {
      await send("EXECUTION_STARTED", "Codex execution started.", {
        adapter: "codex/v1",
        harness: "codex-cli/0.146.0",
        isolation: prepared.request.isolation,
        allowedPaths: prepared.request.allowedPaths,
        filesystemReadScope: prepared.request.filesystemReadScope ?? null,
        permissionProfile: prepared.request.filesystemReadScope === "WORKSPACE_ONLY"
          ? CODEX_WORKSPACE_PERMISSION_PROFILE
          : null,
      });
      if (prepared.configurationIssues.length) {
        const error = prepared.configurationIssues.map((issue) => `${issue.field}: ${issue.message}`).join(" ");
        await send("EXECUTION_FAILED", error);
      } else {
        await send("COMMAND_STARTED", "Codex CLI command started.");
      }
    } catch (error) {
      signal?.removeEventListener("abort", abort);
      await rm(prepared.outputDirectory, { recursive: true, force: true });
      throw error;
    }
    const handle: CodexExecutionHandle = {
      prepared,
      controller,
      events,
      cancellationRequested: controller.signal.aborted,
      completed: false,
      removeExternalAbort: () => signal?.removeEventListener("abort", abort),
      completion: Promise.resolve(undefined as never),
    };
    const startedAt = Date.now();
    handle.completion = prepared.configurationIssues.length > 0
      ? Promise.resolve({
          exitCode: null,
          signal: null,
          output: "",
          stdout: "",
          stderr: "",
          diagnostics: prepared.configurationIssues.map((issue) => `${issue.field}: ${issue.message}`).join(" "),
          startedAt,
          finishedAt: Date.now(),
          timedOut: false,
        })
      : this.runner({
      executable: this.executable,
      argv: commandArguments(prepared.request, prepared.outputPath, prepared.outputSchemaPath),
      cwd: prepared.request.workingDirectory,
      timeoutMs: prepared.request.timeoutMs,
      signal: controller.signal,
      outputPath: prepared.outputPath,
      onSpawn: (pid) => processObserver?.started({ pid, startedAt: Date.now() }),
      onExit: (pid, exitCode) => processObserver?.terminated({ pid, exitCode, terminatedAt: Date.now() }),
      }).catch((cause): ProcessCompletion => ({
      exitCode: null,
      signal: null,
      output: "",
      stdout: "",
      stderr: "",
      diagnostics: redact(cause instanceof Error ? cause.message : String(cause)),
      startedAt,
      finishedAt: Date.now(),
      timedOut: false,
      })).then(async (completion) => {
      if (prepared.configurationIssues.length > 0) {
        handle.completed = true;
        return completion;
      }
      const telemetry = parseCodexJsonl(completion.stdout);
      for (const tool of telemetry.toolEvents) {
        await send("TOOL_CALLED", `Codex tool item completed: ${tool}.`, { itemType: tool });
      }
      await send("COMMAND_COMPLETED", "Codex CLI command completed.", { exitCode: completion.exitCode, signal: completion.signal });
      if (controller.signal.aborted) {
        await send("EXECUTION_CANCELED", "Codex execution canceled.");
      } else if (completion.timedOut) {
        await send("EXECUTION_FAILED", "Codex execution timed out.", { timeoutMs: prepared.request.timeoutMs });
      } else if (completion.exitCode === 0 && telemetry.turnCompleted && !telemetry.terminalError) {
        await send("ARTIFACT_PRODUCED", "Codex produced the execution result.", { artifactType: "CODEX_RESULT" });
        await send("EXECUTION_COMPLETED", "Codex execution completed.");
      } else {
        await send("EXECUTION_FAILED", completion.diagnostics || `Codex exited with status ${completion.exitCode ?? "unknown"}.`);
      }
      handle.completed = true;
      return completion;
    });
    return handle;
  }

  async collectResult(handle: CodexExecutionHandle): Promise<ExecutorResult> {
    if (handle.result) return handle.result;
    const completion = await handle.completion;
    const telemetry = parseCodexJsonl(completion.stdout);
    const repository = await collectHarnessRepositoryResult({
      repositoryRoot: handle.prepared.request.repositoryRoot,
      workingDirectory: handle.prepared.request.workingDirectory,
      baselineCommit: handle.prepared.baselineCommit,
      allowedPaths: handle.prepared.request.allowedPaths,
      deniedPaths: handle.prepared.request.deniedPaths ?? [],
    }).catch(() => ({
      root: handle.prepared.request.repositoryRoot,
      workingDirectory: handle.prepared.request.workingDirectory,
      baselineCommit: handle.prepared.baselineCommit,
      headCommit: null,
      headChanged: false,
      changedFiles: [],
      scopeViolations: [],
    }));
    const canceled = handle.cancellationRequested || handle.controller.signal.aborted;
    const normalizedStatus = canceled
      ? "CANCELED"
      : completion.timedOut
        ? "TIMED_OUT"
        : completion.exitCode === 0 && telemetry.turnCompleted && !telemetry.terminalError
          ? "COMPLETED"
          : "FAILED";
    const normalizedResult: HarnessNormalizedResult = {
      schemaVersion: "harness-result/v1",
      executionId: handle.prepared.request.executionId,
      status: normalizedStatus,
      harness: CODEX_V1_HARNESS_MANIFEST.identity,
      provenance: {
        provider: handle.prepared.request.provider ?? null,
        model: handle.prepared.request.model ?? null,
        capabilityManifestSha256: harnessCapabilityManifestDigest(CODEX_V1_HARNESS_MANIFEST),
        effectiveConfigSha256: CODEX_V1_HARNESS_MANIFEST.effectiveConfigSha256,
        executableSha256: handle.prepared.executableSha256,
        requestSha256: handle.prepared.requestSha256,
        providerMetadata: boundedProviderMetadata({
          protocol: "codex-jsonl",
          harnessCompletionObserved: telemetry.turnCompleted,
          sandbox: handle.prepared.request.isolation,
        }),
      },
      timing: {
        startedAt: completion.startedAt,
        finishedAt: completion.finishedAt,
        wallClockMs: Math.max(0, completion.finishedAt - completion.startedAt),
      },
      repository,
      events: {
        items: handle.events,
        toolCalls: telemetry.toolCalls,
        modelRequests: null,
        retries: null,
        sessionCount: telemetry.sessionCount,
      },
      usage: {
        inputTokens: telemetry.inputTokens,
        outputTokens: telemetry.outputTokens,
        cacheReadTokens: telemetry.cacheReadTokens,
        cacheWriteTokens: telemetry.cacheWriteTokens,
        costUsd: null,
      },
      exitCode: completion.exitCode,
      signal: completion.signal,
      output: completion.output,
      structuredOutput: structuredOutputSummary(completion.output, handle.prepared.request.structuredOutput?.schemaId),
      error: normalizedStatus === "COMPLETED" ? null : redact(completion.diagnostics || completion.stderr || (completion.exitCode === 0
        ? "Codex protocol ended without a successful turn.completed event."
        : `Codex execution ${normalizedStatus.toLowerCase()}.`)),
      cancellation: { requested: canceled, mode: canceled ? "PROCESS_SIGNAL" : "NONE" },
      cleanup: { status: "NOT_RUN", completedAt: null, error: null },
    };
    handle.result = {
      executionId: normalizedResult.executionId,
      status: normalizedStatus === "COMPLETED" ? "COMPLETED" : normalizedStatus === "CANCELED" ? "CANCELED" : "FAILED",
      exitCode: completion.exitCode ?? undefined,
      output: normalizedResult.output,
      error: normalizedResult.error ?? undefined,
      normalizedResult,
    };
    return handle.result;
  }

  async cancel(handle: CodexExecutionHandle): Promise<boolean> {
    if (handle.completed || handle.cancellationRequested) return false;
    handle.cancellationRequested = true;
    handle.controller.abort();
    return true;
  }

  async cleanup(handle: CodexExecutionHandle): Promise<void> {
    handle.cleanupPromise ??= (async () => {
      if (!handle.controller.signal.aborted && !handle.completed) await this.cancel(handle);
      await handle.completion.catch(() => undefined);
      handle.removeExternalAbort();
      try {
        await rm(handle.prepared.outputDirectory, { recursive: true, force: true });
        if (handle.result?.normalizedResult) {
          handle.result.normalizedResult.cleanup = { status: "COMPLETED", completedAt: Date.now(), error: null };
        }
      } catch (error) {
        if (handle.result?.normalizedResult) {
          handle.result.normalizedResult.cleanup = { status: "FAILED", completedAt: Date.now(), error: redact(error instanceof Error ? error.message : String(error)) };
        }
        throw error;
      }
    })();
    await handle.cleanupPromise;
  }

  createRemoteInvocation(request: ExecutorRequest, context: { repositoryRoot: string; resultPath: string }) {
    const remoteRequest = { ...request, repositoryRoot: context.repositoryRoot, workingDirectory: context.repositoryRoot };
    const outputSchemaPath = path.posix.join(path.posix.dirname(context.resultPath), "factory-result.schema.json");
    return {
      command: this.executable,
      // Remote execution is already confined by the disposable non-root
      // sandbox profile. Asking Codex to create a nested bubblewrap namespace
      // is incompatible with the intentionally empty capability boundary.
      args: commandArguments(remoteRequest, context.resultPath, outputSchemaPath, REMOTE_OPENROUTER_CONFIG_OVERRIDES, "danger-full-access"),
      resultPath: context.resultPath,
      outputSchemaPath,
      outputSchema: structuredClone(request.structuredOutput?.jsonSchema ?? FACTORY_RESULT_SCHEMA),
      model: request.model,
      prompt: request.prompt,
      allowedPaths: request.allowedPaths,
      timeoutMs: request.timeoutMs,
    };
  }

  async health(): Promise<ExecutorHealth> {
    try {
      if (path.isAbsolute(this.executable) || this.executable.includes(path.sep)) {
        await access(this.executable, constants.X_OK);
      }
      const version = await executableVersion(this.executable);
      if (version !== "codex-cli 0.146.0") {
        return { status: "UNAVAILABLE", checkedAt: Date.now(), adapter: "codex", version: "v1", details: `Expected codex-cli 0.146.0, found ${version || "unknown"}.` };
      }
      const executableSha256 = await executableDigest(this.executable);
      const expectedSha256 = CODEX_PINNED_NATIVE_DIGESTS[`${process.platform}-${process.arch}`];
      if (!expectedSha256 || executableSha256 !== expectedSha256) {
        return { status: "UNAVAILABLE", checkedAt: Date.now(), adapter: "codex", version: "v1", details: "Codex native executable does not match the evaluated platform digest." };
      }
      await verifyWorkspacePermissionProfile(this.executable);
      return { status: "READY", checkedAt: Date.now(), adapter: "codex", version: "v1" };
    } catch (error) {
      return {
        status: "UNAVAILABLE",
        checkedAt: Date.now(),
        adapter: "codex",
        version: "v1",
        details: redact(error instanceof Error ? error.message : "Codex executable is unavailable or not executable."),
      };
    }
  }
}

export function commandArguments(
  request: ExecutorRequest,
  outputPath: string,
  outputSchemaPath?: string,
  configOverrides: readonly string[] = [],
  sandboxMode?: "read-only" | "workspace-write" | "danger-full-access",
): string[] {
  const workspaceContained = request.filesystemReadScope === "WORKSPACE_ONLY" && sandboxMode === undefined;
  const effectiveOverrides = workspaceContained
    ? [...configOverrides, ...CODEX_WORKSPACE_PERMISSION_CONFIG]
    : configOverrides;
  return [
    "-a",
    "never",
    ...effectiveOverrides.flatMap((value) => ["-c", value]),
    "exec",
    ...(workspaceContained ? ["--strict-config"] : []),
    "--json",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    ...(workspaceContained ? [] : [
      "--sandbox",
      sandboxMode ?? (request.isolation === "READ_ONLY" ? "read-only" : "workspace-write"),
    ]),
    "--color",
    "never",
    "-C",
    request.workingDirectory,
    "-o",
    outputPath,
    ...(outputSchemaPath ? ["--output-schema", outputSchemaPath] : []),
    ...(request.model ? ["-m", request.model] : []),
    [
      request.prompt,
      "",
      request.isolation === "READ_ONLY"
        ? "Repository reads are limited to these approved repository-relative boundaries:"
        : "Repository mutation is limited to these approved repository-relative boundaries:",
      ...request.allowedPaths.map((candidate) => `- ${candidate}`),
      ...(request.deniedPaths?.length ? ["Denied repository-relative boundaries:", ...request.deniedPaths.map((candidate) => `- ${candidate}`)] : []),
      "Do not expose credentials in output, artifacts, or logs.",
    ].join("\n"),
  ];
}

export async function verifyWorkspacePermissionProfile(executable: string): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "mc-codex-containment-"));
  const workspace = path.join(root, "workspace");
  const allowedFile = path.join(workspace, "allowed.txt");
  const outsideFile = path.join(root, "outside.txt");
  const forbiddenWrite = path.join(workspace, "forbidden-write.txt");
  try {
    await mkdir(workspace);
    await writeFile(allowedFile, "allowed\n", { mode: 0o600 });
    await writeFile(outsideFile, "outside\n", { mode: 0o600 });
    const profileOverrides = CODEX_WORKSPACE_PERMISSION_CONFIG.filter((value) => !value.startsWith("default_permissions="));
    await execFileResult(executable, [
      "sandbox",
      "-P",
      CODEX_WORKSPACE_PERMISSION_PROFILE,
      ...profileOverrides.flatMap((value) => ["-c", value]),
      "-C",
      workspace,
      "--",
      "/bin/sh",
      "-c",
      'test -r "$1" && ! test -r "$2" && ! touch "$3" 2>/dev/null',
      "mission-planning-containment",
      allowedFile,
      outsideFile,
      forbiddenWrite,
    ]);
  } catch (error) {
    throw new Error(`Codex workspace permission profile failed its read/write containment probe: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function runCodexProcess(args: Parameters<ProcessRunner>[0]): Promise<ProcessCompletion> {
  return await new Promise((resolve, reject) => {
    let child: ChildProcess;
    let settledValue = false;
    let timedOut = false;
    let lifecycleError: unknown;
    let ownedProcessGroupId: number | undefined;
    let startedNotification: Promise<void> = Promise.resolve();
    let forcedTermination: ReturnType<typeof setTimeout> | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    const cleanup = () => {
      args.signal.removeEventListener("abort", requestTermination);
      if (forcedTermination) clearTimeout(forcedTermination);
      if (timeout) clearTimeout(timeout);
    };
    const signalOwnedProcessTree = (signal: NodeJS.Signals) => {
      if (typeof child.pid !== "number") return;
      if (process.platform !== "win32" && ownedProcessGroupId) {
        try {
          process.kill(-ownedProcessGroupId, signal);
          return;
        } catch {
          // The group may already have exited; fall back to the exact child.
        }
      }
      if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    };
    let terminationRequested = false;
    const requestTermination = () => {
      if (settledValue || terminationRequested) return;
      terminationRequested = true;
      try {
        signalOwnedProcessTree("SIGTERM");
      } catch (error) {
        lifecycleError ??= error;
      }
      forcedTermination = setTimeout(() => {
        if (settledValue) return;
        try {
          signalOwnedProcessTree("SIGKILL");
        } catch (error) {
          lifecycleError ??= error;
        }
      }, PROCESS_TERMINATION_GRACE_MS);
      forcedTermination.unref?.();
    };
    const complete = async (error: CodexProcessError | undefined, stdout: string, stderr: string, signal: NodeJS.Signals | null) => {
      if (settledValue) return;
      settledValue = true;
      cleanup();
      try {
        await startedNotification;
        if (typeof child.pid === "number") {
          await args.onExit?.(child.pid, typeof error?.code === "number" ? error.code : error ? 1 : 0);
        }
      } catch (observerError) {
        lifecycleError ??= observerError;
      }
      if (lifecycleError) return reject(lifecycleError);
      const output = await readFile(args.outputPath, "utf8").catch(() => "");
      resolve({
        exitCode: typeof error?.code === "number" ? error.code : error ? 1 : 0,
        signal,
        output: (output || lastAgentOutput(stdout)).trim(),
        stdout,
        stderr,
        diagnostics: error
          ? redact(timedOut ? `Codex execution timed out after ${args.timeoutMs}ms.` : stderr || error.message)
          : undefined,
        startedAt,
        finishedAt: Date.now(),
        timedOut,
      });
    };
    let stdout = "";
    let stderr = "";
    let spawnError: Error | undefined;
    const appendBounded = (current: string, chunk: Buffer) => {
      const next = current + chunk.toString("utf8");
      if (Buffer.byteLength(next) > 20 * 1024 * 1024) {
        lifecycleError ??= new Error("Codex process output exceeded the 20 MB runtime limit.");
        requestTermination();
        return next.slice(-20 * 1024 * 1024);
      }
      return next;
    };
    child = spawn(args.executable, args.argv, {
      cwd: args.cwd,
      detached: process.platform !== "win32",
      env: codexChildEnvironment(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk: Buffer) => { stdout = appendBounded(stdout, chunk); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr = appendBounded(stderr, chunk); });
    child.once("error", (error) => { spawnError = error; });
    child.once("close", (code, signal) => {
      const error = spawnError ?? (code === 0 ? undefined : Object.assign(
        new Error(signal ? `Codex exited after ${signal}.` : `Codex exited with status ${code ?? 1}.`),
        { code: code ?? 1, signal },
      ));
      void complete(error, stdout, stderr, signal).catch(reject);
    });
    if (typeof child.pid === "number") {
      ownedProcessGroupId = process.platform === "win32" ? undefined : child.pid;
      startedNotification = Promise.resolve(args.onSpawn?.(child.pid)).catch((error) => {
        lifecycleError = error;
        requestTermination();
      });
    } else {
      lifecycleError = new Error("Codex executor did not expose an owned process identity.");
      requestTermination();
    }
    args.signal.addEventListener("abort", requestTermination, { once: true });
    if (args.signal.aborted) requestTermination();
    timeout = setTimeout(() => {
      timedOut = true;
      requestTermination();
    }, args.timeoutMs);
    timeout.unref?.();
    child.stdin?.end();
  });
}

export function codexChildEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const allowed = ["PATH", "HOME", "TMPDIR", "USER", "SHELL", "TERM", "LANG", "LC_ALL", "CODEX_HOME"];
  return {
    ...Object.fromEntries(allowed.flatMap((name) => env[name] ? [[name, env[name]]] : [])),
    CI: "true",
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never",
    GH_PROMPT_DISABLED: "1",
  };
}

export function codexOwnedProcessGroupExists(processGroupId: number) {
  if (process.platform === "win32") return false;
  try {
    process.kill(-processGroupId, 0);
    return true;
  } catch {
    return false;
  }
}

function parseCodexJsonl(stdout: string) {
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let cacheReadTokens: number | null = null;
  let cacheWriteTokens: number | null = null;
  let sessionCount = 0;
  let turnCompleted = false;
  let terminalError = false;
  const toolEvents: string[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line) as CodexJsonlEvent;
      if (item.type === "thread.started") sessionCount += 1;
      if (item.type === "turn.completed") {
        turnCompleted = true;
        const usage = item.usage ?? {};
        inputTokens = finiteInteger(usage.input_tokens ?? usage.inputTokens);
        outputTokens = finiteInteger(usage.output_tokens ?? usage.outputTokens);
        cacheReadTokens = finiteInteger(usage.cached_input_tokens ?? usage.cache_read_tokens ?? usage.cacheReadTokens);
        cacheWriteTokens = finiteInteger(usage.cache_write_tokens ?? usage.cacheWriteTokens);
      }
      if (item.type === "turn.failed" || item.type === "error") terminalError = true;
      const itemType = item.item?.type;
      if (item.type === "item.completed" && typeof itemType === "string" && ["command_execution", "file_change", "mcp_tool_call", "web_search"].includes(itemType)) {
        toolEvents.push(itemType);
      }
    } catch {
      // Preserve malformed protocol output as raw diagnostics; never invent telemetry.
    }
  }
  return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, sessionCount, turnCompleted, terminalError, toolCalls: toolEvents.length, toolEvents };
}

function lastAgentOutput(stdout: string) {
  let output = "";
  for (const line of stdout.split("\n")) {
    try {
      const item = JSON.parse(line) as CodexJsonlEvent;
      if (item.type === "item.completed" && item.item?.type === "agent_message" && typeof item.item.text === "string") output = item.item.text;
    } catch {
      // Ignore non-protocol lines.
    }
  }
  return output;
}

function finiteInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function structuredOutputSummary(output: string, expectedSchema?: string) {
  try {
    const value = JSON.parse(output) as { schema?: unknown; summary?: unknown };
    return {
      schema: typeof value.schema === "string" ? value.schema : expectedSchema ?? null,
      summary: typeof value.summary === "string" ? value.summary.slice(0, 4_000) : null,
    };
  } catch {
    return { schema: null, summary: null };
  }
}

function event(executionId: string, sequence: number, type: ExecutorEvent["type"], summary: string, metadata?: Record<string, unknown>): ExecutorEvent {
  return { executionId, sequence, type, occurredAt: Date.now(), summary, metadata };
}

function redact(value: string): string {
  return value.replace(/(authorization|cookie|token|secret|password|api[-_]?key)\s*[:=]\s*([^\s,;]+)/gi, "$1=[REDACTED]").slice(0, 2_000);
}

async function executableVersion(executable: string) {
  return await new Promise<string>((resolve, reject) => {
    execFile(executable, ["--version"], { timeout: 5_000 }, (error, stdout) => error ? reject(error) : resolve(stdout.trim()));
  });
}

async function execFileResult(executable: string, argv: string[]) {
  return await new Promise<void>((resolve, reject) => {
    execFile(executable, argv, { timeout: 10_000 }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(redact(stderr || error.message)));
        return;
      }
      resolve();
    });
  });
}

async function executableDigest(executable: string) {
  let resolved = path.isAbsolute(executable) || executable.includes(path.sep) ? executable : undefined;
  if (!resolved) {
    for (const directory of process.env.PATH?.split(path.delimiter) ?? []) {
      const candidate = path.join(directory, executable);
      if (await access(candidate, constants.X_OK).then(() => true).catch(() => false)) {
        resolved = candidate;
        break;
      }
    }
  }
  if (!resolved) return null;
  const wrapper = await realpath(resolved).catch(() => resolved!);
  const native = await codexNativeExecutable(wrapper);
  const data = await readFile(native).catch(() => null);
  if (!data) return null;
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(data).digest("hex");
}

async function codexNativeExecutable(wrapper: string) {
  if (!wrapper.endsWith(".js")) return wrapper;
  const target = process.platform === "darwin" && process.arch === "arm64"
    ? ["@openai", "codex-darwin-arm64", "vendor", "aarch64-apple-darwin", "bin", "codex"]
    : null;
  if (!target) return wrapper;
  const packageRoot = path.dirname(path.dirname(wrapper));
  return path.join(packageRoot, "node_modules", ...target);
}
