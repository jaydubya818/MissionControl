/**
 * Execution Requests — Convex Functions
 *
 * Multi-executor routing for different types of work.
 * V1 stub: queue + routing + audit; execution is manual until v1.1.
 */
export declare const get: import("convex/server").RegisteredQuery<"public", {
    requestId: import("convex/values").GenericId<"executionRequests">;
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
} | null>>;
export declare const listPending: import("convex/server").RegisteredQuery<"public", {
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    executor?: string | undefined;
    limit?: number | undefined;
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
export declare const listByTask: import("convex/server").RegisteredQuery<"public", {
    limit?: number | undefined;
    taskId: import("convex/values").GenericId<"tasks">;
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
export declare const listByProject: import("convex/server").RegisteredQuery<"public", {
    status?: string | undefined;
    limit?: number | undefined;
    projectId: import("convex/values").GenericId<"projects">;
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
export declare const enqueue: import("convex/server").RegisteredMutation<"public", {
    metadata?: any;
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    taskId?: import("convex/values").GenericId<"tasks"> | undefined;
    type: string;
    requestedBy: import("convex/values").GenericId<"agents">;
    executor: string;
    payload: any;
}, Promise<{
    requestId: import("convex/values").GenericId<"executionRequests">;
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
}>>;
export declare const updateStatus: import("convex/server").RegisteredMutation<"public", {
    assignedTo?: string | undefined;
    result?: any;
    status: string;
    requestId: import("convex/values").GenericId<"executionRequests">;
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
export declare const cancel: import("convex/server").RegisteredMutation<"public", {
    reason?: string | undefined;
    requestId: import("convex/values").GenericId<"executionRequests">;
}, Promise<{
    success: boolean;
    error: string;
} | {
    success: boolean;
    error?: undefined;
}>>;
/**
 * Get routing recommendation for a task type.
 * V1: Returns recommendation only; execution is manual.
 * V1.1: Will automatically assign and execute.
 */
export declare const getRoutingRecommendation: import("convex/server").RegisteredQuery<"public", {
    taskId?: import("convex/values").GenericId<"tasks"> | undefined;
    type: string;
}, Promise<{
    executor: string;
    reason: string;
}>>;
//# sourceMappingURL=executionRequests.d.ts.map