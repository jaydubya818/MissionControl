import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkOrderApprovalsView } from "./WorkOrderApprovalsView";

const mocks = vi.hoisted(() => ({ decide: vi.fn(), approvals: [] as any[] }));

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    workOrders: {
      approvalQueue: "workOrders.approvalQueue",
      decideApprovalDecision: "workOrders.decideApprovalDecision",
    },
  },
}));

const pendingDecision = {
  _id: "approval-1",
  approvalType: "PROTECTED_DISPATCH",
  requestedAction: "Approve bounded implementation dispatch",
  riskLevel: "HIGH",
  status: "PENDING",
  requestedBy: "orchestrator",
  expiresAt: Date.now() + 60 * 60_000,
  createdAt: Date.now(),
  workOrder: {
    _id: "work-order-1",
    title: "Implement governed decision packet",
    desiredOutcome: "Operator can authorize bounded work with evidence.",
    workflowId: "software-factory",
    repository: "MissionControl",
    branchStrategy: "isolated-worktree",
    riskLevel: "HIGH",
    state: "AWAITING_APPROVAL",
    assignedAgent: "builder",
    constraints: ["No production deploy"],
    requiredApprovals: ["RISK_REVIEW"],
    acceptanceCriteria: [{ id: "ac-1", title: "Operator flow passes", verificationMethod: "BROWSER" }],
  },
  verificationReceipts: [],
  remainingUncertainty: [],
};

vi.mock("convex/react", () => ({
  useQuery: (query: string) => query === "workOrders.approvalQueue" ? mocks.approvals : undefined,
  useMutation: () => mocks.decide,
}));

describe("WorkOrderApprovalsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.approvals = [pendingDecision];
    mocks.decide.mockResolvedValue({ status: "APPROVED" });
  });

  it("renders the complete decision, dispatch, and proof packet", () => {
    render(<WorkOrderApprovalsView projectId={"project-1" as never} />);

    expect(screen.getByRole("heading", { name: "Decision Center" })).toBeInTheDocument();
    expect(screen.getByText("Approve bounded implementation dispatch")).toBeInTheDocument();
    expect(screen.getByText(/Repository: MissionControl/)).toBeInTheDocument();
    expect(screen.getByText(/Dispatch remains explicit/)).toBeInTheDocument();
    expect(screen.getAllByText(/Operator flow passes/)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Approve scope" })).toBeEnabled();
  });

  it("requires a reason and records workspace-scoped decisions", async () => {
    render(<WorkOrderApprovalsView projectId={"project-1" as never} />);

    fireEvent.click(screen.getByRole("button", { name: "Approve scope" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Record why this decision");
    expect(mocks.decide).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Decision reason"), { target: { value: "Scope is bounded and rollback is explicit." } });
    fireEvent.click(screen.getByRole("button", { name: "Approve scope" }));

    await waitFor(() => expect(mocks.decide).toHaveBeenCalledWith(expect.objectContaining({
      approvalDecisionId: "approval-1",
      projectId: "project-1",
      decision: "APPROVE",
      reason: "Scope is bounded and rollback is explicit.",
    })));
  });

  it("explains exact-candidate publication resume for a paused human-review checkpoint", () => {
    mocks.approvals = [{
      ...pendingDecision,
      approvalType: "HUMAN_REVIEW",
      requestedAction: "Approve verified candidate abcdef123456 for pull-request publication",
      latestRun: {
        runId: "attempt-1",
        status: "PAUSED",
        executionPhase: "AWAITING_HUMAN_REVIEW",
        factoryContinuationStatus: "AWAITING_HUMAN_REVIEW",
        factoryApprovalDecisionId: "approval-1",
        candidateRevision: "abcdef1234567890",
      },
      metadata: {
        dispatchPreview: "Unconditional approval resumes the same Attempt at pull-request publication.",
      },
    }];

    render(<WorkOrderApprovalsView projectId={"project-1" as never} />);

    expect(screen.getByRole("button", { name: "Approve & resume publish" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Require retry with conditions" })).toBeEnabled();
    expect(screen.getByText(/Same Attempt · candidate/)).toHaveTextContent("abcdef123456");
    expect(screen.getByText(/no agent or verifier rerun/)).toBeInTheDocument();
  });

  it("does not offer publication resume for a different human-review decision on the same run", () => {
    mocks.approvals = [{
      ...pendingDecision,
      approvalType: "HUMAN_REVIEW",
      latestRun: {
        runId: "attempt-1",
        status: "PAUSED",
        factoryContinuationStatus: "AWAITING_HUMAN_REVIEW",
        factoryApprovalDecisionId: "factory-approval",
        candidateRevision: "abcdef1234567890",
      },
    }];

    render(<WorkOrderApprovalsView projectId={"project-1" as never} />);

    expect(screen.getByRole("button", { name: "Approve scope" })).toBeEnabled();
    expect(screen.queryByText(/Same Attempt · candidate/)).not.toBeInTheDocument();
  });

  it("preserves the publication outcome after the pending queue refreshes", async () => {
    mocks.decide.mockResolvedValue({ status: "APPROVED", factoryContinuationOutcome: "RESUME_PUBLISH" });
    const { rerender } = render(<WorkOrderApprovalsView projectId={"project-1" as never} />);

    fireEvent.change(screen.getByLabelText("Decision reason"), { target: { value: "Verified candidate is safe to publish." } });
    fireEvent.click(screen.getByRole("button", { name: "Approve scope" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("queued to resume"));

    mocks.approvals = [];
    rerender(<WorkOrderApprovalsView projectId={"project-1" as never} />);

    expect(screen.getByRole("status")).toHaveTextContent("queued to resume");
    expect(screen.getByText("No pending decisions")).toBeInTheDocument();
  });

  it("preserves a rejected continuation outcome after the pending queue refreshes", async () => {
    mocks.decide.mockResolvedValue({
      status: "EXPIRED",
      factoryContinuationOutcome: "FAIL_ATTEMPT",
      decisionRejectedReason: "Human-review evidence expired before publication could be safely authorized",
    });
    const { rerender } = render(<WorkOrderApprovalsView projectId={"project-1" as never} />);

    fireEvent.change(screen.getByLabelText("Decision reason"), { target: { value: "Review the current authority." } });
    fireEvent.click(screen.getByRole("button", { name: "Approve scope" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("evidence expired"));

    mocks.approvals = [];
    rerender(<WorkOrderApprovalsView projectId={"project-1" as never} />);

    expect(screen.getByRole("alert")).toHaveTextContent("evidence expired");
    expect(screen.getByText("No pending decisions")).toBeInTheDocument();
  });
});
