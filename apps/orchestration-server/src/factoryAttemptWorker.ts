import { createHash, randomUUID } from "node:crypto";
import type { ConvexHttpClient } from "convex/browser";
import type { ExecutorEvent, ExecutorRequest, HarnessExecutionBackend, HarnessExecutorCapabilities, HarnessNormalizedResult } from "@mission-control/workflow-engine";
import { harnessCapabilityManifestDigest, harnessNormalizedResultIssues, runHarnessExecution, verificationIsolationBindingDigest } from "@mission-control/workflow-engine";
import { canonicalHash } from "@mission-control/shared";
import { CodexV1ExecutorAdapter } from "./codexExecutorAdapter.js";
import { HarnessAdapterRegistry, type HarnessRuntimeAdapter, type RegisteredHarnessAdapter } from "./harnessAdapterRegistry.js";
import { ConvexActions, ConvexQueries } from "./convexCalls.js";
import { createSignedServiceCommand } from "./serviceCommandClient.js";
import { assertFactoryCandidateUnchanged, commitFactoryChanges, createFactorySourceBundle, ensureFactoryWorktree, ensureVerificationWorktree, inspectCandidateChange, listChangedFiles, materializeRemoteCandidate, pushFactoryBranch } from "./factoryGitRuntime.js";
import { validateChangedFileScope } from "./factoryPathScope.js";
import { createOrReusePullRequest, loadGithubAppPrivateKey, mintInstallationToken } from "./githubAppRuntime.js";
import { executeIndependentVerification } from "./factoryVerification.js";
import {
  cleanupOwnedFactoryWorkspace,
  recordFactoryExecutorStarted,
  recordFactoryExecutorTerminated,
  recordFactoryPublication,
  recordFactorySandboxStarted,
  recordFactorySandboxTerminated,
  transferFactoryPublicationWorkspace,
  type FactoryWorkspaceOwner,
} from "./factoryWorkspaceOwnership.js";
import { ConvexRemoteSandboxJournal } from "./convexRemoteSandboxJournal.js";
import { ExeDevSandboxProvider } from "./exeDevSandboxProvider.js";
import { RemoteSandboxExecutionError, RemoteSandboxRuntime, type RemoteSandboxCandidateSession } from "./remoteSandboxRuntime.js";
import { remoteFailure, validateRemoteRetryBudget } from "./remoteExecutionPolicy.js";
import { OpenRouterSandboxCredentialBroker, type SandboxCredentialBroker } from "./sandboxCredentials.js";
import { sandboxProfileDigest, stableSandboxResourceName, type SandboxProvider, type SandboxProfileSnapshot } from "./sandboxProvider.js";
import type { SandboxResultBundle } from "./sandboxResultBundle.js";
import { standaloneSandboxSupervisorSource } from "./sandboxSupervisor.js";
import { reconcileSandboxOrphans, type SandboxCleanupHealth } from "./sandboxReconciler.js";

export const FACTORY_ATTEMPT_LEASE_DURATION_MS = 120_000;
const HEARTBEAT_INTERVAL_MS = 20_000;
const MAX_RESULT_BYTES = 64_000;

interface FrozenHarnessExecutionManifest {
  harness: {
    adapter: string;
    version: string;
    harnessId: string;
    harnessVersion: string;
    capabilityManifestSha256: string;
    effectiveConfigSha256: string;
    executionBackend: string;
    provider?: string;
    model?: string;
    isolation: "READ_ONLY" | "WORKSPACE_WRITE" | "DETACHED_READ_ONLY";
  };
}

export interface FactoryAttemptWorkerStatus {
  enabled: boolean;
  activeRunIds: string[];
  completedCount: number;
  failedCount: number;
  lastPollAt: number | null;
  lastError: string | null;
  credentialsConfigured: boolean;
  reconciliationEnabled: boolean;
  cleanupHealth: SandboxCleanupHealth | null;
}

export interface FactoryAttemptWorkerDependencies {
  ensureFactoryWorktree: typeof ensureFactoryWorktree;
  ensureVerificationWorktree: typeof ensureVerificationWorktree;
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
  recordFactoryExecutorStarted?: typeof recordFactoryExecutorStarted;
  recordFactoryExecutorTerminated?: typeof recordFactoryExecutorTerminated;
  recordFactoryPublication?: typeof recordFactoryPublication;
  cleanupOwnedFactoryWorkspace?: typeof cleanupOwnedFactoryWorkspace;
  transferFactoryPublicationWorkspace?: typeof transferFactoryPublicationWorkspace;
  createFactorySourceBundle?: typeof createFactorySourceBundle;
  materializeRemoteCandidate?: typeof materializeRemoteCandidate;
  recordFactorySandboxStarted?: typeof recordFactorySandboxStarted;
  recordFactorySandboxTerminated?: typeof recordFactorySandboxTerminated;
  createSandboxProvider?: (profile: SandboxProfileSnapshot) => SandboxProvider;
  createSandboxCredentialBroker?: () => SandboxCredentialBroker;
}

export interface FactoryAttemptWorkerScope {
  projectId: string;
  repositoryId: string;
}

export interface FactoryAttemptWorkerIdentity {
  workerId: string;
  sessionId: string;
  maxConcurrentRuns: number;
}

const DEFAULT_DEPENDENCIES: FactoryAttemptWorkerDependencies = {
  ensureFactoryWorktree,
  ensureVerificationWorktree,
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
  recordFactoryExecutorStarted,
  recordFactoryExecutorTerminated,
  recordFactoryPublication,
  cleanupOwnedFactoryWorkspace,
  transferFactoryPublicationWorkspace,
  createFactorySourceBundle,
  materializeRemoteCandidate,
  recordFactorySandboxStarted,
  recordFactorySandboxTerminated,
  createSandboxProvider: (profile) => {
    if (profile.provider !== "EXE_DEV") throw new Error(`Production Factory worker does not provide ${profile.provider} sandboxes.`);
    return new ExeDevSandboxProvider();
  },
  createSandboxCredentialBroker: () => new OpenRouterSandboxCredentialBroker(),
};

export class FactoryAttemptWorker {
  private readonly active = new Map<string, AbortController>();
  private readonly activeTasks = new Set<Promise<void>>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private stopped = false;
  private completedCount = 0;
  private failedCount = 0;
  private lastPollAt: number | null = null;
  private lastError: string | null = null;
  private lastReconcileAt = 0;
  private cleanupHealth: SandboxCleanupHealth | null = null;
  private readonly adapters: HarnessAdapterRegistry;

