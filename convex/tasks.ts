/**
 * Tasks — Convex Functions
 *
 * Core task operations with state machine enforcement.
 * task.status changes through transition or a guarded, audited workflow
 * supersession/approval mutation.
 */

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { logTaskEvent } from "./lib/taskEvents";
import { evaluateOperatorGate, getEffectiveOperatorControl } from "./lib/operatorControls";
import { sanitizeTaskTitle, sanitizeTaskDescription } from "./lib/sanitize";
import { resolveAgentRef } from "./lib/agentResolver";
import { appendChangeRecord } from "./lib/armAudit";
import { preferInstanceRefs } from "./lib/armCompat";
import {
  outputContractFromMetadata,
  validateForReview,
} from "./lib/outputValidation";
import {
  isExecutorOwnedWorkflowAttempt,
  isMatchingExplicitWorkflowGateApproval,
} from "./lib/workflowTaskGuards";
import {
  deriveTaskGovernanceStatus,
  governanceTransitionError,
  loadTaskProjections,
  taskWorkOrderLinkError,
} from "./lib/taskProjection";
import {
  buildWorkflowStateCompatibilityReport,
  validateWorkflowTransitionContext,
} from "./lib/taskWorkflowState";

// ============================================================================
// TYPES
// ============================================================================

export type TaskStatus =
  | "INBOX" | "READY" | "ASSIGNED" | "IN_PROGRESS" | "REVIEW"
  | "NEEDS_APPROVAL" | "BLOCKED" | "FAILED" | "DONE" | "CANCELED";

export type TaskSource = "DASHBOARD" | "TELEGRAM" | "GITHUB" | "AGENT" | "API" | "TRELLO" | "SEED" | "MISSION_PROMPT";
export type TaskCreator = "HUMAN" | "AGENT" | "SYSTEM";

// ============================================================================
// IDENTIFIER HELPERS
// ============================================================================

function deriveTaskPrefix(slug: string): string {
  const parts = slug.toUpperCase().split(/[-_]/);
  if (parts.length === 1) return parts[0].slice(0, 3);
  return parts.map((p) => p[0]).join("").slice(0, 4);
}

export type TaskType = 
  | "CONTENT" | "SOCIAL" | "EMAIL_MARKETING" | "CUSTOMER_RESEARCH"
  | "SEO_RESEARCH" | "ENGINEERING" | "DOCS" | "OPS";

const taskStatusValidator = v.union(
  v.literal("INBOX"),
  v.literal("READY"),
  v.literal("ASSIGNED"),
  v.literal("IN_PROGRESS"),
  v.literal("REVIEW"),
  v.literal("NEEDS_APPROVAL"),
  v.literal("BLOCKED"),
  v.literal("FAILED"),
  v.literal("DONE"),
  v.literal("CANCELED")
);

const taskTypeValidator = v.union(
  v.literal("CONTENT"),
  v.literal("SOCIAL"),
  v.literal("EMAIL_MARKETING"),
  v.literal("CUSTOMER_RESEARCH"),
  v.literal("SEO_RESEARCH"),
  v.literal("ENGINEERING"),
  v.literal("DOCS"),
  v.literal("OPS")
);

// ============================================================================
// TRANSITION RULES (State Machine)
// ============================================================================

interface TransitionRule {
  from: TaskStatus;
  to: TaskStatus;
  allowedActors: ("AGENT" | "HUMAN" | "SYSTEM")[];
  requiresWorkPlan?: boolean;
  requiresDeliverable?: boolean;
  requiresChecklist?: boolean;
  requiresAssignee?: boolean;
  humanOnly?: boolean;
}

const TRANSITION_RULES: TransitionRule[] = [
  // FROM INBOX
  { from: "INBOX", to: "READY", allowedActors: ["AGENT", "HUMAN", "SYSTEM"], requiresAssignee: true },
  { from: "INBOX", to: "ASSIGNED", allowedActors: ["AGENT", "HUMAN", "SYSTEM"] },
  { from: "INBOX", to: "CANCELED", allowedActors: ["HUMAN"] },
  
  // FROM ASSIGNED
  { from: "ASSIGNED", to: "READY", allowedActors: ["HUMAN", "SYSTEM"] },
  { from: "ASSIGNED", to: "IN_PROGRESS", allowedActors: ["AGENT", "HUMAN"], requiresWorkPlan: true },
  { from: "ASSIGNED", to: "INBOX", allowedActors: ["HUMAN"] },
  { from: "ASSIGNED", to: "CANCELED", allowedActors: ["HUMAN"] },

  // FROM READY
  { from: "READY", to: "IN_PROGRESS", allowedActors: ["AGENT", "HUMAN"], requiresWorkPlan: true },
  { from: "READY", to: "INBOX", allowedActors: ["HUMAN"] },
  { from: "READY", to: "BLOCKED", allowedActors: ["HUMAN", "SYSTEM"] },
  { from: "READY", to: "NEEDS_APPROVAL", allowedActors: ["SYSTEM"] },
  { from: "READY", to: "CANCELED", allowedActors: ["HUMAN"] },
  
  // FROM IN_PROGRESS
  { from: "IN_PROGRESS", to: "REVIEW", allowedActors: ["AGENT", "HUMAN"], requiresDeliverable: true, requiresChecklist: true },
  { from: "IN_PROGRESS", to: "BLOCKED", allowedActors: ["AGENT", "HUMAN", "SYSTEM"] },
  { from: "IN_PROGRESS", to: "NEEDS_APPROVAL", allowedActors: ["SYSTEM"] },
  { from: "IN_PROGRESS", to: "CANCELED", allowedActors: ["HUMAN"] },
  
  // FROM REVIEW
  { from: "REVIEW", to: "IN_PROGRESS", allowedActors: ["HUMAN"] }, // Reasoned revision request
  { from: "REVIEW", to: "DONE", allowedActors: ["HUMAN"], humanOnly: true },
  { from: "REVIEW", to: "BLOCKED", allowedActors: ["HUMAN", "SYSTEM"] },
  { from: "REVIEW", to: "NEEDS_APPROVAL", allowedActors: ["HUMAN", "SYSTEM"] },
  { from: "REVIEW", to: "CANCELED", allowedActors: ["HUMAN"] },
  
  // FROM NEEDS_APPROVAL
  { from: "NEEDS_APPROVAL", to: "INBOX", allowedActors: ["HUMAN"] },
  { from: "NEEDS_APPROVAL", to: "ASSIGNED", allowedActors: ["HUMAN"] },
  { from: "NEEDS_APPROVAL", to: "IN_PROGRESS", allowedActors: ["HUMAN"] },
  { from: "NEEDS_APPROVAL", to: "REVIEW", allowedActors: ["HUMAN"] },
  { from: "NEEDS_APPROVAL", to: "BLOCKED", allowedActors: ["HUMAN", "SYSTEM"] },
  { from: "NEEDS_APPROVAL", to: "DONE", allowedActors: ["HUMAN"] },
  { from: "NEEDS_APPROVAL", to: "CANCELED", allowedActors: ["HUMAN"] },
  
  // FROM BLOCKED
  { from: "BLOCKED", to: "READY", allowedActors: ["HUMAN"] },
  { from: "BLOCKED", to: "ASSIGNED", allowedActors: ["HUMAN"] },
  { from: "BLOCKED", to: "IN_PROGRESS", allowedActors: ["HUMAN"] },
  { from: "BLOCKED", to: "NEEDS_APPROVAL", allowedActors: ["HUMAN", "SYSTEM"] },
  { from: "BLOCKED", to: "CANCELED", allowedActors: ["HUMAN"] },
  
  // FROM IN_PROGRESS to FAILED (agent or system detects unrecoverable failure)
  { from: "IN_PROGRESS", to: "FAILED", allowedActors: ["AGENT", "SYSTEM"] },
  // FROM FAILED — human can retry or cancel
  { from: "FAILED", to: "INBOX", allowedActors: ["HUMAN"] },
  { from: "FAILED", to: "ASSIGNED", allowedActors: ["HUMAN"] },
  { from: "FAILED", to: "CANCELED", allowedActors: ["HUMAN"] },
  
  // DONE, CANCELED are terminal — no transitions out
];

function findTransitionRule(from: TaskStatus, to: TaskStatus): TransitionRule | undefined {
  return TRANSITION_RULES.find(r => r.from === from && r.to === to);
}

async function resolveAssigneeInstanceIds(
  ctx: any,
  assigneeIds: Id<"agents">[]
): Promise<Id<"agentInstances">[]> {
  const resolved = await Promise.all(
    assigneeIds.map((agentId) =>
      resolveAgentRef(
        { db: ctx.db as any },
        { agentId, createIfMissing: true }
      )
    )
  );

  return resolved
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .map((entry) => entry.instanceId);
}

// ============================================================================
// QUERIES
// ============================================================================

export const get = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    return (await loadTaskProjections(ctx, [task], task.projectId))[0];
  },
});

export const getByIdentifier = query({
  args: { identifier: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_identifier", (q) => q.eq("identifier", args.identifier))
      .first();
  },
});

