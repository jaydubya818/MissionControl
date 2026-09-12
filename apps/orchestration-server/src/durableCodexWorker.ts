import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, lstat, mkdir, mkdtemp, readFile, readlink, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { runHarnessExecution, validateChangedFileScope, type RepositoryScope } from "@mission-control/workflow-engine";
import type { ExecutorEvent } from "@mission-control/workflow-engine";
import { CodexV1ExecutorAdapter } from "./codexExecutorAdapter.js";
import {
  parseGithubRepository,
  type GithubAppPublisher,
  type GithubPullRequestIdentity,
} from "./githubAppPublisher.js";
import { createSignedServiceCommand, type ServiceCapability } from "./serviceCommandClient.js";
import { ConvexActions } from "./convexCalls.js";

const execFileAsync = promisify(execFile);
const SECRET_PATTERN = /(gh[opsu]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
const MAX_SECRET_SCAN_BYTES = 20 * 1024 * 1024;

export interface GitBoundary {
  commonDir: string;
  branch: string;
  headSha: string;
  localConfigDigest: string;
}

interface ConvexActionClient {
  action(name: any, args: any): Promise<any>;
}

interface ExecutionManifest {
  workflowRunId: string;
  runId: string;
  claimId: string;
  leaseExpiresAt: number;
  executionAttemptNumber: number;
  projectId: string;
  missionId?: string;
  missionPlanId?: string;
  workOrderId: string;
  taskId: string;
  factoryDefinitionVersionId: string;
  factoryConfigurationDigest: string;
  repositoryId: string;
  repository: string;
  providerRepositoryId?: string;
  defaultBranch: string;
  worktree: string;
  branch: string;
  prompt: string;
  model?: string;
  allowedTools: string[];
  scopes: Array<RepositoryScope & { id: string; name: string }>;
  policy: {
    allowedCommands: string[];
    maxCostUsd: number;
    maxAttempts: number;
    timeoutMinutes: number;
    stopCondition: string;
  };
  github: { installationId: string; appId: string; accountLogin: string };
  lineage: Record<string, string | undefined>;
  checkpoint: { phase?: string; summary?: string; baseSha?: string; headSha?: string; pullRequestUrl?: string };
  cancellationRequested: boolean;
}

export interface DurableCodexWorkerOptions {
  client: ConvexActionClient;
  publisher: GithubAppPublisher;
  projectId: string;
  repositoryId: string;
  repositoryRoot: string;
  workerId?: string;
  pollIntervalMs?: number;
  leaseDurationMs?: number;
  heartbeatIntervalMs?: number;
  executor: CodexV1ExecutorAdapter;
}

export class DurableCodexWorker {
  private readonly workerId: string;
  private readonly pollIntervalMs: number;
  private readonly leaseDurationMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly executor: CodexV1ExecutorAdapter;
  private stopped = false;
  private activeAbortController: AbortController | null = null;
  private loopPromise: Promise<void> | null = null;

  constructor(private readonly options: DurableCodexWorkerOptions) {
    this.workerId = options.workerId ?? `codex-worker:${process.pid}`;
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    this.leaseDurationMs = options.leaseDurationMs ?? 60_000;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15_000;
    this.executor = options.executor;
    if (!Number.isSafeInteger(this.leaseDurationMs) || this.leaseDurationMs < 10_000 || this.leaseDurationMs > 5 * 60_000) {
      throw new Error("Worker lease duration must be between 10 seconds and 5 minutes.");
    }
    if (!Number.isSafeInteger(this.heartbeatIntervalMs) || this.heartbeatIntervalMs < 1_000) {
      throw new Error("Worker heartbeat interval must be at least one second.");
    }
    if (this.heartbeatIntervalMs >= this.leaseDurationMs / 2) {
      throw new Error("Worker heartbeat interval must be less than half of the lease duration.");
    }
  }

  start() {
    if (this.loopPromise) return;
    this.stopped = false;
    this.loopPromise = this.loop().finally(() => { this.loopPromise = null; });
  }

  async stop() {
    this.stopped = true;
    this.activeAbortController?.abort();
    await this.loopPromise;
  }

  async runOnce(): Promise<boolean> {
    const manifest = await this.claim();
    if (!manifest) return false;
    await this.executeClaim(manifest);
    return true;
  }

  private async loop() {
    while (!this.stopped) {
      try {
        const claimed = await this.runOnce();
        if (!claimed) await wait(this.pollIntervalMs);
      } catch (error) {
        console.error(`[codex-worker] ${safeError(error)}`);
        await wait(this.pollIntervalMs);
      }
    }
  }

  private async claim(): Promise<ExecutionManifest | null> {
    const claimId = randomUUID();
    return await this.command("executions.claim", ConvexActions.serviceCommands.claimExecution, {
      projectId: this.options.projectId,
      repositoryId: this.options.repositoryId,
      workerId: this.workerId,
      claimId,
      leaseDurationMs: this.leaseDurationMs,
    });
  }

  private async executeClaim(manifest: ExecutionManifest) {
    const abortController = new AbortController();
    this.activeAbortController = abortController;
    let heartbeatRunning = false;
    const leaseState: { error: Error | null } = { error: null };
    let currentPhase: "CLAIMED" | "PREPARING" | "EXECUTING" | "VALIDATING" | "PUBLISHING" = "CLAIMED";
    let checkpointSummary = "Execution lease claimed.";
    let baseSha = manifest.checkpoint.baseSha;
    let headSha = manifest.checkpoint.headSha;
    let approvedChangedFiles: string[] = [];

    const heartbeat = async () => {
      if (heartbeatRunning || abortController.signal.aborted) return;
      heartbeatRunning = true;
      try {
        const result = await this.command("executions.heartbeat", ConvexActions.serviceCommands.heartbeatExecution, {
          workflowRunId: manifest.workflowRunId,
          claimId: manifest.claimId,
          leaseDurationMs: this.leaseDurationMs,
          phase: currentPhase,
          checkpointSummary,
          baseSha,
          headSha,
        });
        if (result?.cancellationRequested) abortController.abort();
      } catch (error) {
        leaseState.error = error instanceof Error ? error : new Error(String(error));
        abortController.abort();
      } finally {
        heartbeatRunning = false;
      }
    };
    const heartbeatTimer = setInterval(() => void heartbeat(), this.heartbeatIntervalMs);

    try {
      if (manifest.cancellationRequested) {
        await this.finalize(manifest, { status: "CANCELED", summary: "Execution canceled before worktree preparation.", failureReason: "Operator cancellation requested." });
        return;
      }
      currentPhase = "PREPARING";
      const prepared = await prepareWorktree({
        repositoryRoot: this.options.repositoryRoot,
        worktree: manifest.worktree,
        branch: manifest.branch,
        baseBranch: manifest.defaultBranch,
        checkpointBaseSha: baseSha,
      });
      baseSha = prepared.baseSha;
      await assertGitBoundary(manifest.worktree, prepared.gitBoundary, {
        expectedBranch: manifest.branch,
        requireHeadDescendantOf: baseSha,
      });
      await assertSafeGitPublicationConfig(manifest.worktree);
      checkpointSummary = prepared.recovered
        ? "Recovered the existing durable worktree and exact branch."
        : "Created the isolated durable worktree and exact branch.";
      await heartbeat();
      if (abortController.signal.aborted) throw new CancellationError(leaseState.error?.message);

      const alreadyCommitted = prepared.headSha !== prepared.baseSha && prepared.changedFiles.length === 0;
      if (!alreadyCommitted) {
        currentPhase = "EXECUTING";
        checkpointSummary = "Codex is executing the frozen approved request.";
        await heartbeat();
        const requestHash = createHash("sha256").update(frozenPrompt(manifest)).digest("hex");
        const bufferedEvents: ExecutorEvent[] = [];
        const executorRequest = {
          executionId: `${manifest.runId}:${manifest.executionAttemptNumber}`,
          repositoryRoot: manifest.worktree,
          workingDirectory: manifest.worktree,
          prompt: frozenPrompt(manifest),
          provider: undefined,
          model: manifest.model ?? undefined,
          allowedPaths: manifest.scopes.flatMap((scope) => scope.includePaths),
          deniedPaths: manifest.scopes.flatMap((scope) => scope.excludePaths ?? []),
          timeoutMs: manifest.policy.timeoutMinutes * 60_000,
          isolation: "WORKSPACE_WRITE" as const,
        };
        const estimate = await this.executor.estimate(executorRequest);
        if (estimate.estimatedCostUsd !== null && estimate.estimatedCostUsd > manifest.policy.maxCostUsd) {
          throw new Error(`Executor estimate $${estimate.estimatedCostUsd.toFixed(2)} exceeds the approved $${manifest.policy.maxCostUsd.toFixed(2)} limit.`);
        }
        const result = await runHarnessExecution(this.executor, executorRequest, {
          emit: (event) => { bufferedEvents.push(event); },
          signal: abortController.signal,
        });
        await this.report(manifest, `executor:${manifest.executionAttemptNumber}`, bufferedEvents.map(mapExecutorEvent), [{
          artifactType: "STRUCTURED_OUTPUT",
          name: `Codex result for Attempt ${manifest.executionAttemptNumber}`,
          description: result.output?.slice(0, 4_000) ?? result.error,
          metadata: { requestHash: `sha256:${requestHash}`, status: result.status, executionAttemptNumber: manifest.executionAttemptNumber, estimate, maxCostUsd: manifest.policy.maxCostUsd },
        }]);
        if (result.status === "CANCELED") throw new CancellationError("Codex execution was canceled.");
        if (result.status !== "COMPLETED") throw new Error(result.error ?? "Codex execution failed.");
      }

      currentPhase = "VALIDATING";
      checkpointSummary = "Codex completed; enforcing file scope and verification policy before publication.";
      await heartbeat();
      if (abortController.signal.aborted) throw new CancellationError(leaseState.error?.message);
      const changedFiles = await completeChangedFileSet(manifest.worktree, baseSha);
      if (changedFiles.length === 0) throw new Error("Execution produced no repository changes.");
      const violations = validateChangedFileScope(changedFiles, manifest.scopes);
      if (violations.length) {
        const summary = `Publication blocked: ${violations.length} changed file(s) violate approved repository scope.`;
        await this.report(manifest, `policy-deviation:${manifest.executionAttemptNumber}`, [{
          eventType: "POLICY_DEVIATION",
          status: "FAILED",
          commandSummary: summary,
          errorCategory: "APPROVED_FILE_SCOPE_VIOLATION",
          errorSummary: violations.map((item) => `${item.path}: ${item.reason}`).join("; "),
          metadata: { violations, changedFiles },
        }], [{
          artifactType: "VERIFICATION_EVIDENCE",
          name: "Approved file-scope deviation",
          description: violations.map((item) => `${item.path}: ${item.reason}`).join("\n"),
          metadata: { outcome: "BLOCKED", violations, changedFiles, approvedScopes: manifest.scopes },
        }]);
        await this.finalize(manifest, { status: "FAILED", summary, failureReason: summary, baseSha });
        return;
      }
      await scanChangedFilesForSecrets(manifest.worktree, changedFiles);
      if (manifest.policy.allowedCommands.length === 0) {
        throw new Error("No approved verification commands are bound to this Attempt; publication fails closed.");
      }
      const verificationBoundary = await captureGitBoundary(manifest.worktree);
      await runVerificationCommands(manifest.worktree, manifest.policy.allowedCommands, manifest.policy.timeoutMinutes, abortController.signal, async (command, result) => {
        await this.report(manifest, `verify:${createHash("sha256").update(command).digest("hex").slice(0, 16)}`, [{
          eventType: "COMMAND_EXECUTED",
          status: result.ok ? "PASS" : "FAIL",
          commandSummary: command,
          toolName: "policy-verifier",
          startedAt: result.startedAt,
          endedAt: result.endedAt,
          errorCategory: result.ok ? undefined : "TARGETED_CHECK_FAILED",
          errorSummary: result.error,
          metadata: { exitCode: result.exitCode, outputSummary: result.output },
        }], result.ok ? [{
          artifactType: "TEST_OUTPUT",
          name: `Verification: ${command}`,
          description: result.output,
          metadata: { command, exitCode: result.exitCode, status: "PASS" },
        }] : undefined);
      });
      if (abortController.signal.aborted) throw new CancellationError(leaseState.error?.message);

      await assertGitBoundary(manifest.worktree, verificationBoundary, {
        expectedBranch: manifest.branch,
        expectedHead: verificationBoundary.headSha,
        requireHeadDescendantOf: baseSha,
      });
      await assertGitBoundary(manifest.worktree, prepared.gitBoundary, {
        expectedBranch: manifest.branch,
        requireHeadDescendantOf: baseSha,
      });
      await assertSafeGitPublicationConfig(manifest.worktree);

      const verifiedChangedFiles = await completeChangedFileSet(manifest.worktree, baseSha);
      if (verifiedChangedFiles.length === 0) throw new Error("Verification left no repository changes to publish.");
      const postVerificationViolations = validateChangedFileScope(verifiedChangedFiles, manifest.scopes);
      if (postVerificationViolations.length) {
        const summary = `Publication blocked: verification produced ${postVerificationViolations.length} changed file(s) outside approved repository scope.`;
        await this.report(manifest, `post-verification-policy-deviation:${manifest.executionAttemptNumber}`, [{
          eventType: "POLICY_DEVIATION",
          status: "FAILED",
          commandSummary: summary,
          errorCategory: "APPROVED_FILE_SCOPE_VIOLATION",
          errorSummary: postVerificationViolations.map((item) => `${item.path}: ${item.reason}`).join("; "),
          metadata: { violations: postVerificationViolations, changedFiles: verifiedChangedFiles, source: "verification-command" },
        }], [{
          artifactType: "VERIFICATION_EVIDENCE",
          name: "Post-verification file-scope deviation",
          description: postVerificationViolations.map((item) => `${item.path}: ${item.reason}`).join("\n"),
          metadata: { outcome: "BLOCKED", violations: postVerificationViolations, changedFiles: verifiedChangedFiles, approvedScopes: manifest.scopes },
        }]);
        await this.finalize(manifest, { status: "FAILED", summary, failureReason: summary, baseSha });
        return;
      }
      approvedChangedFiles = verifiedChangedFiles;
      await this.report(manifest, `files:${manifest.executionAttemptNumber}`, verifiedChangedFiles.map((repositoryPath) => ({
        eventType: "FILE_CHANGED",
        status: "COMPLETED",
        commandSummary: repositoryPath,
        metadata: { repositoryPath, approvedScope: true, verifiedAfterPolicyCommands: true },
      })));
      await stageAndScan(manifest.worktree, verifiedChangedFiles);

      const currentHead = await git(manifest.worktree, ["rev-parse", "HEAD"]);
      if (currentHead !== baseSha && (await git(manifest.worktree, ["status", "--porcelain"])) === "") {
        headSha = currentHead;
      } else {
        const commitMessage = `Mission Control: ${manifest.runId} ${manifest.taskId}`;
        await git(manifest.worktree, [
          "-c", "user.name=Mission Control GitHub App",
          "-c", "user.email=mission-control[bot]@users.noreply.github.com",
          "-c", "core.hooksPath=/dev/null",
          "-c", "commit.gpgSign=false",
          "commit", "-m", commitMessage,
        ]);
        headSha = await git(manifest.worktree, ["rev-parse", "HEAD"]);
      }
      await assertGitBoundary(manifest.worktree, prepared.gitBoundary, {
        expectedBranch: manifest.branch,
        expectedHead: headSha,
        requireHeadDescendantOf: baseSha,
      });
      await assertSafeGitPublicationConfig(manifest.worktree);

      currentPhase = "PUBLISHING";
      checkpointSummary = "Scope and verification passed; publishing the exact commit through the GitHub App.";
      await heartbeat();
      if (abortController.signal.aborted) throw new CancellationError(leaseState.error?.message);
      if (manifest.github.appId !== process.env.GITHUB_APP_ID?.trim()) {
        throw new Error("The bound GitHub App identity does not match the orchestration publisher configuration.");
      }
      const installation = await this.options.publisher.mintInstallationToken({
        installationId: manifest.github.installationId,
        repository: manifest.repository,
        providerRepositoryId: manifest.providerRepositoryId,
      }, abortController.signal);
      try {
        await pushWithInstallationToken({
          worktree: manifest.worktree,
          repository: manifest.repository,
          branch: manifest.branch,
          token: installation.token,
          signal: abortController.signal,
        });
        const pullRequest = await this.options.publisher.findOrCreatePullRequest({
          token: installation.token,
          repository: manifest.repository,
          branch: manifest.branch,
          baseBranch: manifest.defaultBranch,
          title: `Mission Control: ${manifest.prompt.split("\n")[0].slice(0, 180)}`,
          body: pullRequestBody(manifest, headSha),
        }, abortController.signal);
        await this.finalize(manifest, {
          status: "COMPLETED",
          summary: `Review-ready pull request #${pullRequest.number} published from the approved Attempt.`,
          baseSha,
          headSha,
          pullRequest,
          changedFiles: approvedChangedFiles,
        });
      } finally {
        // Drop the only strong reference as soon as publication completes.
        installation.token = "";
      }
    } catch (error) {
      if (leaseState.error || this.stopped) {
        const reason = this.stopped ? "Worker stopped" : "Lease lost";
        console.error(`[codex-worker] ${reason} for ${manifest.runId}; durable worktree and non-terminal lease retained for recovery.`);
        return;
      }
      const canceled = error instanceof CancellationError || abortController.signal.aborted;
      const message = safeError(error);
      await this.finalize(manifest, {
        status: canceled ? "CANCELED" : "FAILED",
        summary: canceled ? "Execution canceled by operator request." : "Execution failed before review-ready publication.",
        failureReason: message,
        baseSha,
        headSha,
      }).catch((finalizeError) => {
        console.error(`[codex-worker] Finalization failed for ${manifest.runId}: ${safeError(finalizeError)}`);
      });
    } finally {
      clearInterval(heartbeatTimer);
      this.activeAbortController = null;
    }
  }

  private async report(manifest: ExecutionManifest, packetId: string, events: any[], artifacts?: any[]) {
    return await this.command("executions.report", ConvexActions.serviceCommands.reportExecution, {
      workflowRunId: manifest.workflowRunId,
      claimId: manifest.claimId,
      packetId: `${manifest.workflowRunId}:${packetId}`,
      events,
      artifacts,
    });
  }

  private async finalize(manifest: ExecutionManifest, input: {
    status: "COMPLETED" | "FAILED" | "CANCELED";
    summary: string;
    failureReason?: string;
    baseSha?: string;
    headSha?: string;
    pullRequest?: GithubPullRequestIdentity;
    changedFiles?: string[];
  }) {
    return await this.command("executions.finalize", ConvexActions.serviceCommands.finalizeExecution, {
      workflowRunId: manifest.workflowRunId,
      claimId: manifest.claimId,
      status: input.status,
      summary: input.summary,
      failureReason: input.failureReason,
      baseSha: input.baseSha,
      headSha: input.headSha,
      pullRequest: input.pullRequest ? {
        ...input.pullRequest,
        branch: manifest.branch,
        baseBranch: manifest.defaultBranch,
        commitSha: input.headSha,
        metadata: {
          lineage: manifest.lineage,
          executionAttemptNumber: manifest.executionAttemptNumber,
          changedFiles: input.changedFiles ?? [],
          repositoryId: manifest.repositoryId,
          githubInstallationId: manifest.github.installationId,
          approvedScopeIds: manifest.scopes.map((scope) => scope.id),
        },
      } : undefined,
    });
  }

  private async command(capability: ServiceCapability, action: string, payload: any) {
    const command = createSignedServiceCommand({
      capability,
      projectId: this.options.projectId,
      repositoryId: this.options.repositoryId,
      payload,
    });
    return await this.options.client.action(action as any, command);
  }
}

export async function prepareWorktree(input: {
  repositoryRoot: string;
  worktree: string;
  branch: string;
  baseBranch: string;
  checkpointBaseSha?: string;
}) {
  const configuredRoot = path.resolve(input.repositoryRoot);
  const configuredWorktree = path.resolve(input.worktree);
  const configuredRelative = path.relative(configuredRoot, configuredWorktree);
  const repositoryRoot = await realpath(configuredRoot);
  const worktree = path.resolve(repositoryRoot, configuredRelative);
  const relative = path.relative(repositoryRoot, worktree);
  if (relative.startsWith("..") || path.isAbsolute(relative) || relative === "") {
    throw new Error("Durable worktree must be an isolated path inside the configured repository root.");
  }
  await git(repositoryRoot, ["check-ref-format", "--branch", input.branch]);
  let baseSha = input.checkpointBaseSha
    ? await git(repositoryRoot, ["rev-parse", `${input.checkpointBaseSha}^{commit}`])
    : await resolveBaseSha(repositoryRoot, input.baseBranch);
  let recovered = false;
  if (await exists(worktree)) {
    recovered = true;
    const resolved = await realpath(worktree);
    assertPathInside(repositoryRoot, resolved, "Existing durable worktree");
    const commonDir = path.resolve(resolved, await git(resolved, ["rev-parse", "--git-common-dir"]));
    const repositoryCommonDir = path.resolve(repositoryRoot, await git(repositoryRoot, ["rev-parse", "--git-common-dir"]));
    if (commonDir !== repositoryCommonDir) throw new Error("Existing durable worktree belongs to a different repository.");
    const branch = await git(resolved, ["branch", "--show-current"]);
    if (branch !== input.branch) throw new Error(`Existing durable worktree is bound to ${branch || "detached HEAD"}, not ${input.branch}.`);
    if (!input.checkpointBaseSha) {
      baseSha = await git(resolved, ["merge-base", "HEAD", baseSha]);
    }
  } else {
    await mkdir(path.dirname(worktree), { recursive: true });
    assertPathInside(repositoryRoot, await realpath(path.dirname(worktree)), "Durable worktree parent");
    const localBranchExists = await gitExitCode(repositoryRoot, ["show-ref", "--verify", `refs/heads/${input.branch}`]) === 0;
    await git(repositoryRoot, localBranchExists
      ? ["worktree", "add", worktree, input.branch]
      : ["worktree", "add", "-b", input.branch, worktree, baseSha]);
  }
  const headSha = await git(worktree, ["rev-parse", "HEAD"]);
  const changedFiles = await uncommittedChangedFiles(worktree);
  const gitBoundary = await captureGitBoundary(worktree);
  return { repositoryRoot, worktree, baseSha, headSha, changedFiles, recovered, gitBoundary };
}

export async function completeChangedFileSet(worktree: string, baseSha: string): Promise<string[]> {
  const [committed, uncommitted] = await Promise.all([
    gitNullList(worktree, ["diff", "--name-only", "-z", `${baseSha}...HEAD`]),
    uncommittedChangedFiles(worktree),
  ]);
  return [...new Set([...committed, ...uncommitted])].sort();
}

export function pullRequestBody(manifest: Pick<ExecutionManifest, "lineage" | "factoryConfigurationDigest" | "scopes" | "runId">, headSha: string) {
  const lineage = Object.entries(manifest.lineage)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => `- ${key}: \`${value}\``)
    .join("\n");
  return [
    "## Mission Control governed execution",
    "",
    "This pull request was created by the Mission Control GitHub App after the approved file scope and verification commands passed.",
    "",
    "### Lineage",
    lineage,
    `- commit: \`${headSha}\``,
    `- factoryConfigurationDigest: \`${manifest.factoryConfigurationDigest}\``,
    "",
    "### Approved file scopes",
    ...manifest.scopes.flatMap((scope) => scope.includePaths.map((pattern) => `- ${scope.name}: \`${pattern}\``)),
    "",
    `Idempotency identity: \`${manifest.runId}\` / \`${headSha}\``,
  ].join("\n");
}

