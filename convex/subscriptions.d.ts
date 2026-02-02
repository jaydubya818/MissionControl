/**
 * Thread Subscriptions — agents subscribed to task threads.
 */
export declare const subscribe: import("convex/server").RegisteredMutation<"public", {
    metadata?: any;
    taskId: import("convex/values").GenericId<"tasks">;
    agentId: import("convex/values").GenericId<"agents">;
}, Promise<{
    subscriptionId: import("convex/values").GenericId<"threadSubscriptions">;
    created: boolean;
}>>;
export declare const unsubscribe: import("convex/server").RegisteredMutation<"public", {
    taskId: import("convex/values").GenericId<"tasks">;
    agentId: import("convex/values").GenericId<"agents">;
}, Promise<{
    removed: boolean;
}>>;
export declare const listByAgent: import("convex/server").RegisteredQuery<"public", {
    limit?: number | undefined;
    agentId: import("convex/values").GenericId<"agents">;
}, Promise<{
    _id: import("convex/values").GenericId<"threadSubscriptions">;
    _creationTime: number;
    metadata?: any;
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    taskId: import("convex/values").GenericId<"tasks">;
    agentId: import("convex/values").GenericId<"agents">;
    subscribedAt: number;
}[]>>;
export declare const listByTask: import("convex/server").RegisteredQuery<"public", {
    limit?: number | undefined;
    taskId: import("convex/values").GenericId<"tasks">;
}, Promise<{
    _id: import("convex/values").GenericId<"threadSubscriptions">;
    _creationTime: number;
    metadata?: any;
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    taskId: import("convex/values").GenericId<"tasks">;
    agentId: import("convex/values").GenericId<"agents">;
    subscribedAt: number;
}[]>>;
/** Subscribed task IDs for an agent — used by heartbeat / "threads with activity". */
export declare const getSubscribedTaskIds: import("convex/server").RegisteredQuery<"public", {
    agentId: import("convex/values").GenericId<"agents">;
}, Promise<import("convex/values").GenericId<"tasks">[]>>;
//# sourceMappingURL=subscriptions.d.ts.map