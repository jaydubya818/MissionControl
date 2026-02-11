import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
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
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "sidebar-action-btn",
        `sidebar-action-btn-${variant}`,
        fullWidth && "full-width"
      )}
    >
      <span>{label}</span>
      {badge && <span className="sidebar-action-badge">{badge}</span>}
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
      className="agent-row w-full text-left cursor-pointer border-0"
    >
      <span className="agent-row-avatar">{agent.emoji || agent.name.charAt(0)}</span>
      <div className="agent-row-info">
        <div className="agent-row-name">{agent.name}</div>
        <div className="agent-row-role">{roleShort}</div>
      </div>
      <span
        className={cn("agent-row-status", isActive ? "active" : "paused")}
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
}) {
  const [selectedAgentId, setSelectedAgentId] = useState<Id<"agents"> | null>(null);
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const pendingApprovals = useQuery(api.approvals.listPending, projectId ? { projectId, limit: 10 } : { limit: 10 });
  const pendingCount = pendingApprovals?.length ?? 0;
  const agentCount = agents?.length ?? 0;
  const pausedCount = agents?.filter((a) => a.status === "PAUSED").length ?? 0;

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
        className="fixed top-0 right-0 bottom-0 z-50 flex flex-col border-l border-border bg-[#1e293b] shadow-xl animate-in slide-in-from-right duration-200"
        style={{ width: FLYOUT_WIDTH }}
        role="dialog"
        aria-label="Agents panel"
      >
        <div className="agents-sidebar-header flex items-center gap-2 shrink-0">
          <span className="font-bold text-sm uppercase tracking-wider text-[#e2e8f0]">
            Agents
          </span>
          <span className="agents-sidebar-count">{agentCount}</span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
            aria-label="Close agents panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="agents-sidebar-actions shrink-0">
          <div className="agents-sidebar-actions-title">Quick Actions</div>
          <div className="agents-sidebar-actions-grid">
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
          <div className="agents-sidebar-actions-critical">
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

        <div className="agents-sidebar-list flex-1 min-h-0 overflow-y-auto">
          {agents === undefined ? (
            <div className="p-3 text-muted-foreground text-sm">Loading…</div>
          ) : agents.length === 0 ? (
            <div className="p-3 text-muted-foreground text-sm">No agents</div>
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
      </aside>

      {selectedAgentId && (
        <AgentDetailFlyout
          agentId={selectedAgentId}
          onClose={() => setSelectedAgentId(null)}
        />
      )}
    </>
  );
}
