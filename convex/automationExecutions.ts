import { v } from "convex/values";
import { mutation } from "./lib/missionScopedFunctions";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { AUTOMATION_ACTOR_IDENTITY_SOURCE } from "./lib/automationGovernance";
import { sha256Hex } from "./lib/harnessPrChecks";
import { getEffectiveOperatorControl } from "./lib/operatorControls";
import {
  activeReadOnlyExecutionLeaseMatches,
  evaluateReadOnlyExecutionClaim,
  readOnlyCancellationAction,
  readOnlyExecutionDisposition,
  readOnlyTerminalProjection,
  renewReadOnlyExecutionLease,
  type ReadOnlyExecutionLease,
} from "./lib/readOnlyRunControl";

const executionStatus = v.union(
  v.literal("passed"),
  v.literal("failed"),
  v.literal("timed_out"),
  v.literal("cancelled"),
  v.literal("infrastructure_error")
);

async function executionContext(ctx: MutationCtx, workOrderId: Id<"workOrders">) {
  const workOrder = await ctx.db.get(workOrderId);
  if (!workOrder) throw new Error("WorkOrder not found");
  const definitionId = workOrder.metadata?.automationDefinitionId as Id<"automationDefinitions"> | undefined;
  if (!definitionId) throw new Error("WorkOrder is not linked to an Automation Definition");
  const definition = await ctx.db.get(definitionId);
  if (!definition) throw new Error("Automation Definition not found");
  const run = workOrder.currentExecutionRunId
    ? await ctx.db.get(workOrder.currentExecutionRunId)
    : null;
  if (!run || run.workOrderId !== workOrder._id) {
    throw new Error("WorkOrder has no eligible dispatch-created run");
  }
  const artifact = definition.artifactId
    ? await ctx.db.get(definition.artifactId as Id<"automationArtifacts">)
    : null;
  if (!artifact || artifact.validationStatus !== "PASSED") {
    throw new Error("Approved Automation artifact is unavailable");
  }
  const evaluation = await ctx.db.query("automationEvaluations")
    .withIndex("by_work_order", (q: any) => q.eq("workOrderId", workOrder._id))
    .order("desc")
    .first();
  const bindingDigest = `sha256:${await sha256Hex(JSON.stringify({
    definitionId: String(definition._id),
    definitionVersion: definition.definitionVersion,
    maxDurationSeconds: definition.maxDurationSeconds,
    maxRetries: definition.maxRetries,
    maxCostUsd: definition.maxCostUsd,
    concurrencyLimit: definition.concurrencyLimit,
    artifactId: String(artifact._id),
    artifactContentHash: artifact.contentHash,
    workOrderId: String(workOrder._id),
    workOrderRevisionNumber: workOrder.currentRevisionNumber ?? 1,
    workflowRunId: String(run._id),
  }))}`;
  return { workOrder, definition, run, artifact, evaluation, bindingDigest };
}

function leaseFromRun(run: Doc<"workflowRuns">): ReadOnlyExecutionLease | undefined {
  const claimedAt = run.executionClaimedAt;
  const heartbeatAt = run.executionHeartbeatAt;
  const expiresAt = run.executionLeaseExpiresAt;
  if (
    !run.executionClaimId
    || !run.executionClaimedBy
    || typeof claimedAt !== "number"
    || !Number.isFinite(claimedAt)
    || typeof heartbeatAt !== "number"
    || !Number.isFinite(heartbeatAt)
    || typeof expiresAt !== "number"
    || !Number.isFinite(expiresAt)
  ) return undefined;
  return {
    claimId: run.executionClaimId,
    ownerId: run.executionClaimedBy,
    claimedAt,
    heartbeatAt,
    expiresAt,
    attemptNumber: run.executionAttemptNumber ?? 1,
    staleRecoveryCount: run.executionStaleRecoveryCount ?? 0,
  };
}

