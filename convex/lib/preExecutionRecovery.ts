export const TASKLESS_MANIFEST_VALIDATION_FAILURE =
  "Claimed Factory execution manifest is invalid.";
export const EXECUTION_PROFILE_VALIDATION_FAILURE =
  "Claimed Factory V3 Execution Profile binding is invalid (profile or admission lease mismatch).";
export const FAB_CONFIGURATION_VALIDATION_FAILURE =
  "Fab request does not match its admitted configuration.";

export function isRecognizedPreExecutionValidationFailure(value: unknown) {
  return value === TASKLESS_MANIFEST_VALIDATION_FAILURE
    || value === EXECUTION_PROFILE_VALIDATION_FAILURE
    || value === "Fab execution blocked, failed or cancelled; inspect its redacted evidence.";
}

export const TASKLESS_PRE_EXECUTION_RECOVERY_SCHEMA =
  "taskless-pre-execution-recovery/v1" as const;

export const TASK_PRE_EXECUTION_RECOVERY_SCHEMA =
  "task-pre-execution-recovery/v1" as const;

type PreExecutionEventSequence = ["RUN_STARTED", "CHECKPOINT_CREATED", "RUN_FAILED"];
type FabProviderAdmissionEventSequence = [
  "RUN_STARTED",
  "CHECKPOINT_CREATED",
  "STEP_STARTED",
  "COMMAND_EXECUTED",
  "COMMAND_EXECUTED",
  "COMMAND_EXECUTED",
  "COMMAND_EXECUTED",
  "COMMAND_EXECUTED",
  "RUN_FAILED",
  "RUN_FAILED",
];
const FAB_PROVIDER_ADMISSION_EVENT_SEQUENCE: FabProviderAdmissionEventSequence = [
  "RUN_STARTED", "CHECKPOINT_CREATED", "STEP_STARTED", "COMMAND_EXECUTED",
  "COMMAND_EXECUTED", "COMMAND_EXECUTED", "COMMAND_EXECUTED", "COMMAND_EXECUTED",
  "RUN_FAILED", "RUN_FAILED",
];

export type PreExecutionRecoveryRun = {
  runId: string;
  status: string;
  parentTaskId?: unknown;
  factoryDefinitionVersionId?: unknown;
  workOrderRevisionNumber?: number;
  executionPhase?: string;
  failureReason?: string;
  spentUsd?: number;
  reservedCostUsd?: number;
  // Allocated at lease claim, before manifest validation. This marker is not
  // evidence that the executor process or model actually started.
  executorInvocationId?: string;
  executorAdapter?: string;
  executorVersion?: string;
  sandboxAllocationId?: unknown;
  sandboxResultDigest?: string;
  executionManifest?: unknown;
  executionManifestDigest?: string;
  executionCostAuthorization?: {
    reservedCostUsd: number;
    actualCost: { status: string; usd?: number; reason?: string };
  };
};

export type PreExecutionRecoveryEvent = {
  eventType: string;
  sequenceNumber: number;
  errorSummary?: string;
  commandSummary?: string;
  metadata?: {
    executorEventType?: unknown;
    providerRequest?: {
      localRequestId?: unknown;
      requestDigest?: unknown;
      phase?: unknown;
      outcome?: unknown;
      errorCode?: unknown;
      requestId?: unknown;
      usage?: unknown;
      retries?: unknown;
    };
  };
};

export type TasklessPreExecutionRecoveryProof = {
  schema: typeof TASKLESS_PRE_EXECUTION_RECOVERY_SCHEMA;
  code: "STORED_MANIFEST_DIGEST_MISMATCH_BEFORE_EXECUTOR" | "EXECUTION_PROFILE_REJECTED_BEFORE_EXECUTOR" | "FAB_PROVIDER_ADMISSION_REJECTED_BEFORE_INFERENCE";
  sourceRunId: string;
  factoryDefinitionVersionId: string;
  frozenManifestDigest: string;
  recomputedManifestDigest: string;
  eventSequence: PreExecutionEventSequence | FabProviderAdmissionEventSequence;
  provenSpendUsd: 0;
  releasedReservationUsd: number;
  externalProviderLiability?: {
    reservationId: string;
    reservationDigest: string;
    maximumNanoUsd: number;
    providerRequestCount: number;
    usageEventCount: number;
    providerRequestId?: string;
  };
};

