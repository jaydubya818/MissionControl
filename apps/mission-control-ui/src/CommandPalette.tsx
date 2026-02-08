import { useEffect, useMemo, useRef, useState } from "react";
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
  onOpenControls?: () => void;
}

export function CommandPalette({
  projectId,
  onClose,
  onSelectTask,
  onCreateTask,
  onOpenApprovals,
  onOpenAgents,
  onOpenControls,
}: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const searchResults = useQuery(
    api.search.searchAll,
    projectId && search.trim().length >= 2
      ? { projectId, query: search.trim(), limit: 8 }
      : "skip"
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commands = useMemo(
    () => [
      { id: "new-task", label: "Create New Task", icon: "📝", shortcut: "Cmd+N", action: onCreateTask },
      { id: "open-approvals", label: "Open Approvals Center", icon: "✅", shortcut: "Cmd+Shift+A", action: onOpenApprovals },
      { id: "open-agents", label: "Open Agent Registry", icon: "🤖", shortcut: "Cmd+2", action: onOpenAgents },
      ...(onOpenControls
        ? [{ id: "open-controls", label: "Open Operator Controls", icon: "🚨", shortcut: "Cmd+Shift+C", action: onOpenControls }]
        : []),
    ],
    [onCreateTask, onOpenApprovals, onOpenAgents, onOpenControls]
  );

  const filteredCommands = commands.filter((command) =>
    command.label.toLowerCase().includes(search.toLowerCase())
  );

  const hasSearch = search.trim().length >= 2;

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
          maxWidth: "760px",
          width: "100%",
          maxHeight: "640px",
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.6)",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ padding: "20px", borderBottom: "1px solid #334155" }}>
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tasks, approvals, agents, or run a command..."
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
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                onClose();
              }
            }}
          />
        </div>

        <div style={{ maxHeight: "540px", overflow: "auto", padding: "12px 20px" }}>
          {!search && (
            <SectionTitle>Quick Actions</SectionTitle>
          )}

          {(filteredCommands.length > 0 || !search) && (
            <ResultGroup
              title="Commands"
              rows={(search ? filteredCommands : commands).map((command) => ({
                key: command.id,
                title: command.label,
                subtitle: command.shortcut,
                icon: command.icon,
                onClick: () => {
                  command.action();
                  onClose();
                },
              }))}
            />
          )}

          {hasSearch && (
            <>
              <ResultGroup
                title="Tasks"
                rows={(searchResults?.tasks ?? []).map((task) => ({
                  key: task._id,
                  title: task.title,
                  subtitle: `${task.status} · ${task.type} · P${task.priority}`,
                  icon: "📋",
                  onClick: () => {
                    onSelectTask(task._id);
                    onClose();
                  },
                }))}
              />

              <ResultGroup
                title="Approvals"
                rows={(searchResults?.approvals ?? []).map((approval) => ({
                  key: approval._id,
                  title: approval.actionSummary,
                  subtitle: `${approval.status} · ${approval.riskLevel} · ${approval.actionType}`,
                  icon: "🛡️",
                  onClick: approval.taskId
                    ? () => {
                        onSelectTask(approval.taskId as Id<"tasks">);
                        onClose();
                      }
                    : undefined,
                }))}
              />

              <ResultGroup
                title="Agents"
                rows={(searchResults?.agents ?? []).map((agent) => ({
                  key: agent._id,
                  title: agent.name,
                  subtitle: `${agent.role} · ${agent.status}`,
                  icon: agent.emoji || "🤖",
                  onClick: () => {
                    onOpenAgents();
                    onClose();
                  },
                }))}
              />

              {searchResults && searchResults.totalResults === 0 && (
                <div style={{ padding: "24px", color: "#64748b", textAlign: "center" }}>
                  No results for "{search}".
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ color: "#64748b", fontSize: "12px", marginBottom: "8px", fontWeight: 600 }}>{children}</div>;
}

function ResultGroup({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    key: string;
    title: string;
    subtitle?: string;
    icon?: string;
    onClick?: () => void;
  }>;
}) {
  if (!rows.length) return null;

  return (
    <div style={{ marginBottom: 12 }}>
      <SectionTitle>{title.toUpperCase()}</SectionTitle>
      {rows.map((row) => (
        <button
          key={row.key}
          type="button"
          onClick={row.onClick}
          disabled={!row.onClick}
          style={{
            width: "100%",
            textAlign: "left",
            padding: "10px 12px",
            borderRadius: "6px",
            border: "none",
            background: "transparent",
            color: "#e2e8f0",
            cursor: row.onClick ? "pointer" : "default",
            opacity: row.onClick ? 1 : 0.8,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
          onMouseEnter={(event) => {
            if (row.onClick) {
              event.currentTarget.style.background = "#334155";
            }
          }}
          onMouseLeave={(event) => {
            if (row.onClick) {
              event.currentTarget.style.background = "transparent";
            }
          }}
        >
          <span style={{ minWidth: 22 }}>{row.icon || "•"}</span>
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontSize: "0.88rem" }}>{row.title}</span>
            {row.subtitle ? (
              <span style={{ display: "block", fontSize: "0.75rem", color: "#94a3b8" }}>{row.subtitle}</span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );
}