async function activeDefinitionClaimCount(
  ctx: MutationCtx,
  definitionId: Id<"automationDefinitions">,
  now: number,
  excludingRunId: Id<"workflowRuns">,
) {
  const evaluations = await ctx.db.query("automationEvaluations")
    .withIndex("by_definition", (q) => q.eq("automationDefinitionId", definitionId))
    .collect();
  const workOrderIds = Array.from(new Set(
    evaluations
      .map((item) => item.workOrderId)
      .filter((id): id is Id<"workOrders"> => id !== undefined),
  ));
  const workOrders = await Promise.all(workOrderIds.map((id) => ctx.db.get(id)));
  const runs = await Promise.all(workOrders
    .map((workOrder) => workOrder?.currentExecutionRunId)
    .filter((id): id is Id<"workflowRuns"> => id !== undefined)
    .map((id) => ctx.db.get(id)));
  return runs.filter((candidate) =>
    candidate
    && candidate._id !== excludingRunId
    && (candidate.executionLeaseExpiresAt ?? 0) > now
    && ["PENDING", "RUNNING"].includes(candidate.status)
  ).length;
}

async function recordDecision(ctx: MutationCtx, input: {
  definition: Doc<"automationDefinitions">;
  type: "EXECUTION_STARTED" | "EXECUTION_COMPLETED" | "EXECUTION_FAILED" | "SUSPENDED" | "UPDATED";
  actorId: string;
  reason: string;
  previousState?: string;
  newState?: string;
  causationId?: string;
  metadata?: unknown;
}) {
  await ctx.db.insert("automationDecisions", {
    projectId: input.definition.projectId,
    automationDefinitionId: input.definition._id,
    decisionType: input.type,
    actorId: input.actorId,
    actorIdentitySource: AUTOMATION_ACTOR_IDENTITY_SOURCE,
    reason: input.reason,
    policyVersion: "read-only-execution-v1",
    definitionVersion: input.definition.definitionVersion,
    decidedAt: Date.now(),
    entityType: "WORKFLOW_RUN",
    entityId: input.causationId,
    previousState: input.previousState,
    newState: input.newState,
    correlationId: input.definition.correlationId,
    causationId: input.causationId,
    metadata: input.metadata,
  });
}

async function quarantine(ctx: MutationCtx, input: {
  workOrder: Doc<"workOrders">;
  definition: Doc<"automationDefinitions">;
  run: Doc<"workflowRuns">;
  evaluation: Doc<"automationEvaluations"> | null;
  reason: string;
  actorId: string;
  runId: string;
  metadata?: unknown;
  spentUsd?: number;
}) {
  const now = Date.now();
  await ctx.db.patch(input.run._id, {
    status: "FAILED",
    executionClaimId: undefined,
    executionClaimedBy: undefined,
    executionClaimedAt: undefined,
    executionLeaseExpiresAt: undefined,
    executionHeartbeatAt: undefined,
    executionPhase: "TERMINAL",
    checkpointAt: now,
    checkpointSummary: `Read-only execution quarantined: ${input.reason}`,
    failureReason: input.reason,
    completedAt: now,
    ...(input.spentUsd !== undefined ? { spentUsd: input.spentUsd } : {}),
  });
  await ctx.db.patch(input.workOrder._id, {
    state: "BLOCKED",
    currentExecutionRunId: undefined,
    blockingIssue: input.reason,
    requiredHumanAction: "Review the quarantine evidence before any reactivation.",
    updatedAt: now,
  });
  await ctx.db.patch(input.definition._id, {
    status: "SUSPENDED",
    reliabilityState: "SUSPENDED",
    health: "DEGRADED",
    pauseReason: input.reason,
    pausedBy: input.actorId,
    pausedAt: now,
    nextRunAt: undefined,
    lastResult: "QUARANTINED",
    updatedAt: now,
  });
  if (input.evaluation) {
    await ctx.db.patch(input.evaluation._id, {
      status: "FAILED",
      reason: input.reason,
      checks: { ...(input.evaluation.checks ?? {}), quarantine: input.metadata ?? {} },
      updatedAt: now,
    });
  }
  await recordDecision(ctx, {
    definition: input.definition,
    type: "SUSPENDED",
    actorId: input.actorId,
    reason: input.reason,
    previousState: input.definition.status,
    newState: "SUSPENDED",
    causationId: input.runId,
    metadata: input.metadata,
  });
}

