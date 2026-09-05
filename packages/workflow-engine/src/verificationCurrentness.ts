import { tupleMatches, type VerificationIdentityTuple } from "./verificationIndependence.js";
import { qualityGateEvidenceSetDigest } from "./verificationIdentity.js";
import { verifyVerificationSubjectIdentity, verifyGitSubjectPublicationBinding, type GitSubjectPublicationBinding, type VerificationSubject } from "./verificationSubject.js";

export type CurrentVerificationSourceAttempt = {
  id: string;
  repositoryId?: string;
  attemptPurpose?: "IMPLEMENTATION" | "VERIFICATION" | "AUTOMATION";
  status: string;
  candidateReadyAt?: number;
  qualityContractDigest?: string;
  verificationSubject?: VerificationSubject;
  subjectPublicationBinding?: GitSubjectPublicationBinding;
};

export type CurrentVerificationAttempt = {
  id: string;
  attemptPurpose?: "IMPLEMENTATION" | "VERIFICATION" | "AUTOMATION";
  status: string;
  createdAt: number;
  supersededAt?: number;
  qualityContractDigest?: string;
  verificationAttemptBinding?: VerificationIdentityTuple;
};

export type StoredVerificationResult = VerificationIdentityTuple & {
  id: string;
  workflowRunId: string;
  status: "PLANNED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELED";
  verdict?: "VERIFIED" | "NOT_VERIFIED" | "BLOCKED" | "REQUIRES_HUMAN_REVIEW";
  independenceValid?: boolean;
  verificationPlanId?: string;
  verificationPlanDigest?: string;
  decisionInputDigest?: string;
  createdAt: number;
  completedAt?: number;
  invalidatedAt?: number;
};

export type StoredVerificationReceipt = VerificationIdentityTuple & {
  humanReviewValid?: boolean;
  id: string;
  verificationRunId: string;
  verificationAttemptId: string;
  verificationPlanId: string;
  verificationPlanDigest: string;
  verificationSubjectId: string;
  evidenceEnvelopeIds?: string[];
  status: "PENDING" | "PASSED" | "FAILED" | "WAIVED" | "STALE";
  verdict?: "VERIFIED" | "NOT_VERIFIED" | "BLOCKED" | "REQUIRES_HUMAN_REVIEW";
  independenceValid?: boolean;
  decisionInputDigest?: string;
  recordedAt: number;
  validUntil?: number;
  invalidatedAt?: number;
};

export type StoredVerificationEvidence = VerificationIdentityTuple & {
  id: string;
  workflowRunId: string;
  verificationRunId: string;
  verificationAttemptId: string;
  verificationSubjectId: string;
  verificationPlanId: string;
  verificationPlanDigest: string;
  recordedAt: number;
};

export type GitProviderHeadProjection = {
  provider: "GITHUB";
  repositoryId: string;
  installationId: string;
  sourceAttemptId: string;
  providerRepositoryId: string;
  providerPullRequestId: string;
  pullRequestNumber: number;
  pullRequestUrl: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  draft: boolean;
  headSha: string;
  syncedAt: number;
  expiresAt?: number;
};

export type CurrentVerificationEligibility = {
  eligible: boolean;
  current: boolean;
  verifiedOutcome?: "SUCCESS" | "FAILURE";
  verificationRecordedAt?: number;
  exactIdentity?: VerificationIdentityTuple;
  sourceAttemptId?: string;
  candidateRevision?: string;
  verificationAttemptId?: string;
  verificationRunId?: string;
  verificationReceiptId?: string;
  verificationPlanDigest?: string;
  evidenceSetDigest?: string;
  historicalVerdict?: StoredVerificationResult["verdict"];
  reasons: string[];
};

/**
 * Canonical policy-v2 acceptance eligibility helper.
 *
 * This intentionally chooses the newest candidate and newest exact-bound
 * Verification Attempt before it looks at a verdict. It never falls back to an
 * older pass.
 */
export type CurrentVerificationInput = {
  workOrderId: string;
  workOrderRevisionNumber: number;
  qualityContractDigest?: string;
  verificationContractDigest?: string;
  sourceAttempts: CurrentVerificationSourceAttempt[];
  verificationAttempts: CurrentVerificationAttempt[];
  verificationResults: StoredVerificationResult[];
  verificationReceipts: StoredVerificationReceipt[];
  verificationEvidence: StoredVerificationEvidence[];
  providerHeads?: GitProviderHeadProjection[];
  now: number;
};

