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
crons.interval(
  "expire stale approvals",
  { minutes: 15 },
  api.approvals.expireStale
);

// Detect loops (comment storms, review ping-pong, repeated failures) every 15 minutes
crons.interval(
  "detect loops",
  { minutes: 15 },
  internal.loops.detectLoops
);

// Daily standup report at 09:00 UTC
crons.daily(
  "daily standup report",
  { hourUTC: 9, minuteUTC: 0 },
  api.standup.runDaily
);

// Daily CEO brief to Telegram at 09:00 UTC
crons.daily(
  "daily CEO brief",
  { hourUTC: 9, minuteUTC: 0 },
  internal.telegram.prepareDailyCEOBrief
);

// Detect stale agent heartbeats every 2 minutes
// Recovery: quarantine agent, block tasks, create alerts
// DISABLED: No agent runtime sending heartbeats yet (Phase 2).
// The cron quarantines every agent within 2 minutes of seeding.
// Re-enable once agent-runner sends real heartbeats.
// crons.interval(
//   "detect stale heartbeats",
//   { minutes: 2 },
//   internal.agents.detectStaleAgents
// );

// Auto-route execution requests every 5 minutes
crons.interval(
  "auto-route executions",
  { minutes: 5 },
  internal.executorRouter.autoRoute
);

export default crons;
