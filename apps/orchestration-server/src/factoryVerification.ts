import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  classifyAuthorityMutations,
  resolveCheckIndependence,
} from "@mission-control/workflow-engine/verification-authority";
import {
  ChangeBudgetVerifier,
  NegativeConstraintVerifier,
  VerificationAuthorityVerifier,
  VerificationEngine,
  type CandidateChange,
  type VerificationCheckResult,
  type VerificationCheckStatus,
  type VerificationCheckSpec,
  type VerificationExecutionContext,
  type Verifier,
  type WorkOrderVerificationSpec,
} from "@mission-control/workflow-engine/verification";

const SAFE_EXECUTABLES = new Set([
  "corepack", "pnpm", "npm", "node", "yarn", "python", "python3", "pytest",
  "bundle", "ruby", "rake", "go", "cargo", "wasm-pack", "make", "swift", "xcodebuild", "dotnet", "mvn", "gradle",
]);
const NEVER_EXECUTE = new Set(["DESTRUCTIVE", "PRODUCTION_ACCESS", "SECRETS_ACCESS", "PUBLISH"]);
const FROZEN_OFFLINE_PNPM_INSTALL_ARGS = ["pnpm", "install", "--frozen-lockfile", "--offline"] as const;
const VERIFICATION_TERMINATION_GRACE_MS = 500;
const DEPENDENCY_ADMISSION_TIMEOUT_MS = 5_000;

export async function executeIndependentVerification(input: {
  workflowRunId: string;
  workOrderId: string;
  workOrderRevisionNumber: number;
  title: string;
  specification: any;
  candidate: CandidateChange;
  repositoryRoot: string;
  signal?: AbortSignal;
}) {
  const workOrder = normalizeSpecification(input);
  const engine = new VerificationEngine([
    // Authority first: if the candidate redefined its own proof, the command
    // results below are meaningless regardless of what they report.
    new VerificationAuthorityVerifier(),
    new ChangeBudgetVerifier(),
    new NegativeConstraintVerifier(),
    new FactoryCommandVerifier(input.repositoryRoot),
  ]);
  return await engine.execute({
    workflowRunId: input.workflowRunId,
    workOrder,
    candidate: input.candidate,
    signal: input.signal,
  });
}

/** Produce canonical policy evidence without loading or running candidate code. */
export async function evaluateVerificationPolicyRejection(input: Parameters<typeof executeIndependentVerification>[0]) {
  const workOrder = normalizeSpecification(input);
  const engine = new VerificationEngine([
    new VerificationAuthorityVerifier(),
    new ChangeBudgetVerifier(),
    new NegativeConstraintVerifier(),
  ]);
  // Command verifiers are deliberately absent: their proof remains NOT_CONFIGURED.
  return await engine.execute({ workflowRunId: input.workflowRunId, workOrder, candidate: input.candidate, signal: input.signal });
}

class FactoryCommandVerifier implements Verifier {
  readonly id = "factory-command/v1";
  readonly name = "Independent Factory command verifier";
  constructor(private readonly repositoryRoot: string) {}

  supports(check: VerificationCheckSpec) {
    return check.verifierId === this.id && Boolean(check.command);
  }

