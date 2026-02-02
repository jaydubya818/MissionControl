import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { motion, AnimatePresence } from "framer-motion";

interface ActivityFeedProps {
  projectId: Id<"projects"> | null;
  limit?: number;
}

export function ActivityFeed({ projectId, limit = 50 }: ActivityFeedProps) {
  const activities = useQuery(
    api.activities.listRecent,
    projectId ? { projectId, limit } : { limit }
  );
  
  if (!activities) {
    return (
      <div style={{ padding: "20px", color: "#94a3b8" }}>
        Loading activities...
      </div>
    );
  }
  
  const getActivityIcon = (action: string) => {
    if (action.includes("CREATED")) return "✨";
    if (action.includes("UPDATED")) return "✏️";
    if (action.includes("DELETED")) return "🗑️";
    if (action.includes("APPROVED")) return "✅";
    if (action.includes("DENIED")) return "❌";
    if (action.includes("ASSIGNED")) return "👤";
    if (action.includes("COMPLETED")) return "🎉";
    if (action.includes("BLOCKED")) return "🚫";
    if (action.includes("REVIEW")) return "👀";
    if (action.includes("COMMENT")) return "💬";
    return "📝";
  };
  
  const getActivityColor = (action: string) => {
    if (action.includes("CREATED")) return "#10b981";
    if (action.includes("COMPLETED")) return "#10b981";
    if (action.includes("APPROVED")) return "#10b981";
    if (action.includes("DENIED")) return "#ef4444";
    if (action.includes("BLOCKED")) return "#ef4444";
    if (action.includes("DELETED")) return "#ef4444";
    if (action.includes("REVIEW")) return "#8b5cf6";
    if (action.includes("ASSIGNED")) return "#3b82f6";
    return "#94a3b8";
  };
  
  return (
    <div style={{
      background: "#0f172a",
      borderRadius: "8px",
      padding: "16px",
      maxHeight: "600px",
      overflow: "auto",
    }}>
      <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: 600 }}>
        📊 Recent Activity
      </h3>
      
      <AnimatePresence>
        {activities.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>📭</div>
            <div style={{ fontSize: "16px" }}>No activity yet</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {activities.map((activity, idx) => (
              <motion.div
                key={activity._id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: idx * 0.05 }}
                style={{
                  padding: "12px",
                  background: "#1e293b",
                  borderRadius: "6px",
                  borderLeft: `3px solid ${getActivityColor(activity.action)}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <span style={{ fontSize: "18px", flexShrink: 0 }}>
                    {getActivityIcon(activity.action)}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "13px", color: "#e2e8f0", marginBottom: "4px" }}>
                      {activity.body}
                    </div>
                    <div style={{ fontSize: "11px", color: "#64748b", display: "flex", gap: "8px" }}>
                      <span>{activity.actorType}</span>
                      <span>·</span>
                      <span>{new Date(activity._creationTime).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ActivityFeedModal({ projectId, onClose }: { projectId: Id<"projects"> | null; onClose: () => void }) {
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
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#1e293b",
          borderRadius: "12px",
          maxWidth: "800px",
          width: "100%",
          maxHeight: "80vh",
          overflow: "hidden",
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
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 600 }}>
            📊 Activity Feed
          </h2>
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
        
        {/* Content */}
        <div style={{ padding: "24px", overflow: "auto", maxHeight: "calc(80vh - 80px)" }}>
          <ActivityFeed projectId={projectId} limit={100} />
        </div>
      </div>
    </div>
  );
}