export function evaluateCurrentVerificationEligibility(input: CurrentVerificationInput): CurrentVerificationEligibility {
  return evaluateVerification(input, "ACCEPTANCE");
}

/** Independent evidence suitable for human publication review; never acceptance or a publication permit. */
export function evaluatePrepublicationVerification(input: CurrentVerificationInput): CurrentVerificationEligibility {
  return evaluateVerification(input, "PREPUBLICATION");
}

function evaluateVerification(input: CurrentVerificationInput, purpose: "ACCEPTANCE" | "PREPUBLICATION"): CurrentVerificationEligibility {
  if (!input.qualityContractDigest) return denied("Current WorkOrder has no approved Plan Quality Contract digest.");
  if (!input.verificationContractDigest) return denied("Current WorkOrder has no persisted verification contract digest.");
  const source = [...input.sourceAttempts]
    .filter((attempt) => attempt.candidateReadyAt
      && (attempt.attemptPurpose === "IMPLEMENTATION" || attempt.attemptPurpose === "AUTOMATION"))
    .sort((left, right) => (right.candidateReadyAt ?? 0) - (left.candidateReadyAt ?? 0))[0];
  if (!source) return denied("No current source Attempt has published a candidate-ready Verification Subject.");
  const prepublication = source.verificationSubject?.kind === "GIT_CANDIDATE" && source.verificationSubject.version === 2;
  if (purpose === "PREPUBLICATION" && !prepublication) return denied("Publication evidence requires an immutable pre-publication Git subject.");
  if (source.status !== "COMPLETED" && !(purpose === "PREPUBLICATION" && prepublication && ["PAUSED", "PENDING", "RUNNING"].includes(source.status))) {
    return denied(`Newest candidate-ready source Attempt is ${source.status}; older passing candidates cannot be reused.`, {
      sourceAttemptId: source.id,
    });
  }
  if (!source.verificationSubject) return denied("Current source Attempt has no immutable Verification Subject.");
  const subject = source.verificationSubject;
  if (!verifyVerificationSubjectIdentity(subject)) {
    return denied("Current source Attempt Verification Subject identity is not canonical.");
  }
  const exactIdentity: VerificationIdentityTuple = {
    workOrderId: input.workOrderId,
    workOrderRevisionNumber: input.workOrderRevisionNumber,
    verificationContractDigest: input.verificationContractDigest,
    sourceAttemptId: source.id,
    verificationSubjectDigest: subject.digest,
  };
  const candidateRevision = subject.kind === "GIT_CANDIDATE"
    ? subject.candidateSha
    : subject.outputSnapshotContentHash;
  if (source.qualityContractDigest !== input.qualityContractDigest) {
    return denied("Current source Attempt is not bound to the WorkOrder Quality Contract.", {
      exactIdentity,
      sourceAttemptId: source.id,
      candidateRevision,
    });
  }
  if (subject.workOrderId !== input.workOrderId || subject.workOrderRevisionNumber !== input.workOrderRevisionNumber
    || subject.verificationContractDigest !== input.verificationContractDigest || subject.sourceAttemptId !== source.id) {
    return denied("Current source Attempt subject is stale for the WorkOrder revision or verification contract.", {
      exactIdentity,
      sourceAttemptId: source.id,
      candidateRevision,
    });
  }
  if (subject.kind === "GIT_CANDIDATE" && source.repositoryId !== subject.repositoryId) {
    return denied("Current source Attempt repository does not match the immutable Git subject.", {
      exactIdentity,
      sourceAttemptId: source.id,
      candidateRevision,
    });
  }

  const verificationAttempt = [...input.verificationAttempts]
    .filter((attempt) => attempt.attemptPurpose === "VERIFICATION" && !attempt.supersededAt
      && attempt.verificationAttemptBinding && tupleMatches(attempt.verificationAttemptBinding, exactIdentity))
    .sort((left, right) => right.createdAt - left.createdAt)[0];
  if (!verificationAttempt) return denied("No Verification Attempt is bound to the exact current subject.", {
    exactIdentity,
    sourceAttemptId: source.id,
    candidateRevision,
  });
  if (verificationAttempt.qualityContractDigest !== input.qualityContractDigest) {
    return denied("Newest exact Verification Attempt is not bound to the WorkOrder Quality Contract.", {
      exactIdentity,
      sourceAttemptId: source.id,
      candidateRevision,
      verificationAttemptId: verificationAttempt.id,
    });
  }
  if (verificationAttempt.status !== "COMPLETED") return denied(`Newest exact Verification Attempt is ${verificationAttempt.status}; older passing results cannot be reused.`, {
    exactIdentity,
    sourceAttemptId: source.id,
    candidateRevision,
    verificationAttemptId: verificationAttempt.id,
  });

  const result = [...input.verificationResults]
    .filter((candidate) => candidate.workflowRunId === verificationAttempt.id && tupleMatches(candidate, exactIdentity))
    .sort((left, right) => right.createdAt - left.createdAt)[0];
  if (!result) return denied("Newest exact Verification Attempt has no matching Verification Result.", {
    exactIdentity,
    sourceAttemptId: source.id,
    candidateRevision,
    verificationAttemptId: verificationAttempt.id,
  });
  const context = {
    exactIdentity,
    sourceAttemptId: source.id,
    candidateRevision,
    verificationAttemptId: verificationAttempt.id,
    verificationRunId: result.id,
    verificationPlanDigest: result.verificationPlanDigest,
    historicalVerdict: result.verdict,
  };
  if (result.invalidatedAt) return denied("Exact Verification Result was invalidated.", context);
  if (result.status !== "COMPLETED") return denied(`Exact Verification Result lifecycle is ${result.status}.`, context);
  if (result.independenceValid !== true) return denied("Exact Verification Result lacks server-derived independence.", context);
  if (!result.verificationPlanId || !result.verificationPlanDigest) return denied("Exact Verification Result lacks frozen Verification Plan identity.", context);
  if (!result.decisionInputDigest) return denied("Exact Verification Result lacks a canonical decision-input digest.", context);
  const requiresHumanReview = prepublication && result.verdict === "REQUIRES_HUMAN_REVIEW";
  const verifiedOutcome = result.verdict === "VERIFIED" || requiresHumanReview
    ? "SUCCESS" as const
    : result.verdict === "NOT_VERIFIED" || result.verdict === "BLOCKED"
      ? "FAILURE" as const
      : undefined;
  if (!verifiedOutcome) {
    return denied(`Exact Verification Result is ${result.verdict ?? "missing a verdict"}.`, context);
  }

  const receipt = [...input.verificationReceipts]
    .filter((candidate) => candidate.verificationRunId === result.id
      && candidate.verificationAttemptId === verificationAttempt.id
      && candidate.verificationPlanId === result.verificationPlanId
      && candidate.verificationPlanDigest === result.verificationPlanDigest
      && candidate.verificationSubjectId === subject.subjectId
      && tupleMatches(candidate, exactIdentity))
    .sort((left, right) => right.recordedAt - left.recordedAt)[0];
  if (!receipt) return denied("Exact Verification Result has no matching WorkOrder verification receipt.", context);
  const receiptContext = { ...context, verificationReceiptId: receipt.id };
  const receiptMatchesOutcome = verifiedOutcome === "SUCCESS"
    ? requiresHumanReview
      ? (receipt.status === "PASSED" && receipt.verdict === "VERIFIED" && receipt.humanReviewValid === true)
        || (purpose === "PREPUBLICATION" && receipt.status === "PENDING" && receipt.verdict === "REQUIRES_HUMAN_REVIEW")
      : receipt.status === "PASSED" && receipt.verdict === "VERIFIED"
    : receipt.status === "FAILED" && receipt.verdict === result.verdict;
  if (!receiptMatchesOutcome || receipt.independenceValid !== true) {
    return denied("Exact WorkOrder verification receipt does not match the independent verification outcome.", receiptContext);
  }
  if (receipt.invalidatedAt || (prepublication && !receipt.validUntil) || (receipt.validUntil && receipt.validUntil <= input.now)) {
    return denied("Exact WorkOrder verification receipt is stale or expired.", receiptContext);
  }
  if (!receipt.decisionInputDigest || receipt.decisionInputDigest !== result.decisionInputDigest) {
    return denied("Exact WorkOrder verification receipt is not bound to the canonical decision input.", receiptContext);
  }
  if (!receipt.evidenceEnvelopeIds) {
    return denied("Exact WorkOrder verification receipt lacks an immutable evidence-set binding.", receiptContext);
  }
  const evidenceEnvelopeIds = [...new Set(receipt.evidenceEnvelopeIds)].sort();
  if (evidenceEnvelopeIds.length !== receipt.evidenceEnvelopeIds.length) {
    return denied("Exact WorkOrder verification receipt contains duplicate evidence identities.", receiptContext);
  }
  const evidenceById = new Map(input.verificationEvidence.map((evidence) => [evidence.id, evidence]));
  for (const evidenceId of evidenceEnvelopeIds) {
    const evidence = evidenceById.get(evidenceId);
    if (!evidence
      || evidence.workflowRunId !== verificationAttempt.id
      || evidence.verificationRunId !== result.id
      || evidence.verificationAttemptId !== verificationAttempt.id
      || evidence.verificationSubjectId !== subject.subjectId
      || evidence.verificationPlanId !== result.verificationPlanId
      || evidence.verificationPlanDigest !== result.verificationPlanDigest
      || !tupleMatches(evidence, exactIdentity)) {
      return denied(`Evidence ${evidenceId} is missing or not bound to the exact verification lineage.`, receiptContext);
    }
  }
  const evidenceSetDigest = qualityGateEvidenceSetDigest({
    verificationRunId: result.id,
    verificationReceiptId: receipt.id,
    evidenceEnvelopeIds,
  });
  const evidenceContext = { ...receiptContext, evidenceSetDigest };

  if (subject.kind === "GIT_CANDIDATE" && subject.provider !== "GITHUB") {
    return denied("Verified local candidate has no trusted current publication projection and is not acceptance-eligible.", {
      ...evidenceContext,
      verifiedOutcome,
      verificationRecordedAt: receipt.recordedAt,
    });
  }

  if (subject.kind === "GIT_CANDIDATE" && subject.provider === "GITHUB" && purpose === "ACCEPTANCE") {
    const binding = source.subjectPublicationBinding;
    if (subject.version === 2 && (!binding || !verifyGitSubjectPublicationBinding(subject, binding)
      || binding.verificationReceiptId !== receipt.id || receipt.humanReviewValid !== true)) {
      return denied("Verified candidate lacks an exact human-authorized publication binding.", evidenceContext);
    }
    const pullRequest = subject.version === 1 ? subject.pullRequest : binding!.pullRequest;
    const providerHead = [...(input.providerHeads ?? [])]
      .filter((candidate) => candidate.provider === subject.provider
        && candidate.repositoryId === subject.repositoryId
        && candidate.sourceAttemptId === source.id
        && candidate.providerRepositoryId === subject.providerRepositoryId
        && candidate.providerPullRequestId === pullRequest.providerPullRequestId)
      .sort((left, right) => right.syncedAt - left.syncedAt)[0];
    if (!providerHead) return denied("No trusted GitHub App projection exists for the exact pull request.", evidenceContext);
    if (!providerHead.installationId || providerHead.state !== "OPEN"
      || providerHead.pullRequestNumber !== pullRequest.number
      || providerHead.pullRequestUrl !== pullRequest.url || providerHead.headSha !== subject.candidateSha
      || !providerHead.expiresAt || providerHead.expiresAt <= input.now) {
      return denied("GitHub pull-request identity or head is stale for the verified subject.", evidenceContext);
    }
  }

  if (verifiedOutcome === "FAILURE") {
    return denied(`Exact current Verification Result is ${result.verdict}.`, {
      ...evidenceContext,
      verifiedOutcome,
      verificationRecordedAt: receipt.recordedAt,
    });
  }

  return {
    eligible: true,
    current: true,
    verifiedOutcome,
    verificationRecordedAt: receipt.recordedAt,
    ...evidenceContext,
    reasons: [purpose === "PREPUBLICATION"
      ? "Exact independent pre-publication evidence is current; separate human approval and a publication permit remain required."
      : "Exact current Verification Result is completed, verified, independent, Quality-Contract-bound, evidence-bound, plan-bound, and provider-current."],
  };
}

function denied(reason: string, context: Partial<CurrentVerificationEligibility> = {}): CurrentVerificationEligibility {
  return { eligible: false, current: false, ...context, reasons: [reason] };
}
