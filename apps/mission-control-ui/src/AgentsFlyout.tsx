import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./components/factory/badges";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AgentDetailFlyout } from "./AgentDetailFlyout";

const FLYOUT_WIDTH = 320;

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
    default: "border-line bg-surface-2 text-ink-secondary hover:text-ink hover:border-line-strong",
    warning: "border-transparent bg-warn-soft text-warn hover:opacity-90",
    danger: "border-transparent bg-err-soft text-err hover:opacity-90",
    success: "border-transparent bg-ok-soft text-ok hover:opacity-90",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-2 rounded-lg text-xs font-medium border transition-colors duration-150 cursor-pointer",
        variantClasses[variant],
        fullWidth ? "w-full" : "flex-1 min-w-0"
      )}
    >
      <span className="flex items-center justify-center gap-1.5">
        {label}
        {badge && <StatusBadge tone="info">{badge}</StatusBadge>}
      </span>
    </button>
  );
}

function AgentRow({
  agent,
  onClick,
}: {
  agent: Doc<"agents">;
  onClick: () => void;
}) {
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
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2 text-left cursor-pointer border-0 bg-transparent hover:bg-surface-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${agent.name}, ${roleShort}, ${statusLabel}`}
    >
      <span className="flex w-8 h-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-sm text-ink">
        {agent.emoji || agent.name.charAt(0)}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-ink truncate">{agent.name}</div>
        <div className="text-[11.5px] text-ink-muted">{roleShort}</div>
      </div>
      <span
        className={cn(
          "w-2 h-2 rounded-full shrink-0",
          isActive ? "bg-ok" : "bg-ink-muted"
        )}
        title={agent.status}
        aria-hidden
      />
    </button>
  );
}

export function AgentsFlyout({
  projectId,
  onClose,
  onOpenApprovals,
  onOpenPolicy,
  onOpenOperatorControls,
  onOpenNotifications,
  onOpenStandup,
  onPauseSquad,
  onResumeSquad,
  onOpenOrg,
}: {
  projectId: Id<"projects"> | null;
  onClose: () => void;
  onOpenApprovals?: () => void;
  onOpenPolicy?: () => void;
  onOpenOperatorControls?: () => void;
  onOpenNotifications?: () => void;
  onOpenStandup?: () => void;
  onPauseSquad?: () => void;
  onResumeSquad?: () => void;
  onOpenOrg?: (agentId: Id<"agents">) => void;
}) {
  const [selectedAgentId, setSelectedAgentId] = useState<Id<"agents"> | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const pendingApprovals = useQuery(api.approvals.countPending, projectId ? { projectId } : "skip");
  const pendingCount = pendingApprovals?.total ?? 0;
  const agentCount = agents?.length ?? 0;
  const pausedCount = agents?.filter((a) => a.status === "PAUSED").length ?? 0;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (selectedAgentId) {
        setSelectedAgentId(null);
      } else {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, selectedAgentId]);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus({ preventScroll: true });
    return () => returnFocusRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        aria-hidden
        onClick={onClose}
      />

      {/* Fly-out panel */}
      <aside
        ref={panelRef}
        className="fixed top-0 left-0 bottom-0 z-50 flex flex-col border-r border-line bg-surface-1 animate-in slide-in-from-left duration-200"
        style={{ width: FLYOUT_WIDTH }}
        role="dialog"
        aria-modal="true"
        aria-label="Agents panel"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 shrink-0 border-b border-line">
          <span className="font-semibold text-[13px] text-ink">
            Agents
          </span>
          <StatusBadge tone="neutral">{agentCount}</StatusBadge>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto p-1.5 rounded-md text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors duration-150"
            aria-label="Close agents panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Quick Actions */}
        <div className="px-3 py-3 shrink-0 border-b border-line">
          <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted mb-2">
            Quick Actions
          </div>
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            {onOpenNotifications && (
              <SidebarButton onClick={onOpenNotifications} label="Notifications" />
            )}
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
              <SidebarButton
                onClick={onOpenOperatorControls}
                label="Controls"
                variant="warning"
                fullWidth
              />
            )}
            {onPauseSquad && (
              <SidebarButton onClick={onPauseSquad} label="Pause squad" variant="danger" fullWidth />
            )}
            {onResumeSquad && pausedCount > 0 && (
              <SidebarButton
                onClick={onResumeSquad}
                label={`Resume ${pausedCount} paused`}
                variant="success"
                fullWidth
              />
            )}
          </div>
        </div>

        {/* Agent List */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="py-1">
            {agents === undefined ? (
              <div className="p-3 flex flex-col gap-2">
                <div className="h-3.5 animate-pulse rounded bg-surface-2" />
                <div className="h-3.5 animate-pulse rounded bg-surface-2" />
                <div className="h-3.5 animate-pulse rounded bg-surface-2" />
              </div>
            ) : agents.length === 0 ? (
              <div className="p-3 text-ink-muted text-[13px]">No agents</div>
            ) : (
              agents.map((a: Doc<"agents">) => (
                <AgentRow
                  key={a._id}
                  agent={a}
                  onClick={() => setSelectedAgentId(a._id)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </aside>

      {selectedAgentId && (
        <AgentDetailFlyout
          agentId={selectedAgentId}
          onClose={() => setSelectedAgentId(null)}
          onEdit={onOpenOrg}
        />
      )}
    </>
  );
}
