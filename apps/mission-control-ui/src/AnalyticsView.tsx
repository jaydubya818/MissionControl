import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { BarChart3 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../../../convex/_generated/api";
import { PageHeader } from "./components/PageHeader";
import { EmptyState } from "./components/ui/empty-state";
import {
  CHART_CONTAINER_CLASS,
  CHART_GRID_COLOR,
  CHART_SERIES,
  CHART_TICK_STYLE,
  CHART_TOOLTIP_CONTENT_STYLE,
} from "./components/factory/chartTheme";
import { cn } from "./lib/utils";

// ---------------------------------------------------------------------------
// Data shapes (mirror convex/analytics.ts return types)
// ---------------------------------------------------------------------------

export interface KpiDatum {
  value: number;
  delta: number;
}

export interface KpiSummary {
  runs: KpiDatum;
  tasksCompleted: KpiDatum;
  costUsd: KpiDatum;
  policyDenials: KpiDatum;
}

export interface DailyCostDay {
  date: string;
  series: Record<string, number>;
}

export interface DailyModelCost {
  days: DailyCostDay[];
  models: string[];
}

export interface HeatmapDay {
  date: string;
  count: number;
}

export interface HeatmapStats {
  mostActiveMonth: string | null;
  mostActiveDay: string | null;
  longestStreakDays: number;
  currentStreakDays: number;
}

export interface ActivityHeatmapData {
  days: HeatmapDay[];
  stats: HeatmapStats;
}

// ---------------------------------------------------------------------------
// KPI band
// ---------------------------------------------------------------------------

function DeltaChip({
  delta,
  invert = false,
  format,
}: {
  delta: number;
  /** For metrics where an increase is bad (policy denials). */
  invert?: boolean;
  format?: (n: number) => string;
}): JSX.Element {
  const magnitude = format ? format(Math.abs(delta)) : String(Math.abs(delta));
  const good = invert ? delta < 0 : delta > 0;
  const tone =
    delta === 0 ? "text-ink-muted" : good ? "text-ok" : "text-err";
  const text = delta === 0 ? `±${magnitude}` : `${delta > 0 ? "+" : "-"}${magnitude}`;
  return <span className={cn("font-mono text-[11.5px] leading-none", tone)}>{text}</span>;
}

function KpiCell({
  label,
  dotClass,
  value,
  delta,
  invert,
  format,
}: {
  label: string;
  dotClass: string;
  value: string;
  delta: number;
  invert?: boolean;
  format?: (n: number) => string;
}): JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} aria-hidden />
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted">
            {label}
          </span>
        </div>
        <DeltaChip delta={delta} invert={invert} format={format} />
      </div>
      <div className="text-[28px] font-semibold leading-none text-ink">{value}</div>
    </div>
  );
}

const formatUsd = (n: number): string => `$${n.toFixed(2)}`;

function KpiBand({ kpis }: { kpis: KpiSummary }): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-6 border-b border-line pb-6 lg:grid-cols-4">
      <KpiCell
        label="Runs"
        dotClass="bg-info-accent"
        value={String(kpis.runs.value)}
        delta={kpis.runs.delta}
      />
      <KpiCell
        label="Tasks Completed"
        dotClass="bg-ok"
        value={String(kpis.tasksCompleted.value)}
        delta={kpis.tasksCompleted.delta}
      />
      <KpiCell
        label="Spend"
        dotClass="bg-warn"
        value={formatUsd(kpis.costUsd.value)}
        delta={kpis.costUsd.delta}
        format={formatUsd}
      />
      <KpiCell
        label="Policy Denials"
        dotClass="bg-err"
        value={String(kpis.policyDenials.value)}
        delta={kpis.policyDenials.delta}
        invert
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stacked daily cost chart
// ---------------------------------------------------------------------------

const PERIODS = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
] as const;

export type PeriodDays = (typeof PERIODS)[number]["days"];

