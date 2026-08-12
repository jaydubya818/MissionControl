import { describe, expect, it } from "vitest";
import {
  factoryReleaseCounts,
  factoryReleaseNextAction,
  factoryReleaseTone,
} from "./factoryReleaseModel";

describe("factory release operator model", () => {
  it("prioritizes approval and verification work", () => {
    expect(factoryReleaseNextAction({ state: "MERGED", deploymentApprovalStatus: "PENDING" }))
      .toContain("Approve");
    expect(factoryReleaseNextAction({ state: "DEPLOYED", deploymentApprovalStatus: "APPROVED" }))
      .toContain("independent");
    expect(factoryReleaseNextAction({
      state: "DEPLOYED",
      deploymentApprovalStatus: "APPROVED",
      blockingIssue: "health failed",
    })).toContain("roll back");
  });

  it("uses explicit verified and rollback tones", () => {
    expect(factoryReleaseTone("VERIFIED")).toBe("success");
    expect(factoryReleaseTone("ROLLED_BACK")).toBe("error");
  });

  it("counts the actionable lifecycle states", () => {
    expect(factoryReleaseCounts([
      { release: { state: "MERGED", deploymentApprovalStatus: "PENDING" } },
      { release: { state: "DEPLOYED", deploymentApprovalStatus: "APPROVED" } },
      { release: { state: "VERIFIED", deploymentApprovalStatus: "APPROVED" } },
      { release: { state: "ROLLED_BACK", deploymentApprovalStatus: "APPROVED" } },
    ])).toEqual({ total: 4, awaitingApproval: 1, awaitingVerification: 1, verified: 1, rolledBack: 1 });
  });
});
