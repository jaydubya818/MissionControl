import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

type ApprovalStatus = "PENDING" | "ESCALATED" | "APPROVED" | "DENIED";

const TAB_ORDER: ApprovalStatus[] = ["PENDING", "ESCALATED", "APPROVED", "DENIED"];
const TAB_LABEL: Record<ApprovalStatus, string> = {
  PENDING: "Pending",
  ESCALATED: "Escalated",
  APPROVED: "Approved",
  DENIED: "Denied",
};

export function ApprovalsModal({
  projectId,
  onClose,
}: {
  projectId: Id<"projects"> | null;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<ApprovalStatus>("PENDING");

  const pending = useQuery(
    api.approvals.listByStatus,
    projectId ? { projectId, status: "PENDING", limit: 100 } : { status: "PENDING", limit: 100 }
  );
  const escalated = useQuery(
    api.approvals.listByStatus,
    projectId ? { projectId, status: "ESCALATED", limit: 100 } : { status: "ESCALATED", limit: 100 }
  );
  const approved = useQuery(
    api.approvals.listByStatus,
    projectId ? { projectId, status: "APPROVED", limit: 100 } : { status: "APPROVED", limit: 100 }
  );
  const denied = useQuery(
    api.approvals.listByStatus,
    projectId ? { projectId, status: "DENIED", limit: 100 } : { status: "DENIED", limit: 100 }
  );
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});

  const approveMutation = useMutation(api.approvals.approve);
  const denyMutation = useMutation(api.approvals.deny);

  if (!pending || !escalated || !approved || !denied || !agents) {
    return (
      <Modal onClose={onClose}>
        <div style={{ padding: 24 }}>Loading approvals...</div>
      </Modal>
    );
  }

  const agentMap = new Map(agents.map((agent) => [agent._id, agent]));
  const byStatus: Record<ApprovalStatus, Doc<"approvals">[]> = {
    PENDING: pending,
    ESCALATED: escalated,
    APPROVED: approved,
    DENIED: denied,
  };
  const rows = byStatus[activeTab];

  const counts = {
    PENDING: pending.length,
    ESCALATED: escalated.length,
    APPROVED: approved.length,
    DENIED: denied.length,
  };

  return (
    <Modal onClose={onClose}>
      <h2 style={{ margin: "0 0 12px", fontSize: "1.25rem", fontWeight: 700 }}>
        Approvals Center
      </h2>
      <p style={{ color: "#94a3b8", margin: "0 0 14px", fontSize: "0.85rem" }}>
        Escalated approvals breached SLA and should be actioned first.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {TAB_ORDER.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setActiveTab(status)}
            style={{
              padding: "8px 12px",
              background: activeTab === status ? "#1d4ed8" : "#0f172a",
              border: "1px solid #334155",
              borderRadius: 6,
              color: "#e2e8f0",
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            {TAB_LABEL[status]} ({counts[status]})
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p style={{ color: "#64748b", fontSize: "0.9rem" }}>
          No {TAB_LABEL[activeTab].toLowerCase()} approvals.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((approval) => (
            <ApprovalCard
              key={approval._id}
              approval={approval}
              requestor={agentMap.get(approval.requestorAgentId)}
              canDecide={activeTab === "PENDING" || activeTab === "ESCALATED"}
              onApprove={async (reason) => {
                return await approveMutation({
                  approvalId: approval._id,
                  decidedByUserId: "operator",
                  reason,
                });
              }}
              onDeny={async (reason) => {
                return await denyMutation({
                  approvalId: approval._id,
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
  requestor,
  canDecide,
  onApprove,
  onDeny,
}: {
  approval: Doc<"approvals">;
  requestor: Doc<"agents"> | undefined;
  canDecide: boolean;
  onApprove: (reason: string) => Promise<any>;
  onDeny: (reason: string) => Promise<any>;
}) {
  const [loading, setLoading] = useState(false);
  const [approveReason, setApproveReason] = useState("");
  const [denyReason, setDenyReason] = useState("");
  const [showDeny, setShowDeny] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const riskColor = approval.riskLevel === "RED" ? "#ef4444" : "#f59e0b";
  const statusColor =
    approval.status === "APPROVED"
      ? "#22c55e"
      : approval.status === "DENIED"
        ? "#ef4444"
        : approval.status === "ESCALATED"
          ? "#f97316"
          : "#f59e0b";

  const expiryText = useMemo(() => {
    return new Date(approval.expiresAt).toLocaleString();
  }, [approval.expiresAt]);

  const decidedText = approval.decidedAt ? new Date(approval.decidedAt).toLocaleString() : null;
  const escalatedText = approval.escalatedAt ? new Date(approval.escalatedAt).toLocaleString() : null;
  const minutesRemaining = Math.floor((approval.expiresAt - Date.now()) / 60000);
  const needsDualControl = (approval.requiredDecisionCount ?? 1) > 1;

  async function handleApprove() {
    if (!approveReason.trim()) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const result = await onApprove(approveReason.trim());
      if (result?.pendingSecondDecision) {
        setInfo("First approval recorded. A second distinct approver is required.");
      } else {
        setInfo("Approval recorded.");
      }
      setApproveReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeny() {
    if (!denyReason.trim()) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      await onDeny(denyReason.trim());
      setShowDeny(false);
      setDenyReason("");
      setInfo("Approval denied.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deny. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        padding: 14,
        background: "#0f172a",
        border: approval.status === "ESCALATED" ? "1px solid #f97316" : "1px solid #334155",
        borderRadius: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
            {requestor?.emoji || "🤖"} {requestor?.name ?? "Agent"}
          </span>
          <span style={{ fontSize: "0.75rem", color: "#64748b" }}>· {approval.actionType}</span>
          <span
            style={{
              fontSize: "0.7rem",
              fontWeight: 700,
              color: "#fff",
              background: riskColor,
              borderRadius: 4,
              padding: "2px 6px",
            }}
          >
            {approval.riskLevel}
          </span>
          {needsDualControl && (
            <span
              style={{
                fontSize: "0.68rem",
                fontWeight: 700,
                color: "#fde68a",
                background: "#78350f",
                borderRadius: 4,
                padding: "2px 6px",
              }}
            >
              DUAL CONTROL
            </span>
          )}
        </div>
        <span style={{ fontSize: "0.75rem", color: statusColor, fontWeight: 700 }}>{approval.status}</span>
      </div>

      <div style={{ fontWeight: 600, marginTop: 8 }}>{approval.actionSummary}</div>

      <div style={{ marginTop: 6, fontSize: "0.84rem", color: "#94a3b8", whiteSpace: "pre-wrap" }}>
        {approval.justification}
      </div>

      <div style={{ marginTop: 8, fontSize: "0.75rem", color: minutesRemaining < 10 ? "#fca5a5" : "#64748b" }}>
        Expires: {expiryText} ({minutesRemaining >= 0 ? `${minutesRemaining}m left` : "expired"})
      </div>

      {approval.status === "ESCALATED" && (
        <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#fb923c" }}>
          Escalated: {escalatedText ?? "now"}
          {approval.escalationReason ? ` · ${approval.escalationReason}` : ""}
        </div>
      )}

      {approval.firstDecisionAt && (
        <div style={{ marginTop: 6, fontSize: "0.75rem", color: "#fcd34d" }}>
          First approval: {approval.firstDecisionByUserId ?? "operator"} at {new Date(approval.firstDecisionAt).toLocaleString()}
        </div>
      )}

      {!canDecide && (
        <div style={{ marginTop: 8, fontSize: "0.8rem", color: "#cbd5e1" }}>
          Decision reason: {approval.decisionReason || "No reason provided"}
          {decidedText ? ` · ${decidedText}` : ""}
        </div>
      )}

      {canDecide && (
        <div style={{ marginTop: 12 }}>
          {error && (
            <div style={{
              padding: "8px 10px",
              marginBottom: 8,
              background: "#450a0a",
              border: "1px solid #ef4444",
              borderRadius: 6,
              color: "#fca5a5",
              fontSize: "0.8rem",
            }}>
              {error}
            </div>
          )}

          {info && (
            <div style={{
              padding: "8px 10px",
              marginBottom: 8,
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 6,
              color: "#93c5fd",
              fontSize: "0.8rem",
            }}>
              {info}
            </div>
          )}

          {!showDeny ? (
            <>
              <input
                type="text"
                value={approveReason}
                onChange={(event) => setApproveReason(event.target.value)}
                placeholder="Approval reason (required)"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: 6,
                  color: "#e2e8f0",
                  fontSize: "0.85rem",
                }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={loading || !approveReason.trim()}
                  style={{
                    padding: "7px 12px",
                    background: "#15803d",
                    border: "1px solid #22c55e",
                    borderRadius: 6,
                    color: "#dcfce7",
                    fontSize: "0.8rem",
                    cursor: loading || !approveReason.trim() ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "Saving..." : needsDualControl && !approval.firstDecisionAt ? "Record 1st Approval" : "Approve"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeny(true)}
                  disabled={loading}
                  style={{
                    padding: "7px 12px",
                    background: "#7f1d1d",
                    border: "1px solid #ef4444",
                    borderRadius: 6,
                    color: "#fecaca",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                  }}
                >
                  Deny
                </button>
              </div>
            </>
          ) : (
            <>
              <input
                type="text"
                value={denyReason}
                onChange={(event) => setDenyReason(event.target.value)}
                placeholder="Denial reason (required)"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: 6,
                  color: "#e2e8f0",
                  fontSize: "0.85rem",
                }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={handleDeny}
                  disabled={loading || !denyReason.trim()}
                  style={{
                    padding: "7px 12px",
                    background: "#7f1d1d",
                    border: "1px solid #ef4444",
                    borderRadius: 6,
                    color: "#fecaca",
                    fontSize: "0.8rem",
                    cursor: loading || !denyReason.trim() ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "Saving..." : "Confirm Deny"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDeny(false);
                    setDenyReason("");
                  }}
                  disabled={loading}
                  style={{
                    padding: "7px 12px",
                    background: "#334155",
                    border: "1px solid #475569",
                    borderRadius: 6,
                    color: "#94a3b8",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
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
          width: "min(900px, 94vw)",
          maxHeight: "90vh",
          overflow: "auto",
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: 12,
          zIndex: 9999,
          padding: 20,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: "absolute",
            top: 12,
            right: 14,
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
