/**
 * Approval Types
 *
 * Approvals track requests for human approval of risky actions.
 */
export type ApprovalRisk = "yellow" | "red";
export type ApprovalStatus = "pending" | "approved" | "denied";
export interface Approval {
    _id: string;
    _creationTime: number;
    taskId: string;
    agentId: string;
    toolCallId?: string;
    summary: string;
    risk: ApprovalRisk;
    reason: string;
    status: ApprovalStatus;
    approver?: string;
    decision?: string;
    decidedAt?: number;
}
export interface CreateApprovalInput {
    taskId: string;
    agentId: string;
    toolCallId?: string;
    summary: string;
    risk: ApprovalRisk;
    reason: string;
}
export interface ApproveActionInput {
    approvalId: string;
    approver: string;
    decision: string;
}
export interface DenyActionInput {
    approvalId: string;
    approver: string;
    decision: string;
}
//# sourceMappingURL=approval.d.ts.map