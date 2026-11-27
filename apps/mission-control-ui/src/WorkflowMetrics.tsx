import { useState } from "react";
/**
 * Workflow Metrics Dashboard
 *
 * Analytics and performance tracking for workflows.
 */

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { PageHeader } from "./components/factory/DetailLayout";
import { MetricBlock, MetricRow } from "./components/factory/MetricBlock";

interface WorkflowMetricsProps {
  projectId?: Id<"projects">;
}

export function WorkflowMetrics({ projectId }: WorkflowMetricsProps) {
  const summary = useQuery(api.workflowMetrics.getSummary, { projectId });
  const allMetrics = useQuery(api.workflowMetrics.getAllMetrics, { projectId });
  const workflows = useQuery(api.workflows.list, {});
  const refreshMetrics = useMutation(api.workflowMetrics.refreshAll);

  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const handleRefresh = async () => {
    if (!projectId) return;
    setRefreshing(true); setRefreshError(null);
    try {
      await refreshMetrics({ projectId });
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : "Could not refresh metrics. Try again.");
    } finally { setRefreshing(false); }
  };

  if (!summary || !allMetrics || !workflows) {
    return (
      <div className="flex-1 bg-app p-6">
        <div className="h-4 w-40 animate-pulse rounded bg-surface-2" />
      </div>
    );
  }

  const workflowMap = new Map(workflows.map((w) => [w.workflowId, w]));

  return (
    <div className="min-h-full flex-1 bg-app text-ink">
      <PageHeader
        title="Workflow metrics"
        description="Performance analytics for multi-agent workflows"
        actions={
          <button
            onClick={handleRefresh}
            disabled={!projectId || refreshing}
            className="inline-flex h-9 items-center rounded-lg border border-line px-3 text-[13px] font-medium text-ink-secondary transition-colors duration-150 hover:border-line-strong hover:text-ink"
          >
            {refreshing ? "Refreshing…" : projectId ? "Refresh metrics" : "Select a workspace"}
          </button>
        }
      />

      {refreshError && <p role="alert" className="px-6 py-3 text-sm text-red-500">{refreshError}</p>}
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 py-6">
        {/* Summary */}
        <MetricRow className="xl:grid-cols-5">
          <MetricBlock label="Total runs" value={summary.total} />
          <MetricBlock label="Success rate" value={`${Math.round(summary.successRate * 100)}%`} />
          <MetricBlock label="Avg duration" value={`${Math.round(summary.avgDurationMs / 1000)}s`} />
          <MetricBlock label="Total retries" value={summary.totalRetries} />
          <MetricBlock label="Escalations" value={summary.totalEscalations} />
        </MetricRow>

        {/* Per-Workflow Metrics */}
        <section className="flex flex-col gap-4">
          <h2 className="text-[19px] font-semibold text-ink">Workflow performance</h2>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-4">
            {allMetrics.map((metric) => {
              const workflow = workflowMap.get(metric.workflowId);

              return (
                <div key={metric._id} className="rounded-xl border border-line bg-surface-1 p-5">
                  <div className="text-[15px] font-semibold text-ink">
                    {workflow?.name ?? metric.workflowId}
                  </div>

                  <div className="mt-0.5 text-[12px] text-ink-muted">Last 30 days</div>

                  {/* Stats grid */}
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <StatItem label="Runs" value={metric.totalRuns} />
                    <StatItem
                      label="Success"
                      value={`${Math.round(metric.successRate * 100)}%`}
                      valueClass={
                        metric.successRate > 0.8
                          ? "text-ok"
                          : metric.successRate > 0.5
                            ? "text-warn"
                            : "text-err"
                      }
                    />
                    <StatItem label="Avg time" value={`${Math.round(metric.avgDurationMs / 1000)}s`} />
                    <StatItem label="Retries" value={metric.totalRetries} />
                  </div>

                  {/* Bottlenecks */}
                  {metric.bottlenecks.length > 0 && (
                    <div className="mt-4">
                      <div className="mb-2 text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted">
                        Bottlenecks
                      </div>
                      {metric.bottlenecks.map((bottleneck) => (
                        <div
                          key={bottleneck.stepId}
                          className="mb-1 rounded-md bg-err-soft px-2 py-1.5 text-[11.5px] text-err"
                        >
                          {bottleneck.stepId}: {Math.round(bottleneck.failureRate * 100)}% failure,{" "}
                          {bottleneck.avgRetries.toFixed(1)} avg retries
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Status Breakdown */}
        <section className="flex flex-col gap-4">
          <h2 className="text-[19px] font-semibold text-ink">Status breakdown</h2>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatusCard label="Running" value={summary.running} dotClass="bg-info-accent" />
            <StatusCard label="Completed" value={summary.completed} dotClass="bg-ok" />
            <StatusCard label="Failed" value={summary.failed} dotClass="bg-err" />
            <StatusCard label="Paused" value={summary.paused} dotClass="bg-warn" />
          </div>
        </section>
      </div>
    </div>
  );
}

// Helper Components

function StatItem({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string | number;
  valueClass?: string;
}) {
  return (
    <div>
      <div className="mb-0.5 text-[11.5px] text-ink-muted">{label}</div>
      <div className={cn("text-[14px] font-semibold text-ink", valueClass)}>{value}</div>
    </div>
  );
}

function StatusCard({
  label,
  value,
  dotClass,
}: {
  label: string;
  value: number;
  dotClass: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface-1 p-4 text-center">
      <div className="text-[20px] font-semibold text-ink">{value}</div>
      <div className="mt-1 flex items-center justify-center gap-1.5 text-[12px] text-ink-muted">
        <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} aria-hidden />
        {label}
      </div>
    </div>
  );
}
