/**
 * Approvals — Convex Functions
 */

import { v } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { logTaskEvent } from "./lib/taskEvents";
import { appendChangeRecord, appendOpEvent } from "./lib/armAudit";
import { resolveAgentRef } from "./lib/agentResolver";
import { COMPANY_PERMISSIONS } from "./lib/companyAccess";
import {
  authorizedDeliveryActor,
  requireAuthorizedDeliveryScope,
} from "./lib/deliveryAuthorization";
import { runAuditedHumanMutation } from "./lib/humanActionAudit";

const approvalStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("ESCALATED"),
  v.literal("APPROVED"),
  v.literal("DENIED"),
  v.literal("EXPIRED"),
  v.literal("CANCELED")
);

function sortByCreationDesc<T extends { _creationTime: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b._creationTime - a._creationTime);
}

async function queryPendingLike(
  ctx: any,
  args: { projectId?: string; limit: number }
) {
  if (args.projectId) {
    const [pending, escalated] = await Promise.all([
      ctx.db
        .query("approvals")
        .withIndex("by_project_status", (q: any) => q.eq("projectId", args.projectId).eq("status", "PENDING"))
        .collect(),
      ctx.db
        .query("approvals")
        .withIndex("by_project_status", (q: any) => q.eq("projectId", args.projectId).eq("status", "ESCALATED"))
        .collect(),
    ]);

    return sortByCreationDesc([...pending, ...escalated]).slice(0, args.limit);
  }

  const [pending, escalated] = await Promise.all([
    ctx.db
      .query("approvals")
      .withIndex("by_status", (q: any) => q.eq("status", "PENDING"))
      .collect(),
    ctx.db
      .query("approvals")
      .withIndex("by_status", (q: any) => q.eq("status", "ESCALATED"))
      .collect(),
  ]);

  return sortByCreationDesc([...pending, ...escalated]).slice(0, args.limit);
}

async function approvalProjectId(ctx: any, approval: any) {
  if (approval.projectId) return approval.projectId;
  if (approval.taskId) {
    const task = await ctx.db.get(approval.taskId);
    if (task?.projectId) return task.projectId;
  }
  const requestor = await ctx.db.get(approval.requestorAgentId);
  return requestor?.projectId;
}

async function requireApprovalAccess(
  ctx: any,
  approval: any,
  permission?: (typeof COMPANY_PERMISSIONS)[keyof typeof COMPANY_PERMISSIONS],
) {
  const projectId = await approvalProjectId(ctx, approval);
  if (!projectId) throw new Error("Approval is not assigned to a workspace.");
  const access = await requireAuthorizedDeliveryScope(ctx, projectId, permission);
  return { projectId, access };
}

// ============================================================================
// QUERIES
// ============================================================================

export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuthorizedDeliveryScope(ctx, args.projectId);
    if (args.projectId) {
      return await ctx.db
        .query("approvals")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .order("desc")
        .take(args.limit ?? 100);
    }
    return await ctx.db
      .query("approvals")
      .order("desc")
      .take(args.limit ?? 100);
  },
});

export const listPending = query({
  args: {
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuthorizedDeliveryScope(ctx, args.projectId);
    return await queryPendingLike(ctx, {
      projectId: args.projectId,
      limit: args.limit ?? 50,
    });
  },
});

/**
 * List approvals by status for Approvals Center tabs.
 */
