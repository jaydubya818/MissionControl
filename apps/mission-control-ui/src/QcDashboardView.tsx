/**
 * QC Dashboard View
 * 
 * Overview of quality control runs, trends, and key metrics.
 */

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Clock, Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface QcDashboardViewProps {
  projectId: Id<"projects"> | null;
  onRunSelect?: (runId: Id<"qcRuns">) => void;
}

function RiskGradeBadge({ grade }: { grade: "GREEN" | "YELLOW" | "RED" | undefined }) {
  if (!grade) return <Badge variant="outline">N/A</Badge>;
  
  const colors = {
    GREEN: "bg-green-500/10 text-green-600 border-green-500/20",
    YELLOW: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    RED: "bg-red-500/10 text-red-600 border-red-500/20",
  };
  
  return (
    <Badge variant="outline" className={cn("font-mono", colors[grade])}>
      {grade}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    COMPLETED: "bg-green-500/10 text-green-600 border-green-500/20",
    RUNNING: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    PENDING: "bg-gray-500/10 text-gray-600 border-gray-500/20",
    FAILED: "bg-red-500/10 text-red-600 border-red-500/20",
    CANCELED: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  };
  
  return (
    <Badge variant="outline" className={cn("text-xs", colors[status] || "")}>
      {status}
    </Badge>
  );
}

export function QcDashboardView({ projectId, onRunSelect }: QcDashboardViewProps) {
  const runs = useQuery(api.qcRuns.list, { projectId: projectId ?? undefined, limit: 20 });
  const scores = useQuery(api.qcRuns.projectScores, projectId ? { projectId, limit: 10 } : "skip");

  if (!runs) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading QC runs...</div>
      </div>
    );
  }

  const completedRuns = runs.filter((r) => r.status === "COMPLETED");
  const latestRun = completedRuns[0];
  const previousRun = completedRuns[1];

  // Compute trend
  let trend: "up" | "down" | "neutral" = "neutral";
  if (latestRun && previousRun && latestRun.qualityScore !== undefined && previousRun.qualityScore !== undefined) {
    if (latestRun.qualityScore > previousRun.qualityScore) trend = "up";
    else if (latestRun.qualityScore < previousRun.qualityScore) trend = "down";
  }

  // Aggregate stats
  const totalRuns = runs.length;
  const redRuns = completedRuns.filter((r) => r.riskGrade === "RED").length;
  const yellowRuns = completedRuns.filter((r) => r.riskGrade === "YELLOW").length;
  const greenRuns = completedRuns.filter((r) => r.riskGrade === "GREEN").length;
  const avgQualityScore = completedRuns.length > 0
    ? Math.round(completedRuns.reduce((sum, r) => sum + (r.qualityScore ?? 0), 0) / completedRuns.length)
    : 0;

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Quality Control
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automated quality checks, coverage analysis, and delivery gates
          </p>
        </div>
        <Button size="sm" className="gap-2">
          <Play className="h-4 w-4" />
          Start QC Run
        </Button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Latest Score</div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="text-3xl font-bold">{latestRun?.qualityScore ?? "--"}</div>
            {trend === "up" && <TrendingUp className="h-4 w-4 text-green-500" />}
            {trend === "down" && <TrendingDown className="h-4 w-4 text-red-500" />}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {latestRun ? `Run ${latestRun.runId}` : "No runs yet"}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Avg Quality</div>
          <div className="mt-2 text-3xl font-bold">{avgQualityScore}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Across {completedRuns.length} runs
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Risk Distribution</div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-red-500" />
              <span className="text-sm font-medium">{redRuns}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-yellow-500" />
              <span className="text-sm font-medium">{yellowRuns}</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm font-medium">{greenRuns}</span>
            </div>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            RED / YELLOW / GREEN
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Runs</div>
          <div className="mt-2 text-3xl font-bold">{totalRuns}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {runs.filter((r) => r.status === "RUNNING").length} running
          </div>
        </Card>
      </div>

      {/* Quality Score Trend */}
      {scores && scores.length > 0 && (
        <Card className="p-6">
          <h3 className="text-sm font-semibold mb-4">Quality Score Trend</h3>
          <div className="flex items-end gap-2 h-32">
            {scores.reverse().map((s, i) => {
              const height = (s.qualityScore / 100) * 100;
              const color = s.riskGrade === "RED" ? "bg-red-500" : s.riskGrade === "YELLOW" ? "bg-yellow-500" : "bg-green-500";
              return (
                <div key={s.runId} className="flex-1 flex flex-col items-center gap-1">
                  <div className={cn("w-full rounded-t", color)} style={{ height: `${height}%` }} />
                  <div className="text-[0.6rem] text-muted-foreground">#{s.runSequence}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Recent Runs */}
      <Card className="p-6">
        <h3 className="text-sm font-semibold mb-4">Recent Runs</h3>
        <div className="space-y-3">
          {runs.slice(0, 10).map((run) => (
            <div
              key={run._id}
              className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors cursor-pointer"
              onClick={() => onRunSelect?.(run._id)}
            >
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <div className="font-mono text-sm font-medium">{run.runId}</div>
                  <div className="text-xs text-muted-foreground">
                    {run.branch ?? "main"} • {run.commitSha?.substring(0, 7)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {run.qualityScore !== undefined && (
                  <div className="text-sm font-medium">{run.qualityScore}</div>
                )}
                <RiskGradeBadge grade={run.riskGrade} />
                <StatusBadge status={run.status} />
                {run.status === "COMPLETED" && run.gatePassed === false && (
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                )}
                {run.status === "COMPLETED" && run.gatePassed === true && (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                )}
                {run.status === "RUNNING" && (
                  <Clock className="h-4 w-4 text-blue-500 animate-pulse" />
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
