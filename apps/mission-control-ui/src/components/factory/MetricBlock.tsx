import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface MetricBlockProps {
  label: string;
  value: ReactNode;
  /** Small line under the value, e.g. "Average score across 3 eval scenarios" */
  detail?: string;
  /** Right-aligned adornment next to the value (TrendBadge, status text, …) */
  adornment?: ReactNode;
  className?: string;
}

/** Header metric cell used in detail-page metric rows and overview grids. */
export function MetricBlock({
  label,
  value,
  detail,
  adornment,
  className,
}: MetricBlockProps): JSX.Element {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 rounded-lg border border-line bg-surface-1 px-3 py-3 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0", className)}>
      <div className="text-[12.5px] font-medium text-ink-secondary">{label}</div>
      <div className="flex items-center gap-2">
        <div className="text-[20px] font-semibold leading-none text-ink">{value}</div>
        {adornment}
      </div>
      {detail && <div className="text-[12px] text-ink-muted">{detail}</div>}
    </div>
  );
}

export function MetricRow({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 border-b border-line pb-4 sm:gap-5 sm:pb-5 lg:grid-cols-3 xl:grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  );
}
