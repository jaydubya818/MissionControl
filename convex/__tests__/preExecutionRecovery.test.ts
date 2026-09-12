import { describe, expect, it } from "vitest";
import {
  evaluateTaskPreExecutionRecovery,
  evaluateTasklessPreExecutionRecovery,
  EXECUTION_PROFILE_VALIDATION_FAILURE,
  FAB_CONFIGURATION_VALIDATION_FAILURE,
  TASKLESS_MANIFEST_VALIDATION_FAILURE,
} from "../lib/preExecutionRecovery";

const run = {
  runId: "attempt-1",
  status: "FAILED",
  factoryDefinitionVersionId: "factory-version-2",
  workOrderRevisionNumber: 1,
  executionPhase: "TERMINAL",
  failureReason: TASKLESS_MANIFEST_VALIDATION_FAILURE,
  spentUsd: 0,
  reservedCostUsd: 24,
  executionManifest: { causation: { workflowRunId: "attempt-1" } },
  executionManifestDigest: "sha256:frozen",
  executionCostAuthorization: {
    reservedCostUsd: 24,
    actualCost: { status: "UNAVAILABLE" },
  },
};

const events = [
  { eventType: "RUN_STARTED", sequenceNumber: 1 },
  { eventType: "CHECKPOINT_CREATED", sequenceNumber: 2 },
  {
    eventType: "RUN_FAILED",
    sequenceNumber: 3,
    errorSummary: TASKLESS_MANIFEST_VALIDATION_FAILURE,
  },
];

function evaluate(overrides: Record<string, unknown> = {}) {
  return evaluateTasklessPreExecutionRecovery({
    run,
    currentWorkOrderRevisionNumber: 1,
    isLatestWorkOrderRun: true,
    recomputedManifestDigest: "sha256:stored-representation",
    events,
    artifactCount: 0,
    sandboxAllocationCount: 0,
    sandboxCredentialGrantCount: 0,
    ...overrides,
  });
}

