export type ReceiptStatus = "PENDING" | "PASSED" | "FAILED" | "WAIVED" | "STALE" | string;

export interface OperatorReceipt {
  acceptanceCriterionId: string;
  status: ReceiptStatus;
  result?: string;
  evidenceLocation?: string;
  artifactReference?: string;
  verifier?: string;
  recordedAt?: number;
  _creationTime?: number;
  invalidatedAt?: number;
}
export interface OperatorAcceptanceCriterion {
  id: string;
  title: string;
  description?: string;
  verificationMethod?: string;
  status?: string;
}

export interface OperatorWorkOrder {
  _id: string;
  title: string;
  desiredOutcome: string;
  context?: string;
  workflowId?: string;
  repository?: string;
  branchStrategy?: string;
  riskLevel: string;
  state: string;
  assignedAgent?: string;
  requestedBy?: string;
  constraints?: string[];
  dependencies?: string[];
  requiredApprovals?: string[];
  acceptanceCriteria: OperatorAcceptanceCriterion[];
  sourceOfTruthRefs?: Array<{ kind: string; label: string; location: string }>;
  metadata?: Record<string, unknown>;
}

export interface OperatorApproval {
  _id: string;
  approvalType: string;
  requestedAction: string;
  riskLevel: string;
  status: string;
  requestedBy?: string;
  approver?: string;
  conditions?: string[];
  reason?: string;
  expiresAt?: number;
  createdAt?: number;
  metadata?: Record<string, unknown>;
  workOrder: OperatorWorkOrder | null;
  latestRun?: {
    runId?: string;
    status?: string;
    workflowId?: string;
    executionPhase?: string;
    checkpointSummary?: string;
    factoryContinuationStatus?: string;
    factoryApprovalDecisionId?: string;
    candidateRevision?: string;
  } | null;
  verificationReceipts?: OperatorReceipt[];
  remainingUncertainty?: string[];
}

export interface DecisionEvidenceItem {
  criterionId: string;
  title: string;
  method: string;
  status: ReceiptStatus | "MISSING";
  result?: string;
  location?: string;
  verifier?: string;
}

export interface OperatorDecisionPacket {
  approvalId: string;
  workOrderId: string | null;
  title: string;
  attentionReason: string;
  requestedDecision: string;
  scope: string[];
  authority: string;
  policy: string[];
  evidence: DecisionEvidenceItem[];
  missingInformation: string[];
  dispatchPreview: string;
  proofRequirements: string[];
  canDecide: boolean;
  blockingReasons: string[];
  riskLevel: string;
  expiresAt?: number;
}

