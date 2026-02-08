import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";

export function PolicyModal({ onClose }: { onClose: () => void }) {
  const policies = useQuery(api.policy.listAll);
  const activePolicy = useQuery(api.policy.getActive);

  if (policies === undefined) {
    return (
      <Modal onClose={onClose}>
        <div style={{ padding: 24 }}>Loading policy…</div>
      </Modal>
    );
  }

  const active = activePolicy ?? policies.find((p: Doc<"policies">) => p.active);

  return (
    <Modal onClose={onClose}>
      <h2 style={{ margin: "0 0 20px", fontSize: "1.25rem", fontWeight: 600 }}>
        Policy
      </h2>
      {policies.length === 0 ? (
        <p style={{ color: "#64748b", fontSize: "0.9rem" }}>No policies defined.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {active && (
            <div
              style={{
                padding: 12,
                background: "#14532d",
                color: "#86efac",
                borderRadius: 8,
                fontSize: "0.85rem",
              }}
            >
              Active: {active.name} (v{active.version})
            </div>
          )}
          {policies.map((p: Doc<"policies">) => (
            <div
              key={p._id}
              style={{
                padding: 16,
                background: p.active ? "#0f172a" : "#1e293b",
                border: "1px solid #334155",
                borderRadius: 8,
                opacity: p.active ? 1 : 0.8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{p.name}</span>
                <span style={{ fontSize: "0.75rem", color: "#64748b" }}>v{p.version}</span>
                {p.active && (
                  <span
                    style={{
                      fontSize: "0.7rem",
                      padding: "2px 6px",
                      background: "#22c55e",
                      color: "#fff",
                      borderRadius: 4,
                    }}
                  >
                    ACTIVE
                  </span>
                )}
              </div>
              <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                Scope: {p.scopeType}
                {p.scopeId && ` · ${p.scopeId}`}
              </div>
              {p.notes && (
                <div style={{ marginTop: 8, fontSize: "0.85rem", color: "#cbd5e1" }}>
                  {p.notes}
                </div>
              )}
              {p.rules && typeof p.rules === "object" && (
                <pre
                  style={{
                    marginTop: 12,
                    padding: 12,
                    background: "#0f172a",
                    borderRadius: 6,
                    fontSize: "0.75rem",
                    overflow: "auto",
                    maxHeight: 200,
                  }}
                >
                  {JSON.stringify(p.rules, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
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
          background: "rgba(0,0,0,0.5)",
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
          width: "100%",
          maxWidth: 520,
          maxHeight: "90vh",
          overflow: "auto",
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: 12,
          zIndex: 9999,
          padding: 24,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
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
