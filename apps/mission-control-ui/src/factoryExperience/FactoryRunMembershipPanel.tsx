import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";

export interface FactoryRunMembershipModel {
  factoryRun: { _id: string; title: string; state: string; membershipDigest: string; sourcePlanRevision: number };
  summary: {
    counts: { total: number; accepted: number; active: number; blocked: number; failed: number };
    outcome: { outcome: string | null; reasonCode: string; summary: string };
    dispatchFrontier: string[];
    criticalPathWorkOrderId: string | null;
  };
  workOrders: Array<{ _id: string; title: string; state: string }>;
  members: Array<{ workOrderId: string; sequence: number; workOrderRevisionNumber: number }>;
}

export function FactoryRunMembershipPanel({ runs }: { runs: FactoryRunMembershipModel[] }) {
  if (runs.length === 0) {
    return (
      <Card className="p-5 text-sm text-ink-muted">
        No explicit Factory Runs exist in this workspace. Historical execution traces remain available below.
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {runs.map((run) => {
        const workOrdersById = new Map(run.workOrders.map((workOrder) => [String(workOrder._id), workOrder]));
        return (
          <Card key={run.factoryRun._id} className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.09em] text-info-accent">Explicit Factory Run</div>
                <h3 className="mt-1 text-[15px] font-semibold text-ink">{run.factoryRun.title}</h3>
                <p className="mt-1 font-mono text-[9.5px] text-ink-muted">Plan r{run.factoryRun.sourcePlanRevision} · {run.factoryRun.membershipDigest.slice(0, 22)}…</p>
              </div>
              <Badge variant="outline">{run.summary.outcome.outcome ?? run.factoryRun.state}</Badge>
            </div>
            <dl className="grid grid-cols-2 border-b border-line sm:grid-cols-5">
              <RunMetric label="Members" value={run.summary.counts.total} />
              <RunMetric label="Accepted" value={run.summary.counts.accepted} />
              <RunMetric label="Active" value={run.summary.counts.active} />
              <RunMetric label="Blocked" value={run.summary.counts.blocked} />
              <RunMetric label="Failed" value={run.summary.counts.failed} />
            </dl>
            <div className="grid gap-4 p-4 lg:grid-cols-[1.4fr_1fr]">
              <ol className="space-y-2" aria-label={`${run.factoryRun.title} WorkOrder membership`}>
                {[...run.members].sort((left, right) => left.sequence - right.sequence).map((member) => {
                  const workOrder = workOrdersById.get(String(member.workOrderId));
                  const current = String(member.workOrderId) === run.summary.criticalPathWorkOrderId;
                  return (
                    <li key={String(member.workOrderId)} className={`flex items-center justify-between gap-3 rounded-lg border p-2.5 ${current ? "border-info-accent/40 bg-info-accent/5" : "border-line"}`}>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-ink">{member.sequence}. {workOrder?.title ?? member.workOrderId}</div>
                        <div className="mt-0.5 text-[10px] text-ink-muted">Bound revision {member.workOrderRevisionNumber}{current ? " · current critical path" : ""}</div>
                      </div>
                      <Badge variant="outline">{workOrder?.state ?? "Unavailable"}</Badge>
                    </li>
                  );
                })}
              </ol>
              <div className="rounded-lg border border-line bg-surface-2/40 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.09em] text-ink-muted">Current critical path</div>
                <p className="mt-2 text-xs text-ink">
                  {run.summary.criticalPathWorkOrderId
                    ? workOrdersById.get(run.summary.criticalPathWorkOrderId)?.title ?? run.summary.criticalPathWorkOrderId
                    : "Complete — no remaining WorkOrder."}
                </p>
                <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.09em] text-ink-muted">Dispatch frontier</div>
                <p className="mt-2 text-xs text-ink">
                  {run.summary.dispatchFrontier.length
                    ? run.summary.dispatchFrontier.map((workOrderId) => workOrdersById.get(workOrderId)?.title ?? workOrderId).join(", ")
                    : "No WorkOrder is currently eligible for dispatch."}
                </p>
                <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.09em] text-ink-muted">Outcome reason</div>
                <p className="mt-2 text-xs text-ink-secondary">{run.summary.outcome.summary}</p>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function RunMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-r border-line px-3 py-3 last:border-r-0">
      <dt className="text-[9.5px] uppercase tracking-[0.08em] text-ink-muted">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-ink">{value}</dd>
    </div>
  );
}
