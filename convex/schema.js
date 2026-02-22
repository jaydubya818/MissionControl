"use strict";
/**
 * Convex Database Schema — V0
 *
 * Aligned with Bootstrap Kit (docs/openclaw-bootstrap/schema/SCHEMA.md)
 * Source of truth for Mission Control data model.
 */
Object.defineProperty(exports, "__esModule", { value: true });
var server_1 = require("convex/server");
var values_1 = require("convex/values");
// ============================================================================
// ENUMS (as union types)
// ============================================================================
var agentRole = values_1.v.union(values_1.v.literal("INTERN"), values_1.v.literal("SPECIALIST"), values_1.v.literal("LEAD"), values_1.v.literal("CEO"));
var agentStatus = values_1.v.union(values_1.v.literal("ACTIVE"), values_1.v.literal("PAUSED"), values_1.v.literal("DRAINED"), values_1.v.literal("QUARANTINED"), values_1.v.literal("OFFLINE"));
var taskStatus = values_1.v.union(values_1.v.literal("INBOX"), values_1.v.literal("ASSIGNED"), values_1.v.literal("IN_PROGRESS"), values_1.v.literal("REVIEW"), values_1.v.literal("NEEDS_APPROVAL"), values_1.v.literal("BLOCKED"), values_1.v.literal("FAILED"), values_1.v.literal("DONE"), values_1.v.literal("CANCELED"));
var taskType = values_1.v.union(values_1.v.literal("CONTENT"), values_1.v.literal("SOCIAL"), values_1.v.literal("EMAIL_MARKETING"), values_1.v.literal("CUSTOMER_RESEARCH"), values_1.v.literal("SEO_RESEARCH"), values_1.v.literal("ENGINEERING"), values_1.v.literal("DOCS"), values_1.v.literal("OPS"));
var taskPriority = values_1.v.union(values_1.v.literal(1), // critical
values_1.v.literal(2), // high
values_1.v.literal(3), // normal
values_1.v.literal(4) // low
);
var actorType = values_1.v.union(values_1.v.literal("AGENT"), values_1.v.literal("HUMAN"), values_1.v.literal("SYSTEM"));
var messageType = values_1.v.union(values_1.v.literal("COMMENT"), values_1.v.literal("WORK_PLAN"), values_1.v.literal("PROGRESS"), values_1.v.literal("ARTIFACT"), values_1.v.literal("REVIEW"), values_1.v.literal("APPROVAL_REQUEST"), values_1.v.literal("SYSTEM"));
var riskLevel = values_1.v.union(values_1.v.literal("GREEN"), values_1.v.literal("YELLOW"), values_1.v.literal("RED"));
var reviewType = values_1.v.union(values_1.v.literal("PRAISE"), values_1.v.literal("REFUTE"), values_1.v.literal("CHANGESET"), values_1.v.literal("APPROVE"));
var reviewStatus = values_1.v.union(values_1.v.literal("PENDING"), values_1.v.literal("ACCEPTED"), values_1.v.literal("REJECTED"), values_1.v.literal("SUPERSEDED"));
var agentVersionStatus = values_1.v.union(values_1.v.literal("DRAFT"), values_1.v.literal("TESTING"), values_1.v.literal("CANDIDATE"), values_1.v.literal("APPROVED"), values_1.v.literal("DEPRECATED"), values_1.v.literal("RETIRED"));
var agentInstanceStatus = values_1.v.union(values_1.v.literal("PROVISIONING"), values_1.v.literal("ACTIVE"), values_1.v.literal("PAUSED"), values_1.v.literal("READONLY"), values_1.v.literal("DRAINING"), values_1.v.literal("QUARANTINED"), values_1.v.literal("RETIRED"));
var deploymentStatus = values_1.v.union(values_1.v.literal("PENDING"), values_1.v.literal("ACTIVE"), values_1.v.literal("ROLLING_BACK"), values_1.v.literal("RETIRED"));
// ============================================================================
// SCHEMA
// ============================================================================
exports.default = (0, server_1.defineSchema)({
    // -------------------------------------------------------------------------
    // ARM: TENANTS (Multi-Tenancy Foundation)
    // -------------------------------------------------------------------------
    tenants: (0, server_1.defineTable)({
        name: values_1.v.string(),
        slug: values_1.v.string(),
        description: values_1.v.optional(values_1.v.string()),
        missionStatement: values_1.v.optional(values_1.v.string()),
        // Status
        active: values_1.v.boolean(),
        // Metadata
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_slug", ["slug"])
        .index("by_active", ["active"]),
    // -------------------------------------------------------------------------
    // ARM: ENVIRONMENTS (Release Channels)
    // -------------------------------------------------------------------------
    environments: (0, server_1.defineTable)({
        tenantId: values_1.v.id("tenants"),
        name: values_1.v.string(),
        type: values_1.v.union(values_1.v.literal("dev"), values_1.v.literal("staging"), values_1.v.literal("prod")),
        description: values_1.v.optional(values_1.v.string()),
        // Metadata
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_tenant", ["tenantId"])
        .index("by_type", ["type"])
        .index("by_tenant_type", ["tenantId", "type"]),
    // -------------------------------------------------------------------------
    // ARM: OPERATORS (Human Identity)
    // -------------------------------------------------------------------------
    operators: (0, server_1.defineTable)({
        tenantId: values_1.v.id("tenants"),
        // Identity
        email: values_1.v.string(),
        name: values_1.v.string(),
        authId: values_1.v.optional(values_1.v.string()), // External auth provider ID
        // Status
        active: values_1.v.boolean(),
        // GDPR fields
        lastLoginAt: values_1.v.optional(values_1.v.number()),
        createdAt: values_1.v.number(),
        // Metadata
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_tenant", ["tenantId"])
        .index("by_email", ["email"])
        .index("by_auth_id", ["authId"])
        .index("by_tenant_email", ["tenantId", "email"]),
    // -------------------------------------------------------------------------
    // ARM: ROLES (RBAC Role Definitions)
    // -------------------------------------------------------------------------
    roles: (0, server_1.defineTable)({
        tenantId: values_1.v.id("tenants"),
        name: values_1.v.string(),
        description: values_1.v.optional(values_1.v.string()),
        // Permissions array (references permissions table)
        permissions: values_1.v.array(values_1.v.string()),
        // Metadata
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_tenant", ["tenantId"])
        .index("by_name", ["name"])
        .index("by_tenant_name", ["tenantId", "name"]),
    // -------------------------------------------------------------------------
    // ARM: PERMISSIONS (Permission Registry)
    // -------------------------------------------------------------------------
    permissions: (0, server_1.defineTable)({
        resource: values_1.v.string(), // e.g., "tasks", "agents", "approvals"
        action: values_1.v.string(), // e.g., "create", "read", "update", "delete"
        description: values_1.v.optional(values_1.v.string()),
        // Metadata
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_resource", ["resource"])
        .index("by_resource_action", ["resource", "action"]),
    // -------------------------------------------------------------------------
    // ARM: ROLE ASSIGNMENTS (Operator-to-Role Mappings)
    // -------------------------------------------------------------------------
    roleAssignments: (0, server_1.defineTable)({
        operatorId: values_1.v.id("operators"),
        roleId: values_1.v.id("roles"),
        // Scope (optional: tenant-wide if not specified)
        scope: values_1.v.optional(values_1.v.object({
            type: values_1.v.union(values_1.v.literal("tenant"), values_1.v.literal("project"), values_1.v.literal("environment")),
            id: values_1.v.string(),
        })),
        // Metadata
        assignedBy: values_1.v.optional(values_1.v.id("operators")),
        assignedAt: values_1.v.number(),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_operator", ["operatorId"])
        .index("by_role", ["roleId"])
        .index("by_operator_role", ["operatorId", "roleId"]),
    // -------------------------------------------------------------------------
    // ARM: AGENT TEMPLATES (Registry)
    // -------------------------------------------------------------------------
    agentTemplates: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        name: values_1.v.string(),
        slug: values_1.v.string(),
        description: values_1.v.optional(values_1.v.string()),
        active: values_1.v.boolean(),
        createdBy: values_1.v.optional(values_1.v.id("operators")),
        createdAt: values_1.v.number(),
        updatedAt: values_1.v.number(),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_tenant", ["tenantId"])
        .index("by_project", ["projectId"])
        .index("by_slug", ["slug"])
        .index("by_tenant_slug", ["tenantId", "slug"]),
    // -------------------------------------------------------------------------
    // ARM: AGENT VERSIONS (Registry)
    // -------------------------------------------------------------------------
    agentVersions: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        templateId: values_1.v.id("agentTemplates"),
        version: values_1.v.number(),
        genomeHash: values_1.v.string(),
        genome: values_1.v.object({
            modelConfig: values_1.v.object({
                provider: values_1.v.string(),
                modelId: values_1.v.string(),
                temperature: values_1.v.optional(values_1.v.number()),
                maxTokens: values_1.v.optional(values_1.v.number()),
            }),
            promptBundleHash: values_1.v.string(),
            toolManifestHash: values_1.v.string(),
            provenance: values_1.v.object({
                createdBy: values_1.v.string(),
                source: values_1.v.string(),
                createdAt: values_1.v.number(),
            }),
        }),
        status: agentVersionStatus,
        notes: values_1.v.optional(values_1.v.string()),
        createdBy: values_1.v.optional(values_1.v.id("operators")),
        approvedBy: values_1.v.optional(values_1.v.id("operators")),
        createdAt: values_1.v.number(),
        updatedAt: values_1.v.number(),
        metadata: values_1.v.optional(values_1.v.any()),
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
    agentInstances: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        templateId: values_1.v.id("agentTemplates"),
        versionId: values_1.v.id("agentVersions"),
        environmentId: values_1.v.optional(values_1.v.id("environments")),
        name: values_1.v.string(),
        status: agentInstanceStatus,
        legacyAgentId: values_1.v.optional(values_1.v.id("agents")),
        assignedOperatorId: values_1.v.optional(values_1.v.id("operators")),
        activatedAt: values_1.v.optional(values_1.v.number()),
        retiredAt: values_1.v.optional(values_1.v.number()),
        metadata: values_1.v.optional(values_1.v.any()),
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
    policyEnvelopes: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        templateId: values_1.v.optional(values_1.v.id("agentTemplates")),
        versionId: values_1.v.optional(values_1.v.id("agentVersions")),
        name: values_1.v.string(),
        active: values_1.v.boolean(),
        priority: values_1.v.number(),
        rules: values_1.v.any(),
        createdBy: values_1.v.optional(values_1.v.id("operators")),
        createdAt: values_1.v.number(),
        updatedAt: values_1.v.number(),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_tenant", ["tenantId"])
        .index("by_project", ["projectId"])
        .index("by_template", ["templateId"])
        .index("by_version", ["versionId"])
        .index("by_active", ["active"]),
    // -------------------------------------------------------------------------
    // ARM: APPROVAL RECORDS (Governance)
    // -------------------------------------------------------------------------
    approvalRecords: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        instanceId: values_1.v.optional(values_1.v.id("agentInstances")),
        versionId: values_1.v.optional(values_1.v.id("agentVersions")),
        legacyApprovalId: values_1.v.optional(values_1.v.id("approvals")),
        actionType: values_1.v.string(),
        riskLevel: riskLevel,
        rollbackPlan: values_1.v.optional(values_1.v.string()),
        justification: values_1.v.string(),
        escalationLevel: values_1.v.optional(values_1.v.number()),
        status: values_1.v.union(values_1.v.literal("PENDING"), values_1.v.literal("APPROVED"), values_1.v.literal("DENIED"), values_1.v.literal("EXPIRED"), values_1.v.literal("CANCELED")),
        requestedBy: values_1.v.optional(values_1.v.id("operators")),
        requestedAt: values_1.v.number(),
        decidedBy: values_1.v.optional(values_1.v.id("operators")),
        decidedAt: values_1.v.optional(values_1.v.number()),
        decisionReason: values_1.v.optional(values_1.v.string()),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_tenant", ["tenantId"])
        .index("by_project", ["projectId"])
        .index("by_status", ["status"])
        .index("by_instance", ["instanceId"])
        .index("by_legacy_approval", ["legacyApprovalId"]),
    // -------------------------------------------------------------------------
    // ARM: CHANGE RECORDS (Governance + Audit)
    // -------------------------------------------------------------------------
    changeRecords: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        templateId: values_1.v.optional(values_1.v.id("agentTemplates")),
        versionId: values_1.v.optional(values_1.v.id("agentVersions")),
        instanceId: values_1.v.optional(values_1.v.id("agentInstances")),
        operatorId: values_1.v.optional(values_1.v.id("operators")),
        legacyAgentId: values_1.v.optional(values_1.v.id("agents")),
        type: values_1.v.union(values_1.v.literal("TEMPLATE_CREATED"), values_1.v.literal("VERSION_CREATED"), values_1.v.literal("VERSION_TRANSITIONED"), values_1.v.literal("INSTANCE_CREATED"), values_1.v.literal("INSTANCE_TRANSITIONED"), values_1.v.literal("IDENTITY_UPDATED"), values_1.v.literal("POLICY_ATTACHED"), values_1.v.literal("TASK_TRANSITIONED"), values_1.v.literal("APPROVAL_REQUESTED"), values_1.v.literal("APPROVAL_DECIDED"), values_1.v.literal("DEPLOYMENT_CREATED"), values_1.v.literal("DEPLOYMENT_ACTIVATED"), values_1.v.literal("DEPLOYMENT_ROLLED_BACK"), values_1.v.literal("EMERGENCY_PAUSE"), values_1.v.literal("POLICY_DENIED"), values_1.v.literal("QC_RUN_CREATED"), values_1.v.literal("QC_FINDINGS_RECORDED")),
        summary: values_1.v.string(),
        payload: values_1.v.optional(values_1.v.any()),
        relatedTable: values_1.v.optional(values_1.v.string()),
        relatedId: values_1.v.optional(values_1.v.string()),
        timestamp: values_1.v.number(),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_tenant", ["tenantId"])
        .index("by_project", ["projectId"])
        .index("by_type", ["type"])
        .index("by_timestamp", ["timestamp"])
        .index("by_instance", ["instanceId"]),
    // -------------------------------------------------------------------------
    // ARM: DEPLOYMENTS (Governance)
    // -------------------------------------------------------------------------
    deployments: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        templateId: values_1.v.id("agentTemplates"),
        environmentId: values_1.v.id("environments"),
        targetVersionId: values_1.v.id("agentVersions"),
        previousVersionId: values_1.v.optional(values_1.v.id("agentVersions")),
        rolloutPolicy: values_1.v.optional(values_1.v.any()),
        status: deploymentStatus,
        createdBy: values_1.v.optional(values_1.v.id("operators")),
        approvedBy: values_1.v.optional(values_1.v.id("operators")),
        activatedAt: values_1.v.optional(values_1.v.number()),
        createdAt: values_1.v.number(),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_tenant", ["tenantId"])
        .index("by_template", ["templateId"])
        .index("by_environment", ["environmentId"])
        .index("by_status", ["status"])
        .index("by_target_version", ["targetVersionId"]),
    // -------------------------------------------------------------------------
    // ARM: OP EVENTS (Operational Telemetry)
    // -------------------------------------------------------------------------
    opEvents: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        type: values_1.v.union(values_1.v.literal("RUN_STARTED"), values_1.v.literal("RUN_STEP"), values_1.v.literal("RUN_COMPLETED"), values_1.v.literal("RUN_FAILED"), values_1.v.literal("TOOL_CALL_STARTED"), values_1.v.literal("TOOL_CALL_COMPLETED"), values_1.v.literal("TOOL_CALL_BLOCKED"), values_1.v.literal("WORKFLOW_STEP_STARTED"), values_1.v.literal("WORKFLOW_STEP_COMPLETED"), values_1.v.literal("WORKFLOW_STEP_FAILED"), values_1.v.literal("HEARTBEAT"), values_1.v.literal("COST_TICK"), values_1.v.literal("MESSAGE_SENT"), values_1.v.literal("DECISION_MADE"), values_1.v.literal("QC_RUN_STARTED"), values_1.v.literal("QC_RUN_COMPLETED"), values_1.v.literal("QC_RUN_FAILED")),
        timestamp: values_1.v.number(),
        instanceId: values_1.v.optional(values_1.v.id("agentInstances")),
        versionId: values_1.v.optional(values_1.v.id("agentVersions")),
        taskId: values_1.v.optional(values_1.v.id("tasks")),
        runId: values_1.v.optional(values_1.v.id("runs")),
        toolCallId: values_1.v.optional(values_1.v.id("toolCalls")),
        workflowRunId: values_1.v.optional(values_1.v.id("workflowRuns")),
        qcRunId: values_1.v.optional(values_1.v.id("qcRuns")),
        changeRecordId: values_1.v.optional(values_1.v.id("changeRecords")),
        payload: values_1.v.optional(values_1.v.any()),
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
    projects: (0, server_1.defineTable)({
        // ARM: Tenant scope (optional for migration; will be required after backfill)
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        name: values_1.v.string(),
        slug: values_1.v.string(),
        description: values_1.v.optional(values_1.v.string()),
        // GitHub integration
        githubRepo: values_1.v.optional(values_1.v.string()), // e.g., "owner/repo"
        githubBranch: values_1.v.optional(values_1.v.string()),
        githubWebhookSecret: values_1.v.optional(values_1.v.string()),
        // Agent swarm configuration
        swarmConfig: values_1.v.optional(values_1.v.object({
            maxAgents: values_1.v.number(),
            defaultModel: values_1.v.optional(values_1.v.string()),
            autoScale: values_1.v.boolean(),
        })),
        // Per-project policy defaults (optional, merged with global policy)
        policyDefaults: values_1.v.optional(values_1.v.object({
            budgetDefaults: values_1.v.optional(values_1.v.any()),
            riskThresholds: values_1.v.optional(values_1.v.any()),
        })),
        // Metadata
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_tenant", ["tenantId"])
        .index("by_slug", ["slug"])
        .index("by_github_repo", ["githubRepo"])
        .index("by_tenant_slug", ["tenantId", "slug"]),
    // -------------------------------------------------------------------------
    // AGENTS
    // -------------------------------------------------------------------------
    agents: (0, server_1.defineTable)({
        // ARM: Tenant scope (optional, backfill later)
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
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
        // ARM: Tenant scope (optional, backfill later)
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
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
        // Telegram thread reference
        threadRef: values_1.v.optional(values_1.v.object({
            chatId: values_1.v.string(),
            threadId: values_1.v.string(),
        })),
        // Assignment
        creatorAgentId: values_1.v.optional(values_1.v.id("agents")),
        assigneeIds: values_1.v.array(values_1.v.id("agents")),
        assigneeInstanceIds: values_1.v.optional(values_1.v.array(values_1.v.id("agentInstances"))),
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
        // Scheduling (for calendar view)
        scheduledFor: values_1.v.optional(values_1.v.number()),
        recurrence: values_1.v.optional(values_1.v.object({
            frequency: values_1.v.union(values_1.v.literal("DAILY"), values_1.v.literal("WEEKLY"), values_1.v.literal("MONTHLY")),
            interval: values_1.v.number(),
            daysOfWeek: values_1.v.optional(values_1.v.array(values_1.v.number())), // 0=Sun, 6=Sat
            endDate: values_1.v.optional(values_1.v.number()),
        })),
        // Labels
        labels: values_1.v.optional(values_1.v.array(values_1.v.string())),
        // Block reason
        blockedReason: values_1.v.optional(values_1.v.string()),
        // Redaction tracking
        redactedFields: values_1.v.optional(values_1.v.array(values_1.v.string())),
        // Provenance — where the task came from
        source: values_1.v.optional(values_1.v.union(values_1.v.literal("DASHBOARD"), values_1.v.literal("TELEGRAM"), values_1.v.literal("GITHUB"), values_1.v.literal("AGENT"), values_1.v.literal("API"), values_1.v.literal("TRELLO"), values_1.v.literal("SEED"), values_1.v.literal("MISSION_PROMPT"))),
        sourceRef: values_1.v.optional(values_1.v.string()), // e.g. "jaydubya818/repo#42", telegram msg id
        createdBy: values_1.v.optional(values_1.v.union(values_1.v.literal("HUMAN"), values_1.v.literal("AGENT"), values_1.v.literal("SYSTEM"))),
        createdByRef: values_1.v.optional(values_1.v.string()), // agent id or user email
        // Metadata
        metadata: values_1.v.optional(values_1.v.any()),
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
    taskTransitions: (0, server_1.defineTable)({
        // ARM: Tenant scope (optional, backfill later)
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
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
    // TASK EVENTS (Canonical timeline stream)
    // -------------------------------------------------------------------------
    taskEvents: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        taskId: values_1.v.id("tasks"),
        eventType: values_1.v.union(values_1.v.literal("TASK_CREATED"), values_1.v.literal("TASK_TRANSITION"), values_1.v.literal("POLICY_DECISION"), values_1.v.literal("APPROVAL_REQUESTED"), values_1.v.literal("APPROVAL_ESCALATED"), values_1.v.literal("APPROVAL_APPROVED"), values_1.v.literal("APPROVAL_DENIED"), values_1.v.literal("APPROVAL_EXPIRED"), values_1.v.literal("RUN_STARTED"), values_1.v.literal("RUN_COMPLETED"), values_1.v.literal("RUN_FAILED"), values_1.v.literal("TOOL_CALL"), values_1.v.literal("OPERATOR_CONTROL")),
        actorType: actorType,
        actorId: values_1.v.optional(values_1.v.string()),
        relatedId: values_1.v.optional(values_1.v.string()),
        timestamp: values_1.v.number(),
        beforeState: values_1.v.optional(values_1.v.any()),
        afterState: values_1.v.optional(values_1.v.any()),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_task", ["taskId"])
        .index("by_project", ["projectId"])
        .index("by_project_task", ["projectId", "taskId"])
        .index("by_task_type", ["taskId", "eventType"]),
    // -------------------------------------------------------------------------
    // MESSAGES (Task Thread)
    // -------------------------------------------------------------------------
    messages: (0, server_1.defineTable)({
        // ARM: Tenant scope (optional, backfill later)
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        // Project scope (denormalized for efficient queries)
        projectId: values_1.v.optional(values_1.v.id("projects")),
        // Idempotency
        idempotencyKey: values_1.v.optional(values_1.v.string()),
        // Reference
        taskId: values_1.v.id("tasks"),
        // Author
        authorType: actorType,
        authorAgentId: values_1.v.optional(values_1.v.id("agents")),
        authorInstanceId: values_1.v.optional(values_1.v.id("agentInstances")),
        operatorId: values_1.v.optional(values_1.v.id("operators")),
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
        .index("by_author_instance", ["authorInstanceId"])
        .index("by_idempotency", ["idempotencyKey"])
        .index("by_project", ["projectId"]),
    // -------------------------------------------------------------------------
    // RUNS (Agent Execution Turns)
    // -------------------------------------------------------------------------
    runs: (0, server_1.defineTable)({
        // ARM: Tenant scope (optional, backfill later)
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        // Project scope (denormalized for efficient queries)
        projectId: values_1.v.optional(values_1.v.id("projects")),
        // Idempotency
        idempotencyKey: values_1.v.string(),
        // References
        agentId: values_1.v.id("agents"),
        instanceId: values_1.v.optional(values_1.v.id("agentInstances")),
        versionId: values_1.v.optional(values_1.v.id("agentVersions")),
        templateId: values_1.v.optional(values_1.v.id("agentTemplates")),
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
        .index("by_instance", ["instanceId"])
        .index("by_version", ["versionId"])
        .index("by_task", ["taskId"])
        .index("by_session", ["sessionKey"])
        .index("by_idempotency", ["idempotencyKey"])
        .index("by_project", ["projectId"]),
    // -------------------------------------------------------------------------
    // TOOL CALLS
    // -------------------------------------------------------------------------
    toolCalls: (0, server_1.defineTable)({
        // ARM: Tenant scope (optional, backfill later)
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        // Project scope (denormalized for efficient queries)
        projectId: values_1.v.optional(values_1.v.id("projects")),
        // References
        runId: values_1.v.id("runs"),
        agentId: values_1.v.id("agents"),
        instanceId: values_1.v.optional(values_1.v.id("agentInstances")),
        versionId: values_1.v.optional(values_1.v.id("agentVersions")),
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
        .index("by_instance", ["instanceId"])
        .index("by_task", ["taskId"])
        .index("by_risk", ["riskLevel"])
        .index("by_project", ["projectId"]),
    // -------------------------------------------------------------------------
    // APPROVALS
    // -------------------------------------------------------------------------
    approvals: (0, server_1.defineTable)({
        // ARM: Tenant scope (optional, backfill later)
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
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
        status: values_1.v.union(values_1.v.literal("PENDING"), values_1.v.literal("ESCALATED"), values_1.v.literal("APPROVED"), values_1.v.literal("DENIED"), values_1.v.literal("EXPIRED"), values_1.v.literal("CANCELED")),
        // Decision
        decidedByAgentId: values_1.v.optional(values_1.v.id("agents")),
        decidedByUserId: values_1.v.optional(values_1.v.string()),
        decidedAt: values_1.v.optional(values_1.v.number()),
        decisionReason: values_1.v.optional(values_1.v.string()),
        firstDecisionByUserId: values_1.v.optional(values_1.v.string()),
        firstDecisionAt: values_1.v.optional(values_1.v.number()),
        firstDecisionReason: values_1.v.optional(values_1.v.string()),
        escalationLevel: values_1.v.optional(values_1.v.number()),
        escalatedAt: values_1.v.optional(values_1.v.number()),
        escalatedBy: values_1.v.optional(values_1.v.string()),
        escalationReason: values_1.v.optional(values_1.v.string()),
        requiredDecisionCount: values_1.v.optional(values_1.v.number()),
        decisionCount: values_1.v.optional(values_1.v.number()),
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
        // ARM: Tenant scope (optional, backfill later)
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
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
        // ARM: Tenant scope (optional, backfill later)
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
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
        qcRunId: values_1.v.optional(values_1.v.id("qcRuns")),
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
        // ARM: Tenant scope (optional, backfill later)
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
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
        // ARM: Tenant scope (optional, backfill later)
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
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
    // SAVED VIEWS (operator filters/presets)
    // -------------------------------------------------------------------------
    savedViews: (0, server_1.defineTable)({
        projectId: values_1.v.id("projects"),
        ownerUserId: values_1.v.string(),
        name: values_1.v.string(),
        description: values_1.v.optional(values_1.v.string()),
        scope: values_1.v.union(values_1.v.literal("KANBAN"), values_1.v.literal("APPROVALS"), values_1.v.literal("AGENTS"), values_1.v.literal("SEARCH")),
        filters: values_1.v.any(),
        isShared: values_1.v.boolean(),
        createdAt: values_1.v.number(),
        updatedAt: values_1.v.number(),
    })
        .index("by_project", ["projectId"])
        .index("by_owner", ["ownerUserId"])
        .index("by_project_owner", ["projectId", "ownerUserId"])
        .index("by_project_scope", ["projectId", "scope"]),
    // -------------------------------------------------------------------------
    // WATCH SUBSCRIPTIONS (user watchlist for entities)
    // -------------------------------------------------------------------------
    watchSubscriptions: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        userId: values_1.v.string(),
        entityType: values_1.v.union(values_1.v.literal("TASK"), values_1.v.literal("APPROVAL"), values_1.v.literal("AGENT"), values_1.v.literal("PROJECT")),
        entityId: values_1.v.string(),
        createdAt: values_1.v.number(),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_user", ["userId"])
        .index("by_entity", ["entityType", "entityId"])
        .index("by_user_entity", ["userId", "entityType", "entityId"])
        .index("by_project", ["projectId"]),
    // -------------------------------------------------------------------------
    // OPERATOR CONTROLS (global/project execution mode)
    // -------------------------------------------------------------------------
    operatorControls: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        mode: values_1.v.union(values_1.v.literal("NORMAL"), values_1.v.literal("PAUSED"), values_1.v.literal("DRAINING"), values_1.v.literal("QUARANTINED")),
        reason: values_1.v.optional(values_1.v.string()),
        updatedBy: values_1.v.string(),
        updatedAt: values_1.v.number(),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_project", ["projectId"])
        .index("by_project_mode", ["projectId", "mode"])
        .index("by_updated_at", ["updatedAt"]),
    // -------------------------------------------------------------------------
    // AGENT DOCUMENTS (WORKING.md, daily notes, session memory)
    // -------------------------------------------------------------------------
    agentDocuments: (0, server_1.defineTable)({
        // ARM: Tenant scope (optional, backfill later)
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
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
        // ARM: Tenant scope (optional, backfill later)
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
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
        // ARM: Tenant scope (optional, backfill later)
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
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
    // ============================================================================
    // WEBHOOKS
    // ============================================================================
    webhooks: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        name: values_1.v.string(),
        url: values_1.v.string(),
        secret: values_1.v.string(), // For HMAC signature
        // Events to subscribe to
        events: values_1.v.array(values_1.v.string()),
        // Filters
        filters: values_1.v.optional(values_1.v.object({
            taskTypes: values_1.v.optional(values_1.v.array(values_1.v.string())),
            agentIds: values_1.v.optional(values_1.v.array(values_1.v.id("agents"))),
            statuses: values_1.v.optional(values_1.v.array(values_1.v.string())),
        })),
        // Status
        active: values_1.v.boolean(),
        // Stats
        deliveryCount: values_1.v.number(),
        failureCount: values_1.v.number(),
        lastDeliveryAt: values_1.v.optional(values_1.v.number()),
        lastFailureAt: values_1.v.optional(values_1.v.number()),
        createdBy: values_1.v.optional(values_1.v.string()),
    })
        .index("by_project", ["projectId"])
        .index("by_active", ["active"])
        .index("by_project_active", ["projectId", "active"]),
    webhookDeliveries: (0, server_1.defineTable)({
        webhookId: values_1.v.id("webhooks"),
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        event: values_1.v.string(),
        payload: values_1.v.any(),
        // Delivery
        url: values_1.v.string(),
        status: values_1.v.union(values_1.v.literal("PENDING"), values_1.v.literal("DELIVERED"), values_1.v.literal("FAILED"), values_1.v.literal("RETRYING")),
        attempts: values_1.v.number(),
        maxAttempts: values_1.v.number(),
        nextRetryAt: values_1.v.optional(values_1.v.number()),
        // Response
        responseStatus: values_1.v.optional(values_1.v.number()),
        responseBody: values_1.v.optional(values_1.v.string()),
        error: values_1.v.optional(values_1.v.string()),
        deliveredAt: values_1.v.optional(values_1.v.number()),
    })
        .index("by_webhook", ["webhookId"])
        .index("by_status", ["status"])
        .index("by_next_retry", ["nextRetryAt"]),
    // ============================================================================
    // PEER REVIEWS
    // ============================================================================
    reviews: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.id("projects"),
        taskId: values_1.v.id("tasks"),
        // Review metadata
        type: reviewType,
        status: reviewStatus,
        // Reviewer
        reviewerAgentId: values_1.v.optional(values_1.v.id("agents")),
        reviewerUserId: values_1.v.optional(values_1.v.string()),
        // Target (what's being reviewed)
        targetType: values_1.v.union(values_1.v.literal("TASK"), values_1.v.literal("DELIVERABLE"), values_1.v.literal("ARTIFACT"), values_1.v.literal("CODE_CHANGE")),
        targetId: values_1.v.optional(values_1.v.string()),
        // Review content
        summary: values_1.v.string(),
        details: values_1.v.optional(values_1.v.string()),
        score: values_1.v.optional(values_1.v.number()), // 1-10 for PRAISE
        severity: values_1.v.optional(values_1.v.union(values_1.v.literal("MINOR"), values_1.v.literal("MAJOR"), values_1.v.literal("CRITICAL"))), // For REFUTE
        // For CHANGESET type
        changeset: values_1.v.optional(values_1.v.object({
            files: values_1.v.array(values_1.v.object({
                path: values_1.v.string(),
                action: values_1.v.union(values_1.v.literal("ADD"), values_1.v.literal("MODIFY"), values_1.v.literal("DELETE")),
                diff: values_1.v.optional(values_1.v.string()),
            })),
            description: values_1.v.string(),
        })),
        // Response/resolution
        responseBy: values_1.v.optional(values_1.v.id("agents")),
        responseText: values_1.v.optional(values_1.v.string()),
        resolvedAt: values_1.v.optional(values_1.v.number()),
        // Metadata
        metadata: values_1.v.optional(values_1.v.any()),
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
    taskDependencies: (0, server_1.defineTable)({
        parentTaskId: values_1.v.id("tasks"),
        taskId: values_1.v.id("tasks"), // The task that has the dependency
        dependsOnTaskId: values_1.v.id("tasks"), // The task it depends on
    })
        .index("by_parent", ["parentTaskId"])
        .index("by_task", ["taskId"])
        .index("by_depends_on", ["dependsOnTaskId"]),
    // -------------------------------------------------------------------------
    // AGENT PERFORMANCE (Learning System — Aggregated Metrics)
    // -------------------------------------------------------------------------
    agentPerformance: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        agentId: values_1.v.id("agents"),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        taskType: values_1.v.string(),
        successCount: values_1.v.number(),
        failureCount: values_1.v.number(),
        avgCompletionTimeMs: values_1.v.number(),
        avgCostUsd: values_1.v.number(),
        totalTasksCompleted: values_1.v.number(),
        lastUpdatedAt: values_1.v.number(),
    })
        .index("by_agent", ["agentId"])
        .index("by_agent_type", ["agentId", "taskType"])
        .index("by_project", ["projectId"]),
    // -------------------------------------------------------------------------
    // AGENT PATTERNS (Learning System — Discovered Strengths/Weaknesses)
    // -------------------------------------------------------------------------
    agentPatterns: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        agentId: values_1.v.id("agents"),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        pattern: values_1.v.string(),
        confidence: values_1.v.number(),
        evidence: values_1.v.array(values_1.v.string()),
        discoveredAt: values_1.v.number(),
        lastSeenAt: values_1.v.number(),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_agent", ["agentId"])
        .index("by_agent_pattern", ["agentId", "pattern"])
        .index("by_project", ["projectId"]),
    // -------------------------------------------------------------------------
    // ORG MEMBERS (Human Team Members + Org Chart + RBAC)
    // -------------------------------------------------------------------------
    orgMembers: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        // Identity
        name: values_1.v.string(),
        email: values_1.v.optional(values_1.v.string()),
        role: values_1.v.string(), // e.g., "CEO", "CSO", "Engineer"
        title: values_1.v.optional(values_1.v.string()),
        avatar: values_1.v.optional(values_1.v.string()),
        // Org hierarchy
        parentMemberId: values_1.v.optional(values_1.v.id("orgMembers")),
        level: values_1.v.number(), // 0 = top level (CEO), 1 = reports to CEO, etc.
        // Responsibilities
        responsibilities: values_1.v.optional(values_1.v.array(values_1.v.string())),
        // ---- RBAC (Role-Based Access Control) ----
        // System-wide role: determines base permissions
        systemRole: values_1.v.optional(values_1.v.union(values_1.v.literal("OWNER"), // Full access to everything
        values_1.v.literal("ADMIN"), // Manage users, all projects
        values_1.v.literal("MANAGER"), // Manage assigned projects
        values_1.v.literal("MEMBER"), // Edit access to assigned projects
        values_1.v.literal("VIEWER") // Read-only access
        )),
        // Per-project access: overrides systemRole for specific projects
        // Array of { projectId, accessLevel } pairs
        projectAccess: values_1.v.optional(values_1.v.array(values_1.v.object({
            projectId: values_1.v.id("projects"),
            accessLevel: values_1.v.union(values_1.v.literal("ADMIN"), // Full control of this project
            values_1.v.literal("EDIT"), // Can create/edit tasks, manage agents
            values_1.v.literal("VIEW") // Read-only access to this project
            ),
        }))),
        // Granular permissions (override systemRole for fine-tuning)
        permissions: values_1.v.optional(values_1.v.array(values_1.v.string())),
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
        active: values_1.v.boolean(),
        // Invite tracking
        invitedAt: values_1.v.optional(values_1.v.number()),
        invitedBy: values_1.v.optional(values_1.v.id("orgMembers")),
        lastLoginAt: values_1.v.optional(values_1.v.number()),
        // Metadata
        metadata: values_1.v.optional(values_1.v.any()),
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
    captures: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        // Reference
        taskId: values_1.v.optional(values_1.v.id("tasks")),
        agentId: values_1.v.optional(values_1.v.id("agents")),
        // Artifact details
        title: values_1.v.string(),
        description: values_1.v.optional(values_1.v.string()),
        type: values_1.v.union(values_1.v.literal("SCREENSHOT"), values_1.v.literal("DIAGRAM"), values_1.v.literal("MOCKUP"), values_1.v.literal("CHART"), values_1.v.literal("VIDEO"), values_1.v.literal("OTHER")),
        // Storage
        url: values_1.v.optional(values_1.v.string()), // External URL or Convex file storage ID
        fileStorageId: values_1.v.optional(values_1.v.string()),
        thumbnailUrl: values_1.v.optional(values_1.v.string()),
        // Metadata
        width: values_1.v.optional(values_1.v.number()),
        height: values_1.v.optional(values_1.v.number()),
        fileSize: values_1.v.optional(values_1.v.number()),
        mimeType: values_1.v.optional(values_1.v.string()),
        // Tags
        tags: values_1.v.optional(values_1.v.array(values_1.v.string())),
        // Timestamps
        capturedAt: values_1.v.number(),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_project", ["projectId"])
        .index("by_task", ["taskId"])
        .index("by_agent", ["agentId"])
        .index("by_type", ["type"])
        .index("by_captured_at", ["capturedAt"]),
    // -------------------------------------------------------------------------
    // ORG ASSIGNMENTS (Per-Project Role Hierarchy)
    // -------------------------------------------------------------------------
    orgAssignments: (0, server_1.defineTable)({
        agentId: values_1.v.id("agents"),
        projectId: values_1.v.id("projects"),
        // Org-level position (separate from capability role)
        orgPosition: values_1.v.union(values_1.v.literal("CEO"), values_1.v.literal("LEAD"), values_1.v.literal("SPECIALIST"), values_1.v.literal("INTERN")),
        // Scope of assignment
        scope: values_1.v.union(values_1.v.literal("PROJECT"), values_1.v.literal("SQUAD"), values_1.v.literal("REPO")),
        scopeRef: values_1.v.optional(values_1.v.string()), // squad name or repo path
        // Metadata
        assignedBy: values_1.v.optional(values_1.v.string()),
        assignedAt: values_1.v.number(),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_agent", ["agentId"])
        .index("by_project", ["projectId"])
        .index("by_position", ["orgPosition"])
        .index("by_project_position", ["projectId", "orgPosition"]),
    // -------------------------------------------------------------------------
    // AGENT IDENTITIES (OpenClaw IDENTITY/SOUL/TOOLS Governance)
    // -------------------------------------------------------------------------
    agentIdentities: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        agentId: values_1.v.id("agents"),
        templateId: values_1.v.optional(values_1.v.id("agentTemplates")),
        versionId: values_1.v.optional(values_1.v.id("agentVersions")),
        instanceId: values_1.v.optional(values_1.v.id("agentInstances")),
        legacyAgentId: values_1.v.optional(values_1.v.id("agents")),
        // IDENTITY.md fields
        name: values_1.v.string(),
        creature: values_1.v.optional(values_1.v.string()),
        vibe: values_1.v.optional(values_1.v.string()),
        emoji: values_1.v.optional(values_1.v.string()),
        avatarPath: values_1.v.optional(values_1.v.string()),
        // SOUL.md content
        soulContent: values_1.v.optional(values_1.v.string()),
        soulHash: values_1.v.optional(values_1.v.string()),
        // TOOLS.md content
        toolsNotes: values_1.v.optional(values_1.v.string()),
        // Validation
        validationStatus: values_1.v.union(values_1.v.literal("VALID"), values_1.v.literal("INVALID"), values_1.v.literal("MISSING"), values_1.v.literal("PARTIAL")),
        validationErrors: values_1.v.optional(values_1.v.array(values_1.v.string())),
        lastScannedAt: values_1.v.optional(values_1.v.number()),
        metadata: values_1.v.optional(values_1.v.any()),
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
    telegraphThreads: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        title: values_1.v.string(),
        participants: values_1.v.array(values_1.v.string()), // agent IDs or human refs
        // Channel
        channel: values_1.v.union(values_1.v.literal("INTERNAL"), values_1.v.literal("TELEGRAM")),
        externalThreadRef: values_1.v.optional(values_1.v.string()),
        // Linked entities
        linkedTaskId: values_1.v.optional(values_1.v.id("tasks")),
        linkedApprovalId: values_1.v.optional(values_1.v.id("approvals")),
        linkedIncidentId: values_1.v.optional(values_1.v.string()),
        // State
        lastMessageAt: values_1.v.optional(values_1.v.number()),
        messageCount: values_1.v.number(),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_project", ["projectId"])
        .index("by_linked_task", ["linkedTaskId"])
        .index("by_last_message", ["lastMessageAt"])
        .index("by_channel", ["channel"]),
    // -------------------------------------------------------------------------
    // TELEGRAPH MESSAGES (Internal + External Messaging)
    // -------------------------------------------------------------------------
    telegraphMessages: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        threadId: values_1.v.id("telegraphThreads"),
        // Sender
        senderId: values_1.v.string(),
        senderType: values_1.v.union(values_1.v.literal("AGENT"), values_1.v.literal("HUMAN"), values_1.v.literal("SYSTEM")),
        // Content
        content: values_1.v.string(),
        replyToId: values_1.v.optional(values_1.v.id("telegraphMessages")),
        // Channel + status
        channel: values_1.v.union(values_1.v.literal("INTERNAL"), values_1.v.literal("TELEGRAM")),
        externalRef: values_1.v.optional(values_1.v.string()),
        status: values_1.v.union(values_1.v.literal("DRAFT"), values_1.v.literal("SENT"), values_1.v.literal("DELIVERED"), values_1.v.literal("READ"), values_1.v.literal("FAILED")),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_thread", ["threadId"])
        .index("by_project", ["projectId"])
        .index("by_sender", ["senderId"])
        .index("by_status", ["status"]),
    // -------------------------------------------------------------------------
    // MEETINGS (Zoom-Ready Meeting Orchestration)
    // -------------------------------------------------------------------------
    meetings: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        title: values_1.v.string(),
        agenda: values_1.v.optional(values_1.v.string()),
        // Scheduling
        scheduledAt: values_1.v.number(),
        duration: values_1.v.number(), // minutes
        // Status
        status: values_1.v.union(values_1.v.literal("SCHEDULED"), values_1.v.literal("IN_PROGRESS"), values_1.v.literal("COMPLETED"), values_1.v.literal("CANCELLED")),
        // Participants
        hostAgentId: values_1.v.optional(values_1.v.string()),
        participants: values_1.v.array(values_1.v.object({
            agentId: values_1.v.string(),
            orgPosition: values_1.v.optional(values_1.v.string()),
            role: values_1.v.optional(values_1.v.string()), // host, presenter, attendee
        })),
        // Provider
        provider: values_1.v.union(values_1.v.literal("MANUAL"), values_1.v.literal("ZOOM")),
        externalMeetingRef: values_1.v.optional(values_1.v.string()),
        // Artifacts
        notesDocPath: values_1.v.optional(values_1.v.string()),
        notes: values_1.v.optional(values_1.v.string()),
        actionItems: values_1.v.optional(values_1.v.array(values_1.v.object({
            description: values_1.v.string(),
            assigneeAgentId: values_1.v.optional(values_1.v.string()),
            taskId: values_1.v.optional(values_1.v.id("tasks")),
            dueAt: values_1.v.optional(values_1.v.number()),
            completed: values_1.v.boolean(),
        }))),
        // Calendar
        calendarPayload: values_1.v.optional(values_1.v.string()), // JSON iCal-compatible payload
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_project", ["projectId"])
        .index("by_status", ["status"])
        .index("by_host", ["hostAgentId"])
        .index("by_scheduled", ["scheduledAt"]),
    // -------------------------------------------------------------------------
    // VOICE ARTIFACTS (TTS Audio + Transcripts)
    // -------------------------------------------------------------------------
    voiceArtifacts: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        agentId: values_1.v.optional(values_1.v.string()),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        // Content
        text: values_1.v.string(),
        transcript: values_1.v.optional(values_1.v.string()),
        // Audio
        audioUrl: values_1.v.optional(values_1.v.string()),
        audioStorageId: values_1.v.optional(values_1.v.string()),
        // Provider
        provider: values_1.v.union(values_1.v.literal("ELEVENLABS"), values_1.v.literal("OTHER")),
        voiceId: values_1.v.optional(values_1.v.string()),
        durationMs: values_1.v.optional(values_1.v.number()),
        // Links
        linkedMessageId: values_1.v.optional(values_1.v.id("telegraphMessages")),
        linkedMeetingId: values_1.v.optional(values_1.v.id("meetings")),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_agent", ["agentId"])
        .index("by_project", ["projectId"])
        .index("by_linked_message", ["linkedMessageId"]),
    // -------------------------------------------------------------------------
    // RATE LIMIT (External input throttling)
    // -------------------------------------------------------------------------
    rateLimitEntries: (0, server_1.defineTable)({
        key: values_1.v.string(), // e.g. "telegram:chatId" or "webhook:projectId"
        windowStart: values_1.v.number(), // start of 1-minute window (ms)
        count: values_1.v.number(),
    })
        .index("by_key", ["key"]),
    // -------------------------------------------------------------------------
    // WORKFLOWS (Multi-Agent Workflow Definitions)
    // -------------------------------------------------------------------------
    workflows: (0, server_1.defineTable)({
        // Identity
        workflowId: values_1.v.string(), // e.g., "feature-dev", "bug-fix", "security-audit"
        name: values_1.v.string(),
        description: values_1.v.string(),
        // Agent definitions
        agents: values_1.v.array(values_1.v.object({
            id: values_1.v.string(),
            persona: values_1.v.string(), // References agents/*.yaml
            workspace: values_1.v.optional(values_1.v.object({
                files: values_1.v.optional(values_1.v.any()),
            })),
        })),
        // Step definitions
        steps: values_1.v.array(values_1.v.object({
            id: values_1.v.string(),
            agent: values_1.v.string(), // References agents[].id
            input: values_1.v.string(), // Template with {{variables}}
            expects: values_1.v.string(), // Success criteria (e.g., "STATUS: done")
            retryLimit: values_1.v.number(),
            timeoutMinutes: values_1.v.number(),
        })),
        // Status
        active: values_1.v.boolean(),
        version: values_1.v.number(),
        // Metadata
        createdBy: values_1.v.optional(values_1.v.string()),
        createdAt: values_1.v.number(),
        updatedAt: values_1.v.number(),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_workflow_id", ["workflowId"])
        .index("by_active", ["active"]),
    // -------------------------------------------------------------------------
    // WORKFLOW RUNS (Execution State for Multi-Agent Workflows)
    // -------------------------------------------------------------------------
    workflowRuns: (0, server_1.defineTable)({
        // ARM: Tenant scope (optional, backfill later)
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        // Identity
        runId: values_1.v.string(), // Short ID for CLI/UI display
        workflowId: values_1.v.string(),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        // Parent task
        parentTaskId: values_1.v.optional(values_1.v.id("tasks")),
        // Status
        status: values_1.v.union(values_1.v.literal("PENDING"), values_1.v.literal("RUNNING"), values_1.v.literal("COMPLETED"), values_1.v.literal("FAILED"), values_1.v.literal("PAUSED")),
        // Progress
        currentStepIndex: values_1.v.number(),
        totalSteps: values_1.v.number(),
        // Step execution state
        steps: values_1.v.array(values_1.v.object({
            stepId: values_1.v.string(),
            status: values_1.v.union(values_1.v.literal("PENDING"), values_1.v.literal("RUNNING"), values_1.v.literal("DONE"), values_1.v.literal("FAILED")),
            taskId: values_1.v.optional(values_1.v.id("tasks")),
            agentId: values_1.v.optional(values_1.v.id("agents")),
            startedAt: values_1.v.optional(values_1.v.number()),
            completedAt: values_1.v.optional(values_1.v.number()),
            retryCount: values_1.v.number(),
            error: values_1.v.optional(values_1.v.string()),
            output: values_1.v.optional(values_1.v.string()), // Extracted from task deliverable
        })),
        // Context variables passed between steps
        context: values_1.v.any(),
        // Initial input
        initialInput: values_1.v.string(),
        // Timing
        startedAt: values_1.v.number(),
        completedAt: values_1.v.optional(values_1.v.number()),
        // Metadata
        metadata: values_1.v.optional(values_1.v.any()),
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
    qcRuns: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        // Display ID and ordering
        runId: values_1.v.string(),
        runSequence: values_1.v.number(),
        // Lifecycle
        status: values_1.v.union(values_1.v.literal("PENDING"), values_1.v.literal("RUNNING"), values_1.v.literal("COMPLETED"), values_1.v.literal("FAILED"), values_1.v.literal("CANCELED")),
        // Governance (riskGrade is deterministic from gates; qualityScore is informational)
        riskGrade: values_1.v.optional(values_1.v.union(values_1.v.literal("GREEN"), values_1.v.literal("YELLOW"), values_1.v.literal("RED"))),
        qualityScore: values_1.v.optional(values_1.v.number()),
        // Target
        repoUrl: values_1.v.string(),
        commitSha: values_1.v.optional(values_1.v.string()),
        branch: values_1.v.optional(values_1.v.string()),
        scopeType: values_1.v.union(values_1.v.literal("FULL_REPO"), values_1.v.literal("FILE_LIST"), values_1.v.literal("DIRECTORY"), values_1.v.literal("BRANCH_DIFF")),
        scopeSpec: values_1.v.optional(values_1.v.any()),
        // Ruleset
        rulesetId: values_1.v.optional(values_1.v.id("qcRulesets")),
        // Initiator
        initiatorType: values_1.v.union(values_1.v.literal("HUMAN"), values_1.v.literal("AGENT"), values_1.v.literal("SYSTEM"), values_1.v.literal("WORKFLOW")),
        initiatorId: values_1.v.optional(values_1.v.string()),
        // Results summary
        findingCounts: values_1.v.optional(values_1.v.object({
            red: values_1.v.number(),
            yellow: values_1.v.number(),
            green: values_1.v.number(),
            info: values_1.v.number(),
        })),
        gatePassed: values_1.v.optional(values_1.v.boolean()),
        evidenceHash: values_1.v.optional(values_1.v.string()),
        // Timing
        startedAt: values_1.v.optional(values_1.v.number()),
        completedAt: values_1.v.optional(values_1.v.number()),
        durationMs: values_1.v.optional(values_1.v.number()),
        // Idempotency
        idempotencyKey: values_1.v.optional(values_1.v.string()),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_tenant", ["tenantId"])
        .index("by_project", ["projectId"])
        .index("by_status", ["status"])
        .index("by_project_sequence", ["projectId", "runSequence"])
        .index("by_idempotency", ["idempotencyKey"]),
    // -------------------------------------------------------------------------
    // QC FINDINGS (Individual Check Results)
    // -------------------------------------------------------------------------
    qcFindings: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        qcRunId: values_1.v.id("qcRuns"),
        severity: values_1.v.union(values_1.v.literal("RED"), values_1.v.literal("YELLOW"), values_1.v.literal("GREEN"), values_1.v.literal("INFO")),
        category: values_1.v.union(values_1.v.literal("REQUIREMENT_GAP"), values_1.v.literal("DOCS_DRIFT"), values_1.v.literal("COVERAGE_GAP"), values_1.v.literal("SECURITY_GAP"), values_1.v.literal("CONFIG_MISSING"), values_1.v.literal("DELIVERY_GATE")),
        title: values_1.v.string(),
        description: values_1.v.string(),
        filePaths: values_1.v.optional(values_1.v.array(values_1.v.string())),
        lineRanges: values_1.v.optional(values_1.v.array(values_1.v.object({
            file: values_1.v.string(),
            start: values_1.v.number(),
            end: values_1.v.number(),
        }))),
        prdRefs: values_1.v.optional(values_1.v.array(values_1.v.string())),
        suggestedFix: values_1.v.optional(values_1.v.string()),
        confidence: values_1.v.optional(values_1.v.number()),
        linkedTaskId: values_1.v.optional(values_1.v.id("tasks")),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_run", ["qcRunId"])
        .index("by_severity", ["severity"])
        .index("by_category", ["category"])
        .index("by_project", ["projectId"]),
    // -------------------------------------------------------------------------
    // QC ARTIFACTS (Evidence Packs, Reports, Trace Logs)
    // -------------------------------------------------------------------------
    qcArtifacts: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        qcRunId: values_1.v.id("qcRuns"),
        type: values_1.v.union(values_1.v.literal("EVIDENCE_PACK_JSON"), values_1.v.literal("SUMMARY_MD"), values_1.v.literal("TRACE_MATRIX"), values_1.v.literal("COVERAGE_REPORT"), values_1.v.literal("CUSTOM")),
        name: values_1.v.string(),
        storageId: values_1.v.optional(values_1.v.id("_storage")),
        content: values_1.v.optional(values_1.v.string()),
        mimeType: values_1.v.string(),
        sizeBytes: values_1.v.optional(values_1.v.number()),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_run", ["qcRunId"])
        .index("by_type", ["type"]),
    // -------------------------------------------------------------------------
    // QC RULESETS (Configurable Check Definitions + Built-in Presets)
    // -------------------------------------------------------------------------
    qcRulesets: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        name: values_1.v.string(),
        description: values_1.v.optional(values_1.v.string()),
        preset: values_1.v.optional(values_1.v.union(values_1.v.literal("PRE_RELEASE"), values_1.v.literal("POST_MERGE"), values_1.v.literal("WEEKLY_HEALTH"), values_1.v.literal("SECURITY_FOCUS"), values_1.v.literal("CUSTOM"))),
        requiredDocs: values_1.v.array(values_1.v.string()),
        coverageThresholds: values_1.v.object({
            unit: values_1.v.number(),
            integration: values_1.v.number(),
            e2e: values_1.v.number(),
        }),
        securityPaths: values_1.v.array(values_1.v.string()),
        gateDefinitions: values_1.v.array(values_1.v.object({
            name: values_1.v.string(),
            condition: values_1.v.string(),
            severity: values_1.v.string(),
        })),
        severityOverrides: values_1.v.optional(values_1.v.any()),
        active: values_1.v.boolean(),
        isBuiltIn: values_1.v.boolean(),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_tenant", ["tenantId"])
        .index("by_project", ["projectId"])
        .index("by_preset", ["preset"])
        .index("by_active", ["active"]),
    // -------------------------------------------------------------------------
    // TEST RECORDINGS (Browser interaction capture sessions)
    // -------------------------------------------------------------------------
    testRecordings: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        sessionId: values_1.v.string(),
        userId: values_1.v.string(),
        url: values_1.v.optional(values_1.v.string()),
        status: values_1.v.union(values_1.v.literal("RECORDING"), values_1.v.literal("COMPLETED"), values_1.v.literal("FAILED"), values_1.v.literal("CANCELED")),
        events: values_1.v.array(values_1.v.any()),
        playwrightCode: values_1.v.optional(values_1.v.array(values_1.v.string())),
        gherkinScenario: values_1.v.optional(values_1.v.string()),
        screenshotUrls: values_1.v.optional(values_1.v.array(values_1.v.string())),
        startedAt: values_1.v.number(),
        completedAt: values_1.v.optional(values_1.v.number()),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_session", ["sessionId"])
        .index("by_project", ["projectId"])
        .index("by_status", ["status"])
        .index("by_user", ["userId"]),
    // -------------------------------------------------------------------------
    // TEST SUITES (API/UI/Hybrid suite definitions)
    // -------------------------------------------------------------------------
    testSuites: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        suiteId: values_1.v.string(),
        name: values_1.v.string(),
        description: values_1.v.optional(values_1.v.string()),
        testType: values_1.v.union(values_1.v.literal("api_functional"), values_1.v.literal("api_integration"), values_1.v.literal("ui_functional"), values_1.v.literal("ui_e2e"), values_1.v.literal("hybrid_workflow"), values_1.v.literal("performance"), values_1.v.literal("security")),
        apiTests: values_1.v.optional(values_1.v.array(values_1.v.any())),
        uiTests: values_1.v.optional(values_1.v.array(values_1.v.string())),
        gherkinFeature: values_1.v.optional(values_1.v.string()),
        executionMode: values_1.v.union(values_1.v.literal("api_only"), values_1.v.literal("ui_only"), values_1.v.literal("hybrid"), values_1.v.literal("auto_detect")),
        retryEnabled: values_1.v.boolean(),
        timeoutSeconds: values_1.v.number(),
        tags: values_1.v.optional(values_1.v.array(values_1.v.string())),
        createdBy: values_1.v.optional(values_1.v.string()),
        status: values_1.v.union(values_1.v.literal("DRAFT"), values_1.v.literal("READY"), values_1.v.literal("RUNNING"), values_1.v.literal("PASSED"), values_1.v.literal("FAILED")),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_suite", ["suiteId"])
        .index("by_project", ["projectId"])
        .index("by_type", ["testType"])
        .index("by_status", ["status"]),
    // -------------------------------------------------------------------------
    // API COLLECTIONS (Postman/Bruno/SoapUI/OpenAPI imports)
    // -------------------------------------------------------------------------
    apiCollections: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        collectionId: values_1.v.string(),
        name: values_1.v.string(),
        collectionType: values_1.v.union(values_1.v.literal("postman"), values_1.v.literal("bruno"), values_1.v.literal("soapui"), values_1.v.literal("openapi")),
        steps: values_1.v.array(values_1.v.any()),
        importedBy: values_1.v.string(),
        importedAt: values_1.v.number(),
        totalSteps: values_1.v.number(),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_collection", ["collectionId"])
        .index("by_project", ["projectId"])
        .index("by_type", ["collectionType"]),
    // -------------------------------------------------------------------------
    // EXECUTION RESULTS (API/UI/Hybrid execution outcomes)
    // -------------------------------------------------------------------------
    executionResults: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        resultId: values_1.v.string(),
        executionType: values_1.v.union(values_1.v.literal("api"), values_1.v.literal("ui"), values_1.v.literal("hybrid")),
        suiteId: values_1.v.optional(values_1.v.id("testSuites")),
        workflowId: values_1.v.optional(values_1.v.id("hybridWorkflows")),
        jobId: values_1.v.optional(values_1.v.id("scheduledJobs")),
        steps: values_1.v.array(values_1.v.any()),
        totalTime: values_1.v.number(),
        passed: values_1.v.number(),
        failed: values_1.v.number(),
        success: values_1.v.boolean(),
        context: values_1.v.optional(values_1.v.any()),
        executedAt: values_1.v.number(),
        executedBy: values_1.v.optional(values_1.v.string()),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_result", ["resultId"])
        .index("by_project", ["projectId"])
        .index("by_type", ["executionType"])
        .index("by_executed_at", ["executedAt"]),
    // -------------------------------------------------------------------------
    // FLAKY STEPS (Retry and reliability tracking)
    // -------------------------------------------------------------------------
    flakySteps: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        stepName: values_1.v.string(),
        failureRatio: values_1.v.number(),
        totalRuns: values_1.v.number(),
        failedRuns: values_1.v.number(),
        lastSeen: values_1.v.number(),
        firstDetected: values_1.v.number(),
        githubIssueNumber: values_1.v.optional(values_1.v.number()),
        isActive: values_1.v.boolean(),
        retryCount: values_1.v.number(),
        avgResponseTimeMs: values_1.v.optional(values_1.v.number()),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_step", ["stepName"])
        .index("by_project", ["projectId"])
        .index("by_active", ["isActive"]),
    // -------------------------------------------------------------------------
    // HYBRID WORKFLOWS (API + UI combined workflows)
    // -------------------------------------------------------------------------
    hybridWorkflows: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        workflowId: values_1.v.string(),
        name: values_1.v.string(),
        description: values_1.v.optional(values_1.v.string()),
        apiSetupSteps: values_1.v.array(values_1.v.any()),
        uiValidationSteps: values_1.v.array(values_1.v.string()),
        executionMode: values_1.v.union(values_1.v.literal("api_only"), values_1.v.literal("ui_only"), values_1.v.literal("hybrid"), values_1.v.literal("auto_detect")),
        stopOnFailure: values_1.v.boolean(),
        timeoutSeconds: values_1.v.number(),
        retryEnabled: values_1.v.boolean(),
        createdBy: values_1.v.optional(values_1.v.string()),
        active: values_1.v.boolean(),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_workflow", ["workflowId"])
        .index("by_project", ["projectId"])
        .index("by_active", ["active"]),
    // -------------------------------------------------------------------------
    // CODEGEN REQUESTS (Prompt-driven code generation and PR metadata)
    // -------------------------------------------------------------------------
    codegenRequests: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        requestId: values_1.v.string(),
        filePath: values_1.v.string(),
        prompt: values_1.v.string(),
        status: values_1.v.union(values_1.v.literal("PENDING"), values_1.v.literal("GENERATING"), values_1.v.literal("COMPLETED"), values_1.v.literal("FAILED")),
        diff: values_1.v.optional(values_1.v.string()),
        branchName: values_1.v.optional(values_1.v.string()),
        commitHash: values_1.v.optional(values_1.v.string()),
        prUrl: values_1.v.optional(values_1.v.string()),
        requestedBy: values_1.v.string(),
        createdAt: values_1.v.number(),
        completedAt: values_1.v.optional(values_1.v.number()),
        error: values_1.v.optional(values_1.v.string()),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_request", ["requestId"])
        .index("by_project", ["projectId"])
        .index("by_status", ["status"]),
    // -------------------------------------------------------------------------
    // SCHEDULED JOBS (Cron-like recurring operations)
    // -------------------------------------------------------------------------
    scheduledJobs: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        jobId: values_1.v.string(),
        name: values_1.v.string(),
        jobType: values_1.v.union(values_1.v.literal("test_suite"), values_1.v.literal("qc_run"), values_1.v.literal("workflow"), values_1.v.literal("hybrid"), values_1.v.literal("mission_prompt")),
        cronExpression: values_1.v.string(),
        nextRun: values_1.v.number(),
        lastRun: values_1.v.optional(values_1.v.number()),
        targetId: values_1.v.string(),
        autoRerunFlaky: values_1.v.boolean(),
        enabled: values_1.v.boolean(),
        createdBy: values_1.v.string(),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_job", ["jobId"])
        .index("by_project", ["projectId"])
        .index("by_enabled", ["enabled"])
        .index("by_next_run", ["nextRun"]),
    // -------------------------------------------------------------------------
    // METRICS (Time-series operational metrics)
    // -------------------------------------------------------------------------
    metrics: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        metricName: values_1.v.string(),
        metricType: values_1.v.union(values_1.v.literal("counter"), values_1.v.literal("gauge"), values_1.v.literal("histogram")),
        value: values_1.v.number(),
        timestamp: values_1.v.number(),
        labels: values_1.v.optional(values_1.v.any()),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_name", ["metricName"])
        .index("by_project", ["projectId"])
        .index("by_timestamp", ["timestamp"]),
    // -------------------------------------------------------------------------
    // WORKFLOW METRICS (Aggregated Workflow Performance Stats)
    // -------------------------------------------------------------------------
    workflowMetrics: (0, server_1.defineTable)({
        // ARM: Tenant scope (optional, backfill later)
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        // Identity
        workflowId: values_1.v.string(),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        // Time period
        periodStart: values_1.v.number(),
        periodEnd: values_1.v.number(),
        // Execution stats
        totalRuns: values_1.v.number(),
        successfulRuns: values_1.v.number(),
        failedRuns: values_1.v.number(),
        pausedRuns: values_1.v.number(),
        // Success rate
        successRate: values_1.v.number(), // 0-1
        // Timing stats
        avgDurationMs: values_1.v.number(),
        minDurationMs: values_1.v.number(),
        maxDurationMs: values_1.v.number(),
        // Step stats
        avgStepsCompleted: values_1.v.number(),
        totalRetries: values_1.v.number(),
        totalEscalations: values_1.v.number(),
        // Bottlenecks (step IDs with highest failure/retry rates)
        bottlenecks: values_1.v.array(values_1.v.object({
            stepId: values_1.v.string(),
            failureRate: values_1.v.number(),
            avgRetries: values_1.v.number(),
        })),
        // Metadata
        lastUpdated: values_1.v.number(),
    })
        .index("by_workflow", ["workflowId"])
        .index("by_project", ["projectId"])
        .index("by_period", ["periodStart", "periodEnd"]),
    // -------------------------------------------------------------------------
    // CONTENT DROPS (Agent-Submitted Deliverables)
    // -------------------------------------------------------------------------
    contentDrops: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        agentId: values_1.v.optional(values_1.v.id("agents")),
        taskId: values_1.v.optional(values_1.v.id("tasks")),
        title: values_1.v.string(),
        contentType: values_1.v.union(values_1.v.literal("BLOG_POST"), values_1.v.literal("SOCIAL_POST"), values_1.v.literal("EMAIL_DRAFT"), values_1.v.literal("SCRIPT"), values_1.v.literal("REPORT"), values_1.v.literal("CODE_SNIPPET"), values_1.v.literal("DESIGN"), values_1.v.literal("OTHER")),
        content: values_1.v.string(),
        summary: values_1.v.optional(values_1.v.string()),
        fileUrl: values_1.v.optional(values_1.v.string()),
        status: values_1.v.union(values_1.v.literal("DRAFT"), values_1.v.literal("SUBMITTED"), values_1.v.literal("APPROVED"), values_1.v.literal("REJECTED"), values_1.v.literal("PUBLISHED")),
        reviewedBy: values_1.v.optional(values_1.v.string()),
        reviewedAt: values_1.v.optional(values_1.v.number()),
        reviewNote: values_1.v.optional(values_1.v.string()),
        tags: values_1.v.optional(values_1.v.array(values_1.v.string())),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_project", ["projectId"])
        .index("by_agent", ["agentId"])
        .index("by_status", ["status"])
        .index("by_task", ["taskId"])
        .index("by_content_type", ["contentType"]),
    // -------------------------------------------------------------------------
    // REVENUE EVENTS (Stripe / External Revenue Tracking)
    // -------------------------------------------------------------------------
    revenueEvents: (0, server_1.defineTable)({
        tenantId: values_1.v.optional(values_1.v.id("tenants")),
        projectId: values_1.v.optional(values_1.v.id("projects")),
        source: values_1.v.union(values_1.v.literal("STRIPE"), values_1.v.literal("MANUAL"), values_1.v.literal("OTHER")),
        eventType: values_1.v.union(values_1.v.literal("CHARGE"), values_1.v.literal("SUBSCRIPTION"), values_1.v.literal("REFUND"), values_1.v.literal("PAYOUT"), values_1.v.literal("OTHER")),
        amount: values_1.v.number(),
        currency: values_1.v.string(),
        description: values_1.v.optional(values_1.v.string()),
        customerId: values_1.v.optional(values_1.v.string()),
        customerEmail: values_1.v.optional(values_1.v.string()),
        externalId: values_1.v.optional(values_1.v.string()),
        externalRef: values_1.v.optional(values_1.v.string()),
        timestamp: values_1.v.number(),
        metadata: values_1.v.optional(values_1.v.any()),
    })
        .index("by_project", ["projectId"])
        .index("by_source", ["source"])
        .index("by_event_type", ["eventType"])
        .index("by_timestamp", ["timestamp"])
        .index("by_external_id", ["externalId"]),
});
