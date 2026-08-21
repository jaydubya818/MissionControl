export type WorkOrderCriterionStatus = "PENDING" | "PASS" | "FAIL" | "WAIVED" | "STALE";

export type WorkOrderVerificationStatus = "PENDING" | "PASS" | "FAIL" | "WAIVED" | "STALE";

export type WorkOrderApprovalStatus =
  | "NOT_REQUIRED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CONDITIONAL"
  | "REVISION_REQUESTED"
  | "EXPIRED"
  | "REVOKED";

export type ApprovalDecisionStatus =
  | "PENDING"
  | "APPROVED"
  | "CONDITIONAL"
  | "REJECTED"
  | "REVISION_REQUESTED"
  | "EXPIRED"
  | "SUPERSEDED"
  | "REVOKED";

export type VerificationReceiptStatus = "PENDING" | "PASSED" | "FAILED" | "WAIVED" | "STALE";

export type WorkOrderRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ApprovalDecisionLike {
  approvalType: string;
  status: ApprovalDecisionStatus;
  requestedAction?: string;
  _creationTime?: number;
  createdAt?: number;
  expiresAt?: number;
}

export interface VerificationReceiptLike {
  receiptScope?: "ACCEPTANCE_CRITERION" | "WORK_ORDER";
  acceptanceCriterionId?: string;
  status: VerificationReceiptStatus;
  verdict?: "VERIFIED" | "NOT_VERIFIED" | "BLOCKED" | "REQUIRES_HUMAN_REVIEW";
  waiverApprovalDecisionId?: string;
  _creationTime?: number;
  recordedAt?: number;
  validUntil?: number;
}

function timestampOf(row: { _creationTime?: number; createdAt?: number; recordedAt?: number }) {
  return row.recordedAt ?? row.createdAt ?? row._creationTime ?? 0;
}

export function requiredApprovalTypes(args: {
  riskLevel: WorkOrderRiskLevel;
  requiredApprovals?: string[];
}) {
  const explicit = [...new Set((args.requiredApprovals ?? []).filter(Boolean))];
  if (explicit.length > 0) return explicit;
  return ["HIGH", "CRITICAL"].includes(args.riskLevel) ? ["RISK_REVIEW"] : [];
}

export function isApprovalExpired(approval: Pick<ApprovalDecisionLike, "status" | "expiresAt"> | undefined, now = Date.now()) {
  if (!approval) return false;
  if (approval.status === "EXPIRED") return true;
  return (approval.status === "APPROVED" || approval.status === "CONDITIONAL") && !!approval.expiresAt && approval.expiresAt <= now;
}

export function approvalStatusSatisfiesRequirement(status: WorkOrderApprovalStatus | ApprovalDecisionStatus) {
  return status === "APPROVED" || status === "CONDITIONAL";
}

export function isApprovalUsable(approval: ApprovalDecisionLike | undefined, now = Date.now()) {
  if (!approval) return false;
  if (!approvalStatusSatisfiesRequirement(approval.status)) return false;
  return !isApprovalExpired(approval, now);
}

export function deriveVerificationStatus(
  criteria: Array<{ status: WorkOrderCriterionStatus }>
): WorkOrderVerificationStatus {
  if (criteria.length === 0) return "PENDING";
  if (criteria.some((criterion) => criterion.status === "FAIL")) return "FAIL";
  if (criteria.some((criterion) => criterion.status === "STALE")) return "STALE";
  if (criteria.every((criterion) => criterion.status === "WAIVED")) return "WAIVED";
  if (criteria.every((criterion) => criterion.status === "PASS" || criterion.status === "WAIVED")) return "PASS";
  return "PENDING";
}

export function receiptStatusToCriterionStatus(status: VerificationReceiptStatus, validUntil?: number, now = Date.now()): WorkOrderCriterionStatus {
  if (validUntil && validUntil <= now && (status === "PASSED" || status === "WAIVED")) return "STALE";
  switch (status) {
    case "PASSED":
      return "PASS";
    case "FAILED":
      return "FAIL";
    case "WAIVED":
      return "WAIVED";
    case "STALE":
      return "STALE";
    default:
      return "PENDING";
  }
}

export function latestApprovalByType<T extends ApprovalDecisionLike>(approvals: T[]) {
  const latest = new Map<string, T>();
  for (const approval of [...approvals].sort((a, b) => timestampOf(b) - timestampOf(a))) {
    if (!latest.has(approval.approvalType)) latest.set(approval.approvalType, approval);
  }
  return latest;
}

export function latestReceiptByCriterion<T extends VerificationReceiptLike>(receipts: T[]) {
  const latest = new Map<string, T>();
  for (const receipt of [...receipts].sort((a, b) => timestampOf(b) - timestampOf(a))) {
    if (receipt.receiptScope === "WORK_ORDER" || !receipt.acceptanceCriterionId) continue;
    if (!latest.has(receipt.acceptanceCriterionId)) latest.set(receipt.acceptanceCriterionId, receipt);
  }
  return latest;
}

export function latestWorkOrderReceipt<T extends VerificationReceiptLike>(receipts: T[]) {
  return [...receipts]
    .sort((a, b) => timestampOf(b) - timestampOf(a))
    .find((receipt) => receipt.receiptScope === "WORK_ORDER");
}

