import { describe, expect, it } from "vitest";
import { buildOperatorDecisionPacket, sortOperatorApprovals, type OperatorApproval } from "./operatorDecisionModel";

function approval(overrides: Partial<OperatorApproval> = {}): OperatorApproval {
  return {
    _id: "approval-1",
    approvalType: "PROTECTED_DISPATCH",
    requestedAction: "Approve implementation dispatch",
    riskLevel: "HIGH",
    status: "PENDING",
    expiresAt: 2_000_000,
    createdAt: 1,
    workOrder: {
      _id: "wo-1",
      title: "Implement governed decision flow",
      desiredOutcome: "Operators can make an evidence-backed decision.",
      workflowId: "software-factory",
      repository: "MissionControl",
      branchStrategy: "isolated-worktree",
      riskLevel: "HIGH",
      state: "AWAITING_APPROVAL",
      assignedAgent: "builder",
      constraints: ["No production deploy"],
      requiredApprovals: ["RISK_REVIEW"],
      acceptanceCriteria: [
        { id: "ac-1", title: "Unit tests pass", verificationMethod: "TEST" },
      ],
    },
    verificationReceipts: [],
    remainingUncertainty: [],
    ...overrides,
  };
}

describe("operator decision packet", () => {
  it("separates approval from explicit dispatch and proof", () => {
    const packet = buildOperatorDecisionPacket(approval(), 1_000_000);

    expect(packet.canDecide).toBe(true);
    expect(packet.dispatchPreview).toContain("Dispatch remains explicit");
    expect(packet.proofRequirements).toEqual(["Unit tests pass (TEST)"]);
    expect(packet.scope).toContain("Repository: MissionControl");
  });

  it("blocks acceptance when proof is missing", () => {
    const packet = buildOperatorDecisionPacket(approval({
      approvalType: "FINAL_ACCEPTANCE",
      requestedAction: "Accept and close the WorkOrder",
    }), 1_000_000);

    expect(packet.canDecide).toBe(false);
    expect(packet.missingInformation).toContain("Unit tests pass: missing proof");
    expect(packet.blockingReasons[0]).toContain("Acceptance requires");
  });

  it("does not misclassify a pre-dispatch approval that explicitly reserves acceptance", () => {
    const packet = buildOperatorDecisionPacket(approval({
      approvalType: "Human review before execution dispatch, publication, merge, deployment, waiver, or acceptance",
      requestedAction: "Authorize execution dispatch for this internal pilot only",
    }), 1_000_000);

    expect(packet.canDecide).toBe(true);
    expect(packet.blockingReasons).toEqual([]);
  });

  it("uses the latest receipt and treats invalidated proof as stale", () => {
    const packet = buildOperatorDecisionPacket(approval({
      verificationReceipts: [
        { acceptanceCriterionId: "ac-1", status: "PASSED", recordedAt: 10 },
        { acceptanceCriterionId: "ac-1", status: "PASSED", recordedAt: 20, invalidatedAt: 21 },
      ],
    }), 1_000_000);

    expect(packet.evidence[0].status).toBe("STALE");
  });

  it("does not invent missing work order context", () => {
    const packet = buildOperatorDecisionPacket(approval({ workOrder: null }), 1_000_000);

    expect(packet.scope).toContain("Repository: unknown");
    expect(packet.canDecide).toBe(false);
    expect(packet.missingInformation).toContain("Linked WorkOrder is unavailable.");
  });
});

describe("operator attention order", () => {
  it("prioritizes risk, then expiry, independent of input order", () => {
    const rows = [
      approval({ _id: "medium", riskLevel: "MEDIUM", expiresAt: 1_100_000 }),
      approval({ _id: "critical-later", riskLevel: "CRITICAL", expiresAt: 1_900_000 }),
      approval({ _id: "critical-sooner", riskLevel: "CRITICAL", expiresAt: 1_200_000 }),
    ];

    expect(sortOperatorApprovals(rows, 1_000_000).map((row) => row._id)).toEqual([
      "critical-sooner",
      "critical-later",
      "medium",
    ]);
  });
});
