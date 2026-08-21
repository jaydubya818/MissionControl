import { describe, expect, it } from "vitest";
import { planAcceptedWorkOrderParentSync } from "../lib/workOrderParentSync";

describe("accepted WorkOrder parent sync", () => {
  it("does nothing when the WorkOrder has no linked parent", () => {
    expect(planAcceptedWorkOrderParentSync({})).toEqual({
      action: "NOOP",
      reason: "no-linked-parent",
    });
  });

  it("treats READY as an actionable parent state", () => {
    // Regression: `READY` is a live tasks.status value and is what
    // reopenWorkOrder resets a canceled parent task to, but it was in neither
    // the actionable nor the protected set — so accept() threw
    // "unsupported state READY" and the WorkOrder could never be accepted.
    expect(
      planAcceptedWorkOrderParentSync({
        legacyTaskId: "task-1",
        workOrderProjectId: "project-1",
        parentTask: { status: "READY", projectId: "project-1" },
      })
    ).toEqual({
      action: "SYNC",
      reason: "accepted-work-order",
      fromStatus: "READY",
    });
  });

  it("rejects a missing linked parent", () => {
    expect(
      planAcceptedWorkOrderParentSync({
        legacyTaskId: "task-1",
        workOrderProjectId: "project-1",
        parentTask: null,
      })
    ).toMatchObject({
      action: "CONFLICT",
      reason: "linked-parent-not-found",
    });
  });

  it("rejects a cross-project parent", () => {
    expect(
      planAcceptedWorkOrderParentSync({
        legacyTaskId: "task-1",
        workOrderProjectId: "project-1",
        parentTask: { status: "INBOX", projectId: "project-2" },
      })
    ).toMatchObject({ action: "CONFLICT", reason: "project-mismatch" });
  });

  it("treats an already completed parent as idempotently synchronized", () => {
    expect(
      planAcceptedWorkOrderParentSync({
        legacyTaskId: "task-1",
        workOrderProjectId: "project-1",
        parentTask: { status: "DONE", projectId: "project-1" },
      })
    ).toEqual({
      action: "ALREADY_SYNCED",
      reason: "parent-already-done",
    });
  });

  it.each([
    "INBOX",
    "ASSIGNED",
    "IN_PROGRESS",
    "REVIEW",
    "NEEDS_APPROVAL",
  ])("synchronizes actionable parent state %s", (status) => {
    expect(
      planAcceptedWorkOrderParentSync({
        legacyTaskId: "task-1",
        workOrderProjectId: "project-1",
        parentTask: { status, projectId: "project-1" },
      })
    ).toEqual({
      action: "SYNC",
      reason: "accepted-work-order",
      fromStatus: status,
    });
  });

  it.each(["BLOCKED", "FAILED", "CANCELED"])(
    "preserves protected parent state %s",
    (status) => {
      expect(
        planAcceptedWorkOrderParentSync({
          legacyTaskId: "task-1",
          workOrderProjectId: "project-1",
          parentTask: { status, projectId: "project-1" },
        })
      ).toMatchObject({
        action: "CONFLICT",
        reason: "protected-parent-state",
      });
    }
  );

  it("rejects an unknown parent state conservatively", () => {
    expect(
      planAcceptedWorkOrderParentSync({
        legacyTaskId: "task-1",
        workOrderProjectId: "project-1",
        parentTask: { status: "ARCHIVED", projectId: "project-1" },
      })
    ).toMatchObject({
      action: "CONFLICT",
      reason: "unknown-parent-state",
    });
  });
});