  async execute(context: VerificationExecutionContext, check: VerificationCheckSpec): Promise<VerificationCheckResult> {
    const startedAt = Date.now();
    const command = check.command!;
    const budget = context.workOrder.changeBudget;
    const deniedReason = factoryVerificationCommandDeniedReason(command, budget);
    if (deniedReason) {
      const completedAt = Date.now();
      return {
        checkId: check.id, name: check.name, category: check.category, verifierId: this.id, mandatory: check.mandatory,
        status: "FAIL", summary: deniedReason, acceptanceCriterionIds: check.acceptanceCriterionIds,
        startedAt, completedAt, durationMs: completedAt - startedAt, evidence: [], violations: [deniedReason],
        metadata: { blocking: true, commandClass: command.commandClass, commandDenied: true },
      };
    }
    const scratchHome = await mkdtemp(join(tmpdir(), "mission-control-verifier-"));
    try {
      const environment = sanitizedEnvironment(scratchHome, command.executable === "corepack");
      if (isFrozenOfflinePnpmInstall(command)) {
        const admission = await preflightFrozenOfflinePnpm(this.repositoryRoot, environment, context.signal);
        if (!admission.ok) {
          const completedAt = Date.now();
          return commandResult(check, startedAt, completedAt, admission.status, admission.summary, admission.output, command, context, {
            blocking: true,
            failureClass: "VERIFICATION_ENVIRONMENT_FAILURE",
            reasonCode: admission.reasonCode,
            dependencyAdmission: true,
          });
        }
      }
      const result = await runOwnedVerificationCommand({
        executable: command.executable,
        args: command.args,
        cwd: this.repositoryRoot,
        env: environment,
        timeoutMs: command.timeoutMs,
        signal: context.signal,
      });
      const completedAt = Date.now();
      const output = `${result.stdout}\n${result.stderr}`.trim();
      if (result.timedOut) {
        return commandResult(check, startedAt, completedAt, "TIMED_OUT", `Command timed out after ${command.timeoutMs}ms; its process tree was terminated.`, output, command, context, {
          blocking: true,
          failureClass: "VERIFICATION_FAILURE",
          reasonCode: "VERIFICATION_COMMAND_TIMEOUT",
          terminationSignal: result.signal,
        });
      }
      if (result.aborted) {
        return commandResult(check, startedAt, completedAt, "NOT_EVALUATED", "Command was cancelled before it could produce a result; its process tree was terminated.", output, command, context, {
          blocking: true,
          failureClass: "FACTORY_FAILURE",
          reasonCode: "VERIFICATION_COMMAND_CANCELLED",
          terminationSignal: result.signal,
        });
      }
      if (result.spawnError) {
        return commandResult(check, startedAt, completedAt, "ERROR", `Command could not start: ${result.spawnError}`, output, command, context, {
          blocking: true,
          failureClass: "VERIFICATION_ENVIRONMENT_FAILURE",
          reasonCode: "VERIFICATION_COMMAND_SPAWN_FAILED",
        });
      }
      if (result.exitCode !== 0) {
        return commandResult(check, startedAt, completedAt, "FAIL", `Command failed with exit ${result.exitCode ?? "unknown"}.`, output, command, context, {
          failureClass: "PRODUCT_FAILURE",
          reasonCode: "VERIFICATION_COMMAND_NONZERO_EXIT",
          exitCode: result.exitCode,
        });
      }
      return commandResult(check, startedAt, completedAt, "PASS", "Command completed successfully.", output, command, context, {
        reasonCode: "VERIFICATION_COMMAND_PASSED",
        exitCode: 0,
      });
    } finally {
      await rm(scratchHome, { recursive: true, force: true });
    }
  }
}

function commandResult(
  check: VerificationCheckSpec,
  startedAt: number,
  completedAt: number,
  status: VerificationCheckStatus,
  summary: string,
  output: string,
  command: NonNullable<VerificationCheckSpec["command"]>,
  context: VerificationExecutionContext,
  resultMetadata: Record<string, unknown> = {},
): VerificationCheckResult {
  const safeOutput = redact(output).slice(-20_000);
  const evidenceKey = `${check.id}:command-output`;
  // `independent: true` used to be hardcoded here, on every command result,
  // including `pnpm test` against a package.json the candidate had just
  // rewritten. `calculateCriterionCoverage` filters acceptance evidence on this
  // exact flag, so a Quality Contract requiring independent evidence was being
  // satisfied by the candidate's own definition of passing. It is now derived.
  const independence = resolveCheckIndependence({
    verifierId: check.verifierId,
    command,
    mutatedSurfaces: classifyAuthorityMutations(context.candidate).map((mutation) => mutation.surface),
  });
  return {
    checkId: check.id, name: check.name, category: check.category, verifierId: check.verifierId, mandatory: check.mandatory,
    status, summary, acceptanceCriterionIds: check.acceptanceCriterionIds, startedAt, completedAt,
    durationMs: Math.max(0, completedAt - startedAt), violations: status === "PASS" ? [] : [summary],
    evidence: [{
      evidenceKey, category: check.evidenceCategory, result: status, summary,
      acceptanceCriterionIds: check.acceptanceCriterionIds,
      producer: {
        id: "factory-command/v1",
        role: "INDEPENDENT_VERIFIER",
        // Lineage independence: the Verification Attempt genuinely is a
        // separate attempt, lease and invocation from the builder. Unchanged.
        independent: true,
        // Definition independence: derived, never self-declared. This is the
        // axis that says whether the candidate wrote what "passing" means.
        definitionAuthority: independence.independent ? "INDEPENDENT" : "CANDIDATE_DEPENDENT",
      },
      contentHash: `sha256:${createHash("sha256").update(output).digest("hex")}`,
      metadata: {
        executable: command.executable,
        args: command.args,
        commandClass: command.commandClass,
        output: safeOutput,
        outputTruncated: output.length > safeOutput.length,
        // Surfaced so an operator can see WHY a green check is not independent.
        independenceReason: independence.reason,
        ...resultMetadata,
      },
    }],
    metadata: {
      command: [command.executable, ...command.args],
      commandClass: command.commandClass,
      policyDecision: "APPROVED",
      ...resultMetadata,
    },
  };
}

