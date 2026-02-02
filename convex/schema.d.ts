/**
 * Convex Database Schema — V0
 *
 * Aligned with Bootstrap Kit (docs/openclaw-bootstrap/schema/SCHEMA.md)
 * Source of truth for Mission Control data model.
 */
declare const _default: import("convex/server").SchemaDefinition<{
    projects: import("convex/server").TableDefinition<import("convex/values").VObject<{
        description?: string | undefined;
        policyDefaults?: {
            budgetDefaults?: any;
            riskThresholds?: any;
        } | undefined;
        metadata?: any;
        name: string;
        slug: string;
    }, {
        name: import("convex/values").VString<string, "required">;
        slug: import("convex/values").VString<string, "required">;
        description: import("convex/values").VString<string | undefined, "optional">;
        policyDefaults: import("convex/values").VObject<{
            budgetDefaults?: any;
            riskThresholds?: any;
        } | undefined, {
            budgetDefaults: import("convex/values").VAny<any, "optional", string>;
            riskThresholds: import("convex/values").VAny<any, "optional", string>;
        }, "optional", "budgetDefaults" | "riskThresholds" | `budgetDefaults.${string}` | `riskThresholds.${string}`>;
        metadata: import("convex/values").VAny<any, "optional", string>;
    }, "required", "name" | "slug" | "description" | "policyDefaults" | "metadata" | "policyDefaults.budgetDefaults" | "policyDefaults.riskThresholds" | `policyDefaults.budgetDefaults.${string}` | `policyDefaults.riskThresholds.${string}` | `metadata.${string}`>, {
        by_slug: ["slug", "_creationTime"];
    }, {}, {}>;
    agents: import("convex/server").TableDefinition<import("convex/values").VObject<{
        metadata?: any;
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        emoji?: string | undefined;
        soulVersionHash?: string | undefined;
        allowedTools?: string[] | undefined;
        spendResetAt?: number | undefined;
        parentAgentId?: import("convex/values").GenericId<"agents"> | undefined;
        currentTaskId?: import("convex/values").GenericId<"tasks"> | undefined;
        lastHeartbeatAt?: number | undefined;
        lastError?: string | undefined;
        name: string;
        role: "INTERN" | "SPECIALIST" | "LEAD";
        status: "ACTIVE" | "PAUSED" | "DRAINED" | "QUARANTINED" | "OFFLINE";
        workspacePath: string;
        allowedTaskTypes: string[];
        budgetDaily: number;
        budgetPerRun: number;
        spendToday: number;
        canSpawn: boolean;
        maxSubAgents: number;
        errorStreak: number;
    }, {
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        name: import("convex/values").VString<string, "required">;
        emoji: import("convex/values").VString<string | undefined, "optional">;
        role: import("convex/values").VUnion<"INTERN" | "SPECIALIST" | "LEAD", [import("convex/values").VLiteral<"INTERN", "required">, import("convex/values").VLiteral<"SPECIALIST", "required">, import("convex/values").VLiteral<"LEAD", "required">], "required", never>;
        status: import("convex/values").VUnion<"ACTIVE" | "PAUSED" | "DRAINED" | "QUARANTINED" | "OFFLINE", [import("convex/values").VLiteral<"ACTIVE", "required">, import("convex/values").VLiteral<"PAUSED", "required">, import("convex/values").VLiteral<"DRAINED", "required">, import("convex/values").VLiteral<"QUARANTINED", "required">, import("convex/values").VLiteral<"OFFLINE", "required">], "required", never>;
        workspacePath: import("convex/values").VString<string, "required">;
        soulVersionHash: import("convex/values").VString<string | undefined, "optional">;
        allowedTaskTypes: import("convex/values").VArray<string[], import("convex/values").VString<string, "required">, "required">;
        allowedTools: import("convex/values").VArray<string[] | undefined, import("convex/values").VString<string, "required">, "optional">;
        budgetDaily: import("convex/values").VFloat64<number, "required">;
        budgetPerRun: import("convex/values").VFloat64<number, "required">;
        spendToday: import("convex/values").VFloat64<number, "required">;
        spendResetAt: import("convex/values").VFloat64<number | undefined, "optional">;
        canSpawn: import("convex/values").VBoolean<boolean, "required">;
        maxSubAgents: import("convex/values").VFloat64<number, "required">;
        parentAgentId: import("convex/values").VId<import("convex/values").GenericId<"agents"> | undefined, "optional">;
        currentTaskId: import("convex/values").VId<import("convex/values").GenericId<"tasks"> | undefined, "optional">;
        lastHeartbeatAt: import("convex/values").VFloat64<number | undefined, "optional">;
        lastError: import("convex/values").VString<string | undefined, "optional">;
        errorStreak: import("convex/values").VFloat64<number, "required">;
        metadata: import("convex/values").VAny<any, "optional", string>;
    }, "required", "name" | "metadata" | `metadata.${string}` | "role" | "status" | "projectId" | "emoji" | "workspacePath" | "soulVersionHash" | "allowedTaskTypes" | "allowedTools" | "budgetDaily" | "budgetPerRun" | "spendToday" | "spendResetAt" | "canSpawn" | "maxSubAgents" | "parentAgentId" | "currentTaskId" | "lastHeartbeatAt" | "lastError" | "errorStreak">, {
        by_status: ["status", "_creationTime"];
        by_role: ["role", "_creationTime"];
        by_name: ["name", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
        by_project_status: ["projectId", "status", "_creationTime"];
    }, {}, {}>;
    tasks: import("convex/server").TableDefinition<import("convex/values").VObject<{
        description?: string | undefined;
        metadata?: any;
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        idempotencyKey?: string | undefined;
        creatorAgentId?: import("convex/values").GenericId<"agents"> | undefined;
        reviewerId?: import("convex/values").GenericId<"agents"> | undefined;
        parentTaskId?: import("convex/values").GenericId<"tasks"> | undefined;
        workPlan?: {
            estimatedCost?: number | undefined;
            estimatedDuration?: string | undefined;
            bullets: string[];
        } | undefined;
        estimatedCost?: number | undefined;
        deliverable?: {
            summary?: string | undefined;
            content?: string | undefined;
            artifactIds?: string[] | undefined;
        } | undefined;
        reviewChecklist?: {
            type: string;
            items: {
                note?: string | undefined;
                label: string;
                checked: boolean;
            }[];
        } | undefined;
        budgetAllocated?: number | undefined;
        budgetRemaining?: number | undefined;
        dueAt?: number | undefined;
        startedAt?: number | undefined;
        submittedAt?: number | undefined;
        completedAt?: number | undefined;
        labels?: string[] | undefined;
        blockedReason?: string | undefined;
        threadRef?: string | undefined;
        redactedFields?: string[] | undefined;
        type: "CONTENT" | "SOCIAL" | "EMAIL_MARKETING" | "CUSTOMER_RESEARCH" | "SEO_RESEARCH" | "ENGINEERING" | "DOCS" | "OPS";
        status: "INBOX" | "ASSIGNED" | "IN_PROGRESS" | "REVIEW" | "NEEDS_APPROVAL" | "BLOCKED" | "DONE" | "CANCELED";
        priority: 1 | 2 | 3 | 4;
        title: string;
        assigneeIds: import("convex/values").GenericId<"agents">[];
        reviewCycles: number;
        actualCost: number;
    }, {
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        idempotencyKey: import("convex/values").VString<string | undefined, "optional">;
        title: import("convex/values").VString<string, "required">;
        description: import("convex/values").VString<string | undefined, "optional">;
        type: import("convex/values").VUnion<"CONTENT" | "SOCIAL" | "EMAIL_MARKETING" | "CUSTOMER_RESEARCH" | "SEO_RESEARCH" | "ENGINEERING" | "DOCS" | "OPS", [import("convex/values").VLiteral<"CONTENT", "required">, import("convex/values").VLiteral<"SOCIAL", "required">, import("convex/values").VLiteral<"EMAIL_MARKETING", "required">, import("convex/values").VLiteral<"CUSTOMER_RESEARCH", "required">, import("convex/values").VLiteral<"SEO_RESEARCH", "required">, import("convex/values").VLiteral<"ENGINEERING", "required">, import("convex/values").VLiteral<"DOCS", "required">, import("convex/values").VLiteral<"OPS", "required">], "required", never>;
        status: import("convex/values").VUnion<"INBOX" | "ASSIGNED" | "IN_PROGRESS" | "REVIEW" | "NEEDS_APPROVAL" | "BLOCKED" | "DONE" | "CANCELED", [import("convex/values").VLiteral<"INBOX", "required">, import("convex/values").VLiteral<"ASSIGNED", "required">, import("convex/values").VLiteral<"IN_PROGRESS", "required">, import("convex/values").VLiteral<"REVIEW", "required">, import("convex/values").VLiteral<"NEEDS_APPROVAL", "required">, import("convex/values").VLiteral<"BLOCKED", "required">, import("convex/values").VLiteral<"DONE", "required">, import("convex/values").VLiteral<"CANCELED", "required">], "required", never>;
        priority: import("convex/values").VUnion<1 | 2 | 3 | 4, [import("convex/values").VLiteral<1, "required">, import("convex/values").VLiteral<2, "required">, import("convex/values").VLiteral<3, "required">, import("convex/values").VLiteral<4, "required">], "required", never>;
        creatorAgentId: import("convex/values").VId<import("convex/values").GenericId<"agents"> | undefined, "optional">;
        assigneeIds: import("convex/values").VArray<import("convex/values").GenericId<"agents">[], import("convex/values").VId<import("convex/values").GenericId<"agents">, "required">, "required">;
        reviewerId: import("convex/values").VId<import("convex/values").GenericId<"agents"> | undefined, "optional">;
        parentTaskId: import("convex/values").VId<import("convex/values").GenericId<"tasks"> | undefined, "optional">;
        workPlan: import("convex/values").VObject<{
            estimatedCost?: number | undefined;
            estimatedDuration?: string | undefined;
            bullets: string[];
        } | undefined, {
            bullets: import("convex/values").VArray<string[], import("convex/values").VString<string, "required">, "required">;
            estimatedCost: import("convex/values").VFloat64<number | undefined, "optional">;
            estimatedDuration: import("convex/values").VString<string | undefined, "optional">;
        }, "optional", "bullets" | "estimatedCost" | "estimatedDuration">;
        deliverable: import("convex/values").VObject<{
            summary?: string | undefined;
            content?: string | undefined;
            artifactIds?: string[] | undefined;
        } | undefined, {
            summary: import("convex/values").VString<string | undefined, "optional">;
            content: import("convex/values").VString<string | undefined, "optional">;
            artifactIds: import("convex/values").VArray<string[] | undefined, import("convex/values").VString<string, "required">, "optional">;
        }, "optional", "summary" | "content" | "artifactIds">;
        reviewChecklist: import("convex/values").VObject<{
            type: string;
            items: {
                note?: string | undefined;
                label: string;
                checked: boolean;
            }[];
        } | undefined, {
            type: import("convex/values").VString<string, "required">;
            items: import("convex/values").VArray<{
                note?: string | undefined;
                label: string;
                checked: boolean;
            }[], import("convex/values").VObject<{
                note?: string | undefined;
                label: string;
                checked: boolean;
            }, {
                label: import("convex/values").VString<string, "required">;
                checked: import("convex/values").VBoolean<boolean, "required">;
                note: import("convex/values").VString<string | undefined, "optional">;
            }, "required", "label" | "checked" | "note">, "required">;
        }, "optional", "type" | "items">;
        reviewCycles: import("convex/values").VFloat64<number, "required">;
        estimatedCost: import("convex/values").VFloat64<number | undefined, "optional">;
        actualCost: import("convex/values").VFloat64<number, "required">;
        budgetAllocated: import("convex/values").VFloat64<number | undefined, "optional">;
        budgetRemaining: import("convex/values").VFloat64<number | undefined, "optional">;
        dueAt: import("convex/values").VFloat64<number | undefined, "optional">;
        startedAt: import("convex/values").VFloat64<number | undefined, "optional">;
        submittedAt: import("convex/values").VFloat64<number | undefined, "optional">;
        completedAt: import("convex/values").VFloat64<number | undefined, "optional">;
        labels: import("convex/values").VArray<string[] | undefined, import("convex/values").VString<string, "required">, "optional">;
        blockedReason: import("convex/values").VString<string | undefined, "optional">;
        threadRef: import("convex/values").VString<string | undefined, "optional">;
        redactedFields: import("convex/values").VArray<string[] | undefined, import("convex/values").VString<string, "required">, "optional">;
        metadata: import("convex/values").VAny<any, "optional", string>;
    }, "required", "type" | "description" | "metadata" | `metadata.${string}` | "status" | "projectId" | "priority" | "idempotencyKey" | "title" | "creatorAgentId" | "assigneeIds" | "reviewerId" | "parentTaskId" | "workPlan" | "estimatedCost" | "deliverable" | "reviewChecklist" | "reviewCycles" | "actualCost" | "budgetAllocated" | "budgetRemaining" | "dueAt" | "startedAt" | "submittedAt" | "completedAt" | "labels" | "blockedReason" | "threadRef" | "redactedFields" | "workPlan.bullets" | "workPlan.estimatedCost" | "workPlan.estimatedDuration" | "deliverable.summary" | "deliverable.content" | "deliverable.artifactIds" | "reviewChecklist.type" | "reviewChecklist.items">, {
        by_status: ["status", "_creationTime"];
        by_type: ["type", "_creationTime"];
        by_priority: ["priority", "_creationTime"];
        by_idempotency: ["idempotencyKey", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
        by_project_status: ["projectId", "status", "_creationTime"];
    }, {}, {}>;
    taskTransitions: import("convex/server").TableDefinition<import("convex/values").VObject<{
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        actorAgentId?: import("convex/values").GenericId<"agents"> | undefined;
        actorUserId?: string | undefined;
        validationResult?: {
            errors?: {
                field: string;
                message: string;
            }[] | undefined;
            valid: boolean;
        } | undefined;
        artifactsSnapshot?: any;
        reason?: string | undefined;
        sessionKey?: string | undefined;
        idempotencyKey: string;
        actorType: "AGENT" | "HUMAN" | "SYSTEM";
        taskId: import("convex/values").GenericId<"tasks">;
        fromStatus: string;
        toStatus: string;
    }, {
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        idempotencyKey: import("convex/values").VString<string, "required">;
        taskId: import("convex/values").VId<import("convex/values").GenericId<"tasks">, "required">;
        fromStatus: import("convex/values").VString<string, "required">;
        toStatus: import("convex/values").VString<string, "required">;
        actorType: import("convex/values").VUnion<"AGENT" | "HUMAN" | "SYSTEM", [import("convex/values").VLiteral<"AGENT", "required">, import("convex/values").VLiteral<"HUMAN", "required">, import("convex/values").VLiteral<"SYSTEM", "required">], "required", never>;
        actorAgentId: import("convex/values").VId<import("convex/values").GenericId<"agents"> | undefined, "optional">;
        actorUserId: import("convex/values").VString<string | undefined, "optional">;
        validationResult: import("convex/values").VObject<{
            errors?: {
                field: string;
                message: string;
            }[] | undefined;
            valid: boolean;
        } | undefined, {
            valid: import("convex/values").VBoolean<boolean, "required">;
            errors: import("convex/values").VArray<{
                field: string;
                message: string;
            }[] | undefined, import("convex/values").VObject<{
                field: string;
                message: string;
            }, {
                field: import("convex/values").VString<string, "required">;
                message: import("convex/values").VString<string, "required">;
            }, "required", "field" | "message">, "optional">;
        }, "optional", "valid" | "errors">;
        artifactsSnapshot: import("convex/values").VAny<any, "optional", string>;
        reason: import("convex/values").VString<string | undefined, "optional">;
        sessionKey: import("convex/values").VString<string | undefined, "optional">;
    }, "required", "projectId" | "idempotencyKey" | "actorType" | "taskId" | "fromStatus" | "toStatus" | "actorAgentId" | "actorUserId" | "validationResult" | "artifactsSnapshot" | "reason" | "sessionKey" | "validationResult.valid" | "validationResult.errors" | `artifactsSnapshot.${string}`>, {
        by_task: ["taskId", "_creationTime"];
        by_idempotency: ["idempotencyKey", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
    }, {}, {}>;
    messages: import("convex/server").TableDefinition<import("convex/values").VObject<{
        metadata?: any;
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        idempotencyKey?: string | undefined;
        threadRef?: string | undefined;
        redactedFields?: string[] | undefined;
        authorAgentId?: import("convex/values").GenericId<"agents"> | undefined;
        authorUserId?: string | undefined;
        contentRedacted?: string | undefined;
        artifacts?: {
            content?: string | undefined;
            url?: string | undefined;
            type: string;
            name: string;
        }[] | undefined;
        mentions?: string[] | undefined;
        replyToId?: import("convex/values").GenericId<"messages"> | undefined;
        type: "REVIEW" | "SYSTEM" | "COMMENT" | "WORK_PLAN" | "PROGRESS" | "ARTIFACT" | "APPROVAL_REQUEST";
        content: string;
        taskId: import("convex/values").GenericId<"tasks">;
        authorType: "AGENT" | "HUMAN" | "SYSTEM";
    }, {
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        idempotencyKey: import("convex/values").VString<string | undefined, "optional">;
        taskId: import("convex/values").VId<import("convex/values").GenericId<"tasks">, "required">;
        authorType: import("convex/values").VUnion<"AGENT" | "HUMAN" | "SYSTEM", [import("convex/values").VLiteral<"AGENT", "required">, import("convex/values").VLiteral<"HUMAN", "required">, import("convex/values").VLiteral<"SYSTEM", "required">], "required", never>;
        authorAgentId: import("convex/values").VId<import("convex/values").GenericId<"agents"> | undefined, "optional">;
        authorUserId: import("convex/values").VString<string | undefined, "optional">;
        type: import("convex/values").VUnion<"REVIEW" | "SYSTEM" | "COMMENT" | "WORK_PLAN" | "PROGRESS" | "ARTIFACT" | "APPROVAL_REQUEST", [import("convex/values").VLiteral<"COMMENT", "required">, import("convex/values").VLiteral<"WORK_PLAN", "required">, import("convex/values").VLiteral<"PROGRESS", "required">, import("convex/values").VLiteral<"ARTIFACT", "required">, import("convex/values").VLiteral<"REVIEW", "required">, import("convex/values").VLiteral<"APPROVAL_REQUEST", "required">, import("convex/values").VLiteral<"SYSTEM", "required">], "required", never>;
        content: import("convex/values").VString<string, "required">;
        contentRedacted: import("convex/values").VString<string | undefined, "optional">;
        artifacts: import("convex/values").VArray<{
            content?: string | undefined;
            url?: string | undefined;
            type: string;
            name: string;
        }[] | undefined, import("convex/values").VObject<{
            content?: string | undefined;
            url?: string | undefined;
            type: string;
            name: string;
        }, {
            name: import("convex/values").VString<string, "required">;
            type: import("convex/values").VString<string, "required">;
            url: import("convex/values").VString<string | undefined, "optional">;
            content: import("convex/values").VString<string | undefined, "optional">;
        }, "required", "type" | "name" | "content" | "url">, "optional">;
        mentions: import("convex/values").VArray<string[] | undefined, import("convex/values").VString<string, "required">, "optional">;
        replyToId: import("convex/values").VId<import("convex/values").GenericId<"messages"> | undefined, "optional">;
        threadRef: import("convex/values").VString<string | undefined, "optional">;
        redactedFields: import("convex/values").VArray<string[] | undefined, import("convex/values").VString<string, "required">, "optional">;
        metadata: import("convex/values").VAny<any, "optional", string>;
    }, "required", "type" | "metadata" | `metadata.${string}` | "projectId" | "idempotencyKey" | "content" | "threadRef" | "redactedFields" | "taskId" | "authorType" | "authorAgentId" | "authorUserId" | "contentRedacted" | "artifacts" | "mentions" | "replyToId">, {
        by_task: ["taskId", "_creationTime"];
        by_author_agent: ["authorAgentId", "_creationTime"];
        by_idempotency: ["idempotencyKey", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
    }, {}, {}>;
    runs: import("convex/server").TableDefinition<import("convex/values").VObject<{
        metadata?: any;
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        budgetAllocated?: number | undefined;
        taskId?: import("convex/values").GenericId<"tasks"> | undefined;
        endedAt?: number | undefined;
        durationMs?: number | undefined;
        cacheReadTokens?: number | undefined;
        cacheWriteTokens?: number | undefined;
        error?: string | undefined;
        status: "RUNNING" | "COMPLETED" | "FAILED" | "TIMEOUT";
        idempotencyKey: string;
        startedAt: number;
        sessionKey: string;
        agentId: import("convex/values").GenericId<"agents">;
        model: string;
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
    }, {
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        idempotencyKey: import("convex/values").VString<string, "required">;
        agentId: import("convex/values").VId<import("convex/values").GenericId<"agents">, "required">;
        taskId: import("convex/values").VId<import("convex/values").GenericId<"tasks"> | undefined, "optional">;
        sessionKey: import("convex/values").VString<string, "required">;
        startedAt: import("convex/values").VFloat64<number, "required">;
        endedAt: import("convex/values").VFloat64<number | undefined, "optional">;
        durationMs: import("convex/values").VFloat64<number | undefined, "optional">;
        model: import("convex/values").VString<string, "required">;
        inputTokens: import("convex/values").VFloat64<number, "required">;
        outputTokens: import("convex/values").VFloat64<number, "required">;
        cacheReadTokens: import("convex/values").VFloat64<number | undefined, "optional">;
        cacheWriteTokens: import("convex/values").VFloat64<number | undefined, "optional">;
        costUsd: import("convex/values").VFloat64<number, "required">;
        budgetAllocated: import("convex/values").VFloat64<number | undefined, "optional">;
        status: import("convex/values").VUnion<"RUNNING" | "COMPLETED" | "FAILED" | "TIMEOUT", [import("convex/values").VLiteral<"RUNNING", "required">, import("convex/values").VLiteral<"COMPLETED", "required">, import("convex/values").VLiteral<"FAILED", "required">, import("convex/values").VLiteral<"TIMEOUT", "required">], "required", never>;
        error: import("convex/values").VString<string | undefined, "optional">;
        metadata: import("convex/values").VAny<any, "optional", string>;
    }, "required", "metadata" | `metadata.${string}` | "status" | "projectId" | "idempotencyKey" | "budgetAllocated" | "startedAt" | "taskId" | "sessionKey" | "agentId" | "endedAt" | "durationMs" | "model" | "inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheWriteTokens" | "costUsd" | "error">, {
        by_agent: ["agentId", "_creationTime"];
        by_task: ["taskId", "_creationTime"];
        by_session: ["sessionKey", "_creationTime"];
        by_idempotency: ["idempotencyKey", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
    }, {}, {}>;
    toolCalls: import("convex/server").TableDefinition<import("convex/values").VObject<{
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        taskId?: import("convex/values").GenericId<"tasks"> | undefined;
        endedAt?: number | undefined;
        durationMs?: number | undefined;
        error?: string | undefined;
        toolVersion?: string | undefined;
        policyResult?: {
            approvalId?: string | undefined;
            reason: string;
            decision: string;
        } | undefined;
        inputPreview?: string | undefined;
        outputPreview?: string | undefined;
        inputHash?: string | undefined;
        outputHash?: string | undefined;
        status: "RUNNING" | "FAILED" | "PENDING" | "SUCCESS" | "DENIED";
        startedAt: number;
        agentId: import("convex/values").GenericId<"agents">;
        riskLevel: "GREEN" | "YELLOW" | "RED";
        runId: import("convex/values").GenericId<"runs">;
        toolName: string;
        retryCount: number;
    }, {
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        runId: import("convex/values").VId<import("convex/values").GenericId<"runs">, "required">;
        agentId: import("convex/values").VId<import("convex/values").GenericId<"agents">, "required">;
        taskId: import("convex/values").VId<import("convex/values").GenericId<"tasks"> | undefined, "optional">;
        toolName: import("convex/values").VString<string, "required">;
        toolVersion: import("convex/values").VString<string | undefined, "optional">;
        riskLevel: import("convex/values").VUnion<"GREEN" | "YELLOW" | "RED", [import("convex/values").VLiteral<"GREEN", "required">, import("convex/values").VLiteral<"YELLOW", "required">, import("convex/values").VLiteral<"RED", "required">], "required", never>;
        policyResult: import("convex/values").VObject<{
            approvalId?: string | undefined;
            reason: string;
            decision: string;
        } | undefined, {
            decision: import("convex/values").VString<string, "required">;
            reason: import("convex/values").VString<string, "required">;
            approvalId: import("convex/values").VString<string | undefined, "optional">;
        }, "optional", "reason" | "decision" | "approvalId">;
        inputPreview: import("convex/values").VString<string | undefined, "optional">;
        outputPreview: import("convex/values").VString<string | undefined, "optional">;
        inputHash: import("convex/values").VString<string | undefined, "optional">;
        outputHash: import("convex/values").VString<string | undefined, "optional">;
        startedAt: import("convex/values").VFloat64<number, "required">;
        endedAt: import("convex/values").VFloat64<number | undefined, "optional">;
        durationMs: import("convex/values").VFloat64<number | undefined, "optional">;
        status: import("convex/values").VUnion<"RUNNING" | "FAILED" | "PENDING" | "SUCCESS" | "DENIED", [import("convex/values").VLiteral<"PENDING", "required">, import("convex/values").VLiteral<"RUNNING", "required">, import("convex/values").VLiteral<"SUCCESS", "required">, import("convex/values").VLiteral<"FAILED", "required">, import("convex/values").VLiteral<"DENIED", "required">], "required", never>;
        error: import("convex/values").VString<string | undefined, "optional">;
        retryCount: import("convex/values").VFloat64<number, "required">;
    }, "required", "status" | "projectId" | "startedAt" | "taskId" | "agentId" | "endedAt" | "durationMs" | "error" | "riskLevel" | "runId" | "toolName" | "toolVersion" | "policyResult" | "inputPreview" | "outputPreview" | "inputHash" | "outputHash" | "retryCount" | "policyResult.reason" | "policyResult.decision" | "policyResult.approvalId">, {
        by_run: ["runId", "_creationTime"];
        by_agent: ["agentId", "_creationTime"];
        by_task: ["taskId", "_creationTime"];
        by_risk: ["riskLevel", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
    }, {}, {}>;
    approvals: import("convex/server").TableDefinition<import("convex/values").VObject<{
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        idempotencyKey?: string | undefined;
        estimatedCost?: number | undefined;
        taskId?: import("convex/values").GenericId<"tasks"> | undefined;
        toolCallId?: import("convex/values").GenericId<"toolCalls"> | undefined;
        actionPayload?: any;
        rollbackPlan?: string | undefined;
        decidedByAgentId?: import("convex/values").GenericId<"agents"> | undefined;
        decidedByUserId?: string | undefined;
        decidedAt?: number | undefined;
        decisionReason?: string | undefined;
        status: "CANCELED" | "PENDING" | "DENIED" | "APPROVED" | "EXPIRED";
        riskLevel: "YELLOW" | "RED";
        requestorAgentId: import("convex/values").GenericId<"agents">;
        actionType: string;
        actionSummary: string;
        justification: string;
        expiresAt: number;
    }, {
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        idempotencyKey: import("convex/values").VString<string | undefined, "optional">;
        taskId: import("convex/values").VId<import("convex/values").GenericId<"tasks"> | undefined, "optional">;
        toolCallId: import("convex/values").VId<import("convex/values").GenericId<"toolCalls"> | undefined, "optional">;
        requestorAgentId: import("convex/values").VId<import("convex/values").GenericId<"agents">, "required">;
        actionType: import("convex/values").VString<string, "required">;
        actionSummary: import("convex/values").VString<string, "required">;
        riskLevel: import("convex/values").VUnion<"YELLOW" | "RED", [import("convex/values").VLiteral<"YELLOW", "required">, import("convex/values").VLiteral<"RED", "required">], "required", never>;
        actionPayload: import("convex/values").VAny<any, "optional", string>;
        estimatedCost: import("convex/values").VFloat64<number | undefined, "optional">;
        rollbackPlan: import("convex/values").VString<string | undefined, "optional">;
        justification: import("convex/values").VString<string, "required">;
        status: import("convex/values").VUnion<"CANCELED" | "PENDING" | "DENIED" | "APPROVED" | "EXPIRED", [import("convex/values").VLiteral<"PENDING", "required">, import("convex/values").VLiteral<"APPROVED", "required">, import("convex/values").VLiteral<"DENIED", "required">, import("convex/values").VLiteral<"EXPIRED", "required">, import("convex/values").VLiteral<"CANCELED", "required">], "required", never>;
        decidedByAgentId: import("convex/values").VId<import("convex/values").GenericId<"agents"> | undefined, "optional">;
        decidedByUserId: import("convex/values").VString<string | undefined, "optional">;
        decidedAt: import("convex/values").VFloat64<number | undefined, "optional">;
        decisionReason: import("convex/values").VString<string | undefined, "optional">;
        expiresAt: import("convex/values").VFloat64<number, "required">;
    }, "required", "status" | "projectId" | "idempotencyKey" | "estimatedCost" | "taskId" | "riskLevel" | "toolCallId" | "requestorAgentId" | "actionType" | "actionSummary" | "actionPayload" | "rollbackPlan" | "justification" | "decidedByAgentId" | "decidedByUserId" | "decidedAt" | "decisionReason" | "expiresAt" | `actionPayload.${string}`>, {
        by_status: ["status", "_creationTime"];
        by_task: ["taskId", "_creationTime"];
        by_requestor: ["requestorAgentId", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
        by_project_status: ["projectId", "status", "_creationTime"];
    }, {}, {}>;
    activities: import("convex/server").TableDefinition<import("convex/values").VObject<{
        metadata?: any;
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        taskId?: import("convex/values").GenericId<"tasks"> | undefined;
        agentId?: import("convex/values").GenericId<"agents"> | undefined;
        actorId?: string | undefined;
        targetType?: string | undefined;
        targetId?: string | undefined;
        beforeState?: any;
        afterState?: any;
        description: string;
        actorType: "AGENT" | "HUMAN" | "SYSTEM";
        action: string;
    }, {
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        actorType: import("convex/values").VUnion<"AGENT" | "HUMAN" | "SYSTEM", [import("convex/values").VLiteral<"AGENT", "required">, import("convex/values").VLiteral<"HUMAN", "required">, import("convex/values").VLiteral<"SYSTEM", "required">], "required", never>;
        actorId: import("convex/values").VString<string | undefined, "optional">;
        action: import("convex/values").VString<string, "required">;
        description: import("convex/values").VString<string, "required">;
        targetType: import("convex/values").VString<string | undefined, "optional">;
        targetId: import("convex/values").VString<string | undefined, "optional">;
        taskId: import("convex/values").VId<import("convex/values").GenericId<"tasks"> | undefined, "optional">;
        agentId: import("convex/values").VId<import("convex/values").GenericId<"agents"> | undefined, "optional">;
        beforeState: import("convex/values").VAny<any, "optional", string>;
        afterState: import("convex/values").VAny<any, "optional", string>;
        metadata: import("convex/values").VAny<any, "optional", string>;
    }, "required", "description" | "metadata" | `metadata.${string}` | "projectId" | "actorType" | "taskId" | "agentId" | "actorId" | "action" | "targetType" | "targetId" | "beforeState" | "afterState" | `beforeState.${string}` | `afterState.${string}`>, {
        by_task: ["taskId", "_creationTime"];
        by_agent: ["agentId", "_creationTime"];
        by_action: ["action", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
    }, {}, {}>;
    alerts: import("convex/server").TableDefinition<import("convex/values").VObject<{
        metadata?: any;
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        taskId?: import("convex/values").GenericId<"tasks"> | undefined;
        agentId?: import("convex/values").GenericId<"agents"> | undefined;
        runId?: import("convex/values").GenericId<"runs"> | undefined;
        acknowledgedBy?: string | undefined;
        acknowledgedAt?: number | undefined;
        resolvedAt?: number | undefined;
        resolutionNote?: string | undefined;
        type: string;
        description: string;
        status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "IGNORED";
        title: string;
        severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
    }, {
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        severity: import("convex/values").VUnion<"INFO" | "WARNING" | "ERROR" | "CRITICAL", [import("convex/values").VLiteral<"INFO", "required">, import("convex/values").VLiteral<"WARNING", "required">, import("convex/values").VLiteral<"ERROR", "required">, import("convex/values").VLiteral<"CRITICAL", "required">], "required", never>;
        type: import("convex/values").VString<string, "required">;
        title: import("convex/values").VString<string, "required">;
        description: import("convex/values").VString<string, "required">;
        agentId: import("convex/values").VId<import("convex/values").GenericId<"agents"> | undefined, "optional">;
        taskId: import("convex/values").VId<import("convex/values").GenericId<"tasks"> | undefined, "optional">;
        runId: import("convex/values").VId<import("convex/values").GenericId<"runs"> | undefined, "optional">;
        status: import("convex/values").VUnion<"OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "IGNORED", [import("convex/values").VLiteral<"OPEN", "required">, import("convex/values").VLiteral<"ACKNOWLEDGED", "required">, import("convex/values").VLiteral<"RESOLVED", "required">, import("convex/values").VLiteral<"IGNORED", "required">], "required", never>;
        acknowledgedBy: import("convex/values").VString<string | undefined, "optional">;
        acknowledgedAt: import("convex/values").VFloat64<number | undefined, "optional">;
        resolvedAt: import("convex/values").VFloat64<number | undefined, "optional">;
        resolutionNote: import("convex/values").VString<string | undefined, "optional">;
        metadata: import("convex/values").VAny<any, "optional", string>;
    }, "required", "type" | "description" | "metadata" | `metadata.${string}` | "status" | "projectId" | "title" | "taskId" | "agentId" | "runId" | "severity" | "acknowledgedBy" | "acknowledgedAt" | "resolvedAt" | "resolutionNote">, {
        by_status: ["status", "_creationTime"];
        by_severity: ["severity", "_creationTime"];
        by_agent: ["agentId", "_creationTime"];
        by_task: ["taskId", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
    }, {}, {}>;
    notifications: import("convex/server").TableDefinition<import("convex/values").VObject<{
        metadata?: any;
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        taskId?: import("convex/values").GenericId<"tasks"> | undefined;
        approvalId?: import("convex/values").GenericId<"approvals"> | undefined;
        body?: string | undefined;
        messageId?: import("convex/values").GenericId<"messages"> | undefined;
        fromAgentId?: import("convex/values").GenericId<"agents"> | undefined;
        fromUserId?: string | undefined;
        readAt?: number | undefined;
        type: "SYSTEM" | "MENTION" | "TASK_ASSIGNED" | "TASK_TRANSITION" | "APPROVAL_REQUESTED" | "APPROVAL_DECIDED";
        title: string;
        agentId: import("convex/values").GenericId<"agents">;
    }, {
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        agentId: import("convex/values").VId<import("convex/values").GenericId<"agents">, "required">;
        type: import("convex/values").VUnion<"SYSTEM" | "MENTION" | "TASK_ASSIGNED" | "TASK_TRANSITION" | "APPROVAL_REQUESTED" | "APPROVAL_DECIDED", [import("convex/values").VLiteral<"MENTION", "required">, import("convex/values").VLiteral<"TASK_ASSIGNED", "required">, import("convex/values").VLiteral<"TASK_TRANSITION", "required">, import("convex/values").VLiteral<"APPROVAL_REQUESTED", "required">, import("convex/values").VLiteral<"APPROVAL_DECIDED", "required">, import("convex/values").VLiteral<"SYSTEM", "required">], "required", never>;
        title: import("convex/values").VString<string, "required">;
        body: import("convex/values").VString<string | undefined, "optional">;
        taskId: import("convex/values").VId<import("convex/values").GenericId<"tasks"> | undefined, "optional">;
        messageId: import("convex/values").VId<import("convex/values").GenericId<"messages"> | undefined, "optional">;
        approvalId: import("convex/values").VId<import("convex/values").GenericId<"approvals"> | undefined, "optional">;
        fromAgentId: import("convex/values").VId<import("convex/values").GenericId<"agents"> | undefined, "optional">;
        fromUserId: import("convex/values").VString<string | undefined, "optional">;
        readAt: import("convex/values").VFloat64<number | undefined, "optional">;
        metadata: import("convex/values").VAny<any, "optional", string>;
    }, "required", "type" | "metadata" | `metadata.${string}` | "projectId" | "title" | "taskId" | "agentId" | "approvalId" | "body" | "messageId" | "fromAgentId" | "fromUserId" | "readAt">, {
        by_agent: ["agentId", "_creationTime"];
        by_task: ["taskId", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
    }, {}, {}>;
    threadSubscriptions: import("convex/server").TableDefinition<import("convex/values").VObject<{
        metadata?: any;
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        taskId: import("convex/values").GenericId<"tasks">;
        agentId: import("convex/values").GenericId<"agents">;
        subscribedAt: number;
    }, {
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        agentId: import("convex/values").VId<import("convex/values").GenericId<"agents">, "required">;
        taskId: import("convex/values").VId<import("convex/values").GenericId<"tasks">, "required">;
        subscribedAt: import("convex/values").VFloat64<number, "required">;
        metadata: import("convex/values").VAny<any, "optional", string>;
    }, "required", "metadata" | `metadata.${string}` | "projectId" | "taskId" | "agentId" | "subscribedAt">, {
        by_agent: ["agentId", "_creationTime"];
        by_task: ["taskId", "_creationTime"];
        by_agent_task: ["agentId", "taskId", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
    }, {}, {}>;
    agentDocuments: import("convex/server").TableDefinition<import("convex/values").VObject<{
        metadata?: any;
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        type: "WORKING_MD" | "DAILY_NOTE" | "SESSION_MEMORY";
        content: string;
        agentId: import("convex/values").GenericId<"agents">;
        updatedAt: number;
    }, {
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        agentId: import("convex/values").VId<import("convex/values").GenericId<"agents">, "required">;
        type: import("convex/values").VUnion<"WORKING_MD" | "DAILY_NOTE" | "SESSION_MEMORY", [import("convex/values").VLiteral<"WORKING_MD", "required">, import("convex/values").VLiteral<"DAILY_NOTE", "required">, import("convex/values").VLiteral<"SESSION_MEMORY", "required">], "required", never>;
        content: import("convex/values").VString<string, "required">;
        updatedAt: import("convex/values").VFloat64<number, "required">;
        metadata: import("convex/values").VAny<any, "optional", string>;
    }, "required", "type" | "metadata" | `metadata.${string}` | "projectId" | "content" | "agentId" | "updatedAt">, {
        by_agent: ["agentId", "_creationTime"];
        by_agent_type: ["agentId", "type", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
    }, {}, {}>;
    executionRequests: import("convex/server").TableDefinition<import("convex/values").VObject<{
        metadata?: any;
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        completedAt?: number | undefined;
        taskId?: import("convex/values").GenericId<"tasks"> | undefined;
        assignedTo?: string | undefined;
        result?: any;
        assignedAt?: number | undefined;
        type: "CONTENT" | "SOCIAL" | "OPS" | "CODE_CHANGE" | "RESEARCH" | "EMAIL";
        status: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "PENDING";
        requestedBy: import("convex/values").GenericId<"agents">;
        executor: "CURSOR" | "CLAUDE_CODE" | "OPENCLAW_AGENT";
        payload: any;
        requestedAt: number;
    }, {
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        taskId: import("convex/values").VId<import("convex/values").GenericId<"tasks"> | undefined, "optional">;
        requestedBy: import("convex/values").VId<import("convex/values").GenericId<"agents">, "required">;
        assignedTo: import("convex/values").VString<string | undefined, "optional">;
        type: import("convex/values").VUnion<"CONTENT" | "SOCIAL" | "OPS" | "CODE_CHANGE" | "RESEARCH" | "EMAIL", [import("convex/values").VLiteral<"CODE_CHANGE", "required">, import("convex/values").VLiteral<"RESEARCH", "required">, import("convex/values").VLiteral<"CONTENT", "required">, import("convex/values").VLiteral<"EMAIL", "required">, import("convex/values").VLiteral<"SOCIAL", "required">, import("convex/values").VLiteral<"OPS", "required">], "required", never>;
        executor: import("convex/values").VUnion<"CURSOR" | "CLAUDE_CODE" | "OPENCLAW_AGENT", [import("convex/values").VLiteral<"CURSOR", "required">, import("convex/values").VLiteral<"CLAUDE_CODE", "required">, import("convex/values").VLiteral<"OPENCLAW_AGENT", "required">], "required", never>;
        status: import("convex/values").VUnion<"ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "PENDING", [import("convex/values").VLiteral<"PENDING", "required">, import("convex/values").VLiteral<"ASSIGNED", "required">, import("convex/values").VLiteral<"IN_PROGRESS", "required">, import("convex/values").VLiteral<"COMPLETED", "required">, import("convex/values").VLiteral<"FAILED", "required">], "required", never>;
        payload: import("convex/values").VAny<any, "required", string>;
        result: import("convex/values").VAny<any, "optional", string>;
        requestedAt: import("convex/values").VFloat64<number, "required">;
        assignedAt: import("convex/values").VFloat64<number | undefined, "optional">;
        completedAt: import("convex/values").VFloat64<number | undefined, "optional">;
        metadata: import("convex/values").VAny<any, "optional", string>;
    }, "required", "type" | "metadata" | `metadata.${string}` | "status" | "projectId" | "completedAt" | "taskId" | "requestedBy" | "assignedTo" | "executor" | "payload" | "result" | "requestedAt" | "assignedAt" | `payload.${string}` | `result.${string}`>, {
        by_status: ["status", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
        by_task: ["taskId", "_creationTime"];
        by_executor: ["executor", "_creationTime"];
        by_project_status: ["projectId", "status", "_creationTime"];
    }, {}, {}>;
    policies: import("convex/server").TableDefinition<import("convex/values").VObject<{
        budgetDefaults?: any;
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        scopeId?: string | undefined;
        toolRiskMap?: any;
        shellAllowlist?: string[] | undefined;
        shellBlocklist?: string[] | undefined;
        fileReadPaths?: string[] | undefined;
        fileWritePaths?: string[] | undefined;
        networkAllowlist?: string[] | undefined;
        spawnLimits?: any;
        loopThresholds?: any;
        createdBy?: string | undefined;
        notes?: string | undefined;
        name: string;
        version: number;
        scopeType: "AGENT" | "GLOBAL" | "TASK_TYPE";
        rules: any;
        active: boolean;
    }, {
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        version: import("convex/values").VFloat64<number, "required">;
        name: import("convex/values").VString<string, "required">;
        scopeType: import("convex/values").VUnion<"AGENT" | "GLOBAL" | "TASK_TYPE", [import("convex/values").VLiteral<"GLOBAL", "required">, import("convex/values").VLiteral<"AGENT", "required">, import("convex/values").VLiteral<"TASK_TYPE", "required">], "required", never>;
        scopeId: import("convex/values").VString<string | undefined, "optional">;
        rules: import("convex/values").VAny<any, "required", string>;
        toolRiskMap: import("convex/values").VAny<any, "optional", string>;
        shellAllowlist: import("convex/values").VArray<string[] | undefined, import("convex/values").VString<string, "required">, "optional">;
        shellBlocklist: import("convex/values").VArray<string[] | undefined, import("convex/values").VString<string, "required">, "optional">;
        fileReadPaths: import("convex/values").VArray<string[] | undefined, import("convex/values").VString<string, "required">, "optional">;
        fileWritePaths: import("convex/values").VArray<string[] | undefined, import("convex/values").VString<string, "required">, "optional">;
        networkAllowlist: import("convex/values").VArray<string[] | undefined, import("convex/values").VString<string, "required">, "optional">;
        budgetDefaults: import("convex/values").VAny<any, "optional", string>;
        spawnLimits: import("convex/values").VAny<any, "optional", string>;
        loopThresholds: import("convex/values").VAny<any, "optional", string>;
        active: import("convex/values").VBoolean<boolean, "required">;
        createdBy: import("convex/values").VString<string | undefined, "optional">;
        notes: import("convex/values").VString<string | undefined, "optional">;
    }, "required", "name" | "budgetDefaults" | `budgetDefaults.${string}` | "projectId" | "version" | "scopeType" | "scopeId" | "rules" | "toolRiskMap" | "shellAllowlist" | "shellBlocklist" | "fileReadPaths" | "fileWritePaths" | "networkAllowlist" | "spawnLimits" | "loopThresholds" | "active" | "createdBy" | "notes" | `rules.${string}` | `toolRiskMap.${string}` | `spawnLimits.${string}` | `loopThresholds.${string}`>, {
        by_active: ["active", "_creationTime"];
        by_name: ["name", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
        by_project_active: ["projectId", "active", "_creationTime"];
    }, {}, {}>;
}, true>;
export default _default;
//# sourceMappingURL=schema.d.ts.map