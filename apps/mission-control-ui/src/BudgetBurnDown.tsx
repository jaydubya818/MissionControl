/**
 * Budget Burn-Down Dashboard
 *
 * Shows per-agent and aggregate budget consumption:
 *   - Daily budget cap vs. actual spend per agent
 *   - Aggregate project-wide burn rate
 *   - Alerts when agents approach or exceed budget
 */

import { CSSProperties, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";

interface BudgetBurnDownProps {
  projectId: Id<"projects"> | null;
}

const colors = {
  bgPage: "#0f172a",
  bgCard: "#1e293b",
  border: "#334155",
  textPrimary: "#e2e8f0",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  accentBlue: "#3b82f6",
  accentGreen: "#10b981",
  accentOrange: "#f59e0b",
  accentRed: "#ef4444",
  accentPurple: "#8b5cf6",
};

function getSpendColor(ratio: number): string {
  if (ratio >= 1) return colors.accentRed;
  if (ratio >= 0.8) return colors.accentOrange;
  if (ratio >= 0.5) return colors.accentBlue;
  return colors.accentGreen;
}

function getStatusLabel(ratio: number): string {
  if (ratio >= 1) return "EXCEEDED";
  if (ratio >= 0.8) return "WARNING";
  if (ratio >= 0.5) return "ON TRACK";
  return "HEALTHY";
}

export function BudgetBurnDown({ projectId }: BudgetBurnDownProps) {
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});

  const budgetData = useMemo(() => {
    if (!agents) return null;

    const agentBudgets = agents.map((agent: Doc<"agents">) => {
      const daily = (agent as any).budgetDaily ?? 5;
      const spent = (agent as any).spendToday ?? 0;
      const ratio = daily > 0 ? spent / daily : 0;

      return {
        id: agent._id,
        name: agent.name,
        role: (agent as any).role ?? "UNKNOWN",
        status: agent.status,
        budgetDaily: daily,
        spendToday: spent,
        ratio,
        remaining: Math.max(0, daily - spent),
        color: getSpendColor(ratio),
        statusLabel: getStatusLabel(ratio),
      };
    });

    // Aggregate stats
    const totalBudget = agentBudgets.reduce((sum, a) => sum + a.budgetDaily, 0);
    const totalSpent = agentBudgets.reduce((sum, a) => sum + a.spendToday, 0);
    const activeCount = agentBudgets.filter((a) => a.status === "ACTIVE").length;
    const overBudgetCount = agentBudgets.filter((a) => a.ratio >= 1).length;
    const warningCount = agentBudgets.filter((a) => a.ratio >= 0.8 && a.ratio < 1).length;

    return {
      agents: agentBudgets.sort((a, b) => b.ratio - a.ratio),
      totalBudget,
      totalSpent,
      totalRatio: totalBudget > 0 ? totalSpent / totalBudget : 0,
      activeCount,
      overBudgetCount,
      warningCount,
    };
  }, [agents]);

  if (!budgetData) {
    return (
      <div style={styles.container}>
        <div style={{ color: colors.textMuted, padding: 24 }}>Loading budget data...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Budget Burn-Down</h2>
        <p style={styles.subtitle}>Daily budget consumption across all agents</p>
      </div>

      {/* Aggregate Summary */}
      <div style={styles.summaryRow}>
        <SummaryCard
          label="Total Budget"
          value={`$${budgetData.totalBudget.toFixed(2)}`}
          color={colors.textPrimary}
        />
        <SummaryCard
          label="Total Spent"
          value={`$${budgetData.totalSpent.toFixed(2)}`}
          color={getSpendColor(budgetData.totalRatio)}
        />
        <SummaryCard
          label="Remaining"
          value={`$${Math.max(0, budgetData.totalBudget - budgetData.totalSpent).toFixed(2)}`}
          color={colors.accentGreen}
        />
        <SummaryCard
          label="Active Agents"
          value={String(budgetData.activeCount)}
          color={colors.accentBlue}
        />
        {budgetData.overBudgetCount > 0 && (
          <SummaryCard
            label="Over Budget"
            value={String(budgetData.overBudgetCount)}
            color={colors.accentRed}
          />
        )}
        {budgetData.warningCount > 0 && (
          <SummaryCard
            label="Warning"
            value={String(budgetData.warningCount)}
            color={colors.accentOrange}
          />
        )}
      </div>

      {/* Aggregate Progress Bar */}
      <div style={styles.aggregateBar}>
        <div style={styles.aggregateLabel}>
          <span style={{ color: colors.textPrimary, fontWeight: 600 }}>
            Overall: {(budgetData.totalRatio * 100).toFixed(0)}% consumed
          </span>
          <span style={{ color: colors.textMuted, fontSize: "0.8rem" }}>
            ${budgetData.totalSpent.toFixed(2)} / ${budgetData.totalBudget.toFixed(2)}
          </span>
        </div>
        <div style={styles.progressTrack}>
          <div
            style={{
              ...styles.progressFill,
              width: `${Math.min(budgetData.totalRatio * 100, 100)}%`,
              background: getSpendColor(budgetData.totalRatio),
            }}
          />
          {/* Warning threshold line at 80% */}
          <div style={styles.thresholdLine80} />
        </div>
      </div>

      {/* Per-Agent Breakdown */}
      <div style={styles.agentList}>
        {budgetData.agents.map((agent) => (
          <div key={agent.id} style={styles.agentCard}>
            <div style={styles.agentHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 600, color: colors.textPrimary }}>
                  {agent.name}
                </span>
                <span style={styles.roleBadge}>{agent.role}</span>
                <span
                  style={{
                    ...styles.statusDot,
                    background:
                      agent.status === "ACTIVE"
                        ? colors.accentGreen
                        : agent.status === "PAUSED"
                          ? colors.accentOrange
                          : colors.textMuted,
                  }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    ...styles.budgetLabel,
                    color: agent.color,
                  }}
                >
                  {agent.statusLabel}
                </span>
                <span style={{ color: colors.textSecondary, fontSize: "0.85rem" }}>
                  ${agent.spendToday.toFixed(2)} / ${agent.budgetDaily.toFixed(2)}
                </span>
              </div>
            </div>
            <div style={styles.progressTrackSmall}>
              <div
                style={{
                  ...styles.progressFillSmall,
                  width: `${Math.min(agent.ratio * 100, 100)}%`,
                  background: agent.color,
                }}
              />
            </div>
            <div style={styles.agentFooter}>
              <span style={{ color: colors.textMuted, fontSize: "0.75rem" }}>
                Remaining: ${agent.remaining.toFixed(2)}
              </span>
              <span style={{ color: colors.textMuted, fontSize: "0.75rem" }}>
                {(agent.ratio * 100).toFixed(0)}% used
              </span>
            </div>
          </div>
        ))}
      </div>

      {budgetData.agents.length === 0 && (
        <div style={styles.emptyState}>
          <p style={{ color: colors.textMuted }}>No agents found. Budget tracking will appear once agents are registered.</p>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div style={styles.summaryCard}>
      <span style={{ fontSize: "0.7rem", color: colors.textMuted, display: "block" }}>
        {label}
      </span>
      <span style={{ fontSize: "1.2rem", fontWeight: 700, color }}>
        {value}
      </span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    flex: 1,
    overflow: "auto",
    padding: "24px",
  },
  header: {
    marginBottom: 20,
  },
  title: {
    color: colors.textPrimary,
    fontSize: "1.5rem",
    fontWeight: 700,
    margin: 0,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: "0.875rem",
    margin: "4px 0 0",
  },
  summaryRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: 10,
    marginBottom: 20,
  },
  summaryCard: {
    padding: "12px 14px",
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
  },
  aggregateBar: {
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
  },
  aggregateLabel: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  progressTrack: {
    position: "relative",
    height: 12,
    background: colors.bgPage,
    borderRadius: 6,
    overflow: "hidden",
  },
  progressFill: {
    position: "absolute",
    top: 0,
    left: 0,
    height: "100%",
    borderRadius: 6,
    transition: "width 0.3s ease",
  },
  thresholdLine80: {
    position: "absolute",
    left: "80%",
    top: 0,
    bottom: 0,
    width: 2,
    background: colors.accentOrange,
    opacity: 0.5,
  },
  agentList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  agentCard: {
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: "12px 16px",
  },
  agentHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    flexWrap: "wrap",
    gap: 6,
  },
  roleBadge: {
    padding: "2px 6px",
    background: colors.bgPage,
    border: `1px solid ${colors.border}`,
    borderRadius: 4,
    fontSize: "0.7rem",
    color: colors.textMuted,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    display: "inline-block",
  },
  budgetLabel: {
    fontSize: "0.75rem",
    fontWeight: 600,
  },
  progressTrackSmall: {
    position: "relative",
    height: 6,
    background: colors.bgPage,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFillSmall: {
    position: "absolute",
    top: 0,
    left: 0,
    height: "100%",
    borderRadius: 3,
    transition: "width 0.3s ease",
  },
  agentFooter: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: 6,
  },
  emptyState: {
    textAlign: "center" as const,
    padding: "40px 20px",
    background: colors.bgCard,
    borderRadius: 10,
    border: `1px solid ${colors.border}`,
  },
};