/** Pre-REVIEW output validation: call to check deliverable + checklist before transitioning to REVIEW. */
export const validateOutputForReview = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return { valid: false, errors: ["Task not found"] };
    const errors = validateForReview(
      task.deliverable ?? null,
      task.reviewChecklist ?? null,
      outputContractFromMetadata(task.metadata)
    );
    return { valid: errors.length === 0, errors };
  },
});

/** List tasks, optionally filtered by project */
export const list = query({
  args: {
    projectId: v.optional(v.id("projects")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 200;
    let tasks;
    if (args.projectId) {
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .order("desc")
        .take(limit);
    } else {
      tasks = await ctx.db.query("tasks").order("desc").take(limit);
    }
    return await loadTaskProjections(ctx, tasks, args.projectId);
  },
});

export const listByStatus = query({
  args: { 
    projectId: v.optional(v.id("projects")),
    status: v.optional(taskStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    let tasks;

    // If projectId is provided, use project-scoped index
    if (args.projectId) {
      if (args.status) {
        tasks = await ctx.db
          .query("tasks")
          .withIndex("by_project_status", (q) => 
            q.eq("projectId", args.projectId).eq("status", args.status as TaskStatus)
          )
          .order("desc")
          .take(limit);
      } else {
        tasks = await ctx.db
          .query("tasks")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
          .order("desc")
          .take(limit);
      }
    } else if (args.status) {
      tasks = await ctx.db
          .query("tasks")
          .withIndex("by_status", (q) => q.eq("status", args.status as TaskStatus))
          .order("desc")
          .take(limit);
    } else {
      tasks = await ctx.db.query("tasks").order("desc").take(limit);
    }

    return await loadTaskProjections(ctx, tasks, args.projectId);
  },
});

const LIST_ALL_CAP = 3000;

export const listAll = query({
  args: {
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    let tasks;
    if (args.projectId) {
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .order("desc")
        .take(LIST_ALL_CAP);
    } else {
      tasks = await ctx.db
        .query("tasks")
        .order("desc")
        .take(LIST_ALL_CAP);
    }
    return await loadTaskProjections(ctx, tasks, args.projectId);
  },
});

export const listByWorkOrder = query({
  args: {
    projectId: v.id("projects"),
    workOrderId: v.id("workOrders"),
  },
  handler: async (ctx, args) => {
    const workOrder = await ctx.db.get(args.workOrderId);
    if (!workOrder || workOrder.projectId !== args.projectId) {
      throw new Error("Work Order is unavailable in the selected workspace.");
    }
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project_work_order", (q) =>
        q.eq("projectId", args.projectId).eq("workOrderId", args.workOrderId)
      )
      .order("desc")
      .collect();
    return await loadTaskProjections(ctx, tasks, args.projectId);
  },
});

/** List tasks assigned to a specific agent */
export const listByAgent = query({
  args: {
    agentId: v.id("agents"),
  },
  handler: async (ctx, args) => {
    // assigneeIds is an array field — no direct Convex index possible.
    // Safety cap prevents unbounded full-table scan; proper fix = taskAssignments junction table.
    const tasks = await ctx.db.query("tasks").take(500);
    if (preferInstanceRefs()) {
      const resolved = await resolveAgentRef(
        { db: ctx.db as any },
        { agentId: args.agentId, createIfMissing: false }
      );
      if (resolved) {
        return tasks.filter((task) =>
          (task.assigneeInstanceIds ?? []).includes(resolved.instanceId)
        );
      }
    }
    return tasks.filter((task) => task.assigneeIds && task.assigneeIds.includes(args.agentId));
  },
});

/** Allowed toStatus values for actor HUMAN per fromStatus (for UI "Move to" menu) */
export const getAllowedTransitionsForHuman = query({
  args: {},
  handler: async () => {
    const map: Record<string, string[]> = {};
    for (const r of TRANSITION_RULES) {
      if (r.allowedActors.includes("HUMAN")) {
        if (!map[r.from]) map[r.from] = [];
        map[r.from].push(r.to);
      }
    }
    return map;
  },
});

/** Update task threadRef (for Telegram thread-per-task) */
export const updateThreadRef = mutation({
  args: {
    taskId: v.id("tasks"),
    projectId: v.optional(v.id("projects")),
    chatId: v.string(),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.taskId, {
      threadRef: { chatId: args.chatId, threadId: args.threadId },
    });
    return { success: true };
  },
});

/** Search tasks by title and description */
export const search = query({
  args: {
    projectId: v.optional(v.id("projects")),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    let tasks;
    
    if (args.projectId) {
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
    } else {
      tasks = await ctx.db.query("tasks").collect();
    }
    
    // Simple text search (case-insensitive)
    const query = args.query.toLowerCase();
    const filtered = tasks.filter(t =>
      t.title.toLowerCase().includes(query) ||
      (t.description && t.description.toLowerCase().includes(query)) ||
      (t.labels && t.labels.some(l => l.toLowerCase().includes(query)))
    );
    
    // Sort by relevance (title match first, then description)
    filtered.sort((a, b) => {
      const aTitle = a.title.toLowerCase().includes(query);
      const bTitle = b.title.toLowerCase().includes(query);
      if (aTitle && !bTitle) return -1;
      if (!aTitle && bTitle) return 1;
      return 0;
    });
    
    return filtered.slice(0, limit);
  },
});

/** Export task as incident report (markdown) */
export const exportIncidentReport = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    
    const transitions = await ctx.db
      .query("taskTransitions")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("asc")
      .collect();
    
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("asc")
      .collect();
    
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("asc")
      .collect();
    
    const approvals = await ctx.db
      .query("approvals")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("asc")
      .collect();
    
    const toolCalls = [];
    for (const run of runs) {
      const calls = await ctx.db
        .query("toolCalls")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .collect();
      toolCalls.push(...calls);
    }
    
    // Get agents
    const agentIds = new Set([
      ...task.assigneeIds,
      ...messages.map((m: any) => m.authorAgentId).filter(Boolean),
      ...runs.map((r: any) => r.agentId),
    ]);
    const agents = await Promise.all(
      Array.from(agentIds).map(id => ctx.db.get(id as Id<"agents">))
    );
    const agentMap = new Map(
      agents.filter((a): a is Doc<"agents"> => a !== null).map(a => [a._id, a])
    );
    
    // Build markdown report
    let report = `# Incident Report: ${task.title}\n\n`;
    report += `**Task ID:** ${task._id}\n`;
    report += `**Status:** ${task.status}\n`;
    report += `**Priority:** ${task.priority}\n`;
    report += `**Type:** ${task.type}\n`;
    report += `**Created:** ${new Date((task as any)._creationTime).toISOString()}\n`;
    report += `**Cost:** $${task.actualCost.toFixed(2)}`;
    if (task.budgetAllocated) {
      report += ` / $${task.budgetAllocated.toFixed(2)} budget`;
    }
    report += `\n\n`;
    
    // Description
    if (task.description) {
      report += `## Description\n\n${task.description}\n\n`;
    }
    
    // Assignees
    if (task.assigneeIds.length > 0) {
      report += `## Assignees\n\n`;
      for (const id of task.assigneeIds) {
        const agent = agentMap.get(id);
        report += `- ${agent?.emoji || "🤖"} ${agent?.name || "Unknown"} (${agent?.role})\n`;
      }
      report += `\n`;
    }
    
    // Timeline
    report += `## Timeline\n\n`;
    
    // Combine all events
    const events: Array<{ ts: number; type: string; data: any }> = [];
    
    for (const t of transitions) {
      events.push({ ts: (t as any)._creationTime, type: "transition", data: t });
    }
    for (const m of messages) {
      events.push({ ts: (m as any)._creationTime, type: "message", data: m });
    }
    for (const r of runs) {
      events.push({ ts: r.startedAt, type: "run", data: r });
    }
    for (const tc of toolCalls) {
      events.push({ ts: tc.startedAt, type: "toolCall", data: tc });
    }
    for (const a of approvals) {
      events.push({ ts: (a as any)._creationTime, type: "approval", data: a });
    }
    
    // Sort chronologically
    events.sort((a, b) => a.ts - b.ts);
    
    // Format events
    for (const event of events) {
      const time = new Date(event.ts).toISOString();
      
      switch (event.type) {
        case "transition":
          report += `### ${time} — Transition\n`;
          report += `**${event.data.fromStatus}** → **${event.data.toStatus}**\n`;
          if (event.data.reason) {
            report += `Reason: ${event.data.reason}\n`;
          }
          report += `\n`;
          break;
          
        case "message":
          const author = event.data.authorUserId || 
            (event.data.authorAgentId ? agentMap.get(event.data.authorAgentId)?.name : null) || 
            "Unknown";
          report += `### ${time} — ${event.data.type}\n`;
          report += `**Author:** ${author}\n\n`;
          report += `${event.data.content}\n\n`;
          break;
          
        case "run":
          const agent = agentMap.get(event.data.agentId);
          report += `### ${time} — Run\n`;
          report += `**Agent:** ${agent?.name || "Unknown"}\n`;
          report += `**Model:** ${event.data.model}\n`;
          report += `**Status:** ${event.data.status}\n`;
          report += `**Cost:** $${event.data.costUsd.toFixed(3)}\n`;
          if (event.data.durationMs) {
            report += `**Duration:** ${(event.data.durationMs / 1000).toFixed(1)}s\n`;
          }
          report += `\n`;
          break;
          
        case "toolCall":
          report += `### ${time} — Tool Call\n`;
          report += `**Tool:** ${event.data.toolName}\n`;
          report += `**Risk:** ${event.data.riskLevel}\n`;
          report += `**Status:** ${event.data.status}\n`;
          if (event.data.inputPreview) {
            report += `**Input:** ${event.data.inputPreview.slice(0, 100)}...\n`;
          }
          report += `\n`;
          break;
          
        case "approval":
          report += `### ${time} — Approval\n`;
          report += `**Action:** ${event.data.actionSummary}\n`;
          report += `**Risk:** ${event.data.riskLevel}\n`;
          report += `**Status:** ${event.data.status}\n`;
          if (event.data.decisionReason) {
            report += `**Decision:** ${event.data.decisionReason}\n`;
          }
          report += `\n`;
          break;
      }
    }
    
    // Deliverable
    if (task.deliverable) {
      report += `## Deliverable\n\n`;
      if (task.deliverable.summary) {
        report += `${task.deliverable.summary}\n\n`;
      }
      if (task.deliverable.artifactIds && task.deliverable.artifactIds.length > 0) {
        report += `**Artifacts:**\n`;
        for (const id of task.deliverable.artifactIds) {
          report += `- ${id}\n`;
        }
        report += `\n`;
      }
    }
    
    // Blocked reason
    if (task.blockedReason) {
      report += `## Blocked\n\n`;
      report += `**Reason:** ${task.blockedReason}\n\n`;
    }
    
    // Cost breakdown
    report += `## Cost Breakdown\n\n`;
    report += `**Total Cost:** $${task.actualCost.toFixed(2)}\n`;
    if (task.budgetAllocated) {
      report += `**Budget:** $${task.budgetAllocated.toFixed(2)}\n`;
      report += `**Remaining:** $${(task.budgetRemaining || 0).toFixed(2)}\n`;
    }
    report += `**Runs:** ${runs.length}\n`;
    report += `**Review Cycles:** ${task.reviewCycles}\n\n`;
    
    // Run details
    if (runs.length > 0) {
      report += `### Runs\n\n`;
      for (const run of runs) {
        const agent = agentMap.get(run.agentId);
        report += `- ${agent?.name || "Agent"} · ${run.model} · `;
        report += `$${run.costUsd.toFixed(3)} · `;
        report += `${run.status}`;
        if (run.durationMs) {
          report += ` · ${(run.durationMs / 1000).toFixed(1)}s`;
        }
        report += `\n`;
      }
      report += `\n`;
    }
    
    // Footer
    report += `---\n\n`;
    report += `**Report Generated:** ${new Date().toISOString()}\n`;
    report += `**Generated by:** Mission Control\n`;
    
    return report;
  },
});

