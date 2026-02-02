import { useState, useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface CommandPaletteProps {
  projectId: Id<"projects"> | null;
  onClose: () => void;
  onSelectTask: (taskId: Id<"tasks">) => void;
  onCreateTask: () => void;
  onOpenApprovals: () => void;
  onOpenAgents: () => void;
}

export function CommandPalette({
  projectId,
  onClose,
  onSelectTask,
  onCreateTask,
  onOpenApprovals,
  onOpenAgents,
}: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  
  const tasks = useQuery(api.tasks.listAll, projectId ? { projectId } : {});
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  
  const commands = [
    { id: "new-task", label: "Create New Task", icon: "📝", action: onCreateTask },
    { id: "approvals", label: "View Approvals", icon: "✅", action: onOpenApprovals },
    { id: "agents", label: "View Agents", icon: "🤖", action: onOpenAgents },
  ];
  
  const filteredTasks = tasks?.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.description?.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 5) || [];
  
  const filteredAgents = agents?.filter(a =>
    a.name.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 5) || [];
  
  const filteredCommands = commands.filter(c =>
    c.label.toLowerCase().includes(search.toLowerCase())
  );
  
  const hasResults = filteredTasks.length > 0 || filteredAgents.length > 0 || filteredCommands.length > 0;
  
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.8)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "100px",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#1e293b",
          borderRadius: "12px",
          maxWidth: "600px",
          width: "100%",
          maxHeight: "600px",
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div style={{ padding: "20px", borderBottom: "1px solid #334155" }}>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks, agents, or commands..."
            style={{
              width: "100%",
              padding: "12px",
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "6px",
              color: "#e2e8f0",
              fontSize: "16px",
              outline: "none",
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                onClose();
              }
            }}
          />
        </div>
        
        {/* Results */}
        <div style={{ maxHeight: "500px", overflow: "auto" }}>
          {!hasResults && search && (
            <div style={{
              padding: "40px",
              textAlign: "center",
              color: "#64748b",
            }}>
              No results found for "{search}"
            </div>
          )}
          
          {!search && (
            <div style={{
              padding: "20px",
              color: "#64748b",
              fontSize: "14px",
            }}>
              Start typing to search tasks, agents, or commands...
            </div>
          )}
          
          {/* Commands */}
          {filteredCommands.length > 0 && (
            <div style={{ padding: "12px 20px" }}>
              <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "8px", fontWeight: 600 }}>
                COMMANDS
              </div>
              {filteredCommands.map((cmd) => (
                <div
                  key={cmd.id}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#334155";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span style={{ fontSize: "20px" }}>{cmd.icon}</span>
                  <span style={{ fontSize: "14px", color: "#e2e8f0" }}>{cmd.label}</span>
                </div>
              ))}
            </div>
          )}
          
          {/* Tasks */}
          {filteredTasks.length > 0 && (
            <div style={{ padding: "12px 20px" }}>
              <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "8px", fontWeight: 600 }}>
                TASKS
              </div>
              {filteredTasks.map((task) => (
                <div
                  key={task._id}
                  onClick={() => {
                    onSelectTask(task._id);
                    onClose();
                  }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#334155";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div style={{ fontSize: "14px", color: "#e2e8f0", marginBottom: "4px" }}>
                    {task.title}
                  </div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>
                    {task.status} · {task.type} · P{task.priority}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Agents */}
          {filteredAgents.length > 0 && (
            <div style={{ padding: "12px 20px" }}>
              <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "8px", fontWeight: 600 }}>
                AGENTS
              </div>
              {filteredAgents.map((agent) => (
                <div
                  key={agent._id}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#334155";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div style={{ fontSize: "14px", color: "#e2e8f0", marginBottom: "4px" }}>
                    {agent.emoji || "🤖"} {agent.name}
                  </div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>
                    {agent.role} · {agent.status}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
