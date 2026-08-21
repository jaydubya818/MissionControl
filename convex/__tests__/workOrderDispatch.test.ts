import { describe, expect, it } from "vitest";
import {
  evaluateRemoteRetryPolicy,
  dispatchApprovalAllowed,
  dispatchInvalidatesVerificationReceipts,
  findActiveRun,
  nextStateForRunStatus,
  latestRequiredRemoteRetryRun,
  publicDispatchActorAllowed,
  resolveRemoteRetryFactoryVersion,
  validateDispatchable,
  resolveRetryExecutionBinding,
  validateRetryRequest,
} from "../lib/workOrderDispatch";

describe("public work order dispatch authority", () => {
  it("allows only server-derived human authority on the public mutation", () => {
    expect(publicDispatchActorAllowed("HUMAN")).toBe(true);
    expect(publicDispatchActorAllowed("SYSTEM")).toBe(false);
    expect(publicDispatchActorAllowed("AGENT")).toBe(false);
  });
});

describe("work order dispatch policy", () => {
  it("preserves immutable policy-v2 receipt history across recovery dispatch", () => {
    expect(dispatchInvalidatesVerificationReceipts({
      verificationContract: { schemaVersion: 2, enforcementMode: "ENFORCED" },
    })).toBe(false);
  });

  it("still invalidates receipts for an OBSERVE_ONLY policy-v2 contract", () => {
    // Regression: the exact-current evaluator only runs at acceptance for
    // ENFORCED policy-v2 contracts. Skipping receipt invalidation for every
    // schemaVersion 2 contract left OBSERVE_ONLY work with neither mechanism,
    // so a PASSED receipt from a superseded Attempt could clear acceptance
    // after re-dispatch.
    expect(dispatchInvalidatesVerificationReceipts({
      verificationContract: { schemaVersion: 2, enforcementMode: "OBSERVE_ONLY" },
    })).toBe(true);
    expect(dispatchInvalidatesVerificationReceipts({
      verificationContract: { schemaVersion: 2 },
    })).toBe(true);
  });

  it("retains legacy receipt invalidation on dispatch", () => {
    expect(dispatchInvalidatesVerificationReceipts({})).toBe(true);
    expect(dispatchInvalidatesVerificationReceipts({
      verificationContract: { schemaVersion: 1 },
    })).toBe(true);
  });

  it("requires approval for high-risk work orders", () => {
    expect(
      dispatchApprovalAllowed({
        riskLevel: "HIGH",
        approvalStatus: "PENDING",
        requiredApprovals: [],
      })
    ).toBe(false);
  });

  it("allows approved high-risk work orders to dispatch", () => {
    expect(
      dispatchApprovalAllowed({
        riskLevel: "HIGH",
        approvalStatus: "APPROVED",
        requiredApprovals: [],
      })
    ).toBe(true);
  });

  it("finds an active run when one exists", () => {
    expect(findActiveRun([{ status: "COMPLETED" }, { status: "RUNNING" }])?.status).toBe("RUNNING");
  });

  it("blocks dispatch when an active run exists", () => {
    const result = validateDispatchable({
      state: "READY",
      riskLevel: "LOW",
      approvalStatus: "NOT_REQUIRED",
      hasWorkflowId: true,
      activeRunStatuses: ["RUNNING"],
    });

    expect(result).toEqual({ ok: false, reason: "active-run-exists" });
  });

  it("blocks dispatch when no workflow is assigned", () => {
    const result = validateDispatchable({
      state: "READY",
      riskLevel: "LOW",
      approvalStatus: "NOT_REQUIRED",
      hasWorkflowId: false,
      activeRunStatuses: [],
    });

    expect(result).toEqual({ ok: false, reason: "missing-workflow" });
  });

  it("allows redispatch from awaiting verification when no active run exists", () => {
    const result = validateDispatchable({
      state: "AWAITING_VERIFICATION",
      riskLevel: "LOW",
      approvalStatus: "NOT_REQUIRED",
      hasWorkflowId: true,
      activeRunStatuses: [],
    });

    expect(result).toEqual({ ok: true });
  });

  it("allows dispatch from reopened when no active run exists", () => {
    const result = validateDispatchable({
      state: "REOPENED",
      riskLevel: "LOW",
      approvalStatus: "NOT_REQUIRED",
      hasWorkflowId: true,
      activeRunStatuses: [],
    });

    expect(result).toEqual({ ok: true });
  });

  it("blocks dispatch for superseded work", () => {
    const result = validateDispatchable({
      state: "SUPERSEDED",
      riskLevel: "LOW",
      approvalStatus: "NOT_REQUIRED",
      hasWorkflowId: true,
      activeRunStatuses: [],
    });

    expect(result).toEqual({ ok: false, reason: "invalid-state:SUPERSEDED" });
  });
});

