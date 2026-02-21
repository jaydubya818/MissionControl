import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import {
  Play,
  Pause,
  Plus,
  Shield,
  RefreshCw,
  Terminal,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { useToast } from "./Toast";

interface CommandPanelProps {
  projectId: Id<"projects"> | null;
  onOpenSuggestionsDrawer?: () => void;
}

interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  variant: "default" | "warning" | "danger" | "success";
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "reverse-prompt",
    label: "Reverse Prompt",
    description: "AI suggests tasks to advance your mission",
    icon: Sparkles,
    accent: "text-primary",
    variant: "default",
  },
  {
    id: "pause-all",
    label: "Pause All Agents",
    description: "Immediately halt all active agents",
    icon: Pause,
    accent: "text-amber-500",
    variant: "warning",
  },
  {
    id: "resume-all",
    label: "Resume All Agents",
    description: "Resume all paused agents",
    icon: Play,
    accent: "text-emerald-500",
    variant: "success",
  },
  {
    id: "create-task",
    label: "Quick Task",
    description: "Create a new task in INBOX",
    icon: Plus,
    accent: "text-primary",
    variant: "default",
  },
  {
    id: "approve-all",
    label: "Bulk Approve",
    description: "Approve all pending low-risk items",
    icon: CheckCircle2,
    accent: "text-emerald-500",
    variant: "success",
  },
  {
    id: "run-standup",
    label: "Trigger Standup",
    description: "Generate squad standup report",
    icon: RefreshCw,
    accent: "text-primary",
    variant: "default",
  },
  {
    id: "emergency-stop",
    label: "Emergency Stop",
    description: "Kill switch — quarantine all agents",
    icon: AlertTriangle,
    accent: "text-destructive",
    variant: "danger",
  },
];

const variantHoverStyles: Record<string, string> = {
  default: "hover:bg-accent",
  warning: "hover:bg-amber-500/5 hover:border-amber-500/20",
  danger: "hover:bg-destructive/5 hover:border-destructive/20",
  success: "hover:bg-emerald-500/5 hover:border-emerald-500/20",
};

export function CommandPanel({ projectId, onOpenSuggestionsDrawer }: CommandPanelProps) {
  const [lastAction, setLastAction] = useState<string | null>(null);
  const { toast } = useToast();

  const pauseAll = useMutation(api.agents.pauseAll);
  const resumeAll = useMutation(api.agents.resumeAll);
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const approvals = useQuery(api.approvals.listPending, projectId ? { projectId, limit: 10 } : { limit: 10 });

  const activeCount = agents?.filter((a) => a.status === "ACTIVE").length ?? 0;
  const pausedCount = agents?.filter((a) => a.status === "PAUSED").length ?? 0;

  const handleAction = async (actionId: string) => {
    setLastAction(actionId);
    try {
      switch (actionId) {
        case "reverse-prompt":
          if (onOpenSuggestionsDrawer) {
            onOpenSuggestionsDrawer();
          } else {
            toast("Reverse Prompt drawer not available");
          }
          break;
        case "pause-all": {
          const result = await pauseAll({
            projectId: projectId ?? undefined,
            reason: "Command Panel: Pause All",
            userId: "operator",
          });
          toast(`Paused ${(result as { paused: number }).paused} agent(s)`);
          break;
        }
        case "resume-all": {
          const result = await resumeAll({
            projectId: projectId ?? undefined,
            reason: "Command Panel: Resume All",
            userId: "operator",
          });
          toast(`Resumed ${(result as { resumed: number }).resumed} agent(s)`);
          break;
        }
        default:
          toast(`Action "${actionId}" not yet wired`);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Action failed", true);
    }
  };

  return (
    <main className="flex-1 overflow-auto">
      <div className="max-w-[900px] mx-auto px-6 py-5">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Terminal className="h-4 w-4 text-primary" />
            <h1 className="text-sm font-semibold tracking-tight text-foreground">
              Command Panel
            </h1>
          </div>
          <p className="text-xs text-muted-foreground">
            Quick operations for common agent and task management actions
          </p>
        </div>

        <Card className="p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-xs text-foreground">
                  <span className="font-semibold">{activeCount}</span>{" "}
                  <span className="text-muted-foreground">active</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="text-xs text-foreground">
                  <span className="font-semibold">{pausedCount}</span>{" "}
                  <span className="text-muted-foreground">paused</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-primary" />
                <span className="text-xs text-foreground">
                  <span className="font-semibold">{approvals?.length ?? 0}</span>{" "}
                  <span className="text-muted-foreground">pending approvals</span>
                </span>
              </div>
            </div>
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Online
            </span>
          </div>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Card
                key={action.id}
                className={cn(
                  "p-4 cursor-pointer transition-colors",
                  variantHoverStyles[action.variant]
                )}
                onClick={() => handleAction(action.id)}
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-muted p-2 border border-border">
                    <Icon className={`h-4 w-4 ${action.accent}`} strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground mb-0.5">
                      {action.label}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {action.description}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {lastAction && (
          <Card className="p-3 mt-6">
            <p className="text-xs text-muted-foreground">
              Last action: <span className="text-foreground font-medium">{lastAction}</span>{" "}
              at {new Date().toLocaleTimeString()}
            </p>
          </Card>
        )}
      </div>
    </main>
  );
}
