import { describe, expect, it } from "vitest";
import {
  containsUnredactedFactoryMemorySecret,
  redactFactoryMemoryText,
  sanitizeFactoryMemoryValue,
} from "../factoryMemorySecurity";

describe("redactFactoryMemoryText", () => {
  it("redacts a bearer credential and counts every pattern that fired", () => {
    const result = redactFactoryMemoryText("Authorization: Bearer abcdefgh12345678");

    expect(result.value).not.toContain("abcdefgh12345678");
    // Both the key/value rule and the bearer rule match this line, so the
    // redaction count is per-pattern rather than per-secret.
    expect(result.redactionCount).toBe(2);
  });

  it("normalises key/value separators to '=' when redacting", () => {
    expect(redactFactoryMemoryText("password: hunter2xyz")).toEqual({
      value: "password=[REDACTED]",
      redactionCount: 1,
    });
  });

  it("counts truncation as a redaction so oversized input is never silently dropped", () => {
    expect(redactFactoryMemoryText("abcdefghij", 4)).toEqual({
      value: "abcd",
      redactionCount: 1,
    });
  });

  it("leaves text without credential material untouched", () => {
    expect(redactFactoryMemoryText("the deploy step reads from the release notes")).toEqual({
      value: "the deploy step reads from the release notes",
      redactionCount: 0,
    });
  });
});

describe("sanitizeFactoryMemoryValue", () => {
  it("redacts values whose key names look like credentials, in any casing style", () => {
    const result = sanitizeFactoryMemoryValue({
      api_key: "x",
      apiKey: "y",
      "session-token": "q",
      notes: "z",
    });

    expect(result.value).toEqual({
      api_key: "[REDACTED]",
      apiKey: "[REDACTED]",
      "session-token": "[REDACTED]",
      notes: "z",
    });
    expect(result.redactionCount).toBe(3);
  });

  it("stops recursing at depth 6 and marks the boundary", () => {
    const result = sanitizeFactoryMemoryValue({ a: { b: { c: { d: { e: { f: { g: 1 } } } } } } });

    expect(result.value).toEqual({ a: { b: { c: { d: { e: { f: "[TRUNCATED]" } } } } } });
    // The depth cut-off is not counted as a redaction.
    expect(result.redactionCount).toBe(0);
  });

  it("caps arrays and objects at 100 entries and records one redaction for the cap", () => {
    const array = sanitizeFactoryMemoryValue(Array.from({ length: 105 }, (_, i) => i));
    expect((array.value as unknown[]).length).toBe(100);
    expect(array.redactionCount).toBe(1);

    const object = sanitizeFactoryMemoryValue(
      Object.fromEntries(Array.from({ length: 105 }, (_, i) => [`k${i}`, i])),
    );
    expect(Object.keys(object.value as object).length).toBe(100);
    expect(object.redactionCount).toBe(1);
  });

  it("drops non-finite numbers without recording a redaction", () => {
    expect(sanitizeFactoryMemoryValue(Number.NaN)).toEqual({ value: undefined, redactionCount: 0 });
    expect(sanitizeFactoryMemoryValue(Infinity)).toEqual({ value: undefined, redactionCount: 0 });
    expect(sanitizeFactoryMemoryValue(42)).toEqual({ value: 42, redactionCount: 0 });
  });

  it("passes null, undefined and booleans through untouched", () => {
    expect(sanitizeFactoryMemoryValue(null).value).toBeNull();
    expect(sanitizeFactoryMemoryValue(undefined).value).toBeUndefined();
    expect(sanitizeFactoryMemoryValue(false).value).toBe(false);
  });

  it("stringifies values it cannot structurally sanitize", () => {
    expect(sanitizeFactoryMemoryValue(10n)).toEqual({ value: "10", redactionCount: 0 });
  });
});

describe("containsUnredactedFactoryMemorySecret", () => {
  it("reports redacted text as clean and raw credential material as dirty", () => {
    const raw = `ghp_${"a".repeat(20)}`;

    expect(containsUnredactedFactoryMemorySecret(raw)).toBe(true);
    expect(containsUnredactedFactoryMemorySecret(redactFactoryMemoryText(raw).value)).toBe(false);
  });

  it("detects fine-grained GitHub PATs, which the classic gh*_ rule cannot match", () => {
    const finegrained = `github_pat_${"A1".repeat(11)}_${"b3".repeat(30)}`;

    expect(containsUnredactedFactoryMemorySecret(finegrained)).toBe(true);
    expect(redactFactoryMemoryText(finegrained).value).toBe("[REDACTED]");
  });

  it("detects stateless GitHub App installation tokens", () => {
    const installationToken = `ghs_246813579_${"eyJ"}${"aB7_".repeat(12)}.${"cD8-".repeat(12)}.${"eF9_".repeat(12)}`;

    expect(containsUnredactedFactoryMemorySecret(installationToken)).toBe(true);
    expect(redactFactoryMemoryText(installationToken).value).toBe("[REDACTED]");
  });

  it("detects Telegram bot tokens", () => {
    const botToken = `8123456789:AA${"Qr7xKz".repeat(6)}`;

    expect(containsUnredactedFactoryMemorySecret(botToken)).toBe(true);
    expect(redactFactoryMemoryText(botToken).value).toBe("[REDACTED]");
  });

  it("does not let the [REDACTED] marker mask adjacent live credentials", () => {
    expect(
      containsUnredactedFactoryMemorySecret(`[REDACTED]AKIAIOSFODNN7ABCDEFG[REDACTED]`), // secret-scan: allow-fixture
    ).toBe(true);
  });
});
