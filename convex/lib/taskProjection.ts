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
  "_id" | "parentTaskId" | "status" | "startedAt" | "steps"
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

export function buildAttemptProjection(runs: ProjectionRun[]) {
  const ordered = [...runs].sort(
    (left, right) => left.startedAt - right.startedAt
  );
  const current = ordered.length > 0 ? ordered[ordered.length - 1] : null;
  return {
    currentAttemptId: current?._id ?? null,
    currentAttemptNumber: current ? ordered.length : 0,
    currentAttemptStatus: current?.status ?? null,
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

export function projectTask(
  task: Doc<"tasks">,
  workOrder: Doc<"workOrders"> | null,
  mission: Doc<"missions"> | null,
  runs: Doc<"workflowRuns">[]
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
      riskLevel: workOrder?.riskLevel ?? null,
      missionId: mission?._id ?? null,
      missionTitle: mission?.title ?? null,
      relationshipValid:
        governanceStatus === "GOVERNED" || governanceStatus === "UNGOVERNED",
    },
    attempt: {
      ...buildAttemptProjection(runs),
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

  const [workOrders, missions, workflowRuns] = await Promise.all([
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

  return tasks.map((task) => {
    const workOrder = task.workOrderId
      ? workOrderMap.get(task.workOrderId) ?? null
      : null;
    const mission = workOrder?.missionId
      ? missionMap.get(workOrder.missionId) ?? null
      : null;
    return projectTask(task, workOrder, mission, runsByTask.get(task._id) ?? []);
  });
}
