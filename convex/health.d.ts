/**
 * Health Check Endpoints
 *
 * Provides health and readiness checks for monitoring.
 */
/**
 * Basic health check - returns OK if database is accessible.
 */
export declare const check: any;
/**
 * Readiness check - returns OK if system is ready to serve traffic.
 * Checks:
 * - Database accessible
 * - At least one project exists
 * - At least one agent registered
 */
export declare const ready: any;
/**
 * System metrics for monitoring.
 */
export declare const metrics: any;
/**
 * Detailed system status.
 */
export declare const status: any;
//# sourceMappingURL=health.d.ts.map