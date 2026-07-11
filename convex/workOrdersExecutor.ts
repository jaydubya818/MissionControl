/**
 * External-executor surface for work orders (Epic 18 — Pi bridge).
 *
 * Authority: Mission Control owns state, verification, and audit. An
 * executor claims READY work, streams execution states, records artifacts
 * and verification evidence — but can never assert DONE. Success maps to
 * AWAITING_VERIFICATION (or DONE only via Mission Control's own
 * verification derivation in lib/workOrderDispatch + lib/workOrders).
 *
 * Everything here is flag-gated behind `executor.pi-bridge` (default off)
 * and idempotency-keyed so replayed bridge events are safe.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { logWorkOrderEvent } from "./workOrders";
import { requireExecutorEnabled } from "./lib/executorGate";
import {
  BRIDGE_EXECUTION_STATES,
  DEFAULT_CLAIM_LEASE_MS,
  leaseExpired,
  mapBridgeState,
  mergeCorrelation,
  type BridgeExecutionState,
} from "./lib/executorContract";
import { dispatchApprovalAllowed } from "./lib/workOrderDispatch";
import { deriveVerificationStatus } from "./lib/workOrders";

const bridgeStateValidator = v.union(
  ...BRIDGE_EXECUTION_STATES.map((s) => v.literal(s))
);

const criterionStatus = v.union(
  v.literal("PENDING"),
  v.literal("PASS"),
  v.literal("FAIL"),
  v.literal("WAIVED")
);

/** Work orders an external executor may claim right now. */
export const listClaimable = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ready = await ctx.db.query("workOrders").collect();
    return ready
      .filter((wo: any) => {
        const claimable =
          wo.state === "READY" ||
          (wo.state === "DISPATCHED" && leaseExpired(now, wo.claimLeaseExpiresAt));
        if (!claimable) return false;
        return dispatchApprovalAllowed({
          riskLevel: wo.riskLevel,
          approvalStatus: wo.approvalStatus,
          requiredApprovals: wo.requiredApprovals,
        });
      })
      .slice(0, args.limit ?? 10)
      .map((wo: any) => ({
        _id: wo._id,
        title: wo.title,
        desiredOutcome: wo.desiredOutcome,
        repository: wo.repository,
        riskLevel: wo.riskLevel,
        priority: wo.priority,
        state: wo.state,
        acceptanceCriteria: wo.acceptanceCriteria,
        constraints: wo.constraints,
        claimAttempt: wo.claimAttempt ?? 0,
      }));
  },
});

/** Claim a work order for external execution (lease-based, idempotent). */
export const claimForExecutor = mutation({
  args: {
    workOrderId: v.id("workOrders"),
    agentId: v.id("agents"),
    executionId: v.string(),
    idempotencyKey: v.string(),
    leaseMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireExecutorEnabled(ctx);

    const replay = await ctx.db
      .query("workOrderEvents")
      .withIndex("by_idempotency", (q: any) =>
        q.eq("idempotencyKey", args.idempotencyKey)
      )
      .first();
    if (replay) {
      const wo = await ctx.db.get(args.workOrderId);
      return { claimed: true, replay: true, state: wo?.state };
    }

    const workOrder: any = await ctx.db.get(args.workOrderId);
    if (!workOrder) throw new Error("WorkOrder not found");

    const now = Date.now();
    const claimable =
      workOrder.state === "READY" ||
      (workOrder.state === "DISPATCHED" &&
        leaseExpired(now, workOrder.claimLeaseExpiresAt));
    if (!claimable) {
      return { claimed: false, reason: `not-claimable:${workOrder.state}` };
    }
    if (
      !dispatchApprovalAllowed({
        riskLevel: workOrder.riskLevel,
        approvalStatus: workOrder.approvalStatus,
        requiredApprovals: workOrder.requiredApprovals,
      })
    ) {
      return { claimed: false, reason: "approval-required" };
    }

    const attempt = (workOrder.claimAttempt ?? 0) + 1;
    await ctx.db.patch(workOrder._id, {
      state: "DISPATCHED",
      claimedByAgentId: args.agentId,
      claimLeaseExpiresAt: now + (args.leaseMs ?? DEFAULT_CLAIM_LEASE_MS),
      claimAttempt: attempt,
      correlation: mergeCorrelation(workOrder.correlation, {
        workOrderId: String(workOrder._id),
        executionId: args.executionId,
      }),
      updatedAt: now,
    });

    await logWorkOrderEvent(ctx, {
      tenantId: workOrder.tenantId,
      projectId: workOrder.projectId,
      workOrderId: workOrder._id,
      eventType: "CLAIMED",
      fromState: workOrder.state,
      toState: "DISPATCHED",
      actorType: "AGENT",
      actorId: String(args.agentId),
      summary: `Claimed by external executor (attempt ${attempt})`,
      idempotencyKey: args.idempotencyKey,
      metadata: { executionId: args.executionId, attempt },
    });

    return { claimed: true, replay: false, attempt, state: "DISPATCHED" };
  },
});

