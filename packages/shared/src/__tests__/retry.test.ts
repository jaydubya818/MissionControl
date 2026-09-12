import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateDelay,
  convexWriteWithJitter,
  createHeartbeat,
  defaultRetryConfig,
  withRetry,
} from "../retry.js";

/**
 * Characterization tests for the shared retry helpers.
 *
 * These pin the behaviour that callers in the orchestration server and the
 * Convex workers already depend on. Several of the assertions below document
 * behaviour that is surprising rather than obviously desirable (see the
 * "retryability" block); they exist so that a future change to the retry
 * contract is visible in a diff instead of silently altering how workers
 * respond to transient failures.
 */

/** Fast config so the real `setTimeout` in `sleep` does not slow the suite. */
const fast = { baseDelayMs: 1, maxDelayMs: 4, jitterFactor: 0 };

describe("calculateDelay", () => {
  it("grows exponentially from the base delay", () => {
    expect(calculateDelay(0, { ...fast, baseDelayMs: 100, maxDelayMs: 10_000 })).toBe(100);
    expect(calculateDelay(1, { ...fast, baseDelayMs: 100, maxDelayMs: 10_000 })).toBe(200);
    expect(calculateDelay(2, { ...fast, baseDelayMs: 100, maxDelayMs: 10_000 })).toBe(400);
    expect(calculateDelay(5, { ...fast, baseDelayMs: 100, maxDelayMs: 10_000 })).toBe(3200);
  });

  it("caps the exponential term at maxDelayMs", () => {
    expect(calculateDelay(20, { ...fast, baseDelayMs: 100, maxDelayMs: 1000 })).toBe(1000);
  });

  it("adds jitter on top of the cap, so the cap is a floor and not a ceiling", () => {
    const withJitter = calculateDelay(20, { baseDelayMs: 100, maxDelayMs: 1000, jitterFactor: 0.5 });
    expect(withJitter).toBeGreaterThanOrEqual(1000);
    expect(withJitter).toBeLessThanOrEqual(1500);
  });

  it("defaults to the exported default config", () => {
    expect(defaultRetryConfig.maxAttempts).toBe(5);
    expect(calculateDelay(0, { jitterFactor: 0 })).toBe(defaultRetryConfig.baseDelayMs);
  });
});

describe("withRetry", () => {
  it("returns the first successful result without sleeping", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(fn, fast)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a retryable error code and returns the eventual success", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("reset"), { code: "ECONNRESET" }))
      .mockResolvedValue("ok");

    await expect(withRetry(fn, fast)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("stops at maxAttempts and rethrows the last error", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }));

    await expect(withRetry(fn, { ...fast, maxAttempts: 3 })).rejects.toThrow("timed out");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  describe("retryability", () => {
    it("does NOT retry a plain Error under the default config", async () => {
      // The retryable check reads `error.code || error.name`. A plain Error has
      // no `code` and a `name` of "Error", which is absent from
      // defaultRetryConfig.retryableErrors, so it fails fast on attempt 1.
      const fn = vi.fn().mockRejectedValue(new Error("boom"));

      await expect(withRetry(fn, fast)).rejects.toThrow("boom");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("falls back to error.name when no code is present", async () => {
      const named = new Error("rate limited");
      named.name = "RATE_LIMITED";
      const fn = vi.fn().mockRejectedValueOnce(named).mockResolvedValue("ok");

      await expect(withRetry(fn, fast)).resolves.toBe("ok");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("retries everything when retryableErrors is explicitly undefined", async () => {
      // Spreading a config whose `retryableErrors` key is present but undefined
      // overwrites the default list, which disables the allowlist entirely.
      const fn = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue("ok");

      await expect(withRetry(fn, { ...fast, retryableErrors: undefined })).resolves.toBe("ok");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("retries nothing when retryableErrors is an empty array", async () => {
      const fn = vi
        .fn()
        .mockRejectedValue(Object.assign(new Error("reset"), { code: "ECONNRESET" }));

      await expect(withRetry(fn, { ...fast, retryableErrors: [] })).rejects.toThrow("reset");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("wraps a non-Error rejection value before rethrowing", async () => {
      const fn = vi.fn().mockRejectedValue("just a string");

      await expect(withRetry(fn, { ...fast, retryableErrors: undefined })).rejects.toThrow(
        "just a string",
      );
    });
  });
});

describe("convexWriteWithJitter", () => {
  it("delays then performs the write and returns its value", async () => {
    const write = vi.fn().mockResolvedValue({ id: 1 });
    await expect(convexWriteWithJitter(write, 1)).resolves.toEqual({ id: 1 });
    expect(write).toHaveBeenCalledTimes(1);
  });
});

describe("createHeartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("beats immediately on start and then on the interval", async () => {
    const beat = vi.fn().mockResolvedValue(undefined);
    const hb = createHeartbeat(beat, 1000);

    hb.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(beat).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(beat).toHaveBeenCalledTimes(2);

    hb.stop();
  });

  it("start() is idempotent while already running", async () => {
    const beat = vi.fn().mockResolvedValue(undefined);
    const hb = createHeartbeat(beat, 1000);

    hb.start();
    hb.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(beat).toHaveBeenCalledTimes(1);

    hb.stop();
  });

  it("stop() prevents any further beats", async () => {
    const beat = vi.fn().mockResolvedValue(undefined);
    const hb = createHeartbeat(beat, 1000);

    hb.start();
    await vi.advanceTimersByTimeAsync(0);
    hb.stop();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(beat).toHaveBeenCalledTimes(1);
  });

  it("keeps beating after a failure instead of tearing the loop down", async () => {
    const beat = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue(undefined);
    const hb = createHeartbeat(beat, 1000, { baseDelayMs: 10, maxDelayMs: 10, jitterFactor: 0 });

    hb.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(beat).toHaveBeenCalledTimes(1);

    // The failure reschedules on the backoff delay (10ms), not the interval.
    await vi.advanceTimersByTimeAsync(10);
    expect(beat).toHaveBeenCalledTimes(2);

    hb.stop();
  });
});
