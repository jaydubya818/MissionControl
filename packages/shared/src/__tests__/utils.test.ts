import { describe, expect, it } from "vitest";
import {
  chunkArray,
  containsSecrets,
  deduplicate,
  extractMentions,
  formatCurrency,
  formatDuration,
  formatRelativeTime,
  generateIdempotencyKey,
  groupBy,
  isValidEmail,
  redactSecrets,
} from "../utils.js";

/**
 * Characterization tests for packages/shared/src/utils.ts.
 *
 * Every function here is re-exported from `@mission-control/shared`, so these
 * are public API. Two blocks below deliberately pin behaviour that is wrong
 * rather than merely surprising — `formatRelativeTime` on a future timestamp
 * and `redactSecrets` on any real secret. Both are recorded in
 * docs/NIGHTLY-BACKLOG.md; the assertions are here so that fixing them shows
 * up as an intentional test change instead of a silent behaviour swap.
 */

describe("generateIdempotencyKey", () => {
  it("prefixes when asked and omits the separator when not", () => {
    expect(generateIdempotencyKey("run")).toMatch(/^run_\d+_[a-z0-9]+$/);
    expect(generateIdempotencyKey()).toMatch(/^\d+_[a-z0-9]+$/);
  });

  it("does not collide across consecutive calls", () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateIdempotencyKey()));
    expect(keys.size).toBe(50);
  });
});

describe("formatCurrency", () => {
  it("renders USD with 2 to 4 fraction digits", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("rounds sub-cent amounts to 4 decimal places", () => {
    // Token costs are frequently below $0.0001 and collapse to "$0.0000" here.
    expect(formatCurrency(0.00012)).toBe("$0.0001");
  });
});

describe("formatDuration", () => {
  it("renders the two most significant units", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(5_000)).toBe("5s");
    expect(formatDuration(65_000)).toBe("1m 5s");
    expect(formatDuration(3_600_000)).toBe("1h 0m");
    expect(formatDuration(3_725_000)).toBe("1h 2m");
  });
});

describe("formatRelativeTime", () => {
  it("renders the largest non-zero unit", () => {
    const now = Date.now();
    expect(formatRelativeTime(now)).toBe("0s ago");
    expect(formatRelativeTime(now - 5_000)).toBe("5s ago");
    expect(formatRelativeTime(now - 90 * 60 * 1_000)).toBe("1h ago");
    expect(formatRelativeTime(now - 3 * 24 * 60 * 60 * 1_000)).toBe("3d ago");
  });

  it("renders future timestamps as a negative age (defect, see NIGHTLY-BACKLOG)", () => {
    // There is no clamp on `now - timestamp`, so a clock skew between the
    // Convex server and the browser produces "-10s ago" in the UI.
    expect(formatRelativeTime(Date.now() + 10_000)).toBe("-10s ago");
  });
});

describe("extractMentions", () => {
  it("returns the bare names without the @", () => {
    expect(extractMentions("hi @alice and @bob_1")).toEqual(["alice", "bob_1"]);
  });

  it("returns an empty list when there are no mentions", () => {
    expect(extractMentions("no one here")).toEqual([]);
  });

  it("splits on non-word characters, so @a@b yields two mentions", () => {
    expect(extractMentions("@a@b")).toEqual(["a", "b"]);
  });
});

describe("isValidEmail", () => {
  it("requires a dotted domain and no whitespace", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a b@c.co")).toBe(false);
    expect(isValidEmail("a@@b.co")).toBe(false);
  });
});

describe("array helpers", () => {
  it("chunkArray splits into trailing-partial chunks", () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkArray([], 3)).toEqual([]);
  });

  it("deduplicate uses SameValueZero, so 2 and \"2\" both survive", () => {
    expect(deduplicate([1, 1, 2, "2"])).toEqual([1, 2, "2"]);
  });

  it("groupBy preserves input order inside each bucket", () => {
    expect(groupBy([{ a: "x", n: 1 }, { a: "y", n: 2 }, { a: "x", n: 3 }], (i) => i.a)).toEqual({
      x: [{ a: "x", n: 1 }, { a: "x", n: 3 }],
      y: [{ a: "y", n: 2 }],
    });
  });
});

describe("secret helpers", () => {
  it("containsSecrets matches secret-ish key names", () => {
    expect(containsSecrets("password=1")).toBe(true);
    expect(containsSecrets("hello world")).toBe(false);
  });

  it("containsSecrets does NOT match credentials, private_key, .env or auth_header", () => {
    // convex/lib/riskClassifier.ts escalates all four of these to RED risk.
    // SECRET_PATTERNS does not carry them, so the policy engine's approval
    // escalation and the Convex risk classifier disagree. See NIGHTLY-BACKLOG.
    expect(containsSecrets("credentials.json")).toBe(false);
    expect(containsSecrets("private_key")).toBe(false);
    expect(containsSecrets(".env.local")).toBe(false);
    expect(containsSecrets("auth_header")).toBe(false);
  });

  it("redactSecrets removes the label and leaves the value (defect, see NIGHTLY-BACKLOG)", () => {
    // SECRET_PATTERNS matches key *names*, not values, and the patterns are
    // not global. The secret survives; the label does not.
    expect(redactSecrets("api_key=SUPERSECRETVALUE123")).toBe(
      "[REDACTED]=SUPER[REDACTED]VALUE123",
    );
    expect(redactSecrets("token=AAA token=BBB")).toBe("[REDACTED]=AAA token=BBB");
  });

  it("redactSecrets leaves non-secret text untouched", () => {
    expect(redactSecrets("nothing here")).toBe("nothing here");
  });
});