/**
 * Report a bridge execution state. State mapping goes through
 * lib/executorContract — the executor cannot pick the resulting state and
 * cannot produce DONE except via Mission Control's verification rule.
 */
export const reportExecutionEvent = mutation({
  args: {
    workOrderId: v.id("workOrders"),
    agentId: v.id("agents"),
    bridgeState: bridgeStateValidator,
    seq: v.number(),
    bridgeRunId: v.string(),
    idempotencyKey: v.string(),
    summary: v.optional(v.string()),
    hermesSessionId: v.optional(v.string()),
    runId: v.optional(v.string()),
    pullRequestId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireExecutorEnabled(ctx);

    const replay = await ctx.db
      .query("workOrderEvents")
      .withIndex("by_idempotency", (q: any) =>
        q.eq("idempotencyKey", args.idempotencyKey)
      )
      .first();
    if (replay) {
      const wo = await ctx.db.get(args.workOrderId);
      return { applied: true, replay: true, state: wo?.state };
    }

    const workOrder: any = await ctx.db.get(args.workOrderId);
    if (!workOrder) throw new Error("WorkOrder not found");
    if (
      !workOrder.claimedByAgentId ||
      String(workOrder.claimedByAgentId) !== String(args.agentId)
    ) {
      throw new Error("WorkOrder is not claimed by this executor");
    }

    const now = Date.now();
    const mapped = mapBridgeState({
      bridgeState: args.bridgeState as BridgeExecutionState,
      verificationStatus: workOrder.verificationStatus,
      currentState: workOrder.state,
    });

    await ctx.db.patch(workOrder._id, {
      state: mapped.state,
      blockingIssue: mapped.blockingIssue,
      requiredHumanAction: mapped.requiredHumanAction,
      claimLeaseExpiresAt: mapped.terminal
        ? undefined
        : now + DEFAULT_CLAIM_LEASE_MS,
      correlation: mergeCorrelation(workOrder.correlation, {
        bridgeRunId: args.bridgeRunId,
        hermesSessionId: args.hermesSessionId,
        runId: args.runId,
        pullRequestId: args.pullRequestId,
      }),
      updatedAt: now,
    });

    await logWorkOrderEvent(ctx, {
      tenantId: workOrder.tenantId,
      projectId: workOrder.projectId,
      workOrderId: workOrder._id,
      eventType: "EXECUTION_STATE",
      fromState: workOrder.state,
      toState: mapped.state,
      actorType: "AGENT",
      actorId: String(args.agentId),
      summary:
        args.summary ??
        `Bridge state ${args.bridgeState} → ${mapped.state} (seq ${args.seq})`,
      idempotencyKey: args.idempotencyKey,
      metadata: {
        bridgeState: args.bridgeState,
        seq: args.seq,
        bridgeRunId: args.bridgeRunId,
        hermesSessionId: args.hermesSessionId,
      },
    });

    return { applied: true, replay: false, state: mapped.state };
  },
});

/**
 * Record verification evidence for one acceptance criterion. Mission
 * Control recomputes verification status and derives any DONE transition —
 * the executor only supplies evidence.
 */
