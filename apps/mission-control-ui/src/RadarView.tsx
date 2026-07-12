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

interface RadarViewProps {
  projectId: Id<"projects"> | null;
  onNavigate?: (view: string) => void;
  onTaskSelect?: (taskId: Id<"tasks">) => void;
}

const NOW = Date.now();
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function RadarView({ projectId, onNavigate, onTaskSelect }: RadarViewProps) {
  const tasks = useQuery(api.tasks.listAll, projectId ? { projectId } : {});
  const jobs = useQuery(api.scheduledJobs.list, projectId ? { projectId } : {});
  const alerts = useQuery(api.alerts.listOpen, { limit: 20 });

  const tasksList = tasks ?? [];
  const jobsList = jobs ?? [];
  const alertsList = alerts ?? [];

  const tasksWithDue = tasksList.filter((t) => {
    const due = (t as { dueAt?: number }).dueAt;
    return due != null && due >= NOW && due <= NOW + SEVEN_DAYS_MS;
  });
  const sortedByDue = [...tasksWithDue].sort(
    (a, b) => ((a as { dueAt?: number }).dueAt ?? 0) - ((b as { dueAt?: number }).dueAt ?? 0)
  );

  const nextJobs = [...jobsList]
    .filter((j) => j.nextRun != null && j.nextRun >= NOW)
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
              label="Due soon"
              value={sortedByDue.length}
              detail="Tasks with due dates in the next seven days"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Next runs"
              value={nextJobs.length}
              detail="Scheduled jobs visible on the near horizon"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Alerts"
              value={alertsList.length}
              detail="Open alert conditions that may need operator review"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Posture"
              value={alertsList.length > 0 ? "Watch" : "Calm"}
              detail="Quick horizon read based on deadlines and alerts"
            />
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px]">
          <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[15px] font-semibold text-ink">Due in next 7 days</h3>
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
                  return (
                    <button
                      key={task._id}
                      type="button"
                      className="w-full rounded-lg border border-line bg-surface-2 px-4 py-3 text-left transition-colors duration-150 hover:border-line-strong"
                      onClick={() => onTaskSelect?.(task._id)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[13.5px] font-medium text-ink">{task.title}</span>
                        <span className="text-[12.5px] text-ink-muted">{dueStr}</span>
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
              <h3 className="text-[15px] font-semibold text-ink">Recent alerts</h3>
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
            <h3 className="text-[15px] font-semibold text-ink">Operator guidance</h3>
            <div className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-ink-secondary">
              <div className="rounded-lg border border-line bg-surface-2 px-4 py-4">
                Use Radar to decide what needs attention next, not to inspect every detail of execution.
              </div>
              <div className="rounded-lg border border-line bg-surface-2 px-4 py-4">
                When a date or alert looks risky here, drill into Tasks, Schedules, or System immediately.
              </div>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
