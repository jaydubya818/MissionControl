import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/PageHeader";
import { ArrowLeft, ClipboardList, ExternalLink, PlayCircle, Plus, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import {
  countByQuickFilter,
  DEFAULT_WORK_ORDER_FILTERS,
  deriveNextAction,
  filterWorkOrders,
  summarizeRequiredAttention,
  type WorkOrderQueueFilters,
  type WorkOrderQuickFilter,
} from "./workOrdersModel";
import { ExecutionRunInspector } from "./ExecutionRunInspector";
import { splitCurrentAndHistoricalRevisions, summarizeRevisionEffects } from "./workOrderLifecycleModel";
import { CreateTaskModal } from "../CreateTaskModal";

const RISK_STYLES: Record<string, string> = {
  LOW: "border-emerald-500/30 text-emerald-300",
  MEDIUM: "border-registry-accent/30 text-registry-accent",
  HIGH: "border-amber-500/30 text-amber-300",
  CRITICAL: "border-red-500/30 text-red-300",
};

const STATE_STYLES: Record<string, string> = {
  DRAFT: "border-border text-muted-foreground",
  READY: "border-registry-accent/30 text-registry-accent",
  DISPATCHED: "border-registry-accent/30 text-registry-accent",
  IN_PROGRESS: "border-primary/30 text-primary",
  BLOCKED: "border-red-500/30 text-red-300",
  AWAITING_APPROVAL: "border-amber-500/30 text-amber-300",
  AWAITING_VERIFICATION: "border-amber-500/30 text-amber-300",
  REOPENED: "border-purple-500/30 text-purple-200",
  DONE: "border-emerald-500/30 text-emerald-300",
  CANCELED: "border-border text-muted-foreground",
  SUPERSEDED: "border-slate-500/30 text-slate-300",
};

const QUICK_FILTERS: Array<{ id: WorkOrderQuickFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "needs_attention", label: "Needs attention" },
  { id: "blocked", label: "Blocked" },
  { id: "awaiting_approval", label: "Awaiting approval" },
  { id: "ready_to_dispatch", label: "Ready to dispatch" },
];

function prettyLabel(value: string | undefined | null) {
  if (!value) return "—";
  return value.replace(/_/g, " ");
}

function criteriaFromText(value: string, existingCriteria: Array<{ id: string; title: string; description?: string; verificationMethod?: string }> = []) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((title, index) => {
      const existing = existingCriteria[index];
      return {
        id: existing?.id ?? `ac-${index + 1}`,
        title,
        description: existing?.description,
        verificationMethod: (existing?.verificationMethod as "MANUAL" | "COMMAND" | "TEST" | "CHECKLIST" | undefined) ?? "MANUAL",
        status: "PENDING" as const,
      };
    });
}

function latestByCriterion<T extends { acceptanceCriterionId: string; recordedAt: number }>(receipts: T[]) {
  const latest = new Map<string, T>();
  [...receipts].sort((a, b) => b.recordedAt - a.recordedAt).forEach((receipt) => {
    if (!latest.has(receipt.acceptanceCriterionId)) latest.set(receipt.acceptanceCriterionId, receipt);
  });
  return latest;
}

