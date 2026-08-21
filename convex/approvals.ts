/**
 * Approvals — Convex Functions
 */

import { v } from "convex/values";
import { workspaceQuery } from "./lib/authedFunctions";
import { mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { logTaskEvent } from "./lib/taskEvents";
import { appendChangeRecord, appendOpEvent } from "./lib/armAudit";
import { resolveAgentRef } from "./lib/agentResolver";
import {
  COMPANY_PERMISSIONS,
  requireWorkspaceAccess,
} from "./lib/companyAccess";
import {
  countPendingApprovals,
  pendingApprovalSummary,
  sortByCreationDesc,
} from "./lib/approvalQueue";

const approvalStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("ESCALATED"),
  v.literal("APPROVED"),
  v.literal("DENIED"),
  v.literal("EXPIRED"),
  v.literal("CANCELED")
);



/**
 * Resolve the deciding operator server-side.
 *
 * A human approval gate cannot accept a client-supplied decider: dual control
 * for RED actions is enforced by comparing the first and second decider, so a
 * caller who names their own identity can satisfy both halves. The returned
 * id is the ONLY value that may be written to `firstDecisionByUserId` /
 * `decidedByUserId` or to the audit trail.
 *
 * Fails closed: an approval with no resolvable workspace cannot be decided.
 */
async function requireApprovalDecisionAuthority(
  ctx: any,
  approval: Doc<"approvals">,
  requiresDualControl = false,
): Promise<string> {
  if (!approval.projectId) {
    throw new Error(
      "Approval is not bound to a workspace and cannot be decided; recreate it with a workspace scope.",
    );
  }
  const project = await ctx.db.get(approval.projectId);
  if (!project?.tenantId) {
    throw new Error("Workspace company assignment is incomplete.");
  }
  const access = await requireWorkspaceAccess(ctx, project.tenantId, project._id, {
    permission: COMPANY_PERMISSIONS.APPROVE_DELIVERY,
  });
  if (access.membership.operatorId) return String(access.membership.operatorId);
  // DEMO/anonymous mode resolves every caller to one synthetic identity, so
  // there is no second approver to satisfy dual control with. Say so instead
  // of writing the shared constant and later reporting the misleading
  // "a different approver must provide the second decision".
  if (access.membership.mode === "DEMO") {
    if (requiresDualControl) {
      throw new Error(
        "Dual-control approvals require two authenticated operators; this deployment is running in anonymous demo mode.",
      );
    }
    return "demo:company-administrator";
  }
  throw new Error("Authenticated operator membership is required.");
}

