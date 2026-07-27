import { cn } from "@/lib/utils";

export interface RegistryMetricBarProps {
  label: string;
  value: number;
  hint?: string;
  delta?: number | null;
  tone?: "quality" | "impact" | "security";
  sublabel?: string;
  passedLabel?: string;
  onClick?: () => void;
  className?: string;
}

function barColor(value: number, tone: RegistryMetricBarProps["tone"]): string {
  if (tone === "security") return value >= 100 ? "bg-registry-accent" : "bg-warn";
  if (value >= 90) return "bg-registry-accent";
  if (value >= 70) return "bg-warn";
  return "bg-err";
}

/** Tessl-style metric progress bar (Quality / Impact / Security). */
export function RegistryMetricBar({
  label,
  value,
  hint,
  delta,
  tone = "quality",
  sublabel,
  passedLabel,
  onClick,
  className,
}: RegistryMetricBarProps): JSX.Element {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "registry-metric flex min-w-0 flex-1 flex-col gap-1.5 rounded-lg border border-line bg-surface-1 p-3 text-left",
        onClick && "transition-colors hover:border-registry-accent/50",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[13px] font-medium text-ink">{label}</span>
          {sublabel ? (
            <span className="ml-1.5 text-[11px] text-ink-muted">{sublabel}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {passedLabel ? (
            <span className="text-[12px] font-semibold text-registry-accent">{passedLabel}</span>
          ) : null}
          {delta != null && delta > 0 ? (
            <span className="registry-delta text-[11px]">↑ {delta.toFixed(2)}x</span>
          ) : null}
          <span className="font-mono text-[15px] font-semibold text-registry-accent">{value}%</span>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
        <div
          className={cn("h-full rounded-full transition-all", barColor(value, tone))}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      {hint ? <p className="text-[11.5px] text-ink-muted">{hint}</p> : null}
    </Wrapper>
  );
}
