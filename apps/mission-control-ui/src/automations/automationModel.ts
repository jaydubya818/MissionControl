export const AUTOMATION_TABS = [
  "overview",
  "candidates",
  "definitions",
  "runs",
  "schedule",
  "receipts",
  "decisions",
] as const;

export type AutomationTab = typeof AUTOMATION_TABS[number];

export function normalizeAutomationTab(value: string | null): AutomationTab {
  return AUTOMATION_TABS.includes(value as AutomationTab) ? value as AutomationTab : "overview";
}

export function formatDate(value?: number): string {
  return value ? new Date(value).toLocaleString() : "Not yet";
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatDuration(value?: number): string {
  if (!value) return "Not recorded";
  if (value < 60_000) return `${Math.round(value / 1000)}s`;
  return `${Math.round(value / 60_000)}m`;
}

export function workspacePath(path: string, workspaceId: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}workspace=${encodeURIComponent(workspaceId)}`;
}

export function humanizeCron(value?: string): string {
  if (!value) return "No cadence";
  if (value === "0 8 * * 1") return "Every Monday at 8:00 AM";
  if (value === "0 9 * * *") return "Daily at 9:00 AM";
  if (value === "0 * * * *") return "Every hour";
  return `Cron ${value}`;
}

export function candidateEligibilityLabel(candidate: {
  status: string;
  eligible: boolean;
}): string {
  if (candidate.status === "ACCEPTED") return "ACCEPTED";
  if (candidate.status === "REJECTED") return "REJECTED";
  return candidate.eligible ? "ELIGIBLE" : "INELIGIBLE";
}

export function runStatusLabel(run: {
  workOrder: { state: string; approvalStatus: string; verificationStatus: string };
  idempotencyResult?: string;
}): string {
  if (run.idempotencyResult === "IDEMPOTENT_SKIP") return "Idempotent skip";
  if (run.workOrder.verificationStatus === "FAIL") return "Failed";
  if (run.workOrder.verificationStatus === "PASS") return "Verified";
  if (run.workOrder.state === "AWAITING_VERIFICATION") return "Awaiting verification";
  if (["DISPATCHED", "IN_PROGRESS"].includes(run.workOrder.state)) return "Dispatched";
  if (run.workOrder.approvalStatus === "APPROVED") return "Approved, awaiting dispatch";
  if (run.workOrder.state === "AWAITING_APPROVAL") return "Awaiting approval";
  return "Review gate created";
}

export function statusTone(status: string): string {
  if (["ACTIVE", "HEALTHY", "PASSED", "PASS", "DONE", "FRESH", "VERIFIED", "ELIGIBLE"].includes(status)) {
    return "border-ok/30 text-ok";
  }
  if (["PAUSED", "ATTENTION", "PENDING", "AWAITING_APPROVAL", "MISSING", "EXPIRED"].includes(status)) {
    return "border-warn/30 text-warn";
  }
  if (["SUSPENDED", "DEGRADED", "FAILED", "FAIL", "STALE", "INELIGIBLE"].includes(status)) {
    return "border-err/30 text-err";
  }
  return "border-border text-muted-foreground";
}
