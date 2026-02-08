import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { motion } from "framer-motion";

interface DashboardOverviewProps {
  projectId: Id<"projects"> | null;
  onClose: () => void;
}

export function DashboardOverview({ projectId, onClose }: DashboardOverviewProps) {
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const tasks = useQuery(api.tasks.listAll, projectId ? { projectId } : {});
  const approvals = useQuery(api.approvals.listPending, projectId ? { projectId, limit: 100 } : { limit: 100 });
  const activities = useQuery(api.activities.listRecent, projectId ? { projectId, limit: 10 } : { limit: 10 });
  
  if (!agents || !tasks || !approvals || !activities) {
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
          Loading dashboard...
        </div>
      </div>
    );
  }
  
  const activeAgents = agents.filter(a => a.status === "ACTIVE").length;
  const inProgressTasks = tasks.filter(t => t.status === "IN_PROGRESS").length;
  const reviewTasks = tasks.filter(t => t.status === "REVIEW").length;
  const doneTasks = tasks.filter(t => t.status === "DONE").length;
  const totalCost = tasks.reduce((sum, t) => sum + t.actualCost, 0);
  
  const metrics = [
    { label: "Active Agents", value: activeAgents, total: agents.length, icon: "🤖", color: "#10b981" },
    { label: "In Progress", value: inProgressTasks, total: tasks.length, icon: "⚙️", color: "#f59e0b" },
    { label: "In Review", value: reviewTasks, total: tasks.length, icon: "👀", color: "#8b5cf6" },
    { label: "Completed", value: doneTasks, total: tasks.length, icon: "✅", color: "#10b981" },
    { label: "Pending Approvals", value: approvals.length, total: approvals.length, icon: "✋", color: "#ef4444" },
    { label: "Total Cost", value: `$${totalCost.toFixed(2)}`, total: null, icon: "💰", color: "#3b82f6" },
  ];
  
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
          maxWidth: "1200px",
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
              📊 Dashboard Overview
            </h2>
            <p style={{ margin: "4px 0 0 0", color: "#94a3b8", fontSize: "14px" }}>
              Real-time system metrics and activity
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
        
        {/* Metrics Grid */}
        <div style={{ padding: "24px" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
            marginBottom: "24px",
          }}>
            {metrics.map((metric, idx) => (
              <motion.div
                key={metric.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                style={{
                  background: "#0f172a",
                  borderRadius: "8px",
                  padding: "20px",
                  border: "1px solid #1e293b",
                }}
              >
                <div style={{ fontSize: "32px", marginBottom: "8px" }}>{metric.icon}</div>
                <div style={{ fontSize: "32px", fontWeight: 600, color: metric.color, marginBottom: "4px" }}>
                  {metric.value}
                  {metric.total && (
                    <span style={{ fontSize: "16px", color: "#64748b" }}>
                      /{metric.total}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "12px", color: "#94a3b8" }}>{metric.label}</div>
              </motion.div>
            ))}
          </div>
          
          {/* Recent Activity */}
          <div style={{
            background: "#0f172a",
            borderRadius: "8px",
            padding: "20px",
          }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 600 }}>
              📋 Recent Activity
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {activities.slice(0, 5).map((activity) => (
                <div
                  key={activity._id}
                  style={{
                    padding: "10px",
                    background: "#020617",
                    borderRadius: "4px",
                    fontSize: "13px",
                  }}
                >
                  <div style={{ color: "#e2e8f0", marginBottom: "4px" }}>
                    {activity.description}
                  </div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>
                    {activity.actorType} · {new Date(activity._creationTime).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