describe("Task-less pre-execution recovery", () => {
  it("proves the known storage-roundtrip manifest failure before executor start", () => {
    expect(evaluate()).toEqual({
      eligible: true,
      proof: {
        schema: "taskless-pre-execution-recovery/v1",
        code: "STORED_MANIFEST_DIGEST_MISMATCH_BEFORE_EXECUTOR",
        sourceRunId: "attempt-1",
        factoryDefinitionVersionId: "factory-version-2",
        frozenManifestDigest: "sha256:frozen",
        recomputedManifestDigest: "sha256:stored-representation",
        eventSequence: ["RUN_STARTED", "CHECKPOINT_CREATED", "RUN_FAILED"],
        provenSpendUsd: 0,
        releasedReservationUsd: 24,
      },
    });
  });

  it("proves an exact profile validation rejection before executor start", () => {
    const profileRun = {
      ...run,
      failureReason: EXECUTION_PROFILE_VALIDATION_FAILURE,
      executionManifestDigest: "sha256:valid",
      spentUsd: undefined,
      reservedCostUsd: undefined,
      executionCostAuthorization: undefined,
    };
    const profileEvents = events.map((event) => event.eventType === "RUN_FAILED"
      ? { ...event, errorSummary: EXECUTION_PROFILE_VALIDATION_FAILURE }
      : event);
    expect(evaluate({
      run: profileRun,
      recomputedManifestDigest: "sha256:valid",
      events: profileEvents,
      externalProviderLiability: {
        reservationId: "provider-reservation-1",
        reservationDigest: "sha256:provider-reservation",
        maximumNanoUsd: 5_000_000_000,
        scopeMatches: true,
        integrityValid: true,
        current: true,
        providerRequestCount: 0,
        usageEventCount: 0,
      },
    })).toMatchObject({
      eligible: true,
      proof: {
        code: "EXECUTION_PROFILE_REJECTED_BEFORE_EXECUTOR",
        provenSpendUsd: 0,
        externalProviderLiability: {
          reservationId: "provider-reservation-1",
          providerRequestCount: 0,
          usageEventCount: 0,
        },
      },
    });
  });

  it("materializes a Task after an exact taskless Fab admission rejection with zero liability", () => {
    const providerRun = {
      ...run,
      executorAdapter: "fab",
      executorVersion: "v1",
      executionManifest: {
        causation: { workflowRunId: "attempt-1" },
        harness: { adapter: "fab", version: "v1" },
      },
      executionManifestDigest: "sha256:valid",
      failureReason: "Fab execution blocked, failed or cancelled; inspect its redacted evidence.",
      spentUsd: undefined,
      reservedCostUsd: undefined,
      executionCostAuthorization: undefined,
    };
    const request = {
      localRequestId: "local-1",
      requestDigest: "request-1",
      outcome: "UNKNOWN",
      requestId: null,
      usage: null,
      retries: 0,
    };
    const providerEvents = [
      { eventType: "RUN_STARTED", commandSummary: "Dispatched qualification", sequenceNumber: 1 },
      { eventType: "CHECKPOINT_CREATED", commandSummary: "Factory attempt lease claimed", sequenceNumber: 2 },
      { eventType: "STEP_STARTED", commandSummary: "MC-authorized Fab planning and bounded execution", sequenceNumber: 3, metadata: { executorEventType: "EXECUTION_STARTED" } },
      { eventType: "COMMAND_EXECUTED", commandSummary: "stage_started", sequenceNumber: 4, metadata: { executorEventType: "ARTIFACT_PRODUCED" } },
      { eventType: "COMMAND_EXECUTED", commandSummary: "model_started", sequenceNumber: 5, metadata: { executorEventType: "ARTIFACT_PRODUCED" } },
      { eventType: "COMMAND_EXECUTED", commandSummary: "provider_request", sequenceNumber: 6, metadata: { executorEventType: "ARTIFACT_PRODUCED", providerRequest: { ...request, phase: "STARTED", errorCode: null } } },
      { eventType: "COMMAND_EXECUTED", commandSummary: "provider_request", sequenceNumber: 7, metadata: { executorEventType: "ARTIFACT_PRODUCED", providerRequest: { ...request, phase: "FAILED", errorCode: "PROVIDER_BROKER" } } },
      { eventType: "COMMAND_EXECUTED", commandSummary: "stage_failed", sequenceNumber: 8, metadata: { executorEventType: "ARTIFACT_PRODUCED" } },
      { eventType: "RUN_FAILED", commandSummary: "Fab failed", sequenceNumber: 9, metadata: { executorEventType: "EXECUTION_FAILED" } },
      { eventType: "RUN_FAILED", errorSummary: providerRun.failureReason, sequenceNumber: 10 },
    ];
    expect(evaluate({
      run: providerRun,
      recomputedManifestDigest: "sha256:valid",
      events: providerEvents,
      externalProviderLiability: {
        reservationId: "provider-reservation-1",
        reservationDigest: "sha256:provider-reservation",
        maximumNanoUsd: 4_945_178_000,
        scopeMatches: true,
        integrityValid: true,
        current: true,
        providerRequestCount: 0,
        usageEventCount: 0,
      },
    })).toMatchObject({
      eligible: true,
      proof: {
        code: "FAB_PROVIDER_ADMISSION_REJECTED_BEFORE_INFERENCE",
        releasedReservationUsd: 0,
        externalProviderLiability: { providerRequestCount: 0, usageEventCount: 0 },
      },
    });
  });

  it.each([
    ["the run is not latest", { isLatestWorkOrderRun: false }, "source-run-not-latest"],
    ["the Factory version is missing", { run: { ...run, factoryDefinitionVersionId: undefined } }, "factory-version-proof-missing"],
    ["the frozen digest validates", { recomputedManifestDigest: "sha256:frozen" }, "manifest-digest-valid"],
    ["spend is unknown", { run: { ...run, spentUsd: undefined } }, "nonzero-or-unknown-spend"],
    ["a sandbox result exists", { run: { ...run, sandboxResultDigest: "sha256:result" } }, "executor-boundary-crossed"],
    ["an artifact exists", { artifactCount: 1 }, "execution-resources-exist"],
    ["a sandbox exists", { sandboxAllocationCount: 1 }, "execution-resources-exist"],
    ["an execution event exists", {
      events: [events[0], events[1], { eventType: "TOOL_CALLED", sequenceNumber: 3 }, { ...events[2], sequenceNumber: 4 }],
    }, "unexpected-event-history"],
    ["the failure is not exact", {
      run: { ...run, failureReason: "Executor failed." },
    }, "failure-not-recognized"],
  ])("fails closed when %s", (_label, overrides, reason) => {
    expect(evaluate(overrides as Record<string, unknown>)).toEqual({
      eligible: false,
      reason,
    });
  });

  it("does not mistake the lease-claim invocation marker for executor-start evidence", () => {
    expect(evaluate({ run: { ...run, executorInvocationId: "attempt-1:lease-1" } }).eligible)
      .toBe(true);
  });
});