export function deriveApprovalStatus(args: {
  riskLevel: WorkOrderRiskLevel;
  requiredApprovals?: string[];
  approvals: ApprovalDecisionLike[];
  now?: number;
}): WorkOrderApprovalStatus {
  const requiredTypes = requiredApprovalTypes(args);
  if (requiredTypes.length === 0) return "NOT_REQUIRED";

  const latest = latestApprovalByType(args.approvals);
  let sawConditional = false;
  let sawExpired = false;
  let sawRevoked = false;

  for (const approvalType of requiredTypes) {
    const record = latest.get(approvalType);
    if (!record) return "PENDING";
    if (record.status === "REJECTED") return "REJECTED";
    if (record.status === "REVISION_REQUESTED") return "REVISION_REQUESTED";
    if (record.status === "REVOKED") {
      sawRevoked = true;
      continue;
    }
    if (isApprovalExpired(record, args.now)) {
      sawExpired = true;
      continue;
    }
    if (record.status === "CONDITIONAL") {
      sawConditional = true;
      continue;
    }
    if (record.status !== "APPROVED") return "PENDING";
  }

  if (sawRevoked) return "REVOKED";
  if (sawExpired) return "EXPIRED";
  return sawConditional ? "CONDITIONAL" : "APPROVED";
}

export function evaluateAcceptance(args: {
  riskLevel: WorkOrderRiskLevel;
  requiredApprovals?: string[];
  approvalDecisions: ApprovalDecisionLike[];
  acceptanceCriteria: Array<{ id: string; title: string; status: WorkOrderCriterionStatus }>;
  verificationReceipts: VerificationReceiptLike[];
  now?: number;
}) {
  const latestApprovals = latestApprovalByType(args.approvalDecisions);
  const latestReceipts = latestReceiptByCriterion(args.verificationReceipts);
  const workOrderReceipt = latestWorkOrderReceipt(args.verificationReceipts);
  const requiredTypes = requiredApprovalTypes(args);
  const approvalStatus = deriveApprovalStatus({
    riskLevel: args.riskLevel,
    requiredApprovals: args.requiredApprovals,
    approvals: args.approvalDecisions,
    now: args.now,
  });

  const missingApprovalTypes = requiredTypes.filter((type) => !isApprovalUsable(latestApprovals.get(type), args.now));
  const expiredApprovalTypes = requiredTypes.filter((type) => isApprovalExpired(latestApprovals.get(type), args.now));
  const revokedApprovalTypes = requiredTypes.filter((type) => latestApprovals.get(type)?.status === "REVOKED");

  const missingCriteriaIds: string[] = [];
  const failedCriteriaIds: string[] = [];
  const staleCriteriaIds: string[] = [];
  const waivedCriteriaIds: string[] = [];
  const waiverWithoutApprovalCriteriaIds: string[] = [];

  for (const criterion of args.acceptanceCriteria) {
    const receipt = latestReceipts.get(criterion.id);
    if (!receipt) {
      missingCriteriaIds.push(criterion.id);
      continue;
    }
    const criterionStatus = receiptStatusToCriterionStatus(receipt.status, receipt.validUntil, args.now);
    if (criterionStatus === "FAIL") failedCriteriaIds.push(criterion.id);
    if (criterionStatus === "STALE") staleCriteriaIds.push(criterion.id);
    if (criterionStatus === "WAIVED") {
      waivedCriteriaIds.push(criterion.id);
      if (!receipt.waiverApprovalDecisionId) waiverWithoutApprovalCriteriaIds.push(criterion.id);
    }
    if (criterionStatus === "PENDING") missingCriteriaIds.push(criterion.id);
  }

  const blockingReasons: string[] = [];
  // A WorkOrder with no acceptance criteria has no evidence expectation at
  // all, so every criterion loop below is a no-op and nothing else supplies a
  // floor. Acceptance must not be reachable without something to verify.
  if (args.acceptanceCriteria.length === 0) {
    blockingReasons.push("No acceptance criteria are defined for this Work Order");
  }
  if (missingApprovalTypes.length > 0) blockingReasons.push(`Missing approvals: ${missingApprovalTypes.join(", ")}`);
  if (expiredApprovalTypes.length > 0) blockingReasons.push(`Expired approvals: ${expiredApprovalTypes.join(", ")}`);
  if (revokedApprovalTypes.length > 0) blockingReasons.push(`Revoked approvals: ${revokedApprovalTypes.join(", ")}`);
  if (failedCriteriaIds.length > 0) blockingReasons.push(`Failed criteria: ${failedCriteriaIds.join(", ")}`);
  if (staleCriteriaIds.length > 0) blockingReasons.push(`Stale criteria: ${staleCriteriaIds.join(", ")}`);
  if (missingCriteriaIds.length > 0) blockingReasons.push(`Missing receipts: ${missingCriteriaIds.join(", ")}`);
  if (waiverWithoutApprovalCriteriaIds.length > 0) blockingReasons.push(`Waiver approval missing: ${waiverWithoutApprovalCriteriaIds.join(", ")}`);
  if (workOrderReceipt && workOrderReceipt.verdict !== "VERIFIED") {
    blockingReasons.push(`Work Order verification verdict: ${workOrderReceipt.verdict ?? "NOT_VERIFIED"}`);
  }

  return {
    approvalStatus,
    missingApprovalTypes,
    expiredApprovalTypes,
    revokedApprovalTypes,
    missingCriteriaIds,
    failedCriteriaIds,
    staleCriteriaIds,
    waivedCriteriaIds,
    waiverWithoutApprovalCriteriaIds,
    verificationVerdict: workOrderReceipt?.verdict,
    blockingReasons,
    eligible: blockingReasons.length === 0,
  };
}
