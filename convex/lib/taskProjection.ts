import type { Doc, Id } from "../_generated/dataModel";
import { canonicalTaskStatus } from "./taskWorkflowState";

export type TaskGovernanceStatus = "UNGOVERNED" | "GOVERNED" | "LEGACY";
export const UNGOVERNED_TRANSITION_ERROR =
  "Link this Task to a Work Order before execution.";

type ProjectionTask = Pick<
  Doc<"tasks">,
  "_id" | "projectId" | "workOrderId" | "metadata"
>;

type ProjectionRun = Pick<
  Doc<"workflowRuns">,
  "_id" | "parentTaskId" | "status" | "startedAt" | "steps" | "attemptPurpose" | "verificationAttemptBinding"
  | "lease" | "runtimeDisposition" | "runtimeDispositionReason"
>;

type ProjectionReceipt = Pick<
  Doc<"verificationReceipts">,
  "_id" | "_creationTime" | "workflowRunId" | "verificationAttemptId" | "receiptScope" | "status" | "verdict" | "recordedAt"
>;

export function deriveTaskGovernanceStatus(
  task: ProjectionTask,
  workOrder?: Doc<"workOrders"> | null
): TaskGovernanceStatus {
  if (
    task.workOrderId &&
    workOrder?._id === task.workOrderId &&
    workOrder.projectId === task.projectId
  ) {
    return "GOVERNED";
  }

  const metadata = task.metadata as
    | { governanceOrigin?: string }
    | undefined;
  if (!task.workOrderId && metadata?.governanceOrigin === "UNGOVERNED_INTAKE") {
    return "UNGOVERNED";
  }

  return "LEGACY";
}

export function taskWorkOrderLinkError(
  projectId: Id<"projects"> | undefined,
  workOrder: Pick<Doc<"workOrders">, "projectId"> | null
) {
  if (!workOrder) return "The selected Work Order no longer exists.";
  if (workOrder.projectId !== projectId) {
    return "Task and Work Order must belong to the same workspace.";
  }
  return null;
}

export function governanceTransitionError(
  governanceStatus: TaskGovernanceStatus,
  toStatus: Doc<"tasks">["status"]
) {
  return governanceStatus === "UNGOVERNED" && toStatus !== "CANCELED"
    ? UNGOVERNED_TRANSITION_ERROR
    : null;
}

export function buildAttemptProjection(
  runs: ProjectionRun[],
  receipts: ProjectionReceipt[] = [],
  now = Date.now(),
) {
  const ordered = [...runs].sort(
    (left, right) => left.startedAt - right.startedAt
  );
  const current = ordered.length > 0 ? ordered[ordered.length - 1] : null;
  const verificationReceipt = current?.attemptPurpose === "VERIFICATION"
    ? [...receipts]
        .filter((receipt) => receipt.receiptScope === "WORK_ORDER"
          && (receipt.verificationAttemptId === current._id || receipt.workflowRunId === current._id))
        .sort((left, right) => (right.recordedAt ?? right._creationTime) - (left.recordedAt ?? left._creationTime))[0] ?? null
    : null;
  const sourceAttemptId = current?.attemptPurpose === "VERIFICATION"
    ? current.verificationAttemptBinding?.sourceAttemptId
    : undefined;
  const sourceAttemptIndex = sourceAttemptId
    ? ordered.findIndex((run) => run._id === sourceAttemptId)
    : -1;
  const sourceAttempt = sourceAttemptIndex >= 0 ? ordered[sourceAttemptIndex] : null;
  const execution = current ? attemptExecutionTruth(current, now) : null;
  return {
    currentAttemptId: current?._id ?? null,
    currentAttemptNumber: current ? ordered.length : 0,
    currentAttemptStatus: current?.status ?? null,
    currentAttemptExecutionState: execution?.state ?? null,
    currentAttemptExecutionReason: execution?.reason ?? null,
    currentAttemptPurpose: current?.attemptPurpose ?? "IMPLEMENTATION",
    currentVerificationStatus: verificationReceipt?.status ?? null,
    currentVerificationVerdict: verificationReceipt?.verdict ?? null,
    currentSourceAttemptNumber: sourceAttempt ? sourceAttemptIndex + 1 : null,
    currentSourceAttemptStatus: sourceAttempt?.status ?? null,
    attemptCount: ordered.length,
    retryCount: Math.max(0, ordered.length - 1),
    internalStepRetryCount: ordered.reduce(
      (total, run) =>
        total +
        run.steps.reduce((runTotal, step) => runTotal + step.retryCount, 0),
      0
    ),
  };
}

function attemptExecutionTruth(run: ProjectionRun, now: number) {
  if (run.status === "PENDING") return { state: "QUEUED", reason: null };
  if (run.status === "RUNNING") {
    if (run.runtimeDisposition === "LOST") return { state: "STALE", reason: run.runtimeDispositionReason ?? "The executor is no longer owned." };
    if (!run.lease) return { state: "STALE", reason: "The Attempt is marked RUNNING but has no active lease." };
    if (run.lease.expiresAt <= now) return { state: "STALE", reason: "The Attempt lease expired without a terminal report." };
    return { state: "RUNNING", reason: null };
  }
  if (run.status === "COMPLETED") return { state: "COMPLETED_SUCCESS", reason: null };
  if (run.status === "FAILED") return { state: "COMPLETED_FAILURE", reason: run.runtimeDispositionReason ?? null };
  if (run.status === "CANCELED") return { state: "CANCELLED", reason: null };
  if (run.status === "PAUSED") return { state: "BLOCKED", reason: run.runtimeDispositionReason ?? null };
  return { state: run.status, reason: run.runtimeDispositionReason ?? null };
}

