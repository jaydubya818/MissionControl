export type WorkOrderCriterionStatus = "PENDING" | "PASS" | "FAIL" | "WAIVED" | "STALE";

export type WorkOrderVerificationStatus = "PENDING" | "PASS" | "FAIL" | "WAIVED" | "STALE";

export type WorkOrderApprovalStatus =
  | "NOT_REQUIRED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CONDITIONAL"
  | "REVISION_REQUESTED";

export type ApprovalDecisionStatus =
  | "PENDING"
  | "APPROVED"
  | "CONDITIONAL"
  | "REJECTED"
  | "REVISION_REQUESTED"
  | "EXPIRED"
  | "SUPERSEDED";

export type VerificationReceiptStatus = "PENDING" | "PASSED" | "FAILED" | "WAIVED" | "STALE";

export type WorkOrderRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ApprovalDecisionLike {
  approvalType: string;
  status: ApprovalDecisionStatus;
  requestedAction?: string;
  _creationTime?: number;
  createdAt?: number;
}

export interface VerificationReceiptLike {
  acceptanceCriterionId: string;
  status: VerificationReceiptStatus;
  waiverApprovalDecisionId?: string;
  _creationTime?: number;
  recordedAt?: number;
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

export function approvalStatusSatisfiesRequirement(status: WorkOrderApprovalStatus | ApprovalDecisionStatus) {
  return status === "APPROVED" || status === "CONDITIONAL";
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

export function receiptStatusToCriterionStatus(status: VerificationReceiptStatus): WorkOrderCriterionStatus {
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
    if (!latest.has(receipt.acceptanceCriterionId)) latest.set(receipt.acceptanceCriterionId, receipt);
  }
  return latest;
}

export function deriveApprovalStatus(args: {
  riskLevel: WorkOrderRiskLevel;
  requiredApprovals?: string[];
  approvals: ApprovalDecisionLike[];
}): WorkOrderApprovalStatus {
  const requiredTypes = requiredApprovalTypes(args);
  if (requiredTypes.length === 0) return "NOT_REQUIRED";

  const latest = latestApprovalByType(args.approvals);
  let sawConditional = false;

  for (const approvalType of requiredTypes) {
    const record = latest.get(approvalType);
    if (!record) return "PENDING";
    if (record.status === "REJECTED") return "REJECTED";
    if (record.status === "REVISION_REQUESTED") return "REVISION_REQUESTED";
    if (record.status === "CONDITIONAL") {
      sawConditional = true;
      continue;
    }
    if (record.status !== "APPROVED") return "PENDING";
  }

  return sawConditional ? "CONDITIONAL" : "APPROVED";
}

export function evaluateAcceptance(args: {
  riskLevel: WorkOrderRiskLevel;
  requiredApprovals?: string[];
  approvalDecisions: ApprovalDecisionLike[];
  acceptanceCriteria: Array<{ id: string; title: string; status: WorkOrderCriterionStatus }>;
  verificationReceipts: VerificationReceiptLike[];
}) {
  const latestApprovals = latestApprovalByType(args.approvalDecisions);
  const latestReceipts = latestReceiptByCriterion(args.verificationReceipts);
  const requiredTypes = requiredApprovalTypes(args);
  const approvalStatus = deriveApprovalStatus({
    riskLevel: args.riskLevel,
    requiredApprovals: args.requiredApprovals,
    approvals: args.approvalDecisions,
  });

  const missingApprovalTypes = requiredTypes.filter((type) => !approvalStatusSatisfiesRequirement(latestApprovals.get(type)?.status ?? "PENDING"));
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
    if (receipt.status === "FAILED") failedCriteriaIds.push(criterion.id);
    if (receipt.status === "STALE") staleCriteriaIds.push(criterion.id);
    if (receipt.status === "WAIVED") {
      waivedCriteriaIds.push(criterion.id);
      if (!receipt.waiverApprovalDecisionId) waiverWithoutApprovalCriteriaIds.push(criterion.id);
    }
    if (receipt.status === "PENDING") missingCriteriaIds.push(criterion.id);
  }

  const blockingReasons: string[] = [];
  if (missingApprovalTypes.length > 0) blockingReasons.push(`Missing approvals: ${missingApprovalTypes.join(", ")}`);
  if (failedCriteriaIds.length > 0) blockingReasons.push(`Failed criteria: ${failedCriteriaIds.join(", ")}`);
  if (staleCriteriaIds.length > 0) blockingReasons.push(`Stale criteria: ${staleCriteriaIds.join(", ")}`);
  if (missingCriteriaIds.length > 0) blockingReasons.push(`Missing receipts: ${missingCriteriaIds.join(", ")}`);
  if (waiverWithoutApprovalCriteriaIds.length > 0) blockingReasons.push(`Waiver approval missing: ${waiverWithoutApprovalCriteriaIds.join(", ")}`);

  return {
    approvalStatus,
    missingApprovalTypes,
    missingCriteriaIds,
    failedCriteriaIds,
    staleCriteriaIds,
    waivedCriteriaIds,
    waiverWithoutApprovalCriteriaIds,
    blockingReasons,
    eligible: blockingReasons.length === 0,
  };
}
