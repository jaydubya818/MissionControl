import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";

const TASK_TYPES = [
  "CONTENT",
  "SOCIAL",
  "EMAIL_MARKETING",
  "CUSTOMER_RESEARCH",
  "SEO_RESEARCH",
  "ENGINEERING",
  "DOCS",
  "OPS",
] as const;

const PRIORITIES = [
  { value: 1, label: "Critical" },
  { value: 2, label: "High" },
  { value: 3, label: "Normal" },
  { value: 4, label: "Low" },
] as const;

export function CreateTaskModal({ 
  projectId,
  onClose, 
  onCreated,
}: { 
  projectId: Id<"projects"> | null;
  onClose: () => void; 
  onCreated?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<string>("ENGINEERING");
  const [priority, setPriority] = useState(3);
  const [assigneeIds, setAssigneeIds] = useState<Id<"agents">[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const createTask = useMutation(api.tasks.create);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createTask({
        projectId: projectId ?? undefined,
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        priority,
        assigneeIds: assigneeIds.length > 0 ? assigneeIds : undefined,
        idempotencyKey: `ui-create:${Date.now()}`,
        // Provenance — task came from the dashboard UI
        source: "DASHBOARD",
        createdBy: "HUMAN",
      });
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    }
    setSubmitting(false);
  };

  const toggleAssignee = (id: Id<"agents">) => {
    setAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 9998,
        }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-task-title"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "100%",
          maxWidth: 480,
          maxHeight: "90vh",
          overflow: "auto",
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: 12,
          zIndex: 9999,
          padding: 24,
        }}
      >
        <h2 id="create-task-title" style={{ margin: "0 0 20px", fontSize: "1.25rem", fontWeight: 600 }}>
          New task
        </h2>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 6, fontSize: "0.8rem", color: "#94a3b8" }}>
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              autoFocus
              required
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 6, fontSize: "0.8rem", color: "#94a3b8" }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={3}
              style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
            />
          </div>
          <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: 6, fontSize: "0.8rem", color: "#94a3b8" }}>
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                style={inputStyle}
              >
                {TASK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", marginBottom: 6, fontSize: "0.8rem", color: "#94a3b8" }}>
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                style={inputStyle}
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {agents && agents.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", marginBottom: 6, fontSize: "0.8rem", color: "#94a3b8" }}>
                Assignees
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(agents as Doc<"agents">[]).map((a) => (
                  <label
                    key={a._id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 10px",
                      background: assigneeIds.includes(a._id) ? "#334155" : "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: "0.8rem",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={assigneeIds.includes(a._id)}
                      onChange={() => toggleAssignee(a._id)}
                    />
                    <span>{a.emoji || "🤖"}</span>
                    <span>{a.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {error && (
            <div
              style={{
                marginBottom: 16,
                padding: 10,
                background: "#7f1d1d",
                color: "#fecaca",
                borderRadius: 6,
                fontSize: "0.85rem",
              }}
            >
              {error}
            </div>
          )}
          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={buttonSecondaryStyle}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} style={buttonPrimaryStyle}>
              {submitting ? "Creating…" : "Create task"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 6,
  color: "#e2e8f0",
  fontSize: "0.875rem",
};

const buttonSecondaryStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: "#334155",
  border: "1px solid #475569",
  borderRadius: 6,
  color: "#e2e8f0",
  fontSize: "0.875rem",
  cursor: "pointer",
};

const buttonPrimaryStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: "#3b82f6",
  border: "1px solid #2563eb",
  borderRadius: 6,
  color: "#fff",
  fontSize: "0.875rem",
  cursor: "pointer",
};
