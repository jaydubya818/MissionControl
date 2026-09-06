import { describe, expect, it } from "vitest";
import {
  factoryReviewReceiptMatchesSource,
  factoryHumanReviewOutcome,
  isFactoryHumanReviewCheckpoint,
  isSourceVerificationFreshForPublication,
  validateHumanReviewApprovalContext,
  validatePublicationPermit,
  validatePublishContinuation,
} from "../lib/factoryHumanReview.js";

describe("factory human-review continuation", () => {
  it("binds a v2 human review to the separate verifier identity and exact source subject", () => {
    const run = { _id: "builder", verificationSubject: { kind: "GIT_CANDIDATE", version: 2, digest: "subject", verificationContractDigest: "contract", candidateSha: "candidate" } };
    const receipt = { workflowRunId: "verifier", verificationAttemptId: "verifier", sourceAttemptId: "builder",
      verificationSubjectDigest: "subject", verificationContractDigest: "contract", candidateRevision: "candidate", independenceValid: true };
    expect(factoryReviewReceiptMatchesSource(run, receipt)).toBe(true);
    for (const replacement of [{ workflowRunId: "builder" }, { verificationAttemptId: "other" }, { sourceAttemptId: "other" },
      { verificationSubjectDigest: "other" }, { verificationContractDigest: "other" }, { candidateRevision: "other" }, { independenceValid: false }]) {
      expect(factoryReviewReceiptMatchesSource(run, { ...receipt, ...replacement })).toBe(false);
    }
  });
  it("resumes only an unconditional approval", () => {
    expect(factoryHumanReviewOutcome("APPROVE")).toBe("RESUME_PUBLISH");
    expect(factoryHumanReviewOutcome("APPROVE_WITH_CONDITIONS")).toBe("FAIL_ATTEMPT");
    expect(factoryHumanReviewOutcome("REJECT")).toBe("FAIL_ATTEMPT");
    expect(factoryHumanReviewOutcome("REQUEST_REVISION")).toBe("FAIL_ATTEMPT");
  });

  it("does not treat an ordinary pre-dispatch HUMAN_REVIEW as a Factory checkpoint", () => {
    expect(isFactoryHumanReviewCheckpoint(
      { _id: "approval-generic", approvalType: "HUMAN_REVIEW" },
      null,
    )).toBe(false);
    expect(isFactoryHumanReviewCheckpoint(
      { _id: "approval-generic", approvalType: "HUMAN_REVIEW" },
      { factoryContinuation: { approvalDecisionId: "approval-factory", status: "AWAITING_HUMAN_REVIEW" } },
    )).toBe(false);
  });

  it("does not leave review authority live after the Attempt is canceled", () => {
    expect(isFactoryHumanReviewCheckpoint(
      { _id: "approval-factory", approvalType: "HUMAN_REVIEW" },
      { status: "CANCELED", factoryContinuation: { approvalDecisionId: "approval-factory", status: "AWAITING_HUMAN_REVIEW" } },
    )).toBe(false);
  });

  it("accepts a current approval for the exact paused attempt", () => {
    expect(validateHumanReviewApprovalContext({
      approval: { _id: "approval-1", approvalType: "HUMAN_REVIEW", workflowRunId: "run-1", workOrderRevisionNumber: 2, status: "PENDING" },
      run: {
        _id: "run-1", status: "PAUSED", workOrderRevisionNumber: 2,
        factoryContinuation: { status: "AWAITING_HUMAN_REVIEW", workOrderRevisionNumber: 2, approvalDecisionId: "approval-1" },
      },
      workOrderRevisionNumber: 2,
    })).toEqual({ ok: true });
  });

  it("rejects a stale or cross-attempt approval", () => {
    const result = validateHumanReviewApprovalContext({
      approval: { _id: "approval-1", approvalType: "HUMAN_REVIEW", workflowRunId: "run-old", workOrderRevisionNumber: 1, status: "PENDING" },
      run: {
        _id: "run-1", status: "PAUSED", workOrderRevisionNumber: 2,
        factoryContinuation: { status: "AWAITING_HUMAN_REVIEW", workOrderRevisionNumber: 2, approvalDecisionId: "approval-1" },
      },
      workOrderRevisionNumber: 2,
    });
    expect(result).toEqual({ ok: false, reason: "attempt-mismatch" });
  });

  it("rejects expired and revision-invalidated review authority", () => {
    const base = {
      approval: {
        _id: "approval-1", approvalType: "HUMAN_REVIEW", workflowRunId: "run-1",
        workOrderRevisionNumber: 2, status: "PENDING", expiresAt: 2_000,
      },
      run: {
        _id: "run-1", status: "PAUSED", workOrderRevisionNumber: 2,
        factoryContinuation: {
          status: "AWAITING_HUMAN_REVIEW", workOrderRevisionNumber: 2,
          approvalDecisionId: "approval-1",
        },
      },
      workOrderRevisionNumber: 2,
    };
    expect(validateHumanReviewApprovalContext({ ...base, now: 2_000 }))
      .toEqual({ ok: false, reason: "approval-expired" });
    expect(validateHumanReviewApprovalContext({
      ...base,
      workOrderRevisionNumber: 3,
      now: 1_000,
    })).toEqual({ ok: false, reason: "work-order-revision-mismatch" });
  });

  it("requires the exact Factory-owned approval checkpoint", () => {
    const result = validateHumanReviewApprovalContext({
      approval: { _id: "approval-other", approvalType: "HUMAN_REVIEW", workflowRunId: "run-1", workOrderRevisionNumber: 2, status: "PENDING" },
      run: {
        _id: "run-1", status: "PAUSED", workOrderRevisionNumber: 2,
        factoryContinuation: { status: "AWAITING_HUMAN_REVIEW", workOrderRevisionNumber: 2, approvalDecisionId: "approval-factory" },
      },
      workOrderRevisionNumber: 2,
    });
    expect(result).toEqual({ ok: false, reason: "approval-mismatch" });
  });

  it("requires verification evidence to outlive the publication safety window", () => {
    const now = 1_000_000;
    expect(isSourceVerificationFreshForPublication({ validUntil: now + 60_001, now })).toBe(true);
    expect(isSourceVerificationFreshForPublication({ validUntil: now + 60_000, now })).toBe(false);
    expect(isSourceVerificationFreshForPublication({ validUntil: now - 1, now })).toBe(false);
    expect(isSourceVerificationFreshForPublication({ now })).toBe(false);
  });

  it("requires an approval-linked VERIFIED receipt for the exact candidate", () => {
    const run = {
      _id: "run-1", status: "PENDING", workOrderRevisionNumber: 2,
      factoryContinuation: {
        status: "READY_TO_PUBLISH", workOrderRevisionNumber: 2,
        verificationReceiptId: "receipt-source", resolvedVerificationReceiptId: "receipt-approved",
        approvalDecisionId: "approval-1", candidateRevision: "head-1",
      },
    };
    const approval = {
      _id: "approval-1", approvalType: "HUMAN_REVIEW", workflowRunId: "run-1",
      workOrderRevisionNumber: 2, status: "APPROVED",
    };
    const sourceReceipt = {
      _id: "receipt-source", workflowRunId: "run-1", workOrderRevisionNumber: 2,
      status: "PENDING", verdict: "REQUIRES_HUMAN_REVIEW", candidateRevision: "head-1",
    };
    const resolvedReceipt = {
      _id: "receipt-approved", workflowRunId: "run-1", workOrderRevisionNumber: 2,
      status: "PASSED", verdict: "VERIFIED", candidateRevision: "head-1",
      metadata: { humanReviewApprovalDecisionId: "approval-1", supersedesVerificationReceiptId: "receipt-source" },
    };

    expect(validatePublishContinuation({
      run, approval, sourceReceipt, resolvedReceipt, workOrderRevisionNumber: 2,
    })).toEqual({ ok: true, candidateRevision: "head-1" });

    expect(validatePublishContinuation({
      run,
      approval,
      sourceReceipt,
      resolvedReceipt: { ...resolvedReceipt, candidateRevision: "head-changed" },
      workOrderRevisionNumber: 2,
    })).toEqual({ ok: false, reason: "resolved-receipt-invalid" });
  });

  it("binds the publication permit to the exact lease and candidate", () => {
    const run = {
      _id: "run-1",
      status: "RUNNING",
      factoryContinuation: {
        status: "PUBLICATION_AUTHORIZED",
        candidateRevision: "head-1",
        publicationPermitId: "permit-1",
        publicationPermitLeaseId: "lease-1",
        publicationValidUntil: 10_000,
      },
    };
    expect(validatePublicationPermit({
      run,
      leaseId: "lease-1",
      candidateRevision: "head-1",
      publicationPermitId: "permit-1",
      now: 1_000,
    })).toEqual({ ok: true, validUntil: 10_000 });
    expect(validatePublicationPermit({
      run,
      leaseId: "lease-other",
      candidateRevision: "head-1",
      publicationPermitId: "permit-1",
      now: 1_000,
    })).toEqual({ ok: false, reason: "publication-permit-mismatch" });
    expect(validatePublicationPermit({
      run,
      leaseId: "lease-1",
      candidateRevision: "head-1",
      publicationPermitId: "permit-1",
      now: 10_001,
    })).toEqual({ ok: false, reason: "publication-permit-expired" });
    expect(validatePublicationPermit({
      run,
      leaseId: "lease-1",
      candidateRevision: "head-1",
      publicationPermitId: "permit-1",
      requireUnexpired: false,
      now: 10_001,
    })).toEqual({ ok: true, validUntil: 10_000 });
  });
});
