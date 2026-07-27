import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageHeader } from "./components/PageHeader";
import { Card } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { EmptyState } from "./components/ui/empty-state";
import { StatusBadge } from "./components/factory/badges";
import { MetricBlock } from "./components/factory/MetricBlock";
import { Radar, Calendar, AlertTriangle, ListTodo, Settings } from "lucide-react";
import {
  blockedDueSoonTasks,
  buildRadarSummary,
  criticalAlerts,
  dueSoonTasks,
  overdueTasks,
  relativeDueLabel,
} from "./radarModel";

interface RadarViewProps {
  projectId: Id<"projects"> | null;
  onNavigate?: (view: string) => void;
  onTaskSelect?: (taskId: Id<"tasks">) => void;
}

export function RadarView({ projectId, onNavigate, onTaskSelect }: RadarViewProps) {
  const tasks = useQuery(api.tasks.listAll, projectId ? { projectId } : {});
  const jobs = useQuery(api.scheduledJobs.list, projectId ? { projectId } : {});
  const alerts = useQuery(api.alerts.listOpen, { limit: 20 });
  const now = Date.now();

  const tasksList = tasks ?? [];
  const jobsList = jobs ?? [];
  const alertsList = alerts ?? [];
  const sortedByDue = dueSoonTasks(tasksList, now);
  const overdue = overdueTasks(tasksList, now);
  const blockedDueSoon = blockedDueSoonTasks(tasksList, now);
  const critical = criticalAlerts(alertsList);
  const summary = buildRadarSummary(tasksList, alertsList, now);

  const nextJobs = [...jobsList]
    .filter((j) => j.nextRun != null && j.nextRun >= now)
    .sort((a, b) => (a.nextRun ?? 0) - (b.nextRun ?? 0))
    .slice(0, 10);

  return (
    <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
      <PageHeader
        title="Radar"
        description="What's on the horizon. Upcoming deadlines, scheduled runs, and recent alerts."
        icon={<Radar className="h-4 w-4" />}
        status={<StatusBadge tone="neutral">horizon view</StatusBadge>}
        actions={
          onNavigate && (
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onNavigate("system")}>
              <Settings className="h-3.5 w-3.5 mr-1.5" />
              System
            </Button>
          )
        }
      />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 py-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <MetricBlock
              label="Overdue"
              value={summary.overdue}
              detail="Open tasks already past due"
              adornment={summary.overdue > 0 ? <StatusBadge tone="error">act now</StatusBadge> : undefined}
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Due in 24h"
              value={summary.dueNext24Hours}
              detail="Open tasks landing within the next day"
              adornment={summary.dueNext24Hours > 0 ? <StatusBadge tone="warning">soon</StatusBadge> : undefined}
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Blocked due soon"
              value={summary.blockedDueSoon}
              detail="Near-term work blocked by status or approval"
              adornment={summary.blockedDueSoon > 0 ? <StatusBadge tone="error">blocked</StatusBadge> : undefined}
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Critical alerts"
              value={summary.criticalAlerts}
              detail="Error or critical signals on the horizon"
              adornment={summary.criticalAlerts > 0 ? <StatusBadge tone="error">investigate</StatusBadge> : <StatusBadge tone="success">clear</StatusBadge>}
            />
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px]">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[15px] font-semibold text-ink">Due in next 7 days</h3>
              <StatusBadge tone={sortedByDue.length > 0 ? "warning" : "neutral"}>{sortedByDue.length} queued</StatusBadge>
              {onNavigate && (
                <Button variant="outline" size="sm" onClick={() => onNavigate("calendar")}>
                  View calendar
                </Button>
              )}
            </div>
            {sortedByDue.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon={ListTodo}
                  title="Nothing due soon"
                  description="No tasks with due dates are landing in the next week."
                />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {sortedByDue.slice(0, 15).map((task) => {
                  const dueAt = (task as { dueAt?: number }).dueAt;
                  const dueStr = dueAt
                    ? new Date(dueAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
                    : "—";
                  const urgencyLabel = dueAt ? relativeDueLabel(dueAt, now) : "No due date";
                  return (
                    <button
                      key={task._id}
                      type="button"
                      className="w-full rounded-lg border border-line bg-surface-2 px-4 py-3 text-left transition-colors duration-150 hover:border-line-strong"
                      onClick={() => onTaskSelect?.(task._id as Id<"tasks">)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[13.5px] font-medium text-ink">{task.title}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
                            <StatusBadge tone={task.status === "BLOCKED" || task.status === "FAILED" ? "error" : task.status === "NEEDS_APPROVAL" ? "warning" : "neutral"}>
                              {task.status.replace(/_/g, " ")}
                            </StatusBadge>
                            <span>{urgencyLabel}</span>
                          </div>
                        </div>
                        <span className="shrink-0 text-[12.5px] text-ink-muted">{dueStr}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[15px] font-semibold text-ink">Next scheduled runs</h3>
                <StatusBadge tone={nextJobs.length > 0 ? "neutral" : "success"}>{nextJobs.length} upcoming</StatusBadge>
                {onNavigate && (
                  <Button variant="outline" size="sm" onClick={() => onNavigate("schedules")}>
                    View schedules
                  </Button>
                )}
              </div>
              {nextJobs.length === 0 ? (
                <div className="mt-4 text-[13.5px] text-ink-muted">No upcoming job runs.</div>
              ) : (
                <div className="mt-4 space-y-3">
                  {nextJobs.map((job) => (
                    <div key={job._id} className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-4 py-3 text-[13.5px]">
                      <span className="font-medium text-ink">{job.name}</span>
                      <span className="text-[12.5px] text-ink-muted">
                        {job.nextRun
                          ? new Date(job.nextRun).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[15px] font-semibold text-ink">Recent alerts</h3>
                <StatusBadge tone={critical.length > 0 ? "error" : alertsList.length > 0 ? "warning" : "success"}>
                  {critical.length > 0 ? `${critical.length} critical` : alertsList.length > 0 ? `${alertsList.length} open` : "clear"}
                </StatusBadge>
              </div>
              {alertsList.length === 0 ? (
                <div className="mt-4 text-[13.5px] text-ink-muted">No recent alerts.</div>
              ) : (
                <div className="mt-4 space-y-2">
                  {alertsList.slice(0, 10).map((alert) => (
                    <div key={alert._id} className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-4 py-3 text-[13.5px]">
                      <StatusBadge
                        tone={alert.severity === "ERROR" || alert.severity === "CRITICAL" ? "error" : "warning"}
                      >
                        {alert.severity}
                      </StatusBadge>
                      <span className="text-ink-secondary">{alert.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[15px] font-semibold text-ink">Operator guidance</h3>
              <StatusBadge tone={summary.overdue > 0 || summary.criticalAlerts > 0 ? "error" : summary.blockedDueSoon > 0 ? "warning" : "success"}>
                {summary.overdue > 0 || summary.criticalAlerts > 0 ? "attention first" : summary.blockedDueSoon > 0 ? "watch list" : "steady"}
              </StatusBadge>
            </div>
            <div className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-ink-secondary">
              <div className="rounded-lg border border-line bg-surface-2 px-4 py-4">
                {summary.overdue > 0
                  ? `${summary.overdue} open task${summary.overdue === 1 ? " is" : "s are"} already overdue. Clear those before pulling in future work.`
                  : "No open overdue tasks right now. Use Radar to decide what needs attention next, not to inspect every detail of execution."}
              </div>
              <div className="rounded-lg border border-line bg-surface-2 px-4 py-4">
                {summary.criticalAlerts > 0 || summary.blockedDueSoon > 0
                  ? `${summary.criticalAlerts} critical alert${summary.criticalAlerts === 1 ? "" : "s"} and ${summary.blockedDueSoon} blocked due-soon task${summary.blockedDueSoon === 1 ? "" : "s"} need triage before the horizon gets noisier.`
                  : "When a date or alert looks risky here, drill into Tasks, Schedules, or System immediately."}
              </div>
              <div className="rounded-lg border border-line bg-surface-2 px-4 py-4">
                {nextJobs.length > 0
                  ? `${nextJobs.length} scheduled run${nextJobs.length === 1 ? " is" : "s are"} already queued. Check that automation is reducing, not adding to, the next 24 hours of risk.`
                  : "No scheduled runs are queued. If the horizon feels too quiet, verify your automation cadence in Schedules or Factory."}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
