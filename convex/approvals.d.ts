/**
 * Approvals — Convex Functions
 */
export declare const listPending: import("convex/server").RegisteredQuery<"public", {
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    limit?: number | undefined;
}, Promise<{
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
}[]>>;
export declare const listByTask: import("convex/server").RegisteredQuery<"public", {
    limit?: number | undefined;
    taskId: import("convex/values").GenericId<"tasks">;
}, Promise<{
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
}[]>>;
export declare const listByRequestor: import("convex/server").RegisteredQuery<"public", {
    limit?: number | undefined;
    agentId: import("convex/values").GenericId<"agents">;
}, Promise<{
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
}[]>>;
export declare const get: import("convex/server").RegisteredQuery<"public", {
    approvalId: import("convex/values").GenericId<"approvals">;
}, Promise<{
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
} | null>>;
export declare const request: import("convex/server").RegisteredMutation<"public", {
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    idempotencyKey?: string | undefined;
    estimatedCost?: number | undefined;
    taskId?: import("convex/values").GenericId<"tasks"> | undefined;
    toolCallId?: import("convex/values").GenericId<"toolCalls"> | undefined;
    actionPayload?: any;
    rollbackPlan?: string | undefined;
    expiresInMinutes?: number | undefined;
    riskLevel: string;
    requestorAgentId: import("convex/values").GenericId<"agents">;
    actionType: string;
    actionSummary: string;
    justification: string;
}, Promise<{
    approval: {
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
    } | null;
    created: boolean;
}>>;
export declare const approve: import("convex/server").RegisteredMutation<"public", {
    reason?: string | undefined;
    decidedByAgentId?: import("convex/values").GenericId<"agents"> | undefined;
    decidedByUserId?: string | undefined;
    approvalId: import("convex/values").GenericId<"approvals">;
}, Promise<{
    success: boolean;
    error: string;
    approval?: undefined;
} | {
    success: boolean;
    approval: {
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
    } | null;
    error?: undefined;
}>>;
export declare const deny: import("convex/server").RegisteredMutation<"public", {
    decidedByAgentId?: import("convex/values").GenericId<"agents"> | undefined;
    decidedByUserId?: string | undefined;
    reason: string;
    approvalId: import("convex/values").GenericId<"approvals">;
}, Promise<{
    success: boolean;
    error: string;
    approval?: undefined;
} | {
    success: boolean;
    approval: {
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
    } | null;
    error?: undefined;
}>>;
export declare const cancel: import("convex/server").RegisteredMutation<"public", {
    reason?: string | undefined;
    approvalId: import("convex/values").GenericId<"approvals">;
}, Promise<{
    success: boolean;
    error: string;
    approval?: undefined;
} | {
    success: boolean;
    approval: {
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
    } | null;
    error?: undefined;
}>>;
export declare const expireStale: import("convex/server").RegisteredMutation<"public", {}, Promise<{
    expired: number;
}>>;
//# sourceMappingURL=approvals.d.ts.map