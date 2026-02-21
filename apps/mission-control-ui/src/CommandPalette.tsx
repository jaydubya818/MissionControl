import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Bot, Plus, Shield, AlertTriangle } from "lucide-react";

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

  const searchResults = useQuery(
    api.search.searchAll,
    projectId && search.trim().length >= 2
      ? { projectId, query: search.trim(), limit: 8 }
      : "skip"
  );

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
  const hasNoResults = hasSearch && !!searchResults && searchResults.totalResults === 0 && filteredCommands.length === 0;

  return (
    <CommandDialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <CommandInput
        value={search}
        onValueChange={setSearch}
        placeholder="Search tasks, approvals, agents, or run a command..."
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Commands">
          {(search ? filteredCommands : commands).map((command) => (
            <CommandItem
              key={command.id}
              value={`${command.label}-${command.id}`}
              onSelect={() => {
                command.action();
                onClose();
              }}
            >
              {command.icon}
              <span className="flex-1">{command.label}</span>
              <CommandShortcut>{command.shortcut}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>

        {hasSearch && <CommandSeparator />}

        {hasSearch && (
          <>
            <CommandGroup heading="Tasks">
              {(searchResults?.tasks ?? []).map((task) => (
                <CommandItem
                  key={task._id}
                  value={`${task.title}-${task._id}`}
                  onSelect={() => {
                    onSelectTask(task._id);
                    onClose();
                  }}
                >
                  <span className="text-base leading-none">📋</span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-sm">{task.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {task.status} · {task.type} · P{task.priority}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandGroup heading="Approvals">
              {(searchResults?.approvals ?? []).map((approval) => (
                <CommandItem
                  key={approval._id}
                  value={`${approval.actionSummary}-${approval._id}`}
                  onSelect={() => {
                    if (!approval.taskId) return;
                    onSelectTask(approval.taskId as Id<"tasks">);
                    onClose();
                  }}
                  disabled={!approval.taskId}
                >
                  <span className="text-base leading-none">🛡️</span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-sm">{approval.actionSummary}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {approval.status} · {approval.riskLevel} · {approval.actionType}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandGroup heading="Agents">
              {(searchResults?.agents ?? []).map((agent) => (
                <CommandItem
                  key={agent._id}
                  value={`${agent.name}-${agent._id}`}
                  onSelect={() => {
                    onOpenAgents();
                    onClose();
                  }}
                >
                  <span className="text-base leading-none">{agent.emoji || "🤖"}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-sm">{agent.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {agent.role} · {agent.status}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {hasNoResults && (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No results for &ldquo;{search}&rdquo;.
          </div>
        )}
      </CommandList>
    </CommandDialog>
  );
}
