import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { PageHeader } from "./components/PageHeader";
import { StatusBadge, RiskBadge, type RiskLevel } from "./components/factory/badges";
import { EmptyState } from "./components/ui/empty-state";
import { Bot, CheckCircle2, Landmark } from "lucide-react";

interface CouncilViewProps {
  projectId: Id<"projects"> | null;
}

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

  if (approvals === undefined || activities === undefined || agents === undefined) {
    return (
      <section className="flex-1 overflow-auto bg-app p-6">
        <div className="mb-6">
          <h1 className="mb-1 text-[26px] font-semibold leading-tight tracking-tight text-ink">Council</h1>
          <div className="mt-3 space-y-3">
            <div className="h-16 animate-pulse rounded-xl bg-surface-2" />
            <div className="h-40 animate-pulse rounded-xl bg-surface-2" />
          </div>
        </div>
      </section>
    );
  }

  const agentMap = new Map<string, Doc<"agents">>();
  for (const a of agents ?? []) {
    agentMap.set(a._id, a);
  }

  const decisions = approvals.filter(
    (a) => a.status === "APPROVED" || a.status === "DENIED"
  );

  const coordinatorActivities = activities.filter(
    (a) => a.actorType === "SYSTEM" && a.action.includes("COORDINATOR")
  );

  const pending = pendingApprovals ?? [];

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
      <PageHeader
        title="Council"
        description={
          pending.length > 0
            ? `${decisions.length} decisions · ${pending.length} awaiting your decision`
            : "Multi-agent decision-making and consensus visualization."
        }
      />

      <div className="px-6 pb-6">
      <div className="py-4 flex flex-wrap gap-4">
        <MetricCard
          value={decisions.length}
          label="Decisions Made"
          colorClass="text-ink"
        />
        <MetricCard
          value={decisions.filter((d) => d.status === "APPROVED").length}
          label="Approved"
          colorClass="text-ok"
        />
        <MetricCard
          value={decisions.filter((d) => d.status === "DENIED").length}
          label="Denied"
          colorClass="text-err"
        />
        <MetricCard
          value={pending.length}
          label="Awaiting Decision"
          colorClass={pending.length > 0 ? "text-warn" : "text-ink-muted"}
          pulse={pending.length > 0}
        />
        <MetricCard
          value={coordinatorActivities.length}
          label="Coordinator Actions"
          colorClass="text-ink"
        />
      </div>

      <div className="mb-5 flex gap-1 border-b border-line pt-1" role="tablist">
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

      {activeTab === "decisions" && (
        <div className="mb-8">
          {decisions.length === 0 ? (
            <EmptyState
              icon={Landmark}
              title="No decisions yet"
              description="When agents request approval for risky actions (YELLOW/RED risk level), decisions will appear here after they are approved or denied."
            />
          ) : (
            <div className="flex flex-col gap-3">
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
        <div className="mb-8">
          {pending.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No pending approvals"
              description="All clear! No agents are currently waiting for approval to proceed."
            />
          ) : (
            <div className="flex flex-col gap-3">
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
        <div className="mb-8">
          {coordinatorActivities.length === 0 ? (
            <EmptyState
              icon={Bot}
              title="No coordinator activity"
              description="The coordinator handles task decomposition, agent delegation, conflict resolution, and loop detection. Activity will appear here as the system orchestrates work."
            />
          ) : (
            <div className="flex flex-col gap-2">
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
      </div>
    </section>
  );
}

function MetricCard({
  value,
  label,
  colorClass,
  pulse,
}: {
  value: number;
  label: string;
  colorClass: string;
  pulse?: boolean;
}) {
  return (
    <div className="min-w-[130px] flex-1 rounded-xl border border-line bg-surface-1 p-4 text-center">
      <div
        className={cn(
          "relative mb-1.5 inline-flex items-center gap-1.5 text-[20px] font-semibold leading-none",
          value > 0 ? colorClass : "text-ink-muted"
        )}
      >
        {value}
        {pulse && (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-warn" />
        )}
      </div>
      <div className="text-[12.5px] text-ink-muted">
        {label}
      </div>
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
      role="tab"
      aria-selected={active}
      className={cn(
        "flex items-center gap-2 border-b-2 border-transparent bg-transparent px-4 py-2.5 font-[inherit] text-[13px] font-medium text-ink-muted transition-colors duration-150 hover:text-ink-secondary",
        active && "border-b-act text-ink"
      )}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md bg-warn-soft px-1.5 text-[11px] font-medium text-warn">
          {badge}
        </span>
      )}
    </button>
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
    <div className="rounded-xl border border-line bg-surface-1 px-5 py-4 transition-colors duration-150 hover:border-line-strong">
      <div className="mb-2.5 flex items-center justify-between">
        <StatusBadge tone={isApproved ? "success" : "error"}>
          {isApproved ? "APPROVED" : "DENIED"}
        </StatusBadge>
        <div className="text-[12.5px] text-ink-muted">
          {decision.decidedAt
            ? formatTimeAgo(decision.decidedAt)
            : "Pending"}
        </div>
      </div>

      <div className="mb-2.5 text-[15px] font-semibold leading-snug text-ink">
        {decision.actionSummary}
      </div>

      <div className="mb-2.5 flex flex-wrap gap-2">
        <StatusBadge tone="neutral" className="whitespace-nowrap">
          {requestor ? `${requestor.emoji ? `${requestor.emoji} ` : ""}${requestor.name}` : "Unknown agent"}
        </StatusBadge>
        <RiskBadge level={decision.riskLevel as RiskLevel} className="whitespace-nowrap" />
        <StatusBadge tone="neutral" className="whitespace-nowrap">
          {decision.actionType}
        </StatusBadge>
        {decision.estimatedCost !== undefined && (
          <StatusBadge tone="neutral" className="whitespace-nowrap font-mono">
            ${decision.estimatedCost.toFixed(2)}
          </StatusBadge>
        )}
      </div>

      {decision.justification && (
        <div className="mb-2 text-[13.5px] leading-relaxed text-ink-secondary">
          <strong className="text-ink">Justification:</strong> {decision.justification}
        </div>
      )}

      {decision.decisionReason && (
        <div className="rounded-lg border border-line bg-surface-2 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink">
          <strong>
            {decider
              ? `${decider.emoji ? `${decider.emoji} ` : ""}${decider.name}`
              : decision.decidedByUserId
                ? decision.decidedByUserId
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
  const isExpiringSoon = timeLeft < 30 * 60 * 1000;

  const handleApprove = async () => {
    setIsActing(true);
    try {
      await approveMutation({
        approvalId: approval._id,
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
        reason,
      });
    } finally {
      setIsActing(false);
      setShowActions(false);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-surface-1 px-5 py-4">
      <div className="mb-2.5 flex items-center justify-between">
        <StatusBadge tone="warning">AWAITING DECISION</StatusBadge>
        <div
          className={cn(
            "text-[12.5px]",
            isExpiringSoon ? "text-err" : "text-ink-muted"
          )}
        >
          Expires {formatTimeAgo(approval.expiresAt, true)}
        </div>
      </div>

      <div className="mb-2.5 text-[15px] font-semibold leading-snug text-ink">
        {approval.actionSummary}
      </div>

      <div className="mb-2.5 flex flex-wrap gap-2">
        <StatusBadge tone="neutral" className="whitespace-nowrap">
          {requestor ? `${requestor.emoji ? `${requestor.emoji} ` : ""}${requestor.name}` : "Unknown agent"}
        </StatusBadge>
        <RiskBadge level={approval.riskLevel as RiskLevel} className="whitespace-nowrap" />
        <StatusBadge tone="neutral" className="whitespace-nowrap">
          {approval.actionType}
        </StatusBadge>
        {approval.estimatedCost !== undefined && (
          <StatusBadge tone="neutral" className="whitespace-nowrap font-mono">
            ${approval.estimatedCost.toFixed(2)}
          </StatusBadge>
        )}
      </div>

      <div className="mb-2 text-[13.5px] leading-relaxed text-ink-secondary">
        <strong className="text-ink">Justification:</strong> {approval.justification}
      </div>

      {!showActions ? (
        <button
          onClick={() => setShowActions(true)}
          className="mt-2 h-9 rounded-lg bg-act px-3 font-[inherit] text-[13px] font-medium text-act-ink transition-opacity duration-150 hover:opacity-90"
        >
          Review &amp; Decide
        </button>
      ) : (
        <div className="mt-3 flex flex-col gap-2.5">
          <input
            type="text"
            placeholder="Reason (required for deny, optional for approve)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-9 rounded-lg border border-line bg-surface-1 px-3 font-[inherit] text-[13.5px] text-ink placeholder:text-ink-muted"
          />
          <div className="flex gap-2">
            <button
              onClick={handleApprove}
              disabled={isActing}
              className="h-9 rounded-lg bg-act px-3 font-[inherit] text-[13px] font-medium text-act-ink transition-opacity duration-150 hover:opacity-90 disabled:opacity-50"
            >
              {isActing ? "..." : "Approve"}
            </button>
            <button
              onClick={handleDeny}
              disabled={isActing || !reason.trim()}
              className={cn(
                "h-9 rounded-lg bg-err-soft px-3 font-[inherit] text-[13px] font-medium text-err transition-opacity duration-150 hover:opacity-90",
                !reason.trim() && "opacity-50"
              )}
            >
              {isActing ? "..." : "Deny"}
            </button>
            <button
              onClick={() => setShowActions(false)}
              className="h-9 rounded-lg border border-line bg-transparent px-3 font-[inherit] text-[13px] text-ink-secondary transition-colors duration-150 hover:border-line-strong hover:text-ink"
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
  const actionLabel = activity.action
    .replace("COORDINATOR_", "")
    .replace(/_/g, " ");

  const relatedAgent = activity.agentId
    ? agentMap.get(activity.agentId)
    : undefined;

  return (
    <div className="rounded-xl border border-line bg-surface-1 px-4 py-3.5 transition-colors duration-150 hover:border-line-strong">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1 text-[13.5px] font-semibold capitalize text-ink">
          {actionLabel}
          {relatedAgent && (
            <StatusBadge tone="neutral" className="ml-2">
              {relatedAgent.emoji ? `${relatedAgent.emoji} ` : ""}{relatedAgent.name}
            </StatusBadge>
          )}
        </div>
        <div className="text-[12.5px] text-ink-muted">
          {formatTimeAgo(activity._creationTime)}
        </div>
      </div>
      <div className="text-[13.5px] leading-relaxed text-ink-secondary">
        {activity.description}
      </div>
    </div>
  );
}

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