function frozenPrompt(manifest: ExecutionManifest): string {
  return [
    "Implement the exact approved Task in this isolated durable worktree.",
    "Inspect and continue any existing partial changes because this Attempt may be recovering after a worker restart.",
    "Do not push, create a pull request, change approved scope, access credentials, or merge.",
    `Stop condition: ${manifest.policy.stopCondition}`,
    `WorkOrder: ${manifest.workOrderId}`,
    `Task: ${manifest.taskId}`,
    `Attempt: ${manifest.workflowRunId}`,
    "",
    manifest.prompt,
  ].join("\n");
}

function mapExecutorEvent(event: ExecutorEvent) {
  const typeMap: Record<ExecutorEvent["type"], string> = {
    EXECUTION_STARTED: "STEP_STARTED",
    COMMAND_STARTED: "TOOL_CALLED",
    COMMAND_COMPLETED: "COMMAND_EXECUTED",
    TOOL_CALLED: "TOOL_CALLED",
    ARTIFACT_PRODUCED: "ARTIFACT_CREATED",
    EXECUTION_COMPLETED: "STEP_COMPLETED",
    EXECUTION_FAILED: "RUN_FAILED",
    EXECUTION_CANCELED: "RUN_CANCELED",
  };
  return {
    eventType: typeMap[event.type],
    status: event.type.includes("FAILED") ? "FAILED" : event.type.includes("CANCELED") ? "CANCELED" : "COMPLETED",
    commandSummary: event.summary,
    startedAt: event.occurredAt,
    metadata: { executorSequence: event.sequence, ...event.metadata },
  };
}

