import { cn } from "@/lib/utils";

export function ProgressBar({
  fraction,
  className,
  barClassName,
}: {
  fraction: number;
  className?: string;
  barClassName?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(fraction * 100)));
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-surface-2", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-150 ease-out", barClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
