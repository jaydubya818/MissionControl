import { Check, ChevronDown, ChevronUp, X } from "lucide-react";
import { useState } from "react";
import type { EvalScenarioBlock } from "@/lib/registryEvalComparison";
import { cn } from "@/lib/utils";

export interface EvalSummaryFields {
  baselineScore?: number | null;
  candidateScore?: number | null;
  impactScore?: number | null;
  impactDelta?: number | null;
  scenarioCount?: number | null;
  completedAt?: number | null;
  improvementPct?: number | null;
}

export interface RegistryEvalComparisonProps {
  overallPct: number;
  overallDelta?: number | null;
  improvementPct?: number | null;
  summary?: EvalSummaryFields;
  scenarios: EvalScenarioBlock[];
}

function ScoreCell({ pct }: { pct: number }): JSX.Element {
  const pass = pct >= 80;
  return (
    <div className="flex items-center justify-end gap-2">
      {pass ? (
        <Check size={14} className="text-registry-accent" aria-hidden />
      ) : (
        <X size={14} className="text-err" aria-hidden />
      )}
      <span className={cn("font-mono text-[13px] tabular-nums", pass ? "text-registry-accent" : "text-ink-muted")}>
        {pct}%
      </span>
    </div>
  );
}

function ScenarioBlock({ block }: { block: EvalScenarioBlock }): JSX.Element {
  const [open, setOpen] = useState(true);

  return (
    <section className="registry-eval-scenario rounded-xl border border-line bg-surface-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-ink">{block.title}</h3>
            <span className="font-mono text-[13px] font-semibold text-registry-accent">
              {block.overallPct}%
            </span>
            {block.baselineScore != null && block.candidateScore != null ? (
              <span className="font-mono text-[11px] text-ink-muted">
                {block.baselineScore}% → {block.candidateScore}%
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[13px] text-ink-muted">{block.subtitle}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[12px] text-ink-muted">
          Details
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {open ? (
        <div className="border-t border-line px-4 pb-4">
          {block.taskPrompt ? (
            <p className="mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px] leading-relaxed text-ink-secondary">
              <span className="font-medium text-ink">Task: </span>
              {block.taskPrompt}
            </p>
          ) : null}
          <div className="registry-scrolly mt-3">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  <th className="px-3 py-2.5 text-[12px] font-medium text-ink-muted">Criteria</th>
                  <th className="px-3 py-2.5 text-right text-[12px] font-medium text-ink-muted">
                    Without skill
                  </th>
                  <th className="px-3 py-2.5 text-right text-[12px] font-medium text-ink-muted">
                    With skill
                  </th>
                </tr>
              </thead>
              <tbody>
                {block.criteria.map((row) => (
                  <tr key={row.id} className="border-b border-line/60 last:border-0">
                    <td className="px-3 py-2.5 text-[13px] text-ink">{row.label}</td>
                    <td className="px-3 py-2.5">
                      <ScoreCell pct={row.baselinePct} />
                    </td>
                    <td className="px-3 py-2.5">
                      <ScoreCell pct={row.withContextPct} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function EvalSummaryBar({ summary }: { summary: EvalSummaryFields }): JSX.Element {
  const items = [
    { label: "Without skill avg", value: summary.baselineScore },
    { label: "With skill avg", value: summary.candidateScore },
    { label: "Impact score", value: summary.impactScore },
    { label: "Impact delta", value: summary.impactDelta },
    { label: "Scenarios", value: summary.scenarioCount },
  ].filter((i) => i.value != null);

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-line bg-surface-2 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wide text-ink-muted">{item.label}</div>
          <div className="mt-0.5 font-mono text-[16px] font-semibold text-ink">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

/** Tessl-style evaluation results with baseline vs with-context tables. */
export function RegistryEvalComparison({
  overallPct,
  overallDelta,
  improvementPct,
  summary,
  scenarios,
}: RegistryEvalComparisonProps): JSX.Element {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-ink">Evaluation results</h2>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[22px] font-semibold text-ink">{overallPct}%</span>
          {improvementPct != null && improvementPct > 0 ? (
            <span className="registry-delta">↑ {improvementPct}%</span>
          ) : overallDelta != null && overallDelta > 0 ? (
            <span className="registry-delta">↑ {overallDelta} pts</span>
          ) : null}
        </div>
      </div>

      {summary ? <EvalSummaryBar summary={summary} /> : null}

      <div className="space-y-4">
        {scenarios.map((block) => (
          <ScenarioBlock key={block.id} block={block} />
        ))}
      </div>
    </div>
  );
}