describe("work order recovery dispatch", () => {
  it("does not inherit a failed Attempt branch or worktree into its replacement", () => {
    expect(resolveRetryExecutionBinding({
      priorRun: {
        _id: "run-1",
        branch: "codex/governed-proof",
        worktree: "/tmp/governed-proof",
      },
    })).toEqual({
      branch: undefined,
      worktree: undefined,
    });
  });

  it("does not inherit a root binding across a failed recovery chain", () => {
    const root = {
      _id: "run-1",
      branch: "codex/governed-proof",
      worktree: "/tmp/governed-proof",
    };
    const failedRetry = {
      _id: "run-2",
      branch: "mc/generated-branch",
      worktree: "/tmp/governed-proof",
      metadata: { retryOfWorkflowRunId: root._id },
    };

    expect(resolveRetryExecutionBinding({
      priorRun: failedRetry,
      lineage: [root, failedRetry],
    })).toEqual({
      branch: undefined,
      worktree: undefined,
    });
  });

  it("honors an explicit operator-selected replacement binding", () => {
    expect(resolveRetryExecutionBinding({
      branch: "codex/replacement",
      worktree: "/tmp/replacement",
      priorRun: { _id: "run-1", branch: "codex/old", worktree: "/tmp/old" },
    })).toEqual({ branch: "codex/replacement", worktree: "/tmp/replacement" });
  });

  it("rejects a branch or normalized worktree reused from the failed lineage", () => {
    const lineage = [
      { _id: "run-1", branch: "codex/root", worktree: "/tmp/root/" },
      { _id: "run-2", branch: "codex/retry", worktree: "/tmp/retry" },
    ];
    expect(() => resolveRetryExecutionBinding({ branch: "codex/root", lineage }))
      .toThrow(/fresh branch/);
    expect(() => resolveRetryExecutionBinding({ worktree: "/tmp/root", lineage }))
      .toThrow(/fresh worktree/);
  });

  it("requires the latest failed remote Attempt on the same revision and Task as retry parent", () => {
    const runs = [
      {
        _id: "run-1",
        status: "FAILED" as const,
        startedAt: 100,
        parentTaskId: "task-1",
        executionManifest: {
          causation: { workOrderRevisionNumber: 2 },
          harness: { executionBackend: "remote-sandbox" },
        },
      },
      {
        _id: "run-2",
        status: "FAILED" as const,
        startedAt: 200,
        parentTaskId: "task-1",
        executionManifest: {
          causation: { workOrderRevisionNumber: 2 },
          harness: { executionBackend: "remote-sandbox" },
        },
      },
    ];
    expect(latestRequiredRemoteRetryRun({
      runs,
      workOrderRevisionNumber: 2,
      parentTaskId: "task-1",
    })?._id).toBe("run-2");
    expect(latestRequiredRemoteRetryRun({
      runs,
      workOrderRevisionNumber: 3,
      parentTaskId: "task-1",
    })).toBeUndefined();
  });

  it("does not force retry lineage after a newer successful Attempt", () => {
    expect(latestRequiredRemoteRetryRun({
      workOrderRevisionNumber: 2,
      runs: [
        {
          _id: "run-1",
          status: "FAILED",
          startedAt: 100,
          executionManifest: {
            causation: { workOrderRevisionNumber: 2 },
            harness: { executionBackend: "remote-sandbox" },
          },
        },
        {
          _id: "run-2",
          status: "COMPLETED",
          startedAt: 200,
          executionManifest: {
            causation: { workOrderRevisionNumber: 2 },
            harness: { executionBackend: "remote-sandbox" },
          },
        },
      ],
    })).toBeUndefined();
  });

  it("freezes a remote retry to its prior Factory Version", () => {
    expect(resolveRemoteRetryFactoryVersion({
      retryingRemote: true,
      priorFactoryDefinitionVersionId: "factory-v1",
    })).toBe("factory-v1");
    expect(() => resolveRemoteRetryFactoryVersion({
      retryingRemote: true,
      priorFactoryDefinitionVersionId: "factory-v1",
      requestedFactoryDefinitionVersionId: "factory-v2",
    })).toThrow(/cannot replace/);
  });

  it("allows a reasoned retry of a failed run from the same WorkOrder", () => {
    expect(
      validateRetryRequest({
        workOrderId: "wo-1",
        retryReason: "Environment bootstrap was corrected.",
        priorRun: { workOrderId: "wo-1", status: "FAILED" },
      })
    ).toEqual({ ok: true, reason: "Environment bootstrap was corrected." });
  });

  it("allows a reasoned retry of a canceled run after operator recovery", () => {
    expect(
      validateRetryRequest({
        workOrderId: "wo-1",
        retryReason: "The canceled work order was explicitly reopened.",
        priorRun: { workOrderId: "wo-1", status: "CANCELED" },
      })
    ).toEqual({ ok: true, reason: "The canceled work order was explicitly reopened." });
  });

  it("rejects retrying a non-recoverable run", () => {
    expect(
      validateRetryRequest({
        workOrderId: "wo-1",
        retryReason: "Try the run again after review.",
        priorRun: { workOrderId: "wo-1", status: "COMPLETED" },
      })
    ).toEqual({ ok: false, reason: "retry-run-not-recoverable:COMPLETED" });
  });

  it("rejects a retry across WorkOrders", () => {
    expect(
      validateRetryRequest({
        workOrderId: "wo-1",
        retryReason: "Try the run again after review.",
        priorRun: { workOrderId: "wo-2", status: "FAILED" },
      })
    ).toEqual({ ok: false, reason: "retry-run-work-order-mismatch" });
  });

  it("requires a meaningful recovery reason", () => {
    expect(
      validateRetryRequest({
        workOrderId: "wo-1",
        retryReason: "retry",
        priorRun: { workOrderId: "wo-1", status: "FAILED" },
      })
    ).toEqual({ ok: false, reason: "retry-reason-required" });
  });

  it("permits only a classified remote transient inside every frozen bound", () => {
    const remote = {
      failureClass: "RETRYABLE_INFRA",
      retryable: true,
      policy: remoteRetryPolicy(),
      attemptsUsed: 1,
      totalWallClockMs: 30_000,
      observedModelSpendUsd: null,
      activeProviderResources: 0,
    };
    expect(evaluateRemoteRetryPolicy(remote)).toEqual({ allowed: true, reason: "WITHIN_FROZEN_BUDGET" });
    expect(validateRetryRequest({
      workOrderId: "wo-1",
      retryReason: "Transient SSH result read failed.",
      priorRun: { workOrderId: "wo-1", status: "FAILED" },
      remote,
    })).toEqual({
      ok: true,
      reason: "Transient SSH result read failed.",
      retryDecision: { allowed: true, reason: "WITHIN_FROZEN_BUDGET" },
    });
  });

  it.each([
    ["FAILURE_CLASS_NOT_RETRYABLE", { failureClass: "UNKNOWN", retryable: false }],
    ["MAX_ATTEMPTS_EXHAUSTED", { attemptsUsed: 3 }],
    ["MAX_WALL_CLOCK_EXHAUSTED", { totalWallClockMs: 600_000 }],
    ["MAX_MODEL_SPEND_EXHAUSTED", { observedModelSpendUsd: 3 }],
    ["MAX_PROVIDER_RESOURCES_EXHAUSTED", { activeProviderResources: 1 }],
  ] as const)("fails closed for remote retry decision %s", (reason, override) => {
    expect(evaluateRemoteRetryPolicy({
      failureClass: "RETRYABLE_EXECUTION",
      retryable: true,
      policy: remoteRetryPolicy(),
      attemptsUsed: 1,
      totalWallClockMs: 30_000,
      observedModelSpendUsd: null,
      activeProviderResources: 0,
      ...override,
    })).toEqual({ allowed: false, reason });
  });
});

