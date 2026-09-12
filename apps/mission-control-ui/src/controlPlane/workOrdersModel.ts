export interface WorkOrderQueueItem {
  _id: string;
  title: string;
  desiredOutcome: string;
  workflowId?: string;
  repository?: string;
  state: string;
  riskLevel: string;
  assignedAgent?: string;
  assignedSquad?: string;
  requestedBy?: string;
  verificationStatus: string;
  approvalStatus: string;
  blockingIssue?: string;
  requiredHumanAction?: string;
  metadata?: Record<string, any>;
  latestExecutionRun?: {
    status: string;
    workflowId: string;
    currentStepLabel?: string | null;
  } | null;
}

export interface WorkOrderQueueFilters {
  repository: string;
  state: string;
  riskLevel: string;
  assignedAgent: string;
  requestedBy: string;
  verificationStatus: string;
  quickFilter: WorkOrderQuickFilter;
}

export type WorkOrderQuickFilter =
  | "all"
  | "needs_attention"
  | "blocked"
  | "awaiting_approval"
  | "ready_to_dispatch";

export const DEFAULT_WORK_ORDER_FILTERS: WorkOrderQueueFilters = {
  repository: "all",
  state: "all",
  riskLevel: "all",
  assignedAgent: "all",
  requestedBy: "all",
  verificationStatus: "all",
  quickFilter: "all",
};

function matchesQuickFilter(item: WorkOrderQueueItem, quickFilter: WorkOrderQuickFilter) {
  switch (quickFilter) {
    case "needs_attention":
      return Boolean(item.requiredHumanAction) || ["PENDING", "REVISION_REQUESTED", "CONDITIONAL"].includes(item.approvalStatus) || ["FAIL", "STALE"].includes(item.verificationStatus) || item.state === "BLOCKED";
    case "blocked":
      return item.state === "BLOCKED";
    case "awaiting_approval":
      return item.state === "AWAITING_APPROVAL" || ["PENDING", "REVISION_REQUESTED", "CONDITIONAL"].includes(item.approvalStatus);
    case "ready_to_dispatch":
      return ["READY", "REOPENED"].includes(item.state) && !item.latestExecutionRun;
    case "all":
    default:
      return true;
  }
}

export function filterWorkOrders(
  items: WorkOrderQueueItem[],
  filters: WorkOrderQueueFilters
): WorkOrderQueueItem[] {
  return items.filter((item) => {
    if (!matchesQuickFilter(item, filters.quickFilter)) return false;
    if (filters.repository !== "all" && item.repository !== filters.repository) return false;
    if (filters.state !== "all" && item.state !== filters.state) return false;
    if (filters.riskLevel !== "all" && item.riskLevel !== filters.riskLevel) return false;
    if (filters.assignedAgent !== "all" && item.assignedAgent !== filters.assignedAgent) return false;
    if (filters.requestedBy !== "all" && item.requestedBy !== filters.requestedBy) return false;
    if (filters.verificationStatus !== "all" && item.verificationStatus !== filters.verificationStatus) return false;
    return true;
  });
}

export function summarizeRequiredAttention(item: WorkOrderQueueItem): string {
  return item.requiredHumanAction ?? item.blockingIssue ?? "None";
}

export function deriveNextAction(item: WorkOrderQueueItem): string {
  if (item.latestExecutionRun && ["PENDING", "RUNNING", "PAUSED"].includes(item.latestExecutionRun.status)) return "Inspect run";
  if (item.state === "DISPATCHED" || item.state === "IN_PROGRESS") return "Inspect run";
  if (item.state === "BLOCKED") return "Resolve blocker";
  if (item.state === "AWAITING_APPROVAL" || ["PENDING", "REVISION_REQUESTED", "CONDITIONAL"].includes(item.approvalStatus)) {
    return "Review approval";
  }
  if (item.verificationStatus === "STALE") return "Refresh evidence";
  if (item.verificationStatus === "FAIL") return "Fix verification";
  if (item.verificationStatus === "PENDING") return item.latestExecutionRun ? "Record receipt" : "Dispatch";
  if (["READY", "REOPENED"].includes(item.state)) return "Dispatch";
  if (item.state === "DONE") return "Review outcome";
  return "Inspect details";
}

export function humanizeOperatorCopy(text: string): string {
  const trimmed = text.trim();
  const replacements: Array<[RegExp, string]> = [
    [/no current source attempt published a candidate-ready verification subject\.?/i, "Nothing verified yet. Wait for this run to finish and leave evidence."],
    [/why this workorder is blocked from acceptance/i, "Not ready to accept yet"],
    [/acceptance remains blocked until all required approvals, independent evidence, github app pr lineage, and exact-head ci requirements are complete\.?/i, "Approvals, evidence, and CI still have to finish before you can accept."],
    [/ready for explicit human acceptance/i, "Ready for you to accept"],
  ];
  for (const [pattern, plain] of replacements) {
    if (pattern.test(trimmed)) return plain;
  }
  return trimmed
    .replace(/\bWorkOrder\b/g, "work order")
    .replace(/\bAttempt\b/g, "run")
    .replace(/\bVerification Subject\b/g, "verified result");
}

export function countByQuickFilter(items: WorkOrderQueueItem[], quickFilter: WorkOrderQuickFilter) {
  return items.filter((item) => matchesQuickFilter(item, quickFilter)).length;
}

export function deriveAcceptanceReadinessPresentation(
  canAccept: boolean,
  verificationReasons: string[] = []
) {
  if (canAccept) {
    return {
      heading: "Ready for explicit human acceptance",
      reasons: [],
      summary: "Approvals, independent evidence, GitHub App PR lineage, and exact-head CI are complete. Explicit acceptance is now allowed.",
    };
  }

  const reasons = verificationReasons.map((reason) => reason.trim()).filter(Boolean);
  return {
    heading: "Why this WorkOrder is blocked from acceptance",
    reasons,
    summary: reasons.length === 0
      ? "Acceptance remains blocked until all required approvals, independent evidence, GitHub App PR lineage, and exact-head CI requirements are complete."
      : null,
  };
}

export function parseVerificationArguments(value: string):
  | { ok: true; args: string[] }
  | { ok: false; error: string } {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return { ok: false, error: "Enter verification arguments as a JSON string array." };
    }
    if (parsed.some((argument) => typeof argument !== "string")) {
      return { ok: false, error: "Every verification argument must be a JSON string." };
    }
    return { ok: true, args: parsed };
  } catch {
    return { ok: false, error: "Verification arguments must be valid JSON, for example [\"--filter\", \"app\", \"test\"]." };
  }
}
