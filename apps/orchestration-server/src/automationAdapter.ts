import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type AdapterType = "PLAYWRIGHT" | "API" | "TYPESCRIPT" | "PYTHON" | "SHELL" | "WORKFLOW" | "SKILL_PIPELINE";

export interface ExecutionManifest {
  adapterType: AdapterType;
  repository: string;
  repositoryRoot: string;
  workingDirectory: string;
  artifactPath: string;
  artifactContent?: string;
  artifactContentHash: string;
  timeoutMs: number;
  secretReferences: string[];
  configuration: Record<string, unknown>;
}

export interface NormalizedAutomationResult {
  status: "passed" | "failed" | "timed_out" | "cancelled" | "infrastructure_error";
  exitCode: number | null;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  tests: { total: number; passed: number; failed: number; skipped: number };
  artifacts: string[];
  evidence: string[];
  redactedLogs: string[];
  error: string | null;
}

const EXECUTABLES = new Set(["pnpm", "npm", "yarn", "node", "python", "python3", "pytest", "git", "gh", "curl", "bash"]);
const SENSITIVE = /(authorization|cookie|token|secret|password|api[-_]?key)\s*[:=]\s*([^\s,;]+)/gi;

export function safeRepositoryPath(root: string, relative: string): string {
  if (!relative || path.isAbsolute(relative) || relative.includes("\0")) throw new Error("Artifact path must be repository-relative");
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relative);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("Artifact path escapes the approved repository root");
  }
  return resolved;
}