function remoteRetryPolicy() {
  return {
    schema: "factory-remote-retry-policy/v1",
    maxAttempts: 3,
    maxTotalWallClockMs: 600_000,
    maxModelSpendUsd: 3,
    maxProviderResources: 1,
    retryableFailureClasses: ["RETRYABLE_INFRA", "RETRYABLE_EXECUTION"],
  };
}

describe("work order lifecycle synchronization", () => {
  it("moves completed verified work to DONE", () => {
    expect(
      nextStateForRunStatus({
        currentState: "IN_PROGRESS",
        runStatus: "COMPLETED",
        verificationStatus: "PASS",
        approvalStatus: "APPROVED",
      })
    ).toBe("AWAITING_VERIFICATION");
  });

  it("moves completed but unverified work to AWAITING_VERIFICATION", () => {
    expect(
      nextStateForRunStatus({
        currentState: "IN_PROGRESS",
        runStatus: "COMPLETED",
        verificationStatus: "PENDING",
        approvalStatus: "APPROVED",
      })
    ).toBe("AWAITING_VERIFICATION");
  });

  it("moves completed but unapproved work to AWAITING_APPROVAL", () => {
    expect(
      nextStateForRunStatus({
        currentState: "IN_PROGRESS",
        runStatus: "COMPLETED",
        verificationStatus: "PASS",
        approvalStatus: "PENDING",
      })
    ).toBe("AWAITING_APPROVAL");
  });

  it("moves failed work to BLOCKED", () => {
    expect(
      nextStateForRunStatus({
        currentState: "IN_PROGRESS",
        runStatus: "FAILED",
        verificationStatus: "PENDING",
        approvalStatus: "PENDING",
      })
    ).toBe("BLOCKED");
  });

  it("moves canceled work to CANCELED", () => {
    expect(
      nextStateForRunStatus({
        currentState: "DISPATCHED",
        runStatus: "CANCELED",
        verificationStatus: "PENDING",
        approvalStatus: "PENDING",
      })
    ).toBe("CANCELED");
  });

  it("moves paused work to AWAITING_APPROVAL", () => {
    expect(
      nextStateForRunStatus({
        currentState: "IN_PROGRESS",
        runStatus: "PAUSED",
        verificationStatus: "PENDING",
        approvalStatus: "PENDING",
      })
    ).toBe("AWAITING_APPROVAL");
  });
});
