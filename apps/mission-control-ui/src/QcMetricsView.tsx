/**
 * QC Metrics View
 *
 * Quality score trends, gate pass rates, finding rate charts, agent output quality panel.
 */

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RiskBadge, StatusBadge } from "@/components/factory/badges";
import { MiniBarChart } from "@/components/factory/MiniBarChart";
import { CheckCircle, XCircle, Bot } from "lucide-react";

const ENVIRONMENTS = ["local", "dev", "staging", "pilot", "production"] as const;
const TIME_RANGES = [
  { id: "7d", label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "30d", label: "30 days", ms: 30 * 24 * 60 * 60 * 1000 },
  { id: "90d", label: "90 days", ms: 90 * 24 * 60 * 60 * 1000 },
  { id: "all", label: "All", ms: 0 },
] as const;

interface QcMetricsViewProps {
  projectId: Id<"projects"> | null;
}

export function QcMetricsView({ projectId }: QcMetricsViewProps) {
  const [envTab, setEnvTab] = useState<string>("dev");
  const [timeRange, setTimeRange] = useState<string>("30d");

  const fromTs =
    timeRange === "all"
      ? undefined
      : Date.now() - (TIME_RANGES.find((t) => t.id === timeRange)?.ms ?? 0);
  const toTs = Date.now();

  const metrics = useQuery(
    api.qcMetrics.listByEnvironment,
    projectId
      ? {
          projectId,
          environment: envTab as "local" | "dev" | "staging" | "pilot" | "production",
          metricName: "quality_score",
          fromTs,
          toTs,
          limit: 50,
        }
      : "skip"
  );

  const aggregate = useQuery(
    api.qcMetrics.aggregate,
    projectId
      ? {
          projectId,
          environment: envTab as "local" | "dev" | "staging" | "pilot" | "production",
          metricName: "quality_score",
          fromTs,
          toTs,
        }
      : "skip"
  );

  const envSummary = useQuery(api.qcRuns.environmentSummary, { projectId: projectId ?? undefined });
  const runs = useQuery(api.qcRuns.list, {
    projectId: projectId ?? undefined,
    limit: 100,
  });

  const gatePassRate = useMemo(() => {
    if (!runs) return null;
    const completed = runs.filter((r) => r.status === "COMPLETED");
    const passed = completed.filter((r) => r.gatePassed === true).length;
    return completed.length ? Math.round((passed / completed.length) * 100) : 0;
  }, [runs]);

  const agentOutputRuns = useMemo(() => {
    if (!runs) return [];
    return runs.filter((r) => r.checkType === "AGENT_OUTPUT" && r.status === "COMPLETED");
  }, [runs]);

  const qualityScoresForChart = useMemo(() => {
    if (!metrics || !metrics.length) return [];
    const sorted = [...metrics].sort((a, b) => a.recordedAt - b.recordedAt);
    return sorted.slice(-20);
  }, [metrics]);

  const currentEnvSummary = envSummary?.find((s) => s.environment === envTab);

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 py-6">
      <header>
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">Metrics</h1>
        <p className="mt-1.5 text-[14px] text-ink-secondary">
          Quality score trends, gate pass rates, and agent output quality
        </p>
      </header>

      {/* Time range + environment tabs */}
      <div className="flex flex-wrap items-center gap-4">
        <Tabs value={timeRange} onValueChange={setTimeRange}>
          <TabsList>
            {TIME_RANGES.map((t) => (
              <TabsTrigger key={t.id} value={t.id}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Tabs value={envTab} onValueChange={setEnvTab}>
          <TabsList>
            {ENVIRONMENTS.map((e) => (
              <TabsTrigger key={e} value={e}>
                {e}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Gate pass rate */}
      <Card className="p-4">
        <h3 className="mb-2 text-[15px] font-semibold text-ink">Gate pass rate (all runs)</h3>
        <div className="flex items-center gap-4">
          {gatePassRate !== null ? (
            <>
              <div
                className={cn(
                  "font-mono text-[26px] font-semibold leading-none",
                  gatePassRate >= 80 && "text-ok",
                  gatePassRate >= 50 && gatePassRate < 80 && "text-warn",
                  gatePassRate < 50 && "text-err"
                )}
              >
                {gatePassRate}%
              </div>
              <div className="flex items-center gap-2 text-[13px] text-ink-secondary">
                <CheckCircle className="h-4 w-4 text-ok" strokeWidth={1.75} />
                <span>Passed</span>
                <XCircle className="ml-2 h-4 w-4 text-err" strokeWidth={1.75} />
                <span>Failed</span>
              </div>
            </>
          ) : (
            <span className="text-[13px] text-ink-muted">No completed runs</span>
          )}
        </div>
      </Card>

      {/* Quality score trend */}
      <Card className="p-6">
        <h3 className="mb-4 text-[15px] font-semibold text-ink">
          Quality score trend — {envTab}
        </h3>
        {qualityScoresForChart.length > 0 ? (
          <MiniBarChart
            points={qualityScoresForChart.map((m, i) => ({
              key: `${m.recordedAt}-${i}`,
              value: m.value,
              max: 100,
              title: `${new Date(m.recordedAt).toLocaleDateString()}: ${m.value}`,
              colorClass: "bg-ok",
            }))}
            maxValue={100}
            heightClass="h-40"
          />
        ) : (
          <div className="flex h-32 items-center justify-center text-[13px] text-ink-muted">
            No quality score data for this environment and range
          </div>
        )}
        {aggregate && aggregate.length > 0 && (
          <div className="mt-4 flex gap-4 font-mono text-[12px] text-ink-muted">
            <span>Avg: {Math.round(aggregate[0].avg)}</span>
            <span>Min: {aggregate[0].min}</span>
            <span>Max: {aggregate[0].max}</span>
            <span>P95: {aggregate[0].p95}</span>
          </div>
        )}
      </Card>

      {/* Agent output quality panel */}
      <Card className="p-6">
        <h3 className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-ink">
          <Bot className="h-4 w-4" strokeWidth={1.75} />
          Agent output quality
        </h3>
        <p className="mb-4 text-[12.5px] text-ink-muted">
          Runs with check type &quot;Agent Output&quot;
        </p>
        {agentOutputRuns.length > 0 ? (
          <div className="space-y-2">
            {agentOutputRuns.slice(0, 10).map((run) => (
              <div
                key={run._id}
                className="flex items-center justify-between rounded-lg border border-line p-3 transition-colors duration-150 hover:bg-surface-2"
              >
                <div>
                  <span className="font-mono text-[13px] text-ink">{run.runId}</span>
                  <span className="ml-2 text-[12.5px] text-ink-muted">
                    {run.environment ?? "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[13px] font-medium text-ink">{run.qualityScore ?? "—"}</span>
                  {run.riskGrade ? (
                    <RiskBadge level={run.riskGrade} />
                  ) : (
                    <StatusBadge tone="neutral">—</StatusBadge>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[13px] text-ink-muted">
            No agent output QC runs yet. Start a run with check type &quot;Agent Output&quot;.
          </div>
        )}
      </Card>

      {/* Current environment summary */}
      {currentEnvSummary && (
        <Card className="p-4">
          <h3 className="mb-2 text-[15px] font-semibold text-ink">Summary — {envTab}</h3>
          <div className="grid grid-cols-2 gap-4 text-[13px] sm:grid-cols-4">
            <div>
              <div className="text-[12.5px] text-ink-muted">Latest score</div>
              <div className="font-medium text-ink">{currentEnvSummary.latestScore ?? "—"}</div>
            </div>
            <div>
              <div className="text-[12.5px] text-ink-muted">Pass rate</div>
              <div className="font-medium text-ink">
                {currentEnvSummary.completedCount
                  ? Math.round(currentEnvSummary.passRate * 100)
                  : 0}
                %
              </div>
            </div>
            <div>
              <div className="text-[12.5px] text-ink-muted">Runs</div>
              <div className="font-medium text-ink">{currentEnvSummary.runCount}</div>
            </div>
            <div>
              <div className="text-[12.5px] text-ink-muted">R · Y · G</div>
              <div className="font-medium text-ink">
                {currentEnvSummary.redCount} · {currentEnvSummary.yellowCount} ·{" "}
                {currentEnvSummary.greenCount}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