export function projectTask(
  task: Doc<"tasks">,
  workOrder: Doc<"workOrders"> | null,
  mission: Doc<"missions"> | null,
  runs: Doc<"workflowRuns">[],
  receipts: Doc<"verificationReceipts">[] = []
) {
  const governanceStatus = deriveTaskGovernanceStatus(task, workOrder);
  const metadata = task.metadata as
    | { workflowAttempt?: { attemptNumber?: number; retryNumber?: number } }
    | undefined;
  return {
    ...task,
    presentationStatus: canonicalTaskStatus(task.status),
    parentDelivery: {
      governanceStatus,
      workOrderId: workOrder?._id ?? null,
      workOrderTitle: workOrder?.title ?? null,
      workOrderState: workOrder?.state ?? null,
      workflowId: workOrder?.workflowId ?? null,
      repository: workOrder?.repository ?? null,
      repositoryId: workOrder?.repositoryId ?? null,
      codeScopeIds: workOrder?.codeScopeIds ?? [],
      executionEnvironment: workOrder?.executionEnvironment ?? null,
      riskLevel: workOrder?.riskLevel ?? null,
      missionId: mission?._id ?? null,
      missionTitle: mission?.title ?? null,
      relationshipValid:
        governanceStatus === "GOVERNED" || governanceStatus === "UNGOVERNED",
    },
    attempt: {
      ...buildAttemptProjection(runs, receipts),
      legacyRetryAmbiguous:
        runs.length === 0 && metadata?.workflowAttempt?.attemptNumber != null,
    },
  };
}

export async function loadTaskProjections(
  ctx: { db: any },
  tasks: Doc<"tasks">[],
  projectId?: Id<"projects">
) {
  if (tasks.length === 0) return [];

  const [workOrders, missions, workflowRuns, verificationReceipts] = await Promise.all([
    projectId
      ? ctx.db
          .query("workOrders")
          .withIndex("by_project", (query: any) =>
            query.eq("projectId", projectId)
          )
          .collect()
      : ctx.db.query("workOrders").collect(),
    projectId
      ? ctx.db
          .query("missions")
          .withIndex("by_project", (query: any) =>
            query.eq("projectId", projectId)
          )
          .collect()
      : ctx.db.query("missions").collect(),
    projectId
      ? ctx.db
          .query("workflowRuns")
          .withIndex("by_project", (query: any) =>
            query.eq("projectId", projectId)
          )
          .collect()
      : ctx.db.query("workflowRuns").collect(),
    projectId
      ? ctx.db
          .query("verificationReceipts")
          .withIndex("by_project", (query: any) =>
            query.eq("projectId", projectId)
          )
          .collect()
      : ctx.db.query("verificationReceipts").collect(),
  ]);

  const workOrderMap = new Map(
    (workOrders as Doc<"workOrders">[]).map((workOrder) => [
      workOrder._id,
      workOrder,
    ])
  );
  const missionMap = new Map(
    (missions as Doc<"missions">[]).map((mission) => [mission._id, mission])
  );
  const runsByTask = new Map<Id<"tasks">, Doc<"workflowRuns">[]>();
  for (const run of workflowRuns as Doc<"workflowRuns">[]) {
    if (!run.parentTaskId) continue;
    const taskRuns = runsByTask.get(run.parentTaskId) ?? [];
    taskRuns.push(run);
    runsByTask.set(run.parentTaskId, taskRuns);
  }
  const receiptsByAttempt = new Map<Id<"workflowRuns">, Doc<"verificationReceipts">[]>();
  for (const receipt of verificationReceipts as Doc<"verificationReceipts">[]) {
    if (receipt.receiptScope !== "WORK_ORDER") continue;
    const attemptIds = new Set([receipt.workflowRunId, receipt.verificationAttemptId].filter(Boolean) as Id<"workflowRuns">[]);
    for (const attemptId of attemptIds) {
      const attemptReceipts = receiptsByAttempt.get(attemptId) ?? [];
      attemptReceipts.push(receipt);
      receiptsByAttempt.set(attemptId, attemptReceipts);
    }
  }

  return tasks.map((task) => {
    const workOrder = task.workOrderId
      ? workOrderMap.get(task.workOrderId) ?? null
      : null;
    const mission = workOrder?.missionId
      ? missionMap.get(workOrder.missionId) ?? null
      : null;
    const taskRuns = runsByTask.get(task._id) ?? [];
    const taskReceipts = Array.from(new Map(
      taskRuns.flatMap((run) => receiptsByAttempt.get(run._id) ?? [])
        .map((receipt) => [receipt._id, receipt])
    ).values());
    return projectTask(task, workOrder, mission, taskRuns, taskReceipts);
  });
}
