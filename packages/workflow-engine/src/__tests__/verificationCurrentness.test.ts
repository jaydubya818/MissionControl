import { describe, expect, it } from "vitest";
import { evaluateCurrentVerificationEligibility, evaluatePrepublicationVerification, type CurrentVerificationInput } from "../verificationCurrentness.js";
import { verificationContractDigest } from "../verificationIdentity.js";
import {
  createAutomationVerificationSubject,
  createGitVerificationSubject,
  createPrepublicationGitVerificationSubject,
  createGitSubjectPublicationBinding,
  type GithubVerificationSubject,
  type VerificationSubject,
} from "../verificationSubject.js";

const now = 10_000;
const qualityContractDigest = `sha256:${"9".repeat(64)}`;
const contractDigest = verificationContractDigest(
  { schemaVersion: 2, checks: ["api"] },
  qualityContractDigest,
);
const planDigest = `sha256:${"e".repeat(64)}`;
const decisionInputDigest = `sha256:${"f".repeat(64)}`;

function gitSubject(
  sourceAttemptId = "source-a",
  candidateSha = "a".repeat(40),
  pullRequestOverrides: Partial<GithubVerificationSubject["pullRequest"]> = {},
) {
  return createGitVerificationSubject({
    version: 1,
    kind: "GIT_CANDIDATE",
    workOrderId: "wo-1",
    workOrderRevisionNumber: 1,
    verificationContractDigest: contractDigest,
    sourceAttemptId,
    repositoryId: "repo-1",
    provider: "GITHUB",
    providerRepositoryId: "provider-repo-1",
    candidateSha,
    treeSha: candidateSha === "a".repeat(40) ? "b".repeat(40) : "d".repeat(40),
    pullRequest: {
      providerPullRequestId: "provider-pr-1",
      number: 91,
      url: "https://github.com/example/repo/pull/91",
      baseRef: "main",
      headRef: "candidate",
      headSha: candidateSha,
      draftAtPublication: true,
      ...pullRequestOverrides,
    },
  });
}

function localGitSubject() {
  return createGitVerificationSubject({
    version: 1,
    kind: "GIT_CANDIDATE",
    workOrderId: "wo-1",
    workOrderRevisionNumber: 1,
    verificationContractDigest: contractDigest,
    sourceAttemptId: "source-a",
    repositoryId: "repo-1",
    provider: "LOCAL_GIT",
    providerRepositoryId: "provider-repo-1",
    candidateSha: "a".repeat(40),
    treeSha: "b".repeat(40),
    localRef: { baseRef: "main", headRef: "candidate", headSha: "a".repeat(40) },
  });
}

