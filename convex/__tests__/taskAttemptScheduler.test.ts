import { describe, expect, it } from "vitest";
import {
  nextTaskAttemptNumbers,
  taskAttemptErrorMessage,
  validateTaskAttemptSelection,
  validateTaskAttemptStart,
  type TaskAttemptRun,
} from "../lib/taskAttemptScheduler";

const task = {
  _id: "task-a",
  projectId: "project-a",
  workOrderId: "work-order-a",
  status: "READY",
};

function attempt(
  id: string,
  status: string,
  startedAt: number,
  parentTaskId = task._id,
): TaskAttemptRun {
  return {
    _id: id,
    parentTaskId,
    workOrderId: task.workOrderId,
    status,
    startedAt,
  };
}

describe("Task Attempt selection", () => {
  it("requires explicit Task selection when canonical children exist", () => {
    expect(
      validateTaskAttemptSelection({
        workOrderId: task.workOrderId,
        projectId: task.projectId,
        hasCanonicalChildTasks: true,
      }),
    ).toEqual({ ok: false, reason: "task-selection-required" });
  });

  it("preserves legacy dispatch when no canonical children exist", () => {
    expect(
      validateTaskAttemptSelection({
        workOrderId: task.workOrderId,
        projectId: task.projectId,
        hasCanonicalChildTasks: false,
      }),
    ).toEqual({ ok: true, taskId: null });
  });

  it("accepts a governed same-workspace Child Task", () => {
    expect(
      validateTaskAttemptSelection({
        workOrderId: task.workOrderId,
        projectId: task.projectId,
        hasCanonicalChildTasks: true,
        task,
      }),
    ).toEqual({ ok: true, taskId: task._id });
  });

  it("keeps legacy ASSIGNED Child Tasks schedulable during compatibility", () => {
    expect(
      validateTaskAttemptSelection({
        workOrderId: task.workOrderId,
        projectId: task.projectId,
        hasCanonicalChildTasks: true,
        task: { ...task, status: "ASSIGNED" },
      }),
    ).toEqual({ ok: true, taskId: task._id });
  });

  it.each([
    [{ ...task, workOrderId: "other" }, "task-work-order-mismatch"],
    [{ ...task, projectId: "other" }, "task-workspace-mismatch"],
    [{ ...task, status: "INBOX" }, "task-not-schedulable:INBOX"],
    [{ ...task, status: "REVIEW" }, "task-not-schedulable:REVIEW"],
    [{ ...task, status: "DONE" }, "task-terminal:DONE"],
    [{ ...task, status: "CANCELED" }, "task-terminal:CANCELED"],
  ])("rejects invalid Task target %#", (candidate, reason) => {
    expect(
      validateTaskAttemptSelection({
        workOrderId: task.workOrderId,
        projectId: task.projectId,
        hasCanonicalChildTasks: true,
        task: candidate,
      }),
    ).toEqual({ ok: false, reason });
  });
});

describe("Task Attempt start and retry", () => {
  it("allows the first Attempt", () => {
    expect(
      validateTaskAttemptStart({ taskId: task._id, attempts: [] }),
    ).toEqual({ ok: true });
  });

  it("requires retry after an Attempt already exists", () => {
    expect(
      validateTaskAttemptStart({
        taskId: task._id,
        attempts: [attempt("run-1", "COMPLETED", 1)],
      }),
    ).toEqual({ ok: false, reason: "task-retry-required" });
  });

  it.each(["PENDING", "RUNNING", "PAUSED"])(
    "blocks a new Attempt while %s is active",
    (status) => {
      expect(
        validateTaskAttemptStart({
          taskId: task._id,
          attempts: [attempt("run-1", status, 1)],
        }),
      ).toEqual({ ok: false, reason: "active-task-attempt-exists" });
    },
  );

  it("allows a reasoned retry of the latest failed Attempt", () => {
    const failed = attempt("run-2", "FAILED", 2);
    expect(
      validateTaskAttemptStart({
        taskId: task._id,
        attempts: [attempt("run-1", "FAILED", 1), failed],
        retryOfRun: failed,
        retryReason: "Environment configuration was corrected.",
      }),
    ).toEqual({ ok: true });
  });

  it("rejects retry of another Task or an older Attempt", () => {
    const older = attempt("run-1", "FAILED", 1);
    const latest = attempt("run-2", "FAILED", 2);
    expect(
      validateTaskAttemptStart({
        taskId: task._id,
        attempts: [older, latest],
        retryOfRun: older,
        retryReason: "Retry the older failed run.",
      }),
    ).toEqual({ ok: false, reason: "retry-run-not-latest" });
    expect(
      validateTaskAttemptStart({
        taskId: task._id,
        attempts: [latest],
        retryOfRun: { ...latest, parentTaskId: "task-b" },
        retryReason: "Retry the other Task run.",
      }),
    ).toEqual({ ok: false, reason: "retry-run-task-mismatch" });
  });

  it("requires a failed run and an actionable reason", () => {
    const completed = attempt("run-1", "COMPLETED", 1);
    expect(
      validateTaskAttemptStart({
        taskId: task._id,
        attempts: [completed],
        retryOfRun: completed,
        retryReason: "This run should not retry.",
      }),
    ).toEqual({
      ok: false,
      reason: "retry-run-not-failed:COMPLETED",
    });

    const failed = attempt("run-2", "FAILED", 2);
    expect(
      validateTaskAttemptStart({
        taskId: task._id,
        attempts: [failed],
        retryOfRun: failed,
        retryReason: "retry",
      }),
    ).toEqual({ ok: false, reason: "retry-reason-required" });
  });

  it("assigns one Attempt number and one retry number per immutable run", () => {
    expect(nextTaskAttemptNumbers([], false)).toEqual({
      attemptNumber: 1,
      retryNumber: 0,
    });
    expect(
      nextTaskAttemptNumbers(
        [attempt("run-1", "FAILED", 1), attempt("run-2", "FAILED", 2)],
        true,
      ),
    ).toEqual({ attemptNumber: 3, retryNumber: 2 });
  });

  it("returns actionable operator errors", () => {
    expect(taskAttemptErrorMessage("task-selection-required")).toBe(
      "Select a Child Task before dispatch.",
    );
    expect(taskAttemptErrorMessage("retry-run-not-latest")).toBe(
      "Only the latest failed Attempt can be retried.",
    );
  });
});
