import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";

interface TaskEditModeProps {
  task: Doc<"tasks">;
  onSave: () => void;
  onCancel: () => void;
}

export function TaskEditMode({ task, onSave, onCancel }: TaskEditModeProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [priority, setPriority] = useState(task.priority);
  const [status, setStatus] = useState(task.status);
  const [type, setType] = useState(task.type);
  const [estimatedCost, setEstimatedCost] = useState(task.estimatedCost || 0);
  const [assigneeIds, setAssigneeIds] = useState<Id<"agents">[]>(task.assigneeIds || []);
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
        assigneeIds,
      });
      onSave();
    } catch (error) {
      console.error("Failed to update task:", error);
      alert("Failed to update task");
    } finally {
      setSaving(false);
    }
  };
  
  const statuses: Array<Doc<"tasks">["status"]> = [
    "INBOX",
    "ASSIGNED",
    "IN_PROGRESS",
    "REVIEW",
    "NEEDS_APPROVAL",
    "BLOCKED",
    "FAILED",
    "DONE",
    "CANCELED",
  ];
  const types: Array<Doc<"tasks">["type"]> = [
    "CONTENT",
    "SOCIAL",
    "EMAIL_MARKETING",
    "CUSTOMER_RESEARCH",
    "SEO_RESEARCH",
    "ENGINEERING",
    "DOCS",
    "OPS",
  ];
  const priorities: Array<Doc<"tasks">["priority"]> = [1, 2, 3, 4];
  
  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: "6px",
    color: "#e2e8f0",
    fontSize: "14px",
  };
  
  return (
    <div style={{ padding: "20px" }}>
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "24px",
        paddingBottom: "16px",
        borderBottom: "1px solid #334155",
      }}>
        <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>
          ✏️ Edit Task
        </h3>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            style={{
              padding: "8px 16px",
              background: saving || !title.trim() ? "#334155" : "#10b981",
              border: "none",
              borderRadius: "6px",
              color: "white",
              fontSize: "14px",
              fontWeight: 600,
              cursor: saving || !title.trim() ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving..." : "💾 Save"}
          </button>
          <button
            onClick={onCancel}
            style={{
              padding: "8px 16px",
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
      
      {/* Form */}
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* Title */}
        <div>
          <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500, color: "#e2e8f0" }}>
            Title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={inputStyle}
            placeholder="Task title"
            autoFocus
          />
        </div>
        
        {/* Description */}
        <div>
          <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500, color: "#e2e8f0" }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            style={{
              ...inputStyle,
              resize: "vertical",
              fontFamily: "inherit",
            }}
            placeholder="Detailed task description..."
          />
        </div>
        
        {/* Grid: Status, Priority, Type */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
          <div>
            <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500, color: "#e2e8f0" }}>
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Doc<"tasks">["status"])}
              style={inputStyle}
            >
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500, color: "#e2e8f0" }}>
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) as Doc<"tasks">["priority"])}
              style={inputStyle}
            >
              {priorities.map((p) => (
                <option key={p} value={p}>P{p} - {p === 1 ? "Critical" : p === 2 ? "High" : p === 3 ? "Normal" : "Low"}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500, color: "#e2e8f0" }}>
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as Doc<"tasks">["type"])}
              style={inputStyle}
            >
              {types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
        
        {/* Assignees */}
        <div>
          <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500, color: "#e2e8f0" }}>
            Assigned Agents
          </label>
          <div style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
            padding: "12px",
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: "6px",
            minHeight: "48px",
          }}>
            {agents?.map((agent) => {
              const isSelected = assigneeIds.includes(agent._id);
              return (
                <button
                  key={agent._id}
                  onClick={() => {
                    if (isSelected) {
                      setAssigneeIds(assigneeIds.filter(id => id !== agent._id));
                    } else {
                      setAssigneeIds([...assigneeIds, agent._id]);
                    }
                  }}
                  style={{
                    padding: "6px 12px",
                    background: isSelected ? "#3b82f6" : "#1e293b",
                    border: `1px solid ${isSelected ? "#3b82f6" : "#334155"}`,
                    borderRadius: "6px",
                    color: "#e2e8f0",
                    fontSize: "13px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {agent.emoji || "🤖"} {agent.name}
                </button>
              );
            })}
          </div>
        </div>
        
        {/* Estimated Cost */}
        <div>
          <label style={{ display: "block", marginBottom: "8px", fontSize: "14px", fontWeight: 500, color: "#e2e8f0" }}>
            Estimated Cost ($)
          </label>
          <input
            type="number"
            value={estimatedCost}
            onChange={(e) => setEstimatedCost(Number(e.target.value))}
            step="0.01"
            min="0"
            style={inputStyle}
          />
        </div>
        
        {/* Info */}
        <div style={{
          padding: "12px",
          background: "#0f172a",
          border: "1px solid #334155",
          borderRadius: "6px",
          fontSize: "12px",
          color: "#94a3b8",
        }}>
          <div><strong>Task ID:</strong> {task._id}</div>
          <div><strong>Created:</strong> {new Date(task._creationTime).toLocaleString()}</div>
          {task.actualCost > 0 && <div><strong>Actual Cost:</strong> ${task.actualCost.toFixed(2)}</div>}
        </div>
      </div>
    </div>
  );
}
