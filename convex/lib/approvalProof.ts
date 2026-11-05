import type { Doc } from '../_generated/dataModel';

export const APPROVAL_IDENTITY_VERSION = 'authenticated-operator/v1' as const;

/** Old display strings are not evidence of an authenticated approval. */
export function hasAuthenticatedApproval(approval: Doc<'approvals'>): boolean {
  if (approval.status !== 'APPROVED' || approval.decisionIdentityVersion !== APPROVAL_IDENTITY_VERSION || !approval.decidedByOperatorId || !approval.decidedByUserId) return false;
  const required = Math.max(approval.riskLevel === 'RED' ? 2 : 1, approval.requiredDecisionCount ?? 1);
  if ((approval.decisionCount ?? 0) < required || required > 2) return false;
  return required === 1 || Boolean(approval.firstDecisionOperatorId && approval.firstDecisionByUserId
    && approval.firstDecisionOperatorId !== approval.decidedByOperatorId
    && approval.firstDecisionByUserId !== approval.decidedByUserId);
}

export function isTaskCompletionApproval(approval: Doc<'approvals'>): boolean {
  return approval.actionType === 'TASK_COMPLETION' && hasAuthenticatedApproval(approval);
}
