// Cadences cut ~90% (Oct 26 2026) to keep the jaydubya818 Convex team on the free plan.
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
  { minutes: 60 },
  api.approvals.expireStale
);

// Escalate pending approvals breaching SLA every 10 minutes
crons.interval(
  "escalate overdue approvals",
  { minutes: 60 },
  api.approvals.escalateOverdue,
  {}
);

// Detect loops (comment storms, review ping-pong, repeated failures) every 15 minutes
crons.interval(
  "detect loops",
  { minutes: 60 },
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

// Detect stale agent heartbeats every 2 minutes (runs no-op unless HEARTBEAT_RECOVERY_ENABLED=true in Convex env)
// Recovery: quarantine agent, block tasks, create alerts. Threshold: HEARTBEAT_STALE_MINUTES (default 5).
// Set HEARTBEAT_IGNORE_NEVER=true to skip agents that have never sent a heartbeat.
crons.interval(
  "detect stale heartbeats",
  { minutes: 30 },
  internal.agents.detectStaleAgents
);

// Auto-route execution requests every 5 minutes
crons.interval(
  "auto-route executions",
  { minutes: 30 },
  internal.executorRouter.autoRoute
);

// Guard against migration drift (missing instance refs or tenant IDs) every 30 minutes
crons.interval(
  "guard ARM migration health",
  { hours: 24 },
  internal.migrations.backfillInstanceRefs.guardMigrationHealth
);

// Execute due scheduled jobs every minute
crons.interval(
  "execute scheduled jobs",
  { minutes: 15 },
  internal.scheduledJobs.executeDue
);

// Scan only workspaces that explicitly scheduled repetitive-task detection.
// The scan creates reviewable proposals; it never dispatches work automatically.
crons.interval(
  "scan opted-in repetitive tasks",
  { hours: 6 },
  internal.factory.repetitiveTasks.scanScheduled
);

// Refresh deterministic Factory Learning evidence only for workspaces that
// explicitly scheduled the scanner. The result remains proposal-only.
crons.interval(
  "scan opted-in factory learning evidence",
  { hours: 6 },
  internal.factory.learning.scanScheduled
);

// LEVEL_1 Automations create approval-gated, read-only WorkOrders only.
crons.interval(
  "create due automation review gates",
  { hours: 6 },
  internal.automationScheduler.evaluateDue
);

// Evaluate alert rules (e.g. daily cost exceeded) every hour
crons.interval(
  "evaluate alert rules",
  { hours: 6 },
  internal.alertRules.evaluateRules
);

export default crons;
