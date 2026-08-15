import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getEffectiveOperatorControl } from "./lib/operatorControls";
import { COMPANY_PERMISSIONS } from "./lib/companyAccess";
import { requireAuthorizedDeliveryScope } from "./lib/deliveryAuthorization";
import {
  effectiveWorkflowExecutionPolicy,
} from "./lib/workflowExecutionControl";

const operatorModeValidator = v.union(
  v.literal("NORMAL"),
  v.literal("PAUSED"),
  v.literal("DRAINING"),
  v.literal("KILLED"),
  v.literal("QUARANTINED")
);

export const getCurrent = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    return await getEffectiveOperatorControl(ctx.db, args.projectId);
  },
});

export const listHistory = query({
  args: {
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    if (args.projectId) {
      return await ctx.db
        .query("operatorControls")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .order("desc")
        .take(limit);
    }

    return await ctx.db.query("operatorControls").order("desc").take(limit);
  },
});

export const setMode = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    mode: operatorModeValidator,
    reason: v.optional(v.string()),
    userId: v.string(),
    dailyBudgetUsd: v.optional(v.number()),
    perRunBudgetUsd: v.optional(v.number()),
    maxConcurrentRuns: v.optional(v.number()),
    leaseDurationMs: v.optional(v.number()),
    staleRecoveryLimit: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    if (args.projectId) {
      await requireAuthorizedDeliveryScope(
        ctx,
        args.projectId,
        COMPANY_PERMISSIONS.MANAGE_WORKSPACES,
      );
    }
    const now = Date.now();
    const current = await getEffectiveOperatorControl(ctx.db, args.projectId);
    const executionPolicy = effectiveWorkflowExecutionPolicy({
      continuousSchedulingEnabled: false,
      dailyBudgetUsd: args.dailyBudgetUsd ?? current.executionPolicy.dailyBudgetUsd,
      perRunBudgetUsd: args.perRunBudgetUsd ?? current.executionPolicy.perRunBudgetUsd,
      maxConcurrentRuns: args.maxConcurrentRuns ?? current.executionPolicy.maxConcurrentRuns,
      leaseDurationMs: args.leaseDurationMs ?? current.executionPolicy.leaseDurationMs,
      staleRecoveryLimit: args.staleRecoveryLimit ?? current.executionPolicy.staleRecoveryLimit,
    });

    const id = await ctx.db.insert("operatorControls", {
      projectId: args.projectId,
      mode: args.mode,
      ...executionPolicy,
      reason: args.reason,
      updatedBy: args.userId,
      updatedAt: now,
      metadata: args.metadata,
    });

    await ctx.db.insert("activities", {
      projectId: args.projectId,
      actorType: "HUMAN",
      actorId: args.userId,
      action: "OPERATOR_MODE_UPDATED",
      description: `Operator mode set to ${args.mode}${args.reason ? ` (${args.reason})` : ""}`,
      targetType: "OPERATOR_CONTROL",
      targetId: id,
      metadata: {
        mode: args.mode,
        reason: args.reason,
      },
    });

    if (args.mode !== "NORMAL") {
      await ctx.db.insert("alerts", {
        projectId: args.projectId,
        severity: ["QUARANTINED", "KILLED"].includes(args.mode) ? "CRITICAL" : "WARNING",
        type: "OPERATOR_CONTROL_MODE",
        title: `Operator mode ${args.mode}`,
        description: args.reason || `System switched to ${args.mode}`,
        status: "OPEN",
        metadata: {
          mode: args.mode,
          changedBy: args.userId,
        },
      });
    }

    if (args.mode === "KILLED" && args.projectId) {
      const canaryOnly = args.metadata?.recoveryCanaryOnly === true;
      if (canaryOnly && process.env.WORKFLOW_RECOVERY_CANARY_ENABLED !== "true") {
        throw new Error("Canary-scoped workspace kill is disabled on this deployment.");
      }
      const runs = await ctx.db
        .query("workflowRuns")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
      for (const run of runs) {
        if (canaryOnly && run.metadata?.recoveryCanary !== true) continue;
        if (["COMPLETED", "FAILED", "CANCELED"].includes(run.status)) continue;
        const hasActiveLease = Boolean(run.lease && run.lease.expiresAt > now);
        await ctx.db.patch(run._id, {
          cancellationRequestedAt: run.cancellationRequestedAt ?? now,
          cancellationRequestedBy: args.userId,
          checkpointAt: now,
          checkpointSummary: `Workspace kill requested: ${args.reason ?? "No reason supplied"}`,
          ...(!hasActiveLease
            ? {
                status: "CANCELED" as const,
                completedAt: now,
                failureReason: args.reason ?? "Workspace execution killed by operator.",
                reservedCostUsd: 0,
                lease: undefined,
              }
            : {}),
        });
      }
    }

    return {
      success: true,
      control: await ctx.db.get(id),
      executionPolicy,
    };
  },
});
