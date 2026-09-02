import { describe, expect, it } from "vitest";
import {
  compilePolicyV2VerificationPlan,
  normalizePolicyV2VerificationResults,
} from "../lib/policyV2Verification";

const subject = {
  version: 1,
  kind: "GIT_CANDIDATE",
  subjectId: "verification-subject:subject",
  digest: "sha256:subject",
  workOrderId: "work-order-1",
  workOrderRevisionNumber: 2,
  verificationContractDigest: `sha256:${"a".repeat(64)}`,
  sourceAttemptId: "source-attempt-1",
  repositoryId: "repository-1",
  provider: "GITHUB",
  providerRepositoryId: "101",
  candidateSha: "b".repeat(40),
  treeSha: "c".repeat(40),
  pullRequest: {
    providerPullRequestId: "PR_1",
    number: 101,
    url: "https://github.com/acme/repo/pull/101",
    baseRef: "main",
    headRef: "mc/candidate",
    headSha: "b".repeat(40),
    draftAtPublication: true,
  },
};

const workOrder = {
  _id: "work-order-1",
  currentRevisionNumber: 2,
  qualityContractDigest: `sha256:${"d".repeat(64)}`,
  verificationContractDigest: subject.verificationContractDigest,
  requirements: [{ id: "requirement:behavior", description: "The behavior is correct.", priority: "MUST" }],
  acceptanceCriteria: [{ id: "ac-1", requirementIds: ["requirement:behavior"] }],
  changeBudget: { allowedPaths: ["convex/**"] },
  verificationContract: {
    schemaVersion: 2,
    checks: [{
      id: "check:test",
      name: "Focused tests",
      category: "UNIT_TEST",
      verifierId: "factory-command/v1",
      mandatory: true,
      acceptanceCriterionIds: ["ac-1"],
      evidenceCategory: "TEST_RESULT",
    }],
    requiredRisks: [{ id: "risk:subject", description: "Wrong candidate is tested.", severity: "HIGH", source: "HUMAN_APPROVED", requiredEvidenceIds: ["check:test"] }],
  },
};

describe("policy-v2 Verification Plan compilation", () => {
  it("freezes the exact subject, required behavior, required risk, and evidence denominator", () => {
    const plan = compilePolicyV2VerificationPlan({
      now: 100,
      workOrder,
      sourceAttempt: { _id: "source-attempt-1" },
      verificationAttemptId: "verification-attempt-1",
      verificationSubject: subject,
      factoryDefinitionId: "verification-factory",
      factoryDefinitionVersionId: "verification-factory-v1",
      executorInvocationId: "verification:invocation-1",
    });

    expect(plan).toMatchObject({
      planVersion: 1,
      workOrderId: "work-order-1",
      workOrderRevisionNumber: 2,
      sourceAttemptId: "source-attempt-1",
      verificationAttemptId: "verification-attempt-1",
      verificationSubject: { digest: "sha256:subject" },
      requirements: [{ id: "requirement:behavior", criticality: "REQUIRED" }],
      requiredRisks: [{ id: "risk:subject", severity: "HIGH", affectedAreas: ["convex/**"] }],
    });
    expect(plan.requiredEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "factory-verification-authority", required: true }),
      expect.objectContaining({ id: "factory-change-budget", required: true }),
      expect.objectContaining({ id: "check:test", requirementIds: ["requirement:behavior"], requiredRiskIds: ["risk:subject"], required: true }),
    ]));
    expect(plan.planId).toMatch(/^verification-plan:/);
    expect(plan.planDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("derives the persistence shape and criterion coverage from canonical configuration", () => {
    const plan = compilePolicyV2VerificationPlan({
      now: 100,
      workOrder,
      sourceAttempt: { _id: "source-attempt-1" },
      verificationAttemptId: "verification-attempt-1",
      verificationSubject: subject,
      factoryDefinitionId: "verification-factory",
      factoryDefinitionVersionId: "verification-factory-v1",
      executorInvocationId: "verification:invocation-1",
    });
    const result = normalizePolicyV2VerificationResults({
      workOrder,
      plan,
      packetChecks: [{
        checkId: "check:test",
        name: "worker-controlled name",
        verifierId: "worker-controlled verifier",
        category: "POLICY",
        mandatory: false,
        acceptanceCriterionIds: [],
        status: "PASS",
        summary: "Focused tests passed.",
        startedAt: 101,
        completedAt: 102,
        durationMs: 1,
        evidence: [{ evidenceKey: "transport-only" }],
        violations: [],
      }],
      evidenceIdsByCheck: new Map([["check:test", ["evidence-1"]]]),
    });

    expect(result.checks).toEqual([expect.objectContaining({
      checkId: "check:test",
      name: "Focused tests",
      verifierId: "factory-command/v1",
      category: "UNIT_TEST",
      mandatory: true,
      acceptanceCriterionIds: ["ac-1"],
      evidenceIds: ["evidence-1"],
    })]);
    expect(result.checks[0]).not.toHaveProperty("evidence");
    expect(result.criterionCoverage).toEqual([expect.objectContaining({
      criterionId: "ac-1",
      status: "EVIDENCED",
      evidenceIds: ["evidence-1"],
    })]);
    expect(result.criterionCoverage[0]).not.toHaveProperty("evidenceKeys");
  });

  it("fails closed without the canonical Plan Quality Contract digest", () => {
    expect(() => compilePolicyV2VerificationPlan({
      now: 100,
      workOrder: { ...workOrder, qualityContractDigest: undefined },
      sourceAttempt: { _id: "source-attempt-1" },
      verificationAttemptId: "verification-attempt-1",
      verificationSubject: subject,
      factoryDefinitionId: "verification-factory",
      factoryDefinitionVersionId: "verification-factory-v1",
      executorInvocationId: "verification:invocation-1",
    })).toThrow(/Plan Quality Contract/);
  });
});
