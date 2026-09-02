export const TASKLESS_MANIFEST_VALIDATION_FAILURE =
  "Claimed Factory execution manifest is invalid.";

export const TASKLESS_PRE_EXECUTION_RECOVERY_SCHEMA =
  "taskless-pre-execution-recovery/v1" as const;

export const TASK_PRE_EXECUTION_RECOVERY_SCHEMA =
  "task-pre-execution-recovery/v1" as const;

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
};

export type TasklessPreExecutionRecoveryProof = {
  schema: typeof TASKLESS_PRE_EXECUTION_RECOVERY_SCHEMA;
  code: "STORED_MANIFEST_DIGEST_MISMATCH_BEFORE_EXECUTOR";
  sourceRunId: string;
  factoryDefinitionVersionId: string;
  frozenManifestDigest: string;
  recomputedManifestDigest: string;
  eventSequence: ["RUN_STARTED", "CHECKPOINT_CREATED", "RUN_FAILED"];
  provenSpendUsd: 0;
  releasedReservationUsd: number;
};

export type TasklessPreExecutionRecoveryResult =
  | { eligible: true; proof: TasklessPreExecutionRecoveryProof }
  | { eligible: false; reason: string };

export type TaskPreExecutionRecoveryProof = {
  schema: typeof TASK_PRE_EXECUTION_RECOVERY_SCHEMA;
  code: "CLAIM_EXECUTOR_IDENTITY_OMITTED_BEFORE_EXECUTOR";
  sourceRunId: string;
  sourceTaskId: string;
  factoryDefinitionVersionId: string;
  manifestDigest: string;
  executorAdapter: string;
  executorVersion: string;
  eventSequence: ["RUN_STARTED", "CHECKPOINT_CREATED", "RUN_FAILED"];
  provenSpendUsd: 0;
  releasedReservationUsd: number;
};

export type TaskPreExecutionRecoveryResult =
  | { eligible: true; proof: TaskPreExecutionRecoveryProof }
  | { eligible: false; reason: string };

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
  if (run.failureReason !== TASKLESS_MANIFEST_VALIDATION_FAILURE) {
    return { eligible: false, reason: "failure-not-recognized" };
  }
  if (!run.executionManifest || !run.executionManifestDigest || !args.recomputedManifestDigest) {
    return { eligible: false, reason: "manifest-proof-missing" };
  }
  if (run.executionManifestDigest === args.recomputedManifestDigest) {
    return { eligible: false, reason: "manifest-digest-valid" };
  }
  const causation = (run.executionManifest as { causation?: { workflowRunId?: unknown } }).causation;
  if (causation?.workflowRunId !== run.runId) {
    return { eligible: false, reason: "manifest-run-causation-mismatch" };
  }
  if (run.spentUsd !== 0) {
    return { eligible: false, reason: "nonzero-or-unknown-spend" };
  }
  const reservation = run.reservedCostUsd;
  const authorization = run.executionCostAuthorization;
  if (!(typeof reservation === "number" && reservation > 0)
    || authorization?.reservedCostUsd !== reservation
    || authorization.actualCost.status !== "UNAVAILABLE") {
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
  const expectedSequence = ["RUN_STARTED", "CHECKPOINT_CREATED", "RUN_FAILED"] as const;
  if (orderedEvents.length !== expectedSequence.length
    || orderedEvents.some((event, index) => event.eventType !== expectedSequence[index])) {
    return { eligible: false, reason: "unexpected-event-history" };
  }
  if (orderedEvents[2].errorSummary !== TASKLESS_MANIFEST_VALIDATION_FAILURE) {
    return { eligible: false, reason: "terminal-event-proof-mismatch" };
  }

  return {
    eligible: true,
    proof: {
      schema: TASKLESS_PRE_EXECUTION_RECOVERY_SCHEMA,
      code: "STORED_MANIFEST_DIGEST_MISMATCH_BEFORE_EXECUTOR",
      sourceRunId: run.runId,
      factoryDefinitionVersionId: run.factoryDefinitionVersionId,
      frozenManifestDigest: run.executionManifestDigest,
      recomputedManifestDigest: args.recomputedManifestDigest,
      eventSequence: [...expectedSequence],
      provenSpendUsd: 0,
      releasedReservationUsd: reservation,
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
  if (run.failureReason !== TASKLESS_MANIFEST_VALIDATION_FAILURE) {
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
  if (run.spentUsd !== 0) {
    return { eligible: false, reason: "nonzero-or-unknown-spend" };
  }
  const reservation = run.reservedCostUsd;
  const authorization = run.executionCostAuthorization;
  if (!(typeof reservation === "number" && reservation > 0)
    || authorization?.reservedCostUsd !== reservation
    || authorization.actualCost.status !== "UNAVAILABLE") {
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
  const expectedSequence = ["RUN_STARTED", "CHECKPOINT_CREATED", "RUN_FAILED"] as const;
  if (orderedEvents.length !== expectedSequence.length
    || orderedEvents.some((event, index) => event.eventType !== expectedSequence[index])) {
    return { eligible: false, reason: "unexpected-event-history" };
  }
  if (orderedEvents[2].errorSummary !== TASKLESS_MANIFEST_VALIDATION_FAILURE) {
    return { eligible: false, reason: "terminal-event-proof-mismatch" };
  }

  return {
    eligible: true,
    proof: {
      schema: TASK_PRE_EXECUTION_RECOVERY_SCHEMA,
      code: "CLAIM_EXECUTOR_IDENTITY_OMITTED_BEFORE_EXECUTOR",
      sourceRunId: run.runId,
      sourceTaskId: args.currentTaskId,
      factoryDefinitionVersionId: run.factoryDefinitionVersionId,
      manifestDigest: run.executionManifestDigest,
      executorAdapter: run.executorAdapter,
      executorVersion: run.executorVersion,
      eventSequence: [...expectedSequence],
      provenSpendUsd: 0,
      releasedReservationUsd: reservation,
    },
  };
}
