import { cn } from "@/lib/utils";
import {
  CHART_CONTAINER_CLASS,
  CHART_GRID_COLOR,
  CHART_SERIES,
  CHART_STROKE_WIDTH,
  CHART_TICK_STYLE,
  CHART_TOOLTIP_CONTENT_STYLE,
} from "@/components/factory/chartTheme";
import {
  Area,
  AreaChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ChartWindow = 24 | 168 | 720;

export interface UsagePoint {
  period: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

function formatPeriodTick(value: string, windowHours: ChartWindow): string {
  if (windowHours === 24) {
    const hour = value.slice(11, 13);
    return hour ? `${hour}h` : value;
  }
  if (windowHours === 168) return value.slice(5, 10);
  return value.slice(0, 10);
}

function ChartEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-line bg-surface-2/50">
      <p className="text-[13px] text-ink-muted">{message}</p>
    </div>
  );
}

export function UsageTrendCharts({
  series,
  windowHours,
  onWindowChange,
  onOpenCostAnalytics,
  secondaryButtonClass,
}: {
  series: UsagePoint[];
  windowHours: ChartWindow;
  onWindowChange: (w: ChartWindow) => void;
  onOpenCostAnalytics?: () => void;
  secondaryButtonClass?: string;
}): JSX.Element {
  const data = series.map((d) => ({ ...d, totalTokens: d.inputTokens + d.outputTokens }));
  const hasUsage = data.some((d) => d.totalTokens > 0 || d.costUsd > 0);
  const windows: { value: ChartWindow; label: string }[] = [
    { value: 24, label: "24h" },
    { value: 168, label: "7d" },
    { value: 720, label: "30d" },
  ];
  const btnClass =
    secondaryButtonClass ??
    "rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-ink-secondary transition-colors duration-150 hover:bg-surface-2 hover:text-ink";

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-medium uppercase tracking-[0.06em] text-ink-muted">Usage</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-line p-0.5">
            {windows.map((w) => (
              <button
                key={w.value}
                type="button"
                onClick={() => onWindowChange(w.value)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors duration-150",
                  windowHours === w.value
                    ? "bg-surface-2 text-ink"
                    : "text-ink-muted hover:text-ink-secondary",
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
          {onOpenCostAnalytics && (
            <button type="button" className={btnClass} onClick={onOpenCostAnalytics}>
              Cost analytics
            </button>
          )}
        </div>
      </div>
      {!hasUsage ? (
        <ChartEmptyState message="No usage in this window." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className={CHART_CONTAINER_CLASS}>
            <div className="mb-3 text-[12.5px] font-medium text-ink-secondary">Token usage</div>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="period"
                    tick={CHART_TICK_STYLE}
                    tickLine={{ stroke: CHART_GRID_COLOR }}
                    axisLine={{ stroke: CHART_GRID_COLOR }}
                    tickFormatter={(v: string) => formatPeriodTick(v, windowHours)}
                  />
                  <YAxis
                    tick={CHART_TICK_STYLE}
                    tickLine={{ stroke: CHART_GRID_COLOR }}
                    axisLine={{ stroke: CHART_GRID_COLOR }}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                    }
                  />
                  <RechartsTooltip
                    contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                    formatter={(value: number) => [
                      value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value,
                      "Tokens",
                    ]}
                    labelFormatter={(l) => (typeof l === "string" ? l : "")}
                  />
                  <Area
                    type="monotone"
                    dataKey="totalTokens"
                    stroke={CHART_SERIES[1]}
                    fill={CHART_SERIES[1]}
                    fillOpacity={0.12}
                    strokeWidth={CHART_STROKE_WIDTH}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className={CHART_CONTAINER_CLASS}>
            <div className="mb-3 text-[12.5px] font-medium text-ink-secondary">Cost trend</div>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="period"
                    tick={CHART_TICK_STYLE}
                    tickLine={{ stroke: CHART_GRID_COLOR }}
                    axisLine={{ stroke: CHART_GRID_COLOR }}
                    tickFormatter={(v: string) => formatPeriodTick(v, windowHours)}
                  />
                  <YAxis
                    tick={CHART_TICK_STYLE}
                    tickLine={{ stroke: CHART_GRID_COLOR }}
                    axisLine={{ stroke: CHART_GRID_COLOR }}
                    tickFormatter={(v: number) => `$${Number(v).toFixed(2)}`}
                  />
                  <RechartsTooltip
                    contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
                    formatter={(value: number) => [`$${Number(value).toFixed(2)}`, "Cost"]}
                    labelFormatter={(l) => (typeof l === "string" ? l : "")}
                  />
                  <Line
                    type="monotone"
                    dataKey="costUsd"
                    stroke={CHART_SERIES[0]}
                    strokeWidth={CHART_STROKE_WIDTH}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