export type TasklessPreExecutionRecoveryResult =
  | { eligible: true; proof: TasklessPreExecutionRecoveryProof }
  | { eligible: false; reason: string };

export type TaskPreExecutionRecoveryProof = {
  schema: typeof TASK_PRE_EXECUTION_RECOVERY_SCHEMA;
  code: "CLAIM_EXECUTOR_IDENTITY_OMITTED_BEFORE_EXECUTOR" | "FAB_CONFIGURATION_REJECTED_BEFORE_PROVIDER" | "FAB_PROVIDER_ADMISSION_REJECTED_BEFORE_INFERENCE";
  sourceRunId: string;
  sourceTaskId: string;
  factoryDefinitionVersionId: string;
  manifestDigest: string;
  executorAdapter: string;
  executorVersion: string;
  eventSequence: PreExecutionEventSequence | FabProviderAdmissionEventSequence;
  provenSpendUsd: 0;
  releasedReservationUsd: number;
  externalProviderLiability?: {
    reservationId: string;
    reservationDigest: string;
    maximumNanoUsd: number;
    providerRequestCount: number;
    usageEventCount: number;
    providerRequestId?: string;
  };
};

export type TaskPreExecutionRecoveryResult =
  | { eligible: true; proof: TaskPreExecutionRecoveryProof }
  | { eligible: false; reason: string };

const isFabProviderAdmissionFailure = (run: PreExecutionRecoveryRun) =>
  run.failureReason === "Fab execution blocked, failed or cancelled; inspect its redacted evidence."
  && run.executorAdapter === "fab"
  && run.executorVersion === "v1";

function hasExactFabProviderAdmissionFailureLifecycle(
  events: PreExecutionRecoveryEvent[],
  failureReason: string | undefined,
) {
  const orderedEvents = [...events].sort((left, right) =>
    left.sequenceNumber - right.sequenceNumber
  );
  const summaries = orderedEvents.map((event) => [event.eventType, event.commandSummary, event.metadata?.executorEventType]);
  const started = orderedEvents[5]?.metadata?.providerRequest;
  const failed = orderedEvents[6]?.metadata?.providerRequest;
  return orderedEvents.length === 10
    && JSON.stringify(summaries) === JSON.stringify([
      ["RUN_STARTED", orderedEvents[0]?.commandSummary, undefined],
      ["CHECKPOINT_CREATED", "Factory attempt lease claimed", undefined],
      ["STEP_STARTED", "MC-authorized Fab planning and bounded execution", "EXECUTION_STARTED"],
      ["COMMAND_EXECUTED", "stage_started", "ARTIFACT_PRODUCED"],
      ["COMMAND_EXECUTED", "model_started", "ARTIFACT_PRODUCED"],
      ["COMMAND_EXECUTED", "provider_request", "ARTIFACT_PRODUCED"],
      ["COMMAND_EXECUTED", "provider_request", "ARTIFACT_PRODUCED"],
      ["COMMAND_EXECUTED", "stage_failed", "ARTIFACT_PRODUCED"],
      ["RUN_FAILED", "Fab failed", "EXECUTION_FAILED"],
      ["RUN_FAILED", orderedEvents[9]?.commandSummary, undefined],
    ])
    && typeof started?.localRequestId === "string"
    && typeof started.requestDigest === "string"
    && started.phase === "STARTED"
    && started.outcome === "UNKNOWN"
    && started.requestId == null
    && started.usage == null
    && started.retries === 0
    && failed?.localRequestId === started.localRequestId
    && failed?.requestDigest === started.requestDigest
    && failed.phase === "FAILED"
    && failed.outcome === "UNKNOWN"
    && (failed.errorCode === "PROVIDER_BROKER" || failed.errorCode === "PROVIDER_RATE_LIMIT")
    && failed.requestId == null
    && failed.usage == null
    && failed.retries === 0
    && orderedEvents[9]?.errorSummary === failureReason;
}

/**
 * Recognizes one historical control-plane defect. This is intentionally not a
 * general refund predicate: every positive signal must prove that the frozen
 * manifest was rejected before the worker could create a worktree or invoke an
 * executor.
 */
