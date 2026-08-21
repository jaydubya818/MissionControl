export type DispatchableState =
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

export type DispatchApprovalStatus = "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED" | "CONDITIONAL" | "REVISION_REQUESTED" | "EXPIRED" | "REVOKED";
export type DispatchRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type DispatchRunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "PAUSED" | "CANCELED";
export type DispatchVerificationStatus = "PENDING" | "PASS" | "FAIL" | "WAIVED" | "STALE";

export const ACTIVE_RUN_STATUSES: DispatchRunStatus[] = ["PENDING", "RUNNING", "PAUSED"];

export function publicDispatchActorAllowed(actorType: "HUMAN" | "SYSTEM" | "AGENT"): boolean {
  return actorType === "HUMAN";
}

/**
 * Policy-v2 receipts are immutable historical evidence. A newer Attempt makes
 * the previous result non-current through the canonical exact-current
 * evaluator; dispatch must not rewrite the previous receipt to express that.
 * Legacy verification continues to use receipt invalidation for currentness.
 *
 * The exact-current evaluator only runs at acceptance for ENFORCED policy-v2
 * contracts (`workOrders.accept`). An OBSERVE_ONLY v2 contract therefore gets
 * neither mechanism unless dispatch keeps invalidating receipts, which would
 * let evidence from a superseded Attempt clear acceptance after re-dispatch.
 */
export function dispatchInvalidatesVerificationReceipts(workOrder: {
  verificationContract?: { schemaVersion?: number; enforcementMode?: string };
}): boolean {
  const contract = workOrder.verificationContract;
  return contract?.schemaVersion !== 2 || contract.enforcementMode !== "ENFORCED";
}

export function dispatchApprovalAllowed(args: {
  riskLevel: DispatchRiskLevel;
  approvalStatus: DispatchApprovalStatus;
  requiredApprovals?: string[];
}) {
  const requiresApproval = (args.requiredApprovals?.length ?? 0) > 0 || ["HIGH", "CRITICAL"].includes(args.riskLevel);
  if (!requiresApproval) return true;
  return args.approvalStatus === "APPROVED" || args.approvalStatus === "CONDITIONAL";
}

export function findActiveRun<T extends { status: DispatchRunStatus }>(runs: T[]): T | undefined {
  return runs.find((run) => ACTIVE_RUN_STATUSES.includes(run.status));
}

export function validateRetryRequest(args: {
  workOrderId: string;
  retryReason?: string;
  priorRun?: {
    workOrderId?: string;
    status: DispatchRunStatus;
  } | null;
  remote?: RemoteRetryEvaluationInput;
}): { ok: true; reason: string; retryDecision?: RemoteRetryDecision } | { ok: false; reason: string; retryDecision?: RemoteRetryDecision } {
  const reason = args.retryReason?.trim() ?? "";
  if (!args.priorRun) return { ok: false, reason: "retry-run-not-found" };
  if (args.priorRun.workOrderId !== args.workOrderId) {
    return { ok: false, reason: "retry-run-work-order-mismatch" };
  }
  if (!["FAILED", "CANCELED"].includes(args.priorRun.status)) {
    return { ok: false, reason: `retry-run-not-recoverable:${args.priorRun.status}` };
  }
  if (reason.length < 10) return { ok: false, reason: "retry-reason-required" };
  if (args.remote) {
    const retryDecision = evaluateRemoteRetryPolicy(args.remote);
    if (!retryDecision.allowed) {
      return { ok: false, reason: `remote-retry-blocked:${retryDecision.reason}`, retryDecision };
    }
    return { ok: true, reason, retryDecision };
  }
  return { ok: true, reason };
}

export interface RemoteRetryDecision {
  allowed: boolean;
  reason: string;
}

export interface RemoteRetryEvaluationInput {
  failureClass?: string;
  retryable?: boolean;
  policy?: {
    schema?: string;
    maxAttempts?: number;
    maxTotalWallClockMs?: number;
    maxModelSpendUsd?: number;
    maxProviderResources?: number;
    retryableFailureClasses?: string[];
  };
  attemptsUsed: number;
  totalWallClockMs: number;
  observedModelSpendUsd: number | null;
  activeProviderResources: number;
}

export function evaluateRemoteRetryPolicy(input: RemoteRetryEvaluationInput): RemoteRetryDecision {
  const policy = input.policy;
  if (!policy || policy.schema !== "factory-remote-retry-policy/v1"
    || !Number.isSafeInteger(policy.maxAttempts) || (policy.maxAttempts ?? 0) < 1
    || !Number.isSafeInteger(policy.maxTotalWallClockMs) || (policy.maxTotalWallClockMs ?? 0) < 1_000
    || !Number.isFinite(policy.maxModelSpendUsd) || (policy.maxModelSpendUsd ?? 0) <= 0
    || policy.maxProviderResources !== 1
    || policy.retryableFailureClasses?.join(",") !== "RETRYABLE_INFRA,RETRYABLE_EXECUTION") {
    return { allowed: false, reason: "INVALID_FROZEN_BUDGET" };
  }
  if (input.retryable !== true || !policy.retryableFailureClasses.includes(input.failureClass ?? "")) {
    return { allowed: false, reason: "FAILURE_CLASS_NOT_RETRYABLE" };
  }
  if (input.attemptsUsed >= policy.maxAttempts!) return { allowed: false, reason: "MAX_ATTEMPTS_EXHAUSTED" };
  if (input.totalWallClockMs >= policy.maxTotalWallClockMs!) return { allowed: false, reason: "MAX_WALL_CLOCK_EXHAUSTED" };
  if (input.observedModelSpendUsd !== null && input.observedModelSpendUsd >= policy.maxModelSpendUsd!) {
    return { allowed: false, reason: "MAX_MODEL_SPEND_EXHAUSTED" };
  }
  if (input.activeProviderResources >= policy.maxProviderResources!) {
    return { allowed: false, reason: "MAX_PROVIDER_RESOURCES_EXHAUSTED" };
  }
  return { allowed: true, reason: "WITHIN_FROZEN_BUDGET" };
}

