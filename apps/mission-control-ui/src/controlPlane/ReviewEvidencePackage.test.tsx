import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewEvidencePackage, type ReviewEvidencePackageData } from "./ReviewEvidencePackage";

const ready: ReviewEvidencePackageData = {
  status: "READY",
  summary: "Exact-head CI and every criterion have accepted evidence.",
  nextAction: "Review and merge manually.",
  blockers: [],
  identity: { runId: "run-1", workOrderId: "wo-1", workOrderRevisionNumber: 2, repositoryId: "repo-1", repository: "acme/repo", branch: "codex/work", baseSha: "base", headSha: "head", pullRequestUrl: "https://github.com/acme/repo/pull/1", pullRequestNumber: 1, githubAppInstallationId: "installation-42", executionManifestDigest: "manifest-digest" },
  gate: { status: "PASS", receiptId: "gate-1", verificationRunId: "verification-1", verdict: "VERIFIED", verifier: "verification-policy/v1", sourceRevision: "base", candidateRevision: "head", recordedAt: 100, validUntil: 10_000, reasons: ["Every mandatory check passed."], integrityIssue: null },
  ci: { status: "PASS", runUrl: "https://github.com/acme/repo/actions/1", evaluationId: "check-1", headSha: "head", prState: "OPEN", lenses: [] },
  criteria: [{ id: "tests", title: "Tests pass", verificationMethod: "TEST", status: "PASS", receiptId: "receipt-1", verifier: "validator:ci", result: "454 tests passed", evidenceLocation: null, validUntil: null, integrityIssue: null }],
  changedFiles: ["src/feature.ts"], deviations: [], failedChecks: [], risks: [], riskLevel: "MEDIUM", reviewerFocus: ["Review repository publication boundary"], rollbackApproach: "Revert the PR.", recovery: { attempts: 2, staleRecoveries: 1 },
};

const reviewIntelligence: NonNullable<ReviewEvidencePackageData["reviewIntelligence"]> = {
  projectionVersion: 1,
  digest: "sha256:package",
  intent: {
    mission: { id: "mission-1", title: "Protect checkout", objective: "Keep unauthorized buyers out." },
    spec: { id: "spec-1", revisionNumber: 2, digest: "sha256:spec" },
    plan: { id: "plan-1", revisionNumber: 3, status: "APPROVED", summary: "Add an authorization guard." },
    workOrder: { id: "wo-1", revisionNumber: 2, title: "Add guard", desiredOutcome: "Return 403." },
    qualityContractDigest: "sha256:quality",
    definitionOfDone: [{ id: "tests", title: "Tests pass" }],
  },
  criterionMatrix: [{
    criterion: { id: "tests", title: "Tests pass", description: null, requirementIds: ["req-1"] },
    specRequirements: [{ id: "req-1", title: "Tests remain green", priority: "MUST" }],
    planAssertions: [{ id: "assertion-1", title: "Regression suite", verificationMethod: "TEST", requiredEvidence: "Test output" }],
    verificationChecks: [{ id: "check-1", name: "Regression", verifierId: "validator:ci", status: "PASS", evidenceIds: ["envelope-1"] }],
    evidence: [{ id: "envelope-1", verificationRunId: "verification-1", sourceAttemptId: "run-doc-1", artifactReferences: ["artifact:test"], contentHash: "sha256:evidence", candidateRevision: "head", recordedAt: 100 }],
    result: "PASS", method: "TEST", receiptId: "receipt-1", verifier: "validator:ci", current: true, integrityIssue: null,
  }],
  changes: {
    summary: "Added a bounded authorization guard.",
    semanticGroups: [{ id: "authentication", name: "Authentication", method: "DETERMINISTIC", authority: "ADVISORY", files: [{ path: "src/auth.ts" }] }],
    rawDiffUrl: "https://github.com/acme/repo/pull/1/files",
  },
  failedOrRecovered: [{ eventType: "RUN_RETRIED", sequenceNumber: 14, status: "RUNNING", summary: "Retried after a stale lease." }],
  decisions: [{ _id: "decision-1", category: "ARCHITECTURE_CHOICE", proposedTarget: "ADR_DOCUMENTATION", summary: "Keep policy evaluation server-side.", status: "PROPOSED", origin: "AGENT", originActorId: "agent:worker", trustedSource: true, contentDigest: "sha256:decision" }],
  historicalDecisionCount: 0,
  judgments: [],
  historicalJudgmentCount: 0,
  residualAnalyses: [{
    _id: "analysis-1", current: true, reviewerId: "service:reviewer", provider: "openai", model: "review-model",
    promptVersion: "residual-v1", contextDigest: "sha256:context", evidenceSetDigest: "sha256:evidence",
    tokenUsage: { total: 812 }, estimatedCostUsd: 0.0134, authority: "ADVISORY",
    findings: [{ findingId: "finding-1", category: "MAINTAINABILITY_CONCERN", summary: "Consider extracting the shared predicate.", fileReferences: ["src/auth.ts"], authority: "ADVISORY" }],
  }],
  residualRisks: ["Consider extracting the shared predicate."],
  exactLineage: {
    workOrderId: "wo-1", workOrderRevisionNumber: 2, workflowRunId: "run-doc-1",
    candidateRevision: "head", reviewPackageDigest: "sha256:subject", current: true,
    currentnessReasons: [], missionSpecRevisionId: "spec-1", verificationSubjectId: "subject-1",
    verificationPlanId: "verification-plan-1", evidenceSetDigest: "sha256:evidence",
  },
  authority: {
    deterministicEvidence: "CANONICAL_VERIFICATION", advisoryFindings: "ADVISORY",
    reviewPackage: "PROJECTION", reviewApproval: "NOT_ACCEPTANCE", acceptanceMutation: "workOrders.accept",
  },
};

