import { useState } from "react";
import { DataTable, type Column } from "../../components/factory/DataTable";
import { PageHeader } from "../../components/factory/DetailLayout";
import { MetricBlock } from "../../components/factory/MetricBlock";
import { StatusBadge, type StatusBadgeProps } from "../../components/factory/badges";
import { EvidenceLink, InsightCard, PageProvenanceNote, ProvenanceBadge, TrendIcon } from "../components";
import { demoFriction, demoInsights } from "../demoData";
import type { FrictionSummary } from "../types";

export interface FrictionViewProps {
  onNavigate: (view: string) => void;
}

/**
 * Category severity tones. permission-denial stays neutral: denials are the
 * policy working as designed (see its recommendation), not waste to fix.
 */
const CATEGORY_TONE: Record<FrictionSummary["category"], StatusBadgeProps["tone"]> = {
  "env-setup-failure": "error",
  "stuck-run": "error",
  "loop-detected": "error",
  "budget-exhaustion": "error",
  "approval-latency": "warning",
  "flaky-test": "warning",
  "excessive-retry": "warning",
  "tool-unavailable": "warning",
  "permission-denial": "neutral",
};

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatMinutes(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function FrictionDetailPanel({
  row,
  onNavigate,
}: {
  row: FrictionSummary;
  onNavigate: (view: string) => void;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface-1 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-ink">{row.label}</span>
          <StatusBadge tone={CATEGORY_TONE[row.category]}>{row.category}</StatusBadge>
        </div>
        <ProvenanceBadge provenance={row.provenance} />
      </div>
      <p className="text-[13.5px] text-ink-secondary">{row.recommendation}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {row.affectedRepos.map((repo) => (
          <StatusBadge key={repo} tone="neutral" className="font-mono">
            {repo}
          </StatusBadge>
        ))}
        {row.affectedWorkflows.map((workflow) => (
          <StatusBadge key={workflow} tone="neutral">
            {workflow}
          </StatusBadge>
        ))}
      </div>
      <div>
        <button
          type="button"
          onClick={() => onNavigate(row.representativeTrace.view)}
          className="h-9 rounded-lg border border-line px-3 text-[13px] text-ink-secondary transition-colors duration-150 hover:border-line-strong hover:text-ink"
        >
          Open representative trace
        </button>
      </div>
      {row.category === "env-setup-failure" && (
        <InsightCard insight={demoInsights[0]} onNavigate={onNavigate} />
      )}
    </div>
  );
}

export function FrictionView({ onNavigate }: FrictionViewProps): JSX.Element {
  const [expandedCategory, setExpandedCategory] = useState<FrictionSummary["category"] | null>(null);

  const totalIncidents = demoFriction.reduce((sum, row) => sum + row.incidents, 0);
  const totalCostUsd = demoFriction.reduce((sum, row) => sum + row.estCostUsd, 0);
  const totalWastedMinutes = demoFriction.reduce((sum, row) => sum + row.wastedMinutes, 0);

  const columns: Column<FrictionSummary>[] = [
    {
      id: "category",
      header: "Category",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-ink">{row.label}</span>
          <StatusBadge tone={CATEGORY_TONE[row.category]}>{row.category}</StatusBadge>
        </div>
      ),
    },
    {
      id: "incidents",
      header: "Incidents",
      align: "right",
      cell: (row) => <span className="font-mono text-ink">{row.incidents}</span>,
    },
    {
      id: "repos",
      header: "Repos",
      cell: (row) => <span className="font-mono text-[12.5px]">{row.affectedRepos.join(", ")}</span>,
    },
    {
      id: "workflows",
      header: "Workflows",
      cell: (row) => row.affectedWorkflows.join(", "),
    },
    {
      id: "cost",
      header: "Est cost",
      align: "right",
      cell: (row) => <span className="font-mono">{formatUsd(row.estCostUsd)}</span>,
    },
    {
      id: "wasted",
      header: "Wasted min",
      align: "right",
      cell: (row) => <span className="font-mono">{row.wastedMinutes}</span>,
    },
    {
      id: "trend",
      header: "Trend",
      cell: (row) => <TrendIcon trend={row.trend} invert />,
    },
    {
      id: "trace",
      header: "Trace",
      cell: (row) => (
        // Stop propagation so the drill-down does not also toggle the row panel.
        <span onClick={(event) => event.stopPropagation()}>
          <EvidenceLink evidence={row.representativeTrace} onNavigate={onNavigate} />
        </span>
      ),
    },
    {
      id: "recommendation",
      header: "Recommendation",
      cell: (row) => (
        <span className="block max-w-[220px] truncate" title={row.recommendation}>
          {row.recommendation}
        </span>
      ),
    },
  ];

  const expandedRow = demoFriction.find((row) => row.category === expandedCategory);

  return (
    <div className="relative flex-1 overflow-auto bg-app">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-8 py-6">
        <PageHeader
          title="Friction & Waste"
          description="Detectable categories only — every incident drills to a trace."
        />
        <PageProvenanceNote />
        <div className="flex flex-col gap-6 rounded-xl border border-line bg-surface-1 p-4 sm:flex-row sm:[&>*]:flex-1">
          <MetricBlock
            label="Total incidents"
            value={totalIncidents}
            adornment={<ProvenanceBadge provenance="demo" variant="dot" />}
          />
          <MetricBlock
            label="Estimated wasted cost"
            value={<span className="font-mono">{formatUsd(totalCostUsd)}</span>}
            adornment={<ProvenanceBadge provenance="demo" variant="dot" />}
          />
          <MetricBlock
            label="Wasted time"
            value={formatMinutes(totalWastedMinutes)}
            adornment={<ProvenanceBadge provenance="demo" variant="dot" />}
          />
        </div>
        <DataTable
          columns={columns}
          rows={demoFriction}
          rowKey={(row) => row.category}
          onRowClick={(row) =>
            setExpandedCategory((current) => (current === row.category ? null : row.category))
          }
        />
        {expandedRow && <FrictionDetailPanel row={expandedRow} onNavigate={onNavigate} />}
      </div>
    </div>
  );
}
