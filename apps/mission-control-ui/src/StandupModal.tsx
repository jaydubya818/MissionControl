import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function StandupModal({ 
  projectId,
  onClose,
}: { 
  projectId: Id<"projects"> | null;
  onClose: () => void;
}) {
  const report = useQuery(api.standup.generate, projectId ? { projectId } : {});

  return (
    <Modal onClose={onClose}>
      <h2 style={{ margin: "0 0 20px", fontSize: "1.25rem", fontWeight: 600 }}>
        Daily standup
      </h2>
      {report === undefined ? (
        <div style={{ padding: 24 }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Section title="Agents">
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <Stat label="Total" value={report.agents.total} />
              <Stat label="Active" value={report.agents.active} />
              <Stat label="Paused" value={report.agents.paused} />
            </div>
            {report.agents.list?.length > 0 && (
              <div style={{ marginTop: 12, fontSize: "0.85rem", color: "#94a3b8" }}>
                {report.agents.list.map((a: { name: string; role: string; status: string }) => (
                  <span key={a.name} style={{ marginRight: 12 }}>
                    {a.name} ({a.role} · {a.status})
                  </span>
                ))}
              </div>
            )}
          </Section>
          <Section title="Tasks">
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Stat label="Inbox" value={report.tasks.inbox} />
              <Stat label="Assigned" value={report.tasks.assigned} />
              <Stat label="In progress" value={report.tasks.inProgress} />
              <Stat label="Review" value={report.tasks.review} />
              <Stat label="Needs approval" value={report.tasks.needsApproval} />
              <Stat label="Blocked" value={report.tasks.blocked} />
              <Stat label="Done" value={report.tasks.done} />
              <Stat label="Total" value={report.tasks.total} />
            </div>
          </Section>
          <Section title="Approvals">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Stat label="Pending" value={report.approvals.pending} />
            </div>
            {report.approvals.items?.length > 0 && (
              <ul style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: "0.85rem", color: "#94a3b8" }}>
                {report.approvals.items.slice(0, 5).map((a: { actionSummary: string; riskLevel: string }) => (
                  <li key={a.actionSummary}>{a.actionSummary} ({a.riskLevel})</li>
                ))}
                {report.approvals.items.length > 5 && <li>+{report.approvals.items.length - 5} more</li>}
              </ul>
            )}
          </Section>
          {report.burnRate && (
            <Section title="Burn Rate">
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div style={{ padding: "6px 12px", background: "#0f172a", borderRadius: 6, border: "1px solid #334155" }}>
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Today</span>
                  <span style={{ display: "block", fontWeight: 600, fontSize: "1.1rem" }}>
                    ${report.burnRate.today.toFixed(2)}
                  </span>
                </div>
              </div>
            </Section>
          )}
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
            Generated {report.generatedAt ? new Date(report.generatedAt).toLocaleString() : ""}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 style={{ margin: "0 0 8px", fontSize: "0.9rem", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase" }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ padding: "6px 12px", background: "#0f172a", borderRadius: 6, border: "1px solid #334155" }}>
      <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{label}</span>
      <span style={{ display: "block", fontWeight: 600, fontSize: "1.1rem" }}>{value}</span>
    </div>
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
