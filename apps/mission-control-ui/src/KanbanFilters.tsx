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
    <div
      style={{
        background: "#1e293b",
        borderBottom: "1px solid #334155",
        padding: "12px 20px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
        {/* Priority Filters */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "0.8rem", fontWeight: 500, color: "#94a3b8" }}>
            Priority:
          </span>
          {[1, 2, 3].map((priority) => {
            const isActive = filters.priorities.includes(priority);
            const colors = {
              1: { bg: "#ef4444", text: "#fff" },
              2: { bg: "#f97316", text: "#fff" },
              3: { bg: "#3b82f6", text: "#fff" },
            };
            const color = colors[priority as keyof typeof colors];
            return (
              <button
                key={priority}
                onClick={() => togglePriority(priority)}
                style={{
                  padding: "4px 12px",
                  fontSize: "0.75rem",
                  borderRadius: "12px",
                  border: "none",
                  background: isActive ? color.bg : "#334155",
                  color: isActive ? color.text : "#94a3b8",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                P{priority}
              </button>
            );
          })}
        </div>
        
        {/* Agent Filters */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "0.8rem", fontWeight: 500, color: "#94a3b8" }}>
            Agents:
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap", maxWidth: "400px" }}>
            {agents.slice(0, 5).map((agent) => {
              const isActive = filters.agents.includes(agent._id);
              return (
                <button
                  key={agent._id}
                  onClick={() => toggleAgent(agent._id)}
                  style={{
                    padding: "4px 8px",
                    fontSize: "0.75rem",
                    borderRadius: "6px",
                    border: "none",
                    background: isActive ? "#3b82f6" : "#334155",
                    color: isActive ? "#fff" : "#94a3b8",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  title={agent.name}
                >
                  {agent.emoji || "🤖"}
                </button>
              );
            })}
            {agents.length > 5 && (
              <span style={{ fontSize: "0.7rem", color: "#64748b" }}>
                +{agents.length - 5}
              </span>
            )}
          </div>
        </div>
        
        {/* Type Filters */}
        {taskTypes.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 500, color: "#94a3b8" }}>
              Type:
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap", maxWidth: "400px" }}>
              {taskTypes.slice(0, 4).map((type) => {
                const isActive = filters.types.includes(type);
                return (
                  <button
                    key={type}
                    onClick={() => toggleType(type)}
                    style={{
                      padding: "4px 8px",
                      fontSize: "0.7rem",
                      borderRadius: "6px",
                      border: "none",
                      background: isActive ? "#8b5cf6" : "#334155",
                      color: isActive ? "#fff" : "#94a3b8",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                  >
                    {type}
                  </button>
                );
              })}
              {taskTypes.length > 4 && (
                <span style={{ fontSize: "0.7rem", color: "#64748b" }}>
                  +{taskTypes.length - 4}
                </span>
              )}
            </div>
          </div>
        )}
        
        {/* Clear Filters */}
        {hasFilters && (
          <button
            onClick={clearFilters}
            style={{
              marginLeft: "auto",
              padding: "4px 12px",
              fontSize: "0.75rem",
              color: "#94a3b8",
              background: "none",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
