import { canonicalHash } from "@mission-control/shared";

export const REVIEW_INTELLIGENCE_FLAG = "review-intelligence.residual-ai";
export const REVIEW_INTELLIGENCE_PROJECTION_VERSION = 1;
export const REVIEW_TEXT_MAXIMUM = 2_000;

const SECRET_PATTERNS = [
  /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|token|password|secret)\s*[:=]\s*[^\s,;]+/gi,
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*\b/gi,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g,
];

export function boundedReviewText(value: unknown, maximum = REVIEW_TEXT_MAXIMUM): string {
  let result = String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  for (const pattern of SECRET_PATTERNS) result = result.replace(pattern, "[REDACTED]");
  return result.slice(0, maximum);
}

export function reviewIntelligenceDigest(namespace: string, value: unknown): string {
  return `sha256:${canonicalHash({ namespace, value })}`;
}

export type SemanticChangeGroupName = "Authentication" | "Persistence" | "Verification" | "UI"
  | "Configuration" | "Migration" | "Tests" | "Documentation" | "Dependencies" | "Other";

export interface SemanticFileChange {
  path: string;
  diffLocation?: string | null;
  artifactId?: string | null;
}

const GROUP_RULES: Array<{ name: SemanticChangeGroupName; matches: (path: string) => boolean }> = [
  { name: "Tests", matches: (path) => /(^|\/)(__tests__|test|tests|spec)(\/|\.|$)|\.(test|spec)\.[^.]+$/i.test(path) },
  { name: "Documentation", matches: (path) => /(^|\/)(docs?|adr)(\/|$)|\.(md|mdx|rst)$/i.test(path) },
  { name: "Migration", matches: (path) => /(^|\/)(migrations?|schema)(\/|\.|$)/i.test(path) },
  { name: "Dependencies", matches: (path) => /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|gemfile(\.lock)?|requirements[^/]*\.txt|cargo\.toml|go\.mod)$/i.test(path) },
  { name: "Authentication", matches: (path) => /(^|\/)(auth|authentication|authorization|session|identity|permissions?)/i.test(path) },
  { name: "Verification", matches: (path) => /(^|\/)(verification|evidence|qualityGate|qualif|harness|evals?)(\/|\.|-)/i.test(path) },
  { name: "Configuration", matches: (path) => /(^|\/)(config|\.github|\.env|vite\.config|tsconfig|tailwind|eslint)(\/|\.|-)|\.(ya?ml|toml)$/i.test(path) },
  { name: "UI", matches: (path) => /(^|\/)(components?|views?|pages?|ui|styles?)(\/|$)|\.(tsx|jsx|css|scss)$/i.test(path) },
  { name: "Persistence", matches: (path) => /(^|\/)(db|database|storage|models?|repositories|convex)(\/|\.|-)/i.test(path) },
];

export function buildSemanticChangeGroups(files: SemanticFileChange[]) {
  const groups = new Map<SemanticChangeGroupName, SemanticFileChange[]>();
  for (const file of files) {
    const path = boundedReviewText(file.path, 500).replace(/^\/+/, "");
    if (!path) continue;
    const name = GROUP_RULES.find((rule) => rule.matches(path))?.name ?? "Other";
    const members = groups.get(name) ?? [];
    if (!members.some((member) => member.path === path)) members.push({ ...file, path });
    groups.set(name, members);
  }
  return [...groups.entries()].map(([name, files]) => ({
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    method: "DETERMINISTIC" as const,
    authority: "ADVISORY" as const,
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
  }));
}

export function normalizeReviewCorrection(value: string): string {
  return boundedReviewText(value, 1_000).toLowerCase()
    .replace(/\b[0-9a-f]{7,64}\b/g, "<revision>")
    .replace(/\b\d+\b/g, "<number>")
    .replace(/[^a-z0-9<>]+/g, " ").replace(/\s+/g, " ").trim();
}

function intersect(left: string[] = [], right: string[] = []) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item));
}

