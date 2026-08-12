import { createHash, randomUUID } from "node:crypto";
import type { ConvexHttpClient } from "convex/browser";
import type { ExecutorEvent } from "@mission-control/workflow-engine";
import { CodexV1ExecutorAdapter } from "./codexExecutorAdapter.js";
import { ConvexActions, ConvexQueries } from "./convexCalls.js";
import { createSignedServiceCommand } from "./serviceCommandClient.js";
import { assertFactoryCandidateUnchanged, commitFactoryChanges, ensureFactoryWorktree, inspectCandidateChange, listChangedFiles, pushFactoryBranch } from "./factoryGitRuntime.js";
import { validateChangedFileScope } from "./factoryPathScope.js";
import { createOrReusePullRequest, loadGithubAppPrivateKey, mintInstallationToken } from "./githubAppRuntime.js";
import { executeIndependentVerification } from "./factoryVerification.js";

const LEASE_DURATION_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 20_000;
const MAX_RESULT_BYTES = 64_000;

export interface FactoryAttemptWorkerStatus {
  enabled: boolean;
  activeRunIds: string[];
  completedCount: number;
  failedCount: number;
  lastPollAt: number | null;
  lastError: string | null;
  credentialsConfigured: boolean;
}

export interface FactoryAttemptWorkerDependencies {
  ensureFactoryWorktree: typeof ensureFactoryWorktree;
  listChangedFiles: typeof listChangedFiles;
  commitFactoryChanges: typeof commitFactoryChanges;
  inspectCandidateChange: typeof inspectCandidateChange;
  assertFactoryCandidateUnchanged: typeof assertFactoryCandidateUnchanged;
  executeIndependentVerification: typeof executeIndependentVerification;
  loadGithubAppPrivateKey: typeof loadGithubAppPrivateKey;
  getGithubAppId: () => string | undefined;
  mintInstallationToken: typeof mintInstallationToken;
  pushFactoryBranch: typeof pushFactoryBranch;
  createOrReusePullRequest: typeof createOrReusePullRequest;
}

export interface FactoryAttemptWorkerScope {
  projectId: string;
  repositoryId: string;
}

const DEFAULT_DEPENDENCIES: FactoryAttemptWorkerDependencies = {
  ensureFactoryWorktree,
  listChangedFiles,
  commitFactoryChanges,
  inspectCandidateChange,
  assertFactoryCandidateUnchanged,
  executeIndependentVerification,
  loadGithubAppPrivateKey,
  getGithubAppId: () => process.env.GITHUB_APP_ID?.trim() || undefined,
  mintInstallationToken,
  pushFactoryBranch,
  createOrReusePullRequest,
};

