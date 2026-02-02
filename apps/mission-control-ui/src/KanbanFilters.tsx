import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface KanbanFiltersProps {
  projectId: Id<"projects"> | null;
  filters: {
    agents: string[];
    priorities: number[];
    types: string[];
  };
  onFiltersChange: (filters: {
    agents: string[];
    priorities: number[];
    types: string[];
  }) => void;
}

export function KanbanFilters({ projectId, filters, onFiltersChange }: KanbanFiltersProps) {
  const agents = useQuery(
    api.agents.listAll,
    projectId ? { projectId } : {}
  );
  
  const tasks = useQuery(
    api.tasks.listAll,
    projectId ? { projectId } : {}
  );
  
  if (!agents || !tasks) return null;
  
  // Get unique task types
  const taskTypes = Array.from(new Set(tasks.map((t) => t.type))).sort();
  
  const toggleAgent = (agentId: string) => {
    const newAgents = filters.agents.includes(agentId)
      ? filters.agents.filter((id) => id !== agentId)
      : [...filters.agents, agentId];
    onFiltersChange({ ...filters, agents: newAgents });
  };
  
  const togglePriority = (priority: number) => {
    const newPriorities = filters.priorities.includes(priority)
      ? filters.priorities.filter((p) => p !== priority)
      : [...filters.priorities, priority];
    onFiltersChange({ ...filters, priorities: newPriorities });
  };
  
  const toggleType = (type: string) => {
    const newTypes = filters.types.includes(type)
      ? filters.types.filter((t) => t !== type)
      : [...filters.types, type];
    onFiltersChange({ ...filters, types: newTypes });
  };
  
  const clearFilters = () => {
    onFiltersChange({ agents: [], priorities: [], types: [] });
  };
  
  const hasFilters = filters.agents.length > 0 || filters.priorities.length > 0 || filters.types.length > 0;
  
  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-6 flex-wrap">
        {/* Priority Filters */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Priority:
          </span>
          {[1, 2, 3].map((priority) => {
            const isActive = filters.priorities.includes(priority);
            const colors = {
              1: "border-red-500 text-red-700 dark:text-red-400",
              2: "border-orange-500 text-orange-700 dark:text-orange-400",
              3: "border-blue-500 text-blue-700 dark:text-blue-400",
            };
            return (
              <button
                key={priority}
                onClick={() => togglePriority(priority)}
                className={`px-3 py-1 text-xs rounded-full border-2 transition-all ${
                  isActive
                    ? `${colors[priority as keyof typeof colors]} bg-opacity-20`
                    : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400"
                }`}
              >
                P{priority}
              </button>
            );
          })}
        </div>
        
        {/* Agent Filters */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Agents:
          </span>
          <div className="flex items-center gap-1 flex-wrap max-w-md">
            {agents.slice(0, 6).map((agent) => {
              const isActive = filters.agents.includes(agent._id);
              return (
                <button
                  key={agent._id}
                  onClick={() => toggleAgent(agent._id)}
                  className={`px-2 py-1 text-xs rounded transition-all ${
                    isActive
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                  }`}
                  title={agent.name}
                >
                  {agent.emoji || "🤖"} {agent.name}
                </button>
              );
            })}
            {agents.length > 6 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                +{agents.length - 6} more
              </span>
            )}
          </div>
        </div>
        
        {/* Type Filters */}
        {taskTypes.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Type:
            </span>
            <div className="flex items-center gap-1 flex-wrap max-w-md">
              {taskTypes.slice(0, 5).map((type) => {
                const isActive = filters.types.includes(type);
                return (
                  <button
                    key={type}
                    onClick={() => toggleType(type)}
                    className={`px-2 py-1 text-xs rounded transition-all ${
                      isActive
                        ? "bg-purple-500 text-white"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {type}
                  </button>
                );
              })}
              {taskTypes.length > 5 && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  +{taskTypes.length - 5} more
                </span>
              )}
            </div>
          </div>
        )}
        
        {/* Clear Filters */}
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="ml-auto px-3 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 underline"
          >
            Clear all filters
          </button>
        )}
      </div>
      
      {/* Active Filters Summary */}
      {hasFilters && (
        <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Showing tasks with:{" "}
          {filters.priorities.length > 0 && `P${filters.priorities.join(", P")} `}
          {filters.agents.length > 0 && `${filters.agents.length} agent(s) `}
          {filters.types.length > 0 && `${filters.types.length} type(s)`}
        </div>
      )}
    </div>
  );
}