export function evaluateTasklessPreExecutionRecovery(args: {
  run: PreExecutionRecoveryRun;
  currentWorkOrderRevisionNumber: number;
  isLatestWorkOrderRun: boolean;
  recomputedManifestDigest?: string;
  events: PreExecutionRecoveryEvent[];
  artifactCount: number;
  sandboxAllocationCount: number;
  sandboxCredentialGrantCount: number;
  externalProviderLiability?: {
    reservationId: string;
    reservationDigest: string;
    maximumNanoUsd: number;
    scopeMatches: boolean;
    integrityValid: boolean;
    current: boolean;
    providerRequestCount: number;
    usageEventCount: number;
    settledZeroProviderRequestCount?: number;
    settledZeroUsageEventCount?: number;
    providerRequestId?: string;
  };
}): TasklessPreExecutionRecoveryResult {
  const { run } = args;
  if (!args.isLatestWorkOrderRun) {
    return { eligible: false, reason: "source-run-not-latest" };
  }
  if (run.status !== "FAILED" || run.executionPhase !== "TERMINAL") {
    return { eligible: false, reason: "source-run-not-terminal-failure" };
  }
  if (run.parentTaskId) {
    return { eligible: false, reason: "source-run-already-has-task" };
  }
  if (run.workOrderRevisionNumber !== args.currentWorkOrderRevisionNumber) {
    return { eligible: false, reason: "source-run-revision-mismatch" };
  }
  if (typeof run.factoryDefinitionVersionId !== "string" || !run.factoryDefinitionVersionId) {
    return { eligible: false, reason: "factory-version-proof-missing" };
  }
  const fabProviderAdmissionFailure = isFabProviderAdmissionFailure(run);
  if (!isRecognizedPreExecutionValidationFailure(run.failureReason)
    || (run.failureReason === "Fab execution blocked, failed or cancelled; inspect its redacted evidence."
      && !fabProviderAdmissionFailure)) {
    return { eligible: false, reason: "failure-not-recognized" };
  }
  if (!run.executionManifest || !run.executionManifestDigest || !args.recomputedManifestDigest) {
    return { eligible: false, reason: "manifest-proof-missing" };
  }
  const profileFailure = run.failureReason === EXECUTION_PROFILE_VALIDATION_FAILURE;
  if ((profileFailure || fabProviderAdmissionFailure)
    ? run.executionManifestDigest !== args.recomputedManifestDigest
    : run.executionManifestDigest === args.recomputedManifestDigest) {
    return { eligible: false, reason: profileFailure ? "manifest-digest-invalid" : "manifest-digest-valid" };
  }
  const causation = (run.executionManifest as { causation?: { workflowRunId?: unknown } }).causation;
  if (causation?.workflowRunId !== run.runId) {
    return { eligible: false, reason: "manifest-run-causation-mismatch" };
  }
  // The exact V3 profile rejection occurs before adapter construction. Older
  // workers left spend unset at that boundary; the exact failure plus the
  // resource/event absence checks below prove zero execution spend.
  if ((profileFailure || fabProviderAdmissionFailure)
    ? run.spentUsd !== undefined && run.spentUsd !== 0
    : run.spentUsd !== 0) {
    return { eligible: false, reason: "nonzero-or-unknown-spend" };
  }
  const reservation = run.reservedCostUsd;
  const authorization = run.executionCostAuthorization;
  const external = args.externalProviderLiability;
  const externalNoRequestProof = external?.providerRequestCount === 0
    && external.usageEventCount === 0;
  const externalSettledZeroProof = external?.providerRequestCount === 1
    && external.usageEventCount === 1
    && external.settledZeroProviderRequestCount === 1
    && external.settledZeroUsageEventCount === 1
    && typeof external.providerRequestId === "string";
  const externalZeroSpendProof = (profileFailure || fabProviderAdmissionFailure)
    && external?.scopeMatches === true
    && external.integrityValid === true
    && external.current === true
    && (externalNoRequestProof || externalSettledZeroProof)
    && Number.isSafeInteger(external.maximumNanoUsd)
    && external.maximumNanoUsd > 0;
  if (!externalZeroSpendProof && (!(typeof reservation === "number" && reservation > 0)
    || authorization?.reservedCostUsd !== reservation
    || authorization.actualCost.status !== "UNAVAILABLE")) {
    return { eligible: false, reason: "reservation-proof-missing" };
  }
  if (run.sandboxAllocationId || run.sandboxResultDigest) {
    return { eligible: false, reason: "executor-boundary-crossed" };
  }
  if (args.artifactCount !== 0
    || args.sandboxAllocationCount !== 0
    || args.sandboxCredentialGrantCount !== 0) {
    return { eligible: false, reason: "execution-resources-exist" };
  }

  if (fabProviderAdmissionFailure) {
    const manifest = run.executionManifest as {
      causation?: { taskId?: unknown };
      harness?: { adapter?: unknown; version?: unknown };
    };
    if (manifest.causation?.taskId !== undefined
      || manifest.harness?.adapter !== run.executorAdapter
      || manifest.harness?.version !== run.executorVersion) {
      return { eligible: false, reason: "executor-identity-proof-missing" };
    }
    if (!externalZeroSpendProof) {
      return { eligible: false, reason: "reservation-proof-missing" };
    }
    const providerErrorCode = [...args.events]
      .sort((left, right) => left.sequenceNumber - right.sequenceNumber)[6]
      ?.metadata?.providerRequest?.errorCode;
    if (!hasExactFabProviderAdmissionFailureLifecycle(args.events, run.failureReason)
      || (externalNoRequestProof
        ? providerErrorCode !== "PROVIDER_BROKER"
        : providerErrorCode !== "PROVIDER_RATE_LIMIT")) {
      return { eligible: false, reason: "unexpected-event-history" };
    }
    return {
      eligible: true,
      proof: {
        schema: TASKLESS_PRE_EXECUTION_RECOVERY_SCHEMA,
        code: "FAB_PROVIDER_ADMISSION_REJECTED_BEFORE_INFERENCE",
        sourceRunId: run.runId,
        factoryDefinitionVersionId: run.factoryDefinitionVersionId,
        frozenManifestDigest: run.executionManifestDigest,
        recomputedManifestDigest: args.recomputedManifestDigest,
        eventSequence: [...FAB_PROVIDER_ADMISSION_EVENT_SEQUENCE],
        provenSpendUsd: 0,
        releasedReservationUsd: 0,
        externalProviderLiability: {
          reservationId: external!.reservationId,
          reservationDigest: external!.reservationDigest,
          maximumNanoUsd: external!.maximumNanoUsd,
          providerRequestCount: external!.providerRequestCount,
          usageEventCount: external!.usageEventCount,
          ...(external!.providerRequestId ? { providerRequestId: external!.providerRequestId } : {}),
        },
      },
    };
  }

  const orderedEvents = [...args.events].sort((left, right) =>
    left.sequenceNumber - right.sequenceNumber
  );
  const expectedSequence = ["RUN_STARTED", "CHECKPOINT_CREATED", "RUN_FAILED"] as const;
  if (orderedEvents.length !== expectedSequence.length
    || orderedEvents.some((event, index) => event.eventType !== expectedSequence[index])) {
    return { eligible: false, reason: "unexpected-event-history" };
  }
  if (orderedEvents[2].errorSummary !== run.failureReason) {
    return { eligible: false, reason: "terminal-event-proof-mismatch" };
  }

  return {
    eligible: true,
    proof: {
      schema: TASKLESS_PRE_EXECUTION_RECOVERY_SCHEMA,
      code: profileFailure
        ? "EXECUTION_PROFILE_REJECTED_BEFORE_EXECUTOR"
        : "STORED_MANIFEST_DIGEST_MISMATCH_BEFORE_EXECUTOR",
      sourceRunId: run.runId,
      factoryDefinitionVersionId: run.factoryDefinitionVersionId,
      frozenManifestDigest: run.executionManifestDigest,
      recomputedManifestDigest: args.recomputedManifestDigest,
      eventSequence: [...expectedSequence],
      provenSpendUsd: 0,
      releasedReservationUsd: externalZeroSpendProof ? 0 : reservation!,
      ...(externalZeroSpendProof ? {
        externalProviderLiability: {
          reservationId: external!.reservationId,
          reservationDigest: external!.reservationDigest,
          maximumNanoUsd: external!.maximumNanoUsd,
          providerRequestCount: 0 as const,
          usageEventCount: 0 as const,
        },
      } : {}),
    },
  };
}

