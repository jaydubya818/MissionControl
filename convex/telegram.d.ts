/**
 * Telegram Integration — Convex Functions
 *
 * Functions for sending notifications and CEO briefs to Telegram.
 * Called by crons and mutations.
 */
/**
 * Generate CEO brief data for all projects.
 */
export declare const generateCEOBriefData: any;
/**
 * Format CEO brief as Telegram message.
 */
export declare const formatCEOBrief: any;
/**
 * Send daily CEO brief to Telegram.
 * Called by cron job.
 *
 * Note: This mutation prepares the data. The actual Telegram send
 * should be done by the telegram-bot service polling this data or
 * via HTTP action if Convex supports it.
 */
export declare const prepareDailyCEOBrief: any;
/**
 * Send notification for approval request.
 */
export declare const notifyApprovalPending: any;
/**
 * Send notification for budget exceeded.
 */
export declare const notifyBudgetExceeded: any;
/**
 * Send notification for loop detected.
 */
export declare const notifyLoopDetected: any;
//# sourceMappingURL=telegram.d.ts.map