export const listByStatus = query({
  args: {
    status: approvalStatusValidator,
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    await requireAuthorizedDeliveryScope(ctx, args.projectId);

    if (args.projectId) {
      return await ctx.db
        .query("approvals")
        .withIndex("by_project_status", (q) =>
          q.eq("projectId", args.projectId).eq("status", args.status)
        )
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("approvals")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("desc")
      .take(limit);
  },
});

export const listByTask = query({
  args: {
    taskId: v.id("tasks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return [];
    await requireAuthorizedDeliveryScope(ctx, task.projectId);
    return await ctx.db
      .query("approvals")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const getInternal = internalQuery({
  args: { approvalId: v.id("approvals") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.approvalId);
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

const requestArgs = {
  projectId: v.optional(v.id("projects")),
  taskId: v.optional(v.id("tasks")),
  toolCallId: v.optional(v.id("toolCalls")),
  requestorAgentId: v.id("agents"),
  actionType: v.string(),
  actionSummary: v.string(),
  riskLevel: v.string(),
  actionPayload: v.optional(v.any()),
  estimatedCost: v.optional(v.number()),
  rollbackPlan: v.optional(v.string()),
  justification: v.string(),
  expiresInMinutes: v.optional(v.number()),
  idempotencyKey: v.optional(v.string()),
};

export const requestInternal = internalMutation({
  args: requestArgs,
  handler: async (ctx, args) => {
    // Get projectId from task if not provided
    let projectId = args.projectId;
    if (!projectId && args.taskId) {
      const task = await ctx.db.get(args.taskId);
      projectId = task?.projectId;
    }

    const requestor = await ctx.db.get(args.requestorAgentId);
    if (!projectId) projectId = requestor?.projectId;
    if (!projectId) throw new Error("Approval requests require a workspace.");
    if (requestor?.projectId && requestor.projectId !== projectId) {
      throw new Error("Approval requestor does not belong to the selected workspace.");
    }
    const access = await requireAuthorizedDeliveryScope(
      ctx,
      projectId,
      COMPANY_PERMISSIONS.UPDATE_DELIVERY,
    );
    const actor = authorizedDeliveryActor(access);

    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query("approvals")
        .filter((q) => q.eq(q.field("idempotencyKey"), args.idempotencyKey))
        .first();
      if (existing?.projectId === projectId) {
        return { approval: existing, created: false };
      }
    }

    const dualControlRequired = args.riskLevel.toUpperCase() === "RED";
    const expiresAt = Date.now() + (args.expiresInMinutes ?? 60) * 60 * 1000;
    const requestorRef = await resolveAgentRef(
      { db: ctx.db as any },
      { agentId: args.requestorAgentId, createIfMissing: true }
    );
    const requestorInstance = requestorRef?.instanceId
      ? await ctx.db.get(requestorRef.instanceId)
      : null;
    const effectiveTenantId = access?.project.tenantId ?? requestor?.tenantId ?? requestorInstance?.tenantId;

    // Auto-approve LOW risk tasks (no human approval needed)
    const isLowRisk = args.riskLevel.toUpperCase() === "LOW" || args.riskLevel.toUpperCase() === "GREEN";
    const shouldAutoApprove = isLowRisk && !dualControlRequired;

    const approvalId = await ctx.db.insert("approvals", {
      projectId,
      tenantId: effectiveTenantId,
      idempotencyKey: args.idempotencyKey,
      taskId: args.taskId,
      toolCallId: args.toolCallId,
      requestorAgentId: args.requestorAgentId,
      actionType: args.actionType,
      actionSummary: args.actionSummary,
      riskLevel: args.riskLevel as any,
      actionPayload: args.actionPayload,
      estimatedCost: args.estimatedCost,
      rollbackPlan: args.rollbackPlan,
      justification: args.justification,
      status: shouldAutoApprove ? "APPROVED" : "PENDING",
      decidedAt: shouldAutoApprove ? Date.now() : undefined,
      decidedByUserId: shouldAutoApprove ? actor.actorId : undefined,
      decisionReason: shouldAutoApprove ? "Auto-approved (LOW risk)" : undefined,
      expiresAt,
      requiredDecisionCount: dualControlRequired ? 2 : 1,
      decisionCount: shouldAutoApprove ? 1 : 0,
      escalationLevel: 0,
    });
    await ctx.db.insert("approvalRecords", {
      tenantId: effectiveTenantId,
      projectId,
      instanceId: requestorRef?.instanceId,
      versionId: requestorRef?.versionId,
      legacyApprovalId: approvalId,
      actionType: args.actionType,
      riskLevel: args.riskLevel as any,
      rollbackPlan: args.rollbackPlan,
      justification: args.justification,
      escalationLevel: 0,
      status: shouldAutoApprove ? "APPROVED" : "PENDING",
      requestedBy: actor.operatorId,
      requestedAt: Date.now(),
      decidedBy: shouldAutoApprove ? actor.operatorId : undefined,
      decidedAt: shouldAutoApprove ? Date.now() : undefined,
      decisionReason: shouldAutoApprove ? "Auto-approved (LOW risk)" : undefined,
    });
    const changeRecordId = await appendChangeRecord(ctx.db as any, {
      tenantId: effectiveTenantId,
      projectId,
      instanceId: requestorRef?.instanceId,
      versionId: requestorRef?.versionId,
      legacyAgentId: args.requestorAgentId,
      operatorId: actor.operatorId,
      type: "APPROVAL_REQUESTED",
      summary: `Approval requested: ${args.actionSummary}`,
      payload: {
        approvalId,
        actionType: args.actionType,
        riskLevel: args.riskLevel,
      },
      relatedTable: "approvals",
      relatedId: approvalId,
    });
    await appendOpEvent(ctx.db as any, {
      tenantId: effectiveTenantId,
      projectId,
      instanceId: requestorRef?.instanceId,
      versionId: requestorRef?.versionId,
      taskId: args.taskId,
      type: "DECISION_MADE",
      changeRecordId,
      payload: {
        stage: "REQUESTED",
        approvalId,
        actionType: args.actionType,
      },
    });

    // Log activity
    const agent = requestor;
    await ctx.db.insert("activities", {
      projectId,
      actorType: "HUMAN",
      actorId: actor.actorId,
      action: "APPROVAL_REQUESTED",
      description: `${agent?.name || "Agent"} requested approval for: ${args.actionSummary}`,
      targetType: "APPROVAL",
      targetId: approvalId,
      taskId: args.taskId,
      agentId: args.requestorAgentId,
      metadata: {
        riskLevel: args.riskLevel,
        dualControlRequired,
      },
    });

    if (args.taskId) {
      await logTaskEvent(ctx, {
        projectId,
        taskId: args.taskId,
        eventType: "APPROVAL_REQUESTED",
        actorType: "HUMAN",
        actorId: actor.actorId,
        relatedId: approvalId,
        metadata: {
          actionType: args.actionType,
          actionSummary: args.actionSummary,
          riskLevel: args.riskLevel,
          dualControlRequired,
        },
      });
    }

    return { approval: await ctx.db.get(approvalId), created: true };
  },
});

export const request = action({
  args: requestArgs,
  handler: async (ctx, args): Promise<any> =>
    await runAuditedHumanMutation(
      ctx,
      internal.approvals.requestInternal,
      args,
      "approvals.request",
      { projectId: args.projectId, taskId: args.taskId, agentId: args.requestorAgentId },
    ),
});

const approveArgs = {
  approvalId: v.id("approvals"),
  projectId: v.optional(v.id("projects")),
  reason: v.optional(v.string()),
};

export const approveInternal = internalMutation({
  args: approveArgs,
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) {
      return { success: false, error: "Approval not found" };
    }
    if (args.projectId && approval.projectId !== args.projectId) {
      return { success: false, error: "Approval does not belong to the selected workspace" };
    }
    const { projectId, access } = await requireApprovalAccess(
      ctx,
      approval,
      COMPANY_PERMISSIONS.APPROVE_DELIVERY,
    );
    if (args.projectId && projectId !== args.projectId) {
      return { success: false, error: "Approval does not belong to the selected workspace" };
    }
    const actor = authorizedDeliveryActor(access);

    if (!["PENDING", "ESCALATED"].includes(approval.status)) {
      return { success: false, error: `Approval already ${approval.status}` };
    }

    const now = Date.now();
    if (now > approval.expiresAt) {
      await ctx.db.patch(args.approvalId, { status: "EXPIRED" });
      if (approval.taskId) {
        await logTaskEvent(ctx, {
          projectId: approval.projectId,
          taskId: approval.taskId,
          eventType: "APPROVAL_EXPIRED",
          actorType: "SYSTEM",
          relatedId: args.approvalId,
          metadata: { reason: "expired_before_decision" },
        });
      }
      return { success: false, error: "Approval has expired" };
    }

    const decider = actor.actorId;

    const requiredDecisionCount = approval.requiredDecisionCount ?? (approval.riskLevel === "RED" ? 2 : 1);

    // Dual-control step for RED actions
    if (requiredDecisionCount > 1) {
      if (!approval.firstDecisionAt) {
        await ctx.db.patch(args.approvalId, {
          firstDecisionByUserId: decider,
          firstDecisionAt: now,
          firstDecisionReason: args.reason,
          decisionCount: 1,
          status: approval.status,
        });

        await ctx.db.insert("activities", {
          projectId,
          actorType: "HUMAN",
          actorId: decider,
          action: "APPROVAL_FIRST_APPROVAL",
          description: `First approval recorded for: ${approval.actionSummary}`,
          targetType: "APPROVAL",
          targetId: args.approvalId,
          taskId: approval.taskId,
          agentId: approval.requestorAgentId,
          metadata: {
            requiredDecisionCount,
          },
        });

        if (approval.taskId) {
          await logTaskEvent(ctx, {
            projectId,
            taskId: approval.taskId,
            eventType: "APPROVAL_ESCALATED",
            actorType: "HUMAN",
            actorId: decider,
            relatedId: args.approvalId,
            metadata: {
              phase: "first_approval",
              requiredDecisionCount,
            },
          });
        }

        const firstDecisionRecordId = await appendChangeRecord(ctx.db as any, {
          tenantId: access?.project.tenantId ?? approval.tenantId,
          projectId,
          operatorId: actor.operatorId,
          legacyAgentId: approval.requestorAgentId,
          type: "APPROVAL_DECIDED",
          summary: `First approval recorded: ${approval.actionSummary}`,
          payload: {
            approvalId: args.approvalId,
            decision: "FIRST_APPROVAL",
            requiredDecisionCount,
          },
          relatedTable: "approvals",
          relatedId: String(args.approvalId),
        });
        await appendOpEvent(ctx.db as any, {
          tenantId: access?.project.tenantId ?? approval.tenantId,
          projectId,
          taskId: approval.taskId,
          type: "DECISION_MADE",
          changeRecordId: firstDecisionRecordId,
          payload: {
            stage: "FIRST_APPROVAL",
            approvalId: args.approvalId,
            requiredDecisionCount,
          },
        });

        return {
          success: true,
          pendingSecondDecision: true,
          approval: await ctx.db.get(args.approvalId),
        };
      }

      if (approval.firstDecisionByUserId === decider) {
        await appendChangeRecord(ctx.db as any, {
          tenantId: access?.project.tenantId ?? approval.tenantId,
          projectId,
          operatorId: actor.operatorId,
          legacyAgentId: approval.requestorAgentId,
          type: "POLICY_DENIED",
          summary: `Dual-control approval denied for ${approval.actionSummary}`,
          payload: {
            approvalId: args.approvalId,
            policy: "distinct-second-approver",
          },
          relatedTable: "approvals",
          relatedId: String(args.approvalId),
        });
        return {
          success: false,
          error: "Dual-control required: a different approver must provide the second decision",
        };
      }
    }

    await ctx.db.patch(args.approvalId, {
      status: "APPROVED",
      decidedByAgentId: undefined,
      decidedByUserId: decider,
      decidedAt: now,
      decisionReason: args.reason,
      decisionCount: requiredDecisionCount > 1 ? 2 : 1,
    });
    const approvalRecord = await ctx.db
      .query("approvalRecords")
      .withIndex("by_legacy_approval", (q) => q.eq("legacyApprovalId", args.approvalId))
      .first();
    if (approvalRecord) {
      await ctx.db.patch(approvalRecord._id, {
        status: "APPROVED",
        decidedBy: actor.operatorId,
        decidedAt: now,
        decisionReason: args.reason,
      });
    }

    // Log activity
    await ctx.db.insert("activities", {
      projectId,
      actorType: "HUMAN",
      actorId: decider,
      action: "APPROVAL_APPROVED",
      description: `Approval granted: ${approval.actionSummary}`,
      targetType: "APPROVAL",
      targetId: args.approvalId,
      taskId: approval.taskId,
      agentId: approval.requestorAgentId,
      metadata: {
        requiredDecisionCount,
      },
    });

    if (approval.taskId) {
      await logTaskEvent(ctx, {
        projectId,
        taskId: approval.taskId,
        eventType: "APPROVAL_APPROVED",
        actorType: "HUMAN",
        actorId: decider,
        relatedId: args.approvalId,
        metadata: {
          requiredDecisionCount,
          reason: args.reason,
        },
      });
    }
    const requestorRef = await resolveAgentRef(
      { db: ctx.db as any },
      { agentId: approval.requestorAgentId, createIfMissing: true }
    );
    const requestorInstance = requestorRef?.instanceId
      ? await ctx.db.get(requestorRef.instanceId)
      : null;
    const effectiveTenantId = access?.project.tenantId ?? approval.tenantId ?? requestorInstance?.tenantId;
    const changeRecordId = await appendChangeRecord(ctx.db as any, {
      tenantId: effectiveTenantId,
      projectId,
      instanceId: requestorRef?.instanceId,
      versionId: requestorRef?.versionId,
      legacyAgentId: approval.requestorAgentId,
      operatorId: actor.operatorId,
      type: "APPROVAL_DECIDED",
      summary: `Approval approved: ${approval.actionSummary}`,
      payload: {
        approvalId: args.approvalId,
        decision: "APPROVED",
        decidedByUserId: decider,
      },
      relatedTable: "approvals",
      relatedId: args.approvalId,
    });
    await appendOpEvent(ctx.db as any, {
      tenantId: effectiveTenantId,
      projectId,
      instanceId: requestorRef?.instanceId,
      versionId: requestorRef?.versionId,
      taskId: approval.taskId ?? undefined,
      type: "DECISION_MADE",
      changeRecordId,
      payload: {
        stage: "APPROVED",
        approvalId: args.approvalId,
      },
    });

    return { success: true, approval: await ctx.db.get(args.approvalId) };
  },
});

export const approve = action({
  args: approveArgs,
  handler: async (ctx, args): Promise<any> =>
    await runAuditedHumanMutation(
      ctx,
      internal.approvals.approveInternal,
      args,
      "approvals.approve",
      { projectId: args.projectId, approvalId: args.approvalId },
    ),
});

const denyArgs = {
  approvalId: v.id("approvals"),
  projectId: v.optional(v.id("projects")),
  reason: v.string(),
};

export const denyInternal = internalMutation({
  args: denyArgs,
  handler: async (
    ctx,
    args
  ): Promise<{
    success: boolean;
    error?: string;
    approval?: Doc<"approvals"> | null;
    taskTransition?: { success: boolean; errors?: Array<{ message: string }> };
  }> => {
    const reason = args.reason.trim();
    if (!reason) {
      return { success: false, error: "Rejection requires a reason" };
    }
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) {
      return { success: false, error: "Approval not found" };
    }
    const { projectId, access } = await requireApprovalAccess(
      ctx,
      approval,
      COMPANY_PERMISSIONS.APPROVE_DELIVERY,
    );
    if (args.projectId && projectId !== args.projectId) {
      return { success: false, error: "Approval does not belong to the selected workspace" };
    }
    const actor = authorizedDeliveryActor(access);

    if (!["PENDING", "ESCALATED"].includes(approval.status)) {
      return { success: false, error: `Approval already ${approval.status}` };
    }

    await ctx.db.patch(args.approvalId, {
      status: "DENIED",
      decidedByAgentId: undefined,
      decidedByUserId: actor.actorId,
      decidedAt: Date.now(),
      decisionReason: reason,
      decisionCount: (approval.decisionCount ?? 0) + 1,
    });
    const approvalRecord = await ctx.db
      .query("approvalRecords")
      .withIndex("by_legacy_approval", (q) => q.eq("legacyApprovalId", args.approvalId))
      .first();
    if (approvalRecord) {
      await ctx.db.patch(approvalRecord._id, {
        status: "DENIED",
        decidedBy: actor.operatorId,
        decidedAt: Date.now(),
        decisionReason: reason,
      });
    }

    // Log activity
    await ctx.db.insert("activities", {
      projectId,
      actorType: "HUMAN",
      actorId: actor.actorId,
      action: "APPROVAL_DENIED",
      description: `Approval denied: ${approval.actionSummary} — ${reason}`,
      targetType: "APPROVAL",
      targetId: args.approvalId,
      taskId: approval.taskId,
      agentId: approval.requestorAgentId,
    });

    if (approval.taskId) {
      await logTaskEvent(ctx, {
        projectId,
        taskId: approval.taskId,
        eventType: "APPROVAL_DENIED",
        actorType: "HUMAN",
        actorId: actor.actorId,
        relatedId: args.approvalId,
        metadata: {
          reason,
        },
      });
    }
    const requestorRef = await resolveAgentRef(
      { db: ctx.db as any },
      { agentId: approval.requestorAgentId, createIfMissing: true }
    );
    const requestorInstance = requestorRef?.instanceId
      ? await ctx.db.get(requestorRef.instanceId)
      : null;
    const effectiveTenantId = access?.project.tenantId ?? approval.tenantId ?? requestorInstance?.tenantId;
    const changeRecordId = await appendChangeRecord(ctx.db as any, {
      tenantId: effectiveTenantId,
      projectId,
      instanceId: requestorRef?.instanceId,
      versionId: requestorRef?.versionId,
      legacyAgentId: approval.requestorAgentId,
      operatorId: actor.operatorId,
      type: "APPROVAL_DECIDED",
      summary: `Approval denied: ${approval.actionSummary}`,
      payload: {
        approvalId: args.approvalId,
        decision: "DENIED",
        reason,
      },
      relatedTable: "approvals",
      relatedId: args.approvalId,
    });
    await appendOpEvent(ctx.db as any, {
      tenantId: effectiveTenantId,
      projectId,
      instanceId: requestorRef?.instanceId,
      versionId: requestorRef?.versionId,
      taskId: approval.taskId ?? undefined,
      type: "DECISION_MADE",
      changeRecordId,
      payload: {
        stage: "DENIED",
        approvalId: args.approvalId,
      },
    });

    let taskTransition: { success: boolean; errors?: Array<{ message: string }> } | undefined;
    if (approval.taskId) {
      const task = await ctx.db.get(approval.taskId);
      if (task?.status === "REVIEW") {
        taskTransition = (await ctx.runMutation(internal.tasks.transitionInternal, {
          taskId: approval.taskId,
          projectId,
          toStatus: "IN_PROGRESS",
          actorType: "HUMAN",
          actorUserId: actor.actorId,
          idempotencyKey: `approval-denied:${args.approvalId}`,
          reason: `Review rejected: ${reason}`,
        })) as { success: boolean; errors?: Array<{ message: string }> };
        if (!taskTransition.success) {
          throw new Error(
            taskTransition.errors?.map((error: { message: string }) => error.message).join(", ") ??
              "Unable to return rejected work to an actionable state"
          );
        }
      }
    }

    return {
      success: true,
      approval: await ctx.db.get(args.approvalId),
      taskTransition,
    };
  },
});

export const deny = action({
  args: denyArgs,
  handler: async (ctx, args): Promise<any> =>
    await runAuditedHumanMutation(
      ctx,
      internal.approvals.denyInternal,
      args,
      "approvals.deny",
      { projectId: args.projectId, approvalId: args.approvalId },
    ),
});

export const expireStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const pendingApprovals = await queryPendingLike(ctx, {
      limit: 10_000,
    });

    let expired = 0;
    for (const approval of pendingApprovals) {
      if (now > approval.expiresAt) {
        await ctx.db.patch(approval._id, { status: "EXPIRED" });
        expired++;

        if (approval.taskId) {
          await logTaskEvent(ctx, {
            projectId: approval.projectId,
            taskId: approval.taskId,
            eventType: "APPROVAL_EXPIRED",
            actorType: "SYSTEM",
            relatedId: approval._id,
            metadata: {
              reason: "stale_expiration_cron",
            },
          });
        }
      }
    }

    return { expired };
  },
});

