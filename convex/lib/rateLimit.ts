/**
 * Fixed-window rate limiting for externally reachable expensive operations.
 *
 * ## Why the key matters more than the algorithm
 *
 * The pre-existing limiter in `tasks.create` keyed on `args.source === "TELEGRAM"`,
 * so any caller could skip it by sending `source: "API"`. A limit that a caller
 * can relabel their way out of is not a limit. Every key here is built from a
 * **server-resolved** identity (operator id, tenant id, or a signed service id)
 * plus a fixed operation name.
 *
 * ## Semantics
 *
 * Fixed window, not sliding: cheap (one indexed row read + one write) and
 * sufficient for the threat being addressed — unbounded provider spend and
 * storage flooding, not precise fairness. A caller can burst up to `limit`
 * twice across a window boundary; that is an accepted, bounded overshoot.
 *
 * Fails CLOSED on a missing identity: `rateLimitKey` requires the caller to
 * have already been resolved, so an unauthenticated caller never reaches here.
 */

export interface RateLimitPolicy {
  /** Stable operation name, e.g. `"knowledge.chatWithRepo"`. */
  operation: string;
  /** Maximum permitted calls per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/** Build the bucket key from server-derived identity only. */
export function rateLimitKey(policy: RateLimitPolicy, actorId: string): string {
  const actor = actorId?.trim();
  if (!actor) {
    throw new Error("Rate limiting requires a server-resolved caller identity.");
  }
  return `${policy.operation}:${actor}`;
}

/**
 * Pure window arithmetic, unit tested independently of Convex.
 *
 * `existing` is the stored counter row, or `null` for a first call.
 */
export function evaluateRateLimit(
  policy: RateLimitPolicy,
  existing: { windowStartedAt: number; count: number } | null,
  now: number,
): RateLimitDecision & { nextWindowStartedAt: number; nextCount: number } {
  const withinWindow = existing !== null && now - existing.windowStartedAt < policy.windowMs;
  const windowStartedAt = withinWindow ? existing!.windowStartedAt : now;
  const currentCount = withinWindow ? existing!.count : 0;

  if (currentCount >= policy.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, windowStartedAt + policy.windowMs - now),
      nextWindowStartedAt: windowStartedAt,
      nextCount: currentCount,
    };
  }

  return {
    allowed: true,
    remaining: policy.limit - currentCount - 1,
    retryAfterMs: 0,
    nextWindowStartedAt: windowStartedAt,
    nextCount: currentCount + 1,
  };
}

/** Human-readable refusal, safe to return to a caller. */
export function rateLimitMessage(policy: RateLimitPolicy, decision: RateLimitDecision): string {
  const seconds = Math.ceil(decision.retryAfterMs / 1000);
  return `Rate limit reached for ${policy.operation} (${policy.limit} per ${Math.round(
    policy.windowMs / 1000,
  )}s). Try again in ${seconds}s.`;
}

/** Policies for the operations that spend money or unbounded storage. */
export const RATE_LIMIT_POLICIES = {
  knowledgeChat: { operation: "knowledge.chatWithRepo", limit: 30, windowMs: 60_000 },
  knowledgeSearch: { operation: "knowledge.semanticSearch", limit: 60, windowMs: 60_000 },
  knowledgeIndex: { operation: "knowledge.indexDocument", limit: 20, windowMs: 60_000 },
  knowledgeIndexAll: { operation: "knowledge.indexAllDocs", limit: 2, windowMs: 300_000 },
  voiceSynthesis: { operation: "voice.synthesize", limit: 20, windowMs: 60_000 },
  planningGeneration: { operation: "planning.generate", limit: 30, windowMs: 60_000 },
  prdParse: { operation: "prd.parsePrd", limit: 10, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitPolicy>;

/** Maximum accepted input sizes for provider-backed calls. */
export const PROVIDER_INPUT_LIMITS = {
  /** ElevenLabs and OpenAI both bill by input size; bound it before spending. */
  voiceTextChars: 5_000,
  knowledgeQuestionChars: 8_000,
  knowledgeDocumentChars: 400_000,
  prdChars: 500_000,
} as const;

export function assertInputWithinLimit(
  value: string,
  maxChars: number,
  label: string,
): void {
  if (value.length > maxChars) {
    throw new Error(
      `${label} is ${value.length} characters; the maximum is ${maxChars}.`,
    );
  }
}
