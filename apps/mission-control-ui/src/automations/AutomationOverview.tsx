import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  Clock3,
  Coins,
  FileCheck2,
  PauseCircle,
  ReceiptText,
  ShieldAlert,
  Sparkles,
  TimerReset,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate, formatPercent, statusTone, type AutomationTab } from "./automationModel";

export function AutomationOverview({
  data,
  onTabChange,
  onSelectDefinition,
}: {
  data: any;
  onTabChange: (tab: AutomationTab) => void;
  onSelectDefinition: (definitionId: string) => void;
}) {
  const next = data.definitions
    .filter((definition: any) => definition.status === "ACTIVE" && definition.nextRunAt)
    .sort((a: any, b: any) => a.nextRunAt - b.nextRunAt)[0];
  const attention = buildAttention(data);
  const cards = [
    ["Active Definitions", data.metrics.active, CheckCircle2, "definitions"],
    ["Disabled Definitions", data.metrics.disabled, Ban, "definitions"],
    ["Paused Definitions", data.metrics.paused, PauseCircle, "definitions"],
    ["Suspended Definitions", data.metrics.suspended, ShieldAlert, "definitions"],
    ["Candidates awaiting review", data.metrics.candidatesAwaitingReview, Sparkles, "candidates"],
    ["WorkOrders awaiting approval", data.metrics.waitingApprovals, Clock3, "runs"],
    ["Awaiting verification", data.metrics.awaitingVerification, FileCheck2, "runs"],
    ["Failed review gates", data.metrics.failedReviewGates, AlertTriangle, "runs"],
    ["Missing / overdue receipts", data.metrics.overdueReceipts, ReceiptText, "receipts"],
    ["Estimated time saved", `${data.metrics.estimatedHumanMinutesSaved}m`, TimerReset, "runs"],
    ["Automation cost", `$${data.metrics.costUsd.toFixed(2)}`, Coins, "runs"],
    ["Verification rate", formatPercent(data.metrics.verificationPassRate), CheckCircle2, "receipts"],
    ["Idempotent skips", data.metrics.idempotentSkips, Workflow, "runs"],
  ] as const;

  return (
    <div className="space-y-5">
      <section aria-labelledby="automation-attention-title">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.17em] text-warn">Operator attention</div>
            <h2 id="automation-attention-title" className="mt-1 text-base font-semibold text-foreground">Highest-priority exceptions</h2>
          </div>
          <span className="text-xs text-muted-foreground">{attention.length} open</span>
        </div>
        {attention.length === 0 ? (
          <Card className="border-ok/20 bg-ok-soft p-4 text-sm text-ok">
            No urgent Automation action. All active Definitions are inside the V1 safety boundary.
          </Card>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {attention.slice(0, 8).map((item) => (
              <Card key={item.id} className="border-warn/20 bg-warn-soft p-4">
                <div className="flex items-start gap-3">
                  <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">{item.title}</div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
                    <button
                      type="button"
                      onClick={() => item.definitionId ? onSelectDefinition(item.definitionId) : onTabChange(item.tab)}
                      className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-warn hover:text-foreground"
                    >
                      {item.action} <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Automation metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {cards.map(([label, value, Icon, tab]) => (
          <button key={label} type="button" onClick={() => onTabChange(tab)} className="text-left">
            <Card className="h-full p-4 transition-colors hover:border-registry-accent/30">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">{label}</span>
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
              <div className="mt-3 text-2xl font-semibold text-foreground">{value}</div>
            </Card>
          </button>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground">Next scheduled evaluation</h2>
          {next ? (
            <div className="mt-4">
              <button type="button" onClick={() => onSelectDefinition(next._id)} className="flex items-center gap-2 text-left">
                <span className="font-medium text-foreground hover:text-registry-accent">{next.name}</span>
                <Badge variant="outline" className={statusTone(next.status)}>{next.status}</Badge>
              </button>
              <p className="mt-2 text-sm text-muted-foreground">{formatDate(next.nextRunAt)} · {next.workflowId}@{next.workflowVersion}</p>
              <p className="mt-1 text-xs text-muted-foreground">{next.scope}</p>
            </div>
          ) : <p className="mt-4 text-sm text-muted-foreground">No active Automation is scheduled.</p>}
        </Card>
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-foreground">V1 control boundary</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {["LEVEL_1 only", "Read-only", "Approval required", "No automatic dispatch", "Independent receipt required"].map((label) => (
              <Badge key={label} variant="outline" className="border-ok/20 text-ok">{label}</Badge>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Evaluation may create a review-gate WorkOrder. Approval, dispatch, execution, and independent verification remain separate governed transitions.
          </p>
        </Card>
      </div>
    </div>
  );
}

function buildAttention(data: any): Array<{
  id: string;
  title: string;
  body: string;
  action: string;
  tab: AutomationTab;
  definitionId?: string;
  icon: typeof AlertTriangle;
}> {
  const items: Array<any> = [];
  for (const definition of data.definitions) {
    if (definition.status === "SUSPENDED") items.push({ id: `suspended:${definition._id}`, title: `${definition.name} is suspended`, body: definition.pauseReason ?? "Policy suspended future evaluation.", action: "Review suspension", tab: "definitions", definitionId: definition._id, icon: ShieldAlert });
    if (!definition.workflowActive) items.push({ id: `inactive:${definition._id}`, title: `${definition.name} has no active Workflow`, body: `${definition.workflowId} must be active before safe operation.`, action: "Inspect Definition", tab: "definitions", definitionId: definition._id, icon: Workflow });
    if (definition.workflowVersionMismatch) items.push({ id: `version:${definition._id}`, title: `${definition.name} has a stale Workflow version`, body: `Pinned ${definition.workflowVersion}; current version is v${definition.workflow?.version ?? "unknown"}.`, action: "Review version", tab: "definitions", definitionId: definition._id, icon: Workflow });
    if (definition.maxCostUsd > 0 && definition.actualCostUsd / definition.maxCostUsd >= 0.8) items.push({ id: `cost:${definition._id}`, title: `${definition.name} is approaching its cost limit`, body: `$${definition.actualCostUsd.toFixed(2)} of $${definition.maxCostUsd.toFixed(2)} used.`, action: "Inspect cost", tab: "definitions", definitionId: definition._id, icon: Coins });
    if (definition.scheduleConflict) items.push({ id: `schedule:${definition._id}`, title: `${definition.name} has a schedule conflict`, body: "Another active Definition targets the same scope at the same cadence.", action: "Inspect schedule", tab: "schedule", definitionId: definition._id, icon: Clock3 });
  }
  for (const run of data.runs) {
    if (run.workOrder.verificationStatus === "FAIL") items.push({ id: `failed:${run.workOrder._id}`, title: `Verification failed for ${run.definition?.name ?? "Automation"}`, body: run.workOrder.blockingIssue ?? run.workOrder.title, action: "Open run", tab: "runs", icon: AlertTriangle });
    if (run.receiptState === "MISSING") items.push({ id: `receipt:${run.workOrder._id}`, title: `Missing receipt for ${run.definition?.name ?? "Automation"}`, body: run.workOrder.title, action: "Open receipts", tab: "receipts", icon: ReceiptText });
    if (run.workOrder.state === "AWAITING_APPROVAL" && Date.now() - run.workOrder.createdAt > 24 * 60 * 60 * 1000) items.push({ id: `approval:${run.workOrder._id}`, title: `Approval is aging for ${run.definition?.name ?? "Automation"}`, body: `Waiting since ${formatDate(run.workOrder.createdAt)}.`, action: "Open run", tab: "runs", icon: Clock3 });
  }
  return items;
}
