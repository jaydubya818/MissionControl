import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
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
  type VerificationCheckSpec,
  type VerificationExecutionContext,
  type Verifier,
  type WorkOrderVerificationSpec,
} from "@mission-control/workflow-engine/verification";

const execFileAsync = promisify(execFile);
const SAFE_EXECUTABLES = new Set([
  "pnpm", "npm", "node", "yarn", "python", "python3", "pytest",
  "bundle", "ruby", "rake", "go", "cargo", "wasm-pack", "make", "swift", "xcodebuild", "dotnet", "mvn", "gradle",
]);
const NEVER_EXECUTE = new Set(["DESTRUCTIVE", "PRODUCTION_ACCESS", "SECRETS_ACCESS", "PUBLISH"]);

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
    const deniedReason = commandDeniedReason(command, budget);
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
      try {
        const result = await execFileAsync(command.executable, command.args, {
          cwd: this.repositoryRoot,
          env: sanitizedEnvironment(scratchHome),
          timeout: command.timeoutMs,
          maxBuffer: 4 * 1024 * 1024,
          signal: context.signal,
        });
        const completedAt = Date.now();
        const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
        return commandResult(check, startedAt, completedAt, "PASS", "Command completed successfully.", output, command, context);
      } catch (error: any) {
        const completedAt = Date.now();
        const output = `${error?.stdout ?? ""}\n${error?.stderr ?? ""}`.trim();
        const timedOut = error?.killed || error?.signal === "SIGTERM";
        const summary = timedOut
          ? `Command timed out after ${command.timeoutMs}ms.`
          : `Command failed${Number.isSafeInteger(error?.code) ? ` with exit ${error.code}` : ""}.`;
        return commandResult(check, startedAt, completedAt, timedOut ? "ERROR" : "FAIL", summary, output, command, context);
      }
    } finally {
      await rm(scratchHome, { recursive: true, force: true });
    }
  }
}

function commandResult(
  check: VerificationCheckSpec,
  startedAt: number,
  completedAt: number,
  status: "PASS" | "FAIL" | "ERROR",
  summary: string,
  output: string,
  command: NonNullable<VerificationCheckSpec["command"]>,
  context: VerificationExecutionContext,
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
      },
    }],
    metadata: {
      command: [command.executable, ...command.args],
      commandClass: command.commandClass,
      policyDecision: "APPROVED",
    },
  };
}

function commandDeniedReason(command: NonNullable<VerificationCheckSpec["command"]>, budget?: WorkOrderVerificationSpec["changeBudget"]) {
  if (!SAFE_EXECUTABLES.has(command.executable)) return `Executable ${command.executable} is not in the Factory verification allowlist.`;
  const serialized = [command.executable, ...command.args].join(" ").toLowerCase();
  if (/\b(add|install|remove|uninstall|update|upgrade|publish|deploy|release|dlx|create|login|logout|link|unlink)\b/.test(serialized)) {
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
function sanitizedEnvironment(scratchHome: string) {
  const allowed = ["PATH", "TMPDIR", "LANG", "LC_ALL", "CI", "NODE_ENV", "CARGO_HOME", "WASM_PACK_CACHE"];
  return {
    ...Object.fromEntries(allowed.flatMap((key) => (process.env[key] ? [[key, process.env[key]!]] : []))),
    HOME: scratchHome,
    npm_config_ignore_scripts: "true",
    npm_config_yes: "false",
    NPM_CONFIG_IGNORE_SCRIPTS: "true",
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
