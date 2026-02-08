/**
 * Convex Database Schema — V0
 * 
 * Aligned with Bootstrap Kit (docs/openclaw-bootstrap/schema/SCHEMA.md)
 * Source of truth for Mission Control data model.
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ============================================================================
// ENUMS (as union types)
// ============================================================================

const agentRole = v.union(
  v.literal("INTERN"),
  v.literal("SPECIALIST"),
  v.literal("LEAD")
);

const agentStatus = v.union(
  v.literal("ACTIVE"),
  v.literal("PAUSED"),
  v.literal("DRAINED"),
  v.literal("QUARANTINED"),
  v.literal("OFFLINE")
);

const taskStatus = v.union(
  v.literal("INBOX"),
  v.literal("ASSIGNED"),
  v.literal("IN_PROGRESS"),
  v.literal("REVIEW"),
  v.literal("NEEDS_APPROVAL"),
  v.literal("BLOCKED"),
  v.literal("FAILED"),
  v.literal("DONE"),
  v.literal("CANCELED")
);

const taskType = v.union(
  v.literal("CONTENT"),
  v.literal("SOCIAL"),
  v.literal("EMAIL_MARKETING"),
  v.literal("CUSTOMER_RESEARCH"),
  v.literal("SEO_RESEARCH"),
  v.literal("ENGINEERING"),
  v.literal("DOCS"),
  v.literal("OPS")
);

const taskPriority = v.union(
  v.literal(1), // critical
  v.literal(2), // high
  v.literal(3), // normal
  v.literal(4)  // low
);

const actorType = v.union(
  v.literal("AGENT"),
  v.literal("HUMAN"),
  v.literal("SYSTEM")
);

const messageType = v.union(
  v.literal("COMMENT"),
  v.literal("WORK_PLAN"),
  v.literal("PROGRESS"),
  v.literal("ARTIFACT"),
  v.literal("REVIEW"),
  v.literal("APPROVAL_REQUEST"),
  v.literal("SYSTEM")
);

const riskLevel = v.union(
  v.literal("GREEN"),
  v.literal("YELLOW"),
  v.literal("RED")
);

const reviewType = v.union(
  v.literal("PRAISE"),
  v.literal("REFUTE"),
  v.literal("CHANGESET"),
  v.literal("APPROVE")
);

const reviewStatus = v.union(
  v.literal("PENDING"),
  v.literal("ACCEPTED"),
  v.literal("REJECTED"),
  v.literal("SUPERSEDED")
);

// ============================================================================
// SCHEMA
// ============================================================================

export default defineSchema({
  // -------------------------------------------------------------------------
  // PROJECTS (Multi-Project Workspaces)
  // -------------------------------------------------------------------------
  projects: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    
    // GitHub integration
    githubRepo: v.optional(v.string()), // e.g., "owner/repo"
    githubBranch: v.optional(v.string()),
    githubWebhookSecret: v.optional(v.string()),
    
    // Agent swarm configuration
    swarmConfig: v.optional(v.object({
      maxAgents: v.number(),
      defaultModel: v.optional(v.string()),
      autoScale: v.boolean(),
    })),
    
    // Per-project policy defaults (optional, merged with global policy)
    policyDefaults: v.optional(v.object({
      budgetDefaults: v.optional(v.any()),
      riskThresholds: v.optional(v.any()),
    })),
    
    // Metadata
    metadata: v.optional(v.any()),
  })
    .index("by_slug", ["slug"])
    .index("by_github_repo", ["githubRepo"]),

  // -------------------------------------------------------------------------
  // AGENTS
  // -------------------------------------------------------------------------
  agents: defineTable({
    // Project scope
    projectId: v.optional(v.id("projects")),
    // Identity
    name: v.string(),
    emoji: v.optional(v.string()),
    role: agentRole,
    status: agentStatus,
    
    // Workspace
    workspacePath: v.string(),
    soulVersionHash: v.optional(v.string()),
    
    // Config
    allowedTaskTypes: v.array(v.string()),
    allowedTools: v.optional(v.array(v.string())),
    
    // Budgets (flat, not nested)
    budgetDaily: v.number(),
    budgetPerRun: v.number(),
    spendToday: v.number(),
    spendResetAt: v.optional(v.number()),
    
    // Spawn config
    canSpawn: v.boolean(),
    maxSubAgents: v.number(),
    parentAgentId: v.optional(v.id("agents")),
    
    // State
    currentTaskId: v.optional(v.id("tasks")),
    lastHeartbeatAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    errorStreak: v.number(),
    
    // Metadata
    metadata: v.optional(v.any()),
  })
    .index("by_status", ["status"])
    .index("by_role", ["role"])
    .index("by_name", ["name"])
    .index("by_project", ["projectId"])
    .index("by_project_status", ["projectId", "status"]),

  // -------------------------------------------------------------------------
  // TASKS
  // -------------------------------------------------------------------------
  tasks: defineTable({
    // Project scope
    projectId: v.optional(v.id("projects")),
    
    // Idempotency
    idempotencyKey: v.optional(v.string()),
    
    // Core
    title: v.string(),
    description: v.optional(v.string()),
    type: taskType,
    status: taskStatus,
    priority: taskPriority,
    
    // Telegram thread reference
    threadRef: v.optional(v.object({
      chatId: v.string(),
      threadId: v.string(),
    })),
    
    // Assignment
    creatorAgentId: v.optional(v.id("agents")),
    assigneeIds: v.array(v.id("agents")),
    reviewerId: v.optional(v.id("agents")),
    
    // Hierarchy
    parentTaskId: v.optional(v.id("tasks")),
    
    // Work artifacts
    workPlan: v.optional(v.object({
      bullets: v.array(v.string()),
      estimatedCost: v.optional(v.number()),
      estimatedDuration: v.optional(v.string()),
    })),
    
    // Deliverable
    deliverable: v.optional(v.object({
      summary: v.optional(v.string()),
      content: v.optional(v.string()),
      artifactIds: v.optional(v.array(v.string())),
    })),
    
    // Review
    reviewChecklist: v.optional(v.object({
      type: v.string(),
      items: v.array(v.object({
        label: v.string(),
        checked: v.boolean(),
        note: v.optional(v.string()),
      })),
    })),
    reviewCycles: v.number(),
    
    // Cost tracking
    estimatedCost: v.optional(v.number()),
    actualCost: v.number(),
    budgetAllocated: v.optional(v.number()),
    budgetRemaining: v.optional(v.number()),
    
    // Timestamps
    dueAt: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    submittedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    
    // Scheduling (for calendar view)
    scheduledFor: v.optional(v.number()),
    recurrence: v.optional(v.object({
      frequency: v.union(
        v.literal("DAILY"),
        v.literal("WEEKLY"),
        v.literal("MONTHLY")
      ),
      interval: v.number(),
      daysOfWeek: v.optional(v.array(v.number())), // 0=Sun, 6=Sat
      endDate: v.optional(v.number()),
    })),
    
    // Labels
    labels: v.optional(v.array(v.string())),
    
    // Block reason
    blockedReason: v.optional(v.string()),

    // Redaction tracking
    redactedFields: v.optional(v.array(v.string())),
    
    // Provenance — where the task came from
    source: v.optional(v.union(
      v.literal("DASHBOARD"),
      v.literal("TELEGRAM"),
      v.literal("GITHUB"),
      v.literal("AGENT"),
      v.literal("API"),
      v.literal("TRELLO"),
      v.literal("SEED")
    )),
    sourceRef: v.optional(v.string()),     // e.g. "jaydubya818/repo#42", telegram msg id
    createdBy: v.optional(v.union(
      v.literal("HUMAN"),
      v.literal("AGENT"),
      v.literal("SYSTEM")
    )),
    createdByRef: v.optional(v.string()),  // agent id or user email
    
    // Metadata
    metadata: v.optional(v.any()),
  })
    .index("by_status", ["status"])
    .index("by_type", ["type"])
    .index("by_priority", ["priority"])
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_source", ["source"])
    .index("by_project", ["projectId"])
    .index("by_project_status", ["projectId", "status"]),

  // -------------------------------------------------------------------------
  // TASK TRANSITIONS (Immutable Audit Log)
  // -------------------------------------------------------------------------
  taskTransitions: defineTable({
    // Project scope (denormalized for efficient queries)
    projectId: v.optional(v.id("projects")),
    
    // Idempotency
    idempotencyKey: v.string(),
    
    // Reference
    taskId: v.id("tasks"),
    
    // Transition
    fromStatus: v.string(),
    toStatus: v.string(),
    
    // Actor (one of these should be set)
    actorType: actorType,
    actorAgentId: v.optional(v.id("agents")),
    actorUserId: v.optional(v.string()),
    
    // Validation
    validationResult: v.optional(v.object({
      valid: v.boolean(),
      errors: v.optional(v.array(v.object({
        field: v.string(),
        message: v.string(),
      }))),
    })),
    
    // Snapshot of artifacts at transition time
    artifactsSnapshot: v.optional(v.any()),
    
    // Context
    reason: v.optional(v.string()),
    sessionKey: v.optional(v.string()),
  })
    .index("by_task", ["taskId"])
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_project", ["projectId"]),

  // -------------------------------------------------------------------------
  // TASK EVENTS (Canonical timeline stream)
  // -------------------------------------------------------------------------
  taskEvents: defineTable({
    projectId: v.optional(v.id("projects")),
    taskId: v.id("tasks"),
    eventType: v.union(
      v.literal("TASK_CREATED"),
      v.literal("TASK_TRANSITION"),
      v.literal("POLICY_DECISION"),
      v.literal("APPROVAL_REQUESTED"),
      v.literal("APPROVAL_ESCALATED"),
      v.literal("APPROVAL_APPROVED"),
      v.literal("APPROVAL_DENIED"),
      v.literal("APPROVAL_EXPIRED"),
      v.literal("RUN_STARTED"),
      v.literal("RUN_COMPLETED"),
      v.literal("RUN_FAILED"),
      v.literal("TOOL_CALL"),
      v.literal("OPERATOR_CONTROL")
    ),
    actorType: actorType,
    actorId: v.optional(v.string()),
    relatedId: v.optional(v.string()),
    timestamp: v.number(),
    beforeState: v.optional(v.any()),
    afterState: v.optional(v.any()),
    metadata: v.optional(v.any()),
  })
    .index("by_task", ["taskId"])
    .index("by_project", ["projectId"])
    .index("by_project_task", ["projectId", "taskId"])
    .index("by_task_type", ["taskId", "eventType"]),

  // -------------------------------------------------------------------------
  // MESSAGES (Task Thread)
  // -------------------------------------------------------------------------
  messages: defineTable({
    // Project scope (denormalized for efficient queries)
    projectId: v.optional(v.id("projects")),
    
    // Idempotency
    idempotencyKey: v.optional(v.string()),
    
    // Reference
    taskId: v.id("tasks"),
    
    // Author
    authorType: actorType,
    authorAgentId: v.optional(v.id("agents")),
    authorUserId: v.optional(v.string()),
    
    // Content
    type: messageType,
    content: v.string(),
    contentRedacted: v.optional(v.string()),
    
    // Attachments
    artifacts: v.optional(v.array(v.object({
      name: v.string(),
      type: v.string(),
      url: v.optional(v.string()),
      content: v.optional(v.string()),
    }))),
    
    // Mentions
    mentions: v.optional(v.array(v.string())),
    
    // Threading
    replyToId: v.optional(v.id("messages")),
    
    // Telegram thread reference
    threadRef: v.optional(v.string()),
    
    // Redaction
    redactedFields: v.optional(v.array(v.string())),
    
    // Metadata
    metadata: v.optional(v.any()),
  })
    .index("by_task", ["taskId"])
    .index("by_author_agent", ["authorAgentId"])
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_project", ["projectId"]),

  // -------------------------------------------------------------------------
  // RUNS (Agent Execution Turns)
  // -------------------------------------------------------------------------
  runs: defineTable({
    // Project scope (denormalized for efficient queries)
    projectId: v.optional(v.id("projects")),
    
    // Idempotency
    idempotencyKey: v.string(),
    
    // References
    agentId: v.id("agents"),
    taskId: v.optional(v.id("tasks")),
    sessionKey: v.string(),
    
    // Timing
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    
    // Model usage
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    cacheReadTokens: v.optional(v.number()),
    cacheWriteTokens: v.optional(v.number()),
    
    // Cost
    costUsd: v.number(),
    budgetAllocated: v.optional(v.number()),
    
    // Status
    status: v.union(
      v.literal("RUNNING"),
      v.literal("COMPLETED"),
      v.literal("FAILED"),
      v.literal("TIMEOUT")
    ),
    error: v.optional(v.string()),
    
    // Metadata
    metadata: v.optional(v.any()),
  })
    .index("by_agent", ["agentId"])
    .index("by_task", ["taskId"])
    .index("by_session", ["sessionKey"])
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_project", ["projectId"]),

  // -------------------------------------------------------------------------
  // TOOL CALLS
  // -------------------------------------------------------------------------
  toolCalls: defineTable({
    // Project scope (denormalized for efficient queries)
    projectId: v.optional(v.id("projects")),
    
    // References
    runId: v.id("runs"),
    agentId: v.id("agents"),
    taskId: v.optional(v.id("tasks")),
    
    // Tool info
    toolName: v.string(),
    toolVersion: v.optional(v.string()),
    
    // Risk
    riskLevel: riskLevel,
    policyResult: v.optional(v.object({
      decision: v.string(),
      reason: v.string(),
      approvalId: v.optional(v.string()),
    })),
    
    // I/O (redacted)
    inputPreview: v.optional(v.string()),
    outputPreview: v.optional(v.string()),
    inputHash: v.optional(v.string()),
    outputHash: v.optional(v.string()),
    
    // Execution
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    
    // Status
    status: v.union(
      v.literal("PENDING"),
      v.literal("RUNNING"),
      v.literal("SUCCESS"),
      v.literal("FAILED"),
      v.literal("DENIED")
    ),
    error: v.optional(v.string()),
    retryCount: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_agent", ["agentId"])
    .index("by_task", ["taskId"])
    .index("by_risk", ["riskLevel"])
    .index("by_project", ["projectId"]),

  // -------------------------------------------------------------------------
  // APPROVALS
  // -------------------------------------------------------------------------
  approvals: defineTable({
    // Project scope
    projectId: v.optional(v.id("projects")),
    
    // Idempotency
    idempotencyKey: v.optional(v.string()),
    
    // References
    taskId: v.optional(v.id("tasks")),
    toolCallId: v.optional(v.id("toolCalls")),
    requestorAgentId: v.id("agents"),
    
    // Request
    actionType: v.string(),
    actionSummary: v.string(),
    riskLevel: v.union(v.literal("YELLOW"), v.literal("RED")),
    actionPayload: v.optional(v.any()),
    estimatedCost: v.optional(v.number()),
    rollbackPlan: v.optional(v.string()),
    justification: v.string(),
    
    // Status
    status: v.union(
      v.literal("PENDING"),
      v.literal("ESCALATED"),
      v.literal("APPROVED"),
      v.literal("DENIED"),
      v.literal("EXPIRED"),
      v.literal("CANCELED")
    ),
    
    // Decision
    decidedByAgentId: v.optional(v.id("agents")),
    decidedByUserId: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
    decisionReason: v.optional(v.string()),
    firstDecisionByUserId: v.optional(v.string()),
    firstDecisionAt: v.optional(v.number()),
    firstDecisionReason: v.optional(v.string()),
    escalationLevel: v.optional(v.number()),
    escalatedAt: v.optional(v.number()),
    escalatedBy: v.optional(v.string()),
    escalationReason: v.optional(v.string()),
    requiredDecisionCount: v.optional(v.number()),
    decisionCount: v.optional(v.number()),
    
    // Expiration
    expiresAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_task", ["taskId"])
    .index("by_requestor", ["requestorAgentId"])
    .index("by_project", ["projectId"])
    .index("by_project_status", ["projectId", "status"]),

  // -------------------------------------------------------------------------
  // ACTIVITIES (Audit Log)
  // -------------------------------------------------------------------------
  activities: defineTable({
    // Project scope
    projectId: v.optional(v.id("projects")),
    
    // Actor
    actorType: actorType,
    actorId: v.optional(v.string()),
    
    // Action
    action: v.string(),
    description: v.string(),
    
    // Target
    targetType: v.optional(v.string()),
    targetId: v.optional(v.string()),
    
    // Context
    taskId: v.optional(v.id("tasks")),
    agentId: v.optional(v.id("agents")),
    
    // Data
    beforeState: v.optional(v.any()),
    afterState: v.optional(v.any()),
    metadata: v.optional(v.any()),
  })
    .index("by_task", ["taskId"])
    .index("by_agent", ["agentId"])
    .index("by_action", ["action"])
    .index("by_project", ["projectId"]),

  // -------------------------------------------------------------------------
  // ALERTS
  // -------------------------------------------------------------------------
  alerts: defineTable({
    // Project scope
    projectId: v.optional(v.id("projects")),
    
    // Alert info
    severity: v.union(
      v.literal("INFO"),
      v.literal("WARNING"),
      v.literal("ERROR"),
      v.literal("CRITICAL")
    ),
    type: v.string(),
    title: v.string(),
    description: v.string(),
    
    // Context
    agentId: v.optional(v.id("agents")),
    taskId: v.optional(v.id("tasks")),
    runId: v.optional(v.id("runs")),
    
    // Status
    status: v.union(
      v.literal("OPEN"),
      v.literal("ACKNOWLEDGED"),
      v.literal("RESOLVED"),
      v.literal("IGNORED")
    ),
    acknowledgedBy: v.optional(v.string()),
    acknowledgedAt: v.optional(v.number()),
    resolvedAt: v.optional(v.number()),
    resolutionNote: v.optional(v.string()),
    
    // Metadata
    metadata: v.optional(v.any()),
  })
    .index("by_status", ["status"])
    .index("by_severity", ["severity"])
    .index("by_agent", ["agentId"])
    .index("by_task", ["taskId"])
    .index("by_project", ["projectId"]),

  // -------------------------------------------------------------------------
  // NOTIFICATIONS (@mentions, assignments — delivered to agents via heartbeat)
  // -------------------------------------------------------------------------
  notifications: defineTable({
    // Project scope
    projectId: v.optional(v.id("projects")),
    
    agentId: v.id("agents"),
    type: v.union(
      v.literal("MENTION"),
      v.literal("TASK_ASSIGNED"),
      v.literal("TASK_TRANSITION"),
      v.literal("APPROVAL_REQUESTED"),
      v.literal("APPROVAL_DECIDED"),
      v.literal("SYSTEM")
    ),
    title: v.string(),
    body: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
    messageId: v.optional(v.id("messages")),
    approvalId: v.optional(v.id("approvals")),
    fromAgentId: v.optional(v.id("agents")),
    fromUserId: v.optional(v.string()),
    readAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  })
    .index("by_agent", ["agentId"])
    .index("by_task", ["taskId"])
    .index("by_project", ["projectId"]),

  // -------------------------------------------------------------------------
  // THREAD SUBSCRIPTIONS (agents subscribed to task threads)
  // -------------------------------------------------------------------------
  threadSubscriptions: defineTable({
    // Project scope
    projectId: v.optional(v.id("projects")),
    
    agentId: v.id("agents"),
    taskId: v.id("tasks"),
    subscribedAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_agent", ["agentId"])
    .index("by_task", ["taskId"])
    .index("by_agent_task", ["agentId", "taskId"])
    .index("by_project", ["projectId"]),

  // -------------------------------------------------------------------------
  // SAVED VIEWS (operator filters/presets)
  // -------------------------------------------------------------------------
  savedViews: defineTable({
    projectId: v.id("projects"),
    ownerUserId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    scope: v.union(
      v.literal("KANBAN"),
      v.literal("APPROVALS"),
      v.literal("AGENTS"),
      v.literal("SEARCH")
    ),
    filters: v.any(),
    isShared: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_owner", ["ownerUserId"])
    .index("by_project_owner", ["projectId", "ownerUserId"])
    .index("by_project_scope", ["projectId", "scope"]),

  // -------------------------------------------------------------------------
  // WATCH SUBSCRIPTIONS (user watchlist for entities)
  // -------------------------------------------------------------------------
  watchSubscriptions: defineTable({
    projectId: v.optional(v.id("projects")),
    userId: v.string(),
    entityType: v.union(
      v.literal("TASK"),
      v.literal("APPROVAL"),
      v.literal("AGENT"),
      v.literal("PROJECT")
    ),
    entityId: v.string(),
    createdAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_user", ["userId"])
    .index("by_entity", ["entityType", "entityId"])
    .index("by_user_entity", ["userId", "entityType", "entityId"])
    .index("by_project", ["projectId"]),

  // -------------------------------------------------------------------------
  // OPERATOR CONTROLS (global/project execution mode)
  // -------------------------------------------------------------------------
  operatorControls: defineTable({
    projectId: v.optional(v.id("projects")),
    mode: v.union(
      v.literal("NORMAL"),
      v.literal("PAUSED"),
      v.literal("DRAINING"),
      v.literal("QUARANTINED")
    ),
    reason: v.optional(v.string()),
    updatedBy: v.string(),
    updatedAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_project", ["projectId"])
    .index("by_project_mode", ["projectId", "mode"])
    .index("by_updated_at", ["updatedAt"]),

  // -------------------------------------------------------------------------
  // AGENT DOCUMENTS (WORKING.md, daily notes, session memory)
  // -------------------------------------------------------------------------
  agentDocuments: defineTable({
    // Project scope
    projectId: v.optional(v.id("projects")),
    
    agentId: v.id("agents"),
    type: v.union(
      v.literal("WORKING_MD"),
      v.literal("DAILY_NOTE"),
      v.literal("SESSION_MEMORY")
    ),
    content: v.string(),
    updatedAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_agent", ["agentId"])
    .index("by_agent_type", ["agentId", "type"])
    .index("by_project", ["projectId"]),

  // -------------------------------------------------------------------------
  // EXECUTION REQUESTS (Multi-Executor Routing)
  // -------------------------------------------------------------------------
  executionRequests: defineTable({
    // Project scope
    projectId: v.optional(v.id("projects")),
    
    // References
    taskId: v.optional(v.id("tasks")),
    requestedBy: v.id("agents"),
    assignedTo: v.optional(v.string()), // Executor identifier
    
    // Request details
    type: v.union(
      v.literal("CODE_CHANGE"),
      v.literal("RESEARCH"),
      v.literal("CONTENT"),
      v.literal("EMAIL"),
      v.literal("SOCIAL"),
      v.literal("OPS")
    ),
    executor: v.union(
      v.literal("CURSOR"),
      v.literal("CLAUDE_CODE"),
      v.literal("OPENCLAW_AGENT")
    ),
    
    // Status
    status: v.union(
      v.literal("PENDING"),
      v.literal("ASSIGNED"),
      v.literal("IN_PROGRESS"),
      v.literal("COMPLETED"),
      v.literal("FAILED")
    ),
    
    // Payload and result
    payload: v.any(),
    result: v.optional(v.any()),
    
    // Timestamps
    requestedAt: v.number(),
    assignedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    
    // Metadata
    metadata: v.optional(v.any()),
  })
    .index("by_status", ["status"])
    .index("by_project", ["projectId"])
    .index("by_task", ["taskId"])
    .index("by_executor", ["executor"])
    .index("by_project_status", ["projectId", "status"]),

  // -------------------------------------------------------------------------
  // POLICIES
  // -------------------------------------------------------------------------
  policies: defineTable({
    // Project scope (optional: null = global policy)
    projectId: v.optional(v.id("projects")),
    
    version: v.number(),
    name: v.string(),
    scopeType: v.union(
      v.literal("GLOBAL"),
      v.literal("AGENT"),
      v.literal("TASK_TYPE")
    ),
    scopeId: v.optional(v.string()),
    
    // Rules
    rules: v.any(),
    toolRiskMap: v.optional(v.any()),
    shellAllowlist: v.optional(v.array(v.string())),
    shellBlocklist: v.optional(v.array(v.string())),
    fileReadPaths: v.optional(v.array(v.string())),
    fileWritePaths: v.optional(v.array(v.string())),
    networkAllowlist: v.optional(v.array(v.string())),
    budgetDefaults: v.optional(v.any()),
    spawnLimits: v.optional(v.any()),
    loopThresholds: v.optional(v.any()),
    
    // Status
    active: v.boolean(),
    createdBy: v.optional(v.string()),
    notes: v.optional(v.string()),
  })
    .index("by_active", ["active"])
    .index("by_name", ["name"])
    .index("by_project", ["projectId"])
    .index("by_project_active", ["projectId", "active"]),
  
  // ============================================================================
  // WEBHOOKS
  // ============================================================================
  
  webhooks: defineTable({
    projectId: v.optional(v.id("projects")),
    
    name: v.string(),
    url: v.string(),
    secret: v.string(), // For HMAC signature
    
    // Events to subscribe to
    events: v.array(v.string()),
    
    // Filters
    filters: v.optional(v.object({
      taskTypes: v.optional(v.array(v.string())),
      agentIds: v.optional(v.array(v.id("agents"))),
      statuses: v.optional(v.array(v.string())),
    })),
    
    // Status
    active: v.boolean(),
    
    // Stats
    deliveryCount: v.number(),
    failureCount: v.number(),
    lastDeliveryAt: v.optional(v.number()),
    lastFailureAt: v.optional(v.number()),
    
    createdBy: v.optional(v.string()),
  })
    .index("by_project", ["projectId"])
    .index("by_active", ["active"])
    .index("by_project_active", ["projectId", "active"]),
  
  webhookDeliveries: defineTable({
    webhookId: v.id("webhooks"),
    projectId: v.optional(v.id("projects")),
    
    event: v.string(),
    payload: v.any(),
    
    // Delivery
    url: v.string(),
    status: v.union(
      v.literal("PENDING"),
      v.literal("DELIVERED"),
      v.literal("FAILED"),
      v.literal("RETRYING")
    ),
    
    attempts: v.number(),
    maxAttempts: v.number(),
    nextRetryAt: v.optional(v.number()),
    
    // Response
    responseStatus: v.optional(v.number()),
    responseBody: v.optional(v.string()),
    error: v.optional(v.string()),
    
    deliveredAt: v.optional(v.number()),
  })
    .index("by_webhook", ["webhookId"])
    .index("by_status", ["status"])
    .index("by_next_retry", ["nextRetryAt"]),
  
  // ============================================================================
  // PEER REVIEWS
  // ============================================================================
  
  reviews: defineTable({
    projectId: v.id("projects"),
    taskId: v.id("tasks"),
    
    // Review metadata
    type: reviewType,
    status: reviewStatus,
    
    // Reviewer
    reviewerAgentId: v.optional(v.id("agents")),
    reviewerUserId: v.optional(v.string()),
    
    // Target (what's being reviewed)
    targetType: v.union(
      v.literal("TASK"),
      v.literal("DELIVERABLE"),
      v.literal("ARTIFACT"),
      v.literal("CODE_CHANGE")
    ),
    targetId: v.optional(v.string()),
    
    // Review content
    summary: v.string(),
    details: v.optional(v.string()),
    score: v.optional(v.number()), // 1-10 for PRAISE
    severity: v.optional(v.union(
      v.literal("MINOR"),
      v.literal("MAJOR"),
      v.literal("CRITICAL")
    )), // For REFUTE
    
    // For CHANGESET type
    changeset: v.optional(v.object({
      files: v.array(v.object({
        path: v.string(),
        action: v.union(v.literal("ADD"), v.literal("MODIFY"), v.literal("DELETE")),
        diff: v.optional(v.string()),
      })),
      description: v.string(),
    })),
    
    // Response/resolution
    responseBy: v.optional(v.id("agents")),
    responseText: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
    
    // Metadata
    metadata: v.optional(v.any()),
  })
    .index("by_project", ["projectId"])
    .index("by_task", ["taskId"])
    .index("by_status", ["status"])
    .index("by_type", ["type"])
    .index("by_reviewer", ["reviewerAgentId"])
    .index("by_task_status", ["taskId", "status"]),

  // -------------------------------------------------------------------------
  // TASK DEPENDENCIES (DAG edges for coordinator decomposition)
  // -------------------------------------------------------------------------
  taskDependencies: defineTable({
    parentTaskId: v.id("tasks"),
    taskId: v.id("tasks"),        // The task that has the dependency
    dependsOnTaskId: v.id("tasks"), // The task it depends on
  })
    .index("by_parent", ["parentTaskId"])
    .index("by_task", ["taskId"])
    .index("by_depends_on", ["dependsOnTaskId"]),

  // -------------------------------------------------------------------------
  // AGENT PERFORMANCE (Learning System — Aggregated Metrics)
  // -------------------------------------------------------------------------
  agentPerformance: defineTable({
    agentId: v.id("agents"),
    projectId: v.optional(v.id("projects")),
    taskType: v.string(),
    successCount: v.number(),
    failureCount: v.number(),
    avgCompletionTimeMs: v.number(),
    avgCostUsd: v.number(),
    totalTasksCompleted: v.number(),
    lastUpdatedAt: v.number(),
  })
    .index("by_agent", ["agentId"])
    .index("by_agent_type", ["agentId", "taskType"])
    .index("by_project", ["projectId"]),

  // -------------------------------------------------------------------------
  // AGENT PATTERNS (Learning System — Discovered Strengths/Weaknesses)
  // -------------------------------------------------------------------------
  agentPatterns: defineTable({
    agentId: v.id("agents"),
    projectId: v.optional(v.id("projects")),
    pattern: v.string(),
    confidence: v.number(),
    evidence: v.array(v.string()),
    discoveredAt: v.number(),
    lastSeenAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_agent", ["agentId"])
    .index("by_agent_pattern", ["agentId", "pattern"])
    .index("by_project", ["projectId"]),

  // -------------------------------------------------------------------------
  // ORG MEMBERS (Human Team Members + Org Chart + RBAC)
  // -------------------------------------------------------------------------
  orgMembers: defineTable({
    projectId: v.optional(v.id("projects")),
    
    // Identity
    name: v.string(),
    email: v.optional(v.string()),
    role: v.string(), // e.g., "CEO", "CSO", "Engineer"
    title: v.optional(v.string()),
    avatar: v.optional(v.string()),
    
    // Org hierarchy
    parentMemberId: v.optional(v.id("orgMembers")),
    level: v.number(), // 0 = top level (CEO), 1 = reports to CEO, etc.
    
    // Responsibilities
    responsibilities: v.optional(v.array(v.string())),
    
    // ---- RBAC (Role-Based Access Control) ----
    
    // System-wide role: determines base permissions
    systemRole: v.optional(v.union(
      v.literal("OWNER"),       // Full access to everything
      v.literal("ADMIN"),       // Manage users, all projects
      v.literal("MANAGER"),     // Manage assigned projects
      v.literal("MEMBER"),      // Edit access to assigned projects
      v.literal("VIEWER")       // Read-only access
    )),
    
    // Per-project access: overrides systemRole for specific projects
    // Array of { projectId, accessLevel } pairs
    projectAccess: v.optional(v.array(v.object({
      projectId: v.id("projects"),
      accessLevel: v.union(
        v.literal("ADMIN"),     // Full control of this project
        v.literal("EDIT"),      // Can create/edit tasks, manage agents
        v.literal("VIEW")       // Read-only access to this project
      ),
    }))),
    
    // Granular permissions (override systemRole for fine-tuning)
    permissions: v.optional(v.array(v.string())),
    // Available permissions:
    // "tasks.create", "tasks.edit", "tasks.delete", "tasks.assign"
    // "agents.view", "agents.manage", "agents.configure"
    // "approvals.view", "approvals.decide"
    // "budget.view", "budget.manage"
    // "people.view", "people.manage", "people.invite"
    // "projects.create", "projects.edit", "projects.delete"
    // "policies.view", "policies.manage"
    // "settings.manage"
    
    // Status
    active: v.boolean(),
    
    // Invite tracking
    invitedAt: v.optional(v.number()),
    invitedBy: v.optional(v.id("orgMembers")),
    lastLoginAt: v.optional(v.number()),
    
    // Metadata
    metadata: v.optional(v.any()),
  })
    .index("by_project", ["projectId"])
    .index("by_parent", ["parentMemberId"])
    .index("by_level", ["level"])
    .index("by_email", ["email"])
    // NOTE: systemRole is optional — queries using this index should filter
    // for defined values (e.g., .filter(q => q.neq(q.field("systemRole"), undefined)))
    // to exclude records where systemRole is not set.
    .index("by_system_role", ["systemRole"]),

  // -------------------------------------------------------------------------
  // CAPTURES (Visual Artifacts Gallery)
  // -------------------------------------------------------------------------
  captures: defineTable({
    projectId: v.optional(v.id("projects")),
    
    // Reference
    taskId: v.optional(v.id("tasks")),
    agentId: v.optional(v.id("agents")),
    
    // Artifact details
    title: v.string(),
    description: v.optional(v.string()),
    type: v.union(
      v.literal("SCREENSHOT"),
      v.literal("DIAGRAM"),
      v.literal("MOCKUP"),
      v.literal("CHART"),
      v.literal("VIDEO"),
      v.literal("OTHER")
    ),
    
    // Storage
    url: v.optional(v.string()), // External URL or Convex file storage ID
    fileStorageId: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    
    // Metadata
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    fileSize: v.optional(v.number()),
    mimeType: v.optional(v.string()),
    
    // Tags
    tags: v.optional(v.array(v.string())),
    
    // Timestamps
    capturedAt: v.number(),
    
    metadata: v.optional(v.any()),
  })
    .index("by_project", ["projectId"])
    .index("by_task", ["taskId"])
    .index("by_agent", ["agentId"])
    .index("by_type", ["type"])
    .index("by_captured_at", ["capturedAt"]),
});
