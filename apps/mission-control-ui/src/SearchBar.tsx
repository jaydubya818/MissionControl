import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

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

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
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
    <div className="relative w-full max-w-[460px]">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          placeholder="Search tasks, approvals, agents..."
          className="h-8 pl-8 text-sm"
          aria-label="Search tasks, approvals, and agents"
        />
      </div>

      {isOpen && (
        <div className="absolute z-[1000] mt-1.5 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          <div className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
            {nonActionableFeedback ? (
              <span className="text-amber-500">This item has no linked task</span>
            ) : (
              <>{results?.totalResults ?? 0} result(s)</>
            )}
          </div>
          <ScrollArea className="max-h-[420px]">
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
          </ScrollArea>
        </div>
      )}

      {noResults && (
        <div className="absolute z-[1000] mt-1.5 w-full rounded-lg border border-border bg-popover px-4 py-3 text-center text-sm text-muted-foreground shadow-lg">
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
    <div className="border-b border-border/70 p-2 last:border-b-0">
      <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {rows.map((row) => (
        <button
          key={row.key}
          type="button"
          onClick={row.onClick}
          disabled={!row.onClick}
          className={cn(
            "w-full rounded-md px-2 py-2 text-left transition-colors",
            row.isSelected && "bg-accent",
            row.onClick
              ? "cursor-pointer text-foreground hover:bg-accent"
              : "cursor-default text-muted-foreground/90"
          )}
        >
          <span className="block truncate text-sm font-medium">{row.title}</span>
          <span className="block truncate text-xs text-muted-foreground">{row.subtitle}</span>
        </button>
      ))}
    </div>
  );
}
