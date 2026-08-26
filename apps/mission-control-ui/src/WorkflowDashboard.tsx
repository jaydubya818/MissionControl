/**
 * Workflow Dashboard
 *
 * Overview of all workflow runs with filtering and search.
 * Inspired by Antfarm's dashboard command.
 */

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { WorkflowRunPanel } from "./WorkflowRunPanel";
import { PageHeader } from "./components/factory/DetailLayout";
import { StatusBadge, type StatusBadgeProps } from "./components/factory/badges";

const RUN_STATUS_TONE: Record<string, StatusBadgeProps["tone"]> = {
  PENDING: "neutral",
  RUNNING: "info",
  COMPLETED: "success",
  FAILED: "error",
  PAUSED: "warning",
};

const RUN_BAR_CLASS: Record<string, string> = {
  PENDING: "bg-ink-muted",
  RUNNING: "bg-info-accent",
  COMPLETED: "bg-ok",
  FAILED: "bg-err",
  PAUSED: "bg-warn",
};

export function WorkflowDashboard({ projectId }: { projectId?: Id<"projects"> }) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const runs = useQuery(
    api.workflowRuns.list,
    projectId ? { projectId, status: statusFilter, limit: 50 } : "skip",
  );

  const workflows = useQuery(api.workflows.list, {});

  const workflowMap = new Map(workflows?.map((w) => [w.workflowId, w]) ?? []);

  const filters: { label: string; value: string | undefined }[] = [
    { label: "All", value: undefined },
    { label: "Running", value: "RUNNING" },
    { label: "Completed", value: "COMPLETED" },
    { label: "Failed", value: "FAILED" },
    { label: "Paused", value: "PAUSED" },
  ];

  return (
    <div className="flex h-full flex-1 bg-app text-ink">
      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <PageHeader
          title="Workflow runs"
          description="Multi-agent workflow execution dashboard"
        />

        {/* Filters */}
        <div className="border-b border-line px-6 pb-4">
          <div className="inline-flex items-center rounded-lg border border-line p-0.5">
            {filters.map((f) => (
              <button
                key={f.label}
                onClick={() => setStatusFilter(f.value)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[12.5px] font-medium transition-colors duration-150",
                  statusFilter === f.value
                    ? "bg-surface-2 text-ink"
                    : "text-ink-muted hover:text-ink-secondary"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Runs list */}
        <div className="flex-1 overflow-y-auto p-6">
          {!runs || runs.length === 0 ? (
            <div className="rounded-xl border border-line bg-surface-1 px-5 py-14 text-center">
              <div className="text-[15px] font-semibold text-ink">No workflow runs yet</div>
              <div className="mt-1 text-[13px] text-ink-muted">Start a workflow to see it here</div>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-4">
              {runs.map((run) => {
                const workflow = workflowMap.get(run.workflowId);
                const completedSteps = run.steps.filter((s) => s.status === "DONE").length;

                return (
                  <button
                    key={run._id}
                    type="button"
                    onClick={() => setSelectedRunId(run.runId)}
                    className="rounded-xl border border-line bg-surface-1 p-4 text-left transition-colors duration-150 hover:border-line-strong hover:bg-surface-2"
                  >
                    <StatusBadge tone={RUN_STATUS_TONE[run.status] ?? "neutral"}>
                      {run.status}
                    </StatusBadge>

                    <div className="mt-3 text-[15px] font-semibold text-ink">
                      {workflow?.name ?? run.workflowId}
                    </div>

                    <div className="mt-0.5 font-mono text-[11.5px] text-ink-muted">{run.runId}</div>

                    <div className="mt-3 max-h-10 overflow-hidden text-ellipsis text-[13px] text-ink-secondary">
                      {run.initialInput}
                    </div>

                    <div className="mt-3 text-[12px] text-ink-muted">
                      {completedSteps} / {run.totalSteps} steps completed
                    </div>

                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className={cn(
                          "h-full rounded-full transition-[width] duration-200",
                          RUN_BAR_CLASS[run.status] ?? "bg-ink-muted"
                        )}
                        style={{ width: `${(completedSteps / run.totalSteps) * 100}%` }}
                      />
                    </div>

                    <div className="mt-3 text-[11.5px] text-ink-muted">
                      {new Date(run.startedAt).toLocaleString()}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Side panel */}
      {selectedRunId && (
        <WorkflowRunPanel
          runId={selectedRunId}
          onClose={() => setSelectedRunId(null)}
        />
      )}
    </div>
  );
}
