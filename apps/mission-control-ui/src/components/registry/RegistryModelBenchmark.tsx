import { TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RegistryModelBenchmarkProps {
  baselineScore?: number | null;
  candidateScore?: number | null;
  className?: string;
}

/** Model benchmark insight: smaller model + right context ≈ frontier (Opus 4.7 study). */
export function RegistryModelBenchmark({
  baselineScore,
  candidateScore,
  className,
}: RegistryModelBenchmarkProps): JSX.Element {
  const delta =
    baselineScore != null && candidateScore != null ? candidateScore - baselineScore : null;
  const costWin = delta != null && delta >= 15;

  return (
    <div className={cn("rounded-xl border border-line bg-surface-1 p-5", className)}>
      <div className="flex items-start gap-3">
        <TrendingDown size={18} className="mt-0.5 shrink-0 text-registry-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-ink">Cost-saving opportunity</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-secondary">
            Across 9 models and 11 Node.js agent skills, a smaller Anthropic model with the right
            context performed nearly as well as the frontier model — at a fraction of the cost.
            Eval your skill under Haiku (or your team&apos;s budget model) before defaulting to Opus.
          </p>
          {baselineScore != null && candidateScore != null ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <Stat label="Without skill" value={`${baselineScore}%`} />
              <Stat label="With skill" value={`${candidateScore}%`} highlight />
              <Stat
                label="Context lift"
                value={delta != null ? `${delta >= 0 ? "+" : ""}${delta} pts` : "—"}
                highlight={costWin}
              />
            </div>
          ) : (
            <p className="mt-3 text-[12px] text-ink-muted">
              Run scenario evals on a package to see baseline vs with-context lift for your team&apos;s
              conventions.
            </p>
          )}
          {costWin ? (
            <p className="mt-3 rounded-lg border border-ok/30 bg-ok/5 px-3 py-2 text-[12px] text-ink-secondary">
              Strong context lift detected — this skill may enable a cheaper model tier for its
              scenarios. Document optimized model + version in package metadata.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}): JSX.Element {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2",
        highlight ? "border-registry-accent/30 bg-registry-accent-soft/40" : "border-line bg-surface-2"
      )}
    >
      <div className="text-[10px] uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-0.5 font-mono text-[18px] font-semibold text-ink">{value}</div>
    </div>
  );
}
