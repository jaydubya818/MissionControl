import { describe, expect, it } from "vitest";
import {
  buildWorkflowStateCompatibilityReport,
  canonicalTaskStatus,
  isReadyCompatibleStatus,
  validateWorkflowTransitionContext,
} from "../lib/taskWorkflowState";

describe("Task workflow state compatibility", () => {
  it("presents legacy ASSIGNED as READY without changing the raw value", () => {
    expect(canonicalTaskStatus("ASSIGNED")).toBe("READY");
    expect(canonicalTaskStatus("READY")).toBe("READY");
    expect(isReadyCompatibleStatus("ASSIGNED")).toBe(true);
    expect(isReadyCompatibleStatus("READY")).toBe(true);
  });

  it("requires structured blocker context", () => {
    expect(
      validateWorkflowTransitionContext({
        fromStatus: "IN_PROGRESS",
        toStatus: "BLOCKED",
      })
    ).toEqual([
      { field: "blocker", message: "Structured blocker context is required" },
    ]);
  });

  it("requires a meaningful review rejection reason", () => {
    const errors = validateWorkflowTransitionContext({
      fromStatus: "REVIEW",
      toStatus: "IN_PROGRESS",
      reason: "too short",
    });
    expect(errors[0]?.field).toBe("reason");
    expect(errors[0]?.message).toContain("at least 10 characters");
  });

  it("requires a classified blocker resolution", () => {
    const missing = validateWorkflowTransitionContext({
      fromStatus: "BLOCKED",
      toStatus: "READY",
      reason: "Dependency was resolved",
    });
    expect(missing[0]?.field).toBe("blockerResolution");

    expect(
      validateWorkflowTransitionContext({
        fromStatus: "BLOCKED",
        toStatus: "READY",
        blockerResolution: {
          resolution: "RESOLVED",
          reason: "Dependency was resolved and verified",
        },
      })
    ).toEqual([]);
  });

  it("reports migration eligibility and exclusions without mutating records", () => {
    const tasks = [
      { status: "ASSIGNED" as const, assigneeIds: ["agent"], workOrderId: "wo" },
      { status: "ASSIGNED" as const, assigneeIds: [], workOrderId: "wo" },
      { status: "ASSIGNED" as const, assigneeIds: ["agent"] },
      { status: "READY" as const, assigneeIds: ["agent"], workOrderId: "wo" },
      { status: "REVIEW" as const, assigneeIds: [], workOrderId: "wo" },
      { status: "BLOCKED" as const, assigneeIds: [], workOrderId: "wo" },
    ];

    const report = buildWorkflowStateCompatibilityReport(tasks);
    expect(report.totalTasks).toBe(6);
    expect(report.legacyAssignedCount).toBe(3);
    expect(report.eligibleLegacyAssignedCount).toBe(1);
    expect(report.excludedLegacyAssigned).toEqual({
      missingAssignee: 1,
      missingWorkOrder: 1,
    });
    expect(report.canonicalStatusCounts.READY).toBe(4);
    expect(report.reviewMissingStructuredCount).toBe(1);
    expect(report.blockedMissingStructuredCount).toBe(1);
    expect(tasks.map((task) => task.status)).toEqual([
      "ASSIGNED",
      "ASSIGNED",
      "ASSIGNED",
      "READY",
      "REVIEW",
      "BLOCKED",
    ]);
  });
});