describe("ReviewEvidencePackage", () => {
  it("shows unknown operational evidence and preserves a blocking mandatory result", () => {
    render(<ReviewEvidencePackage review={{ ...ready, status: "BLOCKED", blockers: ["A newer verification failed."], reviewFacets: {
      authority: "ADVISORY", mandatoryGateStatus: "BLOCKED", applicationRuntime: "UNVERIFIED",
      facets: [
        { id: "verification", label: "Verification", status: "ATTENTION", summary: "A newer verification failed.", evidenceIds: ["gate-new"] },
        { id: "rollback", label: "Rollback cost", status: "UNKNOWN", summary: "Cost and exercised restoration are unknown.", evidenceIds: [] },
        { id: "error-detection", label: "Error detection", status: "UNKNOWN", summary: "Application-error detection has no current observation.", evidenceIds: [] },
      ], rollback: { observation: null, evidenceId: null }, errorDetection: { observation: null, evidenceId: null }, verifierHost: null,
    } }} />);
    expect(screen.getByRole("heading", { name: "Review questions" })).toBeInTheDocument();
    expect(screen.getByText("BLOCKED")).toBeInTheDocument();
    expect(screen.getAllByText("Unknown")).toHaveLength(2);
    expect(screen.queryByText("gate-new")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    expect(screen.getByText("gate-new")).toBeInTheDocument();
    expect(screen.getByText(/Verifier host: Unknown/)).toBeInTheDocument();
  });

  it("presents exact-head, criterion, rollback, and recovery evidence when ready", () => {
    render(<ReviewEvidencePackage review={ready} />);
    expect(screen.getByText("READY")).toBeInTheDocument();
    expect(screen.getByText("Tests pass")).toBeInTheDocument();
    expect(screen.getByText("validator:ci", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Authoritative verification gate")).toBeInTheDocument();
    expect(screen.getByText("verification-policy/v1")).toBeInTheDocument();
    expect(screen.getByText(/Review repository publication boundary/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open pull request/i })).toHaveAttribute("href", "https://github.com/acme/repo/pull/1");
    expect(screen.getByText("Revert the PR.")).toBeInTheDocument();
    expect(screen.getByText("2 / 1")).toBeInTheDocument();
  });

  it("keeps blocker reasons and missing evidence visible", () => {
    render(<ReviewEvidencePackage review={{ ...ready, status: "BLOCKED", summary: "One blocker.", nextAction: "Fix CI.", blockers: ["Exact-head GitHub CI is failing."], ci: { ...ready.ci, status: "FAIL" }, reviewIntelligence }} onRecordJudgment={async () => {}} />);
    expect(screen.getByText("BLOCKED")).toBeInTheDocument();
    expect(screen.getByText(/Exact-head GitHub CI is failing/)).toBeInTheDocument();
    expect(screen.getByText("Fix CI.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Record review" }));
    expect(screen.getByRole("option", { name: "Approve review package (not acceptance)" })).toBeDisabled();
  });

  it("explains when the execution worker attempted to verify its own work", () => {
    render(<ReviewEvidencePackage review={{
      ...ready,
      status: "BLOCKED",
      summary: "One blocker.",
      nextAction: "Obtain independent verification.",
      blockers: ["Tests pass: independent verification is required."],
      criteria: [{
        ...ready.criteria[0],
        status: "UNKNOWN",
        verifier: "worker:factory-1",
        integrityIssue: "Verifier matches the execution worker; independent verification is required.",
      }],
    }} />);

    expect(screen.getByRole("alert")).toHaveTextContent("independent verification is required");
  });

  it("shows non-HTTP evidence as a reference instead of an unsafe external link", () => {
    render(<ReviewEvidencePackage review={{
      ...ready,
      criteria: [{ ...ready.criteria[0], evidenceLocation: "artifact://receipt/evidence-1" }],
    }} />);

    expect(screen.getByText("Evidence reference: artifact://receipt/evidence-1")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open evidence/i })).not.toBeInTheDocument();
  });

  it("keeps complete changed-file lineage keyboard-expandable", () => {
    const changedFiles = Array.from({ length: 10 }, (_, index) => `src/file-${index + 1}.ts`);
    render(<ReviewEvidencePackage review={{ ...ready, changedFiles }} />);

    expect(screen.getByText("Show 2 more")).toBeInTheDocument();
    expect(screen.getByText(/src\/file-10\.ts/)).toBeInTheDocument();
  });

  it("progressively reveals decisions, semantic groups, advisory findings, and exact lineage", () => {
    render(<ReviewEvidencePackage review={{ ...ready, reviewIntelligence }} />);
    expect(screen.getByText("Protect checkout")).toBeInTheDocument();
    expect(screen.queryByText("Keep policy evaluation server-side.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Intermediate" }));
    expect(screen.getByText("Keep policy evaluation server-side.")).toBeInTheDocument();
    expect(screen.getByText("Authentication", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("ADVISORY")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
    expect(screen.getByText("Canonical IDs, digests, and currentness")).toBeInTheDocument();
    expect(screen.getByText("workOrders.accept")).toBeInTheDocument();
    expect(screen.getByText("req-1")).toBeInTheDocument();
    expect(screen.getByText("assertion-1")).toBeInTheDocument();
    expect(screen.getByText("envelope-1")).toBeInTheDocument();
    expect(screen.getByText("residual-v1")).toBeInTheDocument();
    expect(screen.getByText("812 / $0.0134")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open raw diff/i })).toHaveAttribute("href", "https://github.com/acme/repo/pull/1/files");
  });

  it("drills from a criterion into the exact receipt when the host provides navigation", () => {
    const inspected: Array<{ id: string; receiptId: string }> = [];
    render(<ReviewEvidencePackage review={{ ...ready, reviewIntelligence }} onInspectEvidence={(criterion) => inspected.push(criterion)} />);
    fireEvent.click(screen.getByRole("button", { name: "Inspect exact evidence" }));
    expect(inspected).toEqual([{ id: "tests", receiptId: "receipt-1" }]);
  });

  it("records a bounded review correction without presenting it as acceptance", async () => {
    const calls: any[] = [];
    render(<ReviewEvidencePackage review={{ ...ready, reviewIntelligence }} onRecordJudgment={async (input) => { calls.push(input); }} />);
    fireEvent.click(screen.getByRole("button", { name: "Record review" }));
    fireEvent.change(screen.getByLabelText("Action"), { target: { value: "CORRECTION" } });
    fireEvent.change(screen.getByLabelText("Learning category"), { target: { value: "MISSING_DETERMINISTIC_GATE" } });
    fireEvent.change(screen.getByLabelText("Review judgment summary"), { target: { value: "Promote this invariant into a deterministic regression." } });
    fireEvent.click(screen.getByRole("button", { name: "Record judgment" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      action: "CORRECTION", correctionCategory: "MISSING_DETERMINISTIC_GATE",
      workOrderId: "wo-1", workflowRunId: "run-doc-1", reviewPackageDigest: "sha256:subject",
    });
    expect(screen.getByText(/Approval here is not WorkOrder acceptance/)).toBeInTheDocument();
  });
});