export const getWithTimeline = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    
    const transitions = await ctx.db
      .query("taskTransitions")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("asc")
      .collect();
    
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("asc")
      .collect();
    
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("asc")
      .collect();
    
    const approvals = await ctx.db
      .query("approvals")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("asc")
      .collect();

    const activities = await ctx.db
      .query("activities")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("asc")
      .collect();

    const taskEvents = await ctx.db
      .query("taskEvents")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("asc")
      .collect();

    const workflowAttempts = await ctx.db
      .query("workflowRuns")
      .withIndex("by_parent_task", (q) => q.eq("parentTaskId", args.taskId))
      .order("asc")
      .collect();
    
    // Get tool calls for all runs
    const toolCalls = [];
    for (const run of runs) {
      const calls = await ctx.db
        .query("toolCalls")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .collect();
      toolCalls.push(...calls);
    }
    
    const projectedTask = (
      await loadTaskProjections(ctx, [task], task.projectId)
    )[0];

    return {
      task: projectedTask,
      transitions, 
      messages, 
      runs,
      toolCalls,
      approvals,
      activities,
      taskEvents,
      workflowAttempts,
    };
  },
});

export const getUnifiedTimeline = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("taskEvents")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .order("asc")
      .collect();
  },
});

/**
 * Read-only, workspace-scoped evidence for a future ASSIGNED -> READY migration.
 * This query never patches Tasks and deliberately reports exclusions.
 */
export const getWorkflowStateCompatibilityReport = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    return {
      projectId: args.projectId,
      generatedAt: Date.now(),
      mutatesData: false as const,
      ...buildWorkflowStateCompatibilityReport(tasks as any),
    };
  },
});

/**
 * Dry-run transition simulation.
 * Validates transition rules and requirements without mutating task state.
 */
export const simulateTransition = query({
  args: {
    taskId: v.id("tasks"),
    toStatus: taskStatusValidator,
    actorType: v.optional(v.union(v.literal("AGENT"), v.literal("HUMAN"), v.literal("SYSTEM"))),
    hasWorkPlan: v.optional(v.boolean()),
    hasDeliverable: v.optional(v.boolean()),
    hasChecklist: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      return {
        valid: false,
        fromStatus: null,
        toStatus: args.toStatus,
        actorType: args.actorType ?? "HUMAN",
        errors: [{ field: "taskId", message: "Task not found" }],
        allowedTransitions: [],
      };
    }

    const fromStatus = task.status as TaskStatus;
    const toStatus = args.toStatus as TaskStatus;
    const actorType = (args.actorType ?? "HUMAN") as "AGENT" | "HUMAN" | "SYSTEM";
    const rule = findTransitionRule(fromStatus, toStatus);

    if (!rule) {
      return {
        valid: false,
        fromStatus,
        toStatus,
        actorType,
        errors: [{
          field: "toStatus",
          message: `Invalid transition: ${fromStatus} -> ${toStatus}`,
        }],
        allowedTransitions: TRANSITION_RULES
          .filter((r) => r.from === fromStatus)
          .map((r) => r.to),
      };
    }

    const errors: Array<{ field: string; message: string }> = [];
    const workOrder = task.workOrderId
      ? await ctx.db.get(task.workOrderId)
      : null;
    if (
      deriveTaskGovernanceStatus(task, workOrder) === "UNGOVERNED" &&
      toStatus !== "CANCELED"
    ) {
      errors.push({
        field: "workOrderId",
        message: "Link this Task to a Work Order before execution.",
      });
    }

    if (!rule.allowedActors.includes(actorType)) {
      errors.push({
        field: "actorType",
        message: `Actor type '${actorType}' cannot perform ${fromStatus} -> ${toStatus}`,
      });
    }

    if (rule.humanOnly && actorType !== "HUMAN") {
      errors.push({
        field: "actorType",
        message: `Transition ${fromStatus} -> ${toStatus} requires human approval`,
      });
    }

    if (rule.requiresWorkPlan && !args.hasWorkPlan) {
      errors.push({
        field: "workPlan",
        message: "Work plan required",
      });
    }

    if (rule.requiresDeliverable && !args.hasDeliverable) {
      errors.push({
        field: "deliverable",
        message: "Deliverable required",
      });
    }

    if (rule.requiresChecklist && !args.hasChecklist) {
      errors.push({
        field: "reviewChecklist",
        message: "Review checklist required",
      });
    }

    if (rule.requiresAssignee && task.assigneeIds.length === 0) {
      errors.push({ field: "assigneeIds", message: "At least one assignee is required" });
    }

    errors.push(...validateWorkflowTransitionContext({
      fromStatus,
      toStatus,
    }));

    return {
      valid: errors.length === 0,
      fromStatus,
      toStatus,
      actorType,
      requirements: {
        requiresWorkPlan: !!rule.requiresWorkPlan,
        requiresDeliverable: !!rule.requiresDeliverable,
        requiresChecklist: !!rule.requiresChecklist,
        requiresAssignee: !!rule.requiresAssignee,
        humanOnly: !!rule.humanOnly,
      },
      errors,
      allowedTransitions: TRANSITION_RULES
        .filter((r) => r.from === fromStatus && r.allowedActors.includes(actorType))
        .map((r) => r.to),
    };
  },
});

/**
 * Dry-run planner: transition validation + policy decision preview with no side effects.
 */
