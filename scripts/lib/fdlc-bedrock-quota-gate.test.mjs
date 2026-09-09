import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { requireConfirmedBedrockQuota } from "./fdlc-bedrock-quota-gate.mjs";

const currentDiagnosis = JSON.parse(
  readFileSync(
    new URL(
      "../../docs/testing/evidence/fdlc-bedrock-live-20260906/quota-diagnosis.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const route = {
  awsAccountId: "083665737366",
  region: "us-east-1",
  inferenceProfileId: "us.anthropic.claude-sonnet-4-6",
  modelId: "anthropic.claude-sonnet-4-6",
};
const countTokens = { inputTokens: 44 };

describe("Bedrock daily quota dispatch gate", () => {
  it("fails closed for the current administrator-action hold", () => {
    expect(() =>
      requireConfirmedBedrockQuota({
        diagnosis: currentDiagnosis,
        route,
        countTokens,
        maxOutputTokens: 32,
        now: Date.parse("2026-09-07T20:20:00Z"),
      }),
    ).toThrow("QUALIFICATION_BEDROCK_QUOTA_UNCONFIRMED");
  });

  it("admits only a current exact-route confirmation with enough capacity", () => {
    const now = Date.parse("2026-09-07T20:20:00Z");
    expect(
      requireConfirmedBedrockQuota({
        diagnosis: {
          ...currentDiagnosis,
          state: "BEDROCK_QUOTA_CAPACITY_CONFIRMED",
          quota: {
            ...currentDiagnosis.quota,
            currentAppliedValue: 1000,
            availableTokensAtConfirmation: 76,
          },
          capacityConfirmedAt: now - 1000,
          capacityConfirmationExpiresAt: now + 1000,
          existingIncreaseRequest: "NONE",
        },
        route,
        countTokens,
        maxOutputTokens: 32,
        now,
      }),
    ).toEqual({ minimumAvailableTokens: 76 });
  });
});
