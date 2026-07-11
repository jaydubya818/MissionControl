export type WorkOrderCriterionStatus = "PENDING" | "PASS" | "FAIL" | "WAIVED";

export type WorkOrderVerificationStatus = "PENDING" | "PASS" | "FAIL" | "WAIVED";

export function deriveVerificationStatus(
  criteria: Array<{ status: WorkOrderCriterionStatus }>
): WorkOrderVerificationStatus {
  if (criteria.length === 0) return "PENDING";
  if (criteria.some((criterion) => criterion.status === "FAIL")) return "FAIL";
  if (criteria.every((criterion) => criterion.status === "WAIVED")) return "WAIVED";
  if (criteria.every((criterion) => criterion.status === "PASS" || criterion.status === "WAIVED")) return "PASS";
  return "PENDING";
}

export function totalWorkflowRetries(
  steps: Array<{ retryCount: number }>
): number {
  return steps.reduce((sum, step) => sum + step.retryCount, 0);
}

export function currentWorkflowStepLabel(
  steps: Array<{ stepId: string }>,
  currentStepIndex: number
): string | null {
  return steps[currentStepIndex]?.stepId ?? null;
}