export async function scanChangedFilesForSecrets(worktree: string, changedFiles: string[]) {
  for (const repositoryPath of changedFiles) {
    const absolute = path.join(worktree, repositoryPath);
    const info = await lstat(absolute).catch(() => null);
    if (!info) continue;
    if (info.size > MAX_SECRET_SCAN_BYTES) {
      throw new Error(`Changed file ${repositoryPath} exceeds the governed secret-scan limit.`);
    }
    const content = info.isSymbolicLink()
      ? await readlink(absolute).catch(() => "")
      : info.isFile()
        ? (await readFile(absolute)).toString("utf8")
        : "";
    if (SECRET_PATTERN.test(content)) throw new Error(`Potential credential material detected in ${repositoryPath}.`);
  }
}

async function stageAndScan(worktree: string, changedFiles: string[]) {
  await scanChangedFilesForSecrets(worktree, changedFiles);
  await git(worktree, ["add", "-A"]);
  const diff = await git(worktree, ["diff", "--cached", "--no-ext-diff", "--no-color"], 20 * 1024 * 1024);
  if (SECRET_PATTERN.test(diff)) throw new Error("Potential credential material detected in the staged change set.");
}

export async function runVerificationCommands(
  worktree: string,
  commands: string[],
  timeoutMinutes: number,
  signal: AbortSignal,
  report: (command: string, result: { ok: boolean; startedAt: number; endedAt: number; exitCode: number; output: string; error?: string }) => Promise<void>
) {
  const verificationHome = await mkdtemp(path.join(tmpdir(), "mc-verification-home-"));
  try {
    for (const command of commands) {
      if (signal.aborted) throw new CancellationError("Cancellation requested during verification.");
      const startedAt = Date.now();
      try {
        const result = await execFileAsync("/bin/sh", ["-c", command], {
          cwd: worktree,
          env: verificationEnvironment(verificationHome),
          signal,
          timeout: timeoutMinutes * 60_000,
          maxBuffer: 20 * 1024 * 1024,
        });
        const output = redact(`${result.stdout}\n${result.stderr}`).slice(-4_000);
        await report(command, { ok: true, startedAt, endedAt: Date.now(), exitCode: 0, output });
      } catch (error: any) {
        const output = redact(`${error?.stdout ?? ""}\n${error?.stderr ?? ""}`).slice(-4_000);
        const message = safeError(error);
        await report(command, { ok: false, startedAt, endedAt: Date.now(), exitCode: typeof error?.code === "number" ? error.code : 1, output, error: message });
        throw new Error(`Approved verification command failed: ${command}. ${message}`);
      }
    }
  } finally {
    await rm(verificationHome, { recursive: true, force: true });
  }
}