function fixture(subject: VerificationSubject = gitSubject(), sourceReadyAt = 100) {
  const tuple = {
    workOrderId: "wo-1",
    workOrderRevisionNumber: 1,
    verificationContractDigest: contractDigest,
    sourceAttemptId: subject.sourceAttemptId,
    verificationSubjectDigest: subject.digest,
  };
  return {
    workOrderId: "wo-1",
    workOrderRevisionNumber: 1,
    qualityContractDigest,
    verificationContractDigest: contractDigest,
    sourceAttempts: [{
      id: subject.sourceAttemptId,
      repositoryId: subject.kind === "GIT_CANDIDATE" ? subject.repositoryId : undefined,
      attemptPurpose: subject.kind === "AUTOMATION_RUN" ? "AUTOMATION" as const : "IMPLEMENTATION" as const,
      status: "COMPLETED",
      candidateReadyAt: sourceReadyAt,
      qualityContractDigest,
      verificationSubject: subject,
    }],
    verificationAttempts: [{
      id: "verify-a",
      attemptPurpose: "VERIFICATION" as const,
      status: "COMPLETED",
      createdAt: 200,
      qualityContractDigest,
      verificationAttemptBinding: tuple,
    }],
    verificationResults: [{
      id: "result-a",
      workflowRunId: "verify-a",
      ...tuple,
      status: "COMPLETED" as const,
      verdict: "VERIFIED" as const,
      independenceValid: true,
      verificationPlanId: "plan-a",
      verificationPlanDigest: planDigest,
      decisionInputDigest,
      createdAt: 300,
      completedAt: 301,
    }],
    verificationReceipts: [{
      id: "receipt-a",
      verificationRunId: "result-a",
      verificationAttemptId: "verify-a",
      verificationPlanId: "plan-a",
      verificationPlanDigest: planDigest,
      verificationSubjectId: subject.subjectId,
      evidenceEnvelopeIds: ["evidence-a"],
      ...tuple,
      status: "PASSED" as const,
      verdict: "VERIFIED" as const,
      independenceValid: true,
      decisionInputDigest,
      recordedAt: 400,
      validUntil: now + 1,
    }],
    verificationEvidence: [{
      id: "evidence-a",
      workflowRunId: "verify-a",
      verificationRunId: "result-a",
      verificationAttemptId: "verify-a",
      verificationSubjectId: subject.subjectId,
      verificationPlanId: "plan-a",
      verificationPlanDigest: planDigest,
      ...tuple,
      recordedAt: 350,
    }],
    providerHeads: subject.kind === "GIT_CANDIDATE" && subject.version === 1 && subject.provider === "GITHUB" ? [{
      provider: "GITHUB" as const,
      repositoryId: subject.repositoryId,
      installationId: "installation-1",
      sourceAttemptId: subject.sourceAttemptId,
      providerRepositoryId: subject.providerRepositoryId,
      providerPullRequestId: subject.pullRequest.providerPullRequestId,
      pullRequestNumber: subject.pullRequest.number,
      pullRequestUrl: subject.pullRequest.url,
      state: "OPEN" as const,
      draft: true,
      headSha: subject.candidateSha,
      syncedAt: 500,
      expiresAt: now + 1,
    }] : [],
    now,
  };
}

