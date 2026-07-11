export {
  deriveVerificationStatus,
  type WorkOrderCriterionStatus,
  type WorkOrderVerificationStatus,
} from "./workOrderGovernance";

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
