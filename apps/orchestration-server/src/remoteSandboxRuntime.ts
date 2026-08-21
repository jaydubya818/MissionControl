import type {
  SandboxAllocation,
  SandboxAllocationRequest,
  SandboxProvider,
  SandboxProfileSnapshot,
  SandboxStartRequest,
  SandboxTerminationReceipt,
} from "./sandboxProvider.js";
import { sandboxProfileDigest, stableSandboxResourceName } from "./sandboxProvider.js";
import type {
  SandboxCredentialBroker,
  SandboxCredentialGrant,
  SandboxCredentialRevocationReceipt,
} from "./sandboxCredentials.js";
import { parseAndValidateSandboxResultBundle, type SandboxResultBundle } from "./sandboxResultBundle.js";
import {
  classifyRemoteError,
  remoteFailure,
  type RemoteFailure,
  type RemoteFailureStage,
} from "./remoteExecutionPolicy.js";

export type SandboxLifecycleEventType =
  | "SANDBOX_REQUESTED"
  | "SANDBOX_ALLOCATED"
  | "SANDBOX_STARTED"
  | "SANDBOX_RESULT_RECEIVED"
  | "SANDBOX_CANCELLATION_REQUESTED"
  | "SANDBOX_CREDENTIAL_REVOKED"
  | "SANDBOX_TERMINATION_REQUESTED"
  | "SANDBOX_TERMINATED"
  | "SANDBOX_FAILED";

export interface SandboxLifecycleEvent {
  type: SandboxLifecycleEventType;
  occurredAt: number;
  resourceName: string;
  attemptId: string;
  metadata?: Record<string, unknown>;
}

export interface RemoteSandboxJournal {
  recordAllocationRequested(request: SandboxAllocationRequest): Promise<void>;
  recordAllocation(allocation: SandboxAllocation): Promise<void>;
  recordResult(result: SandboxResultBundle): Promise<void>;
  recordCredentialIssued(grant: Omit<SandboxCredentialGrant, "secret">): Promise<void>;
  recordCredentialRevoked(receipt: SandboxCredentialRevocationReceipt): Promise<void>;
  recordTermination(receipt: SandboxTerminationReceipt): Promise<void>;
  recordEvent(event: SandboxLifecycleEvent): Promise<void>;
}

export interface RemoteSandboxResourceObserver {
  started(input: { allocation: SandboxAllocation; processId: string }): Promise<void>;
  terminated(receipt: SandboxTerminationReceipt): Promise<void>;
}

export interface RemoteSandboxExecutionRequest {
  projectId: string;
  workOrderId: string;
  workOrderRevisionNumber: number;
  workflowRunId: string;
  attemptId: string;
  attemptLeaseId: string;
  executionManifest: Record<string, unknown>;
  manifestDigest: string;
  sourceSha: string;
  profile: SandboxProfileSnapshot;
  repositoryBundle: Buffer;
  supervisorSource: string;
  executor: SandboxStartRequest["executor"];
  signal?: AbortSignal;
}

export interface RemoteSandboxExecutionResult {
  bundle: SandboxResultBundle;
  allocation: SandboxAllocation;
  diagnostics?: Record<string, unknown> | null;
  credentialRevocation?: SandboxCredentialRevocationReceipt;
  termination: SandboxTerminationReceipt;
  lifecycleEvents: SandboxLifecycleEvent[];
}

export interface RemoteSandboxCandidateSession {
  bundle: SandboxResultBundle;
  allocation: SandboxAllocation;
  diagnostics?: Record<string, unknown> | null;
  lifecycleEvents: SandboxLifecycleEvent[];
  cleanup(): Promise<{
    credentialRevocation?: SandboxCredentialRevocationReceipt;
    termination: SandboxTerminationReceipt;
  }>;
}

