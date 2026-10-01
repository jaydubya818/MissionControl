import { describe, expect, it } from "vitest";
import { FLOW_STEPS, nextBestAction } from "./commandCenterGuide";

const none = { approvals: 0, blocked: 0, failed: 0, alerts: 0, workItems: 3 };

describe("nextBestAction", () => {
  it("puts human decisions first", () => {
    const action = nextBestAction({ ...none, approvals: 2, blocked: 5, failed: 1 });
    expect(action.label).toBe("Review 2 pending approvals");
    expect(action.view).toBe("control-approvals");
  });

  it("singularizes a single item", () => {
    expect(nextBestAction({ ...none, approvals: 1 }).label).toBe("Review 1 pending approval");
  });

  it("falls through blocked, failed, then alerts", () => {
    expect(nextBestAction({ ...none, blocked: 1, failed: 4, alerts: 2 }).view).toBe("tasks");
    expect(nextBestAction({ ...none, failed: 4, alerts: 2 }).label).toContain("failed");
    expect(nextBestAction({ ...none, alerts: 2 }).view).toBe("telemetry");
  });

  it("guides an empty workspace to its first Work Order", () => {
    expect(nextBestAction({ ...none, workItems: 0 }).label).toBe("Create your first Work Order");
  });

  it("always returns a reason a newcomer can read", () => {
    for (const counts of [none, { ...none, approvals: 1 }, { ...none, alerts: 1 }]) {
      expect(nextBestAction(counts).reason.length).toBeGreaterThan(20);
    }
  });
});

describe("FLOW_STEPS", () => {
  it("walks mission to approval in four steps", () => {
    expect(FLOW_STEPS.map((step) => step.label)).toEqual(["Mission", "Work Order", "Evidence", "Approval"]);
  });
});