function isFrozenOfflinePnpmInstall(command: NonNullable<VerificationCheckSpec["command"]>) {
  return command.executable === "corepack"
    && command.args.length === FROZEN_OFFLINE_PNPM_INSTALL_ARGS.length
    && command.args.every((argument, index) => argument === FROZEN_OFFLINE_PNPM_INSTALL_ARGS[index]);
}

export function factoryVerificationCommandDeniedReason(
  command: NonNullable<VerificationCheckSpec["command"]>,
  budget?: WorkOrderVerificationSpec["changeBudget"],
) {
  if (!SAFE_EXECUTABLES.has(command.executable)) return `Executable ${command.executable} is not in the Factory verification allowlist.`;
  // Corepack can dispatch several package managers and can fetch package-manager
  // binaries. Only the frozen, offline pnpm check approved by the contract may
  // bypass the general package-state mutation denial below.
  const frozenOfflinePnpmInstall = isFrozenOfflinePnpmInstall(command);
  if (command.executable === "corepack" && !frozenOfflinePnpmInstall) {
    return "Executable corepack is only allowed for: corepack pnpm install --frozen-lockfile --offline.";
  }
  const serialized = [command.executable, ...command.args].join(" ").toLowerCase();
  if (!frozenOfflinePnpmInstall && /\b(add|install|remove|uninstall|update|upgrade|publish|deploy|release|dlx|create|login|logout|link|unlink)\b/.test(serialized)) {
    return "Verification commands cannot install, publish, deploy, release, or change package state.";
  }
  if (/\b(production|prod|kubectl|terraform|ansible|aws|gcloud|az|ssh|curl|wget)\b/.test(serialized)) {
    return "Verification commands cannot access production or external administration tools.";
  }
  if (NEVER_EXECUTE.has(command.commandClass)) return `Command class ${command.commandClass} cannot run in independent verification.`;
  if (!budget) return "Independent command verification requires a change budget.";
  if (budget.prohibitedCommandClasses.includes(command.commandClass)) return `Command class ${command.commandClass} is prohibited by the WorkOrder budget.`;
  if (!budget.allowedCommandClasses.includes(command.commandClass)) return `Command class ${command.commandClass} is not allowed by the WorkOrder budget.`;
}

