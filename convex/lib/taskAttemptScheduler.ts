export type SchedulableTask = {
  _id: string;
  projectId?: string;
  workOrderId?: string;
  status: string;
};

export type TaskAttemptRun = {
  _id: string;
  parentTaskId?: string;
  workOrderId?: string;
  status: string;
  startedAt: number;
};

export type TaskAttemptSelectionResult =
  | { ok: true; taskId: string | null }
  | { ok: false; reason: string };

const ACTIVE_ATTEMPT_STATUSES = new Set(["PENDING", "RUNNING", "PAUSED"]);
const TERMINAL_TASK_STATUSES = new Set(["DONE", "CANCELED"]);
const SCHEDULABLE_TASK_STATUSES = new Set(["READY", "ASSIGNED", "IN_PROGRESS"]);

export function validateTaskAttemptSelection(args: {
  workOrderId: string;
  projectId?: string;
  hasCanonicalChildTasks: boolean;
  task?: SchedulableTask | null;
}): TaskAttemptSelectionResult {
  if (!args.task) {
    return args.hasCanonicalChildTasks
      ? { ok: false, reason: "task-selection-required" }
      : { ok: true, taskId: null };
  }
  if (args.task.workOrderId !== args.workOrderId) {
    return { ok: false, reason: "task-work-order-mismatch" };
  }
  if (args.task.projectId !== args.projectId) {
    return { ok: false, reason: "task-workspace-mismatch" };
  }
  if (TERMINAL_TASK_STATUSES.has(args.task.status)) {
    return {
      ok: false,
      reason: `task-terminal:${args.task.status}`,
    };
  }
  if (!SCHEDULABLE_TASK_STATUSES.has(args.task.status)) {
    return {
      ok: false,
      reason: `task-not-schedulable:${args.task.status}`,
    };
  }
  return { ok: true, taskId: args.task._id };
}

export function validateTaskAttemptStart(args: {
  taskId: string;
  attempts: TaskAttemptRun[];
  retryOfRun?: TaskAttemptRun | null;
  retryReason?: string;
}): { ok: true } | { ok: false; reason: string } {
  const ordered = [...args.attempts].sort(
    (left, right) =>
      left.startedAt - right.startedAt || left._id.localeCompare(right._id),
  );
  const active = ordered.find((run) => ACTIVE_ATTEMPT_STATUSES.has(run.status));
  if (active) return { ok: false, reason: "active-task-attempt-exists" };

  if (!args.retryOfRun) {
    return ordered.length === 0
      ? { ok: true }
      : { ok: false, reason: "task-retry-required" };
  }

  if (args.retryOfRun.parentTaskId !== args.taskId) {
    return { ok: false, reason: "retry-run-task-mismatch" };
  }
  const latest = ordered.length > 0 ? ordered[ordered.length - 1] : undefined;
  if (!latest || latest._id !== args.retryOfRun._id) {
    return { ok: false, reason: "retry-run-not-latest" };
  }
  if (args.retryOfRun.status !== "FAILED") {
    return {
      ok: false,
      reason: `retry-run-not-failed:${args.retryOfRun.status}`,
    };
  }
  if ((args.retryReason?.trim().length ?? 0) < 10) {
    return { ok: false, reason: "retry-reason-required" };
  }
  return { ok: true };
}

export function nextTaskAttemptNumbers(
  attempts: TaskAttemptRun[],
  isRetry: boolean,
) {
  return {
    attemptNumber: attempts.length + 1,
    retryNumber: isRetry ? attempts.length : 0,
  };
}

export function taskAttemptErrorMessage(reason: string) {
  if (reason === "task-selection-required") {
    return "Select a Child Task before dispatch.";
  }
  if (reason === "task-work-order-mismatch") {
    return "The selected Task does not belong to this Work Order.";
  }
  if (reason === "task-workspace-mismatch") {
    return "The selected Task and Work Order must belong to the same workspace.";
  }
  if (reason.startsWith("task-terminal:")) {
    return "A completed or canceled Task cannot start an Attempt.";
  }
  if (reason.startsWith("task-not-schedulable:")) {
    return "Move this Task to Ready before starting an Attempt.";
  }
  if (reason === "active-task-attempt-exists") {
    return "This Task already has an active Attempt.";
  }
  if (reason === "task-retry-required") {
    return "Retry the latest failed Attempt instead of starting a new Attempt.";
  }
  if (reason === "retry-run-task-mismatch") {
    return "The failed Attempt belongs to a different Task.";
  }
  if (reason === "retry-run-not-latest") {
    return "Only the latest failed Attempt can be retried.";
  }
  if (reason.startsWith("retry-run-not-failed:")) {
    return "Only a failed Attempt can be retried.";
  }
  if (reason === "retry-reason-required") {
    return "Explain what changed before retrying (at least 10 characters).";
  }
  return `Task Attempt is not dispatchable (${reason}).`;
}
