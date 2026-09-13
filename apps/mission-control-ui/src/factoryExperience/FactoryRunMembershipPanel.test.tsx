import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FactoryRunMembershipPanel } from "./FactoryRunMembershipPanel";

describe("FactoryRunMembershipPanel", () => {
  it("renders explicit membership totals and dispatch truth", () => {
    render(<FactoryRunMembershipPanel runs={[{
      factoryRun: { _id: "run-1", title: "Qualification run", state: "RUNNING", membershipDigest: "sha256:1234567890abcdef", sourcePlanRevision: 1 },
      summary: {
        counts: { total: 3, accepted: 1, active: 0, blocked: 2, failed: 0 },
        outcome: { outcome: null, reasonCode: "NON_TERMINAL", summary: "The run has unfinished members." },
        dispatchFrontier: ["wo-2"],
        criticalPathWorkOrderId: "wo-2",
      },
      workOrders: [
        { _id: "wo-1", title: "Foundation", state: "DONE" },
        { _id: "wo-2", title: "Feature", state: "READY" },
        { _id: "wo-3", title: "Integration", state: "BLOCKED" },
      ],
      members: [
        { workOrderId: "wo-1", sequence: 1, workOrderRevisionNumber: 1 },
        { workOrderId: "wo-2", sequence: 2, workOrderRevisionNumber: 1 },
        { workOrderId: "wo-3", sequence: 3, workOrderRevisionNumber: 1 },
      ],
    }]} />);
    expect(screen.getByText("Qualification run")).toBeInTheDocument();
    expect(screen.getByText("3", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText(/current critical path/)).toBeInTheDocument();
    expect(screen.getAllByText("Feature", { selector: "p" })).toHaveLength(2);
    expect(screen.queryByText("Completed")).not.toBeInTheDocument();
  });
});
