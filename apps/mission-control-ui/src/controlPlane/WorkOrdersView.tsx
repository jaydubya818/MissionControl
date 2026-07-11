import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
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
import { ClipboardList, ExternalLink, PlayCircle, Plus, Sparkles, TriangleAlert } from "lucide-react";
import {
  DEFAULT_WORK_ORDER_FILTERS,
  filterWorkOrders,
  summarizeRequiredAttention,
  type WorkOrderQueueFilters,
} from "./workOrdersModel";

const RISK_STYLES: Record<string, string> = {
  LOW: "border-emerald-500/30 text-emerald-300",
  MEDIUM: "border-cyan-500/30 text-cyan-200",
  HIGH: "border-amber-500/30 text-amber-300",
  CRITICAL: "border-red-500/30 text-red-300",
};

const STATE_STYLES: Record<string, string> = {
  DRAFT: "border-border text-muted-foreground",
  READY: "border-cyan-500/30 text-cyan-200",
  DISPATCHED: "border-cyan-500/30 text-cyan-200",
  IN_PROGRESS: "border-primary/30 text-primary",
  BLOCKED: "border-red-500/30 text-red-300",
  AWAITING_APPROVAL: "border-amber-500/30 text-amber-300",
  AWAITING_VERIFICATION: "border-amber-500/30 text-amber-300",
  DONE: "border-emerald-500/30 text-emerald-300",
  CANCELED: "border-border text-muted-foreground",
};

function prettyLabel(value: string | undefined | null) {
  if (!value) return "—";
  return value.replace(/_/g, " ");
}

function criteriaFromText(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((title, index) => ({
      id: `ac-${index + 1}`,
      title,
      verificationMethod: "MANUAL" as const,
      status: "PENDING" as const,
    }));
}

