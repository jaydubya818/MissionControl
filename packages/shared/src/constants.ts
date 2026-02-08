/**
 * Shared Constants
 * 
 * System-wide constants and configuration values.
 * All enum values are UPPERCASE to match Convex schema (source of truth).
 */

import { TaskStatus, TaskType, AutonomyLevel, ToolRisk } from "./types";

/**
 * Task Status Constants
 */
export const TASK_STATUSES: TaskStatus[] = [
  "INBOX",
  "ASSIGNED",
  "IN_PROGRESS",
  "REVIEW",
  "NEEDS_APPROVAL",
  "BLOCKED",
  "FAILED",
  "DONE",
  "CANCELED",
];

export const TERMINAL_STATUSES: TaskStatus[] = ["DONE", "CANCELED", "FAILED"];

export const ACTIVE_STATUSES: TaskStatus[] = [
  "INBOX",
  "ASSIGNED",
  "IN_PROGRESS",
  "REVIEW",
  "NEEDS_APPROVAL",
  "BLOCKED",
];

/**
 * Task Types
 */
export const TASK_TYPES: TaskType[] = [
  "CONTENT",
  "SOCIAL",
  "EMAIL_MARKETING",
  "CUSTOMER_RESEARCH",
  "SEO_RESEARCH",
  "ENGINEERING",
  "DOCS",
  "OPS",
];

/**
 * Autonomy Levels
 */
export const AUTONOMY_LEVELS: AutonomyLevel[] = ["INTERN", "SPECIALIST", "LEAD"];

/**
 * Tool Risk Levels
 */
export const TOOL_RISKS: ToolRisk[] = ["green", "yellow", "red"];

/**
 * Model Pricing (USD per 1M tokens)
 * Format: { input: number, output: number }
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  "gpt-4": { input: 30, output: 60 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  
  // Anthropic
  "claude-3-opus": { input: 15, output: 75 },
  "claude-3-sonnet": { input: 3, output: 15 },
  "claude-3-haiku": { input: 0.25, output: 1.25 },
  
  // Default fallback
  "default": { input: 1, output: 3 },
};

/**
 * Budget Defaults (USD)
 */
export const DEFAULT_BUDGETS = {
  perAgentDaily: {
    INTERN: 2,
    SPECIALIST: 5,
    LEAD: 12,
  },
  perTask: {
    CONTENT: 6,
    SOCIAL: 2,
    EMAIL_MARKETING: 4,
    CUSTOMER_RESEARCH: 5,
    SEO_RESEARCH: 4,
    ENGINEERING: 8,
    DOCS: 3,
    OPS: 3,
  },
  perRun: {
    INTERN: 0.25,
    SPECIALIST: 0.75,
    LEAD: 1.5,
  },
};

/**
 * Loop Detection Thresholds
 */
export const LOOP_DETECTION = {
  commentRateThreshold: 20,
  commentRateWindow: 30 * 60 * 1000, // 30 minutes in ms
  reviewCycleLimit: 3,
  backAndForthLimit: 8,
  backAndForthWindow: 10 * 60 * 1000, // 10 minutes in ms
  retryLimit: 3,
};

/**
 * Spawn Limits
 */
export const SPAWN_LIMITS = {
  maxActive: 30,
  maxPerParent: 3,
  maxDepth: 2,
  ttl: 6 * 60 * 60 * 1000, // 6 hours in ms
};

/**
 * Heartbeat Configuration
 */
export const HEARTBEAT = {
  interval: 30 * 1000, // 30 seconds
  staleThreshold: 5 * 60 * 1000, // 5 minutes
};

/**
 * Error Streak Thresholds
 */
export const ERROR_STREAK = {
  quarantineThreshold: 5,
  pauseThreshold: 3,
};

/**
 * Approval Timeouts
 */
export const APPROVAL_TIMEOUT = {
  yellow: 30 * 60 * 1000, // 30 minutes
  red: 60 * 60 * 1000, // 1 hour
};

/**
 * Redaction Patterns
 */
export const SECRET_PATTERNS = [
  /api[_-]?key/i,
  /token/i,
  /password/i,
  /secret/i,
  /bearer\s+\w+/i,
  /sk-[a-zA-Z0-9]{32,}/,
  /ghp_[a-zA-Z0-9]{36}/,
];

/**
 * Production Indicators
 */
export const PRODUCTION_INDICATORS = [
  /prod/i,
  /production/i,
  /master/i,
  /main/i,
  /live/i,
];