describe("Task-linked pre-execution recovery", () => {
  const taskRun = {
    ...run,
    parentTaskId: "task-1",
    executorAdapter: "codex",
    executorVersion: "v1",
    executionManifest: {
      causation: { workflowRunId: "attempt-1", taskId: "task-1" },
      harness: { adapter: "codex", version: "v1" },
    },
    executionManifestDigest: "sha256:valid",
  };

  function evaluateTask(overrides: Record<string, unknown> = {}) {
    return evaluateTaskPreExecutionRecovery({
      run: taskRun,
      currentTaskId: "task-1",
      currentWorkOrderRevisionNumber: 1,
      isLatestWorkOrderRun: true,
      recomputedManifestDigest: "sha256:valid",
      events,
      artifactCount: 0,
      sandboxAllocationCount: 0,
      sandboxCredentialGrantCount: 0,
      ...overrides,
    });
  }

  it("proves the valid manifest was rejected before execution when claim identity was omitted", () => {
    expect(evaluateTask()).toEqual({
      eligible: true,
      proof: {
        schema: "task-pre-execution-recovery/v1",
        code: "CLAIM_EXECUTOR_IDENTITY_OMITTED_BEFORE_EXECUTOR",
        sourceRunId: "attempt-1",
        sourceTaskId: "task-1",
        factoryDefinitionVersionId: "factory-version-2",
        manifestDigest: "sha256:valid",
        executorAdapter: "codex",
        executorVersion: "v1",
        eventSequence: ["RUN_STARTED", "CHECKPOINT_CREATED", "RUN_FAILED"],
        provenSpendUsd: 0,
        releasedReservationUsd: 24,
      },
    });
  });

  it("proves Fab configuration rejection occurred before provider activity", () => {
    const fabRun = {
      ...taskRun,
      executorAdapter: "fab",
      executorVersion: "v1",
      executionManifest: {
        causation: { workflowRunId: "attempt-1", taskId: "task-1" },
        harness: { adapter: "fab", version: "v1" },
      },
      failureReason: FAB_CONFIGURATION_VALIDATION_FAILURE,
      spentUsd: undefined,
      reservedCostUsd: undefined,
      executionCostAuthorization: undefined,
    };
    const fabEvents = events.map((event) => event.eventType === "RUN_FAILED"
      ? { ...event, errorSummary: FAB_CONFIGURATION_VALIDATION_FAILURE }
      : event);
    expect(evaluateTask({
      run: fabRun,
      events: fabEvents,
      externalProviderLiability: {
        reservationId: "provider-reservation-1",
        reservationDigest: "sha256:provider-reservation",
        maximumNanoUsd: 5_000_000_000,
        scopeMatches: true,
        integrityValid: true,
        current: true,
        providerRequestCount: 0,
        usageEventCount: 0,
      },
    })).toMatchObject({
      eligible: true,
      proof: {
        code: "FAB_CONFIGURATION_REJECTED_BEFORE_PROVIDER",
        provenSpendUsd: 0,
        releasedReservationUsd: 0,
        externalProviderLiability: {
          reservationId: "provider-reservation-1",
          providerRequestCount: 0,
          usageEventCount: 0,
        },
      },
    });
  });

  it("proves a Fab provider admission failure stopped before inference", () => {
    const providerRun = {
      ...taskRun,
      executorAdapter: "fab",
      executorVersion: "v1",
      executionManifest: {
        causation: { workflowRunId: "attempt-1", taskId: "task-1" },
        harness: { adapter: "fab", version: "v1" },
      },
      failureReason: "Fab execution blocked, failed or cancelled; inspect its redacted evidence.",
      spentUsd: undefined,
      reservedCostUsd: undefined,
      executionCostAuthorization: undefined,
    };
    const request = {
      localRequestId: "local-1",
      requestDigest: "request-1",
      outcome: "UNKNOWN",
      requestId: null,
      usage: null,
      retries: 0,
    };
    const providerEvents = [
      { eventType: "RUN_STARTED", commandSummary: "Dispatched qualification", sequenceNumber: 1 },
      { eventType: "CHECKPOINT_CREATED", commandSummary: "Factory attempt lease claimed", sequenceNumber: 2 },
      { eventType: "STEP_STARTED", commandSummary: "MC-authorized Fab planning and bounded execution", sequenceNumber: 3, metadata: { executorEventType: "EXECUTION_STARTED" } },
      { eventType: "COMMAND_EXECUTED", commandSummary: "stage_started", sequenceNumber: 4, metadata: { executorEventType: "ARTIFACT_PRODUCED" } },
      { eventType: "COMMAND_EXECUTED", commandSummary: "model_started", sequenceNumber: 5, metadata: { executorEventType: "ARTIFACT_PRODUCED" } },
      { eventType: "COMMAND_EXECUTED", commandSummary: "provider_request", sequenceNumber: 6, metadata: { executorEventType: "ARTIFACT_PRODUCED", providerRequest: { ...request, phase: "STARTED", errorCode: null } } },
      { eventType: "COMMAND_EXECUTED", commandSummary: "provider_request", sequenceNumber: 7, metadata: { executorEventType: "ARTIFACT_PRODUCED", providerRequest: { ...request, phase: "FAILED", errorCode: "PROVIDER_BROKER" } } },
      { eventType: "COMMAND_EXECUTED", commandSummary: "stage_failed", sequenceNumber: 8, metadata: { executorEventType: "ARTIFACT_PRODUCED" } },
      { eventType: "RUN_FAILED", commandSummary: "Fab failed", sequenceNumber: 9, metadata: { executorEventType: "EXECUTION_FAILED" } },
      { eventType: "RUN_FAILED", errorSummary: providerRun.failureReason, sequenceNumber: 10 },
    ];
    const externalProviderLiability = {
      reservationId: "provider-reservation-1",
      reservationDigest: "sha256:provider-reservation",
      maximumNanoUsd: 5_000_000_000,
      scopeMatches: true,
      integrityValid: true,
      current: true,
      providerRequestCount: 0,
      usageEventCount: 0,
    };
    expect(evaluateTask({ run: providerRun, events: providerEvents, externalProviderLiability })).toMatchObject({
      eligible: true,
      proof: { code: "FAB_PROVIDER_ADMISSION_REJECTED_BEFORE_INFERENCE", provenSpendUsd: 0 },
    });
    expect(evaluateTask({
      run: providerRun,
      events: providerEvents.map((event, index) => index === 6
        ? { ...event, metadata: { ...event.metadata, providerRequest: { ...event.metadata?.providerRequest, errorCode: "PROVIDER_RATE_LIMIT" } } }
        : event),
      externalProviderLiability: {
        ...externalProviderLiability,
        providerRequestCount: 1,
        usageEventCount: 1,
        settledZeroProviderRequestCount: 1,
        settledZeroUsageEventCount: 1,
        providerRequestId: "aws-request-1",
      },
    })).toMatchObject({
      eligible: true,
      proof: {
        code: "FAB_PROVIDER_ADMISSION_REJECTED_BEFORE_INFERENCE",
        externalProviderLiability: {
          providerRequestCount: 1,
          usageEventCount: 1,
          providerRequestId: "aws-request-1",
        },
      },
    });
    expect(evaluateTask({
      run: providerRun,
      events: providerEvents.map((event, index) => index === 6
        ? { ...event, metadata: { ...event.metadata, providerRequest: { ...event.metadata?.providerRequest, requestId: "aws-request" } } }
        : event),
      externalProviderLiability,
    })).toEqual({ eligible: false, reason: "unexpected-event-history" });
  });

  it.each([
    ["the Task differs", { currentTaskId: "task-2" }, "source-task-mismatch"],
    ["the stored digest is invalid", { recomputedManifestDigest: "sha256:other" }, "manifest-digest-invalid"],
    ["the executor identity differs", {
      run: { ...taskRun, executorVersion: "v2" },
    }, "executor-identity-proof-missing"],
    ["an artifact exists", { artifactCount: 1 }, "execution-resources-exist"],
  ])("fails closed when %s", (_label, overrides, reason) => {
    expect(evaluateTask(overrides as Record<string, unknown>)).toEqual({
      eligible: false,
      reason,
    });
  });
});
