import { describe, expect, it } from "vitest";
import { buildReviewPackage } from "../lib/reviewPackage";

const base = {
  now: 100,
  run: {
    _id: "run-doc-1",
    status: "COMPLETED",
    runId: "run-1",
    workOrderRevisionNumber: 2,
    repositoryId: "repo-1",
    branch: "codex/work",
    executionBaseSha: "base",
    headSha: "head",
    executionManifestDigest: "manifest-digest",
    pullRequestUrl: "https://github.com/acme/repo/pull/1",
    pullRequestNumber: 1,
  },
  workOrder: {
    _id: "wo-1",
    currentRevisionNumber: 2,
    riskLevel: "MEDIUM",
    riskReasons: ["Touches shared delivery logic"],
    acceptanceCriteria: [{ id: "criterion-1", title: "Tests pass", verificationMethod: "TEST" }],
  },
  receipts: [{
    _id: "receipt-1",
    receiptScope: "ACCEPTANCE_CRITERION" as const,
    acceptanceCriterionId: "criterion-1",
    workflowRunId: "run-doc-1",
    status: "PASSED",
    verifier: "validator:ci",
    evidenceEnvelopeIds: ["evidence-1"],
    sourceRevision: "base",
    candidateRevision: "head",
    workOrderRevisionNumber: 2,
    recordedAt: 90,
  }, {
    _id: "gate-1",
    receiptScope: "WORK_ORDER" as const,
    workflowRunId: "run-doc-1",
    verificationRunId: "verification-1",
    status: "PASSED",
    verifier: "verification-policy/v1",
    evidenceEnvelopeIds: ["evidence-1"],
    verdict: "VERIFIED",
    verdictReasons: ["Every mandatory check passed."],
    sourceRevision: "base",
    candidateRevision: "head",
    workOrderRevisionNumber: 2,
    recordedAt: 91,
  }],
  prChecks: [{
    _id: "check-1",
    workflowRunId: "run-doc-1",
    prUrl: "https://github.com/acme/repo/pull/1",
    repoFullName: "acme/repo",
    branch: "codex/work",
    headSha: "head",
    prState: "OPEN" as const,
    ciStatus: "PASS" as const,
    syncedAt: 95,
  }],
  events: [],
  fileChanges: [{ repositoryPath: "src/feature.ts" }],
  rollbackApproach: "Revert the pull request.",
  expectedRepository: "acme/repo",
};

