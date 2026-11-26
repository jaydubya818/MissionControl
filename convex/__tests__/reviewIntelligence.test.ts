import { describe, expect, it } from "vitest";
import {
  boundedReviewText,
  buildReviewIntelligenceProjection,
  buildSemanticChangeGroups,
  normalizeReviewCorrection,
} from "../lib/reviewIntelligence";
import { aggregateLearningSignals } from "../lib/factoryLearning";

describe("Review Intelligence V1 domain", () => {
  it.each([
    ["apps/orchestration-server/src/factoryGitRuntime.ts", "Other"],
    ["apps/orchestration-server/src/factoryAttemptWorker.ts", "Other"],
    ["apps/api/src/server.ts", "Other"],
    ["apps/mission-control-ui/src/App.tsx", "UI"],
    ["apps/web/src/components/Button.ts", "UI"],
    ["apps/ui/src/styles/theme.css", "UI"],
    ["apps/orchestration-server/src/auth.ts", "Authentication"],
  ])("classifies %s from specific evidence rather than an arbitrary app root", (path, name) => {
    const file = { path, diffLocation: "artifact:exact-diff", artifactId: "artifact-1" };
    expect(buildSemanticChangeGroups([file])).toEqual([
      {
        id: name.toLowerCase(),
        name,
        method: "DETERMINISTIC",
        authority: "ADVISORY",
        files: [file],
      },
    ]);
  });

  it("groups exact file lineage deterministically and preserves a raw-diff path", () => {
    const groups = buildSemanticChangeGroups([
      { path: "apps/ui/src/AuthPanel.tsx", diffLocation: "artifact:diff#L1" },
      { path: "convex/__tests__/verification.test.ts" },
      { path: "docs/adr/001-review.md" },
      { path: "pnpm-lock.yaml" },
    ]);
    expect(groups.map((group) => group.name)).toEqual(["Authentication", "Tests", "Documentation", "Dependencies"]);
    expect(groups.every((group) => group.method === "DETERMINISTIC" && group.authority === "ADVISORY")).toBe(true);
    expect(groups.flatMap((group) => group.files)).toContainEqual({
      path: "apps/ui/src/AuthPanel.tsx", diffLocation: "artifact:diff#L1",
    });
  });

  it("redacts secret-shaped text, strips controls, and caps persisted excerpts", () => {
    const value = boundedReviewText(`token=super-secret-value\u0000 ghp_${"a".repeat(36)}\n${"x".repeat(3_000)}`);
    expect(value).not.toContain("super-secret-value");
    expect(value).not.toContain("ghp_");
    expect(value).toContain("[REDACTED]");
    expect(value.length).toBeLessThanOrEqual(2_000);
  });

  it("normalizes repeated corrections without treating volatile revisions as new evidence", () => {
    expect(normalizeReviewCorrection("Add a test for commit abcdef123 and case 42"))
      .toBe(normalizeReviewCorrection("Add a test for commit 123456abcdef and case 84"));
  });

  it("projects requirement-to-evidence lineage and never upgrades UNKNOWN", () => {
    const projection = buildReviewIntelligenceProjection({
      workOrder: {
        _id: "wo-1", currentRevisionNumber: 2, title: "Protect API", desiredOutcome: "Return 403",
        qualityContractDigest: "sha256:quality", missionPlanId: "plan-1",
        missionSpecLineage: { missionSpecRevisionId: "spec-1", missionSpecDigest: "sha256:spec" },
        requirements: [{ id: "req-1", title: "Unauthorized access is denied", priority: "MUST" }],
        acceptanceCriteria: [{ id: "criterion-1", title: "Unauthorized access returns 403", requirementIds: ["req-1"] }],
      },
      run: {
        _id: "attempt-1", workOrderRevisionNumber: 2, headSha: "candidate-sha",
        pullRequestUrl: "https://github.com/acme/repo/pull/1", executionClaimedBy: "worker:1",
      },
      missionPlan: {
        _id: "plan-1", revisionNumber: 1, status: "APPROVED", summary: "Protect API",
        assertions: [{ assertionId: "assertion-1", title: "403 invariant", verificationMethod: "TEST", requiredEvidence: "API response", sourceRequirementIds: ["req-1"] }],
      },
      verificationRun: {
        _id: "verification-1", verificationSubjectId: "subject-1", verificationSubjectDigest: "sha256:subject",
        verificationPlanId: "plan-verification-1", verificationPlanDigest: "sha256:verification-plan",
        verificationSubject: { kind: "GIT_CANDIDATE", candidateSha: "candidate-sha", treeSha: "tree-sha", provider: "GITHUB", providerRepositoryId: "provider-repo", pullRequest: { headSha: "candidate-sha", providerPullRequestId: "provider-pr" } },
        checks: [{ checkId: "check-1", name: "API test", verifierId: "verifier:1", status: "ERROR", acceptanceCriterionIds: ["criterion-1"], evidenceIds: [] }],
      },
      prChecks: [{ workflowRunId: "attempt-1", prUrl: "https://github.com/acme/repo/pull/1", headSha: "new-pr-head", source: "GITHUB", syncedAt: 20 }],
      evidenceEnvelopes: [],
      criteria: [{ id: "criterion-1", status: "UNKNOWN", verificationMethod: "TEST", receiptId: "receipt-1", verifier: "verifier:1" }],
      fileChanges: [{ repositoryPath: "convex/auth.ts", diffLocation: "artifact:diff" }],
      attempts: [{ _id: "attempt-failed", runId: "run-failed", status: "FAILED", attemptPurpose: "IMPLEMENTATION", failureSummary: "Candidate did not compile.", executionAttemptNumber: 1, failedAt: 9 }],
      currentVerification: { current: false, reasons: ["Candidate head changed."] },
    });
    expect(projection.criterionMatrix[0]).toMatchObject({
      result: "UNKNOWN", current: false,
      criterion: { id: "criterion-1", requirementIds: ["req-1"] },
      specRequirements: [{ id: "req-1" }],
      planAssertions: [{ id: "assertion-1" }],
      verificationChecks: [{ id: "check-1", status: "ERROR" }],
      lineage: {
        missionSpecRevisionId: "spec-1", missionSpecDigest: "sha256:spec",
        missionPlanId: "plan-1", missionPlanRevisionNumber: 1,
        workOrderId: "wo-1", workOrderRevisionNumber: 2,
        verificationRunId: "verification-1", verificationSubjectDigest: "sha256:subject",
        verificationPlanDigest: "sha256:verification-plan",
      },
    });
    expect(projection.exactLineage).toMatchObject({
      missionSpecRevisionId: "spec-1", missionSpecDigest: "sha256:spec",
      verificationSubjectId: "subject-1", verificationPlanId: "plan-verification-1", current: false,
      treeSha: "tree-sha", verificationSubjectPrHeadSha: "candidate-sha", currentPullRequestHeadSha: "new-pr-head",
    });
    expect(projection.changes.rawDiffUrl).toBe("https://github.com/acme/repo/pull/1/files");
    expect(projection.failedOrRecovered[0]).toMatchObject({
      eventType: "ATTEMPT_FAILED", workflowRunId: "attempt-failed", runId: "run-failed",
      summary: "run-failed · Candidate did not compile.",
    });
    expect(projection.authority.reviewApproval).toBe("NOT_ACCEPTANCE");
  });

  it("requires three independent WorkOrders before review corrections create a candidate", () => {
    const base = {
      projectId: "workspace-a", repositoryKey: "acme/repo",
      signalType: "REPEATED_REVIEW_FINDING" as const,
      deterministicKey: "missing_deterministic_gate:add regression for unauthorized requests",
      evidenceRefs: ["review-judgment:1"], observedAt: 10, confidence: 1,
      severity: "HIGH" as const, reason: "Add a permanent regression.", acceptanceAuthority: false as const,
    };
    const duplicateWorkOrder = aggregateLearningSignals([
      { ...base, evidenceFingerprint: "review-correction:wo-1:gate" },
      { ...base, evidenceFingerprint: "review-correction:wo-1:gate", evidenceRefs: ["review-judgment:2"] },
      { ...base, evidenceFingerprint: "review-correction:wo-2:gate" },
    ], { minimumOccurrences: 3, maximumEvidenceItems: 20, windowStart: 0 });
    expect(duplicateWorkOrder.candidates).toHaveLength(0);
    expect(duplicateWorkOrder.duplicatesSuppressed).toBe(1);

    const independent = aggregateLearningSignals([
      { ...base, evidenceFingerprint: "review-correction:wo-1:gate" },
      { ...base, evidenceFingerprint: "review-correction:wo-2:gate" },
      { ...base, evidenceFingerprint: "review-correction:wo-3:gate" },
    ], { minimumOccurrences: 3, maximumEvidenceItems: 20, windowStart: 0 });
    expect(independent.candidates[0]).toMatchObject({
      candidateType: "ADD_DETERMINISTIC_GATE", acceptanceAuthority: false,
    });
  });

  it("keeps contradictory residual findings advisory beside deterministic evidence", () => {
    const projection = buildReviewIntelligenceProjection({
      workOrder: { _id: "wo-1", currentRevisionNumber: 1, acceptanceCriteria: [] },
      run: { _id: "attempt-1", workOrderRevisionNumber: 1, headSha: "head" },
      criteria: [], fileChanges: [],
      residualAnalyses: [{
        workOrderRevisionNumber: 1, candidateRevision: "head",
        findings: [{ summary: "AI claims the verified path is broken.", authority: "ADVISORY" }],
        authority: "ADVISORY", acceptanceAuthority: false,
      }],
      currentVerification: { current: true, eligible: true, reasons: [] },
    });
    expect(projection.exactLineage.current).toBe(true);
    expect(projection.residualAnalyses[0]).toMatchObject({ authority: "ADVISORY", acceptanceAuthority: false });
    expect(projection.authority.deterministicEvidence).toBe("CANONICAL_VERIFICATION");
  });
});
