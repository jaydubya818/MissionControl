/**
 * Convex Cron Jobs
 *
 * - Expire stale approvals every 15 minutes
 * - Detect loops every 15 minutes
 * - Daily standup report at 09:00 UTC
 * - Daily CEO brief to Telegram at 09:00 UTC
 */
declare const crons: import("convex/server").Crons;
export default crons;
//# sourceMappingURL=crons.d.ts.map