/**
 * Executor Router — Automated Multi-Executor Routing
 *
 * Automatically routes execution requests to appropriate executors
 * and handles callbacks.
 */
/**
 * Automatically route pending execution requests.
 * Called by cron every 5 minutes.
 */
export declare const autoRoute: import("convex/server").RegisteredMutation<"internal", {}, Promise<{
    routed: number;
}>>;
/**
 * Callback from executor when execution starts.
 */
export declare const onExecutionStart: import("convex/server").RegisteredMutation<"public", {
    requestId: import("convex/values").GenericId<"executionRequests">;
    executorId: string;
}, Promise<{
    success: boolean;
    error: string;
} | {
    success: boolean;
    error?: undefined;
}>>;
/**
 * Callback from executor when execution completes.
 */
export declare const onExecutionComplete: import("convex/server").RegisteredMutation<"public", {
    error?: string | undefined;
    result: any;
    success: boolean;
    requestId: import("convex/values").GenericId<"executionRequests">;
    executorId: string;
}, Promise<{
    success: boolean;
    error: string;
} | {
    success: boolean;
    error?: undefined;
}>>;
/**
 * Get pending execution requests for a specific executor.
 */
export declare const getQueueForExecutor: import("convex/server").RegisteredQuery<"public", {
    limit?: number | undefined;
    executor: "CURSOR" | "CLAUDE_CODE" | "OPENCLAW_AGENT";
}, Promise<{
    _id: import("convex/values").GenericId<"executionRequests">;
    _creationTime: number;
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
}[]>>;
/**
 * Claim an execution request (for executor polling).
 */
export declare const claimExecution: import("convex/server").RegisteredMutation<"public", {
    requestId: import("convex/values").GenericId<"executionRequests">;
    executorId: string;
}, Promise<{
    success: boolean;
    error: string;
    request?: undefined;
} | {
    success: boolean;
    request: {
        _id: import("convex/values").GenericId<"executionRequests">;
        _creationTime: number;
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
    } | null;
    error?: undefined;
}>>;
//# sourceMappingURL=executorRouter.d.ts.map