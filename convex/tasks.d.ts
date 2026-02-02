/**
 * Tasks — Convex Functions
 *
 * Core task operations with state machine enforcement.
 * task.status can ONLY change through the transition function.
 */
export type TaskStatus = "INBOX" | "ASSIGNED" | "IN_PROGRESS" | "REVIEW" | "NEEDS_APPROVAL" | "BLOCKED" | "DONE" | "CANCELED";
export type TaskType = "CONTENT" | "SOCIAL" | "EMAIL_MARKETING" | "CUSTOMER_RESEARCH" | "SEO_RESEARCH" | "ENGINEERING" | "DOCS" | "OPS";
export declare const get: any;
export declare const listByStatus: any;
export declare const listAll: any;
/** Allowed toStatus values for actor HUMAN per fromStatus (for UI "Move to" menu) */
export declare const getAllowedTransitionsForHuman: any;
/** Update task threadRef (for Telegram thread-per-task) */
export declare const updateThreadRef: any;
/** Search tasks by title and description */
export declare const search: any;
/** Export task as incident report (markdown) */
export declare const exportIncidentReport: any;
export declare const getWithTimeline: any;
export declare const create: any;
export declare const transition: any;
export declare const assign: any;
//# sourceMappingURL=tasks.d.ts.map