async function queryPendingLike(
  ctx: any,
  args: { projectId?: string; limit: number }
) {
  const summary = await pendingApprovalSummary(ctx, (args.projectId as any) ?? null, args.limit);
  return summary.items;
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

/**
 * THE pending-approval count.
 *
 * Every surface that displays "N approvals" must read `total` from here. It is
 * exact — not `listPending(limit).length`, which is why the header bell, the
 * sidebar badge and the Command Center chip used to show three different
 * numbers for the same queue at the same time.
 */
export const pendingSummary = workspaceQuery({
  // `projectId` is required by the wrapper. It was optional, and an omitted
  // projectId read every workspace's approval queue across every company —
  // a cross-tenant read reachable by anyone holding the deployment URL.
  args: { limit: v.optional(v.number()) },
  handler: async (ctx: any, args: any) =>
    await pendingApprovalSummary(ctx, args.projectId, args.limit ?? 25),
});

/** Exact count only, for badges that render no list. */
export const countPending = workspaceQuery({
  args: {},
  handler: async (ctx: any, args: any) =>
    await countPendingApprovals(ctx, args.projectId),
});

export const listPending = query({
  args: {
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await queryPendingLike(ctx, {
      projectId: args.projectId,
      limit: args.limit ?? 50,
    });
  },
});

export const listEscalated = query({
  args: {
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.projectId) {
      return await ctx.db
        .query("approvals")
        .withIndex("by_project_status", (q) =>
          q.eq("projectId", args.projectId).eq("status", "ESCALATED")
        )
        .order("desc")
        .take(args.limit ?? 50);
    }

    return await ctx.db
      .query("approvals")
      .withIndex("by_status", (q) => q.eq("status", "ESCALATED"))
      .order("desc")
      .take(args.limit ?? 50);
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
    return await ctx.db
      .query("approvals")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const listByRequestor = query({
  args: {
    agentId: v.id("agents"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("approvals")
      .withIndex("by_requestor", (q) => q.eq("requestorAgentId", args.agentId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const get = query({
  args: { approvalId: v.id("approvals") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.approvalId);
  },
});

export const getDecisionChain = query({
  args: {
    approvalId: v.id("approvals"),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) {
      return null;
    }

    const activities = await ctx.db
      .query("activities")
      .filter((q) => q.eq(q.field("targetId"), args.approvalId))
      .collect();

    const taskEvents = approval.taskId
      ? await ctx.db
          .query("taskEvents")
          .withIndex("by_task", (q) => q.eq("taskId", approval.taskId!))
          .collect()
      : [];

    const approvalEvents = taskEvents.filter((event) =>
      [
        "APPROVAL_REQUESTED",
        "APPROVAL_ESCALATED",
        "APPROVAL_APPROVED",
        "APPROVAL_DENIED",
        "APPROVAL_EXPIRED",
      ].includes(event.eventType)
    );

    return {
      approval,
      activities: sortByCreationDesc(activities),
      taskEvents: sortByCreationDesc(approvalEvents),
    };
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

export const request = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    // Check idempotency
    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query("approvals")
        .filter((q) => q.eq(q.field("idempotencyKey"), args.idempotencyKey))
        .first();
      if (existing) {
        return { approval: existing, created: false };
      }
    }

    // Get projectId from task if not provided
    let projectId = args.projectId;
    if (!projectId && args.taskId) {
      const task = await ctx.db.get(args.taskId);
      projectId = task?.projectId;
    }

    const dualControlRequired = args.riskLevel.toUpperCase() === "RED";
    const expiresAt = Date.now() + (args.expiresInMinutes ?? 60) * 60 * 1000;
    const requestor = await ctx.db.get(args.requestorAgentId);
    const requestorRef = await resolveAgentRef(
      { db: ctx.db as any },
      { agentId: args.requestorAgentId, createIfMissing: true }
    );
    const requestorInstance = requestorRef?.instanceId
      ? await ctx.db.get(requestorRef.instanceId)
      : null;
    const effectiveTenantId = requestor?.tenantId ?? requestorInstance?.tenantId;

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
      decidedByAgentId: shouldAutoApprove ? args.requestorAgentId : undefined,
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
      status: "PENDING",
      requestedAt: Date.now(),
    });
    const changeRecordId = await appendChangeRecord(ctx.db as any, {
      tenantId: effectiveTenantId,
      projectId,
      instanceId: requestorRef?.instanceId,
      versionId: requestorRef?.versionId,
      legacyAgentId: args.requestorAgentId,
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
      actorType: "AGENT",
      actorId: args.requestorAgentId.toString(),
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
        actorType: "AGENT",
        actorId: args.requestorAgentId.toString(),
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

export const approve = mutation({
  args: {
    approvalId: v.id("approvals"),
    projectId: v.optional(v.id("projects")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) {
      return { success: false, error: "Approval not found" };
    }
    if (args.projectId && approval.projectId !== args.projectId) {
      return { success: false, error: "Approval does not belong to the selected workspace" };
    }
    // Authority first: nothing below may write before the deciding operator is
    // resolved and authorized server-side.
    const decider = await requireApprovalDecisionAuthority(
      ctx,
      approval,
      (approval.requiredDecisionCount ?? (approval.riskLevel === "RED" ? 2 : 1)) > 1,
    );

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
          projectId: approval.projectId,
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
            projectId: approval.projectId,
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

        return {
          success: true,
          pendingSecondDecision: true,
          approval: await ctx.db.get(args.approvalId),
        };
      }

      if (approval.firstDecisionByUserId === decider) {
        return {
          success: false,
          error: "Dual-control required: a different approver must provide the second decision",
        };
      }
    }

    await ctx.db.patch(args.approvalId, {
      status: "APPROVED",
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
        decidedAt: now,
        decisionReason: args.reason,
      });
    }

    // Log activity
    await ctx.db.insert("activities", {
      projectId: approval.projectId,
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
        projectId: approval.projectId,
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
    const effectiveTenantId = approval.tenantId ?? requestorInstance?.tenantId;
    const changeRecordId = await appendChangeRecord(ctx.db as any, {
      tenantId: effectiveTenantId,
      projectId: approval.projectId,
      instanceId: requestorRef?.instanceId,
      versionId: requestorRef?.versionId,
      legacyAgentId: approval.requestorAgentId,
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
      projectId: approval.projectId,
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

export const deny = mutation({
  args: {
    approvalId: v.id("approvals"),
    reason: v.string(),
  },
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
    const decider = await requireApprovalDecisionAuthority(ctx, approval);

    if (!["PENDING", "ESCALATED"].includes(approval.status)) {
      return { success: false, error: `Approval already ${approval.status}` };
    }

    await ctx.db.patch(args.approvalId, {
      status: "DENIED",
      decidedByUserId: decider,
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
        decidedAt: Date.now(),
        decisionReason: reason,
      });
    }

    // Log activity
    await ctx.db.insert("activities", {
      projectId: approval.projectId,
      actorType: "HUMAN",
      actorId: decider,
      action: "APPROVAL_DENIED",
      description: `Approval denied: ${approval.actionSummary} — ${reason}`,
      targetType: "APPROVAL",
      targetId: args.approvalId,
      taskId: approval.taskId,
      agentId: approval.requestorAgentId,
    });

    if (approval.taskId) {
      await logTaskEvent(ctx, {
        projectId: approval.projectId,
        taskId: approval.taskId,
        eventType: "APPROVAL_DENIED",
        actorType: "HUMAN",
        actorId: decider,
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
    const effectiveTenantId = approval.tenantId ?? requestorInstance?.tenantId;
    const changeRecordId = await appendChangeRecord(ctx.db as any, {
      tenantId: effectiveTenantId,
      projectId: approval.projectId,
      instanceId: requestorRef?.instanceId,
      versionId: requestorRef?.versionId,
      legacyAgentId: approval.requestorAgentId,
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
      projectId: approval.projectId,
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
        taskTransition = (await ctx.runMutation(api.tasks.transition, {
          taskId: approval.taskId,
          toStatus: "IN_PROGRESS",
          actorType: "HUMAN",
          actorUserId: decider,
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

export const cancel = mutation({
  args: {
    approvalId: v.id("approvals"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) {
      return { success: false, error: "Approval not found" };
    }
    await requireApprovalDecisionAuthority(ctx, approval);

    if (!["PENDING", "ESCALATED"].includes(approval.status)) {
      return { success: false, error: `Approval already ${approval.status}` };
    }

    await ctx.db.patch(args.approvalId, {
      status: "CANCELED",
      decisionReason: args.reason,
    });

    return { success: true, approval: await ctx.db.get(args.approvalId) };
  },
});

export const expireStale = mutation({
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

export const escalateOverdue = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    slaMinutes: v.optional(v.number()),
    escalatedBy: v.optional(v.string()),
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
        escalatedBy: args.escalatedBy ?? "system",
        escalationReason: `Approval open for ${Math.round(ageMs / 60000)} minutes`,
        escalationLevel: nextLevel,
      });

      await ctx.db.insert("activities", {
        projectId: approval.projectId,
        actorType: "SYSTEM",
        actorId: args.escalatedBy ?? "system",
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
          actorId: args.escalatedBy ?? "system",
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
