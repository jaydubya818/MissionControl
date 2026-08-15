/**
 * Convex Database Schema — V0
 * 
 * Aligned with Bootstrap Kit (docs/openclaw-bootstrap/schema/SCHEMA.md)
 * Source of truth for Mission Control data model.
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  acceptanceCriterionValidator,
  changeBudgetValidator,
  criterionCoverageValidator,
  dataBoundaryValidator,
  evidenceCategoryValidator,
  negativeConstraintValidator,
  requirementValidator,
  verificationCheckResultValidator,
  verificationCheckStatusValidator,
  verificationContractValidator,
  verificationVerdictValidator,
} from "./lib/workOrderSpecificationValidators";
import {
  factoryContextBudgetValidator,
  factoryContextItemValidator,
  factoryEntityTypeValidator,
  factoryKnowledgeDerivationValidator,
  factoryMemoryProvenanceValidator,
  factoryMemorySourceTypeValidator,
  factoryPurposeValidator,
  factoryRelationValidator,
  factoryRetrievalStrategyValidator,
} from "./lib/factoryMemoryValidators";

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

const workOrderRiskLevel = v.union(
  v.literal("LOW"),
  v.literal("MEDIUM"),
  v.literal("HIGH"),
  v.literal("CRITICAL")
);

const workOrderState = v.union(
  v.literal("DRAFT"),
  v.literal("READY"),
  v.literal("DISPATCHED"),
  v.literal("IN_PROGRESS"),
  v.literal("BLOCKED"),
  v.literal("AWAITING_APPROVAL"),
  v.literal("AWAITING_VERIFICATION"),
  v.literal("REOPENED"),
  v.literal("DONE"),
  v.literal("CANCELED"),
  v.literal("SUPERSEDED")
);

const verificationStatus = v.union(
  v.literal("PENDING"),
  v.literal("PASS"),
  v.literal("FAIL"),
  v.literal("WAIVED"),
  v.literal("STALE")
);

const approvalDecisionStatus = v.union(
  v.literal("NOT_REQUIRED"),
  v.literal("PENDING"),
  v.literal("APPROVED"),
  v.literal("REJECTED"),
  v.literal("CONDITIONAL"),
  v.literal("REVISION_REQUESTED"),
  v.literal("EXPIRED"),
  v.literal("REVOKED")
);

const workOrderApprovalDecisionStatus = v.union(
  v.literal("PENDING"),
  v.literal("APPROVED"),
  v.literal("CONDITIONAL"),
  v.literal("REJECTED"),
  v.literal("REVISION_REQUESTED"),
  v.literal("EXPIRED"),
  v.literal("SUPERSEDED"),
  v.literal("REVOKED")
);

const workOrderRevisionStatus = v.union(
  v.literal("APPLIED"),
  v.literal("PENDING_APPROVAL"),
  v.literal("REJECTED"),
  v.literal("SUPERSEDED")
);

const revisionMateriality = v.union(
  v.literal("NO_ACTION"),
  v.literal("REVERIFICATION"),
  v.literal("REAPPROVAL"),
  v.literal("BOTH"),
  v.literal("FULL_REOPEN")
);

const riskReassessment = v.union(
  v.literal("UNCHANGED"),
  v.literal("INCREASED"),
  v.literal("DECREASED")
);

const workOrderApprovalDecisionAction = v.union(
  v.literal("APPROVE"),
  v.literal("APPROVE_WITH_CONDITIONS"),
  v.literal("REJECT"),
  v.literal("REQUEST_REVISION")
);

const verificationReceiptStatus = v.union(
  v.literal("PENDING"),
  v.literal("PASSED"),
  v.literal("FAILED"),
  v.literal("WAIVED"),
  v.literal("STALE")
);

const runEventType = v.union(
  v.literal("RUN_STARTED"),
  v.literal("EXECUTION_CLAIMED"),
  v.literal("EXECUTION_HEARTBEAT"),
  v.literal("STALE_RUN_RECOVERED"),
  v.literal("RUN_QUARANTINED"),
  v.literal("CANCELLATION_REQUESTED"),
  v.literal("POLICY_DEVIATION"),
  v.literal("PULL_REQUEST_CREATED"),
  v.literal("STEP_STARTED"),
  v.literal("STEP_COMPLETED"),
  v.literal("TOOL_CALLED"),
  v.literal("COMMAND_EXECUTED"),
  v.literal("FILE_CHANGED"),
  v.literal("ARTIFACT_CREATED"),
  v.literal("CHECKPOINT_CREATED"),
  v.literal("RETRY_STARTED"),
  v.literal("RETRY_COMPLETED"),
  v.literal("HUMAN_INTERVENTION_REQUESTED"),
  v.literal("SPEC_VALIDATED"),
  v.literal("RISK_CLASSIFIED"),
  v.literal("CHANGE_BUDGET_ASSIGNED"),
  v.literal("COMMAND_REQUESTED"),
  v.literal("COMMAND_APPROVED"),
  v.literal("COMMAND_DENIED"),
  v.literal("CHANGE_BUDGET_EXCEEDED"),
  v.literal("VERIFICATION_STARTED"),
  v.literal("VERIFICATION_CHECK_STARTED"),
  v.literal("VERIFICATION_CHECK_PASSED"),
  v.literal("VERIFICATION_CHECK_FAILED"),
  v.literal("EVIDENCE_CREATED"),
  v.literal("INDEPENDENT_REVIEW_STARTED"),
  v.literal("VERIFICATION_RECEIPT_CREATED"),
  v.literal("PULL_REQUEST_CREATED"),
  v.literal("RUN_PAUSED"),
  v.literal("RUN_RESUMED"),
  v.literal("CANCELLATION_REQUESTED"),
  v.literal("RUN_CANCELED"),
  v.literal("RUN_FAILED"),
  v.literal("RUN_CANCELED"),
  v.literal("RUN_COMPLETED")
);

const runArtifactType = v.union(
  v.literal("CODE_DIFF"),
  v.literal("TEST_OUTPUT"),
  v.literal("BUILD_OUTPUT"),
  v.literal("LOG_BUNDLE"),
  v.literal("SCREENSHOT"),
  v.literal("GENERATED_DOCUMENT"),
  v.literal("VERIFICATION_EVIDENCE"),
  v.literal("PULL_REQUEST"),
  v.literal("CHECKPOINT"),
  v.literal("STRUCTURED_OUTPUT"),
  v.literal("OTHER")
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

const factoryReleaseState = v.union(
  v.literal("MERGED"),
  v.literal("DEPLOYED"),
  v.literal("VERIFIED"),
  v.literal("ROLLED_BACK")
);

const factoryProductionReleaseState = v.union(
  v.literal("ELIGIBLE"),
  v.literal("DEPLOYED"),
  v.literal("VERIFIED"),
  v.literal("PROMOTED"),
  v.literal("ROLLED_BACK")
);

const factoryReleaseEvidenceKind = v.union(
  v.literal("MERGE"),
  v.literal("DEPLOYMENT_APPROVAL"),
  v.literal("DEPLOYMENT"),
  v.literal("PROVENANCE"),
  v.literal("SMOKE_TEST"),
  v.literal("HEALTH_CHECK"),
  v.literal("ROLLBACK"),
  v.literal("PRODUCTION_APPROVAL"),
  v.literal("PRODUCTION_DEPLOYMENT"),
  v.literal("PRODUCTION_PROVENANCE"),
  v.literal("PRODUCTION_SMOKE_TEST"),
  v.literal("PRODUCTION_HEALTH_CHECK"),
  v.literal("PRODUCTION_PROMOTION"),
  v.literal("PRODUCTION_ROLLBACK")
);

const contextPackageType = v.union(
  v.literal("SKILL"),
  v.literal("RULES"),
  v.literal("DOCUMENTATION"),
  v.literal("SOUL"),
  v.literal("WORKFLOW"),
  v.literal("TOOL_GUIDE"),
  v.literal("PROMPT_TEMPLATE"),
  v.literal("POLICY"),
  v.literal("ARCHITECTURE_GUIDE"),
  v.literal("EVALUATION_GUIDE")
);

const contextPackageStatus = v.union(
  v.literal("DRAFT"),
  v.literal("ACTIVE"),
  v.literal("DEPRECATED")
);

const contextVersionStatus = v.union(
  v.literal("DRAFT"),
  v.literal("PUBLISHED"),
  v.literal("DEPRECATED")
);

const contextSecurityStatus = v.union(
  v.literal("UNSCANNED"),
  v.literal("PASSED"),
  v.literal("FAILED"),
  v.literal("QUARANTINED")
);

const contextEvalRunStatus = v.union(
  v.literal("PENDING"),
  v.literal("RUNNING"),
  v.literal("COMPLETED"),
  v.literal("FAILED"),
  v.literal("CANCELED")
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
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    updatedBy: v.optional(v.id("operators")),
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
    .index("by_tenant_auth_id", ["tenantId", "authId"])
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
        v.literal("team"),
        v.literal("repository"),
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
    purpose: v.optional(v.string()),
    owner: v.optional(v.string()),
    ownerMemberId: v.optional(v.id("orgMembers")),
    defaultPolicy: v.optional(v.string()),
    status: v.optional(
      v.union(v.literal("ACTIVE"), v.literal("PAUSED"), v.literal("ARCHIVED"))
    ),
    
    // GitHub integration
    githubRepo: v.optional(v.string()), // e.g., "owner/repo"
    githubBranch: v.optional(v.string()),
    githubWebhookSecret: v.optional(v.string()),
    repositoryStatus: v.optional(
      v.union(
        v.literal("UNCONFIGURED"),
        v.literal("CONFIGURED"),
        v.literal("READY"),
        v.literal("DEGRADED"),
        v.literal("ERROR")
      )
    ),
    repositoryValidatedAt: v.optional(v.number()),
    repositoryValidationError: v.optional(v.string()),
    
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
    
    // Human-readable task identifier config
    taskPrefix: v.optional(v.string()),   // e.g., "MC", "OPS" — derived from slug if not set
    nextTaskNumber: v.optional(v.number()), // Auto-incrementing counter for task identifiers
    
    // Metadata
    metadata: v.optional(v.any()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    createdBy: v.optional(v.id("operators")),
    updatedBy: v.optional(v.id("operators")),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_slug", ["slug"])
    .index("by_github_repo", ["githubRepo"])
    .index("by_tenant_slug", ["tenantId", "slug"]),

  // Portable repository connections for a workspace. The legacy repository
  // fields on projects remain the compatibility projection for the default
  // connection while consumers migrate to this one-to-many model.
  workspaceRepositories: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.id("projects"),
    provider: v.union(v.literal("GITHUB")),
    repository: v.string(),
    displayName: v.string(),
    providerRepositoryId: v.optional(v.string()),
    defaultBranch: v.string(),
    isDefault: v.boolean(),
    status: v.union(
      v.literal("CONFIGURED"),
      v.literal("READY"),
      v.literal("DEGRADED"),
      v.literal("ERROR")
    ),
    validatedAt: v.optional(v.number()),
    validationError: v.optional(v.string()),
    webhookStatus: v.union(
      v.literal("MISSING"),
      v.literal("CONFIGURED"),
      v.literal("READY"),
      v.literal("ERROR")
    ),
    policyOverrides: v.optional(v.any()),
    migrationVersion: v.optional(v.number()),
    fixtureKey: v.optional(v.string()),
    createdBy: v.optional(v.id("operators")),
    updatedBy: v.optional(v.id("operators")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_repository", ["projectId", "repository"])
    .index("by_project_default", ["projectId", "isDefault"])
    .index("by_tenant", ["tenantId"]),

  // GitHub App identity and its last verified capability envelope. Short-lived
  // installation tokens are minted by the orchestration boundary and are never
  // persisted in Convex.
  githubAppInstallations: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.id("projects"),
    repositoryId: v.id("workspaceRepositories"),
    installationId: v.string(),
    appId: v.string(),
    accountLogin: v.string(),
    accountType: v.optional(v.string()),
    repositorySelection: v.union(v.literal("ALL"), v.literal("SELECTED")),
    permissions: v.array(v.object({
      name: v.string(),
      access: v.union(
        v.literal("none"),
        v.literal("read"),
        v.literal("write"),
        v.literal("admin")
      ),
    })),
    subscribedEvents: v.array(v.string()),
    status: v.union(
      v.literal("CONNECTED"),
      v.literal("DEGRADED"),
      v.literal("REVOKED")
    ),
    installedAt: v.number(),
    verifiedAt: v.optional(v.number()),
    lastTokenIssuedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_repository", ["repositoryId"])
    .index("by_installation", ["installationId"])
    .index("by_project", ["projectId"]),

  githubAppSetupSessions: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.id("projects"),
    repositoryId: v.id("workspaceRepositories"),
    actorId: v.string(),
    stateHash: v.string(),
    status: v.union(
      v.literal("PENDING"),
      v.literal("COMPLETED"),
      v.literal("FAILED"),
      v.literal("EXPIRED")
    ),
    createdAt: v.number(),
    expiresAt: v.number(),
    completedAt: v.optional(v.number()),
    installationId: v.optional(v.string()),
    error: v.optional(v.string()),
  })
    .index("by_state_hash", ["stateHash"])
    .index("by_repository", ["repositoryId"]),

  // Inbound GitHub webhook ledger. Payload bodies and credentials are
  // deliberately excluded; exact provider identifiers are enough for replay,
  // investigation, and idempotency.
  githubWebhookDeliveries: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    deliveryId: v.string(),
    event: v.string(),
    action: v.optional(v.string()),
    repository: v.optional(v.string()),
    providerRepositoryId: v.optional(v.string()),
    installationId: v.optional(v.string()),
    signatureStatus: v.union(
      v.literal("VALID"),
      v.literal("INVALID"),
      v.literal("MISSING")
    ),
    status: v.union(
      v.literal("RECEIVED"),
      v.literal("PROCESSED"),
      v.literal("IGNORED"),
      v.literal("FAILED")
    ),
    replayState: v.union(v.literal("ORIGINAL"), v.literal("DUPLICATE")),
    attemptCount: v.number(),
    receivedAt: v.number(),
    lastAttemptAt: v.number(),
    completedAt: v.optional(v.number()),
    result: v.optional(v.string()),
    error: v.optional(v.string()),
  })
    .index("by_delivery", ["deliveryId"])
    .index("by_repository", ["repositoryId"])
    .index("by_installation", ["installationId"])
    .index("by_received", ["receivedAt"]),

  factoryDefinitions: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.id("projects"),
    repositoryId: v.id("workspaceRepositories"),
    name: v.string(),
    status: v.union(v.literal("DRAFT"), v.literal("ACTIVE"), v.literal("ARCHIVED")),
    activeVersionId: v.optional(v.id("factoryDefinitionVersions")),
    latestVersion: v.number(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_repository", ["repositoryId"])
    .index("by_project_status", ["projectId", "status"]),

  factoryDefinitionVersions: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.id("projects"),
    factoryDefinitionId: v.id("factoryDefinitions"),
    version: v.number(),
    configurationDigest: v.string(),
    repositoryId: v.id("workspaceRepositories"),
    workflowId: v.id("workflows"),
    executor: v.object({ adapter: v.string(), version: v.string() }),
    codeScopeIds: v.optional(v.array(v.id("repositoryCodeScopes"))),
    agentBindings: v.optional(v.array(v.object({
      workflowAgentId: v.string(),
      agentVersionId: v.id("agentVersions"),
    }))),
    policyEnvelopeId: v.optional(v.id("policyEnvelopes")),
    environmentId: v.optional(v.id("environments")),
    budget: v.object({ maxCostUsd: v.number(), maxRuntimeMinutes: v.number(), maxAttempts: v.number() }),
    verifierIds: v.array(v.id("contextVerifiers")),
    riskBoundary: v.union(v.literal("GREEN"), v.literal("YELLOW"), v.literal("RED")),
    recovery: v.object({ pause: v.boolean(), cancel: v.boolean(), retry: v.boolean(), resume: v.boolean() }),
    createdBy: v.string(),
    createdAt: v.number(),
  })
    .index("by_factory", ["factoryDefinitionId"])
    .index("by_factory_version", ["factoryDefinitionId", "version"])
    .index("by_digest", ["configurationDigest"]),

  factoryReadinessAssessments: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.id("projects"),
    factoryDefinitionId: v.id("factoryDefinitions"),
    factoryDefinitionVersionId: v.id("factoryDefinitionVersions"),
    configurationDigest: v.string(),
    status: v.union(v.literal("PASS"), v.literal("BLOCKED")),
    checks: v.array(v.object({
      id: v.string(),
      label: v.string(),
      status: v.union(
        v.literal("VERIFIED"),
        v.literal("MISSING"),
        v.literal("STALE"),
        v.literal("WAIVED"),
        v.literal("NOT_APPLICABLE")
      ),
      evidence: v.optional(v.any()),
      checkedAt: v.number(),
      expiresAt: v.optional(v.number()),
      remediation: v.optional(v.string()),
      rootBlocker: v.optional(v.string()),
    })),
    assessedBy: v.string(),
    assessedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_version", ["factoryDefinitionVersionId"])
    .index("by_factory", ["factoryDefinitionId"])
    .index("by_assessed", ["assessedAt"]),

  // Replay-resistant service command ledger. Credentials and command payloads
  // are deliberately excluded; the digest and scoped identity are sufficient
  // for audit, idempotency, and incident investigation.
  serviceCommandReceipts: defineTable({
    serviceId: v.string(),
    capability: v.string(),
    commandId: v.string(),
    claimedProjectId: v.string(),
    claimedRepositoryId: v.string(),
    payloadDigest: v.string(),
    signatureStatus: v.union(
      v.literal("VALID"),
      v.literal("INVALID"),
      v.literal("MISSING")
    ),
    status: v.union(
      v.literal("RECEIVED"),
      v.literal("SUCCEEDED"),
      v.literal("FAILED"),
      v.literal("DENIED")
    ),
    issuedAt: v.number(),
    expiresAt: v.number(),
    receivedAt: v.number(),
    completedAt: v.optional(v.number()),
    attemptCount: v.number(),
    replayDetectedAt: v.optional(v.number()),
    reason: v.optional(v.string()),
    resultReference: v.optional(v.string()),
  })
    .index("by_command", ["commandId"])
    .index("by_service_received", ["serviceId", "receivedAt"])
    .index("by_claimed_project", ["claimedProjectId", "receivedAt"]),

  // Governed paths/components inside a repository. This is the execution and
  // review boundary for monorepos; it deliberately does not store local paths.
  repositoryCodeScopes: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.id("projects"),
    repositoryId: v.id("workspaceRepositories"),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    includePaths: v.array(v.string()),
    excludePaths: v.array(v.string()),
    owningTeam: v.optional(v.string()),
    owningTeamId: v.optional(v.id("scrumTeams")),
    overlapPriority: v.optional(v.number()),
    requiredReviewers: v.array(v.string()),
    allowedEnvironments: v.array(
      v.union(v.literal("LOCAL"), v.literal("CLOUD"))
    ),
    verificationPolicy: v.optional(v.string()),
    approvalPolicy: v.optional(v.string()),
    approvalPolicyDescription: v.optional(v.string()),
    migrationVersion: v.optional(v.number()),
    fixtureKey: v.optional(v.string()),
    createdBy: v.optional(v.id("operators")),
    updatedBy: v.optional(v.id("operators")),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_repository", ["repositoryId"])
    .index("by_repository_slug", ["repositoryId", "slug"]),

  // Executor-local checkout reports for a project repository. A checkout path
  // belongs to one host and is never treated as a portable project property.
  workspaceHostBindings: defineTable({
    projectId: v.id("projects"),
    hostId: v.string(),
    repository: v.string(),
    checkoutRoot: v.string(),
    observedBranch: v.optional(v.string()),
    observedCommit: v.optional(v.string()),
    dirty: v.boolean(),
    runtime: v.optional(v.string()),
    approvedModelIds: v.optional(v.array(v.string())),
    networkPolicyStatus: v.optional(v.union(v.literal("READY"), v.literal("BLOCKED"), v.literal("UNKNOWN"))),
    secretPolicyStatus: v.optional(v.union(v.literal("READY"), v.literal("BLOCKED"), v.literal("UNKNOWN"))),
    capacity: v.optional(v.object({
      maxConcurrentRuns: v.number(),
      currentRuns: v.number(),
    })),
    attestedAt: v.optional(v.number()),
    status: v.union(
      v.literal("READY"),
      v.literal("MISSING"),
      v.literal("STALE"),
      v.literal("DIRTY"),
      v.literal("ERROR")
    ),
    error: v.optional(v.string()),
    checkedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_host", ["projectId", "hostId"])
    .index("by_host", ["hostId"]),

  // -------------------------------------------------------------------------
  // MODEL ROUTING CONTROL PLANE
  // -------------------------------------------------------------------------
  modelCatalog: defineTable({
    provider: v.string(),
    modelId: v.string(),
    displayName: v.string(),
    tier: v.union(
      v.literal("FAST"),
      v.literal("BALANCED"),
      v.literal("POWERFUL")
    ),
    capabilities: v.array(v.string()),
    supportsTools: v.boolean(),
    riskApproved: v.boolean(),
    contextWindow: v.number(),
    availability: v.union(
      v.literal("HEALTHY"),
      v.literal("DEGRADED"),
      v.literal("RATE_LIMITED"),
      v.literal("UNAVAILABLE")
    ),
    estimatedCostPerRunUsd: v.optional(v.number()),
    deprecated: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_model_id", ["modelId"])
    .index("by_provider", ["provider"])
    .index("by_availability", ["availability"]),

  modelRoutingPolicies: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    status: v.union(
      v.literal("ACTIVE"),
      v.literal("DRAFT"),
      v.literal("ARCHIVED")
    ),
    defaultModelId: v.optional(v.string()),
    safeFallbackModelId: v.optional(v.string()),
    rules: v.array(v.object({
      id: v.string(),
      order: v.number(),
      taskType: v.optional(v.string()),
      operatingLane: v.optional(v.union(
        v.literal("PLAN"),
        v.literal("EXECUTE"),
        v.literal("REVIEW"),
        v.literal("LOCAL"),
        v.literal("LONG_RUNNING")
      )),
      riskLevel: v.optional(workOrderRiskLevel),
      complexity: v.optional(v.union(
        v.literal("SMALL"),
        v.literal("STANDARD"),
        v.literal("LARGE")
      )),
      requiredCapabilities: v.optional(v.array(v.string())),
      modelId: v.string(),
    })),
    lanePools: v.optional(v.array(v.object({
      lane: v.union(
        v.literal("PLAN"),
        v.literal("EXECUTE"),
        v.literal("REVIEW"),
        v.literal("LOCAL"),
        v.literal("LONG_RUNNING")
      ),
      modelIds: v.array(v.string()),
      canaryModelIds: v.optional(v.array(v.string())),
      dailyBudgetUsd: v.optional(v.number()),
      monthlyBudgetUsd: v.optional(v.number()),
      minProviderCount: v.optional(v.number()),
      canaryPercent: v.optional(v.number()),
    }))),
    fallbackChain: v.array(v.string()),
    budgetLimitUsd: v.optional(v.number()),
    latencyTargetMs: v.optional(v.number()),
    canaryPercent: v.number(),
    killSwitch: v.boolean(),
    version: v.number(),
    createdBy: v.optional(v.string()),
    updatedBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_status", ["projectId", "status"]),

  agentModelOverrides: defineTable({
    projectId: v.id("projects"),
    agentId: v.id("agents"),
    modelId: v.string(),
    reason: v.string(),
    expiresAt: v.optional(v.number()),
    createdBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_agent", ["agentId"])
    .index("by_project_agent", ["projectId", "agentId"]),

  modelRoutingDecisions: defineTable({
    projectId: v.id("projects"),
    policyId: v.optional(v.id("modelRoutingPolicies")),
    policyVersion: v.number(),
    workOrderId: v.optional(v.id("workOrders")),
    taskId: v.optional(v.id("tasks")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    agentId: v.optional(v.id("agents")),
    taskType: v.optional(v.string()),
    operatingLane: v.optional(v.union(
      v.literal("PLAN"),
      v.literal("EXECUTE"),
      v.literal("REVIEW"),
      v.literal("LOCAL"),
      v.literal("LONG_RUNNING")
    )),
    riskLevel: workOrderRiskLevel,
    complexity: v.optional(v.union(
      v.literal("SMALL"),
      v.literal("STANDARD"),
      v.literal("LARGE")
    )),
    requestedTier: v.optional(v.union(
      v.literal("FAST"),
      v.literal("BALANCED"),
      v.literal("POWERFUL")
    )),
    requiredCapabilities: v.array(v.string()),
    selectedProvider: v.optional(v.string()),
    selectedModelId: v.optional(v.string()),
    source: v.union(
      v.literal("RUN_OVERRIDE"),
      v.literal("LANE_POOL"),
      v.literal("WORKFLOW_TIER"),
      v.literal("AGENT_OVERRIDE"),
      v.literal("POLICY_RULE"),
      v.literal("WORKSPACE_DEFAULT"),
      v.literal("SYSTEM_DEFAULT")
    ),
    ruleId: v.optional(v.string()),
    explanation: v.string(),
    alternativesConsidered: v.array(v.object({
      modelId: v.string(),
      eligible: v.boolean(),
      reason: v.string(),
    })),
    mode: v.union(
      v.literal("SHADOW"),
      v.literal("ENFORCED"),
      v.literal("KILLED"),
      v.literal("EXHAUSTED")
    ),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_created", ["projectId", "createdAt"])
    .index("by_work_order", ["workOrderId"])
    .index("by_workflow_run", ["workflowRunId"]),

  // -------------------------------------------------------------------------
  // SOFTWARE FACTORY: WORK ORDERS
  // -------------------------------------------------------------------------
  missions: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    idempotencyKey: v.optional(v.string()),
    title: v.string(),
    objective: v.string(),
    context: v.optional(v.string()),
    constraints: v.optional(v.array(v.string())),
    sourceOfTruthRefs: v.optional(v.array(v.object({
      kind: v.union(v.literal("REPO"), v.literal("DOC"), v.literal("PRD"), v.literal("ISSUE"), v.literal("URL")),
      label: v.string(),
      location: v.string(),
    }))),
    owner: v.optional(v.string()),
    // Compatibility fields already present on governed factory Mission records.
    // Keep them optional until the Mission editor adopts the repository registry
    // and organization membership records as canonical inputs.
    ownerMemberId: v.optional(v.id("orgMembers")),
    owningTeamId: v.optional(v.id("scrumTeams")),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    codeScopeIds: v.optional(v.array(v.id("repositoryCodeScopes"))),
    requestedByOperatorId: v.optional(v.id("operators")),
    executionEnvironment: v.optional(v.union(
      v.literal("LOCAL"),
      v.literal("CLOUD"),
      v.literal("REMOTE"),
      v.literal("POLICY_SELECTED"),
    )),
    modelRoutingDecisionId: v.optional(v.id("modelRoutingDecisions")),
    state: v.union(
      v.literal("DRAFT"), v.literal("PLANNING"), v.literal("AWAITING_PLAN_APPROVAL"),
      v.literal("READY"), v.literal("IN_PROGRESS"), v.literal("BLOCKED"),
      v.literal("AWAITING_VALIDATION"), v.literal("AWAITING_ACCEPTANCE"),
      v.literal("DONE"), v.literal("CANCELED"), v.literal("SUPERSEDED")
    ),
    executionPolicy: v.literal("SERIAL_MUTATIONS"),
    maxReadOnlyConcurrency: v.number(),
    maxCorrectiveIterations: v.number(),
    correctiveIterations: v.number(),
    stopCondition: v.string(),
    budgetUsd: v.optional(v.number()),
    spentUsd: v.number(),
    currentPlanId: v.optional(v.id("missionPlans")),
    activeWorkOrderId: v.optional(v.id("workOrders")),
    blockingReason: v.optional(v.string()),
    requiredHumanAction: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    acceptedAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  })
    .index("by_project", ["projectId"])
    .index("by_project_state", ["projectId", "state"])
    .index("by_owner_state", ["owner", "state"])
    .index("by_owner_member", ["ownerMemberId"])
    .index("by_team_state", ["owningTeamId", "state"])
    .index("by_repository", ["repositoryId"])
    .index("by_idempotency", ["idempotencyKey"]),

  missionPlans: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    missionId: v.id("missions"),
    basePlanId: v.optional(v.id("missionPlans")),
    idempotencyKey: v.optional(v.string()),
    revisionNumber: v.number(),
    draftVersion: v.optional(v.number()),
    status: v.union(v.literal("DRAFT"), v.literal("PROPOSED"), v.literal("APPROVED"), v.literal("REJECTED"), v.literal("SUPERSEDED")),
    summary: v.string(),
    rollbackApproach: v.optional(v.string()),
    estimatedCostUsd: v.optional(v.number()),
    repository: v.optional(v.string()),
    repositoryBranch: v.optional(v.string()),
    createdBy: v.string(),
    submittedBy: v.optional(v.string()),
    submittedAt: v.optional(v.number()),
    submittedActorSource: v.optional(v.union(v.literal("AUTHENTICATED"), v.literal("DEVELOPMENT_FALLBACK"))),
    approvedBy: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    decisionReason: v.optional(v.string()),
    decidedBy: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
    decidedActorSource: v.optional(v.union(v.literal("AUTHENTICATED"), v.literal("DEVELOPMENT_FALLBACK"))),
    releaseIdempotencyKey: v.optional(v.string()),
    releasedAt: v.optional(v.number()),
    releasedWorkOrderIds: v.optional(v.array(v.id("workOrders"))),
    materializationVersion: v.optional(v.number()),
    assertions: v.optional(v.array(v.object({
      assertionId: v.string(),
      title: v.string(),
      outcome: v.string(),
      verificationMethod: v.union(v.literal("COMMAND"), v.literal("TEST"), v.literal("BROWSER"), v.literal("MANUAL"), v.literal("CHECKLIST")),
      passCondition: v.string(),
      requiredEvidence: v.string(),
      requiresIndependentValidation: v.boolean(),
      waiverAllowed: v.boolean(),
    }))),
    workOrderBlueprints: v.array(v.object({
      id: v.string(),
      title: v.string(),
      desiredOutcome: v.string(),
      workflowId: v.optional(v.string()),
      workflowVersion: v.optional(v.number()),
      sequence: v.number(),
      role: v.union(v.literal("WORKER"), v.literal("VALIDATOR")),
      isMutating: v.boolean(),
      priority: v.optional(v.union(v.literal(1), v.literal(2), v.literal(3), v.literal(4))),
      riskLevel: v.optional(workOrderRiskLevel),
      modelComplexity: v.optional(v.union(v.literal("SMALL"), v.literal("STANDARD"), v.literal("LARGE"))),
      branchStrategy: v.optional(v.string()),
      constraints: v.optional(v.array(v.string())),
      requiredApprovals: v.optional(v.array(v.string())),
      estimatedCostUsd: v.optional(v.number()),
      implementationPolicy: v.optional(v.object({
        allowedCommands: v.array(v.string()),
        maxCostUsd: v.optional(v.number()),
        maxAttempts: v.number(),
        timeoutMinutes: v.number(),
        stopCondition: v.string(),
      })),
      dependsOnBlueprintIds: v.array(v.string()),
      assertionIds: v.array(v.string()),
    })),
    createdAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_mission", ["missionId"])
    .index("by_mission_status", ["missionId", "status"])
    .index("by_mission_revision", ["missionId", "revisionNumber"])
    .index("by_idempotency", ["idempotencyKey"]),

  validationAssertions: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    missionId: v.id("missions"),
    missionPlanId: v.id("missionPlans"),
    assertionId: v.string(),
    title: v.string(),
    outcome: v.string(),
    verificationMethod: v.union(v.literal("COMMAND"), v.literal("TEST"), v.literal("BROWSER"), v.literal("MANUAL"), v.literal("CHECKLIST")),
    passCondition: v.string(),
    requiredEvidence: v.string(),
    requiresIndependentValidation: v.boolean(),
    waiverAllowed: v.boolean(),
    linkedWorkOrderIds: v.array(v.id("workOrders")),
    status: v.union(v.literal("PENDING"), v.literal("PASS"), v.literal("FAIL"), v.literal("WAIVED"), v.literal("STALE"), v.literal("UNKNOWN")),
    validatorWorkflowRunId: v.optional(v.id("workflowRuns")),
    verificationReceiptId: v.optional(v.id("verificationReceipts")),
    waiverApprovalDecisionId: v.optional(v.id("approvalDecisions")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_mission", ["missionId"])
    .index("by_plan", ["missionPlanId"])
    .index("by_mission_assertion", ["missionId", "assertionId"]),

  missionHandoffs: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    missionId: v.id("missions"),
    workOrderId: v.id("workOrders"),
    workflowRunId: v.id("workflowRuns"),
    producingRole: v.union(v.literal("WORKER"), v.literal("VALIDATOR")),
    consumingRole: v.union(v.literal("WORKER"), v.literal("VALIDATOR"), v.literal("ORCHESTRATOR"), v.literal("OPERATOR")),
    outcome: v.union(v.literal("COMPLETE"), v.literal("INCOMPLETE"), v.literal("NEEDS_HUMAN_INPUT")),
    completedAssertionIds: v.array(v.string()),
    incompleteAssertionIds: v.array(v.string()),
    unknownAssertionIds: v.array(v.string()),
    commands: v.array(v.object({ command: v.string(), exitCode: v.number() })),
    artifactIds: v.array(v.id("runArtifacts")),
    knownRisks: v.array(v.string()),
    nextAction: v.string(),
    nextOwner: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_mission", ["missionId"])
    .index("by_work_order", ["workOrderId"])
    .index("by_run", ["workflowRunId"])
    .index("by_idempotency", ["idempotencyKey"]),

  missionEvents: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    missionId: v.id("missions"),
    workOrderId: v.optional(v.id("workOrders")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    eventType: v.string(),
    actorType: actorType,
    actorId: v.optional(v.string()),
    summary: v.string(),
    idempotencyKey: v.optional(v.string()),
    timestamp: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_mission", ["missionId"])
    .index("by_mission_timestamp", ["missionId", "timestamp"])
    .index("by_idempotency", ["idempotencyKey"]),

  workOrders: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    missionId: v.optional(v.id("missions")),
    missionPlanId: v.optional(v.id("missionPlans")),
    missionSequence: v.optional(v.number()),
    missionRole: v.optional(v.union(v.literal("WORKER"), v.literal("VALIDATOR"))),
    isMutating: v.optional(v.boolean()),
    releasedAt: v.optional(v.number()),
    legacyTaskId: v.optional(v.id("tasks")),
    idempotencyKey: v.optional(v.string()),

    title: v.string(),
    desiredOutcome: v.string(),
    context: v.optional(v.string()),
    workflowId: v.optional(v.string()),
    repository: v.optional(v.string()),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    codeScopeIds: v.optional(v.array(v.id("repositoryCodeScopes"))),
    requestingOperatorId: v.optional(v.id("operators")),
    ownerMemberId: v.optional(v.id("orgMembers")),
    owningTeamId: v.optional(v.id("scrumTeams")),
    executionEnvironment: v.optional(v.union(
      v.literal("LOCAL"),
      v.literal("CLOUD"),
      v.literal("REMOTE"),
      v.literal("POLICY_SELECTED"),
    )),
    scopeEnforcementVersion: v.optional(v.number()),
    branchStrategy: v.optional(v.string()),
    priority: taskPriority,
    riskLevel: workOrderRiskLevel,
    modelComplexity: v.optional(v.union(
      v.literal("SMALL"),
      v.literal("STANDARD"),
      v.literal("LARGE")
    )),
    authorizedModelOverride: v.optional(v.string()),
    authorizedModelOverrideReason: v.optional(v.string()),
    authorizedModelOverrideUpdatedAt: v.optional(v.number()),
    modelRoutingDecisionId: v.optional(v.id("modelRoutingDecisions")),
    requestedBy: v.optional(v.string()),
    assignedAgent: v.optional(v.string()),
    assignedSquad: v.optional(v.string()),

    requirements: v.optional(v.array(requirementValidator)),
    acceptanceCriteria: v.array(acceptanceCriterionValidator),

    constraints: v.optional(v.array(v.string())),
    positiveConstraints: v.optional(v.array(v.string())),
    negativeConstraints: v.optional(v.array(negativeConstraintValidator)),
    dataBoundaries: v.optional(v.array(dataBoundaryValidator)),
    changeBudget: v.optional(changeBudgetValidator),
    verificationContract: v.optional(verificationContractValidator),
    autonomyLevel: v.optional(v.union(
      v.literal("LEVEL_0"), v.literal("LEVEL_1"), v.literal("LEVEL_2"),
      v.literal("LEVEL_3"), v.literal("LEVEL_4"), v.literal("LEVEL_5"),
    )),
    riskReasons: v.optional(v.array(v.string())),
    specificationVersion: v.optional(v.number()),
    specificationValidatedAt: v.optional(v.number()),
    dependencies: v.optional(v.array(v.string())),
    sourceOfTruthRefs: v.optional(v.array(v.object({
      kind: v.union(
        v.literal("REPO"),
        v.literal("DOC"),
        v.literal("PRD"),
        v.literal("ISSUE"),
        v.literal("URL")
      ),
      label: v.string(),
      location: v.string(),
    }))),
    requiredApprovals: v.optional(v.array(v.string())),

    state: workOrderState,
    verificationStatus,
    approvalStatus: approvalDecisionStatus,
    blockingIssue: v.optional(v.string()),
    requiredHumanAction: v.optional(v.string()),
    currentExecutionRunId: v.optional(v.id("workflowRuns")),
    currentRevisionNumber: v.optional(v.number()),
    currentRevisionId: v.optional(v.id("workOrderRevisions")),
    acceptedRevisionNumber: v.optional(v.number()),
    supersededByWorkOrderId: v.optional(v.id("workOrders")),
    supersedesWorkOrderId: v.optional(v.id("workOrders")),
    governancePolicyId: v.optional(v.id("governancePolicies")),

    createdAt: v.number(),
    updatedAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_project", ["projectId"])
    .index("by_mission", ["missionId"])
    .index("by_project_state", ["projectId", "state"])
    .index("by_project_risk", ["projectId", "riskLevel"])
    .index("by_owner_member", ["ownerMemberId"])
    .index("by_team_state", ["owningTeamId", "state"])
    .index("by_repository", ["repositoryId"])
    .index("by_idempotency", ["idempotencyKey"]),

  workOrderEvents: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    workOrderId: v.id("workOrders"),
    workflowRunId: v.optional(v.id("workflowRuns")),
    idempotencyKey: v.optional(v.string()),
    eventType: v.union(
      v.literal("WORK_ORDER_CREATED"),
      v.literal("DISPATCH_REQUESTED"),
      v.literal("DISPATCHED"),
      v.literal("RUN_COMPLETED"),
      v.literal("RUN_FAILED"),
      v.literal("RUN_CANCELED"),
      v.literal("RUN_RETRIED"),
      v.literal("STATE_SYNCED"),
      v.literal("APPROVAL_REQUESTED"),
      v.literal("APPROVAL_APPROVED"),
      v.literal("APPROVAL_CONDITIONAL"),
      v.literal("APPROVAL_REJECTED"),
      v.literal("APPROVAL_REVISION_REQUESTED"),
      v.literal("APPROVAL_EXPIRED"),
      v.literal("APPROVAL_SUPERSEDED"),
      v.literal("APPROVAL_REVOKED"),
      v.literal("REVISION_REQUESTED"),
      v.literal("REVISION_APPROVED"),
      v.literal("REVISION_REJECTED"),
      v.literal("REVISION_APPLIED"),
      v.literal("WORK_ORDER_REOPENED"),
      v.literal("WORK_ORDER_SUPERSEDED"),
      v.literal("VERIFICATION_RECORDED"),
      v.literal("VERIFICATION_FAILED"),
      v.literal("VERIFICATION_WAIVED"),
      v.literal("VERIFICATION_STALE"),
      v.literal("GOVERNANCE_RECORDS_EXPIRED"),
      v.literal("WORK_ORDER_ACCEPTED")
    ),
    fromState: v.optional(workOrderState),
    toState: v.optional(workOrderState),
    actorType: actorType,
    actorId: v.optional(v.string()),
    summary: v.string(),
    timestamp: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_work_order", ["workOrderId"])
    .index("by_project", ["projectId"])
    .index("by_idempotency", ["idempotencyKey"]),

  governancePolicies: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    name: v.string(),
    scope: v.union(v.literal("GLOBAL"), v.literal("PROJECT")),
    active: v.boolean(),
    approvalValidityHoursByRisk: v.object({
      LOW: v.number(),
      MEDIUM: v.number(),
      HIGH: v.number(),
      CRITICAL: v.number(),
    }),
    verificationValidityHours: v.number(),
    approvalExpiringSoonHours: v.number(),
    evidenceExpiringSoonHours: v.number(),
    requireReapprovalAfterMaterialChange: v.boolean(),
    requireReverificationAfterCodeChange: v.boolean(),
    requireReverificationAfterWorkflowChange: v.boolean(),
    requireReverificationAfterEnvironmentChange: v.boolean(),
    fullReopenOnAcceptedWorkOrderChange: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_project_active", ["projectId", "active"])
    .index("by_scope_active", ["scope", "active"]),

  workOrderRevisions: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    workOrderId: v.id("workOrders"),
    idempotencyKey: v.optional(v.string()),
    revisionNumber: v.number(),
    previousRevisionId: v.optional(v.id("workOrderRevisions")),
    status: workOrderRevisionStatus,
    changedFields: v.array(v.string()),
    changeSummary: v.string(),
    reason: v.string(),
    requestedBy: v.optional(v.string()),
    approvedBy: v.optional(v.string()),
    createdAt: v.number(),
    effectiveAt: v.optional(v.number()),
    riskReassessment: riskReassessment,
    materiality: revisionMateriality,
    requiresReapproval: v.boolean(),
    requiresReverification: v.boolean(),
    requiresFullReopen: v.boolean(),
    impactedAcceptanceCriteria: v.array(v.string()),
    impactedApprovals: v.array(v.string()),
    impactedVerificationReceiptIds: v.array(v.id("verificationReceipts")),
    requestedChanges: v.any(),
    previousSnapshot: v.any(),
    nextSnapshot: v.any(),
    metadata: v.optional(v.any()),
  })
    .index("by_work_order", ["workOrderId"])
    .index("by_work_order_revision", ["workOrderId", "revisionNumber"])
    .index("by_idempotency", ["idempotencyKey"]),

  reopenDecisions: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    workOrderId: v.id("workOrders"),
    idempotencyKey: v.optional(v.string()),
    reason: v.string(),
    sourceIssueOrDefect: v.optional(v.string()),
    requestedBy: v.optional(v.string()),
    approvedBy: v.optional(v.string()),
    reopenScope: v.string(),
    acceptanceCriteriaImpacted: v.array(v.string()),
    invalidatedReceiptIds: v.array(v.id("verificationReceipts")),
    invalidatedApprovalIds: v.array(v.id("approvalDecisions")),
    newRequiredActions: v.array(v.string()),
    createdAt: v.number(),
    effectiveAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_work_order", ["workOrderId"])
    .index("by_idempotency", ["idempotencyKey"]),

  workOrderSupersessions: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    originalWorkOrderId: v.id("workOrders"),
    replacementWorkOrderId: v.id("workOrders"),
    idempotencyKey: v.optional(v.string()),
    reason: v.string(),
    actorType: actorType,
    actorId: v.optional(v.string()),
    unresolvedAcceptanceCriteria: v.array(v.string()),
    unresolvedApprovalTypes: v.array(v.string()),
    unresolvedVerificationReceiptIds: v.array(v.id("verificationReceipts")),
    createdAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_original", ["originalWorkOrderId"])
    .index("by_replacement", ["replacementWorkOrderId"])
    .index("by_idempotency", ["idempotencyKey"]),

  approvalDecisions: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    workOrderId: v.id("workOrders"),
    workflowRunId: v.optional(v.id("workflowRuns")),
    idempotencyKey: v.optional(v.string()),
    approvalType: v.string(),
    requestedAction: v.string(),
    riskLevel: workOrderRiskLevel,
    requestedBy: v.optional(v.string()),
    approver: v.optional(v.string()),
    status: workOrderApprovalDecisionStatus,
    decision: v.optional(workOrderApprovalDecisionAction),
    conditions: v.optional(v.array(v.string())),
    reason: v.optional(v.string()),
    supersededByApprovalDecisionId: v.optional(v.id("approvalDecisions")),
    workOrderRevisionNumber: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    expiredAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    invalidatedByRevisionId: v.optional(v.id("workOrderRevisions")),
    createdAt: v.number(),
    decidedAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  })
    .index("by_work_order", ["workOrderId"])
    .index("by_work_order_revision", ["workOrderId", "workOrderRevisionNumber"])
    .index("by_work_order_status", ["workOrderId", "status"])
    .index("by_project_status", ["projectId", "status"])
    .index("by_run", ["workflowRunId"])
    .index("by_idempotency", ["idempotencyKey"]),

  verificationReceipts: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    missionId: v.optional(v.id("missions")),
    validationAssertionId: v.optional(v.id("validationAssertions")),
    workOrderId: v.id("workOrders"),
    receiptScope: v.optional(v.union(v.literal("ACCEPTANCE_CRITERION"), v.literal("WORK_ORDER"))),
    acceptanceCriterionId: v.optional(v.string()),
    workflowRunId: v.id("workflowRuns"),
    verificationRunId: v.optional(v.id("verificationRuns")),
    idempotencyKey: v.optional(v.string()),
    verificationMethod: v.optional(v.union(
      v.literal("MANUAL"),
      v.literal("COMMAND"),
      v.literal("TEST"),
      v.literal("CHECKLIST"),
      v.literal("BROWSER")
    )),
    commandOrCheck: v.optional(v.string()),
    result: v.optional(v.string()),
    evidenceLocation: v.optional(v.string()),
    artifactReference: v.optional(v.string()),
    verifier: v.optional(v.string()),
    status: verificationReceiptStatus,
    exceptionOrWaiver: v.optional(v.string()),
    waiverApprovalDecisionId: v.optional(v.id("approvalDecisions")),
    linkedRunArtifactIds: v.optional(v.array(v.id("runArtifacts"))),
    evidenceEnvelopeIds: v.optional(v.array(v.id("evidenceEnvelopes"))),
    verdict: v.optional(verificationVerdictValidator),
    verdictReasons: v.optional(v.array(v.string())),
    checks: v.optional(v.array(verificationCheckResultValidator)),
    criterionCoverage: v.optional(v.array(criterionCoverageValidator)),
    requirementsPassed: v.optional(v.number()),
    requirementsFailed: v.optional(v.number()),
    violations: v.optional(v.array(v.string())),
    approvalRequirements: v.optional(v.array(v.string())),
    riskLevel: v.optional(workOrderRiskLevel),
    riskReasons: v.optional(v.array(v.string())),
    sourceRevision: v.optional(v.string()),
    candidateRevision: v.optional(v.string()),
    workOrderRevisionNumber: v.optional(v.number()),
    validUntil: v.optional(v.number()),
    invalidatedAt: v.optional(v.number()),
    invalidatedByRevisionId: v.optional(v.id("workOrderRevisions")),
    invalidatedByReopenDecisionId: v.optional(v.id("reopenDecisions")),
    invalidationReason: v.optional(v.string()),
    recordedAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_work_order", ["workOrderId"])
    .index("by_project", ["projectId"])
    .index("by_mission", ["missionId"])
    .index("by_work_order_criterion", ["workOrderId", "acceptanceCriterionId"])
    .index("by_run", ["workflowRunId"])
    .index("by_verification_run", ["verificationRunId"])
    .index("by_work_order_scope", ["workOrderId", "receiptScope"])
    .index("by_idempotency", ["idempotencyKey"]),

  verificationRuns: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    missionId: v.optional(v.id("missions")),
    workOrderId: v.id("workOrders"),
    workflowRunId: v.id("workflowRuns"),
    idempotencyKey: v.string(),
    engineVersion: v.string(),
    workOrderRevisionNumber: v.number(),
    sourceRevision: v.string(),
    candidateRevision: v.string(),
    status: v.literal("COMPLETED"),
    checks: v.array(verificationCheckResultValidator),
    criterionCoverage: v.array(criterionCoverageValidator),
    requirementsPassed: v.number(),
    requirementsFailed: v.number(),
    violations: v.array(v.string()),
    approvalRequirements: v.array(v.string()),
    riskLevel: workOrderRiskLevel,
    riskReasons: v.array(v.string()),
    verdict: verificationVerdictValidator,
    verdictReasons: v.array(v.string()),
    startedAt: v.number(),
    completedAt: v.number(),
    durationMs: v.number(),
    createdAt: v.number(),
  })
    .index("by_work_order", ["workOrderId"])
    .index("by_run", ["workflowRunId"])
    .index("by_work_order_created", ["workOrderId", "createdAt"])
    .index("by_idempotency", ["idempotencyKey"]),

  evidenceEnvelopes: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    missionId: v.optional(v.id("missions")),
    workOrderId: v.id("workOrders"),
    workflowRunId: v.id("workflowRuns"),
    verificationRunId: v.id("verificationRuns"),
    idempotencyKey: v.string(),
    evidenceKey: v.string(),
    checkId: v.string(),
    category: evidenceCategoryValidator,
    result: verificationCheckStatusValidator,
    summary: v.string(),
    acceptanceCriterionIds: v.array(v.string()),
    primaryCriterionId: v.optional(v.string()),
    producer: v.object({
      actorType: v.union(v.literal("SYSTEM"), v.literal("SERVICE"), v.literal("AGENT"), v.literal("HUMAN")),
      actorId: v.string(),
      role: v.string(),
      independent: v.boolean(),
    }),
    artifactIds: v.array(v.id("runArtifacts")),
    artifactReferences: v.array(v.string()),
    sourceRevision: v.string(),
    candidateRevision: v.string(),
    contentHash: v.optional(v.string()),
    provenance: v.union(v.literal("LIVE"), v.literal("SYNTHETIC"), v.literal("DEMO"), v.literal("IMPORTED"), v.literal("LEGACY")),
    recordedAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_verification_run", ["verificationRunId"])
    .index("by_work_order", ["workOrderId"])
    .index("by_run", ["workflowRunId"])
    .index("by_work_order_criterion", ["workOrderId", "primaryCriterionId"])
    .index("by_idempotency", ["idempotencyKey"]),

  runEvents: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    workOrderId: v.optional(v.id("workOrders")),
    workflowRunId: v.id("workflowRuns"),
    idempotencyKey: v.optional(v.string()),
    eventType: runEventType,
    workflowStep: v.optional(v.string()),
    sequenceNumber: v.number(),
    actor: v.optional(v.string()),
    agentId: v.optional(v.id("agents")),
    toolName: v.optional(v.string()),
    commandSummary: v.optional(v.string()),
    status: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    retryNumber: v.optional(v.number()),
    verificationReceiptId: v.optional(v.id("verificationReceipts")),
    verificationRunId: v.optional(v.id("verificationRuns")),
    evidenceEnvelopeIds: v.optional(v.array(v.id("evidenceEnvelopes"))),
    evidenceArtifactIds: v.optional(v.array(v.id("runArtifacts"))),
    errorCategory: v.optional(v.string()),
    errorSummary: v.optional(v.string()),
    metadata: v.optional(v.any()),
  })
    .index("by_project", ["projectId"])
    .index("by_run", ["workflowRunId"])
    .index("by_run_sequence", ["workflowRunId", "sequenceNumber"])
    .index("by_work_order", ["workOrderId"])
    .index("by_receipt", ["verificationReceiptId"])
    .index("by_verification_run", ["verificationRunId"])
    .index("by_idempotency", ["idempotencyKey"]),

  runArtifacts: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    missionId: v.optional(v.id("missions")),
    workOrderId: v.optional(v.id("workOrders")),
    workflowRunId: v.id("workflowRuns"),
    idempotencyKey: v.optional(v.string()),
    artifactType: runArtifactType,
    name: v.string(),
    description: v.optional(v.string()),
    repositoryPath: v.optional(v.string()),
    externalLocation: v.optional(v.string()),
    contentHash: v.optional(v.string()),
    producer: v.optional(v.string()),
    verificationReceiptId: v.optional(v.id("verificationReceipts")),
    acceptanceCriterionId: v.optional(v.string()),
    producingEventId: v.optional(v.id("runEvents")),
    retentionPolicy: v.optional(v.string()),
    sensitivity: v.optional(v.string()),
    createdAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_run", ["workflowRunId"])
    .index("by_mission", ["missionId"])
    .index("by_run_type", ["workflowRunId", "artifactType"])
    .index("by_receipt", ["verificationReceiptId"])
    .index("by_event", ["producingEventId"])
    .index("by_idempotency", ["idempotencyKey"]),

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
    configVersion: v.optional(v.number()),
    
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
    .index("by_project_name", ["projectId", "name"])
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
    
    // Human-readable identifier (e.g., "MC-042")
    identifier: v.optional(v.string()),
    
    // Goal alignment — traces this task back to a mission-level objective
    goalId: v.optional(v.id("goals")),
    
    // Core
    title: v.string(),
    description: v.optional(v.string()),
    type: taskType,
    status: taskStatus,
    // Canonical state age anchor. Optional until legacy records are classified.
    stateEnteredAt: v.optional(v.number()),
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
    // Canonical governed-delivery parent. Mission is derived through Work Order.
    workOrderId: v.optional(v.id("workOrders")),
    
    // Work artifacts
    workPlan: v.optional(v.object({
      bullets: v.array(v.string()),
      estimatedCost: v.optional(v.number()),
      estimatedDuration: v.optional(v.string()),
    })),
    // AI planning Q&A (clarifying questions and answers before work plan)
    planningQa: v.optional(v.array(v.object({
      question: v.string(),
      answer: v.string(),
    }))),
    
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
    review: v.optional(v.object({
      ownerId: v.optional(v.id("agents")),
      enteredAt: v.optional(v.number()),
      completedAt: v.optional(v.number()),
      result: v.optional(v.union(
        v.literal("APPROVED"),
        v.literal("CHANGES_REQUESTED"),
        v.literal("ESCALATED")
      )),
      reason: v.optional(v.string()),
      findings: v.optional(v.array(v.string())),
      findingsCount: v.optional(v.number()),
      resubmissionCount: v.number(),
      decidedBy: v.optional(v.string()),
      history: v.optional(v.array(v.object({
        result: v.union(
          v.literal("APPROVED"),
          v.literal("CHANGES_REQUESTED"),
          v.literal("ESCALATED")
        ),
        reason: v.optional(v.string()),
        findings: v.optional(v.array(v.string())),
        completedAt: v.number(),
        decidedBy: v.optional(v.string()),
      }))),
    })),
    
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
      blockedSince: v.number(),
      escalationAt: v.optional(v.number()),
      resolvedAt: v.optional(v.number()),
      resolution: v.optional(v.union(
        v.literal("RESOLVED"),
        v.literal("WAIVED"),
        v.literal("REPLACED")
      )),
      resolutionReason: v.optional(v.string()),
      resolvedBy: v.optional(v.string()),
    })),

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
    .index("by_identifier", ["identifier"])
    .index("by_goal", ["goalId"])
    .index("by_source", ["source"])
    .index("by_project", ["projectId"])
    .index("by_project_status", ["projectId", "status"])
    .index("by_project_status_state_entered", ["projectId", "status", "stateEnteredAt"])
    .index("by_work_order", ["workOrderId"])
    .index("by_project_work_order", ["projectId", "workOrderId"])
    .index("by_project_work_order_status", ["projectId", "workOrderId", "status"]),

  // -------------------------------------------------------------------------
  // PRD DOCUMENTS (PRD Import Pipeline)
  // -------------------------------------------------------------------------
  prdDocuments: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    title: v.string(),
    content: v.string(),
    contentHash: v.optional(v.string()),
    taskCount: v.number(),
    parsedAt: v.number(),
    createdBy: v.optional(v.string()),
    metadata: v.optional(v.any()),
  })
    .index("by_project", ["projectId"])
    .index("by_content_hash", ["contentHash"])
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
      v.literal("TASK_LINKED_TO_WORK_ORDER"),
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
    workflowRunId: v.optional(v.id("workflowRuns")),
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
    .index("by_workflow_run", ["workflowRunId"])
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
      v.literal("KILLED"),
      v.literal("QUARANTINED")
    ),
    continuousSchedulingEnabled: v.optional(v.boolean()),
    dailyBudgetUsd: v.optional(v.number()),
    perRunBudgetUsd: v.optional(v.number()),
    maxConcurrentRuns: v.optional(v.number()),
    leaseDurationMs: v.optional(v.number()),
    staleRecoveryLimit: v.optional(v.number()),
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
  // TASK RELATIONS (blocks, blocked_by, related, duplicate)
  // Richer than taskDependencies — captures semantic relationship types.
  // -------------------------------------------------------------------------
  taskRelations: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    sourceTaskId: v.id("tasks"),
    targetTaskId: v.id("tasks"),
    relationType: v.union(
      v.literal("BLOCKS"),
      v.literal("BLOCKED_BY"),
      v.literal("RELATED"),
      v.literal("DUPLICATE")
    ),
    createdBy: v.optional(v.string()),
    createdAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_source", ["sourceTaskId"])
    .index("by_target", ["targetTaskId"])
    .index("by_source_type", ["sourceTaskId", "relationType"])
    .index("by_project", ["projectId"]),

  // -------------------------------------------------------------------------
  // GOALS (Hierarchical Goal Alignment — company > team > agent > task)
  // Every task should trace back to a goal. Goals form a tree.
  // -------------------------------------------------------------------------
  goals: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.id("projects"),
    
    // Identity
    title: v.string(),
    description: v.optional(v.string()),
    
    // Hierarchy
    level: v.union(
      v.literal("COMPANY"),
      v.literal("TEAM"),
      v.literal("AGENT"),
      v.literal("TASK")
    ),
    parentGoalId: v.optional(v.id("goals")),
    
    // Ownership
    ownerAgentId: v.optional(v.id("agents")),
    ownerUserId: v.optional(v.string()),
    
    // Status
    status: v.union(
      v.literal("PLANNED"),
      v.literal("ACTIVE"),
      v.literal("ACHIEVED"),
      v.literal("CANCELLED")
    ),
    
    // Progress
    progressPct: v.optional(v.number()),
    
    // Timing
    targetDate: v.optional(v.number()),
    achievedAt: v.optional(v.number()),
    
    // Metadata
    metadata: v.optional(v.any()),
  })
    .index("by_project", ["projectId"])
    .index("by_project_level", ["projectId", "level"])
    .index("by_parent", ["parentGoalId"])
    .index("by_status", ["status"])
    .index("by_owner_agent", ["ownerAgentId"]),

  // -------------------------------------------------------------------------
  // COST EVENTS (Granular per-LLM-call cost tracking)
  // Each event is one API call. Rollups are computed at read time.
  // -------------------------------------------------------------------------
  costEvents: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    
    // Attribution
    agentId: v.id("agents"),
    taskId: v.optional(v.id("tasks")),
    goalId: v.optional(v.id("goals")),
    runId: v.optional(v.id("runs")),
    
    // Provider details
    provider: v.string(),   // "anthropic", "openai", "google", etc.
    model: v.string(),      // "claude-sonnet-4-20250514", "gpt-4o", etc.
    
    // Token usage
    inputTokens: v.number(),
    outputTokens: v.number(),
    cacheReadTokens: v.optional(v.number()),
    cacheWriteTokens: v.optional(v.number()),
    
    // Cost
    costCents: v.number(),  // Integer cents for precision
    
    // Timing
    occurredAt: v.number(),
    
    // Optional billing code for cost attribution
    billingCode: v.optional(v.string()),
    
    // Metadata
    metadata: v.optional(v.any()),
  })
    .index("by_project", ["projectId"])
    .index("by_agent", ["agentId"])
    .index("by_task", ["taskId"])
    .index("by_goal", ["goalId"])
    .index("by_run", ["runId"])
    .index("by_project_occurred", ["projectId", "occurredAt"])
    .index("by_agent_occurred", ["agentId", "occurredAt"]),

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
    operatorId: v.optional(v.id("operators")),
    
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
    .index("by_operator", ["operatorId"])
    .index("by_tenant_operator", ["tenantId", "operatorId"])
    // NOTE: systemRole is optional — queries using this index should filter
    // for defined values (e.g., .filter(q => q.neq(q.field("systemRole"), undefined)))
    // to exclude records where systemRole is not set.
    .index("by_system_role", ["systemRole"]),

  // -------------------------------------------------------------------------
  // SOFTWARE FACTORY OPERATING STRUCTURE
  // -------------------------------------------------------------------------
  scrumTeams: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    name: v.string(),
    slug: v.string(),
    purpose: v.optional(v.string()),
    leadMemberId: v.optional(v.id("orgMembers")),
    capacityPolicy: v.optional(v.object({
      maxActiveMissionsPerMember: v.number(),
      maxConcurrentRuns: v.number(),
      reviewReservePct: v.number(),
    })),
    status: v.union(v.literal("ACTIVE"), v.literal("PAUSED"), v.literal("ARCHIVED")),
    fixtureKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.optional(v.id("operators")),
    updatedBy: v.optional(v.id("operators")),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_project", ["projectId"])
    .index("by_project_slug", ["projectId", "slug"])
    .index("by_project_status", ["projectId", "status"])
    .index("by_fixture", ["fixtureKey"]),

  teamMemberships: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    teamId: v.id("scrumTeams"),
    memberId: v.id("orgMembers"),
    operatorId: v.optional(v.id("operators")),
    role: v.union(
      v.literal("LEAD"),
      v.literal("DEVELOPER"),
      v.literal("QA"),
      v.literal("PM"),
      v.literal("VIEWER"),
    ),
    activeFrom: v.number(),
    activeUntil: v.optional(v.number()),
    capacityAllocationPct: v.optional(v.number()),
    active: v.boolean(),
    fixtureKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.optional(v.id("operators")),
    updatedBy: v.optional(v.id("operators")),
  })
    .index("by_team", ["teamId"])
    .index("by_member", ["memberId"])
    .index("by_operator", ["operatorId"])
    .index("by_project", ["projectId"])
    .index("by_team_member", ["teamId", "memberId"])
    .index("by_fixture", ["fixtureKey"]),

  missionAssignments: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    missionId: v.id("missions"),
    memberId: v.id("orgMembers"),
    teamId: v.id("scrumTeams"),
    role: v.union(
      v.literal("OWNER"),
      v.literal("CONTRIBUTOR"),
      v.literal("REVIEWER"),
      v.literal("STAKEHOLDER"),
    ),
    capacityAllocationPct: v.optional(v.number()),
    activeFrom: v.number(),
    activeUntil: v.optional(v.number()),
    active: v.boolean(),
    fixtureKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.optional(v.id("operators")),
    updatedBy: v.optional(v.id("operators")),
  })
    .index("by_mission", ["missionId"])
    .index("by_member", ["memberId"])
    .index("by_team", ["teamId"])
    .index("by_project", ["projectId"])
    .index("by_mission_role", ["missionId", "role"])
    .index("by_member_active", ["memberId", "active"])
    .index("by_fixture", ["fixtureKey"]),

  attentionStates: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    correlationKey: v.string(),
    state: v.union(v.literal("OPEN"), v.literal("SNOOZED"), v.literal("RESOLVED")),
    snoozedUntil: v.optional(v.number()),
    resolutionNote: v.optional(v.string()),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("operators")),
  })
    .index("by_project", ["projectId"])
    .index("by_project_key", ["projectId", "correlationKey"])
    .index("by_project_state", ["projectId", "state"]),

  scopeEnforcementReceipts: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    workOrderId: v.optional(v.id("workOrders")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    stage: v.union(v.literal("DISPATCH"), v.literal("EXECUTOR_BINDING")),
    mode: v.union(v.literal("SHADOW"), v.literal("ENFORCED"), v.literal("LEGACY")),
    outcome: v.union(v.literal("ALLOWED"), v.literal("DENIED"), v.literal("MISMATCH")),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    codeScopeIds: v.array(v.id("repositoryCodeScopes")),
    teamId: v.optional(v.id("scrumTeams")),
    ownerMemberId: v.optional(v.id("orgMembers")),
    executionEnvironment: v.optional(v.union(
      v.literal("LOCAL"),
      v.literal("CLOUD"),
      v.literal("REMOTE"),
      v.literal("POLICY_SELECTED"),
    )),
    policyRequirements: v.optional(v.object({
      owningTeamIds: v.array(v.id("scrumTeams")),
      requiredReviewers: v.array(v.string()),
      verificationPolicies: v.array(v.string()),
      approvalPolicies: v.array(v.string()),
      requiresCrossTeamReview: v.boolean(),
    })),
    reasonCodes: v.array(v.string()),
    summary: v.string(),
    policyVersion: v.number(),
    createdAt: v.number(),
    actorId: v.optional(v.id("operators")),
  })
    .index("by_project", ["projectId"])
    .index("by_work_order", ["workOrderId"])
    .index("by_run", ["workflowRunId"])
    .index("by_project_outcome", ["projectId", "outcome"]),

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
    linkedWorkOrderId: v.optional(v.id("workOrders")),
    linkedIncidentId: v.optional(v.string()),
    
    // State
    lastMessageAt: v.optional(v.number()),
    messageCount: v.number(),
    
    metadata: v.optional(v.any()),
  })
    .index("by_project", ["projectId"])
    .index("by_linked_task", ["linkedTaskId"])
    .index("by_linked_work_order", ["linkedWorkOrderId"])
    .index("by_last_message", ["lastMessageAt"])
    .index("by_channel", ["channel"]),

  // -------------------------------------------------------------------------
  // TELEGRAPH MESSAGES (Internal + External Messaging)
  // -------------------------------------------------------------------------
  telegraphMessages: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.optional(v.id("projects")),
    threadId: v.id("telegraphThreads"),
    idempotencyKey: v.optional(v.string()),
    
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
    .index("by_idempotency", ["idempotencyKey"])
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
    topology: v.optional(v.union(v.literal("LINEAR"), v.literal("DAG"))),
    maxConcurrency: v.optional(v.number()),
    convergence: v.optional(v.object({
      maxIterations: v.number(),
      stopCondition: v.string(),
    })),
    
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
      dependsOn: v.optional(v.array(v.string())),
      kind: v.optional(v.union(
        v.literal("AGENT"),
        v.literal("REDUCE"),
        v.literal("ROUTER"),
        v.literal("VERIFY"),
        v.literal("GATE")
      )),
      inputSchema: v.optional(v.any()),
      outputSchema: v.optional(v.any()),
      modelTier: v.optional(v.union(
        v.literal("FAST"),
        v.literal("BALANCED"),
        v.literal("POWERFUL")
      )),
      isolation: v.optional(v.union(
        v.literal("SHARED"),
        v.literal("WORKTREE"),
        v.literal("READ_ONLY")
      )),
      failurePolicy: v.optional(v.union(
        v.literal("RETRY"),
        v.literal("CONTINUE"),
        v.literal("BLOCK")
      )),
      condition: v.optional(v.object({
        path: v.string(),
        operator: v.union(
          v.literal("EQ"),
          v.literal("NEQ"),
          v.literal("IN"),
          v.literal("EXISTS")
        ),
        value: v.optional(v.any()),
      })),
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
    workflowVersion: v.optional(v.number()),
    workflowSnapshot: v.optional(v.any()),
    projectId: v.optional(v.id("projects")),
    missionId: v.optional(v.id("missions")),
    missionRole: v.optional(v.union(v.literal("ORCHESTRATOR"), v.literal("WORKER"), v.literal("VALIDATOR"))),
    workOrderId: v.optional(v.id("workOrders")),
    workOrderRevisionNumber: v.optional(v.number()),
    workOrderRevisionId: v.optional(v.id("workOrderRevisions")),
    factoryDefinitionVersionId: v.optional(v.id("factoryDefinitionVersions")),
    factoryConfigurationDigest: v.optional(v.string()),
    // Immutable Factory Memory snapshot selected before execution. This is
    // explanatory context only and never participates in acceptance authority.
    factoryContextPackageId: v.optional(v.id("factoryContextPackages")),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    hostBindingId: v.optional(v.id("workspaceHostBindings")),
    policyEnvelopeId: v.optional(v.id("policyEnvelopes")),
    environmentId: v.optional(v.id("environments")),
    executorAdapter: v.optional(v.string()),
    executorVersion: v.optional(v.string()),
    branch: v.optional(v.string()),
    allowedTools: v.optional(v.array(v.string())),
    approvedCodeScopeIds: v.optional(v.array(v.id("repositoryCodeScopes"))),
    isMutating: v.optional(v.boolean()),
    executionManifest: v.optional(v.any()),
    executionManifestDigest: v.optional(v.string()),
    lease: v.optional(v.object({
      leaseId: v.string(),
      ownerId: v.string(),
      claimedAt: v.number(),
      heartbeatAt: v.number(),
      expiresAt: v.number(),
    })),
    
    // Parent task
    parentTaskId: v.optional(v.id("tasks")),
    
    // Status
    status: v.union(
      v.literal("PENDING"),
      v.literal("RUNNING"),
      v.literal("COMPLETED"),
      v.literal("FAILED"),
      v.literal("PAUSED"),
      v.literal("CANCELED")
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
        v.literal("FAILED"),
        v.literal("SKIPPED"),
        v.literal("BLOCKED")
      ),
      dependsOn: v.optional(v.array(v.string())),
      kind: v.optional(v.union(
        v.literal("AGENT"),
        v.literal("REDUCE"),
        v.literal("ROUTER"),
        v.literal("VERIFY"),
        v.literal("GATE")
      )),
      modelTier: v.optional(v.union(
        v.literal("FAST"),
        v.literal("BALANCED"),
        v.literal("POWERFUL")
      )),
      isolation: v.optional(v.union(
        v.literal("SHARED"),
        v.literal("WORKTREE"),
        v.literal("READ_ONLY")
      )),
      failurePolicy: v.optional(v.union(
        v.literal("RETRY"),
        v.literal("CONTINUE"),
        v.literal("BLOCK")
      )),
      conditionResult: v.optional(v.boolean()),
      structuredOutput: v.optional(v.any()),
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
    topology: v.optional(v.union(v.literal("LINEAR"), v.literal("DAG"))),
    maxConcurrency: v.optional(v.number()),
    
    // Initial input
    initialInput: v.string(),

    // Execution environment
    runtime: v.optional(v.string()),
    model: v.optional(v.string()),
    executionEnvironment: v.optional(v.union(
      v.literal("LOCAL"),
      v.literal("CLOUD"),
      v.literal("REMOTE"),
      v.literal("POLICY_SELECTED"),
    )),
    executorHostId: v.optional(v.string()),
    budgetUsd: v.optional(v.number()),
    spentUsd: v.optional(v.number()),
    stopCondition: v.optional(v.string()),
    scheduledWindow: v.optional(v.object({
      startsAt: v.number(),
      endsAt: v.number(),
      timezone: v.string(),
    })),
    checkpointAt: v.optional(v.number()),
    checkpointSummary: v.optional(v.string()),
    reservedCostUsd: v.optional(v.number()),
    executionCheckpoint: v.optional(v.object({
      checkpointId: v.string(),
      leaseId: v.string(),
      artifactId: v.id("runArtifacts"),
      createdAt: v.number(),
      stepIndex: v.number(),
      stepId: v.optional(v.string()),
      retryCount: v.number(),
      taskId: v.optional(v.id("tasks")),
      summary: v.string(),
    })),
    executionQuarantine: v.optional(v.object({
      code: v.string(),
      reason: v.string(),
      quarantinedAt: v.number(),
      actor: v.string(),
      staleRecoveryCount: v.number(),
    })),
    cancellationRequestedAt: v.optional(v.number()),
    cancellationRequestedBy: v.optional(v.string()),
    executionClaimId: v.optional(v.string()),
    executionClaimedBy: v.optional(v.string()),
    executionClaimedAt: v.optional(v.number()),
    executionLeaseExpiresAt: v.optional(v.number()),
    executionHeartbeatAt: v.optional(v.number()),
    executionAttemptNumber: v.optional(v.number()),
    executionStaleRecoveryCount: v.optional(v.number()),
    executionRetryOfClaimId: v.optional(v.string()),
    executionRetryReason: v.optional(v.string()),
    executionBindingDigest: v.optional(v.string()),
    executionPhase: v.optional(v.union(
      v.literal("CLAIMED"),
      v.literal("PREPARING"),
      v.literal("EXECUTING"),
      v.literal("VALIDATING"),
      v.literal("AWAITING_HUMAN_REVIEW"),
      v.literal("PUBLISHING"),
      v.literal("TERMINAL"),
    )),
    factoryContinuation: v.optional(v.object({
      status: v.union(
        v.literal("AWAITING_HUMAN_REVIEW"),
        v.literal("READY_TO_PUBLISH"),
        v.literal("PUBLICATION_AUTHORIZED"),
        v.literal("PUBLISHED"),
        v.literal("CLOSED"),
      ),
      verificationRunId: v.id("verificationRuns"),
      verificationReceiptId: v.id("verificationReceipts"),
      resolvedVerificationReceiptId: v.optional(v.id("verificationReceipts")),
      approvalDecisionId: v.optional(v.id("approvalDecisions")),
      workOrderRevisionNumber: v.number(),
      sourceRevision: v.string(),
      candidateRevision: v.string(),
      pausedAt: v.number(),
      approvedAt: v.optional(v.number()),
      closedAt: v.optional(v.number()),
      closureReason: v.optional(v.string()),
      publishedAt: v.optional(v.number()),
      publicationPermitId: v.optional(v.string()),
      publicationPermitLeaseId: v.optional(v.string()),
      publicationAuthorizedAt: v.optional(v.number()),
      publicationValidUntil: v.optional(v.number()),
    })),
    executionBaseSha: v.optional(v.string()),
    headSha: v.optional(v.string()),
    pullRequestNumber: v.optional(v.number()),
    pullRequestId: v.optional(v.string()),
    pullRequestUrl: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    escalationOwner: v.optional(v.string()),
    routingDecisionId: v.optional(v.id("modelRoutingDecisions")),
    returnHandoff: v.optional(v.object({
      summary: v.string(),
      changedArtifacts: v.array(v.string()),
      failedChecks: v.array(v.string()),
      unresolvedRisks: v.array(v.string()),
      nextDecision: v.string(),
      createdAt: v.number(),
    })),
    evidenceState: v.optional(v.union(v.literal("PASSING"), v.literal("FAILING"), v.literal("STALE"), v.literal("MISSING"), v.literal("UNKNOWN"))),
    worktree: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    humanInterventions: v.optional(v.number()),

    // Timing
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    
    // Metadata
    metadata: v.optional(v.any()),
  })
    .index("by_run_id", ["runId"])
    .index("by_workflow_id", ["workflowId"])
    .index("by_project", ["projectId"])
    .index("by_mission", ["missionId"])
    .index("by_work_order", ["workOrderId"])
    .index("by_repository_status", ["repositoryId", "status"])
    .index("by_repository_lease", ["repositoryId", "executionLeaseExpiresAt"])
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
    releaseDeploymentId: v.optional(v.id("deployments")),

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

    // Environment and check type
    environment: v.optional(v.union(
      v.literal("local"),
      v.literal("dev"),
      v.literal("staging"),
      v.literal("pilot"),
      v.literal("production")
    )),
    checkType: v.optional(v.union(
      v.literal("CODE_REVIEW"),
      v.literal("AGENT_OUTPUT"),
      v.literal("COVERAGE"),
      v.literal("SECURITY"),
      v.literal("FULL_SUITE")
    )),

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
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_environment", ["environment"])
    .index("by_project_env", ["projectId", "environment"]),

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
      v.literal("DELIVERY_GATE"),
      v.literal("AGENT_HALLUCINATION"),
      v.literal("TASK_INCOMPLETE"),
      v.literal("OUTPUT_FORMAT_ERROR"),
      v.literal("PERFORMANCE_REGRESSION"),
      v.literal("DEPENDENCY_RISK")
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
  // QC METRICS (Time-Series Quality Data)
  // -------------------------------------------------------------------------
  qcMetrics: defineTable({
    projectId: v.optional(v.id("projects")),
    environment: v.optional(v.union(
      v.literal("local"),
      v.literal("dev"),
      v.literal("staging"),
      v.literal("pilot"),
      v.literal("production")
    )),
    metricName: v.string(),
    value: v.number(),
    unit: v.string(),
    qcRunId: v.optional(v.id("qcRuns")),
    recordedAt: v.number(),
    tags: v.optional(v.any()),
  })
    .index("by_project", ["projectId"])
    .index("by_environment", ["environment"])
    .index("by_project_env", ["projectId", "environment"])
    .index("by_metric_time", ["metricName", "recordedAt"]),

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
    // Advanced scheduler primitives (OpenClaw ATC)
    runPolicy: v.optional(
      v.union(
        v.literal("standard"),
        v.literal("run_if_idle"),
        v.literal("run_if_not_run_since"),
        v.literal("run_at_least_per_period"),
        v.literal("skip_if_last_run_within")
      )
    ),
    runPolicyParams: v.optional(v.any()),
    priority: v.optional(v.number()),
    conflictGroup: v.optional(v.string()),
    lastRunDuration: v.optional(v.number()),
  })
    .index("by_job", ["jobId"])
    .index("by_project", ["projectId"])
    .index("by_enabled", ["enabled"])
    .index("by_next_run", ["nextRun"]),

  // -------------------------------------------------------------------------
  // QUOTA SNAPSHOTS (LLM fuel gauge — manual or imported usage tracking)
  // -------------------------------------------------------------------------
  quotaSnapshots: defineTable({
    provider: v.union(v.literal("anthropic"), v.literal("openai"), v.literal("google")),
    planTier: v.string(),
    usagePct: v.number(),
    resetAt: v.number(),
    tokensUsed: v.number(),
    tokensLimit: v.number(),
    recordedAt: v.number(),
  })
    .index("by_provider", ["provider"])
    .index("by_recorded_at", ["recordedAt"]),

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

  // -------------------------------------------------------------------------
  // KNOWLEDGE BASE (RAG / Semantic Search over docs)
  // -------------------------------------------------------------------------
  knowledgeChunks: defineTable({
    source: v.string(),
    title: v.string(),
    content: v.string(),
    chunkIndex: v.number(),
    embedding: v.array(v.float64()),
  })
    .index("by_source", ["source"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
    }),

  knowledgeChatHistory: defineTable({
    sessionId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    sources: v.optional(v.array(v.object({
      title: v.string(),
      source: v.string(),
      excerpt: v.string(),
    }))),
  })
    .index("by_session", ["sessionId"]),

  // -------------------------------------------------------------------------
  // GATEWAY CONNECTION (OpenClaw Studio parity: optional Gateway attach)
  // Token is never stored in Convex; it is supplied via server env (GATEWAY_TOKEN).
  // -------------------------------------------------------------------------
  gatewayConnection: defineTable({
    url: v.string(),
    updatedAt: v.number(),
    updatedBy: v.optional(v.string()),
  }).index("by_updatedAt", ["updatedAt"]),

  // -------------------------------------------------------------------------
  // ALERT RULES (user-defined thresholds for cost / tokens; evaluated by cron)
  // -------------------------------------------------------------------------
  alertRules: defineTable({
    projectId: v.optional(v.id("projects")),
    type: v.union(v.literal("daily_cost_exceeded")),
    threshold: v.number(),
    params: v.optional(v.any()),
    enabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_enabled", ["enabled"]),

  // -------------------------------------------------------------------------
  // AGENT HIRING PIPELINE (Comms > Hiring)
  // -------------------------------------------------------------------------
  agentRoleSpecs: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    slug: v.string(),
    purpose: v.string(),
    outcomes: v.array(v.string()),
    scope: v.object({
      includes: v.array(v.string()),
      excludes: v.array(v.string()),
    }),
    tooling: v.object({
      allowed_tools: v.array(v.string()),
      forbidden_tools: v.array(v.string()),
    }),
    policyEnvelope: v.object({
      autonomy_level: v.optional(v.number()),
      redlines: v.array(v.string()),
      escalation: v.optional(v.any()),
    }),
    successMetrics: v.optional(v.any()),
    communicationStyle: v.optional(v.any()),
    day1Autonomy: v.optional(v.any()),
    offerConfig: v.optional(v.any()),
    scorecard: v.optional(v.any()),
    specYaml: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_slug", ["slug"])
    .index("by_project_slug", ["projectId", "slug"]),

  hiringCandidates: defineTable({
    projectId: v.id("projects"),
    roleSpecId: v.id("agentRoleSpecs"),
    label: v.string(),
    source: v.union(
      v.literal("model_provider"),
      v.literal("template"),
      v.literal("internal")
    ),
    status: v.union(
      v.literal("draft"),
      v.literal("screening"),
      v.literal("assessed"),
      v.literal("panel"),
      v.literal("offer"),
      v.literal("no_hire")
    ),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_roleSpec", ["roleSpecId"])
    .index("by_project_roleSpec", ["projectId", "roleSpecId"]),

  screenReports: defineTable({
    candidateId: v.id("hiringCandidates"),
    roleSpecId: v.id("agentRoleSpecs"),
    pass: v.boolean(),
    scores: v.any(),
    disqualifiers: v.array(v.string()),
    rawResponse: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_candidate", ["candidateId"])
    .index("by_roleSpec", ["roleSpecId"]),

  assessmentPackets: defineTable({
    candidateId: v.id("hiringCandidates"),
    roleSpecId: v.id("agentRoleSpecs"),
    assessments: v.array(v.any()),
    overallScores: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_candidate", ["candidateId"])
    .index("by_roleSpec", ["roleSpecId"]),

  panelPackets: defineTable({
    candidateId: v.id("hiringCandidates"),
    roleSpecId: v.id("agentRoleSpecs"),
    panelNotes: v.any(),
    hireDecisionDraft: v.union(
      v.literal("strong_hire"),
      v.literal("hire"),
      v.literal("no_hire")
    ),
    createdAt: v.number(),
  })
    .index("by_candidate", ["candidateId"])
    .index("by_roleSpec", ["roleSpecId"]),

  decisionRecords: defineTable({
    candidateId: v.id("hiringCandidates"),
    roleSpecId: v.id("agentRoleSpecs"),
    decision: v.union(
      v.literal("strong_hire"),
      v.literal("hire"),
      v.literal("no_hire")
    ),
    autonomyLevel: v.union(v.literal(1), v.literal(2), v.literal(3)),
    offerConfigSnapshot: v.optional(v.any()),
    decidedBy: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_candidate", ["candidateId"])
    .index("by_roleSpec", ["roleSpecId"]),

  // -------------------------------------------------------------------------
  // FEATURE FLAGS
  // -------------------------------------------------------------------------
  // Runtime toggles gating incomplete Software Factory subsystems.
  // Resolution precedence: project-scoped row > global row > registered
  // default (convex/lib/flags.ts). Changes audited via `activities`.
  featureFlags: defineTable({
    key: v.string(),
    enabled: v.boolean(),
    description: v.optional(v.string()),
    // Project-scoped override; row with no projectId is the global value
    projectId: v.optional(v.id("projects")),
    updatedBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_project_key", ["projectId", "key"]),

  // -------------------------------------------------------------------------
  // FACTORY MEMORY & CONTEXT INTELLIGENCE
  // -------------------------------------------------------------------------
  // These tables are rebuildable, provenance-backed projections over
  // authoritative Mission Control, repository, GitHub, evidence, trace, eval,
  // incident, and architecture records. They never become acceptance truth.
  factoryMemoryDocuments: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    sourceType: factoryMemorySourceTypeValidator,
    sourceId: v.string(),
    workOrderId: v.optional(v.id("workOrders")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    factoryDefinitionVersionId: v.optional(v.id("factoryDefinitionVersions")),
    title: v.optional(v.string()),
    content: v.string(),
    metadata: v.optional(v.any()),
    contentHash: v.string(),
    sourceRevision: v.optional(v.string()),
    createdAt: v.number(),
    indexedAt: v.number(),
    invalidatedAt: v.optional(v.number()),
    provenance: factoryMemoryProvenanceValidator,
  })
    .index("by_project", ["projectId"])
    .index("by_project_indexed", ["projectId", "indexedAt"])
    .index("by_project_repository", ["projectId", "repositoryId"])
    .index("by_project_repository_source", [
      "projectId",
      "repositoryId",
      "sourceType",
      "sourceId",
    ])
    .index("by_project_repository_source_revision", [
      "projectId",
      "repositoryId",
      "sourceType",
      "sourceId",
      "sourceRevision",
    ])
    .index("by_work_order", ["workOrderId"])
    .index("by_workflow_run", ["workflowRunId"])
    .index("by_factory_version", ["factoryDefinitionVersionId"])
    .index("by_content_hash", ["contentHash"]),

  factoryMemoryChunks: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    documentId: v.id("factoryMemoryDocuments"),
    sourceType: factoryMemorySourceTypeValidator,
    sourceId: v.string(),
    workOrderId: v.optional(v.id("workOrders")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    factoryDefinitionVersionId: v.optional(v.id("factoryDefinitionVersions")),
    title: v.optional(v.string()),
    content: v.string(),
    searchText: v.string(),
    chunkIndex: v.number(),
    estimatedTokens: v.number(),
    contentHash: v.string(),
    metadata: v.optional(v.any()),
    provenance: factoryMemoryProvenanceValidator,
    invalidatedAt: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_project_source", ["projectId", "sourceType"])
    .index("by_project_repository", ["projectId", "repositoryId"])
    .index("by_document", ["documentId"])
    .index("by_work_order", ["workOrderId"])
    .index("by_workflow_run", ["workflowRunId"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["projectId", "repositoryId", "sourceType"],
    }),

  factoryMemoryIngestionRuns: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    status: v.union(
      v.literal("RUNNING"),
      v.literal("SUCCEEDED"),
      v.literal("DEGRADED"),
      v.literal("FAILED"),
    ),
    sourceTypes: v.array(factoryMemorySourceTypeValidator),
    indexedDocuments: v.number(),
    indexedChunks: v.number(),
    redactionCount: v.number(),
    error: v.optional(v.string()),
    actorId: v.string(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_project_started", ["projectId", "startedAt"])
    .index("by_project_repository_started", [
      "projectId",
      "repositoryId",
      "startedAt",
    ])
    .index("by_project_status", ["projectId", "status"]),

  factoryEntities: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    entityType: factoryEntityTypeValidator,
    key: v.string(),
    label: v.string(),
    aliases: v.array(v.string()),
    metadata: v.optional(v.any()),
    provenance: v.array(factoryMemoryProvenanceValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_repository", ["projectId", "repositoryId"])
    .index("by_project_repository_key", ["projectId", "repositoryId", "key"])
    .index("by_project_type", ["projectId", "entityType"])
    .index("by_project_updated", ["projectId", "updatedAt"])
    .index("by_project_repository_type", [
      "projectId",
      "repositoryId",
      "entityType",
    ])
    .index("by_project_repository_updated", [
      "projectId",
      "repositoryId",
      "updatedAt",
    ]),

  factoryRelationships: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    sourceType: factoryEntityTypeValidator,
    sourceId: v.id("factoryEntities"),
    relation: factoryRelationValidator,
    targetType: factoryEntityTypeValidator,
    targetId: v.id("factoryEntities"),
    provenance: v.array(factoryMemoryProvenanceValidator),
    confidence: v.optional(v.number()),
    derivation: factoryKnowledgeDerivationValidator,
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_project_repository", ["projectId", "repositoryId"])
    .index("by_project_source", ["projectId", "sourceId"])
    .index("by_project_target", ["projectId", "targetId"])
    .index("by_project_relation", ["projectId", "relation"])
    .index("by_source_relation_target", ["sourceId", "relation", "targetId"]),

  factoryRetrievalPlans: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    workOrderId: v.id("workOrders"),
    workflowRunId: v.optional(v.id("workflowRuns")),
    factoryDefinitionVersionId: v.optional(v.id("factoryDefinitionVersions")),
    objective: v.string(),
    purpose: factoryPurposeValidator,
    steps: v.array(
      v.object({
        strategy: factoryRetrievalStrategyValidator,
        query: v.optional(v.string()),
        entity: v.optional(
          v.object({
            type: factoryEntityTypeValidator,
            id: v.id("factoryEntities"),
          }),
        ),
        sourceTypes: v.optional(v.array(factoryMemorySourceTypeValidator)),
        reason: v.string(),
      }),
    ),
    budget: factoryContextBudgetValidator,
    requiredSourceTypes: v.array(factoryMemorySourceTypeValidator),
    maxIterations: v.number(),
    sufficiency: v.optional(v.any()),
    createdAt: v.number(),
    createdBy: v.string(),
  })
    .index("by_project", ["projectId"])
    .index("by_work_order", ["workOrderId"])
    .index("by_workflow_run", ["workflowRunId"]),

  factoryContextPackages: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    repositoryId: v.optional(v.id("workspaceRepositories")),
    workOrderId: v.id("workOrders"),
    workflowRunId: v.optional(v.id("workflowRuns")),
    factoryDefinitionVersionId: v.optional(v.id("factoryDefinitionVersions")),
    purpose: factoryPurposeValidator,
    generatedAt: v.number(),
    objective: v.string(),
    items: v.array(factoryContextItemValidator),
    estimatedTokens: v.number(),
    budget: factoryContextBudgetValidator,
    retrievalPlanId: v.optional(v.id("factoryRetrievalPlans")),
    retrievalStrategies: v.array(factoryRetrievalStrategyValidator),
    contentHash: v.string(),
    frozen: v.literal(true),
    metadata: v.optional(v.any()),
    createdBy: v.string(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_repository", ["projectId", "repositoryId"])
    .index("by_project_generated", ["projectId", "generatedAt"])
    .index("by_work_order", ["workOrderId"])
    .index("by_workflow_run", ["workflowRunId"])
    .index("by_content_hash", ["contentHash"]),

  factoryVerificationPlans: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    workOrderId: v.id("workOrders"),
    contextPackageId: v.id("factoryContextPackages"),
    checks: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        rationale: v.string(),
        acceptanceCriterionIds: v.array(v.string()),
        influencedBy: v.array(
          v.object({
            sourceType: factoryMemorySourceTypeValidator,
            sourceId: v.string(),
            revision: v.optional(v.string()),
          }),
        ),
        evidenceRequired: v.literal(true),
      }),
    ),
    advisoryOnly: v.literal(true),
    createdAt: v.number(),
    createdBy: v.string(),
  })
    .index("by_project", ["projectId"])
    .index("by_work_order", ["workOrderId"])
    .index("by_context_package", ["contextPackageId"]),

  factoryRetrievalObservations: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    workflowRunId: v.optional(v.id("workflowRuns")),
    retrievalPlanId: v.optional(v.id("factoryRetrievalPlans")),
    contextPackageId: v.optional(v.id("factoryContextPackages")),
    observationType: v.union(
      v.literal("context.plan"),
      v.literal("memory.search"),
      v.literal("code.search"),
      v.literal("graph.traversal"),
      v.literal("context.rank"),
      v.literal("context.assemble"),
      v.literal("context.sufficiency"),
    ),
    strategy: v.optional(factoryRetrievalStrategyValidator),
    query: v.optional(v.string()),
    resultCount: v.optional(v.number()),
    selectedCount: v.optional(v.number()),
    rejectedCount: v.optional(v.number()),
    estimatedTokens: v.optional(v.number()),
    latencyMs: v.number(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_time", ["projectId", "createdAt"])
    .index("by_workflow_run", ["workflowRunId"])
    .index("by_context_package", ["contextPackageId"]),

  factoryContextEvaluations: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    contextPackageId: v.id("factoryContextPackages"),
    workflowRunId: v.optional(v.id("workflowRuns")),
    key: v.string(),
    score: v.number(),
    passed: v.boolean(),
    reason: v.string(),
    sampleSize: v.number(),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_context_package", ["contextPackageId"])
    .index("by_project_key", ["projectId", "key"]),

  // -------------------------------------------------------------------------
  // CONTEXT REGISTRY: PACKAGES (Software Factory Epic 1)
  // -------------------------------------------------------------------------
  // Context package identity. Status here is the package lifecycle
  // (DRAFT/ACTIVE/DEPRECATED); per-version status lives on
  // contextPackageVersions. Health state arrives in a later PR.
  // All writes are gated behind the `context.registry` feature flag
  // (convex/context/packages.ts).
  contextPackages: defineTable({
    name: v.string(),
    // Unique identity, format "scope/name" (see lib/contextPackages.ts)
    slug: v.string(),
    displayName: v.optional(v.string()),
    description: v.string(),
    type: contextPackageType,
    status: contextPackageStatus,
    owner: v.string(),
    tags: v.optional(v.array(v.string())),
    riskLevel: riskLevel,
    projectId: v.optional(v.id("projects")),
    tenantId: v.optional(v.id("tenants")),
    // Latest PUBLISHED version, flipped by publishVersion
    currentVersionId: v.optional(v.id("contextPackageVersions")),
    // Set when status becomes DEPRECATED and a successor exists
    replacementPackageId: v.optional(v.id("contextPackages")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_type", ["type"])
    .index("by_status", ["status"])
    .index("by_owner", ["owner"]),

  // -------------------------------------------------------------------------
  // CONTEXT REGISTRY: PACKAGE VERSIONS (Software Factory Epic 1)
  // -------------------------------------------------------------------------
  // Immutable after publish: once status is PUBLISHED the row is never
  // patched again except the DEPRECATED lifecycle transition
  // (status/deprecatedAt only). Content lives inline for small packages or
  // in _storage for large ones; contentHash (sha256:<hex64>) is required at
  // publish time and computed by the caller (CLI/client) — see
  // lib/contextPackages.ts module docstring.
  contextPackageVersions: defineTable({
    packageId: v.id("contextPackages"),
    // Semver "x.y.z", strictly increasing per package
    version: v.string(),
    status: contextVersionStatus,
    // Required at publish; format sha256:<64 lowercase hex chars>
    contentHash: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    // Inline body for small packages (< ~900KB)
    inlineContent: v.optional(v.string()),
    manifestVersion: v.string(),
    // Provenance
    sourceRepo: v.optional(v.string()),
    sourcePath: v.optional(v.string()),
    sourceCommitSha: v.optional(v.string()),
    // Compatibility + declared capabilities
    compatibility: v.optional(v.any()),
    capabilities: v.optional(v.array(v.string())),
    // Structured deterministic-execution contract used by the governed
    // skill-to-Automation conversion flow.
    automationProfile: v.optional(v.any()),
    dependencies: v.optional(
      v.array(v.object({ slug: v.string(), range: v.string() }))
    ),
    // Scores (populated by eval/security PRs)
    qualityScore: v.optional(v.number()),
    // Per-axis review breakdown (0-100 each) from the skill review linter
    reviewAxes: v.optional(
      v.object({
        validation: v.number(),
        implementation: v.number(),
        activation: v.number(),
      })
    ),
    impactScore: v.optional(v.number()),
    securityStatus: v.optional(contextSecurityStatus),
    // Lifecycle timestamps
    approvedBy: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    publishedAt: v.optional(v.number()),
    deprecatedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_package", ["packageId"])
    .index("by_package_version", ["packageId", "version"])
    .index("by_content_hash", ["contentHash"])
    .index("by_status", ["status"]),

  // -------------------------------------------------------------------------
  // CONTEXT REGISTRY: MANIFESTS (Software Factory Epic 3)
  // -------------------------------------------------------------------------
  // Per-repository context manifest (mc-context.json contents). Keyed by
  // repoSlug ("owner/repo") rather than a repositories table reference —
  // the repositories table arrives in a later PR. manifestJson is the raw
  // serialized manifest; parse with @mission-control/context-tools.
  // Writes are gated behind the `context.registry` feature flag
  // (convex/context/manifests.ts) and audited via `activities`.
  contextManifests: defineTable({
    // Repository identity, format "owner/repo"
    repoSlug: v.string(),
    // Raw mc-context.json body (validated client-side by context-tools)
    manifestJson: v.string(),
    schemaVersion: v.string(),
    updatedBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_repo", ["repoSlug"]),

  // -------------------------------------------------------------------------
  // CONTEXT REGISTRY: LOCKS (Software Factory Epic 3)
  // -------------------------------------------------------------------------
  // Latest resolved lock (mc-context.lock contents) per repository. One row
  // per repoSlug, upserted on each `mc context lock`. manifestHash is the
  // sha256 of the manifest JSON the lock was resolved from, so drift between
  // the stored manifest and lock is detectable.
  contextLocks: defineTable({
    repoSlug: v.string(),
    // Raw mc-context.lock body (validated client-side by context-tools)
    lockJson: v.string(),
    // sha256:<64 hex> of the manifest JSON this lock was resolved from
    manifestHash: v.string(),
    resolvedCount: v.number(),
    createdAt: v.number(),
  }).index("by_repo", ["repoSlug"]),

  // -------------------------------------------------------------------------
  // CONTEXT REGISTRY: INSTALLATIONS (Software Factory Epic 3)
  // -------------------------------------------------------------------------
  // What each repository actually has installed, one row per
  // (repoSlug, packageSlug). Reconciled by syncInstallations: rows are
  // upserted for present entries and deleted for absent ones. State tracks
  // installation health: INSTALLED (matches lock), STALE (newer version
  // available), MISSING (locked but not present), INCOMPATIBLE (fails
  // compatibility checks).
  contextInstallations: defineTable({
    repoSlug: v.string(),
    packageSlug: v.string(),
    // Registry version row, when the installed version exists in the registry
    versionId: v.optional(v.id("contextPackageVersions")),
    version: v.string(),
    contentHash: v.string(),
    state: v.union(
      v.literal("INSTALLED"),
      v.literal("STALE"),
      v.literal("MISSING"),
      v.literal("INCOMPATIBLE")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_repo", ["repoSlug"])
    .index("by_repo_package", ["repoSlug", "packageSlug"])
    .index("by_package", ["packageSlug"]),

  // Immutable evidence that an executor received the exact packages pinned by
  // a repository lock. Package content is returned by activation, not stored.
  contextActivationReceipts: defineTable({
    repoSlug: v.string(),
    workflowRunId: v.id("contextWorkflowRuns"),
    lockManifestHash: v.string(),
    packages: v.array(v.object({
      packageSlug: v.string(),
      packageId: v.id("contextPackages"),
      versionId: v.id("contextPackageVersions"),
      version: v.string(),
      contentHash: v.string(),
    })),
    idempotencyKey: v.string(),
    actorId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_workflow_run", ["workflowRunId"])
    .index("by_idempotency", ["idempotencyKey"]),

  // Equivalent immutable activation evidence for the Work Order execution
  // runtime used by Pi.
  workflowContextActivationReceipts: defineTable({
    repoSlug: v.string(),
    workflowRunId: v.id("workflowRuns"),
    lockManifestHash: v.string(),
    packages: v.array(v.object({
      packageSlug: v.string(),
      packageId: v.id("contextPackages"),
      versionId: v.id("contextPackageVersions"),
      version: v.string(),
      contentHash: v.string(),
    })),
    idempotencyKey: v.string(),
    actorId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_workflow_run", ["workflowRunId"])
    .index("by_idempotency", ["idempotencyKey"]),

  // -------------------------------------------------------------------------
  // CONTEXT REGISTRY: EVAL SCENARIOS (Software Factory Epic 4)
  // -------------------------------------------------------------------------
  contextEvalScenarios: defineTable({
    packageId: v.id("contextPackages"),
    name: v.string(),
    description: v.string(),
    taskPrompt: v.string(),
    criteria: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        weight: v.number(),
      })
    ),
    active: v.boolean(),
    projectId: v.optional(v.id("projects")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_package", ["packageId"])
    .index("by_package_active", ["packageId", "active"]),

  // -------------------------------------------------------------------------
  // CONTEXT REGISTRY: EVAL RUNS (Software Factory Epic 4)
  // -------------------------------------------------------------------------
  contextEvalRuns: defineTable({
    packageId: v.id("contextPackages"),
    versionId: v.id("contextPackageVersions"),
    releaseDeploymentId: v.optional(v.id("deployments")),
    status: contextEvalRunStatus,
    scenarioCount: v.number(),
    completedScenarios: v.number(),
    baselineScore: v.optional(v.number()),
    candidateScore: v.optional(v.number()),
    impactScore: v.optional(v.number()),
    impactDelta: v.optional(v.number()),
    results: v.optional(
      v.array(
        v.object({
          scenarioId: v.id("contextEvalScenarios"),
          scenarioName: v.string(),
          baselineScore: v.number(),
          candidateScore: v.number(),
          criteriaPassed: v.number(),
          criteriaTotal: v.number(),
          criterionResults: v.optional(
            v.array(
              v.object({
                criterionId: v.string(),
                label: v.string(),
                baselinePct: v.number(),
                withContextPct: v.number(),
              })
            )
          ),
        })
      )
    ),
    idempotencyKey: v.optional(v.string()),
    actorId: v.optional(v.string()),
    projectId: v.optional(v.id("projects")),
    errorMessage: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_package", ["packageId"])
    .index("by_version", ["versionId"])
    .index("by_status", ["status"])
    .index("by_idempotency", ["idempotencyKey"]),

  // -------------------------------------------------------------------------
  // OPERATOR PERSONA EVALUATIONS
  // Synthetic operator forecasts are isolated from production decisions.
  // -------------------------------------------------------------------------
  operatorPersonaProfiles: defineTable({
    projectId: v.id("projects"),
    slug: v.string(),
    version: v.number(),
    name: v.string(),
    role: v.string(),
    responsibility: v.string(),
    successCriteria: v.array(v.string()),
    pressures: v.array(v.string()),
    may: v.array(v.string()),
    mayNot: v.array(v.string()),
    decisionRules: v.array(v.string()),
    evidenceThresholds: v.array(v.string()),
    fixedWorldRules: v.array(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_slug", ["projectId", "slug"]),

  operatorEvalScenarios: defineTable({
    projectId: v.id("projects"),
    personaId: v.id("operatorPersonaProfiles"),
    slug: v.string(),
    name: v.string(),
    category: v.string(),
    description: v.string(),
    fixedContext: v.any(),
    taskPrompt: v.string(),
    rubric: v.any(),
    variants: v.array(v.object({
      id: v.string(),
      kind: v.union(v.literal("REORDER"), v.literal("REWORD"), v.literal("MISSING_EVIDENCE"), v.literal("ADVERSARIAL")),
      description: v.string(),
    })),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_persona", ["personaId"])
    .index("by_project_slug", ["projectId", "slug"]),

  operatorEvalRuns: defineTable({
    projectId: v.id("projects"),
    personaId: v.id("operatorPersonaProfiles"),
    mode: v.union(v.literal("PROXY"), v.literal("MODEL"), v.literal("HUMAN")),
    status: v.union(v.literal("PENDING"), v.literal("RUNNING"), v.literal("COMPLETED"), v.literal("FAILED"), v.literal("CANCELED")),
    scenarioCount: v.number(),
    completedScenarios: v.number(),
    overallScore: v.optional(v.number()),
    dimensionScores: v.optional(v.any()),
    durabilityScore: v.optional(v.number()),
    unsupportedAssumptionCount: v.optional(v.number()),
    results: v.optional(v.array(v.any())),
    humanObservationCount: v.number(),
    idempotencyKey: v.optional(v.string()),
    actorId: v.optional(v.string()),
    modelId: v.optional(v.string()),
    runnerVersion: v.optional(v.string()),
    caveat: v.string(),
    errorMessage: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_persona", ["personaId"])
    .index("by_project_status", ["projectId", "status"])
    .index("by_idempotency", ["idempotencyKey"]),

  operatorHumanObservations: defineTable({
    projectId: v.id("projects"),
    personaId: v.id("operatorPersonaProfiles"),
    scenarioId: v.id("operatorEvalScenarios"),
    sessionKey: v.string(),
    operatorRef: v.string(),
    decision: v.string(),
    evidenceRequired: v.array(v.string()),
    assumptions: v.array(v.string()),
    notes: v.optional(v.string()),
    recordedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_persona", ["personaId"])
    .index("by_scenario", ["scenarioId"])
    .index("by_session", ["sessionKey"]),

  // -------------------------------------------------------------------------
  // DURABLE MEMORY + EXECUTION EVIDENCE
  // -------------------------------------------------------------------------
  memoryEpisodes: defineTable({
    projectId: v.optional(v.id("projects")),
    runId: v.id("runs"),
    agentId: v.id("agents"),
    taskId: v.optional(v.id("tasks")),
    status: v.union(v.literal("COMPLETED"), v.literal("FAILED")),
    summary: v.string(),
    source: v.literal("run-completion"),
    createdAt: v.number(),
    consolidatedAt: v.optional(v.number()),
  })
    .index("by_run", ["runId"])
    .index("by_project_consolidated", ["projectId", "consolidatedAt"]),

  executionTraces: defineTable({
    projectId: v.optional(v.id("projects")),
    runId: v.id("runs"),
    status: v.union(v.literal("COMPLETED"), v.literal("FAILED")),
    model: v.string(),
    durationMs: v.number(),
    costUsd: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    error: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_project", ["projectId"]),

  memoryConsolidations: defineTable({
    projectId: v.optional(v.id("projects")),
    episodeIds: v.array(v.id("memoryEpisodes")),
    knowledgeNodeId: v.id("knowledgeGraphNodes"),
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),

  // -------------------------------------------------------------------------
  // RESEARCH SOURCE REGISTRY (governed source authority; fetching stays off)
  // -------------------------------------------------------------------------
  researchSources: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    kind: v.union(
      v.literal("X_USER"),
      v.literal("YOUTUBE_CHANNEL"),
      v.literal("WEBSITE"),
      v.literal("RSS_ATOM")
    ),
    locator: v.string(),
    canonicalProviderId: v.optional(v.string()),
    canonicalUrl: v.optional(v.string()),
    displayName: v.string(),
    state: v.union(
      v.literal("DRAFT"),
      v.literal("VERIFIED"),
      v.literal("ACTIVE"),
      v.literal("PAUSED"),
      v.literal("DEGRADED"),
      v.literal("REVOKED"),
      v.literal("RETIRED")
    ),
    version: v.number(),
    ownerId: v.string(),
    adapter: v.object({
      name: v.string(),
      version: v.string(),
      authenticationMode: v.union(
        v.literal("NONE"),
        v.literal("API_KEY"),
        v.literal("OAUTH")
      ),
    }),
    schedule: v.object({
      cadence: v.union(
        v.literal("MANUAL"),
        v.literal("HOURLY"),
        v.literal("DAILY"),
        v.literal("WEEKLY")
      ),
      timezone: v.string(),
    }),
    freshnessTargetMinutes: v.number(),
    maxItemsPerRun: v.number(),
    monthlyCostCeilingUsd: v.number(),
    retentionDays: v.number(),
    allowedContentClasses: v.array(v.string()),
    exclusions: v.array(v.string()),
    providerCursor: v.optional(v.string()),
    etag: v.optional(v.string()),
    lastModified: v.optional(v.string()),
    cursorState: v.optional(v.object({
      providerCursor: v.optional(v.string()),
      etag: v.optional(v.string()),
      lastModified: v.optional(v.string()),
      knownItems: v.array(v.object({
        providerItemId: v.string(),
        contentHash: v.string(),
      })),
      checkpointedAt: v.number(),
      workflowRunId: v.id("workflowRuns"),
    })),
    lastSuccessfulRunAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    nextRetryAt: v.optional(v.number()),
    consecutiveFailureCount: v.number(),
    validationStatus: v.union(
      v.literal("PENDING"),
      v.literal("PASSED"),
      v.literal("FAILED"),
      v.literal("PROVIDER_RESOLUTION_REQUIRED")
    ),
    validationMessage: v.optional(v.string()),
    validatedAt: v.optional(v.number()),
    policyReviewState: v.union(
      v.literal("DRAFT"),
      v.literal("ACKNOWLEDGED"),
      v.literal("APPROVED"),
      v.literal("REVIEW_REQUIRED")
    ),
    policyVersion: v.string(),
    approvedBy: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    deletionRequestedAt: v.optional(v.number()),
    deletionRequestedBy: v.optional(v.string()),
    idempotencyKey: v.string(),
    createdBy: v.string(),
    updatedBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_state", ["projectId", "state"])
    .index("by_project_kind", ["projectId", "kind"])
    .index("by_project_locator", ["projectId", "locator"])
    .index("by_canonical_identity", ["projectId", "kind", "canonicalProviderId"])
    .index("by_next_retry", ["state", "nextRetryAt"])
    .index("by_idempotency", ["idempotencyKey"]),

  researchSourceEvents: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    sourceId: v.id("researchSources"),
    eventType: v.union(
      v.literal("DRAFT_CREATED"),
      v.literal("VALIDATION_PASSED"),
      v.literal("VALIDATION_FAILED"),
      v.literal("POLICY_ACKNOWLEDGED"),
      v.literal("ACTIVATED"),
      v.literal("PAUSED"),
      v.literal("RESUMED"),
      v.literal("DEGRADED"),
      v.literal("REVOKED"),
      v.literal("RETIRED"),
      v.literal("CREDENTIAL_FAILED"),
      v.literal("POLICY_DRIFT"),
      v.literal("DELETION_REQUESTED")
    ),
    actorId: v.string(),
    reason: v.string(),
    fromState: v.optional(v.string()),
    toState: v.optional(v.string()),
    sourceVersion: v.number(),
    policyVersion: v.string(),
    metadata: v.optional(v.any()),
    idempotencyKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_source", ["sourceId"])
    .index("by_project", ["projectId"])
    .index("by_project_time", ["projectId", "createdAt"])
    .index("by_event_type", ["projectId", "eventType"])
    .index("by_idempotency", ["idempotencyKey"]),

  researchSourceRuns: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    sourceId: v.id("researchSources"),
    workOrderId: v.id("workOrders"),
    workflowRunId: v.id("workflowRuns"),
    runArtifactId: v.optional(v.id("runArtifacts")),
    verificationReceiptId: v.optional(v.id("verificationReceipts")),
    observationIds: v.array(v.id("researchObservations")),
    trigger: v.literal("MANUAL"),
    status: v.union(
      v.literal("RUNNING"),
      v.literal("AWAITING_VERIFICATION"),
      v.literal("VERIFIED"),
      v.literal("FAILED")
    ),
    sourceVersion: v.number(),
    adapterName: v.string(),
    adapterVersion: v.string(),
    cursorBefore: v.object({
      providerCursor: v.optional(v.string()),
      etag: v.optional(v.string()),
      lastModified: v.optional(v.string()),
      knownItems: v.array(v.object({
        providerItemId: v.string(),
        contentHash: v.string(),
      })),
    }),
    cursorAfter: v.optional(v.object({
      providerCursor: v.optional(v.string()),
      etag: v.optional(v.string()),
      lastModified: v.optional(v.string()),
      knownItems: v.array(v.object({
        providerItemId: v.string(),
        contentHash: v.string(),
      })),
    })),
    lease: v.optional(v.object({
      leaseId: v.string(),
      ownerId: v.string(),
      claimedAt: v.number(),
      expiresAt: v.number(),
    })),
    receipt: v.optional(v.object({
      finalUrl: v.string(),
      statusCode: v.number(),
      requestCount: v.number(),
      bytesRead: v.number(),
      elapsedMs: v.number(),
      itemCount: v.number(),
      duplicateCount: v.number(),
      changedItemCount: v.number(),
      notModified: v.boolean(),
      etag: v.optional(v.string()),
      lastModified: v.optional(v.string()),
    })),
    artifactHash: v.optional(v.string()),
    discoveredItemCount: v.number(),
    insertedObservationCount: v.number(),
    duplicateObservationCount: v.number(),
    quarantinedObservationCount: v.number(),
    attemptCount: v.number(),
    requestedBy: v.string(),
    failureCode: v.optional(v.string()),
    failureMessage: v.optional(v.string()),
    retryable: v.optional(v.boolean()),
    nextRetryAt: v.optional(v.number()),
    idempotencyKey: v.string(),
    startedAt: v.number(),
    committedAt: v.optional(v.number()),
    verifiedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_status", ["projectId", "status"])
    .index("by_source", ["sourceId"])
    .index("by_source_status", ["sourceId", "status"])
    .index("by_workflow_run", ["workflowRunId"])
    .index("by_work_order", ["workOrderId"])
    .index("by_idempotency", ["idempotencyKey"]),

  researchObservations: defineTable({
    tenantId: v.id("tenants"),
    projectId: v.id("projects"),
    sourceId: v.id("researchSources"),
    workflowRunId: v.id("workflowRuns"),
    runArtifactId: v.id("runArtifacts"),
    providerItemId: v.string(),
    canonicalUrl: v.string(),
    authorProviderId: v.optional(v.string()),
    authorName: v.optional(v.string()),
    title: v.optional(v.string()),
    normalizedExcerpt: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    retrievedAt: v.number(),
    state: v.union(
      v.literal("ACTIVE"),
      v.literal("DELETED"),
      v.literal("SUPERSEDED")
    ),
    supersedesObservationId: v.optional(v.id("researchObservations")),
    contentHash: v.string(),
    adapterVersion: v.string(),
    language: v.optional(v.string()),
    contentType: v.string(),
    trustClassification: v.union(
      v.literal("PRIMARY"),
      v.literal("OFFICIAL"),
      v.literal("VENDOR"),
      v.literal("COMMUNITY"),
      v.literal("UNKNOWN")
    ),
    safetyScanStatus: v.union(
      v.literal("PENDING"),
      v.literal("PASSED"),
      v.literal("QUARANTINED"),
      v.literal("FAILED")
    ),
    detectedInstructionLikeContent: v.boolean(),
    quarantineReason: v.optional(v.string()),
    extractionStatus: v.union(
      v.literal("PENDING"),
      v.literal("COMPLETE"),
      v.literal("FAILED")
    ),
    citedClaimIds: v.array(v.string()),
    verificationDecision: v.union(
      v.literal("PENDING"),
      v.literal("ACCEPTED"),
      v.literal("REJECTED")
    ),
    retentionDays: v.number(),
    sensitivity: v.string(),
    rightsTermsReference: v.string(),
    purgeAt: v.number(),
    idempotencyKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_source", ["sourceId"])
    .index("by_source_provider_item", ["sourceId", "providerItemId"])
    .index("by_source_content_hash", ["sourceId", "contentHash"])
    .index("by_workflow_run", ["workflowRunId"])
    .index("by_artifact", ["runArtifactId"])
    .index("by_purge_at", ["purgeAt"])
    .index("by_idempotency", ["idempotencyKey"]),

  // -------------------------------------------------------------------------
  // LOOP ENGINEERING (bounded research -> implementation -> learning cycles)
  // -------------------------------------------------------------------------
  loopEngineeringCycles: defineTable({
    projectId: v.id("projects"),
    parentCycleId: v.optional(v.id("loopEngineeringCycles")),
    nextCycleId: v.optional(v.id("loopEngineeringCycles")),
    idempotencyKey: v.string(),
    iteration: v.number(),
    objective: v.string(),
    hypothesis: v.optional(v.string()),
    researchBrief: v.optional(v.object({
      question: v.string(),
      scope: v.string(),
      exclusions: v.array(v.string()),
      freshnessWindow: v.string(),
      preferredSourceTypes: v.array(v.string()),
      requiredOutput: v.string(),
      approvalPolicy: v.string(),
    })),
    stopCondition: v.string(),
    maxIterations: v.number(),
    phase: v.union(
      v.literal("RESEARCH"),
      v.literal("VERIFY"),
      v.literal("RECOMMEND"),
      v.literal("AWAITING_APPROVAL"),
      v.literal("IMPLEMENT"),
      v.literal("VALIDATE"),
      v.literal("MEASURE"),
      v.literal("READY_FOR_NEXT_CYCLE"),
      v.literal("COMPLETE"),
      v.literal("BLOCKED")
    ),
    phaseHistory: v.array(v.object({
      phase: v.string(),
      enteredAt: v.number(),
      actorId: v.string(),
      note: v.optional(v.string()),
    })),
    sources: v.array(v.object({
      id: v.string(),
      title: v.string(),
      url: v.string(),
      publisher: v.optional(v.string()),
      publishedAt: v.optional(v.number()),
      retrievedAt: v.number(),
      sourceType: v.optional(v.union(
        v.literal("PRIMARY"),
        v.literal("OFFICIAL_DOCS"),
        v.literal("RESEARCH"),
        v.literal("NEWS"),
        v.literal("VENDOR"),
        v.literal("COMMUNITY"),
        v.literal("OTHER")
      )),
      vendorClaim: v.optional(v.boolean()),
      canonicalUrl: v.optional(v.string()),
      syndicatedFromUrl: v.optional(v.string()),
      freshness: v.union(
        v.literal("CURRENT"),
        v.literal("RECENT"),
        v.literal("RELEVANT"),
        v.literal("FOUNDATIONAL"),
        v.literal("STALE"),
        v.literal("UNKNOWN")
      ),
      decision: v.union(
        v.literal("PENDING"),
        v.literal("ACCEPTED"),
        v.literal("REJECTED")
      ),
      decisionReason: v.optional(v.string()),
      verifiedBy: v.optional(v.string()),
      verifiedAt: v.optional(v.number()),
      researchSourceId: v.optional(v.id("researchSources")),
      researchSourceRunId: v.optional(v.id("researchSourceRuns")),
      researchObservationId: v.optional(v.id("researchObservations")),
      runArtifactId: v.optional(v.id("runArtifacts")),
      verificationReceiptId: v.optional(v.id("verificationReceipts")),
      providerItemId: v.optional(v.string()),
      contentHash: v.optional(v.string()),
      safetyScanStatus: v.optional(v.union(
        v.literal("PASSED"),
        v.literal("QUARANTINED")
      )),
    })),
    claims: v.optional(v.array(v.object({
      id: v.string(),
      statement: v.string(),
      supportingSourceIds: v.array(v.string()),
      contradictorySourceIds: v.array(v.string()),
      unsupported: v.boolean(),
      confidence: v.union(
        v.literal("LOW"),
        v.literal("MEDIUM"),
        v.literal("HIGH")
      ),
      createdAt: v.number(),
      createdBy: v.string(),
    }))),
    recommendations: v.array(v.object({
      id: v.string(),
      title: v.string(),
      rationale: v.string(),
      evidenceSourceIds: v.array(v.string()),
      confidence: v.union(
        v.literal("LOW"),
        v.literal("MEDIUM"),
        v.literal("HIGH")
      ),
      status: v.union(
        v.literal("PROPOSED"),
        v.literal("APPROVED"),
        v.literal("REJECTED"),
        v.literal("IMPLEMENTING"),
        v.literal("IMPLEMENTED")
      ),
      decisionReason: v.optional(v.string()),
      implementationTaskId: v.optional(v.id("tasks")),
      implementationWorkOrderId: v.optional(v.id("workOrders")),
    })),
    validations: v.array(v.object({
      id: v.string(),
      name: v.string(),
      status: v.union(v.literal("PASS"), v.literal("FAIL")),
      evidenceLocation: v.string(),
      recordedAt: v.number(),
      recordedBy: v.string(),
    })),
    measurements: v.array(v.object({
      id: v.string(),
      name: v.string(),
      baseline: v.number(),
      result: v.number(),
      unit: v.string(),
      target: v.optional(v.number()),
      passed: v.boolean(),
      evidenceLocation: v.string(),
      recordedAt: v.number(),
      recordedBy: v.string(),
    })),
    taskIds: v.array(v.id("tasks")),
    workOrderIds: v.array(v.id("workOrders")),
    researchSourceRunIds: v.optional(v.array(v.id("researchSourceRuns"))),
    rootWorkOrderId: v.optional(v.id("workOrders")),
    latestWorkflowRunId: v.optional(v.id("workflowRuns")),
    projectedRunCompletedAt: v.optional(v.number()),
    projectionVersion: v.optional(v.number()),
    projectionStatus: v.optional(v.union(
      v.literal("PENDING"),
      v.literal("PROJECTED"),
      v.literal("FAILED")
    )),
    projectionError: v.optional(v.string()),
    projectedAt: v.optional(v.number()),
    projectionSummary: v.optional(v.object({
      sourceCount: v.number(),
      claimCount: v.number(),
      recommendationCount: v.number(),
      measurementCount: v.number(),
      cleanStop: v.boolean(),
      stopCondition: v.optional(v.string()),
    })),
    conflicts: v.optional(v.array(v.string())),
    limitations: v.optional(v.array(v.string())),
    measurementSnapshots: v.optional(v.array(v.any())),
    workflowApprovalId: v.optional(v.id("approvals")),
    approvalEvidenceDigest: v.optional(v.string()),
    approvalActorId: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    blockedReason: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_project_phase", ["projectId", "phase"])
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_parent", ["parentCycleId"])
    .index("by_root_work_order", ["rootWorkOrderId"])
    .index("by_latest_workflow_run", ["latestWorkflowRunId"]),

  // -------------------------------------------------------------------------
  // HARNESS ENGINEERING: VERIFIERS (outer loop — skill adherence)
  // -------------------------------------------------------------------------
  contextVerifiers: defineTable({
    packageId: v.optional(v.id("contextPackages")),
    projectId: v.optional(v.id("projects")),
    label: v.string(),
    invariant: v.string(),
    globPatterns: v.array(v.string()),
    active: v.boolean(),
    passRate: v.optional(v.number()),
    lastRunAt: v.optional(v.number()),
    validatedModel: v.optional(v.string()),
    sourceSkillId: v.optional(v.id("contextPackages")),
    idempotencyKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_package", ["packageId"])
    .index("by_active", ["active"])
    .index("by_idempotency", ["idempotencyKey"]),

  // -------------------------------------------------------------------------
  // HARNESS ENGINEERING: CHANGE RISK POLICIES (human gate)
  // -------------------------------------------------------------------------
  changeRiskPolicies: defineTable({
    projectId: v.optional(v.id("projects")),
    name: v.string(),
    strictness: v.number(),
    rules: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        requireHuman: v.boolean(),
        globPatterns: v.optional(v.array(v.string())),
      })
    ),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_active", ["active"]),

  // -------------------------------------------------------------------------
  // HARNESS ENGINEERING: WORKFLOW RUNS (Launch analog)
  // -------------------------------------------------------------------------
  contextWorkflowRuns: defineTable({
    projectId: v.optional(v.id("projects")),
    packageId: v.optional(v.id("contextPackages")),
    skillName: v.string(),
    agentModel: v.optional(v.string()),
    intelligenceTier: v.optional(v.string()),
    schedule: v.optional(v.string()),
    status: v.union(
      v.literal("PENDING"),
      v.literal("RUNNING"),
      v.literal("COMPLETED"),
      v.literal("FAILED"),
      v.literal("CANCELLED")
    ),
    logUrl: v.optional(v.string()),
    tokenCost: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_status", ["status"])
    .index("by_idempotency", ["idempotencyKey"]),

  // -------------------------------------------------------------------------
  // HARNESS ENGINEERING: PR CHECKS (change review + mutation testing)
  // -------------------------------------------------------------------------
  harnessPrChecks: defineTable({
    projectId: v.optional(v.id("projects")),
    workOrderId: v.optional(v.id("workOrders")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    taskId: v.optional(v.id("tasks")),
    loopEngineeringCycleId: v.optional(v.id("loopEngineeringCycles")),
    previousEvaluationId: v.optional(v.id("harnessPrChecks")),
    releaseDeploymentId: v.optional(v.id("deployments")),
    prUrl: v.string(),
    prNumber: v.optional(v.number()),
    repoFullName: v.string(),
    branch: v.optional(v.string()),
    title: v.optional(v.string()),
    prState: v.optional(v.union(v.literal("OPEN"), v.literal("CLOSED"), v.literal("MERGED"))),
    ciStatus: v.optional(
      v.union(
        v.literal("PASS"),
        v.literal("FAIL"),
        v.literal("PENDING"),
        v.literal("UNKNOWN")
      )
    ),
    ciRunUrl: v.optional(v.string()),
    ciProvider: v.optional(v.string()),
    source: v.union(
      v.literal("CODEGEN"),
      v.literal("WORKFLOW"),
      v.literal("GITHUB"),
      v.literal("MANUAL")
    ),
    sourceRef: v.optional(v.string()),
    sourceEventId: v.optional(v.string()),
    headSha: v.optional(v.string()),
    changeReviewLenses: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        enabled: v.boolean(),
        score: v.optional(v.number()),
      })
    ),
    mutationTesting: v.optional(
      v.object({
        diffCoveragePct: v.number(),
        findings: v.array(
          v.object({
            id: v.string(),
            mutation: v.string(),
            caught: v.boolean(),
            file: v.optional(v.string()),
          })
        ),
      })
    ),
    syncedAt: v.number(),
    createdAt: v.number(),
    metadata: v.optional(v.any()),
    mergeActor: v.optional(v.string()),
    mergedAt: v.optional(v.number()),
    mergeCommitSha: v.optional(v.string()),
  })
    .index("by_project", ["projectId"])
    .index("by_pr_url", ["prUrl"])
    .index("by_pr_head", ["prUrl", "headSha"])
    .index("by_source_event", ["sourceEventId"])
    .index("by_work_order", ["workOrderId"])
    .index("by_repo", ["repoFullName"]),

  // Immutable operator decisions for valid PR/CI evidence that could not be
  // correlated automatically to one exact WorkOrder and Attempt.
  prEvidenceReconciliations: defineTable({
    projectId: v.id("projects"),
    evaluationId: v.id("harnessPrChecks"),
    decision: v.union(v.literal("LINKED"), v.literal("DISMISSED")),
    workOrderId: v.optional(v.id("workOrders")),
    workflowRunId: v.optional(v.id("workflowRuns")),
    taskId: v.optional(v.id("tasks")),
    loopEngineeringCycleId: v.optional(v.id("loopEngineeringCycles")),
    reason: v.string(),
    actorId: v.string(),
    idempotencyKey: v.string(),
    evidenceSnapshot: v.object({
      prUrl: v.string(),
      repoFullName: v.string(),
      branch: v.optional(v.string()),
      headSha: v.optional(v.string()),
      ciStatus: v.optional(v.string()),
    }),
    candidateSnapshot: v.optional(v.any()),
    decidedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_evaluation", ["evaluationId"])
    .index("by_idempotency", ["idempotencyKey"]),

  // -------------------------------------------------------------------------
  // HARNESS ENGINEERING: META LOOP SUGGESTIONS
  // -------------------------------------------------------------------------
  metaLoopSuggestions: defineTable({
    projectId: v.optional(v.id("projects")),
    kind: v.union(
      v.literal("VERIFIER"),
      v.literal("SKILL_UPDATE"),
      v.literal("EVAL_SCENARIO"),
      v.literal("MAINTENANCE"),
      v.literal("RULE_RETIRE"),
      v.literal("DELEGATION")
    ),
    title: v.string(),
    summary: v.string(),
    status: v.union(
      v.literal("OPEN"),
      v.literal("ACCEPTED"),
      v.literal("WORK_ORDERED"),
      v.literal("IMPLEMENTED"),
      v.literal("VERIFIED"),
      v.literal("EFFECTIVE"),
      v.literal("DISMISSED"),
      v.literal("ROLLED_BACK"),
      v.literal("RETIRED")
    ),
    sourceRef: v.optional(v.string()),
    sourceLinks: v.optional(v.array(v.string())),
    dedupeKey: v.optional(v.string()),
    evidenceCount: v.optional(v.number()),
    confidence: v.optional(v.number()),
    impact: v.optional(v.string()),
    affectedSurface: v.optional(v.string()),
    packageId: v.optional(v.id("contextPackages")),
    workOrderId: v.optional(v.id("workOrders")),
    taskId: v.optional(v.id("tasks")),
    dismissalReason: v.optional(v.string()),
    measurement: v.optional(v.object({
      baseline: v.number(),
      result: v.number(),
      target: v.number(),
      unit: v.string(),
      verdict: v.union(v.literal("MET"), v.literal("MISSED")),
      evidenceRefs: v.array(v.string()),
      measuredAt: v.number(),
    })),
    payload: v.optional(v.any()),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_project_status", ["projectId", "status"])
    .index("by_dedupe", ["dedupeKey"])
    .index("by_status", ["status"]),

  // -------------------------------------------------------------------------
  // AUTOMATION CONTROL PLANE
  // -------------------------------------------------------------------------
  automationDefinitions: defineTable({
    projectId: v.id("projects"),
    sourceCandidateId: v.id("metaLoopSuggestions"),
    definitionVersion: v.number(),
    name: v.string(),
    description: v.string(),
    ownerId: v.string(),
    // Compatibility fields for the existing review-only meta-loop scheduler.
    // Skill-backed definitions use the richer governed fields below.
    sourceSuggestionId: v.optional(v.id("metaLoopSuggestions")),
    sourcePattern: v.optional(v.string()),
    trigger: v.optional(v.string()),
    schedule: v.optional(v.string()),
    requiresHumanApproval: v.optional(v.boolean()),
    requiresVerificationReceipt: v.optional(v.boolean()),
    enabled: v.optional(v.boolean()),
    lastDraftAt: v.optional(v.number()),
    deactivatedAt: v.optional(v.number()),
    deactivatedBy: v.optional(v.string()),
    sourceSkillId: v.optional(v.id("contextPackages")),
    sourceSkillVersionId: v.optional(v.id("contextPackageVersions")),
    sourceSkillVersion: v.optional(v.string()),
    adapterType: v.optional(v.union(
      v.literal("PLAYWRIGHT"),
      v.literal("API"),
      v.literal("TYPESCRIPT"),
      v.literal("PYTHON"),
      v.literal("SHELL"),
      v.literal("WORKFLOW"),
      v.literal("SKILL_PIPELINE")
    )),
    artifactId: v.optional(v.id("automationArtifacts")),
    artifactPath: v.optional(v.string()),
    branch: v.optional(v.string()),
    workingDirectory: v.optional(v.string()),
    runtime: v.optional(v.string()),
    inputBindings: v.optional(v.any()),
    outputContract: v.optional(v.any()),
    requiredPermissions: v.optional(v.array(v.string())),
    secretReferences: v.optional(v.array(v.string())),
    validationStatus: v.optional(v.union(v.literal("PENDING"), v.literal("PASSED"), v.literal("FAILED"))),
    reviewStatus: v.optional(v.union(v.literal("DRAFT"), v.literal("READY_FOR_REVIEW"), v.literal("APPROVED"), v.literal("REJECTED"))),
    approvedBy: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    correlationId: v.optional(v.string()),
    workflowId: v.string(),
    workflowVersion: v.string(),
    triggerType: v.union(
      v.literal("SCHEDULE"),
      v.literal("EVENT"),
      v.literal("MANUAL"),
      v.literal("CONDITION"),
      v.literal("DEPENDENCY"),
      v.literal("RECEIPT")
    ),
    triggerConfig: v.any(),
    scope: v.string(),
    repositoryIds: v.array(v.string()),
    environmentIds: v.array(v.string()),
    autonomyLevel: v.union(
      v.literal("LEVEL_0"),
      v.literal("LEVEL_1"),
      v.literal("LEVEL_2"),
      v.literal("LEVEL_3"),
      v.literal("LEVEL_4"),
      v.literal("LEVEL_5")
    ),
    isMutating: v.boolean(),
    riskLevel: v.union(
      v.literal("LOW"),
      v.literal("MEDIUM"),
      v.literal("HIGH"),
      v.literal("CRITICAL")
    ),
    requiredApprovalTypes: v.array(v.string()),
    verificationContract: v.any(),
    evidenceRequirements: v.array(v.string()),
    maxDurationSeconds: v.number(),
    maxRetries: v.number(),
    maxCostUsd: v.number(),
    concurrencyLimit: v.number(),
    idempotencyStrategy: v.string(),
    overlapPolicy: v.union(
      v.literal("SKIP"),
      v.literal("QUEUE"),
      v.literal("CANCEL_PREVIOUS"),
      v.literal("ALLOW")
    ),
    catchUpPolicy: v.union(
      v.literal("SKIP_MISSED"),
      v.literal("RUN_ONCE"),
      v.literal("RUN_EACH_MISSED")
    ),
    status: v.union(
      v.literal("DRAFT"),
      v.literal("DISABLED"),
      v.literal("ACTIVE"),
      v.literal("PAUSED"),
      v.literal("SUSPENDED"),
      v.literal("RETIRED"),
      v.literal("ARCHIVED")
    ),
    reliabilityState: v.union(
      v.literal("PROBATION"),
      v.literal("SUPERVISED"),
      v.literal("TRUSTED_READ_ONLY"),
      v.literal("TRUSTED_LOW_RISK"),
      v.literal("SUSPENDED")
    ),
    health: v.union(
      v.literal("HEALTHY"),
      v.literal("ATTENTION"),
      v.literal("DEGRADED"),
      v.literal("UNKNOWN")
    ),
    activatedBy: v.optional(v.string()),
    activatedAt: v.optional(v.number()),
    activationReason: v.optional(v.string()),
    activationPolicyVersion: v.optional(v.string()),
    pausedBy: v.optional(v.string()),
    pausedAt: v.optional(v.number()),
    pauseReason: v.optional(v.string()),
    lastRunAt: v.optional(v.number()),
    nextRunAt: v.optional(v.number()),
    lastResult: v.optional(v.string()),
    lastReviewGateWorkOrderId: v.optional(v.id("workOrders")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_status", ["projectId", "status"])
    .index("by_source_candidate", ["sourceCandidateId"])
    .index("by_source_suggestion", ["sourceSuggestionId"])
    .index("by_next_run", ["nextRunAt"]),

  automationDecisions: defineTable({
    projectId: v.id("projects"),
    automationDefinitionId: v.optional(v.id("automationDefinitions")),
    candidateId: v.optional(v.string()),
    decisionType: v.union(
      v.literal("CREATED"),
      v.literal("ACCEPTED"),
      v.literal("REJECTED"),
      v.literal("ACTIVATED"),
      v.literal("PAUSED"),
      v.literal("RESUMED"),
      v.literal("SUSPENDED"),
      v.literal("RETIRED"),
      v.literal("POLICY_BLOCKED"),
      v.literal("ELIGIBILITY_REVIEWED"),
      v.literal("DEFERRED"),
      v.literal("DISMISSED"),
      v.literal("RESTORED"),
      v.literal("CONVERSION_STARTED"),
      v.literal("ARTIFACT_GENERATED"),
      v.literal("ARTIFACT_VALIDATED"),
      v.literal("REVIEW_REQUESTED"),
      v.literal("APPROVED"),
      v.literal("EVALUATED"),
      v.literal("EVALUATION_SKIPPED"),
      v.literal("VERIFIED"),
      v.literal("UPDATED"),
      v.literal("VALIDATED"),
      v.literal("DISABLED"),
      v.literal("ARCHIVED"),
      v.literal("CLONED"),
      v.literal("VERSION_CREATED"),
      v.literal("EXECUTION_STARTED"),
      v.literal("EXECUTION_COMPLETED"),
      v.literal("EXECUTION_FAILED"),
      v.literal("RECEIPT_CREATED"),
      v.literal("FINALIZED")
    ),
    actorId: v.string(),
    actorIdentitySource: v.optional(v.literal("CLIENT_ASSERTED_TRUSTED_OPERATOR")),
    reason: v.string(),
    policyVersion: v.string(),
    definitionVersion: v.number(),
    decidedAt: v.number(),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    previousState: v.optional(v.string()),
    newState: v.optional(v.string()),
    correlationId: v.optional(v.string()),
    causationId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  })
    .index("by_project", ["projectId"])
    .index("by_definition", ["automationDefinitionId"])
    .index("by_project_time", ["projectId", "decidedAt"]),

  automationConversionDrafts: defineTable({
    projectId: v.id("projects"),
    sourceSkillId: v.id("contextPackages"),
    sourceSkillVersionId: v.id("contextPackageVersions"),
    candidateId: v.string(),
    currentStep: v.number(),
    status: v.union(v.literal("IN_PROGRESS"), v.literal("COMPLETED"), v.literal("ABANDONED")),
    adapterType: v.optional(v.string()),
    configuration: v.any(),
    eligibilitySnapshot: v.any(),
    artifactPreview: v.optional(v.any()),
    validationResult: v.optional(v.any()),
    correlationId: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_skill", ["projectId", "sourceSkillId"])
    .index("by_correlation", ["correlationId"]),

  automationArtifacts: defineTable({
    projectId: v.id("projects"),
    sourceSkillId: v.id("contextPackages"),
    sourceSkillVersionId: v.id("contextPackageVersions"),
    adapterType: v.string(),
    mode: v.union(v.literal("GENERATED"), v.literal("LINKED")),
    repository: v.string(),
    branch: v.string(),
    workingDirectory: v.string(),
    path: v.string(),
    content: v.optional(v.string()),
    contentHash: v.string(),
    manifest: v.any(),
    validationStatus: v.union(v.literal("PENDING"), v.literal("PASSED"), v.literal("FAILED")),
    validationFindings: v.array(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_path", ["projectId", "repository", "path"])
    .index("by_skill", ["sourceSkillId"]),

  automationEvaluations: defineTable({
    projectId: v.id("projects"),
    automationDefinitionId: v.id("automationDefinitions"),
    workOrderId: v.optional(v.id("workOrders")),
    evaluationKey: v.string(),
    triggerType: v.string(),
    status: v.union(
      v.literal("CREATED"),
      v.literal("SKIPPED"),
      v.literal("AWAITING_APPROVAL"),
      v.literal("DISPATCHED"),
      v.literal("AWAITING_VERIFICATION"),
      v.literal("VERIFIED"),
      v.literal("REJECTED"),
      v.literal("FAILED")
    ),
    reason: v.string(),
    checks: v.any(),
    correlationId: v.string(),
    causationId: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_definition", ["automationDefinitionId"])
    .index("by_evaluation_key", ["evaluationKey"])
    .index("by_work_order", ["workOrderId"]),

  releaseGateEvaluations: defineTable({
    deploymentId: v.id("deployments"),
    status: v.union(v.literal("PASS"), v.literal("WARN"), v.literal("FAIL")),
    mode: v.literal("SHADOW"),
    rationale: v.string(),
    evidenceRefs: v.array(v.string()),
    qcRunId: v.optional(v.id("qcRuns")),
    contextEvalRunId: v.optional(v.id("contextEvalRuns")),
    harnessPrCheckId: v.optional(v.id("harnessPrChecks")),
    automationKey: v.optional(v.string()),
    createdBy: v.optional(v.id("operators")),
    createdAt: v.number(),
  })
    .index("by_deployment", ["deploymentId"])
    .index("by_automation_key", ["automationKey"]),

  // -----------------------------------------------------------------------
  // SOFTWARE FACTORY: CODE RELEASES (exact merge -> staging verification)
  // -----------------------------------------------------------------------
  factoryReleases: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.id("projects"),
    workOrderId: v.id("workOrders"),
    workflowRunId: v.id("workflowRuns"),
    taskId: v.optional(v.id("tasks")),
    repositoryId: v.id("workspaceRepositories"),
    factoryDefinitionVersionId: v.optional(v.id("factoryDefinitionVersions")),
    environmentId: v.id("environments"),
    prEvaluationId: v.id("harnessPrChecks"),
    prUrl: v.string(),
    prNumber: v.optional(v.number()),
    sourceHeadSha: v.string(),
    mergeCommitSha: v.string(),
    mergeActor: v.optional(v.string()),
    mergedAt: v.number(),
    state: factoryReleaseState,
    deploymentApprovalStatus: v.union(
      v.literal("PENDING"),
      v.literal("APPROVED")
    ),
    deploymentApprovedBy: v.optional(v.string()),
    deploymentApprovedAt: v.optional(v.number()),
    deploymentApprovalRationale: v.optional(v.string()),
    deploymentProvider: v.optional(v.string()),
    providerDeploymentId: v.optional(v.string()),
    deploymentAttemptCount: v.optional(v.number()),
    deploymentUrl: v.optional(v.string()),
    provenanceUrl: v.optional(v.string()),
    smokeUrl: v.optional(v.string()),
    healthUrl: v.optional(v.string()),
    deployedAt: v.optional(v.number()),
    redeployedAt: v.optional(v.number()),
    verifiedAt: v.optional(v.number()),
    rolledBackAt: v.optional(v.number()),
    restoredCommitSha: v.optional(v.string()),
    blockingIssue: v.optional(v.string()),
    requiredHumanAction: v.optional(v.string()),
    verificationAttemptCount: v.number(),
    productionEnvironmentId: v.optional(v.id("environments")),
    productionState: v.optional(factoryProductionReleaseState),
    productionApprovalStatus: v.optional(v.union(
      v.literal("PENDING"),
      v.literal("APPROVED")
    )),
    productionApprovedBy: v.optional(v.string()),
    productionApprovedAt: v.optional(v.number()),
    productionApprovalRationale: v.optional(v.string()),
    productionDeploymentProvider: v.optional(v.string()),
    productionProviderDeploymentId: v.optional(v.string()),
    productionDeploymentUrl: v.optional(v.string()),
    productionProvenanceUrl: v.optional(v.string()),
    productionSmokeUrl: v.optional(v.string()),
    productionHealthUrl: v.optional(v.string()),
    productionDeployedAt: v.optional(v.number()),
    productionVerifiedAt: v.optional(v.number()),
    productionVerificationAttemptCount: v.optional(v.number()),
    productionPromotedAt: v.optional(v.number()),
    productionPromotionProviderRef: v.optional(v.string()),
    productionPromotionUrl: v.optional(v.string()),
    productionRolledBackAt: v.optional(v.number()),
    productionRestoredCommitSha: v.optional(v.string()),
    productionRollbackProviderRef: v.optional(v.string()),
    productionBlockingIssue: v.optional(v.string()),
    productionRequiredHumanAction: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_project_state", ["projectId", "state"])
    .index("by_work_order", ["workOrderId"])
    .index("by_pr_evaluation", ["prEvaluationId"])
    .index("by_merge_sha", ["repositoryId", "mergeCommitSha"])
    .index("by_environment", ["environmentId"]),

  factoryReleaseEvidence: defineTable({
    tenantId: v.optional(v.id("tenants")),
    projectId: v.id("projects"),
    releaseId: v.id("factoryReleases"),
    kind: factoryReleaseEvidenceKind,
    status: v.union(
      v.literal("PASS"),
      v.literal("FAIL"),
      v.literal("INFO")
    ),
    subjectSha: v.string(),
    providerRef: v.optional(v.string()),
    evidenceUrl: v.optional(v.string()),
    httpStatus: v.optional(v.number()),
    latencyMs: v.optional(v.number()),
    contentDigest: v.optional(v.string()),
    summary: v.string(),
    actorType: actorType,
    actorId: v.optional(v.string()),
    idempotencyKey: v.string(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_release", ["releaseId", "createdAt"])
    .index("by_project", ["projectId", "createdAt"])
    .index("by_idempotency", ["idempotencyKey"]),

  // -------------------------------------------------------------------------
  // KNOWLEDGE GRAPH (Agentic-KB Graphify overlay + future Obsidian sync)
  // -------------------------------------------------------------------------
  knowledgeGraphNodes: defineTable({
    projectId: v.optional(v.id("projects")),
    source: v.union(
      v.literal("agentic-kb"),
      v.literal("obsidian"),
      v.literal("mission-control")
    ),
    externalId: v.string(),
    label: v.string(),
    fileType: v.optional(v.string()),
    sourceFile: v.optional(v.string()),
    community: v.optional(v.number()),
    metadata: v.optional(v.any()),
    importedAt: v.number(),
  })
    .index("by_project_source", ["projectId", "source"])
    .index("by_source", ["source"])
    .index("by_external", ["source", "externalId"]),

  knowledgeGraphEdges: defineTable({
    projectId: v.optional(v.id("projects")),
    source: v.union(
      v.literal("agentic-kb"),
      v.literal("obsidian"),
      v.literal("mission-control")
    ),
    externalId: v.string(),
    fromExternalId: v.string(),
    toExternalId: v.string(),
    relation: v.string(),
    confidence: v.optional(v.string()),
    confidenceScore: v.optional(v.number()),
    weight: v.optional(v.number()),
    sourceFile: v.optional(v.string()),
    importedAt: v.number(),
  })
    .index("by_project_source", ["projectId", "source"])
    .index("by_source", ["source"])
    .index("by_from", ["source", "fromExternalId"])
    .index("by_to", ["source", "toExternalId"]),

  knowledgeGraphHyperedges: defineTable({
    projectId: v.optional(v.id("projects")),
    source: v.union(
      v.literal("agentic-kb"),
      v.literal("obsidian"),
      v.literal("mission-control")
    ),
    externalId: v.string(),
    label: v.string(),
    nodeExternalIds: v.array(v.string()),
    relation: v.string(),
    confidence: v.optional(v.string()),
    confidenceScore: v.optional(v.number()),
    sourceFile: v.optional(v.string()),
    importedAt: v.number(),
  })
    .index("by_project_source", ["projectId", "source"])
    .index("by_source", ["source"])
    .index("by_external", ["source", "externalId"]),
});
