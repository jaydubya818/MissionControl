/**
 * Tasks — Convex Functions
 *
 * Core task operations with state machine enforcement.
 * task.status can ONLY change through the transition function.
 */
export type TaskStatus = "INBOX" | "ASSIGNED" | "IN_PROGRESS" | "REVIEW" | "NEEDS_APPROVAL" | "BLOCKED" | "DONE" | "CANCELED";
export type TaskType = "CONTENT" | "SOCIAL" | "EMAIL_MARKETING" | "CUSTOMER_RESEARCH" | "SEO_RESEARCH" | "ENGINEERING" | "DOCS" | "OPS";
export declare const get: import("convex/server").RegisteredQuery<"public", {
    taskId: import("convex/values").GenericId<"tasks">;
}, Promise<{
    _id: import("convex/values").GenericId<"tasks">;
    _creationTime: number;
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
} | null>>;
export declare const listByStatus: import("convex/server").RegisteredQuery<"public", {
    status?: string | undefined;
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    limit?: number | undefined;
}, Promise<{
    _id: import("convex/values").GenericId<"tasks">;
    _creationTime: number;
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
}[]>>;
export declare const listAll: import("convex/server").RegisteredQuery<"public", {
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
}, Promise<{
    _id: import("convex/values").GenericId<"tasks">;
    _creationTime: number;
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
}[]>>;
/** Allowed toStatus values for actor HUMAN per fromStatus (for UI "Move to" menu) */
export declare const getAllowedTransitionsForHuman: import("convex/server").RegisteredQuery<"public", {}, Promise<Record<string, string[]>>>;
/** Update task threadRef (for Telegram thread-per-task) */
export declare const updateThreadRef: import("convex/server").RegisteredMutation<"public", {
    threadRef: string;
    taskId: import("convex/values").GenericId<"tasks">;
}, Promise<{
    success: boolean;
}>>;
/** Search tasks by title and description */
export declare const search: import("convex/server").RegisteredQuery<"public", {
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    limit?: number | undefined;
    query: string;
}, Promise<{
    _id: import("convex/values").GenericId<"tasks">;
    _creationTime: number;
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
}[]>>;
/** Export task as incident report (markdown) */
export declare const exportIncidentReport: import("convex/server").RegisteredQuery<"public", {
    taskId: import("convex/values").GenericId<"tasks">;
}, Promise<string | null>>;
export declare const getWithTimeline: import("convex/server").RegisteredQuery<"public", {
    taskId: import("convex/values").GenericId<"tasks">;
}, Promise<{
    task: {
        _id: import("convex/values").GenericId<"tasks">;
        _creationTime: number;
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
    };
    transitions: {
        _id: import("convex/values").GenericId<"taskTransitions">;
        _creationTime: number;
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
    }[];
    messages: {
        _id: import("convex/values").GenericId<"messages">;
        _creationTime: number;
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
    }[];
    runs: {
        _id: import("convex/values").GenericId<"runs">;
        _creationTime: number;
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
    }[];
    toolCalls: {
        _id: import("convex/values").GenericId<"toolCalls">;
        _creationTime: number;
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
    }[];
    approvals: {
        _id: import("convex/values").GenericId<"approvals">;
        _creationTime: number;
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
    }[];
} | null>>;
export declare const create: import("convex/server").RegisteredMutation<"public", {
    description?: string | undefined;
    metadata?: any;
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    priority?: number | undefined;
    idempotencyKey?: string | undefined;
    assigneeIds?: import("convex/values").GenericId<"agents">[] | undefined;
    estimatedCost?: number | undefined;
    labels?: string[] | undefined;
    type: string;
    title: string;
}, Promise<{
    task: {
        _id: import("convex/values").GenericId<"tasks">;
        _creationTime: number;
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
    } | null;
    created: boolean;
}>>;
export declare const transition: import("convex/server").RegisteredMutation<"public", {
    workPlan?: {
        estimatedCost?: number | undefined;
        estimatedDuration?: string | undefined;
        bullets: string[];
    } | undefined;
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
    blockedReason?: string | undefined;
    actorAgentId?: import("convex/values").GenericId<"agents"> | undefined;
    actorUserId?: string | undefined;
    reason?: string | undefined;
    sessionKey?: string | undefined;
    idempotencyKey: string;
    actorType: string;
    taskId: import("convex/values").GenericId<"tasks">;
    toStatus: string;
}, Promise<{
    success: boolean;
    errors: {
        field: string;
        message: string;
    }[];
    allowedTransitions?: undefined;
    task?: undefined;
    transition?: undefined;
    idempotencyHit?: undefined;
} | {
    success: boolean;
    errors: {
        field: string;
        message: string;
    }[];
    allowedTransitions: TaskStatus[];
    task?: undefined;
    transition?: undefined;
    idempotencyHit?: undefined;
} | {
    success: boolean;
    task: {
        _id: import("convex/values").GenericId<"tasks">;
        _creationTime: number;
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
    } | null;
    transition: {
        _id: import("convex/values").GenericId<"taskTransitions">;
        _creationTime: number;
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
    } | null;
    idempotencyHit: boolean;
    errors?: undefined;
    allowedTransitions?: undefined;
}>>;
export declare const assign: import("convex/server").RegisteredMutation<"public", {
    actorUserId?: string | undefined;
    idempotencyKey: string;
    actorType: string;
    taskId: import("convex/values").GenericId<"tasks">;
    agentIds: import("convex/values").GenericId<"agents">[];
}, Promise<{
    success: boolean;
    error?: string;
    task?: any;
}>>;
//# sourceMappingURL=tasks.d.ts.map