function PeriodControl({
  periodDays,
  onPeriodChange,
}: {
  periodDays: number;
  onPeriodChange: (days: PeriodDays) => void;
}): JSX.Element {
  return (
    <div role="tablist" aria-label="Period" className="flex rounded-lg border border-line p-0.5">
      {PERIODS.map((p) => (
        <button
          key={p.days}
          role="tab"
          type="button"
          aria-selected={periodDays === p.days}
          onClick={() => onPeriodChange(p.days)}
          className={cn(
            "rounded-md px-2.5 py-1 text-[12.5px] transition-colors duration-150",
            periodDays === p.days
              ? "bg-surface-2 text-ink"
              : "text-ink-muted hover:text-ink-secondary"
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function formatRangeDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function DailyCostChart({
  dailyCost,
  periodDays,
  onPeriodChange,
}: {
  dailyCost: DailyModelCost;
  periodDays: number;
  onPeriodChange: (days: PeriodDays) => void;
}): JSX.Element {
  const { days, models } = dailyCost;

  // Model names can contain dots (recharts treats dotted dataKeys as paths),
  // so series use stable safe keys and carry the model as the display name.
  const chartData = useMemo(
    () =>
      days.map((d) => {
        const row: Record<string, number | string> = { date: d.date.slice(5) };
        models.forEach((model, i) => {
          row[`m${i}`] = d.series[model] ?? 0;
        });
        return row;
      }),
    [days, models]
  );

  const rangeText =
    days.length > 0
      ? `${formatRangeDate(days[0].date)} – ${formatRangeDate(days[days.length - 1].date)}`
      : "";

  return (
    <section className={CHART_CONTAINER_CLASS}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <PeriodControl periodDays={periodDays} onPeriodChange={onPeriodChange} />
          <h2 className="text-[15px] font-semibold text-ink">Daily cost by model</h2>
        </div>
        <span className="text-[12.5px] text-ink-muted">{rangeText}</span>
      </div>
      <div className="mt-4 h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} />
            <XAxis
              dataKey="date"
              tick={CHART_TICK_STYLE}
              axisLine={{ stroke: CHART_GRID_COLOR }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tick={CHART_TICK_STYLE}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `$${v}`}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_CONTENT_STYLE}
              cursor={{ fill: "rgba(244,245,247,0.05)" }}
              isAnimationActive={false}
              formatter={(value: number | string, name: string) => [
                formatUsd(Number(value)),
                name,
              ]}
            />
            {models.map((model, i) => (
              <Bar
                key={model}
                dataKey={`m${i}`}
                name={model}
                stackId="cost"
                fill={CHART_SERIES[i % CHART_SERIES.length]}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {models.map((model, i) => (
          <span key={model} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-[2px]"
              style={{ backgroundColor: CHART_SERIES[i % CHART_SERIES.length] }}
              aria-hidden
            />
            <span className="font-mono text-[11.5px] text-ink-secondary">{model}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Activity heatmap
// ---------------------------------------------------------------------------

const HEATMAP_STEPS = [0.18, 0.38, 0.65, 1] as const;
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function heatLevel(count: number, max: number): number {
  if (count === 0 || max === 0) return 0;
  const t = count / max;
  if (t > 0.75) return 4;
  if (t > 0.5) return 3;
  if (t > 0.25) return 2;
  return 1;
}

function heatStyle(level: number): React.CSSProperties | undefined {
  if (level === 0) return undefined;
  return { backgroundColor: `rgba(244,245,247,${HEATMAP_STEPS[level - 1]})` };
}

function buildWeeks(days: HeatmapDay[]): (HeatmapDay | null)[][] {
  if (days.length === 0) return [];
  const weeks: (HeatmapDay | null)[][] = [];
  let week: (HeatmapDay | null)[] = [];
  const firstDow = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
  for (let i = 0; i < firstDow; i++) week.push(null);
  for (const day of days) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

function monthLabels(weeks: (HeatmapDay | null)[][]): (string | null)[] {
  let prevMonth = "";
  return weeks.map((week, i) => {
    const first = week.find((d) => d !== null);
    if (!first) return null;
    const month = first.date.slice(5, 7);
    if (month === prevMonth) return null;
    prevMonth = month;
    // Skip a label squeezed into the very first column when the month started
    // in the previous (offscreen) week — matches GitHub's behavior loosely.
    if (i === 0 && first.date.slice(8, 10) > "21") return null;
    return MONTH_SHORT[Number(month) - 1];
  });
}

function StatCell({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-muted">
        {label}
      </span>
      <span className="text-[15px] font-semibold text-ink">{value}</span>
    </div>
  );
}

function ActivityHeatmap({ heatmap }: { heatmap: ActivityHeatmapData }): JSX.Element {
  const { days, stats } = heatmap;
  const weeks = useMemo(() => buildWeeks(days), [days]);
  const labels = useMemo(() => monthLabels(weeks), [weeks]);
  const max = useMemo(
    () => days.reduce((acc, d) => (d.count > acc ? d.count : acc), 0),
    [days]
  );

  const streak = (n: number): string => (n > 0 ? `${n} days` : "—");

  return (
    <section className="rounded-xl border border-line bg-surface-1 p-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[15px] font-semibold text-ink">Activity</h2>
        <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
          <span>Fewer</span>
          <span className="h-[10px] w-[10px] rounded-[3px] bg-surface-2" aria-hidden />
          {HEATMAP_STEPS.map((alpha) => (
            <span
              key={alpha}
              className="h-[10px] w-[10px] rounded-[3px]"
              style={{ backgroundColor: `rgba(244,245,247,${alpha})` }}
              aria-hidden
            />
          ))}
          <span>More</span>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto pb-1">
        <div className="flex gap-[3px]">
          {/* Weekday labels — spacer row matches the month-label row height */}
          <div className="mr-1 flex shrink-0 flex-col gap-[3px]">
            <div className="h-[14px]" />
            {["", "Mon", "", "Wed", "", "Fri", ""].map((label, i) => (
              <div
                key={i}
                className="flex h-[10px] items-center font-mono text-[10px] leading-none text-ink-muted"
              >
                {label}
              </div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex shrink-0 flex-col gap-[3px]">
              <div className="h-[14px] w-[10px] overflow-visible whitespace-nowrap font-mono text-[10px] leading-none text-ink-muted">
                {labels[wi]}
              </div>
              {week.map((day, di) =>
                day ? (
                  <div
                    key={day.date}
                    data-testid="heatmap-cell"
                    title={`${day.count} ${day.count === 1 ? "activity" : "activities"} on ${day.date}`}
                    className="h-[10px] w-[10px] rounded-[3px] bg-surface-2"
                    style={heatStyle(heatLevel(day.count, max))}
                  />
                ) : (
                  <div key={`pad-${wi}-${di}`} className="h-[10px] w-[10px]" />
                )
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-6 border-t border-line pt-4 sm:grid-cols-4">
        <StatCell label="Most Active Month" value={stats.mostActiveMonth ?? "—"} />
        <StatCell label="Most Active Day" value={stats.mostActiveDay ?? "—"} />
        <StatCell label="Longest Streak" value={streak(stats.longestStreakDays)} />
        <StatCell label="Current Streak" value={streak(stats.currentStreakDays)} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function LoadingSkeleton(): JSX.Element {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="h-[88px] animate-pulse rounded-xl bg-surface-2" />
      <div className="h-[320px] animate-pulse rounded-xl bg-surface-2" />
      <div className="h-[200px] animate-pulse rounded-xl bg-surface-2" />
    </div>
  );
}

export interface AnalyticsViewContentProps {
  kpis: KpiSummary | undefined;
  dailyCost: DailyModelCost | undefined;
  heatmap: ActivityHeatmapData | undefined;
  periodDays: number;
  onPeriodChange: (days: PeriodDays) => void;
}

/** Presentational analytics page (exported for tests). */
export function AnalyticsViewContent({
  kpis,
  dailyCost,
  heatmap,
  periodDays,
  onPeriodChange,
}: AnalyticsViewContentProps): JSX.Element {
  const loading = !kpis || !dailyCost || !heatmap;
  const hasData =
    !loading &&
    (kpis.runs.value > 0 ||
      kpis.tasksCompleted.value > 0 ||
      kpis.costUsd.value > 0 ||
      kpis.policyDenials.value > 0 ||
      dailyCost.models.length > 0 ||
      heatmap.days.some((d) => d.count > 0));

  return (
    <main className="relative flex-1 overflow-auto bg-app">
      <PageHeader
        title="Analytics"
        description="Activity, governance, and execution across the factory."
        icon={<BarChart3 className="h-4 w-4" strokeWidth={1.7} />}
      />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 py-6">
        {loading ? (
          <LoadingSkeleton />
        ) : !hasData ? (
          <EmptyState
            icon={BarChart3}
            title="No activity yet"
            description="Runs, task completions, and audit activity will appear here once agents start working."
          />
        ) : (
          <>
            <KpiBand kpis={kpis} />
            <DailyCostChart
              dailyCost={dailyCost}
              periodDays={periodDays}
              onPeriodChange={onPeriodChange}
            />
            <ActivityHeatmap heatmap={heatmap} />
          </>
        )}
      </div>
    </main>
  );
}

/** Data container — wires the three analytics queries. */
export function AnalyticsView(): JSX.Element {
  const [periodDays, setPeriodDays] = useState<PeriodDays>(30);
  const kpis = useQuery(api.analytics.kpiSummary, { periodDays }) as
    | KpiSummary
    | undefined;
  const dailyCost = useQuery(api.analytics.dailyModelCost, { periodDays }) as
    | DailyModelCost
    | undefined;
  const heatmap = useQuery(api.analytics.activityHeatmap, {}) as
    | ActivityHeatmapData
    | undefined;
  return (
    <AnalyticsViewContent
      kpis={kpis}
      dailyCost={dailyCost}
      heatmap={heatmap}
      periodDays={periodDays}
      onPeriodChange={setPeriodDays}
    />
  );
}
