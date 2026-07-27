/**
 * Overview — flagship dashboard (Software Factory v2).
 *
 * Presentation rebuilt against docs/software-factory/UI_STYLE_GUIDE.md.
 * Data layer (Convex queries/mutations) and the public props contract are
 * unchanged from the previous implementation.
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import type { MainView } from "./TopNav";
import { Activity, Plus, X } from "lucide-react";
import { PageHeader } from "./components/factory/DetailLayout";
import { MetricBlock, MetricRow } from "./components/factory/MetricBlock";
import { StatusBadge } from "./components/factory/badges";
import { AttentionQueuePanel } from "@/components/AttentionQueuePanel";
import { FactorySchematicOverview } from "@/components/schematic";
import { TopSessionsCard } from "@/components/dashboard/TopSessionsCard";
import {
  UsageTrendCharts,
  type ChartWindow,
} from "@/components/dashboard/UsageTrendCharts";
import { QuotaFuelGauge } from "@/components/QuotaFuelGauge";
import { cn } from "@/lib/utils";
import {
  buildAttentionItems,
  exceptionCounts,
} from "@/lib/attentionQueue";
import { getOrchestrationBaseUrl } from "@/lib/orchestrationUrl";

interface DashboardOverviewProps {
  projectId: Id<"projects"> | null;
  onClose: () => void;
  onOpenMissionModal?: () => void;
  onOpenSuggestionsDrawer?: () => void;
  onSelectAgent?: (agentId: Id<"agents">) => void;
  onNavigate?: (view: MainView) => void;
  onOpenApprovals?: () => void;
  onOpenCostAnalytics?: () => void;
  onOpenAlertRules?: () => void;
  onTaskSelect?: (taskId: Id<"tasks">) => void;
  onNavigateToGateway?: () => void;
  onOpenCreateTask?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const AGENT_DOT_COLOR: Record<string, string> = {
  ACTIVE: "bg-ok",
  PAUSED: "bg-warn",
  DRAINED: "bg-warn",
  QUARANTINED: "bg-err",
  OFFLINE: "bg-ink-muted",
};

const SECONDARY_BUTTON =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[12.5px] font-medium text-ink-secondary transition-colors duration-150 hover:border-line-strong hover:text-ink";

const CARD_CLASS = "rounded-xl border border-line bg-surface-1";

function SectionTitle({ children }: { children: React.ReactNode }): JSX.Element {
  return <h2 className="text-[15px] font-semibold text-ink">{children}</h2>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mission card (north star, flat)
// ─────────────────────────────────────────────────────────────────────────────

function MissionCard({
  missionStatement,
  onEdit,
  onOpenSuggestions,
}: {
  missionStatement?: string;
  onEdit?: () => void;
  onOpenSuggestions?: () => void;
}): JSX.Element {
  return (
    <section className={cn(CARD_CLASS, "p-4")}>
      <div className="flex items-start justify-between gap-3">
        <SectionTitle>Mission</SectionTitle>
        <div className="flex items-center gap-2">
          {onOpenSuggestions && (
            <button type="button" className={SECONDARY_BUTTON} onClick={onOpenSuggestions}>
              Suggestions
            </button>
          )}
          {onEdit && (
            <button type="button" className={SECONDARY_BUTTON} onClick={onEdit}>
              Edit
            </button>
          )}
        </div>
      </div>
      <p
        className={cn(
          "mt-3 text-[13.5px] leading-relaxed",
          missionStatement ? "text-ink-secondary" : "text-ink-muted"
        )}
      >
        {missionStatement?.trim() ||
          "No mission statement yet. Define the north star so agents and operators pull in the same direction."}
      </p>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// System status card
// ─────────────────────────────────────────────────────────────────────────────

interface StatusRow {
  label: string;
  value: React.ReactNode;
}

function SystemStatusCard({
  healthy,
  rows,
  onOpenSystem,
}: {
  healthy: boolean;
  rows: StatusRow[];
  onOpenSystem?: () => void;
}): JSX.Element {
  return (
    <section className={cn(CARD_CLASS, "p-4")}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={cn("h-1.5 w-1.5 rounded-full", healthy ? "bg-ok" : "bg-warn")}
            aria-hidden
          />
          <SectionTitle>System status</SectionTitle>
        </div>
        {onOpenSystem && (
          <button type="button" className={SECONDARY_BUTTON} onClick={onOpenSystem}>
            System
          </button>
        )}
      </div>
      <dl className="mt-3 flex flex-col divide-y divide-line">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 py-2.5">
            <dt className="text-[12.5px] text-ink-muted">{row.label}</dt>
            <dd className="text-[13px] text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Agents card (compact working list)
// ─────────────────────────────────────────────────────────────────────────────

function AgentsCard({
  agents,
  tasks,
  onSelectAgent,
  onViewAll,
}: {
  agents: Doc<"agents">[];
  tasks: Doc<"tasks">[];
  onSelectAgent?: (agentId: Id<"agents">) => void;
  onViewAll?: () => void;
}): JSX.Element | null {
  if (agents.length === 0) return null;
  const sorted = [...agents].sort((a, b) =>
    a.status === b.status ? 0 : a.status === "ACTIVE" ? -1 : 1
  );
  return (
    <section className={CARD_CLASS}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <SectionTitle>Agents</SectionTitle>
        {onViewAll && (
          <button type="button" className={SECONDARY_BUTTON} onClick={onViewAll}>
            View all
          </button>
        )}
      </div>
      <ul>
        {sorted.slice(0, 6).map((agent) => {
          const currentTask = agent.currentTaskId
            ? tasks.find((t) => t._id === agent.currentTaskId) ?? null
            : null;
          return (
            <li key={agent._id} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={onSelectAgent ? () => onSelectAgent(agent._id) : undefined}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150",
                  onSelectAgent ? "hover:bg-surface-2" : "cursor-default"
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    AGENT_DOT_COLOR[agent.status] ?? "bg-ink-muted"
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">
                    {agent.name}
                  </span>
                  <span className="block truncate text-[12px] text-ink-muted">
                    {currentTask
                      ? currentTask.title
                      : agent.status === "ACTIVE"
                        ? "Idle"
                        : agent.status.toLowerCase()}
                  </span>
                </span>
                {agent.lastHeartbeatAt && (
                  <span className="shrink-0 text-[11.5px] text-ink-muted">
                    {formatRelativeTime(agent.lastHeartbeatAt)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup checklist (dismissable, plain bordered list)
// ─────────────────────────────────────────────────────────────────────────────

interface ChecklistItem {
  id: string;
  label: string;
  detail: string;
  done: boolean;
  actionLabel: string;
  onClick?: () => void;
}

function SetupChecklist({
  items,
  onDismiss,
}: {
  items: ChecklistItem[];
  onDismiss: () => void;
}): JSX.Element {
  return (
    <section className={CARD_CLASS}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <SectionTitle>Setup checklist</SectionTitle>
        <button
          type="button"
          aria-label="Dismiss setup checklist"
          onClick={onDismiss}
          className="rounded-md p-1 text-ink-muted transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>
      <ul>
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0"
          >
            <span
              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", item.done ? "bg-ok" : "bg-warn")}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-ink">{item.label}</div>
              <div className="mt-0.5 text-[12.5px] text-ink-muted">{item.detail}</div>
            </div>
            {item.onClick && (
              <button type="button" className={SECONDARY_BUTTON} onClick={item.onClick}>
                {item.actionLabel}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Recent activity strip
// ─────────────────────────────────────────────────────────────────────────────

function RecentActivityCard({ activities }: { activities: Doc<"activities">[] }): JSX.Element {
  return (
    <section className={CARD_CLASS}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <SectionTitle>Recent activity</SectionTitle>
      </div>
      {activities.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <Activity size={16} strokeWidth={1.75} className="mx-auto mb-2 text-ink-muted" aria-hidden />
          <p className="text-[13px] text-ink-muted">No recent activity</p>
        </div>
      ) : (
        <ul className="max-h-[320px] overflow-y-auto">
          {activities.slice(0, 12).map((activity) => (
            <li
              key={activity._id}
              className="flex items-start gap-3 border-b border-line px-4 py-2.5 last:border-b-0"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-ink-secondary">{activity.description}</p>
                <p className="mt-0.5 text-[11.5px] text-ink-muted">
                  {activity.actorType} · {formatRelativeTime(activity._creationTime)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function DashboardOverview({
  projectId,
  onOpenMissionModal,
  onOpenSuggestionsDrawer,
  onSelectAgent,
  onNavigate,
  onOpenApprovals,
  onOpenCostAnalytics,
  onOpenAlertRules,
  onTaskSelect,
  onNavigateToGateway,
  onOpenCreateTask,
}: DashboardOverviewProps): JSX.Element {
  const [gatewayConfigured, setGatewayConfigured] = useState<boolean | null>(null);
  const [quickStartDismissed, setQuickStartDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("mc.quickstart.dismissed") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let cancelled = false;
    const base = getOrchestrationBaseUrl();
    fetch(base ? `${base}/gateway/status` : "/gateway/status")
      .then((r) => r.json())
      .then((data: { configured?: boolean; urlConfigured?: boolean; tokenConfigured?: boolean }) => {
        if (!cancelled)
          setGatewayConfigured(Boolean(data.configured ?? (data.urlConfigured && data.tokenConfigured)));
      })
      .catch(() => {
        if (!cancelled) setGatewayConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Data layer (unchanged) ────────────────────────────────────────────────
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const tasks = useQuery(api.tasks.listAll, projectId ? { projectId } : {});
  const scheduledJobs = useQuery(api.scheduledJobs.list, projectId ? { projectId } : {});
  const approvals = useQuery(api.approvals.listPending, projectId ? { projectId, limit: 100 } : { limit: 100 });
  const openAlerts = useQuery(api.alerts.listOpen, { limit: 10 });
  const activities = useQuery(api.activities.listRecent, projectId ? { projectId, limit: 12 } : { limit: 12 });
  const missionData = useQuery(api.mission.getMission, projectId ? { projectId } : {});
  const usageByModel = useQuery(api.runs.getUsageByModel, projectId ? { projectId, windowHours: 24 } : { windowHours: 24 });
  const [chartWindowHours, setChartWindowHours] = useState<ChartWindow>(24);
  const usageTimeSeries = useQuery(
    api.runs.getUsageTimeSeries,
    projectId
      ? {
          projectId,
          windowHours: chartWindowHours,
          bucketHours: chartWindowHours === 24 ? 1 : chartWindowHours === 168 ? 24 : 24,
        }
      : {
          windowHours: chartWindowHours,
          bucketHours: chartWindowHours === 24 ? 1 : chartWindowHours === 168 ? 24 : 24,
        }
  );
  const topRuns = useQuery(
    api.runs.getTopRunsByTokens,
    projectId
      ? { projectId, limit: 5, windowHours: chartWindowHours }
      : { limit: 5, windowHours: chartWindowHours },
  );
  // Retained mutation (squad deploy flows re-attach here); intentionally unused in v2 render.
  const deploySquad = useMutation(api.squad.deploySquad);
  const approveApproval = useMutation(api.approvals.approve);
  const transitionTask = useMutation(api.tasks.transition);
  void deploySquad;

  const isLoading = !agents || !tasks || !approvals || !activities;

  if (isLoading) {
    return (
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
        <PageHeader
          title="Overview"
          description="Exceptions, approvals, and proof of completion — then fleet context."
        />
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 py-6">
          <div className="h-48 animate-pulse rounded-xl border border-line bg-surface-2" />
          <div className="flex gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-12 w-28 animate-pulse rounded-lg bg-surface-2" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="h-64 animate-pulse rounded-xl bg-surface-2" />
            <div className="flex flex-col gap-4">
              <div className="h-28 animate-pulse rounded-xl bg-surface-2" />
              <div className="h-28 animate-pulse rounded-xl bg-surface-2" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ── Computed metrics ──────────────────────────────────────────────────────
  const activeAgents = agents.filter((a) => a.status === "ACTIVE").length;
  const pausedAgents = agents.filter((a) => a.status === "PAUSED").length;
  const quarantinedAgents = agents.filter((a) => a.status === "QUARANTINED").length;
  const inProgressTasks = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const doneTasks = tasks.filter((t) => t.status === "DONE").length;
  const blockedTasks = tasks.filter((t) => t.status === "BLOCKED").length;
  const failedTasks = tasks.filter((t) => t.status === "FAILED").length;
  const inboxTasks = tasks.filter((t) => t.status === "INBOX").length;
  const needsApprovalTasks = tasks.filter((t) => t.status === "NEEDS_APPROVAL");
  const completionRate = ((doneTasks / Math.max(tasks.length, 1)) * 100).toFixed(0);
  const spend24h = usageByModel?.reduce((sum, m) => sum + (m.costUsd ?? 0), 0);

  const alertsList = openAlerts ?? [];
  const blockedTasksList = tasks.filter((t) => t.status === "BLOCKED");
  const failedTasksList = tasks.filter((t) => t.status === "FAILED");
  const scannedAt = Date.now();

  const openTask = (taskId: Id<"tasks">) => {
    onTaskSelect?.(taskId);
    onNavigate?.("tasks");
  };

  const openRun = (run: Doc<"runs">) => {
    if (run.taskId) {
      openTask(run.taskId);
      return;
    }
    onSelectAgent?.(run.agentId);
    onNavigate?.("live-chat");
  };

  const chartWindowLabel =
    chartWindowHours === 24 ? "24h" : chartWindowHours === 168 ? "7d" : "30d";

  const attentionItems = buildAttentionItems({
    approvals,
    blockedTasks: blockedTasksList,
    needsApprovalTasks,
    failedTasks: failedTasksList,
    alerts: alertsList,
    openApproval: () => onOpenApprovals?.(),
    openTask,
    openApprovalsModal: onOpenApprovals,
    openAlertRules: onOpenAlertRules,
    approveApproval: async (approvalId) => {
      await approveApproval({
        approvalId,
        decidedByUserId: "operator",
        reason: "Approved from Overview",
      });
    },
    unblockTask: async (taskId) => {
      await transitionTask({
        taskId,
        toStatus: "ASSIGNED",
        actorType: "HUMAN",
        actorUserId: "operator",
        reason: "Unblocked from Overview",
        idempotencyKey: `overview-unblock-${taskId}-${Date.now()}`,
      });
    },
  });

  const exceptions = exceptionCounts({
    approvals,
    blockedTasks: blockedTasksList,
    failedTasks: failedTasksList,
    alerts: alertsList,
  });

  const healthy =
    quarantinedAgents === 0 && failedTasks === 0 && blockedTasks === 0 && approvals.length === 0;

  const now = Date.now();
  const nextJob = (scheduledJobs ?? [])
    .filter((j) => j.nextRun != null && j.nextRun >= now)
    .sort((a, b) => (a.nextRun ?? 0) - (b.nextRun ?? 0))[0];

  const statusRows: StatusRow[] = [
    {
      label: "Gateway",
      value:
        gatewayConfigured == null ? (
          <span className="text-ink-muted">Checking…</span>
        ) : gatewayConfigured ? (
          <StatusBadge tone="success">Connected</StatusBadge>
        ) : (
          <button
            type="button"
            onClick={onNavigateToGateway}
            className="text-[13px] text-warn underline-offset-2 hover:underline"
          >
            Not configured
          </button>
        ),
    },
    {
      label: "Agents",
      value: `${activeAgents} active / ${agents.length}${quarantinedAgents > 0 ? ` · ${quarantinedAgents} quarantined` : ""}`,
    },
    { label: "Failed tasks", value: failedTasks > 0 ? <StatusBadge tone="error">{failedTasks}</StatusBadge> : "0" },
    { label: "Inbox", value: inboxTasks },
    {
      label: "Next scheduled job",
      value: nextJob
        ? `${nextJob.name} · ${new Date(nextJob.nextRun ?? 0).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}`
        : "None",
    },
  ];

  const checklistItems: ChecklistItem[] = [
    {
      id: "gateway",
      label: "Gateway connected",
      detail: gatewayConfigured
        ? "Live streaming and chat are available."
        : "Streaming is not configured yet.",
      done: Boolean(gatewayConfigured),
      actionLabel: gatewayConfigured ? "Review" : "Connect",
      onClick: gatewayConfigured ? () => onNavigate?.("gateway") : onNavigateToGateway,
    },
    {
      id: "fleet",
      label: "Agents online",
      detail:
        activeAgents > 0
          ? `${activeAgents} live agent${activeAgents === 1 ? "" : "s"} available.`
          : "No live agents are currently reporting in.",
      done: activeAgents > 0,
      actionLabel: "Open agents",
      onClick: () => onNavigate?.("agents"),
    },
    {
      id: "queue",
      label: "Task queue seeded",
      detail:
        tasks.length > 0
          ? `${tasks.length} task${tasks.length === 1 ? "" : "s"} in the system.`
          : "No tasks are queued right now.",
      done: tasks.length > 0,
      actionLabel: tasks.length > 0 ? "Open tasks" : "Create task",
      onClick: tasks.length > 0 ? () => onNavigate?.("tasks") : onOpenCreateTask,
    },
  ];

  const showQuickStart =
    !quickStartDismissed &&
    (gatewayConfigured === false || agents.length === 0 || tasks.length === 0);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-6 py-6 xl:px-8">
        {onOpenCreateTask && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onOpenCreateTask}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-act px-3 text-[13px] font-medium text-act-ink transition-opacity duration-150 hover:opacity-90"
            >
              <Plus size={14} strokeWidth={1.75} aria-hidden />
              New task
            </button>
          </div>
        )}

        {onNavigate && (
          <FactorySchematicOverview
            onNavigate={(view) => onNavigate(view as MainView)}
            projectId={projectId}
            scannedAt={scannedAt}
          />
        )}

        <AttentionQueuePanel
          items={attentionItems}
          scannedAt={scannedAt}
          counts={exceptions}
          onOpenApprovals={onOpenApprovals}
          onOpenTasks={onNavigate ? () => onNavigate("tasks") : undefined}
          onOpenAlerts={onOpenAlertRules}
        />

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-6">
            {usageTimeSeries && (
              <UsageTrendCharts
                series={usageTimeSeries}
                windowHours={chartWindowHours}
                onWindowChange={setChartWindowHours}
                onOpenCostAnalytics={onOpenCostAnalytics}
                secondaryButtonClass={SECONDARY_BUTTON}
              />
            )}
            {topRuns && topRuns.length > 0 && (
              <TopSessionsCard
                runs={topRuns}
                agents={agents}
                windowLabel={chartWindowLabel}
                onOpenRun={openRun}
                onViewAll={onOpenCostAnalytics ?? (onNavigate ? () => onNavigate("telemetry") : undefined)}
              />
            )}
            <RecentActivityCard activities={activities} />
          </div>
          <div className="flex flex-col gap-4">
            <MissionCard
              missionStatement={missionData?.missionStatement}
              onEdit={onOpenMissionModal}
              onOpenSuggestions={onOpenSuggestionsDrawer}
            />
            <SystemStatusCard
              healthy={healthy}
              rows={statusRows}
              onOpenSystem={onNavigate ? () => onNavigate("system") : undefined}
            />
            <QuotaFuelGauge />
            <AgentsCard
              agents={agents}
              tasks={tasks}
              onSelectAgent={onSelectAgent}
              onViewAll={onNavigate ? () => onNavigate("agents") : undefined}
            />
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-[13px] font-medium uppercase tracking-[0.06em] text-ink-muted">
            Fleet snapshot
          </h2>
          <MetricRow className="xl:grid-cols-6">
            <MetricBlock
              label="Agents working"
              value={activeAgents}
              detail={`${agents.length} total${pausedAgents > 0 ? ` · ${pausedAgents} paused` : ""}${quarantinedAgents > 0 ? ` · ${quarantinedAgents} quarantined` : ""}`}
            />
            <MetricBlock
              label="In progress"
              value={inProgressTasks}
              detail={`${tasks.length} tasks · ${inboxTasks} in inbox`}
            />
            <MetricBlock
              label="Pending approvals"
              value={approvals.length}
              adornment={
                approvals.length > 0 ? <StatusBadge tone="warning">Action</StatusBadge> : undefined
              }
              detail={approvals.length > 0 ? "Human review required" : "All clear"}
            />
            <MetricBlock
              label="Blocked"
              value={blockedTasks}
              adornment={
                blockedTasks > 0 ? <StatusBadge tone="warning">Stalled</StatusBadge> : undefined
              }
              detail={blockedTasks > 0 ? "Needs operator action" : "No blockers"}
            />
            <MetricBlock
              label="Spend (24h)"
              value={spend24h != null ? `$${spend24h.toFixed(2)}` : "—"}
              detail="Across all models"
            />
            <MetricBlock
              label="Completed"
              value={doneTasks}
              detail={`${completionRate}% completion rate`}
            />
          </MetricRow>
        </div>

        {showQuickStart && (
          <SetupChecklist
            items={checklistItems}
            onDismiss={() => {
              setQuickStartDismissed(true);
              try {
                localStorage.setItem("mc.quickstart.dismissed", "1");
              } catch {
                // localStorage unavailable — dismiss for this session only
              }
            }}
          />
        )}

      </div>
    </main>
  );
}
