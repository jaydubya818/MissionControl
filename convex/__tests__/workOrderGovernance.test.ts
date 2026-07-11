import { describe, expect, it } from "vitest";
import {
  deriveApprovalStatus,
  deriveVerificationStatus,
  evaluateAcceptance,
  requiredApprovalTypes,
  type ApprovalDecisionLike,
  type VerificationReceiptLike,
} from "../lib/workOrderGovernance";

const approvals = (rows: Partial<ApprovalDecisionLike>[]): ApprovalDecisionLike[] =>
  rows.map((row, index) => ({
    approvalType: row.approvalType ?? "RISK_REVIEW",
    status: row.status ?? "PENDING",
    _creationTime: row._creationTime ?? index + 1,
    requestedAction: row.requestedAction,
  }));

const receipts = (rows: Partial<VerificationReceiptLike>[]): VerificationReceiptLike[] =>
  rows.map((row, index) => ({
    acceptanceCriterionId: row.acceptanceCriterionId ?? `ac-${index + 1}`,
    status: row.status ?? "PENDING",
    waiverApprovalDecisionId: row.waiverApprovalDecisionId,
    _creationTime: row._creationTime ?? index + 1,
  }));

describe("work order governance helpers", () => {
  it("requires implicit risk review approval for high-risk work", () => {
    expect(requiredApprovalTypes({ riskLevel: "HIGH", requiredApprovals: [] })).toEqual(["RISK_REVIEW"]);
  });

  it("marks verification stale when any criterion is stale", () => {
    expect(deriveVerificationStatus([{ status: "PASS" }, { status: "STALE" }])).toBe("STALE");
  });

  it("derives revision requested approval status", () => {
    expect(
      deriveApprovalStatus({
        riskLevel: "LOW",
        requiredApprovals: ["SECURITY"],
        approvals: approvals([{ approvalType: "SECURITY", status: "REVISION_REQUESTED" }]),
      })
    ).toBe("REVISION_REQUESTED");
  });

  it("blocks acceptance when a receipt is missing", () => {
    const result = evaluateAcceptance({
      riskLevel: "LOW",
      requiredApprovals: [],
      approvalDecisions: [],
      acceptanceCriteria: [{ id: "ac-1", title: "Build passes", status: "PENDING" }],
      verificationReceipts: [],
    });

    expect(result.eligible).toBe(false);
    expect(result.missingCriteriaIds).toEqual(["ac-1"]);
  });

  it("blocks acceptance when a receipt failed", () => {
    const result = evaluateAcceptance({
      riskLevel: "LOW",
      requiredApprovals: [],
      approvalDecisions: [],
      acceptanceCriteria: [{ id: "ac-1", title: "Build passes", status: "FAIL" }],
      verificationReceipts: receipts([{ acceptanceCriterionId: "ac-1", status: "FAILED" }]),
    });

    expect(result.eligible).toBe(false);
    expect(result.failedCriteriaIds).toEqual(["ac-1"]);
  });

  it("requires waiver approval for waived criteria", () => {
    const result = evaluateAcceptance({
      riskLevel: "LOW",
      requiredApprovals: [],
      approvalDecisions: [],
      acceptanceCriteria: [{ id: "ac-1", title: "Build passes", status: "WAIVED" }],
      verificationReceipts: receipts([{ acceptanceCriterionId: "ac-1", status: "WAIVED" }]),
    });

    expect(result.eligible).toBe(false);
    expect(result.waiverWithoutApprovalCriteriaIds).toEqual(["ac-1"]);
  });

  it("accepts only when approvals and receipts are satisfied", () => {
    const result = evaluateAcceptance({
      riskLevel: "HIGH",
      requiredApprovals: [],
      approvalDecisions: approvals([{ approvalType: "RISK_REVIEW", status: "APPROVED" }]),
      acceptanceCriteria: [{ id: "ac-1", title: "Build passes", status: "PASS" }],
      verificationReceipts: receipts([{ acceptanceCriterionId: "ac-1", status: "PASSED" }]),
    });

    expect(result.eligible).toBe(true);
    expect(result.blockingReasons).toEqual([]);
  });
});
