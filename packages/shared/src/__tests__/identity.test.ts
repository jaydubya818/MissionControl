/**
 * Identity Validation Tests
 *
 * Tests for OpenClaw-aligned identity/soul validation helpers.
 */

import { describe, it, expect } from "vitest";
import { isValidAvatarPath, isValidEmoji } from "../types/identity";

describe("isValidAvatarPath", () => {
  it("should accept http URLs", () => {
    expect(isValidAvatarPath("http://example.com/avatar.png")).toBe(true);
    expect(isValidAvatarPath("https://cdn.example.com/agents/bot.jpg")).toBe(true);
  });

  it("should accept data URIs", () => {
    expect(isValidAvatarPath("data:image/svg+xml;base64,PHN2Zy...")).toBe(true);
    expect(isValidAvatarPath("data:image/png;base64,iVBOR...")).toBe(true);
  });

  it("should accept workspace-relative paths", () => {
    expect(isValidAvatarPath("avatars/agent.png")).toBe(true);
    expect(isValidAvatarPath("assets/images/bot-avatar.jpg")).toBe(true);
    expect(isValidAvatarPath("avatar.png")).toBe(true);
  });

  it("should reject empty or whitespace paths", () => {
    expect(isValidAvatarPath("")).toBe(false);
    expect(isValidAvatarPath("   ")).toBe(false);
  });

  it("should reject absolute paths", () => {
    expect(isValidAvatarPath("/home/user/avatar.png")).toBe(false);
  });

  it("should reject path traversal", () => {
    expect(isValidAvatarPath("../secrets/avatar.png")).toBe(false);
    expect(isValidAvatarPath("assets/../../etc/passwd")).toBe(false);
  });
});

describe("isValidEmoji", () => {
  it("should accept single emojis", () => {
    expect(isValidEmoji("🤖")).toBe(true);
    expect(isValidEmoji("🚀")).toBe(true);
    expect(isValidEmoji("✅")).toBe(true);
  });

  it("should accept emoji with modifiers/sequences", () => {
    expect(isValidEmoji("👨‍💻")).toBe(true);
    expect(isValidEmoji("🏳️‍🌈")).toBe(true);
  });

  it("should reject empty strings", () => {
    expect(isValidEmoji("")).toBe(false);
    expect(isValidEmoji("   ")).toBe(false);
  });

  it("should reject very long strings", () => {
    expect(isValidEmoji("this is not an emoji at all")).toBe(false);
  });
});
