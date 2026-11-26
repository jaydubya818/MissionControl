import { describe, expect, it } from "vitest";
import { buildReviewPackage } from "../lib/reviewPackage";
import { buildReviewIntelligenceProjection } from "../lib/reviewIntelligence";
import { aggregateLearningSignals } from "../lib/factoryLearning";

describe("Review Intelligence deterministic golden path", () => {
  it("preserves accepted lineage while a repeated correction proposes governed improvement", () => {
    const acceptedLineage = Object.freeze({
      missionSpecRevisionId: "mission-spec:r2", missionSpecDigest: "sha256:spec-r2",
      missionPlanId: "mission-plan:r3", qualityContractDigest: "sha256:quality-r3",
      workOrderId: "work-order:checkout", workOrderRevisionNumber: 4,
      workflowRunId: "attempt:implementation-5", candidateRevision: "candidate-sha",
      verificationSubjectId: "verification-subject:1", verificationPlanId: "verification-plan:1",
    });
    const review = buildReviewPackage({
      now: 200,
      run: {
        _id: acceptedLineage.workflowRunId, runId: "run-5", status: "COMPLETED",
        workOrderRevisionNumber: 4, repositoryId: "repo-1", branch: "codex/checkout",
        executionBaseSha: "base-sha", headSha: acceptedLineage.candidateRevision,
        executionClaimedBy: "service:worker", pullRequestUrl: "https://github.com/acme/repo/pull/42",
        pullRequestNumber: 42,
      },
      workOrder: {
        _id: acceptedLineage.workOrderId, currentRevisionNumber: 4,
        acceptanceCriteria: [{ id: "criterion-403", title: "Unauthorized requests return 403", verificationMethod: "TEST" }],
        verificationContract: { schemaVersion: 2 },
      },
      receipts: [{
        _id: "receipt-criterion", receiptScope: "ACCEPTANCE_CRITERION", acceptanceCriterionId: "criterion-403",
        workflowRunId: acceptedLineage.workflowRunId, status: "PASSED", verifier: "service:independent-verifier",
        evidenceEnvelopeIds: ["evidence-403"], sourceRevision: "base-sha", candidateRevision: acceptedLineage.candidateRevision,
        workOrderRevisionNumber: 4, recordedAt: 190,
      }, {
        _id: "receipt-gate", receiptScope: "WORK_ORDER", workflowRunId: acceptedLineage.workflowRunId,
        verificationRunId: "verification-run:1", status: "PASSED", verdict: "VERIFIED",
        verifier: "verification-policy/v2", evidenceEnvelopeIds: ["evidence-403"], independenceValid: true,
        sourceRevision: "base-sha", candidateRevision: acceptedLineage.candidateRevision,
        workOrderRevisionNumber: 4, recordedAt: 191,
      }],
      prChecks: [{ workflowRunId: acceptedLineage.workflowRunId, prUrl: "https://github.com/acme/repo/pull/42", repoFullName: "acme/repo", branch: "codex/checkout", headSha: acceptedLineage.candidateRevision, prState: "OPEN", ciStatus: "PASS", source: "GITHUB", syncedAt: 195 }],
      fileChanges: [{ repositoryPath: "convex/auth.ts" }], rollbackApproach: "Revert PR #42.",
      expectedRepository: "acme/repo",
      currentVerification: {
        current: true, eligible: true, reasons: [],
        sourceAttemptId: acceptedLineage.workflowRunId, candidateRevision: acceptedLineage.candidateRevision,
        verificationReceiptId: "receipt-gate", verificationRunId: "verification-run:1",
        exactIdentity: { workOrderId: acceptedLineage.workOrderId, workOrderRevisionNumber: 4,
          sourceAttemptId: acceptedLineage.workflowRunId, verificationContractDigest: "sha256:contract",
          verificationSubjectDigest: "sha256:subject" },
      },
    });
    expect(review.status).toBe("READY");
    expect(review.criteria[0].status).toBe("PASS");

    const projection = buildReviewIntelligenceProjection({
      workOrder: {
        _id: acceptedLineage.workOrderId, currentRevisionNumber: 4,
        missionPlanId: acceptedLineage.missionPlanId, qualityContractDigest: acceptedLineage.qualityContractDigest,
        missionSpecLineage: { missionSpecRevisionId: acceptedLineage.missionSpecRevisionId, missionSpecDigest: acceptedLineage.missionSpecDigest },
        requirements: [{ id: "requirement-auth", title: "Reject unauthorized access", priority: "MUST" }],
        acceptanceCriteria: [{ id: "criterion-403", title: "Unauthorized requests return 403", requirementIds: ["requirement-auth"] }],
      },
      run: { _id: acceptedLineage.workflowRunId, workOrderRevisionNumber: 4, headSha: acceptedLineage.candidateRevision },
      verificationRun: { _id: "verification-run:1", verificationSubjectId: acceptedLineage.verificationSubjectId, verificationSubjectDigest: "sha256:subject", verificationPlanId: acceptedLineage.verificationPlanId, verificationPlanDigest: "sha256:plan", checks: [] },
      criteria: review.criteria, fileChanges: [{ repositoryPath: "convex/auth.ts" }],
      decisions: [{ workOrderRevisionNumber: 4, candidateRevision: acceptedLineage.candidateRevision, status: "PROPOSED", acceptanceAuthority: false }],
      residualAnalyses: [{ workOrderRevisionNumber: 4, candidateRevision: acceptedLineage.candidateRevision, authority: "ADVISORY", acceptanceAuthority: false, findings: [{ summary: "Potential edge case", authority: "ADVISORY" }] }],
      currentVerification: { current: true, eligible: true, evidenceSetDigest: "sha256:evidence", reasons: [] },
    });
    expect(projection.exactLineage).toMatchObject(acceptedLineage);
    expect(projection.authority).toMatchObject({ reviewApproval: "NOT_ACCEPTANCE", acceptanceMutation: "workOrders.accept" });

    const signals = ["checkout-a", "checkout-b", "checkout-c"].map((workOrderId) => ({
      projectId: "workspace-a", repositoryKey: "acme/repo", signalType: "REPEATED_REVIEW_FINDING" as const,
      deterministicKey: "MISSING_DETERMINISTIC_GATE:unauthorized access needs a permanent regression",
      evidenceFingerprint: `review-correction:${workOrderId}`, evidenceRefs: [`work-order:${workOrderId}`],
      observedAt: 200, confidence: 1, severity: "HIGH" as const,
      reason: "Promote the invariant to a deterministic gate.", acceptanceAuthority: false as const,
    }));
    const learning = aggregateLearningSignals(signals, { minimumOccurrences: 3, maximumEvidenceItems: 20, windowStart: 0 });
    expect(learning.candidates[0]).toMatchObject({ candidateType: "ADD_DETERMINISTIC_GATE", acceptanceAuthority: false });
    expect(acceptedLineage).toEqual({
      missionSpecRevisionId: "mission-spec:r2", missionSpecDigest: "sha256:spec-r2",
      missionPlanId: "mission-plan:r3", qualityContractDigest: "sha256:quality-r3",
      workOrderId: "work-order:checkout", workOrderRevisionNumber: 4,
      workflowRunId: "attempt:implementation-5", candidateRevision: "candidate-sha",
      verificationSubjectId: "verification-subject:1", verificationPlanId: "verification-plan:1",
    });
  });
});
