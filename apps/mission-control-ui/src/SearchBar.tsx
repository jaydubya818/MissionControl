import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

interface SearchBarProps {
  projectId: string | undefined;
  onResultClick: (taskId: string) => void;
}

type SearchHit =
  | { type: "task"; id: string; title: string; subtitle: string; taskId: string }
  | { type: "approval"; id: string; title: string; subtitle: string; taskId?: string };

export function SearchBar({ projectId, onResultClick }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [nonActionableFeedback, setNonActionableFeedback] = useState(false);

  const results = useQuery(
    api.search.searchAll,
    query.length >= 2 && projectId
      ? { projectId: projectId as any, query, limit: 10 }
      : "skip"
  );

  const taskResults = results?.tasks ?? [];
  const approvalResults = results?.approvals ?? [];
  const agentResults = results?.agents ?? [];
  const messageResults = results?.messages ?? [];

  const flatResults = useMemo<SearchHit[]>(() => {
    const taskHits: SearchHit[] = taskResults.map((task) => ({
      type: "task",
      id: `task-${task._id}`,
      title: task.title,
      subtitle: `${task.status} · ${task.type} · P${task.priority}`,
      taskId: task._id,
    }));
    const approvalHits: SearchHit[] = approvalResults.map((approval) => ({
      type: "approval",
      id: `approval-${approval._id}`,
      title: approval.actionSummary,
      subtitle: `${approval.status} · ${approval.riskLevel} · ${approval.actionType}`,
      taskId: approval.taskId ?? undefined,
    }));
    return [...taskHits, ...approvalHits];
  }, [taskResults, approvalResults]);

  useEffect(() => {
    const hasAny =
      taskResults.length > 0 ||
      approvalResults.length > 0 ||
      agentResults.length > 0 ||
      messageResults.length > 0;
    setIsOpen(query.length >= 2 && hasAny);
    setSelectedIndex(0);
  }, [query, taskResults.length, approvalResults.length, agentResults.length, messageResults.length]);

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!flatResults.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, flatResults.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const selected = flatResults[selectedIndex];
      if (!selected) return;
      if (selected.type === "task") {
        onResultClick(selected.taskId);
        setQuery("");
        setIsOpen(false);
      } else if (selected.type === "approval") {
        if (selected.taskId) {
          onResultClick(selected.taskId);
          setQuery("");
          setIsOpen(false);
        } else {
          // Approval has no linked task -- flash feedback and keep menu open
          setNonActionableFeedback(true);
          setTimeout(() => setNonActionableFeedback(false), 1200);
        }
      }
      return;
    }

    if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  const noResults = query.length >= 2 && !!results && !results.totalResults;

  return (
    <div className="relative w-full" style={{ maxWidth: "460px" }}>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          placeholder="Search tasks, approvals, agents..."
          style={{
            width: "100%",
            padding: "6px 12px 6px 32px",
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: "6px",
            color: "#e2e8f0",
            fontSize: "0.85rem",
            outline: "none",
          }}
        />
        <svg
          style={{
            position: "absolute",
            left: "10px",
            top: "8px",
            height: "16px",
            width: "16px",
            color: "#64748b",
          }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            zIndex: 1000,
            width: "100%",
            marginTop: 4,
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 8,
            boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
            maxHeight: 420,
            overflowY: "auto",
          }}
        >
          <div style={{ padding: "8px 12px", fontSize: "0.75rem", color: "#94a3b8", borderBottom: "1px solid #334155" }}>
            {nonActionableFeedback ? (
              <span style={{ color: "#f59e0b" }}>This item has no linked task</span>
            ) : (
              <>{results?.totalResults ?? 0} result(s)</>
            )}
          </div>

          <SearchSection
            title="Tasks"
            rows={taskResults.map((task) => ({
              key: `task-${task._id}`,
              title: task.title,
              subtitle: `${task.status} · ${task.type} · P${task.priority}`,
              onClick: () => {
                onResultClick(task._id);
                setQuery("");
                setIsOpen(false);
              },
              isSelected: flatResults[selectedIndex]?.id === `task-${task._id}`,
            }))}
          />

          <SearchSection
            title="Approvals"
            rows={approvalResults.map((approval) => ({
              key: `approval-${approval._id}`,
              title: approval.actionSummary,
              subtitle: `${approval.status} · ${approval.riskLevel} · ${approval.actionType}`,
              onClick: approval.taskId
                ? () => {
                    onResultClick(approval.taskId as string);
                    setQuery("");
                    setIsOpen(false);
                  }
                : undefined,
              isSelected: flatResults[selectedIndex]?.id === `approval-${approval._id}`,
            }))}
          />

          <SearchSection
            title="Agents"
            rows={agentResults.map((agent) => ({
              key: `agent-${agent._id}`,
              title: `${agent.emoji || "🤖"} ${agent.name}`,
              subtitle: `${agent.role} · ${agent.status}`,
              onClick: undefined,
              isSelected: false,
            }))}
          />

          <SearchSection
            title="Messages"
            rows={messageResults.slice(0, 4).map((message) => ({
              key: `message-${message._id}`,
              title: message.content.slice(0, 80),
              subtitle: message.type,
              onClick: message.taskId
                ? () => {
                    onResultClick(message.taskId as string);
                    setQuery("");
                    setIsOpen(false);
                  }
                : undefined,
              isSelected: false,
            }))}
          />
        </div>
      )}

      {noResults && (
        <div
          style={{
            position: "absolute",
            zIndex: 1000,
            width: "100%",
            marginTop: 4,
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: 8,
            padding: 16,
            textAlign: "center",
            color: "#94a3b8",
            fontSize: "0.85rem",
          }}
        >
          No results for "{query}"
        </div>
      )}
    </div>
  );
}

function SearchSection({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    key: string;
    title: string;
    subtitle: string;
    onClick?: () => void;
    isSelected: boolean;
  }>;
}) {
  if (!rows.length) return null;

  return (
    <div style={{ padding: "8px 10px", borderBottom: "1px solid #334155" }}>
      <div style={{ color: "#64748b", fontSize: "0.7rem", textTransform: "uppercase", marginBottom: 6 }}>{title}</div>
      {rows.map((row) => (
        <button
          key={row.key}
          type="button"
          onClick={row.onClick}
          disabled={!row.onClick}
          style={{
            width: "100%",
            textAlign: "left",
            padding: "8px 10px",
            border: "none",
            borderRadius: 6,
            background: row.isSelected ? "#334155" : "transparent",
            cursor: row.onClick ? "pointer" : "default",
            color: "#e2e8f0",
            opacity: row.onClick ? 1 : 0.8,
          }}
        >
          <div style={{ fontSize: "0.84rem", fontWeight: 500 }}>{row.title}</div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>{row.subtitle}</div>
        </button>
      ))}
    </div>
  );
}

