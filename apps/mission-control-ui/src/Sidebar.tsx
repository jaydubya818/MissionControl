import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const SIDEBAR_WIDTH = 260;
export const SIDEBAR_COLLAPSED = 48;

export function Sidebar({
  projectId,
  onOpenApprovals,
  onOpenPolicy,
  onOpenOperatorControls,
  onOpenNotifications,
  onOpenStandup,
  onPauseSquad,
  onResumeSquad,
  onAgentSelect,
  onWidthChange,
}: {
  projectId: Id<"projects"> | null;
  onOpenApprovals?: () => void;
  onOpenPolicy?: () => void;
  onOpenOperatorControls?: () => void;
  onOpenNotifications?: () => void;
  onOpenStandup?: () => void;
  onPauseSquad?: () => void;
  onResumeSquad?: () => void;
  onAgentSelect?: (agentId: Id<"agents">) => void;
  onWidthChange?: (width: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("mc.sidebar_collapsed") === "1";
  });
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const pendingApprovals = useQuery(api.approvals.listPending, projectId ? { projectId, limit: 10 } : { limit: 10 });
  const pendingCount = pendingApprovals?.length ?? 0;
  const agentCount = agents?.length ?? 0;
  const pausedCount = agents?.filter((a) => a.status === "PAUSED").length ?? 0;

  const width = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH;

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("mc.sidebar_collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    onWidthChange?.(width);
  }, [onWidthChange, width]);

  return (
    <aside
      className="flex flex-col border-r border-border bg-card shrink-0 overflow-hidden transition-[width] duration-200"
      style={{ width, minWidth: width }}
    >
      {/* Header */}
      <div className={cn("px-3 py-3 border-b border-border flex items-center shrink-0", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed && (
          <>
            <span className="font-semibold text-xs uppercase tracking-wider text-foreground">
              Agents
            </span>
            <Badge variant="outline" className="text-xs px-1.5 py-0">
              {agentCount}
            </Badge>
          </>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Quick Actions */}
          <div className="px-3 py-3 shrink-0 border-b border-border">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Quick Actions
            </div>
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              {onOpenNotifications && <SidebarButton onClick={onOpenNotifications} label="Notifications" />}
              {onOpenApprovals && (
                <SidebarButton
                  onClick={onOpenApprovals}
                  label="Approvals"
                  badge={pendingCount > 0 ? String(pendingCount) : undefined}
                />
              )}
              {onOpenStandup && <SidebarButton onClick={onOpenStandup} label="Standup" />}
              {onOpenPolicy && <SidebarButton onClick={onOpenPolicy} label="Policy" />}
            </div>
            <div className="flex flex-col gap-1.5">
              {onOpenOperatorControls && (
                <SidebarButton onClick={onOpenOperatorControls} label="Controls" variant="warning" fullWidth />
              )}
              {onPauseSquad && (
                <SidebarButton onClick={onPauseSquad} label="Pause squad" variant="danger" fullWidth />
              )}
              {onResumeSquad && pausedCount > 0 && (
                <SidebarButton onClick={onResumeSquad} label={`Resume ${pausedCount} paused`} variant="success" fullWidth />
              )}
            </div>
          </div>

          {/* Agent List */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="py-1">
              {agents === undefined ? (
                <div className="p-3 text-muted-foreground text-sm">Loading...</div>
              ) : agents.length === 0 ? (
                <div className="p-3 text-muted-foreground text-sm">No agents</div>
              ) : (
                agents.map((a: Doc<"agents">) => (
                  <AgentRow
                    key={a._id}
                    agent={a}
                    onClick={onAgentSelect ? () => onAgentSelect(a._id) : undefined}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </>
      )}
    </aside>
  );
}

function AgentRow({ agent, onClick }: { agent: Doc<"agents">; onClick?: () => void }) {
  const isActive = agent.status === "ACTIVE";
  const statusLabel = isActive ? "Active" : "Not active";
  const roleShort =
    agent.role === "LEAD"
      ? "Lead"
      : agent.role === "SPECIALIST"
        ? "Spc"
        : agent.role === "INTERN"
          ? "Int"
          : agent.role;

  return (
    <button
      type="button"
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 text-left border-0 bg-transparent transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        onClick ? "cursor-pointer hover:bg-muted/50" : "cursor-default"
      )}
      onClick={onClick}
      aria-label={`${agent.name}, ${roleShort}, ${statusLabel}`}
      disabled={!onClick}
    >
      <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm shrink-0">
        {agent.emoji || agent.name.charAt(0)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground truncate">{agent.name}</div>
        <div className="text-xs text-muted-foreground">{roleShort}</div>
      </div>
      <span
        className={cn(
          "w-2 h-2 rounded-full shrink-0",
          isActive ? "bg-emerald-500" : "bg-muted-foreground/40"
        )}
        title={agent.status}
        aria-hidden
      />
    </button>
  );
}

function SidebarButton({
  onClick,
  label,
  badge,
  variant = "default",
  fullWidth = false,
}: {
  onClick: () => void;
  label: string;
  badge?: string;
  variant?: "default" | "warning" | "danger" | "success";
  fullWidth?: boolean;
}) {
  const variantClasses: Record<string, string> = {
    default: "bg-muted hover:bg-muted/80 text-foreground",
    warning: "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/20",
    danger: "bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20",
    success: "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-2 rounded-md text-xs font-medium border border-border transition-colors cursor-pointer",
        variantClasses[variant],
        fullWidth ? "w-full" : "flex-1 min-w-0"
      )}
    >
      <span className="flex items-center justify-center gap-1.5">
        {label}
        {badge && (
          <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 min-w-[18px] justify-center">
            {badge}
          </Badge>
        )}
      </span>
    </button>
  );
}
