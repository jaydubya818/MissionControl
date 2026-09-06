import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { gitBlobDigest } from "../lib/gitBlobDigest";

describe("Git object digest compatibility", () => {
  it.each(["", "hello\n", "\ufeff# BOM\n", "Unicode 界 😀\n", ...[54, 55, 56, 63, 64, 65, 8000].map(n => "x".repeat(n))])("matches independent Node SHA implementations for vector %#", content => {
    const bytes = Buffer.from(content, "utf8");
    const object = Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]);
    expect(gitBlobDigest(content, 40)).toBe(createHash("sha1").update(object).digest("hex"));
    expect(gitBlobDigest(content, 64)).toBe(createHash("sha256").update(object).digest("hex"));
  });
  it("rejects unsupported Git object formats", () => {
    expect(() => gitBlobDigest("synthetic", 41)).toThrow("Unsupported");
  });
});