  constructor(
    private readonly client: ConvexHttpClient,
    adapters: HarnessAdapterRegistry | HarnessRuntimeAdapter = new CodexV1ExecutorAdapter(),
    private readonly enabled = process.env.FACTORY_EXECUTION_ENABLED === "1",
    private readonly pollIntervalMs = boundedInteger(process.env.FACTORY_EXECUTION_POLL_MS, 5_000, 300_000, 15_000),
    private readonly dependencies: FactoryAttemptWorkerDependencies = DEFAULT_DEPENDENCIES,
    private readonly scope?: FactoryAttemptWorkerScope,
    private readonly identity?: FactoryAttemptWorkerIdentity,
  ) {
    this.adapters = adapters instanceof HarnessAdapterRegistry
      ? adapters
      : new HarnessAdapterRegistry([adapters]);
  }

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
    await Promise.allSettled([...this.activeTasks]);
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
      reconciliationEnabled: Boolean(this.scope),
      cleanupHealth: this.cleanupHealth,
    };
  }

  async tick() {
    if (!this.enabled || this.polling || this.stopped) return;
    this.polling = true;
    this.lastPollAt = Date.now();
    try {
      await this.reconcileOrphans();
      const [pending, running] = await Promise.all([
        this.client.query(ConvexQueries.workflowRuns.list as any, factoryRunQueryArgs("PENDING", this.scope)),
        this.client.query(ConvexQueries.workflowRuns.list as any, factoryRunQueryArgs("RUNNING", this.scope)),
      ]) as [any[], any[]];
      for (const run of [...pending, ...running]) {
        if (this.stopped || this.active.size >= (this.identity?.maxConcurrentRuns ?? 1)) break;
        const executionBackend = run?.executionManifest?.harness?.executionBackend as HarnessExecutionBackend | undefined;
        if (!isBoundFactoryAttempt(run)
          || !this.adapters.supports({ adapter: run.executorAdapter, version: run.executorVersion }, executionBackend)
          || !matchesWorkerScope(run, this.scope)
          || this.active.has(String(run._id))) continue;
        if (run.executionManifest?.harness?.executionBackend === "remote-sandbox"
          && (!this.scope || (this.cleanupHealth?.failed ?? 0) > 0)) {
          this.lastError = !this.scope
            ? "Remote sandbox dispatch requires a repository-scoped canonical worker."
            : "Remote sandbox dispatch is blocked while orphan cleanup is unhealthy.";
          continue;
        }
        const controller = new AbortController();
        this.active.set(String(run._id), controller);
        const task = this.execute(run, controller)
          .catch((error) => {
            this.failedCount += 1;
            this.lastError = safeError(error);
            console.error(`[factory-worker] Attempt ${run.runId} failed: ${this.lastError}`);
          })
          .finally(() => this.active.delete(String(run._id)));
        this.activeTasks.add(task);
        void task.finally(() => this.activeTasks.delete(task));
      }
    } catch (error) {
      this.lastError = safeError(error);
      console.error(`[factory-worker] Poll failed: ${this.lastError}`);
    } finally {
      this.polling = false;
    }
  }

  private async reconcileOrphans() {
    if (!this.scope || Date.now() - this.lastReconcileAt < 60_000) return;
    this.lastReconcileAt = Date.now();
    const listCommand = createSignedServiceCommand({
      capability: "sandboxes.list-reconcile",
      projectId: this.scope.projectId,
      repositoryId: this.scope.repositoryId,
      payload: { projectId: this.scope.projectId, repositoryId: this.scope.repositoryId },
    });
    const candidates = await this.client.action(
      ConvexActions.serviceCommands.listFactorySandboxReconcileCandidates as any,
      listCommand,
    ) as any[];
    const providers = new Map<string, SandboxProvider>();
    for (const candidate of candidates) {
      const profile = candidate?.allocation?.profileSnapshot as SandboxProfileSnapshot | undefined;
      if (!profile || providers.has(candidate.allocation.provider)) continue;
      const factory = this.dependencies.createSandboxProvider ?? DEFAULT_DEPENDENCIES.createSandboxProvider!;
      providers.set(candidate.allocation.provider, factory(profile));
    }
    const brokerFactory = this.dependencies.createSandboxCredentialBroker ?? DEFAULT_DEPENDENCIES.createSandboxCredentialBroker!;
    this.cleanupHealth = await reconcileSandboxOrphans({
      candidates,
      providers,
      credentialBroker: brokerFactory(),
      onReceipt: async (receipt) => {
        const candidate = candidates.find((item) => item.allocation.resourceName === receipt.resourceName);
        if (!candidate) throw new Error("Reconciled sandbox is outside the scoped candidate set.");
        const reportCommand = createSignedServiceCommand({
          capability: "sandboxes.report-reconcile",
          projectId: this.scope!.projectId,
          repositoryId: this.scope!.repositoryId,
          payload: {
            workflowRunId: candidate.allocation.workflowRunId,
            resourceName: receipt.resourceName,
            termination: receipt.termination,
            credentialRevocation: receipt.credentialRevocation,
          },
        });
        await this.client.action(ConvexActions.serviceCommands.reportFactorySandboxReconcile as any, reportCommand);
      },
    });
    if (this.cleanupHealth.failed > 0) {
      this.lastError = `Sandbox reconciliation failed for ${this.cleanupHealth.failed} resource(s).`;
    }
  }

  private async execute(run: any, controller: AbortController) {
    const leaseId = randomUUID();
    const verificationAttempt = run.attemptPurpose === "VERIFICATION";
    const claim = await this.command(
      verificationAttempt ? "claimVerificationAttempt" : "claimFactoryAttempt",
      verificationAttempt ? "verification:claim" : "attempts.claim",
      run,
      {
      workflowRunId: run._id,
      leaseId,
      leaseDurationMs: FACTORY_ATTEMPT_LEASE_DURATION_MS,
      workerId: this.identity?.workerId,
      workerSessionId: this.identity?.sessionId,
    });
    if (!claim?.claimed) return;
    const workerLeaseIdentity = claim.lease?.workerId ? {
      workerId: claim.lease.workerId,
      workerSessionId: claim.lease.workerSessionId,
      workerGeneration: claim.lease.workerGeneration,
    } : {};

    let heartbeatTask: Promise<void> | null = null;
    let leaseHealthy = true;
    const heartbeat = setInterval(() => {
      if (heartbeatTask || controller.signal.aborted) return;
      heartbeatTask = (async () => {
        try {
          const result = await this.command(
            verificationAttempt ? "renewVerificationAttempt" : "renewFactoryAttempt",
            verificationAttempt ? "verification:renew" : "attempts.renew",
            run,
            {
            workflowRunId: run._id,
            leaseId,
            leaseDurationMs: FACTORY_ATTEMPT_LEASE_DURATION_MS,
            ...workerLeaseIdentity,
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

    // Irreversible external side effects (branch push, pull-request creation)
    // must re-check fencing immediately before they run, not only at the last
    // await boundary before them.
    const assertLeaseCurrent = () => {
      if (!leaseHealthy || controller.signal.aborted) {
        throw new Error("Factory attempt lease was lost before publication could proceed.");
      }
    };

    const report = async (packet: any) => {
      if (packet?.terminal) {
        clearInterval(heartbeat);
        if (heartbeatTask) await heartbeatTask;
      }
      if (!leaseHealthy) throw new Error("Factory attempt lease was lost before evidence could be recorded.");
      return await this.command(
        verificationAttempt ? "reportVerificationAttempt" : "reportFactoryAttempt",
        verificationAttempt ? "verification:report" : "attempts.report",
        run,
        {
        workflowRunId: run._id,
        leaseId,
        packet,
        ...workerLeaseIdentity,
      });
    };
    let remoteSession: RemoteSandboxCandidateSession | undefined;
    let remoteCleanupComplete = false;
    const cleanupRemote = async () => {
      if (!remoteSession || remoteCleanupComplete) return;
      await remoteSession.cleanup();
      remoteCleanupComplete = true;
    };

    try {
      const manifest = validateClaimManifest(claim);
      const adapter = this.adapters.require({
        adapter: manifest.harness.adapter,
        version: manifest.harness.version,
      });
      const adapterCapabilities = this.adapters.requireCapabilities({
        adapter: manifest.harness.adapter,
        version: manifest.harness.version,
      });
      const adapterRegistration = this.adapters.requireRegistration({
        adapter: manifest.harness.adapter,
        version: manifest.harness.version,
      });
      assertHarnessAdapterIdentity(manifest, adapterRegistration);
      if (verificationAttempt) {
        await this.executeVerificationAttempt({ claim, manifest, report, controller });
        this.completedCount += 1;
        this.lastError = null;
        return;
      }
      const workspaceOwner = workspaceOwnerFromClaim(claim, manifest);
      if (claim.publicationCheckpoint && workspaceOwner && claim.previousLease?.workerId) {
        await (this.dependencies.transferFactoryPublicationWorkspace ?? transferFactoryPublicationWorkspace)({
          previousOwner: workspaceOwnerFromLease(claim, manifest, claim.previousLease),
          nextOwner: workspaceOwner,
          checkpointCandidateSha: claim.publicationCheckpoint.candidateRevision,
        });
      }
      await this.dependencies.ensureFactoryWorktree({
        checkoutRoot: claim.checkoutRoot,
        worktree: claim.worktree,
        branch: claim.branch,
        baseSha: manifest.repository.baseSha,
        ownership: workspaceOwner,
      });

      if (claim.publicationCheckpoint) {
        const checkpoint = validatePublicationCheckpoint(claim.publicationCheckpoint);
        const structuredResult = validateFactoryResult(checkpoint.structuredResult);
        const candidate = await this.dependencies.inspectCandidateChange(claim.worktree, manifest.repository.baseSha);
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
          assertLeaseCurrent,
          publicationPermit: checkpoint.publicationPermit,
          requirePublicationPermit: true,
        });
        this.completedCount += 1;
        this.lastError = null;
        return;
      }

      let mappedEvents: any[] = [];
      let traceObservations: any[] = [];
      let structuredResult: ReturnType<typeof validateFactoryResult>;
      const executionArtifacts: any[] = [];
      const executorRequest: ExecutorRequest = {
        executionId: `${claim.runId}:${claim.executionManifestDigest}`,
        repositoryRoot: claim.worktree,
        workingDirectory: claim.worktree,
        prompt: manifest.compiledPrompt,
        provider: manifest.harness.provider ?? manifest.workflow.steps[0]?.modelConfiguration?.provider,
        model: claim.model ?? manifest.workflow.steps[0]?.modelRoute,
        allowedPaths: manifest.repository.allowedPaths,
        deniedPaths: manifest.repository.excludedPaths,
        timeoutMs: manifest.harness.timeoutMs,
        isolation: manifest.harness.isolation === "READ_ONLY" ? "READ_ONLY" : "WORKSPACE_WRITE",
      };
      if (manifest.harness.executionBackend === "remote-sandbox") {
        if (!workspaceOwner) throw new Error("Remote sandbox execution requires canonical worker ownership.");
        const profile = manifest.sandbox.profileSnapshot as SandboxProfileSnapshot;
        const providerFactory = this.dependencies.createSandboxProvider ?? DEFAULT_DEPENDENCIES.createSandboxProvider!;
        const brokerFactory = this.dependencies.createSandboxCredentialBroker ?? DEFAULT_DEPENDENCIES.createSandboxCredentialBroker!;
        const sourceBundle = await (this.dependencies.createFactorySourceBundle ?? createFactorySourceBundle)(claim.worktree, manifest.repository.baseSha);
        const journal = new ConvexRemoteSandboxJournal(report, claim.runId);
        const runtime = new RemoteSandboxRuntime(
          providerFactory(profile),
          brokerFactory(),
          journal,
          Date.now,
          undefined,
          {
            started: async ({ allocation, processId }) => {
              await (this.dependencies.recordFactorySandboxStarted ?? recordFactorySandboxStarted)(workspaceOwner, {
                providerResourceId: allocation.providerResourceId,
                externalProcessId: processId,
              });
            },
            terminated: async (receipt) => {
              await (this.dependencies.recordFactorySandboxTerminated ?? recordFactorySandboxTerminated)(workspaceOwner, receipt);
            },
          },
        );
        remoteSession = await runtime.execute({
          projectId: String(claim.projectId),
          workOrderId: String(claim.workOrderId),
          workOrderRevisionNumber: manifest.causation.workOrderRevisionNumber,
          workflowRunId: String(claim.workflowRunId),
          attemptId: claim.runId,
          attemptLeaseId: leaseId,
          executionManifest: manifest,
          manifestDigest: claim.executionManifestDigest,
          sourceSha: manifest.repository.baseSha,
          profile,
          repositoryBundle: sourceBundle,
          supervisorSource: standaloneSandboxSupervisorSource(),
          executor: requireRemoteInvocation(adapter, adapterCapabilities, {
            ...executorRequest,
            timeoutMs: Math.min(manifest.harness.timeoutMs, profile.runtime.maxRuntimeMs),
          }),
          signal: controller.signal,
        }, { deferCleanup: true });
        structuredResult = validateFactoryResult(remoteSession.bundle.structuredResult);
        executionArtifacts.push(sandboxResultArtifact(claim, remoteSession.bundle));
        if (remoteSession.bundle.status !== "COMPLETED") {
          await cleanupRemote();
          await report({
            artifacts: [structuredResultArtifact(claim, structuredResult), ...executionArtifacts],
            terminal: {
              status: remoteSession.bundle.status === "CANCELED" ? "CANCELED" : "FAILED",
              failureReason: remoteSession.bundle.failure?.summary ?? `Remote sandbox supervisor reported ${remoteSession.bundle.status}.`,
              remoteFailure: remoteSession.bundle.failure,
            },
          });
          this.failedCount += 1;
          return;
        }
        await (this.dependencies.materializeRemoteCandidate ?? materializeRemoteCandidate)({
          worktree: claim.worktree,
          sourceSha: manifest.repository.baseSha,
          patch: Buffer.from(remoteSession.bundle.patch.content, "base64"),
        });
        const materializedFiles = await this.dependencies.listChangedFiles(claim.worktree, manifest.repository.baseSha);
        if (!sameStringSet(materializedFiles, remoteSession.bundle.changedFiles)) {
          throw new RemoteSandboxExecutionError(remoteFailure(
            "NON_RETRYABLE_RESULT",
            "CANDIDATE_CHANGED_FILES_MISMATCH",
            "CANDIDATE",
            "Materialized candidate changed-file set does not match the content-addressed sandbox result bundle.",
          ));
        }
      } else {
        const executorEvents: ExecutorEvent[] = [];
        const runtimeEvents: any[] = [];
        const result = await runHarnessExecution(adapter, executorRequest, {
          emit: (event) => { executorEvents.push(event); },
          signal: controller.signal,
          processObserver: workspaceOwner ? {
            started: async (process) => {
              await (this.dependencies.recordFactoryExecutorStarted ?? recordFactoryExecutorStarted)(workspaceOwner, process.pid);
            },
            terminated: async (process) => {
              await (this.dependencies.recordFactoryExecutorTerminated ?? recordFactoryExecutorTerminated)(workspaceOwner, process);
              runtimeEvents.push({
                idempotencyKey: `factory:${claim.runId}:process:${process.pid}:terminated`,
                eventType: "CHECKPOINT_CREATED",
                workflowStep: "factory-execution",
                status: "COMPLETED",
                startedAt: process.terminatedAt,
                commandSummary: "Owned executor process terminated",
                metadata: { lifecycleType: "PROCESS_TERMINATED", pid: process.pid, exitCode: process.exitCode },
              });
            },
          } : undefined,
        });
        const normalizedResult = assertHarnessResultIdentity(executorRequest, manifest, result.normalizedResult);
        mappedEvents = [
          ...executorEvents.map((event) => mapExecutorEvent(claim.runId, event, adapterCapabilities)),
          ...runtimeEvents,
        ];
        traceObservations = mapExecutorObservations({
          runId: claim.runId,
          events: executorEvents,
          harness: adapterCapabilities,
          model: normalizedResult.provenance.model ?? claim.model ?? manifest.workflow.steps[0]?.modelRoute,
          usage: normalizedResult.usage,
          toolCalls: normalizedResult.events.toolCalls,
          promptDigest: `sha256:${createHash("sha256").update(manifest.compiledPrompt).digest("hex")}`,
          promptVersion: manifest.causation?.factoryDefinitionVersionId
            ? String(manifest.causation.factoryDefinitionVersionId)
            : undefined,
        });
        executionArtifacts.push(harnessResultArtifact(claim, normalizedResult));
        if (result.status !== "COMPLETED") {
          await report({
            events: mappedEvents,
            observations: traceObservations,
            terminal: { status: result.status === "CANCELED" ? "CANCELED" : "FAILED", failureReason: result.error ?? `${adapterCapabilities.displayName} execution failed.` },
          });
          this.failedCount += 1;
          return;
        }
        structuredResult = parseFactoryResult(normalizedResult.output);
      }
      if (structuredResult.status !== "COMPLETED") {
        const failureReason = `Execution harness reported ${structuredResult.status}: ${structuredResult.nextAction}`;
        await cleanupRemote();
        await report({
          events: mappedEvents,
          observations: traceObservations,
          artifacts: [structuredResultArtifact(claim, structuredResult), ...executionArtifacts],
          terminal: {
            status: "FAILED",
            failureReason,
            remoteFailure: remoteTerminalFailure(remoteSession, "DETERMINISTIC_GATE_FAILURE", "RESULT_VALIDATION", failureReason),
          },
        });
        this.failedCount += 1;
        return;
      }

      const scopeResult = validateChangedFileScope(
        await this.dependencies.listChangedFiles(claim.worktree, manifest.repository.baseSha),
        { allowedPaths: manifest.repository.allowedPaths, excludedPaths: manifest.repository.excludedPaths }
      );
      if (!scopeResult.ok) {
        const failureReason = `Changed files outside approved code scopes: ${scopeResult.outsideScope.join(", ")}`;
        await cleanupRemote();
        await report({
          events: mappedEvents,
          observations: traceObservations,
          artifacts: [
            structuredResultArtifact(claim, structuredResult),
            ...executionArtifacts,
            {
              idempotencyKey: `factory:${claim.runId}:path-scope-deviation`,
              artifactType: "OTHER",
              name: "Repository path-scope deviation",
              description: "Pull-request creation was blocked because changed files exceeded the frozen code scopes.",
              metadata: { changedFiles: scopeResult.changedFiles, outsideScope: scopeResult.outsideScope },
            },
          ],
          terminal: {
            status: "FAILED",
            failureReason,
            remoteFailure: remoteTerminalFailure(remoteSession, "CANDIDATE_SCOPE_INVALID", "CANDIDATE", failureReason),
          },
        });
        this.failedCount += 1;
        return;
      }
      if (scopeResult.changedFiles.length === 0) {
        const failureReason = "Harness completed without producing a reviewable code change.";
        await cleanupRemote();
        await report({
          events: mappedEvents,
          observations: traceObservations,
          artifacts: [structuredResultArtifact(claim, structuredResult), ...executionArtifacts],
          terminal: {
            status: "FAILED",
            failureReason,
            remoteFailure: remoteTerminalFailure(remoteSession, "CANDIDATE_EMPTY", "CANDIDATE", failureReason),
          },
        });
        this.failedCount += 1;
        return;
      }

      const headSha = await this.dependencies.commitFactoryChanges({
        worktree: claim.worktree,
        changedFiles: scopeResult.changedFiles,
        title: String(manifest.intent?.title ?? structuredResult.summary ?? "Mission Control Work Order"),
      });
      const candidate = await this.dependencies.inspectCandidateChange(claim.worktree, manifest.repository.baseSha);
      if (remoteSession) {
        assertRemoteCandidateIdentity({
          expectedSourceSha: manifest.repository.baseSha,
          expectedCandidateSha: headSha,
          observedSourceSha: candidate.sourceRevision,
          observedCandidateSha: candidate.candidateRevision,
        });
      } else if (candidate.candidateRevision !== headSha) {
        throw new Error("Committed candidate revision changed before verification.");
      }
      const baseArtifacts = [
        structuredResultArtifact(claim, structuredResult),
        ...executionArtifacts,
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
            treeSha: candidate.treeRevision,
          },
        },
      ];
      let verificationRecord: any;
      let verificationResult: any;
      const policyV2 = manifest.workOrderSpecification?.verificationContract?.schemaVersion === 2;
      if (manifest.workOrderSpecification?.verificationContract && !policyV2) {
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
        try {
          await this.dependencies.assertFactoryCandidateUnchanged(claim.worktree, headSha);
        } catch (error) {
          const reason = safeError(error);
          await report({
            events: mappedEvents,
            artifacts: [
              ...baseArtifacts,
              verificationMismatchArtifact(claim, candidate, verificationResult, reason),
            ],
            terminal: {
              status: "FAILED",
              failureReason: reason,
              remoteFailure: remoteTerminalFailure(remoteSession, "CANDIDATE_MUTATED_DURING_VERIFICATION", "CANDIDATE", reason),
            },
          });
          this.failedCount += 1;
          return;
        }
        const verificationReport = await report({
          events: mappedEvents,
          observations: traceObservations,
          artifacts: baseArtifacts,
          verification: verificationResult,
        });
        verificationRecord = verificationReport?.verification;
        if (manifest.workOrderSpecification.verificationContract.enforcementMode === "ENFORCED"
          && verificationRecord?.verdict !== "VERIFIED") {
          if (verificationRecord?.verdict === "REQUIRES_HUMAN_REVIEW" && verificationRecord?.paused) {
            await cleanupRemote();
            this.lastError = null;
            return;
          }
          const reason = `Independent verification did not pass: ${verificationRecord?.verdict ?? "NOT_VERIFIED"} — ${(verificationRecord?.verdictReasons ?? ["No verified receipt was returned."]).join(" ")}`;
          await cleanupRemote();
          await report({ terminal: {
            status: "FAILED",
            failureReason: reason,
            remoteFailure: remoteTerminalFailure(remoteSession, "INDEPENDENT_VERIFICATION_FAILED", "RESULT_VALIDATION", reason),
          } });
          this.failedCount += 1;
          return;
        }
      }
      await cleanupRemote();
      await this.publishCandidate({
        claim,
        manifest,
        structuredResult,
        changedFiles: scopeResult.changedFiles,
        verificationRecord,
        sourceRevision: candidate.sourceRevision,
        headSha,
        treeSha: candidate.treeRevision,
        policyV2,
        report,
        leaseId,
        assertLeaseCurrent,
        requirePublicationPermit: true,
        events: verificationResult ? [] : mappedEvents,
        observations: verificationResult ? [] : traceObservations,
        artifacts: verificationResult ? [] : baseArtifacts,
      });
      this.completedCount += 1;
      this.lastError = null;
    } catch (error) {
      let reason = safeError(error);
      try {
        await cleanupRemote();
      } catch (cleanupError) {
        reason = `${reason}; remote cleanup failed (${safeError(cleanupError)})`;
      }
      if (leaseHealthy) {
        const remoteFailureDecision = error instanceof RemoteSandboxExecutionError
          ? error.failure
          : claim?.executionManifest?.harness?.executionBackend === "remote-sandbox"
            ? remoteFailure("UNKNOWN", "REMOTE_WORKER_UNCLASSIFIED", "UNKNOWN", reason)
            : undefined;
        await report({ terminal: {
          status: controller.signal.aborted ? "CANCELED" : "FAILED",
          failureReason: reason,
          remoteFailure: remoteFailureDecision,
        } })
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
    capability: "attempts.claim" | "attempts.renew" | "attempts.report" | "attempts.authorize-publication"
      | "verification:claim" | "verification:renew" | "verification:report",
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
    treeSha?: string;
    policyV2?: boolean;
    report: (packet: any) => Promise<any>;
    leaseId: string;
    /**
     * Re-assert that this worker still holds a healthy, un-aborted lease.
     * `assertPublicationPermitCurrent` only compares in-memory values against
     * the local clock, so without this a fenced-out worker whose heartbeat has
     * already failed can still push a branch and open a pull request — an
     * external, non-revocable side effect performed without authority.
     */
    assertLeaseCurrent?: () => void;
    publicationPermit?: { id: string; leaseId: string; validUntil: number };
    requirePublicationPermit?: boolean;
    events?: any[];
    observations?: any[];
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
          ...(input.claim.lease?.workerId ? {
            workerId: input.claim.lease.workerId,
            workerSessionId: input.claim.lease.workerSessionId,
            workerGeneration: input.claim.lease.workerGeneration,
          } : {}),
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
    input.assertLeaseCurrent?.();
    const installationToken = await this.dependencies.mintInstallationToken({
      appId: configuredAppId,
      installationId: input.claim.installation.installationId,
      providerRepositoryId: input.claim.providerRepositoryId,
      privateKey,
    });
    if (installationToken.expiresAt <= Date.now() + 60_000) throw new Error("GitHub installation token expires too soon for a safe push.");
    if (input.requirePublicationPermit) assertPublicationPermitCurrent(publicationPermit, input.leaseId, input.headSha);
    await this.dependencies.assertFactoryCandidateUnchanged(input.claim.worktree, input.headSha);
    input.assertLeaseCurrent?.();
    await this.dependencies.pushFactoryBranch({
      worktree: input.claim.worktree,
      repository: input.claim.repository,
      branch: input.claim.branch,
      installationToken: installationToken.token,
    });
    if (input.requirePublicationPermit) assertPublicationPermitCurrent(publicationPermit, input.leaseId, input.headSha);
    input.assertLeaseCurrent?.();
    const pullRequest = await this.dependencies.createOrReusePullRequest({
      repository: input.claim.repository,
      branch: input.claim.branch,
      base: input.claim.defaultBranch,
      title: input.structuredResult.summary,
      body: buildPullRequestBody(input.claim, input.structuredResult, input.changedFiles, input.verificationRecord),
      token: installationToken.token,
      headSha: input.headSha,
      draft: input.policyV2 === true,
    });
    const pullRequestLineage = {
      ...input.manifest.causation,
      repositoryId: String(input.claim.repositoryId),
      repository: input.claim.repository,
      installationId: input.claim.installation.installationId,
      branch: input.claim.branch,
      sourceRevision: input.sourceRevision,
      headSha: input.headSha,
      treeSha: input.treeSha,
      pullRequestNumber: pullRequest.number,
      pullRequestUrl: pullRequest.url,
      providerPullRequestId: pullRequest.nodeId,
      draftAtPublication: pullRequest.draft,
      changedFiles: input.changedFiles,
      executionManifestDigest: input.claim.executionManifestDigest,
      publicationPermitId: publicationPermit?.id,
    };
    const pullRequestArtifact = {
      idempotencyKey: `factory:${input.claim.runId}:pull-request`,
      artifactType: "PULL_REQUEST",
      name: `Pull request #${pullRequest.number}`,
      description: "Review-ready pull request created by the governed GitHub App boundary. Human merge remains required.",
      externalLocation: pullRequest.url,
      contentHash: `sha256:${createHash("sha256").update(JSON.stringify(pullRequestLineage)).digest("hex")}`,
      metadata: pullRequestLineage,
    };
    const workspaceOwner = workspaceOwnerFromClaim(input.claim, input.manifest);
    if (!workspaceOwner) {
      await input.report({
        events: input.events ?? [],
        observations: input.observations ?? [],
        artifacts: [...(input.artifacts ?? []), pullRequestArtifact],
        terminal: { status: "COMPLETED" },
        ...(input.policyV2 ? {
          candidateReady: {
            candidateSha: input.headSha,
            treeSha: input.treeSha,
            providerPullRequestId: pullRequest.nodeId,
            pullRequestNumber: pullRequest.number,
            pullRequestUrl: pullRequest.url,
            baseRef: input.claim.defaultBranch,
            headRef: input.claim.branch,
            draftAtPublication: pullRequest.draft,
          },
        } : {}),
      });
      return;
    }
    await (this.dependencies.recordFactoryPublication ?? recordFactoryPublication)(workspaceOwner, {
      headSha: input.headSha,
      pullRequestUrl: pullRequest.url,
    });
    // Persist provider lineage before local cleanup. If the second report is
    // interrupted, the PR artifact remains durable and reconciliation can
    // complete without rerunning the executor.
    await input.report({
      events: input.events ?? [],
      observations: input.observations ?? [],
      artifacts: [...(input.artifacts ?? []), pullRequestArtifact],
    });
    const cleanup = await (this.dependencies.cleanupOwnedFactoryWorkspace ?? cleanupOwnedFactoryWorkspace)({
      owner: workspaceOwner,
      expectedHeadSha: input.headSha,
      expectedPullRequestUrl: pullRequest.url,
    });
    await input.report({
      events: [{
        idempotencyKey: `factory:${input.claim.runId}:workspace-cleanup:${cleanup.outcome.toLowerCase()}`,
        eventType: "CHECKPOINT_CREATED",
        workflowStep: "workspace-cleanup",
        status: cleanup.outcome,
        startedAt: Date.now(),
        commandSummary: cleanup.outcome === "COMPLETED" ? "Owned Factory workspace cleanup completed" : "Factory workspace preserved for operator inspection",
        metadata: { lifecycleType: `WORKSPACE_CLEANUP_${cleanup.outcome}`, reason: cleanup.reason },
      }],
      terminal: { status: "COMPLETED" },
      ...(input.policyV2 ? {
        candidateReady: {
          candidateSha: input.headSha,
          treeSha: input.treeSha,
          providerPullRequestId: pullRequest.nodeId,
          pullRequestNumber: pullRequest.number,
          pullRequestUrl: pullRequest.url,
          baseRef: input.claim.defaultBranch,
          headRef: input.claim.branch,
          draftAtPublication: pullRequest.draft,
        },
      } : {}),
    });
  }

  private async executeVerificationAttempt(input: {
    claim: any;
    manifest: any;
    report: (packet: any) => Promise<any>;
    controller: AbortController;
  }) {
    const subject = input.claim.verificationSubject;
    const plan = input.claim.verificationPlan;
    if (subject?.kind !== "GIT_CANDIDATE" || !plan?.planDigest) {
      throw new Error("Verification Attempt is missing its frozen Git subject or Verification Plan.");
    }
    await this.dependencies.ensureVerificationWorktree({
      checkoutRoot: input.claim.checkoutRoot,
      worktree: input.claim.worktree,
      candidateSha: subject.candidateSha,
      treeSha: subject.treeSha,
    });
    const candidate = await this.dependencies.inspectCandidateChange(
      input.claim.worktree,
      input.claim.defaultBranch,
      input.claim.sourceRevision,
    );
    if (candidate.candidateRevision !== subject.candidateSha || candidate.treeRevision !== subject.treeSha) {
      throw new Error("Detached verification checkout does not match the immutable Verification Subject.");
    }
    const verification = await this.dependencies.executeIndependentVerification({
      workflowRunId: String(input.claim.workflowRunId),
      workOrderId: String(input.claim.workOrderId),
      workOrderRevisionNumber: input.manifest.causation.workOrderRevisionNumber,
      title: String(input.manifest.intent.title),
      specification: input.manifest.workOrderSpecification,
      candidate,
      repositoryRoot: input.claim.worktree,
      signal: input.controller.signal,
    });
    await this.dependencies.assertFactoryCandidateUnchanged(input.claim.worktree, subject.candidateSha);
    const isolationWithoutDigest = {
      mode: "DETACHED_GIT_WORKTREE" as const,
      sandboxId: `local-worktree:${input.claim.runId}`,
      subjectDigest: subject.digest,
      verifierRoot: input.claim.worktree,
      sourceRoot: input.claim.sourceWorktree,
      initialClean: true,
      finalSubjectMatch: true,
      repositoryId: String(input.claim.repositoryId),
      headSha: subject.candidateSha,
      treeSha: subject.treeSha,
      attestedAt: Date.now(),
    };
    await input.report({
      verification,
      isolation: {
        ...isolationWithoutDigest,
        rootBindingDigest: verificationIsolationBindingDigest(isolationWithoutDigest),
      },
      terminal: { status: "COMPLETED" },
    });
  }
}

function workspaceOwnerFromClaim(claim: any, manifest: any): FactoryWorkspaceOwner | undefined {
  const lease = claim?.lease;
  if (!lease?.workerId && !lease?.workerSessionId && lease?.workerGeneration === undefined) return undefined;
  return workspaceOwnerFromLease(claim, manifest, lease);
}

function workspaceOwnerFromLease(claim: any, manifest: any, lease: any): FactoryWorkspaceOwner {
  if (!lease?.leaseId || !lease.workerId || !lease.workerSessionId || !Number.isSafeInteger(lease.workerGeneration)) {
    throw new Error("Durable Factory claim is missing its complete workspace ownership identity.");
  }
  return {
    repositoryIdentity: claim.repository,
    workflowRunId: String(claim.workflowRunId),
    workerId: lease.workerId,
    workerSessionId: lease.workerSessionId,
    workerGeneration: lease.workerGeneration,
    leaseId: lease.leaseId,
    branch: claim.branch,
    worktree: claim.worktree,
    checkoutRoot: claim.checkoutRoot,
    executionManifestDigest: claim.executionManifestDigest,
    baseSha: manifest.repository.baseSha,
    sandboxId: manifest.sandbox?.resourceName,
  };
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
    && run.executionManifestDigest
    && boundedHarnessIdentity(run.executorAdapter)
    && boundedHarnessIdentity(run.executorVersion)
    && ["PENDING", "RUNNING"].includes(run.status)
  );
}

function validateClaimManifest(claim: any) {
  const manifest = claim?.executionManifest;
  if (
    manifest?.version !== "factory-execution-manifest/v1"
    || !boundedHarnessIdentity(manifest?.harness?.adapter)
    || !boundedHarnessIdentity(manifest?.harness?.version)
    || manifest.harness.adapter !== claim.executorAdapter
    || manifest.harness.version !== claim.executorVersion
    || !boundedHarnessIdentity(manifest?.harness?.harnessId)
    || !boundedHarnessIdentity(manifest?.harness?.harnessVersion)
    || !/^sha256:[a-f0-9]{64}$/i.test(manifest?.harness?.capabilityManifestSha256 ?? "")
    || !/^[a-f0-9]{64}$/i.test(manifest?.harness?.effectiveConfigSha256 ?? "")
    || !["WORKSPACE_WRITE", "READ_ONLY", "DETACHED_READ_ONLY"].includes(manifest?.harness?.isolation)
    || manifest?.harness?.pullRequestAuthority !== "CONTROL_PLANE_ONLY"
    || typeof manifest?.harness?.executionBackend !== "string"
    || !manifest.harness.executionBackend.trim()
    || !Array.isArray(manifest?.harness?.requiredCapabilities)
    || !Number.isSafeInteger(manifest?.harness?.timeoutMs)
    || manifest.harness.timeoutMs < 1_000
    || manifest.harness.timeoutMs > 8 * 60 * 60 * 1_000
    || !Array.isArray(manifest?.repository?.allowedPaths)
    || typeof manifest?.repository?.baseSha !== "string"
    || !/^[a-f0-9]{40,64}$/i.test(manifest.repository.baseSha)
    || manifest.repository.allowedPaths.length === 0
    || !Array.isArray(manifest?.repository?.excludedPaths)
    || !Array.isArray(manifest?.workflow?.steps)
    || typeof manifest?.compiledPrompt !== "string"
    || !manifest.compiledPrompt.trim()
    || claim.executionManifestDigest !== `sha256:${canonicalHash(manifest)}`
  ) throw new Error("Claimed Factory execution manifest is invalid.");
  if (manifest.harness.executionBackend === "remote-sandbox") {
    const profile = manifest?.sandbox?.profileSnapshot;
    const expectedResourceName = stableSandboxResourceName({
      projectId: String(claim.projectId),
      workflowRunId: String(manifest.causation.workflowRunId),
      attemptId: String(claim.runId),
    });
    if (manifest?.causation?.workflowRunId !== claim.runId
      || !validateRemoteRetryBudget(manifest?.retryPolicy)
      || !Array.isArray(manifest?.retryPolicy?.failClosedFailureClasses)
      || manifest.retryPolicy.failClosedFailureClasses.join(",") !== "NON_RETRYABLE_RESULT,UNKNOWN"
      || manifest?.sandbox?.resourceName !== expectedResourceName
      || manifest?.sandbox?.profileDigest !== sandboxProfileDigest(profile)
      || manifest?.sandbox?.resultContract?.schema !== "factory-sandbox-result/v1"
      || manifest?.sandbox?.resultContract?.independentHostValidationRequired !== true
      || manifest?.sandbox?.teardown?.credentialsRevokedBeforePublication !== true
      || manifest?.sandbox?.teardown?.resourceAbsenceRequiredBeforePublication !== true
      || !Array.isArray(manifest?.sandbox?.credentialGrants)
      || manifest.sandbox.credentialGrants.some((grant: any) => grant?.secretValueIncluded !== false
        || grant?.githubAuthority !== "NONE" || grant?.providerAuthority !== "NONE")) {
      throw new Error("Claimed remote Factory manifest exceeds sandbox authority or has an invalid frozen profile.");
    }
  } else if (manifest.sandbox) {
    throw new Error("Claimed persistent-worker manifest contains a remote sandbox binding.");
  }
  return manifest;
}

function assertHarnessAdapterIdentity(
  manifest: FrozenHarnessExecutionManifest,
  registration: RegisteredHarnessAdapter,
) {
  const capabilityManifest = registration.manifest;
  if (!capabilityManifest
    || capabilityManifest.identity.adapterId !== manifest.harness.adapter
    || capabilityManifest.identity.adapterVersion !== manifest.harness.version
    || capabilityManifest.identity.harnessId !== manifest.harness.harnessId
    || capabilityManifest.identity.harnessVersion !== manifest.harness.harnessVersion
    || harnessCapabilityManifestDigest(capabilityManifest) !== manifest.harness.capabilityManifestSha256
    || capabilityManifest.effectiveConfigSha256 !== manifest.harness.effectiveConfigSha256) {
    throw new Error("Registered harness adapter does not match the frozen Attempt capability/configuration identity.");
  }
  if (!capabilityManifest.admission.executionBackends.includes(manifest.harness.executionBackend)) {
    throw new Error("Registered harness adapter does not support the frozen execution backend.");
  }
}

function assertHarnessResultIdentity(
  request: ExecutorRequest,
  manifest: FrozenHarnessExecutionManifest,
  result: HarnessNormalizedResult | undefined,
): HarnessNormalizedResult {
  if (!result) throw new Error("Harness did not return the required normalized harness-result/v1 bundle.");
  const issues = harnessNormalizedResultIssues(result);
  if (issues.length > 0
    || result.executionId !== request.executionId
    || result.harness.adapterId !== manifest.harness.adapter
    || result.harness.adapterVersion !== manifest.harness.version
    || result.harness.harnessId !== manifest.harness.harnessId
    || result.harness.harnessVersion !== manifest.harness.harnessVersion
    || result.provenance.capabilityManifestSha256 !== manifest.harness.capabilityManifestSha256
    || result.provenance.effectiveConfigSha256 !== manifest.harness.effectiveConfigSha256
    || result.provenance.provider !== (request.provider ?? null)
    || result.provenance.model !== (request.model ?? null)) {
    throw new Error(`Harness normalized result does not match the frozen Attempt identity${issues.length ? ` (${issues.join(", ")})` : ""}.`);
  }
  return result;
}

function mapExecutorEvent(runId: string, event: ExecutorEvent, harness: HarnessExecutorCapabilities) {
  const eventType = {
    EXECUTION_STARTED: "STEP_STARTED",
    COMMAND_STARTED: "TOOL_CALLED",
    COMMAND_COMPLETED: "COMMAND_EXECUTED",
    TOOL_CALLED: "TOOL_CALLED",
    ARTIFACT_PRODUCED: "COMMAND_EXECUTED",
    EXECUTION_COMPLETED: "STEP_COMPLETED",
    EXECUTION_FAILED: "RUN_FAILED",
    EXECUTION_CANCELED: "RUN_FAILED",
  }[event.type];
  return {
    idempotencyKey: `factory:${runId}:executor:${event.sequence}`,
    eventType,
    workflowStep: "factory-execution",
    toolName: event.type.startsWith("COMMAND") ? `${harness.adapter}/${harness.version}` : undefined,
    commandSummary: event.summary,
    status: event.type.endsWith("FAILED") ? "FAILED" : event.type.endsWith("CANCELED") ? "CANCELED" : "RECORDED",
    startedAt: event.occurredAt,
    metadata: {
      executorEventType: event.type,
      executorSequence: event.sequence,
      harnessAdapter: harness.adapter,
      harnessAdapterVersion: harness.version,
      ...(event.metadata ?? {}),
    },
  };
}

export function mapExecutorObservations(input: {
  runId: string;
  events: ExecutorEvent[];
  harness: Pick<HarnessExecutorCapabilities, "adapter" | "version" | "displayName" | "provider">;
  model?: string;
  usage?: HarnessNormalizedResult["usage"];
  toolCalls?: number | null;
  promptDigest: string;
  promptVersion?: string;
}) {
  const startedAt = input.events.find((event) => event.type === "EXECUTION_STARTED")?.occurredAt
    ?? input.events[0]?.occurredAt
    ?? Date.now();
  const terminal = [...input.events].reverse().find((event) =>
    ["EXECUTION_COMPLETED", "EXECUTION_FAILED", "EXECUTION_CANCELED"].includes(event.type)
  );
  const failed = terminal?.type === "EXECUTION_FAILED" || terminal?.type === "EXECUTION_CANCELED";
  const status = terminal ? failed ? "FAILED" : "SUCCESS" : "RUNNING";
  const harnessKey = `${input.harness.adapter}/${input.harness.version}`;
  const agentKey = `harness-agent:${input.runId}`;
  const generationKey = `harness-generation:${input.runId}:primary`;
  const observations: any[] = [{
    idempotencyKey: agentKey,
    type: "AGENT",
    name: `${input.harness.displayName} implementation agent`,
    startedAt,
    endedAt: terminal?.occurredAt,
    status,
    model: input.model,
    provider: input.harness.provider,
    promptVersion: input.promptVersion,
    input: { promptDigest: input.promptDigest },
    output: terminal ? { summary: terminal.summary } : undefined,
    error: failed ? { message: terminal?.summary ?? `${input.harness.displayName} execution failed.` } : undefined,
    metadata: { adapter: input.harness.adapter, adapterVersion: input.harness.version },
  }, {
    idempotencyKey: generationKey,
    parentIdempotencyKey: agentKey,
    type: "GENERATION",
    name: input.model ? `${input.model} execution` : `${input.harness.displayName} model execution`,
    startedAt,
    endedAt: terminal?.occurredAt,
    status,
    model: input.model,
    provider: input.harness.provider,
    promptVersion: input.promptVersion,
    input: { promptDigest: input.promptDigest },
    output: terminal ? { summary: terminal.summary } : undefined,
    error: failed ? { message: terminal?.summary ?? "Model execution failed." } : undefined,
  }];
  const commandStarts = input.events.filter((event) => event.type === "COMMAND_STARTED");
  const commandEnds = input.events.filter((event) => event.type === "COMMAND_COMPLETED");
  commandStarts.forEach((event, index) => {
    const completed = commandEnds[index];
    observations.push({
      idempotencyKey: `harness-tool:${input.runId}:${index + 1}`,
      parentIdempotencyKey: generationKey,
      type: "TOOL",
      name: input.harness.displayName,
      toolName: harnessKey,
      startedAt: event.occurredAt,
      endedAt: completed?.occurredAt,
      status: completed ? "SUCCESS" : failed ? "FAILED" : "RUNNING",
      output: completed ? { summary: completed.summary, ...(completed.metadata ?? {}) } : undefined,
      error: !completed && failed ? { message: terminal?.summary ?? `${input.harness.displayName} command did not complete.` } : undefined,
      metadata: { executorSequence: event.sequence },
    });
  });
  return observations;
}

function parseFactoryResult(output: string) {
  if (Buffer.byteLength(output, "utf8") > MAX_RESULT_BYTES) throw new Error("Harness structured result exceeds the 64 KB context budget.");
  let result: any;
  try {
    result = JSON.parse(output);
  } catch {
    throw new Error("Execution harness did not return the required factory-result/v1 JSON object.");
  }
  return validateFactoryResult(result);
}

function validateFactoryResult(result: any) {
  const statuses = ["COMPLETED", "BLOCKED", "FAILED"];
  const arrayFields = [
    "completedAcceptanceCriterionIds", "incompleteAcceptanceCriterionIds",
    "unknownAcceptanceCriterionIds", "verificationCommands", "knownRisks",
  ];
  const allowedFields = new Set(["schema", "status", "summary", ...arrayFields, "nextAction"]);
  if (!result || typeof result !== "object" || Array.isArray(result)
    || Object.keys(result).some((field) => !allowedFields.has(field))
    || result.schema !== "factory-result/v1" || !statuses.includes(result.status)
    || typeof result.summary !== "string" || !result.summary.trim()
    || typeof result.nextAction !== "string"
    || arrayFields.some((field) => !Array.isArray(result[field]) || result[field].some((item: unknown) => typeof item !== "string"))) {
    throw new Error("Harness factory-result/v1 JSON failed schema validation.");
  }
  const criterionIds = [
    ...result.completedAcceptanceCriterionIds,
    ...result.incompleteAcceptanceCriterionIds,
    ...result.unknownAcceptanceCriterionIds,
  ];
  if (new Set(criterionIds).size !== criterionIds.length) {
    throw new Error("Harness factory-result/v1 JSON assigned an acceptance criterion more than once.");
  }
  return result as {
    schema: "factory-result/v1";
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

export function assertRemoteCandidateIdentity(input: {
  expectedSourceSha: string;
  expectedCandidateSha: string;
  observedSourceSha: string;
  observedCandidateSha: string;
}) {
  if (input.observedSourceSha !== input.expectedSourceSha) {
    throw new RemoteSandboxExecutionError(remoteFailure(
      "NON_RETRYABLE_RESULT",
      "CANDIDATE_SOURCE_SHA_MISMATCH",
      "CANDIDATE",
      "Remote candidate source SHA does not match the frozen Attempt source.",
    ));
  }
  if (input.observedCandidateSha !== input.expectedCandidateSha) {
    throw new RemoteSandboxExecutionError(remoteFailure(
      "NON_RETRYABLE_RESULT",
      "CANDIDATE_SHA_MISMATCH",
      "CANDIDATE",
      "Remote candidate SHA changed before independent verification.",
    ));
  }
}

function remoteTerminalFailure(
  session: RemoteSandboxCandidateSession | undefined,
  code: string,
  stage: "RESULT_VALIDATION" | "CANDIDATE",
  summary: string,
) {
  return session
    ? remoteFailure("NON_RETRYABLE_RESULT", code, stage, summary)
    : undefined;
}

function structuredResultArtifact(claim: any, result: ReturnType<typeof parseFactoryResult>) {
  const persistedResult = {
    ...result,
    summary: redactHarnessText(result.summary, 4_000),
    nextAction: redactHarnessText(result.nextAction, 4_000),
    verificationCommands: result.verificationCommands.map((item) => redactHarnessText(item, 2_000)),
    knownRisks: result.knownRisks.map((item) => redactHarnessText(item, 2_000)),
  };
  return {
    idempotencyKey: `factory:${claim.runId}:structured-result`,
    artifactType: "STRUCTURED_OUTPUT",
    name: "Execution harness factory-result/v1",
    description: persistedResult.summary,
    contentHash: `sha256:${createHash("sha256").update(JSON.stringify(persistedResult)).digest("hex")}`,
    metadata: { schema: "factory-result/v1", acceptanceAuthority: false, result: persistedResult },
  };
}

function harnessResultArtifact(claim: { runId: string }, result: HarnessNormalizedResult) {
  const persistedResult = {
    ...result,
    provenance: {
      ...result.provenance,
      providerMetadata: Object.fromEntries(Object.entries(result.provenance.providerMetadata).map(([key, value]) => [
        key,
        typeof value === "string" ? redactHarnessText(value, 500) : value,
      ])),
    },
    events: {
      ...result.events,
      items: result.events.items.slice(0, 500).map((event) => ({
        ...event,
        summary: redactHarnessText(event.summary, 2_000),
        metadata: sanitizeHarnessMetadata(event.metadata),
      })),
    },
    output: redactHarnessText(result.output, MAX_RESULT_BYTES),
    structuredOutput: {
      schema: result.structuredOutput.schema,
      summary: result.structuredOutput.summary ? redactHarnessText(result.structuredOutput.summary, 4_000) : null,
    },
    error: result.error ? redactHarnessText(result.error, 2_000) : null,
  };
  return {
    idempotencyKey: `factory:${claim.runId}:harness-result:${result.provenance.requestSha256}`,
    artifactType: "STRUCTURED_OUTPUT",
    name: `${result.harness.harnessId} normalized harness-result/v1`,
    description: `Untrusted execution result: ${result.status}. Independent verification remains authoritative.`,
    contentHash: `sha256:${createHash("sha256").update(JSON.stringify(persistedResult)).digest("hex")}`,
    retentionPolicy: "ATTEMPT_EVIDENCE",
    sensitivity: "INTERNAL",
    metadata: { schema: "harness-result/v1", acceptanceAuthority: false, result: persistedResult },
  };
}

function verificationMismatchArtifact(claim: any, candidate: any, verification: any, reason: string) {
  const checkSummary = (verification?.checks ?? []).map((check: any) => ({
    checkId: check.checkId,
    verifierId: check.verifierId,
    status: check.status,
    evidence: (check.evidence ?? []).map((item: any) => ({
      evidenceKey: item.evidenceKey,
      contentHash: item.contentHash,
      producer: item.producer,
    })),
  }));
  return {
    idempotencyKey: `factory:${claim.runId}:verification-candidate-mismatch:${candidate.candidateRevision}`,
    artifactType: "VERIFICATION_EVIDENCE",
    name: "Independent verification candidate-integrity failure",
    description: reason,
    contentHash: `sha256:${createHash("sha256").update(JSON.stringify({
      sourceRevision: candidate.sourceRevision,
      candidateRevision: candidate.candidateRevision,
      checkSummary,
      reason,
    })).digest("hex")}`,
    metadata: {
      failureClass: "CANDIDATE_INTEGRITY_MISMATCH",
      sourceRevision: candidate.sourceRevision,
      candidateRevision: candidate.candidateRevision,
      checkSummary,
      reason,
    },
  };
}

function sandboxResultArtifact(claim: any, bundle: SandboxResultBundle) {
  return {
    idempotencyKey: `factory:${claim.runId}:sandbox-result:${bundle.digest}`,
    artifactType: "STRUCTURED_OUTPUT",
    name: "Remote sandbox result bundle",
    description: bundle.structuredResult.summary,
    contentHash: bundle.digest,
    retentionPolicy: "ATTEMPT_EVIDENCE",
    sensitivity: "INTERNAL",
    metadata: {
      schema: bundle.schema,
      sourceSha: bundle.sourceSha,
      profileDigest: bundle.profileDigest,
      manifestDigest: bundle.manifestDigest,
      status: bundle.status,
      workOrderRevisionNumber: bundle.workOrderRevisionNumber,
      changedFiles: bundle.changedFiles,
      diff: bundle.diff,
      commandResults: bundle.commandResults,
      verificationInputs: bundle.verificationInputs,
      environment: bundle.environment,
      harness: bundle.harness,
      resultProvenance: bundle.resultProvenance,
      failure: bundle.failure ?? null,
      patchDigest: bundle.patch.digest,
      patchByteLength: bundle.patch.byteLength,
      executor: {
        exitCode: bundle.executor.exitCode,
        stdoutDigest: bundle.executor.stdoutDigest,
        stderrDigest: bundle.executor.stderrDigest,
        stdoutTail: bundle.executor.stdoutTail,
        stderrTail: bundle.executor.stderrTail,
        resultOutput: bundle.executor.resultOutput ?? null,
      },
      usage: bundle.usage,
      secretValuesIncluded: false,
      acceptanceAuthority: "NONE",
      verificationAuthority: "NONE",
      publicationAuthority: "NONE",
    },
  };
}

function requireRemoteInvocation(
  adapter: HarnessRuntimeAdapter,
  capabilities: HarnessExecutorCapabilities,
  request: {
    executionId: string;
    repositoryRoot: string;
    workingDirectory: string;
    prompt: string;
    model?: string;
    allowedPaths: string[];
    timeoutMs: number;
    isolation: "READ_ONLY" | "WORKSPACE_WRITE";
  },
) {
  const repositoryRoot = "/var/lib/mission-control/attempt/repository";
  const resultPath = "/var/lib/mission-control/attempt/executor-result.json";
  if (!adapter.createRemoteInvocation) {
    throw new Error(`Harness adapter ${capabilities.adapter}/${capabilities.version} does not support remote-sandbox execution.`);
  }
  const issues = adapter.validateConfiguration(request);
  if (issues.length > 0) {
    throw new Error(`Harness adapter configuration is invalid: ${issues.map((issue) => `${issue.field}: ${issue.message}`).join(" ")}`);
  }
  const invocation = adapter.createRemoteInvocation(request, { repositoryRoot, resultPath });
  if (!invocation.command.trim()
    || invocation.args.length === 0
    || invocation.resultPath !== resultPath
    || invocation.model !== request.model
    || invocation.prompt !== request.prompt
    || invocation.timeoutMs !== request.timeoutMs
    || !sameStringSet(invocation.allowedPaths, request.allowedPaths)) {
    throw new Error("Remote harness invocation does not preserve the frozen Attempt request.");
  }
  return invocation;
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

function boundedHarnessIdentity(value: unknown): value is string {
  return typeof value === "string"
    && value === value.trim()
    && value.length > 0
    && value.length <= 100
    && !/[\0\r\n]/.test(value);
}

function safeError(error: unknown) {
  return redactHarnessText(error instanceof Error ? error.message : String(error), 2_000);
}

function redactHarnessText(value: string, maximum: number) {
  return value
    .replace(/(authorization|cookie|token|secret|password|api[-_]?key)\s*[:=]\s*([^\s,;]+)/gi, "$1=[REDACTED]")
    .replace(/\b(?:gh[opsu]_|github_pat_)[A-Za-z0-9_]{20,}\b/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_PROVIDER_TOKEN]")
    .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]")
    .slice(0, maximum);
}

function sanitizeHarnessMetadata(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return redactHarnessText(value, 500);
  if (depth >= 3) return "[OMITTED]";
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeHarnessMetadata(item, depth + 1));
  if (!value || typeof value !== "object") return undefined;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 50).map(([key, item]) => [
    key,
    /authorization|cookie|token|secret|password|api[-_]?key/i.test(key)
      ? "[REDACTED]"
      : sanitizeHarnessMetadata(item, depth + 1),
  ]));
}
