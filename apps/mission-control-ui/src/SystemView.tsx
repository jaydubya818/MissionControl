import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageHeader } from "./components/PageHeader";
import { Card } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { StatusBadge } from "./components/factory/badges";
import { MetricBlock } from "./components/factory/MetricBlock";
import { cn } from "@/lib/utils";
import { Settings, Activity, ExternalLink, Clock, Radar, Factory, MessageSquare, CheckCircle2 } from "lucide-react";

/** Static list of Convex crons (from crons.ts) for read-only display */
const CONVEX_CRONS = [
  { name: "expire stale approvals", interval: "Every 15 min" },
  { name: "escalate overdue approvals", interval: "Every 10 min" },
  { name: "detect loops", interval: "Every 15 min" },
  { name: "daily standup report", interval: "Daily 09:00 UTC" },
  { name: "daily CEO brief", interval: "Daily 09:00 UTC" },
  { name: "detect stale heartbeats", interval: "Every 2 min" },
  { name: "auto-route execution requests", interval: "Every 5 min" },
];

interface SystemViewProps {
  projectId: Id<"projects"> | null;
  onNavigate?: (view: string) => void;
  onOpenHealthDashboard?: () => void;
  onOpenMonitoringDashboard?: () => void;
}

export function SystemView({
  projectId,
  onNavigate,
  onOpenHealthDashboard,
  onOpenMonitoringDashboard,
}: SystemViewProps) {
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const tasks = useQuery(api.tasks.listAll, projectId ? { projectId } : {});
  const approvals = useQuery(
    api.approvals.listPending,
    projectId ? { projectId, limit: 50 } : "skip"
  );
  const scheduledJobs = useQuery(api.scheduledJobs.list, projectId ? { projectId } : {});
  const openAlerts = useQuery(
    api.alerts.listOpen,
    projectId ? { projectId, limit: 20 } : "skip",
  );

  const agentsList = agents ?? [];
  const tasksList = tasks ?? [];
  const approvalsList = approvals ?? [];
  const jobsList = scheduledJobs ?? [];
  const alertsList = openAlerts ?? [];

  const quarantinedCount = agentsList.filter((a) => a.status === "QUARANTINED").length;
  const failedCount = tasksList.filter((t) => t.status === "FAILED").length;
  const blockedCount = tasksList.filter((t) => t.status === "BLOCKED").length;
  const pendingApprovals = approvalsList.length;

  const issues = [
    quarantinedCount > 0 && { label: `${quarantinedCount} quarantined`, variant: "error" as const },
    failedCount > 0 && { label: `${failedCount} failed`, variant: "error" as const },
    blockedCount > 0 && { label: `${blockedCount} blocked`, variant: "warning" as const },
    pendingApprovals > 0 && { label: `${pendingApprovals} pending approvals`, variant: "warning" as const },
  ].filter(Boolean) as { label: string; variant: "error" | "warning" }[];

  const isHealthy = issues.length === 0;

  return (
    <section className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
      <PageHeader
        title="Database"
        description="Database and platform health, gateway status, and scheduled crons in one operator view."
        icon={<Settings className="h-4 w-4" />}
        eyebrow="Platform"
        actions={
          <div className="flex gap-2">
            {onOpenHealthDashboard && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onOpenHealthDashboard}>
                <Activity className="h-3.5 w-3.5 mr-1.5" />
                Health
              </Button>
            )}
            {onOpenMonitoringDashboard && (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onOpenMonitoringDashboard}>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Monitor
              </Button>
            )}
          </div>
        }
      />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 py-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <MetricBlock
              label="Platform state"
              value={isHealthy ? "Stable" : "Attention"}
              detail="Current operator posture based on alerts, failures, and approvals"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Open alerts"
              value={alertsList.length}
              detail="Signals that still need platform triage"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Active agents"
              value={agentsList.filter((a) => a.status === "ACTIVE").length}
              detail="Agents currently trusted to accept work"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Scheduled jobs"
              value={jobsList.length}
              detail="Recurring background work visible to the operator"
            />
          </Card>
        </div>

        {/* Live operations summary */}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="p-4">
          <h3 className="text-[15px] font-semibold text-ink mb-3">Live summary</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12.5px]">
            <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
              <span className="block text-ink-muted">Scheduled jobs</span>
              <span className="font-semibold tabular-nums text-ink">{jobsList.length}</span>
            </div>
            <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
              <span className="block text-ink-muted">Open alerts</span>
              <span className={cn("font-semibold tabular-nums", alertsList.length > 0 ? "text-warn" : "text-ink")}>
                {alertsList.length}
              </span>
            </div>
            <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
              <span className="block text-ink-muted">Active agents</span>
              <span className="font-semibold tabular-nums text-ink">
                {agentsList.filter((a) => a.status === "ACTIVE").length}
              </span>
            </div>
            <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
              <span className="block text-ink-muted">Tasks in progress</span>
              <span className="font-semibold tabular-nums text-ink">
                {tasksList.filter((t) => t.status === "IN_PROGRESS").length}
              </span>
            </div>
          </div>
          {onNavigate && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-line">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onNavigate("radar")}>
                <Radar className="h-3 w-3 mr-1.5" />
                Radar
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onNavigate("factory")}>
                <Factory className="h-3 w-3 mr-1.5" />
                Factory
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onNavigate("feedback")}>
                <MessageSquare className="h-3 w-3 mr-1.5" />
                Feedback
              </Button>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-[15px] font-semibold text-ink">Operator brief</h3>
          <div className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-ink-secondary">
            <p>Use Database for trust checks and routing, not deep investigation. If something is noisy here, jump into Radar or Feedback immediately.</p>
            <p>The platform is healthy only when alerts are controlled, approvals are not stale, and quarantines are explained rather than ignored.</p>
          </div>
          <div className="mt-4 rounded-lg border border-line bg-surface-2 px-4 py-3">
            <div className="text-[12.5px] font-medium text-ink-secondary">Fast lanes</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => onNavigate?.("radar")}>Radar</Button>
              <Button size="sm" variant="outline" onClick={() => onNavigate?.("factory")}>Factory</Button>
              <Button size="sm" variant="outline" onClick={() => onNavigate?.("feedback")}>Feedback</Button>
            </div>
          </div>
        </Card>
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-1 px-4 py-2.5 text-[12.5px]">
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              isHealthy ? "bg-ok" : issues.some((i) => i.variant === "error") ? "bg-err" : "bg-warn"
            )}
            aria-hidden
          />
          <span className="font-medium text-ink">
            {isHealthy ? "All systems operational" : "Attention required"}
          </span>
          {issues.length > 0 && (
            <>
              <span className="text-ink-muted">·</span>
              <div className="flex items-center gap-2 flex-wrap">
                {issues.map((issue, i) => (
                  <StatusBadge key={i} tone={issue.variant === "error" ? "error" : "warning"}>
                    {issue.label}
                  </StatusBadge>
                ))}
              </div>
            </>
          )}
        </div>

        {alertsList.length > 0 && (
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold text-ink">Open alerts</h3>
                <div className="mt-1 text-[12.5px] text-ink-muted">Signals currently shaping platform trust</div>
              </div>
              {onNavigate && (
                <Button size="sm" variant="outline" onClick={() => onNavigate("feedback")}>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Review in feedback
                </Button>
              )}
            </div>
            <div className="mt-4 space-y-2">
              {alertsList.slice(0, 5).map((alert) => (
                <div key={alert._id} className="rounded-lg border border-line bg-surface-2 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[13.5px] text-ink">{alert.title}</div>
                    <StatusBadge
                      tone={alert.severity === "ERROR" || alert.severity === "CRITICAL" ? "error" : "warning"}
                    >
                      {alert.severity}
                    </StatusBadge>
                  </div>
                  <div className="mt-1 text-[12.5px] text-ink-muted">{alert.description ?? "No description provided."}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Convex crons (read-only) */}
        <Card className="p-4">
          <h3 className="text-[15px] font-semibold text-ink flex items-center gap-2 mb-3">
            <Clock size={15} strokeWidth={1.75} className="text-ink-muted" />
            Convex cron jobs
          </h3>
          <p className="text-[12.5px] text-ink-muted mb-3">
            Background jobs defined in crons.ts. Read-only; edit in code.
          </p>
          <ul>
            {CONVEX_CRONS.map((cron, i) => (
              <li key={i} className="flex items-center justify-between border-b border-line py-2 text-[13.5px] last:border-0">
                <span className="text-ink">{cron.name}</span>
                <span className="text-[12.5px] text-ink-muted">{cron.interval}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </section>
  );
}
