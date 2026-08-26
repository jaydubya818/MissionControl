import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { GitBranch, Clock, CheckCircle2, XCircle, Loader2, Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/factory/badges";
import { StatusDot } from "@/components/ui/status-dot";
import { SkeletonCard } from "@/components/ui/skeleton-card";
import { EmptyState } from "@/components/ui/empty-state";

interface CodePipelineViewProps {
  projectId: Id<"projects"> | null;
  onTaskSelect?: (taskId: Id<"tasks">) => void;
}

export function CodePipelineView({ projectId, onTaskSelect }: CodePipelineViewProps) {
  const workflowRuns = useQuery(api.workflowRuns.list, projectId ? { projectId } : "skip");
  const tasks = useQuery(api.tasks.listAll, projectId ? { projectId } : "skip");

  const isLoading = !workflowRuns || !tasks;

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-6 py-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} lines={3} />
        ))}
      </div>
    );
  }

  // Derive pipeline runs from tasks with workflow associations
  const activeTasks = tasks.filter((t) =>
    ["IN_PROGRESS", "REVIEW", "NEEDS_APPROVAL"].includes(t.status)
  );
  const runningWorkflowRuns = workflowRuns.filter((run) => run.status === "RUNNING").length;
  const recentCompleted = tasks
    .filter((t) => t.status === "DONE")
    .sort((a, b) => b._creationTime - a._creationTime)
    .slice(0, 10);

  const statusIcon = (status: string) => {
    switch (status) {
      case "IN_PROGRESS":
        return <Loader2 className="h-3.5 w-3.5 animate-spin text-warn" strokeWidth={1.75} />;
      case "REVIEW":
        return <Clock className="h-3.5 w-3.5 text-info-accent" strokeWidth={1.75} />;
      case "DONE":
        return <CheckCircle2 className="h-3.5 w-3.5 text-ok" strokeWidth={1.75} />;
      case "CANCELED":
        return <XCircle className="h-3.5 w-3.5 text-ink-muted" strokeWidth={1.75} />;
      default:
        return <Activity className="h-3.5 w-3.5 text-info-accent" strokeWidth={1.75} />;
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 py-6">
      <header className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">
            Code Pipeline
          </h1>
          <StatusBadge tone="neutral">{activeTasks.length} active</StatusBadge>
        </div>
        <p className="mt-1.5 text-[14px] text-ink-secondary">
          Workflow runs, execution requests, and active code delivery lanes.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="text-[12.5px] font-medium text-ink-secondary">Active runs</div>
          <div className="mt-2 font-mono text-[26px] font-semibold leading-none text-ink">{activeTasks.length}</div>
          <div className="mt-1.5 text-[12px] text-ink-muted">Tasks currently pushing code execution forward</div>
        </Card>
        <Card className="p-4">
          <div className="text-[12.5px] font-medium text-ink-secondary">Workflow runs</div>
          <div className="mt-2 font-mono text-[26px] font-semibold leading-none text-ink">{workflowRuns.length}</div>
          <div className="mt-1.5 text-[12px] text-ink-muted">Recorded pipeline runs associated with this project</div>
        </Card>
        <Card className="p-4">
          <div className="text-[12.5px] font-medium text-ink-secondary">Running now</div>
          <div className="mt-2 font-mono text-[26px] font-semibold leading-none text-ink">{runningWorkflowRuns}</div>
          <div className="mt-1.5 text-[12px] text-ink-muted">Workflow runs still executing in the background</div>
        </Card>
        <Card className="p-4">
          <div className="text-[12.5px] font-medium text-ink-secondary">Recently done</div>
          <div className="mt-2 font-mono text-[26px] font-semibold leading-none text-ink">{recentCompleted.length}</div>
          <div className="mt-1.5 text-[12px] text-ink-muted">Recently completed tasks available for review</div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      {/* Active Runs */}
      <Card className="p-5">
        <h2 className="mb-3 text-[15px] font-semibold text-ink">Active Runs</h2>

        {activeTasks.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No active runs"
            description="All pipelines are idle. Create a workflow to get started."
            className="border-0 bg-transparent py-8"
          />
        ) : (
          <div className="space-y-2">
            {activeTasks.map((task) => (
              <div
                key={task._id}
                className="cursor-pointer rounded-lg border border-line p-3 transition-colors duration-150 hover:bg-surface-2"
                onClick={() => onTaskSelect?.(task._id)}
              >
                <div className="flex items-center gap-3">
                  {statusIcon(task.status)}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-ink">
                      {task.title}
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink-muted">
                      {task.type} &middot; P{task.priority} &middot; <span className="font-mono">${task.actualCost.toFixed(2)}</span>
                    </p>
                  </div>
                  <StatusDot
                    variant={task.status === "IN_PROGRESS" ? "active" : "warning"}
                    size="sm"
                    label={task.status.replace("_", " ")}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="space-y-4">
        {workflowRuns && workflowRuns.length > 0 && (
          <Card className="p-5">
            <h2 className="mb-3 text-[15px] font-semibold text-ink">Workflow Runs</h2>
            <div className="space-y-2">
              {workflowRuns.slice(0, 8).map((run) => (
                <div key={run._id} className="rounded-lg border border-line p-3">
                  <div className="flex items-center gap-3">
                    <GitBranch className="h-3.5 w-3.5 text-ink-muted" strokeWidth={1.75} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-ink">
                        Workflow Run <span className="font-mono">#{run._id.slice(-6)}</span>
                      </p>
                      <p className="mt-0.5 text-[12px] text-ink-muted">
                        {run.status} &middot;{" "}
                        {new Date(run._creationTime).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <StatusDot
                      variant={
                        run.status === "RUNNING"
                          ? "active"
                          : run.status === "COMPLETED"
                            ? "healthy"
                            : run.status === "FAILED"
                              ? "error"
                              : "offline"
                      }
                      size="sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card className="p-5">
          <div className="text-[15px] font-semibold text-ink">Operator brief</div>
          <div className="mt-2 space-y-3 text-[13px] leading-relaxed text-ink-secondary">
            <p>Use this page to track real execution lanes, not just completed work. The highest-signal items are active runs and failures that need rerouting.</p>
            <p>If a workflow run is healthy but the task is stuck, the problem is usually scope or approval friction rather than infrastructure.</p>
          </div>
        </Card>
      </div>
      </div>

      {/* Recent Completed */}
      <Card className="p-5">
        <h2 className="mb-3 text-[15px] font-semibold text-ink">Recently Completed</h2>
        {recentCompleted.length === 0 ? (
          <div className="py-6 text-center text-[12.5px] text-ink-muted">
            No completed runs yet
          </div>
        ) : (
          <div className="space-y-2">
            {recentCompleted.map((task) => (
              <div
                key={task._id}
                className="cursor-pointer rounded-lg border border-line p-3 transition-colors duration-150 hover:bg-surface-2"
                onClick={() => onTaskSelect?.(task._id)}
              >
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-3.5 w-3.5 text-ok" strokeWidth={1.75} />
                  <p className="flex-1 truncate text-[13px] text-ink-secondary">
                    {task.title}
                  </p>
                  <span className="text-[12px] text-ink-muted">
                    {new Date(task._creationTime).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
