import { describe, expect, it } from "vitest";
import {
  createGitVerificationSubject,
  verificationContractDigest,
} from "@mission-control/workflow-engine";
import {
  aggregateExecutionRoutingEvidence,
  committedWorkOrderRunCostUsd,
  loadExecutionRoutingEvidenceBundle,
  workOrderCostBudget,
} from "../lib/executionRouting";
import { getCurrentVerificationResult } from "../lib/currentVerification";

const cutoffAt = 10_000;
const projectId = "project-1";
const workOrderId = "work-order-1";
const repositoryId = "repository-1";
const versionId = "factory-version-1";
const qualityContractDigest = `sha256:${"9".repeat(64)}`;
const contractDigest = verificationContractDigest(
  { schemaVersion: 2, checks: ["api"] },
  qualityContractDigest,
);
const planDigest = `sha256:${"e".repeat(64)}`;
const decisionInputDigest = `sha256:${"f".repeat(64)}`;

function subject(sourceAttemptId = "source-a", candidateSha = "a".repeat(40)) {
  return createGitVerificationSubject({
    version: 1,
    kind: "GIT_CANDIDATE",
    workOrderId,
    workOrderRevisionNumber: 1,
    verificationContractDigest: contractDigest,
    sourceAttemptId,
    repositoryId,
    provider: "GITHUB",
    providerRepositoryId: "provider-repository-1",
    candidateSha,
    treeSha: candidateSha === "a".repeat(40) ? "b".repeat(40) : "d".repeat(40),
    pullRequest: {
      providerPullRequestId: `provider-pr-${sourceAttemptId}`,
      number: sourceAttemptId === "source-a" ? 91 : 92,
      url: `https://github.com/example/repo/pull/${sourceAttemptId === "source-a" ? 91 : 92}`,
      baseRef: "main",
      headRef: sourceAttemptId,
      headSha: candidateSha,
      draftAtPublication: true,
    },
  });
}

function policyV2Records(options: {
  verdict?: "VERIFIED" | "NOT_VERIFIED";
  stale?: boolean;
  includeResult?: boolean;
  includeNewerSource?: boolean;
} = {}) {
  const verificationSubject = subject();
  const tuple = {
    workOrderId,
    workOrderRevisionNumber: 1,
    verificationContractDigest: contractDigest,
    sourceAttemptId: "source-a",
    verificationSubjectDigest: verificationSubject.digest,
  };
  const verdict = options.verdict ?? "VERIFIED";
  const sourceAttempts: any[] = [{
    _id: "source-a",
    _creationTime: 100,
    projectId,
    workOrderId,
    repositoryId,
    factoryDefinitionVersionId: versionId,
    attemptPurpose: "IMPLEMENTATION",
    status: "COMPLETED",
    startedAt: 100,
    candidateReadyAt: 120,
    qualityContractDigest,
    verificationSubject,
    steps: [{ retryCount: 0 }],
    spentUsd: 6,
  }];
  if (options.includeNewerSource) {
    sourceAttempts.push({
      ...sourceAttempts[0],
      _id: "source-b",
      _creationTime: 500,
      startedAt: 500,
      candidateReadyAt: 520,
      verificationSubject: subject("source-b", "c".repeat(40)),
    });
  }
  const verificationAttempt = {
    _id: "verify-a",
    _creationTime: 130,
    projectId,
    workOrderId,
    repositoryId,
    attemptPurpose: "VERIFICATION",
    status: "COMPLETED",
    startedAt: 130,
    qualityContractDigest,
    verificationAttemptBinding: tuple,
    steps: [],
  };
  return {
    workOrders: [{
      _id: workOrderId,
      projectId,
      repositoryId,
      currentRevisionNumber: 1,
      qualityContractDigest,
      verificationContractDigest: contractDigest,
    }],
    workflowRuns: [...sourceAttempts, verificationAttempt],
    verificationRuns: options.includeResult === false ? [] : [{
      _id: "result-a",
      workflowRunId: "verify-a",
      ...tuple,
      status: "COMPLETED",
      verdict,
      independenceValid: true,
      verificationPlanId: "plan-a",
      verificationPlanDigest: planDigest,
      decisionInputDigest,
      createdAt: 140,
      completedAt: 141,
    }],
    verificationReceipts: options.includeResult === false ? [] : [{
      _id: "receipt-a",
      projectId,
      workOrderId,
      receiptScope: "WORK_ORDER",
      workflowRunId: "verify-a",
      verificationRunId: "result-a",
      verificationAttemptId: "verify-a",
      verificationPlanId: "plan-a",
      verificationPlanDigest: planDigest,
      verificationSubjectId: verificationSubject.subjectId,
      evidenceEnvelopeIds: ["evidence-a"],
      ...tuple,
      status: verdict === "VERIFIED" ? "PASSED" : "FAILED",
      verdict,
      independenceValid: true,
      decisionInputDigest,
      recordedAt: 160,
      validUntil: options.stale ? cutoffAt : cutoffAt + 1,
    }],
    evidenceEnvelopes: options.includeResult === false ? [] : [{
      provenance: "LIVE",
      _id: "evidence-a",
      projectId,
      workOrderId,
      workflowRunId: "verify-a",
      verificationRunId: "result-a",
      verificationAttemptId: "verify-a",
      verificationSubjectId: verificationSubject.subjectId,
      verificationPlanId: "plan-a",
      verificationPlanDigest: planDigest,
      ...tuple,
      recordedAt: 150,
    }],
    harnessPrChecks: [{
      _id: "head-a",
      workOrderId,
      source: "GITHUB",
      provider: "GITHUB",
      repositoryId,
      installationId: "installation-1",
      providerRepositoryId: verificationSubject.providerRepositoryId,
      providerPullRequestId: verificationSubject.pullRequest.providerPullRequestId,
      workflowRunId: "source-a",
      prNumber: verificationSubject.pullRequest.number,
      prUrl: verificationSubject.pullRequest.url,
      prState: "OPEN",
      draft: true,
      headSha: verificationSubject.candidateSha,
      syncedAt: 170,
      attestationExpiresAt: cutoffAt + 1,
    }],
    workspaceRepositories: [{ _id: repositoryId, providerRepositoryId: verificationSubject.providerRepositoryId }],
    githubAppInstallations: [{
      _id: "github-installation-1",
      repositoryId,
      installationId: "installation-1",
      status: "CONNECTED",
    }],
    traces: [],
    qualityGateDecisions: [],
  };
}

