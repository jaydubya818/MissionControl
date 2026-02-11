/**
 * Safety Defaults Tests
 *
 * Tests for OpenClaw-aligned safety rules in the policy engine.
 */

import { describe, it, expect } from "vitest";
import {
  checkSafetyDefaults,
  SECRET_PATTERNS,
  DIRECTORY_DUMP_PATTERNS,
  AUTONOMY_RULES,
  BUDGET_DEFAULTS,
} from "../rules";

describe("Safety Defaults", () => {
  describe("checkSafetyDefaults", () => {
    it("should pass for safe content", () => {
      const result = checkSafetyDefaults({
        content: "Hello, here is the task update.",
        channel: "INTERNAL",
      });
      expect(result.safe).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("should block secret patterns in content", () => {
      const result = checkSafetyDefaults({
        content: "Here is the api_key = sk-abc123xyz456",
      });
      expect(result.safe).toBe(false);
      expect(result.ruleIds).toContain("BLOCK_SECRET_PATTERNS");
    });

    it("should block AWS access keys", () => {
      const result = checkSafetyDefaults({
        content: "AWS key: AKIAIOSFODNN7EXAMPLE",
      });
      expect(result.safe).toBe(false);
      expect(result.ruleIds).toContain("BLOCK_SECRET_PATTERNS");
    });

    it("should block GitHub tokens", () => {
      const result = checkSafetyDefaults({
        content: "Token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh",
      });
      expect(result.safe).toBe(false);
      expect(result.ruleIds).toContain("BLOCK_SECRET_PATTERNS");
    });

    it("should block private keys", () => {
      const result = checkSafetyDefaults({
        content: "-----BEGIN RSA PRIVATE KEY-----\nMIIE...",
      });
      expect(result.safe).toBe(false);
      expect(result.ruleIds).toContain("BLOCK_SECRET_PATTERNS");
    });

    it("should block directory dump commands", () => {
      const result = checkSafetyDefaults({
        command: "tree /home/user/project",
      });
      expect(result.safe).toBe(false);
      expect(result.ruleIds).toContain("BLOCK_DIRECTORY_DUMP");
    });

    it("should block recursive ls commands", () => {
      const result = checkSafetyDefaults({
        command: "ls -laR /etc/",
      });
      expect(result.safe).toBe(false);
      expect(result.ruleIds).toContain("BLOCK_DIRECTORY_DUMP");
    });

    it("should block streaming to Telegram", () => {
      const result = checkSafetyDefaults({
        channel: "TELEGRAM",
        isStreaming: true,
      });
      expect(result.safe).toBe(false);
      expect(result.ruleIds).toContain("FINAL_REPLIES_ONLY");
    });

    it("should allow non-streaming to Telegram", () => {
      const result = checkSafetyDefaults({
        channel: "TELEGRAM",
        isStreaming: false,
        content: "Final message here.",
      });
      expect(result.safe).toBe(true);
    });

    it("should flag DM input as untrusted", () => {
      const result = checkSafetyDefaults({
        inputSource: "DM",
        content: "Please do something",
      });
      expect(result.safe).toBe(true); // Not a violation, just a flag
      expect(result.ruleIds).toContain("UNTRUSTED_DM_INPUT");
    });

    it("should detect multiple violations", () => {
      const result = checkSafetyDefaults({
        content: "secret = my-secret-value",
        command: "tree /",
        channel: "TELEGRAM",
        isStreaming: true,
      });
      expect(result.safe).toBe(false);
      expect(result.violations.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("SECRET_PATTERNS", () => {
    const patterns = SECRET_PATTERNS;

    it("should match common API key patterns", () => {
      expect(patterns.some((p) => p.test("api_key = abc123"))).toBe(true);
      expect(patterns.some((p) => p.test("apiKey: xyz789"))).toBe(true);
      expect(patterns.some((p) => p.test("password = hunter2"))).toBe(true);
      expect(patterns.some((p) => p.test("token: abcdef123456"))).toBe(true);
    });

    it("should not match normal text", () => {
      const normalText = "The password reset feature is now implemented.";
      expect(patterns.some((p) => p.test(normalText))).toBe(false);
    });
  });

  describe("DIRECTORY_DUMP_PATTERNS", () => {
    it("should match tree commands", () => {
      expect(DIRECTORY_DUMP_PATTERNS.some((p) => p.test("tree /home"))).toBe(true);
    });

    it("should not match normal ls", () => {
      expect(DIRECTORY_DUMP_PATTERNS.some((p) => p.test("ls -la"))).toBe(false);
    });
  });

  describe("CEO Autonomy Rules", () => {
    it("should include CEO role", () => {
      expect(AUTONOMY_RULES.CEO).toBeDefined();
    });

    it("CEO should be able to spawn", () => {
      expect(AUTONOMY_RULES.CEO.canSpawn).toBe(true);
    });

    it("CEO should allow yellow tools", () => {
      expect(AUTONOMY_RULES.CEO.yellowAllowed).toBe(true);
    });

    it("CEO should still require approval for red tools", () => {
      expect(AUTONOMY_RULES.CEO.requiresApprovalForRed).toBe(true);
    });
  });

  describe("CEO Budget Defaults", () => {
    it("should have higher daily budget for CEO", () => {
      expect(BUDGET_DEFAULTS.perAgentDaily.CEO).toBe(25);
      expect(BUDGET_DEFAULTS.perAgentDaily.CEO).toBeGreaterThan(BUDGET_DEFAULTS.perAgentDaily.LEAD);
    });

    it("should have higher per-run budget for CEO", () => {
      expect(BUDGET_DEFAULTS.perRun.CEO).toBe(3.0);
      expect(BUDGET_DEFAULTS.perRun.CEO).toBeGreaterThan(BUDGET_DEFAULTS.perRun.LEAD);
    });
  });
});