describe("exact-current verification acceptance eligibility", () => {
  it("verifies a pre-publication subject without making it acceptance eligible, then requires exact publication and provider currentness", () => {
    const legacy = gitSubject();
    const { subjectId: _id, digest: _digest, pullRequest, ...identity } = legacy;
    const subject = createPrepublicationGitVerificationSubject({ ...identity, version: 2, baseSha: "c".repeat(40),
      rawDiffSha256: `sha256:${"4".repeat(64)}`, baseRef: pullRequest.baseRef, headRef: pullRequest.headRef });
    const data: CurrentVerificationInput = fixture(subject);
    data.sourceAttempts[0].status = "PAUSED";
    expect(evaluatePrepublicationVerification(data).eligible).toBe(true);
    expect(evaluateCurrentVerificationEligibility(data).eligible).toBe(false);
    data.sourceAttempts[0].status = "COMPLETED";
    expect(evaluateCurrentVerificationEligibility(data).eligible).toBe(false);
    data.sourceAttempts[0].subjectPublicationBinding = createGitSubjectPublicationBinding(subject, {
      publicationPermitId: "permit", publicationPermitLeaseId: "lease", approvalDecisionId: "approval", verificationReceiptId: "receipt-a", pullRequest,
    });
    data.verificationReceipts[0].humanReviewValid = true;
    data.providerHeads = fixture(legacy).providerHeads;
    expect(evaluateCurrentVerificationEligibility(data).eligible).toBe(true);
    for (const changed of [{ headSha: "f".repeat(40) }, { state: "CLOSED" as const }, { expiresAt: now }, { providerPullRequestId: "another-pr" }]) {
      expect(evaluateCurrentVerificationEligibility({ ...data, providerHeads: [{ ...data.providerHeads[0], ...changed }] }).eligible).toBe(false);
    }
    expect(evaluateCurrentVerificationEligibility({ ...data, verificationReceipts: [{ ...data.verificationReceipts[0], humanReviewValid: false }] }).eligible).toBe(false);
    expect(evaluatePrepublicationVerification({ ...data, verificationAttempts: [...data.verificationAttempts,
      { ...data.verificationAttempts[0], id: "new-verifier", createdAt: 900, status: "FAILED" }] }).eligible).toBe(false);
  });

  it("allows pending human review only as pre-publication evidence, never as acceptance", () => {
    const { subjectId: _id, digest: _digest, pullRequest, ...identity } = gitSubject();
    const subject = createPrepublicationGitVerificationSubject({ ...identity, version: 2, baseSha: "c".repeat(40), rawDiffSha256: `sha256:${"4".repeat(64)}`,
      baseRef: pullRequest.baseRef, headRef: pullRequest.headRef });
    const data: CurrentVerificationInput = fixture(subject);
    data.sourceAttempts[0].status = "PAUSED";
    data.verificationResults[0].verdict = "REQUIRES_HUMAN_REVIEW";
    data.verificationReceipts[0].status = "PENDING";
    data.verificationReceipts[0].verdict = "REQUIRES_HUMAN_REVIEW";
    expect(evaluatePrepublicationVerification(data).eligible).toBe(true);
    expect(evaluateCurrentVerificationEligibility(data).eligible).toBe(false);
    data.verificationReceipts[0].validUntil = now;
    expect(evaluatePrepublicationVerification(data).eligible).toBe(false);
  });
  it("allows only the exact current software tuple with GitHub PR lineage", () => {
    const result = evaluateCurrentVerificationEligibility(fixture());
    expect(result, result.reasons.join(" ")).toMatchObject({
      eligible: true,
      current: true,
      verifiedOutcome: "SUCCESS",
      verificationRecordedAt: 400,
      sourceAttemptId: "source-a",
      verificationAttemptId: "verify-a",
    });
  });

  it("keeps an independently verified unpublished local candidate non-accepting without a trusted projection", () => {
    const result = evaluateCurrentVerificationEligibility(fixture(localGitSubject()));
    expect(result, result.reasons.join(" ")).toMatchObject({
      eligible: false,
      current: false,
      verifiedOutcome: "SUCCESS",
    });
    expect(result.reasons[0]).toContain("not acceptance-eligible");
  });

  it("classifies an exact independent Policy V2 failure without making it acceptance-eligible", () => {
    const data = fixture();
    const result = evaluateCurrentVerificationEligibility({
      ...data,
      verificationResults: data.verificationResults.map((item) => ({
        ...item,
        verdict: "NOT_VERIFIED" as const,
      })),
      verificationReceipts: data.verificationReceipts.map((item) => ({
        ...item,
        status: "FAILED" as const,
        verdict: "NOT_VERIFIED" as const,
      })),
    });
    expect(result, result.reasons.join(" ")).toMatchObject({
      eligible: false,
      current: false,
      verifiedOutcome: "FAILURE",
      verificationRecordedAt: 400,
      sourceAttemptId: "source-a",
      verificationAttemptId: "verify-a",
    });
  });

  it("does not classify an unverified or stale candidate as a canonical outcome", () => {
    const unverified = fixture();
    unverified.verificationResults = [];
    const stale = fixture();
    stale.verificationReceipts[0].validUntil = now;
    expect(evaluateCurrentVerificationEligibility(unverified).verifiedOutcome).toBeUndefined();
    expect(evaluateCurrentVerificationEligibility(stale).verifiedOutcome).toBeUndefined();
  });

  it("requires an exact source repository and an expiring trusted GitHub projection", () => {
    const data = fixture();
    const wrongRepository = evaluateCurrentVerificationEligibility({
      ...data,
      sourceAttempts: data.sourceAttempts.map((attempt) => ({ ...attempt, repositoryId: "repo-other" })),
    });
    const noProjectionTtl = evaluateCurrentVerificationEligibility({
      ...data,
      providerHeads: data.providerHeads.map(({ expiresAt: _expiresAt, ...projection }) => projection),
    });
    expect(wrongRepository.eligible).toBe(false);
    expect(noProjectionTtl.eligible).toBe(false);
  });

  it("does not treat mutable draft readiness as candidate identity", () => {
    const data = fixture();
    data.providerHeads[0].draft = false;
    const result = evaluateCurrentVerificationEligibility(data);
    expect(result.eligible, result.reasons.join(" ")).toBe(true);
  });


  it("requires the trusted App projection to carry exact repository and source-Attempt lineage", () => {
    const data = fixture();
    const wrongRepository = evaluateCurrentVerificationEligibility({
      ...data,
      providerHeads: data.providerHeads.map((projection) => ({ ...projection, repositoryId: "repo-other" })),
    });
    const wrongAttempt = evaluateCurrentVerificationEligibility({
      ...data,
      providerHeads: data.providerHeads.map((projection) => ({ ...projection, sourceAttemptId: "source-other" })),
    });
    expect(wrongRepository.eligible).toBe(false);
    expect(wrongAttempt.eligible).toBe(false);
  });

  it("fails closed when Quality Contract, decision input, or evidence lineage is substituted", () => {
    const data = fixture();
    const wrongQualityContract = evaluateCurrentVerificationEligibility({
      ...data,
      qualityContractDigest: `sha256:${"1".repeat(64)}`,
    });
    const wrongDecisionInput = evaluateCurrentVerificationEligibility({
      ...data,
      verificationReceipts: data.verificationReceipts.map((receipt) => ({
        ...receipt,
        decisionInputDigest: `sha256:${"2".repeat(64)}`,
      })),
    });
    const wrongEvidence = evaluateCurrentVerificationEligibility({
      ...data,
      verificationEvidence: data.verificationEvidence.map((evidence) => ({
        ...evidence,
        sourceAttemptId: "source-other",
      })),
    });
    expect(wrongQualityContract.eligible).toBe(false);
    expect(wrongDecisionInput.eligible).toBe(false);
    expect(wrongEvidence.eligible).toBe(false);
  });

  it("keeps a historical pass but makes it ineligible after WorkOrder revision or contract change", () => {
    const changedRevision = evaluateCurrentVerificationEligibility({ ...fixture(), workOrderRevisionNumber: 2 });
    const changedContract = evaluateCurrentVerificationEligibility({ ...fixture(), verificationContractDigest: `sha256:${"f".repeat(64)}` });
    expect(changedRevision.eligible).toBe(false);
    expect(changedContract.eligible).toBe(false);
    expect(fixture().verificationResults[0].verdict).toBe("VERIFIED");
  });

  it("never lets Candidate A qualify a newer Candidate B", () => {
    const candidateA = gitSubject("source-a", "a".repeat(40));
    const candidateB = gitSubject("source-b", "c".repeat(40));
    const data = fixture(candidateA);
    const result = evaluateCurrentVerificationEligibility({
      ...data,
      sourceAttempts: [
        ...data.sourceAttempts,
        { id: "source-b", repositoryId: candidateB.repositoryId, attemptPurpose: "IMPLEMENTATION", status: "COMPLETED", candidateReadyAt: 900, qualityContractDigest, verificationSubject: candidateB },
      ],
      providerHeads: [{ ...data.providerHeads[0], headSha: candidateB.candidateSha, syncedAt: 901 }],
    });
    expect(result.eligible).toBe(false);
    expect(result.sourceAttemptId).toBe("source-b");
    expect(result.verifiedOutcome).toBeUndefined();
    expect(data.verificationResults[0].verdict).toBe("VERIFIED");
  });

  it("does not fall back to an older pass while a newer exact Verification Attempt is running", () => {
    const data = fixture();
    const result = evaluateCurrentVerificationEligibility({
      ...data,
      verificationAttempts: [
        ...data.verificationAttempts,
        { ...data.verificationAttempts[0], id: "verify-b", status: "RUNNING", createdAt: 900 },
      ],
    });
    expect(result.eligible).toBe(false);
    expect(result.verificationAttemptId).toBe("verify-b");
    expect(result.reasons.join(" ")).toContain("older passing results cannot be reused");
  });

  it("does not fall back to an older pass while a newer candidate-ready source Attempt is incomplete", () => {
    const data = fixture();
    const newerSubject = gitSubject("source-b", "c".repeat(40));
    const result = evaluateCurrentVerificationEligibility({
      ...data,
      sourceAttempts: [
        ...data.sourceAttempts,
        {
          id: "source-b",
          repositoryId: newerSubject.repositoryId,
          attemptPurpose: "IMPLEMENTATION" as const,
          status: "FAILED",
          candidateReadyAt: 900,
          qualityContractDigest,
          verificationSubject: newerSubject,
        },
      ],
    });
    expect(result.eligible).toBe(false);
    expect(result.sourceAttemptId).toBe("source-b");
    expect(result.reasons.join(" ")).toContain("older passing candidates cannot be reused");
  });

  it("fails closed for legacy attempts, receipts, and producer independence flags", () => {
    const data = fixture();
    const legacy = evaluateCurrentVerificationEligibility({
      ...data,
      sourceAttempts: data.sourceAttempts.map(({ attemptPurpose: _purpose, ...attempt }) => attempt),
      verificationAttempts: data.verificationAttempts.map(({ attemptPurpose: _purpose, verificationAttemptBinding: _binding, ...attempt }) => attempt),
      verificationResults: data.verificationResults.map(({ independenceValid: _independence, ...result }) => result),
      verificationReceipts: data.verificationReceipts.map(({ independenceValid: _independence, ...receipt }) => ({ ...receipt, producer: { independent: true } })),
    });
    expect(legacy.eligible).toBe(false);
  });

  it("supports immutable automation snapshot identity and stales changed output", () => {
    const automation = createAutomationVerificationSubject({
      version: 1,
      kind: "AUTOMATION_RUN",
      workOrderId: "wo-1",
      workOrderRevisionNumber: 1,
      verificationContractDigest: contractDigest,
      sourceAttemptId: "automation-a",
      automationWorkflowRunId: "automation-a",
      automationDefinitionId: "definition-1",
      automationDefinitionVersion: 1,
      adapterIdentity: { adapterType: "csv/v1", executionBindingDigest: `sha256:${"1".repeat(64)}`, outputContractDigest: `sha256:${"2".repeat(64)}` },
      outputSnapshotArtifactId: "snapshot-a",
      outputSnapshotContentHash: `sha256:${"3".repeat(64)}`,
      outputArtifactIds: ["output-a"],
      outputArtifactContentHashes: [`sha256:${"4".repeat(64)}`],
    });
    const passing = fixture(automation);
    expect(evaluateCurrentVerificationEligibility(passing).eligible).toBe(true);
    const changed = createAutomationVerificationSubject({
      ...automation,
      subjectId: undefined,
      digest: undefined,
      sourceAttemptId: "automation-b",
      automationWorkflowRunId: "automation-b",
      outputSnapshotArtifactId: "snapshot-b",
      outputSnapshotContentHash: `sha256:${"5".repeat(64)}`,
    } as any);
    const stale = evaluateCurrentVerificationEligibility({
      ...passing,
      sourceAttempts: [...passing.sourceAttempts, { id: "automation-b", attemptPurpose: "AUTOMATION", status: "COMPLETED", candidateReadyAt: 900, qualityContractDigest, verificationSubject: changed }],
    });
    expect(stale.eligible).toBe(false);
    expect(stale.sourceAttemptId).toBe("automation-b");
  });
});
