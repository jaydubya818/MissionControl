/**
 * Fixed-window rate limiting for externally reachable operations.
 *
 * ## Why the key matters more than the algorithm
 *
 * The limiter this replaces keyed on `args.source === "TELEGRAM"`, so any
 * caller skipped it by sending `source: "API"`. `source` is a caller-supplied
 * optional string, and a limit a caller can relabel their way out of is not a
 * limit.
 *
 * `tasks.create` resolves no caller identity, so a per-operator bucket is not
 * available here. The replacement therefore uses two buckets:
 *
 * | Bucket | Key | Purpose |
 * | --- | --- | --- |
 * | Per-origin | operation + source + sourceRef | Fairness between distinct external origins |
 * | Global | operation only | A ceiling no relabeling can evade |
 *
 * The global bucket is the one that actually closes the bypass: every external
 * call increments it regardless of what the caller claims to be. The per-origin
 * bucket stops one chatty integration from consuming that ceiling alone.
 *
 * ## The trade-off, stated plainly
 *
 * A global bucket means one abusive caller can exhaust the ceiling and refuse
 * legitimate external task creation until the window rolls. That is a
 * deliberate choice: bounded storage flooding is the threat being addressed,
 * and a ceiling that degrades availability under attack is better than a limit
 * that does nothing. The ceiling is set an order of magnitude above the
 * per-origin limit so normal multi-integration traffic never reaches it.
 *
 * Replacing the global bucket with a per-operator one is the correct long-term
 * fix and requires `tasks.create` to resolve a caller identity first.
 *
 * ## Semantics
 *
 * Fixed window, not sliding: one indexed row read plus one write, and
 * sufficient for the threat. A caller can burst up to `limit` twice across a
 * window boundary; that is an accepted, bounded overshoot.
 */

export interface RateLimitPolicy {
  /** Stable operation name, e.g. `"tasks.create"`. */
  operation: string;
  /** Maximum permitted calls per window for one origin. */
  limit: number;
  /** Maximum permitted calls per window across all origins. */
  globalLimit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
  /** Carried through to the stored row; never derived from caller input. */
  nextWindowStart: number;
  nextCount: number;
}

/** Stored counter row shape, matching the `rateLimitEntries` table. */
export interface RateLimitEntry {
  windowStart: number;
  count: number;
}

/**
 * Bucket key for one external origin.
 *
 * `source` and `sourceRef` are caller-supplied, so this key is deliberately
 * *not* the only control — see the global bucket. Both are normalized and
 * bounded so a caller cannot mint unbounded distinct keys with whitespace or
 * length variation.
 */
export function originRateLimitKey(
  policy: RateLimitPolicy,
  source: string | undefined,
  sourceRef: string | undefined,
): string {
  const normalizedSource = (source ?? "UNKNOWN").trim().toUpperCase().slice(0, 32) || "UNKNOWN";
  const normalizedRef = (sourceRef ?? "").trim().slice(0, 128) || "none";
  return `${policy.operation}:origin:${normalizedSource}:${normalizedRef}`;
}

/** Bucket key for the ceiling that no caller-supplied value can vary. */
export function globalRateLimitKey(policy: RateLimitPolicy): string {
  return `${policy.operation}:global`;
}

/**
 * Pure window arithmetic, unit tested independently of Convex.
 *
 * `existing` is the stored counter row, or `null` for a first call. `limit` is
 * passed explicitly so the same function serves the per-origin and global
 * buckets.
 */
export function evaluateRateLimit(
  policy: RateLimitPolicy,
  limit: number,
  existing: RateLimitEntry | null,
  now: number,
): RateLimitDecision {
  const withinWindow = existing !== null && now - existing.windowStart < policy.windowMs;
  const windowStart = withinWindow ? existing.windowStart : now;
  const currentCount = withinWindow ? existing.count : 0;

  if (currentCount >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, windowStart + policy.windowMs - now),
      nextWindowStart: windowStart,
      nextCount: currentCount,
    };
  }

  return {
    allowed: true,
    remaining: limit - currentCount - 1,
    retryAfterMs: 0,
    nextWindowStart: windowStart,
    nextCount: currentCount + 1,
  };
}

/** Human-readable refusal, safe to return to a caller. */
export function rateLimitMessage(policy: RateLimitPolicy, decision: RateLimitDecision): string {
  const seconds = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
  return `Rate limit reached for ${policy.operation}. Try again in ${seconds}s.`;
}

/**
 * Sources that are reachable from outside the trusted dashboard session.
 *
 * An absent or unrecognized `source` counts as external: omission must not be
 * the way past the limiter.
 */
export const TRUSTED_INTERNAL_SOURCES = new Set(["DASHBOARD", "AGENT", "SYSTEM"]);

export function isExternalSource(source: string | undefined): boolean {
  const normalized = (source ?? "").trim().toUpperCase();
  return !TRUSTED_INTERNAL_SOURCES.has(normalized);
}

/** Policies for operations reachable without a resolved caller identity. */
export const RATE_LIMIT_POLICIES = {
  tasksCreate: {
    operation: "tasks.create",
    limit: 30,
    globalLimit: 300,
    windowMs: 60_000,
  },
} as const satisfies Record<string, RateLimitPolicy>;

/**
 * Per-operator budgets for provider-backed actions.
 *
 * These are spend controls, not fairness controls: the key is a server-resolved
 * operator id, so a caller cannot mint fresh buckets. An unlisted operation
 * falls back to the conservative default rather than going unlimited — omission
 * must not be the way past the budget.
 */
export const PROVIDER_BUDGET_POLICIES: Record<string, RateLimitPolicy> = {
  "knowledge.chatWithRepo": { operation: "knowledge.chatWithRepo", limit: 30, globalLimit: 30, windowMs: 60_000 },
  "knowledge.semanticSearch": { operation: "knowledge.semanticSearch", limit: 60, globalLimit: 60, windowMs: 60_000 },
  "knowledge.indexDocument": { operation: "knowledge.indexDocument", limit: 20, globalLimit: 20, windowMs: 60_000 },
  "knowledge.indexAllDocs": { operation: "knowledge.indexAllDocs", limit: 2, globalLimit: 2, windowMs: 300_000 },
  "voice.synthesize": { operation: "voice.synthesize", limit: 20, globalLimit: 20, windowMs: 60_000 },
  "planning.generateQuestions": { operation: "planning.generateQuestions", limit: 30, globalLimit: 30, windowMs: 60_000 },
  "planning.generatePlanFromAnswers": { operation: "planning.generatePlanFromAnswers", limit: 30, globalLimit: 30, windowMs: 60_000 },
  "prd.parsePrd": { operation: "prd.parsePrd", limit: 10, globalLimit: 10, windowMs: 60_000 },
  "mission.reversePrompt": { operation: "mission.reversePrompt", limit: 30, globalLimit: 30, windowMs: 60_000 },
  "github.syncIssues": { operation: "github.syncIssues", limit: 20, globalLimit: 20, windowMs: 60_000 },
  "github.updateIssueStatus": { operation: "github.updateIssueStatus", limit: 60, globalLimit: 60, windowMs: 60_000 },
};

/** Fallback for an operation with no explicit policy. Deliberately tight. */
export const DEFAULT_PROVIDER_BUDGET: RateLimitPolicy = {
  operation: "provider.default",
  limit: 20,
  globalLimit: 20,
  windowMs: 60_000,
};
