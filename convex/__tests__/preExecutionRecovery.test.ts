import { describe, expect, it } from "vitest";
import {
  evaluateTaskPreExecutionRecovery,
  evaluateTasklessPreExecutionRecovery,
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
