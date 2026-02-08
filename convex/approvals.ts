/**
 * Approvals — Convex Functions
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { logTaskEvent } from "./lib/taskEvents";

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

    const approvalId = await ctx.db.insert("approvals", {
      projectId,
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
      status: "PENDING",
      expiresAt,
      requiredDecisionCount: dualControlRequired ? 2 : 1,
      decisionCount: 0,
      escalationLevel: 0,
    });

    // Log activity
    const agent = await ctx.db.get(args.requestorAgentId);
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
    decidedByAgentId: v.optional(v.id("agents")),
    decidedByUserId: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) {
      return { success: false, error: "Approval not found" };
    }

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

    const decider = args.decidedByUserId ?? args.decidedByAgentId?.toString();
    if (!decider) {
      return { success: false, error: "A deciding user or agent is required" };
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
          actorType: args.decidedByUserId ? "HUMAN" : "AGENT",
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
            actorType: args.decidedByUserId ? "HUMAN" : "AGENT",
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
      decidedByAgentId: args.decidedByAgentId,
      decidedByUserId: args.decidedByUserId,
      decidedAt: now,
      decisionReason: args.reason,
      decisionCount: requiredDecisionCount > 1 ? 2 : 1,
    });

    // Log activity
    await ctx.db.insert("activities", {
      projectId: approval.projectId,
      actorType: args.decidedByUserId ? "HUMAN" : "AGENT",
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
        actorType: args.decidedByUserId ? "HUMAN" : "AGENT",
        actorId: decider,
        relatedId: args.approvalId,
        metadata: {
          requiredDecisionCount,
          reason: args.reason,
        },
      });
    }

    return { success: true, approval: await ctx.db.get(args.approvalId) };
  },
});

export const deny = mutation({
  args: {
    approvalId: v.id("approvals"),
    decidedByAgentId: v.optional(v.id("agents")),
    decidedByUserId: v.optional(v.string()),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) {
      return { success: false, error: "Approval not found" };
    }

    if (!["PENDING", "ESCALATED"].includes(approval.status)) {
      return { success: false, error: `Approval already ${approval.status}` };
    }

    await ctx.db.patch(args.approvalId, {
      status: "DENIED",
      decidedByAgentId: args.decidedByAgentId,
      decidedByUserId: args.decidedByUserId,
      decidedAt: Date.now(),
      decisionReason: args.reason,
      decisionCount: (approval.decisionCount ?? 0) + 1,
    });

    // Log activity
    await ctx.db.insert("activities", {
      projectId: approval.projectId,
      actorType: args.decidedByUserId ? "HUMAN" : "AGENT",
      actorId: args.decidedByUserId ?? args.decidedByAgentId?.toString(),
      action: "APPROVAL_DENIED",
      description: `Approval denied: ${approval.actionSummary} — ${args.reason}`,
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
        actorType: args.decidedByUserId ? "HUMAN" : "AGENT",
        actorId: args.decidedByUserId ?? args.decidedByAgentId?.toString(),
        relatedId: args.approvalId,
        metadata: {
          reason: args.reason,
        },
      });
    }

    return { success: true, approval: await ctx.db.get(args.approvalId) };
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
