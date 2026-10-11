import { expect, it } from "vitest";
import { appendCurrentVerificationQualityGateDecision } from "../lib/currentVerification";

it("rejects an idempotency collision across ordinary and isolated gate authority", async () => {
  const ctx = { db: { query: () => ({ withIndex: () => ({ first: async () => ({
    workOrderId: "wo", metadata: { qualificationScope: "ISOLATED_ENTERPRISE_QUALIFICATION" },
  }) }) }) } };
  await expect(appendCurrentVerificationQualityGateDecision(ctx, { _id: "wo" }, {} as any,
    "same:isolated-enterprise", 1)).rejects.toThrow("authority scope");
});