export const claim = mutation({
  args: {
    workOrderId: v.id("workOrders"),
    claimId: v.string(),
    ownerId: v.string(),
    leaseDurationMs: v.number(),
    estimatedCostUsd: v.optional(v.number()),
    retryOfClaimId: v.optional(v.string()),
    retryReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { workOrder, definition, run, evaluation, bindingDigest } = await executionContext(ctx, args.workOrderId);
    const now = Date.now();
    const [activeClaimCount, operatorControl] = await Promise.all([
      activeDefinitionClaimCount(ctx, definition._id, now, run._id),
      getEffectiveOperatorControl(ctx.db, definition.projectId),
    ]);
    if (run.executionBindingDigest && run.executionBindingDigest !== bindingDigest) {
      await quarantine(ctx, {
        workOrder,
        definition,
        run,
        evaluation,
        reason: "Immutable Automation execution binding changed before claim",
        actorId: args.ownerId,
        runId: String(run._id),
        metadata: { expected: run.executionBindingDigest, observed: bindingDigest },
      });
      return { claimed: false as const, reason: "execution-binding-mismatch", quarantined: true as const };
    }
    const decision = evaluateReadOnlyExecutionClaim({
      definitionStatus: definition.status,
      operatorMode: operatorControl.mode,
      definitionApproved: definition.reviewStatus === "APPROVED",
      definitionValidated: definition.validationStatus === "PASSED",
      isMutating: definition.isMutating,
      runStatus: run.status,
      cancellationRequested: Boolean(run.cancellationRequestedAt),
      claimId: args.claimId,
      ownerId: args.ownerId,
      leaseDurationMs: args.leaseDurationMs,
      maxDurationSeconds: definition.maxDurationSeconds,
      now,
      existingLease: leaseFromRun(run),
      currentAttemptNumber: run.executionAttemptNumber ?? 0,
      staleRecoveryCount: run.executionStaleRecoveryCount ?? 0,
      maxRetries: definition.maxRetries,
      activeClaimCount,
      concurrencyLimit: definition.concurrencyLimit,
      spentCostUsd: run.spentUsd ?? 0,
      estimatedCostUsd: args.estimatedCostUsd ?? 0,
      maxCostUsd: definition.maxCostUsd,
      retryOfClaimId: args.retryOfClaimId,
      retryReason: args.retryReason,
    });
    if (!decision.ok) {
      if ("quarantine" in decision && decision.quarantine) {
        await quarantine(ctx, {
          workOrder,
          definition,
          run,
          evaluation,
          reason: `Read-only execution quarantined (${decision.reason})`,
          actorId: args.ownerId,
          runId: String(run._id),
          metadata: decision,
        });
      }
      return {
        claimed: false as const,
        reason: decision.reason,
        quarantined: "quarantine" in decision ? decision.quarantine : false,
      };
    }
    await ctx.db.patch(run._id, {
      status: "RUNNING",
      executionClaimId: decision.lease.claimId,
      executionClaimedBy: decision.lease.ownerId,
      executionClaimedAt: decision.lease.claimedAt,
      executionHeartbeatAt: decision.lease.heartbeatAt,
      executionLeaseExpiresAt: decision.lease.expiresAt,
      executionAttemptNumber: decision.lease.attemptNumber,
      executionStaleRecoveryCount: decision.lease.staleRecoveryCount,
      executionRetryOfClaimId: args.retryOfClaimId,
      executionRetryReason: args.retryReason,
      executionBindingDigest: bindingDigest,
      executionPhase: "CLAIMED",
      checkpointAt: now,
      checkpointSummary: decision.reclaimed
        ? `Recovered stale read-only claim ${args.retryOfClaimId ?? "without changing attempt"}`
        : `Claimed read-only attempt ${decision.lease.attemptNumber}`,
    });
    if (evaluation) {
      await ctx.db.patch(evaluation._id, {
        status: "DISPATCHED",
        reason: decision.reclaimed ? "Expired execution claim recovered" : "Read-only execution claimed",
        checks: {
          ...(evaluation.checks ?? {}),
          operationalControl: {
            claimId: decision.lease.claimId,
            attemptNumber: decision.lease.attemptNumber,
            staleRecoveryCount: decision.lease.staleRecoveryCount,
            bindingDigest,
            budget: { spentUsd: run.spentUsd ?? 0, maxCostUsd: definition.maxCostUsd },
            concurrency: { activeClaimCount, limit: definition.concurrencyLimit },
            operatorControl,
          },
        },
        updatedAt: now,
      });
    }
    await recordDecision(ctx, {
      definition,
      type: "EXECUTION_STARTED",
      actorId: args.ownerId,
      reason: decision.reclaimed ? "Recovered expired read-only execution claim" : "Claimed read-only execution",
      previousState: run.status,
      newState: "RUNNING",
      causationId: String(run._id),
      metadata: {
        claimId: decision.lease.claimId,
        attemptNumber: decision.lease.attemptNumber,
        reclaimed: decision.reclaimed,
        bindingDigest,
      },
    });
    return {
      claimed: true as const,
      reclaimed: decision.reclaimed,
      workflowRunId: run._id,
      runId: run.runId,
      lease: decision.lease,
      bindingDigest,
      timeoutMs: decision.timeoutMs,
      maxRetries: definition.maxRetries,
      maxCostUsd: definition.maxCostUsd,
      operatorControl,
    };
  },
});

