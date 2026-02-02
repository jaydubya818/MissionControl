/**
 * Shared Constants
 *
 * System-wide constants and configuration values.
 */
import { TaskStatus, TaskType, AutonomyLevel, ToolRisk } from "./types";
/**
 * Task Status Constants
 */
export declare const TASK_STATUSES: TaskStatus[];
export declare const TERMINAL_STATUSES: TaskStatus[];
export declare const ACTIVE_STATUSES: TaskStatus[];
/**
 * Task Types
 */
export declare const TASK_TYPES: TaskType[];
/**
 * Autonomy Levels
 */
export declare const AUTONOMY_LEVELS: AutonomyLevel[];
/**
 * Tool Risk Levels
 */
export declare const TOOL_RISKS: ToolRisk[];
/**
 * Model Pricing (USD per 1M tokens)
 * Format: { input: number, output: number }
 */
export declare const MODEL_PRICING: Record<string, {
    input: number;
    output: number;
}>;
/**
 * Budget Defaults (USD)
 */
export declare const DEFAULT_BUDGETS: {
    perAgentDaily: {
        intern: number;
        specialist: number;
        lead: number;
    };
    perTask: {
        content: number;
        social: number;
        email_marketing: number;
        customer_research: number;
        seo_research: number;
        engineering: number;
        docs: number;
        ops: number;
    };
    perRun: {
        intern: number;
        specialist: number;
        lead: number;
    };
};
/**
 * Loop Detection Thresholds
 */
export declare const LOOP_DETECTION: {
    commentRateThreshold: number;
    commentRateWindow: number;
    reviewCycleLimit: number;
    backAndForthLimit: number;
    backAndForthWindow: number;
    retryLimit: number;
};
/**
 * Spawn Limits
 */
export declare const SPAWN_LIMITS: {
    maxActive: number;
    maxPerParent: number;
    maxDepth: number;
    ttl: number;
};
/**
 * Heartbeat Configuration
 */
export declare const HEARTBEAT: {
    interval: number;
    staleThreshold: number;
};
/**
 * Error Streak Thresholds
 */
export declare const ERROR_STREAK: {
    quarantineThreshold: number;
    pauseThreshold: number;
};
/**
 * Approval Timeouts
 */
export declare const APPROVAL_TIMEOUT: {
    yellow: number;
    red: number;
};
/**
 * Redaction Patterns
 */
export declare const SECRET_PATTERNS: RegExp[];
/**
 * Production Indicators
 */
export declare const PRODUCTION_INDICATORS: RegExp[];
//# sourceMappingURL=constants.d.ts.map