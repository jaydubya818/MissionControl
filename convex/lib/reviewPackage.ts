export type CriterionEvidenceStatus =
  | "PASS"
  | "FAIL"
  | "STALE"
  | "WAIVED"
  | "PENDING"
  | "MISSING"
  | "UNKNOWN";

type CriterionLike = {
  id: string;
  title: string;
  verificationMethod?: string;
};

type ReceiptLike = {
  _id?: string;
  receiptScope?: "ACCEPTANCE_CRITERION" | "WORK_ORDER";
  acceptanceCriterionId?: string;
  workflowRunId?: string;
  verificationRunId?: string;
  status: string;
  verifier?: string;
  result?: string;
  evidenceLocation?: string;
  artifactReference?: string;
  linkedRunArtifactIds?: string[];
  evidenceEnvelopeIds?: string[];
  waiverApprovalDecisionId?: string;
  sourceRevision?: string;
  candidateRevision?: string;
  verdict?: string;
  verdictReasons?: string[];
  workOrderRevisionNumber?: number;
  validUntil?: number;
  invalidatedAt?: number;
  recordedAt: number;
};

type PrCheckLike = {
  _id?: string;
  workflowRunId?: string;
  prUrl: string;
  repoFullName?: string;
  branch?: string;
  headSha?: string;
  prState?: "OPEN" | "CLOSED" | "MERGED";
  ciStatus?: "PASS" | "FAIL" | "PENDING" | "UNKNOWN";
  ciRunUrl?: string;
  syncedAt: number;
  changeReviewLenses?: Array<{ id: string; label: string; enabled: boolean; score?: number }>;
};

type EventLike = {
  eventType: string;
  status?: string;
  commandSummary?: string;
  errorSummary?: string;
  sequenceNumber: number;
};

function latestReceipt(receipts: ReceiptLike[], criterionId: string, workflowRunId?: string) {
  return receipts
    .filter((receipt) => receipt.acceptanceCriterionId === criterionId
      && receipt.receiptScope !== "WORK_ORDER"
      && (!workflowRunId || receipt.workflowRunId === workflowRunId))
    .sort((left, right) => right.recordedAt - left.recordedAt)[0];
}

function latestGateReceipt(receipts: ReceiptLike[], workflowRunId?: string) {
  return receipts
    .filter((receipt) => receipt.receiptScope === "WORK_ORDER"
      && (!workflowRunId || receipt.workflowRunId === workflowRunId))
    .sort((left, right) => right.recordedAt - left.recordedAt)[0];
}

function hasEvidence(receipt: ReceiptLike) {
  return Boolean(
    receipt.evidenceLocation
    || receipt.artifactReference
    || receipt.linkedRunArtifactIds?.length
    || receipt.evidenceEnvelopeIds?.length,
  );
}

function pullRequestMatchesRepository(url: string | undefined, repository: string | null | undefined, number: number | undefined) {
  if (!url || !repository || !number) return false;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/");
    const expectedRepository = repository.toLowerCase().split("/");
    return parsed.protocol === "https:"
      && parsed.hostname.toLowerCase() === "github.com"
      && expectedRepository.length === 2
      && path.length === 4
      && path[0]?.toLowerCase() === expectedRepository[0]
      && path[1]?.toLowerCase() === expectedRepository[1]
      && path[2] === "pull"
      && path[3] === String(number);
  } catch {
    return false;
  }
}

function subjectIntegrityIssue(receipt: ReceiptLike | undefined, input: {
  workOrderRevisionNumber?: number;
  sourceRevision?: string;
  candidateRevision?: string;
}) {
  if (!receipt) return null;
  if (input.workOrderRevisionNumber && receipt.workOrderRevisionNumber !== input.workOrderRevisionNumber) {
    return receipt.workOrderRevisionNumber
      ? `Evidence is bound to WorkOrder revision v${receipt.workOrderRevisionNumber}, not v${input.workOrderRevisionNumber}.`
      : "WorkOrder revision identity is missing.";
  }
  if (input.sourceRevision && receipt.sourceRevision !== input.sourceRevision) {
    return receipt.sourceRevision
      ? "Evidence source SHA does not match the inspected Attempt."
      : "Evidence source SHA identity is missing.";
  }
  if (input.candidateRevision && receipt.candidateRevision !== input.candidateRevision) {
    return receipt.candidateRevision
      ? "Evidence candidate SHA does not match the inspected pull-request head."
      : "Evidence candidate SHA identity is missing.";
  }
  return null;
}