export const renew = mutation({
  args: {
    workOrderId: v.id("workOrders"),
    claimId: v.string(),
    ownerId: v.string(),
    leaseDurationMs: v.number(),
  },
  handler: async (ctx, args) => {
    const { definition, run, bindingDigest } = await executionContext(ctx, args.workOrderId);
    if (run.status !== "RUNNING") return { renewed: false as const, reason: "run-not-running" };
    if (run.executionBindingDigest !== bindingDigest) {
      return { renewed: false as const, reason: "execution-binding-mismatch" };
    }
    if (run.cancellationRequestedAt) {
      return { renewed: false as const, reason: "cancellation-requested" };
    }
    const operatorControl = await getEffectiveOperatorControl(ctx.db, definition.projectId);
    if (!["NORMAL", "DRAINING"].includes(operatorControl.mode)) {
      return { renewed: false as const, reason: `operator-mode-${operatorControl.mode.toLowerCase()}` };
    }
    const result = renewReadOnlyExecutionLease({
      lease: leaseFromRun(run),
      claimId: args.claimId,
      ownerId: args.ownerId,
      leaseDurationMs: args.leaseDurationMs,
      now: Date.now(),
    });
    if (!result.ok) return { renewed: false as const, reason: result.reason };
    await ctx.db.patch(run._id, {
      executionHeartbeatAt: result.lease.heartbeatAt,
      executionLeaseExpiresAt: result.lease.expiresAt,
      checkpointAt: result.lease.heartbeatAt,
      checkpointSummary: `Read-only execution heartbeat for attempt ${result.lease.attemptNumber}`,
    });
    return { renewed: true as const, lease: result.lease };
  },
});

