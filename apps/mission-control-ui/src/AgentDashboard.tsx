import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface AgentDashboardProps {
  projectId: Id<"projects"> | null;
  onClose: () => void;
}

export function AgentDashboard({ projectId, onClose }: AgentDashboardProps) {
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
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  // Calculate agent metrics
  const agentMetrics = agents.map((agent) => {
    const agentTasks = tasks.filter((t) => t.assigneeIds.includes(agent._id));
    const agentRuns = runs.filter((r) => r.agentId === agent._id);
    
    const completedTasks = agentTasks.filter((t) => t.status === "DONE").length;
    const inProgressTasks = agentTasks.filter((t) => t.status === "IN_PROGRESS").length;
    const totalCost = agentRuns.reduce((sum, r) => sum + r.costUsd, 0);
    const avgCostPerRun = agentRuns.length > 0 ? totalCost / agentRuns.length : 0;
    const successRate = agentRuns.length > 0
      ? (agentRuns.filter((r) => r.status === "COMPLETED").length / agentRuns.length) * 100
      : 0;
    
    return {
      agent,
      completedTasks,
      inProgressTasks,
      totalTasks: agentTasks.length,
      totalRuns: agentRuns.length,
      totalCost,
      avgCostPerRun,
      successRate,
      spendToday: agent.spendToday,
      budgetDaily: agent.budgetDaily,
      budgetRemaining: agent.budgetDaily - agent.spendToday,
      utilization: agent.budgetDaily > 0 ? (agent.spendToday / agent.budgetDaily) * 100 : 0,
    };
  });

  // Sort by total cost (most expensive first)
  agentMetrics.sort((a, b) => b.totalCost - a.totalCost);

  const statusColors: Record<string, string> = {
    ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    PAUSED: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    OFFLINE: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
    QUARANTINED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  const roleColors: Record<string, string> = {
    INTERN: "bg-blue-100 text-blue-800",
    SPECIALIST: "bg-purple-100 text-purple-800",
    LEAD: "bg-orange-100 text-orange-800",
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Agent Performance Dashboard
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {agents.length} agents · {runs.length} runs · ${agentMetrics.reduce((sum, m) => sum + m.totalCost, 0).toFixed(2)} total cost
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
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {agentMetrics.map(({ agent, ...metrics }) => (
              <div
                key={agent._id}
                className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
              >
                {/* Agent Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{agent.emoji || "🤖"}</span>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {agent.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${roleColors[agent.role]}`}>
                          {agent.role}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[agent.status]}`}>
                          {agent.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Tasks</div>
                    <div className="text-lg font-semibold text-gray-900 dark:text-white">
                      {metrics.completedTasks}/{metrics.totalTasks}
                    </div>
                    <div className="text-xs text-gray-500">
                      {metrics.inProgressTasks} in progress
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Runs</div>
                    <div className="text-lg font-semibold text-gray-900 dark:text-white">
                      {metrics.totalRuns}
                    </div>
                    <div className="text-xs text-gray-500">
                      {metrics.successRate.toFixed(0)}% success
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Total Cost</div>
                    <div className="text-lg font-semibold text-gray-900 dark:text-white">
                      ${metrics.totalCost.toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500">
                      ${metrics.avgCostPerRun.toFixed(3)}/run
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Today's Spend</div>
                    <div className="text-lg font-semibold text-gray-900 dark:text-white">
                      ${metrics.spendToday.toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500">
                      ${metrics.budgetRemaining.toFixed(2)} left
                    </div>
                  </div>
                </div>

                {/* Budget Bar */}
                <div>
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                    <span>Budget Utilization</span>
                    <span>{metrics.utilization.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        metrics.utilization >= 90
                          ? "bg-red-500"
                          : metrics.utilization >= 70
                          ? "bg-yellow-500"
                          : "bg-green-500"
                      }`}
                      style={{ width: `${Math.min(metrics.utilization, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400 mt-1">
                    <span>${metrics.spendToday.toFixed(2)}</span>
                    <span>${metrics.budgetDaily.toFixed(2)}</span>
                  </div>
                </div>

                {/* Task Types */}
                {agent.allowedTaskTypes && agent.allowedTaskTypes.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      Allowed Task Types
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {agent.allowedTaskTypes.map((type) => (
                        <span
                          key={type}
                          className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                        >
                          {type}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
