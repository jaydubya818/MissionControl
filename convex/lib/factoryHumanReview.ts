export type FactoryHumanReviewDecision =
  | "APPROVE"
  | "APPROVE_WITH_CONDITIONS"
  | "REJECT"
  | "REQUEST_REVISION";

export type FactoryHumanReviewOutcome = "RESUME_PUBLISH" | "FAIL_ATTEMPT";

export const PUBLICATION_SAFETY_WINDOW_MS = 60_000;

export function factoryHumanReviewOutcome(decision: FactoryHumanReviewDecision): FactoryHumanReviewOutcome {
  if (decision === "APPROVE") return "RESUME_PUBLISH";
  return "FAIL_ATTEMPT";
}

export function isFactoryHumanReviewCheckpoint(approvalDecision: {
  _id: string;
  approvalType: string;
}, run?: {
  status?: string;
  factoryContinuation?: { approvalDecisionId?: string; status: string };
} | null) {
  return Boolean(
    approvalDecision.approvalType === "HUMAN_REVIEW"
    && !["COMPLETED", "FAILED", "CANCELED"].includes(run?.status ?? "")
    && run?.factoryContinuation?.approvalDecisionId === approvalDecision._id
    && ["AWAITING_HUMAN_REVIEW", "READY_TO_PUBLISH"].includes(run.factoryContinuation.status),
  );
}

export function isSourceVerificationFreshForPublication(input: {
  validUntil?: number;
  now?: number;
  safetyWindowMs?: number;
}) {
  const now = input.now ?? Date.now();
  const safetyWindowMs = input.safetyWindowMs ?? PUBLICATION_SAFETY_WINDOW_MS;
  return typeof input.validUntil === "number" && input.validUntil > now + safetyWindowMs;
}

