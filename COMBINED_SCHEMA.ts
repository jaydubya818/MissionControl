/**
 * Combined ARM + Mission Control Schema — v0.2
 *
 * 55 tables across 11 domains.
 * ARM = system of record (registry, governance, audit, identity, deployments)
 * MC  = control plane (execution, coordination, communication, runtime, ops telemetry)
 *
 * Reference: UNIFIED_SCHEMA_MAPPING.md v0.2
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ============================================================================
// SHARED ENUMS
// ============================================================================

// --- ARM enums ---

const lifecycleState = v.union(
  v.literal("DRAFT"),
  v.literal("TESTING"),
  v.literal("CANDIDATE"),
  v.literal("APPROVED"),
  v.literal("DEPRECATED"),
  v.literal("RETIRED")
);

const instanceState = v.union(
  v.literal("PROVISIONING"),
  v.literal("ACTIVE"),
  v.literal("PAUSED"),
  v.literal("READONLY"),
  v.literal("DRAINING"),
  v.literal("QUARANTINED"),
  v.literal("RETIRED")
);

const autonomyTier = v.union(
  v.literal(0), // Observe Only
  v.literal(1), // Guided
  v.literal(2), // Supervised
  v.literal(3), // Trusted
  v.literal(4), // Autonomous
  v.literal(5)  // Full Autonomy
);

const changeRecordType = v.union(
  // Registry events
  v.literal("TENANT_BOOTSTRAPPED"),
  v.literal("PROJECT_CREATED"),
  v.literal("ENVIRONMENT_CREATED"),
  v.literal("OPERATOR_CREATED"),
  v.literal("PROVIDER_CREATED"),
  v.literal("TEMPLATE_CREATED"),
  v.literal("TEMPLATE_UPDATED"),
  v.literal("VERSION_CREATED"),
  v.literal("VERSION_TRANSITIONED"),
  v.literal("VERSION_INTEGRITY_VERIFIED"),
  v.literal("VERSION_INTEGRITY_FAILED"),
  v.literal("INSTANCE_CREATED"),
  v.literal("INSTANCE_TRANSITIONED"),
  v.literal("IDENTITY_UPDATED"),
  // Deployment events
  v.literal("DEPLOYMENT_CREATED"),
  v.literal("DEPLOYMENT_ACTIVATED"),
  v.literal("DEPLOYMENT_ROLLED_BACK"),
  // Governance events
  v.literal("POLICY_ATTACHED"),
  v.literal("POLICY_EVALUATED"),
  v.literal("APPROVAL_REQUESTED"),
  v.literal("APPROVAL_DECIDED"),
  // Task lifecycle events (governance-level only)
  v.literal("TASK_CREATED"),
  v.literal("TASK_TRANSITIONED"),
  v.literal("TASK_ASSIGNED"),
  v.literal("WORKFLOW_STARTED"),
  v.literal("WORKFLOW_COMPLETED"),
  // Emergency events
  v.literal("BUDGET_EXCEEDED"),
  v.literal("LOOP_DETECTED"),
  v.literal("EMERGENCY_PAUSE"),
  v.literal("EMERGENCY_QUARANTINE")
);

const opEventType = v.union(
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
  v.literal("DECISION_MADE")
);

const deploymentStatus = v.union(
  v.literal("PENDING"),
  v.literal("ACTIVE"),
  v.literal("ROLLING_BACK"),
  v.literal("RETIRED")
);

const approvalDecision = v.union(
  v.literal("PENDING"),
  v.literal("APPROVED"),
  v.literal("DENIED"),
  v.literal("EXPIRED"),
  v.literal("ESCALATED"),
  v.literal("CANCELED")
);

const auditSeverity = v.union(
  v.literal("INFO"),
  v.literal("WARNING"),
  v.literal("ERROR")
);

// --- MC enums ---

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
// SCHEMA — 55 tables, 11 domains
// ============================================================================

export default defineSchema({
  // ==========================================================================
  // DOMAIN 1: MULTI-TENANCY & IDENTITY (ARM wins)
  // ==========================================================================

  /** Top-level isolation boundary. ARM-owned. */
  tenants: defineTable({
    name: v.string(),
    slug: v.string(),
    plan: v.optional(v.union(
      v.literal("FREE"),
      v.literal("TEAM"),
      v.literal("ENTERPRISE")
    )),
    settings: v.optional(v.any()),
    billingEmail: v.optional(v.string()),
    maxEnvironments: v.optional(v.number()),
    maxOperators: v.optional(v.number()),
    gdprDataRegion: v.optional(v.string()),
    metadata: v.optional(v.any()),
  })
    .index("by_slug", ["slug"]),

  /** dev/staging/prod per tenant. ARM-owned. */
  environments: defineTable({
    tenantId: v.id("tenants"),
    name: v.string(),
    slug: v.string(),
    isProduction: v.boolean(),
    config: v.optional(v.any()),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_tenant_slug", ["tenantId", "slug"]),

  /** Auth identity + GDPR fields. ARM-owned RBAC anchor. */
  operators: defineTable({
    tenantId: v.id("tenants"),
    authId: v.string(),
    name: v.string(),
    email: v.string(),
    avatarUrl: v.optional(v.string()),
    status: v.union(
      v.literal("ACTIVE"),
      v.literal("SUSPENDED"),
      v.literal("DEACTIVATED")
    ),
    lastLoginAt: v.optional(v.number()),
    gdprConsentAt: v.optional(v.number()),
    gdprDataExportAt: v.optional(v.number()),
    gdprDeletionRequestAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_auth", ["authId"])
    .index("by_email", ["tenantId", "email"]),

  /** MC projects, refactored as children of tenants. */
  projects: defineTable({
    tenantId: v.id("tenants"),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    githubRepo: v.optional(v.string()),
    githubBranch: v.optional(v.string()),
    githubWebhookSecret: v.optional(v.string()),
    swarmConfig: v.optional(v.object({
      maxAgents: v.number(),
      defaultModel: v.optional(v.string()),
      autoScale: v.boolean(),
    })),
    policyDefaults: v.optional(v.object({
      budgetDefaults: v.optional(v.any()),
      riskThresholds: v.optional(v.any()),
    })),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_slug", ["tenantId", "slug"])
    .index("by_github_repo", ["githubRepo"]),

  /** Team directory — human contacts, titles, org chart. RBAC moved to ARM roles. */
  orgMembers: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.optional(v.id("projects")),
    name: v.string(),
    email: v.optional(v.string()),
    role: v.string(),
    title: v.optional(v.string()),
    avatar: v.optional(v.string()),
    parentMemberId: v.optional(v.id("orgMembers")),
    level: v.number(),
    responsibilities: v.optional(v.array(v.string())),
    active: v.boolean(),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_project", ["projectId"])
    .index("by_parent", ["parentMemberId"])
    .index("by_email", ["tenantId", "email"]),

  /** Federation-ready provider registry. ARM-owned. */
  providers: defineTable({
    tenantId: v.id("tenants"),
    name: v.string(),
    type: v.union(
      v.literal("ANTHROPIC"),
      v.literal("OPENAI"),
      v.literal("GOOGLE"),
      v.literal("LOCAL"),
      v.literal("CUSTOM")
    ),
    config: v.optional(v.any()),
    status: v.union(
      v.literal("ACTIVE"),
      v.literal("DEGRADED"),
      v.literal("OFFLINE")
    ),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_type", ["tenantId", "type"]),

  // ==========================================================================
  // DOMAIN 2: AGENT REGISTRY & IDENTITY (ARM wins)
  // ==========================================================================

  /** Agent blueprint / family. ARM-owned. */
  agentTemplates: defineTable({
    tenantId: v.id("tenants"),
    name: v.string(),
    description: v.optional(v.string()),
    intendedUse: v.optional(v.string()),
    ownerIds: v.array(v.id("operators")),
    tags: v.optional(v.array(v.string())),
    emoji: v.optional(v.string()),
    defaultRole: v.optional(v.string()),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_name", ["tenantId", "name"]),

  /** Immutable genome + SHA-256 hash. ARM-owned. */
  agentVersions: defineTable({
    templateId: v.id("agentTemplates"),
    tenantId: v.id("tenants"),
    genome: v.object({
      modelConfig: v.object({
        primaryModel: v.string(),
        fallbackModel: v.optional(v.string()),
        temperature: v.optional(v.number()),
        maxTokens: v.optional(v.number()),
        inferenceParams: v.optional(v.any()),
      }),
      promptBundleHash: v.string(),
      toolManifest: v.array(v.object({
        toolId: v.string(),
        schemaVersion: v.string(),
        requiredPermissions: v.array(v.string()),
      })),
      provenance: v.object({
        buildPipeline: v.optional(v.string()),
        parentVersionId: v.optional(v.string()),
        commitRef: v.optional(v.string()),
        signingKeyRef: v.optional(v.string()),
        builtAt: v.string(),
        builtBy: v.string(),
      }),
      memoryConfig: v.optional(v.object({
        types: v.array(v.string()),
        retention: v.string(),
        redactionRules: v.optional(v.array(v.string())),
      })),
      behaviorProfile: v.optional(v.object({
        riskTolerance: v.string(),
        escalationPosture: v.string(),
        communicationConstraints: v.optional(v.array(v.string())),
      })),
      spawnConstraints: v.optional(v.object({
        maxChildren: v.number(),
        spawnRate: v.number(),
        allowedSubordinateRoles: v.optional(v.array(v.string())),
      })),
    }),
    genomeHash: v.string(),
    lifecycleState: lifecycleState,
    parentVersionId: v.optional(v.id("agentVersions")),
    signatures: v.optional(v.array(v.any())),
    certifications: v.optional(v.array(v.any())),
    approvals: v.optional(v.array(v.id("approvalRecords"))),
    buildProvenance: v.optional(v.any()),
    createdBy: v.optional(v.id("operators")),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_template", ["templateId"])
    .index("by_state", ["tenantId", "lifecycleState"])
    .index("by_hash", ["genomeHash"]),

  /** Runtime binding. Replaces MC agents table. ARM-owned. */
  agentInstances: defineTable({
    versionId: v.id("agentVersions"),
    tenantId: v.id("tenants"),
    environmentId: v.id("environments"),
    projectId: v.id("projects"),
    providerId: v.optional(v.id("providers")),
    deploymentId: v.optional(v.id("deployments")),
    policyEnvelopeId: v.optional(v.id("policyEnvelopes")),
    state: instanceState,
    heartbeatAt: v.optional(v.number()),
    costCaps: v.optional(v.object({
      dailyUsd: v.optional(v.number()),
      perRunUsd: v.optional(v.number()),
      monthlyUsd: v.optional(v.number()),
    })),
    runtimeMeta: v.optional(v.any()),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_version", ["versionId"])
    .index("by_environment", ["tenantId", "environmentId"])
    .index("by_project", ["projectId"])
    .index("by_state", ["tenantId", "state"])
    .index("by_deployment", ["deploymentId"]),

  /** OpenClaw IDENTITY/SOUL/TOOLS governance. ARM-owned (v0.2 move). */
  agentIdentities: defineTable({
    tenantId: v.id("tenants"),
    templateId: v.id("agentTemplates"),
    name: v.string(),
    creature: v.optional(v.string()),
    vibe: v.optional(v.string()),
    emoji: v.optional(v.string()),
    avatarPath: v.optional(v.string()),
    soulContent: v.optional(v.string()),
    soulHash: v.optional(v.string()),
    toolsNotes: v.optional(v.string()),
    complianceStatus: v.optional(v.union(
      v.literal("VALID"),
      v.literal("INVALID"),
      v.literal("MISSING"),
      v.literal("PARTIAL")
    )),
    validationErrors: v.optional(v.array(v.string())),
    lastScanAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_template", ["templateId"])
    .index("by_compliance", ["tenantId", "complianceStatus"]),

  // ==========================================================================
  // DOMAIN 3: GOVERNANCE, POLICY & DEPLOYMENTS (ARM wins)
  // ==========================================================================

  /** Autonomy tiers 0-5, tool whitelist, cost limits. Inheritance: version > project > tenant. */
  policyEnvelopes: defineTable({
    tenantId: v.id("tenants"),
    name: v.string(),
    attachedToTenant: v.optional(v.boolean()),
    attachedToProjectId: v.optional(v.id("projects")),
    attachedToTemplateId: v.optional(v.id("agentTemplates")),
    attachedToVersionId: v.optional(v.id("agentVersions")),
    autonomyTier: autonomyTier,
    allowedTools: v.optional(v.array(v.string())),
    deniedTools: v.optional(v.array(v.string())),
    dataScopes: v.optional(v.array(v.string())),
    budgets: v.optional(v.object({
      dailyUsd: v.optional(v.number()),
      perRunUsd: v.optional(v.number()),
      monthlyUsd: v.optional(v.number()),
    })),
    caps: v.optional(v.any()),
    approvalTriggers: v.optional(v.array(v.string())),
    enforcementPoints: v.optional(v.array(v.string())),
    toolRiskMap: v.optional(v.any()),
    shellAllowlist: v.optional(v.array(v.string())),
    shellBlocklist: v.optional(v.array(v.string())),
    fileReadPaths: v.optional(v.array(v.string())),
    fileWritePaths: v.optional(v.array(v.string())),
    networkAllowlist: v.optional(v.array(v.string())),
    loopThresholds: v.optional(v.any()),
    spawnLimits: v.optional(v.any()),
    version: v.number(),
    active: v.boolean(),
    createdBy: v.optional(v.id("operators")),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_active", ["tenantId", "active"])
    .index("by_project", ["attachedToProjectId"])
    .index("by_template", ["attachedToTemplateId"])
    .index("by_version", ["attachedToVersionId"]),

  /** ARM approval model + MC enrichments. */
  approvalRecords: defineTable({
    tenantId: v.id("tenants"),
    requestType: v.string(),
    requestScope: v.optional(v.string()),
    requesterId: v.optional(v.id("operators")),
    requesterInstanceId: v.optional(v.id("agentInstances")),
    targetEntity: v.optional(v.string()),
    targetId: v.optional(v.string()),
    actionSummary: v.string(),
    justification: v.string(),
    rollbackPlan: v.optional(v.string()),
    riskLevel: v.optional(riskLevel),
    estimatedCost: v.optional(v.number()),
    status: approvalDecision,
    decidedBy: v.optional(v.id("operators")),
    decidedAt: v.optional(v.number()),
    decisionReason: v.optional(v.string()),
    escalationLevel: v.optional(v.number()),
    escalatedAt: v.optional(v.number()),
    escalatedBy: v.optional(v.string()),
    requiredDecisionCount: v.optional(v.number()),
    decisionCount: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    policyEnvelopeId: v.optional(v.id("policyEnvelopes")),
    evidenceLinks: v.optional(v.array(v.string())),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_status", ["tenantId", "status"])
    .index("by_target", ["targetEntity", "targetId"])
    .index("by_requester", ["requesterId"]),

  /** Promotion/rollback bridge. NEW in v0.2. */
  deployments: defineTable({
    tenantId: v.id("tenants"),
    templateId: v.id("agentTemplates"),
    environmentId: v.id("environments"),
    targetVersionId: v.id("agentVersions"),
    previousVersionId: v.optional(v.id("agentVersions")),
    rolloutPolicy: v.optional(v.object({
      strategy: v.optional(v.union(
        v.literal("ALL_AT_ONCE"),
        v.literal("CANARY"),
        v.literal("ROLLING")
      )),
      canaryPercent: v.optional(v.number()),
      batchSize: v.optional(v.number()),
    })),
    status: deploymentStatus,
    createdBy: v.id("operators"),
    approvedBy: v.optional(v.id("operators")),
    activatedAt: v.optional(v.number()),
    retiredAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_template_env", ["templateId", "environmentId"])
    .index("by_status", ["tenantId", "status"])
    .index("by_target_version", ["targetVersionId"]),

  /** RBAC role definitions. ARM-owned. */
  roles: defineTable({
    tenantId: v.id("tenants"),
    name: v.string(),
    description: v.optional(v.string()),
    permissions: v.array(v.string()),
    isSystem: v.optional(v.boolean()),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_name", ["tenantId", "name"]),

  /** Operator-to-role mappings. ARM-owned. */
  roleAssignments: defineTable({
    tenantId: v.id("tenants"),
    roleId: v.id("roles"),
    operatorId: v.id("operators"),
    projectId: v.optional(v.id("projects")),
    environmentId: v.optional(v.id("environments")),
    assignedAt: v.number(),
    assignedBy: v.optional(v.id("operators")),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_operator", ["operatorId"])
    .index("by_role", ["roleId"])
    .index("by_operator_project", ["operatorId", "projectId"]),

  /** Permission registry. ARM-owned. */
  permissions: defineTable({
    tenantId: v.id("tenants"),
    resource: v.string(),
    action: v.string(),
    description: v.optional(v.string()),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_resource", ["tenantId", "resource"]),

  // ==========================================================================
  // DOMAIN 4: AUDIT & OBSERVABILITY
  // ==========================================================================

  /** Governance audit spine. Low-volume, high-signal. ARM-owned. */
  changeRecords: defineTable({
    tenantId: v.id("tenants"),
    type: changeRecordType,
    actorType: actorType,
    actorId: v.optional(v.string()),
    targetEntity: v.string(),
    targetId: v.string(),
    beforeState: v.optional(v.any()),
    afterState: v.optional(v.any()),
    reason: v.optional(v.string()),
    evidenceLinks: v.optional(v.array(v.string())),
    timestamp: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_target", ["targetEntity", "targetId"])
    .index("by_type", ["tenantId", "type"])
    .index("by_timestamp", ["tenantId", "timestamp"]),

  /** High-volume ops telemetry. NEW in v0.2. 30-day default retention. */
  opEvents: defineTable({
    tenantId: v.id("tenants"),
    type: opEventType,
    instanceId: v.optional(v.id("agentInstances")),
    versionId: v.optional(v.id("agentVersions")),
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.id("tasks")),
    runId: v.optional(v.id("runs")),
    payload: v.optional(v.any()),
    changeRecordId: v.optional(v.id("changeRecords")),
    timestamp: v.number(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_instance", ["instanceId"])
    .index("by_project", ["projectId"])
    .index("by_task", ["taskId"])
    .index("by_type_time", ["tenantId", "type", "timestamp"])
    .index("by_timestamp", ["tenantId", "timestamp"]),

  /** Security-level audit (auth, RBAC, permission changes). ARM-owned. */
  auditLogs: defineTable({
    tenantId: v.id("tenants"),
    severity: auditSeverity,
    action: v.string(),
    actorType: actorType,
    actorId: v.optional(v.string()),
    resource: v.optional(v.string()),
    resourceId: v.optional(v.string()),
    description: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    timestamp: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_severity", ["tenantId", "severity"])
    .index("by_action", ["tenantId", "action"])
    .index("by_timestamp", ["tenantId", "timestamp"]),

  // ==========================================================================
  // DOMAIN 5: TASK EXECUTION (MC wins)
  // ==========================================================================

  /** Core work unit. MC-owned. assigneeIds now reference agentInstances. */
  tasks: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    idempotencyKey: v.optional(v.string()),
    title: v.string(),
    description: v.optional(v.string()),
    type: taskType,
    status: taskStatus,
    priority: taskPriority,
    threadRef: v.optional(v.object({
      chatId: v.string(),
      threadId: v.string(),
    })),
    creatorInstanceId: v.optional(v.id("agentInstances")),
    assigneeIds: v.array(v.id("agentInstances")),
    reviewerInstanceId: v.optional(v.id("agentInstances")),
    parentTaskId: v.optional(v.id("tasks")),
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
    reviewCycles: v.number(),
    estimatedCost: v.optional(v.number()),
    actualCost: v.number(),
    budgetAllocated: v.optional(v.number()),
    budgetRemaining: v.optional(v.number()),
    dueAt: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    submittedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    scheduledFor: v.optional(v.number()),
    recurrence: v.optional(v.object({
      frequency: v.union(
        v.literal("DAILY"),
        v.literal("WEEKLY"),
        v.literal("MONTHLY")
      ),
      interval: v.number(),
      daysOfWeek: v.optional(v.array(v.number())),
      endDate: v.optional(v.number()),
    })),
    labels: v.optional(v.array(v.string())),
    blockedReason: v.optional(v.string()),
    redactedFields: v.optional(v.array(v.string())),
    source: v.optional(v.union(
      v.literal("DASHBOARD"),
      v.literal("TELEGRAM"),
      v.literal("GITHUB"),
      v.literal("AGENT"),
      v.literal("API"),
      v.literal("TRELLO"),
      v.literal("SEED")
    )),
    sourceRef: v.optional(v.string()),
    createdBy: v.optional(v.union(
      v.literal("HUMAN"),
      v.literal("AGENT"),
      v.literal("SYSTEM")
    )),
    createdByRef: v.optional(v.string()),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_project", ["projectId"])
    .index("by_status", ["tenantId", "status"])
    .index("by_project_status", ["projectId", "status"])
    .index("by_priority", ["tenantId", "priority"])
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_source", ["source"]),

  /** Task thread messaging. MC-owned. */
  messages: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.optional(v.id("projects")),
    idempotencyKey: v.optional(v.string()),
    taskId: v.id("tasks"),
    authorType: actorType,
    authorInstanceId: v.optional(v.id("agentInstances")),
    authorUserId: v.optional(v.string()),
    type: messageType,
    content: v.string(),
    contentRedacted: v.optional(v.string()),
    artifacts: v.optional(v.array(v.object({
      name: v.string(),
      type: v.string(),
      url: v.optional(v.string()),
      content: v.optional(v.string()),
    }))),
    mentions: v.optional(v.array(v.string())),
    replyToId: v.optional(v.id("messages")),
    threadRef: v.optional(v.string()),
    redactedFields: v.optional(v.array(v.string())),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_task", ["taskId"])
    .index("by_project", ["projectId"])
    .index("by_author_instance", ["authorInstanceId"])
    .index("by_idempotency", ["idempotencyKey"]),

  /** Agent execution turns + version lineage. MC-owned. */
  runs: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.optional(v.id("projects")),
    idempotencyKey: v.string(),
    instanceId: v.id("agentInstances"),
    versionId: v.id("agentVersions"),
    taskId: v.optional(v.id("tasks")),
    sessionKey: v.string(),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    cacheReadTokens: v.optional(v.number()),
    cacheWriteTokens: v.optional(v.number()),
    costUsd: v.number(),
    budgetAllocated: v.optional(v.number()),
    status: v.union(
      v.literal("RUNNING"),
      v.literal("COMPLETED"),
      v.literal("FAILED"),
      v.literal("TIMEOUT")
    ),
    error: v.optional(v.string()),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_instance", ["instanceId"])
    .index("by_version", ["versionId"])
    .index("by_task", ["taskId"])
    .index("by_session", ["sessionKey"])
    .index("by_project", ["projectId"])
    .index("by_idempotency", ["idempotencyKey"]),

  /** Tool invocations with risk classification. MC-owned. */
  toolCalls: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.optional(v.id("projects")),
    runId: v.id("runs"),
    instanceId: v.id("agentInstances"),
    taskId: v.optional(v.id("tasks")),
    toolName: v.string(),
    toolVersion: v.optional(v.string()),
    riskLevel: riskLevel,
    policyResult: v.optional(v.object({
      decision: v.string(),
      reason: v.string(),
      approvalId: v.optional(v.string()),
    })),
    inputPreview: v.optional(v.string()),
    outputPreview: v.optional(v.string()),
    inputHash: v.optional(v.string()),
    outputHash: v.optional(v.string()),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
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
    .index("by_tenant", ["tenantId"])
    .index("by_run", ["runId"])
    .index("by_instance", ["instanceId"])
    .index("by_task", ["taskId"])
    .index("by_risk", ["tenantId", "riskLevel"])
    .index("by_project", ["projectId"]),

  /** Multi-executor routing. MC-owned. */
  executionRequests: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.id("tasks")),
    requestedBy: v.id("agentInstances"),
    assignedTo: v.optional(v.string()),
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
    status: v.union(
      v.literal("PENDING"),
      v.literal("ASSIGNED"),
      v.literal("IN_PROGRESS"),
      v.literal("COMPLETED"),
      v.literal("FAILED")
    ),
    payload: v.any(),
    result: v.optional(v.any()),
    requestedAt: v.number(),
    assignedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_project", ["projectId"])
    .index("by_task", ["taskId"])
    .index("by_status", ["tenantId", "status"])
    .index("by_executor", ["executor"]),

  /** DAG support. MC-owned. */
  taskDependencies: defineTable({
    tenantId: v.id("tenants"),
    parentTaskId: v.id("tasks"),
    taskId: v.id("tasks"),
    dependsOnTaskId: v.id("tasks"),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_parent", ["parentTaskId"])
    .index("by_task", ["taskId"])
    .index("by_depends_on", ["dependsOnTaskId"]),

  /** Peer review system. MC-owned. */
  reviews: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    taskId: v.id("tasks"),
    type: reviewType,
    status: reviewStatus,
    reviewerInstanceId: v.optional(v.id("agentInstances")),
    reviewerUserId: v.optional(v.string()),
    targetType: v.union(
      v.literal("TASK"),
      v.literal("DELIVERABLE"),
      v.literal("ARTIFACT"),
      v.literal("CODE_CHANGE")
    ),
    targetId: v.optional(v.string()),
    summary: v.string(),
    details: v.optional(v.string()),
    score: v.optional(v.number()),
    severity: v.optional(v.union(
      v.literal("MINOR"),
      v.literal("MAJOR"),
      v.literal("CRITICAL")
    )),
    changeset: v.optional(v.object({
      files: v.array(v.object({
        path: v.string(),
        action: v.union(
          v.literal("ADD"),
          v.literal("MODIFY"),
          v.literal("DELETE")
        ),
        diff: v.optional(v.string()),
      })),
      description: v.string(),
    })),
    responseBy: v.optional(v.id("agentInstances")),
    responseText: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_project", ["projectId"])
    .index("by_task", ["taskId"])
    .index("by_status", ["tenantId", "status"])
    .index("by_type", ["tenantId", "type"])
    .index("by_reviewer", ["reviewerInstanceId"]),

  // ==========================================================================
  // DOMAIN 6: AGENT INTELLIGENCE (MC wins)
  // ==========================================================================

  /** Learning metrics per instance+version. MC-owned. */
  agentPerformance: defineTable({
    tenantId: v.id("tenants"),
    instanceId: v.id("agentInstances"),
    versionId: v.id("agentVersions"),
    projectId: v.optional(v.id("projects")),
    taskType: v.string(),
    successCount: v.number(),
    failureCount: v.number(),
    avgCompletionTimeMs: v.number(),
    avgCostUsd: v.number(),
    totalTasksCompleted: v.number(),
    lastUpdatedAt: v.number(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_instance", ["instanceId"])
    .index("by_version", ["versionId"])
    .index("by_instance_type", ["instanceId", "taskType"])
    .index("by_project", ["projectId"]),

  /** Discovered patterns. MC-owned. */
  agentPatterns: defineTable({
    tenantId: v.id("tenants"),
    instanceId: v.id("agentInstances"),
    projectId: v.optional(v.id("projects")),
    pattern: v.string(),
    confidence: v.number(),
    evidence: v.array(v.string()),
    discoveredAt: v.number(),
    lastSeenAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_instance", ["instanceId"])
    .index("by_instance_pattern", ["instanceId", "pattern"])
    .index("by_project", ["projectId"]),

  /** Session memory, working notes. MC-owned. */
  agentDocuments: defineTable({
    tenantId: v.id("tenants"),
    instanceId: v.id("agentInstances"),
    projectId: v.optional(v.id("projects")),
    type: v.union(
      v.literal("WORKING_MD"),
      v.literal("DAILY_NOTE"),
      v.literal("SESSION_MEMORY")
    ),
    content: v.string(),
    updatedAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_instance", ["instanceId"])
    .index("by_instance_type", ["instanceId", "type"])
    .index("by_project", ["projectId"]),

  // ==========================================================================
  // DOMAIN 7: COMMUNICATION (MC wins)
  // ==========================================================================

  /** Async agent messaging threads. MC-owned. */
  telegraphThreads: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.optional(v.id("projects")),
    title: v.string(),
    participants: v.array(v.string()),
    channel: v.union(v.literal("INTERNAL"), v.literal("TELEGRAM")),
    externalThreadRef: v.optional(v.string()),
    linkedTaskId: v.optional(v.id("tasks")),
    linkedApprovalId: v.optional(v.id("approvalRecords")),
    linkedIncidentId: v.optional(v.string()),
    lastMessageAt: v.optional(v.number()),
    messageCount: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_project", ["projectId"])
    .index("by_linked_task", ["linkedTaskId"])
    .index("by_last_message", ["lastMessageAt"])
    .index("by_channel", ["tenantId", "channel"]),

  /** Thread messages. MC-owned. */
  telegraphMessages: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.optional(v.id("projects")),
    threadId: v.id("telegraphThreads"),
    senderId: v.string(),
    senderType: actorType,
    content: v.string(),
    replyToId: v.optional(v.id("telegraphMessages")),
    channel: v.union(v.literal("INTERNAL"), v.literal("TELEGRAM")),
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
    .index("by_tenant", ["tenantId"])
    .index("by_thread", ["threadId"])
    .index("by_project", ["projectId"])
    .index("by_sender", ["senderId"])
    .index("by_status", ["tenantId", "status"]),

  /** Meeting orchestration. MC-owned. */
  meetings: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.optional(v.id("projects")),
    title: v.string(),
    agenda: v.optional(v.string()),
    scheduledAt: v.number(),
    duration: v.number(),
    status: v.union(
      v.literal("SCHEDULED"),
      v.literal("IN_PROGRESS"),
      v.literal("COMPLETED"),
      v.literal("CANCELLED")
    ),
    hostAgentId: v.optional(v.string()),
    participants: v.array(v.object({
      agentId: v.string(),
      orgPosition: v.optional(v.string()),
      role: v.optional(v.string()),
    })),
    provider: v.union(v.literal("MANUAL"), v.literal("ZOOM")),
    externalMeetingRef: v.optional(v.string()),
    notesDocPath: v.optional(v.string()),
    notes: v.optional(v.string()),
    actionItems: v.optional(v.array(v.object({
      description: v.string(),
      assigneeAgentId: v.optional(v.string()),
      taskId: v.optional(v.id("tasks")),
      dueAt: v.optional(v.number()),
      completed: v.boolean(),
    }))),
    calendarPayload: v.optional(v.string()),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_project", ["projectId"])
    .index("by_status", ["tenantId", "status"])
    .index("by_scheduled", ["scheduledAt"]),

  /** TTS audio + transcripts. MC-owned. */
  voiceArtifacts: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.optional(v.id("projects")),
    agentId: v.optional(v.string()),
    text: v.string(),
    transcript: v.optional(v.string()),
    audioUrl: v.optional(v.string()),
    audioStorageId: v.optional(v.string()),
    provider: v.union(v.literal("ELEVENLABS"), v.literal("OTHER")),
    voiceId: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    linkedMessageId: v.optional(v.id("telegraphMessages")),
    linkedMeetingId: v.optional(v.id("meetings")),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_project", ["projectId"])
    .index("by_agent", ["agentId"])
    .index("by_linked_message", ["linkedMessageId"]),

  // ==========================================================================
  // DOMAIN 8: WORKFLOW ORCHESTRATION (MC wins)
  // ==========================================================================

  /** Workflow definitions (YAML-driven). MC-owned. */
  workflows: defineTable({
    tenantId: v.id("tenants"),
    workflowId: v.string(),
    name: v.string(),
    description: v.string(),
    agents: v.array(v.object({
      id: v.string(),
      persona: v.string(),
      workspace: v.optional(v.object({
        files: v.optional(v.any()),
      })),
    })),
    steps: v.array(v.object({
      id: v.string(),
      agent: v.string(),
      input: v.string(),
      expects: v.string(),
      retryLimit: v.number(),
      timeoutMinutes: v.number(),
    })),
    active: v.boolean(),
    version: v.number(),
    createdBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_workflow_id", ["workflowId"])
    .index("by_active", ["tenantId", "active"]),

  /** Workflow execution state. MC-owned. */
  workflowRuns: defineTable({
    tenantId: v.id("tenants"),
    runId: v.string(),
    workflowId: v.string(),
    projectId: v.optional(v.id("projects")),
    parentTaskId: v.optional(v.id("tasks")),
    status: v.union(
      v.literal("PENDING"),
      v.literal("RUNNING"),
      v.literal("COMPLETED"),
      v.literal("FAILED"),
      v.literal("PAUSED")
    ),
    currentStepIndex: v.number(),
    totalSteps: v.number(),
    steps: v.array(v.object({
      stepId: v.string(),
      status: v.union(
        v.literal("PENDING"),
        v.literal("RUNNING"),
        v.literal("DONE"),
        v.literal("FAILED")
      ),
      taskId: v.optional(v.id("tasks")),
      instanceId: v.optional(v.id("agentInstances")),
      startedAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
      retryCount: v.number(),
      error: v.optional(v.string()),
      output: v.optional(v.string()),
    })),
    context: v.any(),
    initialInput: v.string(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_run_id", ["runId"])
    .index("by_workflow_id", ["workflowId"])
    .index("by_project", ["projectId"])
    .index("by_status", ["tenantId", "status"])
    .index("by_parent_task", ["parentTaskId"]),

  // ==========================================================================
  // DOMAIN 9: EVALUATION (ARM wins)
  // ==========================================================================

  /** Test suite definitions. ARM-owned. */
  evaluationSuites: defineTable({
    tenantId: v.id("tenants"),
    templateId: v.optional(v.id("agentTemplates")),
    name: v.string(),
    description: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    testCases: v.array(v.object({
      id: v.string(),
      name: v.string(),
      input: v.any(),
      expectedOutput: v.optional(v.any()),
      scoringCriteria: v.optional(v.any()),
      weight: v.optional(v.number()),
    })),
    active: v.boolean(),
    version: v.number(),
    createdBy: v.optional(v.id("operators")),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_template", ["templateId"])
    .index("by_active", ["tenantId", "active"]),

  /** Test execution records. ARM-owned. */
  evaluationRuns: defineTable({
    tenantId: v.id("tenants"),
    suiteId: v.id("evaluationSuites"),
    versionId: v.id("agentVersions"),
    triggeredBy: v.optional(v.union(
      v.literal("MANUAL"),
      v.literal("STATE_TRANSITION"),
      v.literal("SCHEDULED"),
      v.literal("CI")
    )),
    status: v.union(
      v.literal("PENDING"),
      v.literal("RUNNING"),
      v.literal("PASSED"),
      v.literal("FAILED"),
      v.literal("CANCELED"),
      v.literal("ERROR")
    ),
    score: v.optional(v.number()),
    testResults: v.optional(v.array(v.object({
      testCaseId: v.string(),
      passed: v.boolean(),
      score: v.optional(v.number()),
      output: v.optional(v.any()),
      error: v.optional(v.string()),
      durationMs: v.optional(v.number()),
    }))),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_suite", ["suiteId"])
    .index("by_version", ["versionId"])
    .index("by_status", ["tenantId", "status"]),

  /** Time-series analytics. ARM-owned. */
  evaluationMetrics: defineTable({
    tenantId: v.id("tenants"),
    evaluationRunId: v.id("evaluationRuns"),
    versionId: v.id("agentVersions"),
    metricName: v.string(),
    metricValue: v.number(),
    unit: v.optional(v.string()),
    timestamp: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_run", ["evaluationRunId"])
    .index("by_version_metric", ["versionId", "metricName"])
    .index("by_timestamp", ["tenantId", "timestamp"]),

  /** Extensible scoring functions. ARM-owned. */
  customScoringFunctions: defineTable({
    tenantId: v.id("tenants"),
    name: v.string(),
    description: v.optional(v.string()),
    functionType: v.union(
      v.literal("JAVASCRIPT"),
      v.literal("REGEX"),
      v.literal("THRESHOLD")
    ),
    functionBody: v.string(),
    inputSchema: v.optional(v.any()),
    outputSchema: v.optional(v.any()),
    active: v.boolean(),
    createdBy: v.optional(v.id("operators")),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_name", ["tenantId", "name"])
    .index("by_active", ["tenantId", "active"]),

  // ==========================================================================
  // DOMAIN 10: NOTIFICATIONS (ARM wins)
  // ==========================================================================

  /** Event-driven notification events. ARM-owned. */
  notificationEvents: defineTable({
    tenantId: v.id("tenants"),
    eventType: v.string(),
    sourceEntity: v.string(),
    sourceId: v.string(),
    payload: v.optional(v.any()),
    processedAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_type", ["tenantId", "eventType"]),

  /** Delivered notifications. ARM structure + MC type taxonomy. */
  notifications: defineTable({
    tenantId: v.id("tenants"),
    operatorId: v.id("operators"),
    type: v.union(
      v.literal("MENTION"),
      v.literal("TASK_ASSIGNED"),
      v.literal("TASK_TRANSITION"),
      v.literal("APPROVAL_REQUESTED"),
      v.literal("APPROVAL_DECIDED"),
      v.literal("DEPLOYMENT_ACTIVATED"),
      v.literal("EVALUATION_COMPLETED"),
      v.literal("ALERT"),
      v.literal("SYSTEM")
    ),
    title: v.string(),
    body: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
    approvalRecordId: v.optional(v.id("approvalRecords")),
    deploymentId: v.optional(v.id("deployments")),
    fromInstanceId: v.optional(v.id("agentInstances")),
    fromOperatorId: v.optional(v.id("operators")),
    channel: v.optional(v.union(
      v.literal("IN_APP"),
      v.literal("EMAIL"),
      v.literal("SLACK"),
      v.literal("WEBHOOK")
    )),
    readAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_operator", ["operatorId"])
    .index("by_task", ["taskId"])
    .index("by_type", ["tenantId", "type"]),

  /** Per-operator notification preferences. ARM-owned. */
  notificationPreferences: defineTable({
    tenantId: v.id("tenants"),
    operatorId: v.id("operators"),
    channel: v.union(
      v.literal("IN_APP"),
      v.literal("EMAIL"),
      v.literal("SLACK"),
      v.literal("WEBHOOK")
    ),
    enabled: v.boolean(),
    filters: v.optional(v.any()),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_operator", ["operatorId"])
    .index("by_operator_channel", ["operatorId", "channel"]),

  // ==========================================================================
  // DOMAIN 11: PLATFORM (ARM + MC shared)
  // ==========================================================================

  /** Feature flags. ARM-owned. */
  featureFlags: defineTable({
    tenantId: v.id("tenants"),
    key: v.string(),
    enabled: v.boolean(),
    description: v.optional(v.string()),
    conditions: v.optional(v.any()),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_key", ["tenantId", "key"]),

  /** A/B testing. ARM-owned. */
  experiments: defineTable({
    tenantId: v.id("tenants"),
    name: v.string(),
    description: v.optional(v.string()),
    variants: v.array(v.object({
      id: v.string(),
      name: v.string(),
      weight: v.number(),
      config: v.optional(v.any()),
    })),
    status: v.union(
      v.literal("DRAFT"),
      v.literal("ACTIVE"),
      v.literal("COMPLETED")
    ),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_status", ["tenantId", "status"]),

  /** Variant assignments. ARM-owned. */
  experimentAssignments: defineTable({
    tenantId: v.id("tenants"),
    experimentId: v.id("experiments"),
    entityType: v.string(),
    entityId: v.string(),
    variantId: v.string(),
    assignedAt: v.number(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_experiment", ["experimentId"])
    .index("by_entity", ["entityType", "entityId"]),

  /** Experiment event tracking. ARM-owned. */
  experimentEvents: defineTable({
    tenantId: v.id("tenants"),
    experimentId: v.id("experiments"),
    variantId: v.string(),
    eventType: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    value: v.optional(v.number()),
    timestamp: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_experiment", ["experimentId"])
    .index("by_experiment_variant", ["experimentId", "variantId"]),

  /** Operational alerts. MC-owned. */
  alerts: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.optional(v.id("projects")),
    severity: v.union(
      v.literal("INFO"),
      v.literal("WARNING"),
      v.literal("ERROR"),
      v.literal("CRITICAL")
    ),
    type: v.string(),
    title: v.string(),
    description: v.string(),
    instanceId: v.optional(v.id("agentInstances")),
    taskId: v.optional(v.id("tasks")),
    runId: v.optional(v.id("runs")),
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
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_project", ["projectId"])
    .index("by_status", ["tenantId", "status"])
    .index("by_severity", ["tenantId", "severity"])
    .index("by_instance", ["instanceId"]),

  /** Emergency mode controls. MC-owned. */
  operatorControls: defineTable({
    tenantId: v.id("tenants"),
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
    .index("by_tenant", ["tenantId"])
    .index("by_project", ["projectId"])
    .index("by_project_mode", ["projectId", "mode"]),

  /** Saved operator filters/presets. MC-owned. */
  savedViews: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    ownerUserId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    scope: v.union(
      v.literal("KANBAN"),
      v.literal("APPROVALS"),
      v.literal("AGENTS"),
      v.literal("SEARCH"),
      v.literal("DIRECTORY"),
      v.literal("DEPLOYMENTS")
    ),
    filters: v.any(),
    isShared: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_project", ["projectId"])
    .index("by_owner", ["ownerUserId"])
    .index("by_project_scope", ["projectId", "scope"]),

  /** Entity watchlists. MC-owned. */
  watchSubscriptions: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.optional(v.id("projects")),
    userId: v.string(),
    entityType: v.union(
      v.literal("TASK"),
      v.literal("APPROVAL"),
      v.literal("INSTANCE"),
      v.literal("PROJECT"),
      v.literal("DEPLOYMENT")
    ),
    entityId: v.string(),
    createdAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_user", ["userId"])
    .index("by_entity", ["entityType", "entityId"])
    .index("by_project", ["projectId"]),

  /** Event webhooks. MC-owned. */
  webhooks: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.optional(v.id("projects")),
    name: v.string(),
    url: v.string(),
    secret: v.string(),
    events: v.array(v.string()),
    filters: v.optional(v.object({
      taskTypes: v.optional(v.array(v.string())),
      instanceIds: v.optional(v.array(v.id("agentInstances"))),
      statuses: v.optional(v.array(v.string())),
    })),
    active: v.boolean(),
    deliveryCount: v.number(),
    failureCount: v.number(),
    lastDeliveryAt: v.optional(v.number()),
    lastFailureAt: v.optional(v.number()),
    createdBy: v.optional(v.string()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_project", ["projectId"])
    .index("by_active", ["tenantId", "active"]),

  /** Webhook delivery tracking. MC-owned. */
  webhookDeliveries: defineTable({
    tenantId: v.id("tenants"),
    webhookId: v.id("webhooks"),
    projectId: v.optional(v.id("projects")),
    event: v.string(),
    payload: v.any(),
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
    responseStatus: v.optional(v.number()),
    responseBody: v.optional(v.string()),
    error: v.optional(v.string()),
    deliveredAt: v.optional(v.number()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_webhook", ["webhookId"])
    .index("by_status", ["tenantId", "status"])
    .index("by_next_retry", ["nextRetryAt"]),

  /** Thread subscriptions. MC-owned. */
  threadSubscriptions: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.optional(v.id("projects")),
    instanceId: v.id("agentInstances"),
    taskId: v.id("tasks"),
    subscribedAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_instance", ["instanceId"])
    .index("by_task", ["taskId"])
    .index("by_instance_task", ["instanceId", "taskId"])
    .index("by_project", ["projectId"]),

  /** Per-project org assignments. MC-owned. */
  orgAssignments: defineTable({
    tenantId: v.id("tenants"),
    instanceId: v.id("agentInstances"),
    projectId: v.id("projects"),
    orgPosition: v.union(
      v.literal("CEO"),
      v.literal("LEAD"),
      v.literal("SPECIALIST"),
      v.literal("INTERN")
    ),
    scope: v.union(
      v.literal("PROJECT"),
      v.literal("SQUAD"),
      v.literal("REPO")
    ),
    scopeRef: v.optional(v.string()),
    assignedBy: v.optional(v.string()),
    assignedAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_instance", ["instanceId"])
    .index("by_project", ["projectId"])
    .index("by_project_position", ["projectId", "orgPosition"]),

  /** Visual artifacts gallery. MC-owned. */
  captures: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.optional(v.id("projects")),
    taskId: v.optional(v.id("tasks")),
    instanceId: v.optional(v.id("agentInstances")),
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
    url: v.optional(v.string()),
    fileStorageId: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    fileSize: v.optional(v.number()),
    mimeType: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    capturedAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_project", ["projectId"])
    .index("by_task", ["taskId"])
    .index("by_instance", ["instanceId"])
    .index("by_type", ["tenantId", "type"])
    .index("by_captured_at", ["capturedAt"]),
});
