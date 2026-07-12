import type { Doc } from "../../../../convex/_generated/dataModel";

export type VerificationStatus = "pass" | "fail" | "pending" | "na";

export type VerificationRow = {
  id: string;
  kind: "outcome" | "criterion" | "run" | "approval" | "task";
  label: string;
  detail?: string;
  status: VerificationStatus;
  at?: number;
};

export type VerificationTrace = {
  outcome: string;
  criteria: Array<{ label: string; status: VerificationStatus; note?: string }>;
  evidence: VerificationRow[];
  summary: { pass: number; fail: number; pending: number };
};

function runStatusToVerification(status: Doc<"runs">["status"]): VerificationStatus {
  switch (status) {
    case "COMPLETED":
      return "pass";
    case "FAILED":
    case "TIMEOUT":
      return "fail";
    case "RUNNING":
      return "pending";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function approvalStatusToVerification(status: Doc<"approvals">["status"]): VerificationStatus {
  switch (status) {
    case "APPROVED":
      return "pass";
    case "DENIED":
    case "EXPIRED":
    case "CANCELED":
      return "fail";
    case "PENDING":
    case "ESCALATED":
      return "pending";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function taskStatusToVerification(status: Doc<"tasks">["status"]): VerificationStatus {
  switch (status) {
    case "DONE":
      return "pass";
    case "FAILED":
    case "CANCELED":
      return "fail";
    case "IN_PROGRESS":
    case "REVIEW":
    case "NEEDS_APPROVAL":
    case "BLOCKED":
    case "ASSIGNED":
    case "INBOX":
      return "pending";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function buildVerificationTrace(
  task: Doc<"tasks">,
  runs: Doc<"runs">[],
  approvals: Doc<"approvals">[],
): VerificationTrace {
  const outcome =
    task.deliverable?.summary?.trim() ||
    task.description?.trim() ||
    task.title;

  const criteria: VerificationTrace["criteria"] =
    task.reviewChecklist?.items.map((item) => ({
      label: item.label,
      status: item.checked ? "pass" : task.status === "DONE" ? "fail" : "pending",
      note: item.note,
    })) ??
    task.workPlan?.bullets.map((bullet) => ({
      label: bullet,
      status: task.status === "DONE" ? "pass" : "pending",
    })) ??
    [];

  const evidence: VerificationRow[] = [
    {
      id: "task-status",
      kind: "task",
      label: "Task status",
      detail: task.status.replace(/_/g, " "),
      status: taskStatusToVerification(task.status),
    },
    ...runs.map((run) => ({
      id: `run-${run._id}`,
      kind: "run" as const,
      label: `Agent run (${run.model})`,
      detail: run.error ?? run.status,
      status: runStatusToVerification(run.status),
      at: run.endedAt ?? run.startedAt,
    })),
    ...approvals.map((approval) => ({
      id: `approval-${approval._id}`,
      kind: "approval" as const,
      label: approval.actionSummary,
      detail: approval.status,
      status: approvalStatusToVerification(approval.status),
      at: approval.decidedAt ?? approval._creationTime,
    })),
  ];

  const summary = evidence.reduce(
    (acc, row) => {
      if (row.status === "pass") acc.pass += 1;
      else if (row.status === "fail") acc.fail += 1;
      else if (row.status === "pending") acc.pending += 1;
      return acc;
    },
    { pass: 0, fail: 0, pending: 0 },
  );

  return { outcome, criteria, evidence, summary };
}
