/**
 * Shared Utilities
 *
 * Common utility functions used across packages.
 */
/**
 * Generate idempotency key
 */
export declare function generateIdempotencyKey(prefix?: string): string;
/**
 * Redact secrets from text
 */
export declare function redactSecrets(text: string): string;
/**
 * Check if text contains secrets
 */
export declare function containsSecrets(text: string): boolean;
/**
 * Format currency (USD)
 */
export declare function formatCurrency(amount: number): string;
/**
 * Format relative time
 */
export declare function formatRelativeTime(timestamp: number): string;
/**
 * Format duration
 */
export declare function formatDuration(ms: number): string;
/**
 * Extract mentions from text (@agentName)
 */
export declare function extractMentions(text: string): string[];
/**
 * Validate email
 */
export declare function isValidEmail(email: string): boolean;
/**
 * Sleep utility
 */
export declare function sleep(ms: number): Promise<void>;
/**
 * Retry with exponential backoff
 */
export declare function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries?: number, baseDelay?: number): Promise<T>;
/**
 * Chunk array
 */
export declare function chunkArray<T>(array: T[], size: number): T[][];
/**
 * Deduplicate array
 */
export declare function deduplicate<T>(array: T[]): T[];
/**
 * Group by key
 */
export declare function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]>;
//# sourceMappingURL=utils.d.ts.map