export function validateHumanReviewApprovalContext(input: {
  approval: {
    _id: string;
    approvalType: string;
    workflowRunId?: string;
    workOrderRevisionNumber?: number;
    status: string;
    expiresAt?: number;
  };
  run: {
    _id: string;
    status: string;
    workOrderRevisionNumber?: number;
    factoryContinuation?: {
      status: string;
      workOrderRevisionNumber: number;
      approvalDecisionId?: string;
    };
  };
  workOrderRevisionNumber: number;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  if (input.approval.approvalType !== "HUMAN_REVIEW") return { ok: false as const, reason: "not-human-review" };
  if (input.approval.status !== "PENDING") return { ok: false as const, reason: "approval-not-pending" };
  if (input.approval.expiresAt && input.approval.expiresAt <= now) return { ok: false as const, reason: "approval-expired" };
  if (input.approval.workflowRunId !== input.run._id) return { ok: false as const, reason: "attempt-mismatch" };
  if (input.run.status !== "PAUSED") return { ok: false as const, reason: "attempt-not-paused" };
  if (input.run.factoryContinuation?.status !== "AWAITING_HUMAN_REVIEW") {
    return { ok: false as const, reason: "review-checkpoint-missing" };
  }
  if (input.run.factoryContinuation.approvalDecisionId !== input.approval._id) {
    return { ok: false as const, reason: "approval-mismatch" };
  }
  const revision = input.run.workOrderRevisionNumber ?? input.run.factoryContinuation.workOrderRevisionNumber;
  if (revision !== input.workOrderRevisionNumber || input.approval.workOrderRevisionNumber !== input.workOrderRevisionNumber) {
    return { ok: false as const, reason: "work-order-revision-mismatch" };
  }
  return { ok: true as const };
}

export function validatePublishContinuation(input: {
  run: {
    _id: string;
    status: string;
    workOrderRevisionNumber?: number;
    factoryContinuation?: {
      status: string;
      workOrderRevisionNumber: number;
      verificationReceiptId: string;
      resolvedVerificationReceiptId?: string;
      approvalDecisionId?: string;
      candidateRevision: string;
    };
  };
  workOrderRevisionNumber: number;
  approval?: {
    _id: string;
    approvalType: string;
    workflowRunId?: string;
    workOrderRevisionNumber?: number;
    status: string;
    expiresAt?: number;
  } | null;
  sourceReceipt?: {
    _id: string;
    workflowRunId: string;
    workOrderRevisionNumber?: number;
    status: string;
    verdict?: string;
    candidateRevision?: string;
  } | null;
  resolvedReceipt?: {
    _id: string;
    workflowRunId: string;
    workOrderRevisionNumber?: number;
    status: string;
    verdict?: string;
    candidateRevision?: string;
    validUntil?: number;
    metadata?: Record<string, unknown>;
  } | null;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const continuation = input.run.factoryContinuation;
  if (!continuation || continuation.status !== "READY_TO_PUBLISH") return { ok: false as const, reason: "publish-checkpoint-missing" };
  if (!["PENDING", "RUNNING"].includes(input.run.status)) return { ok: false as const, reason: "attempt-not-publishable" };
  if (input.run.workOrderRevisionNumber !== input.workOrderRevisionNumber
    || continuation.workOrderRevisionNumber !== input.workOrderRevisionNumber) {
    return { ok: false as const, reason: "work-order-revision-mismatch" };
  }
  const approval = input.approval;
  if (!approval || approval._id !== continuation.approvalDecisionId
    || approval.approvalType !== "HUMAN_REVIEW" || approval.status !== "APPROVED"
    || approval.workflowRunId !== input.run._id
    || approval.workOrderRevisionNumber !== input.workOrderRevisionNumber) {
    return { ok: false as const, reason: "approval-invalid" };
  }
  if (approval.expiresAt && approval.expiresAt <= now) return { ok: false as const, reason: "approval-expired" };
  const source = input.sourceReceipt;
  if (!source || source._id !== continuation.verificationReceiptId
    || source.workflowRunId !== input.run._id
    || source.workOrderRevisionNumber !== input.workOrderRevisionNumber
    || source.status !== "PENDING" || source.verdict !== "REQUIRES_HUMAN_REVIEW"
    || source.candidateRevision !== continuation.candidateRevision) {
    return { ok: false as const, reason: "source-receipt-invalid" };
  }
  const resolved = input.resolvedReceipt;
  if (!resolved || resolved._id !== continuation.resolvedVerificationReceiptId
    || resolved.workflowRunId !== input.run._id
    || resolved.workOrderRevisionNumber !== input.workOrderRevisionNumber
    || resolved.status !== "PASSED" || resolved.verdict !== "VERIFIED"
    || resolved.candidateRevision !== continuation.candidateRevision
    || resolved.metadata?.humanReviewApprovalDecisionId !== approval._id
    || resolved.metadata?.supersedesVerificationReceiptId !== source._id) {
    return { ok: false as const, reason: "resolved-receipt-invalid" };
  }
  if (resolved.validUntil && resolved.validUntil <= now) return { ok: false as const, reason: "resolved-receipt-expired" };
  return { ok: true as const, candidateRevision: continuation.candidateRevision };
}

export function validatePublicationPermit(input: {
  run: {
    _id: string;
    status: string;
    factoryContinuation?: {
      status: string;
      candidateRevision: string;
      publicationPermitId?: string;
      publicationPermitLeaseId?: string;
      publicationValidUntil?: number;
    };
  };
  leaseId: string;
  candidateRevision: string;
  publicationPermitId?: string;
  requireUnexpired?: boolean;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const continuation = input.run.factoryContinuation;
  if (!continuation || !["PUBLICATION_AUTHORIZED", "PUBLISHED"].includes(continuation.status)) {
    return { ok: false as const, reason: "publication-permit-missing" };
  }
  if (continuation.candidateRevision !== input.candidateRevision) {
    return { ok: false as const, reason: "publication-candidate-mismatch" };
  }
  if (!continuation.publicationPermitId
    || continuation.publicationPermitId !== input.publicationPermitId
    || continuation.publicationPermitLeaseId !== input.leaseId) {
    return { ok: false as const, reason: "publication-permit-mismatch" };
  }
  if (!continuation.publicationValidUntil
    || (input.requireUnexpired !== false && continuation.publicationValidUntil <= now)) {
    return { ok: false as const, reason: "publication-permit-expired" };
  }
  return { ok: true as const, validUntil: continuation.publicationValidUntil };
}
