import { cn } from "@/lib/utils";
import { CHART_SERIES } from "@/components/factory/chartTheme";

export type MiniBarPoint = {
  key: string;
  value: number;
  max?: number;
  label?: string;
  title?: string;
  colorClass?: string;
};

export function MiniBarChart({
  points,
  maxValue,
  emptyMessage = "No data in this window.",
  heightClass = "h-32",
}: {
  points: MiniBarPoint[];
  maxValue?: number;
  emptyMessage?: string;
  heightClass?: string;
}) {
  if (points.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-lg border border-dashed border-line bg-surface-2/50 text-[13px] text-ink-muted",
          heightClass,
        )}
      >
        {emptyMessage}
      </div>
    );
  }

  const cap = maxValue ?? Math.max(...points.map((p) => p.value), 1);

  return (
    <div className={cn("flex items-end gap-2", heightClass)}>
      {points.map((point) => {
        const height = Math.max(4, (point.value / cap) * 100);
        return (
          <div
            key={point.key}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
            title={point.title}
          >
            <div
              className={cn("w-full rounded-t", point.colorClass ?? "bg-ok")}
              style={{ height: `${height}%` }}
            />
            {point.label && (
              <div className="font-mono text-[11px] text-ink-muted">{point.label}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export const MINI_BAR_COLORS = {
  ok: "bg-ok",
  warn: "bg-warn",
  err: "bg-err",
  info: "bg-info-accent",
  series: CHART_SERIES[1],
} as const;
