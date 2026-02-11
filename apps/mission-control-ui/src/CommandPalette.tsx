import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Plus,
  Shield,
  Bot,
  AlertTriangle,
  Search,
} from "lucide-react";

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
      { id: "new-task", label: "Create New Task", icon: <Plus className="h-4 w-4" />, shortcut: "Cmd+N", action: onCreateTask },
      { id: "open-approvals", label: "Open Approvals Center", icon: <Shield className="h-4 w-4" />, shortcut: "Cmd+Shift+A", action: onOpenApprovals },
      { id: "open-agents", label: "Open Agent Registry", icon: <Bot className="h-4 w-4" />, shortcut: "Cmd+2", action: onOpenAgents },
      ...(onOpenControls
        ? [{ id: "open-controls", label: "Open Operator Controls", icon: <AlertTriangle className="h-4 w-4" />, shortcut: "Cmd+Shift+C", action: onOpenControls }]
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
      className="fixed inset-0 bg-black/70 flex items-start justify-center pt-[100px] z-[1000]"
      onClick={onClose}
    >
      <div
        className="bg-popover border border-border rounded-xl w-full max-w-[720px] max-h-[600px] overflow-hidden shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Search input */}
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tasks, approvals, agents, or run a command..."
              className="pl-10 h-10 text-base bg-background"
              onKeyDown={(event) => {
                if (event.key === "Escape") onClose();
              }}
            />
          </div>
        </div>

        {/* Results */}
        <ScrollArea className="max-h-[480px]">
          <div className="p-3">
            {!search && (
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-2">
                Quick Actions
              </p>
            )}

            {(filteredCommands.length > 0 || !search) && (
              <ResultGroup
                title="Commands"
                rows={(search ? filteredCommands : commands).map((command) => ({
                  key: command.id,
                  title: command.label,
                  subtitle: command.shortcut,
                  icon: command.icon,
                  onClick: () => { command.action(); onClose(); },
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
                    icon: <span className="text-sm">📋</span>,
                    onClick: () => { onSelectTask(task._id); onClose(); },
                  }))}
                />

                <ResultGroup
                  title="Approvals"
                  rows={(searchResults?.approvals ?? []).map((approval) => ({
                    key: approval._id,
                    title: approval.actionSummary,
                    subtitle: `${approval.status} · ${approval.riskLevel} · ${approval.actionType}`,
                    icon: <span className="text-sm">🛡️</span>,
                    onClick: approval.taskId
                      ? () => { onSelectTask(approval.taskId as Id<"tasks">); onClose(); }
                      : undefined,
                  }))}
                />

                <ResultGroup
                  title="Agents"
                  rows={(searchResults?.agents ?? []).map((agent) => ({
                    key: agent._id,
                    title: agent.name,
                    subtitle: `${agent.role} · ${agent.status}`,
                    icon: <span className="text-sm">{agent.emoji || "🤖"}</span>,
                    onClick: () => { onOpenAgents(); onClose(); },
                  }))}
                />

                {searchResults && searchResults.totalResults === 0 && (
                  <div className="py-8 text-center text-muted-foreground text-sm">
                    No results for &ldquo;{search}&rdquo;.
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
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
    icon?: React.ReactNode;
    onClick?: () => void;
  }>;
}) {
  if (!rows.length) return null;

  return (
    <div className="mb-3">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">
        {title}
      </p>
      {rows.map((row) => (
        <button
          key={row.key}
          type="button"
          onClick={row.onClick}
          disabled={!row.onClick}
          className={cn(
            "w-full text-left px-2 py-2 rounded-md flex items-center gap-3 transition-colors",
            row.onClick
              ? "cursor-pointer hover:bg-accent text-foreground"
              : "cursor-default opacity-70 text-muted-foreground"
          )}
        >
          <span className="flex items-center justify-center w-6 h-6 rounded bg-muted text-muted-foreground shrink-0">
            {row.icon || "•"}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm truncate">{row.title}</span>
            {row.subtitle && (
              <span className="block text-xs text-muted-foreground truncate">{row.subtitle}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}
