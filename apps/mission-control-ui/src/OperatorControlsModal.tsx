import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type OperatorMode = "NORMAL" | "PAUSED" | "DRAINING" | "KILLED" | "QUARANTINED";

const MODES: Array<{ id: OperatorMode; label: string; detail: string; color: string }> = [
  { id: "NORMAL", label: "Normal", detail: "All automation and transitions allowed", color: "#16a34a" },
  { id: "PAUSED", label: "Paused", detail: "Blocks non-human execution immediately", color: "#f59e0b" },
  { id: "DRAINING", label: "Draining", detail: "Blocks new runs while allowing safe completion", color: "#0284c7" },
  { id: "KILLED", label: "Killed", detail: "Cancels queued work and signals active workflow leases to stop", color: "#991b1b" },
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

  const [mode, setModeState] = useState<OperatorMode>("NORMAL");
  const [reason, setReason] = useState("");
  const [dailyBudgetUsd, setDailyBudgetUsd] = useState("25");
  const [perRunBudgetUsd, setPerRunBudgetUsd] = useState("5");
  const [maxConcurrentRuns, setMaxConcurrentRuns] = useState("1");
  const [leaseDurationMs, setLeaseDurationMs] = useState("60000");
  const [staleRecoveryLimit, setStaleRecoveryLimit] = useState("1");
  const [killConfirmed, setKillConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (current?.mode) {
      setModeState(current.mode);
      setDailyBudgetUsd(String(current.executionPolicy.dailyBudgetUsd));
      setPerRunBudgetUsd(String(current.executionPolicy.perRunBudgetUsd));
      setMaxConcurrentRuns(String(current.executionPolicy.maxConcurrentRuns));
      setLeaseDurationMs(String(current.executionPolicy.leaseDurationMs));
      setStaleRecoveryLimit(String(current.executionPolicy.staleRecoveryLimit));
    }
  }, [current]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (mode !== "NORMAL" && !reason.trim()) {
        throw new Error("A reason is required for pause, drain, kill, or quarantine.");
      }
      if (mode === "KILLED" && !killConfirmed) {
        throw new Error("Confirm the workspace kill before applying it.");
      }
      await setMode({
        projectId: projectId ?? undefined,
        mode,
        reason: reason.trim() || undefined,
        userId: "operator",
        dailyBudgetUsd: Number(dailyBudgetUsd),
        perRunBudgetUsd: Number(perRunBudgetUsd),
        maxConcurrentRuns: Number(maxConcurrentRuns),
        leaseDurationMs: Number(leaseDurationMs),
        staleRecoveryLimit: Number(staleRecoveryLimit),
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
      <p style={{ margin: "0 0 14px", color: "var(--muted-foreground)", fontSize: "0.85rem" }}>
        Control workflow execution posture for this workspace. Continuous scheduling is locked off until the recovery proof is approved.
      </p>

      <div style={{ marginBottom: 12, padding: "9px 10px", border: "1px solid var(--border)", borderRadius: 7, color: "var(--muted-foreground)", fontSize: "0.8rem" }}>
        Continuous scheduling: <strong style={{ color: "#f59e0b" }}>DISABLED</strong>
      </div>

      <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        {MODES.map((entry) => {
          const active = mode === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setModeState(entry.id)}
              style={{
                border: active ? `1px solid ${entry.color}` : "1px solid var(--border)",
                background: active ? "var(--background)" : "var(--card)",
                borderRadius: 8,
                padding: "10px 12px",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{entry.label}</span>
                <span style={{ color: entry.color, fontSize: "0.75rem", fontWeight: 700 }}>{entry.id}</span>
              </div>
              <div style={{ color: "var(--muted-foreground)", fontSize: "0.8rem", marginTop: 4 }}>{entry.detail}</div>
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginBottom: 12 }}>
        {[
          ["Daily budget (USD)", dailyBudgetUsd, setDailyBudgetUsd, "0.01"],
          ["Per-run budget (USD)", perRunBudgetUsd, setPerRunBudgetUsd, "0.01"],
          ["Concurrent runs", maxConcurrentRuns, setMaxConcurrentRuns, "1"],
          ["Lease duration (ms)", leaseDurationMs, setLeaseDurationMs, "1000"],
          ["Stale recoveries", staleRecoveryLimit, setStaleRecoveryLimit, "1"],
        ].map(([label, value, setter, step]) => (
          <label key={label as string} style={{ display: "grid", gap: 4, color: "var(--muted-foreground)", fontSize: "0.75rem" }}>
            {label as string}
            <input
              type="number"
              min="0"
              step={step as string}
              value={value as string}
              onChange={(event) => (setter as (next: string) => void)(event.target.value)}
              style={{ padding: "7px 8px", background: "var(--background)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--foreground)" }}
            />
          </label>
        ))}
      </div>

      <textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason (recommended for non-normal modes)"
        rows={3}
        style={{
          width: "100%",
          padding: "8px 10px",
          background: "var(--background)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          color: "var(--foreground)",
          fontSize: "0.84rem",
          resize: "vertical",
        }}
      />

      {mode === "KILLED" && (
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 10, color: "#fecaca", fontSize: "0.8rem" }}>
          <input
            type="checkbox"
            checked={killConfirmed}
            onChange={(event) => setKillConfirmed(event.target.checked)}
          />
          I understand this cancels queued workflow runs and signals active leases to stop.
        </label>
      )}

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
            background: "var(--border)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "#cbd5e1",
            fontSize: "0.82rem",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>

      <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        <div style={{ color: "var(--muted-foreground)", fontSize: "0.75rem", marginBottom: 6 }}>Recent mode changes</div>
        {!history || history.length === 0 ? (
          <div style={{ color: "var(--muted-foreground)", fontSize: "0.8rem" }}>No control changes yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflow: "auto" }}>
            {history.map((entry) => (
              <div
                key={entry._id}
                style={{
                  background: "var(--background)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "8px 10px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ color: "var(--foreground)", fontSize: "0.82rem", fontWeight: 600 }}>{entry.mode}</span>
                  <span style={{ color: "var(--muted-foreground)", fontSize: "0.75rem" }}>
                    {new Date(entry.updatedAt).toLocaleString()}
                  </span>
                </div>
                {entry.reason && (
                  <div style={{ color: "var(--muted-foreground)", fontSize: "0.78rem", marginTop: 2 }}>{entry.reason}</div>
                )}
                <div style={{ color: "var(--muted-foreground)", fontSize: "0.72rem", marginTop: 2 }}>by {entry.updatedBy}</div>
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
          background: "var(--card)",
          border: "1px solid var(--border)",
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
            color: "var(--muted-foreground)",
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
