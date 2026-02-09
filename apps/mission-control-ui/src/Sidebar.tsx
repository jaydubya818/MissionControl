import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

const SIDEBAR_WIDTH = 260;
const SIDEBAR_COLLAPSED = 48;

export function Sidebar({
  projectId,
  onOpenApprovals,
  onOpenPolicy,
  onOpenOperatorControls,
  onOpenNotifications,
  onOpenStandup,
  onPauseSquad,
  onResumeSquad,
}: {
  projectId: Id<"projects"> | null;
  onOpenApprovals?: () => void;
  onOpenPolicy?: () => void;
  onOpenOperatorControls?: () => void;
  onOpenNotifications?: () => void;
  onOpenStandup?: () => void;
  onPauseSquad?: () => void;
  onResumeSquad?: () => void;
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

  return (
    <aside
      className="agents-sidebar"
      style={{
        width,
        minWidth: width,
        transition: "width 0.2s ease",
      }}
    >
      <div
        style={{
          padding: "12px 14px",
          borderBottom: "1px solid #334155",
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
        }}
      >
        {!collapsed && (
          <>
            <span style={{ fontWeight: 700, fontSize: "0.8rem", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Agents
            </span>
            <span className="agents-sidebar-count">{agentCount}</span>
          </>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          style={{
            background: "none",
            border: "none",
            color: "#94a3b8",
            cursor: "pointer",
            padding: 4,
            fontSize: "1rem",
          }}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "→" : "←"}
        </button>
      </div>
      {!collapsed && (
        <>
          <div className="agents-sidebar-actions">
            <div className="agents-sidebar-actions-title">Quick Actions</div>
            <div className="agents-sidebar-actions-grid">
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
            <div className="agents-sidebar-actions-critical">
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
          <div className="agents-sidebar-list">
            {agents === undefined ? (
              <div style={{ padding: 12, color: "#64748b", fontSize: "0.8rem" }}>Loading…</div>
            ) : agents.length === 0 ? (
              <div style={{ padding: 12, color: "#64748b", fontSize: "0.8rem" }}>No agents</div>
            ) : (
              agents.map((a: Doc<"agents">) => <AgentRow key={a._id} agent={a} />)
            )}
          </div>
        </>
      )}
    </aside>
  );
}

function AgentRow({ agent }: { agent: Doc<"agents"> }) {
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
    <div className="agent-row">
      <span className="agent-row-avatar">{agent.emoji || agent.name.charAt(0)}</span>
      <div className="agent-row-info">
        <div className="agent-row-name">{agent.name}</div>
        <div className="agent-row-role">{roleShort}</div>
      </div>
      <span
        className={"agent-row-status " + (isActive ? "active" : "paused")}
        title={agent.status}
        aria-hidden
      />
    </div>
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
  return (
    <button
      type="button"
      onClick={onClick}
      className={`sidebar-action-btn sidebar-action-btn-${variant}${fullWidth ? " full-width" : ""}`}
    >
      <span>{label}</span>
      {badge && (
        <span className="sidebar-action-badge">
          {badge}
        </span>
      )}
    </button>
  );
}