export class FactoryAttemptWorker {
  private readonly active = new Map<string, AbortController>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private stopped = false;
  private completedCount = 0;
  private failedCount = 0;
  private lastPollAt: number | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly client: ConvexHttpClient,
    private readonly adapter = new CodexV1ExecutorAdapter(),
    private readonly enabled = process.env.FACTORY_EXECUTION_ENABLED === "1",
    private readonly pollIntervalMs = boundedInteger(process.env.FACTORY_EXECUTION_POLL_MS, 5_000, 300_000, 15_000),
    private readonly dependencies: FactoryAttemptWorkerDependencies = DEFAULT_DEPENDENCIES,
    private readonly scope?: FactoryAttemptWorkerScope,
  ) {}

  start() {
    if (!this.enabled || this.pollTimer || this.stopped) return;
    this.pollTimer = setInterval(() => void this.tick(), this.pollIntervalMs);
    void this.tick();
  }

  async stop() {
    this.stopped = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    for (const controller of this.active.values()) controller.abort();
  }

  status(): FactoryAttemptWorkerStatus {
    let privateKeyConfigured = false;
    try {
      privateKeyConfigured = Boolean(this.dependencies.loadGithubAppPrivateKey());
    } catch {
      privateKeyConfigured = false;
    }
    return {
      enabled: this.enabled,
      activeRunIds: [...this.active.keys()],
      completedCount: this.completedCount,
      failedCount: this.failedCount,
      lastPollAt: this.lastPollAt,
      lastError: this.lastError,
      credentialsConfigured: Boolean(this.dependencies.getGithubAppId() && privateKeyConfigured),
    };
  }

  async tick() {
    if (!this.enabled || this.polling || this.stopped) return;
    this.polling = true;
    this.lastPollAt = Date.now();
    try {
      const [pending, running] = await Promise.all([
        this.client.query(ConvexQueries.workflowRuns.list as any, factoryRunQueryArgs("PENDING", this.scope)),
        this.client.query(ConvexQueries.workflowRuns.list as any, factoryRunQueryArgs("RUNNING", this.scope)),
      ]) as [any[], any[]];
      for (const run of [...pending, ...running]) {
        if (this.stopped || this.active.size > 0) break;
        if (!isBoundFactoryAttempt(run) || !matchesWorkerScope(run, this.scope) || this.active.has(String(run._id))) continue;
        const controller = new AbortController();
        this.active.set(String(run._id), controller);
        void this.execute(run, controller)
          .catch((error) => {
            this.failedCount += 1;
            this.lastError = safeError(error);
            console.error(`[factory-worker] Attempt ${run.runId} failed: ${this.lastError}`);
          })
          .finally(() => this.active.delete(String(run._id)));
      }
    } catch (error) {
      this.lastError = safeError(error);
      console.error(`[factory-worker] Poll failed: ${this.lastError}`);
    } finally {
      this.polling = false;
    }
  }

  private async execute(run: any, controller: AbortController) {
    const leaseId = randomUUID();
    const claim = await this.command("claimFactoryAttempt", "attempts.claim", run, {
      workflowRunId: run._id,
      leaseId,
      leaseDurationMs: LEASE_DURATION_MS,
    });
    if (!claim?.claimed) return;

    let heartbeatTask: Promise<void> | null = null;
    let leaseHealthy = true;
    const heartbeat = setInterval(() => {
      if (heartbeatTask || controller.signal.aborted) return;
      heartbeatTask = (async () => {
        try {
          const result = await this.command("renewFactoryAttempt", "attempts.renew", run, {
            workflowRunId: run._id,
            leaseId,
            leaseDurationMs: LEASE_DURATION_MS,
          });
          if (!result?.renewed) throw new Error(`Attempt lease renewal rejected (${result?.reason ?? "unknown"}).`);
        } catch (error) {
          leaseHealthy = false;
          this.lastError = safeError(error);
          controller.abort();
        }
      })().finally(() => {
        heartbeatTask = null;
      });
    }, HEARTBEAT_INTERVAL_MS);

    const report = async (packet: any) => {
      if (packet?.terminal) {
        clearInterval(heartbeat);
        if (heartbeatTask) await heartbeatTask;
      }
      if (!leaseHealthy) throw new Error("Factory attempt lease was lost before evidence could be recorded.");
      return await this.command("reportFactoryAttempt", "attempts.report", run, {
        workflowRunId: run._id,
        leaseId,
        packet,
      });
    };

    try {
      const manifest = validateClaimManifest(claim);
      await this.dependencies.ensureFactoryWorktree({
        checkoutRoot: claim.checkoutRoot,
        worktree: claim.worktree,
        branch: claim.branch,
        defaultBranch: claim.defaultBranch,
      });

      if (claim.publicationCheckpoint) {
        const checkpoint = validatePublicationCheckpoint(claim.publicationCheckpoint);
        const structuredResult = validateFactoryResult(checkpoint.structuredResult);
        const candidate = await this.dependencies.inspectCandidateChange(claim.worktree, claim.defaultBranch);
        if (candidate.sourceRevision !== checkpoint.sourceRevision
          || candidate.candidateRevision !== checkpoint.candidateRevision) {
          throw new Error("Approved publication checkpoint no longer matches the attempt worktree.");
        }
        if (!sameStringSet(candidate.changedFiles, checkpoint.changedFiles)) {
          throw new Error("Approved publication checkpoint changed-file set no longer matches the verified candidate.");
        }
        const scopeResult = validateChangedFileScope(checkpoint.changedFiles, {
          allowedPaths: manifest.repository.allowedPaths,
          excludedPaths: manifest.repository.excludedPaths,
        });
        if (!scopeResult.ok) throw new Error(`Approved candidate is now outside the frozen code scope: ${scopeResult.outsideScope.join(", ")}`);
        await this.dependencies.assertFactoryCandidateUnchanged(claim.worktree, checkpoint.candidateRevision);
        await this.publishCandidate({
          claim,
          manifest,
          structuredResult,
          changedFiles: scopeResult.changedFiles,
          verificationRecord: checkpoint.verification,
          sourceRevision: checkpoint.sourceRevision,
          headSha: checkpoint.candidateRevision,
          report,
          leaseId,
          publicationPermit: checkpoint.publicationPermit,
          requirePublicationPermit: true,
        });
        this.completedCount += 1;
        this.lastError = null;
        return;
      }

      const executorEvents: ExecutorEvent[] = [];
      const result = await this.adapter.execute({
        executionId: `${claim.runId}:${claim.executionManifestDigest}`,
        repositoryRoot: claim.worktree,
        workingDirectory: claim.worktree,
        prompt: manifest.compiledPrompt,
        model: claim.model ?? manifest.workflow.steps[0]?.modelRoute,
        allowedPaths: manifest.repository.allowedPaths,
        timeoutMs: manifest.harness.timeoutMs,
        isolation: "WORKSPACE_WRITE",
      }, (event) => {
        executorEvents.push(event);
      }, controller.signal);

      const mappedEvents = executorEvents.map((event) => mapExecutorEvent(claim.runId, event));
      if (result.status !== "COMPLETED") {
        await report({
          events: mappedEvents,
          terminal: { status: result.status === "CANCELED" ? "CANCELED" : "FAILED", failureReason: result.error ?? "Codex execution failed." },
        });
        this.failedCount += 1;
        return;
      }

      const structuredResult = parseFactoryResult(result.output ?? "");
      if (structuredResult.status !== "COMPLETED") {
        await report({
          events: mappedEvents,
          artifacts: [structuredResultArtifact(claim, structuredResult)],
          terminal: { status: "FAILED", failureReason: `Codex reported ${structuredResult.status}: ${structuredResult.nextAction}` },
        });
        this.failedCount += 1;
        return;
      }

      const scopeResult = validateChangedFileScope(
        await this.dependencies.listChangedFiles(claim.worktree, claim.defaultBranch),
        { allowedPaths: manifest.repository.allowedPaths, excludedPaths: manifest.repository.excludedPaths }
      );
      if (!scopeResult.ok) {
        await report({
          events: mappedEvents,
          artifacts: [
            structuredResultArtifact(claim, structuredResult),
            {
              idempotencyKey: `factory:${claim.runId}:path-scope-deviation`,
              artifactType: "OTHER",
              name: "Repository path-scope deviation",
              description: "Pull-request creation was blocked because changed files exceeded the frozen code scopes.",
              metadata: { changedFiles: scopeResult.changedFiles, outsideScope: scopeResult.outsideScope },
            },
          ],
          terminal: { status: "FAILED", failureReason: `Changed files outside approved code scopes: ${scopeResult.outsideScope.join(", ")}` },
        });
        this.failedCount += 1;
        return;
      }
      if (scopeResult.changedFiles.length === 0) {
        await report({
          events: mappedEvents,
          artifacts: [structuredResultArtifact(claim, structuredResult)],
          terminal: { status: "FAILED", failureReason: "Codex completed without producing a reviewable code change." },
        });
        this.failedCount += 1;
        return;
      }

      const headSha = await this.dependencies.commitFactoryChanges({
        worktree: claim.worktree,
        changedFiles: scopeResult.changedFiles,
        title: String(manifest.intent?.title ?? structuredResult.summary ?? "Mission Control Work Order"),
      });
      const candidate = await this.dependencies.inspectCandidateChange(claim.worktree, claim.defaultBranch);
      if (candidate.candidateRevision !== headSha) throw new Error("Committed candidate revision changed before verification.");
      const baseArtifacts = [
        structuredResultArtifact(claim, structuredResult),
        {
          idempotencyKey: `factory:${claim.runId}:code-diff:${headSha}`,
          artifactType: "CODE_DIFF",
          name: `Reviewable code change ${headSha.slice(0, 12)}`,
          contentHash: `git:${headSha}`,
          metadata: {
            changedFiles: scopeResult.changedFiles,
            deletedFiles: candidate.deletedFiles,
            linesAdded: candidate.linesAdded,
            linesDeleted: candidate.linesDeleted,
            branch: claim.branch,
            sourceRevision: candidate.sourceRevision,
            headSha,
          },
        },
      ];
      let verificationRecord: any;
      let verificationResult: any;
      if (manifest.workOrderSpecification?.verificationContract) {
        verificationResult = await this.dependencies.executeIndependentVerification({
          workflowRunId: String(claim.workflowRunId),
          workOrderId: String(claim.workOrderId),
          workOrderRevisionNumber: manifest.causation.workOrderRevisionNumber,
          title: String(manifest.intent.title),
          specification: manifest.workOrderSpecification,
          candidate,
          repositoryRoot: claim.worktree,
          signal: controller.signal,
        });
        await this.dependencies.assertFactoryCandidateUnchanged(claim.worktree, headSha);
        const verificationReport = await report({
          events: mappedEvents,
          artifacts: baseArtifacts,
          verification: verificationResult,
        });
        verificationRecord = verificationReport?.verification;
        if (manifest.workOrderSpecification.verificationContract.enforcementMode === "ENFORCED"
          && verificationRecord?.verdict !== "VERIFIED") {
          if (verificationRecord?.verdict === "REQUIRES_HUMAN_REVIEW" && verificationRecord?.paused) {
            this.lastError = null;
            return;
          }
          const reason = `Independent verification did not pass: ${verificationRecord?.verdict ?? "NOT_VERIFIED"} — ${(verificationRecord?.verdictReasons ?? ["No verified receipt was returned."]).join(" ")}`;
          await report({ terminal: { status: "FAILED", failureReason: reason } });
          this.failedCount += 1;
          return;
        }
      }
      await this.publishCandidate({
        claim,
        manifest,
        structuredResult,
        changedFiles: scopeResult.changedFiles,
        verificationRecord,
        sourceRevision: candidate.sourceRevision,
        headSha,
        report,
        leaseId,
        requirePublicationPermit: true,
        events: verificationResult ? [] : mappedEvents,
        artifacts: verificationResult ? [] : baseArtifacts,
      });
      this.completedCount += 1;
      this.lastError = null;
    } catch (error) {
      const reason = safeError(error);
      if (leaseHealthy) {
        await report({ terminal: { status: controller.signal.aborted ? "CANCELED" : "FAILED", failureReason: reason } })
          .catch((reportError) => {
            this.lastError = `Execution failed (${reason}); terminal report failed (${safeError(reportError)}).`;
          });
      }
      throw error;
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async command(
    action: keyof typeof ConvexActions.serviceCommands,
    capability: "attempts.claim" | "attempts.renew" | "attempts.report" | "attempts.authorize-publication",
    run: any,
    payload: unknown
  ) {
    const command = createSignedServiceCommand({
      capability,
      projectId: String(run.projectId),
      repositoryId: String(run.repositoryId),
      payload,
    });
    return await this.client.action(ConvexActions.serviceCommands[action] as any, command) as any;
  }

  private async publishCandidate(input: {
    claim: any;
    manifest: any;
    structuredResult: ReturnType<typeof validateFactoryResult>;
    changedFiles: string[];
    verificationRecord: any;
    sourceRevision: string;
    headSha: string;
    report: (packet: any) => Promise<any>;
    leaseId: string;
    publicationPermit?: { id: string; leaseId: string; validUntil: number };
    requirePublicationPermit?: boolean;
    events?: any[];
    artifacts?: any[];
  }) {
    const privateKey = this.dependencies.loadGithubAppPrivateKey();
    const configuredAppId = this.dependencies.getGithubAppId();
    if (!privateKey || !configuredAppId) throw new Error("GitHub App runtime credentials are not configured.");
    if (configuredAppId !== input.claim.installation.appId) throw new Error("GitHub App runtime identity does not match the frozen installation.");
    if (!input.claim.providerRepositoryId) throw new Error("GitHub provider repository identity is not frozen.");
    let publicationPermit = input.publicationPermit;
    if (input.requirePublicationPermit && !publicationPermit) {
      const authorization = await this.command(
        "authorizeFactoryPublication",
        "attempts.authorize-publication",
        input.claim,
        {
          workflowRunId: input.claim.workflowRunId,
          leaseId: input.leaseId,
          candidateRevision: input.headSha,
        },
      );
      if (!authorization?.authorized) throw new Error("Control plane did not authorize pull-request publication.");
      publicationPermit = {
        id: authorization.publicationPermitId,
        leaseId: input.leaseId,
        validUntil: authorization.validUntil,
      };
    }
    if (input.requirePublicationPermit) assertPublicationPermitCurrent(publicationPermit, input.leaseId, input.headSha);
    const installationToken = await this.dependencies.mintInstallationToken({
      appId: configuredAppId,
      installationId: input.claim.installation.installationId,
      providerRepositoryId: input.claim.providerRepositoryId,
      privateKey,
    });
    if (installationToken.expiresAt <= Date.now() + 60_000) throw new Error("GitHub installation token expires too soon for a safe push.");
    if (input.requirePublicationPermit) assertPublicationPermitCurrent(publicationPermit, input.leaseId, input.headSha);
    await this.dependencies.assertFactoryCandidateUnchanged(input.claim.worktree, input.headSha);
    await this.dependencies.pushFactoryBranch({
      worktree: input.claim.worktree,
      repository: input.claim.repository,
      branch: input.claim.branch,
      installationToken: installationToken.token,
    });
    if (input.requirePublicationPermit) assertPublicationPermitCurrent(publicationPermit, input.leaseId, input.headSha);
    const pullRequest = await this.dependencies.createOrReusePullRequest({
      repository: input.claim.repository,
      branch: input.claim.branch,
      base: input.claim.defaultBranch,
      title: input.structuredResult.summary,
      body: buildPullRequestBody(input.claim, input.structuredResult, input.changedFiles, input.verificationRecord),
      token: installationToken.token,
      headSha: input.headSha,
    });
    const pullRequestLineage = {
      ...input.manifest.causation,
      repositoryId: String(input.claim.repositoryId),
      repository: input.claim.repository,
      installationId: input.claim.installation.installationId,
      branch: input.claim.branch,
      sourceRevision: input.sourceRevision,
      headSha: input.headSha,
      pullRequestNumber: pullRequest.number,
      pullRequestUrl: pullRequest.url,
      changedFiles: input.changedFiles,
      executionManifestDigest: input.claim.executionManifestDigest,
      publicationPermitId: publicationPermit?.id,
    };
    await input.report({
      events: input.events ?? [],
      artifacts: [
        ...(input.artifacts ?? []),
        {
          idempotencyKey: `factory:${input.claim.runId}:pull-request`,
          artifactType: "PULL_REQUEST",
          name: `Pull request #${pullRequest.number}`,
          description: "Review-ready pull request created by the governed GitHub App boundary. Human merge remains required.",
          externalLocation: pullRequest.url,
          contentHash: `sha256:${createHash("sha256").update(JSON.stringify(pullRequestLineage)).digest("hex")}`,
          metadata: pullRequestLineage,
        },
      ],
      terminal: { status: "COMPLETED" },
    });
  }
}

export function matchesWorkerScope(run: any, scope?: FactoryAttemptWorkerScope) {
  return !scope || (String(run?.projectId) === scope.projectId && String(run?.repositoryId) === scope.repositoryId);
}

export function factoryRunQueryArgs(status: "PENDING" | "RUNNING", scope?: FactoryAttemptWorkerScope) {
  return {
    status,
    limit: 100,
    projectId: scope?.projectId,
    repositoryId: scope?.repositoryId,
  };
}

function isBoundFactoryAttempt(run: any) {
  return Boolean(
    run?._id && run.projectId && run.repositoryId && run.factoryDefinitionVersionId
    && run.executionManifestDigest && run.executorAdapter === "codex" && run.executorVersion === "v1"
    && ["PENDING", "RUNNING"].includes(run.status)
  );
}

function validateClaimManifest(claim: any) {
  const manifest = claim?.executionManifest;
  if (
    manifest?.version !== "factory-execution-manifest/v1"
    || manifest?.harness?.adapter !== "codex"
    || manifest?.harness?.version !== "v1"
    || manifest?.harness?.isolation !== "WORKSPACE_WRITE"
    || manifest?.harness?.pullRequestAuthority !== "CONTROL_PLANE_ONLY"
    || !Number.isSafeInteger(manifest?.harness?.timeoutMs)
    || manifest.harness.timeoutMs < 1_000
    || manifest.harness.timeoutMs > 8 * 60 * 60 * 1_000
    || !Array.isArray(manifest?.repository?.allowedPaths)
    || manifest.repository.allowedPaths.length === 0
    || !Array.isArray(manifest?.repository?.excludedPaths)
    || !Array.isArray(manifest?.workflow?.steps)
    || typeof manifest?.compiledPrompt !== "string"
    || !manifest.compiledPrompt.trim()
  ) throw new Error("Claimed Factory execution manifest is invalid.");
  return manifest;
}

function mapExecutorEvent(runId: string, event: ExecutorEvent) {
  const eventType = {
    EXECUTION_STARTED: "STEP_STARTED",
    COMMAND_STARTED: "TOOL_CALLED",
    COMMAND_COMPLETED: "COMMAND_EXECUTED",
    ARTIFACT_PRODUCED: "COMMAND_EXECUTED",
    EXECUTION_COMPLETED: "STEP_COMPLETED",
    EXECUTION_FAILED: "RUN_FAILED",
    EXECUTION_CANCELED: "RUN_FAILED",
  }[event.type];
  return {
    idempotencyKey: `factory:${runId}:executor:${event.sequence}`,
    eventType,
    workflowStep: "factory-execution",
    toolName: event.type.startsWith("COMMAND") ? "codex/v1" : undefined,
    commandSummary: event.summary,
    status: event.type.endsWith("FAILED") ? "FAILED" : event.type.endsWith("CANCELED") ? "CANCELED" : "RECORDED",
    startedAt: event.occurredAt,
    metadata: { executorEventType: event.type, executorSequence: event.sequence, ...(event.metadata ?? {}) },
  };
}

function parseFactoryResult(output: string) {
  if (Buffer.byteLength(output, "utf8") > MAX_RESULT_BYTES) throw new Error("Codex structured result exceeds the 64 KB context budget.");
  let result: any;
  try {
    result = JSON.parse(output);
  } catch {
    throw new Error("Codex did not return the required factory-result/v1 JSON object.");
  }
  return validateFactoryResult(result);
}

function validateFactoryResult(result: any) {
  const statuses = ["COMPLETED", "BLOCKED", "FAILED"];
  const arrayFields = [
    "completedAcceptanceCriterionIds", "incompleteAcceptanceCriterionIds",
    "unknownAcceptanceCriterionIds", "verificationCommands", "knownRisks",
  ];
  if (!result || typeof result !== "object" || !statuses.includes(result.status)
    || typeof result.summary !== "string" || !result.summary.trim()
    || typeof result.nextAction !== "string"
    || arrayFields.some((field) => !Array.isArray(result[field]) || result[field].some((item: unknown) => typeof item !== "string"))) {
    throw new Error("Codex factory-result/v1 JSON failed schema validation.");
  }
  return result as {
    status: "COMPLETED" | "BLOCKED" | "FAILED";
    summary: string;
    completedAcceptanceCriterionIds: string[];
    incompleteAcceptanceCriterionIds: string[];
    unknownAcceptanceCriterionIds: string[];
    verificationCommands: string[];
    knownRisks: string[];
    nextAction: string;
  };
}

function validatePublicationCheckpoint(checkpoint: any) {
  if (!checkpoint || typeof checkpoint !== "object"
    || typeof checkpoint.sourceRevision !== "string" || !checkpoint.sourceRevision
    || typeof checkpoint.candidateRevision !== "string" || !checkpoint.candidateRevision
    || !Number.isFinite(checkpoint.authorizationValidUntil)
    || checkpoint.authorizationValidUntil <= Date.now() + 60_000
    || !Array.isArray(checkpoint.changedFiles) || checkpoint.changedFiles.some((file: unknown) => typeof file !== "string")
    || checkpoint.verification?.verdict !== "VERIFIED"
    || !checkpoint.verification?.verificationReceiptId) {
    throw new Error("Claimed Factory publication checkpoint is invalid.");
  }
  return checkpoint as {
    sourceRevision: string;
    candidateRevision: string;
    authorizationValidUntil: number;
    changedFiles: string[];
    verification: any;
    structuredResult: any;
    publicationPermit?: { id: string; leaseId: string; validUntil: number };
  };
}

function assertPublicationPermitCurrent(
  permit: { id: string; leaseId: string; validUntil: number } | undefined,
  leaseId: string,
  candidateRevision: string,
) {
  if (!permit?.id || permit.leaseId !== leaseId || !Number.isFinite(permit.validUntil) || permit.validUntil <= Date.now()) {
    throw new Error(`Publication permit is missing or expired for candidate ${candidateRevision.slice(0, 12)}.`);
  }
}

function sameStringSet(left: string[], right: string[]) {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.length === sortedRight.length && sortedLeft.every((item, index) => item === sortedRight[index]);
}

function structuredResultArtifact(claim: any, result: ReturnType<typeof parseFactoryResult>) {
  return {
    idempotencyKey: `factory:${claim.runId}:structured-result`,
    artifactType: "STRUCTURED_OUTPUT",
    name: "Codex factory-result/v1",
    description: result.summary,
    contentHash: `sha256:${createHash("sha256").update(JSON.stringify(result)).digest("hex")}`,
    metadata: { schema: "factory-result/v1", result },
  };
}

function buildPullRequestBody(claim: any, result: ReturnType<typeof parseFactoryResult>, changedFiles: string[], verification?: any) {
  return [
    "## Mission Control Work Order",
    "",
    result.summary,
    "",
    `- Run: \`${claim.runId}\``,
    `- Factory manifest: \`${claim.executionManifestDigest}\``,
    `- Branch: \`${claim.branch}\``,
    `- Changed files: ${changedFiles.length}`,
    "- Merge authority: human only",
    "",
    "## Independent verification",
    "",
    verification
      ? `- Verdict: **${verification.verdict}**\n- Receipt: \`${verification.verificationReceiptId}\``
      : "- No independent verification contract was configured for this legacy Work Order.",
    "",
    "## Commands reported by the execution agent (not proof)",
    "",
    ...(result.verificationCommands.length ? result.verificationCommands.map((command) => `- \`${command}\``) : ["- None reported."]),
    "",
    "## Known risks",
    "",
    ...(result.knownRisks.length ? result.knownRisks.map((risk) => `- ${risk}`) : ["- None reported by the execution harness."]),
  ].join("\n");
}

function boundedInteger(raw: string | undefined, min: number, max: number, fallback: number) {
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/(authorization|cookie|token|secret|password|api[-_]?key)\s*[:=]\s*([^\s,;]+)/gi, "$1=[REDACTED]")
    .slice(0, 2_000);
}
