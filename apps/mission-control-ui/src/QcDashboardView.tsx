/**
 * QC Dashboard View
 *
 * Overview of quality control runs, trends, and key metrics.
 * Environment filter, Start QC Run modal, latest findings, environment health strip.
 */

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RiskBadge, StatusBadge, type StatusBadgeProps } from "@/components/factory/badges";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Clock, Play } from "lucide-react";
import { MiniBarChart } from "@/components/factory/MiniBarChart";
import { cn } from "@/lib/utils";

const ENV_OPTIONS = [
  "ALL",
  "local",
  "dev",
  "staging",
  "pilot",
  "production",
] as const;
type EnvFilter = (typeof ENV_OPTIONS)[number];

interface QcDashboardViewProps {
  projectId: Id<"projects"> | null;
  onRunSelect?: (runId: Id<"qcRuns">) => void;
  onOpenStartQcRun?: () => void;
}

function RiskGradeBadge({ grade }: { grade: "GREEN" | "YELLOW" | "RED" | undefined }) {
  if (!grade) return <StatusBadge tone="neutral">N/A</StatusBadge>;
  return <RiskBadge level={grade} className="font-mono" />;
}

const RUN_STATUS_TONE: Record<string, StatusBadgeProps["tone"]> = {
  COMPLETED: "success",
  RUNNING: "info",
  PENDING: "neutral",
  FAILED: "error",
  CANCELED: "neutral",
};

function RunStatusBadge({ status }: { status: string }) {
  return (
    <StatusBadge tone={RUN_STATUS_TONE[status] ?? "neutral"}>{status}</StatusBadge>
  );
}

function gradeDotClass(grade: "GREEN" | "YELLOW" | "RED" | null | undefined): string {
  if (grade === "RED") return "bg-err";
  if (grade === "YELLOW") return "bg-warn";
  if (grade === "GREEN") return "bg-ok";
  return "bg-ink-muted";
}

