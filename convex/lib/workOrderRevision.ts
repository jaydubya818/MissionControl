export type WorkOrderRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type WorkOrderLifecycleState =
  | "DRAFT"
  | "READY"
  | "DISPATCHED"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "AWAITING_APPROVAL"
  | "AWAITING_VERIFICATION"
  | "REOPENED"
  | "DONE"
  | "CANCELED"
  | "SUPERSEDED";

export type RevisionMateriality = "NO_ACTION" | "REVERIFICATION" | "REAPPROVAL" | "BOTH" | "FULL_REOPEN";

export interface GovernancePolicyLike {
  approvalValidityHoursByRisk: Record<WorkOrderRiskLevel, number>;
  verificationValidityHours: number;
  approvalExpiringSoonHours: number;
  evidenceExpiringSoonHours: number;
  requireReapprovalAfterMaterialChange: boolean;
  requireReverificationAfterCodeChange: boolean;
  requireReverificationAfterWorkflowChange: boolean;
  requireReverificationAfterEnvironmentChange: boolean;
  fullReopenOnAcceptedWorkOrderChange: boolean;
}

export interface WorkOrderRevisionSnapshot {
  kind?: "SOFTWARE_CHANGE" | "VERIFICATION" | "AUTOMATION";
  title: string;
  desiredOutcome: string;
  context?: string;
  workflowId?: string;
  repository?: string;
  codeScopeIds?: string[];
  branchStrategy?: string;
  priority: 1 | 2 | 3 | 4;
  riskLevel: WorkOrderRiskLevel;
  requestedBy?: string;
  assignedAgent?: string;
  assignedSquad?: string;
  acceptanceCriteria: Array<{
    id: string;
    title: string;
    description?: string;
    requirementIds?: string[];
    givenWhenThen?: { given: string; when: string; then: string };
    requiredEvidence?: Array<{ category: string; minimumCount: number; independent: boolean }>;
    verificationMethod?: "MANUAL" | "COMMAND" | "TEST" | "CHECKLIST" | "BROWSER";
    status?: string;
  }>;
  requirements?: any[];
  constraints?: string[];
  positiveConstraints?: string[];
  negativeConstraints?: any[];
  dataBoundaries?: any[];
  changeBudget?: any;
  verificationContract?: any;
  verificationContractDigest?: string;
  autonomyLevel?: string;
  riskReasons?: string[];
  dependencies?: string[];
  sourceOfTruthRefs?: Array<{ kind: string; label: string; location: string }>;
  requiredApprovals?: string[];
  metadata?: any;
}

export interface WorkOrderRevisionImpact {
  changedFields: string[];
  materiality: RevisionMateriality;
  riskReassessment: "UNCHANGED" | "INCREASED" | "DECREASED";
  requiresReapproval: boolean;
  requiresReverification: boolean;
  requiresFullReopen: boolean;
  impactedAcceptanceCriteria: string[];
  impactedApprovalTypes: string[];
  invalidateAllReceipts: boolean;
}

export const DEFAULT_GOVERNANCE_POLICY: GovernancePolicyLike = {
  approvalValidityHoursByRisk: {
    LOW: 24 * 14,
    MEDIUM: 24 * 7,
    HIGH: 24 * 3,
    CRITICAL: 24,
  },
  verificationValidityHours: 24 * 7,
  approvalExpiringSoonHours: 24,
  evidenceExpiringSoonHours: 24,
  requireReapprovalAfterMaterialChange: true,
  requireReverificationAfterCodeChange: true,
  requireReverificationAfterWorkflowChange: true,
  requireReverificationAfterEnvironmentChange: true,
  fullReopenOnAcceptedWorkOrderChange: true,
};

function sortStrings(values?: string[]) {
  return [...new Set((values ?? []).filter(Boolean))].sort();
}