export class RemoteSandboxRuntime {
  constructor(
    private readonly provider: SandboxProvider,
    private readonly credentialBroker: SandboxCredentialBroker,
    private readonly journal: RemoteSandboxJournal,
    private readonly now: () => number = Date.now,
    private readonly sleep: (durationMs: number) => Promise<void> = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs)),
    private readonly resourceObserver?: RemoteSandboxResourceObserver,
  ) {}

  async execute(request: RemoteSandboxExecutionRequest): Promise<RemoteSandboxExecutionResult>;
  async execute(request: RemoteSandboxExecutionRequest, options: { deferCleanup: true }): Promise<RemoteSandboxCandidateSession>;
  async execute(
    request: RemoteSandboxExecutionRequest,
    options?: { deferCleanup?: boolean },
  ): Promise<RemoteSandboxExecutionResult | RemoteSandboxCandidateSession> {
    const profileValidation = await this.provider.validateProfile(request.profile);
    if (!profileValidation.dispatchable) {
      throw new RemoteSandboxExecutionError(remoteFailure(
        "NON_RETRYABLE_RESULT",
        "PROFILE_NOT_DISPATCHABLE",
        "PROFILE",
        `Remote Sandbox Profile is not dispatchable: ${profileValidation.errors.join(" ")}`,
      ));
    }
    const profileDigest = sandboxProfileDigest(request.profile);
    const executionWorkflowRunId = manifestWorkflowRunId(request.executionManifest);
    const resourceName = stableSandboxResourceName({
      projectId: request.projectId,
      workflowRunId: executionWorkflowRunId,
      attemptId: request.attemptId,
    });
    const lifecycleEvents: SandboxLifecycleEvent[] = [];
    const emit = async (type: SandboxLifecycleEventType, metadata?: Record<string, unknown>) => {
      const event: SandboxLifecycleEvent = { type, occurredAt: this.now(), resourceName, attemptId: request.attemptId, metadata };
      lifecycleEvents.push(event);
      await this.journal.recordEvent(event);
    };
    const allocationRequest: SandboxAllocationRequest = {
      resourceName,
      projectId: request.projectId,
      workOrderId: request.workOrderId,
      workflowRunId: request.workflowRunId,
      attemptId: request.attemptId,
      attemptLeaseId: request.attemptLeaseId,
      manifestDigest: request.manifestDigest,
      sourceSha: request.sourceSha,
      profile: request.profile,
      requestedAt: this.now(),
    };

    let allocation: SandboxAllocation | undefined;
    let grant: SandboxCredentialGrant | undefined;
    let credentialRevocation: SandboxCredentialRevocationReceipt | undefined;
    let termination: SandboxTerminationReceipt | undefined;
    let primaryError: unknown;
    let bundle: SandboxResultBundle | undefined;
    let diagnostics: Record<string, unknown> | null | undefined;
    let failureStage: RemoteFailureStage = "ALLOCATION";
    let resourceObservedRunning = false;
    let cleanupPromise: Promise<{ credentialRevocation?: SandboxCredentialRevocationReceipt; termination: SandboxTerminationReceipt }> | undefined;
    const cleanup = async () => {
      if (cleanupPromise) return await cleanupPromise;
      cleanupPromise = (async () => {
        let cleanupError: unknown;
        // Cleanup runs precisely when the lease is most likely to be gone, and
        // every journal/event write is lease-fenced and throws once it is. A
        // failed bookkeeping write must never skip the external teardown that
        // follows it, or the provider resource keeps running and billing with
        // no ownership record. Record best-effort; terminate authoritatively.
        const record = async (label: string, write: () => Promise<unknown>) => {
          try {
            await write();
          } catch (error) {
            cleanupError = combineErrors(cleanupError, error, `${label} could not be journaled.`);
          }
        };
        if (grant && !credentialRevocation) {
          try {
            credentialRevocation = await this.credentialBroker.revoke(grant);
          } catch (error) {
            cleanupError = combineErrors(cleanupError, error, "Attempt credential revocation failed.");
          }
          if (credentialRevocation) {
            const revocation = credentialRevocation;
            await record("Credential revocation", () => this.journal.recordCredentialRevoked(revocation));
            await record("Credential revocation", () =>
              emit("SANDBOX_CREDENTIAL_REVOKED", { grantKey: grant!.grantKey, externalCredentialId: grant!.externalCredentialId }));
          }
        }
        if (allocation && !termination) {
          await record("Sandbox termination request", () =>
            emit("SANDBOX_TERMINATION_REQUESTED", { providerResourceId: allocation!.providerResourceId }));
          try {
            termination = await this.provider.terminate(allocation);
            if (!termination.resourceAbsent) throw new Error("Provider teardown did not prove resource absence.");
            if (resourceObservedRunning) await this.resourceObserver?.terminated(termination);
          } catch (error) {
            cleanupError = combineErrors(cleanupError, error, "Sandbox teardown failed.");
          }
          // Only a receipt that PROVED resource absence may be journaled. The
          // assignment above happens before the `resourceAbsent` assertion, so
          // gating on `termination` alone would write a SANDBOX_TERMINATED
          // event asserting confirmed absence for a resource still running.
          if (termination?.resourceAbsent) {
            const receipt = termination;
            await record("Sandbox termination", () => this.journal.recordTermination(receipt));
            await record("Sandbox termination", () =>
              emit("SANDBOX_TERMINATED", { confirmedAbsentAt: receipt.confirmedAbsentAt }));
          }
        }
        if (cleanupError) throw cleanupError;
        if (!termination) throw new Error("Sandbox cleanup ended without a resource-absence receipt.");
        return { credentialRevocation, termination };
      })();
      return await cleanupPromise;
    };
    try {
      // The durable journal is authoritative and must exist before the first
      // external provider mutation.
      await this.journal.recordAllocationRequested(allocationRequest);
      await emit("SANDBOX_REQUESTED", { provider: this.provider.kind, profileDigest, readiness: profileValidation.readiness });
      failureStage = "ALLOCATION";
      allocation = await this.provider.allocate(allocationRequest);
      await this.journal.recordAllocation(allocation);
      await emit("SANDBOX_ALLOCATED", { providerResourceId: allocation.providerResourceId });
      failureStage = "READINESS";
      allocation = await this.waitUntilReady(allocation, request, emit);

      failureStage = "CREDENTIAL";
      grant = await this.credentialBroker.mint({
        projectId: request.projectId,
        workflowRunId: request.workflowRunId,
        attemptId: request.attemptId,
        attemptLeaseId: request.attemptLeaseId,
        model: request.executor.model,
        maxCostUsd: request.profile.spend.maxUsd,
        expiresAt: this.now() + request.profile.runtime.maxRuntimeMs + 30_000,
      });
      const { secret: _secret, ...persistableGrant } = grant;
      await this.journal.recordCredentialIssued(persistableGrant);
      failureStage = "START";
      const start = await this.provider.start({
        allocation,
        executionManifest: request.executionManifest,
        workOrderId: request.workOrderId,
        workOrderRevisionNumber: request.workOrderRevisionNumber,
        workflowRunId: executionWorkflowRunId,
        attemptId: request.attemptId,
        manifestDigest: request.manifestDigest,
        sourceSha: request.sourceSha,
        profileDigest,
        security: request.profile.security,
        environmentDescriptor: { provider: request.profile.provider, image: request.profile.machine.image },
        repositoryArchive: request.repositoryBundle,
        supervisorSource: request.supervisorSource,
        executor: request.executor,
        environment: {
          OPENAI_API_KEY: grant.secret,
          OPENAI_BASE_URL: "https://openrouter.ai/api/v1",
        },
      });
      allocation = { ...allocation, state: "RUNNING", startedAt: start.startedAt };
      await this.resourceObserver?.started({ allocation, processId: start.processId });
      resourceObservedRunning = Boolean(this.resourceObserver);
      await this.journal.recordAllocation(allocation);
      await emit("SANDBOX_STARTED", {
        processId: start.processId,
        ...(start.securityProof ? { securityProof: start.securityProof } : {}),
      });
      failureStage = "RESULT_READ";
      bundle = await this.waitForResult(allocation, request, executionWorkflowRunId, profileDigest, emit);
      allocation = { ...allocation, state: "RESULT_READY", resultDigest: bundle.digest };
      await this.journal.recordAllocation(allocation);
      await this.journal.recordResult(bundle);
      diagnostics = this.provider.fetchDiagnostics
        ? await this.provider.fetchDiagnostics(allocation).then(sanitizeDiagnostics).catch(() => null)
        : null;
      await emit("SANDBOX_RESULT_RECEIVED", {
        resultDigest: bundle.digest,
        status: bundle.status,
        providerCostUsd: bundle.usage.providerCostUsd,
        inferenceCostUsd: bundle.usage.inferenceCostUsd,
      });
    } catch (error) {
      const typedError = error instanceof RemoteSandboxExecutionError
        ? error
        : new RemoteSandboxExecutionError(classifyRemoteError(error, failureStage), error);
      primaryError = typedError;
      if (allocation && request.signal?.aborted) {
        await emit("SANDBOX_CANCELLATION_REQUESTED", { reason: "Attempt cancellation or lease loss" }).catch(() => undefined);
        await this.provider.cancel(allocation, "Attempt cancellation or lease loss").catch(() => undefined);
      }
      const diagnostics = allocation && this.provider.fetchDiagnostics
        ? await this.provider.fetchDiagnostics(allocation).then(sanitizeDiagnostics).catch(() => null)
        : null;
      await emit("SANDBOX_FAILED", {
        reason: typedError.failure.summary,
        failureClass: typedError.failure.class,
        failureCode: typedError.failure.code,
        failureStage: typedError.failure.stage,
        retryable: typedError.failure.retryable,
        diagnostics,
      }).catch(() => undefined);
    } finally {
      if (!options?.deferCleanup || primaryError || !bundle) {
        try {
          await cleanup();
        } catch (error) {
          let cleanupFailure: unknown = error;
          try {
            await emit("SANDBOX_FAILED", {
              phase: "CLEANUP",
              reason: safeMessage(error),
              credentialRevoked: !grant || credentialRevocation?.revoked === true,
              resourceAbsenceProven: termination?.resourceAbsent === true,
            });
          } catch (journalError) {
            cleanupFailure = combineErrors(
              cleanupFailure,
              journalError,
              "Sandbox cleanup failure could not be journaled.",
            );
          }
          primaryError = combineErrors(
            primaryError,
            cleanupFailure,
            "Remote sandbox cleanup failed.",
          );
        }
      }
    }
    if (primaryError) throw primaryError;
    if (!bundle || !allocation) throw new Error("Remote sandbox lifecycle ended without a validated result.");
    if (options?.deferCleanup) return { bundle, allocation, diagnostics, lifecycleEvents, cleanup };
    if (!termination) throw new Error("Remote sandbox lifecycle ended without a teardown receipt.");
    if (grant && !credentialRevocation) throw new Error("Remote sandbox lifecycle ended without credential revocation evidence.");
    return { bundle, allocation, diagnostics, credentialRevocation, termination, lifecycleEvents };
  }

  private async waitUntilReady(
    allocation: SandboxAllocation,
    request: RemoteSandboxExecutionRequest,
    emit: (type: SandboxLifecycleEventType, metadata?: Record<string, unknown>) => Promise<void>,
  ) {
    const deadline = this.now() + Math.min(request.profile.runtime.maxRuntimeMs, 5 * 60_000);
    let current = allocation;
    while (current.state !== "READY") {
      assertActive(request.signal);
      if (["FAILED", "TERMINATED", "ORPHANED"].includes(current.state)) throw new Error(`Sandbox became ${current.state} before it was ready.`);
      if (this.now() >= deadline) throw new Error("Sandbox allocation did not become ready before the allocation deadline.");
      await this.sleep(request.profile.runtime.resultPollIntervalMs);
      current = await this.provider.inspect(current);
      await this.journal.recordAllocation(current);
    }
    return current;
  }

  private async waitForResult(
    allocation: SandboxAllocation,
    request: RemoteSandboxExecutionRequest,
    executionWorkflowRunId: string,
    profileDigest: string,
    emit: (type: SandboxLifecycleEventType, metadata?: Record<string, unknown>) => Promise<void>,
  ) {
    const deadline = this.now() + request.profile.runtime.maxRuntimeMs;
    let current = allocation;
    const validatePayload = (payload: Buffer) => {
      try {
        return parseAndValidateSandboxResultBundle(payload, {
          attemptId: request.attemptId,
          workOrderId: request.workOrderId,
          workOrderRevisionNumber: request.workOrderRevisionNumber,
          workflowRunId: executionWorkflowRunId,
          manifestDigest: request.manifestDigest,
          profileDigest,
          sourceSha: request.sourceSha,
          supervisorVersion: request.profile.supervisor.version,
          harness: harnessIdentity(request.executionManifest),
          acceptanceCriterionIds: manifestAcceptanceCriterionIds(request.executionManifest),
          environment: { provider: request.profile.provider, image: request.profile.machine.image },
          maxRuntimeMs: request.profile.runtime.maxRuntimeMs,
        });
      } catch (error) {
        throw new RemoteSandboxExecutionError(remoteFailure(
          "NON_RETRYABLE_RESULT",
          "RESULT_BUNDLE_INVALID",
          "RESULT_VALIDATION",
          safeMessage(error),
        ), error);
      }
    };
    while (this.now() < deadline) {
      assertActive(request.signal);
      const payload = await this.provider.fetchResult(current);
      if (payload) return validatePayload(payload);
      const diagnostics = this.provider.fetchDiagnostics
        ? await this.provider.fetchDiagnostics(current)
        : null;
      if (diagnostics?.supervisorProcessRunning === false) {
        // The supervisor atomically renames the bundle immediately before it
        // exits. The first result read can race that rename while the following
        // process-state read observes the exit. Re-read the final path once so
        // a completed supervisor cannot be misclassified as a crash.
        const terminalPayload = await this.provider.fetchResult(current);
        if (terminalPayload) return validatePayload(terminalPayload);
        throw new RemoteSandboxExecutionError(remoteFailure(
          "UNKNOWN",
          "SUPERVISOR_EXITED_BEFORE_RESULT",
          "RESULT_READ",
          "Sandbox supervisor exited before atomically publishing a result bundle.",
        ));
      }
      await this.sleep(request.profile.runtime.resultPollIntervalMs);
      current = await this.provider.inspect(current);
      await this.journal.recordAllocation(current);
      if (["FAILED", "TERMINATED", "ORPHANED"].includes(current.state)) {
        throw new RemoteSandboxExecutionError(remoteFailure(
          "RETRYABLE_INFRA",
          "PROVIDER_TERMINAL_WITHOUT_RESULT",
          "RESULT_READ",
          `Sandbox became ${current.state} without a result bundle.`,
        ));
      }
    }
    await this.provider.cancel(current, "Sandbox runtime deadline exceeded.").catch(() => undefined);
    throw new RemoteSandboxExecutionError(remoteFailure(
      "RETRYABLE_EXECUTION",
      "EXECUTOR_TIMEOUT",
      "EXECUTOR",
      "Sandbox execution exceeded the frozen Attempt timeout.",
    ));
  }
}

