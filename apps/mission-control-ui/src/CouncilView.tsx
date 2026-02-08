import { CSSProperties, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";

interface CouncilViewProps {
  projectId: Id<"projects"> | null;
}

const colors = {
  bgPage: "#0f172a",
  bgCard: "#1e293b",
  bgHover: "#25334d",
  border: "#334155",
  textPrimary: "#e2e8f0",
  textSecondary: "#94a3b8",
  textMuted: "#64748b",
  accentBlue: "#3b82f6",
  accentGreen: "#10b981",
  accentOrange: "#f59e0b",
  accentPurple: "#8b5cf6",
  accentRed: "#ef4444",
};

type Tab = "decisions" | "pending" | "coordinator";

export function CouncilView({ projectId }: CouncilViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>("decisions");

  const approvals = useQuery(api.approvals.list, {
    projectId: projectId ?? undefined,
  });
  const pendingApprovals = useQuery(api.approvals.listPending, {
    projectId: projectId ?? undefined,
  });
  const activities = useQuery(api.activities.list, {
    projectId: projectId ?? undefined,
    limit: 50,
  });
  const agents = useQuery(api.agents.list, {
    projectId: projectId ?? undefined,
  });

  // Handle loading state
  if (approvals === undefined || activities === undefined || agents === undefined) {
    return (
      <main style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Council</h1>
          <p style={styles.subtitle}>Loading...</p>
        </div>
      </main>
    );
  }

  // Build agent name lookup
  const agentMap = new Map<string, Doc<"agents">>();
  for (const a of agents ?? []) {
    agentMap.set(a._id, a);
  }

  // Filter coordinator decisions (approvals and system actions)
  const decisions = approvals.filter(
    (a) => a.status === "APPROVED" || a.status === "DENIED"
  );

  const coordinatorActivities = activities.filter(
    (a) => a.actorType === "SYSTEM" && a.action.includes("COORDINATOR")
  );

  const pending = pendingApprovals ?? [];

  return (
    <main style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Council</h1>
        <p style={styles.subtitle}>
          Multi-agent decision-making and consensus visualization
        </p>
      </div>

      <div style={styles.metricsRow}>
        <MetricCard
          value={decisions.length}
          label="Decisions Made"
          color={colors.accentBlue}
        />
        <MetricCard
          value={decisions.filter((d) => d.status === "APPROVED").length}
          label="Approved"
          color={colors.accentGreen}
        />
        <MetricCard
          value={decisions.filter((d) => d.status === "DENIED").length}
          label="Denied"
          color={colors.accentRed}
        />
        <MetricCard
          value={pending.length}
          label="Awaiting Decision"
          color={pending.length > 0 ? colors.accentOrange : colors.textMuted}
          pulse={pending.length > 0}
        />
        <MetricCard
          value={coordinatorActivities.length}
          label="Coordinator Actions"
          color={colors.accentPurple}
        />
      </div>

      {/* Tab Bar */}
      <div style={styles.tabBar}>
        <TabButton
          active={activeTab === "decisions"}
          label={`Decisions (${decisions.length})`}
          onClick={() => setActiveTab("decisions")}
        />
        <TabButton
          active={activeTab === "pending"}
          label={`Pending (${pending.length})`}
          onClick={() => setActiveTab("pending")}
          badge={pending.length > 0 ? pending.length : undefined}
        />
        <TabButton
          active={activeTab === "coordinator"}
          label={`Coordinator (${coordinatorActivities.length})`}
          onClick={() => setActiveTab("coordinator")}
        />
      </div>

      {/* Tab Content */}
      {activeTab === "decisions" && (
        <div style={styles.section}>
          {decisions.length === 0 ? (
            <EmptyState
              icon="🏛️"
              title="No decisions yet"
              description="When agents request approval for risky actions (YELLOW/RED risk level), decisions will appear here after they are approved or denied."
            />
          ) : (
            <div style={styles.timeline}>
              {decisions.map((decision) => (
                <DecisionCard
                  key={decision._id}
                  decision={decision}
                  agentMap={agentMap}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "pending" && (
        <div style={styles.section}>
          {pending.length === 0 ? (
            <EmptyState
              icon="✅"
              title="No pending approvals"
              description="All clear! No agents are currently waiting for approval to proceed."
            />
          ) : (
            <div style={styles.timeline}>
              {pending.map((approval) => (
                <PendingApprovalCard
                  key={approval._id}
                  approval={approval}
                  agentMap={agentMap}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "coordinator" && (
        <div style={styles.section}>
          {coordinatorActivities.length === 0 ? (
            <EmptyState
              icon="🤖"
              title="No coordinator activity"
              description="The coordinator handles task decomposition, agent delegation, conflict resolution, and loop detection. Activity will appear here as the system orchestrates work."
            />
          ) : (
            <div style={styles.activityList}>
              {coordinatorActivities.map((activity) => (
                <ActivityCard
                  key={activity._id}
                  activity={activity}
                  agentMap={agentMap}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function MetricCard({
  value,
  label,
  color,
  pulse,
}: {
  value: number;
  label: string;
  color: string;
  pulse?: boolean;
}) {
  return (
    <div style={styles.metric}>
      <div
        style={{
          ...styles.metricValue,
          color: value > 0 ? color : colors.textMuted,
        }}
      >
        {value}
        {pulse && <span style={styles.pulseDot} />}
      </div>
      <div style={styles.metricLabel}>{label}</div>
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
  badge,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.tabButton,
        ...(active ? styles.tabButtonActive : {}),
      }}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span style={styles.badge}>{badge}</span>
      )}
    </button>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div style={styles.emptyState}>
      <div style={styles.emptyIcon}>{icon}</div>
      <div style={styles.emptyTitle}>{title}</div>
      <div style={styles.emptyDescription}>{description}</div>
    </div>
  );
}

interface DecisionCardProps {
  decision: Doc<"approvals">;
  agentMap: Map<string, Doc<"agents">>;
}

function DecisionCard({ decision, agentMap }: DecisionCardProps) {
  const isApproved = decision.status === "APPROVED";
  const requestor = agentMap.get(decision.requestorAgentId);
  const decider = decision.decidedByAgentId
    ? agentMap.get(decision.decidedByAgentId)
    : null;

  return (
    <div
      style={{
        ...styles.decisionCard,
        borderLeftColor: isApproved ? colors.accentGreen : colors.accentRed,
      }}
    >
      <div style={styles.decisionHeader}>
        <div
          style={{
            ...styles.decisionStatus,
            color: isApproved ? colors.accentGreen : colors.accentRed,
          }}
        >
          {isApproved ? "✓ APPROVED" : "✗ DENIED"}
        </div>
        <div style={styles.decisionTime}>
          {decision.decidedAt
            ? formatTimeAgo(decision.decidedAt)
            : "Pending"}
        </div>
      </div>

      <div style={styles.decisionTitle}>{decision.actionSummary}</div>

      <div style={styles.decisionMeta}>
        <span style={styles.metaChip}>
          {requestor ? `${requestor.emoji || "🤖"} ${requestor.name}` : "Unknown agent"}
        </span>
        <span
          style={{
            ...styles.metaChip,
            background: decision.riskLevel === "RED" ? "#ef444420" : "#f59e0b20",
            color: decision.riskLevel === "RED" ? colors.accentRed : colors.accentOrange,
          }}
        >
          {decision.riskLevel === "RED" ? "🔴" : "🟡"} {decision.riskLevel}
        </span>
        <span style={styles.metaChip}>{decision.actionType}</span>
        {decision.estimatedCost !== undefined && (
          <span style={styles.metaChip}>
            ${decision.estimatedCost.toFixed(2)}
          </span>
        )}
      </div>

      {decision.justification && (
        <div style={styles.decisionJustification}>
          <strong>Justification:</strong> {decision.justification}
        </div>
      )}

      {decision.decisionReason && (
        <div style={styles.decisionReason}>
          <strong>
            {decider
              ? `${decider.emoji || "🤖"} ${decider.name}`
              : decision.decidedByUserId
                ? `👤 ${decision.decidedByUserId}`
                : "Decision"}
            :
          </strong>{" "}
          {decision.decisionReason}
        </div>
      )}
    </div>
  );
}

interface PendingApprovalCardProps {
  approval: Doc<"approvals">;
  agentMap: Map<string, Doc<"agents">>;
}

function PendingApprovalCard({ approval, agentMap }: PendingApprovalCardProps) {
  const [isActing, setIsActing] = useState(false);
  const [reason, setReason] = useState("");
  const [showActions, setShowActions] = useState(false);
  const approveMutation = useMutation(api.approvals.approve);
  const denyMutation = useMutation(api.approvals.deny);

  const requestor = agentMap.get(approval.requestorAgentId);
  const timeLeft = approval.expiresAt - Date.now();
  const isExpiringSoon = timeLeft < 30 * 60 * 1000; // 30 minutes

  const handleApprove = async () => {
    setIsActing(true);
    try {
      await approveMutation({
        approvalId: approval._id,
        decidedByUserId: "jay",
        reason: reason || "Approved via Council dashboard",
      });
    } finally {
      setIsActing(false);
      setShowActions(false);
    }
  };

  const handleDeny = async () => {
    if (!reason.trim()) return;
    setIsActing(true);
    try {
      await denyMutation({
        approvalId: approval._id,
        decidedByUserId: "jay",
        reason,
      });
    } finally {
      setIsActing(false);
      setShowActions(false);
    }
  };

  return (
    <div
      style={{
        ...styles.decisionCard,
        borderLeftColor: colors.accentOrange,
      }}
    >
      <div style={styles.decisionHeader}>
        <div style={{ ...styles.decisionStatus, color: colors.accentOrange }}>
          ⏳ AWAITING DECISION
        </div>
        <div
          style={{
            ...styles.decisionTime,
            color: isExpiringSoon ? colors.accentRed : colors.textMuted,
          }}
        >
          {isExpiringSoon ? "⚠️ " : ""}
          Expires {formatTimeAgo(approval.expiresAt, true)}
        </div>
      </div>

      <div style={styles.decisionTitle}>{approval.actionSummary}</div>

      <div style={styles.decisionMeta}>
        <span style={styles.metaChip}>
          {requestor ? `${requestor.emoji || "🤖"} ${requestor.name}` : "Unknown agent"}
        </span>
        <span
          style={{
            ...styles.metaChip,
            background: approval.riskLevel === "RED" ? "#ef444420" : "#f59e0b20",
            color: approval.riskLevel === "RED" ? colors.accentRed : colors.accentOrange,
          }}
        >
          {approval.riskLevel === "RED" ? "🔴" : "🟡"} {approval.riskLevel}
        </span>
        <span style={styles.metaChip}>{approval.actionType}</span>
        {approval.estimatedCost !== undefined && (
          <span style={styles.metaChip}>
            ${approval.estimatedCost.toFixed(2)}
          </span>
        )}
      </div>

      <div style={styles.decisionJustification}>
        <strong>Justification:</strong> {approval.justification}
      </div>

      {!showActions ? (
        <button
          onClick={() => setShowActions(true)}
          style={styles.reviewButton}
        >
          Review & Decide
        </button>
      ) : (
        <div style={styles.actionPanel}>
          <input
            type="text"
            placeholder="Reason (required for deny, optional for approve)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={styles.reasonInput}
          />
          <div style={styles.actionButtons}>
            <button
              onClick={handleApprove}
              disabled={isActing}
              style={styles.approveButton}
            >
              {isActing ? "..." : "✓ Approve"}
            </button>
            <button
              onClick={handleDeny}
              disabled={isActing || !reason.trim()}
              style={{
                ...styles.denyButton,
                opacity: !reason.trim() ? 0.5 : 1,
              }}
            >
              {isActing ? "..." : "✗ Deny"}
            </button>
            <button
              onClick={() => setShowActions(false)}
              style={styles.cancelButton}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface ActivityCardProps {
  activity: Doc<"activities">;
  agentMap: Map<string, Doc<"agents">>;
}

function ActivityCard({ activity, agentMap }: ActivityCardProps) {
  // Determine icon based on action type
  const actionIcons: Record<string, string> = {
    COORDINATOR_TASK_DECOMPOSED: "🧩",
    COORDINATOR_DELEGATED: "📋",
    COORDINATOR_CONFLICT_RESOLVED: "⚖️",
    COORDINATOR_ESCALATED: "🚨",
    COORDINATOR_REBALANCED: "⚖️",
    COORDINATOR_LOOP_DETECTED: "🔄",
    COORDINATOR_BUDGET_WARNING: "💰",
    COORDINATOR_AGENT_RECOVERED: "💚",
    COORDINATOR_STANDUP_COMPILED: "📊",
  };

  const icon = actionIcons[activity.action] || "🤖";
  const actionLabel = activity.action
    .replace("COORDINATOR_", "")
    .replace(/_/g, " ");

  const relatedAgent = activity.agentId
    ? agentMap.get(activity.agentId)
    : undefined;

  return (
    <div style={styles.activityCard}>
      <div style={styles.activityHeader}>
        <div style={styles.activityAction}>
          <span style={{ marginRight: 6 }}>{icon}</span>
          {actionLabel}
          {relatedAgent && (
            <span style={styles.activityAgentTag}>
              {relatedAgent.emoji || "🤖"} {relatedAgent.name}
            </span>
          )}
        </div>
        <div style={styles.activityTime}>
          {formatTimeAgo(activity._creationTime)}
        </div>
      </div>
      <div style={styles.activityDesc}>{activity.description}</div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatTimeAgo(timestamp: number, future = false): string {
  const diff = future ? timestamp - Date.now() : Date.now() - timestamp;
  const abs = Math.abs(diff);
  const prefix = future ? "in " : "";
  const suffix = future ? "" : " ago";

  if (abs < 60 * 1000) return "just now";
  if (abs < 60 * 60 * 1000) {
    const m = Math.floor(abs / (60 * 1000));
    return `${prefix}${m}m${suffix}`;
  }
  if (abs < 24 * 60 * 60 * 1000) {
    const h = Math.floor(abs / (60 * 60 * 1000));
    return `${prefix}${h}h${suffix}`;
  }
  const d = Math.floor(abs / (24 * 60 * 60 * 1000));
  return `${prefix}${d}d${suffix}`;
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, CSSProperties> = {
  container: {
    flex: 1,
    overflow: "auto",
    background: colors.bgPage,
    padding: "24px",
  },
  header: {
    marginBottom: "24px",
  },
  title: {
    fontSize: "1.75rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginTop: 0,
    marginBottom: "4px",
  },
  subtitle: {
    fontSize: "1rem",
    color: colors.textSecondary,
    marginTop: 0,
  },
  metricsRow: {
    display: "flex",
    gap: "16px",
    marginBottom: "24px",
    flexWrap: "wrap" as const,
  },
  metric: {
    flex: 1,
    minWidth: 130,
    padding: "16px",
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    textAlign: "center" as const,
  },
  metricValue: {
    fontSize: "2rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginBottom: "4px",
    position: "relative" as const,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  },
  metricLabel: {
    fontSize: "0.8rem",
    color: colors.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  pulseDot: {
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: colors.accentOrange,
    animation: "pulse 2s infinite",
  },

  // Tabs
  tabBar: {
    display: "flex",
    gap: "4px",
    marginBottom: "20px",
    borderBottom: `1px solid ${colors.border}`,
    paddingBottom: 0,
  },
  tabButton: {
    background: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    color: colors.textSecondary,
    fontSize: "0.9rem",
    fontWeight: 500,
    padding: "10px 16px",
    cursor: "pointer",
    transition: "color 0.2s, border-color 0.2s",
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontFamily: "inherit",
  },
  tabButtonActive: {
    color: colors.textPrimary,
    borderBottomColor: colors.accentBlue,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    background: colors.accentOrange,
    color: "#fff",
    fontSize: "0.7rem",
    fontWeight: 700,
    padding: "0 6px",
  },

  // Sections
  section: {
    marginBottom: "32px",
  },
  sectionTitle: {
    fontSize: "1.25rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginTop: 0,
    marginBottom: "16px",
  },

  // Empty state
  emptyState: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    padding: "48px 24px",
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    textAlign: "center" as const,
  },
  emptyIcon: {
    fontSize: "3rem",
    marginBottom: "12px",
  },
  emptyTitle: {
    fontSize: "1.1rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginBottom: "8px",
  },
  emptyDescription: {
    fontSize: "0.9rem",
    color: colors.textSecondary,
    maxWidth: 420,
    lineHeight: 1.5,
  },

  // Timeline
  timeline: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "12px",
  },

  // Decision cards
  decisionCard: {
    padding: "16px 20px",
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderLeft: "4px solid",
    borderRadius: 8,
  },
  decisionHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "10px",
  },
  decisionStatus: {
    fontSize: "0.8rem",
    fontWeight: 700,
    letterSpacing: "0.5px",
  },
  decisionTime: {
    fontSize: "0.75rem",
    color: colors.textMuted,
  },
  decisionTitle: {
    fontSize: "1rem",
    fontWeight: 600,
    color: colors.textPrimary,
    marginBottom: "10px",
    lineHeight: 1.4,
  },
  decisionMeta: {
    display: "flex",
    gap: "8px",
    marginBottom: "10px",
    flexWrap: "wrap" as const,
  },
  metaChip: {
    fontSize: "0.75rem",
    color: colors.textSecondary,
    background: colors.bgHover,
    padding: "3px 10px",
    borderRadius: 12,
    whiteSpace: "nowrap" as const,
  },
  decisionJustification: {
    fontSize: "0.85rem",
    color: colors.textSecondary,
    lineHeight: 1.5,
    marginBottom: "8px",
  },
  decisionReason: {
    fontSize: "0.85rem",
    color: colors.textPrimary,
    lineHeight: 1.5,
    padding: "10px 14px",
    background: colors.bgHover,
    borderRadius: 6,
  },

  // Pending approval actions
  reviewButton: {
    background: colors.accentBlue,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "8px 20px",
    fontSize: "0.85rem",
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 8,
    fontFamily: "inherit",
  },
  actionPanel: {
    marginTop: 12,
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  },
  reasonInput: {
    background: colors.bgPage,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    padding: "8px 12px",
    color: colors.textPrimary,
    fontSize: "0.85rem",
    outline: "none",
    fontFamily: "inherit",
  },
  actionButtons: {
    display: "flex",
    gap: 8,
  },
  approveButton: {
    background: colors.accentGreen,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "8px 18px",
    fontSize: "0.85rem",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  denyButton: {
    background: colors.accentRed,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "8px 18px",
    fontSize: "0.85rem",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  cancelButton: {
    background: "none",
    color: colors.textSecondary,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    padding: "8px 14px",
    fontSize: "0.85rem",
    cursor: "pointer",
    fontFamily: "inherit",
  },

  // Activity list
  activityList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "8px",
  },
  activityCard: {
    padding: "14px 18px",
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
  },
  activityHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "8px",
  },
  activityAction: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: colors.textPrimary,
    display: "flex",
    alignItems: "center",
    gap: 4,
    textTransform: "capitalize" as const,
  },
  activityAgentTag: {
    fontSize: "0.75rem",
    color: colors.accentBlue,
    background: `${colors.accentBlue}15`,
    padding: "2px 8px",
    borderRadius: 10,
    marginLeft: 8,
  },
  activityTime: {
    fontSize: "0.75rem",
    color: colors.textMuted,
  },
  activityDesc: {
    fontSize: "0.85rem",
    color: colors.textSecondary,
    lineHeight: 1.5,
  },
};