export const recordVerificationEvidence = mutation({
  args: {
    workOrderId: v.id("workOrders"),
    agentId: v.id("agents"),
    criterionId: v.string(),
    status: criterionStatus,
    evidence: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    await requireExecutorEnabled(ctx);

    const replay = await ctx.db
      .query("workOrderEvents")
      .withIndex("by_idempotency", (q: any) =>
        q.eq("idempotencyKey", args.idempotencyKey)
      )
      .first();
    if (replay) {
      const wo = await ctx.db.get(args.workOrderId);
      return {
        applied: true,
        replay: true,
        state: wo?.state,
        verificationStatus: wo?.verificationStatus,
      };
    }

    const workOrder: any = await ctx.db.get(args.workOrderId);
    if (!workOrder) throw new Error("WorkOrder not found");
    if (
      !workOrder.claimedByAgentId ||
      String(workOrder.claimedByAgentId) !== String(args.agentId)
    ) {
      throw new Error("WorkOrder is not claimed by this executor");
    }

    const criteria = (workOrder.acceptanceCriteria as any[]).map((c) =>
      c.id === args.criterionId ? { ...c, status: args.status } : c
    );
    if (!criteria.some((c) => c.id === args.criterionId)) {
      throw new Error(`Unknown acceptance criterion: ${args.criterionId}`);
    }

    const verificationStatus = deriveVerificationStatus(criteria);
    // Mission Control's verification authority: AWAITING_VERIFICATION only
    // becomes DONE here, from derived criteria — never from executor input.
    const nextState =
      workOrder.state === "AWAITING_VERIFICATION" &&
      (verificationStatus === "PASS" || verificationStatus === "WAIVED")
        ? "DONE"
        : workOrder.state;

    const now = Date.now();
    await ctx.db.patch(workOrder._id, {
      acceptanceCriteria: criteria,
      verificationStatus,
      state: nextState,
      requiredHumanAction: nextState === "DONE" ? undefined : workOrder.requiredHumanAction,
      claimLeaseExpiresAt: nextState === "DONE" ? undefined : workOrder.claimLeaseExpiresAt,
      updatedAt: now,
    });

    await logWorkOrderEvent(ctx, {
      tenantId: workOrder.tenantId,
      projectId: workOrder.projectId,
      workOrderId: workOrder._id,
      eventType: "VERIFICATION_RECORDED",
      fromState: workOrder.state,
      toState: nextState,
      actorType: "AGENT",
      actorId: String(args.agentId),
      summary: `Criterion ${args.criterionId} → ${args.status}; verification ${verificationStatus}`,
      idempotencyKey: args.idempotencyKey,
      metadata: {
        criterionId: args.criterionId,
        status: args.status,
        evidence: args.evidence.slice(0, 2000),
        verificationStatus,
      },
    });

    return { applied: true, replay: false, state: nextState, verificationStatus };
  },
});

/** Record an execution artifact (deduplicated content drop + audit event). */
export const recordExecutorArtifact = mutation({
  args: {
    workOrderId: v.id("workOrders"),
    agentId: v.id("agents"),
    artifactId: v.string(),
    title: v.string(),
    content: v.string(),
    sha256: v.string(),
    contentType: v.optional(v.string()),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    await requireExecutorEnabled(ctx);

    const existingDrop = await ctx.db
      .query("contentDrops")
      .withIndex("by_idempotency", (q: any) =>
        q.eq("idempotencyKey", args.idempotencyKey)
      )
      .first();
    if (existingDrop) {
      return { recorded: true, replay: true, contentDropId: existingDrop._id };
    }

    const workOrder: any = await ctx.db.get(args.workOrderId);
    if (!workOrder) throw new Error("WorkOrder not found");
    if (
      !workOrder.claimedByAgentId ||
      String(workOrder.claimedByAgentId) !== String(args.agentId)
    ) {
      throw new Error("WorkOrder is not claimed by this executor");
    }

    const contentDropId = await ctx.db.insert("contentDrops", {
      projectId: workOrder.projectId,
      agentId: args.agentId,
      title: args.title,
      contentType: (args.contentType ?? "OTHER") as any,
      content: args.content,
      summary: `Executor artifact ${args.artifactId} for work order ${workOrder.title}`,
      status: "SUBMITTED",
      idempotencyKey: args.idempotencyKey,
      metadata: {
        workOrderId: String(workOrder._id),
        artifactId: args.artifactId,
        sha256: args.sha256,
      },
    } as any);

    await logWorkOrderEvent(ctx, {
      tenantId: workOrder.tenantId,
      projectId: workOrder.projectId,
      workOrderId: workOrder._id,
      eventType: "ARTIFACT_RECORDED",
      actorType: "AGENT",
      actorId: String(args.agentId),
      summary: `Artifact ${args.artifactId} recorded (${args.sha256.slice(0, 12)}…)`,
      idempotencyKey: `${args.idempotencyKey}:event`,
      metadata: {
        artifactId: args.artifactId,
        sha256: args.sha256,
        contentDropId: String(contentDropId),
      },
    });

    return { recorded: true, replay: false, contentDropId };
  },
});
