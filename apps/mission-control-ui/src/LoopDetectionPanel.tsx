/**
 * Loop Detection Panel
 *
 * Shows loop-detected alerts (comment storms, review ping-pong, repeated failures)
 * and provides one-click actions to acknowledge, resolve, or unblock tasks.
 */

import { CSSProperties, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface LoopDetectionPanelProps {
  projectId: Id<"projects"> | null;
  onTaskSelect?: (taskId: Id<"tasks">) => void;
}

const LOOP_TYPE_INFO: Record<
  string,
  { icon: string; label: string; description: string; color: string }
> = {
  COMMENT_STORM: {
    icon: "💬",
    label: "Comment Storm",
    description: "Too many messages in a short window",
    color: "#f59e0b",
  },
  REVIEW_PING_PONG: {
    icon: "🏓",
    label: "Review Ping-Pong",
    description: "Excessive review cycles without resolution",
    color: "#ef4444",
  },
  BACK_AND_FORTH: {
    icon: "🔄",
    label: "State Churn",
    description: "Task repeatedly bouncing between states",
    color: "#f97316",
  },
  REPEATED_FAILURES: {
    icon: "❌",
    label: "Repeated Failures",
    description: "Same operation failing repeatedly",
    color: "#dc2626",
  },
};

const colors = {
  bgPage: "#0f172a",
  bgCard: "#1e293b",
  border: "#334155",
  textPrimary: "#e2e8f0",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  accentBlue: "#3b82f6",
  accentGreen: "#10b981",
  accentRed: "#ef4444",
  accentOrange: "#f59e0b",
};

export function LoopDetectionPanel({
  projectId: _projectId,
  onTaskSelect,
}: LoopDetectionPanelProps) {
  const [filter, setFilter] = useState<"all" | "OPEN" | "ACKNOWLEDGED">("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const openAlerts = useQuery(api.alerts.listOpen, { limit: 100 });
  const acknowledgeAlert = useMutation(api.alerts.acknowledge);
  const resolveAlert = useMutation(api.alerts.resolve);
  const ignoreAlert = useMutation(api.alerts.ignore);
  const transitionTask = useMutation(api.tasks.transition);

  // Filter to only loop-detection alerts
  const loopAlerts = (openAlerts ?? []).filter(
    (a) => a.type === "LOOP_DETECTED"
  );

  const filteredAlerts = filter === "all" ? loopAlerts : loopAlerts.filter((a) => a.status === filter);
  const hasLoopAlerts = loopAlerts.length > 0;

  const summary = useMemo(
    () =>
      Object.entries(LOOP_TYPE_INFO).map(([type, info]) => ({
        type,
        info,
        count: loopAlerts.filter(
          (a) =>
            (a.metadata as any)?.loopData?.type === type ||
            a.title.includes(type)
        ).length,
      })),
    [loopAlerts]
  );

  const activeSummary = summary.filter((item) => item.count > 0);
  const openCount = loopAlerts.filter((a) => a.status === "OPEN").length;
  const acknowledgedCount = loopAlerts.filter((a) => a.status === "ACKNOWLEDGED").length;

  const handleAcknowledge = async (alertId: Id<"alerts">) => {
    setActionLoading(alertId);
    try {
      await acknowledgeAlert({
        alertId,
        acknowledgedBy: "operator",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolve = async (alertId: Id<"alerts">) => {
    setActionLoading(alertId);
    try {
      await resolveAlert({
        alertId,
        resolutionNote: "Resolved via Loop Detection Panel",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleIgnore = async (alertId: Id<"alerts">) => {
    setActionLoading(alertId);
    try {
      await ignoreAlert({
        alertId,
        reason: "Ignored via Loop Detection Panel",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnblockTask = async (
    taskId: Id<"tasks">,
    alertId: Id<"alerts">
  ) => {
    setActionLoading(alertId);
    try {
      await transitionTask({
        taskId,
        toStatus: "ASSIGNED",
        actorType: "HUMAN",
        reason: "Unblocked from Loop Detection Panel",
        idempotencyKey: `unblock-loop-${taskId}-${Date.now()}`,
      });
      await resolveAlert({
        alertId,
        resolutionNote: "Task unblocked by operator",
      });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h3 style={styles.title}>Loop Risk Monitor</h3>
          <p style={styles.subtitle}>
            {loopAlerts.length} active incident{loopAlerts.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div style={styles.statusRow}>
          <StatusPill label="Open" count={openCount} tone="danger" />
          <StatusPill label="Acknowledged" count={acknowledgedCount} tone="muted" />
        </div>
      </div>

      {!hasLoopAlerts ? (
        <div style={styles.okState}>
          <span style={styles.okIcon}>✅</span>
          <div>
            <div style={styles.okTitle}>No active loop incidents</div>
            <div style={styles.okSubtitle}>Comment storms and state churn are currently stable.</div>
          </div>
        </div>
      ) : (
        <>
          <div style={styles.summaryRow}>
            {activeSummary.map(({ type, info, count }) => (
              <button
                key={type}
                type="button"
                style={{
                  ...styles.summaryChip,
                  borderColor: info.color,
                }}
                onClick={() => setFilter("all")}
                title={info.description}
              >
                <span style={styles.summaryChipCount}>{count}</span>
                <span>{info.icon}</span>
                <span style={styles.summaryChipLabel}>{info.label}</span>
              </button>
            ))}
          </div>
          <div style={styles.filterRow}>
            {(["all", "OPEN", "ACKNOWLEDGED"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  ...styles.filterBtn,
                  ...(filter === f ? styles.filterBtnActive : {}),
                }}
              >
                {f === "all" ? "All Incidents" : f}
              </button>
            ))}
          </div>
        </>
      )}

      {hasLoopAlerts && filteredAlerts.length === 0 ? (
        <div style={styles.emptyFilterState}>
          No incidents for this filter.
        </div>
      ) : hasLoopAlerts ? (
        <div style={styles.alertList}>
          {filteredAlerts.map((alert) => {
            const loopData = (alert.metadata as any)?.loopData;
            const loopType = loopData?.type ?? "UNKNOWN";
            const info = LOOP_TYPE_INFO[loopType] ?? {
              icon: "⚠️",
              label: loopType,
              description: "",
              color: colors.accentOrange,
            };
            const isLoading = actionLoading === alert._id;

            return (
              <div
                key={alert._id}
                style={{
                  ...styles.alertCard,
                  borderLeft: `4px solid ${info.color}`,
                }}
              >
                {/* Alert header */}
                <div style={styles.alertHeader}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: "1.2rem" }}>{info.icon}</span>
                    <div>
                      <div style={{ color: colors.textPrimary, fontWeight: 600 }}>
                        {alert.title}
                      </div>
                      <div style={{ color: colors.textMuted, fontSize: "0.8rem" }}>
                        {new Date(alert._creationTime).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <span
                    style={{
                      ...styles.severityBadge,
                      background:
                        alert.severity === "CRITICAL"
                          ? colors.accentRed
                          : alert.severity === "WARNING"
                            ? colors.accentOrange
                            : colors.textMuted,
                    }}
                  >
                    {alert.severity}
                  </span>
                </div>

                {/* Description */}
                <p style={{ color: colors.textSecondary, fontSize: "0.85rem", margin: "8px 0" }}>
                  {alert.description}
                </p>

                {/* Loop details */}
                {loopData && (
                  <div style={styles.detailGrid}>
                    <DetailItem
                      label="Count"
                      value={String(loopData.count)}
                    />
                    <DetailItem
                      label="Threshold"
                      value={String(loopData.threshold)}
                    />
                    {loopData.window && (
                      <DetailItem
                        label="Window"
                        value={`${loopData.window} min`}
                      />
                    )}
                    {loopData.detail && (
                      <DetailItem
                        label="Detail"
                        value={loopData.detail}
                      />
                    )}
                  </div>
                )}

                {/* Actions */}
                <div style={styles.actionRow}>
                  {alert.taskId && (
                    <>
                      <button
                        style={styles.actionBtnPrimary}
                        disabled={isLoading}
                        onClick={() =>
                          handleUnblockTask(
                            alert.taskId as Id<"tasks">,
                            alert._id
                          )
                        }
                      >
                        {isLoading ? "..." : "Unblock Task"}
                      </button>
                      <button
                        style={styles.actionBtnSecondary}
                        onClick={() =>
                          onTaskSelect?.(alert.taskId as Id<"tasks">)
                        }
                      >
                        View Task
                      </button>
                    </>
                  )}
                  {alert.status === "OPEN" && (
                    <button
                      style={styles.actionBtnSecondary}
                      disabled={isLoading}
                      onClick={() => handleAcknowledge(alert._id)}
                    >
                      Acknowledge
                    </button>
                  )}
                  <button
                    style={styles.actionBtnSecondary}
                    disabled={isLoading}
                    onClick={() => handleResolve(alert._id)}
                  >
                    Resolve
                  </button>
                  <button
                    style={styles.actionBtnGhost}
                    disabled={isLoading}
                    onClick={() => handleIgnore(alert._id)}
                  >
                    Ignore
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function StatusPill({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "danger" | "muted";
}) {
  return (
    <div
      style={{
        ...styles.statusPill,
        borderColor: tone === "danger" ? "#7f1d1d" : "#334155",
        color: tone === "danger" ? "#fecaca" : colors.textSecondary,
      }}
    >
      <span style={{ fontWeight: 700 }}>{count}</span> {label}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "6px 10px", background: "#0f172a", borderRadius: 4 }}>
      <span style={{ display: "block", fontSize: "0.7rem", color: colors.textMuted }}>
        {label}
      </span>
      <span style={{ fontWeight: 600, fontSize: "0.85rem", color: colors.textPrimary }}>
        {value}
      </span>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "10px 12px",
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    background: "#111b2e",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
  },
  title: {
    color: colors.textPrimary,
    fontSize: "1rem",
    fontWeight: 700,
    margin: 0,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: "0.75rem",
    margin: "2px 0 0",
  },
  statusRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  statusPill: {
    padding: "5px 9px",
    borderRadius: 999,
    border: "1px solid",
    fontSize: "0.72rem",
    background: "#0f172a",
  },
  filterRow: {
    display: "flex",
    gap: 6,
  },
  filterBtn: {
    padding: "5px 10px",
    background: "#15233d",
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    color: colors.textSecondary,
    fontSize: "0.75rem",
    cursor: "pointer",
  },
  filterBtnActive: {
    background: "#203454",
    color: colors.textPrimary,
    borderColor: colors.accentBlue,
  },
  summaryRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  summaryChip: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "6px 10px",
    background: "#15233d",
    borderRadius: 8,
    border: "1px solid",
    color: colors.textPrimary,
    cursor: "pointer",
    fontSize: "0.76rem",
  },
  summaryChipCount: {
    fontWeight: 700,
    fontSize: "0.8rem",
  },
  summaryChipLabel: {
    color: colors.textSecondary,
    fontWeight: 600,
  },
  okState: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    background: "#14263b",
    borderRadius: 10,
    border: `1px solid ${colors.border}`,
  },
  okIcon: {
    fontSize: "1rem",
  },
  okTitle: {
    color: colors.textPrimary,
    fontSize: "0.82rem",
    fontWeight: 600,
  },
  okSubtitle: {
    color: colors.textMuted,
    fontSize: "0.72rem",
    marginTop: 2,
  },
  emptyFilterState: {
    padding: "10px 12px",
    border: `1px dashed ${colors.border}`,
    borderRadius: 8,
    color: colors.textMuted,
    fontSize: "0.78rem",
  },
  alertList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  },
  alertCard: {
    background: "#14263b",
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: 12,
  },
  alertHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  severityBadge: {
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: "0.7rem",
    fontWeight: 700,
    color: "#fff",
    textTransform: "uppercase" as const,
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
    gap: 6,
    marginTop: 8,
  },
  actionRow: {
    display: "flex",
    gap: 6,
    marginTop: 12,
    flexWrap: "wrap" as const,
  },
  actionBtnPrimary: {
    padding: "6px 14px",
    background: colors.accentBlue,
    border: "none",
    borderRadius: 6,
    color: "#fff",
    fontSize: "0.8rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  actionBtnSecondary: {
    padding: "6px 14px",
    background: "transparent",
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    color: colors.textSecondary,
    fontSize: "0.8rem",
    cursor: "pointer",
  },
  actionBtnGhost: {
    padding: "6px 14px",
    background: "transparent",
    border: "none",
    borderRadius: 6,
    color: colors.textMuted,
    fontSize: "0.8rem",
    cursor: "pointer",
  },
};
