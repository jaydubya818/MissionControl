/**
 * EOS Command Center — causal system of record and operating control plane.
 *
 * Composition: demo-provenance projections (health band, insights, mission
 * portfolio from demoData) beside live Convex data (attention queue, factory
 * activity, workforce, capacity). Every demo-sourced element renders its
 * ProvenanceBadge; Convex data renders none (see src/eos/types.ts).
 */

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Doc } from "../../../../../convex/_generated/dataModel";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  ListTodo,
  Play,
  Plus,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "../../components/factory/DetailLayout";
import { StatusBadge, RiskBadge } from "../../components/factory/badges";
import { EmptyState } from "../../components/ui/empty-state";
import { QuotaFuelGauge } from "../../components/QuotaFuelGauge";
import { cn } from "../../lib/utils";
import { getOrchestrationBaseUrl } from "../../lib/orchestrationUrl";
import {
  EosSection,
  HealthSignalCard,
  InsightCard,
  ProvenanceBadge,
} from "../components";
import { demoHealthSignals, demoInsights, demoMission } from "../demoData";
import type { HealthStatus, MissionSummary } from "../types";

export interface CommandCenterViewProps {
  onNavigate: (view: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Local helpers (copied from DashboardOverview per style-guide convention)
// ─────────────────────────────────────────────────────────────────────────────

const CARD_CLASS = "rounded-xl border border-line bg-surface-1";

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function ViewAllLink({
  onClick,
  label = "View all",
}: {
  onClick: () => void;
  label?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-ok transition-opacity duration-150 hover:opacity-80"
    >
      {label}
      <ArrowRight size={12} strokeWidth={1.75} aria-hidden />
    </button>
  );
}

/** Thin 4px green progress bar with a right-aligned mono value label. */
function ThinBar({ fraction, label }: { fraction: number; label?: string }): JSX.Element {
  const pct = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0)) * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-ok" style={{ width: `${pct}%` }} />
      </div>
      {label && (
        <span className="shrink-0 text-right font-mono text-[11px] text-ink-muted">{label}</span>
      )}
    </div>
  );
}

function LoadingRows({ count = 3 }: { count?: number }): JSX.Element {
  return (
    <div className={cn(CARD_CLASS, "flex flex-col gap-3 p-4")}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-surface-2" />
      ))}
    </div>
  );
}

const AGENT_DOT_COLOR: Record<string, string> = {
  ACTIVE: "bg-ok",
  PAUSED: "bg-warn",
  DRAINED: "bg-warn",
  QUARANTINED: "bg-err",
  OFFLINE: "bg-ink-muted",
};

const AGENT_BADGE_TONE: Record<string, "success" | "warning" | "error" | "neutral"> = {
  ACTIVE: "success",
  PAUSED: "warning",
  DRAINED: "warning",
  QUARANTINED: "error",
  OFFLINE: "neutral",
};

const HEALTH_DOT: Record<HealthStatus, string> = {
  HEALTHY: "bg-ok",
  WATCH: "bg-warn",
  AT_RISK: "bg-warn",
  CRITICAL: "bg-err",
  INSUFFICIENT_EVIDENCE: "bg-ink-muted",
};

const MISSION_STATE_TONE: Record<
  MissionSummary["state"],
  "success" | "warning" | "info" | "neutral"
> = {
  ACTIVE: "info",
  AT_RISK: "warning",
  BLOCKED: "warning",
  VALIDATED: "success",
};

function activityIcon(action: string): LucideIcon {
  const a = action.toLowerCase();
  if (a.includes("approv")) return ShieldCheck;
  if (a.includes("alert")) return AlertTriangle;
  if (a.includes("run") || a.includes("execut")) return Play;
  if (a.includes("agent")) return Bot;
  if (a.includes("task")) return ListTodo;
  return Activity;
}

// ─────────────────────────────────────────────────────────────────────────────
// Needs attention (real Convex: pending approvals + blocked tasks + alerts)
// ─────────────────────────────────────────────────────────────────────────────