export class RemoteSandboxExecutionError extends Error {
  constructor(readonly failure: RemoteFailure, options?: unknown) {
    super(failure.summary, options === undefined ? undefined : { cause: options });
    this.name = "RemoteSandboxExecutionError";
  }
}

export class InMemoryRemoteSandboxJournal implements RemoteSandboxJournal {
  readonly allocationRequests: SandboxAllocationRequest[] = [];
  readonly allocations: SandboxAllocation[] = [];
  readonly issuedCredentials: Array<Omit<SandboxCredentialGrant, "secret">> = [];
  readonly results: SandboxResultBundle[] = [];
  readonly revokedCredentials: SandboxCredentialRevocationReceipt[] = [];
  readonly terminations: SandboxTerminationReceipt[] = [];
  readonly events: SandboxLifecycleEvent[] = [];
  async recordAllocationRequested(request: SandboxAllocationRequest) { this.allocationRequests.push(structuredClone(request)); }
  async recordAllocation(allocation: SandboxAllocation) { this.allocations.push(structuredClone(allocation)); }
  async recordResult(result: SandboxResultBundle) { this.results.push(structuredClone(result)); }
  async recordCredentialIssued(grant: Omit<SandboxCredentialGrant, "secret">) { this.issuedCredentials.push(structuredClone(grant)); }
  async recordCredentialRevoked(receipt: SandboxCredentialRevocationReceipt) { this.revokedCredentials.push(structuredClone(receipt)); }
  async recordTermination(receipt: SandboxTerminationReceipt) { this.terminations.push(structuredClone(receipt)); }
  async recordEvent(event: SandboxLifecycleEvent) { this.events.push(structuredClone(event)); }
}