async function preflightFrozenOfflinePnpm(
  repositoryRoot: string,
  env: NodeJS.ProcessEnv,
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; status: VerificationCheckStatus; reasonCode: string; summary: string; output: string }> {
  let packageJson: any;
  try {
    packageJson = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));
  } catch (error) {
    return {
      ok: false,
      status: "NOT_EVALUATED",
      reasonCode: "DEPENDENCY_PACKAGE_MANIFEST_UNAVAILABLE",
      summary: "Offline dependency admission requires a readable package.json.",
      output: error instanceof Error ? error.message : String(error),
    };
  }
  const packageManager = typeof packageJson.packageManager === "string" ? packageJson.packageManager.trim() : "";
  const versionMatch = /^pnpm@([^+\s]+)(?:\+.*)?$/.exec(packageManager);
  if (!versionMatch) {
    return {
      ok: false,
      status: "NOT_EVALUATED",
      reasonCode: "DEPENDENCY_PACKAGE_MANAGER_UNPINNED",
      summary: "Offline dependency admission requires package.json#packageManager pinned to an exact pnpm version.",
      output: `Observed packageManager: ${packageManager || "<missing>"}`,
    };
  }
  try {
    await access(join(repositoryRoot, "pnpm-lock.yaml"));
  } catch {
    return {
      ok: false,
      status: "NOT_EVALUATED",
      reasonCode: "DEPENDENCY_LOCKFILE_MISSING",
      summary: "Offline dependency admission requires pnpm-lock.yaml.",
      output: "pnpm-lock.yaml was not found at the candidate repository root.",
    };
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abort, { once: true });
  try {
    const probe = await runOwnedVerificationCommand({
      executable: "corepack",
      args: ["pnpm", "--version"],
      cwd: repositoryRoot,
      env,
      timeoutMs: DEPENDENCY_ADMISSION_TIMEOUT_MS,
      signal: controller.signal,
    });
    const output = `${probe.stdout}\n${probe.stderr}`.trim();
    if (probe.timedOut) return {
      ok: false,
      status: "TIMED_OUT",
      reasonCode: "DEPENDENCY_PACKAGE_MANAGER_PROBE_TIMEOUT",
      summary: `Pinned pnpm ${versionMatch[1]} was not available from the offline Corepack cache within ${DEPENDENCY_ADMISSION_TIMEOUT_MS}ms.`,
      output,
    };
    if (probe.aborted) return {
      ok: false,
      status: "NOT_EVALUATED",
      reasonCode: "DEPENDENCY_ADMISSION_CANCELLED",
      summary: "Offline dependency admission was cancelled.",
      output,
    };
    if (probe.spawnError || probe.exitCode !== 0) return {
      ok: false,
      status: "NOT_EVALUATED",
      reasonCode: "DEPENDENCY_PACKAGE_MANAGER_UNAVAILABLE",
      summary: `Pinned pnpm ${versionMatch[1]} is unavailable from the admitted offline Corepack cache.`,
      output: output || probe.spawnError || `corepack exited ${probe.exitCode ?? "unknown"}`,
    };
    const observedVersion = probe.stdout.trim().split(/\s+/).at(-1) ?? "";
    if (observedVersion !== versionMatch[1]) return {
      ok: false,
      status: "NOT_EVALUATED",
      reasonCode: "DEPENDENCY_PACKAGE_MANAGER_VERSION_MISMATCH",
      summary: `Offline dependency admission resolved pnpm ${observedVersion || "<unknown>"}; the candidate requires ${versionMatch[1]}.`,
      output,
    };
    return { ok: true };
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}

type OwnedCommandResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  aborted: boolean;
  spawnError?: string;
};