function fakeContext(records: Record<string, any[]>) {
  const allRows = Object.values(records).flat();
  return {
    db: {
      get: async (id: string) => allRows.find((row) => row._id === id) ?? null,
      query: (table: string) => {
        let rows = [...(records[table] ?? [])];
        const query = {
          withIndex: () => query,
          order: (direction: "asc" | "desc") => {
            if (direction === "desc") rows.reverse();
            return query;
          },
          take: async (limit: number) => rows.slice(0, limit),
          collect: async () => rows,
          first: async () => rows[0] ?? null,
        };
        return query;
      },
    },
  };
}

describe("execution routing Policy V2 evidence", () => {
  it("joins a source Attempt through its separate exact Verification Attempt as a verified success", async () => {
    const records = policyV2Records();
    const ctx = fakeContext(records);
    const bundle = await loadExecutionRoutingEvidenceBundle(
      ctx as any,
      projectId as any,
      cutoffAt,
      30,
    );
    expect(bundle.verifiedOutcomes).toEqual([{
      sourceAttemptId: "source-a",
      outcome: "SUCCESS",
      recordedAt: 160,
      lineage: "POLICY_V2",
    }]);
    expect(aggregateExecutionRoutingEvidence(versionId as any, repositoryId as any, bundle)).toMatchObject({
      verifiedAttemptCount: 1,
      verifiedSuccessRate: 1,
      totalCostPerVerifiedSuccessUsd: 6,
    });
    const publicEligibility = await getCurrentVerificationResult(ctx as any, records.workOrders[0], cutoffAt);
    expect(publicEligibility).not.toHaveProperty("verifiedOutcome");
    expect(publicEligibility).not.toHaveProperty("verificationRecordedAt");
  });

  it("joins exact verified failures but excludes unverified and stale candidates", async () => {
    const failure = await loadExecutionRoutingEvidenceBundle(
      fakeContext(policyV2Records({ verdict: "NOT_VERIFIED" })) as any,
      projectId as any,
      cutoffAt,
      30,
    );
    const unverified = await loadExecutionRoutingEvidenceBundle(
      fakeContext(policyV2Records({ includeResult: false })) as any,
      projectId as any,
      cutoffAt,
      30,
    );
    const stale = await loadExecutionRoutingEvidenceBundle(
      fakeContext(policyV2Records({ stale: true })) as any,
      projectId as any,
      cutoffAt,
      30,
    );
    expect(failure.verifiedOutcomes).toEqual([expect.objectContaining({ outcome: "FAILURE", lineage: "POLICY_V2" })]);
    expect(aggregateExecutionRoutingEvidence(versionId as any, repositoryId as any, failure)).toMatchObject({
      verifiedAttemptCount: 1,
      verifiedSuccessRate: 0,
      totalCostPerVerifiedSuccessUsd: undefined,
    });
    expect(unverified.verifiedOutcomes).toEqual([]);
    expect(stale.verifiedOutcomes).toEqual([]);
  });

  it("does not let a newer source Attempt inherit an older source Attempt's verification", async () => {
    const bundle = await loadExecutionRoutingEvidenceBundle(
      fakeContext(policyV2Records({ includeNewerSource: true })) as any,
      projectId as any,
      cutoffAt,
      30,
    );
    expect(bundle.verifiedOutcomes).toEqual([]);
  });

  it("keeps legacy continuation evidence read-compatible and exact-bound", async () => {
    const records = policyV2Records({ includeResult: false });
    records.workflowRuns = [{
      ...records.workflowRuns[0],
      verificationSubject: undefined,
      factoryContinuation: { verificationReceiptId: "legacy-receipt" },
    }];
    records.verificationReceipts = [{
      _id: "legacy-receipt",
      projectId,
      workOrderId,
      workflowRunId: "source-a",
      sourceAttemptId: "source-a",
      status: "PASSED",
      verdict: "VERIFIED",
      independenceValid: true,
      recordedAt: 160,
      validUntil: cutoffAt + 1,
    }];
    const compatible = await loadExecutionRoutingEvidenceBundle(
      fakeContext(records) as any,
      projectId as any,
      cutoffAt,
      30,
    );
    expect(compatible.verifiedOutcomes).toEqual([expect.objectContaining({
      sourceAttemptId: "source-a",
      outcome: "SUCCESS",
      lineage: "LEGACY",
    })]);

    records.verificationReceipts[0].workOrderId = "work-order-other";
    const crossWorkOrder = await loadExecutionRoutingEvidenceBundle(
      fakeContext(records) as any,
      projectId as any,
      cutoffAt,
      30,
    );
    expect(crossWorkOrder.verifiedOutcomes).toEqual([]);
  });

  it("bases verified-success economics on canonical successes, not completed executions", () => {
    const attempts = Array.from({ length: 10 }, (_, index) => ({
      _id: `source-${index}`,
      factoryDefinitionVersionId: versionId,
      repositoryId,
      status: "COMPLETED",
      startedAt: 100 + index,
      spentUsd: 2,
      steps: [{ retryCount: 0 }],
    }));
    const verifiedOutcomes = Array.from({ length: 8 }, (_, index) => ({
      sourceAttemptId: `source-${index}`,
      outcome: index < 6 ? "SUCCESS" as const : "FAILURE" as const,
      recordedAt: 200 + index,
      lineage: "POLICY_V2" as const,
    }));
    const evidence = aggregateExecutionRoutingEvidence(versionId as any, repositoryId as any, {
      windowStartedAt: 0,
      cutoffAt,
      attempts,
      traces: [],
      gates: [],
      verifiedOutcomes,
    } as any);
    expect(evidence).toMatchObject({
      attemptCount: 10,
      verifiedAttemptCount: 8,
      verifiedSuccessRate: 0.75,
      firstPassSuccessRate: 0.75,
      totalCostUsd: 20,
    });
    expect(evidence.totalCostPerVerifiedSuccessUsd).toBeCloseTo(20 / 6);
  });

  it("reserves the approved cap and blocks a retry that would exceed the remainder", () => {
    expect(workOrderCostBudget({
      approvedWorkOrderCapUsd: 24,
      priorCommittedUsd: 0,
    })).toEqual({ approvedRemainingUsd: 24, maximumEstimatedCostUsd: 24 });
    expect(workOrderCostBudget({
      approvedWorkOrderCapUsd: 24,
      missionBudgetRemainingUsd: 50,
      priorCommittedUsd: 24,
    })).toEqual({ approvedRemainingUsd: 0, maximumEstimatedCostUsd: 0 });
    expect(workOrderCostBudget({
      approvedWorkOrderCapUsd: 24,
      missionBudgetRemainingUsd: 10,
      priorCommittedUsd: 4,
    })).toEqual({ approvedRemainingUsd: 20, maximumEstimatedCostUsd: 10 });
  });

  it("releases terminal reservations and counts actual spend", () => {
    expect(committedWorkOrderRunCostUsd({
      status: "FAILED",
      spentUsd: 0,
      reservedCostUsd: 24,
    })).toBe(0);
    expect(committedWorkOrderRunCostUsd({
      status: "COMPLETED",
      spentUsd: 6,
      reservedCostUsd: 24,
    })).toBe(6);
    expect(committedWorkOrderRunCostUsd({
      status: "RUNNING",
      spentUsd: 6,
      reservedCostUsd: 24,
    })).toBe(24);
  });
});
