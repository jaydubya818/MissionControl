import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";

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
      <main className="flex-1 overflow-auto bg-background p-6">
        <div className="mb-6">
          <h1 className="mb-1 text-3xl font-semibold text-foreground">Council</h1>
          <p className="mt-0 text-base text-muted-foreground">Loading...</p>
        </div>
      </main>
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
    <main className="flex-1 overflow-auto bg-background p-6">
      <div className="mb-6">
        <h1 className="mb-1 text-3xl font-semibold text-foreground">Council</h1>
        <p className="mt-0 text-base text-muted-foreground">
          Multi-agent decision-making and consensus visualization
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-4">
        <MetricCard
          value={decisions.length}
          label="Decisions Made"
          colorClass="text-primary"
        />
        <MetricCard
          value={decisions.filter((d) => d.status === "APPROVED").length}
          label="Approved"
          colorClass="text-emerald-500"
        />
        <MetricCard
          value={decisions.filter((d) => d.status === "DENIED").length}
          label="Denied"
          colorClass="text-red-500"
        />
        <MetricCard
          value={pending.length}
          label="Awaiting Decision"
          colorClass={pending.length > 0 ? "text-amber-500" : "text-muted-foreground"}
          pulse={pending.length > 0}
        />
        <MetricCard
          value={coordinatorActivities.length}
          label="Coordinator Actions"
          colorClass="text-blue-400"
        />
      </div>

      <div className="mb-5 flex gap-1 border-b border-border">
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
              icon="🏛️"
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
              icon="✅"
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
              icon="🤖"
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
    </main>
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
    <div className="min-w-[130px] flex-1 rounded-lg border border-border bg-card p-4 text-center">
      <div
        className={cn(
          "relative mb-1 inline-flex items-center gap-1.5 text-3xl font-semibold",
          value > 0 ? colorClass : "text-muted-foreground"
        )}
      >
        {value}
        {pulse && (
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
        )}
      </div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
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
      className={cn(
        "flex items-center gap-2 border-b-2 border-transparent bg-transparent px-4 py-2.5 font-[inherit] text-sm font-medium text-muted-foreground transition-colors",
        active && "border-b-primary text-foreground"
      )}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[0.7rem] font-bold text-white">
          {badge}
        </span>
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
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-12 text-center">
      <div className="mb-3 text-5xl">{icon}</div>
      <div className="mb-2 text-lg font-semibold text-foreground">{title}</div>
      <div className="max-w-[420px] text-sm leading-relaxed text-muted-foreground">
        {description}
      </div>
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
      className={cn(
        "rounded-lg border border-border bg-card px-5 py-4 border-l-4",
        isApproved ? "border-l-emerald-500" : "border-l-red-500"
      )}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <div
          className={cn(
            "text-xs font-bold tracking-wide",
            isApproved ? "text-emerald-500" : "text-red-500"
          )}
        >
          {isApproved ? "✓ APPROVED" : "✗ DENIED"}
        </div>
        <div className="text-xs text-muted-foreground/70">
          {decision.decidedAt
            ? formatTimeAgo(decision.decidedAt)
            : "Pending"}
        </div>
      </div>

      <div className="mb-2.5 text-base font-semibold leading-snug text-foreground">
        {decision.actionSummary}
      </div>

      <div className="mb-2.5 flex flex-wrap gap-2">
        <span className="whitespace-nowrap rounded-xl bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
          {requestor ? `${requestor.emoji || "🤖"} ${requestor.name}` : "Unknown agent"}
        </span>
        <span
          className={cn(
            "whitespace-nowrap rounded-xl px-2.5 py-0.5 text-xs",
            decision.riskLevel === "RED"
              ? "bg-red-500/10 text-red-500"
              : "bg-amber-500/10 text-amber-500"
          )}
        >
          {decision.riskLevel === "RED" ? "🔴" : "🟡"} {decision.riskLevel}
        </span>
        <span className="whitespace-nowrap rounded-xl bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
          {decision.actionType}
        </span>
        {decision.estimatedCost !== undefined && (
          <span className="whitespace-nowrap rounded-xl bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
            ${decision.estimatedCost.toFixed(2)}
          </span>
        )}
      </div>

      {decision.justification && (
        <div className="mb-2 text-sm leading-relaxed text-muted-foreground">
          <strong>Justification:</strong> {decision.justification}
        </div>
      )}

      {decision.decisionReason && (
        <div className="rounded-md bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-foreground">
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
  const isExpiringSoon = timeLeft < 30 * 60 * 1000;

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
    <div className="rounded-lg border border-border border-l-4 border-l-amber-500 bg-card px-5 py-4">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="text-xs font-bold tracking-wide text-amber-500">
          ⏳ AWAITING DECISION
        </div>
        <div
          className={cn(
            "text-xs",
            isExpiringSoon ? "text-red-500" : "text-muted-foreground/70"
          )}
        >
          {isExpiringSoon ? "⚠️ " : ""}
          Expires {formatTimeAgo(approval.expiresAt, true)}
        </div>
      </div>

      <div className="mb-2.5 text-base font-semibold leading-snug text-foreground">
        {approval.actionSummary}
      </div>

      <div className="mb-2.5 flex flex-wrap gap-2">
        <span className="whitespace-nowrap rounded-xl bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
          {requestor ? `${requestor.emoji || "🤖"} ${requestor.name}` : "Unknown agent"}
        </span>
        <span
          className={cn(
            "whitespace-nowrap rounded-xl px-2.5 py-0.5 text-xs",
            approval.riskLevel === "RED"
              ? "bg-red-500/10 text-red-500"
              : "bg-amber-500/10 text-amber-500"
          )}
        >
          {approval.riskLevel === "RED" ? "🔴" : "🟡"} {approval.riskLevel}
        </span>
        <span className="whitespace-nowrap rounded-xl bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
          {approval.actionType}
        </span>
        {approval.estimatedCost !== undefined && (
          <span className="whitespace-nowrap rounded-xl bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
            ${approval.estimatedCost.toFixed(2)}
          </span>
        )}
      </div>

      <div className="mb-2 text-sm leading-relaxed text-muted-foreground">
        <strong>Justification:</strong> {approval.justification}
      </div>

      {!showActions ? (
        <button
          onClick={() => setShowActions(true)}
          className="mt-2 rounded-md bg-primary px-5 py-2 font-[inherit] text-sm font-semibold text-white"
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
            className="rounded-md border border-border bg-background px-3 py-2 font-[inherit] text-sm text-foreground outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleApprove}
              disabled={isActing}
              className="rounded-md bg-emerald-500 px-4.5 py-2 font-[inherit] text-sm font-semibold text-white"
            >
              {isActing ? "..." : "✓ Approve"}
            </button>
            <button
              onClick={handleDeny}
              disabled={isActing || !reason.trim()}
              className={cn(
                "rounded-md bg-red-500 px-4.5 py-2 font-[inherit] text-sm font-semibold text-white",
                !reason.trim() && "opacity-50"
              )}
            >
              {isActing ? "..." : "✗ Deny"}
            </button>
            <button
              onClick={() => setShowActions(false)}
              className="rounded-md border border-border bg-transparent px-3.5 py-2 font-[inherit] text-sm text-muted-foreground"
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
    <div className="rounded-lg border border-border bg-card px-4.5 py-3.5">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1 text-sm font-semibold capitalize text-foreground">
          <span className="mr-1.5">{icon}</span>
          {actionLabel}
          {relatedAgent && (
            <span className="ml-2 rounded-xl bg-primary/10 px-2 py-0.5 text-xs text-primary">
              {relatedAgent.emoji || "🤖"} {relatedAgent.name}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground/70">
          {formatTimeAgo(activity._creationTime)}
        </div>
      </div>
      <div className="text-sm leading-relaxed text-muted-foreground">
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