export function QcDashboardView({ projectId, onRunSelect, onOpenStartQcRun }: QcDashboardViewProps) {
  const [envFilter, setEnvFilter] = useState<EnvFilter>("ALL");

  const runsList = useQuery(
    api.qcRuns.list,
    { projectId: projectId ?? undefined, limit: 50 }
  );
  const runsByEnv = useQuery(
    api.qcRuns.listByEnvironment,
    envFilter !== "ALL" && projectId
      ? { projectId, environment: envFilter, limit: 50 }
      : "skip"
  );
  const envSummary = useQuery(api.qcRuns.environmentSummary, { projectId: projectId ?? undefined });

  const runs = (envFilter === "ALL" ? runsList : runsByEnv) ?? [];

  const completedRuns = runs
    .filter((r) => r.status === "COMPLETED")
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const latestRun = completedRuns[0] ?? null;
  const previousRun = completedRuns[1] ?? null;
  const scoresForTrend = completedRuns
    .filter((r) => r.qualityScore !== undefined)
    .slice(0, 10)
    .map((r) => ({
      runId: r.runId,
      runSequence: r.runSequence,
      qualityScore: r.qualityScore!,
      riskGrade: r.riskGrade,
      completedAt: r.completedAt,
    }))
    .reverse();

  const latestFindings = useQuery(
    api.qcFindings.listByRun,
    latestRun?._id ? { qcRunId: latestRun._id, severity: "RED" } : "skip"
  );
  const topRedFindings = (latestFindings ?? []).slice(0, 5);

  let trend: "up" | "down" | "neutral" = "neutral";
  if (latestRun && previousRun && latestRun.qualityScore !== undefined && previousRun.qualityScore !== undefined) {
    if (latestRun.qualityScore > previousRun.qualityScore) trend = "up";
    else if (latestRun.qualityScore < previousRun.qualityScore) trend = "down";
  }

  const totalRuns = runs.length;
  const redRuns = completedRuns.filter((r) => r.riskGrade === "RED").length;
  const yellowRuns = completedRuns.filter((r) => r.riskGrade === "YELLOW").length;
  const greenRuns = completedRuns.filter((r) => r.riskGrade === "GREEN").length;
  const avgQualityScore = completedRuns.length > 0
    ? Math.round(completedRuns.reduce((sum, r) => sum + (r.qualityScore ?? 0), 0) / completedRuns.length)
    : 0;

  if (envFilter === "ALL" && !runsList) {
    return (
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-center px-6 py-16">
        <div className="text-[13.5px] text-ink-muted">Loading QC runs...</div>
      </div>
    );
  }
  if (envFilter !== "ALL" && runsByEnv === undefined) {
    return (
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-center px-6 py-16">
        <div className="text-[13.5px] text-ink-muted">Loading QC runs...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 py-6">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">
              Quality Control
            </h1>
            <StatusBadge tone="neutral">{totalRuns} runs</StatusBadge>
          </div>
          <p className="mt-1.5 text-[14px] text-ink-secondary">
            Automated quality checks, coverage analysis, and delivery gates.
          </p>
        </div>
        <div className="shrink-0">
          <Button size="sm" className="gap-2" onClick={onOpenStartQcRun}>
            <Play className="h-4 w-4" strokeWidth={1.75} />
            Start QC Run
          </Button>
        </div>
      </div>

      {/* Environment filter tabs */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold text-ink">Environment lens</div>
            <div className="mt-1 text-[12.5px] text-ink-muted">Filter the QC posture by environment</div>
          </div>
          <Tabs value={envFilter} onValueChange={(v) => setEnvFilter(v as EnvFilter)}>
            <TabsList className="flex h-auto flex-wrap gap-1">
              {ENV_OPTIONS.map((env) => (
                <TabsTrigger key={env} value={env} className="text-[12.5px]">
                  {env === "ALL" ? "All" : env}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </Card>

      {/* Environment health strip */}
      {envSummary && envSummary.length > 0 && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[15px] font-semibold text-ink">Environment posture</div>
              <div className="mt-1 text-[12.5px] text-ink-muted">Quick quality read across local, staging, and production lanes</div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {envSummary.map((s) => (
                <TooltipProvider key={s.environment}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] text-ink-secondary">
                        <span
                          aria-hidden
                          className={cn("inline-block h-2 w-2 rounded-full", gradeDotClass(s.latestGrade))}
                        />
                        {s.environment}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      {s.environment}: {s.latestGrade ?? "—"} {s.latestScore != null ? `(${s.latestScore})` : ""} · {s.runCount} runs
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="text-[12.5px] font-medium text-ink-secondary">Latest Score</div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-mono text-[26px] font-semibold leading-none text-ink">{latestRun?.qualityScore ?? "--"}</div>
            {trend === "up" && <TrendingUp className="h-4 w-4 text-ok" strokeWidth={1.75} />}
            {trend === "down" && <TrendingDown className="h-4 w-4 text-err" strokeWidth={1.75} />}
          </div>
          <div className="mt-1 text-[12px] text-ink-muted">
            {latestRun ? `Run ${latestRun.runId}` : "No runs yet"}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-[12.5px] font-medium text-ink-secondary">Avg Quality</div>
          <div className="mt-2 font-mono text-[26px] font-semibold leading-none text-ink">{avgQualityScore}</div>
          <div className="mt-1 text-[12px] text-ink-muted">
            Across {completedRuns.length} runs
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-[12.5px] font-medium text-ink-secondary">Risk Distribution</div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span aria-hidden className="h-2 w-2 rounded-full bg-err" />
              <span className="text-[13px] font-medium text-ink">{redRuns}</span>
            </div>
            <div className="flex items-center gap-1">
              <span aria-hidden className="h-2 w-2 rounded-full bg-warn" />
              <span className="text-[13px] font-medium text-ink">{yellowRuns}</span>
            </div>
            <div className="flex items-center gap-1">
              <span aria-hidden className="h-2 w-2 rounded-full bg-ok" />
              <span className="text-[13px] font-medium text-ink">{greenRuns}</span>
            </div>
          </div>
          <div className="mt-1 text-[12px] text-ink-muted">
            RED / YELLOW / GREEN
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-[12.5px] font-medium text-ink-secondary">Total Runs</div>
          <div className="mt-2 font-mono text-[26px] font-semibold leading-none text-ink">{totalRuns}</div>
          <div className="mt-1 text-[12px] text-ink-muted">
            {runs.filter((r) => r.status === "RUNNING").length} running
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
      {/* Quality Score Trend */}
      {scoresForTrend.length > 0 && (
        <Card className="p-6">
          <h3 className="mb-4 text-[15px] font-semibold text-ink">Quality Score Trend</h3>
          <MiniBarChart
            points={scoresForTrend.map((s) => ({
              key: s.runId,
              value: s.qualityScore,
              max: 100,
              label: `#${s.runSequence}`,
              title: `Run ${s.runId}: ${s.qualityScore} ${s.riskGrade ?? ""}`,
              colorClass:
                s.riskGrade === "RED"
                  ? "bg-err"
                  : s.riskGrade === "YELLOW"
                    ? "bg-warn"
                    : "bg-ok",
            }))}
            maxValue={100}
            heightClass="h-32"
          />
        </Card>
      )}

      {/* Latest Findings (RED) */}
      {topRedFindings.length > 0 && (
        <Card className="p-6">
          <h3 className="mb-4 text-[15px] font-semibold text-ink">Latest RED Findings</h3>
          <div className="space-y-2">
            {topRedFindings.map((f) => (
              <div
                key={f._id}
                className="rounded-lg border border-line bg-surface-2 p-3"
              >
                <div className="flex items-center gap-2">
                  <StatusBadge tone="error">RED</StatusBadge>
                  <div className="text-[13.5px] font-medium text-ink">{f.title}</div>
                </div>
                <div className="mt-1 text-[12.5px] text-ink-secondary">{f.description}</div>
                {f.filePaths?.length ? (
                  <div className="mt-1 font-mono text-[12px] text-ink-muted">
                    {f.filePaths.slice(0, 2).join(", ")}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      )}
      </div>

      <Card className="p-5">
        <div className="text-[15px] font-semibold text-ink">Operator guidance</div>
        <div className="mt-2 space-y-3 text-[13px] leading-relaxed text-ink-secondary">
          <p>The dashboard matters most when it tells you whether a release should keep moving. Trends matter less than the newest red findings and the latest gate result.</p>
          <p>Use environment filters to separate local noise from production risk. A green local run does not buy confidence if staging is yellow or red.</p>
        </div>
      </Card>
      </div>

      {/* Recent Runs */}
      <Card className="p-6">
        <h3 className="mb-4 text-[15px] font-semibold text-ink">Recent Runs</h3>
        <div className="space-y-3">
          {runs.slice(0, 10).map((run) => (
            <div
              key={run._id}
              className="flex cursor-pointer items-center justify-between rounded-lg border border-line p-3 transition-colors duration-150 hover:bg-surface-2"
              onClick={() => onRunSelect?.(run._id)}
            >
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <div className="font-mono text-[13px] font-medium text-ink">{run.runId}</div>
                  <div className="text-[12.5px] text-ink-muted">
                    {run.branch ?? "main"} · <span className="font-mono">{run.commitSha?.substring(0, 7)}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {run.qualityScore !== undefined && (
                  <div className="font-mono text-[13px] font-medium text-ink">{run.qualityScore}</div>
                )}
                <RiskGradeBadge grade={run.riskGrade} />
                <RunStatusBadge status={run.status} />
                {run.status === "COMPLETED" && run.gatePassed === false && (
                  <AlertTriangle className="h-4 w-4 text-err" strokeWidth={1.75} />
                )}
                {run.status === "COMPLETED" && run.gatePassed === true && (
                  <CheckCircle2 className="h-4 w-4 text-ok" strokeWidth={1.75} />
                )}
                {run.status === "RUNNING" && (
                  <Clock className="h-4 w-4 text-info-accent" strokeWidth={1.75} />
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
