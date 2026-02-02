import type { Doc } from "../../../convex/_generated/dataModel";
import { motion } from "framer-motion";
import { useState } from "react";
import { QuickEditModal } from "./QuickEditModal";

interface TaskCardProps {
  task: Doc<"tasks">;
  agents?: Doc<"agents">[];
  onClick: () => void;
  isDragging?: boolean;
  onUpdate?: () => void;
}

export function TaskCard({ task, agents, onClick, isDragging, onUpdate }: TaskCardProps) {
  const [showQuickEdit, setShowQuickEdit] = useState(false);
  const assignedAgent = agents?.find(a => task.assigneeIds?.includes(a._id));
  
  const priorityColors = {
    1: { bg: "#7c2d12", border: "#ea580c", text: "#fbbf24" },
    2: { bg: "#7c2d12", border: "#f97316", text: "#fb923c" },
    3: { bg: "#1e293b", border: "#475569", text: "#94a3b8" },
    4: { bg: "#0f172a", border: "#334155", text: "#64748b" },
  };
  
  const statusColors = {
    INBOX: "#6b7280",
    ASSIGNED: "#3b82f6",
    IN_PROGRESS: "#f59e0b",
    REVIEW: "#8b5cf6",
    NEEDS_APPROVAL: "#ef4444",
    BLOCKED: "#dc2626",
    DONE: "#10b981",
    CANCELED: "#64748b",
  };
  
  const colors = priorityColors[task.priority as keyof typeof priorityColors] || priorityColors[3];
  
  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setShowQuickEdit(true);
        }}
        style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: "8px",
        padding: "12px",
        marginBottom: "8px",
        cursor: "pointer",
        opacity: isDragging ? 0.5 : 1,
        transition: "all 0.2s",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <span style={{
            fontSize: "10px",
            padding: "2px 6px",
            borderRadius: "4px",
            background: statusColors[task.status as keyof typeof statusColors],
            color: "white",
            fontWeight: 600,
          }}>
            {task.status}
          </span>
          <span style={{
            fontSize: "10px",
            padding: "2px 6px",
            borderRadius: "4px",
            background: "#334155",
            color: "#94a3b8",
          }}>
            P{task.priority}
          </span>
        </div>
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowQuickEdit(true);
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "#64748b",
              fontSize: "14px",
              cursor: "pointer",
              padding: "2px 4px",
            }}
            title="Edit task (or double-click card)"
          >
            ✏️
          </button>
          <span style={{ fontSize: "10px", color: "#64748b" }}>
            {task._id.slice(-6)}
          </span>
        </div>
      </div>

      {/* Title */}
      <div style={{
        fontSize: "14px",
        fontWeight: 500,
        color: "#e2e8f0",
        marginBottom: "8px",
        lineHeight: "1.4",
      }}>
        {task.title}
      </div>

      {/* Description */}
      {task.description && (
        <div style={{
          fontSize: "12px",
          color: "#94a3b8",
          marginBottom: "8px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}>
          {task.description}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <span style={{ fontSize: "11px", color: "#64748b" }}>
            {task.type}
          </span>
          {task.actualCost > 0 && (
            <span style={{ fontSize: "11px", color: "#10b981" }}>
              ${task.actualCost.toFixed(2)}
            </span>
          )}
        </div>
        {assignedAgent && (
          <div style={{
            fontSize: "11px",
            padding: "3px 8px",
            borderRadius: "12px",
            background: "#334155",
            color: "#e2e8f0",
          }}>
            {assignedAgent.emoji || "🤖"} {assignedAgent.name}
          </div>
        )}
      </div>
    </motion.div>
    
    {showQuickEdit && (
      <QuickEditModal
        task={task}
        onClose={() => setShowQuickEdit(false)}
        onSave={() => {
          if (onUpdate) onUpdate();
        }}
      />
    )}
    </>
  );
}
