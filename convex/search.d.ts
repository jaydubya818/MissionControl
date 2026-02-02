/**
 * Enhanced Search — Full-Text Search for Tasks
 *
 * Provides more sophisticated search across tasks, messages, and documents.
 */
/**
 * Enhanced search across tasks, messages, and artifacts.
 */
export declare const searchAll: import("convex/server").RegisteredQuery<"public", {
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    limit?: number | undefined;
    filters?: {
        type?: string[] | undefined;
        status?: string[] | undefined;
        priority?: number[] | undefined;
        assignedTo?: import("convex/values").GenericId<"agents">[] | undefined;
    } | undefined;
    query: string;
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
    score: number;
    recentMessages: {
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
}[]>>;
/**
 * Search messages by content.
 */
export declare const searchMessages: import("convex/server").RegisteredQuery<"public", {
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    taskId?: import("convex/values").GenericId<"tasks"> | undefined;
    limit?: number | undefined;
    query: string;
}, Promise<{
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
}[]>>;
/**
 * Search agent documents.
 */
export declare const searchDocuments: import("convex/server").RegisteredQuery<"public", {
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    agentId?: import("convex/values").GenericId<"agents"> | undefined;
    limit?: number | undefined;
    query: string;
}, Promise<{
    _id: import("convex/values").GenericId<"agentDocuments">;
    _creationTime: number;
    metadata?: any;
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    type: "WORKING_MD" | "DAILY_NOTE" | "SESSION_MEMORY";
    content: string;
    agentId: import("convex/values").GenericId<"agents">;
    updatedAt: number;
}[]>>;
/**
 * Get search suggestions based on recent tasks and common terms.
 */
export declare const getSuggestions: import("convex/server").RegisteredQuery<"public", {
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    prefix: string;
}, Promise<string[]>>;
//# sourceMappingURL=search.d.ts.map