export type GraphNodeStatus =
  | "PENDING"
  | "RUNNING"
  | "DONE"
  | "FAILED"
  | "SKIPPED"
  | "BLOCKED";

export interface GraphRunLike {
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "PAUSED" | "CANCELED";
  failureReason?: string;
  steps: Array<{
    status: GraphNodeStatus;
    kind?: "AGENT" | "REDUCE" | "ROUTER" | "VERIFY" | "GATE" | "DETERMINISTIC";
    error?: string;
  }>;
}

export interface GraphExecutionSummary {
  total: number;
  complete: number;
  active: number;
  failed: number;
  blocked: number;
  verificationTotal: number;
  verificationComplete: number;
  progressPercent: number;
  failureReason?: string;
}

export function summarizeGraphExecution(run: GraphRunLike): GraphExecutionSummary {
  const complete = run.steps.filter((step) =>
    step.status === "DONE" || step.status === "SKIPPED"
  ).length;
  const verificationSteps = run.steps.filter((step) => step.kind === "VERIFY");

  return {
    total: run.steps.length,
    complete,
    active: run.steps.filter((step) => step.status === "RUNNING").length,
    failed: run.steps.filter((step) => step.status === "FAILED").length,
    blocked: run.steps.filter((step) => step.status === "BLOCKED").length,
    verificationTotal: verificationSteps.length,
    verificationComplete: verificationSteps.filter((step) =>
      step.status === "DONE" || step.status === "SKIPPED"
    ).length,
    progressPercent: run.steps.length === 0
      ? 0
      : Math.round((complete / run.steps.length) * 100),
    failureReason:
      run.failureReason ??
      run.steps.find((step) => step.status === "FAILED")?.error,
  };
}

export type GraphDispatchState =
  | "LOADING"
  | "MISSING_WORK_ORDER"
  | "READY"
  | "QUEUED"
  | "RUNNING"
  | "AWAITING_APPROVAL"
  | "COMPLETED"
  | "RECOVERY_REQUIRED"
  | "UNAVAILABLE";

export function graphDispatchState(args: {
  loading: boolean;
  workOrder?: { state: string } | null;
  run?: Pick<GraphRunLike, "status" | "steps"> | null;
}): GraphDispatchState {
  if (args.loading) return "LOADING";
  if (!args.workOrder) return "MISSING_WORK_ORDER";
  if (!args.run) return args.workOrder.state === "READY" ? "READY" : "UNAVAILABLE";

  if (args.run.status === "PENDING") return "QUEUED";
  if (args.run.status === "RUNNING") {
    return args.run.steps.some(
      (step) => step.kind === "GATE" && step.status === "RUNNING"
    )
      ? "AWAITING_APPROVAL"
      : "RUNNING";
  }
  if (args.run.status === "PAUSED") return "AWAITING_APPROVAL";
  if (args.run.status === "COMPLETED") return "COMPLETED";
  if (args.run.status === "FAILED" || args.run.status === "CANCELED") {
    return "RECOVERY_REQUIRED";
  }
  return "UNAVAILABLE";
}

export type GraphDispatchTarget =
  | {
      kind: "CONTINUOUS_RESEARCH";
      cycleId: string;
    }
  | {
      kind: "LEGACY";
      workOrderId: string;
      idempotencyKey: string;
    };

export function buildGraphDispatchTarget(args: {
  cycleId: string;
  workOrderId: string;
  workOrderRevision: number;
  researchSourceRunIds?: readonly string[];
}): GraphDispatchTarget {
  if ((args.researchSourceRunIds ?? []).length > 0) {
    return {
      kind: "CONTINUOUS_RESEARCH",
      cycleId: args.cycleId,
    };
  }

  return {
    kind: "LEGACY",
    workOrderId: args.workOrderId,
    idempotencyKey: `graph-cycle:${args.cycleId}:dispatch:${args.workOrderRevision}`,
  };
}

export function graphDispatchPresentation(args: {
  evidenceBound: boolean;
  observationCount: number;
}) {
  if (!args.evidenceBound) {
    return {
      title: "Multi-agent execution graph",
      buttonLabel: "Dispatch graph",
      retryButtonLabel: "Retry graph",
      readyDetail: "Review the WorkOrder, then explicitly start the bounded read-only research graph.",
      boundaryDetail: "Dispatch starts research and verification Tasks only. Repository changes still require the cycle's explicit approval gate.",
    };
  }

  const observationLabel = `${args.observationCount} frozen observation${args.observationCount === 1 ? "" : "s"}`;
  return {
    title: "Frozen-evidence claim graph",
    buttonLabel: "Dispatch evidence graph",
    retryButtonLabel: "Replace and retry safely",
    readyDetail: `Dispatch creates a read-only claim-extraction Task over ${observationLabel}, followed by a separate Evidence Reviewer Task.`,
    boundaryDetail: "Only the exact frozen observation IDs and their cited artifacts are provided. Web discovery, recommendations, messaging, and repository changes are excluded.",
  };
}
