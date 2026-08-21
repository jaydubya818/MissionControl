import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommandCenterView } from "./CommandCenterView";

const mocks = vi.hoisted(() => ({
  approveApproval: vi.fn(),
  transitionTask: vi.fn(),
  loadGatewayStatus: vi.fn(),
}));

vi.mock("../../../../../convex/_generated/api", () => ({
  api: {
    approvals: {
      pendingSummary: "approvals.pendingSummary",
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
    automations: {
      getControlPlane: "automations.getControlPlane",
    },
    quotaTracking: {
      getLatestSnapshot: "quotaTracking.getLatestSnapshot",
      getProjectedBurnRate: "quotaTracking.getProjectedBurnRate",
      upsertQuotaSnapshot: "quotaTracking.upsertQuotaSnapshot",
    },
    eos: {
      projections: {
        getHealthSignals: "eos.projections.getHealthSignals",
        getRecommendations: "eos.projections.getRecommendations",
      },
    },
    analytics: {
      schematicOverview: "analytics.schematicOverview",
      recentRunTurns: "analytics.recentRunTurns",
    },
    featureFlags: {
      isEnabled: "featureFlags.isEnabled",
    },
  },
}));

vi.mock("convex/react", () => ({
  useQuery: (query: string) => {
    switch (query) {
      case "approvals.pendingSummary":
        // The single authoritative queue shape: an exact total plus a capped
        // page of rows. Badges read `total`, lists read `items`.
        return {
          total: 1,
          pending: 1,
          escalated: 0,
          items: [
            {
              _id: "approval-1",
              taskId: "task-needs-approval",
              actionSummary: "Approve checkout rollback waiver",
              justification: "PCI gate needs explicit operator approval.",
              riskLevel: "RED",
            },
          ],
        };
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
      case "automations.getControlPlane":
        return {
          definitions: [{
            _id: "automation-1",
            name: "Weekly release review",
            status: "ACTIVE",
            nextRunAt: Date.now() + 120_000,
          }],
          metrics: {
            active: 1,
            paused: 0,
            suspended: 0,
            waitingApprovals: 2,
            overdueReceipts: 1,
            estimatedHumanMinutesSaved: 45,
          },
        };
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

vi.mock("../../lib/gatewayStatus", () => ({
  loadGatewayStatus: mocks.loadGatewayStatus,
}));

function renderCommandCenter() {
  const onNavigate = vi.fn();
  render(
    <CommandCenterView
      projectId={"project-1" as never}
      onNavigate={onNavigate}
    />
  );
  return { onNavigate };
}

describe("CommandCenterView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadGatewayStatus.mockResolvedValue({
      status: { configured: true, urlConfigured: true, tokenConfigured: true },
      error: null,
      checkedAt: Date.now(),
    });
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
    expect(screen.queryByRole("region", { name: "Active mission" })).not.toBeInTheDocument();
    expect(screen.queryByText("Modernize Atlas Checkout")).not.toBeInTheDocument();
    expect(screen.getByText("AI workforce")).toBeInTheDocument();
    expect(screen.getByText("Planner")).toBeInTheDocument();
    expect(screen.getByText("Working: Modernize checkout summary")).toBeInTheDocument();
    expect(screen.getByText("Provider capacity")).toBeInTheDocument();
    expect(screen.getByText("42.0%")).toBeInTheDocument();
    expect(screen.getByText(/Nightly verification sweep/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Governed Automations" })).toBeInTheDocument();
    expect(screen.getByText("Weekly release review", { exact: false })).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("Connected")).toBeInTheDocument());
  });

  it("routes primary operator actions to the right destination views", async () => {
    const { onNavigate } = renderCommandCenter();

    await screen.findByText("Connected");

    fireEvent.click(screen.getByRole("button", { name: "Open work orders" }));

    expect(onNavigate).toHaveBeenCalledWith("control-work-orders");

    fireEvent.click(screen.getByRole("button", { name: "Open Automations" }));
    expect(onNavigate).toHaveBeenCalledWith("automations");

    fireEvent.click(screen.getByRole("button", { name: /Planner/ }));

    expect(onNavigate).toHaveBeenCalledWith("agents");
  });

  it("routes exceptions to governed detail instead of exposing context-free quick actions", async () => {
    const { onNavigate } = renderCommandCenter();

    await screen.findByText("Connected");

    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unblock" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Approve checkout rollback waiver/ }));
    fireEvent.click(screen.getByRole("button", { name: /Unblock payment smoke test/ }));

    expect(onNavigate).toHaveBeenCalledWith("audit");
    expect(onNavigate).toHaveBeenCalledWith("tasks");
    expect(mocks.approveApproval).not.toHaveBeenCalled();
    expect(mocks.transitionTask).not.toHaveBeenCalled();
  });
});