function receiptIntegrityIssue(receipt: ReceiptLike | undefined, executionClaimedBy?: string) {
  if (!receipt) return null;
  if (receipt.status === "WAIVED") {
    if (!receipt.waiverApprovalDecisionId) return "Waiver approval is missing.";
    if (!hasEvidence(receipt)) return "Waiver evidence is missing.";
  }
  if (receipt.status === "PASSED") {
    const verifier = receipt.verifier?.trim();
    if (!verifier) return "Verifier identity is missing.";
    if (!hasEvidence(receipt)) return "Linked verification evidence is missing.";
    if (executionClaimedBy?.trim() && verifier === executionClaimedBy.trim()) {
      return "Verifier matches the execution worker; independent verification is required.";
    }
  }
  return null;
}

function criterionStatus(receipt: ReceiptLike | undefined, input: {
  now: number;
  workOrderRevisionNumber?: number;
  executionClaimedBy?: string;
  sourceRevision?: string;
  candidateRevision?: string;
}): CriterionEvidenceStatus {
  if (!receipt) return "MISSING";
  if (subjectIntegrityIssue(receipt, input)) return "STALE";
  if (receipt.invalidatedAt) return "STALE";
  if (receipt.validUntil && receipt.validUntil <= input.now) return "STALE";
  if (receipt.status === "FAILED") return "FAIL";
  if (receipt.status === "STALE") return "STALE";
  if (receipt.status === "PENDING") return "PENDING";
  if (receipt.status === "WAIVED") {
    return receiptIntegrityIssue(receipt, input.executionClaimedBy) ? "UNKNOWN" : "WAIVED";
  }
  if (receipt.status === "PASSED") {
    return receiptIntegrityIssue(receipt, input.executionClaimedBy) ? "UNKNOWN" : "PASS";
  }
  return "UNKNOWN";
}