export const simulateExecutionPlan = query({
  args: {
    taskId: v.id("tasks"),
    toStatus: v.optional(taskStatusValidator),
    actorType: v.optional(v.union(v.literal("AGENT"), v.literal("HUMAN"), v.literal("SYSTEM"))),
    plannedToolName: v.optional(v.string()),
    plannedToolArgs: v.optional(v.any()),
    estimatedCost: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      return {
        ok: false,
        error: "Task not found",
      };
    }

    const actorType = (args.actorType ?? "HUMAN") as "AGENT" | "HUMAN" | "SYSTEM";
    const transitionPreview = (() => {
      if (!args.toStatus) return null;

      const fromStatus = task.status as TaskStatus;
      const toStatus = args.toStatus as TaskStatus;
      const rule = findTransitionRule(fromStatus, toStatus);
      if (!rule) {
        return {
          valid: false,
          fromStatus,
          toStatus,
          actorType,
          errors: [{ field: "toStatus", message: `Invalid transition: ${fromStatus} -> ${toStatus}` }],
          allowedTransitions: TRANSITION_RULES
            .filter((r) => r.from === fromStatus)
            .map((r) => r.to),
        };
      }

      const errors: Array<{ field: string; message: string }> = [];
      if (!rule.allowedActors.includes(actorType)) {
        errors.push({
          field: "actorType",
          message: `Actor type '${actorType}' cannot perform ${fromStatus} -> ${toStatus}`,
        });
      }
      if (rule.humanOnly && actorType !== "HUMAN") {
        errors.push({
          field: "actorType",
          message: `Transition ${fromStatus} -> ${toStatus} requires human approval`,
        });
      }
      if (rule.requiresWorkPlan && !task.workPlan) {
        errors.push({ field: "workPlan", message: "Work plan required" });
      }
      if (rule.requiresDeliverable && !task.deliverable) {
        errors.push({ field: "deliverable", message: "Deliverable required" });
      }
      if (rule.requiresChecklist && !task.reviewChecklist) {
        errors.push({ field: "reviewChecklist", message: "Review checklist required" });
      }
      if (rule.requiresAssignee && task.assigneeIds.length === 0) {
        errors.push({ field: "assigneeIds", message: "At least one assignee is required" });
      }
      errors.push(...validateWorkflowTransitionContext({ fromStatus, toStatus }));

      return {
        valid: errors.length === 0,
        fromStatus,
        toStatus,
        actorType,
        requirements: {
          requiresWorkPlan: !!rule.requiresWorkPlan,
          requiresDeliverable: !!rule.requiresDeliverable,
          requiresChecklist: !!rule.requiresChecklist,
          requiresAssignee: !!rule.requiresAssignee,
          humanOnly: !!rule.humanOnly,
        },
        errors,
      };
    })();

    const activePolicy = await ctx.db
      .query("policies")
      .withIndex("by_active", (q) => q.eq("active", true))
      .first();

    const primaryAssigneeId = task.assigneeIds?.[0];
    const assignee = primaryAssigneeId ? await ctx.db.get(primaryAssigneeId) : null;
    const triggeredRules: string[] = [];
    const remediationHints: string[] = [];
    const requiredApprovals: Array<{ type: string; reason: string }> = [];
    let policyDecision: "ALLOW" | "NEEDS_APPROVAL" | "DENY" = "ALLOW";
    let policyReason = "No blocking policy rules triggered";
    let riskLevel: "GREEN" | "YELLOW" | "RED" =
      task.type === "SOCIAL" || task.type === "EMAIL_MARKETING"
        ? "RED"
        : task.type === "OPS" || task.type === "ENGINEERING"
          ? "YELLOW"
          : "GREEN";

    if (!assignee) {
      policyDecision = "NEEDS_APPROVAL";
      policyReason = "Task has no assignee; operator confirmation required before execution";
      triggeredRules.push("task_unassigned");
      remediationHints.push("Assign an active agent and re-run simulation.");
    } else if (assignee.status !== "ACTIVE") {
      policyDecision = "DENY";
      policyReason = `Assignee ${assignee.name} is ${assignee.status.toLowerCase()}`;
      triggeredRules.push(`assignee_not_active:${assignee.status}`);
      remediationHints.push("Activate the assignee or reassign this task.");
    } else {
      const estimatedCost = args.estimatedCost ?? task.estimatedCost ?? 0;
      const budgetRemaining = assignee.budgetDaily - assignee.spendToday;
      if (estimatedCost > budgetRemaining) {
        policyDecision = "NEEDS_APPROVAL";
        policyReason = `Estimated cost ($${estimatedCost.toFixed(2)}) exceeds remaining daily budget ($${budgetRemaining.toFixed(2)})`;
        triggeredRules.push("budget_exceeded");
        requiredApprovals.push({
          type: "BUDGET_EXCEEDED",
          reason: "Budget overrun requires human approval",
        });
        remediationHints.push("Reduce scope or increase budget authorization.");
      }
    }

    const operatorControl = await getEffectiveOperatorControl(ctx.db, task.projectId);
    const operatorGate = evaluateOperatorGate({
      mode: operatorControl.mode,
      actorType,
      operation: "TRANSITION",
    });
    if (operatorGate.decision === "DENY") {
      policyDecision = "DENY";
      policyReason = operatorGate.reason;
      triggeredRules.push(`operator_control:${operatorControl.mode}`);
      remediationHints.push("Return operator mode to NORMAL or use explicit human override.");
    }
    if (operatorGate.decision === "NEEDS_APPROVAL" && policyDecision !== "DENY") {
      policyDecision = "NEEDS_APPROVAL";
      policyReason = operatorGate.reason;
      triggeredRules.push(`operator_control:${operatorControl.mode}`);
      requiredApprovals.push({
        type: "OPERATOR_OVERRIDE",
        reason: operatorGate.reason,
      });
    }

    if (activePolicy && args.toStatus === "DONE") {
      const rules = activePolicy.rules as Record<string, unknown> | undefined;
      if (rules?.reviewToDoneRequiresHuman === true && policyDecision !== "DENY") {
        policyDecision = "NEEDS_APPROVAL";
        policyReason = "REVIEW -> DONE requires human approval by policy";
        triggeredRules.push("review_to_done_requires_human");
        requiredApprovals.push({
          type: "TRANSITION_TO_DONE",
          reason: "Policy requires human review before completion",
        });
      }
    }

    if (triggeredRules.length === 0) {
      triggeredRules.push("no_policy_blockers");
    }
    if (remediationHints.length === 0 && policyDecision === "ALLOW") {
      remediationHints.push("No remediation needed. Safe to proceed.");
    }

    const policyPreview = {
      taskId: task._id,
      taskStatus: task.status,
      decision: policyDecision,
      riskLevel,
      reason: policyReason,
      triggeredRules,
      requiredApprovals,
      remediationHints,
      evaluatedAt: Date.now(),
    };

    return {
      ok: true,
      transitionPreview,
      policyPreview,
      summary: {
        transitionValid: transitionPreview ? transitionPreview.valid : true,
        policyDecision: policyPreview.decision,
        riskLevel: policyPreview.riskLevel,
        needsApproval: policyPreview.decision === "NEEDS_APPROVAL",
      },
      evaluatedAt: Date.now(),
    };
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

export const create = mutation({
  args: {
    projectId: v.optional(v.id("projects")),
    title: v.string(),
    description: v.optional(v.string()),
    type: v.string(),
    priority: v.optional(v.number()),
    assigneeIds: v.optional(v.array(v.id("agents"))),
    labels: v.optional(v.array(v.string())),
    estimatedCost: v.optional(v.number()),
    goalId: v.optional(v.id("goals")),
    workOrderId: v.optional(v.id("workOrders")),
    idempotencyKey: v.optional(v.string()),
    // Provenance — where the task came from
    source: v.optional(v.string()),       // "DASHBOARD" | "TELEGRAM" | "GITHUB" | "AGENT" | "API"
    sourceRef: v.optional(v.string()),    // e.g. "owner/repo#42", telegram msg id
    createdBy: v.optional(v.string()),    // "HUMAN" | "AGENT" | "SYSTEM"
    createdByRef: v.optional(v.string()), // agent id, user email, etc.
    metadata: v.optional(v.any()),
    dueAt: v.optional(v.number()),        // deadline timestamp (ms)
  },
  handler: async (ctx, args) => {
    // ── Idempotency check ──
    // If an idempotencyKey is provided, return existing task if found
    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query("tasks")
        .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
        .first();
      if (existing) {
        const projected = (
          await loadTaskProjections(ctx, [existing], existing.projectId)
        )[0];
        return { task: projected, created: false };
      }
    }

    // ── Rate limit external sources (30 per key per minute)
    const RATE_LIMIT_PER_MINUTE = 30;
    const WINDOW_MS = 60 * 1000;
    if (args.source === "TELEGRAM" && args.sourceRef) {
      const key = `telegram:${args.sourceRef.split(":")[1] ?? "unknown"}`;
      const now = Date.now();
      const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
      const entry = await ctx.db
        .query("rateLimitEntries")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();
      if (!entry || entry.windowStart < windowStart) {
        if (entry) await ctx.db.delete(entry._id);
        await ctx.db.insert("rateLimitEntries", { key, windowStart, count: 1 });
      } else {
        if (entry.count >= RATE_LIMIT_PER_MINUTE) {
          throw new Error("Rate limit exceeded. Please try again in a minute.");
        }
        await ctx.db.patch(entry._id, { count: entry.count + 1 });
      }
    }

    // ── Sanitize untrusted input from external sources (OpenClaw safety) ──
    const externalSources = ["TELEGRAM", "GITHUB", "API"];
    const isUntrusted = args.source && externalSources.includes(args.source);
    const title = isUntrusted ? sanitizeTaskTitle(args.title) : args.title;
    const description = isUntrusted
      ? sanitizeTaskDescription(args.description)
      : args.description;
    const project = args.projectId ? await ctx.db.get(args.projectId) : null;
    if (args.projectId && !project) {
      throw new Error("The selected workspace is unavailable.");
    }
    const workOrder = args.workOrderId
      ? await ctx.db.get(args.workOrderId)
      : null;
    if (args.workOrderId) {
      const linkError = taskWorkOrderLinkError(args.projectId, workOrder);
      if (linkError) throw new Error(linkError);
    }
    const assigneeIds = args.assigneeIds ?? [];
    const assigneeInstanceIds =
      assigneeIds.length > 0
        ? await resolveAssigneeInstanceIds(ctx, assigneeIds)
        : undefined;

    // ── Generate human-readable identifier (e.g., "MC-042") ──
    let identifier: string | undefined;
    if (project && args.projectId) {
      const prefix = project.taskPrefix || deriveTaskPrefix(project.slug);
      const nextNum = (project.nextTaskNumber ?? 0) + 1;
      identifier = `${prefix}-${String(nextNum).padStart(3, "0")}`;
      await ctx.db.patch(args.projectId, {
        nextTaskNumber: nextNum,
        ...(project.taskPrefix ? {} : { taskPrefix: prefix }),
      });
    }

    // ── INVARIANT: All tasks start as INBOX ──
    // Status is NEVER caller-controlled. Hardcoded server-side.
    const taskId = await ctx.db.insert("tasks", {
      tenantId: project?.tenantId,
      projectId: args.projectId,
      identifier,
      goalId: args.goalId,
      workOrderId: args.workOrderId,
      title,
      description,
      type: args.type as TaskType,
      status: "INBOX",  // INVARIANT: always INBOX at creation
      stateEnteredAt: Date.now(),
      priority: (args.priority ?? 3) as 1 | 2 | 3 | 4,
      assigneeIds,
      assigneeInstanceIds,
      reviewCycles: 0,
      actualCost: 0,
      labels: args.labels,
      estimatedCost: args.estimatedCost,
      idempotencyKey: args.idempotencyKey,
      // Provenance
      source: (args.source as any) ?? undefined,
      sourceRef: args.sourceRef,
      createdBy: (args.createdBy as any) ?? undefined,
      createdByRef: args.createdByRef,
      metadata: {
        ...(typeof args.metadata === "object" && args.metadata !== null
          ? args.metadata
          : {}),
        governanceOrigin: args.workOrderId
          ? "GOVERNED_WORK_ORDER"
          : "UNGOVERNED_INTAKE",
        relationshipCreatedAt: Date.now(),
      },
      dueAt: args.dueAt,
    });
    
    const task = await ctx.db.get(taskId);
    
    // Log activity with provenance context
    const sourceLabel = args.source ? ` via ${args.source}` : "";
    await ctx.db.insert("activities", {
      projectId: args.projectId,
      actorType: (args.createdBy as "AGENT" | "HUMAN" | "SYSTEM") ?? "SYSTEM",
      action: "TASK_CREATED",
      description: `Task "${title}" created${sourceLabel}`,
      targetType: "TASK",
      targetId: taskId,
      taskId,
    });

    await logTaskEvent(ctx, {
      taskId,
      projectId: args.projectId,
      eventType: "TASK_CREATED",
      actorType: (args.createdBy as "AGENT" | "HUMAN" | "SYSTEM") ?? "SYSTEM",
      actorId: args.createdByRef,
      relatedId: taskId,
      afterState: {
        status: "INBOX",
        title,
        type: args.type,
        priority: args.priority ?? 3,
        workOrderId: args.workOrderId,
        missionId: workOrder?.missionId,
      },
      metadata: {
        source: args.source,
        sourceRef: args.sourceRef,
      },
    });
    
    const projected = task
      ? (await loadTaskProjections(ctx, [task], task.projectId))[0]
      : null;
    return { task: projected, created: true };
  },
});

export const linkToWorkOrder = mutation({
  args: {
    taskId: v.id("tasks"),
    projectId: v.id("projects"),
    workOrderId: v.id("workOrders"),
    actorType: v.union(v.literal("HUMAN"), v.literal("AGENT"), v.literal("SYSTEM")),
    actorId: v.optional(v.string()),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const [task, workOrder] = await Promise.all([
      ctx.db.get(args.taskId),
      ctx.db.get(args.workOrderId),
    ]);
    if (!task || task.projectId !== args.projectId) {
      throw new Error("Task is unavailable in the selected workspace.");
    }
    const linkError = taskWorkOrderLinkError(args.projectId, workOrder);
    if (linkError) throw new Error(linkError);
    if (!workOrder) throw new Error("The selected Work Order no longer exists.");
    if (task.workOrderId && task.workOrderId !== args.workOrderId) {
      throw new Error(
        "This Task is already governed by another Work Order. Unlinking requires a separate reviewed change."
      );
    }
    if (task.workOrderId === args.workOrderId) {
      return {
        task: (await loadTaskProjections(ctx, [task], args.projectId))[0],
        linked: false,
        idempotencyHit: true,
      };
    }

    const linkedAt = Date.now();
    const beforeState = {
      workOrderId: null,
      governanceStatus: deriveTaskGovernanceStatus(task, null),
    };
    await ctx.db.patch(task._id, {
      workOrderId: workOrder._id,
      metadata: {
        ...(typeof task.metadata === "object" && task.metadata !== null
          ? task.metadata
          : {}),
        governanceOrigin: "GOVERNED_WORK_ORDER",
        relationshipCreatedAt: linkedAt,
        relationshipActorType: args.actorType,
        relationshipActorId: args.actorId,
        relationshipIdempotencyKey: args.idempotencyKey,
      },
    });
    await ctx.db.insert("activities", {
      projectId: args.projectId,
      actorType: args.actorType,
      actorId: args.actorId,
      action: "TASK_LINKED_TO_WORK_ORDER",
      description: `Task "${task.title}" linked to Work Order "${workOrder.title}"`,
      targetType: "TASK",
      targetId: task._id,
      taskId: task._id,
      beforeState,
      afterState: {
        workOrderId: workOrder._id,
        missionId: workOrder.missionId,
        governanceStatus: "GOVERNED",
        linkedAt,
      },
      metadata: { idempotencyKey: args.idempotencyKey },
    });
    await logTaskEvent(ctx, {
      taskId: task._id,
      projectId: args.projectId,
      eventType: "TASK_LINKED_TO_WORK_ORDER",
      actorType: args.actorType,
      actorId: args.actorId,
      relatedId: workOrder._id,
      beforeState,
      afterState: {
        workOrderId: workOrder._id,
        missionId: workOrder.missionId,
        governanceStatus: "GOVERNED",
        linkedAt,
      },
      metadata: { idempotencyKey: args.idempotencyKey },
    });

    const updated = await ctx.db.get(task._id);
    return {
      task: updated
        ? (await loadTaskProjections(ctx, [updated], args.projectId))[0]
        : null,
      linked: true,
      idempotencyHit: false,
    };
  },
});

export const transition = mutation({
  args: {
    taskId: v.id("tasks"),
    projectId: v.optional(v.id("projects")),
    toStatus: taskStatusValidator,
    actorType: v.union(v.literal("AGENT"), v.literal("HUMAN"), v.literal("SYSTEM")),
    actorAgentId: v.optional(v.id("agents")),
    actorUserId: v.optional(v.string()),
    reason: v.optional(v.string()),
    sessionKey: v.optional(v.string()),
    idempotencyKey: v.string(),
    // Artifacts for transition requirements
    workPlan: v.optional(v.object({
      bullets: v.array(v.string()),
      estimatedCost: v.optional(v.number()),
      estimatedDuration: v.optional(v.string()),
    })),
    deliverable: v.optional(v.object({
      summary: v.optional(v.string()),
      content: v.optional(v.string()),
      artifactIds: v.optional(v.array(v.string())),
    })),
    reviewChecklist: v.optional(v.object({
      type: v.string(),
      items: v.array(v.object({
        label: v.string(),
        checked: v.boolean(),
        note: v.optional(v.string()),
      })),
    })),
    blockedReason: v.optional(v.string()),
    reviewOwnerId: v.optional(v.id("agents")),
    reviewFindings: v.optional(v.array(v.string())),
    blocker: v.optional(v.object({
      type: v.union(
        v.literal("TASK"),
        v.literal("EXTERNAL"),
        v.literal("POLICY"),
        v.literal("APPROVAL"),
        v.literal("CAPACITY"),
        v.literal("UNKNOWN")
      ),
      reason: v.string(),
      blockingTaskId: v.optional(v.id("tasks")),
      ownerRef: v.optional(v.string()),
      requiredAction: v.optional(v.string()),
      escalationAt: v.optional(v.number()),
    })),
    blockerResolution: v.optional(v.object({
      resolution: v.union(
        v.literal("RESOLVED"),
        v.literal("WAIVED"),
        v.literal("REPLACED")
      ),
      reason: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    // 1. Check idempotency - return existing if same key
    const existingTransition = await ctx.db
      .query("taskTransitions")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    
    if (existingTransition) {
      const task = await ctx.db.get(args.taskId);
      if (args.projectId && task?.projectId !== args.projectId) {
        return {
          success: false,
          errors: [{
            field: "projectId",
            message: "Task does not belong to the selected workspace",
          }],
        };
      }
      return {
        success: true,
        task,
        transition: existingTransition,
        idempotencyHit: true,
      };
    }
    
    // 2. Get current task
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      return {
        success: false,
        errors: [{ field: "taskId", message: "Task not found" }],
      };
    }
    if (args.projectId && task.projectId !== args.projectId) {
      return {
        success: false,
        errors: [{
          field: "projectId",
          message: "Task does not belong to the selected workspace",
        }],
      };
    }
    const taskWorkOrder = task.workOrderId
      ? await ctx.db.get(task.workOrderId)
      : null;
    const governanceStatus = deriveTaskGovernanceStatus(task, taskWorkOrder);
    const governanceError = governanceTransitionError(
      governanceStatus,
      args.toStatus
    );
    if (governanceError) {
      return {
        success: false,
        errors: [{
          field: "workOrderId",
          message: governanceError,
        }],
      };
    }
    
    const fromStatus = task.status as TaskStatus;
    const toStatus = args.toStatus as TaskStatus;
    const actorType = args.actorType as "AGENT" | "HUMAN" | "SYSTEM";

    const operatorControl = await getEffectiveOperatorControl(ctx.db, task.projectId);
    const operatorGate = evaluateOperatorGate({
      mode: operatorControl.mode,
      actorType,
      operation: "TRANSITION",
    });
    if (operatorGate.decision === "DENY") {
      return {
        success: false,
        errors: [{
          field: "operatorControl",
          message: operatorGate.reason,
        }],
      };
    }
    if (operatorGate.decision === "NEEDS_APPROVAL" && actorType !== "HUMAN") {
      return {
        success: false,
        errors: [{
          field: "operatorControl",
          message: operatorGate.reason,
        }],
      };
    }
    
    // 3. Find transition rule
    const rule = findTransitionRule(fromStatus, toStatus);
    if (!rule) {
      return {
        success: false,
        errors: [{ 
          field: "toStatus", 
          message: `Invalid transition: ${fromStatus} → ${toStatus} is not allowed` 
        }],
        allowedTransitions: TRANSITION_RULES
          .filter(r => r.from === fromStatus)
          .map(r => r.to),
      };
    }
    
    // 4. Check actor permission
    if (!rule.allowedActors.includes(actorType)) {
      return {
        success: false,
        errors: [{
          field: "actorType",
          message: `Actor type '${actorType}' cannot perform ${fromStatus} → ${toStatus}. Allowed: ${rule.allowedActors.join(", ")}`
        }],
      };
    }
    
    // 5. Check human-only transitions
    if (rule.humanOnly && actorType !== "HUMAN") {
      return {
        success: false,
        errors: [{
          field: "actorType",
          message: `Transition ${fromStatus} → ${toStatus} requires human approval`
        }],
      };
    }
    
    // 6. Validate required artifacts
    const errors: { field: string; message: string }[] = [];
    const effectiveWorkPlan = args.workPlan ?? task.workPlan;
    const effectiveDeliverable = args.deliverable ?? task.deliverable;
    const effectiveReviewChecklist = args.reviewChecklist ?? task.reviewChecklist;
    
    if (rule.requiresWorkPlan && !effectiveWorkPlan) {
      errors.push({ field: "workPlan", message: "Work plan required for IN_PROGRESS" });
    }
    if (rule.requiresWorkPlan && effectiveWorkPlan) {
      if (effectiveWorkPlan.bullets.length < 3 || effectiveWorkPlan.bullets.length > 6) {
        errors.push({ field: "workPlan.bullets", message: "Work plan must have 3-6 bullets" });
      }
    }
    
    if (rule.requiresDeliverable && !effectiveDeliverable) {
      errors.push({ field: "deliverable", message: "Deliverable required for REVIEW" });
    }
    
    if (rule.requiresChecklist && !effectiveReviewChecklist) {
      errors.push({ field: "reviewChecklist", message: "Review checklist required for REVIEW" });
    }
    if (rule.requiresAssignee && task.assigneeIds.length === 0) {
      errors.push({ field: "assigneeIds", message: "Task must have at least one assignee" });
    }

    errors.push(...validateWorkflowTransitionContext({
      fromStatus,
      toStatus,
      reason: args.reason,
      blocker: args.blocker,
      blockerResolution: args.blockerResolution,
    }));

    if (args.reviewOwnerId) {
      const reviewOwner = await ctx.db.get(args.reviewOwnerId);
      if (!reviewOwner || reviewOwner.projectId !== task.projectId) {
        errors.push({
          field: "reviewOwnerId",
          message: "Review owner must belong to the selected workspace",
        });
      }
    }
    if (args.blocker?.blockingTaskId) {
      const blockingTask = await ctx.db.get(args.blocker.blockingTaskId);
      if (!blockingTask || blockingTask.projectId !== task.projectId) {
        errors.push({
          field: "blocker.blockingTaskId",
          message: "Blocking Task must belong to the selected workspace",
        });
      }
    }
    
    // Output validation when transitioning to REVIEW (format, length, checklist)
    if (toStatus === "REVIEW") {
      const outputErrors = validateForReview(
        effectiveDeliverable ?? null,
        effectiveReviewChecklist ?? null,
        outputContractFromMetadata(task.metadata)
      );
      for (const msg of outputErrors) {
        errors.push({ field: "deliverable", message: msg });
      }
    }
    
    // Check assignees for IN_PROGRESS
    if (toStatus === "IN_PROGRESS" && task.assigneeIds.length === 0) {
      errors.push({ field: "assigneeIds", message: "Task must have at least one assignee" });
    }
    
    // Check REVIEW → DONE approval gate
    if (fromStatus === "REVIEW" && toStatus === "DONE") {
      // Get active policy to check if approval is required
      const policy = await ctx.db
        .query("policies")
        .withIndex("by_active", (q) => q.eq("active", true))
        .first();
      
      if (policy && (policy.rules as any)?.reviewToDoneRequiresApproval) {
        // Check for approved approval record
        const approvals = await ctx.db
          .query("approvals")
          .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
          .filter((q) => q.eq(q.field("status"), "APPROVED"))
          .collect();
        
        if (approvals.length === 0) {
          errors.push({
            field: "status",
            message: "REVIEW → DONE requires an approved approval record. Request approval first.",
          });
        }
      }
    }
    
    if (errors.length > 0) {
      return { success: false, errors };
    }
    
    // 7. Build task update
    const now = Date.now();
    const actorRef =
      args.actorUserId ?? args.actorAgentId?.toString() ?? args.actorType;
    const taskUpdate: any = {
      status: toStatus,
      stateEnteredAt: now,
    };
    
    if (args.workPlan) taskUpdate.workPlan = args.workPlan;
    if (args.deliverable) taskUpdate.deliverable = args.deliverable;
    if (args.reviewChecklist) taskUpdate.reviewChecklist = args.reviewChecklist;
    if (args.blockedReason) taskUpdate.blockedReason = args.blockedReason;

    if (toStatus === "REVIEW") {
      const priorReview = task.review;
      const priorHistory = priorReview?.history ?? [];
      taskUpdate.review = {
        ownerId: args.reviewOwnerId ?? task.reviewerId ?? priorReview?.ownerId,
        enteredAt: now,
        resubmissionCount:
          (priorReview?.resubmissionCount ?? task.reviewCycles) +
          (priorReview?.result === "CHANGES_REQUESTED" ? 1 : 0),
        history: priorHistory,
      };
      if (args.reviewOwnerId) taskUpdate.reviewerId = args.reviewOwnerId;
    }

    if (fromStatus === "REVIEW" && ["IN_PROGRESS", "DONE", "NEEDS_APPROVAL"].includes(toStatus)) {
      const result =
        toStatus === "IN_PROGRESS"
          ? "CHANGES_REQUESTED"
          : toStatus === "DONE"
            ? "APPROVED"
            : "ESCALATED";
      const decision = {
        result,
        reason: args.reason?.trim() || undefined,
        findings: args.reviewFindings,
        completedAt: now,
        decidedBy: actorRef,
      };
      taskUpdate.review = {
        ...(task.review ?? { resubmissionCount: task.reviewCycles }),
        completedAt: now,
        result,
        reason: decision.reason,
        findings: args.reviewFindings,
        findingsCount: args.reviewFindings?.length ?? 0,
        decidedBy: actorRef,
        history: [...(task.review?.history ?? []), decision],
      };
    }

    if (toStatus === "BLOCKED" && args.blocker) {
      taskUpdate.blockedReason = args.blocker.reason.trim();
      taskUpdate.blocker = {
        ...args.blocker,
        reason: args.blocker.reason.trim(),
        blockedSince: now,
      };
    }

    if (fromStatus === "BLOCKED" && args.blockerResolution) {
      taskUpdate.blocker = {
        ...(task.blocker ?? {
          type: "UNKNOWN",
          reason: task.blockedReason ?? "Legacy blocker without structured context",
          blockedSince: task.stateEnteredAt ?? task._creationTime,
        }),
        resolvedAt: now,
        resolution: args.blockerResolution.resolution,
        resolutionReason: args.blockerResolution.reason.trim(),
        resolvedBy: actorRef,
      };
    }
    
    // Set timestamps
    if (toStatus === "IN_PROGRESS" && !task.startedAt) {
      taskUpdate.startedAt = now;
    }
    if (toStatus === "REVIEW") {
      taskUpdate.submittedAt = now;
    }
    if (toStatus === "DONE" || toStatus === "CANCELED") {
      taskUpdate.completedAt = now;
    }
    
    // Increment review cycles on revision
    if (fromStatus === "REVIEW" && toStatus === "IN_PROGRESS") {
      taskUpdate.reviewCycles = task.reviewCycles + 1;
    }
    
    // 8. Update task
    await ctx.db.patch(args.taskId, taskUpdate);
    
    // 9. Create transition record
    const transitionId = await ctx.db.insert("taskTransitions", {
      projectId: task.projectId,
      idempotencyKey: args.idempotencyKey,
      taskId: args.taskId,
      fromStatus,
      toStatus,
      actorType,
      actorAgentId: args.actorAgentId,
      actorUserId: args.actorUserId,
      reason: args.reason,
      sessionKey: args.sessionKey,
      validationResult: { valid: true },
      artifactsSnapshot: {
        workPlan: effectiveWorkPlan,
        deliverable: effectiveDeliverable,
        reviewChecklist: effectiveReviewChecklist,
        review: taskUpdate.review,
        blocker: taskUpdate.blocker,
        blockerResolution: args.blockerResolution,
      },
    });

    await appendChangeRecord(ctx.db as any, {
      tenantId: task.tenantId,
      projectId: task.projectId,
      legacyAgentId: args.actorAgentId,
      type: "TASK_TRANSITIONED",
      summary: `Task ${args.taskId} transitioned ${fromStatus} -> ${toStatus}`,
      payload: {
        taskId: args.taskId,
        fromStatus,
        toStatus,
        actorType,
        actorAgentId: args.actorAgentId,
        actorUserId: args.actorUserId,
      },
      relatedTable: "tasks",
      relatedId: args.taskId,
    });
    
    // 10. Log activity
    await ctx.db.insert("activities", {
      projectId: task.projectId,
      actorType,
      actorId: args.actorAgentId?.toString() ?? args.actorUserId,
      action: "TASK_TRANSITION",
      description: `Task transitioned: ${fromStatus} → ${toStatus}`,
      targetType: "TASK",
      targetId: args.taskId,
      taskId: args.taskId,
      agentId: args.actorAgentId,
      beforeState: { status: fromStatus, review: task.review, blocker: task.blocker },
      afterState: { status: toStatus, review: taskUpdate.review, blocker: taskUpdate.blocker },
    });

    await logTaskEvent(ctx, {
      taskId: args.taskId,
      projectId: task.projectId,
      eventType: "TASK_TRANSITION",
      actorType,
      actorId: args.actorAgentId?.toString() ?? args.actorUserId,
      relatedId: transitionId,
      beforeState: { status: fromStatus, review: task.review, blocker: task.blocker },
      afterState: { status: toStatus, review: taskUpdate.review, blocker: taskUpdate.blocker },
      metadata: {
        reason: args.reason,
        sessionKey: args.sessionKey,
        operatorMode: operatorControl.mode,
      },
    });

    const updatedTask = await ctx.db.get(args.taskId);
    const transition = await ctx.db.get(transitionId);

    const taskWatchers = await ctx.db
      .query("watchSubscriptions")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "TASK").eq("entityId", args.taskId as unknown as string)
      )
      .collect();

    if (taskWatchers.length > 0) {
      await ctx.db.insert("activities", {
        projectId: task.projectId,
        actorType: "SYSTEM",
        action: "TASK_WATCHERS_NOTIFIED",
        description: `${taskWatchers.length} watcher(s) notified for task transition`,
        targetType: "TASK",
        targetId: args.taskId,
        taskId: args.taskId,
        metadata: {
          fromStatus,
          toStatus,
          watchers: taskWatchers.map((watcher) => watcher.userId),
        },
      });
    }

    // Notifications: when transitioning to ASSIGNED, notify each assignee
    if (["READY", "ASSIGNED"].includes(toStatus) && updatedTask && updatedTask.assigneeIds.length > 0) {
      for (const agentId of updatedTask.assigneeIds) {
        await ctx.db.insert("notifications", {
          projectId: updatedTask.projectId,
          agentId,
          type: "TASK_ASSIGNED",
          title: `Task assigned: ${updatedTask.title}`,
          body: updatedTask.description ?? undefined,
          taskId: args.taskId,
          fromAgentId: args.actorAgentId,
          fromUserId: args.actorUserId,
        });
      }
    }
    
    return {
      success: true,
      task: updatedTask,
      transition,
      idempotencyHit: false,
    };
  },
});

export const supersedeWorkflowAttempt = mutation({
  args: {
    taskId: v.id("tasks"),
    runId: v.string(),
    stepId: v.string(),
    retryCount: v.number(),
    reason: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const existingTransition = await ctx.db
      .query("taskTransitions")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    if (existingTransition) {
      return {
        success: true,
        task: await ctx.db.get(args.taskId),
        transition: existingTransition,
        idempotencyHit: true,
      };
    }

    const task = await ctx.db.get(args.taskId);
    if (!task) return { success: false, error: "Task not found" };

    const metadata = (task.metadata ?? {}) as Record<string, any>;
    const isOwnedAttempt = isExecutorOwnedWorkflowAttempt(task, {
      taskId: args.taskId,
      runId: args.runId,
      stepId: args.stepId,
    });
    if (!isOwnedAttempt) {
      return {
        success: false,
        error: "Task is not the matching executor-owned workflow attempt",
      };
    }
    if (task.status === "DONE" || task.status === "CANCELED") {
      return {
        success: true,
        task,
        idempotencyHit: task.status === "CANCELED",
      };
    }

    const operatorControl = await getEffectiveOperatorControl(ctx.db, task.projectId);
    const operatorGate = evaluateOperatorGate({
      mode: operatorControl.mode,
      actorType: "SYSTEM",
      operation: "TRANSITION",
    });
    if (operatorGate.decision !== "ALLOW") {
      return { success: false, error: operatorGate.reason };
    }

    const now = Date.now();
    const fromStatus = task.status as TaskStatus;
    await ctx.db.patch(args.taskId, {
      status: "CANCELED",
      stateEnteredAt: now,
      completedAt: now,
      metadata: {
        ...metadata,
        workflowAttempt: {
          ...(metadata.workflowAttempt ?? {}),
          supersededAt: now,
          supersededReason: args.reason,
          retryCount: args.retryCount,
        },
      },
    });
    const transitionId = await ctx.db.insert("taskTransitions", {
      tenantId: task.tenantId,
      projectId: task.projectId,
      idempotencyKey: args.idempotencyKey,
      taskId: args.taskId,
      fromStatus,
      toStatus: "CANCELED",
      actorType: "SYSTEM",
      actorUserId: "workflow-executor",
      reason: `Superseded workflow attempt: ${args.reason}`,
      validationResult: { valid: true },
      artifactsSnapshot: {
        retryCount: args.retryCount,
        workflowRunId: args.runId,
        workflowStepId: args.stepId,
      },
    });
    await appendChangeRecord(ctx.db as any, {
      tenantId: task.tenantId,
      projectId: task.projectId,
      type: "TASK_TRANSITIONED",
      summary: `Workflow attempt ${args.taskId} superseded`,
      payload: {
        taskId: args.taskId,
        fromStatus,
        toStatus: "CANCELED",
        runId: args.runId,
        stepId: args.stepId,
        retryCount: args.retryCount,
      },
      relatedTable: "tasks",
      relatedId: args.taskId,
    });
    await ctx.db.insert("activities", {
      projectId: task.projectId,
      actorType: "SYSTEM",
      actorId: "workflow-executor",
      action: "TASK_TRANSITION",
      description: `Workflow attempt superseded: ${fromStatus} → CANCELED`,
      targetType: "TASK",
      targetId: args.taskId,
      taskId: args.taskId,
      beforeState: { status: fromStatus },
      afterState: { status: "CANCELED" },
      metadata: {
        runId: args.runId,
        stepId: args.stepId,
        retryCount: args.retryCount,
      },
    });
    await logTaskEvent(ctx, {
      taskId: args.taskId,
      projectId: task.projectId,
      eventType: "TASK_TRANSITION",
      actorType: "SYSTEM",
      actorId: "workflow-executor",
      relatedId: transitionId,
      beforeState: { status: fromStatus },
      afterState: { status: "CANCELED" },
      metadata: {
        reason: args.reason,
        runId: args.runId,
        stepId: args.stepId,
        retryCount: args.retryCount,
        operatorMode: operatorControl.mode,
      },
    });

    return {
      success: true,
      task: await ctx.db.get(args.taskId),
      transition: await ctx.db.get(transitionId),
      idempotencyHit: false,
    };
  },
});

export const resolveApprovedWorkflowGate = mutation({
  args: {
    taskId: v.id("tasks"),
    approvalId: v.id("approvals"),
    runId: v.string(),
    stepId: v.string(),
    evidenceDigest: v.string(),
    targetVersion: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const existingTransition = await ctx.db
      .query("taskTransitions")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    if (existingTransition) {
      return {
        success: true,
        task: await ctx.db.get(args.taskId),
        transition: existingTransition,
        idempotencyHit: true,
      };
    }

    const [task, approval] = await Promise.all([
      ctx.db.get(args.taskId),
      ctx.db.get(args.approvalId),
    ]);
    if (!task) return { success: false, error: "Task not found" };
    if (!approval) return { success: false, error: "Approval not found" };

    const metadata = (task.metadata ?? {}) as Record<string, any>;
    const gate = metadata.gate ?? {};
    const isMatchingGate = isExecutorOwnedWorkflowAttempt(task, {
      taskId: args.taskId,
      runId: args.runId,
      stepId: args.stepId,
    });
    const isMatchingApproval = isMatchingExplicitWorkflowGateApproval(
      task,
      approval,
      {
        taskId: args.taskId,
        runId: args.runId,
        stepId: args.stepId,
        evidenceDigest: args.evidenceDigest,
        targetVersion: args.targetVersion,
      }
    );
    if (!isMatchingGate) {
      return { success: false, error: "Task is not the matching workflow gate" };
    }
    if (!isMatchingApproval) {
      return {
        success: false,
        error: "A matching explicit human approval is required",
      };
    }
    if (task.status === "DONE") {
      return { success: true, task, idempotencyHit: true };
    }
    if (task.status === "FAILED" || task.status === "CANCELED") {
      return {
        success: false,
        error: `Cannot resolve a workflow gate from ${task.status}`,
      };
    }

    const operatorControl = await getEffectiveOperatorControl(ctx.db, task.projectId);
    const operatorGate = evaluateOperatorGate({
      mode: operatorControl.mode,
      actorType: "HUMAN",
      operation: "TRANSITION",
    });
    if (operatorGate.decision === "DENY") {
      return { success: false, error: operatorGate.reason };
    }

    const now = Date.now();
    const fromStatus = task.status as TaskStatus;
    const deliverable = {
      summary: `Approved workflow gate ${args.stepId}`,
      content: "APPROVED",
      artifactIds: [],
    };
    const reviewChecklist = {
      type: "WORKFLOW_GATE",
      items: [
        {
          label: "Explicit human approval is bound to this evidence digest",
          checked: true,
          note: approval.decisionReason,
        },
      ],
    };
    await ctx.db.patch(args.taskId, {
      status: "DONE",
      stateEnteredAt: now,
      completedAt: now,
      deliverable,
      reviewChecklist,
      metadata: {
        ...metadata,
        gate: {
          ...gate,
          approvalId: args.approvalId,
          approvedAt: approval.decidedAt,
          approvedByUserId: approval.decidedByUserId,
          decisionReason: approval.decisionReason,
        },
      },
    });
    const transitionId = await ctx.db.insert("taskTransitions", {
      tenantId: task.tenantId,
      projectId: task.projectId,
      idempotencyKey: args.idempotencyKey,
      taskId: args.taskId,
      fromStatus,
      toStatus: "DONE",
      actorType: "HUMAN",
      actorUserId: approval.decidedByUserId,
      reason: approval.decisionReason ?? "Approved workflow gate",
      validationResult: { valid: true },
      artifactsSnapshot: {
        deliverable,
        reviewChecklist,
        approvalId: args.approvalId,
        evidenceDigest: args.evidenceDigest,
        targetVersion: args.targetVersion,
      },
    });
    await appendChangeRecord(ctx.db as any, {
      tenantId: task.tenantId,
      projectId: task.projectId,
      type: "TASK_TRANSITIONED",
      summary: `Approved workflow gate ${args.taskId} resolved`,
      payload: {
        taskId: args.taskId,
        approvalId: args.approvalId,
        fromStatus,
        toStatus: "DONE",
        runId: args.runId,
        stepId: args.stepId,
        evidenceDigest: args.evidenceDigest,
        targetVersion: args.targetVersion,
        actorUserId: approval.decidedByUserId,
      },
      relatedTable: "tasks",
      relatedId: args.taskId,
    });
    await ctx.db.insert("activities", {
      projectId: task.projectId,
      actorType: "HUMAN",
      actorId: approval.decidedByUserId,
      action: "TASK_TRANSITION",
      description: `Approved workflow gate resolved: ${fromStatus} → DONE`,
      targetType: "TASK",
      targetId: args.taskId,
      taskId: args.taskId,
      beforeState: { status: fromStatus },
      afterState: { status: "DONE" },
      metadata: {
        approvalId: args.approvalId,
        evidenceDigest: args.evidenceDigest,
        targetVersion: args.targetVersion,
      },
    });
    await logTaskEvent(ctx, {
      taskId: args.taskId,
      projectId: task.projectId,
      eventType: "TASK_TRANSITION",
      actorType: "HUMAN",
      actorId: approval.decidedByUserId,
      relatedId: transitionId,
      beforeState: { status: fromStatus },
      afterState: { status: "DONE" },
      metadata: {
        reason: approval.decisionReason,
        approvalId: args.approvalId,
        evidenceDigest: args.evidenceDigest,
        targetVersion: args.targetVersion,
        operatorMode: operatorControl.mode,
      },
    });

    return {
      success: true,
      task: await ctx.db.get(args.taskId),
      transition: await ctx.db.get(transitionId),
      idempotencyHit: false,
    };
  },
});

export const assign = mutation({
  args: {
    taskId: v.id("tasks"),
    agentIds: v.array(v.id("agents")),
    actorType: v.union(v.literal("AGENT"), v.literal("HUMAN"), v.literal("SYSTEM")),
    actorUserId: v.optional(v.string()),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string; task?: any }> => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      return { success: false, error: "Task not found" };
    }
    
    // Update assignees
    const assigneeInstanceIds = await resolveAssigneeInstanceIds(ctx, args.agentIds);
    await ctx.db.patch(args.taskId, {
      assigneeIds: args.agentIds,
      assigneeInstanceIds,
    });
    
    // If task is in INBOX, enter the canonical execution-ready state.
    if (task.status === "INBOX") {
      return await ctx.runMutation(api.tasks.transition, {
        taskId: args.taskId,
        toStatus: "READY",
        actorType: args.actorType,
        actorUserId: args.actorUserId,
        idempotencyKey: args.idempotencyKey,
        reason: `Assigned to ${args.agentIds.length} agent(s)`,
      });
    }
    
    const updatedTask = await ctx.db.get(args.taskId);
    return { success: true, task: updatedTask };
  },
});

