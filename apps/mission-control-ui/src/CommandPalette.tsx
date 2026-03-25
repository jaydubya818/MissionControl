import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { MainView } from "./TopNav";
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
import {
  Bot,
  Plus,
  Shield,
  AlertTriangle,
  DollarSign,
  Radio,
  LayoutDashboard,
  ListTodo,
  Calendar,
  Activity,
  Radar,
  Factory,
  GitBranch,
  MessageSquare,
  Brain,
  Users,
} from "lucide-react";

interface CommandPaletteProps {
  projectId: Id<"projects"> | null;
  onClose: () => void;
  onSelectTask: (taskId: Id<"tasks">) => void;
  onCreateTask: () => void;
  onOpenApprovals: () => void;
  onOpenAgents: () => void;
  onOpenControls?: () => void;
  onOpenCostAnalytics?: () => void;
  onOpenCreateAgent?: () => void;
  onNavigateToGateway?: () => void;
  /** Jump to a main view and close the palette */
  onNavigateView?: (view: MainView) => void;
}

export function CommandPalette({
  projectId,
  onClose,
  onSelectTask,
  onCreateTask,
  onOpenApprovals,
  onOpenAgents,
  onOpenControls,
  onOpenCostAnalytics,
  onOpenCreateAgent,
  onNavigateToGateway,
  onNavigateView,
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
      ...(onOpenCostAnalytics ? [{ id: "cost-analytics", label: "Cost Analytics", icon: <DollarSign className="h-4 w-4" />, shortcut: "Cmd+Shift+I", action: onOpenCostAnalytics }] : []),
      ...(onOpenCreateAgent ? [{ id: "create-agent", label: "Create Agent", icon: <Bot className="h-4 w-4" />, shortcut: "", action: onOpenCreateAgent }] : []),
      ...(onNavigateToGateway ? [{ id: "connect-gateway", label: "Connect Gateway", icon: <Radio className="h-4 w-4" />, shortcut: "", action: onNavigateToGateway }] : []),
      ...(onOpenControls
        ? [{ id: "open-controls", label: "Open Operator Controls", icon: <AlertTriangle className="h-4 w-4" />, shortcut: "Cmd+Shift+C", action: onOpenControls }]
        : []),
    ],
    [onCreateTask, onOpenApprovals, onOpenAgents, onOpenControls, onOpenCostAnalytics, onOpenCreateAgent, onNavigateToGateway]
  );

  const filteredCommands = commands.filter((command) =>
    command.label.toLowerCase().includes(search.toLowerCase())
  );

  const navigateCommands = useMemo(() => {
    if (!onNavigateView) return [];
    const q = search.trim().toLowerCase();
    const all: {
      id: string;
      label: string;
      view: MainView;
      icon: ReactNode;
      /** Matched by cmdk via value string */
      value: string;
    }[] = [
      {
        id: "nav-home",
        label: "Go to Home",
        view: "home",
        icon: <LayoutDashboard className="h-4 w-4" />,
        value: "Go to Home dashboard home start",
      },
      {
        id: "nav-tasks",
        label: "Go to Tasks",
        view: "tasks",
        icon: <ListTodo className="h-4 w-4" />,
        value: "Go to Tasks board kanban inbox",
      },
      {
        id: "nav-agents",
        label: "Go to Agents",
        view: "agents",
        icon: <Users className="h-4 w-4" />,
        value: "Go to Agents registry squad",
      },
      {
        id: "nav-schedule",
        label: "Go to Schedule",
        view: "ops-schedule",
        icon: <Calendar className="h-4 w-4" />,
        value: "Go to Schedule ops calendar timeline operations",
      },
      {
        id: "nav-system",
        label: "Go to System",
        view: "system",
        icon: <Activity className="h-4 w-4" />,
        value: "Go to System platform health status",
      },
      {
        id: "nav-radar",
        label: "Go to Radar",
        view: "radar",
        icon: <Radar className="h-4 w-4" />,
        value: "Go to Radar alerts monitoring",
      },
      {
        id: "nav-factory",
        label: "Go to Factory",
        view: "factory",
        icon: <Factory className="h-4 w-4" />,
        value: "Go to Factory jobs batch scheduled",
      },
      {
        id: "nav-pipeline",
        label: "Go to Pipeline",
        view: "pipeline",
        icon: <GitBranch className="h-4 w-4" />,
        value: "Go to Pipeline content code crm",
      },
      {
        id: "nav-feedback",
        label: "Go to Feedback",
        view: "feedback",
        icon: <MessageSquare className="h-4 w-4" />,
        value: "Go to Feedback qc approvals findings",
      },
      {
        id: "nav-memory",
        label: "Go to Memory",
        view: "memory",
        icon: <Brain className="h-4 w-4" />,
        value: "Go to Memory journal knowledge",
      },
    ];
    if (!q) return all;
    return all.filter((item) => item.value.toLowerCase().includes(q));
  }, [onNavigateView, search]);

  const hasSearch = search.trim().length >= 2;
  const hasNoResults =
    hasSearch &&
    !!searchResults &&
    searchResults.totalResults === 0 &&
    filteredCommands.length === 0 &&
    navigateCommands.length === 0;

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

        {onNavigateView && navigateCommands.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Navigate">
              {navigateCommands.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.value}
                  onSelect={() => {
                    onNavigateView(item.view);
                    onClose();
                  }}
                >
                  {item.icon}
                  <span className="flex-1">{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

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
