import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CSSProperties } from "react";

interface AgentDashboardProps {
  projectId: Id<"projects"> | null;
  onClose: () => void;
}

// Inject keyframes for spinner animation
if (typeof document !== 'undefined' && !document.getElementById('agent-dashboard-keyframes')) {
  const style = document.createElement('style');
  style.id = 'agent-dashboard-keyframes';
  style.textContent = `
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

// Design system colors (from docs/FRONTEND_GUIDELINES.md)
const colors = {
  pageBg: "#0f172a",
  cardBg: "#1e293b",
  cardBgAlt: "#0f172a",
  border: "#334155",
  textPrimary: "#e2e8f0",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  blue: "#3b82f6",
  green: "#10b981",
  orange: "#f59e0b",
  purple: "#8b5cf6",
  red: "#ef4444",
  yellow: "#eab308",
};

const statusStyles: Record<string, CSSProperties> = {
  ACTIVE: { backgroundColor: "rgba(16, 185, 129, 0.15)", color: "#10b981" },
  PAUSED: { backgroundColor: "rgba(234, 179, 8, 0.15)", color: "#eab308" },
  OFFLINE: { backgroundColor: "rgba(100, 116, 139, 0.15)", color: "#94a3b8" },
  DRAINED: { backgroundColor: "rgba(100, 116, 139, 0.15)", color: "#94a3b8" },
  QUARANTINED: { backgroundColor: "rgba(239, 68, 68, 0.15)", color: "#ef4444" },
};

const roleStyles: Record<string, CSSProperties> = {
  INTERN: { backgroundColor: "rgba(59, 130, 246, 0.15)", color: "#3b82f6" },
  SPECIALIST: { backgroundColor: "rgba(139, 92, 246, 0.15)", color: "#8b5cf6" },
  LEAD: { backgroundColor: "rgba(249, 115, 22, 0.15)", color: "#f97316" },
};

export function AgentDashboard({ projectId, onClose }: AgentDashboardProps) {
  const agents = useQuery(
    api.agents.listAll,
    projectId ? { projectId } : {}
  );

  const tasks = useQuery(
    api.tasks.listAll,
    projectId ? { projectId } : {}
  );

  const runs = useQuery(
    api.runs.listRecent,
    projectId ? { projectId, limit: 1000 } : { limit: 1000 }
  );

  if (!agents || !tasks || !runs) {
    return (
      <div style={styles.overlay}>
        <div style={styles.loadingCard}>
          <div style={styles.spinner} />
        </div>
      </div>
    );
  }

  // Calculate agent metrics
  const agentMetrics = agents.map((agent) => {
    const agentTasks = tasks.filter((t) => t.assigneeIds.includes(agent._id));
    const agentRuns = runs.filter((r) => r.agentId === agent._id);

    const completedTasks = agentTasks.filter((t) => t.status === "DONE").length;
    const inProgressTasks = agentTasks.filter((t) => t.status === "IN_PROGRESS").length;
    const totalCost = agentRuns.reduce((sum, r) => sum + r.costUsd, 0);
    const avgCostPerRun = agentRuns.length > 0 ? totalCost / agentRuns.length : 0;
    const successRate = agentRuns.length > 0
      ? (agentRuns.filter((r) => r.status === "COMPLETED").length / agentRuns.length) * 100
      : 0;

    return {
      agent,
      completedTasks,
      inProgressTasks,
      totalTasks: agentTasks.length,
      totalRuns: agentRuns.length,
      totalCost,
      avgCostPerRun,
      successRate,
      spendToday: agent.spendToday,
      budgetDaily: agent.budgetDaily,
      budgetRemaining: agent.budgetDaily - agent.spendToday,
      utilization: agent.budgetDaily > 0 ? (agent.spendToday / agent.budgetDaily) * 100 : 0,
    };
  });

  // Sort by total cost (most expensive first)
  agentMetrics.sort((a, b) => b.totalCost - a.totalCost);

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerContent}>
            <div>
              <h2 style={styles.title}>Agent Performance Dashboard</h2>
              <p style={styles.subtitle}>
                {agents.length} agents · {runs.length} runs · ${agentMetrics.reduce((sum, m) => sum + m.totalCost, 0).toFixed(2)} total cost
              </p>
            </div>
            <button onClick={onClose} style={styles.closeButton} aria-label="Close agent dashboard">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={styles.content}>
          <div style={styles.grid}>
            {agentMetrics.map(({ agent, ...metrics }) => (
              <div key={agent._id} style={styles.card}>
                {/* Agent Header */}
                <div style={styles.cardHeader}>
                  <div style={styles.agentInfo}>
                    <span style={{ fontSize: "1.5rem" }}>{agent.emoji || "🤖"}</span>
                    <div>
                      <h3 style={styles.agentName}>{agent.name}</h3>
                      <div style={styles.badges}>
                        <span style={{ ...styles.badge, ...(roleStyles[agent.role] || {}) }}>
                          {agent.role}
                        </span>
                        <span style={{ ...styles.badge, ...(statusStyles[agent.status] || {}) }}>
                          {agent.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Metrics Grid */}
                <div style={styles.metricsGrid}>
                  <div>
                    <div style={styles.metricLabel}>Tasks</div>
                    <div style={styles.metricValue}>
                      {metrics.completedTasks}/{metrics.totalTasks}
                    </div>
                    <div style={styles.metricSub}>
                      {metrics.inProgressTasks} in progress
                    </div>
                  </div>
                  <div>
                    <div style={styles.metricLabel}>Runs</div>
                    <div style={styles.metricValue}>{metrics.totalRuns}</div>
                    <div style={styles.metricSub}>
                      {metrics.successRate.toFixed(0)}% success
                    </div>
                  </div>
                  <div>
                    <div style={styles.metricLabel}>Total Cost</div>
                    <div style={styles.metricValue}>
                      ${metrics.totalCost.toFixed(2)}
                    </div>
                    <div style={styles.metricSub}>
                      ${metrics.avgCostPerRun.toFixed(3)}/run
                    </div>
                  </div>
                  <div>
                    <div style={styles.metricLabel}>Today's Spend</div>
                    <div style={styles.metricValue}>
                      ${metrics.spendToday.toFixed(2)}
                    </div>
                    <div style={styles.metricSub}>
                      ${metrics.budgetRemaining.toFixed(2)} left
                    </div>
                  </div>
                </div>

                {/* Budget Bar */}
                <div>
                  <div style={styles.budgetHeader}>
                    <span>Budget Utilization</span>
                    <span>{metrics.utilization.toFixed(0)}%</span>
                  </div>
                  <div style={styles.budgetTrack}>
                    <div
                      style={{
                        ...styles.budgetFill,
                        width: `${Math.min(metrics.utilization, 100)}%`,
                        backgroundColor:
                          metrics.utilization >= 90
                            ? colors.red
                            : metrics.utilization >= 70
                            ? colors.yellow
                            : colors.green,
                      }}
                    />
                  </div>
                  <div style={styles.budgetFooter}>
                    <span>${metrics.spendToday.toFixed(2)}</span>
                    <span>${metrics.budgetDaily.toFixed(2)}</span>
                  </div>
                </div>

                {/* Task Types */}
                {agent.allowedTaskTypes && agent.allowedTaskTypes.length > 0 && (
                  <div style={styles.taskTypesSection}>
                    <div style={styles.metricLabel}>Allowed Task Types</div>
                    <div style={styles.taskTypesWrap}>
                      {agent.allowedTaskTypes.map((type) => (
                        <span key={type} style={styles.taskTypeTag}>
                          {type}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: "1rem",
  },
  loadingCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 8,
    padding: "1.5rem",
  },
  spinner: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: `2px solid ${colors.border}`,
    borderTopColor: colors.blue,
    animation: "spin 1s linear infinite",
  },
  modal: {
    backgroundColor: colors.cardBg,
    borderRadius: 10,
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
    maxWidth: "80rem",
    width: "100%",
    maxHeight: "90vh",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    padding: "1.5rem",
    borderBottom: `1px solid ${colors.border}`,
  },
  headerContent: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: 700,
    color: colors.textPrimary,
    margin: 0,
  },
  subtitle: {
    fontSize: "0.875rem",
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
  },
  closeButton: {
    background: "none",
    border: "none",
    color: colors.textMuted,
    cursor: "pointer",
    padding: 4,
  },
  content: {
    flex: 1,
    overflowY: "auto",
    padding: "1.5rem",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
    gap: "1rem",
  },
  card: {
    backgroundColor: colors.cardBgAlt,
    borderRadius: 8,
    padding: "1rem",
    border: `1px solid ${colors.border}`,
  },
  cardHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: "1rem",
  },
  agentInfo: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  agentName: {
    fontWeight: 600,
    color: colors.textPrimary,
    margin: 0,
    fontSize: "1rem",
  },
  badges: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginTop: 4,
  },
  badge: {
    fontSize: "0.75rem",
    padding: "2px 8px",
    borderRadius: 9999,
    fontWeight: 500,
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0.75rem",
    marginBottom: "1rem",
  },
  metricLabel: {
    fontSize: "0.75rem",
    color: colors.textSecondary,
    marginBottom: 2,
  },
  metricValue: {
    fontSize: "1.125rem",
    fontWeight: 600,
    color: colors.textPrimary,
  },
  metricSub: {
    fontSize: "0.75rem",
    color: colors.textMuted,
  },
  budgetHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: "0.75rem",
    color: colors.textSecondary,
    marginBottom: 4,
  },
  budgetTrack: {
    width: "100%",
    backgroundColor: colors.border,
    borderRadius: 9999,
    height: 8,
    overflow: "hidden",
  },
  budgetFill: {
    height: 8,
    borderRadius: 9999,
    transition: "width 0.3s ease",
  },
  budgetFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: "0.75rem",
    color: colors.textMuted,
    marginTop: 4,
  },
  taskTypesSection: {
    marginTop: "1rem",
    paddingTop: "1rem",
    borderTop: `1px solid ${colors.border}`,
  },
  taskTypesWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 6,
  },
  taskTypeTag: {
    fontSize: "0.75rem",
    padding: "2px 8px",
    backgroundColor: colors.border,
    color: colors.textSecondary,
    borderRadius: 4,
  },
};
