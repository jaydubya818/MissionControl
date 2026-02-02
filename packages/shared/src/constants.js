/**
 * Shared Constants
 *
 * System-wide constants and configuration values.
 */
/**
 * Task Status Constants
 */
export const TASK_STATUSES = [
    "inbox",
    "assigned",
    "in_progress",
    "review",
    "needs_approval",
    "blocked",
    "done",
    "canceled",
];
export const TERMINAL_STATUSES = ["done", "canceled"];
export const ACTIVE_STATUSES = [
    "inbox",
    "assigned",
    "in_progress",
    "review",
    "needs_approval",
    "blocked",
];
/**
 * Task Types
 */
export const TASK_TYPES = [
    "content",
    "social",
    "email_marketing",
    "customer_research",
    "seo_research",
    "engineering",
    "docs",
    "ops",
];
/**
 * Autonomy Levels
 */
export const AUTONOMY_LEVELS = ["intern", "specialist", "lead"];
/**
 * Tool Risk Levels
 */
export const TOOL_RISKS = ["green", "yellow", "red"];
/**
 * Model Pricing (USD per 1M tokens)
 * Format: { input: number, output: number }
 */
export const MODEL_PRICING = {
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
        intern: 2,
        specialist: 5,
        lead: 12,
    },
    perTask: {
        content: 6,
        social: 2,
        email_marketing: 4,
        customer_research: 5,
        seo_research: 4,
        engineering: 8,
        docs: 3,
        ops: 3,
    },
    perRun: {
        intern: 0.25,
        specialist: 0.75,
        lead: 1.5,
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
//# sourceMappingURL=constants.js.map