import { useState } from "react";
import { PageHeader } from "../../components/factory/DetailLayout";
import { StatusBadge } from "../../components/factory/badges";
import { EmptyState } from "../../components/ui/empty-state";
import { cn } from "../../lib/utils";
import { InsightCard, ProvenanceBadge } from "../components";
import { demoReadiness } from "../demoData";
import type { HealthStatus, ReadinessAssessment } from "../types";

export interface ReadinessViewProps {
  onNavigate: (view: string) => void;
}

const STATE_STYLE: Record<HealthStatus, { dot: string; text: string; label: string }> = {
  HEALTHY: { dot: "bg-ok", text: "text-ok", label: "Healthy" },
  WATCH: { dot: "bg-warn", text: "text-warn", label: "Watch" },
  AT_RISK: { dot: "bg-warn", text: "text-warn", label: "At risk" },
  CRITICAL: { dot: "bg-err", text: "text-err", label: "Critical" },
  INSUFFICIENT_EVIDENCE: { dot: "bg-ink-muted", text: "text-ink-muted", label: "Insufficient evidence" },
};

function scoreFillClass(score: number): string {
  if (score >= 70) return "bg-ok";
  if (score >= 40) return "bg-warn";
  return "bg-err";
}

function RepoCard({
  assessment,
  selected,
  onSelect,
}: {
  assessment: ReadinessAssessment;
  selected: boolean;
  onSelect: () => void;
}): JSX.Element {
  const style = STATE_STYLE[assessment.state];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex flex-col gap-2 rounded-xl border bg-surface-1 p-3 text-left transition-colors duration-150",
        selected ? "border-line-strong bg-surface-2" : "border-line hover:border-line-strong"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-[13px] text-ink">{assessment.repoSlug}</span>
        <ProvenanceBadge provenance={assessment.provenance} />
      </div>
      <div className="flex items-center gap-2">
        <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} aria-hidden />
        <span className={cn("text-[12.5px] font-medium", style.text)}>{style.label}</span>
      </div>
      {assessment.recurringFriction.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {assessment.recurringFriction.map((category) => (
            <StatusBadge key={category} tone="warning">
              {category}
            </StatusBadge>
          ))}
        </div>
      )}
    </button>
  );
}

function DimensionRow({
  dimension,
}: {
  dimension: ReadinessAssessment["dimensions"][number];
}): JSX.Element {
  return (
    <div className="flex items-center gap-4 border-b border-line py-3 last:border-b-0">
      <div className="w-[180px] shrink-0 text-[13px] text-ink">{dimension.label}</div>
      <div className="h-1 min-w-0 flex-1 overflow-hidden rounded bg-surface-2">
        {dimension.score !== null && (
          <div
            className={cn("h-full rounded", scoreFillClass(dimension.score))}
            style={{ width: `${dimension.score}%` }}
            aria-hidden
          />
        )}
      </div>
      <div className="w-8 shrink-0 text-right font-mono text-[12.5px] text-ink">
        {dimension.score !== null ? dimension.score : "—"}
      </div>
      <div className="w-[240px] shrink-0 truncate text-[12px] text-ink-muted" title={dimension.note}>
        {dimension.note}
      </div>
    </div>
  );
}

export function ReadinessView({ onNavigate }: ReadinessViewProps): JSX.Element {
  const [selectedSlug, setSelectedSlug] = useState<string>(demoReadiness[0]?.repoSlug ?? "");
  const selected = demoReadiness.find((a) => a.repoSlug === selectedSlug) ?? demoReadiness[0];

  return (
    <div className="relative flex-1 overflow-auto bg-app">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 py-6">
        <PageHeader
          title="Environment Readiness"
          description="Learned from execution friction, not questionnaires."
        />
        <div className="flex gap-6">
          <div className="flex w-[300px] shrink-0 flex-col gap-3">
            {demoReadiness.map((assessment) => (
              <RepoCard
                key={assessment.repoSlug}
                assessment={assessment}
                selected={assessment.repoSlug === selected?.repoSlug}
                onSelect={() => setSelectedSlug(assessment.repoSlug)}
              />
            ))}
          </div>
          {selected && (
            <div className="flex min-w-0 flex-1 flex-col gap-6">
              <div className="rounded-xl border border-line bg-surface-1 px-4 py-1">
                {selected.dimensions.map((dimension) => (
                  <DimensionRow key={dimension.id} dimension={dimension} />
                ))}
              </div>
              <section className="flex flex-col gap-3">
                <h2 className="text-[15px] font-semibold text-ink">Recommendations</h2>
                {selected.recommendations.length === 0 ? (
                  <EmptyState title="No open recommendations" />
                ) : (
                  selected.recommendations.map((insight) => (
                    <InsightCard key={insight.id} insight={insight} onNavigate={onNavigate} />
                  ))
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