export function resolveRetryExecutionBinding(args: {
  branch?: string;
  worktree?: string;
  priorRun?: {
    _id?: string;
    branch?: string;
    worktree?: string;
    metadata?: { retryOfWorkflowRunId?: string };
  } | null;
  lineage?: Array<{
    _id: string;
    branch?: string;
    worktree?: string;
    metadata?: { retryOfWorkflowRunId?: string };
  }>;
}) {
  const branch = args.branch?.trim() || undefined;
  const worktree = args.worktree?.trim() || undefined;
  const lineage = [...(args.lineage ?? [])];
  if (args.priorRun && !lineage.some((run) => run._id === args.priorRun?._id)) {
    lineage.push({
      _id: args.priorRun._id ?? "prior-run",
      branch: args.priorRun.branch,
      worktree: args.priorRun.worktree,
      metadata: args.priorRun.metadata,
    });
  }
  if (branch && lineage.some((run) => run.branch?.trim() === branch)) {
    throw new Error("A retry must use a fresh branch that is not bound to its failed Attempt lineage.");
  }
  const normalizedWorktree = normalizeWorktree(worktree);
  if (normalizedWorktree && lineage.some((run) => normalizeWorktree(run.worktree) === normalizedWorktree)) {
    throw new Error("A retry must use a fresh worktree that is not bound to its failed Attempt lineage.");
  }
  return {
    branch,
    worktree,
  };
}

function normalizeWorktree(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : undefined;
}

export function latestRequiredRemoteRetryRun<T extends {
  _id: string;
  _creationTime?: number;
  status: string;
  startedAt: number;
  parentTaskId?: string;
  attemptPurpose?: string;
  executionManifest?: {
    causation?: { workOrderRevisionNumber?: number };
    harness?: { executionBackend?: string };
  };
}>(args: {
  runs: T[];
  workOrderRevisionNumber: number;
  parentTaskId?: string;
}): T | undefined {
  const latest = args.runs
    .filter((run) =>
      (run.attemptPurpose ?? "IMPLEMENTATION") === "IMPLEMENTATION"
      && (run.parentTaskId ?? undefined) === (args.parentTaskId ?? undefined)
      && run.executionManifest?.causation?.workOrderRevisionNumber === args.workOrderRevisionNumber
    )
    .sort((left, right) =>
      (right._creationTime ?? right.startedAt) - (left._creationTime ?? left.startedAt)
      || String(right._id).localeCompare(String(left._id))
    )[0];
  if (!latest
    || latest.executionManifest?.harness?.executionBackend !== "remote-sandbox"
    || !["FAILED", "CANCELED"].includes(latest.status)) {
    return undefined;
  }
  return latest;
}

export function resolveRemoteRetryFactoryVersion(args: {
  retryingRemote: boolean;
  priorFactoryDefinitionVersionId?: string;
  requestedFactoryDefinitionVersionId?: string;
}) {
  if (!args.retryingRemote) return args.requestedFactoryDefinitionVersionId;
  if (!args.priorFactoryDefinitionVersionId) {
    throw new Error("A remote retry requires the failed Attempt's frozen Factory Version.");
  }
  if (args.requestedFactoryDefinitionVersionId
    && args.requestedFactoryDefinitionVersionId !== args.priorFactoryDefinitionVersionId) {
    throw new Error("A remote retry cannot replace its frozen Factory Version or retry budget.");
  }
  return args.priorFactoryDefinitionVersionId;
}

export function validateDispatchable(args: {
  state: DispatchableState;
  riskLevel: DispatchRiskLevel;
  approvalStatus: DispatchApprovalStatus;
  requiredApprovals?: string[];
  hasWorkflowId: boolean;
  activeRunStatuses: DispatchRunStatus[];
}): { ok: true } | { ok: false; reason: string } {
  if (!args.hasWorkflowId) return { ok: false, reason: "missing-workflow" };
  if (!["READY", "BLOCKED", "DISPATCHED", "IN_PROGRESS", "AWAITING_APPROVAL", "AWAITING_VERIFICATION", "REOPENED"].includes(args.state)) {
    return { ok: false, reason: `invalid-state:${args.state}` };
  }
  if (!dispatchApprovalAllowed(args)) {
    return { ok: false, reason: "approval-required" };
  }
  if (findActiveRun(args.activeRunStatuses.map((status) => ({ status })))) {
    return { ok: false, reason: "active-run-exists" };
  }
  return { ok: true };
}

export function nextStateForRunStatus(args: {
  currentState: DispatchableState;
  runStatus: DispatchRunStatus;
  verificationStatus: DispatchVerificationStatus;
  approvalStatus: DispatchApprovalStatus | "REVISION_REQUESTED";
}): DispatchableState {
  if (args.runStatus === "PENDING") return "DISPATCHED";
  if (args.runStatus === "RUNNING") return "IN_PROGRESS";
  if (args.runStatus === "PAUSED") return "AWAITING_APPROVAL";
  if (args.runStatus === "FAILED") return "BLOCKED";
  if (args.runStatus === "CANCELED") return "CANCELED";
  if (args.runStatus === "COMPLETED") {
    return args.approvalStatus === "APPROVED" || args.approvalStatus === "CONDITIONAL" || args.approvalStatus === "NOT_REQUIRED"
      ? "AWAITING_VERIFICATION"
      : "AWAITING_APPROVAL";
  }
  return args.currentState;
}
