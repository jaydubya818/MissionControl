/**
 * Retry Utilities with Exponential Backoff and Jitter
 * 
 * Provides resilient retry logic for network operations,
 * database writes, and external API calls.
 */

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number; // 0-1, percentage of delay to add as jitter
  retryableErrors?: string[]; // Error codes that should trigger retry
}

export const defaultRetryConfig: RetryConfig = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.1, // 10% jitter
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'RATE_LIMITED'],
};

/**
 * Calculate delay with exponential backoff and jitter
 * 
 * Formula: min(baseDelay * 2^attempt, maxDelay) + random(0, jitterFactor * delay)
 */
export function calculateDelay(
  attempt: number,
  config: Partial<RetryConfig> = {}
): number {
  const { baseDelayMs, maxDelayMs, jitterFactor } = { ...defaultRetryConfig, ...config };
  
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  
  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  
  // Add jitter: random value between 0 and jitterFactor * delay
  const jitter = Math.random() * (cappedDelay * jitterFactor);
  
  return Math.floor(cappedDelay + jitter);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  context?: { runId?: string; taskId?: string; agentId?: string }
): Promise<T> {
  const fullConfig = { ...defaultRetryConfig, ...config };
  const { maxAttempts, retryableErrors } = fullConfig;
  
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if error is retryable
      const errorCode = (error as any)?.code || lastError.name;
      if (retryableErrors && !retryableErrors.includes(errorCode)) {
        throw lastError; // Non-retryable error, fail fast
      }
      
      // Don't retry on last attempt
      if (attempt === maxAttempts - 1) {
        break;
      }
      
      // Calculate and apply backoff
      const delayMs = calculateDelay(attempt, fullConfig);
      
      console.log(`[retry] Attempt ${attempt + 1}/${maxAttempts} failed, retrying in ${delayMs}ms...`, {
        errorCode,
        ...context,
      });
      
      await sleep(delayMs);
    }
  }
  
  throw lastError || new Error('Max retry attempts exceeded');
}

/**
 * Heartbeat with exponential backoff
 * 
 * For long-running heartbeat loops that need to survive transient failures
 */
export function createHeartbeat(
  fn: () => Promise<void>,
  intervalMs: number,
  config: Partial<RetryConfig> = {}
): { start: () => void; stop: () => void } {
  const fullConfig = { ...defaultRetryConfig, ...config, maxAttempts: Infinity };
  let isRunning = false;
  let timeoutId: NodeJS.Timeout | null = null;
  let consecutiveFailures = 0;
  
  const beat = async () => {
    if (!isRunning) return;
    
    try {
      await fn();
      consecutiveFailures = 0; // Reset on success
      
      // Schedule next beat
      if (isRunning) {
        timeoutId = setTimeout(beat, intervalMs);
      }
    } catch (error) {
      consecutiveFailures++;
      
      // Calculate backoff based on consecutive failures
      const delayMs = calculateDelay(
        Math.min(consecutiveFailures - 1, 10), // Cap at 2^10
        fullConfig
      );
      
      console.error(`[heartbeat] Beat failed (${consecutiveFailures} consecutive), retrying in ${delayMs}ms...`);
      
      // Schedule retry with backoff
      if (isRunning) {
        timeoutId = setTimeout(beat, delayMs);
      }
    }
  };
  
  return {
    start: () => {
      if (!isRunning) {
        isRunning = true;
        beat();
      }
    },
    stop: () => {
      isRunning = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
  };
}

/**
 * Convex write with jitter
 * 
 * Adds random jitter before writes to prevent thundering herd
 */
export async function convexWriteWithJitter<T>(
  writeFn: () => Promise<T>,
  maxJitterMs: number = 100
): Promise<T> {
  const jitter = Math.floor(Math.random() * maxJitterMs);
  await sleep(jitter);
  return writeFn();
}

// Export for use in other packages
export { withRetry as retry, createHeartbeat as heartbeat };
