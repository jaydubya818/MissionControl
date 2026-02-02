/**
 * Convex Cron Jobs
 *
 * - Expire stale approvals every 15 minutes
 * - Detect loops every 15 minutes
 * - Daily standup report at 09:00 UTC
 * - Daily CEO brief to Telegram at 09:00 UTC
 */
import { cronJobs } from "convex/server";
import { api, internal } from "./_generated/api";
const crons = cronJobs();
// Expire approvals past their expiresAt every 15 minutes
crons.interval("expire stale approvals", { minutes: 15 }, api.approvals.expireStale);
// Detect loops (comment storms, review ping-pong, repeated failures) every 15 minutes
crons.interval("detect loops", { minutes: 15 }, internal.loops.detectLoops);
// Daily standup report at 09:00 UTC
crons.daily("daily standup report", { hourUTC: 9, minuteUTC: 0 }, api.standup.runDaily);
// Daily CEO brief to Telegram at 09:00 UTC
crons.daily("daily CEO brief", { hourUTC: 9, minuteUTC: 0 }, internal.telegram.prepareDailyCEOBrief);
// Auto-route execution requests every 5 minutes
// Note: executorRouter.autoRoute will be available after next convex push
// crons.interval(
//   "auto-route executions",
//   { minutes: 5 },
//   internal.executorRouter.autoRoute
// );
export default crons;
