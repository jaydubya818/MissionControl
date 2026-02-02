/**
 * Messages — Convex Functions
 *
 * Task thread messages with types and artifacts.
 */
export declare const listByTask: import("convex/server").RegisteredQuery<"public", {
    limit?: number | undefined;
    taskId: import("convex/values").GenericId<"tasks">;
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
export declare const get: import("convex/server").RegisteredQuery<"public", {
    messageId: import("convex/values").GenericId<"messages">;
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
} | null>>;
/** Recent messages across all tasks (for Live Feed). */
export declare const listRecent: import("convex/server").RegisteredQuery<"public", {
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    limit?: number | undefined;
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
export declare const post: import("convex/server").RegisteredMutation<"public", {
    metadata?: any;
    idempotencyKey?: string | undefined;
    redactedFields?: string[] | undefined;
    authorAgentId?: import("convex/values").GenericId<"agents"> | undefined;
    authorUserId?: string | undefined;
    artifacts?: {
        content?: string | undefined;
        url?: string | undefined;
        type: string;
        name: string;
    }[] | undefined;
    mentions?: string[] | undefined;
    replyToId?: import("convex/values").GenericId<"messages"> | undefined;
    type: string;
    content: string;
    taskId: import("convex/values").GenericId<"tasks">;
    authorType: string;
}, Promise<{
    message: {
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
    } | null;
    created: boolean;
}>>;
export declare const postWorkPlan: import("convex/server").RegisteredMutation<"public", {
    idempotencyKey?: string | undefined;
    estimatedCost?: number | undefined;
    estimatedDuration?: string | undefined;
    bullets: string[];
    taskId: import("convex/values").GenericId<"tasks">;
    agentId: import("convex/values").GenericId<"agents">;
}, Promise<{
    message: {
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
    } | null;
    created: boolean;
}>>;
export declare const postProgress: import("convex/server").RegisteredMutation<"public", {
    idempotencyKey?: string | undefined;
    artifacts?: {
        content?: string | undefined;
        url?: string | undefined;
        type: string;
        name: string;
    }[] | undefined;
    percentComplete?: number | undefined;
    content: string;
    taskId: import("convex/values").GenericId<"tasks">;
    agentId: import("convex/values").GenericId<"agents">;
}, Promise<{
    message: {
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
    } | null;
    created: boolean;
}>>;
export declare const postReview: import("convex/server").RegisteredMutation<"public", {
    idempotencyKey?: string | undefined;
    authorAgentId?: import("convex/values").GenericId<"agents"> | undefined;
    authorUserId?: string | undefined;
    changeset?: {
        lineNumber?: number | undefined;
        file: string;
        change: string;
    }[] | undefined;
    checklist?: {
        note?: string | undefined;
        label: string;
        checked: boolean;
    }[] | undefined;
    taskId: import("convex/values").GenericId<"tasks">;
    authorType: string;
    reviewType: "PRAISE" | "REFUTE" | "CHANGESET" | "APPROVE" | "REQUEST_CHANGES" | "REJECT";
    comments: string;
}, Promise<{
    message: {
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
    } | null;
    created: boolean;
}>>;
//# sourceMappingURL=messages.d.ts.map