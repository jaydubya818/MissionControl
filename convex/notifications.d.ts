/**
 * Notifications — @mentions, task assignments, approval events.
 * Delivered to agents via heartbeat (pendingNotifications).
 */
export declare const create: import("convex/server").RegisteredMutation<"public", {
    metadata?: any;
    taskId?: import("convex/values").GenericId<"tasks"> | undefined;
    approvalId?: import("convex/values").GenericId<"approvals"> | undefined;
    body?: string | undefined;
    messageId?: import("convex/values").GenericId<"messages"> | undefined;
    fromAgentId?: import("convex/values").GenericId<"agents"> | undefined;
    fromUserId?: string | undefined;
    type: "SYSTEM" | "MENTION" | "TASK_ASSIGNED" | "TASK_TRANSITION" | "APPROVAL_REQUESTED" | "APPROVAL_DECIDED";
    title: string;
    agentId: import("convex/values").GenericId<"agents">;
}, Promise<import("convex/values").GenericId<"notifications">>>;
/** Create notifications for multiple agents (e.g. assignees or @mentions). */
export declare const createForAgents: import("convex/server").RegisteredMutation<"public", {
    metadata?: any;
    taskId?: import("convex/values").GenericId<"tasks"> | undefined;
    approvalId?: import("convex/values").GenericId<"approvals"> | undefined;
    body?: string | undefined;
    messageId?: import("convex/values").GenericId<"messages"> | undefined;
    fromAgentId?: import("convex/values").GenericId<"agents"> | undefined;
    fromUserId?: string | undefined;
    type: "SYSTEM" | "MENTION" | "TASK_ASSIGNED" | "TASK_TRANSITION" | "APPROVAL_REQUESTED" | "APPROVAL_DECIDED";
    title: string;
    agentIds: import("convex/values").GenericId<"agents">[];
}, Promise<string[]>>;
export declare const listByAgent: import("convex/server").RegisteredQuery<"public", {
    limit?: number | undefined;
    unreadOnly?: boolean | undefined;
    agentId: import("convex/values").GenericId<"agents">;
}, Promise<{
    _id: import("convex/values").GenericId<"notifications">;
    _creationTime: number;
    metadata?: any;
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    taskId?: import("convex/values").GenericId<"tasks"> | undefined;
    approvalId?: import("convex/values").GenericId<"approvals"> | undefined;
    body?: string | undefined;
    messageId?: import("convex/values").GenericId<"messages"> | undefined;
    fromAgentId?: import("convex/values").GenericId<"agents"> | undefined;
    fromUserId?: string | undefined;
    readAt?: number | undefined;
    type: "SYSTEM" | "MENTION" | "TASK_ASSIGNED" | "TASK_TRANSITION" | "APPROVAL_REQUESTED" | "APPROVAL_DECIDED";
    title: string;
    agentId: import("convex/values").GenericId<"agents">;
}[]>>;
export declare const markRead: import("convex/server").RegisteredMutation<"public", {
    agentId: import("convex/values").GenericId<"agents">;
    notificationId: import("convex/values").GenericId<"notifications">;
}, Promise<{
    success: boolean;
}>>;
export declare const markAllReadForAgent: import("convex/server").RegisteredMutation<"public", {
    agentId: import("convex/values").GenericId<"agents">;
}, Promise<{
    marked: number;
}>>;
/** Pending (unread) notifications for an agent — used by heartbeat. */
export declare const listPendingForAgent: import("convex/server").RegisteredQuery<"public", {
    limit?: number | undefined;
    agentId: import("convex/values").GenericId<"agents">;
}, Promise<{
    _id: import("convex/values").GenericId<"notifications">;
    _creationTime: number;
    metadata?: any;
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    taskId?: import("convex/values").GenericId<"tasks"> | undefined;
    approvalId?: import("convex/values").GenericId<"approvals"> | undefined;
    body?: string | undefined;
    messageId?: import("convex/values").GenericId<"messages"> | undefined;
    fromAgentId?: import("convex/values").GenericId<"agents"> | undefined;
    fromUserId?: string | undefined;
    readAt?: number | undefined;
    type: "SYSTEM" | "MENTION" | "TASK_ASSIGNED" | "TASK_TRANSITION" | "APPROVAL_REQUESTED" | "APPROVAL_DECIDED";
    title: string;
    agentId: import("convex/values").GenericId<"agents">;
}[]>>;
/** Recent notifications across all agents (admin/operator view). */
export declare const listRecent: import("convex/server").RegisteredQuery<"public", {
    limit?: number | undefined;
}, Promise<{
    _id: import("convex/values").GenericId<"notifications">;
    _creationTime: number;
    metadata?: any;
    projectId?: import("convex/values").GenericId<"projects"> | undefined;
    taskId?: import("convex/values").GenericId<"tasks"> | undefined;
    approvalId?: import("convex/values").GenericId<"approvals"> | undefined;
    body?: string | undefined;
    messageId?: import("convex/values").GenericId<"messages"> | undefined;
    fromAgentId?: import("convex/values").GenericId<"agents"> | undefined;
    fromUserId?: string | undefined;
    readAt?: number | undefined;
    type: "SYSTEM" | "MENTION" | "TASK_ASSIGNED" | "TASK_TRANSITION" | "APPROVAL_REQUESTED" | "APPROVAL_DECIDED";
    title: string;
    agentId: import("convex/values").GenericId<"agents">;
}[]>>;
//# sourceMappingURL=notifications.d.ts.map