describe("unified review package", () => {
  it("reports ready only for exact-head CI and complete criterion evidence", () => {
    const review = buildReviewPackage(base);
    expect(review.status).toBe("READY");
    expect(review.criteria[0]).toMatchObject({ status: "PASS", verifier: "validator:ci" });
    expect(review.identity.headSha).toBe("head");
    expect(review.gate).toMatchObject({ status: "PASS", verdict: "VERIFIED", receiptId: "gate-1" });
    expect(review.reviewerFocus).toContain("Touches shared delivery logic");
  });

  it("ignores WorkOrder-level receipts when projecting criterion evidence", () => {
    const review = buildReviewPackage({
      ...base,
      receipts: [
        ...base.receipts,
        {
          _id: "receipt-overall",
          receiptScope: "WORK_ORDER" as const,
          workflowRunId: "run-doc-1",
          status: "PASSED",
          verifier: "verification-engine",
          evidenceEnvelopeIds: ["artifact-overall"],
          verdict: "VERIFIED",
          sourceRevision: "base",
          candidateRevision: "head",
          workOrderRevisionNumber: 2,
          recordedAt: 89,
        },
      ],
    });

    expect(review.status).toBe("READY");
    expect(review.criteria[0]).toMatchObject({
      receiptId: "receipt-1",
      status: "PASS",
    });
  });

  it("fails closed for stale evidence, policy deviation, or mismatched CI head", () => {
    const review = buildReviewPackage({
      ...base,
      receipts: [{ ...base.receipts[0], validUntil: 99 }],
      prChecks: [{ ...base.prChecks[0], headSha: "older-head" }],
      events: [{ eventType: "POLICY_DEVIATION", status: "FAILED", sequenceNumber: 4, errorSummary: "Out-of-scope file" }],
    });
    expect(review.status).toBe("BLOCKED");
    expect(review.blockers).toEqual(expect.arrayContaining([
      "Tests pass: evidence is stale.",
      "1 unresolved policy deviation(s) are recorded.",
      "Exact Attempt, repository, branch, and head GitHub CI evidence is missing.",
    ]));
  });

  it("does not accept a worker-style receipt without verifier identity and linked evidence", () => {
    const review = buildReviewPackage({
      ...base,
      receipts: [{
        receiptScope: "ACCEPTANCE_CRITERION",
        acceptanceCriterionId: "criterion-1",
        workflowRunId: "run-doc-1",
        status: "PASSED",
        sourceRevision: "base",
        candidateRevision: "head",
        workOrderRevisionNumber: 2,
        recordedAt: 90,
      }, base.receipts[1]],
    });
    expect(review.status).toBe("BLOCKED");
    expect(review.criteria[0].status).toBe("UNKNOWN");
  });

  it("blocks self-verification by the worker that claimed the execution", () => {
    const review = buildReviewPackage({
      ...base,
      run: { ...base.run, executionClaimedBy: "worker:factory-1" },
      receipts: [{ ...base.receipts[0], verifier: "worker:factory-1" }, base.receipts[1]],
    });

    expect(review.status).toBe("BLOCKED");
    expect(review.criteria[0]).toMatchObject({
      status: "UNKNOWN",
      integrityIssue: "Verifier matches the execution worker; independent verification is required.",
    });
    expect(review.blockers).toContain(
      "Tests pass: Verifier matches the execution worker; independent verification is required.",
    );
  });

  it("requires an open pull request and fails closed when provider state is absent", () => {
    const closed = buildReviewPackage({
      ...base,
      prChecks: [{ ...base.prChecks[0], prState: "CLOSED" as const }],
    });
    expect(closed.status).toBe("BLOCKED");
    expect(closed.blockers).toContain("Pull request is closed; an open review candidate is required.");

    const unknown = buildReviewPackage({
      ...base,
      prChecks: [{ ...base.prChecks[0], prState: undefined }],
    });
    expect(unknown.status).toBe("INCOMPLETE");
    expect(unknown.blockers).toContain("Pull-request open-state evidence is missing.");
  });

  it("rejects a pull-request URL outside the expected GitHub repository", () => {
    const review = buildReviewPackage({
      ...base,
      run: { ...base.run, pullRequestUrl: "https://github.com/attacker/repo/pull/1" },
      prChecks: [{ ...base.prChecks[0], prUrl: "https://github.com/attacker/repo/pull/1" }],
    });

    expect(review.status).toBe("BLOCKED");
    expect(review.blockers).toContain("Pull-request URL does not match the expected GitHub repository and PR number.");
  });

  it("keeps in-progress and missing records incomplete rather than overstating failure", () => {
    const review = buildReviewPackage({
      ...base,
      run: { status: "RUNNING", runId: "run-2" },
      receipts: [],
      prChecks: [],
      fileChanges: [],
      rollbackApproach: null,
    });
    expect(review.status).toBe("INCOMPLETE");
    expect(review.nextAction).toBe("Attempt has not completed.");
  });

  it("does not accept criterion evidence from a different Attempt", () => {
    const review = buildReviewPackage({
      ...base,
      receipts: [
        { ...base.receipts[0], workflowRunId: "run-doc-other", recordedAt: 999 },
        base.receipts[1],
      ],
    });

    expect(review.status).toBe("INCOMPLETE");
    expect(review.criteria[0]).toMatchObject({ status: "MISSING", receiptId: null });
    expect(review.blockers).toContain("Tests pass: evidence is missing.");
  });

  it("blocks a historical Attempt after the WorkOrder revision advances", () => {
    const review = buildReviewPackage({
      ...base,
      workOrder: { ...base.workOrder, currentRevisionNumber: 3 },
    });

    expect(review.status).toBe("BLOCKED");
    expect(review.blockers).toContain("WorkOrder advanced to revision v3; this Attempt is frozen at v2.");
  });

  it("requires a current exact-candidate server-owned gate receipt", () => {
    const missing = buildReviewPackage({ ...base, receipts: [base.receipts[0]] });
    expect(missing.status).toBe("INCOMPLETE");
    expect(missing.gate.status).toBe("MISSING");

    const mismatched = buildReviewPackage({
      ...base,
      receipts: [base.receipts[0], { ...base.receipts[1], candidateRevision: "older-head" }],
    });
    expect(mismatched.status).toBe("BLOCKED");
    expect(mismatched.gate).toMatchObject({ status: "STALE" });
    expect(mismatched.blockers).toContain("Evidence candidate SHA does not match the inspected pull-request head.");
  });

  it("requires durable gate identity and evidence, not only a VERIFIED label", () => {
    const review = buildReviewPackage({
      ...base,
      receipts: [base.receipts[0], { ...base.receipts[1], verifier: undefined }],
    });

    expect(review.status).toBe("BLOCKED");
    expect(review.gate).toMatchObject({
      status: "UNKNOWN",
      integrityIssue: "Verifier identity is missing from the WorkOrder gate.",
    });
    expect(review.blockers).toContain("Verifier identity is missing from the WorkOrder gate.");
  });

  it("rejects exact-head CI when Attempt or provider lineage differs", () => {
    const review = buildReviewPackage({
      ...base,
      prChecks: [{ ...base.prChecks[0], workflowRunId: "run-doc-other" }],
    });

    expect(review.status).toBe("INCOMPLETE");
    expect(review.ci.status).toBe("MISSING");
    expect(review.blockers).toContain("Exact Attempt, repository, branch, and head GitHub CI evidence is missing.");
  });
});
