import { useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";

interface QuickEditModalProps {
  task: Doc<"tasks">;
  onClose: () => void;
  onSave: () => void;
}

export function QuickEditModal({ task, onClose, onSave }: QuickEditModalProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [priority, setPriority] = useState(task.priority);
  const [status, setStatus] = useState(task.status);
  const [type, setType] = useState(task.type);
  const [estimatedCost, setEstimatedCost] = useState(task.estimatedCost || 0);
  const [saving, setSaving] = useState(false);
  
  const updateTask = useMutation(api.tasks.update);
  const agents = useQuery(api.agents.listAll, { projectId: task.projectId });
  
  const handleSave = async () => {
    setSaving(true);
    try {
      await updateTask({
        taskId: task._id,
        title,
        description,
        priority,
        status: status as any,
        type: type as any,
        estimatedCost,
      });
      onSave();
      onClose();
    } catch (error) {
      console.error("Failed to update task:", error);
      alert("Failed to update task");
    } finally {
      setSaving(false);
    }
  };
  
  const statuses = ["INBOX", "ASSIGNED", "IN_PROGRESS", "REVIEW", "NEEDS_APPROVAL", "BLOCKED", "DONE", "CANCELED"];
  const types = ["ENGINEERING", "CONTENT", "RESEARCH", "REVIEW", "PLANNING", "DEPLOYMENT", "BUG_FIX", "FEATURE"];
  const priorities = [1, 2, 3, 4];
  
  return createPortal(
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
        zIndex: 10000,
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#1e293b",
          borderRadius: "12px",
          maxWidth: "600px",
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
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 600 }}>
            ✏️ Quick Edit Task
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
        
        {/* Form */}
        <div style={{ padding: "24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Title */}
            <div>
              <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500 }}>
                Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: "6px",
                  color: "#e2e8f0",
                  fontSize: "14px",
                }}
                placeholder="Task title"
              />
            </div>
            
            {/* Description */}
            <div>
              <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500 }}>
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: "6px",
                  color: "#e2e8f0",
                  fontSize: "14px",
                  resize: "vertical",
                }}
                placeholder="Task description"
              />
            </div>
            
            {/* Row 1: Status, Priority, Type */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500 }}>
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    color: "#e2e8f0",
                    fontSize: "14px",
                  }}
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500 }}>
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    color: "#e2e8f0",
                    fontSize: "14px",
                  }}
                >
                  {priorities.map((p) => (
                    <option key={p} value={p}>P{p}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500 }}>
                  Type
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    color: "#e2e8f0",
                    fontSize: "14px",
                  }}
                >
                  {types.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Estimated Cost */}
            <div>
              <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500 }}>
                Estimated Cost ($)
              </label>
              <input
                type="number"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(Number(e.target.value))}
                step="0.01"
                min="0"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: "6px",
                  color: "#e2e8f0",
                  fontSize: "14px",
                }}
              />
            </div>
          </div>
          
          {/* Actions */}
          <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
            <button
              onClick={handleSave}
              disabled={saving || !title.trim()}
              style={{
                flex: 1,
                padding: "12px",
                background: saving || !title.trim() ? "#334155" : "#3b82f6",
                border: "none",
                borderRadius: "6px",
                color: "white",
                fontSize: "14px",
                fontWeight: 600,
                cursor: saving || !title.trim() ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving..." : "💾 Save Changes"}
            </button>
            <button
              onClick={onClose}
              style={{
                padding: "12px 24px",
                background: "transparent",
                border: "1px solid #334155",
                borderRadius: "6px",
                color: "#94a3b8",
                fontSize: "14px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