export const escalateOverdue = internalMutation({
  args: {
    projectId: v.optional(v.id("projects")),
    slaMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const slaMs = (args.slaMinutes ?? 30) * 60 * 1000;

    const pending = args.projectId
      ? await ctx.db
          .query("approvals")
          .withIndex("by_project_status", (q) => q.eq("projectId", args.projectId).eq("status", "PENDING"))
          .collect()
      : await ctx.db
          .query("approvals")
          .withIndex("by_status", (q) => q.eq("status", "PENDING"))
          .collect();

    let escalated = 0;
    for (const approval of pending) {
      const ageMs = now - approval._creationTime;
      if (ageMs < slaMs || now > approval.expiresAt) {
        continue;
      }

      const nextLevel = (approval.escalationLevel ?? 0) + 1;
      await ctx.db.patch(approval._id, {
        status: "ESCALATED",
        escalatedAt: now,
        escalatedBy: "system:approval-sla-cron",
        escalationReason: `Approval open for ${Math.round(ageMs / 60000)} minutes`,
        escalationLevel: nextLevel,
      });

      await ctx.db.insert("activities", {
        projectId: approval.projectId,
        actorType: "SYSTEM",
        actorId: "system:approval-sla-cron",
        action: "APPROVAL_ESCALATED",
        description: `Approval escalated (level ${nextLevel}): ${approval.actionSummary}`,
        targetType: "APPROVAL",
        targetId: approval._id,
        taskId: approval.taskId,
        agentId: approval.requestorAgentId,
        metadata: {
          level: nextLevel,
          ageMinutes: Math.round(ageMs / 60000),
        },
      });

      if (approval.taskId) {
        await logTaskEvent(ctx, {
          projectId: approval.projectId,
          taskId: approval.taskId,
          eventType: "APPROVAL_ESCALATED",
          actorType: "SYSTEM",
          actorId: "system:approval-sla-cron",
          relatedId: approval._id,
          metadata: {
            level: nextLevel,
            ageMinutes: Math.round(ageMs / 60000),
          },
        });
      }

      escalated += 1;
    }

    return { escalated, slaMinutes: args.slaMinutes ?? 30 };
  },
});