export function parseAllowlistedCommand(command: string): string[] {
  if (!command.trim() || /[;&|`$<>]/.test(command)) throw new Error("Command contains unsupported shell syntax");
  const argv = command.trim().split(/\s+/);
  if (!EXECUTABLES.has(argv[0])) throw new Error(`Executable is not allowlisted: ${argv[0]}`);
  if (argv.some(value => value.includes("..") || value.includes("\0"))) throw new Error("Command arguments contain unsafe paths");
  return argv;
}

export function redactAutomationLog(value: string, secretValues: string[]): string {
  let result = value.replace(SENSITIVE, "$1=[REDACTED]");
  for (const secret of secretValues.filter(Boolean)) result = result.split(secret).join("[REDACTED]");
  return result.slice(0, 200_000);
}

export function verifyArtifactHash(content: string, expected: string): boolean {
  return `sha256:${createHash("sha256").update(content).digest("hex")}` === expected;
}

async function materializeArtifact(manifest: ExecutionManifest): Promise<string> {
  const artifact = safeRepositoryPath(manifest.repositoryRoot, manifest.artifactPath);
  if (manifest.artifactContent) {
    if (!verifyArtifactHash(manifest.artifactContent, manifest.artifactContentHash)) throw new Error("Approved artifact content hash does not match");
    await mkdir(path.dirname(artifact), { recursive: true });
    try {
      const existing = await readFile(artifact, "utf8");
      if (!verifyArtifactHash(existing, manifest.artifactContentHash)) {
        throw new Error("Repository artifact differs from the approved version");
      }
    } catch (error: any) {
      if (error?.code !== "ENOENT") throw error;
      await writeFile(artifact, manifest.artifactContent, { encoding: "utf8", flag: "wx" });
    }
  }
  const info = await stat(artifact);
  if (!info.isFile()) throw new Error("Approved artifact is not a file");
  return artifact;
}

function adapterCommand(manifest: ExecutionManifest, artifact: string): string[] {
  const relativeArtifact = path.relative(path.resolve(manifest.repositoryRoot, manifest.workingDirectory), artifact);
  if (manifest.adapterType === "PLAYWRIGHT") {
    return ["pnpm", "exec", "playwright", "test", "-c", "tests/automations/playwright.config.ts", relativeArtifact, "--reporter=json"];
  }
  // pnpm may resolve the workspace root before invoking tsx, so use the
  // already root-validated absolute artifact path for typed process adapters.
  if (manifest.adapterType === "TYPESCRIPT") return ["pnpm", "exec", "tsx", artifact];
  if (manifest.adapterType === "PYTHON") return ["python3", artifact];
  if (manifest.adapterType === "SHELL") return ["bash", artifact];
  if (manifest.adapterType === "WORKFLOW") {
    const command = String(manifest.configuration.command ?? "");
    return parseAllowlistedCommand(command);
  }
  throw new Error(`Adapter ${manifest.adapterType} does not use a process command`);
}

async function executeProcess(manifest: ExecutionManifest, artifact: string, signal?: AbortSignal) {
  const argv = adapterCommand(manifest, artifact);
  return await executeArgv(manifest, argv, signal);
}

async function executeArgv(manifest: ExecutionManifest, argv: string[], signal?: AbortSignal) {
  const cwd = safeRepositoryPath(manifest.repositoryRoot, manifest.workingDirectory || ".");
  const secretValues = manifest.secretReferences.map(name => process.env[name] ?? "");
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/(TOKEN|SECRET|PASSWORD|KEY|COOKIE|AUTH)/i.test(name) || manifest.secretReferences.includes(name)
  ));
  return await new Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean; cancelled: boolean }>((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += String(chunk); });
    child.stderr.on("data", chunk => { stderr += String(chunk); });
    let timedOut = false;
    let terminationRequested = false;
    let terminationRetryTimer: ReturnType<typeof setTimeout> | null = null;
    let forceKillTimer: ReturnType<typeof setTimeout> | null = null;
    const signalProcessTree = (terminationSignal: "SIGTERM" | "SIGKILL") => {
      if (process.platform !== "win32" && child.pid) {
        try {
          process.kill(-child.pid, terminationSignal);
          return;
        } catch {
          // The process group can briefly be unavailable immediately after
          // spawn. Fall through to the direct child and retry the group below.
        }
      }
      if (child.exitCode === null && child.signalCode === null) child.kill(terminationSignal);
    };
    const terminate = () => {
      if (terminationRequested) return;
      terminationRequested = true;
      signalProcessTree("SIGTERM");
      terminationRetryTimer = setTimeout(() => signalProcessTree("SIGTERM"), 25);
      terminationRetryTimer.unref?.();
      forceKillTimer = setTimeout(() => {
        signalProcessTree("SIGKILL");
      }, 1_000);
      forceKillTimer.unref?.();
    };
    const timer = setTimeout(() => { timedOut = true; terminate(); }, manifest.timeoutMs);
    const abort = () => terminate();
    const cleanup = () => {
      clearTimeout(timer);
      if (terminationRetryTimer) clearTimeout(terminationRetryTimer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      signal?.removeEventListener("abort", abort);
    };
    child.once("spawn", () => {
      if (terminationRequested) signalProcessTree("SIGTERM");
    });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    child.on("error", (error) => {
      cleanup();
      reject(error);
    });
    child.on("close", code => {
      cleanup();
      resolve({
        code,
        stdout: redactAutomationLog(stdout, secretValues),
        stderr: redactAutomationLog(stderr, secretValues),
        timedOut,
        cancelled: !!signal?.aborted,
      });
    });
  });
}

async function executeApi(manifest: ExecutionManifest, signal?: AbortSignal) {
  const config = manifest.configuration;
  const baseUrl = String(config.baseUrl ?? process.env.AUTOMATION_BASE_URL ?? "");
  const endpoint = String(config.endpoint ?? "/health");
  const url = new URL(endpoint, baseUrl);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("API adapter requires HTTP(S)");
  const method = String(config.method ?? "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) throw new Error("LEVEL_1 API adapters are read-only");
  const timeout = AbortSignal.timeout(manifest.timeoutMs);
  const combinedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetch(url, { method, signal: combinedSignal, redirect: "error" });
  const expected = Number(config.expectedStatus ?? 200);
  return { code: response.status === expected ? 0 : 1, stdout: JSON.stringify({ status: response.status }), stderr: "", timedOut: false, cancelled: false };
}

async function executePipeline(manifest: ExecutionManifest, signal?: AbortSignal) {
  const steps = manifest.configuration.steps;
  if (!Array.isArray(steps) || steps.length === 0) throw new Error("Skill pipeline requires at least one deterministic step");
  const logs: string[] = [];
  for (const [index, rawStep] of steps.entries()) {
    if (!rawStep || typeof rawStep !== "object") throw new Error(`Pipeline step ${index + 1} is invalid`);
    const step = rawStep as Record<string, unknown>;
    const adapterType = String(step.adapterType ?? "SHELL").toUpperCase();
    let result;
    if (adapterType === "API") {
      result = await executeApi({
        ...manifest,
        adapterType: "API",
        timeoutMs: Math.min(Number(step.timeoutMs ?? manifest.timeoutMs), manifest.timeoutMs),
        configuration: step,
      }, signal);
    } else {
      const command = String(step.command ?? "");
      const argv = parseAllowlistedCommand(command);
      result = await executeArgv({
        ...manifest,
        timeoutMs: Math.min(Number(step.timeoutMs ?? manifest.timeoutMs), manifest.timeoutMs),
      }, argv, signal);
    }
    logs.push(JSON.stringify({ step: index + 1, name: step.name ?? `step-${index + 1}`, code: result.code, stdout: result.stdout, stderr: result.stderr }));
    if (result.cancelled || result.timedOut || result.code !== 0) {
      return { ...result, stdout: logs.join("\n"), stderr: result.stderr || `Pipeline stopped at step ${index + 1}` };
    }
  }
  return { code: 0, stdout: logs.join("\n"), stderr: "", timedOut: false, cancelled: false };
}

export async function executeAutomation(manifest: ExecutionManifest, signal?: AbortSignal): Promise<NormalizedAutomationResult> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  try {
    const artifact = await materializeArtifact(manifest);
    const raw = manifest.adapterType === "API"
      ? await executeApi(manifest, signal)
      : manifest.adapterType === "SKILL_PIPELINE"
        ? await executePipeline(manifest, signal)
        : await executeProcess(manifest, artifact, signal);
    const completed = Date.now();
    const status = raw.cancelled ? "cancelled" : raw.timedOut ? "timed_out" : raw.code === 0 ? "passed" : "failed";
    let tests = { total: 0, passed: 0, failed: 0, skipped: 0 };
    if (manifest.adapterType === "PLAYWRIGHT" && raw.stdout) {
      try {
        const report = JSON.parse(raw.stdout);
        const specs = (report.suites ?? []).flatMap((suite: any) => suite.specs ?? []);
        tests = {
          total: specs.length,
          passed: specs.filter((spec: any) => spec.ok).length,
          failed: specs.filter((spec: any) => !spec.ok).length,
          skipped: 0,
        };
      } catch { /* raw log remains evidence when reporter parsing fails */ }
    }
    return {
      status, exitCode: raw.code, startedAt, completedAt: new Date(completed).toISOString(), durationMs: completed - started,
      tests, artifacts: [manifest.artifactPath], evidence: [], redactedLogs: [raw.stdout, raw.stderr].filter(Boolean),
      error: status === "passed" ? null : raw.stderr || `Adapter exited with ${raw.code}`,
    };
  } catch (error) {
    const completed = Date.now();
    const timedOut = error instanceof Error && ["TimeoutError"].includes(error.name);
    return {
      status: signal?.aborted ? "cancelled" : timedOut ? "timed_out" : "infrastructure_error", exitCode: null, startedAt,
      completedAt: new Date(completed).toISOString(), durationMs: completed - started,
      tests: { total: 0, passed: 0, failed: 0, skipped: 0 }, artifacts: [], evidence: [], redactedLogs: [],
      error: error instanceof Error ? redactAutomationLog(error.message, []) : "Unknown adapter failure",
    };
  }
}
