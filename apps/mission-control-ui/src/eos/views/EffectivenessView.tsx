import { useState } from "react";
import { Info } from "lucide-react";
import { PageHeader } from "../../components/factory/DetailLayout";
import { cn } from "../../lib/utils";
import { EvidenceLink, PageProvenanceNote, ProvenanceBadge, TrendIcon } from "../components";
import { demoEffectiveness } from "../demoData";
import type { EffectivenessMetric } from "../types";

export interface EffectivenessViewProps {
  onNavigate: (view: string) => void;
}

type Grouping = "all" | "workflow" | "repository";

const GROUPINGS: Array<{ id: Grouping; label: string }> = [
  { id: "all", label: "All" },
  { id: "workflow", label: "Workflow" },
  { id: "repository", label: "Repository" },
];

/** Metrics where a downward trend is the good direction. */
const LOWER_IS_BETTER = new Set(["rescue", "retries", "cpvo", "rework"]);

/**
 * Insufficient-evidence explanations (§12): what is missing and what makes the
 * value available. Keyed by metric id; generic fallback derives from sample sizes.
 */
const INSUFFICIENT_COPY: Record<string, string> = {
  rework:
    "Insufficient evidence — 2 completed revisions; 10 required. Rework tracking activates with revision history.",
};

function insufficientCopy(metric: EffectivenessMetric): string {
  return (
    INSUFFICIENT_COPY[metric.id] ??
    `Insufficient evidence — n=${metric.sampleSize}; ${metric.minSampleSize} required. Value appears once the sample reaches minimum size.`
  );
}

function formatMetricValue(metric: EffectivenessMetric): string {
  if (metric.value === null) return "—";
  if (metric.unit === "usd") return `$${metric.value.toFixed(2)}`;
  return String(metric.value);
}

function formatGroupValue(value: number | null, unit: EffectivenessMetric["unit"]): string {
  if (value === null) return "—";
  if (unit === "usd") return `$${value.toFixed(2)}`;
  if (unit === "%") return `${value}%`;
  return String(value);
}

function GroupingControl({
  grouping,
  onChange,
}: {
  grouping: Grouping;
  onChange: (grouping: Grouping) => void;
}): JSX.Element {
  return (
    <div
      role="tablist"
      aria-label="Metric grouping"
      className="inline-flex w-fit items-center gap-0.5 rounded-lg border border-line p-0.5"
    >
      {GROUPINGS.map((option) => {
        const active = option.id === grouping;
        return (
          <button
            key={option.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            className={cn(
              "rounded-md px-2.5 py-1 text-[12.5px] transition-colors duration-150",
              active ? "bg-surface-2 text-ink" : "text-ink-muted hover:text-ink-secondary"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function MetricCard({
  metric,
  grouping,
  onNavigate,
}: {
  metric: EffectivenessMetric;
  grouping: Grouping;
  onNavigate: (view: string) => void;
}): JSX.Element {
  const insufficient = metric.provenance === "insufficient";
  const groupEntries =
    grouping === "workflow" && metric.groupBy ? Object.entries(metric.groupBy) : null;
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border border-line bg-surface-1 p-4 transition-colors duration-150 hover:border-line-strong",
        insufficient && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[15px] font-semibold text-ink">{metric.label}</span>
          <span title={metric.definition} className="cursor-help text-ink-muted">
            <Info size={13} strokeWidth={1.7} aria-hidden />
            <span className="sr-only">{metric.definition}</span>
          </span>
        </div>
        {insufficient ? (
          <ProvenanceBadge provenance={metric.provenance} />
        ) : (
          <ProvenanceBadge provenance={metric.provenance} variant="dot" />
        )}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "text-[28px] font-semibold leading-none",
            metric.value === null ? "text-ink-muted" : "text-ink",
            metric.unit === "usd" && "font-mono"
          )}
        >
          {formatMetricValue(metric)}
        </span>
        {metric.value !== null && metric.unit !== "usd" && (
          <span className="text-[13px] text-ink-muted">{metric.unit}</span>
        )}
        <TrendIcon trend={metric.trend} invert={LOWER_IS_BETTER.has(metric.id)} />
      </div>
      {metric.value === null && (
        <p className="text-[12px] leading-relaxed text-ink-secondary">{insufficientCopy(metric)}</p>
      )}
      <div className="font-mono text-[11px] text-ink-muted">
        n={metric.sampleSize} · {metric.periodDays}d
      </div>
      {grouping !== "all" && (
        <div className="flex flex-col gap-1 border-t border-line pt-2">
          <div className="text-[11.5px] text-ink-muted">By {grouping}</div>
          {groupEntries ? (
            groupEntries.map(([group, value]) => (
              <div key={group} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="text-ink-secondary">{group}</span>
                <span className="font-mono text-ink">{formatGroupValue(value, metric.unit)}</span>
              </div>
            ))
          ) : (
            <div className="text-[12px] text-ink-muted">
              No {grouping} breakdown yet — grouped values appear once each group reaches minimum
              sample size.
            </div>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-line pt-2">
        <span className="min-w-0 text-[11.5px] text-ink-muted">
          {metric.misuseNote === "—" ? "" : `Read with: ${metric.misuseNote}`}
        </span>
        <EvidenceLink
          evidence={{ label: "Inspect evidence", view: metric.drillView }}
          onNavigate={onNavigate}
        />
      </div>
    </div>
  );
}

export function EffectivenessView({ onNavigate }: EffectivenessViewProps): JSX.Element {
  const [grouping, setGrouping] = useState<Grouping>("all");
  return (
    <div className="relative flex-1 overflow-auto bg-app">
      <PageHeader
        title="AI Effectiveness"
        description="Component measures with evidence — no single magic score."
      />
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-8 py-6">
        <PageProvenanceNote />
        <div className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-[12.5px] text-ink-secondary">
          Metrics below minimum sample size render as Insufficient Evidence. Every value drills to
          its source events.
        </div>
        <GroupingControl grouping={grouping} onChange={setGrouping} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {demoEffectiveness.map((metric) => (
            <MetricCard
              key={metric.id}
              metric={metric}
              grouping={grouping}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
