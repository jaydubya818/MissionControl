import { describe, expect, it } from "vitest";
import {
  currentWorkflowStepLabel,
  deriveVerificationStatus,
  totalWorkflowRetries,
} from "../lib/workOrders";
import { buildWorkOrderDraftFromTask } from "../lib/workOrderCompat";

describe("work order helpers", () => {
  it("returns FAIL when any criterion fails", () => {
    expect(
      deriveVerificationStatus([
        { status: "PASS" },
        { status: "FAIL" },
      ])
    ).toBe("FAIL");
  });

  it("returns PASS when all criteria pass or are waived", () => {
    expect(
      deriveVerificationStatus([
        { status: "PASS" },
        { status: "WAIVED" },
      ])
    ).toBe("PASS");
  });

  it("returns WAIVED when all criteria are waived", () => {
    expect(
      deriveVerificationStatus([
        { status: "WAIVED" },
        { status: "WAIVED" },
      ])
    ).toBe("WAIVED");
  });

  it("returns PENDING when criteria are incomplete", () => {
    expect(
      deriveVerificationStatus([
        { status: "PASS" },
        { status: "PENDING" },
      ])
    ).toBe("PENDING");
  });

  it("sums workflow retries across all steps", () => {
    expect(totalWorkflowRetries([{ retryCount: 0 }, { retryCount: 2 }, { retryCount: 1 }])).toBe(3);
  });

  it("returns the current workflow step label", () => {
    expect(
      currentWorkflowStepLabel([
        { stepId: "plan" },
        { stepId: "implement" },
      ], 1)
    ).toBe("implement");
  });

  it("returns null when current step index is out of bounds", () => {
    expect(currentWorkflowStepLabel([{ stepId: "plan" }], 3)).toBeNull();
  });

  it("builds a work order draft from a legacy GitHub task", () => {
    const draft = buildWorkOrderDraftFromTask({
      _id: "task-1",
      identifier: "MC-042",
      title: "Fix broken deploy",
      description: "Repair the production deploy path",
      priority: 2,
      assigneeIds: ["agent-pi"],
      createdBy: "SYSTEM",
      createdByRef: "Hermes",
      source: "GITHUB",
      sourceRef: "jaydubya818/MissionControl#42",
    });

    expect(draft.legacyTaskId).toBe("task-1");
    expect(draft.repository).toBe("jaydubya818/MissionControl");
    expect(draft.requestedBy).toBe("Hermes");
    expect(draft.acceptanceCriteria).toHaveLength(1);
    expect(draft.sourceOfTruthRefs?.[0]?.kind).toBe("ISSUE");
  });
});