async function runOwnedVerificationCommand(input: {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<OwnedCommandResult> {
  return await new Promise((resolve) => {
    let child: ChildProcess;
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let aborted = false;
    let spawnError: string | undefined;
    let settled = false;
    let forceTimer: ReturnType<typeof setTimeout> | undefined;
    const append = (current: string, chunk: Buffer) => {
      const next = current + chunk.toString("utf8");
      return Buffer.byteLength(next) > 4 * 1024 * 1024 ? next.slice(-4 * 1024 * 1024) : next;
    };
    const signalTree = (terminationSignal: NodeJS.Signals) => {
      if (typeof child?.pid !== "number") return;
      if (process.platform !== "win32") {
        try {
          process.kill(-child.pid, terminationSignal);
          return;
        } catch {
          // The group may already be gone. Fall through to the owned child.
        }
      }
      if (child.exitCode === null && child.signalCode === null) child.kill(terminationSignal);
    };
    const terminate = () => {
      if (settled) return;
      signalTree("SIGTERM");
      forceTimer ??= setTimeout(() => signalTree("SIGKILL"), VERIFICATION_TERMINATION_GRACE_MS);
      forceTimer.unref?.();
    };
    const onAbort = () => {
      aborted = true;
      terminate();
    };
    child = spawn(input.executable, input.args, {
      cwd: input.cwd,
      env: input.env,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    child.once("error", (error) => {
      spawnError = error.message;
    });
    child.once("close", (exitCode, closeSignal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (forceTimer) clearTimeout(forceTimer);
      input.signal?.removeEventListener("abort", onAbort);
      resolve({ exitCode, signal: closeSignal, stdout, stderr, timedOut, aborted, spawnError });
    });
    input.signal?.addEventListener("abort", onAbort, { once: true });
    if (input.signal?.aborted) onAbort();
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, input.timeoutMs);
    timeoutTimer.unref?.();
  });
}

function normalizeSpecification(input: { workOrderId: string; workOrderRevisionNumber: number; title: string; specification: any }): WorkOrderVerificationSpec {
  const specification = input.specification;
  if (!specification?.verificationContract || !Array.isArray(specification.acceptanceCriteria)) {
    throw new Error("The frozen Factory manifest has no executable verification contract.");
  }
  return {
    id: input.workOrderId,
    revisionNumber: input.workOrderRevisionNumber,
    title: input.title,
    riskLevel: specification.riskLevel,
    riskReasons: specification.riskReasons ?? [],
    acceptanceCriteria: specification.acceptanceCriteria,
    negativeConstraints: specification.negativeConstraints ?? [],
    changeBudget: specification.changeBudget,
    verificationContract: specification.verificationContract,
    requiredApprovals: specification.requiredApprovals ?? [],
  };
}

/**
 * Environment handed to a candidate-controlled command.
 *
 * `HOME` used to be forwarded. That is a credential-discovery vector, not a
 * convenience: the verifier runs on the same host as the Factory worker, so
 * `$HOME` is where `~/.ssh/`, `~/.config/gh/hosts.yml` (GitHub CLI tokens),
 * `~/.npmrc` (registry auth), `~/.git-credentials` and `~/.aws/credentials`
 * live. A candidate whose `package.json#scripts.test` reads those files and
 * prints them gets them straight into the verification log — and the command
 * allowlist never sees anything but `pnpm`.
 *
 * `HOME` is now redirected to a per-check scratch directory, so tools that
 * require a home directory still work and none of them resolve to the
 * operator's real one or to the candidate worktree.
 *
 * Lifecycle scripts are disabled across the Node package managers. `preinstall`
 * / `postinstall` / `prepare` are candidate-authored shell that would otherwise
 * execute before any check began.
 */
function sanitizedEnvironment(scratchHome: string, allowTrustedCorepackCache = false) {
  const allowed = ["PATH", "TMPDIR", "LANG", "LC_ALL", "CI", "NODE_ENV", "CARGO_HOME", "WASM_PACK_CACHE"];
  return {
    ...Object.fromEntries(allowed.flatMap((key) => (process.env[key] ? [[key, process.env[key]!]] : []))),
    HOME: scratchHome,
    npm_config_ignore_scripts: "true",
    npm_config_yes: "false",
    NPM_CONFIG_IGNORE_SCRIPTS: "true",
    npm_config_ignore_pnpmfile: "true",
    NPM_CONFIG_IGNORE_PNPMFILE: "true",
    COREPACK_ENABLE_NETWORK: "0",
    COREPACK_ENABLE_AUTO_PIN: "0",
    COREPACK_DEFAULT_TO_LATEST: "0",
    ...(allowTrustedCorepackCache ? {
      // Corepack cannot fetch under verification. It may read the operator's
      // pre-seeded package-manager binaries, which contain no credentials.
      COREPACK_HOME: process.env.COREPACK_HOME ?? join(homedir(), ".cache", "node", "corepack"),
    } : {}),
    CARGO_NET_OFFLINE: "true",
    // Refuse implicit registry auth even if a candidate writes its own .npmrc.
    npm_config_userconfig: `${scratchHome}/.npmrc-verifier-empty`,
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "",
  };
}

function redact(value: string) {
  return value.replace(/(authorization|cookie|token|secret|password|api[-_]?key)\s*[:=]\s*([^\s,;]+)/gi, "$1=[REDACTED]");
}
