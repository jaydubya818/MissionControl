import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState } from "react";

interface MonitoringDashboardProps {
  projectId?: string;
  onClose: () => void;
}

export function MonitoringDashboard({ projectId, onClose }: MonitoringDashboardProps) {
  const [selectedTab, setSelectedTab] = useState<"errors" | "performance" | "audit">("errors");
  const recentErrors = useQuery(api.monitoring.listRecentErrors, { limit: 50 });
  const performanceStats = useQuery(api.monitoring.getPerformanceStats, {});
  const auditLog = useQuery(api.monitoring.getAuditLog, { limit: 100 });

  if (!recentErrors || !performanceStats || !auditLog) {
    return (
      <div style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}>
        <div style={{
          background: "#1e293b",
          padding: "40px",
          borderRadius: "12px",
          color: "#e2e8f0",
        }}>
          Loading monitoring data...
        </div>
      </div>
    );
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "#ef4444";
      case "error": return "#f97316";
      case "warning": return "#f59e0b";
      case "info": return "#3b82f6";
      default: return "#6b7280";
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "critical": return "🔴";
      case "error": return "❌";
      case "warning": return "⚠️";
      case "info": return "ℹ️";
      default: return "📝";
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px",
        overflow: "auto",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#1e293b",
          borderRadius: "12px",
          maxWidth: "1400px",
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          color: "#e2e8f0",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: "24px",
          borderBottom: "1px solid #334155",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "24px", fontWeight: 600 }}>
              📊 Monitoring & Observability
            </h2>
            <p style={{ margin: "4px 0 0 0", color: "#94a3b8", fontSize: "14px" }}>
              Real-time system monitoring and audit logs
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              fontSize: "24px",
              cursor: "pointer",
              padding: "0 8px",
            }}
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex",
          borderBottom: "1px solid #334155",
          padding: "0 24px",
        }}>
          <TabButton
            label="🔴 Errors"
            active={selectedTab === "errors"}
            onClick={() => setSelectedTab("errors")}
            count={recentErrors.length}
          />
          <TabButton
            label="⚡ Performance"
            active={selectedTab === "performance"}
            onClick={() => setSelectedTab("performance")}
          />
          <TabButton
            label="📋 Audit Log"
            active={selectedTab === "audit"}
            onClick={() => setSelectedTab("audit")}
            count={auditLog.length}
          />
        </div>

        {/* Content */}
        <div style={{ padding: "24px" }}>
          {selectedTab === "errors" && (
            <ErrorsTab errors={recentErrors} getSeverityColor={getSeverityColor} getSeverityIcon={getSeverityIcon} />
          )}
          {selectedTab === "performance" && (
            <PerformanceTab stats={performanceStats} />
          )}
          {selectedTab === "audit" && (
            <AuditTab logs={auditLog} />
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({ label, active, onClick, count }: { label: string; active: boolean; onClick: () => void; count?: number }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "transparent",
        border: "none",
        borderBottom: active ? "2px solid #3b82f6" : "2px solid transparent",
        color: active ? "#3b82f6" : "#94a3b8",
        padding: "12px 16px",
        fontSize: "14px",
        fontWeight: 500,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}
    >
      {label}
      {count !== undefined && (
        <span style={{
          background: active ? "#3b82f6" : "#475569",
          color: "white",
          borderRadius: "12px",
          padding: "2px 8px",
          fontSize: "12px",
          fontWeight: 600,
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

function ErrorsTab({ errors, getSeverityColor, getSeverityIcon }: any) {
  if (errors.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>✅</div>
        <div style={{ fontSize: "18px", fontWeight: 500 }}>No Errors!</div>
        <div style={{ fontSize: "14px", marginTop: "8px" }}>System is running smoothly</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {errors.map((error: any, idx: number) => (
        <div
          key={idx}
          style={{
            background: "#0f172a",
            borderRadius: "8px",
            padding: "16px",
            border: `1px solid ${getSeverityColor(error.severity)}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
            <span style={{ fontSize: "20px" }}>{getSeverityIcon(error.severity)}</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <div style={{ fontSize: "14px", fontWeight: 600, textTransform: "uppercase" }}>
                  {error.severity}
                </div>
                <div style={{ fontSize: "12px", color: "#64748b" }}>
                  {new Date(error._creationTime).toLocaleString()}
                </div>
              </div>
              <div style={{ fontSize: "14px", marginBottom: "8px" }}>
                {error.message}
              </div>
              {error.context && (
                <div style={{
                  background: "#020617",
                  borderRadius: "4px",
                  padding: "8px",
                  fontSize: "12px",
                  fontFamily: "monospace",
                  color: "#94a3b8",
                  overflow: "auto",
                }}>
                  {JSON.stringify(error.context, null, 2)}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PerformanceTab({ stats }: any) {
  return (
    <div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
        gap: "16px",
        marginBottom: "24px",
      }}>
        <MetricCard
          label="Avg Query Time"
          value={`${stats.avgQueryTime || 0}ms`}
          icon="⚡"
          trend={stats.queryTimeTrend}
        />
        <MetricCard
          label="Avg Mutation Time"
          value={`${stats.avgMutationTime || 0}ms`}
          icon="✏️"
          trend={stats.mutationTimeTrend}
        />
        <MetricCard
          label="Total Requests"
          value={stats.totalRequests || 0}
          icon="📊"
        />
        <MetricCard
          label="Error Rate"
          value={`${stats.errorRate || 0}%`}
          icon="❌"
          highlight={stats.errorRate > 5}
        />
      </div>

      <div style={{
        background: "#0f172a",
        borderRadius: "8px",
        padding: "20px",
      }}>
        <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 600 }}>
          Slowest Operations
        </h3>
        {stats.slowestOperations && stats.slowestOperations.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {stats.slowestOperations.map((op: any, idx: number) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px",
                  background: "#020617",
                  borderRadius: "4px",
                }}
              >
                <span style={{ fontSize: "14px" }}>{op.operation}</span>
                <span style={{ fontSize: "14px", color: op.time > 1000 ? "#ef4444" : "#94a3b8" }}>
                  {op.time}ms
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", color: "#64748b", padding: "20px" }}>
            No performance data yet
          </div>
        )}
      </div>
    </div>
  );
}

function AuditTab({ logs }: any) {
  if (logs.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>📋</div>
        <div style={{ fontSize: "18px", fontWeight: 500 }}>No Audit Logs</div>
        <div style={{ fontSize: "14px", marginTop: "8px" }}>Activity will appear here</div>
      </div>
    );
  }

  return (
    <div style={{
      background: "#0f172a",
      borderRadius: "8px",
      padding: "16px",
      maxHeight: "600px",
      overflow: "auto",
    }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #334155" }}>
            <th style={{ padding: "8px", textAlign: "left", fontSize: "12px", color: "#94a3b8" }}>Time</th>
            <th style={{ padding: "8px", textAlign: "left", fontSize: "12px", color: "#94a3b8" }}>Actor</th>
            <th style={{ padding: "8px", textAlign: "left", fontSize: "12px", color: "#94a3b8" }}>Action</th>
            <th style={{ padding: "8px", textAlign: "left", fontSize: "12px", color: "#94a3b8" }}>Target</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log: any, idx: number) => (
            <tr key={idx} style={{ borderBottom: "1px solid #1e293b" }}>
              <td style={{ padding: "8px", fontSize: "12px", color: "#64748b" }}>
                {new Date(log._creationTime).toLocaleTimeString()}
              </td>
              <td style={{ padding: "8px", fontSize: "12px" }}>
                {log.actorType}: {log.actorId || "System"}
              </td>
              <td style={{ padding: "8px", fontSize: "12px", fontWeight: 500 }}>
                {log.action}
              </td>
              <td style={{ padding: "8px", fontSize: "12px", color: "#94a3b8" }}>
                {log.targetType}: {log.targetId}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetricCard({ label, value, icon, trend, highlight }: any) {
  return (
    <div style={{
      background: highlight ? "#7c2d12" : "#0f172a",
      borderRadius: "6px",
      padding: "16px",
      border: highlight ? "1px solid #ea580c" : "1px solid #1e293b",
    }}>
      <div style={{ fontSize: "24px", marginBottom: "8px" }}>{icon}</div>
      <div style={{ fontSize: "28px", fontWeight: 600, marginBottom: "4px" }}>
        {value}
      </div>
      <div style={{ fontSize: "12px", color: "#94a3b8", display: "flex", justifyContent: "space-between" }}>
        <span>{label}</span>
        {trend && (
          <span style={{ color: trend > 0 ? "#ef4444" : "#10b981" }}>
            {trend > 0 ? "↑" : "↓"} {Math.abs(trend)}%
          </span>
        )}
      </div>
    </div>
  );
}