function stableJson(value: unknown) {
  return JSON.stringify(value, (_key, input) => {
    if (Array.isArray(input)) return input;
    if (input && typeof input === "object") {
      return Object.fromEntries(Object.entries(input as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return input;
  });
}

function normalizeCriteria(criteria: WorkOrderRevisionSnapshot["acceptanceCriteria"]) {
  return [...criteria]
    .map((criterion) => ({
      id: criterion.id,
      title: criterion.title,
      description: criterion.description,
      requirementIds: sortStrings(criterion.requirementIds),
      givenWhenThen: criterion.givenWhenThen,
      requiredEvidence: criterion.requiredEvidence,
      verificationMethod: criterion.verificationMethod,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function snapshotRevisionFields(workOrder: any): WorkOrderRevisionSnapshot {
  return {
    kind: workOrder.kind ?? "SOFTWARE_CHANGE",
    title: workOrder.title,
    desiredOutcome: workOrder.desiredOutcome,
    context: workOrder.context,
    workflowId: workOrder.workflowId,
    repository: workOrder.repository,
    codeScopeIds: sortStrings(workOrder.codeScopeIds?.map(String)),
    branchStrategy: workOrder.branchStrategy,
    priority: workOrder.priority,
    riskLevel: workOrder.riskLevel,
    requestedBy: workOrder.requestedBy,
    assignedAgent: workOrder.assignedAgent,
    assignedSquad: workOrder.assignedSquad,
    requirements: workOrder.requirements,
    acceptanceCriteria: normalizeCriteria(workOrder.acceptanceCriteria ?? []),
    constraints: sortStrings(workOrder.constraints),
    positiveConstraints: sortStrings(workOrder.positiveConstraints),
    negativeConstraints: workOrder.negativeConstraints,
    dataBoundaries: workOrder.dataBoundaries,
    changeBudget: workOrder.changeBudget,
    verificationContract: workOrder.verificationContract,
    verificationContractDigest: workOrder.verificationContractDigest,
    autonomyLevel: workOrder.autonomyLevel,
    riskReasons: sortStrings(workOrder.riskReasons),
    dependencies: sortStrings(workOrder.dependencies),
    sourceOfTruthRefs: [...(workOrder.sourceOfTruthRefs ?? [])].sort((a, b) => `${a.kind}:${a.location}`.localeCompare(`${b.kind}:${b.location}`)),
    requiredApprovals: sortStrings(workOrder.requiredApprovals),
    metadata: workOrder.metadata,
  };
}

export function buildRevisionSnapshot(args: {
  current: WorkOrderRevisionSnapshot;
  patch: Partial<WorkOrderRevisionSnapshot>;
}): WorkOrderRevisionSnapshot {
  return {
    ...args.current,
    ...args.patch,
    acceptanceCriteria: normalizeCriteria(args.patch.acceptanceCriteria ?? args.current.acceptanceCriteria),
    constraints: sortStrings(args.patch.constraints ?? args.current.constraints),
    positiveConstraints: sortStrings(args.patch.positiveConstraints ?? args.current.positiveConstraints),
    riskReasons: sortStrings(args.patch.riskReasons ?? args.current.riskReasons),
    dependencies: sortStrings(args.patch.dependencies ?? args.current.dependencies),
    requiredApprovals: sortStrings(args.patch.requiredApprovals ?? args.current.requiredApprovals),
    sourceOfTruthRefs: [...(args.patch.sourceOfTruthRefs ?? args.current.sourceOfTruthRefs ?? [])].sort((a, b) => `${a.kind}:${a.location}`.localeCompare(`${b.kind}:${b.location}`)),
    codeScopeIds: sortStrings(args.patch.codeScopeIds ?? args.current.codeScopeIds),
  };
}

export function changedFieldsBetween(current: WorkOrderRevisionSnapshot, next: WorkOrderRevisionSnapshot) {
  const fields: string[] = [];
  const trackedKeys: Array<keyof WorkOrderRevisionSnapshot> = [
    "title",
    "desiredOutcome",
    "context",
    "workflowId",
    "repository",
    "codeScopeIds",
    "branchStrategy",
    "priority",
    "riskLevel",
    "requestedBy",
    "assignedAgent",
    "assignedSquad",
    "requirements",
    "acceptanceCriteria",
    "constraints",
    "positiveConstraints",
    "negativeConstraints",
    "dataBoundaries",
    "changeBudget",
    "verificationContract",
    "autonomyLevel",
    "riskReasons",
    "dependencies",
    "sourceOfTruthRefs",
    "requiredApprovals",
    "metadata",
  ];
  for (const key of trackedKeys) {
    if (stableJson(current[key]) !== stableJson(next[key])) fields.push(key);
  }
  return fields;
}

function diffCriteria(current: WorkOrderRevisionSnapshot["acceptanceCriteria"], next: WorkOrderRevisionSnapshot["acceptanceCriteria"]) {
  const currentMap = new Map(current.map((criterion) => [criterion.id, criterion]));
  const nextMap = new Map(next.map((criterion) => [criterion.id, criterion]));
  const impacted = new Set<string>();

  for (const id of new Set([...currentMap.keys(), ...nextMap.keys()])) {
    if (stableJson(currentMap.get(id)) !== stableJson(nextMap.get(id))) impacted.add(id);
  }

  return [...impacted].sort();
}

export function evaluateRevisionImpact(args: {
  current: WorkOrderRevisionSnapshot;
  next: WorkOrderRevisionSnapshot;
  currentState: WorkOrderLifecycleState;
  policy?: Partial<GovernancePolicyLike>;
}) : WorkOrderRevisionImpact {
  const policy = { ...DEFAULT_GOVERNANCE_POLICY, ...(args.policy ?? {}) };
  const changedFields = changedFieldsBetween(args.current, args.next);
  const impactedAcceptanceCriteria = diffCriteria(args.current.acceptanceCriteria, args.next.acceptanceCriteria);
  const riskRank: Record<WorkOrderRiskLevel, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

  const riskReassessment = riskRank[args.next.riskLevel] > riskRank[args.current.riskLevel]
    ? "INCREASED"
    : riskRank[args.next.riskLevel] < riskRank[args.current.riskLevel]
      ? "DECREASED"
      : "UNCHANGED";

  const scopeChanged = changedFields.some((field) => ["title", "desiredOutcome", "context", "requirements", "constraints", "positiveConstraints", "negativeConstraints", "dataBoundaries", "changeBudget", "codeScopeIds", "dependencies"].includes(field));
  const codeOrRepoChanged = changedFields.some((field) => ["repository", "codeScopeIds", "branchStrategy"].includes(field));
  const workflowChanged = changedFields.includes("workflowId") || changedFields.includes("verificationContract");
  const approvalsChanged = changedFields.includes("requiredApprovals") || riskReassessment === "INCREASED";
  const environmentChanged = changedFields.includes("metadata") && stableJson(args.current.metadata?.environment) !== stableJson(args.next.metadata?.environment);
  const implementationPolicyChanged = changedFields.includes("metadata")
    && stableJson(args.current.metadata?.implementationPolicy) !== stableJson(args.next.metadata?.implementationPolicy);
  const criteriaChanged = impactedAcceptanceCriteria.length > 0;

  const requiresReverification = criteriaChanged
    || (codeOrRepoChanged && policy.requireReverificationAfterCodeChange)
    || (workflowChanged && policy.requireReverificationAfterWorkflowChange)
    || (environmentChanged && policy.requireReverificationAfterEnvironmentChange)
    || scopeChanged;

  const requiresReapproval = approvalsChanged
    || (policy.requireReapprovalAfterMaterialChange && (scopeChanged || workflowChanged || codeOrRepoChanged || implementationPolicyChanged));

  let materiality: RevisionMateriality = "NO_ACTION";
  if (requiresReapproval && requiresReverification) materiality = "BOTH";
  else if (requiresReapproval) materiality = "REAPPROVAL";
  else if (requiresReverification) materiality = "REVERIFICATION";

  const requiresFullReopen = policy.fullReopenOnAcceptedWorkOrderChange
    && args.currentState === "DONE"
    && materiality !== "NO_ACTION";

  if (requiresFullReopen) materiality = "FULL_REOPEN";

  const impactedApprovalTypes = requiresReapproval
    ? sortStrings(
        args.next.requiredApprovals?.length
          ? args.next.requiredApprovals
          : (riskRank[args.next.riskLevel] >= 3 ? ["RISK_REVIEW"] : ["CHANGE_REVIEW"])
      )
    : [];

  return {
    changedFields,
    materiality,
    riskReassessment,
    requiresReapproval,
    requiresReverification,
    requiresFullReopen,
    impactedAcceptanceCriteria,
    impactedApprovalTypes,
    invalidateAllReceipts: requiresReverification && impactedAcceptanceCriteria.length === 0,
  };
}

export function nextStateAfterRevision(args: {
  currentState: WorkOrderLifecycleState;
  hasActiveRun: boolean;
  requiresReapproval: boolean;
  requiresReverification: boolean;
  requiresFullReopen: boolean;
}) : WorkOrderLifecycleState {
  if (args.requiresFullReopen || args.currentState === "DONE") return "REOPENED";
  if (args.hasActiveRun && (args.requiresReapproval || args.requiresReverification)) return "BLOCKED";
  if (args.requiresReapproval) return "AWAITING_APPROVAL";
  if (args.requiresReverification) return "AWAITING_VERIFICATION";
  if (["DISPATCHED", "IN_PROGRESS"].includes(args.currentState) && args.hasActiveRun) return args.currentState;
  return "READY";
}

export function runMatchesCurrentRevision(runRevisionNumber?: number | null, currentRevisionNumber?: number | null) {
  return (runRevisionNumber ?? 1) >= (currentRevisionNumber ?? 1);
}

export function approvalExpiresAt(riskLevel: WorkOrderRiskLevel, policy?: Partial<GovernancePolicyLike>, now = Date.now()) {
  const merged = { ...DEFAULT_GOVERNANCE_POLICY, ...(policy ?? {}) };
  return now + merged.approvalValidityHoursByRisk[riskLevel] * 60 * 60 * 1000;
}

export function verificationValidUntil(policy?: Partial<GovernancePolicyLike>, now = Date.now()) {
  const merged = { ...DEFAULT_GOVERNANCE_POLICY, ...(policy ?? {}) };
  return now + merged.verificationValidityHours * 60 * 60 * 1000;
}

export function isExpiringSoon(timestamp: number | undefined, thresholdHours: number, now = Date.now()) {
  if (!timestamp || timestamp <= now) return false;
  return timestamp - now <= thresholdHours * 60 * 60 * 1000;
}
