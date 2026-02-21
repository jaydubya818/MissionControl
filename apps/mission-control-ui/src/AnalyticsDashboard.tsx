import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface AnalyticsDashboardProps {
  projectId: Id<"projects"> | null;
  onClose: () => void;
}

export function AnalyticsDashboard({ projectId, onClose }: AnalyticsDashboardProps) {
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

  if (!agents || !tasks || !runs) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000]">
        <div className="bg-card rounded-xl p-6">
          <div className="w-8 h-8 border-[3px] border-blue-500 border-t-transparent rounded-full animate-spin" />
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

  const RANK_COLORS = ["bg-amber-400", "bg-slate-400", "bg-amber-700", "bg-slate-700"];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000] p-5 overflow-y-auto">
      <div className="bg-card rounded-xl p-6 max-w-[1200px] w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-foreground">
            📊 Advanced Analytics
          </h2>
          <button
            onClick={onClose}
            className="bg-transparent border-none text-muted-foreground text-2xl cursor-pointer px-2 py-1 hover:text-foreground transition-colors"
          >
            ×
          </button>
        </div>

        {/* Cost Forecasting */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-foreground mb-3">
            💰 Cost Forecasting
          </h3>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 mb-4">
            <div className="bg-secondary p-4 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">Avg Daily Cost</div>
              <div className="text-2xl font-bold text-blue-500">
                ${avgDailyCost.toFixed(2)}
              </div>
            </div>
            <div className="bg-secondary p-4 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">7-Day Forecast</div>
              <div className="text-2xl font-bold text-blue-500">
                ${forecast7Days.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Daily cost chart */}
          <div className="bg-secondary p-4 rounded-lg">
            <div className="text-sm text-foreground mb-3">
              Daily Cost Trend (Last 7 Days)
            </div>
            <div className="flex items-end gap-1 h-[100px]">
              {dailyCosts.map((cost, i) => {
                const maxCost = Math.max(...dailyCosts, 1);
                const height = (cost / maxCost) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full bg-blue-500 rounded-t"
                      style={{ height: `${height}%`, minHeight: cost > 0 ? "4px" : "0" }}
                      title={`$${cost.toFixed(2)}`}
                    />
                    <div className="text-[0.7rem] text-muted-foreground mt-1">
                      {i === 6 ? "Today" : `${6 - i}d`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Agent Efficiency Leaderboard */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-foreground mb-3">
            🏆 Agent Efficiency Leaderboard
          </h3>
          <div className="bg-secondary rounded-lg overflow-hidden">
            {agentEfficiency.slice(0, 5).map((item, i) => (
              <div
                key={item.agent._id}
                className={cn(
                  "px-4 py-3 flex justify-between items-center",
                  i < 4 && "border-b border-card"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-slate-900",
                    RANK_COLORS[i] ?? RANK_COLORS[3]
                  )}>
                    {i + 1}
                  </div>
                  <div>
                    <div className="text-sm text-foreground">
                      {item.agent.emoji} {item.agent.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.completedTasks} tasks &bull; ${item.totalCost.toFixed(2)} spent
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold text-blue-500">
                    {item.efficiencyScore.toFixed(1)}
                  </div>
                  <div className="text-[0.7rem] text-muted-foreground">
                    ${item.costPerTask.toFixed(2)}/task
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Task Completion Trend */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-foreground mb-3">
            📈 Task Completion Trend
          </h3>
          <div className="bg-secondary p-4 rounded-lg">
            <div className="flex items-end gap-1 h-[100px]">
              {completionTrend.map((count, i) => {
                const maxCount = Math.max(...completionTrend, 1);
                const height = (count / maxCount) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full bg-emerald-500 rounded-t"
                      style={{ height: `${height}%`, minHeight: count > 0 ? "4px" : "0" }}
                      title={`${count} tasks`}
                    />
                    <div className="text-[0.7rem] text-muted-foreground mt-1">
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
            <h3 className="text-lg font-semibold text-foreground mb-3">
              ⚠️  Bottleneck Detection
            </h3>
            <div className="flex flex-col gap-2">
              {bottlenecks.map((bottleneck, i) => (
                <div
                  key={i}
                  className={cn(
                    "px-4 py-3 rounded-lg border-2",
                    bottleneck.severity === "critical"
                      ? "bg-red-950 border-red-500"
                      : "bg-amber-950 border-orange-500"
                  )}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {bottleneck.type}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {bottleneck.message}
                      </div>
                    </div>
                    <div className={cn(
                      "text-xl font-bold",
                      bottleneck.severity === "critical" ? "text-red-500" : "text-orange-500"
                    )}>
                      {bottleneck.count}
                    </div>
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
