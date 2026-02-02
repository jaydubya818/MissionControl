/**
 * Activities — Convex Functions
 *
 * Audit log queries.
 */
export declare const listRecent: import("convex/server").RegisteredQuery<"public", {
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    limit?: number | undefined;
}, Promise<{
    _id: import("convex/values").GenericId<"activities">;
    _creationTime: number;
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
}[]>>;
export declare const listByTask: import("convex/server").RegisteredQuery<"public", {
    limit?: number | undefined;
    taskId: import("convex/values").GenericId<"tasks">;
}, Promise<{
    _id: import("convex/values").GenericId<"activities">;
    _creationTime: number;
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
}[]>>;
export declare const listByAgent: import("convex/server").RegisteredQuery<"public", {
    limit?: number | undefined;
    agentId: import("convex/values").GenericId<"agents">;
}, Promise<{
    _id: import("convex/values").GenericId<"activities">;
    _creationTime: number;
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
}[]>>;
export declare const listByAction: import("convex/server").RegisteredQuery<"public", {
    limit?: number | undefined;
    action: string;
}, Promise<{
    _id: import("convex/values").GenericId<"activities">;
    _creationTime: number;
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
}[]>>;
//# sourceMappingURL=activities.d.ts.map