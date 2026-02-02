"use strict";
/**
 * Convex Database Schema — V0
 *
 * Aligned with Bootstrap Kit (docs/openclaw-bootstrap/schema/SCHEMA.md)
 * Source of truth for Mission Control data model.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("convex/server");
const values_1 = require("convex/values");
// ============================================================================
// ENUMS (as union types)
// ============================================================================
const agentRole = values_1.v.union(values_1.v.literal("INTERN"), values_1.v.literal("SPECIALIST"), values_1.v.literal("LEAD"));
const agentStatus = values_1.v.union(values_1.v.literal("ACTIVE"), values_1.v.literal("PAUSED"), values_1.v.literal("DRAINED"), values_1.v.literal("QUARANTINED"), values_1.v.literal("OFFLINE"));
const taskStatus = values_1.v.union(values_1.v.literal("INBOX"), values_1.v.literal("ASSIGNED"), values_1.v.literal("IN_PROGRESS"), values_1.v.literal("REVIEW"), values_1.v.literal("NEEDS_APPROVAL"), values_1.v.literal("BLOCKED"), values_1.v.literal("DONE"), values_1.v.literal("CANCELED"));
const taskType = values_1.v.union(values_1.v.literal("CONTENT"), values_1.v.literal("SOCIAL"), values_1.v.literal("EMAIL_MARKETING"), values_1.v.literal("CUSTOMER_RESEARCH"), values_1.v.literal("SEO_RESEARCH"), values_1.v.literal("ENGINEERING"), values_1.v.literal("DOCS"), values_1.v.literal("OPS"));
const taskPriority = values_1.v.union(values_1.v.literal(1), // critical
values_1.v.literal(2), // high
values_1.v.literal(3), // normal
values_1.v.literal(4) // low
);
const actorType = values_1.v.union(values_1.v.literal("AGENT"), values_1.v.literal("HUMAN"), values_1.v.literal("SYSTEM"));
const messageType = values_1.v.union(values_1.v.literal("COMMENT"), values_1.v.literal("WORK_PLAN"), values_1.v.literal("PROGRESS"), values_1.v.literal("ARTIFACT"), values_1.v.literal("REVIEW"), values_1.v.literal("APPROVAL_REQUEST"), values_1.v.literal("SYSTEM"));
const riskLevel = values_1.v.union(values_1.v.literal("GREEN"), values_1.v.literal("YELLOW"), values_1.v.literal("RED"));
// ============================================================================
// SCHEMA
// ============================================================================
exports.default = (0, server_1.defineSchema)({
    // -------------------------------------------------------------------------
    // PROJECTS (Multi-Project Workspaces)
    // -------------------------------------------------------------------------
    projects: (0, server_1.defineTable)({
        name: values_1.v.string(),
        slug: values_1.v.string(),
        description: values_1.v.optional(values_1.v.string()),
        // Per-project policy defaults (optional, merged with global policy)
        policyDefaults: values_1.v.optional(values_1.v.object({
            budgetDefaults: values_1.v.optional(values_1.v.any()),
            riskThresholds: values_1.v.optional(values_1.v.any()),
        })),
        // Metadata
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_slug", ["slug"]),
    // -------------------------------------------------------------------------
    // AGENTS
    // -------------------------------------------------------------------------
    agents: (0, server_1.defineTable)({
        // Project scope
        projectId: values_1.v.optional(values_1.v.id("projects")),
        // Identity
        name: values_1.v.string(),
        emoji: values_1.v.optional(values_1.v.string()),
        role: agentRole,
        status: agentStatus,
        // Workspace
        workspacePath: values_1.v.string(),
        soulVersionHash: values_1.v.optional(values_1.v.string()),
        // Config
        allowedTaskTypes: values_1.v.array(values_1.v.string()),
        allowedTools: values_1.v.optional(values_1.v.array(values_1.v.string())),
        // Budgets (flat, not nested)
        budgetDaily: values_1.v.number(),
        budgetPerRun: values_1.v.number(),
        spendToday: values_1.v.number(),
        spendResetAt: values_1.v.optional(values_1.v.number()),
        // Spawn config
        canSpawn: values_1.v.boolean(),
        maxSubAgents: values_1.v.number(),
        parentAgentId: values_1.v.optional(values_1.v.id("agents")),
        // State
        currentTaskId: values_1.v.optional(values_1.v.id("tasks")),
        lastHeartbeatAt: values_1.v.optional(values_1.v.number()),
        lastError: values_1.v.optional(values_1.v.string()),
        errorStreak: values_1.v.number(),
        // Metadata
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_status", ["status"])
        .index("by_role", ["role"])
        .index("by_name", ["name"])
        .index("by_project", ["projectId"])
        .index("by_project_status", ["projectId", "status"]),
    // -------------------------------------------------------------------------
    // TASKS
    // -------------------------------------------------------------------------
    tasks: (0, server_1.defineTable)({
        // Project scope
        projectId: values_1.v.optional(values_1.v.id("projects")),
        // Idempotency
        idempotencyKey: values_1.v.optional(values_1.v.string()),
        // Core
        title: values_1.v.string(),
        description: values_1.v.optional(values_1.v.string()),
        type: taskType,
        status: taskStatus,
        priority: taskPriority,
        // Assignment
        creatorAgentId: values_1.v.optional(values_1.v.id("agents")),
        assigneeIds: values_1.v.array(values_1.v.id("agents")),
        reviewerId: values_1.v.optional(values_1.v.id("agents")),
        // Hierarchy
        parentTaskId: values_1.v.optional(values_1.v.id("tasks")),
        // Work artifacts
        workPlan: values_1.v.optional(values_1.v.object({
            bullets: values_1.v.array(values_1.v.string()),
            estimatedCost: values_1.v.optional(values_1.v.number()),
            estimatedDuration: values_1.v.optional(values_1.v.string()),
        })),
        // Deliverable
        deliverable: values_1.v.optional(values_1.v.object({
            summary: values_1.v.optional(values_1.v.string()),
            content: values_1.v.optional(values_1.v.string()),
            artifactIds: values_1.v.optional(values_1.v.array(values_1.v.string())),
        })),
        // Review
        reviewChecklist: values_1.v.optional(values_1.v.object({
            type: values_1.v.string(),
            items: values_1.v.array(values_1.v.object({
                label: values_1.v.string(),
                checked: values_1.v.boolean(),
                note: values_1.v.optional(values_1.v.string()),
            })),
        })),
        reviewCycles: values_1.v.number(),
        // Cost tracking
        estimatedCost: values_1.v.optional(values_1.v.number()),
        actualCost: values_1.v.number(),
        budgetAllocated: values_1.v.optional(values_1.v.number()),
        budgetRemaining: values_1.v.optional(values_1.v.number()),
        // Timestamps
        dueAt: values_1.v.optional(values_1.v.number()),
        startedAt: values_1.v.optional(values_1.v.number()),
        submittedAt: values_1.v.optional(values_1.v.number()),
        completedAt: values_1.v.optional(values_1.v.number()),
        // Labels
        labels: values_1.v.optional(values_1.v.array(values_1.v.string())),
        // Block reason
        blockedReason: values_1.v.optional(values_1.v.string()),
        // Telegram thread reference (for thread-per-task)
        threadRef: values_1.v.optional(values_1.v.string()),
        // Redaction tracking
        redactedFields: values_1.v.optional(values_1.v.array(values_1.v.string())),
        // Metadata
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_status", ["status"])
        .index("by_type", ["type"])
        .index("by_priority", ["priority"])
        .index("by_idempotency", ["idempotencyKey"])
        .index("by_project", ["projectId"])
        .index("by_project_status", ["projectId", "status"]),
    // -------------------------------------------------------------------------
    // TASK TRANSITIONS (Immutable Audit Log)
    // -------------------------------------------------------------------------
    taskTransitions: (0, server_1.defineTable)({
        // Project scope (denormalized for efficient queries)
        projectId: values_1.v.optional(values_1.v.id("projects")),
        // Idempotency
        idempotencyKey: values_1.v.string(),
        // Reference
        taskId: values_1.v.id("tasks"),
        // Transition
        fromStatus: values_1.v.string(),
        toStatus: values_1.v.string(),
        // Actor (one of these should be set)
        actorType: actorType,
        actorAgentId: values_1.v.optional(values_1.v.id("agents")),
        actorUserId: values_1.v.optional(values_1.v.string()),
        // Validation
        validationResult: values_1.v.optional(values_1.v.object({
            valid: values_1.v.boolean(),
            errors: values_1.v.optional(values_1.v.array(values_1.v.object({
                field: values_1.v.string(),
                message: values_1.v.string(),
            }))),
        })),
        // Snapshot of artifacts at transition time
        artifactsSnapshot: values_1.v.optional(values_1.v.any()),
        // Context
        reason: values_1.v.optional(values_1.v.string()),
        sessionKey: values_1.v.optional(values_1.v.string()),
    })
        .index("by_task", ["taskId"])
        .index("by_idempotency", ["idempotencyKey"])
        .index("by_project", ["projectId"]),
    // -------------------------------------------------------------------------
    // MESSAGES (Task Thread)
    // -------------------------------------------------------------------------
    messages: (0, server_1.defineTable)({
        // Project scope (denormalized for efficient queries)
        projectId: values_1.v.optional(values_1.v.id("projects")),
        // Idempotency
        idempotencyKey: values_1.v.optional(values_1.v.string()),
        // Reference
        taskId: values_1.v.id("tasks"),
        // Author
        authorType: actorType,
        authorAgentId: values_1.v.optional(values_1.v.id("agents")),
        authorUserId: values_1.v.optional(values_1.v.string()),
        // Content
        type: messageType,
        content: values_1.v.string(),
        contentRedacted: values_1.v.optional(values_1.v.string()),
        // Attachments
        artifacts: values_1.v.optional(values_1.v.array(values_1.v.object({
            name: values_1.v.string(),
            type: values_1.v.string(),
            url: values_1.v.optional(values_1.v.string()),
            content: values_1.v.optional(values_1.v.string()),
        }))),
        // Mentions
        mentions: values_1.v.optional(values_1.v.array(values_1.v.string())),
        // Threading
        replyToId: values_1.v.optional(values_1.v.id("messages")),
        // Telegram thread reference
        threadRef: values_1.v.optional(values_1.v.string()),
        // Redaction
        redactedFields: values_1.v.optional(values_1.v.array(values_1.v.string())),
        // Metadata
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_task", ["taskId"])
        .index("by_author_agent", ["authorAgentId"])
        .index("by_idempotency", ["idempotencyKey"])
        .index("by_project", ["projectId"]),
    // -------------------------------------------------------------------------
    // RUNS (Agent Execution Turns)
    // -------------------------------------------------------------------------
    runs: (0, server_1.defineTable)({
        // Project scope (denormalized for efficient queries)
        projectId: values_1.v.optional(values_1.v.id("projects")),
        // Idempotency
        idempotencyKey: values_1.v.string(),
        // References
        agentId: values_1.v.id("agents"),
        taskId: values_1.v.optional(values_1.v.id("tasks")),
        sessionKey: values_1.v.string(),
        // Timing
        startedAt: values_1.v.number(),
        endedAt: values_1.v.optional(values_1.v.number()),
        durationMs: values_1.v.optional(values_1.v.number()),
        // Model usage
        model: values_1.v.string(),
        inputTokens: values_1.v.number(),
        outputTokens: values_1.v.number(),
        cacheReadTokens: values_1.v.optional(values_1.v.number()),
        cacheWriteTokens: values_1.v.optional(values_1.v.number()),
        // Cost
        costUsd: values_1.v.number(),
        budgetAllocated: values_1.v.optional(values_1.v.number()),
        // Status
        status: values_1.v.union(values_1.v.literal("RUNNING"), values_1.v.literal("COMPLETED"), values_1.v.literal("FAILED"), values_1.v.literal("TIMEOUT")),
        error: values_1.v.optional(values_1.v.string()),
        // Metadata
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_agent", ["agentId"])
        .index("by_task", ["taskId"])
        .index("by_session", ["sessionKey"])
        .index("by_idempotency", ["idempotencyKey"])
        .index("by_project", ["projectId"]),
    // -------------------------------------------------------------------------
    // TOOL CALLS
    // -------------------------------------------------------------------------
    toolCalls: (0, server_1.defineTable)({
        // Project scope (denormalized for efficient queries)
        projectId: values_1.v.optional(values_1.v.id("projects")),
        // References
        runId: values_1.v.id("runs"),
        agentId: values_1.v.id("agents"),
        taskId: values_1.v.optional(values_1.v.id("tasks")),
        // Tool info
        toolName: values_1.v.string(),
        toolVersion: values_1.v.optional(values_1.v.string()),
        // Risk
        riskLevel: riskLevel,
        policyResult: values_1.v.optional(values_1.v.object({
            decision: values_1.v.string(),
            reason: values_1.v.string(),
            approvalId: values_1.v.optional(values_1.v.string()),
        })),
        // I/O (redacted)
        inputPreview: values_1.v.optional(values_1.v.string()),
        outputPreview: values_1.v.optional(values_1.v.string()),
        inputHash: values_1.v.optional(values_1.v.string()),
        outputHash: values_1.v.optional(values_1.v.string()),
        // Execution
        startedAt: values_1.v.number(),
        endedAt: values_1.v.optional(values_1.v.number()),
        durationMs: values_1.v.optional(values_1.v.number()),
        // Status
        status: values_1.v.union(values_1.v.literal("PENDING"), values_1.v.literal("RUNNING"), values_1.v.literal("SUCCESS"), values_1.v.literal("FAILED"), values_1.v.literal("DENIED")),
        error: values_1.v.optional(values_1.v.string()),
        retryCount: values_1.v.number(),
    })
        .index("by_run", ["runId"])
        .index("by_agent", ["agentId"])
        .index("by_task", ["taskId"])
        .index("by_risk", ["riskLevel"])
        .index("by_project", ["projectId"]),
    // -------------------------------------------------------------------------
    // APPROVALS
    // -------------------------------------------------------------------------
    approvals: (0, server_1.defineTable)({
        // Project scope
        projectId: values_1.v.optional(values_1.v.id("projects")),
        // Idempotency
        idempotencyKey: values_1.v.optional(values_1.v.string()),
        // References
        taskId: values_1.v.optional(values_1.v.id("tasks")),
        toolCallId: values_1.v.optional(values_1.v.id("toolCalls")),
        requestorAgentId: values_1.v.id("agents"),
        // Request
        actionType: values_1.v.string(),
        actionSummary: values_1.v.string(),
        riskLevel: values_1.v.union(values_1.v.literal("YELLOW"), values_1.v.literal("RED")),
        actionPayload: values_1.v.optional(values_1.v.any()),
        estimatedCost: values_1.v.optional(values_1.v.number()),
        rollbackPlan: values_1.v.optional(values_1.v.string()),
        justification: values_1.v.string(),
        // Status
        status: values_1.v.union(values_1.v.literal("PENDING"), values_1.v.literal("APPROVED"), values_1.v.literal("DENIED"), values_1.v.literal("EXPIRED"), values_1.v.literal("CANCELED")),
        // Decision
        decidedByAgentId: values_1.v.optional(values_1.v.id("agents")),
        decidedByUserId: values_1.v.optional(values_1.v.string()),
        decidedAt: values_1.v.optional(values_1.v.number()),
        decisionReason: values_1.v.optional(values_1.v.string()),
        // Expiration
        expiresAt: values_1.v.number(),
    })
        .index("by_status", ["status"])
        .index("by_task", ["taskId"])
        .index("by_requestor", ["requestorAgentId"])
        .index("by_project", ["projectId"])
        .index("by_project_status", ["projectId", "status"]),
    // -------------------------------------------------------------------------
    // ACTIVITIES (Audit Log)
    // -------------------------------------------------------------------------
    activities: (0, server_1.defineTable)({
        // Project scope
        projectId: values_1.v.optional(values_1.v.id("projects")),
        // Actor
        actorType: actorType,
        actorId: values_1.v.optional(values_1.v.string()),
        // Action
        action: values_1.v.string(),
        description: values_1.v.string(),
        // Target
        targetType: values_1.v.optional(values_1.v.string()),
        targetId: values_1.v.optional(values_1.v.string()),
        // Context
        taskId: values_1.v.optional(values_1.v.id("tasks")),
        agentId: values_1.v.optional(values_1.v.id("agents")),
        // Data
        beforeState: values_1.v.optional(values_1.v.any()),
        afterState: values_1.v.optional(values_1.v.any()),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_task", ["taskId"])
        .index("by_agent", ["agentId"])
        .index("by_action", ["action"])
        .index("by_project", ["projectId"]),
    // -------------------------------------------------------------------------
    // ALERTS
    // -------------------------------------------------------------------------
    alerts: (0, server_1.defineTable)({
        // Project scope
        projectId: values_1.v.optional(values_1.v.id("projects")),
        // Alert info
        severity: values_1.v.union(values_1.v.literal("INFO"), values_1.v.literal("WARNING"), values_1.v.literal("ERROR"), values_1.v.literal("CRITICAL")),
        type: values_1.v.string(),
        title: values_1.v.string(),
        description: values_1.v.string(),
        // Context
        agentId: values_1.v.optional(values_1.v.id("agents")),
        taskId: values_1.v.optional(values_1.v.id("tasks")),
        runId: values_1.v.optional(values_1.v.id("runs")),
        // Status
        status: values_1.v.union(values_1.v.literal("OPEN"), values_1.v.literal("ACKNOWLEDGED"), values_1.v.literal("RESOLVED"), values_1.v.literal("IGNORED")),
        acknowledgedBy: values_1.v.optional(values_1.v.string()),
        acknowledgedAt: values_1.v.optional(values_1.v.number()),
        resolvedAt: values_1.v.optional(values_1.v.number()),
        resolutionNote: values_1.v.optional(values_1.v.string()),
        // Metadata
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_status", ["status"])
        .index("by_severity", ["severity"])
        .index("by_agent", ["agentId"])
        .index("by_task", ["taskId"])
        .index("by_project", ["projectId"]),
    // -------------------------------------------------------------------------
    // NOTIFICATIONS (@mentions, assignments — delivered to agents via heartbeat)
    // -------------------------------------------------------------------------
    notifications: (0, server_1.defineTable)({
        // Project scope
        projectId: values_1.v.optional(values_1.v.id("projects")),
        agentId: values_1.v.id("agents"),
        type: values_1.v.union(values_1.v.literal("MENTION"), values_1.v.literal("TASK_ASSIGNED"), values_1.v.literal("TASK_TRANSITION"), values_1.v.literal("APPROVAL_REQUESTED"), values_1.v.literal("APPROVAL_DECIDED"), values_1.v.literal("SYSTEM")),
        title: values_1.v.string(),
        body: values_1.v.optional(values_1.v.string()),
        taskId: values_1.v.optional(values_1.v.id("tasks")),
        messageId: values_1.v.optional(values_1.v.id("messages")),
        approvalId: values_1.v.optional(values_1.v.id("approvals")),
        fromAgentId: values_1.v.optional(values_1.v.id("agents")),
        fromUserId: values_1.v.optional(values_1.v.string()),
        readAt: values_1.v.optional(values_1.v.number()),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_agent", ["agentId"])
        .index("by_task", ["taskId"])
        .index("by_project", ["projectId"]),
    // -------------------------------------------------------------------------
    // THREAD SUBSCRIPTIONS (agents subscribed to task threads)
    // -------------------------------------------------------------------------
    threadSubscriptions: (0, server_1.defineTable)({
        // Project scope
        projectId: values_1.v.optional(values_1.v.id("projects")),
        agentId: values_1.v.id("agents"),
        taskId: values_1.v.id("tasks"),
        subscribedAt: values_1.v.number(),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_agent", ["agentId"])
        .index("by_task", ["taskId"])
        .index("by_agent_task", ["agentId", "taskId"])
        .index("by_project", ["projectId"]),
    // -------------------------------------------------------------------------
    // AGENT DOCUMENTS (WORKING.md, daily notes, session memory)
    // -------------------------------------------------------------------------
    agentDocuments: (0, server_1.defineTable)({
        // Project scope
        projectId: values_1.v.optional(values_1.v.id("projects")),
        agentId: values_1.v.id("agents"),
        type: values_1.v.union(values_1.v.literal("WORKING_MD"), values_1.v.literal("DAILY_NOTE"), values_1.v.literal("SESSION_MEMORY")),
        content: values_1.v.string(),
        updatedAt: values_1.v.number(),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_agent", ["agentId"])
        .index("by_agent_type", ["agentId", "type"])
        .index("by_project", ["projectId"]),
    // -------------------------------------------------------------------------
    // EXECUTION REQUESTS (Multi-Executor Routing)
    // -------------------------------------------------------------------------
    executionRequests: (0, server_1.defineTable)({
        // Project scope
        projectId: values_1.v.optional(values_1.v.id("projects")),
        // References
        taskId: values_1.v.optional(values_1.v.id("tasks")),
        requestedBy: values_1.v.id("agents"),
        assignedTo: values_1.v.optional(values_1.v.string()), // Executor identifier
        // Request details
        type: values_1.v.union(values_1.v.literal("CODE_CHANGE"), values_1.v.literal("RESEARCH"), values_1.v.literal("CONTENT"), values_1.v.literal("EMAIL"), values_1.v.literal("SOCIAL"), values_1.v.literal("OPS")),
        executor: values_1.v.union(values_1.v.literal("CURSOR"), values_1.v.literal("CLAUDE_CODE"), values_1.v.literal("OPENCLAW_AGENT")),
        // Status
        status: values_1.v.union(values_1.v.literal("PENDING"), values_1.v.literal("ASSIGNED"), values_1.v.literal("IN_PROGRESS"), values_1.v.literal("COMPLETED"), values_1.v.literal("FAILED")),
        // Payload and result
        payload: values_1.v.any(),
        result: values_1.v.optional(values_1.v.any()),
        // Timestamps
        requestedAt: values_1.v.number(),
        assignedAt: values_1.v.optional(values_1.v.number()),
        completedAt: values_1.v.optional(values_1.v.number()),
        // Metadata
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_status", ["status"])
        .index("by_project", ["projectId"])
        .index("by_task", ["taskId"])
        .index("by_executor", ["executor"])
        .index("by_project_status", ["projectId", "status"]),
    // -------------------------------------------------------------------------
    // POLICIES
    // -------------------------------------------------------------------------
    policies: (0, server_1.defineTable)({
        // Project scope (optional: null = global policy)
        projectId: values_1.v.optional(values_1.v.id("projects")),
        version: values_1.v.number(),
        name: values_1.v.string(),
        scopeType: values_1.v.union(values_1.v.literal("GLOBAL"), values_1.v.literal("AGENT"), values_1.v.literal("TASK_TYPE")),
        scopeId: values_1.v.optional(values_1.v.string()),
        // Rules
        rules: values_1.v.any(),
        toolRiskMap: values_1.v.optional(values_1.v.any()),
        shellAllowlist: values_1.v.optional(values_1.v.array(values_1.v.string())),
        shellBlocklist: values_1.v.optional(values_1.v.array(values_1.v.string())),
        fileReadPaths: values_1.v.optional(values_1.v.array(values_1.v.string())),
        fileWritePaths: values_1.v.optional(values_1.v.array(values_1.v.string())),
        networkAllowlist: values_1.v.optional(values_1.v.array(values_1.v.string())),
        budgetDefaults: values_1.v.optional(values_1.v.any()),
        spawnLimits: values_1.v.optional(values_1.v.any()),
        loopThresholds: values_1.v.optional(values_1.v.any()),
        // Status
        active: values_1.v.boolean(),
        createdBy: values_1.v.optional(values_1.v.string()),
        notes: values_1.v.optional(values_1.v.string()),
    })
        .index("by_active", ["active"])
        .index("by_name", ["name"])
        .index("by_project", ["projectId"])
        .index("by_project_active", ["projectId", "active"]),
});
