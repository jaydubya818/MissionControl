/**
 * Loop Detection Panel
 *
 * Shows loop-detected alerts (comment storms, review ping-pong, repeated failures)
 * and provides one-click actions to acknowledge, resolve, or unblock tasks.
 */

import { CSSProperties, useState } from "react";
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
  const [filter, setFilter] = useState<"all" | "OPEN" | "ACKNOWLEDGED" | "RESOLVED">("all");
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

  const filteredAlerts =
    filter === "all"
      ? loopAlerts
      : loopAlerts.filter((a) => a.status === filter);

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
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h3 style={styles.title}>Loop Detection</h3>
          <p style={styles.subtitle}>
            {loopAlerts.length} active loop alert{loopAlerts.length !== 1 ? "s" : ""}
          </p>
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
              {f === "all" ? "All" : f}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div style={styles.summaryRow}>
        {Object.entries(LOOP_TYPE_INFO).map(([type, info]) => {
          const count = loopAlerts.filter(
            (a) =>
              (a.metadata as any)?.loopData?.type === type ||
              a.title.includes(type)
          ).length;
          return (
            <div
              key={type}
              style={{
                ...styles.summaryCard,
                borderLeft: `3px solid ${info.color}`,
              }}
            >
              <span style={{ fontSize: "1.2rem" }}>{info.icon}</span>
              <div>
                <div style={{ color: colors.textPrimary, fontWeight: 600, fontSize: "1.1rem" }}>
                  {count}
                </div>
                <div style={{ color: colors.textMuted, fontSize: "0.75rem" }}>
                  {info.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Alert List */}
      {filteredAlerts.length === 0 ? (
        <div style={styles.emptyState}>
          <span style={{ fontSize: "2rem" }}>✅</span>
          <p style={{ color: colors.textMuted, margin: "8px 0 0" }}>
            No loop alerts detected. All systems healthy.
          </p>
        </div>
      ) : (
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
      )}
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
    gap: 16,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 12,
  },
  title: {
    color: colors.textPrimary,
    fontSize: "1.1rem",
    fontWeight: 700,
    margin: 0,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: "0.8rem",
    margin: "2px 0 0",
  },
  filterRow: {
    display: "flex",
    gap: 4,
  },
  filterBtn: {
    padding: "4px 10px",
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    color: colors.textSecondary,
    fontSize: "0.75rem",
    cursor: "pointer",
  },
  filterBtnActive: {
    background: "#25334d",
    color: colors.textPrimary,
    borderColor: colors.accentBlue,
  },
  summaryRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 10,
  },
  summaryCard: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    background: colors.bgCard,
    borderRadius: 8,
    border: `1px solid ${colors.border}`,
  },
  emptyState: {
    textAlign: "center" as const,
    padding: "40px 20px",
    background: colors.bgCard,
    borderRadius: 10,
    border: `1px solid ${colors.border}`,
  },
  alertList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  },
  alertCard: {
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: 16,
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