export const requestCancellation = mutation({
  args: {
    workOrderId: v.id("workOrders"),
    actorId: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.reason.trim().length < 5) throw new Error("A cancellation reason is required");
    const { workOrder, definition, run, evaluation } = await executionContext(ctx, args.workOrderId);
    const cancellationAction = readOnlyCancellationAction(run.status);
    if (cancellationAction === "REJECT_TERMINAL_RUN") {
      return { requested: false as const, reason: "run-not-active" };
    }
    const now = Date.now();
    const reason = args.reason.trim().slice(0, 500);
    if (cancellationAction === "CANCEL_IMMEDIATELY") {
      await ctx.db.patch(run._id, {
        status: "CANCELED",
        cancellationRequestedAt: now,
        cancellationRequestedBy: args.actorId,
        executionPhase: "TERMINAL",
        checkpointAt: now,
        checkpointSummary: `Canceled before claim: ${reason}`,
        completedAt: now,
      });
      await ctx.db.patch(workOrder._id, {
        state: "CANCELED",
        currentExecutionRunId: undefined,
        updatedAt: now,
      });
      if (evaluation) {
        await ctx.db.patch(evaluation._id, {
          status: "FAILED",
          reason: "Canceled before an execution claim was acquired",
          checks: { ...(evaluation.checks ?? {}), cancellation: { actorId: args.actorId, reason } },
          updatedAt: now,
        });
      }
      await recordDecision(ctx, {
        definition,
        type: "UPDATED",
        actorId: args.actorId,
        reason: `Canceled pending read-only execution: ${reason}`,
        previousState: "PENDING",
        newState: "CANCELED",
        causationId: String(run._id),
      });
      return {
        requested: true as const,
        completed: true as const,
        workflowRunId: run._id,
        runId: run.runId,
        activeLease: false as const,
      };
    }
    await ctx.db.patch(run._id, {
      cancellationRequestedAt: now,
      cancellationRequestedBy: args.actorId,
      checkpointAt: now,
      checkpointSummary: `Cancellation requested: ${reason}`,
    });
    await recordDecision(ctx, {
      definition,
      type: "UPDATED",
      actorId: args.actorId,
      reason: `Requested cancellation of running read-only execution: ${reason}`,
      previousState: "RUNNING",
      newState: "CANCELLATION_REQUESTED",
      causationId: String(run._id),
    });
    return {
      requested: true as const,
      completed: false as const,
      workflowRunId: run._id,
      runId: run.runId,
      claimId: run.executionClaimId,
      claimedBy: run.executionClaimedBy,
      activeLease: (run.executionLeaseExpiresAt ?? 0) > now,
    };
  },
});

