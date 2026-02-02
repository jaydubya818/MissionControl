/**
 * Notifications — @mentions, task assignments, approval events.
 * Delivered to agents via heartbeat (pendingNotifications).
 */
export declare const create: any;
/** Create notifications for multiple agents (e.g. assignees or @mentions). */
export declare const createForAgents: any;
export declare const listByAgent: any;
export declare const markRead: any;
export declare const markAllReadForAgent: any;
/** Pending (unread) notifications for an agent — used by heartbeat. */
export declare const listPendingForAgent: any;
/** Recent notifications across all agents (admin/operator view). */
export declare const listRecent: any;
//# sourceMappingURL=notifications.d.ts.map