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
}

export const DEFAULT_WORK_ORDER_FILTERS: WorkOrderQueueFilters = {
  repository: "all",
  state: "all",
  riskLevel: "all",
  assignedAgent: "all",
  requestedBy: "all",
  verificationStatus: "all",
};

export function filterWorkOrders(
  items: WorkOrderQueueItem[],
  filters: WorkOrderQueueFilters
): WorkOrderQueueItem[] {
  return items.filter((item) => {
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