export const finish = mutation({
  args: {
    workOrderId: v.id("workOrders"),
    claimId: v.string(),
    ownerId: v.string(),
    status: executionStatus,
    result: v.any(),
    costUsd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { workOrder, definition, run, evaluation, bindingDigest } = await executionContext(ctx, args.workOrderId);
    const now = Date.now();
    if (run.executionBindingDigest !== bindingDigest) {
      await quarantine(ctx, {
        workOrder,
        definition,
        run,
        evaluation,
        reason: "Immutable Automation execution binding changed before terminal evidence",
        actorId: args.ownerId,
        runId: String(run._id),
        metadata: { expected: run.executionBindingDigest, observed: bindingDigest },
      });
      return {
        disposition: "QUARANTINE" as const,
        retryAllowed: false as const,
        terminalStatus: "FAILED" as const,
        attemptNumber: run.executionAttemptNumber ?? 0,
      };
    }
    const lease = leaseFromRun(run);
    if (!activeReadOnlyExecutionLeaseMatches({
      lease,
      claimId: args.claimId,
      ownerId: args.ownerId,
      now,
    })) throw new Error("Execution result requires the active matching read-only claim");
    const costUsd = args.costUsd ?? 0;
    if (!Number.isFinite(costUsd) || costUsd < 0) throw new Error("Execution cost must be a non-negative number");
    const spentUsd = (run.spentUsd ?? 0) + costUsd;
    let disposition = readOnlyExecutionDisposition({
      executionStatus: args.status,
      attemptNumber: lease!.attemptNumber,
      maxRetries: definition.maxRetries,
      cancellationRequested: Boolean(run.cancellationRequestedAt),
    });
    if (spentUsd > definition.maxCostUsd) disposition = "QUARANTINE";

    const clearedClaim = {
      executionClaimId: undefined,
      executionClaimedBy: undefined,
      executionClaimedAt: undefined,
      executionLeaseExpiresAt: undefined,
      executionHeartbeatAt: undefined,
      spentUsd,
      checkpointAt: now,
    };
    if (disposition === "RETRY") {
      await ctx.db.patch(run._id, {
        ...clearedClaim,
        status: "PENDING",
        executionPhase: undefined,
        checkpointSummary: `Attempt ${lease!.attemptNumber} ${args.status}; bounded reasoned retry is available`,
      });
      if (evaluation) await ctx.db.patch(evaluation._id, {
        status: "DISPATCHED",
        reason: `Attempt ${lease!.attemptNumber} ${args.status}; bounded retry pending`,
        checks: { ...(evaluation.checks ?? {}), lastExecution: args.result, disposition },
        updatedAt: now,
      });
      await recordDecision(ctx, {
        definition,
        type: "EXECUTION_FAILED",
        actorId: args.ownerId,
        reason: `Read-only attempt ${lease!.attemptNumber} ${args.status}; retry remains bounded`,
        previousState: "RUNNING",
        newState: "RETRY_PENDING",
        causationId: String(run._id),
        metadata: { claimId: args.claimId, disposition, result: args.result },
      });
      return {
        disposition,
        retryAllowed: true as const,
        retryOfClaimId: args.claimId,
        attemptNumber: lease!.attemptNumber,
      };
    }

    if (disposition === "QUARANTINE") {
      await quarantine(ctx, {
        workOrder,
        definition,
        run,
        evaluation,
        reason: spentUsd > definition.maxCostUsd
          ? "Read-only execution exceeded its frozen budget"
          : "Read-only execution requires quarantine",
        actorId: args.ownerId,
        runId: String(run._id),
        metadata: { disposition, result: args.result, spentUsd, maxCostUsd: definition.maxCostUsd },
        spentUsd,
      });
    } else {
      const terminal = readOnlyTerminalProjection(disposition);
      await ctx.db.patch(run._id, {
        ...clearedClaim,
        status: terminal.runStatus,
        executionPhase: "TERMINAL",
        checkpointSummary: `Read-only execution disposition: ${disposition}`,
        failureReason: terminal.failureReason,
        completedAt: now,
      });
      await ctx.db.patch(workOrder._id, {
        state: terminal.workOrderState,
        currentExecutionRunId: undefined,
        blockingIssue: terminal.failureReason,
        requiredHumanAction: terminal.requiredHumanAction,
        updatedAt: now,
      });
    }
    if (disposition !== "QUARANTINE" && evaluation) {
      await ctx.db.patch(evaluation._id, {
        status: disposition === "AWAITING_VERIFICATION" ? "AWAITING_VERIFICATION" : "FAILED",
        reason: disposition === "AWAITING_VERIFICATION"
          ? "Adapter completed; independent verification required"
          : `Adapter finished with ${args.status}`,
        checks: { ...(evaluation.checks ?? {}), lastExecution: args.result, disposition },
        updatedAt: now,
      });
      await ctx.db.patch(definition._id, {
        lastResult: disposition,
        health: disposition === "AWAITING_VERIFICATION" ? "ATTENTION" : "DEGRADED",
        updatedAt: now,
      });
    }
    await recordDecision(ctx, {
      definition,
      type: disposition === "AWAITING_VERIFICATION" ? "EXECUTION_COMPLETED" : "EXECUTION_FAILED",
      actorId: args.ownerId,
      reason: disposition === "AWAITING_VERIFICATION"
        ? "Read-only execution completed; independent verification is required"
        : `Read-only execution finished with ${disposition}`,
      previousState: "RUNNING",
      newState: disposition,
      causationId: String(run._id),
      metadata: { claimId: args.claimId, disposition, result: args.result },
    });
    return {
      disposition,
      retryAllowed: false as const,
      terminalStatus: disposition === "AWAITING_VERIFICATION"
        ? "COMPLETED" as const
        : disposition === "CANCELED"
          ? "CANCELED" as const
          : "FAILED" as const,
      attemptNumber: lease!.attemptNumber,
    };
  },
});
