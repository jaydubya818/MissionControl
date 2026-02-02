/**
 * Execution Requests — Convex Functions
 *
 * Multi-executor routing for different types of work.
 * V1 stub: queue + routing + audit; execution is manual until v1.1.
 */
export declare const get: any;
export declare const listPending: any;
export declare const listByTask: any;
export declare const listByProject: any;
export declare const enqueue: any;
export declare const updateStatus: any;
export declare const cancel: any;
/**
 * Get routing recommendation for a task type.
 * V1: Returns recommendation only; execution is manual.
 * V1.1: Will automatically assign and execute.
 */
export declare const getRoutingRecommendation: any;
//# sourceMappingURL=executionRequests.d.ts.map