import { cn } from "@/lib/utils";
import { formatMoney, formatSeconds } from "@/lib/schematicFormatters";

export interface SchematicKpi {
  value: string | number;
  label: string;
  /** Highlight value in accent green (e.g. spend) */
  money?: boolean;
}

export function SchematicKpiStrip({
  kpis,
  className,
}: {
  kpis: SchematicKpi[];
  className?: string;
}): JSX.Element {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6",
        className
      )}
      aria-label="Factory metrics"
    >
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className="rounded-lg border border-line bg-surface-1 px-3.5 py-3"
        >
          <b
            className={cn(
              "block text-[19px] font-semibold tabular-nums leading-none",
              kpi.money ? "text-ok" : "text-ink"
            )}
          >
            {typeof kpi.value === "number" && kpi.money
              ? formatMoney(kpi.value)
              : kpi.value}
          </b>
          <span className="mt-1 block text-[11.5px] text-ink-secondary">{kpi.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Build KPI row from factory stats. */
export function buildFactoryKpis(stats: {
  totalCost: number;
  avgTurnMs: number | null;
  turns: number;
  toolCalls: number;
  facts: number;
  events: number;
}): SchematicKpi[] {
  return [
    { value: stats.totalCost, label: "spent · all-time", money: true },
    { value: formatSeconds(stats.avgTurnMs), label: "avg turn" },
    { value: stats.turns, label: "turns" },
    { value: stats.toolCalls, label: "tool calls" },
    { value: stats.facts, label: "facts" },
    { value: stats.events, label: "events" },
  ];
}
