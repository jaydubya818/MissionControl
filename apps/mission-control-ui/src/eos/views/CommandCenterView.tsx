/**
 * EOS Command Center — causal system of record and operating control plane.
 *
 * Composition: demo-provenance projections (mission anchor, health band,
 * insights, curated timeline from demoData) beside live Convex data
 * (attention queue, workforce, capacity). Every demo-sourced element renders
 * its ProvenanceBadge; Convex data renders none (see src/eos/types.ts).
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { ArrowRight, Bot, ChevronRight, Plus } from "lucide-react";
import { PageHeader } from "../../components/factory/DetailLayout";
import { StatusBadge } from "../../components/factory/badges";
import { AttentionQueuePanel } from "../../components/AttentionQueuePanel";
import { EmptyState } from "../../components/ui/empty-state";
import { QuotaFuelGauge } from "../../components/QuotaFuelGauge";
import { cn } from "../../lib/utils";
import { buildAttentionItems, exceptionCounts } from "../../lib/attentionQueue";
import { getOrchestrationBaseUrl } from "../../lib/orchestrationUrl";
import {
  EosSection,
  HealthSignalCard,
  InsightCard,
  PageProvenanceNote,
  ProvenanceBadge,
} from "../components";
import {
  AGENT_ROLES,
  demoAttentionNarratives,
  demoHealthSignals,
  demoInsights,
  demoMission,
  demoMissionAnchor,
  demoTimeline,
} from "../demoData";
import type { HealthStatus } from "../types";

export interface CommandCenterViewProps {
  onNavigate: (view: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Local helpers (copied from DashboardOverview per style-guide convention)
// ─────────────────────────────────────────────────────────────────────────────

const CARD_CLASS = "rounded-xl border border-line bg-surface-1";

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

const HEALTH_LABEL: Record<HealthStatus, string> = {
  HEALTHY: "Healthy",
  WATCH: "Watch",
  AT_RISK: "At risk",
  CRITICAL: "Critical",
  INSUFFICIENT_EVIDENCE: "Insufficient evidence",
};

// ─────────────────────────────────────────────────────────────────────────────
// Mission anchor (demo projection) — operational status brief at page top
// ─────────────────────────────────────────────────────────────────────────────

function MissionAnchorCard({
  onNavigate,
}: {
  onNavigate: (view: string) => void;
}): JSX.Element {
  const facts: { label: string; value: React.ReactNode }[] = [
    {
      label: "State",
      value: (
        <span className="flex items-center gap-2">
          <StatusBadge tone="info">Active</StatusBadge>
          <span className="flex items-center gap-1.5">
            <span
              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", HEALTH_DOT[demoMission.health])}
              aria-hidden
            />
            <span className="text-[13px] text-ink">{HEALTH_LABEL[demoMission.health]}</span>
          </span>
        </span>
      ),
    },
    {
      label: "Work orders",
      value: (
        <span className="flex flex-col gap-1">
          <span className="text-[13px] text-ink">
            {demoMission.progressPct}% · {demoMission.workOrderTitles.length} active
          </span>
          <ThinBar fraction={demoMission.progressPct / 100} />
        </span>
      ),
    },
    {
      label: "Blocking",
      value: <span className="text-[13px] text-warn">{demoMissionAnchor.blocking}</span>,
    },
    {
      label: "Delivery",
      value: <span className="text-[13px] text-ink">{demoMissionAnchor.milestone}</span>,
    },
    {
      label: "Verification",
      value: <span className="text-[13px] text-warn">{demoMissionAnchor.verification}</span>,
    },
    {
      label: "Cost",
      value: (
        <span className="font-mono text-[13px] text-ink">
          ${demoMission.actualCostUsd.toFixed(2)} of ${demoMission.plannedBudgetUsd.toFixed(2)}{" "}
          planned
        </span>
      ),
    },
  ];
  return (
    <section className={cn(CARD_CLASS, "p-5")} aria-label="Active mission">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-[72ch] flex-1">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-ok">
            Active mission
          </div>
          <button
            type="button"
            onClick={() => onNavigate("mission-detail")}
            className="mt-1 block text-left text-[19px] font-semibold tracking-tight text-ink transition-opacity duration-150 hover:opacity-80"
          >
            {demoMission.name}
          </button>
          <p className="mt-1 text-[13.5px] leading-relaxed text-ink-secondary">
            {demoMission.objective}
          </p>
          <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {facts.map((fact) => (
              <div key={fact.label} className="min-w-0">
                <dt className="text-[11.5px] text-ink-muted">{fact.label}</dt>
                <dd className="mt-0.5">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-3 lg:items-end">
          <ProvenanceBadge provenance={demoMission.provenance} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate("mission-detail")}
              className="inline-flex h-9 items-center rounded-lg bg-act px-3 text-[13px] font-medium text-act-ink transition-opacity duration-150 hover:opacity-90"
            >
              Open mission
            </button>
            <button
              type="button"
              onClick={() => onNavigate("dossier")}
              className="inline-flex h-9 items-center rounded-lg border border-line px-3 text-[13px] font-medium text-ink-secondary transition-colors duration-150 hover:border-line-strong hover:text-ink"
            >
              Decide waiver
            </button>
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
        <span className="text-[12.5px] text-ink-muted">
          Next action: {demoMissionAnchor.nextAction}
        </span>
        <ViewAllLink label="View all missions" onClick={() => onNavigate("missions")} />
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Live factory activity (curated demo timeline — the story, not a log)
// ─────────────────────────────────────────────────────────────────────────────

const TIMELINE_DOT: Record<(typeof demoTimeline)[number]["state"], string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  err: "bg-err",
  info: "bg-info-accent",
};

function TimelineList({ onNavigate }: { onNavigate: (view: string) => void }): JSX.Element {
  return (
    <ul className={CARD_CLASS}>
      {demoTimeline.map((event, i) => (
        <li key={`${event.rel}-${i}`} className="border-b border-line last:border-b-0">
          <button
            type="button"
            onClick={() => onNavigate(event.drillView)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-surface-2"
          >
            <span className="w-10 shrink-0 font-mono text-[11.5px] text-ink-muted">
              {event.rel}
            </span>
            <span
              className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TIMELINE_DOT[event.state])}
              aria-hidden
            />
            <span className="min-w-0 max-w-[72ch] flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="shrink-0 text-[12.5px] text-ink-secondary">{event.actor}</span>
                <span className="text-[13px] text-ink">{event.event}</span>
              </span>
              <span className="mt-0.5 block truncate font-mono text-[11.5px] text-ink-muted">
                {event.object}
              </span>
            </span>
            <ChevronRight size={14} strokeWidth={1.75} className="shrink-0 text-ink-muted" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI workforce (real Convex agents + task join; functional role titles)
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
        const recentResult = currentTask
          ? `Working: ${currentTask.title}`
          : agent.status === "ACTIVE"
            ? "Idle"
            : agent.status.toLowerCase();
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
                    {AGENT_ROLES[agent.name] ?? agent.role.toLowerCase()}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-ink-muted">
                  {recentResult}
                </span>
                {agent.status === "QUARANTINED" && (
                  <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-err">
                    <span className="truncate">Escalation: credential rotation required</span>
                    <ProvenanceBadge provenance="demo" variant="dot" />
                  </span>
                )}
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
// Factory capacity (quota gauge + scheduler posture) and readiness
// ─────────────────────────────────────────────────────────────────────────────

function CapacityPostureCard({ usagePct }: { usagePct: number | null }): JSX.Element {
  const schedulerDot =
    usagePct == null ? "bg-ink-muted" : usagePct < 80 ? "bg-ok" : "bg-warn";
  return (
    <div className={cn(CARD_CLASS, "flex flex-col gap-2 p-4")}>
      <div className="flex items-center gap-2 text-[12.5px] text-ink-secondary">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", schedulerDot)} aria-hidden />
        Scheduler: safe to start background work
      </div>
      <div className="text-[12.5px] text-ink-muted">Constraint: provider quota</div>
    </div>
  );
}

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
    <div className={cn(CARD_CLASS, "p-4")}>
      <dl className="flex flex-col divide-y divide-line">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <dt className="text-[12.5px] text-ink-muted">{row.label}</dt>
            <dd className="text-[13px] text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main view
// ─────────────────────────────────────────────────────────────────────────────

export function CommandCenterView({ onNavigate }: CommandCenterViewProps): JSX.Element {
  const [gatewayConfigured, setGatewayConfigured] = useState<boolean | null>(null);
  const approveApproval = useMutation(api.approvals.approve);
  const transitionTask = useMutation(api.tasks.transition);

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
  const agents = useQuery(api.agents.listAll, {});
  const scheduledJobs = useQuery(api.scheduledJobs.list, {});
  const quotaSnapshot = useQuery(api.quotaTracking.getLatestSnapshot, {});

  const alertsList = openAlerts ?? [];
  const blockedTasksList = (tasks ?? []).filter((t) => t.status === "BLOCKED");
  const failedTasksList = (tasks ?? []).filter((t) => t.status === "FAILED");
  const needsApprovalTasks = (tasks ?? []).filter((t) => t.status === "NEEDS_APPROVAL");
  const scannedAt = Date.now();

  const openTask = (taskId: Id<"tasks">) => {
    onNavigate("tasks");
    void taskId;
  };

  const attentionItems = buildAttentionItems({
    limit: 5,
    approvals: approvals ?? [],
    blockedTasks: blockedTasksList,
    needsApprovalTasks,
    failedTasks: failedTasksList,
    alerts: alertsList,
    openApproval: () => onNavigate("audit"),
    openTask,
    openApprovalsModal: () => onNavigate("audit"),
    openAlertRules: () => onNavigate("telemetry"),
    approveApproval: async (approvalId) => {
      await approveApproval({
        approvalId,
        decidedByUserId: "operator",
        reason: "Approved from Command Center",
      });
    },
    unblockTask: async (taskId) => {
      await transitionTask({
        taskId,
        toStatus: "ASSIGNED",
        actorType: "HUMAN",
        actorUserId: "operator",
        reason: "Unblocked from Command Center",
        idempotencyKey: `command-center-unblock-${taskId}-${Date.now()}`,
      });
    },
  });

  // Narrate matched rows with decision-specific demo copy (semantic
  // substring match, priority-sorted; unmatched rows keep real text).
  const narratedItems = attentionItems
    .map((item) => {
      const haystack = `${item.title} ${item.detail ?? ""}`.toLowerCase();
      const narrative = demoAttentionNarratives.find((n) =>
        haystack.includes(n.match.toLowerCase())
      );
      return narrative
        ? { ...item, title: narrative.decision, detail: narrative.why, _priority: narrative.priority }
        : { ...item, _priority: 99 };
    })
    .sort((a, b) => a._priority - b._priority)
    .slice(0, 5);

  const exceptions = exceptionCounts({
    approvals: approvals ?? [],
    blockedTasks: blockedTasksList,
    failedTasks: failedTasksList,
    alerts: alertsList,
  });

  const attentionLoading = !approvals || !tasks || !openAlerts;

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
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-8 py-6">
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

        <PageProvenanceNote />
            onOpenTasks={() => onNavigate("tasks")}
            onOpenAlerts={() => onNavigate("telemetry")}
          />
        )}

        <MissionAnchorCard onNavigate={onNavigate} />

        <div
          className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6"
          aria-label="Factory health signals"
        >
          {demoHealthSignals.map((signal) => (
            <HealthSignalCard key={signal.id} signal={signal} onNavigate={onNavigate} />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          {/* Main column */}
          <div className="flex min-w-0 flex-col gap-6 xl:col-span-8">
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
              eyebrow="OPERATE"
              title="Needs attention"
              action={
                <span className="flex items-center gap-3">
                  <ProvenanceBadge provenance="demo" variant="dot" />
                  <ViewAllLink onClick={() => onNavigate("tasks")} />
                </span>
              }
            >
              {attentionLoading ? (
                <LoadingRows count={4} />
              ) : (
                <AttentionQueuePanel
                  items={narratedItems}
                  scannedAt={scannedAt}
                  counts={exceptions}
                  onOpenApprovals={() => onNavigate("audit")}
                  onOpenTasks={() => onNavigate("tasks")}
                  onOpenAlerts={() => onNavigate("telemetry")}
                />
              )}
            </EosSection>

            <EosSection
              eyebrow="EXECUTION"
              title="Live factory activity"
              action={
                <div className="flex items-center gap-3">
                  <ProvenanceBadge provenance="demo" />
                  <ViewAllLink onClick={() => onNavigate("audit")} />
                </div>
              }
            >
              <TimelineList onNavigate={onNavigate} />
            </EosSection>
          </div>

          {/* Right rail */}
          <div className="flex min-w-0 flex-col gap-6 xl:col-span-4">
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

            <EosSection eyebrow="RESOURCES" title="Factory capacity">
              <div className="flex flex-col gap-3">
                <QuotaFuelGauge />
                <CapacityPostureCard usagePct={quotaSnapshot?.usagePct ?? null} />
              </div>
            </EosSection>

            <EosSection eyebrow="SYSTEM" title="Factory readiness">
              <FactoryReadinessCard
                gatewayConfigured={gatewayConfigured}
                agents={agents ?? []}
                nextJobLabel={nextJobLabel}
              />
            </EosSection>
          </div>
        </div>
      </div>
    </div>
  );
}
