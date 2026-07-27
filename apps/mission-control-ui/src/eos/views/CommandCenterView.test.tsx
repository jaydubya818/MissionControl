import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommandCenterView } from "./CommandCenterView";

const mocks = vi.hoisted(() => ({
  approveApproval: vi.fn(),
  transitionTask: vi.fn(),
}));

vi.mock("../../../../../convex/_generated/api", () => ({
  api: {
    approvals: {
      listPending: "approvals.listPending",
      approve: "approvals.approve",
    },
    tasks: {
      listAll: "tasks.listAll",
      transition: "tasks.transition",
    },
    alerts: {
      listOpen: "alerts.listOpen",
    },
    agents: {
      listAll: "agents.listAll",
    },
    scheduledJobs: {
      list: "scheduledJobs.list",
    },
    quotaTracking: {
      getLatestSnapshot: "quotaTracking.getLatestSnapshot",
      getProjectedBurnRate: "quotaTracking.getProjectedBurnRate",
      upsertQuotaSnapshot: "quotaTracking.upsertQuotaSnapshot",
    },
  },
}));

vi.mock("convex/react", () => ({
  useQuery: (query: string) => {
    switch (query) {
      case "approvals.listPending":
        return [
          {
            _id: "approval-1",
            taskId: "task-needs-approval",
            actionSummary: "Approve checkout rollback waiver",
            justification: "PCI gate needs explicit operator approval.",
            riskLevel: "RED",
          },
        ];
      case "tasks.listAll":
        return [
          {
            _id: "task-blocked",
            title: "Unblock payment smoke test",
            description: "Smoke test cannot proceed until dependency is cleared.",
            status: "BLOCKED",
            blockedReason: "Waiting on PSP fixture refresh.",
          },
          {
            _id: "task-failed",
            title: "Repair fraud regression run",
            description: "Latest run failed.",
            status: "FAILED",
            blockedReason: "Regression threshold missed.",
          },
          {
            _id: "task-needs-approval",
            title: "Approve deploy waiver",
            description: "Human approval required before deploy.",
            status: "NEEDS_APPROVAL",
          },
          {
            _id: "task-active",
            title: "Modernize checkout summary",
            description: "Agent is actively working this task.",
            status: "IN_PROGRESS",
          },
        ];
      case "alerts.listOpen":
        return [
          {
            _id: "alert-1",
            title: "Budget burn above threshold",
            description: "Projected spend exceeds policy.",
          },
        ];
      case "agents.listAll":
        return [
          {
            _id: "agent-1",
            name: "Planner",
            role: "PLANNER",
            status: "ACTIVE",
            currentTaskId: "task-active",
            spendToday: 1.25,
            budgetDaily: 10,
          },
          {
            _id: "agent-2",
            name: "Reviewer",
            role: "REVIEWER",
            status: "QUARANTINED",
            currentTaskId: null,
            spendToday: 0,
            budgetDaily: 10,
          },
        ];
      case "scheduledJobs.list":
        return [
          {
            _id: "job-1",
            name: "Nightly verification sweep",
            nextRun: Date.now() + 60_000,
          },
        ];
      case "quotaTracking.getLatestSnapshot":
        return {
          usagePct: 42,
          resetAt: Date.now() + 86_400_000,
        };
      case "quotaTracking.getProjectedBurnRate":
        return {
          pctPerDay: 4.5,
          projectedAtReset: 73,
        };
      default:
        return undefined;
    }
  },
  useMutation: (mutation: string) => {
    switch (mutation) {
      case "approvals.approve":
        return mocks.approveApproval;
      case "tasks.transition":
        return mocks.transitionTask;
      case "quotaTracking.upsertQuotaSnapshot":
        return vi.fn();
      default:
        return vi.fn();
    }
  },
}));

function renderCommandCenter() {
  const onNavigate = vi.fn();
  render(<CommandCenterView onNavigate={onNavigate} />);
  return { onNavigate };
}

describe("CommandCenterView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ configured: true }),
    }) as unknown as typeof fetch;
  });

  it("renders the EOS command center with live attention, workforce, capacity, and readiness data", async () => {
    renderCommandCenter();

    expect(screen.getByRole("heading", { name: "Command Center" })).toBeInTheDocument();
    expect(screen.getByText("The causal system of record and operating control plane for AI-native engineering.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Needs attention" })).toBeInTheDocument();
    expect(screen.getByText("Approve checkout rollback waiver")).toBeInTheDocument();
    expect(screen.getByText("Unblock payment smoke test")).toBeInTheDocument();
    expect(screen.getByText("Repair fraud regression run")).toBeInTheDocument();
    expect(screen.getByText("Budget burn above threshold")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Active mission" })).toBeInTheDocument();
    expect(screen.getAllByText("Modernize Atlas Checkout").length).toBeGreaterThan(0);
    expect(screen.getByText("AI workforce")).toBeInTheDocument();
    expect(screen.getByText("Planner")).toBeInTheDocument();
    expect(screen.getByText("Working: Modernize checkout summary")).toBeInTheDocument();
    expect(screen.getByText("Factory capacity")).toBeInTheDocument();
    expect(screen.getByText("42.0%")).toBeInTheDocument();
    expect(screen.getByText(/Nightly verification sweep/)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("Connected")).toBeInTheDocument());
  });

  it("routes primary operator actions to the right destination views", () => {
    const { onNavigate } = renderCommandCenter();

    fireEvent.click(screen.getByRole("button", { name: "New mission" }));
    fireEvent.click(screen.getByRole("button", { name: "Modernize Atlas Checkout" }));
    fireEvent.click(screen.getByRole("button", { name: "View all missions" }));

    expect(onNavigate).toHaveBeenCalledWith("goals");
    expect(onNavigate).toHaveBeenCalledWith("mission-detail");
    expect(onNavigate).toHaveBeenCalledWith("missions");
  });

  it("executes Command Center approval and unblock mutations with operator audit context", async () => {
    renderCommandCenter();

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Unblock" }));

    await waitFor(() => {
      expect(mocks.approveApproval).toHaveBeenCalledWith({
        approvalId: "approval-1",
        decidedByUserId: "operator",
        reason: "Approved from Command Center",
      });
      expect(mocks.transitionTask).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: "task-blocked",
          toStatus: "ASSIGNED",
          actorType: "HUMAN",
          actorUserId: "operator",
          reason: "Unblocked from Command Center",
        })
      );
    });
  });
});
