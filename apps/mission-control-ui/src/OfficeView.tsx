import { CSSProperties, useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { motion, AnimatePresence } from "framer-motion";
import type { Id, Doc } from "../../../convex/_generated/dataModel";

interface OfficeViewProps {
  projectId: Id<"projects"> | null;
}

const colors = {
  bgPage: "#0f172a",
  bgCard: "#1e293b",
  bgCardHover: "#253347",
  bgHover: "#25334d",
  border: "#334155",
  borderSubtle: "#1e293b",
  textPrimary: "#e2e8f0",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  accentBlue: "#3b82f6",
  accentGreen: "#10b981",
  accentOrange: "#f59e0b",
  accentPurple: "#8b5cf6",
  accentRed: "#ef4444",
  accentCyan: "#06b6d4",
};

type AgentStatusType = "ACTIVE" | "PAUSED" | "DRAINED" | "QUARANTINED" | "OFFLINE";

function getStatusConfig(status: AgentStatusType, hasTask: boolean) {
  switch (status) {
    case "ACTIVE":
      return hasTask
        ? { color: colors.accentGreen, label: "Working", glow: true, pulse: true }
        : { color: colors.accentBlue, label: "Idle", glow: false, pulse: false };
    case "PAUSED":
      return { color: colors.accentOrange, label: "Paused", glow: false, pulse: false };
    case "DRAINED":
      return { color: colors.accentOrange, label: "Draining", glow: false, pulse: false };
    case "QUARANTINED":
      return { color: colors.accentRed, label: "Quarantined", glow: true, pulse: true };
    case "OFFLINE":
      return { color: colors.textMuted, label: "Offline", glow: false, pulse: false };
    default:
      return { color: colors.textMuted, label: status, glow: false, pulse: false };
  }
}

function getHeartbeatAge(lastHeartbeatAt?: number): { text: string; healthy: boolean } {
  if (!lastHeartbeatAt) return { text: "Never", healthy: false };
  const diffMs = Date.now() - lastHeartbeatAt;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return { text: `${diffSec}s ago`, healthy: true };
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return { text: `${diffMin}m ago`, healthy: diffMin < 3 };
  const diffH = Math.floor(diffMin / 60);
  return { text: `${diffH}h ago`, healthy: false };
}

function formatElapsed(startedAt: number): string {
  const diffMs = Date.now() - startedAt;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just started";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
}

function getRoleBadge(role: string) {
  switch (role) {
    case "LEAD":
      return { bg: `${colors.accentPurple}25`, color: colors.accentPurple, label: "Lead" };
    case "SPECIALIST":
      return { bg: `${colors.accentBlue}25`, color: colors.accentBlue, label: "Specialist" };
    case "INTERN":
      return { bg: `${colors.accentCyan}25`, color: colors.accentCyan, label: "Intern" };
    default:
      return { bg: `${colors.textMuted}25`, color: colors.textMuted, label: role };
  }
}

export function OfficeView({ projectId }: OfficeViewProps) {
  const agents = useQuery(api.agents.list, { projectId: projectId ?? undefined });
  const tasks = useQuery(api.tasks.list, { projectId: projectId ?? undefined });
  const resetAllAgents = useMutation(api.agents.resetAll);
  const [selectedAgent, setSelectedAgent] = useState<Id<"agents"> | null>(null);
  const [filterStatus, setFilterStatus] = useState<"ALL" | AgentStatusType>("ALL");
  const [resetting, setResetting] = useState(false);
  const [, setTick] = useState(0);

  // Tick every 10s for heartbeat age updates
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(interval);
  }, []);

  const agentsWithTasks = useMemo(() => {
    if (!agents) return [];
    return agents.map((agent) => {
      const currentTask = agent.currentTaskId
        ? tasks?.find((t) => t._id === agent.currentTaskId)
        : null;
      return { agent, currentTask };
    });
  }, [agents, tasks]);

  const filteredAgents = useMemo(() => {
    const base = filterStatus === "ALL" ? agentsWithTasks : agentsWithTasks.filter((a) => a.agent.status === filterStatus);
    // Sort: working first, then idle/active, then paused, then quarantined, then offline
    const statusOrder: Record<string, number> = {
      ACTIVE: 0,
      PAUSED: 2,
      DRAINED: 3,
      QUARANTINED: 4,
      OFFLINE: 5,
    };
    return [...base].sort((a, b) => {
      const aWorking = a.agent.status === "ACTIVE" && !!a.currentTask ? -1 : 0;
      const bWorking = b.agent.status === "ACTIVE" && !!b.currentTask ? -1 : 0;
      if (aWorking !== bWorking) return aWorking - bWorking;
      const aOrder = statusOrder[a.agent.status] ?? 9;
      const bOrder = statusOrder[b.agent.status] ?? 9;
      return aOrder - bOrder;
    });
  }, [agentsWithTasks, filterStatus]);

  // Stats
  const stats = useMemo(() => {
    if (!agents) return { total: 0, active: 0, working: 0, idle: 0, paused: 0, offline: 0, quarantined: 0 };
    const active = agents.filter((a) => a.status === "ACTIVE");
    const working = active.filter((a) => a.currentTaskId);
    return {
      total: agents.length,
      active: active.length,
      working: working.length,
      idle: active.length - working.length,
      paused: agents.filter((a) => a.status === "PAUSED").length,
      offline: agents.filter((a) => a.status === "OFFLINE").length,
      quarantined: agents.filter((a) => a.status === "QUARANTINED").length,
    };
  }, [agents]);

  if (!agents) {
    return (
      <main style={styles.container}>
        <div style={styles.loadingContainer}>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
            style={styles.spinner}
          />
          <div style={{ color: colors.textSecondary, marginTop: 12 }}>Loading office...</div>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTop}>
          <div>
            <h1 style={styles.title}>Agent Office</h1>
            <p style={styles.subtitle}>Real-time agent workstation view</p>
          </div>
          {stats.quarantined > 0 && (
            <button
              onClick={async () => {
                setResetting(true);
                try {
                  await resetAllAgents({ projectId: projectId ?? undefined });
                } catch (err: any) {
                  console.error("Reset all agents failed:", err);
                  alert(err.message || "Failed to reset agents. Please try again.");
                } finally {
                  setResetting(false);
                }
              }}
              disabled={resetting}
              style={{
                padding: "8px 18px",
                fontSize: "0.8rem",
                fontWeight: 600,
                background: resetting ? colors.textMuted : colors.accentGreen,
                border: "none",
                borderRadius: 8,
                color: "#fff",
                cursor: resetting ? "not-allowed" : "pointer",
                transition: "opacity 0.15s",
                whiteSpace: "nowrap",
                alignSelf: "flex-start",
              }}
            >
              {resetting ? "Resetting..." : `Reset ${stats.quarantined} Quarantined`}
            </button>
          )}
        </div>

        {/* Stats Row */}
        <div style={styles.statsRow}>
          <StatChip
            label={`All (${stats.total})`}
            value={stats.total}
            color={colors.textSecondary}
            active={filterStatus === "ALL"}
            onClick={() => setFilterStatus("ALL")}
            hideValue
          />
          <span style={{ width: 1, height: 20, background: colors.border, flexShrink: 0 }} />
          <StatChip
            label="Working"
            value={stats.working}
            color={colors.accentGreen}
            active={filterStatus === "ACTIVE"}
            onClick={() => setFilterStatus(filterStatus === "ACTIVE" ? "ALL" : "ACTIVE")}
          />
          <StatChip
            label="Idle"
            value={stats.idle}
            color={colors.accentBlue}
            active={false}
          />
          <StatChip
            label="Paused"
            value={stats.paused}
            color={colors.accentOrange}
            active={filterStatus === "PAUSED"}
            onClick={() => setFilterStatus(filterStatus === "PAUSED" ? "ALL" : "PAUSED")}
          />
          <StatChip
            label="Offline"
            value={stats.offline}
            color={colors.textMuted}
            active={filterStatus === "OFFLINE"}
            onClick={() => setFilterStatus(filterStatus === "OFFLINE" ? "ALL" : "OFFLINE")}
          />
          {stats.quarantined > 0 && (
            <StatChip
              label="Quarantined"
              value={stats.quarantined}
              color={colors.accentRed}
              active={filterStatus === "QUARANTINED"}
              onClick={() =>
                setFilterStatus(filterStatus === "QUARANTINED" ? "ALL" : "QUARANTINED")
              }
            />
          )}
        </div>
      </div>

      {/* Agent Grid */}
      <div style={styles.grid}>
        <AnimatePresence mode="popLayout">
          {filteredAgents.map(({ agent, currentTask }) => (
            <motion.div
              key={agent._id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.25 }}
            >
              <AgentCard
                agent={agent}
                currentTask={currentTask}
                isSelected={agent._id === selectedAgent}
                onSelect={() =>
                  setSelectedAgent(selectedAgent === agent._id ? null : agent._id)
                }
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredAgents.length === 0 && (
          <div style={styles.emptyState}>
            <span style={{ fontSize: "2rem" }}>&#128373;</span>
            <p style={{ color: colors.textSecondary, margin: "8px 0 0" }}>
              No agents match the current filter
            </p>
          </div>
        )}
      </div>

      {/* Detail Panel */}
      <AnimatePresence>
        {selectedAgent && (
          <AgentDetailPanel
            agentId={selectedAgent}
            projectId={projectId}
            onClose={() => setSelectedAgent(null)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

/* ============================================================================
   Stat Chip
   ============================================================================ */

function StatChip({
  label,
  value,
  color,
  active,
  onClick,
  hideValue,
}: {
  label: string;
  value: number;
  color: string;
  active: boolean;
  onClick?: () => void;
  hideValue?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 14px",
        borderRadius: 20,
        border: active ? `1.5px solid ${color}` : `1px solid ${colors.border}`,
        background: active ? `${color}15` : colors.bgCard,
        color: colors.textPrimary,
        cursor: onClick ? "pointer" : "default",
        fontSize: "0.8rem",
        fontFamily: "inherit",
        transition: "all 0.2s",
      }}
    >
      {!hideValue && (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: color,
            flexShrink: 0,
          }}
        />
      )}
      {!hideValue && <span style={{ fontWeight: 600 }}>{value}</span>}
      <span style={{ color: active ? colors.textPrimary : colors.textSecondary }}>{label}</span>
    </button>
  );
}

/* ============================================================================
   Agent Card
   ============================================================================ */

interface AgentCardProps {
  agent: Doc<"agents">;
  currentTask: Doc<"tasks"> | null | undefined;
  isSelected: boolean;
  onSelect: () => void;
}

function AgentCard({ agent, currentTask, isSelected, onSelect }: AgentCardProps) {
  const statusConfig = getStatusConfig(agent.status as AgentStatusType, !!currentTask);
  const roleBadge = getRoleBadge(agent.role);
  const heartbeat = getHeartbeatAge(agent.lastHeartbeatAt);
  const budgetPct = agent.budgetDaily > 0 ? (agent.spendToday / agent.budgetDaily) * 100 : 0;
  const isWorking = agent.status === "ACTIVE" && !!currentTask;

  return (
    <motion.button
      onClick={onSelect}
      whileHover={{ y: -3, transition: { duration: 0.15 } }}
      whileTap={{ scale: 0.98 }}
      style={{
        ...styles.card,
        borderColor: isSelected
          ? colors.accentBlue
          : isWorking
            ? `${colors.accentGreen}50`
            : colors.border,
        boxShadow: isSelected
          ? `0 0 0 1px ${colors.accentBlue}, 0 4px 20px ${colors.accentBlue}20`
          : isWorking
            ? `0 0 20px ${colors.accentGreen}12, 0 2px 8px rgba(0,0,0,0.25)`
            : "0 2px 8px rgba(0,0,0,0.2)",
        borderLeftWidth: isWorking ? 3 : 1,
        borderLeftColor: isWorking ? colors.accentGreen : undefined,
      }}
    >
      {/* Top Row: Avatar + Name + Status */}
      <div style={styles.cardTop}>
        {/* Avatar with status ring */}
        <div style={{ position: "relative" }}>
          {/* Pulse ring for working/quarantined */}
          {statusConfig.pulse && (
            <motion.div
              animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
              transition={{ repeat: Infinity, duration: 1.8, ease: "easeOut" }}
              style={{
                position: "absolute",
                inset: -3,
                borderRadius: "50%",
                border: `2px solid ${statusConfig.color}`,
              }}
            />
          )}
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: `${statusConfig.color}20`,
              border: `2px solid ${statusConfig.color}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: agent.emoji ? "1.3rem" : "1.1rem",
              fontWeight: 700,
              color: statusConfig.color,
              position: "relative",
              zIndex: 1,
            }}
          >
            {agent.emoji || agent.name.charAt(0).toUpperCase()}
          </div>
          {/* Status dot */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              right: 0,
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: statusConfig.color,
              border: `2px solid ${colors.bgCard}`,
              zIndex: 2,
            }}
          />
        </div>

        {/* Name + Role */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.agentName}>{agent.name}</div>
          <div style={styles.roleRow}>
            <span
              style={{
                padding: "1px 7px",
                borderRadius: 10,
                fontSize: "0.65rem",
                fontWeight: 600,
                background: roleBadge.bg,
                color: roleBadge.color,
                letterSpacing: "0.02em",
              }}
            >
              {roleBadge.label}
            </span>
            <span
              style={{
                fontSize: "0.7rem",
                color: statusConfig.color,
                fontWeight: 600,
              }}
            >
              {statusConfig.label}
            </span>
          </div>
        </div>
      </div>

      {/* Current Task / Activity */}
      <div style={styles.taskSection}>
        {isWorking && currentTask ? (
          <div style={styles.taskActive}>
            {/* Animated typing dots */}
            <div style={styles.activityIndicator}>
              <motion.span
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ repeat: Infinity, duration: 1.2, delay: 0 }}
                style={styles.typingDot}
              />
              <motion.span
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }}
                style={styles.typingDot}
              />
              <motion.span
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ repeat: Infinity, duration: 1.2, delay: 0.4 }}
                style={styles.typingDot}
              />
            </div>
            <div style={styles.taskInfo}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={styles.taskLabel}>Working on</div>
                {currentTask.startedAt && (
                  <div style={{ fontSize: "0.6rem", color: colors.textMuted }}>
                    {formatElapsed(currentTask.startedAt)}
                  </div>
                )}
              </div>
              <div style={styles.taskTitle}>{currentTask.title}</div>
              {/* Animated progress shimmer */}
              <div style={{ marginTop: 4, borderRadius: 2, height: 2, background: `${colors.accentGreen}15`, overflow: "hidden" }}>
                <motion.div
                  animate={{ x: ["-100%", "200%"] }}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                  style={{ width: "40%", height: "100%", background: `${colors.accentGreen}50`, borderRadius: 2 }}
                />
              </div>
            </div>
          </div>
        ) : agent.status === "ACTIVE" ? (
          <div style={styles.taskIdle}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <span style={{ color: colors.textMuted, fontSize: "0.75rem" }}>
              Waiting for assignment
            </span>
          </div>
        ) : agent.status === "QUARANTINED" ? (
          <div style={{ ...styles.taskIdle, background: `${colors.accentRed}10` }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.accentRed} strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span style={{ color: colors.accentRed, fontSize: "0.75rem" }}>
              {agent.lastError || "Unresponsive"}
            </span>
          </div>
        ) : (
          <div style={styles.taskIdle}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth="2">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
            <span style={{ color: colors.textMuted, fontSize: "0.75rem" }}>
              {agent.status === "PAUSED" ? "Paused" : "Offline"}
            </span>
          </div>
        )}
      </div>

      {/* Bottom: Budget Bar + Heartbeat */}
      <div style={styles.cardBottom}>
        {/* Budget bar */}
        <div style={styles.budgetSection}>
          <div style={styles.budgetLabels}>
            <span style={{ color: colors.textMuted, fontSize: "0.65rem" }}>Budget</span>
            <span style={{ color: colors.textSecondary, fontSize: "0.65rem", fontWeight: 500 }}>
              ${agent.spendToday.toFixed(2)} / ${agent.budgetDaily.toFixed(2)}
            </span>
          </div>
          <div style={styles.budgetBarTrack}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(budgetPct, 100)}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              style={{
                ...styles.budgetBarFill,
                background:
                  budgetPct > 90
                    ? colors.accentRed
                    : budgetPct > 70
                      ? colors.accentOrange
                      : colors.accentGreen,
              }}
            />
          </div>
        </div>

        {/* Heartbeat */}
        <div style={styles.heartbeatRow}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke={heartbeat.healthy ? colors.accentGreen : colors.accentRed}
            strokeWidth="2"
          >
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span
            style={{
              fontSize: "0.65rem",
              color: heartbeat.healthy ? colors.textMuted : colors.accentRed,
            }}
          >
            {heartbeat.text}
          </span>
        </div>
      </div>
    </motion.button>
  );
}

/* ============================================================================
   Agent Detail Panel (Slide-in from right)
   ============================================================================ */

function AgentDetailPanel({
  agentId,
  projectId,
  onClose,
}: {
  agentId: Id<"agents">;
  projectId: Id<"projects"> | null;
  onClose: () => void;
}) {
  const agent = useQuery(api.agents.get, { agentId });
  const tasks = useQuery(api.tasks.list, { projectId: projectId ?? undefined });

  if (!agent) return null;

  const currentTask = agent.currentTaskId
    ? tasks?.find((t) => t._id === agent.currentTaskId)
    : null;

  const assignedTasks = tasks?.filter(
    (t) => t.assigneeIds.includes(agentId) && t.status !== "DONE" && t.status !== "CANCELED"
  );

  const statusConfig = getStatusConfig(agent.status as AgentStatusType, !!currentTask);
  const roleBadge = getRoleBadge(agent.role);
  const heartbeat = getHeartbeatAge(agent.lastHeartbeatAt);
  const budgetPct =
    agent.budgetDaily > 0 ? (agent.spendToday / agent.budgetDaily) * 100 : 0;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={styles.backdrop}
      />
      {/* Panel */}
      <motion.div
        initial={{ x: 420 }}
        animate={{ x: 0 }}
        exit={{ x: 420 }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        style={styles.detailPanel}
      >
        {/* Panel header */}
        <div style={styles.panelHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: `${statusConfig.color}20`,
                border: `2px solid ${statusConfig.color}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.4rem",
                fontWeight: 700,
                color: statusConfig.color,
              }}
            >
              {agent.emoji || agent.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  color: colors.textPrimary,
                }}
              >
                {agent.name}
              </h2>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                <span
                  style={{
                    padding: "1px 8px",
                    borderRadius: 10,
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    background: roleBadge.bg,
                    color: roleBadge.color,
                  }}
                >
                  {roleBadge.label}
                </span>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: "0.75rem",
                    color: statusConfig.color,
                    fontWeight: 600,
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: statusConfig.color,
                    }}
                  />
                  {statusConfig.label}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} style={styles.closeBtn} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Panel body */}
        <div style={styles.panelBody}>
          {/* Current Task */}
          {currentTask && (
            <div style={styles.panelSection}>
              <div style={styles.panelSectionTitle}>Current Task</div>
              <div style={styles.currentTaskCard}>
                <div
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: colors.textPrimary,
                    marginBottom: 4,
                  }}
                >
                  {currentTask.title}
                </div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: colors.textSecondary,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: `${colors.accentGreen}20`,
                      color: colors.accentGreen,
                      fontSize: "0.65rem",
                      fontWeight: 600,
                    }}
                  >
                    {currentTask.status}
                  </span>
                  <span>{currentTask.type}</span>
                  {currentTask.estimatedCost != null && (
                    <span>~${currentTask.estimatedCost.toFixed(2)}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Details Grid */}
          <div style={styles.panelSection}>
            <div style={styles.panelSectionTitle}>Details</div>
            <div style={styles.detailGrid}>
              <DetailRow label="Workspace" value={agent.workspacePath} />
              <DetailRow
                label="Heartbeat"
                value={heartbeat.text}
                valueColor={heartbeat.healthy ? colors.accentGreen : colors.accentRed}
              />
              <DetailRow label="Error Streak" value={String(agent.errorStreak)} />
              {agent.lastError && (
                <DetailRow label="Last Error" value={agent.lastError} valueColor={colors.accentRed} />
              )}
              <DetailRow
                label="Can Spawn"
                value={agent.canSpawn ? `Yes (max ${agent.maxSubAgents})` : "No"}
              />
              {agent.allowedTaskTypes.length > 0 && (
                <DetailRow
                  label="Task Types"
                  value={agent.allowedTaskTypes.join(", ")}
                />
              )}
            </div>
          </div>

          {/* Budget */}
          <div style={styles.panelSection}>
            <div style={styles.panelSectionTitle}>Budget</div>
            <div style={styles.budgetPanel}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: "0.8rem", color: colors.textSecondary }}>
                  Daily Spend
                </span>
                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: colors.textPrimary }}>
                  ${agent.spendToday.toFixed(2)} / ${agent.budgetDaily.toFixed(2)}
                </span>
              </div>
              <div style={{ ...styles.budgetBarTrack, height: 6 }}>
                <div
                  style={{
                    ...styles.budgetBarFill,
                    height: 6,
                    width: `${Math.min(budgetPct, 100)}%`,
                    background:
                      budgetPct > 90
                        ? colors.accentRed
                        : budgetPct > 70
                          ? colors.accentOrange
                          : colors.accentGreen,
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: 8,
                  fontSize: "0.7rem",
                  color: colors.textMuted,
                }}
              >
                <span>Per-run limit: ${agent.budgetPerRun.toFixed(2)}</span>
                <span>{budgetPct.toFixed(0)}% used</span>
              </div>
            </div>
          </div>

          {/* Assigned Tasks */}
          {assignedTasks && assignedTasks.length > 0 && (
            <div style={styles.panelSection}>
              <div style={styles.panelSectionTitle}>
                Assigned Tasks ({assignedTasks.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {assignedTasks.slice(0, 8).map((t) => (
                  <div key={t._id} style={styles.assignedTaskRow}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background:
                          t.status === "IN_PROGRESS"
                            ? colors.accentGreen
                            : t.status === "BLOCKED"
                              ? colors.accentRed
                              : colors.accentBlue,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        flex: 1,
                        fontSize: "0.75rem",
                        color: colors.textPrimary,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t.title}
                    </span>
                    <span
                      style={{
                        fontSize: "0.6rem",
                        color: colors.textMuted,
                        flexShrink: 0,
                      }}
                    >
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}

/* ============================================================================
   Small Components
   ============================================================================ */

function DetailRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div style={styles.detailRowItem}>
      <span style={{ fontSize: "0.75rem", color: colors.textMuted }}>{label}</span>
      <span
        style={{
          fontSize: "0.75rem",
          color: valueColor ?? colors.textPrimary,
          fontWeight: 500,
          textAlign: "right",
          maxWidth: "60%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </div>
  );
}

/* ============================================================================
   Styles
   ============================================================================ */

const styles: Record<string, CSSProperties> = {
  container: {
    flex: 1,
    overflow: "auto",
    background: colors.bgPage,
    padding: "24px 28px",
  },
  loadingContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
  spinner: {
    width: 28,
    height: 28,
    border: `3px solid ${colors.border}`,
    borderTopColor: colors.accentBlue,
    borderRadius: "50%",
  },
  header: {
    marginBottom: 24,
  },
  headerTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: 700,
    color: colors.textPrimary,
    margin: 0,
  },
  subtitle: {
    fontSize: "0.85rem",
    color: colors.textSecondary,
    margin: "2px 0 0",
  },
  statsRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap" as const,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: 16,
  },
  card: {
    width: "100%",
    textAlign: "left" as const,
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    padding: 16,
    cursor: "pointer",
    fontFamily: "inherit",
    display: "flex",
    flexDirection: "column" as const,
    gap: 12,
    transition: "border-color 0.2s, box-shadow 0.2s",
  },
  cardTop: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  agentName: {
    fontSize: "0.9rem",
    fontWeight: 700,
    color: colors.textPrimary,
    lineHeight: 1.2,
  },
  roleRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  },
  taskSection: {
    minHeight: 36,
  },
  taskActive: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 8,
    background: `${colors.accentGreen}08`,
    border: `1px solid ${colors.accentGreen}20`,
  },
  activityIndicator: {
    display: "flex",
    gap: 3,
    paddingTop: 4,
    flexShrink: 0,
  },
  typingDot: {
    width: 4,
    height: 4,
    borderRadius: "50%",
    background: colors.accentGreen,
  },
  taskInfo: {
    flex: 1,
    minWidth: 0,
  },
  taskLabel: {
    fontSize: "0.6rem",
    color: colors.accentGreen,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginBottom: 2,
  },
  taskTitle: {
    fontSize: "0.78rem",
    color: colors.textPrimary,
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  taskIdle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 10px",
    borderRadius: 8,
    background: `${colors.textMuted}08`,
  },
  cardBottom: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  budgetSection: {},
  budgetLabels: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  budgetBarTrack: {
    width: "100%",
    height: 4,
    borderRadius: 2,
    background: `${colors.textMuted}20`,
    overflow: "hidden",
  },
  budgetBarFill: {
    height: 4,
    borderRadius: 2,
    transition: "width 0.6s ease-out",
  },
  heartbeatRow: {
    display: "flex",
    alignItems: "center",
    gap: 5,
  },
  emptyState: {
    gridColumn: "1 / -1",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    padding: "60px 20px",
  },

  // Detail Panel
  backdrop: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    zIndex: 999,
  },
  detailPanel: {
    position: "fixed" as const,
    top: 0,
    right: 0,
    bottom: 0,
    width: 400,
    maxWidth: "90vw",
    background: colors.bgPage,
    borderLeft: `1px solid ${colors.border}`,
    zIndex: 1000,
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
  },
  panelHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 20px 16px",
    borderBottom: `1px solid ${colors.border}`,
    flexShrink: 0,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: "none",
    background: "transparent",
    color: colors.textMuted,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.15s",
  },
  panelBody: {
    flex: 1,
    overflow: "auto",
    padding: 20,
    display: "flex",
    flexDirection: "column" as const,
    gap: 20,
  },
  panelSection: {},
  panelSectionTitle: {
    fontSize: "0.7rem",
    fontWeight: 700,
    color: colors.textMuted,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    marginBottom: 8,
  },
  currentTaskCard: {
    padding: "10px 12px",
    borderRadius: 8,
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
  },
  detailGrid: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 0,
  },
  detailRowItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "7px 0",
    borderBottom: `1px solid ${colors.border}`,
  },
  budgetPanel: {
    padding: "10px 12px",
    borderRadius: 8,
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
  },
  assignedTaskRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 6,
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
  },
};