export function buildReviewPackage(input: {
  now: number;
  run: {
    _id?: string;
    status: string;
    runId: string;
    workOrderRevisionNumber?: number;
    repositoryId?: string;
    branch?: string;
    executionBaseSha?: string;
    headSha?: string;
    pullRequestUrl?: string;
    pullRequestNumber?: number;
    executionAttemptNumber?: number;
    executionStaleRecoveryCount?: number;
    executionClaimedBy?: string;
    executionManifestDigest?: string;
    returnHandoff?: { failedChecks?: string[]; unresolvedRisks?: string[]; nextDecision?: string };
  };
  workOrder?: {
    _id?: string;
    title?: string;
    riskLevel?: string;
    riskReasons?: string[];
    currentRevisionNumber?: number;
    acceptanceCriteria?: CriterionLike[];
    constraints?: string[];
  } | null;
  receipts?: ReceiptLike[];
  prChecks?: PrCheckLike[];
  events?: EventLike[];
  fileChanges?: Array<{ repositoryPath?: string | null }>;
  rollbackApproach?: string | null;
  expectedRepository?: string | null;
}) {
  const workflowRunId = input.run._id ?? input.run.runId;
  const frozenRevision = input.run.workOrderRevisionNumber ?? input.workOrder?.currentRevisionNumber;
  const criteria = (input.workOrder?.acceptanceCriteria ?? []).map((criterion) => {
    const receipt = latestReceipt(input.receipts ?? [], criterion.id, workflowRunId);
    const status = criterionStatus(receipt, {
      now: input.now,
      workOrderRevisionNumber: frozenRevision,
      executionClaimedBy: input.run.executionClaimedBy,
      sourceRevision: input.run.executionBaseSha,
      candidateRevision: input.run.headSha,
    });
    const integrityIssue = subjectIntegrityIssue(receipt, {
      workOrderRevisionNumber: frozenRevision,
      sourceRevision: input.run.executionBaseSha,
      candidateRevision: input.run.headSha,
    }) ?? receiptIntegrityIssue(receipt, input.run.executionClaimedBy);
    return {
      id: criterion.id,
      title: criterion.title,
      verificationMethod: criterion.verificationMethod ?? null,
      status,
      receiptId: receipt?._id ?? null,
      verifier: receipt?.verifier ?? null,
      result: receipt?.result ?? null,
      evidenceLocation: receipt?.evidenceLocation ?? receipt?.artifactReference ?? null,
      validUntil: receipt?.validUntil ?? null,
      integrityIssue,
    };
  });

  const gateReceipt = latestGateReceipt(input.receipts ?? [], workflowRunId);
  const gateSubjectIssue = subjectIntegrityIssue(gateReceipt, {
    workOrderRevisionNumber: frozenRevision,
    sourceRevision: input.run.executionBaseSha,
    candidateRevision: input.run.headSha,
  });
  const gateIntegrityIssue = gateSubjectIssue
    ?? (gateReceipt && !gateReceipt.verificationRunId ? "Verification-run identity is missing from the WorkOrder gate." : null)
    ?? (gateReceipt && !gateReceipt.verifier?.trim() ? "Verifier identity is missing from the WorkOrder gate." : null)
    ?? (gateReceipt && !hasEvidence(gateReceipt) ? "Durable evidence is missing from the WorkOrder gate." : null);
  const gateStale = Boolean(gateReceipt?.invalidatedAt
    || gateReceipt?.status === "STALE"
    || (gateReceipt?.validUntil && gateReceipt.validUntil <= input.now)
    || gateSubjectIssue);
  const gateStatus = !gateReceipt
    ? "MISSING"
    : gateStale
      ? "STALE"
      : gateReceipt.status === "FAILED" || ["NOT_VERIFIED", "BLOCKED"].includes(gateReceipt.verdict ?? "")
        ? "FAIL"
        : gateReceipt.status === "PENDING" || gateReceipt.verdict === "REQUIRES_HUMAN_REVIEW"
          ? "PENDING"
          : gateReceipt.status === "PASSED" && gateReceipt.verdict === "VERIFIED" && !gateIntegrityIssue
            ? "PASS"
            : "UNKNOWN";

  const exactPrCheck = (input.prChecks ?? [])
    .filter((check) => check.prUrl === input.run.pullRequestUrl
      && check.headSha === input.run.headSha
      && check.workflowRunId === workflowRunId
      && (!input.expectedRepository || check.repoFullName === input.expectedRepository)
      && (!input.run.branch || check.branch === input.run.branch))
    .sort((left, right) => right.syncedAt - left.syncedAt)[0];
  const deviations = (input.events ?? [])
    .filter((event) => event.eventType === "POLICY_DEVIATION")
    .map((event) => event.errorSummary ?? event.commandSummary ?? `Policy deviation at event ${event.sequenceNumber}`);
  const failedChecks = input.run.returnHandoff?.failedChecks ?? [];
  const risks = input.run.returnHandoff?.unresolvedRisks ?? [];
  const files = [...new Set((input.fileChanges ?? [])
    .map((change) => change.repositoryPath)
    .filter((path): path is string => Boolean(path)))];

  const blockers: string[] = [];
  const incomplete: string[] = [];
  if (input.run.status === "FAILED" || input.run.status === "CANCELED") {
    blockers.push(`Attempt is ${input.run.status.toLowerCase()}.`);
  } else if (input.run.status !== "COMPLETED") {
    incomplete.push("Attempt has not completed.");
  }
  if (!input.run.workOrderRevisionNumber) incomplete.push("Attempt is missing its frozen WorkOrder revision identity.");
  if (!input.expectedRepository) incomplete.push("Repository identity is missing from the Attempt lineage.");
  if (!input.run.branch) incomplete.push("Branch identity is missing from the Attempt lineage.");
  if (
    input.run.workOrderRevisionNumber
    && input.workOrder?.currentRevisionNumber
    && input.run.workOrderRevisionNumber !== input.workOrder.currentRevisionNumber
  ) {
    blockers.push(`WorkOrder advanced to revision v${input.workOrder.currentRevisionNumber}; this Attempt is frozen at v${input.run.workOrderRevisionNumber}.`);
  }
  if (!gateReceipt) {
    incomplete.push("Server-owned WorkOrder verification receipt is missing.");
  } else if (gateStatus === "STALE") {
    blockers.push(gateSubjectIssue ?? "Server-owned WorkOrder verification evidence is stale.");
  } else if (gateStatus === "FAIL") {
    blockers.push(`Quality gate is ${gateReceipt.verdict?.toLowerCase() ?? "failing"}.`);
  } else if (gateStatus === "PENDING") {
    incomplete.push("Quality gate is awaiting required human review.");
  } else if (gateStatus !== "PASS") {
    blockers.push(gateIntegrityIssue ?? "Server-owned WorkOrder verification receipt lacks a VERIFIED verdict and durable evidence.");
  }
  if (!input.run.pullRequestUrl || !input.run.pullRequestNumber || !input.run.executionBaseSha || !input.run.headSha) {
    incomplete.push("Review-ready pull request and exact base/head SHA lineage are missing.");
  } else if (!pullRequestMatchesRepository(input.run.pullRequestUrl, input.expectedRepository, input.run.pullRequestNumber)) {
    blockers.push("Pull-request URL does not match the expected GitHub repository and PR number.");
  }
  if (!exactPrCheck) {
    incomplete.push("Exact Attempt, repository, branch, and head GitHub CI evidence is missing.");
  } else {
    if (exactPrCheck.prState === "CLOSED" || exactPrCheck.prState === "MERGED") {
      blockers.push(`Pull request is ${exactPrCheck.prState.toLowerCase()}; an open review candidate is required.`);
    } else if (exactPrCheck.prState !== "OPEN") {
      incomplete.push("Pull-request open-state evidence is missing.");
    }
    if (exactPrCheck.ciStatus === "FAIL") {
      blockers.push("Exact-head GitHub CI is failing.");
    } else if (exactPrCheck.ciStatus !== "PASS") {
      incomplete.push(`Exact-head GitHub CI is ${exactPrCheck.ciStatus?.toLowerCase() ?? "unknown"}.`);
    }
  }
  if (files.length === 0) incomplete.push("Structured changed-file lineage is missing.");
  if (criteria.length === 0) incomplete.push("No acceptance criteria are bound to the WorkOrder.");
  for (const criterion of criteria) {
    if (["FAIL", "STALE", "UNKNOWN"].includes(criterion.status)) {
      blockers.push(`${criterion.title}: ${criterion.integrityIssue ?? `evidence is ${criterion.status.toLowerCase()}.`}`);
    } else if (["MISSING", "PENDING"].includes(criterion.status)) {
      incomplete.push(`${criterion.title}: evidence is ${criterion.status.toLowerCase()}.`);
    }
  }
  if (deviations.length > 0) blockers.push(`${deviations.length} unresolved policy deviation(s) are recorded.`);
  if (failedChecks.length > 0) blockers.push(`${failedChecks.length} failed handoff check(s) remain.`);
  if (!input.rollbackApproach?.trim()) incomplete.push("Rollback guidance is missing.");

  const reviewerFocus = [...new Set([
    ...(input.workOrder?.riskReasons ?? []),
    ...risks,
    ...deviations,
    ...failedChecks,
    ...(exactPrCheck?.changeReviewLenses ?? [])
      .filter((lens) => lens.enabled)
      .map((lens) => `${lens.label}${typeof lens.score === "number" ? ` (${lens.score})` : ""}`),
  ].filter((item) => item.trim()))];

  const status = blockers.length > 0 ? "BLOCKED" : incomplete.length > 0 ? "INCOMPLETE" : "READY";
  const allBlockers = [...blockers, ...incomplete];
  return {
    status,
    summary: status === "READY"
      ? "Exact-head CI and every criterion have accepted evidence. Human merge review can proceed."
      : status === "BLOCKED"
        ? `${blockers.length} blocking issue(s) require resolution before merge review.`
        : `${incomplete.length} evidence item(s) are still required before merge review.`,
    nextAction: status === "READY"
      ? "Review the focused risks, rollback guidance, and changed files; merge remains a human decision."
      : allBlockers[0] ?? "Complete the missing evidence.",
    blockers: allBlockers,
    identity: {
      runId: input.run.runId,
      workOrderId: input.workOrder?._id ?? null,
      workOrderRevisionNumber: input.run.workOrderRevisionNumber ?? input.workOrder?.currentRevisionNumber ?? null,
      repositoryId: input.run.repositoryId ?? null,
      repository: input.expectedRepository ?? null,
      branch: input.run.branch ?? null,
      baseSha: input.run.executionBaseSha ?? null,
      headSha: input.run.headSha ?? null,
      pullRequestUrl: input.run.pullRequestUrl ?? null,
      pullRequestNumber: input.run.pullRequestNumber ?? null,
      executionManifestDigest: input.run.executionManifestDigest ?? null,
    },
    gate: {
      status: gateStatus,
      receiptId: gateReceipt?._id ?? null,
      verificationRunId: gateReceipt?.verificationRunId ?? null,
      verdict: gateReceipt?.verdict ?? null,
      verifier: gateReceipt?.verifier ?? null,
      sourceRevision: gateReceipt?.sourceRevision ?? null,
      candidateRevision: gateReceipt?.candidateRevision ?? null,
      recordedAt: gateReceipt?.recordedAt ?? null,
      validUntil: gateReceipt?.validUntil ?? null,
      reasons: gateReceipt?.verdictReasons ?? [],
      integrityIssue: gateIntegrityIssue,
    },
    ci: {
      status: exactPrCheck?.ciStatus ?? "MISSING",
      runUrl: exactPrCheck?.ciRunUrl ?? null,
      evaluationId: exactPrCheck?._id ?? null,
      headSha: exactPrCheck?.headSha ?? null,
      prState: exactPrCheck?.prState ?? "UNKNOWN",
      lenses: exactPrCheck?.changeReviewLenses?.filter((lens) => lens.enabled) ?? [],
    },
    criteria,
    changedFiles: files,
    deviations,
    failedChecks,
    risks,
    riskLevel: input.workOrder?.riskLevel ?? null,
    reviewerFocus,
    rollbackApproach: input.rollbackApproach?.trim() || null,
    recovery: {
      attempts: input.run.executionAttemptNumber ?? 0,
      staleRecoveries: input.run.executionStaleRecoveryCount ?? 0,
    },
  } as const;
}
