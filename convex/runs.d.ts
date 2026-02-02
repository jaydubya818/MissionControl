/**
 * Runs — Convex Functions
 *
 * Agent execution turn tracking and cost accounting.
 */
export declare const get: import("convex/server").RegisteredQuery<"public", {
    runId: import("convex/values").GenericId<"runs">;
}, Promise<{
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
} | null>>;
export declare const listByAgent: import("convex/server").RegisteredQuery<"public", {
    limit?: number | undefined;
    agentId: import("convex/values").GenericId<"agents">;
}, Promise<{
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
}[]>>;
export declare const listByTask: import("convex/server").RegisteredQuery<"public", {
    limit?: number | undefined;
    taskId: import("convex/values").GenericId<"tasks">;
}, Promise<{
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
}[]>>;
export declare const listRecent: import("convex/server").RegisteredQuery<"public", {
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    limit?: number | undefined;
}, Promise<{
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
}[]>>;
export declare const start: import("convex/server").RegisteredMutation<"public", {
    metadata?: any;
    taskId?: import("convex/values").GenericId<"tasks"> | undefined;
    idempotencyKey: string;
    sessionKey: string;
    agentId: import("convex/values").GenericId<"agents">;
    model: string;
}, Promise<{
    run: {
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
    } | null;
    created: boolean;
}>>;
export declare const complete: import("convex/server").RegisteredMutation<"public", {
    status?: string | undefined;
    cacheReadTokens?: number | undefined;
    cacheWriteTokens?: number | undefined;
    error?: string | undefined;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    runId: import("convex/values").GenericId<"runs">;
}, Promise<{
    success: boolean;
    error: string;
    run?: undefined;
} | {
    success: boolean;
    run: {
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
    } | null;
    error?: undefined;
}>>;
export declare const getStats: import("convex/server").RegisteredQuery<"public", {
    taskId?: import("convex/values").GenericId<"tasks"> | undefined;
    agentId?: import("convex/values").GenericId<"agents"> | undefined;
    sinceDaysAgo?: number | undefined;
}, Promise<{
    totalRuns: number;
    totalCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    avgDurationMs: number;
    failedRuns: number;
    successRate: string;
}>>;
//# sourceMappingURL=runs.d.ts.map