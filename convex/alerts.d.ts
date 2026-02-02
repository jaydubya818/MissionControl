/**
 * Alerts — Convex Functions
 */
export declare const listOpen: import("convex/server").RegisteredQuery<"public", {
    limit?: number | undefined;
}, Promise<{
    _id: import("convex/values").GenericId<"alerts">;
    _creationTime: number;
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
}[]>>;
export declare const listBySeverity: import("convex/server").RegisteredQuery<"public", {
    limit?: number | undefined;
    severity: string;
}, Promise<{
    _id: import("convex/values").GenericId<"alerts">;
    _creationTime: number;
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
}[]>>;
export declare const listByAgent: import("convex/server").RegisteredQuery<"public", {
    limit?: number | undefined;
    agentId: import("convex/values").GenericId<"agents">;
}, Promise<{
    _id: import("convex/values").GenericId<"alerts">;
    _creationTime: number;
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
}[]>>;
export declare const create: import("convex/server").RegisteredMutation<"public", {
    metadata?: any;
    taskId?: import("convex/values").GenericId<"tasks"> | undefined;
    agentId?: import("convex/values").GenericId<"agents"> | undefined;
    runId?: import("convex/values").GenericId<"runs"> | undefined;
    type: string;
    description: string;
    title: string;
    severity: string;
}, Promise<{
    alert: {
        _id: import("convex/values").GenericId<"alerts">;
        _creationTime: number;
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
    } | null;
}>>;
export declare const acknowledge: import("convex/server").RegisteredMutation<"public", {
    acknowledgedBy: string;
    alertId: import("convex/values").GenericId<"alerts">;
}, Promise<{
    alert: {
        _id: import("convex/values").GenericId<"alerts">;
        _creationTime: number;
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
    } | null;
}>>;
export declare const resolve: import("convex/server").RegisteredMutation<"public", {
    resolutionNote?: string | undefined;
    alertId: import("convex/values").GenericId<"alerts">;
}, Promise<{
    alert: {
        _id: import("convex/values").GenericId<"alerts">;
        _creationTime: number;
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
    } | null;
}>>;
export declare const ignore: import("convex/server").RegisteredMutation<"public", {
    reason?: string | undefined;
    alertId: import("convex/values").GenericId<"alerts">;
}, Promise<{
    alert: {
        _id: import("convex/values").GenericId<"alerts">;
        _creationTime: number;
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
    } | null;
}>>;
//# sourceMappingURL=alerts.d.ts.map