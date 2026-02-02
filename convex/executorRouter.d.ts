/**
 * Executor Router — Automated Multi-Executor Routing
 *
 * Automatically routes execution requests to appropriate executors
 * and handles callbacks.
 */
/**
 * Automatically route pending execution requests.
 * Called by cron every 5 minutes.
 */
export declare const autoRoute: any;
/**
 * Callback from executor when execution starts.
 */
export declare const onExecutionStart: any;
/**
 * Callback from executor when execution completes.
 */
export declare const onExecutionComplete: any;
/**
 * Get pending execution requests for a specific executor.
 */
export declare const getQueueForExecutor: any;
/**
 * Claim an execution request (for executor polling).
 */
export declare const claimExecution: any;
//# sourceMappingURL=executorRouter.d.ts.map