async function pushWithInstallationToken(input: {
  worktree: string;
  repository: string;
  branch: string;
  token: string;
  signal?: AbortSignal;
}) {
  parseGithubRepository(input.repository);
  const authorization = Buffer.from(`x-access-token:${input.token}`, "utf8").toString("base64");
  await execFileAsync("git", [
    "-c", "core.hooksPath=/dev/null",
    "-c", "credential.helper=",
    "-c", "http.sslVerify=true",
    "push",
    `https://github.com/${input.repository}.git`,
    `HEAD:refs/heads/${input.branch}`,
  ], {
    cwd: input.worktree,
    env: {
      ...childEnvironment(),
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_SYSTEM: "/dev/null",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
      GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${authorization}`,
    },
    signal: input.signal,
    timeout: 5 * 60_000,
    maxBuffer: 2 * 1024 * 1024,
  }).catch((error) => { throw new Error(`GitHub App push failed. ${safeError(error)}`); });
}

async function resolveBaseSha(repositoryRoot: string, baseBranch: string) {
  for (const reference of [`refs/remotes/origin/${baseBranch}`, `refs/heads/${baseBranch}`]) {
    if (await gitExitCode(repositoryRoot, ["show-ref", "--verify", reference]) === 0) {
      return await git(repositoryRoot, ["rev-parse", `${reference}^{commit}`]);
    }
  }
  throw new Error(`Base branch ${baseBranch} is not available in the configured checkout.`);
}

async function uncommittedChangedFiles(worktree: string) {
  const lists = await Promise.all([
    gitNullList(worktree, ["ls-files", "--modified", "--others", "--deleted", "--exclude-standard", "-z"]),
    gitNullList(worktree, ["diff", "--cached", "--name-only", "-z"]),
  ]);
  return [...new Set(lists.flat())].sort();
}

async function git(cwd: string, args: string[], maxBuffer = 2 * 1024 * 1024) {
  const result = await execFileAsync("git", args, { cwd, env: childEnvironment(), maxBuffer });
  return redact(result.stdout).trim();
}

async function gitNullList(cwd: string, args: string[]) {
  const result = await execFileAsync("git", args, { cwd, env: childEnvironment(), maxBuffer: 10 * 1024 * 1024, encoding: "buffer" });
  return result.stdout.toString("utf8").split("\0").filter(Boolean);
}

async function gitExitCode(cwd: string, args: string[]) {
  try {
    await execFileAsync("git", args, { cwd, env: childEnvironment(), maxBuffer: 1_024 * 1_024 });
    return 0;
  } catch (error: any) {
    return typeof error?.code === "number" ? error.code : 1;
  }
}

function childEnvironment(): NodeJS.ProcessEnv {
  const allowed = ["PATH", "HOME", "TMPDIR", "USER", "SHELL", "TERM", "LANG", "LC_ALL", "CODEX_HOME"];
  return Object.fromEntries(allowed.flatMap((name) => process.env[name] ? [[name, process.env[name]]] : []));
}

function verificationEnvironment(verificationHome: string): NodeJS.ProcessEnv {
  const allowed = ["PATH", "TMPDIR", "USER", "SHELL", "TERM", "LANG", "LC_ALL"];
  return {
    ...Object.fromEntries(allowed.flatMap((name) => process.env[name] ? [[name, process.env[name]]] : [])),
    HOME: verificationHome,
    CI: "true",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_SYSTEM: "/dev/null",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never",
    GH_PROMPT_DISABLED: "1",
  };
}

export async function captureGitBoundary(worktree: string): Promise<GitBoundary> {
  const commonDirValue = await git(worktree, ["rev-parse", "--git-common-dir"]);
  const commonDir = await realpath(path.resolve(worktree, commonDirValue));
  const branch = await git(worktree, ["branch", "--show-current"]);
  const headSha = await git(worktree, ["rev-parse", "HEAD"]);
  const localConfig = await execFileAsync("git", ["config", "--local", "--null", "--list"], {
    cwd: worktree,
    env: childEnvironment(),
    encoding: "buffer",
    maxBuffer: 2 * 1024 * 1024,
  });
  return {
    commonDir,
    branch,
    headSha,
    localConfigDigest: createHash("sha256").update(localConfig.stdout).digest("hex"),
  };
}

export async function assertGitBoundary(worktree: string, expected: GitBoundary, options: {
  expectedBranch?: string;
  expectedHead?: string;
  requireHeadDescendantOf?: string;
} = {}) {
  const current = await captureGitBoundary(worktree);
  if (current.commonDir !== expected.commonDir) {
    throw new Error("Git repository identity changed during governed execution.");
  }
  if (current.localConfigDigest !== expected.localConfigDigest) {
    throw new Error("Git repository configuration changed during governed execution.");
  }
  const expectedBranch = options.expectedBranch ?? expected.branch;
  if (current.branch !== expectedBranch) {
    throw new Error(`Git branch changed during governed execution (${current.branch || "detached HEAD"}).`);
  }
  if (options.expectedHead && current.headSha !== options.expectedHead) {
    throw new Error("Approved verification commands changed Git history; publication is blocked.");
  }
  if (options.requireHeadDescendantOf && await gitExitCode(worktree, [
    "merge-base", "--is-ancestor", options.requireHeadDescendantOf, current.headSha,
  ]) !== 0) {
    throw new Error("Execution HEAD is not descended from the approved base commit.");
  }
  return current;
}

export async function assertSafeGitPublicationConfig(worktree: string) {
  const result = await execFileAsync("git", ["config", "--local", "--name-only", "--list"], {
    cwd: worktree,
    env: childEnvironment(),
    maxBuffer: 2 * 1024 * 1024,
  });
  const prohibited = /^(?:include(?:if)?\.|url\..*\.insteadof$|http(?:\.|$)|credential(?:\.|$)|core\.(?:hookspath|sshcommand|fsmonitor)$|remote\..*\.proxy$|protocol\..*\.allow$|diff\.external$|diff\..*\.command$|filter\..*\.(?:clean|smudge|process)$|merge\..*\.driver$|gpg\.|commit\.gpgsign$)/i;
  const unsafeKeys = result.stdout.split(/\r?\n/).map((key) => key.trim()).filter((key) => prohibited.test(key));
  if (unsafeKeys.length > 0) {
    throw new Error(`Git repository configuration contains publication-unsafe settings: ${unsafeKeys.join(", ")}.`);
  }
}

async function exists(candidate: string) {
  return await access(candidate).then(() => true).catch(() => false);
}

function assertPathInside(root: string, candidate: string, label: string) {
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} must resolve inside the configured repository root.`);
  }
}

function redact(value: string) {
  return value
    .replace(/(authorization|cookie|token|secret|password|api[-_]?key)\s*[:=]\s*([^\s,;]+)/gi, "$1=[REDACTED]")
    .replace(SECRET_PATTERN, "[REDACTED]");
}

function safeError(error: unknown) {
  return redact(error instanceof Error ? error.message : String(error)).slice(0, 2_000);
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

class CancellationError extends Error {}
