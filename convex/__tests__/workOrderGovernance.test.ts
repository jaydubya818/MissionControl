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
    expiresAt: row.expiresAt,
  }));

const receipts = (rows: Partial<VerificationReceiptLike>[]): VerificationReceiptLike[] =>
  rows.map((row, index) => ({
    receiptScope: row.receiptScope,
    acceptanceCriterionId: row.acceptanceCriterionId ?? `ac-${index + 1}`,
    status: row.status ?? "PENDING",
    verdict: row.verdict,
    waiverApprovalDecisionId: row.waiverApprovalDecisionId,
    _creationTime: row._creationTime ?? index + 1,
    validUntil: row.validUntil,
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

  it("marks approval status expired when a valid approval ages out", () => {
    expect(
      deriveApprovalStatus({
        riskLevel: "HIGH",
        requiredApprovals: [],
        approvals: approvals([{ approvalType: "RISK_REVIEW", status: "APPROVED", expiresAt: 1 }]),
        now: 2,
      })
    ).toBe("EXPIRED");
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

  it("blocks acceptance when no acceptance criteria are defined", () => {
    // Regression: with an empty criteria list every criterion check below was a
    // no-op and nothing else supplied a floor, so a LOW-risk WorkOrder with no
    // verification contract reached DONE with zero evidence of any kind.
    const result = evaluateAcceptance({
      riskLevel: "LOW",
      requiredApprovals: [],
      approvalDecisions: [],
      acceptanceCriteria: [],
      verificationReceipts: [],
    });

    expect(result.eligible).toBe(false);
    expect(result.blockingReasons).toContain(
      "No acceptance criteria are defined for this Work Order"
    );
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

  it("blocks acceptance when approval expired", () => {
    const result = evaluateAcceptance({
      riskLevel: "HIGH",
      requiredApprovals: [],
      approvalDecisions: approvals([{ approvalType: "RISK_REVIEW", status: "APPROVED", expiresAt: 1 }]),
      acceptanceCriteria: [{ id: "ac-1", title: "Build passes", status: "PASS" }],
      verificationReceipts: receipts([{ acceptanceCriterionId: "ac-1", status: "PASSED" }]),
      now: 2,
    });

    expect(result.eligible).toBe(false);
    expect(result.expiredApprovalTypes).toEqual(["RISK_REVIEW"]);
  });

  it("blocks acceptance when evidence expired", () => {
    const result = evaluateAcceptance({
      riskLevel: "LOW",
      requiredApprovals: [],
      approvalDecisions: [],
      acceptanceCriteria: [{ id: "ac-1", title: "Build passes", status: "PASS" }],
      verificationReceipts: receipts([{ acceptanceCriterionId: "ac-1", status: "PASSED", validUntil: 1 }]),
      now: 2,
    });

    expect(result.eligible).toBe(false);
    expect(result.staleCriteriaIds).toEqual(["ac-1"]);
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

  it("blocks criterion-complete work when the independent Work Order verdict failed", () => {
    const result = evaluateAcceptance({
      riskLevel: "LOW",
      requiredApprovals: [],
      approvalDecisions: [],
      acceptanceCriteria: [{ id: "ac-1", title: "Build passes", status: "PASS" }],
      verificationReceipts: receipts([
        { receiptScope: "ACCEPTANCE_CRITERION", acceptanceCriterionId: "ac-1", status: "PASSED", _creationTime: 1 },
        { receiptScope: "WORK_ORDER", acceptanceCriterionId: undefined, status: "FAILED", verdict: "NOT_VERIFIED", _creationTime: 2 },
      ]),
    });
    expect(result.eligible).toBe(false);
    expect(result.verificationVerdict).toBe("NOT_VERIFIED");
    expect(result.blockingReasons).toContain("Work Order verification verdict: NOT_VERIFIED");
  });
});
