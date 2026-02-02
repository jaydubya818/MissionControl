import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface CostAnalyticsProps {
  projectId: Id<"projects"> | null;
  onClose: () => void;
}

export function CostAnalytics({ projectId, onClose }: CostAnalyticsProps) {
  const runs = useQuery(
    api.runs.listRecent,
    projectId ? { projectId: projectId as any, limit: 1000 } : { limit: 1000 }
  );
  
  const agents = useQuery(
    api.agents.listAll,
    projectId ? { projectId } : {}
  );
  
  const tasks = useQuery(
    api.tasks.listAll,
    projectId ? { projectId } : {}
  );

  if (!runs || !agents || !tasks) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  // Calculate metrics
  const totalCost = runs.reduce((sum, r) => sum + r.costUsd, 0);
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const todayCost = runs
    .filter((r) => r.startedAt >= todayStart)
    .reduce((sum, r) => sum + r.costUsd, 0);
  
  const last7Days = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const last7DaysCost = runs
    .filter((r) => r.startedAt >= last7Days)
    .reduce((sum, r) => sum + r.costUsd, 0);
  
  const last30Days = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const last30DaysCost = runs
    .filter((r) => r.startedAt >= last30Days)
    .reduce((sum, r) => sum + r.costUsd, 0);
  
  // Cost by agent
  const costByAgent = agents.map((agent) => {
    const agentRuns = runs.filter((r) => r.agentId === agent._id);
    const cost = agentRuns.reduce((sum, r) => sum + r.costUsd, 0);
    const runCount = agentRuns.length;
    return { agent, cost, runCount };
  }).sort((a, b) => b.cost - a.cost);
  
  // Cost by task
  const costByTask = tasks.map((task) => {
    return {
      task,
      cost: task.actualCost,
      budget: task.budgetAllocated || 0,
      remaining: task.budgetRemaining || 0,
    };
  }).sort((a, b) => b.cost - a.cost);
  
  // Cost by model
  const costByModel: Record<string, { cost: number; runs: number }> = {};
  for (const run of runs) {
    if (!costByModel[run.model]) {
      costByModel[run.model] = { cost: 0, runs: 0 };
    }
    costByModel[run.model].cost += run.costUsd;
    costByModel[run.model].runs++;
  }
  const modelStats = Object.entries(costByModel)
    .map(([model, stats]) => ({ model, ...stats }))
    .sort((a, b) => b.cost - a.cost);
  
  // Daily cost trend (last 7 days)
  const dailyCosts: Record<string, number> = {};
  for (const run of runs) {
    if (run.startedAt >= last7Days) {
      const date = new Date(run.startedAt).toISOString().split("T")[0];
      dailyCosts[date] = (dailyCosts[date] || 0) + run.costUsd;
    }
  }
  const costTrend = Object.entries(dailyCosts)
    .map(([date, cost]) => ({ date, cost }))
    .sort((a, b) => a.date.localeCompare(b.date));
  
  const maxDailyCost = Math.max(...Object.values(dailyCosts), 1);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Cost Analytics
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {runs.length} runs · ${totalCost.toFixed(2)} total
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 dark:bg-blue-900 dark:bg-opacity-20 rounded-lg p-4">
              <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">Today</div>
              <div className="text-2xl font-bold text-blue-900 dark:text-blue-100 mt-1">
                ${todayCost.toFixed(2)}
              </div>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900 dark:bg-opacity-20 rounded-lg p-4">
              <div className="text-sm text-purple-600 dark:text-purple-400 font-medium">Last 7 Days</div>
              <div className="text-2xl font-bold text-purple-900 dark:text-purple-100 mt-1">
                ${last7DaysCost.toFixed(2)}
              </div>
            </div>
            <div className="bg-green-50 dark:bg-green-900 dark:bg-opacity-20 rounded-lg p-4">
              <div className="text-sm text-green-600 dark:text-green-400 font-medium">Last 30 Days</div>
              <div className="text-2xl font-bold text-green-900 dark:text-green-100 mt-1">
                ${last30DaysCost.toFixed(2)}
              </div>
            </div>
            <div className="bg-orange-50 dark:bg-orange-900 dark:bg-opacity-20 rounded-lg p-4">
              <div className="text-sm text-orange-600 dark:text-orange-400 font-medium">All Time</div>
              <div className="text-2xl font-bold text-orange-900 dark:text-orange-100 mt-1">
                ${totalCost.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Daily Trend Chart */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Daily Cost Trend (Last 7 Days)
            </h3>
            <div className="space-y-2">
              {costTrend.map(({ date, cost }) => (
                <div key={date} className="flex items-center gap-3">
                  <div className="text-xs text-gray-500 dark:text-gray-400 w-24">
                    {new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                  <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-6 relative">
                    <div
                      className="bg-blue-500 h-6 rounded-full transition-all"
                      style={{ width: `${(cost / maxDailyCost) * 100}%` }}
                    />
                    <div className="absolute inset-0 flex items-center px-2 text-xs font-medium text-gray-900 dark:text-white">
                      ${cost.toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cost by Agent */}
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Cost by Agent
              </h3>
              <div className="space-y-2">
                {costByAgent.slice(0, 10).map(({ agent, cost, runCount }) => (
                  <div key={agent._id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>{agent.emoji || "🤖"}</span>
                      <span className="text-sm text-gray-900 dark:text-white">
                        {agent.name}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        ({runCount} runs)
                      </span>
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      ${cost.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Cost by Model */}
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Cost by Model
              </h3>
              <div className="space-y-2">
                {modelStats.map(({ model, cost, runs }) => (
                  <div key={model} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-900 dark:text-white">
                        {model}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        ({runs} runs)
                      </span>
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      ${cost.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Expensive Tasks */}
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 lg:col-span-2">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Most Expensive Tasks
              </h3>
              <div className="space-y-3">
                {costByTask.slice(0, 10).map(({ task, cost, budget, remaining }) => (
                  <div key={task._id} className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {task.title}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {task.type} · Priority {task.priority}
                      </div>
                      {budget > 0 && (
                        <div className="mt-2">
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${
                                remaining < 0
                                  ? "bg-red-500"
                                  : remaining < budget * 0.2
                                  ? "bg-yellow-500"
                                  : "bg-green-500"
                              }`}
                              style={{ width: `${Math.min((cost / budget) * 100, 100)}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                            <span>${cost.toFixed(2)}</span>
                            <span>${budget.toFixed(2)} budget</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">
                        ${cost.toFixed(2)}
                      </div>
                      {budget > 0 && (
                        <div className={`text-xs mt-1 ${
                          remaining < 0
                            ? "text-red-600 dark:text-red-400"
                            : "text-gray-500 dark:text-gray-400"
                        }`}>
                          {remaining < 0 ? "Over" : remaining.toFixed(2) + " left"}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
