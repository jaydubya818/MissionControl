import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageHeader } from "./components/PageHeader";
import { Card } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { EmptyState } from "./components/ui/empty-state";
import { StatusBadge } from "./components/factory/badges";
import { MetricBlock } from "./components/factory/MetricBlock";
import { MessageSquare, FlaskConical, ShieldAlert, AlertTriangle, Activity, ChevronRight } from "lucide-react";

function isCriticalFindingSeverity(severity: string | null | undefined) {
  return severity === "RED" || severity === "ERROR" || severity === "CRITICAL";
}

interface FeedbackViewProps {
  projectId: Id<"projects"> | null;
  onNavigate?: (view: string) => void;
}

export function FeedbackView({ projectId, onNavigate }: FeedbackViewProps) {
  const qcFindings = useQuery(
    api.qcFindings.listRecent,
    projectId ? { projectId, limit: 10 } : "skip"
  );
  const approvals = useQuery(
    api.approvals.listPending,
    projectId ? { projectId, limit: 10 } : "skip"
  );
  const alerts = useQuery(
    api.alerts.listOpen,
    projectId ? { projectId, limit: 10 } : "skip",
  );
  const activities = useQuery(
    api.activities.listRecent,
    projectId ? { projectId, limit: 8 } : { limit: 8 }
  );

  const findingsList = qcFindings ?? [];
  const approvalsList = approvals ?? [];
  const alertsList = alerts ?? [];
  const activitiesList = activities ?? [];

  const hasAny = findingsList.length > 0 || approvalsList.length > 0 || alertsList.length > 0;

  return (
    <section className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-app">
      <PageHeader
        title="Feedback"
        description="Feedback on runs and decisions. QC findings, approvals, and alerts that may need review."
        icon={<MessageSquare className="h-4 w-4" />}
        status={<StatusBadge tone="neutral">review surfaces</StatusBadge>}
      />
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 py-6">
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <MetricBlock
              label="QC findings"
              value={findingsList.length}
              detail="Recent findings available for operator review"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Approvals"
              value={approvalsList.length}
              detail="Pending decisions still waiting on explicit review"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Alerts"
              value={alertsList.length}
              detail="Open alert conditions reflected in feedback surfaces"
            />
          </Card>
          <Card className="p-4">
            <MetricBlock
              label="Activity"
              value={activitiesList.length}
              detail="Recent events that explain current review posture"
            />
          </Card>
        </div>

        {!hasAny ? (
          <Card className="p-5">
            <EmptyState
              icon={MessageSquare}
              title="No feedback yet"
              description="QC findings, approvals, and open alerts will appear here once the system starts producing reviewable outcomes."
              action={
                onNavigate ? (
                  <div className="flex justify-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => onNavigate("system")}>
                      System
                    </Button>
                    <Button variant="default" size="sm" onClick={() => onNavigate("qc-dashboard")}>
                      QC dashboard
                    </Button>
                  </div>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
            {findingsList.length > 0 && (
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[15px] font-semibold text-ink flex items-center gap-2">
                    <FlaskConical size={15} strokeWidth={1.75} className="text-ink-muted" />
                    Recent QC findings
                  </h3>
                  {onNavigate && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onNavigate("qc-findings")}>
                      View all
                      <ChevronRight className="h-3 w-3 ml-1" />
                    </Button>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {findingsList.slice(0, 5).map((f) => (
                    <li
                      key={f._id}
                      className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px]"
                    >
                      <span className="mr-2 flex-1 truncate font-medium text-ink">{f.title ?? f.category ?? "Finding"}</span>
                      <StatusBadge
                        tone={isCriticalFindingSeverity(f.severity) ? "error" : "warning"}
                        className="shrink-0"
                      >
                        {f.severity}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {approvalsList.length > 0 && (
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[15px] font-semibold text-ink flex items-center gap-2">
                    <ShieldAlert size={15} strokeWidth={1.75} className="text-ink-muted" />
                    Pending approvals
                  </h3>
                  {onNavigate && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onNavigate("tasks")}>
                      Tasks
                      <ChevronRight className="h-3 w-3 ml-1" />
                    </Button>
                  )}
                </div>
                <p className="text-[12.5px] text-ink-secondary">
                  {approvalsList.length} approval{approvalsList.length !== 1 ? "s" : ""} awaiting review. Open Approvals from the home dashboard or task board.
                </p>
              </Card>
            )}

            {alertsList.length > 0 && (
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[15px] font-semibold text-ink flex items-center gap-2">
                    <AlertTriangle size={15} strokeWidth={1.75} className="text-ink-muted" />
                    Open alerts
                  </h3>
                  {onNavigate && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onNavigate("radar")}>
                      Radar
                      <ChevronRight className="h-3 w-3 ml-1" />
                    </Button>
                  )}
                </div>
                <ul className="space-y-1">
                  {alertsList.slice(0, 5).map((a) => (
                    <li key={a._id} className="flex items-center gap-2 border-b border-line py-1.5 text-[12.5px] last:border-0">
                      <StatusBadge tone={isCriticalFindingSeverity(a.severity) ? "error" : "warning"}>
                        {a.severity}
                      </StatusBadge>
                      <span className="text-ink-secondary">{a.title}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {activitiesList.length > 0 && (
              <Card className="p-4">
                <h3 className="text-[15px] font-semibold text-ink flex items-center gap-2 mb-2">
                  <Activity size={15} strokeWidth={1.75} className="text-ink-muted" />
                  Recent activity
                </h3>
                <p className="text-[12.5px] text-ink-secondary">
                  {activitiesList.length} recent event{activitiesList.length !== 1 ? "s" : ""}. Activity is also on the home dashboard.
                </p>
              </Card>
            )}
            </div>

            <Card className="p-5">
              <h3 className="text-[15px] font-semibold text-ink">Operator guidance</h3>
              <div className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-ink-secondary">
                <div className="rounded-lg border border-line bg-surface-2 px-4 py-4">
                  Use Feedback to evaluate what needs a decision, not to debug the whole system from scratch.
                </div>
                <div className="rounded-lg border border-line bg-surface-2 px-4 py-4">
                  If a finding is severe, route straight into QC or Radar. If it is ambiguous, gather context before escalating.
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </section>
  );
}
