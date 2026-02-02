/**
 * Telegram Integration — Convex Functions
 *
 * Functions for sending notifications and CEO briefs to Telegram.
 * Called by crons and mutations.
 */
/**
 * Generate CEO brief data for all projects.
 */
export declare const generateCEOBriefData: import("convex/server").RegisteredQuery<"internal", {}, Promise<{
    briefs: {
        project: {
            id: import("convex/values").GenericId<"projects">;
            name: string;
            slug: string;
        };
        tasks: {
            completed: number;
            inProgress: number;
            blocked: number;
            review: number;
            needsApproval: number;
        };
        approvals: {
            pending: number;
        };
        burnRate: {
            today: number;
        };
        nextActions: {
            id: import("convex/values").GenericId<"tasks">;
            title: string;
            status: "INBOX" | "ASSIGNED" | "IN_PROGRESS" | "REVIEW" | "NEEDS_APPROVAL" | "BLOCKED" | "DONE" | "CANCELED";
            priority: 1 | 2 | 3 | 4;
        }[];
    }[];
    generatedAt: number;
}>>;
/**
 * Format CEO brief as Telegram message.
 */
export declare const formatCEOBrief: import("convex/server").RegisteredQuery<"internal", {
    briefData: any;
}, Promise<string>>;
/**
 * Send daily CEO brief to Telegram.
 * Called by cron job.
 *
 * Note: This mutation prepares the data. The actual Telegram send
 * should be done by the telegram-bot service polling this data or
 * via HTTP action if Convex supports it.
 */
export declare const prepareDailyCEOBrief: import("convex/server").RegisteredMutation<"internal", {}, Promise<{
    success: boolean;
    message: string;
}>>;
/**
 * Send notification for approval request.
 */
export declare const notifyApprovalPending: import("convex/server").RegisteredMutation<"internal", {
    approvalId: import("convex/values").GenericId<"approvals">;
}, Promise<{
    success: boolean;
}>>;
/**
 * Send notification for budget exceeded.
 */
export declare const notifyBudgetExceeded: import("convex/server").RegisteredMutation<"internal", {
    taskId?: import("convex/values").GenericId<"tasks"> | undefined;
    budgetDaily: number;
    spendToday: number;
    agentId: import("convex/values").GenericId<"agents">;
}, Promise<{
    success: boolean;
}>>;
/**
 * Send notification for loop detected.
 */
export declare const notifyLoopDetected: import("convex/server").RegisteredMutation<"internal", {
    taskId: import("convex/values").GenericId<"tasks">;
    loopType: string;
    count: number;
    threshold: number;
}, Promise<{
    success: boolean;
}>>;
//# sourceMappingURL=telegram.d.ts.map