export function WorkOrdersView({ projectId }: { projectId: Id<"projects"> | null }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<WorkOrderQueueFilters>(DEFAULT_WORK_ORDER_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("workOrder"));
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [supersedeOpen, setSupersedeOpen] = useState(false);
  const [createRequestKey, setCreateRequestKey] = useState<string | null>(null);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [revisingId, setRevisingId] = useState<string | null>(null);
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  const [supersedingId, setSupersedingId] = useState<string | null>(null);
  const [inspectorRunId, setInspectorRunId] = useState<Id<"workflowRuns"> | null>(null);
  const [inspectorReceiptId, setInspectorReceiptId] = useState<Id<"verificationReceipts"> | null>(null);
  const [inspectorCriterionId, setInspectorCriterionId] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [dispatchTaskSelections, setDispatchTaskSelections] = useState<Record<string, string>>({});
  const [governanceError, setGovernanceError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workOrders = useQuery(api.workOrders.list, projectId ? { projectId } : {});
  const agents = useQuery(api.agents.listAll, projectId ? { projectId } : {});
  const accessibleSelectedId =
    selectedId && workOrders?.some((workOrder) => workOrder._id === selectedId)
      ? selectedId
      : null;
  const selected = useQuery(
    api.workOrders.get,
    accessibleSelectedId
      ? { workOrderId: accessibleSelectedId as Id<"workOrders"> }
      : "skip"
  );

  useEffect(() => {
    const requested = searchParams.get("workOrder");
    if (requested !== selectedId) {
      setSelectedId(requested);
      setMobileDetailOpen(Boolean(requested));
    }
  }, [searchParams, selectedId]);
  const createWorkOrder = useMutation(api.workOrders.create);
  const dispatchWorkOrder = useMutation(api.workOrders.dispatch);
  const requestApprovalDecision = useMutation(api.workOrders.requestApprovalDecision);
  const recordVerificationReceipt = useMutation(api.workOrders.recordVerificationReceipt);
  const acceptWorkOrder = useMutation(api.workOrders.accept);
  const requestWorkOrderRevision = useMutation(api.workOrders.requestWorkOrderRevision);
  const approveWorkOrderRevision = useMutation(api.workOrders.approveWorkOrderRevision);
  const reopenWorkOrder = useMutation(api.workOrders.reopenWorkOrder);
  const supersedeWorkOrder = useMutation(api.workOrders.supersedeWorkOrder);
  const expireGovernanceRecords = useMutation(api.workOrders.expireGovernanceRecords);
  const seedDemo = useMutation(api.workOrders.seedDemo);

  const filtered = useMemo(() => filterWorkOrders(workOrders ?? [], filters), [workOrders, filters]);

  useEffect(() => {
    if (filtered.length === 0) {
      setMobileDetailOpen(false);
      return;
    }
    if (!selectedId && filtered.length > 0) {
      setSelectedId(filtered[0]._id);
      const next = new URLSearchParams(searchParams);
      next.set("workOrder", filtered[0]._id);
      setSearchParams(next, { replace: true });
    }
    if (selectedId && filtered.length > 0 && !filtered.some((item) => item._id === selectedId)) {
      setSelectedId(filtered[0]._id);
      const next = new URLSearchParams(searchParams);
      next.set("workOrder", filtered[0]._id);
      setSearchParams(next, { replace: true });
    }
  }, [filtered, searchParams, selectedId, setSearchParams]);

  const selectWorkOrder = (workOrderId: string, history: "push" | "replace" = "push") => {
    setSelectedId(workOrderId);
    const next = new URLSearchParams(searchParams);
    next.set("workOrder", workOrderId);
    setSearchParams(next, { replace: history === "replace" });
  };

  const repositories = useMemo(
    () => Array.from(new Set((workOrders ?? []).map((item) => item.repository).filter(Boolean))).sort(),
    [workOrders]
  );
  const assignedAgents = useMemo(
    () => Array.from(new Set((workOrders ?? []).map((item) => item.assignedAgent).filter(Boolean))).sort(),
    [workOrders]
  );
  const requestors = useMemo(
    () => Array.from(new Set((workOrders ?? []).map((item) => item.requestedBy).filter(Boolean))).sort(),
    [workOrders]
  );

  const counts = useMemo(() => {
    const rows = workOrders ?? [];
    return {
      total: rows.length,
      active: rows.filter((row) => ["READY", "DISPATCHED", "IN_PROGRESS", "AWAITING_APPROVAL", "AWAITING_VERIFICATION", "REOPENED"].includes(row.state)).length,
      blocked: rows.filter((row) => row.state === "BLOCKED").length,
      attention: rows.filter((row) => !!row.requiredHumanAction || ["PENDING", "REVISION_REQUESTED"].includes(row.approvalStatus) || ["FAIL", "STALE"].includes(row.verificationStatus)).length,
    };
  }, [workOrders]);

  const quickFilterCounts = useMemo(() => {
    const rows = workOrders ?? [];
    return Object.fromEntries(
      QUICK_FILTERS.map((filter) => [filter.id, filter.id === "all" ? rows.length : countByQuickFilter(rows, filter.id)])
    ) as Record<WorkOrderQuickFilter, number>;
  }, [workOrders]);

  async function handleSeed() {
    setSeeding(true);
    try {
      await seedDemo({});
    } finally {
      setSeeding(false);
    }
  }

  const canDispatchSelected = !!selected && ["READY", "BLOCKED", "DISPATCHED", "IN_PROGRESS", "REOPENED", "AWAITING_APPROVAL", "AWAITING_VERIFICATION"].includes(selected.workOrder.state)
    && !!selected.workOrder.workflowId
    && (selected.workOrder.approvalStatus === "APPROVED" || selected.workOrder.approvalStatus === "CONDITIONAL" || selected.workOrder.approvalStatus === "NOT_REQUIRED")
    && !selected.executionRuns.some((run) => ["PENDING", "RUNNING", "PAUSED"].includes(run.status));

  const canAcceptSelected = !!selected
    && !["DONE", "SUPERSEDED", "CANCELED"].includes(selected.workOrder.state)
    && !selected.executionRuns.some((run) => ["PENDING", "RUNNING", "PAUSED"].includes(run.status))
    && selected.executionRuns[0]?.status === "COMPLETED"
    && selected.acceptanceSummary?.eligible;

  const latestReceiptMap = useMemo(
    () => latestByCriterion((selected?.verificationReceipts ?? []).map((receipt) => ({
      ...receipt,
      recordedAt: receipt.recordedAt ?? receipt._creationTime ?? 0,
    }))),
    [selected]
  );
  const revisionSplit = useMemo(
    () => splitCurrentAndHistoricalRevisions((selected?.revisions ?? []) as any[], selected?.workOrder.currentRevisionId),
    [selected]
  );
  const agentMap = useMemo(
    () =>
      new Map<Id<"agents">, Doc<"agents">>(
        (agents ?? []).map((agent) => [agent._id, agent])
      ),
    [agents]
  );
  const childTaskSummary = useMemo(() => {
    const tasks = selected?.childTasks ?? [];
    return {
      total: tasks.length,
      active: tasks.filter((task) => ["READY", "ASSIGNED", "IN_PROGRESS"].includes(task.status)).length,
      review: tasks.filter((task) => ["REVIEW", "NEEDS_APPROVAL"].includes(task.status)).length,
      blocked: tasks.filter((task) => task.status === "BLOCKED").length,
      completed: tasks.filter((task) => task.status === "DONE").length,
    };
  }, [selected]);
  const selectedDispatchTaskId = selected
    ? dispatchTaskSelections[selected.workOrder._id] ?? ""
    : "";
  const verifiedCriteriaCount = selected
    ? Math.max(
        0,
        selected.workOrder.acceptanceCriteria.length -
          (selected.acceptanceSummary?.missingCriteriaIds?.length ?? 0) -
          (selected.acceptanceSummary?.failedCriteriaIds?.length ?? 0) -
          (selected.acceptanceSummary?.staleCriteriaIds?.length ?? 0)
      )
    : 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader
        eyebrow="Software factory"
        title="Work Orders"
        description="Requested outcomes, acceptance criteria, and governed execution in one queue."
        icon={<ClipboardList className="h-5 w-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSeed} disabled={seeding}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              {seeding ? "Seeding…" : "Seed demo"}
            </Button>
            {selected ? (
              <Button variant="outline" size="sm" onClick={() => setCreateTaskOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New Task
              </Button>
            ) : null}
            <Button size="sm" onClick={() => {
              setCreateRequestKey(globalThis.crypto?.randomUUID?.() ?? `work-order-${Date.now()}`);
              setCreateOpen(true);
            }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New WorkOrder
            </Button>
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="WorkOrders" value={counts.total} />
          <StatCard label="Active" value={counts.active} />
          <StatCard label="Blocked" value={counts.blocked} tone={counts.blocked > 0 ? "bad" : "default"} />
          <StatCard label="Needs attention" value={counts.attention} tone={counts.attention > 0 ? "warn" : "good"} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {QUICK_FILTERS.map((filter) => {
            const active = filters.quickFilter === filter.id;
            return (
              <Button
                key={filter.id}
                size="sm"
                variant={active ? "default" : "outline"}
                onClick={() => setFilters((current) => ({ ...current, quickFilter: filter.id }))}
                className="gap-2"
              >
                {filter.label}
                <span className="rounded-full bg-background/20 px-1.5 py-0.5 text-[11px] leading-none">
                  {quickFilterCounts[filter.id] ?? 0}
                </span>
              </Button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 rounded-xl border border-[var(--panel-line)] bg-card/40 p-4 lg:grid-cols-6">
          <FilterSelect label="Repository" value={filters.repository} onChange={(value) => setFilters((current) => ({ ...current, repository: value }))} options={repositories} />
          <FilterSelect label="State" value={filters.state} onChange={(value) => setFilters((current) => ({ ...current, state: value }))} options={["READY", "DISPATCHED", "IN_PROGRESS", "BLOCKED", "AWAITING_APPROVAL", "AWAITING_VERIFICATION", "REOPENED", "DONE", "SUPERSEDED"]} />
          <FilterSelect label="Risk" value={filters.riskLevel} onChange={(value) => setFilters((current) => ({ ...current, riskLevel: value }))} options={["LOW", "MEDIUM", "HIGH", "CRITICAL"]} />
          <FilterSelect label="Assigned" value={filters.assignedAgent} onChange={(value) => setFilters((current) => ({ ...current, assignedAgent: value }))} options={assignedAgents} />
          <FilterSelect label="Requested by" value={filters.requestedBy} onChange={(value) => setFilters((current) => ({ ...current, requestedBy: value }))} options={requestors} />
          <FilterSelect label="Verification" value={filters.verificationStatus} onChange={(value) => setFilters((current) => ({ ...current, verificationStatus: value }))} options={["PENDING", "PASS", "FAIL", "WAIVED", "STALE"]} />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
          <div className={`${mobileDetailOpen ? "hidden xl:block" : "block"} space-y-3`}>
            {filtered.length === 0 ? (
              <Card className="p-8 text-center text-sm text-muted-foreground">
                No work orders match the current filters.
              </Card>
            ) : (
              filtered.map((item) => {
                const selectedRow = item._id === selectedId;
                return (
                  <button
                    key={item._id}
                    type="button"
                    onClick={() => {
                      selectWorkOrder(item._id);
                      setMobileDetailOpen(true);
                    }}
                    aria-label={`${item.title} — next action: ${deriveNextAction(item)}`}
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${selectedRow ? "border-registry-accent/40 bg-registry-accent-soft" : "border-[var(--panel-line)] bg-card/40 hover:border-registry-accent/20"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">{item.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{item.desiredOutcome}</div>
                      </div>
                      <Badge variant="outline" className={RISK_STYLES[item.riskLevel] ?? ""}>{item.riskLevel}</Badge>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="outline" className={STATE_STYLES[item.state] ?? ""}>{prettyLabel(item.state)}</Badge>
                      <Badge variant="outline">{item.repository ?? "No repo"}</Badge>
                      <Badge variant="outline">Workflow: {item.workflowId ?? "—"}</Badge>
                      <Badge variant="outline">Verification: {item.verificationStatus}</Badge>
                      {item.metadata?.automationDefinitionId ? <Badge variant="outline" className="border-registry-accent/30 text-registry-accent">Automation review gate</Badge> : null}
                      {item.latestExecutionRun ? (
                        <Badge variant="outline">
                          Run: {item.latestExecutionRun.status} · {item.latestExecutionRun.workflowId}
                        </Badge>
                      ) : null}
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                      <div>
                        <span className="text-foreground/80">Assigned:</span> {item.assignedAgent ?? item.assignedSquad ?? "Unassigned"}
                      </div>
                      <div>
                        <span className="text-foreground/80">Requestor:</span> {item.requestedBy ?? "Unknown"}
                      </div>
                      <div>
                        <span className="text-foreground/80">Next action:</span> {deriveNextAction(item)}
                      </div>
                      <div className="md:col-span-2 truncate">
                        <span className="text-foreground/80">Attention:</span> {summarizeRequiredAttention(item)}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <Card className={`${mobileDetailOpen ? "block" : "hidden xl:block"} min-h-[420px] p-5`}>
            {!selected ? (
              <div className="text-sm text-muted-foreground">Select a work order to inspect requested outcome, criteria, and linked execution.</div>
            ) : (
              <div className="space-y-5">
                <Button
                  size="sm"
                  variant="outline"
                  className="xl:hidden"
                  onClick={() => setMobileDetailOpen(false)}
                >
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                  Back to work orders
                </Button>
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xl font-semibold text-foreground">{selected.workOrder.title}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{selected.workOrder.repository ?? "No repository declared"}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className={RISK_STYLES[selected.workOrder.riskLevel] ?? ""}>{selected.workOrder.riskLevel}</Badge>
                      <Badge variant="outline" className={STATE_STYLES[selected.workOrder.state] ?? ""}>{prettyLabel(selected.workOrder.state)}</Badge>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setGovernanceError(null); setRevisionOpen(true); }}>Request revision</Button>
                    <Button size="sm" variant="outline" onClick={() => { setGovernanceError(null); setReopenOpen(true); }} disabled={["SUPERSEDED", "CANCELED"].includes(selected.workOrder.state)}>Reopen</Button>
                    <Button size="sm" variant="outline" onClick={async () => {
                      try {
                        setGovernanceError(null);
                        await expireGovernanceRecords({ workOrderId: selected.workOrder._id });
                      } catch (err) {
                        setGovernanceError(err instanceof Error ? err.message : "Failed to expire governance records");
                      }
                    }}>Refresh governance</Button>
                    <Button size="sm" variant="outline" onClick={() => { setGovernanceError(null); setSupersedeOpen(true); }} disabled={selected.workOrder.state === "SUPERSEDED"}>Supersede</Button>
                  </div>
                </div>

                <Section title="Outcome">
                  <p className="text-sm leading-relaxed text-foreground/85">{selected.workOrder.desiredOutcome}</p>
                  {selected.workOrder.context ? (
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{selected.workOrder.context}</p>
                  ) : null}
                </Section>

                {selected.workOrder.metadata?.automationDefinitionId ? (
                  <Section title="Automation lineage">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <Badge variant="outline" className="border-registry-accent/30 text-registry-accent">Automation review gate</Badge>
                        <p className="mt-2 text-sm font-medium text-foreground">
                          {selected.workOrder.metadata.automationDefinitionName ?? selected.workOrder.metadata.automationDefinitionId}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/v2/automations?tab=runs&definition=${selected.workOrder.metadata.automationDefinitionId}${projectId ? `&workspace=${projectId}` : ""}`)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Open Automation
                      </Button>
                    </div>
                    <dl className="grid gap-3 text-sm md:grid-cols-2">
                      <MetaRow label="Definition ID" value={selected.workOrder.metadata.automationDefinitionId} />
                      <MetaRow label="Workflow version" value={selected.workOrder.metadata.automationWorkflowVersion} />
                      <MetaRow label="Cadence window" value={selected.workOrder.metadata.automationCadenceWindow} />
                      <MetaRow label="Trigger" value={`${selected.workOrder.metadata.automationTrigger ?? "SCHEDULE"} · ${selected.workOrder.metadata.automationCadence?.cron ?? "Not recorded"}`} />
                      <MetaRow label="Scope" value={selected.workOrder.metadata.automationScope} />
                      <MetaRow label="Autonomy" value={selected.workOrder.metadata.automationPolicy?.autonomyLevel ?? "LEVEL_1"} />
                      <MetaRow label="Mutation policy" value={selected.workOrder.metadata.automationPolicy?.isMutating ? "Mutating" : "Read-only"} />
                      <MetaRow label="Approval" value={selected.workOrder.metadata.automationPolicy?.approvalRequired ? "Required" : "Not configured"} />
                      <MetaRow label="Verification" value={selected.workOrder.metadata.automationPolicy?.independentReceiptRequired ? "Independent receipt required" : "Not configured"} />
                    </dl>
                    <ol className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-5" aria-label="Automation governance sequence">
                      {["Automation evaluated", "Review gate created", "Approval required", "Explicit dispatch required", "Independent verification required"].map((step, index) => (
                        <li key={step} className="rounded-lg border border-[var(--panel-line)] bg-muted/10 p-2">
                          <span className="mr-1 font-mono text-registry-accent">{index + 1}.</span> {step}
                        </li>
                      ))}
                    </ol>
                    <p className="mt-3 text-xs text-amber-100">
                      This WorkOrder has not been automatically executed. The originating Automation cannot approve it.
                    </p>
                  </Section>
                ) : null}

                <Section title="Child Tasks">
                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
                    <StatCard label="Total Tasks" value={childTaskSummary.total} />
                    <StatCard label="Active Tasks" value={childTaskSummary.active} />
                    <StatCard label="Review Tasks" value={childTaskSummary.review} />
                    <StatCard label="Blocked Tasks" value={childTaskSummary.blocked} tone={childTaskSummary.blocked > 0 ? "warn" : "default"} />
                    <StatCard label="Completed Tasks" value={childTaskSummary.completed} tone="good" />
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <Card className="p-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Execution progress</div>
                      <div className="mt-2 text-lg font-semibold text-foreground">
                        {childTaskSummary.completed} of {childTaskSummary.total} Tasks complete
                      </div>
                    </Card>
                    <Card className="p-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Acceptance readiness</div>
                      <div className="mt-2 text-lg font-semibold text-foreground">
                        {verifiedCriteriaCount} of {selected.workOrder.acceptanceCriteria.length} criteria verified
                      </div>
                    </Card>
                  </div>
                  <div className="mt-3 space-y-2">
                    {selected.childTasks.length > 0 ? selected.childTasks.map((task) => {
                      const assignedAgent = task.assigneeIds
                        .map((agentId) => agentMap.get(agentId)?.name)
                        .filter(Boolean)
                        .join(", ");
                      return (
                        <div key={task._id} className="rounded-lg border border-[var(--panel-line)] bg-background/30 px-3 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-foreground">{task.title}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {assignedAgent || "Unassigned"} · Priority P{task.priority}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline">{task.status}</Badge>
                              <Badge variant="outline">{task.parentDelivery.governanceStatus}</Badge>
                              {task.status === "BLOCKED" ? <Badge variant="outline" className="border-red-500/30 text-red-300">Blocked</Badge> : null}
                            </div>
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            Current Attempt: {task.attempt.currentAttemptNumber || "None"}
                            {task.attempt.currentAttemptStatus ? ` (${task.attempt.currentAttemptStatus})` : ""}
                            {" · "}Retries: {task.attempt.retryCount}
                          </div>
                        </div>
                      );
                    }) : (
                      <div className="rounded-lg border border-dashed border-[var(--panel-line)] p-4 text-sm text-muted-foreground">
                        No Tasks are linked to this Work Order yet.
                      </div>
                    )}
                  </div>
                  <Button className="mt-3" size="sm" onClick={() => setCreateTaskOpen(true)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    New Task
                  </Button>
                </Section>

                <div className="grid gap-4 md:grid-cols-2">
                  <Section title="Execution setup">
                    <dl className="space-y-2 text-sm">
                      <MetaRow label="Branch / worktree strategy" value={selected.workOrder.branchStrategy} />
                      <MetaRow label="Workflow" value={selected.workOrder.workflowId} />
                      <MetaRow label="Assigned" value={selected.workOrder.assignedAgent ?? selected.workOrder.assignedSquad} />
                      <MetaRow label="Requested by" value={selected.workOrder.requestedBy} />
                      <MetaRow label="Approval" value={selected.workOrder.approvalStatus} />
                      <MetaRow label="Verification" value={selected.workOrder.verificationStatus} />
                    </dl>
                  </Section>
                  <Section title="Required attention">
                    {selected.workOrder.requiredHumanAction ? (
                      <p className="text-sm text-amber-100">{selected.workOrder.requiredHumanAction}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">No active human action recorded.</p>
                    )}
                    {selected.workOrder.blockingIssue ? (
                      <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-200">
                        <TriangleAlert className="mr-2 inline h-4 w-4" />
                        {selected.workOrder.blockingIssue}
                      </div>
                    ) : null}
                  </Section>
                </div>

                <Section title="Acceptance readiness">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <Card className="p-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Approval status</div>
                      <div className="mt-2 text-lg font-semibold text-foreground">{selected.workOrder.approvalStatus}</div>
                    </Card>
                    <Card className="p-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Verification status</div>
                      <div className="mt-2 text-lg font-semibold text-foreground">{selected.workOrder.verificationStatus}</div>
                    </Card>
                    <Card className="p-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Missing approvals</div>
                      <div className="mt-2 text-lg font-semibold text-amber-300">{selected.acceptanceSummary?.missingApprovalTypes?.length ?? 0}</div>
                    </Card>
                    <Card className="p-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Criteria blocked</div>
                      <div className="mt-2 text-lg font-semibold text-red-300">{(selected.acceptanceSummary?.failedCriteriaIds?.length ?? 0) + (selected.acceptanceSummary?.staleCriteriaIds?.length ?? 0) + (selected.acceptanceSummary?.missingCriteriaIds?.length ?? 0)}</div>
                    </Card>
                  </div>

                  <div className="mt-3 rounded-xl border border-[var(--panel-line)] bg-background/40 p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-foreground">Why this WorkOrder is blocked from acceptance</div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setGovernanceError(null); setApprovalOpen(true); }}>
                          <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                          Request approval
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setGovernanceError(null); setReceiptOpen(true); }}>
                          Record receipt
                        </Button>
                        <Button
                          size="sm"
                          onClick={async () => {
                            try {
                              setGovernanceError(null);
                              setAcceptingId(selected.workOrder._id);
                              await acceptWorkOrder({
                                workOrderId: selected.workOrder._id,
                                actorType: "HUMAN",
                                actorId: "operator",
                                idempotencyKey: `ui-accept:${selected.workOrder._id}:${selected.workOrder.updatedAt}`,
                              });
                            } catch (err) {
                              setGovernanceError(err instanceof Error ? err.message : "Acceptance failed");
                            } finally {
                              setAcceptingId(null);
                            }
                          }}
                          disabled={!canAcceptSelected || acceptingId === selected.workOrder._id}
                        >
                          {acceptingId === selected.workOrder._id ? "Accepting…" : "Accept WorkOrder"}
                        </Button>
                      </div>
                    </div>
                    {governanceError ? <div className="mb-3 text-xs text-red-300">{governanceError}</div> : null}
                    {(selected.acceptanceSummary?.blockingReasons?.length ?? 0) > 0 ? (
                      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {selected.acceptanceSummary.blockingReasons.map((reason, index) => (
                          <li key={`${selected.workOrder._id}-blocker-${index}`}>{reason}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-emerald-300">All required approvals and verification receipts are present. Explicit acceptance is now allowed.</p>
                    )}
                  </div>
                </Section>

                <Section title="Approval decisions">
                  <div className="space-y-2">
                    {selected.approvalDecisions?.length ? selected.approvalDecisions.map((approval) => (
                      <div key={approval._id} className="rounded-lg border border-[var(--panel-line)] bg-background/30 px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-foreground">{approval.approvalType}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{approval.requestedAction}</div>
                          </div>
                          <Badge variant="outline">{approval.status}</Badge>
                        </div>
                        <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                          <div>Risk: <span className="text-foreground/85">{approval.riskLevel}</span></div>
                          <div>Requested by: <span className="text-foreground/85">{approval.requestedBy ?? "—"}</span></div>
                          <div>Approver: <span className="text-foreground/85">{approval.approver ?? "—"}</span></div>
                          <div>Decided: <span className="text-foreground/85">{approval.decidedAt ? new Date(approval.decidedAt).toLocaleString() : "—"}</span></div>
                        </div>
                        {approval.reason ? <div className="mt-2 text-xs text-muted-foreground">Reason: {approval.reason}</div> : null}
                        {approval.conditions?.length ? <div className="mt-2 text-xs text-registry-accent">Conditions: {approval.conditions.join("; ")}</div> : null}
                      </div>
                    )) : (
                      <p className="text-sm text-muted-foreground">No approval decisions recorded yet.</p>
                    )}
                  </div>
                </Section>

                <Section title="Governance status">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <Card className="p-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Current revision</div>
                      <div className="mt-2 text-lg font-semibold text-foreground">r{selected.workOrder.currentRevisionNumber ?? 1}</div>
                    </Card>
                    <Card className="p-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Expiring approvals</div>
                      <div className="mt-2 text-lg font-semibold text-amber-300">{selected.governanceStatus?.expiringApprovals?.length ?? 0}</div>
                    </Card>
                    <Card className="p-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Expired approvals</div>
                      <div className="mt-2 text-lg font-semibold text-red-300">{selected.governanceStatus?.expiredApprovals?.length ?? 0}</div>
                    </Card>
                    <Card className="p-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Stale receipts</div>
                      <div className="mt-2 text-lg font-semibold text-red-300">{selected.governanceStatus?.staleReceipts?.length ?? 0}</div>
                    </Card>
                  </div>
                  <div className="mt-3 rounded-xl border border-[var(--panel-line)] bg-background/30 p-4 text-sm text-muted-foreground">
                    <div>Required reapproval: <span className="text-foreground/85">{selected.governanceStatus?.requiredReapproval ? "Yes" : "No"}</span></div>
                    <div className="mt-1">Required reverification: <span className="text-foreground/85">{selected.governanceStatus?.requiredReverification ? "Yes" : "No"}</span></div>
                    <div className="mt-1">Latest accepted revision: <span className="text-foreground/85">{selected.governanceStatus?.acceptedRevisionNumber ? `r${selected.governanceStatus.acceptedRevisionNumber}` : "—"}</span></div>
                    <div className="mt-2">Blocking reason: <span className="text-foreground/85">{selected.governanceStatus?.blockingReasons?.[0] ?? "—"}</span></div>
                  </div>
                </Section>

                <Section title="Revision history">
                  <div className="space-y-2">
                    {revisionSplit.current ? (
                      <div className="rounded-lg border border-registry-accent/30 bg-registry-accent-soft px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-foreground">Current revision r{revisionSplit.current.revisionNumber}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{revisionSplit.current.changeSummary}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{revisionSplit.current.status}</Badge>
                            {revisionSplit.current.status === "PENDING_APPROVAL" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  try {
                                    setGovernanceError(null);
                                    setRevisingId(revisionSplit.current._id);
                                    await approveWorkOrderRevision({ workOrderRevisionId: revisionSplit.current._id as Id<"workOrderRevisions">, approvedBy: "operator" });
                                  } catch (err) {
                                    setGovernanceError(err instanceof Error ? err.message : "Failed to approve revision");
                                  } finally {
                                    setRevisingId(null);
                                  }
                                }}
                                disabled={revisingId === revisionSplit.current._id}
                              >
                                {revisingId === revisionSplit.current._id ? "Applying…" : "Approve & apply"}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">{summarizeRevisionEffects(revisionSplit.current)}</div>
                      </div>
                    ) : null}
                    {revisionSplit.historical.length ? revisionSplit.historical.map((revision: any) => (
                      <div key={revision._id} className="rounded-lg border border-[var(--panel-line)] bg-background/30 px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-foreground">Historical revision r{revision.revisionNumber}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{revision.changeSummary}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{revision.status}</Badge>
                            {revision.status === "PENDING_APPROVAL" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  try {
                                    setGovernanceError(null);
                                    setRevisingId(revision._id);
                                    await approveWorkOrderRevision({ workOrderRevisionId: revision._id as Id<"workOrderRevisions">, approvedBy: "operator" });
                                  } catch (err) {
                                    setGovernanceError(err instanceof Error ? err.message : "Failed to approve revision");
                                  } finally {
                                    setRevisingId(null);
                                  }
                                }}
                                disabled={revisingId === revision._id}
                              >
                                {revisingId === revision._id ? "Applying…" : "Approve & apply"}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">Changed: {revision.changedFields.join(", ") || "—"}</div>
                        <div className="mt-1 text-xs text-muted-foreground">Impact: {summarizeRevisionEffects(revision)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">Actor: {revision.approvedBy ?? revision.requestedBy ?? "—"} · {revision.effectiveAt ? new Date(revision.effectiveAt).toLocaleString() : new Date(revision.createdAt).toLocaleString()}</div>
                      </div>
                    )) : (
                      <p className="text-sm text-muted-foreground">No historical revisions yet.</p>
                    )}
                  </div>
                </Section>

                <Section title="Reopen and replacement lineage">
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div>Prior accepted revision: <span className="text-foreground/85">{selected.governanceStatus?.latestAcceptedRevision ? `r${selected.governanceStatus.latestAcceptedRevision.revisionNumber}` : "—"}</span></div>
                    <div>Reopen reason: <span className="text-foreground/85">{selected.reopenDecisions?.[0]?.reason ?? "—"}</span></div>
                    <div>Source defect / issue: <span className="text-foreground/85">{selected.reopenDecisions?.[0]?.sourceIssueOrDefect ?? "—"}</span></div>
                    <div>Invalidated evidence: <span className="text-foreground/85">{selected.reopenDecisions?.[0]?.invalidatedReceiptIds?.length ?? 0}</span></div>
                    <div>Replacement WorkOrder: <span className="text-foreground/85">{selected.supersession?.replacementWorkOrderId ?? selected.workOrder.supersededByWorkOrderId ?? "—"}</span></div>
                  </div>
                </Section>

                <Section title="Verification traceability matrix">
                  <div className="space-y-2">
                    {selected.workOrder.acceptanceCriteria.map((criterion) => {
                      const receipt = latestReceiptMap.get(criterion.id) as any;
                      const blockingReason = receipt?.status === "FAILED"
                        ? "Latest receipt failed"
                        : receipt?.status === "STALE"
                          ? "Superseded by newer execution evidence"
                          : receipt?.status === "WAIVED" && !receipt.waiverApprovalDecisionId
                            ? "Waiver approval missing"
                            : !receipt
                              ? "Missing verification receipt"
                              : "—";
                      return (
                        <div key={criterion.id} className="rounded-lg border border-[var(--panel-line)] bg-background/30 px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-foreground">{criterion.title}</div>
                              <div className="mt-1 text-xs text-muted-foreground">Method: {criterion.verificationMethod ?? "MANUAL"}</div>
                              {criterion.description ? <div className="mt-1 text-xs text-muted-foreground">{criterion.description}</div> : null}
                            </div>
                            <Badge variant="outline">{receipt?.status ?? "MISSING"}</Badge>
                          </div>
                          <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                            <div>Evidence: <span className="text-foreground/85">{receipt?.evidenceLocation ?? receipt?.artifactReference ?? "—"}</span></div>
                            <div>Run: <span className="text-foreground/85">{selected.executionRuns.find((run) => run._id === receipt?.workflowRunId)?.runId ?? "—"}</span></div>
                            <div>Verifier: <span className="text-foreground/85">{receipt?.verifier ?? "—"}</span></div>
                            <div>Timestamp: <span className="text-foreground/85">{receipt?.recordedAt ? new Date(receipt.recordedAt).toLocaleString() : "—"}</span></div>
                          </div>
                          <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                            <div>Waiver / exception: <span className="text-foreground/85">{receipt?.exceptionOrWaiver ?? "—"}</span></div>
                            <div>Blocking reason: <span className="text-foreground/85">{blockingReason}</span></div>
                          </div>
                          {receipt?.commandOrCheck ? <div className="mt-2 text-xs text-muted-foreground">Check: {receipt.commandOrCheck}</div> : null}
                          {receipt?.result ? <div className="mt-1 text-xs text-muted-foreground">Result: {receipt.result}</div> : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!receipt?.workflowRunId}
                              onClick={() => {
                                setInspectorRunId((receipt?.workflowRunId ?? null) as Id<"workflowRuns"> | null);
                                setInspectorReceiptId((receipt?._id ?? null) as Id<"verificationReceipts"> | null);
                                setInspectorCriterionId(receipt?.acceptanceCriterionId ?? criterion.id);
                              }}
                            >
                              Inspect evidence
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Section>

                <Section title="Source of truth">
                  {selected.workOrder.sourceOfTruthRefs?.length ? (
                    <div className="space-y-2">
                      {selected.workOrder.sourceOfTruthRefs.map((ref) => (
                        <div key={`${ref.kind}-${ref.location}`} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--panel-line)] px-3 py-2 text-sm">
                          <div>
                            <div className="text-foreground">{ref.label}</div>
                            <div className="text-xs text-muted-foreground">{ref.kind} · {ref.location}</div>
                          </div>
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No source-of-truth references declared.</p>
                  )}
                </Section>

                <Section title="Linked execution runs">
                  <div className="mb-3 grid gap-3 rounded-lg border border-[var(--panel-line)] bg-background/30 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                    <div>
                      <Label htmlFor={`dispatch-task-${selected.workOrder._id}`}>
                        Task to execute
                      </Label>
                      {selected.childTasks.length > 0 ? (
                        <>
                          <Select
                            value={selectedDispatchTaskId}
                            onValueChange={(taskId) =>
                              setDispatchTaskSelections((current) => ({
                                ...current,
                                [selected.workOrder._id]: taskId,
                              }))
                            }
                          >
                            <SelectTrigger
                              id={`dispatch-task-${selected.workOrder._id}`}
                              className="mt-2"
                            >
                              <SelectValue placeholder="Select a governed Child Task" />
                            </SelectTrigger>
                            <SelectContent>
                              {selected.childTasks
                                .filter((task) => ["READY", "ASSIGNED", "IN_PROGRESS"].includes(task.status))
                                .map((task) => (
                                  <SelectItem key={task._id} value={task._id}>
                                    {task.identifier ? `${task.identifier} · ` : ""}
                                    {task.title}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            Assign a Child Task, then select it explicitly. Dispatch creates one Attempt under that Task.
                          </p>
                        </>
                      ) : (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          No canonical Child Tasks exist. This Work Order will use its legacy execution relationship.
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          setDispatchError(null);
                          setDispatchingId(selected.workOrder._id);
                          const result = await dispatchWorkOrder({
                            workOrderId: selected.workOrder._id,
                            taskId: selectedDispatchTaskId
                              ? selectedDispatchTaskId as Id<"tasks">
                              : undefined,
                            workflowId: selected.workOrder.workflowId,
                            actorType: "HUMAN",
                            actorId: "operator",
                            idempotencyKey: `ui-dispatch:${selected.workOrder._id}:${selected.workOrder.updatedAt}`,
                            runtime: "Mission Control UI",
                          });
                          if (result.reason === "routing-exhausted") {
                            throw new Error("Dispatch blocked: no safe model route satisfies this Work Order.");
                          }
                        } catch (err) {
                          setDispatchError(err instanceof Error ? err.message : "Dispatch failed");
                        } finally {
                          setDispatchingId(null);
                        }
                      }}
                      disabled={
                        !canDispatchSelected ||
                        dispatchingId === selected.workOrder._id ||
                        (selected.childTasks.length > 0 && !selectedDispatchTaskId)
                      }
                    >
                      {dispatchingId === selected.workOrder._id ? "Dispatching…" : "Dispatch"}
                    </Button>
                  </div>
                  {dispatchError ? (
                    <div className="mb-3 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-200">
                      {dispatchError}
                    </div>
                  ) : null}
                  {selected.executionRuns.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No execution runs linked yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {selected.executionRuns.map((run) => (
                        <div key={run._id} className="rounded-lg border border-[var(--panel-line)] bg-background/30 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <PlayCircle className="h-4 w-4 text-registry-accent" />
                              <span className="text-sm font-medium text-foreground">{run.workflowId}</span>
                              <Badge variant="outline">{run.status}</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-xs text-muted-foreground">{run.runId}</div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setInspectorRunId(run._id);
                                  setInspectorReceiptId(null);
                                  setInspectorCriterionId(null);
                                }}
                              >
                                Inspect run
                              </Button>
                            </div>
                          </div>
                          <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                            <div>
                              Task:{" "}
                              <span className="text-foreground/85">
                                {selected.childTasks.find((task) => task._id === run.parentTaskId)?.title ??
                                  (run.parentTaskId ? "Legacy Task" : "Work Order run")}
                              </span>
                            </div>
                            <div>Runtime: <span className="text-foreground/85">{run.runtime ?? "—"}</span></div>
                            <div>Model: <span className="text-foreground/85">{run.model ?? "—"}</span></div>
                            <div>Worktree: <span className="font-mono text-foreground/85">{run.worktree ?? "—"}</span></div>
                            <div>Current step: <span className="text-foreground/85">{run.currentStepLabel ?? "—"}</span></div>
                            <div>Retries: <span className="text-foreground/85">{run.retryCount}</span></div>
                            <div>Human interventions: <span className="text-foreground/85">{run.humanInterventions}</span></div>
                          </div>
                          {run.failureReason ? (
                            <div className="mt-3 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-200">
                              {run.failureReason}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                <Section title="Lifecycle events">
                  {selected.events?.length ? (
                    <div className="space-y-2">
                      {selected.events.slice(0, 6).map((event) => (
                        <div key={event._id} className="rounded-lg border border-[var(--panel-line)] px-3 py-2 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-foreground">{event.summary}</div>
                            <Badge variant="outline">{event.eventType}</Badge>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {event.fromState ? `${prettyLabel(event.fromState)} → ` : ""}{event.toState ? prettyLabel(event.toState) : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No lifecycle events recorded yet.</p>
                  )}
                </Section>
              </div>
            )}
          </Card>
        </div>
      </div>

      <CreateWorkOrderDialog
        open={createOpen}
        error={error}
        creating={creating}
        onClose={() => {
          setCreateOpen(false);
          setCreateRequestKey(null);
          setError(null);
        }}
        onCreate={async (payload) => {
          setCreating(true);
          setError(null);
          try {
            const result = await createWorkOrder({
              projectId: projectId ?? undefined,
              title: payload.title,
              desiredOutcome: payload.desiredOutcome,
              context: payload.context || undefined,
              workflowId: payload.workflowId || undefined,
              repository: payload.repository || undefined,
              branchStrategy: payload.branchStrategy || undefined,
              priority: Number(payload.priority) as 1 | 2 | 3 | 4,
              riskLevel: payload.riskLevel as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
              requestedBy: payload.requestedBy || undefined,
              assignedAgent: payload.assignedAgent || undefined,
              acceptanceCriteria: criteriaFromText(payload.acceptanceCriteria),
              sourceOfTruthRefs: payload.repository
                ? [{ kind: "REPO", label: payload.repository, location: `github.com/${payload.repository}` }]
                : undefined,
              idempotencyKey: createRequestKey ?? undefined,
            });
            if (result.workOrder?._id) selectWorkOrder(result.workOrder._id);
            setMobileDetailOpen(true);
            setCreateOpen(false);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create work order");
          } finally {
            setCreating(false);
          }
        }}
      />

      {createTaskOpen && selected && (
        <CreateTaskModal
          projectId={projectId}
          defaultWorkOrderId={selected.workOrder._id}
          onClose={() => setCreateTaskOpen(false)}
        />
      )}

      <RequestApprovalDialog
        open={approvalOpen}
        workOrder={selected?.workOrder ?? null}
        creating={creating}
        onClose={() => setApprovalOpen(false)}
        onCreate={async (payload) => {
          if (!selected) return;
          setCreating(true);
          setGovernanceError(null);
          try {
            await requestApprovalDecision({
              workOrderId: selected.workOrder._id,
              workflowRunId: payload.workflowRunId ? payload.workflowRunId as Id<"workflowRuns"> : undefined,
              approvalType: payload.approvalType,
              requestedAction: payload.requestedAction,
              requestedBy: payload.requestedBy || undefined,
              riskLevel: selected.workOrder.riskLevel,
              idempotencyKey: `ui-approval:${selected.workOrder._id}:${payload.approvalType}:${payload.requestedAction}`,
            });
            setApprovalOpen(false);
          } catch (err) {
            setGovernanceError(err instanceof Error ? err.message : "Failed to request approval");
          } finally {
            setCreating(false);
          }
        }}
      />

      <RecordVerificationReceiptDialog
        open={receiptOpen}
        workOrder={selected?.workOrder ?? null}
        executionRuns={selected?.executionRuns ?? []}
        approvalDecisions={selected?.approvalDecisions ?? []}
        creating={creating}
        onClose={() => setReceiptOpen(false)}
        onCreate={async (payload) => {
          if (!selected) return;
          setCreating(true);
          setGovernanceError(null);
          try {
            await recordVerificationReceipt({
              workOrderId: selected.workOrder._id,
              workflowRunId: payload.workflowRunId as Id<"workflowRuns">,
              acceptanceCriterionId: payload.acceptanceCriterionId,
              verificationMethod: payload.verificationMethod as "MANUAL" | "COMMAND" | "TEST" | "CHECKLIST",
              commandOrCheck: payload.commandOrCheck || undefined,
              result: payload.result || undefined,
              evidenceLocation: payload.evidenceLocation || undefined,
              artifactReference: payload.artifactReference || undefined,
              verifier: payload.verifier || undefined,
              status: payload.status as "PENDING" | "PASSED" | "FAILED" | "WAIVED" | "STALE",
              exceptionOrWaiver: payload.exceptionOrWaiver || undefined,
              waiverApprovalDecisionId: payload.waiverApprovalDecisionId ? payload.waiverApprovalDecisionId as Id<"approvalDecisions"> : undefined,
              idempotencyKey: `ui-receipt:${selected.workOrder._id}:${payload.acceptanceCriterionId}:${payload.workflowRunId}:${payload.status}`,
            });
            setReceiptOpen(false);
          } catch (err) {
            setGovernanceError(err instanceof Error ? err.message : "Failed to record verification receipt");
          } finally {
            setCreating(false);
          }
        }}
      />

      <RequestRevisionDialog
        open={revisionOpen}
        workOrder={selected?.workOrder ?? null}
        creating={creating}
        onClose={() => setRevisionOpen(false)}
        onCreate={async (payload) => {
          if (!selected) return;
          setCreating(true);
          setGovernanceError(null);
          try {
            await requestWorkOrderRevision({
              workOrderId: selected.workOrder._id,
              idempotencyKey: `ui-revision:${selected.workOrder._id}:${Date.now()}`,
              changeSummary: payload.changeSummary,
              reason: payload.reason,
              requestedBy: payload.requestedBy || undefined,
              patch: {
                desiredOutcome: payload.desiredOutcome || undefined,
                workflowId: payload.workflowId || undefined,
                repository: payload.repository || undefined,
                riskLevel: payload.riskLevel as any,
                requiredApprovals: payload.requiredApprovals,
                acceptanceCriteria: criteriaFromText(payload.acceptanceCriteria, selected.workOrder.acceptanceCriteria as any),
              },
            });
            setRevisionOpen(false);
          } catch (err) {
            setGovernanceError(err instanceof Error ? err.message : "Failed to request revision");
          } finally {
            setCreating(false);
          }
        }}
      />

      <ReopenWorkOrderDialog
        open={reopenOpen}
        workOrder={selected?.workOrder ?? null}
        creating={creating}
        onClose={() => setReopenOpen(false)}
        onCreate={async (payload) => {
          if (!selected) return;
          setCreating(true);
          setGovernanceError(null);
          try {
            await reopenWorkOrder({
              workOrderId: selected.workOrder._id,
              idempotencyKey: `ui-reopen:${selected.workOrder._id}:${Date.now()}`,
              reason: payload.reason,
              sourceIssueOrDefect: payload.sourceIssueOrDefect || undefined,
              requestedBy: payload.requestedBy || undefined,
              approvedBy: payload.approvedBy || undefined,
              reopenScope: payload.reopenScope,
              acceptanceCriteriaImpacted: payload.acceptanceCriteriaImpacted,
              newRequiredActions: payload.newRequiredActions,
            });
            setReopenOpen(false);
          } catch (err) {
            setGovernanceError(err instanceof Error ? err.message : "Failed to reopen WorkOrder");
          } finally {
            setCreating(false);
          }
        }}
      />

      <SupersedeWorkOrderDialog
        open={supersedeOpen}
        workOrders={workOrders ?? []}
        currentWorkOrderId={selected?.workOrder._id ?? null}
        creating={creating}
        onClose={() => setSupersedeOpen(false)}
        onCreate={async (payload) => {
          if (!selected) return;
          setCreating(true);
          setGovernanceError(null);
          try {
            await supersedeWorkOrder({
              workOrderId: selected.workOrder._id,
              replacementWorkOrderId: payload.replacementWorkOrderId as Id<"workOrders">,
              idempotencyKey: `ui-supersede:${selected.workOrder._id}:${payload.replacementWorkOrderId}`,
              reason: payload.reason,
              actorType: "HUMAN",
              actorId: payload.actorId || undefined,
            });
            setSupersedeOpen(false);
          } catch (err) {
            setGovernanceError(err instanceof Error ? err.message : "Failed to supersede WorkOrder");
          } finally {
            setCreating(false);
          }
        }}
      />

      <ExecutionRunInspector
        open={!!inspectorRunId}
        workflowRunId={inspectorRunId}
        verificationReceiptId={inspectorReceiptId}
        acceptanceCriterionId={inspectorCriterionId}
        retrying={!!selected && dispatchingId === selected.workOrder._id}
        onRetryFailedRun={selected
          ? async ({ workflowRunId, reason, runtime, model, worktree }) => {
              setDispatchError(null);
              setDispatchingId(selected.workOrder._id);
              try {
                const result = await dispatchWorkOrder({
                  workOrderId: selected.workOrder._id,
                  workflowId: selected.workOrder.workflowId,
                  actorType: "HUMAN",
                  actorId: "operator",
                  idempotencyKey: `ui-retry:${workflowRunId}:${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
                  runtime: runtime ?? "Mission Control UI",
                  model,
                  worktree,
                  retryOfWorkflowRunId: workflowRunId,
                  retryReason: reason,
                });
                if (result.reason === "routing-exhausted") {
                  throw new Error("Retry blocked: no safe model route satisfies this Work Order.");
                }
              } finally {
                setDispatchingId(null);
              }
            }
          : undefined}
        onClose={() => {
          setInspectorRunId(null);
          setInspectorReceiptId(null);
          setInspectorCriterionId(null);
        }}
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={`${label} filter`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>{option}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</div>
      {children}
    </section>
  );
}

function MetaRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right text-foreground/85">{value ?? "—"}</dd>
    </div>
  );
}

function StatCard({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "good" | "warn" | "bad" }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${tone === "good" ? "text-emerald-300" : tone === "warn" ? "text-amber-300" : tone === "bad" ? "text-red-300" : "text-foreground"}`}>
        {value}
      </div>
    </Card>
  );
}

function RequestApprovalDialog({
  open,
  workOrder,
  creating,
  onClose,
  onCreate,
}: {
  open: boolean;
  workOrder: any;
  creating: boolean;
  onClose: () => void;
  onCreate: (payload: { approvalType: string; requestedAction: string; requestedBy: string; workflowRunId: string }) => Promise<void>;
}) {
  const defaultType = workOrder?.requiredApprovals?.[0] ?? (["HIGH", "CRITICAL"].includes(workOrder?.riskLevel) ? "RISK_REVIEW" : "OPERATOR_REVIEW");
  const [approvalType, setApprovalType] = useState(defaultType);
  const [requestedAction, setRequestedAction] = useState("Approve protected dispatch or acceptance action");
  const [requestedBy, setRequestedBy] = useState("operator");
  const [workflowRunId, setWorkflowRunId] = useState("");

  useEffect(() => {
    setApprovalType(defaultType);
  }, [defaultType, open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Request approval</DialogTitle>
          <DialogDescription>Create an auditable ApprovalDecision linked to this WorkOrder.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Approval type</Label><Input value={approvalType} onChange={(event) => setApprovalType(event.target.value)} /></div>
          <div className="space-y-1.5"><Label>Requested action</Label><Textarea value={requestedAction} onChange={(event) => setRequestedAction(event.target.value)} rows={3} /></div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5"><Label>Requested by</Label><Input value={requestedBy} onChange={(event) => setRequestedBy(event.target.value)} /></div>
            <div className="space-y-1.5"><Label>Execution run ID (optional)</Label><Input value={workflowRunId} onChange={(event) => setWorkflowRunId(event.target.value)} placeholder="w57..." /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onCreate({ approvalType, requestedAction, requestedBy, workflowRunId })} disabled={creating || !approvalType.trim() || !requestedAction.trim()}>{creating ? "Requesting…" : "Request approval"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordVerificationReceiptDialog({
  open,
  workOrder,
  executionRuns,
  approvalDecisions,
  creating,
  onClose,
  onCreate,
}: {
  open: boolean;
  workOrder: any;
  executionRuns: any[];
  approvalDecisions: any[];
  creating: boolean;
  onClose: () => void;
  onCreate: (payload: {
    acceptanceCriterionId: string;
    workflowRunId: string;
    verificationMethod: string;
    commandOrCheck: string;
    result: string;
    evidenceLocation: string;
    artifactReference: string;
    verifier: string;
    status: string;
    exceptionOrWaiver: string;
    waiverApprovalDecisionId: string;
  }) => Promise<void>;
}) {
  const [acceptanceCriterionId, setAcceptanceCriterionId] = useState("");
  const [workflowRunId, setWorkflowRunId] = useState("");
  const [verificationMethod, setVerificationMethod] = useState("MANUAL");
  const [commandOrCheck, setCommandOrCheck] = useState("");
  const [result, setResult] = useState("");
  const [evidenceLocation, setEvidenceLocation] = useState("");
  const [artifactReference, setArtifactReference] = useState("");
  const [verifier, setVerifier] = useState("operator");
  const [status, setStatus] = useState("PASSED");
  const [exceptionOrWaiver, setExceptionOrWaiver] = useState("");
  const [waiverApprovalDecisionId, setWaiverApprovalDecisionId] = useState("");

  useEffect(() => {
    setAcceptanceCriterionId(workOrder?.acceptanceCriteria?.[0]?.id ?? "");
    setWorkflowRunId((executionRuns?.[0]?._id as string | undefined) ?? "");
  }, [workOrder, executionRuns, open]);

  const waiverOptions = approvalDecisions.filter((approval) => approval.status === "APPROVED" || approval.status === "CONDITIONAL");

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Record verification receipt</DialogTitle>
          <DialogDescription>Attach evidence to one acceptance criterion and mark whether it passed, failed, or was waived.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Acceptance criterion</Label>
              <Select value={acceptanceCriterionId} onValueChange={setAcceptanceCriterionId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(workOrder?.acceptanceCriteria ?? []).map((criterion: any) => <SelectItem key={criterion.id} value={criterion.id}>{criterion.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Execution run</Label>
              <Select value={workflowRunId} onValueChange={setWorkflowRunId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {executionRuns.map((run) => <SelectItem key={run._id} value={run._id}>{run.runId} · {run.status}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Method</Label>
                <Select value={verificationMethod} onValueChange={setVerificationMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['MANUAL', 'COMMAND', 'TEST', 'CHECKLIST'].map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['PASSED', 'FAILED', 'WAIVED', 'PENDING'].map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Verifier</Label><Input value={verifier} onChange={(event) => setVerifier(event.target.value)} /></div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Command or check</Label><Input value={commandOrCheck} onChange={(event) => setCommandOrCheck(event.target.value)} placeholder="pnpm --filter mission-control-ui build" /></div>
            <div className="space-y-1.5"><Label>Result</Label><Textarea value={result} onChange={(event) => setResult(event.target.value)} rows={3} placeholder="Build completed successfully" /></div>
            <div className="space-y-1.5"><Label>Evidence location</Label><Input value={evidenceLocation} onChange={(event) => setEvidenceLocation(event.target.value)} placeholder="docs/software-factory/verification-receipt.md" /></div>
            <div className="space-y-1.5"><Label>Artifact reference</Label><Input value={artifactReference} onChange={(event) => setArtifactReference(event.target.value)} placeholder="tmp/screenshot.png or PR URL" /></div>
            <div className="space-y-1.5"><Label>Exception / waiver note</Label><Input value={exceptionOrWaiver} onChange={(event) => setExceptionOrWaiver(event.target.value)} placeholder="Why a waiver is acceptable" /></div>
            {status === "WAIVED" ? (
              <div className="space-y-1.5">
                <Label>Waiver approval</Label>
                <Select value={waiverApprovalDecisionId} onValueChange={setWaiverApprovalDecisionId}>
                  <SelectTrigger><SelectValue placeholder="Select approved decision" /></SelectTrigger>
                  <SelectContent>
                    {waiverOptions.map((approval) => <SelectItem key={approval._id} value={approval._id}>{approval.approvalType} · {approval.status}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onCreate({ acceptanceCriterionId, workflowRunId, verificationMethod, commandOrCheck, result, evidenceLocation, artifactReference, verifier, status, exceptionOrWaiver, waiverApprovalDecisionId })} disabled={creating || !acceptanceCriterionId || !workflowRunId}>{creating ? "Recording…" : "Record receipt"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestRevisionDialog({
  open,
  workOrder,
  creating,
  onClose,
  onCreate,
}: {
  open: boolean;
  workOrder: any;
  creating: boolean;
  onClose: () => void;
  onCreate: (payload: {
    changeSummary: string;
    reason: string;
    requestedBy: string;
    desiredOutcome: string;
    workflowId: string;
    repository: string;
    riskLevel: string;
    requiredApprovals: string[];
    acceptanceCriteria: string;
  }) => Promise<void>;
}) {
  const [changeSummary, setChangeSummary] = useState("Clarify or revise WorkOrder scope");
  const [reason, setReason] = useState("");
  const [requestedBy, setRequestedBy] = useState("operator");
  const [desiredOutcome, setDesiredOutcome] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [repository, setRepository] = useState("");
  const [riskLevel, setRiskLevel] = useState("MEDIUM");
  const [requiredApprovalsText, setRequiredApprovalsText] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");

  useEffect(() => {
    if (!open || !workOrder) return;
    setDesiredOutcome(workOrder.desiredOutcome ?? "");
    setWorkflowId(workOrder.workflowId ?? "");
    setRepository(workOrder.repository ?? "");
    setRiskLevel(workOrder.riskLevel ?? "MEDIUM");
    setRequiredApprovalsText((workOrder.requiredApprovals ?? []).join("\n"));
    setAcceptanceCriteria((workOrder.acceptanceCriteria ?? []).map((criterion: any) => criterion.title).join("\n"));
  }, [open, workOrder]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>Request WorkOrder revision</DialogTitle>
          <DialogDescription>Version a controlled revision. Accepted work stays immutable until a revision is explicitly applied.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Change summary</Label><Input value={changeSummary} onChange={(event) => setChangeSummary(event.target.value)} /></div>
            <div className="space-y-1.5"><Label>Reason</Label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} placeholder="Why does this revision need to happen?" /></div>
            <div className="space-y-1.5"><Label>Requested by</Label><Input value={requestedBy} onChange={(event) => setRequestedBy(event.target.value)} /></div>
            <div className="space-y-1.5"><Label>Desired outcome</Label><Textarea value={desiredOutcome} onChange={(event) => setDesiredOutcome(event.target.value)} rows={4} /></div>
          </div>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5"><Label>Workflow</Label><Input value={workflowId} onChange={(event) => setWorkflowId(event.target.value)} /></div>
              <div className="space-y-1.5"><Label>Repository</Label><Input value={repository} onChange={(event) => setRepository(event.target.value)} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Risk level</Label>
              <Select value={riskLevel} onValueChange={setRiskLevel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Required approvals</Label><Textarea value={requiredApprovalsText} onChange={(event) => setRequiredApprovalsText(event.target.value)} rows={3} placeholder="One per line" /></div>
            <div className="space-y-1.5"><Label>Acceptance criteria</Label><Textarea value={acceptanceCriteria} onChange={(event) => setAcceptanceCriteria(event.target.value)} rows={5} placeholder="One criterion per line" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onCreate({
            changeSummary,
            reason,
            requestedBy,
            desiredOutcome,
            workflowId,
            repository,
            riskLevel,
            requiredApprovals: requiredApprovalsText.split("\n").map((line) => line.trim()).filter(Boolean),
            acceptanceCriteria,
          })} disabled={creating || !changeSummary.trim() || !reason.trim()}>{creating ? "Saving…" : "Request revision"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReopenWorkOrderDialog({
  open,
  workOrder,
  creating,
  onClose,
  onCreate,
}: {
  open: boolean;
  workOrder: any;
  creating: boolean;
  onClose: () => void;
  onCreate: (payload: {
    reason: string;
    sourceIssueOrDefect: string;
    requestedBy: string;
    approvedBy: string;
    reopenScope: string;
    acceptanceCriteriaImpacted: string[];
    newRequiredActions: string[];
  }) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [sourceIssueOrDefect, setSourceIssueOrDefect] = useState("");
  const [requestedBy, setRequestedBy] = useState("operator");
  const [approvedBy, setApprovedBy] = useState("operator");
  const [reopenScope, setReopenScope] = useState("full-workorder");
  const [acceptanceCriteriaImpactedText, setAcceptanceCriteriaImpactedText] = useState("");
  const [newRequiredActionsText, setNewRequiredActionsText] = useState("Review defect\nRecord replacement evidence\nRedispatch if implementation must change");

  useEffect(() => {
    if (!open || !workOrder) return;
    setAcceptanceCriteriaImpactedText((workOrder.acceptanceCriteria ?? []).map((criterion: any) => criterion.id).join("\n"));
  }, [open, workOrder]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Reopen WorkOrder</DialogTitle>
          <DialogDescription>Preserve prior evidence and explicitly mark what became invalid and what must happen next.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Reason</Label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="Defect discovered, evidence invalidated, reviewer requested correction…" /></div>
          <div className="space-y-1.5"><Label>Source issue or defect</Label><Input value={sourceIssueOrDefect} onChange={(event) => setSourceIssueOrDefect(event.target.value)} placeholder="Issue / defect / incident reference" /></div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5"><Label>Requested by</Label><Input value={requestedBy} onChange={(event) => setRequestedBy(event.target.value)} /></div>
            <div className="space-y-1.5"><Label>Approved by</Label><Input value={approvedBy} onChange={(event) => setApprovedBy(event.target.value)} /></div>
            <div className="space-y-1.5"><Label>Reopen scope</Label><Input value={reopenScope} onChange={(event) => setReopenScope(event.target.value)} /></div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5"><Label>Impacted criteria IDs</Label><Textarea value={acceptanceCriteriaImpactedText} onChange={(event) => setAcceptanceCriteriaImpactedText(event.target.value)} rows={4} /></div>
            <div className="space-y-1.5"><Label>New required actions</Label><Textarea value={newRequiredActionsText} onChange={(event) => setNewRequiredActionsText(event.target.value)} rows={4} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onCreate({
            reason,
            sourceIssueOrDefect,
            requestedBy,
            approvedBy,
            reopenScope,
            acceptanceCriteriaImpacted: acceptanceCriteriaImpactedText.split("\n").map((line) => line.trim()).filter(Boolean),
            newRequiredActions: newRequiredActionsText.split("\n").map((line) => line.trim()).filter(Boolean),
          })} disabled={creating || !reason.trim()}>{creating ? "Reopening…" : "Reopen WorkOrder"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SupersedeWorkOrderDialog({
  open,
  workOrders,
  currentWorkOrderId,
  creating,
  onClose,
  onCreate,
}: {
  open: boolean;
  workOrders: any[];
  currentWorkOrderId: string | null;
  creating: boolean;
  onClose: () => void;
  onCreate: (payload: { replacementWorkOrderId: string; reason: string; actorId: string }) => Promise<void>;
}) {
  const [replacementWorkOrderId, setReplacementWorkOrderId] = useState("");
  const [reason, setReason] = useState("");
  const [actorId, setActorId] = useState("operator");

  const options = (workOrders ?? []).filter((item) => item._id !== currentWorkOrderId);

  useEffect(() => {
    if (!open) return;
    setReplacementWorkOrderId(options[0]?._id ?? "");
  }, [open, currentWorkOrderId]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Supersede WorkOrder</DialogTitle>
          <DialogDescription>Link this WorkOrder to its authoritative replacement without losing unresolved obligations or evidence history.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Replacement WorkOrder</Label>
            <Select value={replacementWorkOrderId} onValueChange={setReplacementWorkOrderId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {options.map((option) => <SelectItem key={option._id} value={option._id}>{option.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Reason</Label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} /></div>
          <div className="space-y-1.5"><Label>Actor</Label><Input value={actorId} onChange={(event) => setActorId(event.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onCreate({ replacementWorkOrderId, reason, actorId })} disabled={creating || !replacementWorkOrderId || !reason.trim()}>{creating ? "Superseding…" : "Supersede WorkOrder"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateWorkOrderDialog({
  open,
  creating,
  error,
  onClose,
  onCreate,
}: {
  open: boolean;
  creating: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (payload: {
    title: string;
    desiredOutcome: string;
    context: string;
    workflowId: string;
    repository: string;
    branchStrategy: string;
    priority: string;
    riskLevel: string;
    requestedBy: string;
    assignedAgent: string;
    acceptanceCriteria: string;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [desiredOutcome, setDesiredOutcome] = useState("");
  const [context, setContext] = useState("");
  const [workflowId, setWorkflowId] = useState("feature-dev");
  const [repository, setRepository] = useState("jaydubya818/MissionControl");
  const [branchStrategy, setBranchStrategy] = useState("isolated feature branch and worktree");
  const [priority, setPriority] = useState("2");
  const [riskLevel, setRiskLevel] = useState("MEDIUM");
  const [requestedBy, setRequestedBy] = useState("Hermes");
  const [assignedAgent, setAssignedAgent] = useState("Pi");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Create WorkOrder</DialogTitle>
          <DialogDescription>Define value in terms of outcome, repository context, and acceptance criteria.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Work order title" />
            </div>
            <div className="space-y-1.5">
              <Label>Desired outcome</Label>
              <Textarea value={desiredOutcome} onChange={(event) => setDesiredOutcome(event.target.value)} rows={4} placeholder="What value should be delivered?" />
            </div>
            <div className="space-y-1.5">
              <Label>Context</Label>
              <Textarea value={context} onChange={(event) => setContext(event.target.value)} rows={4} placeholder="Business or engineering context" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Workflow</Label>
              <Input value={workflowId} onChange={(event) => setWorkflowId(event.target.value)} placeholder="feature-dev" />
            </div>
            <div className="space-y-1.5">
              <Label>Repository</Label>
              <Input value={repository} onChange={(event) => setRepository(event.target.value)} placeholder="owner/repo" />
            </div>
            <div className="space-y-1.5">
              <Label>Branch strategy</Label>
              <Input value={branchStrategy} onChange={(event) => setBranchStrategy(event.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Critical</SelectItem>
                    <SelectItem value="2">High</SelectItem>
                    <SelectItem value="3">Normal</SelectItem>
                    <SelectItem value="4">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Risk</Label>
                <Select value={riskLevel} onValueChange={setRiskLevel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Requested by</Label>
                <Input value={requestedBy} onChange={(event) => setRequestedBy(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Assigned agent</Label>
                <Input value={assignedAgent} onChange={(event) => setAssignedAgent(event.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Acceptance criteria</Label>
              <Textarea value={acceptanceCriteria} onChange={(event) => setAcceptanceCriteria(event.target.value)} rows={6} placeholder={"One criterion per line\nBuild passes\nQueue renders\nLinked run is visible"} />
            </div>
          </div>
        </div>

        {error ? <div className="text-sm text-red-300">{error}</div> : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onCreate({ title, desiredOutcome, context, workflowId, repository, branchStrategy, priority, riskLevel, requestedBy, assignedAgent, acceptanceCriteria })}
            disabled={creating || !title.trim() || !desiredOutcome.trim() || !acceptanceCriteria.trim()}
          >
            {creating ? "Creating…" : "Create WorkOrder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