/**
 * Recognizes the claim-envelope transport defect that omitted the executor
 * identity after a canonical Task already existed. The stored manifest must
 * be valid and match the run's frozen executor identity, while the exact event
 * and resource history must still prove the worker failed before execution.
 */
export function evaluateTaskPreExecutionRecovery(args: {
  run: PreExecutionRecoveryRun;
  currentTaskId: string;
  currentWorkOrderRevisionNumber: number;
  isLatestWorkOrderRun: boolean;
  recomputedManifestDigest?: string;
  events: PreExecutionRecoveryEvent[];
  artifactCount: number;
  sandboxAllocationCount: number;
  sandboxCredentialGrantCount: number;
  externalProviderLiability?: {
    reservationId: string;
    reservationDigest: string;
    maximumNanoUsd: number;
    scopeMatches: boolean;
    integrityValid: boolean;
    current: boolean;
    providerRequestCount: number;
    usageEventCount: number;
    settledZeroProviderRequestCount?: number;
    settledZeroUsageEventCount?: number;
    providerRequestId?: string;
  };
}): TaskPreExecutionRecoveryResult {
  const { run } = args;
  if (!args.isLatestWorkOrderRun) {
    return { eligible: false, reason: "source-run-not-latest" };
  }
  if (run.status !== "FAILED" || run.executionPhase !== "TERMINAL") {
    return { eligible: false, reason: "source-run-not-terminal-failure" };
  }
  if (String(run.parentTaskId ?? "") !== args.currentTaskId) {
    return { eligible: false, reason: "source-task-mismatch" };
  }
  if (run.workOrderRevisionNumber !== args.currentWorkOrderRevisionNumber) {
    return { eligible: false, reason: "source-run-revision-mismatch" };
  }
  if (typeof run.factoryDefinitionVersionId !== "string" || !run.factoryDefinitionVersionId) {
    return { eligible: false, reason: "factory-version-proof-missing" };
  }
  const fabConfigurationFailure = run.failureReason === FAB_CONFIGURATION_VALIDATION_FAILURE;
  const fabProviderAdmissionFailure = isFabProviderAdmissionFailure(run);
  if (run.failureReason !== TASKLESS_MANIFEST_VALIDATION_FAILURE
    && !fabConfigurationFailure
    && !fabProviderAdmissionFailure) {
    return { eligible: false, reason: "failure-not-recognized" };
  }
  if (!run.executionManifest || !run.executionManifestDigest || !args.recomputedManifestDigest) {
    return { eligible: false, reason: "manifest-proof-missing" };
  }
  if (run.executionManifestDigest !== args.recomputedManifestDigest) {
    return { eligible: false, reason: "manifest-digest-invalid" };
  }
  const manifest = run.executionManifest as {
    causation?: { workflowRunId?: unknown; taskId?: unknown };
    harness?: { adapter?: unknown; version?: unknown };
  };
  if (manifest.causation?.workflowRunId !== run.runId
    || manifest.causation?.taskId !== args.currentTaskId) {
    return { eligible: false, reason: "manifest-run-causation-mismatch" };
  }
  if (typeof run.executorAdapter !== "string" || !run.executorAdapter
    || typeof run.executorVersion !== "string" || !run.executorVersion
    || manifest.harness?.adapter !== run.executorAdapter
    || manifest.harness?.version !== run.executorVersion) {
    return { eligible: false, reason: "executor-identity-proof-missing" };
  }
  if ((fabConfigurationFailure || fabProviderAdmissionFailure)
    ? run.spentUsd !== undefined && run.spentUsd !== 0
    : run.spentUsd !== 0) {
    return { eligible: false, reason: "nonzero-or-unknown-spend" };
  }
  const reservation = run.reservedCostUsd;
  const authorization = run.executionCostAuthorization;
  const external = args.externalProviderLiability;
  const externalNoRequestProof = external?.providerRequestCount === 0
    && external.usageEventCount === 0;
  const externalSettledZeroProof = external?.providerRequestCount === 1
    && external.usageEventCount === 1
    && external.settledZeroProviderRequestCount === 1
    && external.settledZeroUsageEventCount === 1
    && typeof external.providerRequestId === "string";
  const externalZeroSpendProof = (fabConfigurationFailure || fabProviderAdmissionFailure)
    && external?.scopeMatches === true
    && external.integrityValid === true
    && external.current === true
    && (externalNoRequestProof || externalSettledZeroProof)
    && Number.isSafeInteger(external.maximumNanoUsd)
    && external.maximumNanoUsd > 0;
  if (!externalZeroSpendProof && (!(typeof reservation === "number" && reservation > 0)
    || authorization?.reservedCostUsd !== reservation
    || authorization.actualCost.status !== "UNAVAILABLE")) {
    return { eligible: false, reason: "reservation-proof-missing" };
  }
  if (run.sandboxAllocationId || run.sandboxResultDigest) {
    return { eligible: false, reason: "executor-boundary-crossed" };
  }
  if (args.artifactCount !== 0
    || args.sandboxAllocationCount !== 0
    || args.sandboxCredentialGrantCount !== 0) {
    return { eligible: false, reason: "execution-resources-exist" };
  }

  const orderedEvents = [...args.events].sort((left, right) =>
    left.sequenceNumber - right.sequenceNumber
  );
  if (fabProviderAdmissionFailure) {
    const providerErrorCode = orderedEvents[6]?.metadata?.providerRequest?.errorCode;
    if (!hasExactFabProviderAdmissionFailureLifecycle(orderedEvents, run.failureReason)
      || (externalNoRequestProof
        ? providerErrorCode !== "PROVIDER_BROKER"
        : providerErrorCode !== "PROVIDER_RATE_LIMIT"))
      return { eligible: false, reason: "unexpected-event-history" };
    return {
      eligible: true,
      proof: {
        schema: TASK_PRE_EXECUTION_RECOVERY_SCHEMA,
        code: "FAB_PROVIDER_ADMISSION_REJECTED_BEFORE_INFERENCE",
        sourceRunId: run.runId,
        sourceTaskId: args.currentTaskId,
        factoryDefinitionVersionId: run.factoryDefinitionVersionId,
        manifestDigest: run.executionManifestDigest,
        executorAdapter: run.executorAdapter!,
        executorVersion: run.executorVersion!,
        eventSequence: [...FAB_PROVIDER_ADMISSION_EVENT_SEQUENCE],
        provenSpendUsd: 0,
        releasedReservationUsd: 0,
        externalProviderLiability: {
          reservationId: external!.reservationId,
          reservationDigest: external!.reservationDigest,
          maximumNanoUsd: external!.maximumNanoUsd,
          providerRequestCount: external!.providerRequestCount,
          usageEventCount: external!.usageEventCount,
          ...(external!.providerRequestId ? { providerRequestId: external!.providerRequestId } : {}),
        },
      },
    };
  }
  const expectedSequence = ["RUN_STARTED", "CHECKPOINT_CREATED", "RUN_FAILED"] as const;
  if (orderedEvents.length !== expectedSequence.length
    || orderedEvents.some((event, index) => event.eventType !== expectedSequence[index])) {
    return { eligible: false, reason: "unexpected-event-history" };
  }
  if (orderedEvents[2].errorSummary !== run.failureReason) {
    return { eligible: false, reason: "terminal-event-proof-mismatch" };
  }

  return {
    eligible: true,
    proof: {
      schema: TASK_PRE_EXECUTION_RECOVERY_SCHEMA,
      code: fabConfigurationFailure
        ? "FAB_CONFIGURATION_REJECTED_BEFORE_PROVIDER"
        : "CLAIM_EXECUTOR_IDENTITY_OMITTED_BEFORE_EXECUTOR",
      sourceRunId: run.runId,
      sourceTaskId: args.currentTaskId,
      factoryDefinitionVersionId: run.factoryDefinitionVersionId,
      manifestDigest: run.executionManifestDigest,
      executorAdapter: run.executorAdapter,
      executorVersion: run.executorVersion,
      eventSequence: [...expectedSequence],
      provenSpendUsd: 0,
      releasedReservationUsd: externalZeroSpendProof ? 0 : reservation!,
      ...(externalZeroSpendProof ? {
        externalProviderLiability: {
          reservationId: external!.reservationId,
          reservationDigest: external!.reservationDigest,
          maximumNanoUsd: external!.maximumNanoUsd,
          providerRequestCount: 0 as const,
          usageEventCount: 0 as const,
        },
      } : {}),
    },
  };
}
