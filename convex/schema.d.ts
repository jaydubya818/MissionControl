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
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        parentAgentId?: import("convex/values").GenericId<"agents"> | undefined;
        metadata?: any;
        emoji?: string | undefined;
        soulVersionHash?: string | undefined;
        allowedTools?: string[] | undefined;
        spendResetAt?: number | undefined;
        currentTaskId?: import("convex/values").GenericId<"tasks"> | undefined;
        lastHeartbeatAt?: number | undefined;
        lastError?: string | undefined;
        spendToday: number;
        name: string;
        status: "ACTIVE" | "PAUSED" | "QUARANTINED" | "DRAINED" | "OFFLINE";
        role: "INTERN" | "SPECIALIST" | "LEAD";
        workspacePath: string;
        allowedTaskTypes: string[];
        budgetDaily: number;
        budgetPerRun: number;
        canSpawn: boolean;
        maxSubAgents: number;
        errorStreak: number;
    }, {
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        name: import("convex/values").VString<string, "required">;
        emoji: import("convex/values").VString<string | undefined, "optional">;
        role: import("convex/values").VUnion<"INTERN" | "SPECIALIST" | "LEAD", [import("convex/values").VLiteral<"INTERN", "required">, import("convex/values").VLiteral<"SPECIALIST", "required">, import("convex/values").VLiteral<"LEAD", "required">], "required", never>;
        status: import("convex/values").VUnion<"ACTIVE" | "PAUSED" | "QUARANTINED" | "DRAINED" | "OFFLINE", [import("convex/values").VLiteral<"ACTIVE", "required">, import("convex/values").VLiteral<"PAUSED", "required">, import("convex/values").VLiteral<"DRAINED", "required">, import("convex/values").VLiteral<"QUARANTINED", "required">, import("convex/values").VLiteral<"OFFLINE", "required">], "required", never>;
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
    }, "required", "projectId" | "spendToday" | "name" | "status" | "parentAgentId" | "metadata" | `metadata.${string}` | "role" | "emoji" | "workspacePath" | "soulVersionHash" | "allowedTaskTypes" | "allowedTools" | "budgetDaily" | "budgetPerRun" | "spendResetAt" | "canSpawn" | "maxSubAgents" | "currentTaskId" | "lastHeartbeatAt" | "lastError" | "errorStreak">, {
        by_status: ["status", "_creationTime"];
        by_role: ["role", "_creationTime"];
        by_name: ["name", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
        by_project_status: ["projectId", "status", "_creationTime"];
    }, {}, {}>;
    tasks: import("convex/server").TableDefinition<import("convex/values").VObject<{
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        idempotencyKey?: string | undefined;
        workPlan?: {
            estimatedCost?: number | undefined;
            estimatedDuration?: string | undefined;
            bullets: string[];
        } | undefined;
        deliverable?: {
            content?: string | undefined;
            summary?: string | undefined;
            artifactIds?: string[] | undefined;
        } | undefined;
        estimatedCost?: number | undefined;
        completedAt?: number | undefined;
        blockedReason?: string | undefined;
        reviewChecklist?: {
            type: string;
            items: {
                note?: string | undefined;
                label: string;
                checked: boolean;
            }[];
        } | undefined;
        description?: string | undefined;
        metadata?: any;
        creatorAgentId?: import("convex/values").GenericId<"agents"> | undefined;
        reviewerId?: import("convex/values").GenericId<"agents"> | undefined;
        parentTaskId?: import("convex/values").GenericId<"tasks"> | undefined;
        budgetAllocated?: number | undefined;
        budgetRemaining?: number | undefined;
        dueAt?: number | undefined;
        startedAt?: number | undefined;
        submittedAt?: number | undefined;
        labels?: string[] | undefined;
        threadRef?: string | undefined;
        redactedFields?: string[] | undefined;
        type: "CONTENT" | "SOCIAL" | "OPS" | "ENGINEERING" | "DOCS" | "CUSTOMER_RESEARCH" | "EMAIL_MARKETING" | "SEO_RESEARCH";
        status: "ASSIGNED" | "INBOX" | "CANCELED" | "IN_PROGRESS" | "REVIEW" | "NEEDS_APPROVAL" | "BLOCKED" | "DONE";
        assigneeIds: import("convex/values").GenericId<"agents">[];
        priority: 1 | 2 | 3 | 4;
        title: string;
        reviewCycles: number;
        actualCost: number;
    }, {
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        idempotencyKey: import("convex/values").VString<string | undefined, "optional">;
        title: import("convex/values").VString<string, "required">;
        description: import("convex/values").VString<string | undefined, "optional">;
        type: import("convex/values").VUnion<"CONTENT" | "SOCIAL" | "OPS" | "ENGINEERING" | "DOCS" | "CUSTOMER_RESEARCH" | "EMAIL_MARKETING" | "SEO_RESEARCH", [import("convex/values").VLiteral<"CONTENT", "required">, import("convex/values").VLiteral<"SOCIAL", "required">, import("convex/values").VLiteral<"EMAIL_MARKETING", "required">, import("convex/values").VLiteral<"CUSTOMER_RESEARCH", "required">, import("convex/values").VLiteral<"SEO_RESEARCH", "required">, import("convex/values").VLiteral<"ENGINEERING", "required">, import("convex/values").VLiteral<"DOCS", "required">, import("convex/values").VLiteral<"OPS", "required">], "required", never>;
        status: import("convex/values").VUnion<"ASSIGNED" | "INBOX" | "CANCELED" | "IN_PROGRESS" | "REVIEW" | "NEEDS_APPROVAL" | "BLOCKED" | "DONE", [import("convex/values").VLiteral<"INBOX", "required">, import("convex/values").VLiteral<"ASSIGNED", "required">, import("convex/values").VLiteral<"IN_PROGRESS", "required">, import("convex/values").VLiteral<"REVIEW", "required">, import("convex/values").VLiteral<"NEEDS_APPROVAL", "required">, import("convex/values").VLiteral<"BLOCKED", "required">, import("convex/values").VLiteral<"DONE", "required">, import("convex/values").VLiteral<"CANCELED", "required">], "required", never>;
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
        }, "optional", "estimatedCost" | "bullets" | "estimatedDuration">;
        deliverable: import("convex/values").VObject<{
            content?: string | undefined;
            summary?: string | undefined;
            artifactIds?: string[] | undefined;
        } | undefined, {
            summary: import("convex/values").VString<string | undefined, "optional">;
            content: import("convex/values").VString<string | undefined, "optional">;
            artifactIds: import("convex/values").VArray<string[] | undefined, import("convex/values").VString<string, "required">, "optional">;
        }, "optional", "content" | "summary" | "artifactIds">;
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
    }, "required", "projectId" | "type" | "status" | "idempotencyKey" | "assigneeIds" | "workPlan" | "deliverable" | "estimatedCost" | "priority" | "completedAt" | "blockedReason" | "workPlan.bullets" | "reviewChecklist" | "description" | "metadata" | `metadata.${string}` | "title" | "creatorAgentId" | "reviewerId" | "parentTaskId" | "reviewCycles" | "actualCost" | "budgetAllocated" | "budgetRemaining" | "dueAt" | "startedAt" | "submittedAt" | "labels" | "threadRef" | "redactedFields" | "workPlan.estimatedCost" | "workPlan.estimatedDuration" | "deliverable.content" | "deliverable.summary" | "deliverable.artifactIds" | "reviewChecklist.type" | "reviewChecklist.items">, {
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
                message: string;
                field: string;
            }[] | undefined;
            valid: boolean;
        } | undefined;
        artifactsSnapshot?: any;
        reason?: string | undefined;
        sessionKey?: string | undefined;
        taskId: import("convex/values").GenericId<"tasks">;
        idempotencyKey: string;
        toStatus: string;
        actorType: "SYSTEM" | "AGENT" | "HUMAN";
        fromStatus: string;
    }, {
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        idempotencyKey: import("convex/values").VString<string, "required">;
        taskId: import("convex/values").VId<import("convex/values").GenericId<"tasks">, "required">;
        fromStatus: import("convex/values").VString<string, "required">;
        toStatus: import("convex/values").VString<string, "required">;
        actorType: import("convex/values").VUnion<"SYSTEM" | "AGENT" | "HUMAN", [import("convex/values").VLiteral<"AGENT", "required">, import("convex/values").VLiteral<"HUMAN", "required">, import("convex/values").VLiteral<"SYSTEM", "required">], "required", never>;
        actorAgentId: import("convex/values").VId<import("convex/values").GenericId<"agents"> | undefined, "optional">;
        actorUserId: import("convex/values").VString<string | undefined, "optional">;
        validationResult: import("convex/values").VObject<{
            errors?: {
                message: string;
                field: string;
            }[] | undefined;
            valid: boolean;
        } | undefined, {
            valid: import("convex/values").VBoolean<boolean, "required">;
            errors: import("convex/values").VArray<{
                message: string;
                field: string;
            }[] | undefined, import("convex/values").VObject<{
                message: string;
                field: string;
            }, {
                field: import("convex/values").VString<string, "required">;
                message: import("convex/values").VString<string, "required">;
            }, "required", "message" | "field">, "optional">;
        }, "optional", "errors" | "valid">;
        artifactsSnapshot: import("convex/values").VAny<any, "optional", string>;
        reason: import("convex/values").VString<string | undefined, "optional">;
        sessionKey: import("convex/values").VString<string | undefined, "optional">;
    }, "required", "projectId" | "taskId" | "idempotencyKey" | "toStatus" | "actorType" | "fromStatus" | "actorAgentId" | "actorUserId" | "validationResult" | "artifactsSnapshot" | "reason" | "sessionKey" | "validationResult.errors" | "validationResult.valid" | `artifactsSnapshot.${string}`>, {
        by_task: ["taskId", "_creationTime"];
        by_idempotency: ["idempotencyKey", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
    }, {}, {}>;
    messages: import("convex/server").TableDefinition<import("convex/values").VObject<{
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        idempotencyKey?: string | undefined;
        metadata?: any;
        threadRef?: string | undefined;
        redactedFields?: string[] | undefined;
        authorAgentId?: import("convex/values").GenericId<"agents"> | undefined;
        authorUserId?: string | undefined;
        contentRedacted?: string | undefined;
        artifacts?: {
            url?: string | undefined;
            content?: string | undefined;
            type: string;
            name: string;
        }[] | undefined;
        mentions?: string[] | undefined;
        replyToId?: import("convex/values").GenericId<"messages"> | undefined;
        taskId: import("convex/values").GenericId<"tasks">;
        type: "SYSTEM" | "COMMENT" | "REVIEW" | "WORK_PLAN" | "PROGRESS" | "ARTIFACT" | "APPROVAL_REQUEST";
        content: string;
        authorType: "SYSTEM" | "AGENT" | "HUMAN";
    }, {
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        idempotencyKey: import("convex/values").VString<string | undefined, "optional">;
        taskId: import("convex/values").VId<import("convex/values").GenericId<"tasks">, "required">;
        authorType: import("convex/values").VUnion<"SYSTEM" | "AGENT" | "HUMAN", [import("convex/values").VLiteral<"AGENT", "required">, import("convex/values").VLiteral<"HUMAN", "required">, import("convex/values").VLiteral<"SYSTEM", "required">], "required", never>;
        authorAgentId: import("convex/values").VId<import("convex/values").GenericId<"agents"> | undefined, "optional">;
        authorUserId: import("convex/values").VString<string | undefined, "optional">;
        type: import("convex/values").VUnion<"SYSTEM" | "COMMENT" | "REVIEW" | "WORK_PLAN" | "PROGRESS" | "ARTIFACT" | "APPROVAL_REQUEST", [import("convex/values").VLiteral<"COMMENT", "required">, import("convex/values").VLiteral<"WORK_PLAN", "required">, import("convex/values").VLiteral<"PROGRESS", "required">, import("convex/values").VLiteral<"ARTIFACT", "required">, import("convex/values").VLiteral<"REVIEW", "required">, import("convex/values").VLiteral<"APPROVAL_REQUEST", "required">, import("convex/values").VLiteral<"SYSTEM", "required">], "required", never>;
        content: import("convex/values").VString<string, "required">;
        contentRedacted: import("convex/values").VString<string | undefined, "optional">;
        artifacts: import("convex/values").VArray<{
            url?: string | undefined;
            content?: string | undefined;
            type: string;
            name: string;
        }[] | undefined, import("convex/values").VObject<{
            url?: string | undefined;
            content?: string | undefined;
            type: string;
            name: string;
        }, {
            name: import("convex/values").VString<string, "required">;
            type: import("convex/values").VString<string, "required">;
            url: import("convex/values").VString<string | undefined, "optional">;
            content: import("convex/values").VString<string | undefined, "optional">;
        }, "required", "type" | "name" | "url" | "content">, "optional">;
        mentions: import("convex/values").VArray<string[] | undefined, import("convex/values").VString<string, "required">, "optional">;
        replyToId: import("convex/values").VId<import("convex/values").GenericId<"messages"> | undefined, "optional">;
        threadRef: import("convex/values").VString<string | undefined, "optional">;
        redactedFields: import("convex/values").VArray<string[] | undefined, import("convex/values").VString<string, "required">, "optional">;
        metadata: import("convex/values").VAny<any, "optional", string>;
    }, "required", "projectId" | "taskId" | "type" | "idempotencyKey" | "content" | "metadata" | `metadata.${string}` | "threadRef" | "redactedFields" | "authorType" | "authorAgentId" | "authorUserId" | "contentRedacted" | "artifacts" | "mentions" | "replyToId">, {
        by_task: ["taskId", "_creationTime"];
        by_author_agent: ["authorAgentId", "_creationTime"];
        by_idempotency: ["idempotencyKey", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
    }, {}, {}>;
    runs: import("convex/server").TableDefinition<import("convex/values").VObject<{
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        taskId?: import("convex/values").GenericId<"tasks"> | undefined;
        error?: string | undefined;
        metadata?: any;
        budgetAllocated?: number | undefined;
        endedAt?: number | undefined;
        durationMs?: number | undefined;
        cacheReadTokens?: number | undefined;
        cacheWriteTokens?: number | undefined;
        agentId: import("convex/values").GenericId<"agents">;
        status: "COMPLETED" | "FAILED" | "RUNNING" | "TIMEOUT";
        idempotencyKey: string;
        startedAt: number;
        sessionKey: string;
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
        status: import("convex/values").VUnion<"COMPLETED" | "FAILED" | "RUNNING" | "TIMEOUT", [import("convex/values").VLiteral<"RUNNING", "required">, import("convex/values").VLiteral<"COMPLETED", "required">, import("convex/values").VLiteral<"FAILED", "required">, import("convex/values").VLiteral<"TIMEOUT", "required">], "required", never>;
        error: import("convex/values").VString<string | undefined, "optional">;
        metadata: import("convex/values").VAny<any, "optional", string>;
    }, "required", "projectId" | "taskId" | "agentId" | "error" | "status" | "idempotencyKey" | "metadata" | `metadata.${string}` | "budgetAllocated" | "startedAt" | "sessionKey" | "endedAt" | "durationMs" | "model" | "inputTokens" | "outputTokens" | "cacheReadTokens" | "cacheWriteTokens" | "costUsd">, {
        by_agent: ["agentId", "_creationTime"];
        by_task: ["taskId", "_creationTime"];
        by_session: ["sessionKey", "_creationTime"];
        by_idempotency: ["idempotencyKey", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
    }, {}, {}>;
    toolCalls: import("convex/server").TableDefinition<import("convex/values").VObject<{
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        taskId?: import("convex/values").GenericId<"tasks"> | undefined;
        error?: string | undefined;
        endedAt?: number | undefined;
        durationMs?: number | undefined;
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
        agentId: import("convex/values").GenericId<"agents">;
        status: "PENDING" | "DENIED" | "FAILED" | "RUNNING" | "SUCCESS";
        riskLevel: "YELLOW" | "RED" | "GREEN";
        runId: import("convex/values").GenericId<"runs">;
        startedAt: number;
        toolName: string;
        retryCount: number;
    }, {
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        runId: import("convex/values").VId<import("convex/values").GenericId<"runs">, "required">;
        agentId: import("convex/values").VId<import("convex/values").GenericId<"agents">, "required">;
        taskId: import("convex/values").VId<import("convex/values").GenericId<"tasks"> | undefined, "optional">;
        toolName: import("convex/values").VString<string, "required">;
        toolVersion: import("convex/values").VString<string | undefined, "optional">;
        riskLevel: import("convex/values").VUnion<"YELLOW" | "RED" | "GREEN", [import("convex/values").VLiteral<"GREEN", "required">, import("convex/values").VLiteral<"YELLOW", "required">, import("convex/values").VLiteral<"RED", "required">], "required", never>;
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
        status: import("convex/values").VUnion<"PENDING" | "DENIED" | "FAILED" | "RUNNING" | "SUCCESS", [import("convex/values").VLiteral<"PENDING", "required">, import("convex/values").VLiteral<"RUNNING", "required">, import("convex/values").VLiteral<"SUCCESS", "required">, import("convex/values").VLiteral<"FAILED", "required">, import("convex/values").VLiteral<"DENIED", "required">], "required", never>;
        error: import("convex/values").VString<string | undefined, "optional">;
        retryCount: import("convex/values").VFloat64<number, "required">;
    }, "required", "projectId" | "taskId" | "agentId" | "error" | "status" | "riskLevel" | "runId" | "startedAt" | "endedAt" | "durationMs" | "toolName" | "toolVersion" | "policyResult" | "inputPreview" | "outputPreview" | "inputHash" | "outputHash" | "retryCount" | "policyResult.reason" | "policyResult.decision" | "policyResult.approvalId">, {
        by_run: ["runId", "_creationTime"];
        by_agent: ["agentId", "_creationTime"];
        by_task: ["taskId", "_creationTime"];
        by_risk: ["riskLevel", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
    }, {}, {}>;
    approvals: import("convex/server").TableDefinition<import("convex/values").VObject<{
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        taskId?: import("convex/values").GenericId<"tasks"> | undefined;
        idempotencyKey?: string | undefined;
        estimatedCost?: number | undefined;
        toolCallId?: import("convex/values").GenericId<"toolCalls"> | undefined;
        actionPayload?: any;
        rollbackPlan?: string | undefined;
        decidedByAgentId?: import("convex/values").GenericId<"agents"> | undefined;
        decidedByUserId?: string | undefined;
        decidedAt?: number | undefined;
        decisionReason?: string | undefined;
        status: "PENDING" | "EXPIRED" | "APPROVED" | "DENIED" | "CANCELED";
        requestorAgentId: import("convex/values").GenericId<"agents">;
        riskLevel: "YELLOW" | "RED";
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
        status: import("convex/values").VUnion<"PENDING" | "EXPIRED" | "APPROVED" | "DENIED" | "CANCELED", [import("convex/values").VLiteral<"PENDING", "required">, import("convex/values").VLiteral<"APPROVED", "required">, import("convex/values").VLiteral<"DENIED", "required">, import("convex/values").VLiteral<"EXPIRED", "required">, import("convex/values").VLiteral<"CANCELED", "required">], "required", never>;
        decidedByAgentId: import("convex/values").VId<import("convex/values").GenericId<"agents"> | undefined, "optional">;
        decidedByUserId: import("convex/values").VString<string | undefined, "optional">;
        decidedAt: import("convex/values").VFloat64<number | undefined, "optional">;
        decisionReason: import("convex/values").VString<string | undefined, "optional">;
        expiresAt: import("convex/values").VFloat64<number, "required">;
    }, "required", "projectId" | "taskId" | "status" | "requestorAgentId" | "idempotencyKey" | "riskLevel" | "estimatedCost" | "toolCallId" | "actionType" | "actionSummary" | "actionPayload" | "rollbackPlan" | "justification" | "decidedByAgentId" | "decidedByUserId" | "decidedAt" | "decisionReason" | "expiresAt" | `actionPayload.${string}`>, {
        by_status: ["status", "_creationTime"];
        by_task: ["taskId", "_creationTime"];
        by_requestor: ["requestorAgentId", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
        by_project_status: ["projectId", "status", "_creationTime"];
    }, {}, {}>;
    activities: import("convex/server").TableDefinition<import("convex/values").VObject<{
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        taskId?: import("convex/values").GenericId<"tasks"> | undefined;
        agentId?: import("convex/values").GenericId<"agents"> | undefined;
        metadata?: any;
        actorId?: string | undefined;
        targetType?: string | undefined;
        targetId?: string | undefined;
        beforeState?: any;
        afterState?: any;
        action: string;
        actorType: "SYSTEM" | "AGENT" | "HUMAN";
        description: string;
    }, {
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        actorType: import("convex/values").VUnion<"SYSTEM" | "AGENT" | "HUMAN", [import("convex/values").VLiteral<"AGENT", "required">, import("convex/values").VLiteral<"HUMAN", "required">, import("convex/values").VLiteral<"SYSTEM", "required">], "required", never>;
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
    }, "required", "projectId" | "taskId" | "agentId" | "action" | "actorType" | "description" | "metadata" | `metadata.${string}` | "actorId" | "targetType" | "targetId" | "beforeState" | "afterState" | `beforeState.${string}` | `afterState.${string}`>, {
        by_task: ["taskId", "_creationTime"];
        by_agent: ["agentId", "_creationTime"];
        by_action: ["action", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
    }, {}, {}>;
    alerts: import("convex/server").TableDefinition<import("convex/values").VObject<{
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        taskId?: import("convex/values").GenericId<"tasks"> | undefined;
        agentId?: import("convex/values").GenericId<"agents"> | undefined;
        runId?: import("convex/values").GenericId<"runs"> | undefined;
        metadata?: any;
        acknowledgedBy?: string | undefined;
        acknowledgedAt?: number | undefined;
        resolvedAt?: number | undefined;
        resolutionNote?: string | undefined;
        type: string;
        status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "IGNORED";
        severity: "WARNING" | "ERROR" | "CRITICAL" | "INFO";
        description: string;
        title: string;
    }, {
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        severity: import("convex/values").VUnion<"WARNING" | "ERROR" | "CRITICAL" | "INFO", [import("convex/values").VLiteral<"INFO", "required">, import("convex/values").VLiteral<"WARNING", "required">, import("convex/values").VLiteral<"ERROR", "required">, import("convex/values").VLiteral<"CRITICAL", "required">], "required", never>;
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
    }, "required", "projectId" | "taskId" | "agentId" | "type" | "status" | "severity" | "runId" | "description" | "metadata" | `metadata.${string}` | "title" | "acknowledgedBy" | "acknowledgedAt" | "resolvedAt" | "resolutionNote">, {
        by_status: ["status", "_creationTime"];
        by_severity: ["severity", "_creationTime"];
        by_agent: ["agentId", "_creationTime"];
        by_task: ["taskId", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
    }, {}, {}>;
    notifications: import("convex/server").TableDefinition<import("convex/values").VObject<{
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        taskId?: import("convex/values").GenericId<"tasks"> | undefined;
        metadata?: any;
        approvalId?: import("convex/values").GenericId<"approvals"> | undefined;
        body?: string | undefined;
        messageId?: import("convex/values").GenericId<"messages"> | undefined;
        fromAgentId?: import("convex/values").GenericId<"agents"> | undefined;
        fromUserId?: string | undefined;
        readAt?: number | undefined;
        agentId: import("convex/values").GenericId<"agents">;
        type: "SYSTEM" | "APPROVAL_REQUESTED" | "MENTION" | "TASK_ASSIGNED" | "TASK_TRANSITION" | "APPROVAL_DECIDED";
        title: string;
    }, {
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        agentId: import("convex/values").VId<import("convex/values").GenericId<"agents">, "required">;
        type: import("convex/values").VUnion<"SYSTEM" | "APPROVAL_REQUESTED" | "MENTION" | "TASK_ASSIGNED" | "TASK_TRANSITION" | "APPROVAL_DECIDED", [import("convex/values").VLiteral<"MENTION", "required">, import("convex/values").VLiteral<"TASK_ASSIGNED", "required">, import("convex/values").VLiteral<"TASK_TRANSITION", "required">, import("convex/values").VLiteral<"APPROVAL_REQUESTED", "required">, import("convex/values").VLiteral<"APPROVAL_DECIDED", "required">, import("convex/values").VLiteral<"SYSTEM", "required">], "required", never>;
        title: import("convex/values").VString<string, "required">;
        body: import("convex/values").VString<string | undefined, "optional">;
        taskId: import("convex/values").VId<import("convex/values").GenericId<"tasks"> | undefined, "optional">;
        messageId: import("convex/values").VId<import("convex/values").GenericId<"messages"> | undefined, "optional">;
        approvalId: import("convex/values").VId<import("convex/values").GenericId<"approvals"> | undefined, "optional">;
        fromAgentId: import("convex/values").VId<import("convex/values").GenericId<"agents"> | undefined, "optional">;
        fromUserId: import("convex/values").VString<string | undefined, "optional">;
        readAt: import("convex/values").VFloat64<number | undefined, "optional">;
        metadata: import("convex/values").VAny<any, "optional", string>;
    }, "required", "projectId" | "taskId" | "agentId" | "type" | "metadata" | `metadata.${string}` | "title" | "approvalId" | "body" | "messageId" | "fromAgentId" | "fromUserId" | "readAt">, {
        by_agent: ["agentId", "_creationTime"];
        by_task: ["taskId", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
    }, {}, {}>;
    threadSubscriptions: import("convex/server").TableDefinition<import("convex/values").VObject<{
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        metadata?: any;
        taskId: import("convex/values").GenericId<"tasks">;
        agentId: import("convex/values").GenericId<"agents">;
        subscribedAt: number;
    }, {
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        agentId: import("convex/values").VId<import("convex/values").GenericId<"agents">, "required">;
        taskId: import("convex/values").VId<import("convex/values").GenericId<"tasks">, "required">;
        subscribedAt: import("convex/values").VFloat64<number, "required">;
        metadata: import("convex/values").VAny<any, "optional", string>;
    }, "required", "projectId" | "taskId" | "agentId" | "metadata" | `metadata.${string}` | "subscribedAt">, {
        by_agent: ["agentId", "_creationTime"];
        by_task: ["taskId", "_creationTime"];
        by_agent_task: ["agentId", "taskId", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
    }, {}, {}>;
    agentDocuments: import("convex/server").TableDefinition<import("convex/values").VObject<{
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        metadata?: any;
        agentId: import("convex/values").GenericId<"agents">;
        type: "WORKING_MD" | "DAILY_NOTE" | "SESSION_MEMORY";
        content: string;
        updatedAt: number;
    }, {
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        agentId: import("convex/values").VId<import("convex/values").GenericId<"agents">, "required">;
        type: import("convex/values").VUnion<"WORKING_MD" | "DAILY_NOTE" | "SESSION_MEMORY", [import("convex/values").VLiteral<"WORKING_MD", "required">, import("convex/values").VLiteral<"DAILY_NOTE", "required">, import("convex/values").VLiteral<"SESSION_MEMORY", "required">], "required", never>;
        content: import("convex/values").VString<string, "required">;
        updatedAt: import("convex/values").VFloat64<number, "required">;
        metadata: import("convex/values").VAny<any, "optional", string>;
    }, "required", "projectId" | "agentId" | "type" | "content" | "metadata" | `metadata.${string}` | "updatedAt">, {
        by_agent: ["agentId", "_creationTime"];
        by_agent_type: ["agentId", "type", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
    }, {}, {}>;
    executionRequests: import("convex/server").TableDefinition<import("convex/values").VObject<{
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        taskId?: import("convex/values").GenericId<"tasks"> | undefined;
        assignedTo?: string | undefined;
        completedAt?: number | undefined;
        metadata?: any;
        result?: any;
        assignedAt?: number | undefined;
        type: "CODE_CHANGE" | "RESEARCH" | "CONTENT" | "EMAIL" | "SOCIAL" | "OPS";
        status: "ASSIGNED" | "PENDING" | "COMPLETED" | "FAILED" | "IN_PROGRESS";
        executor: "OPENCLAW_AGENT" | "CURSOR" | "CLAUDE_CODE";
        requestedBy: import("convex/values").GenericId<"agents">;
        payload: any;
        requestedAt: number;
    }, {
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        taskId: import("convex/values").VId<import("convex/values").GenericId<"tasks"> | undefined, "optional">;
        requestedBy: import("convex/values").VId<import("convex/values").GenericId<"agents">, "required">;
        assignedTo: import("convex/values").VString<string | undefined, "optional">;
        type: import("convex/values").VUnion<"CODE_CHANGE" | "RESEARCH" | "CONTENT" | "EMAIL" | "SOCIAL" | "OPS", [import("convex/values").VLiteral<"CODE_CHANGE", "required">, import("convex/values").VLiteral<"RESEARCH", "required">, import("convex/values").VLiteral<"CONTENT", "required">, import("convex/values").VLiteral<"EMAIL", "required">, import("convex/values").VLiteral<"SOCIAL", "required">, import("convex/values").VLiteral<"OPS", "required">], "required", never>;
        executor: import("convex/values").VUnion<"OPENCLAW_AGENT" | "CURSOR" | "CLAUDE_CODE", [import("convex/values").VLiteral<"CURSOR", "required">, import("convex/values").VLiteral<"CLAUDE_CODE", "required">, import("convex/values").VLiteral<"OPENCLAW_AGENT", "required">], "required", never>;
        status: import("convex/values").VUnion<"ASSIGNED" | "PENDING" | "COMPLETED" | "FAILED" | "IN_PROGRESS", [import("convex/values").VLiteral<"PENDING", "required">, import("convex/values").VLiteral<"ASSIGNED", "required">, import("convex/values").VLiteral<"IN_PROGRESS", "required">, import("convex/values").VLiteral<"COMPLETED", "required">, import("convex/values").VLiteral<"FAILED", "required">], "required", never>;
        payload: import("convex/values").VAny<any, "required", string>;
        result: import("convex/values").VAny<any, "optional", string>;
        requestedAt: import("convex/values").VFloat64<number, "required">;
        assignedAt: import("convex/values").VFloat64<number | undefined, "optional">;
        completedAt: import("convex/values").VFloat64<number | undefined, "optional">;
        metadata: import("convex/values").VAny<any, "optional", string>;
    }, "required", "projectId" | "taskId" | "type" | "status" | "executor" | "assignedTo" | "completedAt" | "metadata" | `metadata.${string}` | "requestedBy" | "payload" | "result" | "requestedAt" | "assignedAt" | `payload.${string}` | `result.${string}`>, {
        by_status: ["status", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
        by_task: ["taskId", "_creationTime"];
        by_executor: ["executor", "_creationTime"];
        by_project_status: ["projectId", "status", "_creationTime"];
    }, {}, {}>;
    policies: import("convex/server").TableDefinition<import("convex/values").VObject<{
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        budgetDefaults?: any;
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
        active: boolean;
        version: number;
        scopeType: "AGENT" | "GLOBAL" | "TASK_TYPE";
        rules: any;
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
    }, "required", "projectId" | "name" | "active" | "budgetDefaults" | `budgetDefaults.${string}` | "version" | "scopeType" | "scopeId" | "rules" | "toolRiskMap" | "shellAllowlist" | "shellBlocklist" | "fileReadPaths" | "fileWritePaths" | "networkAllowlist" | "spawnLimits" | "loopThresholds" | "createdBy" | "notes" | `rules.${string}` | `toolRiskMap.${string}` | `spawnLimits.${string}` | `loopThresholds.${string}`>, {
        by_active: ["active", "_creationTime"];
        by_name: ["name", "_creationTime"];
        by_project: ["projectId", "_creationTime"];
        by_project_active: ["projectId", "active", "_creationTime"];
    }, {}, {}>;
    webhooks: import("convex/server").TableDefinition<import("convex/values").VObject<{
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        createdBy?: string | undefined;
        filters?: {
            taskTypes?: string[] | undefined;
            agentIds?: import("convex/values").GenericId<"agents">[] | undefined;
            statuses?: string[] | undefined;
        } | undefined;
        lastDeliveryAt?: number | undefined;
        lastFailureAt?: number | undefined;
        name: string;
        active: boolean;
        url: string;
        secret: string;
        events: string[];
        deliveryCount: number;
        failureCount: number;
    }, {
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        name: import("convex/values").VString<string, "required">;
        url: import("convex/values").VString<string, "required">;
        secret: import("convex/values").VString<string, "required">;
        events: import("convex/values").VArray<string[], import("convex/values").VString<string, "required">, "required">;
        filters: import("convex/values").VObject<{
            taskTypes?: string[] | undefined;
            agentIds?: import("convex/values").GenericId<"agents">[] | undefined;
            statuses?: string[] | undefined;
        } | undefined, {
            taskTypes: import("convex/values").VArray<string[] | undefined, import("convex/values").VString<string, "required">, "optional">;
            agentIds: import("convex/values").VArray<import("convex/values").GenericId<"agents">[] | undefined, import("convex/values").VId<import("convex/values").GenericId<"agents">, "required">, "optional">;
            statuses: import("convex/values").VArray<string[] | undefined, import("convex/values").VString<string, "required">, "optional">;
        }, "optional", "taskTypes" | "agentIds" | "statuses">;
        active: import("convex/values").VBoolean<boolean, "required">;
        deliveryCount: import("convex/values").VFloat64<number, "required">;
        failureCount: import("convex/values").VFloat64<number, "required">;
        lastDeliveryAt: import("convex/values").VFloat64<number | undefined, "optional">;
        lastFailureAt: import("convex/values").VFloat64<number | undefined, "optional">;
        createdBy: import("convex/values").VString<string | undefined, "optional">;
    }, "required", "projectId" | "name" | "active" | "url" | "createdBy" | "secret" | "events" | "filters" | "deliveryCount" | "failureCount" | "lastDeliveryAt" | "lastFailureAt" | "filters.taskTypes" | "filters.agentIds" | "filters.statuses">, {
        by_project: ["projectId", "_creationTime"];
        by_active: ["active", "_creationTime"];
        by_project_active: ["projectId", "active", "_creationTime"];
    }, {}, {}>;
    webhookDeliveries: import("convex/server").TableDefinition<import("convex/values").VObject<{
        projectId?: import("convex/values").GenericId<"projects"> | undefined;
        error?: string | undefined;
        nextRetryAt?: number | undefined;
        responseStatus?: number | undefined;
        responseBody?: string | undefined;
        deliveredAt?: number | undefined;
        status: "PENDING" | "FAILED" | "DELIVERED" | "RETRYING";
        url: string;
        webhookId: import("convex/values").GenericId<"webhooks">;
        payload: any;
        event: string;
        attempts: number;
        maxAttempts: number;
    }, {
        webhookId: import("convex/values").VId<import("convex/values").GenericId<"webhooks">, "required">;
        projectId: import("convex/values").VId<import("convex/values").GenericId<"projects"> | undefined, "optional">;
        event: import("convex/values").VString<string, "required">;
        payload: import("convex/values").VAny<any, "required", string>;
        url: import("convex/values").VString<string, "required">;
        status: import("convex/values").VUnion<"PENDING" | "FAILED" | "DELIVERED" | "RETRYING", [import("convex/values").VLiteral<"PENDING", "required">, import("convex/values").VLiteral<"DELIVERED", "required">, import("convex/values").VLiteral<"FAILED", "required">, import("convex/values").VLiteral<"RETRYING", "required">], "required", never>;
        attempts: import("convex/values").VFloat64<number, "required">;
        maxAttempts: import("convex/values").VFloat64<number, "required">;
        nextRetryAt: import("convex/values").VFloat64<number | undefined, "optional">;
        responseStatus: import("convex/values").VFloat64<number | undefined, "optional">;
        responseBody: import("convex/values").VString<string | undefined, "optional">;
        error: import("convex/values").VString<string | undefined, "optional">;
        deliveredAt: import("convex/values").VFloat64<number | undefined, "optional">;
    }, "required", "projectId" | "error" | "status" | "url" | "webhookId" | "payload" | `payload.${string}` | "event" | "attempts" | "maxAttempts" | "nextRetryAt" | "responseStatus" | "responseBody" | "deliveredAt">, {
        by_webhook: ["webhookId", "_creationTime"];
        by_status: ["status", "_creationTime"];
        by_next_retry: ["nextRetryAt", "_creationTime"];
    }, {}, {}>;
}, true>;
export default _default;
//# sourceMappingURL=schema.d.ts.map