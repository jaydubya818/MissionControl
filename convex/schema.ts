/**
 * Convex Database Schema
 * 
 * Defines all tables and their structure for Mission Control.
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Agents: Autonomous OpenClaw sessions
  agents: defineTable({
    name: v.string(),
    sessionKey: v.string(),
    autonomyLevel: v.union(
      v.literal("intern"),
      v.literal("specialist"),
      v.literal("lead")
    ),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("drained"),
      v.literal("quarantined"),
      v.literal("stopped")
    ),
    modelConfig: v.object({
      primary: v.string(),
      fallback: v.optional(v.string()),
    }),
    toolPermissions: v.array(v.string()),
    budgets: v.object({
      dailyCap: v.number(),
      perRunCap: v.number(),
    }),
    currentTaskId: v.optional(v.id("tasks")),
    lastHeartbeat: v.optional(v.number()),
    errorStreak: v.number(),
    totalSpend: v.number(),
    todaySpend: v.number(),
    soulHash: v.optional(v.string()),
    metadata: v.any(),
  })
    .index("by_session_key", ["sessionKey"])
    .index("by_status", ["status"])
    .index("by_autonomy_level", ["autonomyLevel"]),

  // Tasks: Units of work with deterministic state machine
  tasks: defineTable({
    title: v.string(),
    description: v.string(),
    type: v.union(
      v.literal("content"),
      v.literal("social"),
      v.literal("email_marketing"),
      v.literal("customer_research"),
      v.literal("seo_research"),
      v.literal("engineering"),
      v.literal("docs"),
      v.literal("ops")
    ),
    status: v.union(
      v.literal("inbox"),
      v.literal("assigned"),
      v.literal("in_progress"),
      v.literal("review"),
      v.literal("needs_approval"),
      v.literal("blocked"),
      v.literal("done"),
      v.literal("canceled")
    ),
    priority: v.union(
      v.literal("high"),
      v.literal("medium"),
      v.literal("low")
    ),
    assigneeIds: v.array(v.id("agents")),
    reviewerIds: v.array(v.id("agents")),
    subscriberIds: v.array(v.id("agents")),
    threadRef: v.optional(v.string()),
    parentTaskId: v.optional(v.id("tasks")),
    dependsOn: v.array(v.id("tasks")),
    budget: v.number(),
    spend: v.number(),
    workPlan: v.optional(v.string()),
    deliverable: v.optional(v.string()),
    selfReview: v.optional(v.string()),
    evidence: v.optional(v.array(v.string())),
    blockedReason: v.optional(v.string()),
    metadata: v.any(),
  })
    .index("by_status", ["status"])
    .index("by_type", ["type"])
    .index("by_priority", ["priority"])
    .index("by_parent", ["parentTaskId"]),

  // Task Transitions: Audit log of status changes
  taskTransitions: defineTable({
    taskId: v.id("tasks"),
    fromStatus: v.string(),
    toStatus: v.string(),
    actor: v.union(
      v.literal("agent"),
      v.literal("human"),
      v.literal("system")
    ),
    actorId: v.optional(v.string()),
    reason: v.optional(v.string()),
    artifactsProvided: v.optional(v.array(v.string())),
    idempotencyKey: v.string(),
  })
    .index("by_task", ["taskId"])
    .index("by_idempotency_key", ["idempotencyKey"]),

  // Runs: Execution attempts of tasks by agents
  runs: defineTable({
    taskId: v.id("tasks"),
    agentId: v.id("agents"),
    sessionKey: v.string(),
    startTime: v.number(),
    endTime: v.optional(v.number()),
    status: v.union(
      v.literal("running"),
      v.literal("success"),
      v.literal("failed"),
      v.literal("blocked")
    ),
    cost: v.number(),
    toolCallCount: v.number(),
    errorMessage: v.optional(v.string()),
    idempotencyKey: v.string(),
  })
    .index("by_task", ["taskId"])
    .index("by_agent", ["agentId"])
    .index("by_status", ["status"])
    .index("by_idempotency_key", ["idempotencyKey"]),

  // Tool Calls: Log of every tool invocation
  toolCalls: defineTable({
    runId: v.id("runs"),
    taskId: v.id("tasks"),
    agentId: v.id("agents"),
    tool: v.string(),
    risk: v.union(
      v.literal("green"),
      v.literal("yellow"),
      v.literal("red")
    ),
    input: v.string(),
    output: v.string(),
    duration: v.number(),
    status: v.union(
      v.literal("success"),
      v.literal("failed"),
      v.literal("blocked"),
      v.literal("needs_approval")
    ),
    cost: v.optional(v.number()),
    approvalId: v.optional(v.id("approvals")),
  })
    .index("by_run", ["runId"])
    .index("by_task", ["taskId"])
    .index("by_agent", ["agentId"])
    .index("by_risk", ["risk"]),

  // Approvals: Requests for human approval of risky actions
  approvals: defineTable({
    taskId: v.id("tasks"),
    agentId: v.id("agents"),
    toolCallId: v.optional(v.id("toolCalls")),
    summary: v.string(),
    risk: v.union(v.literal("yellow"), v.literal("red")),
    reason: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("denied")
    ),
    approver: v.optional(v.string()),
    decision: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
  })
    .index("by_task", ["taskId"])
    .index("by_agent", ["agentId"])
    .index("by_status", ["status"]),

  // Messages: Comments and discussions on tasks
  messages: defineTable({
    taskId: v.id("tasks"),
    threadRef: v.string(),
    authorId: v.string(),
    authorType: v.union(v.literal("agent"), v.literal("human")),
    content: v.string(),
    mentions: v.array(v.string()),
    metadata: v.any(),
  })
    .index("by_task", ["taskId"])
    .index("by_thread", ["threadRef"])
    .index("by_author", ["authorId"]),

  // Activities: Audit log of all significant events
  activities: defineTable({
    type: v.string(),
    taskId: v.optional(v.id("tasks")),
    agentId: v.optional(v.id("agents")),
    actorId: v.optional(v.string()),
    actorType: v.union(
      v.literal("agent"),
      v.literal("human"),
      v.literal("system")
    ),
    summary: v.string(),
    details: v.optional(v.any()),
  })
    .index("by_type", ["type"])
    .index("by_task", ["taskId"])
    .index("by_agent", ["agentId"])
    .index("by_creation_time", ["_creationTime"]),

  // Alerts: Incidents requiring operator attention
  alerts: defineTable({
    type: v.string(),
    severity: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    ),
    taskId: v.optional(v.id("tasks")),
    agentId: v.optional(v.id("agents")),
    message: v.string(),
    resolved: v.boolean(),
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.string()),
  })
    .index("by_severity", ["severity"])
    .index("by_resolved", ["resolved"])
    .index("by_task", ["taskId"])
    .index("by_agent", ["agentId"]),

  // Policies: Risk classification and approval rules
  policies: defineTable({
    version: v.string(),
    active: v.boolean(),
    autonomyRules: v.any(),
    riskMap: v.any(),
    allowlists: v.any(),
    budgets: v.any(),
    spawnLimits: v.any(),
    loopDetection: v.any(),
  })
    .index("by_version", ["version"])
    .index("by_active", ["active"]),
});
