/**
 * The defect these pin: the previous `tasks.create` limiter engaged only for
 * `source === "TELEGRAM"`, and `source` is a caller-supplied optional string.
 * Sending `source: "API"` — or omitting it — skipped the limiter entirely.
 */

import { describe, expect, it } from "vitest";
import {
  evaluateRateLimit,
  globalRateLimitKey,
  isExternalSource,
  originRateLimitKey,
  rateLimitMessage,
  RATE_LIMIT_POLICIES,
} from "../lib/rateLimit";

const policy = RATE_LIMIT_POLICIES.tasksCreate;

describe("a caller cannot relabel their way out of the limit", () => {
  it("treats every non-trusted source as external, including omission", () => {
    expect(isExternalSource("TELEGRAM")).toBe(true);
    expect(isExternalSource("API")).toBe(true);
    expect(isExternalSource("GITHUB")).toBe(true);
    // The original bypass: claim a different source.
    expect(isExternalSource("api")).toBe(true);
    // Omission must not be the way past the limiter.
    expect(isExternalSource(undefined)).toBe(true);
    expect(isExternalSource("")).toBe(true);
    expect(isExternalSource("   ")).toBe(true);
    // Anything unrecognized counts as external.
    expect(isExternalSource("SOMETHING_NEW")).toBe(true);
  });

  it("does not limit the trusted internal sources", () => {
    expect(isExternalSource("DASHBOARD")).toBe(false);
    expect(isExternalSource("AGENT")).toBe(false);
    expect(isExternalSource("SYSTEM")).toBe(false);
    expect(isExternalSource("  dashboard  ")).toBe(false);
  });

  it("keys the ceiling on nothing the caller supplies", () => {
    // Whatever source/sourceRef a caller claims, the global key is identical,
    // so the ceiling counts every external call.
    expect(globalRateLimitKey(policy)).toBe("tasks.create:global");
    expect(globalRateLimitKey(policy)).not.toContain("TELEGRAM");
    expect(globalRateLimitKey(policy)).not.toContain("API");
  });

  it("normalizes the per-origin key so distinct buckets cannot be minted freely", () => {
    // Whitespace and case variation must not produce fresh buckets.
    expect(originRateLimitKey(policy, "api", "owner/repo#1"))
      .toBe(originRateLimitKey(policy, "  API  ", " owner/repo#1 "));
    // Absent values collapse to stable placeholders rather than unique keys.
    expect(originRateLimitKey(policy, undefined, undefined))
      .toBe("tasks.create:origin:UNKNOWN:none");
    // Unbounded length cannot be used to mint unbounded keys.
    const long = originRateLimitKey(policy, "A".repeat(500), "B".repeat(500));
    expect(long.length).toBeLessThan(200);
  });
});

describe("fixed-window arithmetic", () => {
  it("admits the first call and counts it", () => {
    const decision = evaluateRateLimit(policy, 30, null, 1_000);
    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(29);
    expect(decision.nextCount).toBe(1);
    expect(decision.nextWindowStart).toBe(1_000);
  });

  it("refuses once the limit is reached inside the window", () => {
    const decision = evaluateRateLimit(policy, 30, { windowStart: 1_000, count: 30 }, 30_000);
    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(0);
    expect(decision.retryAfterMs).toBe(31_000);
    // A refused call must not advance the counter.
    expect(decision.nextCount).toBe(30);
  });

  it("starts a fresh window once the old one has elapsed", () => {
    const decision = evaluateRateLimit(policy, 30, { windowStart: 1_000, count: 30 }, 62_000);
    expect(decision.allowed).toBe(true);
    expect(decision.nextWindowStart).toBe(62_000);
    expect(decision.nextCount).toBe(1);
  });

  it("applies the ceiling independently of the per-origin limit", () => {
    // 30 calls from one origin is at the per-origin limit but well under the
    // ceiling; 300 from many origins is under every per-origin limit and at
    // the ceiling. Both must refuse.
    expect(evaluateRateLimit(policy, policy.limit, { windowStart: 0, count: 30 }, 1_000).allowed)
      .toBe(false);
    expect(evaluateRateLimit(policy, policy.globalLimit, { windowStart: 0, count: 299 }, 1_000).allowed)
      .toBe(true);
    expect(evaluateRateLimit(policy, policy.globalLimit, { windowStart: 0, count: 300 }, 1_000).allowed)
      .toBe(false);
  });

  it("reports a retry hint of at least one second", () => {
    const decision = evaluateRateLimit(policy, 30, { windowStart: 0, count: 30 }, 59_900);
    expect(rateLimitMessage(policy, decision)).toMatch(/Try again in 1s\./);
  });
});
