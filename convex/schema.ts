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
  v.literal("LEAD"),
  v.literal("CEO")
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

const agentVersionStatus = v.union(
  v.literal("DRAFT"),
  v.literal("TESTING"),
  v.literal("CANDIDATE"),
  v.literal("APPROVED"),
  v.literal("DEPRECATED"),
  v.literal("RETIRED")
);

const agentInstanceStatus = v.union(
  v.literal("PROVISIONING"),
  v.literal("ACTIVE"),
  v.literal("PAUSED"),
  v.literal("READONLY"),
  v.literal("DRAINING"),
  v.literal("QUARANTINED"),
  v.literal("RETIRED")
);

const deploymentStatus = v.union(
  v.literal("PENDING"),
  v.literal("ACTIVE"),
  v.literal("ROLLING_BACK"),
  v.literal("RETIRED")
);

// ============================================================================
// SCHEMA
// ============================================================================

export default defineSchema({
  // -------------------------------------------------------------------------
  // ARM: TENANTS (Multi-Tenancy Foundation)
  // -------------------------------------------------------------------------
  tenants: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    missionStatement: v.optional(v.string()),
    
    // Status
    active: v.boolean(),
    
    // Metadata
    metadata: v.optional(v.any()),
  })
    .index("by_slug", ["slug"])
    .index("by_active", ["active"]),

  // -------------------------------------------------------------------------
  // ARM: ENVIRONMENTS (Release Channels)
  // -------------------------------------------------------------------------
  environments: defineTable({
    tenantId: v.id("tenants"),
    name: v.string(),
    type: v.union(
      v.literal("dev"),
      v.literal("staging"),
      v.literal("prod")
    ),
    description: v.optional(v.string()),
    
    // Metadata
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_type", ["type"])
    .index("by_tenant_type", ["tenantId", "type"]),

  // -------------------------------------------------------------------------
  // ARM: OPERATORS (Human Identity)
  // -------------------------------------------------------------------------
  operators: defineTable({
    tenantId: v.id("tenants"),
    
    // Identity
    email: v.string(),
    name: v.string(),
    authId: v.optional(v.string()), // External auth provider ID
    
    // Status
    active: v.boolean(),
    
    // GDPR fields
    lastLoginAt: v.optional(v.number()),
    createdAt: v.number(),
    
    // Metadata
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_email", ["email"])
    .index("by_auth_id", ["authId"])
    .index("by_tenant_email", ["tenantId", "email"]),

  // -------------------------------------------------------------------------
  // ARM: ROLES (RBAC Role Definitions)
  // -------------------------------------------------------------------------
  roles: defineTable({
    tenantId: v.id("tenants"),
    name: v.string(),
    description: v.optional(v.string()),
    
    // Permissions array (references permissions table)
    permissions: v.array(v.string()),
    
    // Metadata
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_name", ["name"])
    .index("by_tenant_name", ["tenantId", "name"]),

  // -------------------------------------------------------------------------
  // ARM: PERMISSIONS (Permission Registry)
  // -------------------------------------------------------------------------
  permissions: defineTable({
    resource: v.string(), // e.g., "tasks", "agents", "approvals"
    action: v.string(),   // e.g., "create", "read", "update", "delete"
    description: v.optional(v.string()),
    
    // Metadata
    metadata: v.optional(v.any()),
  })
    .index("by_resource", ["resource"])
    .index("by_resource_action", ["resource", "action"]),

  // -------------------------------------------------------------------------
  // ARM: ROLE ASSIGNMENTS (Operator-to-Role Mappings)
  // -------------------------------------------------------------------------
  roleAssignments: defineTable({
    operatorId: v.id("operators"),
    roleId: v.id("roles"),
    
    // Scope (optional: tenant-wide if not specified)
    scope: v.optional(v.object({
      type: v.union(
        v.literal("tenant"),
        v.literal("project"),
        v.literal("environment")
      ),
      id: v.string(),
    })),
    
    // Metadata
    assignedBy: v.optional(v.id("operators")),
    assignedAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_operator", ["operatorId"])
    .index("by_role", ["roleId"])
    .index("by_operator_role", ["operatorId", "roleId"]),

  // -------------------------------------------------------------------------
  // ARM: AGENT TEMPLATES (Registry)
  // -------------------------------------------------------------------------
  agentTemplates: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    active: v.boolean(),
    createdBy: v.optional(v.id("operators")),
    createdAt: v.number(),
    updatedAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_project", ["projectId"])
    .index("by_slug", ["slug"])
    .index("by_tenant_slug", ["tenantId", "slug"]),

  // -------------------------------------------------------------------------
  // ARM: AGENT VERSIONS (Registry)
  // -------------------------------------------------------------------------
  agentVersions: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    templateId: v.id("agentTemplates"),
    version: v.number(),
    genomeHash: v.string(),
    genome: v.object({
      modelConfig: v.object({
        provider: v.string(),
        modelId: v.string(),
        temperature: v.optional(v.number()),
        maxTokens: v.optional(v.number()),
      }),
      promptBundleHash: v.string(),
      toolManifestHash: v.string(),
      provenance: v.object({
        createdBy: v.string(),
        source: v.string(),
        createdAt: v.number(),
      }),
    }),
    status: agentVersionStatus,
    notes: v.optional(v.string()),
    createdBy: v.optional(v.id("operators")),
    approvedBy: v.optional(v.id("operators")),
    createdAt: v.number(),
    updatedAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_project", ["projectId"])
    .index("by_template", ["templateId"])
    .index("by_template_status", ["templateId", "status"])
    .index("by_genome_hash", ["genomeHash"])
    .index("by_status", ["status"]),

  // -------------------------------------------------------------------------
  // ARM: AGENT INSTANCES (Registry)
  // -------------------------------------------------------------------------
  agentInstances: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    templateId: v.id("agentTemplates"),
    versionId: v.id("agentVersions"),
    environmentId: v.optional(v.id("environments")),
    name: v.string(),
    status: agentInstanceStatus,
    legacyAgentId: v.optional(v.id("agents")),
    assignedOperatorId: v.optional(v.id("operators")),
    activatedAt: v.optional(v.number()),
    retiredAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_project", ["projectId"])
    .index("by_template", ["templateId"])
    .index("by_version", ["versionId"])
    .index("by_environment", ["environmentId"])
    .index("by_status", ["status"])
    .index("by_legacy_agent", ["legacyAgentId"]),

  // -------------------------------------------------------------------------
  // ARM: POLICY ENVELOPES (Governance)
  // -------------------------------------------------------------------------
  policyEnvelopes: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    templateId: v.optional(v.id("agentTemplates")),
    versionId: v.optional(v.id("agentVersions")),
    name: v.string(),
    active: v.boolean(),
    priority: v.number(),
    rules: v.any(),
    createdBy: v.optional(v.id("operators")),
    createdAt: v.number(),
    updatedAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_project", ["projectId"])
    .index("by_template", ["templateId"])
    .index("by_version", ["versionId"])
    .index("by_active", ["active"]),

  // -------------------------------------------------------------------------
  // ARM: APPROVAL RECORDS (Governance)
  // -------------------------------------------------------------------------
  approvalRecords: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    instanceId: v.optional(v.id("agentInstances")),
    versionId: v.optional(v.id("agentVersions")),
    legacyApprovalId: v.optional(v.id("approvals")),
    actionType: v.string(),
    riskLevel: riskLevel,
    rollbackPlan: v.optional(v.string()),
    justification: v.string(),
    escalationLevel: v.optional(v.number()),
    status: v.union(
      v.literal("PENDING"),
      v.literal("APPROVED"),
      v.literal("DENIED"),
      v.literal("EXPIRED"),
      v.literal("CANCELED")
    ),
    requestedBy: v.optional(v.id("operators")),
    requestedAt: v.number(),
    decidedBy: v.optional(v.id("operators")),
    decidedAt: v.optional(v.number()),
    decisionReason: v.optional(v.string()),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_project", ["projectId"])
    .index("by_status", ["status"])
    .index("by_instance", ["instanceId"])
    .index("by_legacy_approval", ["legacyApprovalId"]),

  // -------------------------------------------------------------------------
  // ARM: CHANGE RECORDS (Governance + Audit)
  // -------------------------------------------------------------------------
  changeRecords: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    templateId: v.optional(v.id("agentTemplates")),
    versionId: v.optional(v.id("agentVersions")),
    instanceId: v.optional(v.id("agentInstances")),
    operatorId: v.optional(v.id("operators")),
    legacyAgentId: v.optional(v.id("agents")),
    type: v.union(
      v.literal("TEMPLATE_CREATED"),
      v.literal("VERSION_CREATED"),
      v.literal("VERSION_TRANSITIONED"),
      v.literal("INSTANCE_CREATED"),
      v.literal("INSTANCE_TRANSITIONED"),
      v.literal("IDENTITY_UPDATED"),
      v.literal("POLICY_ATTACHED"),
      v.literal("TASK_TRANSITIONED"),
      v.literal("APPROVAL_REQUESTED"),
      v.literal("APPROVAL_DECIDED"),
      v.literal("DEPLOYMENT_CREATED"),
      v.literal("DEPLOYMENT_ACTIVATED"),
      v.literal("DEPLOYMENT_ROLLED_BACK"),
      v.literal("EMERGENCY_PAUSE"),
      v.literal("POLICY_DENIED"),
      v.literal("QC_RUN_CREATED"),
      v.literal("QC_FINDINGS_RECORDED")
    ),
    summary: v.string(),
    payload: v.optional(v.any()),
    relatedTable: v.optional(v.string()),
    relatedId: v.optional(v.string()),
    timestamp: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_project", ["projectId"])
    .index("by_type", ["type"])
    .index("by_timestamp", ["timestamp"])
    .index("by_instance", ["instanceId"]),

  // -------------------------------------------------------------------------
  // ARM: DEPLOYMENTS (Governance)
  // -------------------------------------------------------------------------
  deployments: defineTable({
    tenantId: v.optional(v.id("tenants")),
    templateId: v.id("agentTemplates"),
    environmentId: v.id("environments"),
    targetVersionId: v.id("agentVersions"),
    previousVersionId: v.optional(v.id("agentVersions")),
    rolloutPolicy: v.optional(v.any()),
    status: deploymentStatus,
    createdBy: v.optional(v.id("operators")),
    approvedBy: v.optional(v.id("operators")),
    activatedAt: v.optional(v.number()),
    createdAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_template", ["templateId"])
    .index("by_environment", ["environmentId"])
    .index("by_status", ["status"])
    .index("by_target_version", ["targetVersionId"]),

  // -------------------------------------------------------------------------
  // ARM: OP EVENTS (Operational Telemetry)
  // -------------------------------------------------------------------------
  opEvents: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    type: v.union(
      v.literal("RUN_STARTED"),
      v.literal("RUN_STEP"),
      v.literal("RUN_COMPLETED"),
      v.literal("RUN_FAILED"),
      v.literal("TOOL_CALL_STARTED"),
      v.literal("TOOL_CALL_COMPLETED"),
      v.literal("TOOL_CALL_BLOCKED"),
      v.literal("WORKFLOW_STEP_STARTED"),
      v.literal("WORKFLOW_STEP_COMPLETED"),
      v.literal("WORKFLOW_STEP_FAILED"),
      v.literal("HEARTBEAT"),
      v.literal("COST_TICK"),
      v.literal("MESSAGE_SENT"),
      v.literal("DECISION_MADE"),
      v.literal("QC_RUN_STARTED"),
      v.literal("QC_RUN_COMPLETED"),
      v.literal("QC_RUN_FAILED")
    ),
    timestamp: v.number(),
    instanceId: v.optional(v.id("agentInstances")),
    versionId: v.optional(v.id("agentVersions")),
    taskId: v.optional(v.id("tasks")),
    runId: v.optional(v.id("runs")),
    toolCallId: v.optional(v.id("toolCalls")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    qcRunId: v.optional(v.id("qcRuns")),
    changeRecordId: v.optional(v.id("changeRecords")),
    payload: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_project", ["projectId"])
    .index("by_type", ["type"])
    .index("by_timestamp", ["timestamp"])
    .index("by_instance", ["instanceId"])
    .index("by_run", ["runId"])
    .index("by_qc_run", ["qcRunId"]),

  // -------------------------------------------------------------------------
  // PROJECTS (Multi-Project Workspaces)
  // -------------------------------------------------------------------------
  projects: defineTable({
    // ARM: Tenant scope (optional for migration; will be required after backfill)
    tenantId: v.optional(v.id("tenants")),
    
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
    .index("by_tenant", ["tenantId"])
    .index("by_slug", ["slug"])
    .index("by_github_repo", ["githubRepo"])
    .index("by_tenant_slug", ["tenantId", "slug"]),

  // -------------------------------------------------------------------------
  // AGENTS
  // -------------------------------------------------------------------------
  agents: defineTable({
    // ARM: Tenant scope (optional, backfill later)
    tenantId: v.optional(v.id("tenants")),
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
    // ARM: Tenant scope (optional, backfill later)
    tenantId: v.optional(v.id("tenants")),
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
    assigneeInstanceIds: v.optional(v.array(v.id("agentInstances"))),
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
      v.literal("SEED"),
      v.literal("MISSION_PROMPT"),
      v.literal("PRD_IMPORT")
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
  // PRD DOCUMENTS (PRD Import Pipeline)
  // -------------------------------------------------------------------------
  prdDocuments: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    title: v.string(),
    content: v.string(),
    taskCount: v.number(),
    parsedAt: v.number(),
    createdBy: v.optional(v.string()),
    metadata: v.optional(v.any()),
  })
    .index("by_project", ["projectId"])
    .index("by_tenant", ["tenantId"]),

  // -------------------------------------------------------------------------
  // TASK TRANSITIONS (Immutable Audit Log)
  // -------------------------------------------------------------------------
  taskTransitions: defineTable({
    // ARM: Tenant scope (optional, backfill later)
    tenantId: v.optional(v.id("tenants")),
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
    tenantId: v.optional(v.id("tenants")),
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
    // ARM: Tenant scope (optional, backfill later)
    tenantId: v.optional(v.id("tenants")),
    // Project scope (denormalized for efficient queries)
    projectId: v.optional(v.id("projects")),
    
    // Idempotency
    idempotencyKey: v.optional(v.string()),
    
    // Reference
    taskId: v.id("tasks"),
    
    // Author
    authorType: actorType,
    authorAgentId: v.optional(v.id("agents")),
    authorInstanceId: v.optional(v.id("agentInstances")),
    operatorId: v.optional(v.id("operators")),
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
    .index("by_author_instance", ["authorInstanceId"])
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_project", ["projectId"]),

  // -------------------------------------------------------------------------
  // RUNS (Agent Execution Turns)
  // -------------------------------------------------------------------------
  runs: defineTable({
    // ARM: Tenant scope (optional, backfill later)
    tenantId: v.optional(v.id("tenants")),
    // Project scope (denormalized for efficient queries)
    projectId: v.optional(v.id("projects")),
    
    // Idempotency
    idempotencyKey: v.string(),
    
    // References
    agentId: v.id("agents"),
    instanceId: v.optional(v.id("agentInstances")),
    versionId: v.optional(v.id("agentVersions")),
    templateId: v.optional(v.id("agentTemplates")),
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
    .index("by_instance", ["instanceId"])
    .index("by_version", ["versionId"])
    .index("by_task", ["taskId"])
    .index("by_session", ["sessionKey"])
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_project", ["projectId"]),

  // -------------------------------------------------------------------------
  // TOOL CALLS
  // -------------------------------------------------------------------------
  toolCalls: defineTable({
    // ARM: Tenant scope (optional, backfill later)
    tenantId: v.optional(v.id("tenants")),
    // Project scope (denormalized for efficient queries)
    projectId: v.optional(v.id("projects")),
    
    // References
    runId: v.id("runs"),
    agentId: v.id("agents"),
    instanceId: v.optional(v.id("agentInstances")),
    versionId: v.optional(v.id("agentVersions")),
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
    .index("by_instance", ["instanceId"])
    .index("by_task", ["taskId"])
    .index("by_risk", ["riskLevel"])
    .index("by_project", ["projectId"]),

  // -------------------------------------------------------------------------
  // APPROVALS
  // -------------------------------------------------------------------------
  approvals: defineTable({
    // ARM: Tenant scope (optional, backfill later)
    tenantId: v.optional(v.id("tenants")),
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
    // ARM: Tenant scope (optional, backfill later)
    tenantId: v.optional(v.id("tenants")),
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
    // ARM: Tenant scope (optional, backfill later)
    tenantId: v.optional(v.id("tenants")),
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
    qcRunId: v.optional(v.id("qcRuns")),
    
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
    // ARM: Tenant scope (optional, backfill later)
    tenantId: v.optional(v.id("tenants")),
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
    // ARM: Tenant scope (optional, backfill later)
    tenantId: v.optional(v.id("tenants")),
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
    tenantId: v.optional(v.id("tenants")),
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
    tenantId: v.optional(v.id("tenants")),
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
    // ARM: Tenant scope (optional, backfill later)
    tenantId: v.optional(v.id("tenants")),
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
    // ARM: Tenant scope (optional, backfill later)
    tenantId: v.optional(v.id("tenants")),
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
    // ARM: Tenant scope (optional, backfill later)
    tenantId: v.optional(v.id("tenants")),
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
    tenantId: v.optional(v.id("tenants")),
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
    tenantId: v.optional(v.id("tenants")),
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
    tenantId: v.optional(v.id("tenants")),
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
    tenantId: v.optional(v.id("tenants")),
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
    tenantId: v.optional(v.id("tenants")),
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
    tenantId: v.optional(v.id("tenants")),
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
    tenantId: v.optional(v.id("tenants")),
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

  // -------------------------------------------------------------------------
  // ORG ASSIGNMENTS (Per-Project Role Hierarchy)
  // -------------------------------------------------------------------------
  orgAssignments: defineTable({
    agentId: v.id("agents"),
    projectId: v.id("projects"),
    
    // Org-level position (separate from capability role)
    orgPosition: v.union(
      v.literal("CEO"),
      v.literal("LEAD"),
      v.literal("SPECIALIST"),
      v.literal("INTERN")
    ),
    
    // Scope of assignment
    scope: v.union(
      v.literal("PROJECT"),
      v.literal("SQUAD"),
      v.literal("REPO")
    ),
    scopeRef: v.optional(v.string()), // squad name or repo path
    
    // Metadata
    assignedBy: v.optional(v.string()),
    assignedAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_agent", ["agentId"])
    .index("by_project", ["projectId"])
    .index("by_position", ["orgPosition"])
    .index("by_project_position", ["projectId", "orgPosition"]),

  // -------------------------------------------------------------------------
  // AGENT IDENTITIES (OpenClaw IDENTITY/SOUL/TOOLS Governance)
  // -------------------------------------------------------------------------
  agentIdentities: defineTable({
    tenantId: v.optional(v.id("tenants")),
    agentId: v.id("agents"),
    templateId: v.optional(v.id("agentTemplates")),
    versionId: v.optional(v.id("agentVersions")),
    instanceId: v.optional(v.id("agentInstances")),
    legacyAgentId: v.optional(v.id("agents")),
    
    // IDENTITY.md fields
    name: v.string(),
    creature: v.optional(v.string()),
    vibe: v.optional(v.string()),
    emoji: v.optional(v.string()),
    avatarPath: v.optional(v.string()),
    
    // SOUL.md content
    soulContent: v.optional(v.string()),
    soulHash: v.optional(v.string()),
    
    // TOOLS.md content
    toolsNotes: v.optional(v.string()),
    
    // Validation
    validationStatus: v.union(
      v.literal("VALID"),
      v.literal("INVALID"),
      v.literal("MISSING"),
      v.literal("PARTIAL")
    ),
    validationErrors: v.optional(v.array(v.string())),
    lastScannedAt: v.optional(v.number()),
    
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_agent", ["agentId"])
    .index("by_template", ["templateId"])
    .index("by_instance", ["instanceId"])
    .index("by_legacy_agent", ["legacyAgentId"])
    .index("by_validation_status", ["validationStatus"]),

  // -------------------------------------------------------------------------
  // TELEGRAPH THREADS (Async Agent Communications)
  // -------------------------------------------------------------------------
  telegraphThreads: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    
    title: v.string(),
    participants: v.array(v.string()), // agent IDs or human refs
    
    // Channel
    channel: v.union(
      v.literal("INTERNAL"),
      v.literal("TELEGRAM")
    ),
    externalThreadRef: v.optional(v.string()),
    
    // Linked entities
    linkedTaskId: v.optional(v.id("tasks")),
    linkedApprovalId: v.optional(v.id("approvals")),
    linkedIncidentId: v.optional(v.string()),
    
    // State
    lastMessageAt: v.optional(v.number()),
    messageCount: v.number(),
    
    metadata: v.optional(v.any()),
  })
    .index("by_project", ["projectId"])
    .index("by_linked_task", ["linkedTaskId"])
    .index("by_last_message", ["lastMessageAt"])
    .index("by_channel", ["channel"]),

  // -------------------------------------------------------------------------
  // TELEGRAPH MESSAGES (Internal + External Messaging)
  // -------------------------------------------------------------------------
  telegraphMessages: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    threadId: v.id("telegraphThreads"),
    
    // Sender
    senderId: v.string(),
    senderType: v.union(
      v.literal("AGENT"),
      v.literal("HUMAN"),
      v.literal("SYSTEM")
    ),
    
    // Content
    content: v.string(),
    replyToId: v.optional(v.id("telegraphMessages")),
    
    // Channel + status
    channel: v.union(
      v.literal("INTERNAL"),
      v.literal("TELEGRAM")
    ),
    externalRef: v.optional(v.string()),
    status: v.union(
      v.literal("DRAFT"),
      v.literal("SENT"),
      v.literal("DELIVERED"),
      v.literal("READ"),
      v.literal("FAILED")
    ),
    
    metadata: v.optional(v.any()),
  })
    .index("by_thread", ["threadId"])
    .index("by_project", ["projectId"])
    .index("by_sender", ["senderId"])
    .index("by_status", ["status"]),

  // -------------------------------------------------------------------------
  // MEETINGS (Zoom-Ready Meeting Orchestration)
  // -------------------------------------------------------------------------
  meetings: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    
    title: v.string(),
    agenda: v.optional(v.string()),
    
    // Scheduling
    scheduledAt: v.number(),
    duration: v.number(), // minutes
    
    // Status
    status: v.union(
      v.literal("SCHEDULED"),
      v.literal("IN_PROGRESS"),
      v.literal("COMPLETED"),
      v.literal("CANCELLED")
    ),
    
    // Participants
    hostAgentId: v.optional(v.string()),
    participants: v.array(v.object({
      agentId: v.string(),
      orgPosition: v.optional(v.string()),
      role: v.optional(v.string()), // host, presenter, attendee
    })),
    
    // Provider
    provider: v.union(
      v.literal("MANUAL"),
      v.literal("ZOOM")
    ),
    externalMeetingRef: v.optional(v.string()),
    
    // Artifacts
    notesDocPath: v.optional(v.string()),
    notes: v.optional(v.string()),
    actionItems: v.optional(v.array(v.object({
      description: v.string(),
      assigneeAgentId: v.optional(v.string()),
      taskId: v.optional(v.id("tasks")),
      dueAt: v.optional(v.number()),
      completed: v.boolean(),
    }))),
    
    // Calendar
    calendarPayload: v.optional(v.string()), // JSON iCal-compatible payload
    
    metadata: v.optional(v.any()),
  })
    .index("by_project", ["projectId"])
    .index("by_status", ["status"])
    .index("by_host", ["hostAgentId"])
    .index("by_scheduled", ["scheduledAt"]),

  // -------------------------------------------------------------------------
  // VOICE ARTIFACTS (TTS Audio + Transcripts)
  // -------------------------------------------------------------------------
  voiceArtifacts: defineTable({
    tenantId: v.optional(v.id("tenants")),
    agentId: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    
    // Content
    text: v.string(),
    transcript: v.optional(v.string()),
    
    // Audio
    audioUrl: v.optional(v.string()),
    audioStorageId: v.optional(v.string()),
    
    // Provider
    provider: v.union(
      v.literal("ELEVENLABS"),
      v.literal("OTHER")
    ),
    voiceId: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    
    // Links
    linkedMessageId: v.optional(v.id("telegraphMessages")),
    linkedMeetingId: v.optional(v.id("meetings")),
    
    metadata: v.optional(v.any()),
  })
    .index("by_agent", ["agentId"])
    .index("by_project", ["projectId"])
    .index("by_linked_message", ["linkedMessageId"]),

  // -------------------------------------------------------------------------
  // RATE LIMIT (External input throttling)
  // -------------------------------------------------------------------------
  rateLimitEntries: defineTable({
    key: v.string(),       // e.g. "telegram:chatId" or "webhook:projectId"
    windowStart: v.number(), // start of 1-minute window (ms)
    count: v.number(),
  })
    .index("by_key", ["key"]),

  // -------------------------------------------------------------------------
  // WORKFLOWS (Multi-Agent Workflow Definitions)
  // -------------------------------------------------------------------------
  workflows: defineTable({
    // Identity
    workflowId: v.string(), // e.g., "feature-dev", "bug-fix", "security-audit"
    name: v.string(),
    description: v.string(),
    
    // Agent definitions
    agents: v.array(v.object({
      id: v.string(),
      persona: v.string(), // References agents/*.yaml
      workspace: v.optional(v.object({
        files: v.optional(v.any()),
      })),
    })),
    
    // Step definitions
    steps: v.array(v.object({
      id: v.string(),
      agent: v.string(), // References agents[].id
      input: v.string(), // Template with {{variables}}
      expects: v.string(), // Success criteria (e.g., "STATUS: done")
      retryLimit: v.number(),
      timeoutMinutes: v.number(),
    })),
    
    // Status
    active: v.boolean(),
    version: v.number(),
    
    // Metadata
    createdBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_workflow_id", ["workflowId"])
    .index("by_active", ["active"]),

  // -------------------------------------------------------------------------
  // WORKFLOW RUNS (Execution State for Multi-Agent Workflows)
  // -------------------------------------------------------------------------
  workflowRuns: defineTable({
    // ARM: Tenant scope (optional, backfill later)
    tenantId: v.optional(v.id("tenants")),
    // Identity
    runId: v.string(), // Short ID for CLI/UI display
    workflowId: v.string(),
    projectId: v.optional(v.id("projects")),
    
    // Parent task
    parentTaskId: v.optional(v.id("tasks")),
    
    // Status
    status: v.union(
      v.literal("PENDING"),
      v.literal("RUNNING"),
      v.literal("COMPLETED"),
      v.literal("FAILED"),
      v.literal("PAUSED")
    ),
    
    // Progress
    currentStepIndex: v.number(),
    totalSteps: v.number(),
    
    // Step execution state
    steps: v.array(v.object({
      stepId: v.string(),
      status: v.union(
        v.literal("PENDING"),
        v.literal("RUNNING"),
        v.literal("DONE"),
        v.literal("FAILED")
      ),
      taskId: v.optional(v.id("tasks")),
      agentId: v.optional(v.id("agents")),
      startedAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
      retryCount: v.number(),
      error: v.optional(v.string()),
      output: v.optional(v.string()), // Extracted from task deliverable
    })),
    
    // Context variables passed between steps
    context: v.any(),
    
    // Initial input
    initialInput: v.string(),
    
    // Timing
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    
    // Metadata
    metadata: v.optional(v.any()),
  })
    .index("by_run_id", ["runId"])
    .index("by_workflow_id", ["workflowId"])
    .index("by_project", ["projectId"])
    .index("by_status", ["status"])
    .index("by_parent_task", ["parentTaskId"])
    .index("by_project_status", ["projectId", "status"]),

  // =========================================================================
  // QUALITY CONTROL
  // =========================================================================

  // -------------------------------------------------------------------------
  // QC RUNS (Quality Control Run Metadata + Lifecycle)
  // -------------------------------------------------------------------------
  qcRuns: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),

    // Display ID and ordering
    runId: v.string(),
    runSequence: v.number(),

    // Lifecycle
    status: v.union(
      v.literal("PENDING"),
      v.literal("RUNNING"),
      v.literal("COMPLETED"),
      v.literal("FAILED"),
      v.literal("CANCELED")
    ),

    // Governance (riskGrade is deterministic from gates; qualityScore is informational)
    riskGrade: v.optional(v.union(
      v.literal("GREEN"),
      v.literal("YELLOW"),
      v.literal("RED")
    )),
    qualityScore: v.optional(v.number()),

    // Target
    repoUrl: v.string(),
    commitSha: v.optional(v.string()),
    branch: v.optional(v.string()),
    scopeType: v.union(
      v.literal("FULL_REPO"),
      v.literal("FILE_LIST"),
      v.literal("DIRECTORY"),
      v.literal("BRANCH_DIFF")
    ),
    scopeSpec: v.optional(v.any()),

    // Ruleset
    rulesetId: v.optional(v.id("qcRulesets")),

    // Initiator
    initiatorType: v.union(
      v.literal("HUMAN"),
      v.literal("AGENT"),
      v.literal("SYSTEM"),
      v.literal("WORKFLOW")
    ),
    initiatorId: v.optional(v.string()),

    // Results summary
    findingCounts: v.optional(v.object({
      red: v.number(),
      yellow: v.number(),
      green: v.number(),
      info: v.number(),
    })),
    gatePassed: v.optional(v.boolean()),
    evidenceHash: v.optional(v.string()),

    // Timing
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),

    // Idempotency
    idempotencyKey: v.optional(v.string()),

    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_project", ["projectId"])
    .index("by_status", ["status"])
    .index("by_project_sequence", ["projectId", "runSequence"])
    .index("by_idempotency", ["idempotencyKey"]),

  // -------------------------------------------------------------------------
  // QC FINDINGS (Individual Check Results)
  // -------------------------------------------------------------------------
  qcFindings: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    qcRunId: v.id("qcRuns"),

    severity: v.union(
      v.literal("RED"),
      v.literal("YELLOW"),
      v.literal("GREEN"),
      v.literal("INFO")
    ),
    category: v.union(
      v.literal("REQUIREMENT_GAP"),
      v.literal("DOCS_DRIFT"),
      v.literal("COVERAGE_GAP"),
      v.literal("SECURITY_GAP"),
      v.literal("CONFIG_MISSING"),
      v.literal("DELIVERY_GATE")
    ),

    title: v.string(),
    description: v.string(),
    filePaths: v.optional(v.array(v.string())),
    lineRanges: v.optional(v.array(v.object({
      file: v.string(),
      start: v.number(),
      end: v.number(),
    }))),
    prdRefs: v.optional(v.array(v.string())),
    suggestedFix: v.optional(v.string()),
    confidence: v.optional(v.number()),

    linkedTaskId: v.optional(v.id("tasks")),

    metadata: v.optional(v.any()),
  })
    .index("by_run", ["qcRunId"])
    .index("by_severity", ["severity"])
    .index("by_category", ["category"])
    .index("by_project", ["projectId"]),

  // -------------------------------------------------------------------------
  // QC ARTIFACTS (Evidence Packs, Reports, Trace Logs)
  // -------------------------------------------------------------------------
  qcArtifacts: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    qcRunId: v.id("qcRuns"),

    type: v.union(
      v.literal("EVIDENCE_PACK_JSON"),
      v.literal("SUMMARY_MD"),
      v.literal("TRACE_MATRIX"),
      v.literal("COVERAGE_REPORT"),
      v.literal("CUSTOM")
    ),
    name: v.string(),

    storageId: v.optional(v.id("_storage")),
    content: v.optional(v.string()),
    mimeType: v.string(),
    sizeBytes: v.optional(v.number()),

    metadata: v.optional(v.any()),
  })
    .index("by_run", ["qcRunId"])
    .index("by_type", ["type"]),

  // -------------------------------------------------------------------------
  // QC RULESETS (Configurable Check Definitions + Built-in Presets)
  // -------------------------------------------------------------------------
  qcRulesets: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),

    name: v.string(),
    description: v.optional(v.string()),
    preset: v.optional(v.union(
      v.literal("PRE_RELEASE"),
      v.literal("POST_MERGE"),
      v.literal("WEEKLY_HEALTH"),
      v.literal("SECURITY_FOCUS"),
      v.literal("CUSTOM")
    )),

    requiredDocs: v.array(v.string()),
    coverageThresholds: v.object({
      unit: v.number(),
      integration: v.number(),
      e2e: v.number(),
    }),
    securityPaths: v.array(v.string()),
    gateDefinitions: v.array(v.object({
      name: v.string(),
      condition: v.string(),
      severity: v.string(),
    })),
    severityOverrides: v.optional(v.any()),

    active: v.boolean(),
    isBuiltIn: v.boolean(),

    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_project", ["projectId"])
    .index("by_preset", ["preset"])
    .index("by_active", ["active"]),

  // -------------------------------------------------------------------------
  // TEST RECORDINGS (Browser interaction capture sessions)
  // -------------------------------------------------------------------------
  testRecordings: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    sessionId: v.string(),
    userId: v.string(),
    url: v.optional(v.string()),
    status: v.union(
      v.literal("RECORDING"),
      v.literal("COMPLETED"),
      v.literal("FAILED"),
      v.literal("CANCELED")
    ),
    events: v.array(v.any()),
    playwrightCode: v.optional(v.array(v.string())),
    gherkinScenario: v.optional(v.string()),
    screenshotUrls: v.optional(v.array(v.string())),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  })
    .index("by_session", ["sessionId"])
    .index("by_project", ["projectId"])
    .index("by_status", ["status"])
    .index("by_user", ["userId"]),

  // -------------------------------------------------------------------------
  // TEST SUITES (API/UI/Hybrid suite definitions)
  // -------------------------------------------------------------------------
  testSuites: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    suiteId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    testType: v.union(
      v.literal("api_functional"),
      v.literal("api_integration"),
      v.literal("ui_functional"),
      v.literal("ui_e2e"),
      v.literal("hybrid_workflow"),
      v.literal("performance"),
      v.literal("security")
    ),
    apiTests: v.optional(v.array(v.any())),
    uiTests: v.optional(v.array(v.string())),
    gherkinFeature: v.optional(v.string()),
    executionMode: v.union(
      v.literal("api_only"),
      v.literal("ui_only"),
      v.literal("hybrid"),
      v.literal("auto_detect")
    ),
    retryEnabled: v.boolean(),
    timeoutSeconds: v.number(),
    tags: v.optional(v.array(v.string())),
    createdBy: v.optional(v.string()),
    status: v.union(
      v.literal("DRAFT"),
      v.literal("READY"),
      v.literal("RUNNING"),
      v.literal("PASSED"),
      v.literal("FAILED")
    ),
    metadata: v.optional(v.any()),
  })
    .index("by_suite", ["suiteId"])
    .index("by_project", ["projectId"])
    .index("by_type", ["testType"])
    .index("by_status", ["status"]),

  // -------------------------------------------------------------------------
  // API COLLECTIONS (Postman/Bruno/SoapUI/OpenAPI imports)
  // -------------------------------------------------------------------------
  apiCollections: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    collectionId: v.string(),
    name: v.string(),
    collectionType: v.union(
      v.literal("postman"),
      v.literal("bruno"),
      v.literal("soapui"),
      v.literal("openapi")
    ),
    steps: v.array(v.any()),
    importedBy: v.string(),
    importedAt: v.number(),
    totalSteps: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_collection", ["collectionId"])
    .index("by_project", ["projectId"])
    .index("by_type", ["collectionType"]),

  // -------------------------------------------------------------------------
  // EXECUTION RESULTS (API/UI/Hybrid execution outcomes)
  // -------------------------------------------------------------------------
  executionResults: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    resultId: v.string(),
    executionType: v.union(
      v.literal("api"),
      v.literal("ui"),
      v.literal("hybrid")
    ),
    suiteId: v.optional(v.id("testSuites")),
    workflowId: v.optional(v.id("hybridWorkflows")),
    jobId: v.optional(v.id("scheduledJobs")),
    steps: v.array(v.any()),
    totalTime: v.number(),
    passed: v.number(),
    failed: v.number(),
    success: v.boolean(),
    context: v.optional(v.any()),
    executedAt: v.number(),
    executedBy: v.optional(v.string()),
    metadata: v.optional(v.any()),
  })
    .index("by_result", ["resultId"])
    .index("by_project", ["projectId"])
    .index("by_type", ["executionType"])
    .index("by_executed_at", ["executedAt"]),

  // -------------------------------------------------------------------------
  // FLAKY STEPS (Retry and reliability tracking)
  // -------------------------------------------------------------------------
  flakySteps: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    stepName: v.string(),
    failureRatio: v.number(),
    totalRuns: v.number(),
    failedRuns: v.number(),
    lastSeen: v.number(),
    firstDetected: v.number(),
    githubIssueNumber: v.optional(v.number()),
    isActive: v.boolean(),
    retryCount: v.number(),
    avgResponseTimeMs: v.optional(v.number()),
    metadata: v.optional(v.any()),
  })
    .index("by_step", ["stepName"])
    .index("by_project", ["projectId"])
    .index("by_active", ["isActive"]),

  // -------------------------------------------------------------------------
  // HYBRID WORKFLOWS (API + UI combined workflows)
  // -------------------------------------------------------------------------
  hybridWorkflows: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    workflowId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    apiSetupSteps: v.array(v.any()),
    uiValidationSteps: v.array(v.string()),
    executionMode: v.union(
      v.literal("api_only"),
      v.literal("ui_only"),
      v.literal("hybrid"),
      v.literal("auto_detect")
    ),
    stopOnFailure: v.boolean(),
    timeoutSeconds: v.number(),
    retryEnabled: v.boolean(),
    createdBy: v.optional(v.string()),
    active: v.boolean(),
    metadata: v.optional(v.any()),
  })
    .index("by_workflow", ["workflowId"])
    .index("by_project", ["projectId"])
    .index("by_active", ["active"]),

  // -------------------------------------------------------------------------
  // CODEGEN REQUESTS (Prompt-driven code generation and PR metadata)
  // -------------------------------------------------------------------------
  codegenRequests: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    requestId: v.string(),
    filePath: v.string(),
    prompt: v.string(),
    status: v.union(
      v.literal("PENDING"),
      v.literal("GENERATING"),
      v.literal("COMPLETED"),
      v.literal("FAILED")
    ),
    diff: v.optional(v.string()),
    branchName: v.optional(v.string()),
    commitHash: v.optional(v.string()),
    prUrl: v.optional(v.string()),
    requestedBy: v.string(),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    metadata: v.optional(v.any()),
  })
    .index("by_request", ["requestId"])
    .index("by_project", ["projectId"])
    .index("by_status", ["status"]),

  // -------------------------------------------------------------------------
  // SCHEDULED JOBS (Cron-like recurring operations)
  // -------------------------------------------------------------------------
  scheduledJobs: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    jobId: v.string(),
    name: v.string(),
    jobType: v.union(
      v.literal("test_suite"),
      v.literal("qc_run"),
      v.literal("workflow"),
      v.literal("hybrid"),
      v.literal("mission_prompt")
    ),
    cronExpression: v.string(),
    nextRun: v.number(),
    lastRun: v.optional(v.number()),
    targetId: v.string(),
    autoRerunFlaky: v.boolean(),
    enabled: v.boolean(),
    createdBy: v.string(),
    metadata: v.optional(v.any()),
  })
    .index("by_job", ["jobId"])
    .index("by_project", ["projectId"])
    .index("by_enabled", ["enabled"])
    .index("by_next_run", ["nextRun"]),

  // -------------------------------------------------------------------------
  // METRICS (Time-series operational metrics)
  // -------------------------------------------------------------------------
  metrics: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    metricName: v.string(),
    metricType: v.union(
      v.literal("counter"),
      v.literal("gauge"),
      v.literal("histogram")
    ),
    value: v.number(),
    timestamp: v.number(),
    labels: v.optional(v.any()),
    metadata: v.optional(v.any()),
  })
    .index("by_name", ["metricName"])
    .index("by_project", ["projectId"])
    .index("by_timestamp", ["timestamp"]),

  // -------------------------------------------------------------------------
  // WORKFLOW METRICS (Aggregated Workflow Performance Stats)
  // -------------------------------------------------------------------------
  workflowMetrics: defineTable({
    // ARM: Tenant scope (optional, backfill later)
    tenantId: v.optional(v.id("tenants")),
    // Identity
    workflowId: v.string(),
    projectId: v.optional(v.id("projects")),
    
    // Time period
    periodStart: v.number(),
    periodEnd: v.number(),
    
    // Execution stats
    totalRuns: v.number(),
    successfulRuns: v.number(),
    failedRuns: v.number(),
    pausedRuns: v.number(),
    
    // Success rate
    successRate: v.number(), // 0-1
    
    // Timing stats
    avgDurationMs: v.number(),
    minDurationMs: v.number(),
    maxDurationMs: v.number(),
    
    // Step stats
    avgStepsCompleted: v.number(),
    totalRetries: v.number(),
    totalEscalations: v.number(),
    
    // Bottlenecks (step IDs with highest failure/retry rates)
    bottlenecks: v.array(v.object({
      stepId: v.string(),
      failureRate: v.number(),
      avgRetries: v.number(),
    })),
    
    // Metadata
    lastUpdated: v.number(),
  })
    .index("by_workflow", ["workflowId"])
    .index("by_project", ["projectId"])
    .index("by_period", ["periodStart", "periodEnd"]),

  // -------------------------------------------------------------------------
  // CONTENT DROPS (Agent-Submitted Deliverables)
  // -------------------------------------------------------------------------
  contentDrops: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),

    agentId: v.optional(v.id("agents")),
    taskId: v.optional(v.id("tasks")),

    title: v.string(),
    contentType: v.union(
      v.literal("BLOG_POST"),
      v.literal("SOCIAL_POST"),
      v.literal("EMAIL_DRAFT"),
      v.literal("SCRIPT"),
      v.literal("REPORT"),
      v.literal("CODE_SNIPPET"),
      v.literal("DESIGN"),
      v.literal("OTHER")
    ),

    content: v.string(),
    summary: v.optional(v.string()),
    fileUrl: v.optional(v.string()),

    status: v.union(
      v.literal("DRAFT"),
      v.literal("SUBMITTED"),
      v.literal("APPROVED"),
      v.literal("REJECTED"),
      v.literal("PUBLISHED")
    ),

    reviewedBy: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    reviewNote: v.optional(v.string()),

    tags: v.optional(v.array(v.string())),
    metadata: v.optional(v.any()),
  })
    .index("by_project", ["projectId"])
    .index("by_agent", ["agentId"])
    .index("by_status", ["status"])
    .index("by_task", ["taskId"])
    .index("by_content_type", ["contentType"]),

  // -------------------------------------------------------------------------
  // REVENUE EVENTS (Stripe / External Revenue Tracking)
  // -------------------------------------------------------------------------
  revenueEvents: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),

    source: v.union(
      v.literal("STRIPE"),
      v.literal("MANUAL"),
      v.literal("OTHER")
    ),
    eventType: v.union(
      v.literal("CHARGE"),
      v.literal("SUBSCRIPTION"),
      v.literal("REFUND"),
      v.literal("PAYOUT"),
      v.literal("OTHER")
    ),

    amount: v.number(),
    currency: v.string(),
    description: v.optional(v.string()),

    customerId: v.optional(v.string()),
    customerEmail: v.optional(v.string()),

    externalId: v.optional(v.string()),
    externalRef: v.optional(v.string()),

    timestamp: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_project", ["projectId"])
    .index("by_source", ["source"])
    .index("by_event_type", ["eventType"])
    .index("by_timestamp", ["timestamp"])
    .index("by_external_id", ["externalId"]),
});
