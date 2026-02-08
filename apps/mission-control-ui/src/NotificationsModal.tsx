import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

export function NotificationsModal({ onClose, onSelectTask }: { onClose: () => void; onSelectTask?: (id: Id<"tasks">) => void }) {
  const notifications = useQuery(api.notifications.listRecent, { limit: 50 });
  const agents = useQuery(api.agents.listAll, {});
  const agentMap = agents ? new Map(agents.map((a: Doc<"agents">) => [a._id, a])) : new Map();

  return (
    <Modal onClose={onClose}>
      <h2 style={{ margin: "0 0 20px", fontSize: "1.25rem", fontWeight: 600 }}>
        Notifications (all agents)
      </h2>
      {notifications === undefined ? (
        <div style={{ padding: 24 }}>Loading…</div>
      ) : notifications.length === 0 ? (
        <p style={{ color: "#64748b", fontSize: "0.9rem" }}>No notifications.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {notifications.map((n: Doc<"notifications">) => (
            <div
              key={n._id}
              style={{
                padding: 12,
                background: n.readAt ? "#1e293b" : "#0f172a",
                border: "1px solid #334155",
                borderRadius: 8,
                opacity: n.readAt ? 0.85 : 1,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: "0.7rem",
                      padding: "2px 6px",
                      background: "#334155",
                      color: "#94a3b8",
                      borderRadius: 4,
                      marginRight: 8,
                    }}
                  >
                    {n.type}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                    → {agentMap.get(n.agentId)?.name ?? n.agentId}
                  </span>
                  <div style={{ fontWeight: 500, marginTop: 4 }}>{n.title}</div>
                  {n.body && (
                    <div style={{ fontSize: "0.85rem", color: "#94a3b8", marginTop: 4 }}>{n.body.slice(0, 120)}{n.body.length > 120 ? "…" : ""}</div>
                  )}
                </div>
                {n.taskId && onSelectTask && (
                  <button
                    type="button"
                    onClick={() => { onSelectTask(n.taskId!); onClose(); }}
                    style={{
                      padding: "4px 10px",
                      background: "#334155",
                      border: "1px solid #475569",
                      borderRadius: 6,
                      color: "#e2e8f0",
                      fontSize: "0.75rem",
                      cursor: "pointer",
                    }}
                  >
                    Open task
                  </button>
                )}
              </div>
              <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: 6 }}>
                {n.readAt ? "Read" : "Unread"} · {new Date((n as { _creationTime?: number })._creationTime ?? 0).toLocaleString()}
              </div>
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
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9998 }} onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "100%",
          maxWidth: 560,
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