interface AttentionRow {
  id: string;
  title: string;
  detail?: string;
  badge: JSX.Element;
  onOpen: () => void;
}

function AttentionList({ rows }: { rows: AttentionRow[] }): JSX.Element {
  if (rows.length === 0) {
    return <EmptyState title="Nothing needs attention" description="Approvals, blockers, and alerts are all clear." />;
  }
  return (
    <ul className={CARD_CLASS}>
      {rows.map((row) => (
        <li key={row.id} className="border-b border-line last:border-b-0">
          <button
            type="button"
            onClick={row.onOpen}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 hover:bg-surface-2"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-ink">{row.title}</div>
              {row.detail && (
                <div className="mt-0.5 truncate text-[12.5px] text-ink-muted">{row.detail}</div>
              )}
            </div>
            {row.badge}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mission portfolio (demo projection)
// ─────────────────────────────────────────────────────────────────────────────

function MissionPortfolioCard({
  mission,
  onNavigate,
}: {
  mission: MissionSummary;
  onNavigate: (view: string) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onNavigate("mission-detail")}
      className={cn(
        CARD_CLASS,
        "flex w-full flex-col gap-3 p-4 text-left transition-colors duration-150 hover:border-line-strong"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn("h-2 w-2 shrink-0 rounded-full", HEALTH_DOT[mission.health])}
            aria-hidden
          />
          <span className="truncate text-[15px] font-semibold text-ink">{mission.name}</span>
          <StatusBadge tone={MISSION_STATE_TONE[mission.state]}>
            {mission.state.charAt(0) + mission.state.slice(1).toLowerCase().replace("_", " ")}
          </StatusBadge>
        </div>
        <ProvenanceBadge provenance={mission.provenance} />
      </div>
      <p className="text-[13.5px] leading-relaxed text-ink-secondary">{mission.objective}</p>
      <ThinBar fraction={mission.progressPct / 100} label={`${mission.progressPct}%`} />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        <span className="text-[12.5px] text-ink-muted">
          Cost{" "}
          <span className="font-mono text-ink">
            ${mission.actualCostUsd.toFixed(2)} / ${mission.plannedBudgetUsd.toFixed(2)}
          </span>
        </span>
        <span className="text-[12.5px] text-ink-muted">
          Work orders{" "}
          <span className="font-mono text-ink">{mission.workOrderTitles.length}</span>
        </span>
        <span className="text-[12.5px] text-ink-muted">
          Next milestone <span className="text-ink">{mission.nextMilestone}</span>
        </span>
      </div>
      <div className="border-t border-line pt-2 text-[12.5px] text-warn">
        {mission.deliveryRisk}
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Live factory activity (real Convex)
// ─────────────────────────────────────────────────────────────────────────────

function ActivityList({ activities }: { activities: Doc<"activities">[] }): JSX.Element {
  if (activities.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No factory activity yet"
        description="Agent and operator actions will stream here as they happen."
      />
    );
  }
  return (
    <ul className={CARD_CLASS}>
      {activities.slice(0, 8).map((activity) => {
        const Icon = activityIcon(activity.action);
        return (
          <li
            key={activity._id}
            className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-b-0"
          >
            <Icon
              size={14}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0 text-ink-muted"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-ink-secondary">{activity.description}</p>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">
                {activity.actorType} · {formatRelativeTime(activity._creationTime)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI workforce (real Convex agents + task join)
// ─────────────────────────────────────────────────────────────────────────────

function WorkforceList({
  agents,
  tasks,
  onNavigate,
}: {
  agents: Doc<"agents">[];
  tasks: Doc<"tasks">[];
  onNavigate: (view: string) => void;
}): JSX.Element {
  if (agents.length === 0) {
    return (
      <EmptyState
        icon={Bot}
        title="No agents registered"
        description="Register an agent to put the factory to work."
      />
    );
  }
  const sorted = [...agents].sort((a, b) =>
    a.status === b.status ? 0 : a.status === "ACTIVE" ? -1 : 1
  );
  return (
    <ul className={CARD_CLASS}>
      {sorted.map((agent) => {
        const currentTask = agent.currentTaskId
          ? tasks.find((t) => t._id === agent.currentTaskId) ?? null
          : null;
        return (
          <li key={agent._id} className="border-b border-line last:border-b-0">
            <button
              type="button"
              onClick={() => onNavigate("agent-catalog")}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-surface-2"
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  AGENT_DOT_COLOR[agent.status] ?? "bg-ink-muted"
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-[13px] font-medium text-ink">{agent.name}</span>
                  <span className="shrink-0 text-[11.5px] text-ink-muted">
                    {agent.role.toLowerCase()}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-ink-muted">
                  {currentTask
                    ? currentTask.title
                    : agent.status === "ACTIVE"
                      ? "Idle"
                      : agent.status.toLowerCase()}
                </span>
              </span>
              <span className="hidden w-32 shrink-0 sm:block">
                <ThinBar
                  fraction={agent.budgetDaily > 0 ? agent.spendToday / agent.budgetDaily : 0}
                  label={`$${agent.spendToday.toFixed(2)}/$${agent.budgetDaily.toFixed(0)}`}
                />
              </span>
              <StatusBadge tone={AGENT_BADGE_TONE[agent.status] ?? "neutral"}>
                {agent.status.charAt(0) + agent.status.slice(1).toLowerCase()}
              </StatusBadge>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory readiness (system + integration status)
// ─────────────────────────────────────────────────────────────────────────────

function FactoryReadinessCard({
  gatewayConfigured,
  agents,
  nextJobLabel,
}: {
  gatewayConfigured: boolean | null;
  agents: Doc<"agents">[];
  nextJobLabel: string;
}): JSX.Element {
  const activeAgents = agents.filter((a) => a.status === "ACTIVE").length;
  const quarantined = agents.filter((a) => a.status === "QUARANTINED").length;
  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: "Gateway",
      value:
        gatewayConfigured == null ? (
          <span className="text-ink-muted">Checking…</span>
        ) : gatewayConfigured ? (
          <StatusBadge tone="success">Connected</StatusBadge>
        ) : (
          <StatusBadge tone="warning">Not configured</StatusBadge>
        ),
    },
    {
      label: "Agents",
      value: `${activeAgents} active / ${agents.length}${quarantined > 0 ? ` · ${quarantined} quarantined` : ""}`,
    },
    { label: "Scheduler", value: nextJobLabel },
    { label: "GitHub", value: <ProvenanceBadge provenance="disconnected" /> },
    { label: "CI", value: <ProvenanceBadge provenance="disconnected" /> },
  ];
  return (
    <section className={cn(CARD_CLASS, "p-4")}>
      <h3 className="text-[15px] font-semibold text-ink">Factory readiness</h3>
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
// Main view
// ─────────────────────────────────────────────────────────────────────────────

export function CommandCenterView({ onNavigate }: CommandCenterViewProps): JSX.Element {
  const [gatewayConfigured, setGatewayConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const base = getOrchestrationBaseUrl();
    fetch(base ? `${base}/gateway/status` : "/gateway/status")
      .then((r) => r.json())
      .then((data: { configured?: boolean; urlConfigured?: boolean; tokenConfigured?: boolean }) => {
        if (!cancelled)
          setGatewayConfigured(
            Boolean(data.configured ?? (data.urlConfigured && data.tokenConfigured))
          );
      })
      .catch(() => {
        if (!cancelled) setGatewayConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Live Convex data ───────────────────────────────────────────────────────
  const approvals = useQuery(api.approvals.listPending, { limit: 25 });
  const tasks = useQuery(api.tasks.listAll, {});
  const openAlerts = useQuery(api.alerts.listOpen, { limit: 10 });
  const activities = useQuery(api.activities.listRecent, { limit: 8 });
  const agents = useQuery(api.agents.listAll, {});
  const scheduledJobs = useQuery(api.scheduledJobs.list, {});

  const attentionLoading = !approvals || !tasks || !openAlerts;
  const attentionRows: AttentionRow[] = attentionLoading
    ? []
    : [
        ...approvals.map((approval) => ({
          id: `approval-${approval._id}`,
          title: approval.title || "Approval requested",
          detail: approval.description || "Operator approval required before execution continues.",
          badge: <RiskBadge level={approval.riskLevel} />,
          onOpen: () => onNavigate("audit"),
        })),
        ...tasks
          .filter((t) => t.status === "BLOCKED" || t.status === "NEEDS_APPROVAL")
          .map((task) => ({
            id: `task-${task._id}`,
            title: task.title,
            detail:
              task.status === "BLOCKED"
                ? task.blockedReason || "Execution is stalled until a dependency is removed."
                : task.description || "Task is waiting on a human decision.",
            badge: (
              <StatusBadge tone="warning">
                {task.status === "BLOCKED" ? "Blocked" : "Needs approval"}
              </StatusBadge>
            ),
            onOpen: () => onNavigate("tasks"),
          })),
        ...openAlerts.map((alert) => ({
          id: `alert-${alert._id}`,
          title: alert.title,
          detail: alert.description || undefined,
          badge: <StatusBadge tone="error">Alert</StatusBadge>,
          onOpen: () => onNavigate("audit"),
        })),
      ].slice(0, 8);

  const now = Date.now();
  const nextJob = (scheduledJobs ?? [])
    .filter((j) => j.nextRun != null && j.nextRun >= now)
    .sort((a, b) => (a.nextRun ?? 0) - (b.nextRun ?? 0))[0];
  const nextJobLabel = nextJob
    ? `${nextJob.name} · ${new Date(nextJob.nextRun ?? 0).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}`
    : "No jobs scheduled";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex-1 overflow-auto bg-app">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 py-6">
        <PageHeader
          title="Command Center"
          description="The causal system of record and operating control plane for AI-native engineering."
          actions={
            <button
              type="button"
              onClick={() => onNavigate("goals")}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-act px-3 text-[13px] font-medium text-act-ink transition-opacity duration-150 hover:opacity-90"
            >
              <Plus size={14} strokeWidth={1.75} aria-hidden />
              New mission
            </button>
          }
        />

        <div
          className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
          aria-label="Factory health signals"
        >
          {demoHealthSignals.map((signal) => (
            <HealthSignalCard key={signal.id} signal={signal} onNavigate={onNavigate} />
          ))}
        </div>

        <EosSection eyebrow="OPERATE" title="Needs attention">
          {attentionLoading ? <LoadingRows /> : <AttentionList rows={attentionRows} />}
        </EosSection>

        <EosSection
          eyebrow="INTELLIGENCE"
          title="Recommended actions"
          action={<ViewAllLink onClick={() => onNavigate("recommendations")} />}
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {demoInsights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} onNavigate={onNavigate} />
            ))}
          </div>
        </EosSection>

        <EosSection
          eyebrow="STRATEGY"
          title="Mission portfolio"
          action={<ViewAllLink onClick={() => onNavigate("missions")} />}
        >
          <MissionPortfolioCard mission={demoMission} onNavigate={onNavigate} />
        </EosSection>

        <EosSection
          eyebrow="EXECUTION"
          title="Live factory activity"
          action={<ViewAllLink onClick={() => onNavigate("audit")} />}
        >
          {!activities ? <LoadingRows count={4} /> : <ActivityList activities={activities} />}
        </EosSection>

        <EosSection
          eyebrow="WORKFORCE"
          title="AI workforce"
          action={<ViewAllLink onClick={() => onNavigate("agent-catalog")} />}
        >
          {!agents || !tasks ? (
            <LoadingRows count={4} />
          ) : (
            <WorkforceList agents={agents} tasks={tasks} onNavigate={onNavigate} />
          )}
        </EosSection>

        <EosSection eyebrow="FACTORY CAPACITY" title="AI capacity">
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <QuotaFuelGauge />
            <FactoryReadinessCard
              gatewayConfigured={gatewayConfigured}
              agents={agents ?? []}
              nextJobLabel={nextJobLabel}
            />
          </div>
        </EosSection>
      </div>
    </div>
  );
}
