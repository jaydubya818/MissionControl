import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { MetricBlock, MetricRow } from "./components/factory/MetricBlock";
import { StatusBadge } from "./components/factory/badges";
import { CHART_SERIES } from "./components/factory/chartTheme";
import {
  UsageTrendCharts,
  type ChartWindow,
} from "@/components/dashboard/UsageTrendCharts";

interface AnalyticsDashboardProps {
  projectId: Id<"projects"> | null;
  onClose: () => void;
}

export function AnalyticsDashboard({ projectId, onClose }: AnalyticsDashboardProps) {
  const [chartWindowHours, setChartWindowHours] = useState<ChartWindow>(168);

  const agents = useQuery(
    api.agents.listAll,
    projectId ? { projectId } : {}
  );

  const tasks = useQuery(
    api.tasks.listAll,
    projectId ? { projectId } : {}
  );

  const runs = useQuery(
    api.runs.listRecent,
    { limit: 1000 }
  );

  const usageTimeSeries = useQuery(
    api.runs.getUsageTimeSeries,
    projectId
      ? {
          projectId,
          windowHours: chartWindowHours,
          bucketHours: chartWindowHours === 24 ? 1 : 24,
        }
      : {
          windowHours: chartWindowHours,
          bucketHours: chartWindowHours === 24 ? 1 : 24,
        },
  );

  if (!agents || !tasks || !runs) {
    return (
      <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70">
        <div className="rounded-xl border border-line bg-surface-1 p-6">
          <div className="h-16 w-40 animate-pulse rounded bg-surface-2" />
        </div>
      </div>
    );
  }

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const last7DaysRuns = runs.filter(r => r.startedAt >= sevenDaysAgo);
  const dailyCosts = new Array(7).fill(0);

  last7DaysRuns.forEach(run => {
    const daysAgo = Math.floor((now - run.startedAt) / (24 * 60 * 60 * 1000));
    if (daysAgo >= 0 && daysAgo < 7) {
      dailyCosts[6 - daysAgo] += run.costUsd;
    }
  });

  const avgDailyCost = dailyCosts.reduce((a, b) => a + b, 0) / 7;
  const forecast7Days = avgDailyCost * 7;

  const agentEfficiency = agents.map(agent => {
    const agentTasks = tasks.filter(t => t.assigneeIds.includes(agent._id));
    const agentRuns = runs.filter(r => r.agentId === agent._id);

    const completedTasks = agentTasks.filter(t => t.status === "DONE").length;
    const totalCost = agentRuns.reduce((sum, r) => sum + r.costUsd, 0);
    const totalTime = agentRuns.reduce((sum, r) => sum + (r.durationMs || 0), 0);

    const tasksPerHour = totalTime > 0 ? (completedTasks / (totalTime / (1000 * 60 * 60))) : 0;
    const costPerTask = completedTasks > 0 ? totalCost / completedTasks : 0;
    const efficiencyScore = completedTasks > 0 ? (completedTasks / (totalCost + 1)) * 100 : 0;

    return {
      agent,
      completedTasks,
      tasksPerHour,
      costPerTask,
      efficiencyScore,
      totalCost,
    };
  }).sort((a, b) => b.efficiencyScore - a.efficiencyScore);

  const completionTrend = new Array(7).fill(0);
  tasks.filter(t => t.status === "DONE").forEach(task => {
    const daysAgo = Math.floor((now - task._creationTime) / (24 * 60 * 60 * 1000));
    if (daysAgo >= 0 && daysAgo < 7) {
      completionTrend[6 - daysAgo]++;
    }
  });

  const bottlenecks = [];

  const reviewTasks = tasks.filter(t => t.status === "REVIEW");
  if (reviewTasks.length > 5) {
    bottlenecks.push({
      type: "Review Queue",
      count: reviewTasks.length,
      severity: "warning" as const,
      message: `${reviewTasks.length} tasks waiting for review`,
    });
  }

  const approvalTasks = tasks.filter(t => t.status === "NEEDS_APPROVAL");
  if (approvalTasks.length > 3) {
    bottlenecks.push({
      type: "Approval Queue",
      count: approvalTasks.length,
      severity: "critical" as const,
      message: `${approvalTasks.length} tasks waiting for approval`,
    });
  }

  const blockedTasks = tasks.filter(t => t.status === "BLOCKED");
  if (blockedTasks.length > 0) {
    bottlenecks.push({
      type: "Blocked Tasks",
      count: blockedTasks.length,
      severity: "critical" as const,
      message: `${blockedTasks.length} tasks are blocked`,
    });
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto bg-black/70 p-5">
      <div className="max-h-[90vh] w-full max-w-[1200px] overflow-y-auto rounded-xl border border-line bg-surface-1 p-6">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[19px] font-semibold text-ink">Analytics</h2>
            <p className="mt-1 text-[13px] text-ink-secondary">
              Cost forecast, agent efficiency, and pipeline bottlenecks
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close analytics"
            className="rounded-md p-1.5 text-ink-muted transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        {/* Cost Forecasting */}
        <div className="mb-6">
          <h3 className="mb-3 text-[15px] font-semibold text-ink">Cost forecasting</h3>
          <MetricRow className="mb-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2">
            <MetricBlock label="Avg daily cost" value={`$${avgDailyCost.toFixed(2)}`} detail="Last 7 days" />
            <MetricBlock label="7-day forecast" value={`$${forecast7Days.toFixed(2)}`} detail="At current burn rate" />
          </MetricRow>

          {usageTimeSeries && (
            <UsageTrendCharts
              series={usageTimeSeries}
              windowHours={chartWindowHours}
              onWindowChange={setChartWindowHours}
            />
          )}
        </div>

        {/* Agent Efficiency Leaderboard */}
        <div className="mb-6">
          <h3 className="mb-3 text-[15px] font-semibold text-ink">Agent efficiency</h3>
          <div className="overflow-hidden rounded-xl border border-line">
            {agentEfficiency.slice(0, 5).map((item, i) => (
              <div
                key={item.agent._id}
                className={cn(
                  "flex items-center justify-between px-4 py-3",
                  i < 4 && "border-b border-line"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md border border-line bg-surface-2 font-mono text-[11.5px] font-semibold text-ink-secondary">
                    {i + 1}
                  </div>
                  <div>
                    <div className="text-[13px] font-medium text-ink">{item.agent.name}</div>
                    <div className="text-[12px] text-ink-muted">
                      {item.completedTasks} tasks · ${item.totalCost.toFixed(2)} spent
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[14px] font-semibold text-ink">
                    {item.efficiencyScore.toFixed(1)}
                  </div>
                  <div className="text-[11px] text-ink-muted">
                    ${item.costPerTask.toFixed(2)}/task
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Task Completion Trend */}
        <div className="mb-6">
          <h3 className="mb-3 text-[15px] font-semibold text-ink">Task completion trend</h3>
          <div className="rounded-xl border border-line bg-surface-1 p-4">
            <div className="flex h-[100px] items-end gap-1">
              {completionTrend.map((count, i) => {
                const maxCount = Math.max(...completionTrend, 1);
                const height = (count / maxCount) * 100;
                return (
                  <div key={i} className="flex flex-1 flex-col items-center">
                    <div
                      className="w-full rounded-t-sm"
                      style={{
                        height: `${height}%`,
                        minHeight: count > 0 ? "4px" : "0",
                        backgroundColor: CHART_SERIES[0],
                      }}
                      title={`${count} tasks`}
                    />
                    <div className="mt-1 text-[11px] text-ink-muted">
                      {i === 6 ? "Today" : `${6 - i}d`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottleneck Detection */}
        {bottlenecks.length > 0 && (
          <div>
            <h3 className="mb-3 text-[15px] font-semibold text-ink">Bottlenecks</h3>
            <div className="flex flex-col gap-2">
              {bottlenecks.map((bottleneck, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <StatusBadge tone={bottleneck.severity === "critical" ? "error" : "warning"}>
                      {bottleneck.severity === "critical" ? "Critical" : "Warning"}
                    </StatusBadge>
                    <div>
                      <div className="text-[13px] font-medium text-ink">{bottleneck.type}</div>
                      <div className="mt-0.5 text-[12px] text-ink-muted">{bottleneck.message}</div>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "font-mono text-[19px] font-semibold",
                      bottleneck.severity === "critical" ? "text-err" : "text-warn"
                    )}
                  >
                    {bottleneck.count}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
