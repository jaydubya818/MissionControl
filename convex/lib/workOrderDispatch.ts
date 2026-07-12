export type DispatchableState =
  | "DRAFT"
  | "READY"
  | "DISPATCHED"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "AWAITING_APPROVAL"
  | "AWAITING_VERIFICATION"
  | "DONE"
  | "CANCELED"
  // Compat: revisions-stack states (never dispatchable; rejected by whitelist)
  | "REOPENED"
  | "SUPERSEDED";

export type DispatchApprovalStatus =
  | "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED" | "CONDITIONAL"
  // Compat: revisions-stack statuses (treated as not-approved)
  | "REVISION_REQUESTED" | "EXPIRED" | "REVOKED";
export type DispatchRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type DispatchRunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "PAUSED" | "CANCELED";
export type DispatchVerificationStatus = "PENDING" | "PASS" | "FAIL" | "WAIVED" | "STALE";

export const ACTIVE_RUN_STATUSES: DispatchRunStatus[] = ["PENDING", "RUNNING", "PAUSED"];

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

export function validateDispatchable(args: {
  state: DispatchableState;
  riskLevel: DispatchRiskLevel;
  approvalStatus: DispatchApprovalStatus;
  requiredApprovals?: string[];
  hasWorkflowId: boolean;
  activeRunStatuses: DispatchRunStatus[];
}): { ok: true } | { ok: false; reason: string } {
  if (!args.hasWorkflowId) return { ok: false, reason: "missing-workflow" };
  if (!["READY", "BLOCKED", "DISPATCHED", "IN_PROGRESS"].includes(args.state)) {
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
}): DispatchableState {
  if (args.runStatus === "PENDING") return "DISPATCHED";
  if (args.runStatus === "RUNNING") return "IN_PROGRESS";
  if (args.runStatus === "PAUSED") return "AWAITING_APPROVAL";
  if (args.runStatus === "FAILED") return "BLOCKED";
  if (args.runStatus === "CANCELED") return "CANCELED";
  if (args.runStatus === "COMPLETED") {
    return args.verificationStatus === "PASS" || args.verificationStatus === "WAIVED"
      ? "DONE"
      : "AWAITING_VERIFICATION";
  }
  return args.currentState;
}
