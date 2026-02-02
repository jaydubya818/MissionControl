import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

export function ApprovalsModal({ 
  projectId,
  onClose,
}: { 
  projectId: Id<"projects"> | null;
  onClose: () => void;
}) {
  const pending = useQuery(api.approvals.listPending, projectId ? { projectId, limit: 50 } : { limit: 50 });
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const approveMutation = useMutation(api.approvals.approve);
  const denyMutation = useMutation(api.approvals.deny);

  const agentMap = agents ? new Map(agents.map((a: Doc<"agents">) => [a._id, a])) : new Map();

  if (pending === undefined) {
    return (
      <Modal onClose={onClose}>
        <div style={{ padding: 24 }}>Loading approvals…</div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose}>
      <h2 style={{ margin: "0 0 20px", fontSize: "1.25rem", fontWeight: 600 }}>
        Approvals inbox
      </h2>
      {pending.length === 0 ? (
        <p style={{ color: "#64748b", fontSize: "0.9rem" }}>No pending approvals.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {pending.map((a: Doc<"approvals">) => (
            <ApprovalCard
              key={a._id}
              approval={a}
              requestorName={agentMap.get(a.requestorAgentId)?.name ?? "Agent"}
              onApprove={async () => {
                await approveMutation({
                  approvalId: a._id,
                  decidedByUserId: "operator",
                  reason: "Approved from Mission Control",
                });
              }}
              onDeny={async (reason: string) => {
                await denyMutation({
                  approvalId: a._id,
                  decidedByUserId: "operator",
                  reason,
                });
              }}
            />
          ))}
        </div>
      )}
    </Modal>
  );
}

function ApprovalCard({
  approval,
  requestorName,
  onApprove,
  onDeny,
}: {
  approval: Doc<"approvals">;
  requestorName: string;
  onApprove: () => Promise<void>;
  onDeny: (reason: string) => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [denyReason, setDenyReason] = useState("");
  const [showDeny, setShowDeny] = useState(false);

  const expiresAt = approval.expiresAt ? new Date(approval.expiresAt).toLocaleString() : "";
  const isExpired = approval.expiresAt ? Date.now() > approval.expiresAt : false;

  const handleApprove = async () => {
    setLoading(true);
    try {
      await onApprove();
    } finally {
      setLoading(false);
    }
  };

  const handleDeny = async () => {
    if (!denyReason.trim()) return;
    setLoading(true);
    try {
      await onDeny(denyReason.trim());
      setShowDeny(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        padding: 16,
        background: "#0f172a",
        border: "1px solid #334155",
        borderRadius: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
          {requestorName} · {approval.actionType} · {approval.riskLevel}
        </span>
        {expiresAt && (
          <span style={{ fontSize: "0.75rem", color: isExpired ? "#ef4444" : "#64748b" }}>
            Expires: {expiresAt}
          </span>
        )}
      </div>
      <div style={{ fontWeight: 500, marginBottom: 6 }}>{approval.actionSummary}</div>
      {approval.justification && (
        <div style={{ fontSize: "0.85rem", color: "#94a3b8", marginBottom: 12 }}>
          {approval.justification}
        </div>
      )}
      {!showDeny ? (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={handleApprove}
            disabled={loading || isExpired}
            style={{
              padding: "6px 12px",
              background: "#22c55e",
              border: "1px solid #16a34a",
              borderRadius: 6,
              color: "#fff",
              fontSize: "0.8rem",
              cursor: loading || isExpired ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "…" : "Approve"}
          </button>
          <button
            type="button"
            onClick={() => setShowDeny(true)}
            disabled={loading || isExpired}
            style={{
              padding: "6px 12px",
              background: "#7f1d1d",
              border: "1px solid #b91c1c",
              borderRadius: 6,
              color: "#fecaca",
              fontSize: "0.8rem",
              cursor: loading || isExpired ? "not-allowed" : "pointer",
            }}
          >
            Deny
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          <input
            type="text"
            value={denyReason}
            onChange={(e) => setDenyReason(e.target.value)}
            placeholder="Reason for denial (required)"
            style={{
              width: "100%",
              padding: "8px 10px",
              marginBottom: 8,
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: 6,
              color: "#e2e8f0",
              fontSize: "0.85rem",
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={handleDeny}
              disabled={loading || !denyReason.trim()}
              style={{
                padding: "6px 12px",
                background: "#7f1d1d",
                border: "1px solid #b91c1c",
                borderRadius: 6,
                color: "#fecaca",
                fontSize: "0.8rem",
                cursor: "pointer",
              }}
            >
              Submit denial
            </button>
            <button
              type="button"
              onClick={() => { setShowDeny(false); setDenyReason(""); }}
              style={{
                padding: "6px 12px",
                background: "#334155",
                border: "1px solid #475569",
                borderRadius: 6,
                color: "#e2e8f0",
                fontSize: "0.8rem",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
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
          zIndex: 40,
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
          zIndex: 50,
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

