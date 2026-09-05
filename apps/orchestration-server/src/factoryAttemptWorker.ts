import { createHash, randomUUID } from "node:crypto";
import type { ConvexHttpClient } from "convex/browser";
import type {
  ExecutorEvent,
  ExecutorRequest,
  HarnessCapabilityManifest,
  HarnessExecutionBackend,
  HarnessExecutorCapabilities,
  HarnessNormalizedResult,
  HarnessRuntimeArtifactIdentity,
} from "@mission-control/workflow-engine";
import {
  harnessCapabilityManifestDigest,
  harnessExecutionRequestDigest,
  harnessNormalizedResultIssues,
  harnessRuntimeArtifactDigest,
  harnessRuntimeArtifactIssues,
  runHarnessExecution,
  verificationIsolationBindingDigest,
  verifyGitSubjectPublicationBinding,
} from "@mission-control/workflow-engine";
import { canonicalHash } from "@mission-control/shared";
import { evaluateVerificationAuthority } from "@mission-control/workflow-engine/verification-authority";
import { HarnessAdapterRegistry, type HarnessRuntimeAdapter, type RegisteredHarnessAdapter } from "./harnessAdapterRegistry.js";
import { ConvexActions, ConvexQueries } from "./convexCalls.js";
import { createSignedServiceCommand } from "./serviceCommandClient.js";
import { assertFactoryCandidateUnchanged, commitFactoryChanges, createFactorySourceBundle, ensureFactoryWorktree, ensureVerificationWorktree, inspectCandidateChange, listChangedFiles, materializeRemoteCandidate, prepareFactoryDependencies, pushFactoryBranch } from "./factoryGitRuntime.js";
import { validateChangedFileScope } from "./factoryPathScope.js";
import { createOrReusePullRequest, reconcilePublishedPullRequest, loadGithubAppPrivateKey, mintInstallationToken } from "./githubAppRuntime.js";
import { executeIndependentVerification, evaluateVerificationPolicyRejection } from "./factoryVerification.js";
import {
  cleanupOwnedFactoryWorkspace,
  recordFactoryExecutorStarted,
  recordFactoryExecutorTerminated,
  recordFactoryInvocationStarted,
  recordFactoryInvocationCompleted,
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
import { loadGovernedMcpContext } from "./factoryGovernedMcpContext.js";

export const FACTORY_ATTEMPT_LEASE_DURATION_MS = 120_000;
const HEARTBEAT_INTERVAL_MS = 20_000;
const MAX_RESULT_BYTES = 64_000;

interface FrozenHarnessExecutionManifest {
  version: "factory-execution-manifest/v1" | "factory-execution-manifest/v2" | "factory-execution-manifest/v3";
  harness: {
    adapter: string;
    version: string;
    harnessId: string;
    harnessVersion: string;
    harnessCommit: string;
    capabilityManifest: HarnessCapabilityManifest;
    capabilityManifestSha256: string;
    effectiveConfigSha256: string;
    executionBackend?: string;
    provider?: string;
    model?: string;
    modelRouteSnapshot?: unknown;
    runtimeArtifact?: HarnessRuntimeArtifactIdentity;
    runtimeArtifactDigest?: string;
    isolation: "READ_ONLY" | "WORKSPACE_WRITE" | "DETACHED_READ_ONLY";
    requiredCapabilities: string[];
    requiredHarnessCapabilities?: Array<{ capability: string; minimumSupport: string }>;
    pullRequestAuthority: "CONTROL_PLANE_ONLY";
    timeoutMs: number;
  };
  modelRoute?: {
    catalogId: string;
    routeDigest: string;
    routeSnapshot: unknown;
    qualificationDigest: string;
    qualificationSnapshot: unknown;
  };
  executionBackend?: string;
  executionProfile?: {
    profileId: string;
    profileKey: string;
    version: number;
    profileDigest: string;
    profileSnapshot: unknown;
    qualificationDigest: string;
    qualificationSnapshot: unknown;
  };
  [key: string]: any;
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
  prepareFactoryDependencies?: typeof prepareFactoryDependencies;
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
  reconcilePublishedPullRequest?: typeof reconcilePublishedPullRequest;
  recordFactoryExecutorStarted?: typeof recordFactoryExecutorStarted;
  recordFactoryExecutorTerminated?: typeof recordFactoryExecutorTerminated;
  recordFactoryInvocationStarted?: typeof recordFactoryInvocationStarted;
  recordFactoryInvocationCompleted?: typeof recordFactoryInvocationCompleted;
  recordFactoryPublication?: typeof recordFactoryPublication;
  cleanupOwnedFactoryWorkspace?: typeof cleanupOwnedFactoryWorkspace;
  transferFactoryPublicationWorkspace?: typeof transferFactoryPublicationWorkspace;
  createFactorySourceBundle?: typeof createFactorySourceBundle;
  materializeRemoteCandidate?: typeof materializeRemoteCandidate;
  recordFactorySandboxStarted?: typeof recordFactorySandboxStarted;
  recordFactorySandboxTerminated?: typeof recordFactorySandboxTerminated;
  createSandboxProvider?: (profile: SandboxProfileSnapshot) => SandboxProvider;
  createSandboxCredentialBroker?: () => SandboxCredentialBroker;
  loadGovernedMcpContext?: typeof loadGovernedMcpContext;
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
  prepareFactoryDependencies,
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
  reconcilePublishedPullRequest,
  recordFactoryExecutorStarted,
  recordFactoryExecutorTerminated,
  recordFactoryInvocationStarted,
  recordFactoryInvocationCompleted,
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
  loadGovernedMcpContext,
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
    adapters: HarnessAdapterRegistry | HarnessRuntimeAdapter,
    private readonly enabled = process.env.FACTORY_EXECUTION_ENABLED === "1",
    private readonly pollIntervalMs = boundedInteger(process.env.FACTORY_EXECUTION_POLL_MS, 5_000, 300_000, 15_000),
    private readonly dependencies: FactoryAttemptWorkerDependencies = DEFAULT_DEPENDENCIES,
    private readonly scope?: FactoryAttemptWorkerScope,
    private readonly identity?: FactoryAttemptWorkerIdentity,
    private readonly tryAcquireSharedSlot?: () => (() => void) | null,
  ) {
    this.adapters = adapters instanceof HarnessAdapterRegistry
      ? adapters
      : new HarnessAdapterRegistry([adapters]);
    if (this.enabled && this.adapters.registrations().length === 0) {
      throw new Error("Factory execution is enabled, but no harness adapters were explicitly configured.");
    }
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
        const executionBackend = manifestExecutionBackend(run?.executionManifest);
        if (!isBoundFactoryAttempt(run)
          || !this.adapters.supports({ adapter: run.executorAdapter, version: run.executorVersion }, executionBackend)
          || !matchesWorkerScope(run, this.scope)
          || this.active.has(String(run._id))) continue;
        if (executionBackend === "remote-sandbox"
          && (!this.scope || (this.cleanupHealth?.failed ?? 0) > 0)) {
          this.lastError = !this.scope
            ? "Remote sandbox dispatch requires a repository-scoped canonical worker."
            : "Remote sandbox dispatch is blocked while orphan cleanup is unhealthy.";
          continue;
        }
        const releaseSharedSlot = this.tryAcquireSharedSlot?.() ?? null;
        if (this.tryAcquireSharedSlot && !releaseSharedSlot) break;
        const controller = new AbortController();
        this.active.set(String(run._id), controller);
        const task = this.execute(run, controller)
          .catch((error) => {
            this.failedCount += 1;
            this.lastError = safeError(error);
            console.error(`[factory-worker] Attempt ${run.runId} failed: ${this.lastError}`);
          })
          .finally(() => {
            this.active.delete(String(run._id));
            releaseSharedSlot?.();
          });
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
          if (!result?.renewed || result.cancellationRequested) throw new Error(`Attempt lease renewal rejected or cancellation requested (${result?.reason ?? "unknown"}).`);
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
    const assertActive = async () => {
      controller.signal.throwIfAborted();
      if (heartbeatTask) await heartbeatTask;
      if (!leaseHealthy) throw new Error("Attempt authority was lost.");
      try {
        const result = await this.command(
          verificationAttempt ? "renewVerificationAttempt" : "renewFactoryAttempt",
          verificationAttempt ? "verification:renew" : "attempts.renew", run,
          { workflowRunId: run._id, leaseId, leaseDurationMs: FACTORY_ATTEMPT_LEASE_DURATION_MS, ...workerLeaseIdentity },
        );
        if (!result?.renewed || result.cancellationRequested) throw new Error("Attempt authority was lost or cancelled.");
        controller.signal.throwIfAborted();
      } catch (error) {
        leaseHealthy = false;
        controller.abort();
        throw error;
      }
    };
    let remoteSession: RemoteSandboxCandidateSession | undefined;
    let remoteCleanupComplete = false;
    const cleanupRemote = async () => {
      if (!remoteSession || remoteCleanupComplete) return;
      await remoteSession.cleanup();
      remoteCleanupComplete = true;
    };

    try {
      const manifest = validateClaimManifest(claim, leaseId);
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
      if (claim.publicationCheckpoint?.reconciliationOnly === true && claim.publicationCheckpoint.publicationBinding) {
        const checkpoint = validatePublicationCheckpoint(claim.publicationCheckpoint);
        const subject = claim.publicationCheckpoint.verificationSubject;
        const binding = claim.publicationCheckpoint.publicationBinding;
        if (subject?.version !== 2 || !verifyGitSubjectPublicationBinding(subject, binding)
          || subject.candidateSha !== checkpoint.candidateRevision || subject.baseSha !== checkpoint.sourceRevision) {
          throw new Error("Durable publication recovery does not match its immutable candidate binding.");
        }
        const token = await this.publicationInstallationToken(claim);
        const observed = await (this.dependencies.reconcilePublishedPullRequest ?? reconcilePublishedPullRequest)({ repository: claim.repository,
          providerRepositoryId: subject.providerRepositoryId, branch: subject.headRef, base: subject.baseRef, headSha: subject.candidateSha, token: token.token });
        if (observed.nodeId !== binding.pullRequest.providerPullRequestId || observed.number !== binding.pullRequest.number || observed.url !== binding.pullRequest.url) {
          throw new Error("Remote publication identity differs from the durable binding.");
        }
        const recorded = await report({ events: [{ idempotencyKey: `publication-reconciled:${claim.runId}:${binding.digest}`,
          eventType: "PUBLICATION_RECONCILED", workflowStep: "publication", status: "COMPLETED", startedAt: Date.now(),
          metadata: { reconciliationOnly: true, bindingDigest: binding.digest, providerWrites: 0 } }], terminal: { status: "COMPLETED" } });
        if (recorded?.accepted !== true) throw new Error("Publication reconciliation was not durably recorded.");
        this.completedCount += 1;
        this.lastError = null;
        return;
      }
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
        const subject = claim.publicationCheckpoint.verificationSubject;
        if (subject?.version === 2 && (candidate.sourceRevision !== subject.baseSha || candidate.candidateRevision !== subject.candidateSha
          || candidate.treeRevision !== subject.treeSha || candidate.rawDiffSha256 !== subject.rawDiffSha256
          || claim.defaultBranch !== subject.baseRef || claim.branch !== subject.headRef
          || claim.providerRepositoryId !== subject.providerRepositoryId || claim.repository !== manifest.repository.repository)) {
          throw new Error("Publication checkpoint no longer matches the exact pre-publication subject.");
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
          assertActive,
          signal: controller.signal,
          requirePublicationPermit: true,
          treeSha: candidate.treeRevision,
          policyV2: subject?.version === 2,
        });
        this.completedCount += 1;
        this.lastError = null;
        return;
      }

      await (this.dependencies.prepareFactoryDependencies ?? prepareFactoryDependencies)({
        worktree: claim.worktree,
      });

      let mappedEvents: any[] = [];
      let traceObservations: any[] = [];
      let structuredResult: ReturnType<typeof validateFactoryResult>;
      const executionArtifacts: any[] = [];
      const frozenModelRoute = manifestModelRoute(manifest);
      if (!frozenModelRoute) throw new Error("Claimed Factory execution manifest has no exact frozen provider/model route.");
      const governedMcpContext = await (this.dependencies.loadGovernedMcpContext ?? loadGovernedMcpContext)({
        client: this.client,
        claim,
        manifest,
        signal: controller.signal,
      });
      const executorRequest: ExecutorRequest = {
        executionId: `${claim.runId}:${claim.executionManifestDigest}`,
        repositoryRoot: claim.worktree,
        workingDirectory: claim.worktree,
        prompt: governedMcpContext
          ? `${manifest.compiledPrompt}\n\n${governedMcpContext.text}`
          : manifest.compiledPrompt,
        provider: frozenModelRoute.provider,
        model: frozenModelRoute.model,
        ...(frozenModelRoute.modelRouteDigest === undefined ? {} : {
          modelRouteDigest: frozenModelRoute.modelRouteDigest,
          providerRoute: frozenModelRoute.providerRoute,
          ...(frozenModelRoute.reasoningConfig === undefined
            ? {}
            : { reasoningConfig: structuredClone(frozenModelRoute.reasoningConfig) }),
        }),
        allowedPaths: manifest.repository.allowedPaths,
        deniedPaths: manifest.repository.excludedPaths,
        timeoutMs: manifest.harness.timeoutMs,
        isolation: manifest.harness.isolation === "READ_ONLY" ? "READ_ONLY" : "WORKSPACE_WRITE",
      };
      if (manifestExecutionBackend(manifest) === "remote-sandbox") {
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
          profileAdmittedAt: claim.lease.heartbeatAt,
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
        let eventPersistence = Promise.resolve();
        const result = await runHarnessExecution(adapter, executorRequest, {
          attempt: workspaceOwner ? {
            workOrderId: String(claim.workOrderId), attemptId: String(claim.runId),
            executorIdentity: `${workerLeaseIdentity.workerId}:${workerLeaseIdentity.workerSessionId}:${workerLeaseIdentity.workerGeneration}`,
            environmentReference: `local-worktree:${claim.runId}`, sourceRevision: manifest.repository.baseSha,
            acceptanceCriteria: manifest.workOrderSpecification?.acceptanceCriteria ?? [],
            assertActive,
          } : undefined,
          emit: (event) => {
            executorEvents.push(event);
            eventPersistence = eventPersistence.then(async () => {
              const recorded = await report({ events: [mapExecutorEvent(claim.runId, event, adapterCapabilities)] });
              if (recorded?.accepted !== true) throw new Error("Canonical Attempt rejected executor evidence.");
            });
            void eventPersistence.catch(() => controller.abort());
            return eventPersistence;
          },
          signal: controller.signal,
          invocationObserver: workspaceOwner ? {
            started: async (executionId) => { await (this.dependencies.recordFactoryInvocationStarted ?? recordFactoryInvocationStarted)(workspaceOwner, executionId); },
            completed: async (executionId) => { await (this.dependencies.recordFactoryInvocationCompleted ?? recordFactoryInvocationCompleted)(workspaceOwner, executionId); },
          } : undefined,
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
        await eventPersistence;
        const normalizedResult = assertHarnessResultIdentity(executorRequest, manifest, result.normalizedResult);
        mappedEvents = [
          ...executorEvents.map((event) => mapExecutorEvent(claim.runId, event, adapterCapabilities)),
          ...runtimeEvents,
        ];
        traceObservations = mapExecutorObservations({
          runId: claim.runId,
          events: executorEvents,
          harness: adapterCapabilities,
          provider: frozenModelRoute.provider,
          model: normalizedResult.provenance.model ?? frozenModelRoute.model,
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
      controller.signal.throwIfAborted();
      await adapter.recordCandidate?.(executorRequest.executionId, {
        sourceRevision: candidate.sourceRevision, candidateRevision: candidate.candidateRevision,
      });
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
            rawDiffSha256: candidate.rawDiffSha256,
          },
        },
      ];
      let verificationRecord: any;
      let verificationResult: any;
      const policyV2 = manifest.workOrderSpecification?.verificationContract?.schemaVersion === 2;
      if (policyV2 && manifest.repository.verificationPublicationOrder === "VERIFY_BEFORE_PUBLICATION") {
        await this.dependencies.assertFactoryCandidateUnchanged(claim.worktree, headSha);
        await cleanupRemote();
        clearInterval(heartbeat);
        if (heartbeatTask) await heartbeatTask;
        const ready = await report({ events: mappedEvents, observations: traceObservations, artifacts: baseArtifacts,
          candidateReady: { version: 2, candidateSha: headSha, treeSha: candidate.treeRevision, rawDiffSha256: candidate.rawDiffSha256,
            sourceRevision: candidate.sourceRevision, baseRef: manifest.repository.defaultBranch, headRef: manifest.repository.branch } });
        if (ready?.accepted !== true || ready.paused !== true) throw new Error("Canonical pre-publication candidate was not durably paused.");
        clearInterval(heartbeat);
        this.lastError = null;
        return;
      }
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
      if (run.isMutating === false) {
        await cleanupRemote();
        await report({
          events: verificationResult ? [] : mappedEvents,
          observations: verificationResult ? [] : traceObservations,
          artifacts: verificationResult ? [] : baseArtifacts,
          terminal: { status: "COMPLETED" },
        });
        this.completedCount += 1;
        this.lastError = null;
        return;
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
        requirePublicationPermit: true,
        assertActive,
        signal: controller.signal,
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
          : manifestExecutionBackend(claim?.executionManifest) === "remote-sandbox"
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

  private async publicationInstallationToken(claim: any) {
    const privateKey = this.dependencies.loadGithubAppPrivateKey();
    const configuredAppId = this.dependencies.getGithubAppId();
    if (!privateKey || !configuredAppId) throw new Error("GitHub App runtime credentials are not configured.");
    if (configuredAppId !== claim.installation.appId) throw new Error("GitHub App runtime identity does not match the frozen installation.");
    if (!claim.providerRepositoryId) throw new Error("GitHub provider repository identity is not frozen.");
    return await this.dependencies.mintInstallationToken({ appId: configuredAppId, installationId: claim.installation.installationId,
      providerRepositoryId: claim.providerRepositoryId, privateKey });
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
    publicationPermit?: { id: string; leaseId: string; validUntil: number };
    assertActive: () => Promise<void>;
    signal: AbortSignal;
    reconciliationOnly?: boolean;
    requirePublicationPermit?: boolean;
    events?: any[];
    observations?: any[];
    artifacts?: any[];
  }) {
    let publicationPermit = input.publicationPermit;
    const reconciliationOnly = input.claim.publicationCheckpoint?.reconciliationOnly === true;
    const assertWriteAllowed = async () => {
      await input.assertActive();
      input.signal.throwIfAborted();
      if (input.requirePublicationPermit) assertPublicationPermitCurrent(publicationPermit, input.leaseId, input.headSha);
    };
    if (reconciliationOnly && (!input.policyV2 || !publicationPermit)) throw new Error("Read-only publication recovery requires a consumed v2 permit.");
    if (input.requirePublicationPermit && !publicationPermit && !reconciliationOnly) {
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
    if (input.requirePublicationPermit && !reconciliationOnly) assertPublicationPermitCurrent(publicationPermit, input.leaseId, input.headSha);
    const installationToken = await this.publicationInstallationToken(input.claim);
    if (installationToken.expiresAt <= Date.now() + 60_000) throw new Error("GitHub installation token expires too soon for a safe push.");
    let pullRequest: Awaited<ReturnType<typeof createOrReusePullRequest>>;
    if (reconciliationOnly) {
      pullRequest = await (this.dependencies.reconcilePublishedPullRequest ?? reconcilePublishedPullRequest)({ repository: input.claim.repository,
        providerRepositoryId: input.claim.providerRepositoryId, branch: input.claim.branch, base: input.claim.defaultBranch,
        headSha: input.headSha, token: installationToken.token });
    } else {
    if (input.requirePublicationPermit) assertPublicationPermitCurrent(publicationPermit, input.leaseId, input.headSha);
    if (input.policyV2) {
      const intent = await input.report({ events: [{ idempotencyKey: `publication-request:${input.claim.runId}:${publicationPermit?.id}`,
        eventType: "PUBLICATION_REQUESTED", workflowStep: "publication", status: "PENDING", startedAt: Date.now(),
        metadata: { candidateSha: input.headSha, publicationPermitId: publicationPermit?.id, outcome: "UNKNOWN" } }] });
      if (intent?.accepted !== true) throw new Error("Publication intent was not durably acknowledged.");
    }
    await this.dependencies.assertFactoryCandidateUnchanged(input.claim.worktree, input.headSha);
    await assertWriteAllowed();
    await this.dependencies.pushFactoryBranch({
      worktree: input.claim.worktree,
      repository: input.claim.repository,
      branch: input.claim.branch,
      installationToken: installationToken.token,
      assertWriteAllowed,
      signal: input.signal,
    });
    await assertWriteAllowed();
    pullRequest = await this.dependencies.createOrReusePullRequest({
      repository: input.claim.repository,
      branch: input.claim.branch,
      base: input.claim.defaultBranch,
      title: input.structuredResult.summary,
      body: buildPullRequestBody(input.claim, input.structuredResult, input.changedFiles, input.verificationRecord),
      token: installationToken.token,
      headSha: input.headSha,
      draft: input.policyV2 === true,
      assertWriteAllowed,
      signal: input.signal,
    });
    }
    const pullRequestLineage = {
      ...input.manifest.causation,
      repositoryId: String(input.claim.repositoryId),
      repository: input.claim.repository,
      installationId: input.claim.installation.installationId,
      branch: input.claim.branch,
      sourceRevision: input.sourceRevision,
      headSha: input.headSha,
      treeSha: input.treeSha,
      baseRef: input.claim.defaultBranch,
      providerRepositoryId: input.claim.providerRepositoryId,
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
        ...(input.policyV2 && input.manifest.repository.verificationPublicationOrder !== "VERIFY_BEFORE_PUBLICATION" ? {
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
      ...(input.policyV2 && input.manifest.repository.verificationPublicationOrder !== "VERIFY_BEFORE_PUBLICATION" ? {
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
    if (candidate.candidateRevision !== subject.candidateSha || candidate.treeRevision !== subject.treeSha
      || (subject.version === 2 && (candidate.sourceRevision !== subject.baseSha || candidate.rawDiffSha256 !== subject.rawDiffSha256))) {
      throw new Error("Detached verification checkout does not match the immutable Verification Subject.");
    }
    const contract = input.manifest.workOrderSpecification.verificationContract;
    const authority = evaluateVerificationAuthority({ candidate, checks: contract.checks, policy: contract.authorityPolicy });
    if (authority.status === "PASS") {
      await (this.dependencies.prepareFactoryDependencies ?? prepareFactoryDependencies)({ worktree: input.claim.worktree });
    }
    const verification = await (authority.status === "PASS"
      ? this.dependencies.executeIndependentVerification : evaluateVerificationPolicyRejection)({
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
    if (subject.version === 2) {
      const after = await this.dependencies.inspectCandidateChange(input.claim.worktree, subject.baseSha);
      if (after.sourceRevision !== subject.baseSha || after.candidateRevision !== subject.candidateSha
        || after.treeRevision !== subject.treeSha || after.rawDiffSha256 !== subject.rawDiffSha256) {
        throw new Error("Verification changed the immutable candidate's base, tree or raw diff identity.");
      }
    }
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

function validateClaimManifest(claim: any, expectedLeaseId: string) {
  const manifest = claim?.executionManifest as FrozenHarnessExecutionManifest | undefined;
  const executionBackend = manifestExecutionBackend(manifest);
  const capabilityManifest = manifest?.harness?.capabilityManifest;
  if (
    !manifest
    || !["factory-execution-manifest/v1", "factory-execution-manifest/v2", "factory-execution-manifest/v3"].includes(manifest.version)
    || !boundedHarnessIdentity(manifest?.harness?.adapter)
    || !boundedHarnessIdentity(manifest?.harness?.version)
    || manifest.harness.adapter !== claim.executorAdapter
    || manifest.harness.version !== claim.executorVersion
    || !boundedHarnessIdentity(manifest?.harness?.harnessId)
    || !boundedHarnessIdentity(manifest?.harness?.harnessVersion)
    || !/^[a-f0-9]{40}$/i.test(manifest?.harness?.harnessCommit ?? "")
    || !capabilityManifest
    || capabilityManifest.identity?.adapterId !== manifest.harness.adapter
    || capabilityManifest.identity?.adapterVersion !== manifest.harness.version
    || capabilityManifest.identity?.harnessId !== manifest.harness.harnessId
    || capabilityManifest.identity?.harnessVersion !== manifest.harness.harnessVersion
    || capabilityManifest.identity?.harnessCommit !== manifest.harness.harnessCommit
    || !/^sha256:[a-f0-9]{64}$/i.test(manifest?.harness?.capabilityManifestSha256 ?? "")
    || harnessCapabilityManifestDigest(capabilityManifest) !== manifest.harness.capabilityManifestSha256
    || !/^[a-f0-9]{64}$/i.test(manifest?.harness?.effectiveConfigSha256 ?? "")
    || capabilityManifest.effectiveConfigSha256 !== manifest.harness.effectiveConfigSha256
    || !["WORKSPACE_WRITE", "READ_ONLY", "DETACHED_READ_ONLY"].includes(manifest?.harness?.isolation)
    || manifest?.harness?.pullRequestAuthority !== "CONTROL_PLANE_ONLY"
    || executionBackend === undefined
    || !manifestModelRoute(manifest)
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
  if (hasDecomposedExecutionIdentity(manifest) && !validV2ExecutionBindings(manifest, executionBackend)) {
    throw new Error("Claimed Factory V2 execution bindings are invalid.");
  }
  if (manifest.version === "factory-execution-manifest/v3"
    && (!claim?.lease
      || claim.lease.leaseId !== expectedLeaseId
      || !boundedManifestIdentity(claim.lease.ownerId, 200)
      || !Number.isFinite(claim.lease.heartbeatAt)
      || !Number.isFinite(claim.lease.expiresAt)
      || claim.lease.expiresAt <= claim.lease.heartbeatAt
      || !validV3ExecutionProfileBinding(manifest, executionBackend, claim.lease.heartbeatAt)
      || !claimExecutionProfileEvidenceMatches(claim, manifest))) {
    throw new Error("Claimed Factory V3 Execution Profile binding is invalid (profile or admission lease mismatch).");
  }
  if (manifest.version !== "factory-execution-manifest/v3" && claim.executionProfile !== undefined) {
    throw new Error("Claimed profileless Factory manifest contains Execution Profile evidence.");
  }
  const executionRuntimeArtifact = manifestExecutionRuntimeArtifact(manifest);
  if (!executionRuntimeArtifact
    || !runtimeArtifactMatchesBackend(executionRuntimeArtifact, executionBackend, manifest?.sandbox?.profileSnapshot)) {
    throw new Error("Claimed Factory execution manifest does not match its exact backend runtime artifact.");
  }
  if (executionBackend === "remote-sandbox") {
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
  const executionBackend = manifestExecutionBackend(manifest);
  if (!capabilityManifest
    || capabilityManifest.identity.adapterId !== manifest.harness.adapter
    || capabilityManifest.identity.adapterVersion !== manifest.harness.version
    || capabilityManifest.identity.harnessId !== manifest.harness.harnessId
    || capabilityManifest.identity.harnessVersion !== manifest.harness.harnessVersion
    || capabilityManifest.identity.harnessCommit !== manifest.harness.harnessCommit
    || harnessCapabilityManifestDigest(capabilityManifest) !== manifest.harness.capabilityManifestSha256
    || capabilityManifest.effectiveConfigSha256 !== manifest.harness.effectiveConfigSha256) {
    throw new Error("Registered harness adapter does not match the frozen Attempt capability/configuration identity.");
  }
  if (!executionBackend || !capabilityManifest.admission.executionBackends.includes(executionBackend)) {
    throw new Error("Registered harness adapter does not support the frozen execution backend.");
  }
  const expectedRuntimeArtifact = manifestExecutionRuntimeArtifact(manifest);
  if (executionBackend === "persistent-worker"
    && (!expectedRuntimeArtifact
      || registration.runtimeArtifactSha256 !== expectedRuntimeArtifact.digest
      || harnessRuntimeArtifactDigest(registration.runtimeArtifact) !== expectedRuntimeArtifact.digest)) {
    throw new Error("Registered harness adapter does not match the frozen Attempt runtime-artifact identity.");
  }
}

function assertHarnessResultIdentity(
  request: ExecutorRequest,
  manifest: FrozenHarnessExecutionManifest,
  result: HarnessNormalizedResult | undefined,
): HarnessNormalizedResult {
  if (!result) throw new Error("Harness did not return the required normalized harness-result/v1 bundle.");
  const issues = harnessNormalizedResultIssues(result);
  const expectedRuntimeArtifact = manifestExecutionRuntimeArtifact(manifest);
  const runtimeArtifactMismatch = !expectedRuntimeArtifact
    || !normalizedRuntimeArtifactMatches(result, expectedRuntimeArtifact.artifact, expectedRuntimeArtifact.digest);
  const modelRouteMismatch = hasDecomposedExecutionIdentity(manifest)
    && (result.provenance.modelRouteDigest !== request.modelRouteDigest
      || result.provenance.providerRoute !== request.providerRoute
      || canonicalHash(result.provenance.reasoningConfig ?? null) !== canonicalHash(request.reasoningConfig ?? null));
  if (issues.length > 0
    || result.executionId !== request.executionId
    || result.harness.adapterId !== manifest.harness.adapter
    || result.harness.adapterVersion !== manifest.harness.version
    || result.harness.harnessId !== manifest.harness.harnessId
    || result.harness.harnessVersion !== manifest.harness.harnessVersion
    || result.harness.harnessCommit !== manifest.harness.harnessCommit
    || result.provenance.capabilityManifestSha256 !== manifest.harness.capabilityManifestSha256
    || result.provenance.effectiveConfigSha256 !== manifest.harness.effectiveConfigSha256
    || result.provenance.requestSha256 !== harnessExecutionRequestDigest(request)
    || result.provenance.provider !== (request.provider ?? null)
    || result.provenance.model !== (request.model ?? null)
    || modelRouteMismatch
    || runtimeArtifactMismatch) {
    throw new Error(`Harness normalized result does not match the frozen Attempt identity${issues.length ? ` (${issues.join(", ")})` : ""}.`);
  }
  return result;
}

function manifestExecutionBackend(manifest: any): HarnessExecutionBackend | undefined {
  const backend = hasDecomposedExecutionIdentity(manifest)
    ? manifest?.executionBackend
    : manifest?.harness?.executionBackend;
  return backend === "persistent-worker" || backend === "remote-sandbox" ? backend : undefined;
}

function manifestModelRoute(manifest: any): {
  provider: string;
  model: string;
  modelRouteDigest?: string;
  providerRoute?: string;
  reasoningConfig?: ExecutorRequest["reasoningConfig"];
} | undefined {
  const provider = hasDecomposedExecutionIdentity(manifest)
    ? manifest?.modelRoute?.routeSnapshot?.provider
    : manifest?.harness?.provider;
  const model = hasDecomposedExecutionIdentity(manifest)
    ? manifest?.modelRoute?.routeSnapshot?.modelId
    : manifest?.harness?.model;
  if (!boundedManifestIdentity(provider, 100) || !boundedManifestIdentity(model, 200)) return undefined;
  if (!hasDecomposedExecutionIdentity(manifest)) return { provider, model };
  const modelRouteDigest = manifest?.modelRoute?.routeDigest;
  const providerRoute = manifest?.modelRoute?.routeSnapshot?.providerRoute;
  if (!/^sha256:[a-f0-9]{64}$/i.test(modelRouteDigest ?? "")
    || !boundedManifestIdentity(providerRoute, 100)) return undefined;
  const reasoningConfig = manifest?.modelRoute?.routeSnapshot?.reasoningConfig;
  return {
    provider,
    model,
    modelRouteDigest,
    providerRoute,
    ...(reasoningConfig === undefined ? {} : { reasoningConfig: structuredClone(reasoningConfig) }),
  };
}

function validV2ExecutionBindings(
  manifest: FrozenHarnessExecutionManifest,
  executionBackend: HarnessExecutionBackend,
): boolean {
  const harness = manifest.harness;
  const modelRoute = manifest.modelRoute;
  const route = modelRoute?.routeSnapshot as Record<string, any> | undefined;
  const qualification = modelRoute?.qualificationSnapshot as Record<string, any> | undefined;
  const compatibility = qualification?.compatibility as Record<string, any> | undefined;
  if (!modelRoute
    || !boundedManifestIdentity(modelRoute.catalogId, 200)
    || !validV2ModelRoute(route)
    || modelRoute.routeDigest !== `sha256:${canonicalHash({ namespace: "factory-model-route/v2", value: route })}`
    || qualification?.schema !== "factory-model-route-qualification/v2"
    || qualification.routeDigest !== modelRoute.routeDigest
    || modelRoute.qualificationDigest !== `sha256:${canonicalHash({ namespace: "factory-model-route-qualification/v2", value: qualification })}`
    || !compatibility
    || compatibility.adapter !== harness.adapter
    || compatibility.version !== harness.version
    || compatibility.capabilityManifestDigest !== harness.capabilityManifestSha256
    || compatibility.effectiveConfigSha256 !== harness.effectiveConfigSha256
    || compatibility.runtimeArtifactDigest !== harness.runtimeArtifactDigest
    || compatibility.executionBackend !== executionBackend
    || qualification.authority?.executionOnly !== true
    || qualification.authority?.routing !== false
    || qualification.authority?.verification !== false
    || qualification.authority?.acceptance !== false
    || qualification.authority?.publication !== false
    || qualification.authority?.merge !== false
    || harness.provider !== undefined
    || harness.model !== undefined
    || harness.executionBackend !== undefined
    || harnessRuntimeArtifactIssues(harness.runtimeArtifact).length > 0
    || !harness.runtimeArtifact
    || harnessRuntimeArtifactDigest(harness.runtimeArtifact) !== harness.runtimeArtifactDigest) {
    return false;
  }
  return true;
}

function validV3ExecutionProfileBinding(
  manifest: FrozenHarnessExecutionManifest,
  executionBackend: HarnessExecutionBackend,
  profileAdmittedAt: number,
): boolean {
  const binding = manifest.executionProfile;
  const profile = binding?.profileSnapshot as Record<string, any> | undefined;
  const qualification = binding?.qualificationSnapshot as Record<string, any> | undefined;
  const components = qualification?.components as Record<string, any> | undefined;
  const profileSandbox = profile?.sandboxProfile as Record<string, any> | undefined;
  const manifestRoute = manifest.modelRoute;
  const expectedWorkloadClass = manifest?.causation?.factoryPurpose === "VERIFICATION"
    ? "VERIFICATION"
    : manifest?.causation?.factoryPurpose === "INTELLIGENT_AUTOMATION"
      ? "AUTOMATION"
      : manifest?.causation?.factoryPurpose === "SOFTWARE"
        ? "SOFTWARE_CHANGE"
        : undefined;
  const selectedSandboxCapabilities = [
    "git-worktree",
    manifest.harness.isolation === "READ_ONLY" ? "read-only" : "workspace-write",
    ...(executionBackend === "remote-sandbox"
      ? ["remote-sandbox", `sandbox-provider:${String(profileSandbox?.profileSnapshot?.provider ?? "").toLowerCase().replace(/_/g, "-")}`]
      : []),
  ].sort();
  if (!binding
    || !exactObjectKeys(binding, [
      "profileId", "profileKey", "version", "profileDigest", "profileSnapshot",
      "qualificationDigest", "qualificationSnapshot",
    ])
    || !boundedManifestIdentity(binding.profileId, 200)
    || !boundedManifestIdentity(binding.profileKey, 64)
    || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(binding.profileKey)
    || !Number.isSafeInteger(binding.version)
    || binding.version < 1
    || binding.version > 1_000_000
    || !/^sha256:[a-f0-9]{64}$/.test(binding.profileDigest)
    || !/^sha256:[a-f0-9]{64}$/.test(binding.qualificationDigest)
    || !exactObjectKeys(profile, [
      "schema", "profileKey", "version", "harness", "runtimeArtifact", "executionBackend",
      "modelRoute", ...(executionBackend === "remote-sandbox" ? ["sandboxProfile"] : []),
      "isolationModes", "requiredHarnessCapabilities", "requiredSandboxCapabilities", "lifecycle", "authority",
    ])
    || !exactObjectKeys(qualification, [
      "schema", "profile", "components", "scope", "evidence", "approvedBy", "approvedAt", "validUntil", "authority",
    ])
    || !exactObjectKeys(profile?.harness, ["adapter", "version", "capabilityManifest", "capabilityManifestDigest", "effectiveConfigSha256"])
    || !exactObjectKeys(profile?.runtimeArtifact, ["snapshot", "digest"])
    || !exactObjectKeys(profile?.modelRoute, ["catalogId", "routeSnapshot", "routeDigest", "qualificationSnapshot", "qualificationDigest"])
    || !exactObjectKeys(profile?.lifecycle, [
      "contractVersion", "cancellationMode", "idempotentCleanup", "retryCreatesNewAttempt",
      "inFlightRevocationPolicy", "componentSubstitution",
    ])
    || !exactObjectKeys(qualification?.profile, ["id", "key", "version", "digest"])
    || !exactObjectKeys(qualification?.components, [
      "harness", "runtimeArtifactDigest", "executionBackend", "modelRoute",
      ...(executionBackend === "remote-sandbox" ? ["sandboxProfile"] : []),
      "isolationModes", "requiredHarnessCapabilities", "requiredSandboxCapabilities",
    ])
    || !exactObjectKeys(components?.harness, ["adapter", "version", "capabilityManifestDigest", "effectiveConfigSha256"])
    || !exactObjectKeys(components?.modelRoute, ["catalogId", "routeDigest", "qualificationDigest"])
    || !exactObjectKeys(qualification?.scope, ["workloadClasses", "riskClasses"])
    || !exactObjectKeys(qualification?.evidence, ["reference", "digest"])
    || profile?.schema !== "factory-execution-profile/v1"
    || qualification?.schema !== "factory-execution-profile-qualification/v1"
    || binding.profileDigest !== `sha256:${canonicalHash({ namespace: "factory-execution-profile/v1", value: profile })}`
    || binding.qualificationDigest !== `sha256:${canonicalHash({ namespace: "factory-execution-profile-qualification/v1", value: qualification })}`
    || profile.profileKey !== binding.profileKey
    || profile.version !== binding.version
    || qualification.profile?.id !== binding.profileId
    || qualification.profile?.key !== binding.profileKey
    || qualification.profile?.version !== binding.version
    || qualification.profile?.digest !== binding.profileDigest
    || !Number.isFinite(profileAdmittedAt)
    || !Number.isFinite(qualification.approvedAt)
    || !Number.isFinite(qualification.validUntil)
    || qualification.approvedAt > profileAdmittedAt
    || qualification.validUntil <= qualification.approvedAt
    || qualification.validUntil - qualification.approvedAt > 366 * 24 * 60 * 60 * 1_000
    || qualification.validUntil <= profileAdmittedAt
    || !boundedManifestIdentity(qualification.approvedBy, 200)
    || !boundedManifestIdentity(qualification.evidence?.reference, 1_000)
    || !/^sha256:[a-f0-9]{64}$/.test(qualification.evidence?.digest ?? "")
    || !expectedWorkloadClass
    || !canonicalSortedStrings(qualification.scope?.workloadClasses)
    || !qualification.scope.workloadClasses.includes(expectedWorkloadClass)
    || qualification.scope.workloadClasses.some((value: string) => !/^[A-Z][A-Z0-9_]*$/.test(value))
    || !canonicalSortedStrings(qualification.scope?.riskClasses)
    || qualification.scope.riskClasses.some((value: string) => !["GREEN", "YELLOW", "RED"].includes(value))
    || !allDeniedExecutionProfileAuthority(profile.authority)
    || !allDeniedExecutionProfileAuthority(qualification.authority)
    || profile.lifecycle?.contractVersion !== "generic-harness-contract/v1"
    || profile.lifecycle?.cancellationMode !== manifest.harness.capabilityManifest.cancellation.mode
    || profile.lifecycle?.idempotentCleanup !== manifest.harness.capabilityManifest.cancellation.idempotentCleanup
    || profile.lifecycle?.componentSubstitution !== "DENIED"
    || profile.lifecycle?.retryCreatesNewAttempt !== true
    || profile.lifecycle?.inFlightRevocationPolicy !== "LEASED_ATTEMPT_MAY_COMPLETE"
    || profile.harness?.adapter !== manifest.harness.adapter
    || profile.harness?.version !== manifest.harness.version
    || profile.harness?.capabilityManifestDigest !== manifest.harness.capabilityManifestSha256
    || profile.harness?.effectiveConfigSha256 !== manifest.harness.effectiveConfigSha256
    || canonicalHash(profile.harness?.capabilityManifest) !== canonicalHash(manifest.harness.capabilityManifest)
    || profile.runtimeArtifact?.digest !== manifest.harness.runtimeArtifactDigest
    || canonicalHash(profile.runtimeArtifact?.snapshot) !== canonicalHash(manifest.harness.runtimeArtifact)
    || profile.executionBackend !== executionBackend
    || profile.modelRoute?.catalogId !== manifestRoute?.catalogId
    || profile.modelRoute?.routeDigest !== manifestRoute?.routeDigest
    || profile.modelRoute?.qualificationDigest !== manifestRoute?.qualificationDigest
    || canonicalHash(profile.modelRoute?.routeSnapshot) !== canonicalHash(manifestRoute?.routeSnapshot)
    || canonicalHash(profile.modelRoute?.qualificationSnapshot) !== canonicalHash(manifestRoute?.qualificationSnapshot)
    || !canonicalSortedStrings(profile.isolationModes)
    || !profile.isolationModes.includes(manifest.harness.isolation)
    || !canonicalHarnessRequirements(profile.requiredHarnessCapabilities)
    || !containsHarnessRequirements(profile.requiredHarnessCapabilities, manifest.harness.requiredHarnessCapabilities)
    || !canonicalSortedStrings(profile.requiredSandboxCapabilities)
    || !selectedSandboxCapabilities.every((capability) => profile.requiredSandboxCapabilities.includes(capability))
    || !sameStringSet(selectedSandboxCapabilities, manifest.harness.requiredCapabilities)
    || components?.harness?.adapter !== profile.harness.adapter
    || components?.harness?.version !== profile.harness.version
    || components?.harness?.capabilityManifestDigest !== profile.harness.capabilityManifestDigest
    || components?.harness?.effectiveConfigSha256 !== profile.harness.effectiveConfigSha256
    || components?.runtimeArtifactDigest !== profile.runtimeArtifact.digest
    || components?.executionBackend !== profile.executionBackend
    || components?.modelRoute?.catalogId !== profile.modelRoute.catalogId
    || components?.modelRoute?.routeDigest !== profile.modelRoute.routeDigest
    || components?.modelRoute?.qualificationDigest !== profile.modelRoute.qualificationDigest
    || !sameStringSet(components?.isolationModes ?? [], profile.isolationModes)
    || !sameHarnessRequirements(components?.requiredHarnessCapabilities, profile.requiredHarnessCapabilities)
    || !sameStringSet(components?.requiredSandboxCapabilities ?? [], profile.requiredSandboxCapabilities)) {
    return false;
  }
  if (executionBackend === "remote-sandbox") {
    return Boolean(profileSandbox
      && manifest.sandbox
      && exactObjectKeys(profileSandbox, ["profileId", "profileSnapshot", "profileDigest"])
      && exactObjectKeys(components?.sandboxProfile, ["profileId", "profileDigest"])
      && profileSandbox.profileId === manifest.sandbox.profileId
      && profileSandbox.profileDigest === manifest.sandbox.profileDigest
      && canonicalHash(profileSandbox.profileSnapshot) === canonicalHash(manifest.sandbox.profileSnapshot)
      && components?.sandboxProfile?.profileId === profileSandbox.profileId
      && components?.sandboxProfile?.profileDigest === profileSandbox.profileDigest);
  }
  return profileSandbox === undefined
    && components?.sandboxProfile === undefined
    && manifest.sandbox === undefined;
}

function claimExecutionProfileEvidenceMatches(
  claim: Record<string, any>,
  manifest: FrozenHarnessExecutionManifest,
) {
  const expected = executionProfileEvidenceFromManifest(manifest);
  return expected !== undefined
    && claim.executionProfile !== undefined
    && canonicalHash(claim.executionProfile) === canonicalHash(expected);
}

function executionProfileEvidenceFromManifest(manifest: FrozenHarnessExecutionManifest) {
  const binding = manifest.executionProfile;
  const profile = binding?.profileSnapshot as Record<string, any> | undefined;
  const qualification = binding?.qualificationSnapshot as Record<string, any> | undefined;
  if (!binding || !profile || !qualification) return undefined;
  return {
    profileId: binding.profileId,
    profileKey: binding.profileKey,
    version: binding.version,
    profileDigest: binding.profileDigest,
    qualificationDigest: binding.qualificationDigest,
    qualificationEvidence: qualification.evidence,
    qualificationValidUntil: qualification.validUntil,
    harness: {
      adapter: profile.harness?.adapter,
      version: profile.harness?.version,
      capabilityManifestDigest: profile.harness?.capabilityManifestDigest,
      effectiveConfigSha256: profile.harness?.effectiveConfigSha256,
    },
    runtimeArtifactDigest: profile.runtimeArtifact?.digest,
    executionBackend: profile.executionBackend,
    modelRoute: {
      catalogId: profile.modelRoute?.catalogId,
      routeDigest: profile.modelRoute?.routeDigest,
      qualificationDigest: profile.modelRoute?.qualificationDigest,
    },
    ...(profile.sandboxProfile ? {
      sandboxProfile: {
        profileId: profile.sandboxProfile.profileId,
        profileDigest: profile.sandboxProfile.profileDigest,
      },
    } : {}),
    selectedIsolation: manifest.harness.isolation,
  };
}

function hasDecomposedExecutionIdentity(manifest: any): boolean {
  return manifest?.version === "factory-execution-manifest/v2"
    || manifest?.version === "factory-execution-manifest/v3";
}

function allDeniedExecutionProfileAuthority(authority: any) {
  const keys = ["routing", "verification", "publication", "acceptance", "merge", "policyMutation", "workerLeases"];
  return authority && typeof authority === "object" && !Array.isArray(authority)
    && Object.keys(authority).length === keys.length
    && keys.every((key) => authority[key] === false);
}

function sameHarnessRequirements(left: unknown, right: unknown) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  const normalize = (items: any[]) => items
    .map((item) => `${item?.capability}:${item?.minimumSupport}`)
    .sort();
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function containsHarnessRequirements(available: unknown, required: unknown) {
  if (!Array.isArray(available) || !Array.isArray(required)) return false;
  return required.every((requirement: any) => available.some((candidate: any) =>
    candidate?.capability === requirement?.capability
    && candidate?.minimumSupport === requirement?.minimumSupport));
}

function canonicalHarnessRequirements(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return false;
  const normalized = value.map((item: any) => `${item?.capability}:${item?.minimumSupport}`);
  return value.every((item: any) => boundedManifestIdentity(item?.capability, 100)
      && ["PARTIAL", "SUPPORTED"].includes(item.minimumSupport))
    && new Set(normalized).size === normalized.length
    && JSON.stringify(normalized) === JSON.stringify([...normalized].sort());
}

function canonicalSortedStrings(value: unknown) {
  return Array.isArray(value)
    && value.length > 0
    && value.every((item) => boundedManifestIdentity(item, 100))
    && new Set(value).size === value.length
    && JSON.stringify(value) === JSON.stringify([...value].sort());
}

function exactObjectKeys(value: unknown, expected: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function validV2ModelRoute(route: Record<string, any> | undefined): boolean {
  if (!route || route.schema !== "factory-model-route/v2") return false;
  const keys = Object.keys(route);
  if (keys.some((key) => !["schema", "provider", "providerRoute", "modelId", "reasoningConfig"].includes(key))
    || Object.hasOwn(route, "capabilityIdentity")
    || Object.hasOwn(route, "runtimeIdentity")
    || !boundedManifestIdentity(route.provider, 100)
    || route.provider !== route.provider.toLowerCase()
    || !boundedManifestIdentity(route.providerRoute, 100)
    || route.providerRoute !== route.providerRoute.toLowerCase()
    || !boundedManifestIdentity(route.modelId, 200)) return false;
  if (route.reasoningConfig === undefined) return true;
  const reasoning = route.reasoningConfig;
  if (!reasoning || typeof reasoning !== "object" || Array.isArray(reasoning)) return false;
  const reasoningKeys = Object.keys(reasoning);
  if (reasoningKeys.length === 0 || reasoningKeys.some((key) => !["effort", "temperature", "maxTokens"].includes(key))) return false;
  return (reasoning.effort === undefined
      || (boundedManifestIdentity(reasoning.effort, 64) && reasoning.effort === reasoning.effort.toLowerCase()))
    && (reasoning.temperature === undefined
      || (typeof reasoning.temperature === "number" && Number.isFinite(reasoning.temperature)
        && reasoning.temperature >= 0 && reasoning.temperature <= 2))
    && (reasoning.maxTokens === undefined
      || (Number.isSafeInteger(reasoning.maxTokens) && reasoning.maxTokens >= 1 && reasoning.maxTokens <= 10_000_000));
}

function normalizedRuntimeArtifactMatches(
  result: HarnessNormalizedResult,
  expectedArtifact: HarnessRuntimeArtifactIdentity | undefined,
  expectedDigest: string | undefined,
) {
  const observedArtifact = result.provenance.runtimeArtifact;
  if (!expectedArtifact || !expectedDigest || !observedArtifact
    || harnessRuntimeArtifactIssues(observedArtifact).length > 0) return false;
  return result.provenance.runtimeArtifactDigest === expectedDigest
    && harnessRuntimeArtifactDigest(observedArtifact) === expectedDigest
    && result.provenance.executableSha256 === expectedArtifact.executableSha256
    && (result.provenance.imageDigest ?? null) === expectedArtifact.imageDigest;
}

function manifestExecutionRuntimeArtifact(
  manifest: FrozenHarnessExecutionManifest,
): { artifact: HarnessRuntimeArtifactIdentity; digest: string } | undefined {
  if (hasDecomposedExecutionIdentity(manifest)) {
    const artifact = manifest.harness.runtimeArtifact;
    const digest = manifest.harness.runtimeArtifactDigest;
    if (!artifact || !digest || harnessRuntimeArtifactIssues(artifact).length > 0
      || harnessRuntimeArtifactDigest(artifact) !== digest) return undefined;
    return { artifact, digest };
  }
  const runtime = (manifest.harness.modelRouteSnapshot as any)?.runtimeIdentity;
  const executionBackend = manifestExecutionBackend(manifest);
  if (runtime?.kind !== "CODEX_CLI" || !boundedManifestIdentity(runtime.cliVersion, 200)) return undefined;
  let artifact: HarnessRuntimeArtifactIdentity | undefined;
  if (executionBackend === "persistent-worker" && /^[a-f0-9]{64}$/i.test(runtime.executableSha256 ?? "")) {
    artifact = {
      schemaVersion: "harness-runtime-artifact/v1",
      kind: "EXECUTABLE",
      name: manifest.harness.adapter,
      version: runtime.cliVersion,
      executableSha256: runtime.executableSha256,
      imageDigest: null,
    };
  } else if (executionBackend === "remote-sandbox" && /^sha256:[a-f0-9]{64}$/i.test(runtime.imageDigest ?? "")) {
    artifact = {
      schemaVersion: "harness-runtime-artifact/v1",
      kind: "CONTAINER_IMAGE",
      name: `${manifest.harness.harnessId}-image`,
      version: runtime.cliVersion,
      executableSha256: null,
      imageDigest: runtime.imageDigest.toLowerCase(),
    };
  }
  return artifact ? { artifact, digest: harnessRuntimeArtifactDigest(artifact) } : undefined;
}

function runtimeArtifactMatchesBackend(
  resolved: { artifact: HarnessRuntimeArtifactIdentity; digest: string },
  executionBackend: HarnessExecutionBackend,
  profileInput: unknown,
) {
  if (resolved.digest !== harnessRuntimeArtifactDigest(resolved.artifact)) return false;
  if (executionBackend === "persistent-worker") {
    return resolved.artifact.kind === "EXECUTABLE"
      && Boolean(resolved.artifact.executableSha256)
      && resolved.artifact.imageDigest === null;
  }
  const profile = profileInput as SandboxProfileSnapshot | undefined;
  const profileImageDigest = exactSandboxProfileImageDigest(profile);
  return resolved.artifact.kind === "CONTAINER_IMAGE"
    && resolved.artifact.executableSha256 === null
    && Boolean(profileImageDigest)
    && resolved.artifact.imageDigest?.toLowerCase() === profileImageDigest;
}

function exactSandboxProfileImageDigest(profile: SandboxProfileSnapshot | undefined) {
  const securityDigest = profile?.security?.image?.digest;
  const referenceDigest = profile?.machine?.image.match(/@(sha256:[a-f0-9]{64})$/i)?.[1];
  if (securityDigest && /^sha256:[a-f0-9]{64}$/i.test(securityDigest)) {
    if (!referenceDigest || referenceDigest.toLowerCase() !== securityDigest.toLowerCase()) return undefined;
    return securityDigest.toLowerCase();
  }
  return referenceDigest?.toLowerCase();
}

function boundedManifestIdentity(value: unknown, maximum: number): value is string {
  return typeof value === "string"
    && value === value.trim()
    && value.length > 0
    && value.length <= maximum
    && !/[\0\r\n]/.test(value);
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
  harness: Pick<HarnessExecutorCapabilities, "adapter" | "version" | "displayName">;
  provider?: string;
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
    provider: input.provider,
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
    provider: input.provider,
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
    || (checkpoint.reconciliationOnly !== true && checkpoint.authorizationValidUntil <= Date.now() + 60_000)
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
  request: ExecutorRequest,
) {
  const repositoryRoot = "/var/lib/mission-control/attempt/repository";
  const resultPath = "/var/lib/mission-control/attempt/executor-result.json";
  if (!adapter.createRemoteInvocation) {
    throw new Error(`Harness adapter ${capabilities.adapter}/${capabilities.version} does not support remote-sandbox execution.`);
  }
  const issues = adapter.validateRemoteConfiguration
    ? adapter.validateRemoteConfiguration(request)
    : adapter.validateConfiguration(request);
  if (issues.length > 0) {
    throw new Error(`Harness adapter configuration is invalid: ${issues.map((issue) => `${issue.field}: ${issue.message}`).join(" ")}`);
  }
  const invocation = adapter.createRemoteInvocation(request, { repositoryRoot, resultPath });
  if (!invocation.command.trim()
    || invocation.args.length === 0
    || invocation.resultPath !== resultPath
    || invocation.model !== request.model
    || invocation.provider !== request.provider
    || invocation.modelRouteDigest !== request.modelRouteDigest
    || invocation.providerRoute !== request.providerRoute
    || canonicalHash(invocation.reasoningConfig ?? null) !== canonicalHash(request.reasoningConfig ?? null)
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