const RISK_SCORE: Record<string, number> = {
  CRITICAL: 4,
  RED: 4,
  HIGH: 3,
  YELLOW: 2,
  MEDIUM: 2,
  LOW: 1,
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function metadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function latestReceiptByCriterion(receipts: OperatorReceipt[]): Map<string, OperatorReceipt> {
  const latest = new Map<string, OperatorReceipt>();
  [...receipts]
    .sort((a, b) => (b.recordedAt ?? b._creationTime ?? 0) - (a.recordedAt ?? a._creationTime ?? 0))
    .forEach((receipt) => {
      if (!latest.has(receipt.acceptanceCriterionId)) latest.set(receipt.acceptanceCriterionId, receipt);
    });
  return latest;
}

function attentionReason(approval: OperatorApproval, now: number): string {
  const minutesRemaining = approval.expiresAt ? Math.floor((approval.expiresAt - now) / 60_000) : null;
  if (minutesRemaining !== null && minutesRemaining <= 0) return "Decision expired; refresh governance before acting.";
  if (minutesRemaining !== null && minutesRemaining <= 30) return `Governed decision expires in ${minutesRemaining} minutes.`;
  if (["CRITICAL", "RED"].includes(approval.riskLevel)) return "Critical-risk action requires an explicit operator decision.";
  if ((approval.remainingUncertainty ?? []).length > 0) return "Decision has unresolved evidence or governance uncertainty.";
  return "Execution is paused at a governed decision gate.";
}

export function buildOperatorDecisionPacket(
  approval: OperatorApproval,
  now = Date.now()
): OperatorDecisionPacket {
  const workOrder = approval.workOrder;
  const receipts = approval.verificationReceipts ?? [];
  const latestReceipts = latestReceiptByCriterion(receipts);
  const evidence: DecisionEvidenceItem[] = (workOrder?.acceptanceCriteria ?? []).map((criterion) => {
    const receipt = latestReceipts.get(criterion.id);
    const invalidated = Boolean(receipt?.invalidatedAt);
    return {
      criterionId: criterion.id,
      title: criterion.title,
      method: criterion.verificationMethod ?? "MANUAL",
      status: invalidated ? "STALE" : receipt?.status ?? "MISSING",
      result: receipt?.result,
      location: receipt?.evidenceLocation ?? receipt?.artifactReference,
      verifier: receipt?.verifier,
    };
  });

  const metadata = approval.metadata ?? {};
  const workOrderMetadata = workOrder?.metadata ?? {};
  const missingInformation = new Set<string>();
  const blockingReasons: string[] = [];

  if (!workOrder) {
    missingInformation.add("Linked WorkOrder is unavailable.");
    blockingReasons.push("The linked WorkOrder must be available before a decision can be recorded.");
  }
  if (!approval.requestedAction.trim()) {
    missingInformation.add("Requested action is not defined.");
    blockingReasons.push("Requested action is required.");
  }
  if (workOrder && !workOrder.desiredOutcome.trim()) {
    missingInformation.add("Desired outcome is not defined.");
    blockingReasons.push("Desired outcome is required.");
  }
  if (approval.expiresAt && approval.expiresAt <= now) {
    blockingReasons.push("This decision has expired.");
  }

  const remainingUncertainty = approval.remainingUncertainty ?? [];
  remainingUncertainty.forEach((item) => missingInformation.add(item));

  const isAcceptanceDecision = /^(?:FINAL[_ -])?(?:ACCEPTANCE|RELEASE|COMPLETION|CLOSURE)$/i.test(approval.approvalType.trim())
    || /^(?:accept|release|complete|close)\b/i.test(approval.requestedAction.trim());
  if (isAcceptanceDecision) {
    evidence
      .filter((item) => !["PASSED", "WAIVED"].includes(item.status))
      .forEach((item) => missingInformation.add(`${item.title}: ${item.status.toLowerCase()} proof`));
    if (evidence.some((item) => !["PASSED", "WAIVED"].includes(item.status))) {
      blockingReasons.push("Acceptance requires current passing or explicitly waived proof for every criterion.");
    }
  }

  const scope = [
    workOrder?.repository ? `Repository: ${workOrder.repository}` : "Repository: unknown",
    workOrder?.branchStrategy ? `Branch: ${workOrder.branchStrategy}` : "Branch strategy: unknown",
    workOrder?.workflowId ? `Workflow: ${workOrder.workflowId}` : "Workflow: not selected",
    workOrder?.assignedAgent ? `Assigned agent: ${workOrder.assignedAgent}` : "Assigned agent: unassigned",
    ...((workOrder?.constraints ?? []).map((constraint) => `Constraint: ${constraint}`)),
  ];

  const policy = [
    metadataString(metadata, "policyRef") ?? metadataString(workOrderMetadata, "policyRef") ?? "WorkOrder governance policy",
    ...(workOrder?.requiredApprovals ?? []).map((item) => `Required approval: ${item}`),
  ];

  const authority =
    metadataString(metadata, "authorityBoundary") ??
    metadataString(workOrderMetadata, "authorityBoundary") ??
    (["CRITICAL", "RED", "HIGH"].includes(approval.riskLevel)
      ? "Protected action. The operator may decide only within the displayed scope and conditions."
      : "Operator decision permitted within the displayed WorkOrder scope.");

  const explicitDispatchPreview = metadataString(metadata, "dispatchPreview");
  const dispatchPreview = explicitDispatchPreview ?? (workOrder?.workflowId
    ? `Approval records authorization only. Dispatch remains explicit and will start ${workOrder.workflowId} for this WorkOrder.`
    : "Approval records authorization only. Dispatch remains blocked until a workflow is selected.");

  const proofRequirements = [
    ...(workOrder?.acceptanceCriteria ?? []).map((criterion) => `${criterion.title} (${criterion.verificationMethod ?? "MANUAL"})`),
    ...stringArray(metadata.proofRequirements),
  ];

  return {
    approvalId: approval._id,
    workOrderId: workOrder?._id ?? null,
    title: workOrder?.title ?? "Unavailable WorkOrder",
    attentionReason: attentionReason(approval, now),
    requestedDecision: approval.requestedAction || "Unknown decision",
    scope,
    authority,
    policy,
    evidence,
    missingInformation: [...missingInformation],
    dispatchPreview,
    proofRequirements,
    canDecide: approval.status === "PENDING" && blockingReasons.length === 0,
    blockingReasons,
    riskLevel: approval.riskLevel,
    expiresAt: approval.expiresAt,
  };
}

export function sortOperatorApprovals<T extends OperatorApproval>(approvals: T[], now = Date.now()): T[] {
  return [...approvals].sort((a, b) => {
    const aExpired = a.expiresAt !== undefined && a.expiresAt <= now ? 1 : 0;
    const bExpired = b.expiresAt !== undefined && b.expiresAt <= now ? 1 : 0;
    if (aExpired !== bExpired) return aExpired - bExpired;
    const riskDelta = (RISK_SCORE[b.riskLevel] ?? 0) - (RISK_SCORE[a.riskLevel] ?? 0);
    if (riskDelta !== 0) return riskDelta;
    const aExpiry = a.expiresAt ?? Number.MAX_SAFE_INTEGER;
    const bExpiry = b.expiresAt ?? Number.MAX_SAFE_INTEGER;
    if (aExpiry !== bExpiry) return aExpiry - bExpiry;
    return (b.createdAt ?? 0) - (a.createdAt ?? 0);
  });
}