/**
 * Update editable task fields.
 * Status changes are routed through the state-machine transition mutation.
 */
export const update = mutation({
  args: {
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    priority: v.optional(v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4))),
    status: v.optional(taskStatusValidator),
    type: v.optional(taskTypeValidator),
    estimatedCost: v.optional(v.number()),
    assigneeIds: v.optional(v.array(v.id("agents"))),
    dueAt: v.optional(v.union(v.number(), v.null())),
    workPlan: v.optional(v.object({
      bullets: v.array(v.string()),
      estimatedCost: v.optional(v.number()),
      estimatedDuration: v.optional(v.string()),
    })),
    deliverable: v.optional(v.object({
      summary: v.optional(v.string()),
      content: v.optional(v.string()),
      artifactIds: v.optional(v.array(v.string())),
    })),
    reviewChecklist: v.optional(v.object({
      type: v.string(),
      items: v.array(v.object({
        label: v.string(),
        checked: v.boolean(),
        note: v.optional(v.string()),
      })),
    })),
    actorUserId: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Task not found");
    }

    // Route status updates through transition rules.
    if (args.status && args.status !== task.status) {
      const transition = await ctx.runMutation(api.tasks.transition, {
        taskId: args.taskId,
        toStatus: args.status,
        actorType: "HUMAN",
        actorUserId: args.actorUserId ?? "operator",
        idempotencyKey: args.idempotencyKey ?? `update-status:${args.taskId}:${args.status}:${args.actorUserId ?? "operator"}`,
        reason: "Task updated from editor",
        workPlan: args.workPlan ?? task.workPlan,
        deliverable: args.deliverable ?? task.deliverable,
        reviewChecklist: args.reviewChecklist ?? task.reviewChecklist,
        blockedReason: task.blockedReason,
      });

      if (!transition.success) {
        throw new Error(
          transition.errors?.map((e: { message: string }) => e.message).join(", ") ||
            "Status transition failed"
        );
      }
    }

    const patch: Record<string, unknown> = {};
    if (args.title !== undefined) patch.title = args.title.trim();
    if (args.description !== undefined) patch.description = args.description.trim() || undefined;
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.type !== undefined) patch.type = args.type as TaskType;
    if (args.estimatedCost !== undefined) patch.estimatedCost = args.estimatedCost;
    if (args.assigneeIds !== undefined) {
      patch.assigneeIds = args.assigneeIds;
      patch.assigneeInstanceIds = await resolveAssigneeInstanceIds(ctx, args.assigneeIds);
    }
    if (args.dueAt !== undefined) patch.dueAt = args.dueAt ?? undefined;
    if (args.workPlan !== undefined) patch.workPlan = args.workPlan;
    if (args.deliverable !== undefined) patch.deliverable = args.deliverable;
    if (args.reviewChecklist !== undefined) patch.reviewChecklist = args.reviewChecklist;

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(args.taskId, patch);
      await ctx.db.insert("activities", {
        projectId: task.projectId,
        actorType: "HUMAN",
        actorId: args.actorUserId ?? "operator",
        action: "TASK_UPDATED",
        description: `Task "${args.title ?? task.title}" updated`,
        targetType: "TASK",
        targetId: args.taskId,
        taskId: args.taskId,
        metadata: { updatedFields: Object.keys(patch) },
      });
    }

    return await ctx.db.get(args.taskId);
  },
});