export function buildReviewIntelligenceProjection(input: {
  workOrder: any;
  run: any;
  mission?: any;
  missionSpecRevision?: any;
  missionPlan?: any;
  verificationRun?: any;
  evidenceEnvelopes?: any[];
  prChecks?: any[];
  qualityGateDecision?: any;
  criteria: any[];
  fileChanges: Array<{ repositoryPath?: string | null; diffLocation?: string | null }>;
  decisions?: any[];
  judgments?: any[];
  residualAnalyses?: any[];
  events?: any[];
  attempts?: any[];
  currentVerification?: any;
}) {
  const requirements = input.workOrder?.requirements ?? [];
  const assertions = input.missionPlan?.assertions ?? [];
  const checks = input.verificationRun?.checks ?? [];
  const envelopes = input.evidenceEnvelopes ?? [];
  const criterionMatrix = (input.workOrder?.acceptanceCriteria ?? []).map((criterion: any) => {
    const criterionResult = input.criteria.find((item) => item.id === criterion.id);
    const requirementIds = criterion.requirementIds ?? [];
    const linkedRequirements = requirements.filter((requirement: any) => requirementIds.includes(requirement.id));
    const linkedAssertions = assertions.filter((assertion: any) =>
      intersect(assertion.sourceRequirementIds, requirementIds).length > 0
      || assertion.sourceAcceptanceExpectationIds?.includes(criterion.id));
    const linkedChecks = checks.filter((check: any) => check.acceptanceCriterionIds?.includes(criterion.id));
    const evidenceIds = [...new Set([
      ...(linkedChecks.flatMap((check: any) => check.evidenceIds ?? []).map(String)),
      ...(criterionResult?.evidenceEnvelopeIds ?? []).map(String),
    ])];
    const linkedEvidence = envelopes.filter((envelope: any) => evidenceIds.includes(String(envelope._id))
      || envelope.acceptanceCriterionIds?.includes(criterion.id));
    return {
      criterion: {
        id: criterion.id,
        title: criterion.title,
        description: criterion.description ?? null,
        requirementIds,
      },
      specRequirements: linkedRequirements.map((requirement: any) => ({
        id: requirement.id, title: requirement.title, priority: requirement.priority,
      })),
      planAssertions: linkedAssertions.map((assertion: any) => ({
        id: assertion.assertionId, title: assertion.title,
        verificationMethod: assertion.verificationMethod, requiredEvidence: assertion.requiredEvidence,
      })),
      verificationChecks: linkedChecks.map((check: any) => ({
        id: check.checkId, name: check.name, verifierId: check.verifierId,
        status: check.status, evidenceIds: (check.evidenceIds ?? []).map(String),
      })),
      evidence: linkedEvidence.map((envelope: any) => ({
        id: String(envelope._id), verificationRunId: String(envelope.verificationRunId),
        sourceAttemptId: envelope.sourceAttemptId ? String(envelope.sourceAttemptId) : null,
        producer: envelope.producer ?? null, category: envelope.category ?? null,
        artifactIds: (envelope.artifactIds ?? []).map(String),
        artifactReferences: envelope.artifactReferences ?? [], contentHash: envelope.contentHash ?? null,
        sourceRevision: envelope.sourceRevision, candidateRevision: envelope.candidateRevision,
        recordedAt: envelope.recordedAt,
      })),
      result: criterionResult?.status ?? "UNKNOWN",
      method: criterionResult?.verificationMethod ?? null,
      receiptId: criterionResult?.receiptId ?? null,
      verifier: criterionResult?.verifier ?? null,
      current: criterionResult
        ? !["STALE", "UNKNOWN", "MISSING", "PENDING"].includes(criterionResult.status)
          && input.currentVerification?.current !== false
        : false,
      integrityIssue: criterionResult?.integrityIssue ?? null,
      lineage: {
        missionSpecRevisionId: input.workOrder?.missionSpecLineage?.missionSpecRevisionId
          ? String(input.workOrder.missionSpecLineage.missionSpecRevisionId) : null,
        missionSpecDigest: input.workOrder?.missionSpecLineage?.missionSpecDigest ?? null,
        missionPlanId: input.workOrder?.missionPlanId ? String(input.workOrder.missionPlanId) : null,
        missionPlanRevisionNumber: input.missionPlan?.revisionNumber ?? null,
        qualityContractDigest: input.workOrder?.qualityContractDigest ?? null,
        workOrderId: String(input.workOrder?._id ?? ""),
        workOrderRevisionNumber: input.run?.workOrderRevisionNumber ?? input.workOrder?.currentRevisionNumber ?? null,
        workflowRunId: String(input.run?._id ?? input.run?.runId ?? ""),
        candidateRevision: input.run?.headSha ?? null,
        verificationRunId: input.verificationRun?._id ? String(input.verificationRun._id) : null,
        verificationSubjectId: input.verificationRun?.verificationSubjectId ?? null,
        verificationSubjectDigest: input.verificationRun?.verificationSubjectDigest ?? null,
        verificationPlanId: input.verificationRun?.verificationPlanId ?? null,
        verificationPlanDigest: input.verificationRun?.verificationPlanDigest ?? null,
        evidenceSetDigest: input.currentVerification?.evidenceSetDigest ?? null,
        qualityGateDecisionId: input.qualityGateDecision?._id ? String(input.qualityGateDecision._id) : null,
      },
    };
  });
  const semanticGroups = buildSemanticChangeGroups(input.fileChanges.flatMap((change) => change.repositoryPath
    ? [{ path: change.repositoryPath, diffLocation: change.diffLocation ?? null }]
    : []));
  const exactSubject = {
    workOrderId: String(input.workOrder?._id ?? ""),
    workOrderRevisionNumber: input.run?.workOrderRevisionNumber ?? input.workOrder?.currentRevisionNumber ?? null,
    workflowRunId: String(input.run?._id ?? input.run?.runId ?? ""),
    candidateRevision: input.run?.headSha ?? null,
    pullRequestUrl: input.run?.pullRequestUrl ?? null,
  };
  const gitSubject = input.verificationRun?.verificationSubject?.kind === "GIT_CANDIDATE"
    ? input.verificationRun.verificationSubject : null;
  const prWorkflowRunIds = new Set([
    exactSubject.workflowRunId,
    input.verificationRun?.workflowRunId ? String(input.verificationRun.workflowRunId) : null,
  ].filter(Boolean));
  const exactPrCheck = [...(input.prChecks ?? [])]
    .filter((check: any) => check.prUrl === exactSubject.pullRequestUrl
      && (!check.workflowRunId || prWorkflowRunIds.has(String(check.workflowRunId))))
    .sort((left: any, right: any) => (right.syncedAt ?? right._creationTime ?? 0) - (left.syncedAt ?? left._creationTime ?? 0))[0] ?? null;
  const reviewPackageSubject = {
    workOrderId: exactSubject.workOrderId,
    workOrderRevisionNumber: exactSubject.workOrderRevisionNumber,
    missionSpecRevisionId: input.workOrder?.missionSpecLineage?.missionSpecRevisionId
      ? String(input.workOrder.missionSpecLineage.missionSpecRevisionId) : null,
    missionSpecDigest: input.workOrder?.missionSpecLineage?.missionSpecDigest ?? null,
    missionPlanId: input.workOrder?.missionPlanId ? String(input.workOrder.missionPlanId) : null,
    qualityContractDigest: input.workOrder?.qualityContractDigest ?? null,
    workflowRunId: exactSubject.workflowRunId,
    candidateRevision: exactSubject.candidateRevision,
    pullRequestUrl: exactSubject.pullRequestUrl,
  };
  const currentDecision = (input.decisions ?? []).filter((decision) =>
    decision.workOrderRevisionNumber === exactSubject.workOrderRevisionNumber
    && decision.candidateRevision === exactSubject.candidateRevision);
  const currentJudgments = (input.judgments ?? []).filter((judgment) =>
    judgment.workOrderRevisionNumber === exactSubject.workOrderRevisionNumber
    && judgment.candidateRevision === exactSubject.candidateRevision);
  const residualAnalyses = (input.residualAnalyses ?? []).map((analysis) => ({
    ...analysis,
    current: analysis.workOrderRevisionNumber === exactSubject.workOrderRevisionNumber
      && analysis.candidateRevision === exactSubject.candidateRevision,
    authority: "ADVISORY" as const,
    acceptanceAuthority: false as const,
  }));
  const attemptHistory = (input.attempts ?? []).filter((attempt) =>
    ["FAILED", "CANCELED"].includes(attempt.status)
    || attempt.retryOfRunId || attempt.executionRetryOfClaimId || attempt.executionStaleRecoveryCount);
  const failedOrRecovered = [
    ...attemptHistory.map((attempt) => ({
      eventType: `ATTEMPT_${attempt.status}`,
      sequenceNumber: attempt.executionAttemptNumber ?? 0,
      status: attempt.status ?? null,
      summary: `${attempt.runId ?? attempt._id}${attempt.failureSummary ? ` · ${attempt.failureSummary}` : ""}`,
      workflowRunId: String(attempt._id),
      runId: attempt.runId ?? null,
      attemptPurpose: attempt.attemptPurpose ?? null,
      retryOfRunId: attempt.retryOfRunId ? String(attempt.retryOfRunId) : null,
      recordedAt: attempt.completedAt ?? attempt.failedAt ?? attempt.canceledAt ?? attempt.startedAt ?? null,
    })),
    ...(input.events ?? []).filter((event) =>
      event.status === "FAILED" || event.errorSummary
      || ["RUN_RETRIED", "STALE_RUN_RECOVERED", "ORPHAN_RECONCILED", "VERIFICATION_FAILED"].includes(event.eventType))
      .map((event) => ({
        eventType: event.eventType, sequenceNumber: event.sequenceNumber,
        status: event.status ?? null, summary: event.errorSummary ?? event.commandSummary ?? event.eventType,
        workflowRunId: String(event.workflowRunId ?? input.run?._id ?? ""),
        recordedAt: event.timestamp ?? event.createdAt ?? null,
      })),
  ];
  return {
    projectionVersion: REVIEW_INTELLIGENCE_PROJECTION_VERSION,
    digest: reviewIntelligenceDigest("review-intelligence-package/v1", {
      exactSubject,
      missionSpecDigest: input.workOrder?.missionSpecLineage?.missionSpecDigest ?? null,
      qualityContractDigest: input.workOrder?.qualityContractDigest ?? null,
      verificationSubjectDigest: input.verificationRun?.verificationSubjectDigest ?? null,
      verificationPlanDigest: input.verificationRun?.verificationPlanDigest ?? null,
      evidenceSetDigest: input.currentVerification?.evidenceSetDigest ?? null,
    }),
    intent: {
      mission: input.mission ? { id: String(input.mission._id), title: input.mission.title, objective: input.mission.objective } : null,
      spec: input.missionSpecRevision ? {
        id: String(input.missionSpecRevision._id), revisionNumber: input.missionSpecRevision.revisionNumber,
        digest: input.missionSpecRevision.digest,
      } : input.workOrder?.missionSpecLineage ? {
        id: String(input.workOrder.missionSpecLineage.missionSpecRevisionId), revisionNumber: null,
        digest: input.workOrder.missionSpecLineage.missionSpecDigest,
      } : null,
      plan: input.missionPlan ? {
        id: String(input.missionPlan._id), revisionNumber: input.missionPlan.revisionNumber,
        status: input.missionPlan.status, summary: input.missionPlan.summary,
      } : null,
      workOrder: {
        id: String(input.workOrder?._id ?? ""), revisionNumber: exactSubject.workOrderRevisionNumber,
        title: input.workOrder?.title ?? "", desiredOutcome: input.workOrder?.desiredOutcome ?? "",
      },
      qualityContractDigest: input.workOrder?.qualityContractDigest ?? null,
      definitionOfDone: (input.workOrder?.acceptanceCriteria ?? []).map((criterion: any) => ({ id: criterion.id, title: criterion.title })),
    },
    criterionMatrix,
    changes: {
      summary: input.run?.returnHandoff?.summary ?? null,
      semanticGroups,
      changedFiles: semanticGroups.flatMap((group) => group.files),
      rawDiffUrl: input.run?.pullRequestUrl ? `${input.run.pullRequestUrl}/files` : null,
    },
    failedOrRecovered,
    decisions: currentDecision,
    historicalDecisionCount: (input.decisions ?? []).length - currentDecision.length,
    judgments: currentJudgments,
    historicalJudgmentCount: (input.judgments ?? []).length - currentJudgments.length,
    residualAnalyses,
    residualRisks: [
      ...(input.run?.returnHandoff?.unresolvedRisks ?? []),
      ...residualAnalyses.flatMap((analysis) => analysis.findings ?? []).map((finding: any) => finding.summary),
    ],
    exactLineage: {
      ...exactSubject,
      reviewPackageDigest: reviewIntelligenceDigest("review-package-subject/v1", reviewPackageSubject),
      missionSpecRevisionId: input.workOrder?.missionSpecLineage?.missionSpecRevisionId
        ? String(input.workOrder.missionSpecLineage.missionSpecRevisionId) : null,
      missionSpecDigest: input.workOrder?.missionSpecLineage?.missionSpecDigest ?? null,
      missionPlanId: input.workOrder?.missionPlanId ? String(input.workOrder.missionPlanId) : null,
      qualityContractDigest: input.workOrder?.qualityContractDigest ?? null,
      verificationRunId: input.verificationRun?._id ? String(input.verificationRun._id) : null,
      verificationSubjectId: input.verificationRun?.verificationSubjectId ?? null,
      verificationSubjectDigest: input.verificationRun?.verificationSubjectDigest ?? null,
      verificationPlanId: input.verificationRun?.verificationPlanId ?? null,
      verificationPlanDigest: input.verificationRun?.verificationPlanDigest ?? null,
      treeSha: gitSubject?.treeSha ?? input.run?.treeSha ?? null,
      verificationSubjectCandidateSha: gitSubject?.candidateSha ?? input.verificationRun?.candidateRevision ?? null,
      verificationSubjectPrHeadSha: gitSubject?.pullRequest?.headSha ?? null,
      currentPullRequestHeadSha: exactPrCheck?.headSha ?? null,
      pullRequestProvider: gitSubject?.provider ?? exactPrCheck?.provider ?? null,
      providerRepositoryId: gitSubject?.providerRepositoryId ?? exactPrCheck?.providerRepositoryId ?? null,
      providerPullRequestId: gitSubject?.pullRequest?.providerPullRequestId ?? exactPrCheck?.providerPullRequestId ?? null,
      evidenceSetDigest: input.currentVerification?.evidenceSetDigest ?? null,
      qualityGateDecisionId: input.qualityGateDecision?._id ? String(input.qualityGateDecision._id) : null,
      current: input.currentVerification?.current === true,
      currentnessReasons: input.currentVerification?.reasons ?? ["Currentness has not been evaluated."],
      workerIdentity: input.run?.executionClaimedBy ?? null,
      harnessIdentity: input.run?.executionManifest?.harness ?? null,
    },
    authority: {
      deterministicEvidence: "CANONICAL_VERIFICATION",
      advisoryFindings: "ADVISORY",
      reviewPackage: "PROJECTION",
      reviewApproval: "NOT_ACCEPTANCE",
      acceptanceMutation: "workOrders.accept",
    },
  };
}
