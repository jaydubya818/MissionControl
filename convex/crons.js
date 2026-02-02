"use strict";
/**
 * Convex Cron Jobs
 *
 * - Expire stale approvals every 15 minutes
 * - Detect loops every 15 minutes
 * - Daily standup report at 09:00 UTC
 * - Daily CEO brief to Telegram at 09:00 UTC
 */
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("convex/server");
const api_1 = require("./_generated/api");
const crons = (0, server_1.cronJobs)();
// Expire approvals past their expiresAt every 15 minutes
crons.interval("expire stale approvals", { minutes: 15 }, api_1.api.approvals.expireStale);
// Detect loops (comment storms, review ping-pong, repeated failures) every 15 minutes
crons.interval("detect loops", { minutes: 15 }, api_1.internal.loops.detectLoops);
// Daily standup report at 09:00 UTC
crons.daily("daily standup report", { hourUTC: 9, minuteUTC: 0 }, api_1.api.standup.runDaily);
// Daily CEO brief to Telegram at 09:00 UTC
crons.daily("daily CEO brief", { hourUTC: 9, minuteUTC: 0 }, api_1.internal.telegram.prepareDailyCEOBrief);
exports.default = crons;