export function WorkOrdersView({ projectId }: { projectId: Id<"projects"> | null }) {
  const [filters, setFilters] = useState<WorkOrderQueueFilters>(DEFAULT_WORK_ORDER_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createRequestKey, setCreateRequestKey] = useState<string | null>(null);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workOrders = useQuery(api.workOrders.list, projectId ? { projectId } : {});
  const selected = useQuery(
    api.workOrders.get,
    selectedId ? { workOrderId: selectedId as Id<"workOrders"> } : "skip"
  );
  const createWorkOrder = useMutation(api.workOrders.create);
  const dispatchWorkOrder = useMutation(api.workOrders.dispatch);
  const seedDemo = useMutation(api.workOrders.seedDemo);

  const filtered = useMemo(() => filterWorkOrders(workOrders ?? [], filters), [workOrders, filters]);

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId && filtered.length > 0) {
      setSelectedId(filtered[0]._id);
    }
    if (selectedId && filtered.length > 0 && !filtered.some((item) => item._id === selectedId)) {
      setSelectedId(filtered[0]._id);
    }
  }, [filtered, selectedId]);

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
      active: rows.filter((row) => ["READY", "DISPATCHED", "IN_PROGRESS", "AWAITING_APPROVAL", "AWAITING_VERIFICATION"].includes(row.state)).length,
      blocked: rows.filter((row) => row.state === "BLOCKED").length,
      attention: rows.filter((row) => !!row.requiredHumanAction || row.approvalStatus === "PENDING" || row.verificationStatus === "FAIL").length,
    };
  }, [workOrders]);

  async function handleSeed() {
    setSeeding(true);
    try {
      await seedDemo({});
    } finally {
      setSeeding(false);
    }
  }

  const canDispatchSelected = !!selected && ["READY", "BLOCKED", "DISPATCHED", "IN_PROGRESS"].includes(selected.workOrder.state)
    && !!selected.workOrder.workflowId
    && (selected.workOrder.approvalStatus === "APPROVED" || selected.workOrder.approvalStatus === "CONDITIONAL" || selected.workOrder.approvalStatus === "NOT_REQUIRED")
    && !selected.executionRuns.some((run) => ["PENDING", "RUNNING", "PAUSED"].includes(run.status));

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

        <div className="mt-4 grid gap-3 rounded-xl border border-[var(--panel-line)] bg-card/40 p-4 lg:grid-cols-6">
          <FilterSelect label="Repository" value={filters.repository} onChange={(value) => setFilters((current) => ({ ...current, repository: value }))} options={repositories} />
          <FilterSelect label="State" value={filters.state} onChange={(value) => setFilters((current) => ({ ...current, state: value }))} options={["READY", "DISPATCHED", "IN_PROGRESS", "BLOCKED", "AWAITING_APPROVAL", "AWAITING_VERIFICATION", "DONE"]} />
          <FilterSelect label="Risk" value={filters.riskLevel} onChange={(value) => setFilters((current) => ({ ...current, riskLevel: value }))} options={["LOW", "MEDIUM", "HIGH", "CRITICAL"]} />
          <FilterSelect label="Assigned" value={filters.assignedAgent} onChange={(value) => setFilters((current) => ({ ...current, assignedAgent: value }))} options={assignedAgents} />
          <FilterSelect label="Requested by" value={filters.requestedBy} onChange={(value) => setFilters((current) => ({ ...current, requestedBy: value }))} options={requestors} />
          <FilterSelect label="Verification" value={filters.verificationStatus} onChange={(value) => setFilters((current) => ({ ...current, verificationStatus: value }))} options={["PENDING", "PASS", "FAIL", "WAIVED"]} />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
          <div className="space-y-3">
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
                    onClick={() => setSelectedId(item._id)}
                    className={`w-full rounded-xl border p-4 text-left transition-colors ${selectedRow ? "border-cyan-400/40 bg-cyan-500/5" : "border-[var(--panel-line)] bg-card/40 hover:border-cyan-500/20"}`}
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
                      <div className="md:col-span-2 truncate">
                        <span className="text-foreground/80">Attention:</span> {summarizeRequiredAttention(item)}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <Card className="min-h-[420px] p-5">
            {!selected ? (
              <div className="text-sm text-muted-foreground">Select a work order to inspect requested outcome, criteria, and linked execution.</div>
            ) : (
              <div className="space-y-5">
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
                </div>

                <Section title="Outcome">
                  <p className="text-sm leading-relaxed text-foreground/85">{selected.workOrder.desiredOutcome}</p>
                  {selected.workOrder.context ? (
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{selected.workOrder.context}</p>
                  ) : null}
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

                <Section title="Acceptance criteria">
                  <div className="space-y-2">
                    {selected.workOrder.acceptanceCriteria.map((criterion) => (
                      <div key={criterion.id} className="rounded-lg border border-[var(--panel-line)] bg-background/30 px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-foreground">{criterion.title}</div>
                            {criterion.description ? <div className="mt-1 text-xs text-muted-foreground">{criterion.description}</div> : null}
                          </div>
                          <Badge variant="outline">{criterion.status}</Badge>
                        </div>
                      </div>
                    ))}
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
                  <div className="mb-3 flex justify-end">
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          setDispatchError(null);
                          setDispatchingId(selected.workOrder._id);
                          await dispatchWorkOrder({
                            workOrderId: selected.workOrder._id,
                            workflowId: selected.workOrder.workflowId,
                            actorType: "HUMAN",
                            actorId: "operator",
                            idempotencyKey: `ui-dispatch:${selected.workOrder._id}:${selected.workOrder.updatedAt}`,
                            runtime: "Mission Control UI",
                          });
                        } catch (err) {
                          setDispatchError(err instanceof Error ? err.message : "Dispatch failed");
                        } finally {
                          setDispatchingId(null);
                        }
                      }}
                      disabled={!canDispatchSelected || dispatchingId === selected.workOrder._id}
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
                              <PlayCircle className="h-4 w-4 text-cyan-200" />
                              <span className="text-sm font-medium text-foreground">{run.workflowId}</span>
                              <Badge variant="outline">{run.status}</Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">{run.runId}</div>
                          </div>
                          <div className="mt-2 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
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
            setSelectedId(result.workOrder?._id ?? null);
            setCreateOpen(false);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create work order");
          } finally {
            setCreating(false);
          }
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
        <SelectTrigger>
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
