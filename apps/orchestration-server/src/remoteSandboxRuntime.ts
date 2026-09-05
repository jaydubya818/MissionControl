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
import { canonicalHash } from "@mission-control/shared";
import {
  harnessCapabilityManifestDigest,
  harnessRuntimeArtifactDigest,
  harnessRuntimeArtifactIssues,
} from "@mission-control/workflow-engine";
import { validV3ExecutionProfileBinding } from "./sandboxSupervisor.js";

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
  /** Authoritative server lease heartbeat time returned by claim/reclaim. */
  profileAdmittedAt?: number;
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
    validateRemoteExecutionRuntimeArtifact(request);
    validateV2RemoteExecutionRequest(request);
    validateV3RemoteExecutionProfile(request);
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
        if (grant && !credentialRevocation) {
          try {
            credentialRevocation = await this.credentialBroker.revoke(grant);
            await this.journal.recordCredentialRevoked(credentialRevocation);
            await emit("SANDBOX_CREDENTIAL_REVOKED", { grantKey: grant.grantKey, externalCredentialId: grant.externalCredentialId });
          } catch (error) {
            cleanupError = combineErrors(cleanupError, error, "Attempt credential revocation failed.");
          }
        }
        if (allocation && !termination) {
          try {
            await emit("SANDBOX_TERMINATION_REQUESTED", { providerResourceId: allocation.providerResourceId });
            termination = await this.provider.terminate(allocation);
            if (!termination.resourceAbsent) throw new Error("Provider teardown did not prove resource absence.");
            if (resourceObservedRunning) await this.resourceObserver?.terminated(termination);
            await this.journal.recordTermination(termination);
            await emit("SANDBOX_TERMINATED", { confirmedAbsentAt: termination.confirmedAbsentAt });
          } catch (error) {
            cleanupError = combineErrors(cleanupError, error, "Sandbox teardown failed.");
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
        profileAdmittedAt: request.profileAdmittedAt,
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
  const route = remoteManifestRoute(manifest);
  return {
    adapter: String(harness?.adapter ?? ""),
    version: String(harness?.version ?? ""),
    harnessId: String(harness?.harnessId ?? ""),
    harnessVersion: String(harness?.harnessVersion ?? ""),
    provider: route?.provider ?? "",
    model: route?.model ?? "",
    ...(route?.modelRouteDigest === undefined ? {} : {
      modelRouteDigest: route.modelRouteDigest,
      providerRoute: route.providerRoute,
      ...(route.reasoningConfig === undefined ? {} : { reasoningConfig: structuredClone(route.reasoningConfig) }),
    }),
  };
}

function remoteManifestRoute(manifest: Record<string, unknown>): {
  provider: string;
  model: string;
  modelRouteDigest?: string;
  providerRoute?: string;
  reasoningConfig?: SandboxResultBundle["harness"]["reasoningConfig"];
} | undefined {
  const value = manifest as any;
  const provider = decomposedManifest(value)
    ? value?.modelRoute?.routeSnapshot?.provider
    : value?.harness?.provider;
  const model = decomposedManifest(value)
    ? value?.modelRoute?.routeSnapshot?.modelId
    : value?.harness?.model;
  if (!boundedIdentity(provider, 100) || !boundedIdentity(model, 200)) return undefined;
  if (!decomposedManifest(value)) return { provider, model };
  const modelRouteDigest = value?.modelRoute?.routeDigest;
  const providerRoute = value?.modelRoute?.routeSnapshot?.providerRoute;
  if (!/^sha256:[a-f0-9]{64}$/i.test(modelRouteDigest ?? "") || !boundedIdentity(providerRoute, 100)) return undefined;
  const reasoningConfig = value?.modelRoute?.routeSnapshot?.reasoningConfig;
  return {
    provider,
    model,
    modelRouteDigest,
    providerRoute,
    ...(reasoningConfig === undefined ? {} : { reasoningConfig: structuredClone(reasoningConfig) }),
  };
}

function validateRemoteExecutionRuntimeArtifact(request: RemoteSandboxExecutionRequest) {
  const manifest = request.executionManifest as any;
  const profileImageDigest = exactSandboxProfileImageDigest(request.profile);
  let artifact: { kind: string; executableSha256: string | null; imageDigest: string | null } | undefined;
  if (decomposedManifest(manifest)) {
    const candidate = manifest?.harness?.runtimeArtifact;
    if (candidate
      && harnessRuntimeArtifactIssues(candidate).length === 0
      && harnessRuntimeArtifactDigest(candidate) === manifest?.harness?.runtimeArtifactDigest) {
      artifact = candidate;
    }
  } else if (manifest?.version === "factory-execution-manifest/v1") {
    const runtime = manifest?.harness?.modelRouteSnapshot?.runtimeIdentity;
    if (runtime?.kind === "CODEX_CLI" && /^sha256:[a-f0-9]{64}$/i.test(runtime.imageDigest ?? "")) {
      artifact = {
        kind: "CONTAINER_IMAGE",
        executableSha256: null,
        imageDigest: runtime.imageDigest.toLowerCase(),
      };
    }
  }
  if (!profileImageDigest
    || !artifact
    || artifact.kind !== "CONTAINER_IMAGE"
    || artifact.executableSha256 !== null
    || artifact.imageDigest?.toLowerCase() !== profileImageDigest) {
    throw new RemoteSandboxExecutionError(remoteFailure(
      "NON_RETRYABLE_RESULT",
      "RUNTIME_ARTIFACT_PROFILE_MISMATCH",
      "PROFILE",
      "Remote execution runtime artifact does not match the exact immutable Sandbox Profile image.",
    ));
  }
}

function exactSandboxProfileImageDigest(profile: SandboxProfileSnapshot) {
  const securityDigest = profile.security?.image?.digest;
  const referenceDigest = profile.machine.image.match(/@(sha256:[a-f0-9]{64})$/i)?.[1];
  if (securityDigest && /^sha256:[a-f0-9]{64}$/i.test(securityDigest)) {
    if (!referenceDigest || referenceDigest.toLowerCase() !== securityDigest.toLowerCase()) return undefined;
    return securityDigest.toLowerCase();
  }
  return referenceDigest?.toLowerCase();
}

function validateV2RemoteExecutionRequest(request: RemoteSandboxExecutionRequest) {
  const manifest = request.executionManifest as any;
  if (!decomposedManifest(manifest)) return;
  const harness = manifest.harness;
  const route = remoteManifestRoute(request.executionManifest);
  const capabilityManifest = harness?.capabilityManifest;
  const qualification = manifest?.modelRoute?.qualificationSnapshot;
  const compatibility = qualification?.compatibility;
  const routeSnapshot = manifest?.modelRoute?.routeSnapshot;
  const valid = request.manifestDigest === `sha256:${canonicalHash(manifest)}`
    && manifest.executionBackend === "remote-sandbox"
    && harness?.executionBackend === undefined
    && harness?.provider === undefined
    && harness?.model === undefined
    && route !== undefined
    && validV2RemoteModelRoute(routeSnapshot)
    && manifest.modelRoute.routeDigest === `sha256:${canonicalHash({ namespace: "factory-model-route/v2", value: routeSnapshot })}`
    && qualification?.schema === "factory-model-route-qualification/v2"
    && qualification.routeDigest === manifest.modelRoute.routeDigest
    && manifest.modelRoute.qualificationDigest === `sha256:${canonicalHash({ namespace: "factory-model-route-qualification/v2", value: qualification })}`
    && /^[a-f0-9]{40}$/i.test(harness?.harnessCommit ?? "")
    && capabilityManifest
    && capabilityManifest.identity?.adapterId === harness.adapter
    && capabilityManifest.identity?.adapterVersion === harness.version
    && capabilityManifest.identity?.harnessId === harness.harnessId
    && capabilityManifest.identity?.harnessVersion === harness.harnessVersion
    && capabilityManifest.identity?.harnessCommit === harness.harnessCommit
    && harnessCapabilityManifestDigest(capabilityManifest) === harness.capabilityManifestSha256
    && capabilityManifest.effectiveConfigSha256 === harness.effectiveConfigSha256
    && harnessRuntimeArtifactIssues(harness.runtimeArtifact).length === 0
    && harnessRuntimeArtifactDigest(harness.runtimeArtifact) === harness.runtimeArtifactDigest
    && compatibility?.adapter === harness.adapter
    && compatibility?.version === harness.version
    && compatibility?.capabilityManifestDigest === harness.capabilityManifestSha256
    && compatibility?.effectiveConfigSha256 === harness.effectiveConfigSha256
    && compatibility?.runtimeArtifactDigest === harness.runtimeArtifactDigest
    && compatibility?.executionBackend === manifest.executionBackend
    && qualification.authority?.executionOnly === true
    && qualification.authority?.routing === false
    && qualification.authority?.verification === false
    && qualification.authority?.acceptance === false
    && qualification.authority?.publication === false
    && qualification.authority?.merge === false
    && request.executor.model === route?.model
    && request.executor.provider === route?.provider
    && request.executor.modelRouteDigest === route?.modelRouteDigest
    && request.executor.providerRoute === route?.providerRoute
    && route?.providerRoute === "openrouter"
    && canonicalHash(request.executor.reasoningConfig ?? null) === canonicalHash(route?.reasoningConfig ?? null)
    && manifest.causation?.workOrderId === request.workOrderId
    && manifest.causation?.workOrderRevisionNumber === request.workOrderRevisionNumber
    && manifest.causation?.workflowRunId === request.attemptId
    && manifest.sandbox?.profileDigest === sandboxProfileDigest(request.profile);
  if (!valid) {
    throw new RemoteSandboxExecutionError(remoteFailure(
      "NON_RETRYABLE_RESULT",
      "MANIFEST_EXECUTION_BINDING_INVALID",
      "PROFILE",
      "Remote execution request does not match its frozen decomposed model, harness, runtime artifact, and backend bindings.",
    ));
  }
}

function validateV3RemoteExecutionProfile(request: RemoteSandboxExecutionRequest) {
  const manifest = request.executionManifest as any;
  if (manifest?.version !== "factory-execution-manifest/v3") return;
  if (!validV3ExecutionProfileBinding(manifest, request.profileAdmittedAt)) {
    throw new RemoteSandboxExecutionError(remoteFailure(
      "NON_RETRYABLE_RESULT",
      "EXECUTION_PROFILE_BINDING_INVALID",
      "PROFILE",
      "Remote execution requires a current exact Execution Profile and qualification receipt.",
    ));
  }
}

function decomposedManifest(manifest: any) {
  return manifest?.version === "factory-execution-manifest/v2"
    || manifest?.version === "factory-execution-manifest/v3";
}

function validV2RemoteModelRoute(route: any) {
  if (!route || route.schema !== "factory-model-route/v2"
    || Object.keys(route).some((key) => !["schema", "provider", "providerRoute", "modelId", "reasoningConfig"].includes(key))
    || Object.hasOwn(route, "capabilityIdentity")
    || Object.hasOwn(route, "runtimeIdentity")
    || !boundedIdentity(route.provider, 100)
    || route.provider !== route.provider.toLowerCase()
    || !boundedIdentity(route.providerRoute, 100)
    || route.providerRoute !== route.providerRoute.toLowerCase()
    || !boundedIdentity(route.modelId, 200)) return false;
  if (route.reasoningConfig === undefined) return true;
  const reasoning = route.reasoningConfig;
  return reasoning && typeof reasoning === "object" && !Array.isArray(reasoning)
    && Object.keys(reasoning).length > 0
    && Object.keys(reasoning).every((key) => ["effort", "temperature", "maxTokens"].includes(key))
    && (reasoning.effort === undefined || (boundedIdentity(reasoning.effort, 64) && reasoning.effort === reasoning.effort.toLowerCase()))
    && (reasoning.temperature === undefined || (typeof reasoning.temperature === "number" && Number.isFinite(reasoning.temperature) && reasoning.temperature >= 0 && reasoning.temperature <= 2))
    && (reasoning.maxTokens === undefined || (Number.isSafeInteger(reasoning.maxTokens) && reasoning.maxTokens >= 1 && reasoning.maxTokens <= 10_000_000));
}

function boundedIdentity(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value === value.trim() && value.length > 0
    && value.length <= maximum && !/[\0\r\n]/.test(value);
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
