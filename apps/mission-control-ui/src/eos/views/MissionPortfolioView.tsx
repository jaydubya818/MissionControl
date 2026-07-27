import { Target } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { PageHeader } from "../../components/factory/DetailLayout";
import { StatusBadge, type StatusBadgeProps } from "../../components/factory/badges";
import { EmptyState } from "../../components/ui/empty-state";
import { cn } from "../../lib/utils";
import { PageProvenanceNote, ProvenanceBadge } from "../components";
import { demoMission } from "../demoData";
import { adaptMissionSummaries } from "../liveAdapters";
import type { HealthStatus, MissionSummary } from "../types";

export interface MissionPortfolioViewProps {
  onNavigate: (view: string) => void;
}

const HEALTH_STYLE: Record<HealthStatus, { dot: string; text: string; label: string }> = {
  HEALTHY: { dot: "bg-ok", text: "text-ok", label: "Healthy" },
  WATCH: { dot: "bg-warn", text: "text-warn", label: "Watch" },
  AT_RISK: { dot: "bg-warn", text: "text-warn", label: "At risk" },
  CRITICAL: { dot: "bg-err", text: "text-err", label: "Critical" },
  INSUFFICIENT_EVIDENCE: { dot: "bg-ink-muted", text: "text-ink-muted", label: "Insufficient evidence" },
};

const MISSION_STATE_TONE: Record<MissionSummary["state"], StatusBadgeProps["tone"]> = {
  ACTIVE: "info",
  AT_RISK: "warning",
  BLOCKED: "warning",
  VALIDATED: "success",
};

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

/** 4px flat progress bar (same pattern as DashboardOverview ThinBar). */
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

function MissionCard({
  mission,
  onNavigate,
}: {
  mission: MissionSummary;
  onNavigate: (view: string) => void;
}): JSX.Element {
  const health = HEALTH_STYLE[mission.health];
  return (
    <button
      type="button"
      onClick={() => onNavigate("mission-detail")}
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-surface-1 p-4 text-left transition-colors duration-150 hover:border-line-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-ink">{mission.name}</div>
          <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-ink-secondary">
            {mission.objective}
          </p>
        </div>
        <StatusBadge tone={MISSION_STATE_TONE[mission.state]}>{mission.state}</StatusBadge>
      </div>

      <div className="flex items-center gap-2">
        <span className={cn("h-1.5 w-1.5 rounded-full", health.dot)} aria-hidden />
        <span className={cn("text-[12.5px] font-medium", health.text)}>{health.label}</span>
      </div>

      <ThinBar fraction={mission.progressPct / 100} label={`${mission.progressPct}%`} />

      <div className="text-[12.5px] text-ink-secondary">
        <span className="text-ink-muted">Cost </span>
        <span className="font-mono text-ink">{formatUsd(mission.actualCostUsd)}</span>
        <span className="text-ink-muted"> of </span>
        <span className="font-mono">{formatUsd(mission.plannedBudgetUsd)}</span>
        <span className="text-ink-muted"> planned</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {mission.workOrderTitles.map((title) => (
          <StatusBadge key={title} tone="neutral">
            {title}
          </StatusBadge>
        ))}
      </div>

      <div className="text-[12.5px] text-warn">{mission.deliveryRisk}</div>

      <div className="flex items-center justify-between gap-3 border-t border-line pt-2.5">
        <div className="min-w-0 truncate text-[12px] text-ink-muted">
          Next milestone: <span className="text-ink-secondary">{mission.nextMilestone}</span>
        </div>
        <ProvenanceBadge provenance={mission.provenance} variant="dot" className="shrink-0" />
      </div>
    </button>
  );
}

export function MissionPortfolioView({ onNavigate }: MissionPortfolioViewProps): JSX.Element {
  const liveMissions = useQuery(api.eos.projections.getMissionSummaries, {});
  const missions: MissionSummary[] =
    liveMissions && liveMissions.length > 0
      ? adaptMissionSummaries(liveMissions as MissionSummary[])
      : [demoMission];

  return (
    <div className="relative flex-1 overflow-auto bg-app">
      <PageHeader
        title="Missions"
        description="Business outcomes the factory is delivering, with cost, risk, and evidence per mission."
      />
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-8 py-6">
        <PageProvenanceNote />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {missions.map((mission) => (
            <MissionCard key={mission.id} mission={mission} onNavigate={onNavigate} />
          ))}
          {missions.length < 2 ? (
            <EmptyState
              icon={Target}
              title="Define your next mission"
              description="Missions turn objectives into governed work orders with budgets and acceptance criteria."
              action={
                <button
                  type="button"
                  onClick={() => onNavigate("goals")}
                  className="h-9 rounded-lg border border-line px-3 text-[13px] text-ink-secondary transition-colors duration-150 hover:border-line-strong hover:text-ink"
                >
                  Start from an objective
                </button>
              }
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
