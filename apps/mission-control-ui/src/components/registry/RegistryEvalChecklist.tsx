import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EvalCriterionResult {
  id: string;
  label: string;
  passed: boolean;
  score?: number;
}

export interface RegistryEvalChecklistProps {
  title?: string;
  overallScore?: number;
  overallDelta?: number | null;
  criteria: EvalCriterionResult[];
  className?: string;
}

/** Tessl eval results checklist (speech-to-text style). */
export function RegistryEvalChecklist({
  title = "Eval results",
  overallScore,
  overallDelta,
  criteria,
  className,
}: RegistryEvalChecklistProps): JSX.Element {
  const passed = criteria.filter((c) => c.passed).length;
  const pct =
    criteria.length > 0 ? Math.round((passed / criteria.length) * 100) : 0;

  return (
    <div className={cn("registry-eval-panel flex flex-col gap-4 lg:flex-row", className)}>
      <div className="registry-eval-summary shrink-0 space-y-4 lg:w-[280px]">
        <div>
          <div className="text-[11px] uppercase tracking-[0.08em] text-ink-muted">Skill eval report</div>
          <div className="mt-3">
            <div className="text-[12px] text-ink-muted">Overall</div>
            <div className="font-mono text-[48px] font-semibold leading-none text-registry-accent">
              {overallScore ?? pct}
            </div>
            {overallDelta != null && overallDelta > 0 ? (
              <span className="registry-delta mt-1 inline-block">↑ {overallDelta.toFixed(2)}x</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-ink">{title}</h3>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[15px] font-semibold text-ink">{pct}%</span>
            {overallDelta != null && overallDelta > 0 ? (
              <span className="registry-delta">↑ {Math.round(overallDelta * 22)}%</span>
            ) : null}
          </div>
        </div>
        <ul className="flex flex-col gap-2">
          {criteria.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-1 px-3 py-2.5"
            >
              <span className="min-w-0 truncate text-[13px] text-ink">{c.label}</span>
              <span className="flex shrink-0 items-center gap-1.5 font-mono text-[12px] text-registry-accent">
                {c.passed ? (
                  <CheckCircle2 size={14} className="text-registry-accent" aria-hidden />
                ) : (
                  <Circle size={14} className="text-ink-muted" aria-hidden />
                )}
                {c.score ?? (c.passed ? 100 : 0)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
