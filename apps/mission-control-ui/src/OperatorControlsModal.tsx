import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const MODES: Array<{ id: "NORMAL" | "PAUSED" | "DRAINING" | "QUARANTINED"; label: string; detail: string; color: string }> = [
  { id: "NORMAL", label: "Normal", detail: "All automation and transitions allowed", color: "#16a34a" },
  { id: "PAUSED", label: "Paused", detail: "Blocks non-human execution immediately", color: "#f59e0b" },
  { id: "DRAINING", label: "Draining", detail: "Blocks new runs while allowing safe completion", color: "#0284c7" },
  { id: "QUARANTINED", label: "Quarantined", detail: "Hard block on autonomous execution", color: "#dc2626" },
];

export function OperatorControlsModal({
  projectId,
  onClose,
}: {
  projectId: Id<"projects"> | null;
  onClose: () => void;
}) {
  const current = useQuery(
    api.operatorControls.getCurrent,
    projectId ? { projectId } : {}
  );
  const history = useQuery(
    api.operatorControls.listHistory,
    projectId ? { projectId, limit: 20 } : { limit: 20 }
  );
  const setMode = useMutation(api.operatorControls.setMode);

  const [mode, setModeState] = useState<"NORMAL" | "PAUSED" | "DRAINING" | "QUARANTINED">("NORMAL");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (current?.mode) {
      setModeState(current.mode);
    }
  }, [current?.mode]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await setMode({
        projectId: projectId ?? undefined,
        mode,
        reason: reason.trim() || undefined,
        userId: "operator",
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update operator controls");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2 style={{ margin: "0 0 12px", fontSize: "1.2rem", fontWeight: 700 }}>Operator Controls</h2>
      <p style={{ margin: "0 0 14px", color: "#94a3b8", fontSize: "0.85rem" }}>
        Control execution posture for this project. Use quarantined mode for incident containment.
      </p>

      <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        {MODES.map((entry) => {
          const active = mode === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setModeState(entry.id)}
              style={{
                border: active ? `1px solid ${entry.color}` : "1px solid #334155",
                background: active ? "#0f172a" : "#1e293b",
                borderRadius: 8,
                padding: "10px 12px",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 600, color: "#e2e8f0" }}>{entry.label}</span>
                <span style={{ color: entry.color, fontSize: "0.75rem", fontWeight: 700 }}>{entry.id}</span>
              </div>
              <div style={{ color: "#94a3b8", fontSize: "0.8rem", marginTop: 4 }}>{entry.detail}</div>
            </button>
          );
        })}
      </div>

      <textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason (recommended for non-normal modes)"
        rows={3}
        style={{
          width: "100%",
          padding: "8px 10px",
          background: "#0f172a",
          border: "1px solid #334155",
          borderRadius: 6,
          color: "#e2e8f0",
          fontSize: "0.84rem",
          resize: "vertical",
        }}
      />

      {error && (
        <div
          style={{
            marginTop: 8,
            padding: "8px 10px",
            background: "#450a0a",
            border: "1px solid #ef4444",
            borderRadius: 6,
            color: "#fecaca",
            fontSize: "0.8rem",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "8px 12px",
            background: "#1d4ed8",
            border: "1px solid #2563eb",
            borderRadius: 6,
            color: "#dbeafe",
            fontSize: "0.82rem",
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Saving..." : "Apply Mode"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          style={{
            padding: "8px 12px",
            background: "#334155",
            border: "1px solid #475569",
            borderRadius: 6,
            color: "#cbd5e1",
            fontSize: "0.82rem",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>

      <div style={{ marginTop: 16, borderTop: "1px solid #334155", paddingTop: 10 }}>
        <div style={{ color: "#94a3b8", fontSize: "0.75rem", marginBottom: 6 }}>Recent mode changes</div>
        {!history || history.length === 0 ? (
          <div style={{ color: "#64748b", fontSize: "0.8rem" }}>No control changes yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflow: "auto" }}>
            {history.map((entry) => (
              <div
                key={entry._id}
                style={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 6,
                  padding: "8px 10px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ color: "#e2e8f0", fontSize: "0.82rem", fontWeight: 600 }}>{entry.mode}</span>
                  <span style={{ color: "#64748b", fontSize: "0.75rem" }}>
                    {new Date(entry.updatedAt).toLocaleString()}
                  </span>
                </div>
                {entry.reason && (
                  <div style={{ color: "#94a3b8", fontSize: "0.78rem", marginTop: 2 }}>{entry.reason}</div>
                )}
                <div style={{ color: "#64748b", fontSize: "0.72rem", marginTop: 2 }}>by {entry.updatedBy}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
          zIndex: 9998,
        }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(700px, 92vw)",
          maxHeight: "88vh",
          overflow: "auto",
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: 12,
          zIndex: 9999,
          padding: 18,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: "absolute",
            top: 8,
            right: 10,
            background: "none",
            border: "none",
            color: "#94a3b8",
            fontSize: "1.5rem",
            cursor: "pointer",
          }}
          aria-label="Close"
        >
          ×
        </button>
        {children}
      </div>
    </>
  );
}