function assertActive(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new RemoteSandboxExecutionError(remoteFailure(
      "UNKNOWN",
      "ATTEMPT_CANCELED",
      "EXECUTOR",
      signal.reason instanceof Error ? signal.reason.message : "Remote sandbox Attempt was canceled.",
    ), signal.reason);
  }
}

function combineErrors(primary: unknown, cleanup: unknown, message: string) {
  return primary ? new AggregateError([primary, cleanup], message) : cleanup;
}

function safeMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1_000);
}

function harnessIdentity(manifest: Record<string, unknown>): SandboxResultBundle["harness"] {
  const harness = (manifest as any)?.harness;
  return {
    adapter: String(harness?.adapter ?? ""),
    version: String(harness?.version ?? ""),
    harnessId: String(harness?.harnessId ?? ""),
    harnessVersion: String(harness?.harnessVersion ?? ""),
    provider: String(harness?.provider ?? ""),
    model: String(harness?.model ?? ""),
  };
}

function manifestWorkflowRunId(manifest: Record<string, unknown>) {
  const workflowRunId = (manifest as any)?.causation?.workflowRunId;
  if (typeof workflowRunId !== "string" || !workflowRunId.trim()) {
    throw new RemoteSandboxExecutionError(remoteFailure(
      "NON_RETRYABLE_RESULT",
      "MANIFEST_ATTEMPT_IDENTITY_INVALID",
      "PROFILE",
      "Remote execution manifest is missing its public workflow run identity.",
    ));
  }
  return workflowRunId.trim();
}

function manifestAcceptanceCriterionIds(manifest: Record<string, unknown>) {
  const value = (manifest as any)?.intent?.acceptanceCriterionIds;
  return Array.isArray(value) && value.every((id) => typeof id === "string" && id)
    ? value as string[]
    : [""];
}

function sanitizeDiagnostics(value: Record<string, unknown> | null) {
  if (!value) return null;
  return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "string"
    ? item.replace(/\bsk-or-v1-[A-Za-z0-9_-]+/g, "[REDACTED_OPENROUTER_KEY]")
      .replace(/\bgh[pousr]_[A-Za-z0-9_]+/g, "[REDACTED_PROVIDER_TOKEN]")
      .slice(0, 16_000)
    : item));
}
