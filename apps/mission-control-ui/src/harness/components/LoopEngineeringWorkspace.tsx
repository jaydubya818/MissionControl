import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import type { MainView } from "../../TopNav";
import { useToast } from "../../Toast";
import { ExecutionRunInspector } from "../../controlPlane/ExecutionRunInspector";
import { ResearchWatchlistPanel } from "./ResearchWatchlistPanel";
import {
  buildGraphDispatchTarget,
  graphDispatchPresentation,
  graphDispatchState,
  summarizeGraphExecution,
} from "../../lib/graphEngineering";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/factory/badges";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  ExternalLink,
  GitBranch,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { safeExternalUrl } from "../../lib/safeExternalUrl";

type LoopCycle = Doc<"loopEngineeringCycles">;
type Freshness = LoopCycle["sources"][number]["freshness"];
type SourceType = NonNullable<LoopCycle["sources"][number]["sourceType"]>;

const PHASES: Array<LoopCycle["phase"]> = [
  "RESEARCH",
  "VERIFY",
  "RECOMMEND",
  "AWAITING_APPROVAL",
  "IMPLEMENT",
  "VALIDATE",
  "MEASURE",
  "READY_FOR_NEXT_CYCLE",
  "COMPLETE",
];
const FRESHNESS: Array<"ALL" | Freshness> = [
  "ALL",
  "CURRENT",
  "RECENT",
  "RELEVANT",
  "FOUNDATIONAL",
  "STALE",
  "UNKNOWN",
];

function humanize(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function phaseTone(phase: LoopCycle["phase"]) {
  if (phase === "COMPLETE") return "success" as const;
  if (phase === "BLOCKED") return "error" as const;
  if (phase === "AWAITING_APPROVAL" || phase === "READY_FOR_NEXT_CYCLE") {
    return "warning" as const;
  }
  return "info" as const;
}

function parseDate(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = new Date(`${value}T12:00:00`).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

function PhaseProgress({ phase }: { phase: LoopCycle["phase"] }) {
  const currentIndex = PHASES.indexOf(phase);
  return (
    <ol className="grid gap-2 md:grid-cols-3 xl:grid-cols-9" aria-label="Loop Engineering phases">
      {PHASES.map((item, index) => {
        const complete = currentIndex > index || phase === "COMPLETE";
        const active = item === phase;
        return (
          <li
            key={item}
            className={cn(
              "rounded-lg border px-3 py-2",
              active
                ? "border-registry-accent/50 bg-registry-accent-soft"
                : "border-line bg-surface-1"
            )}
            aria-current={active ? "step" : undefined}
          >
            <div className="flex items-center gap-2">
              {complete ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-ok" aria-hidden />
              ) : (
                <Circle
                  className={cn("h-3.5 w-3.5", active ? "text-registry-accent" : "text-ink-muted")}
                  aria-hidden
                />
              )}
              <span className="text-[11.5px] font-medium text-ink-secondary">
                {humanize(item)}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function LoopEngineeringWorkspace({
  projectId,
  onNavigate,
  onCycleScopeChange,
}: {
  projectId: Id<"projects"> | null;
  onNavigate: (view: MainView) => void;
  onCycleScopeChange?: (scope: { cycleId: Id<"loopEngineeringCycles"> | null }) => void;
}) {
  const cycles = useQuery(
    api.loopEngineering.listByProject,
    projectId ? { projectId } : "skip"
  );
  const tasks = useQuery(api.tasks.listAll, projectId ? { projectId } : {});
  const executionControl = useQuery(
    api.operatorControls.getCurrent,
    projectId ? { projectId } : "skip",
  );
  const createCycle = useAction(api.loopEngineering.create);
  const projectWorkflowRun = useAction(api.loopEngineering.projectWorkflowRun);
  const dispatchLegacyGraph = useMutation(api.workOrders.dispatch);
  const dispatchResearchGraph = useAction(api.loopEngineering.dispatchResearchGraph);
  const addSource = useMutation(api.loopEngineering.addSource);
  const decideSource = useMutation(api.loopEngineering.decideSource);
  const addClaim = useMutation(api.loopEngineering.addClaim);
  const addRecommendation = useMutation(api.loopEngineering.addRecommendation);
  const advance = useMutation(api.loopEngineering.advance);
  const approveRecommendations = useAction(api.loopEngineering.approveRecommendations);
  const rejectRecommendations = useMutation(api.loopEngineering.rejectRecommendations);
  const syncImplementation = useMutation(api.loopEngineering.syncImplementation);
  const recordValidation = useMutation(api.loopEngineering.recordValidation);
  const recordMeasurement = useMutation(api.loopEngineering.recordMeasurement);
  const createNextCycle = useAction(api.loopEngineering.createNextCycle);
  const { toast } = useToast();

  const [selectedId, setSelectedId] = useState<Id<"loopEngineeringCycles"> | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [freshnessFilter, setFreshnessFilter] = useState<"ALL" | Freshness>("ALL");
  const [inspectedRunId, setInspectedRunId] = useState<Id<"workflowRuns"> | null>(null);

  useEffect(() => {
    if (!cycles?.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !cycles.some((cycle) => cycle._id === selectedId)) {
      setSelectedId(cycles[0]._id);
    }
  }, [cycles, selectedId]);

  const cycle = cycles?.find((item) => item._id === selectedId) ?? cycles?.[0];
  useEffect(() => {
    onCycleScopeChange?.({ cycleId: cycle?._id ?? null });
  }, [cycle?._id, onCycleScopeChange]);
  const selectedWorkOrderId = cycle?.rootWorkOrderId ?? cycle?.workOrderIds[0];
  const workOrderDetail = useQuery(
    api.workOrders.get,
    selectedWorkOrderId ? { workOrderId: selectedWorkOrderId } : "skip"
  );
  const latestGraphRunSummary = workOrderDetail?.executionRuns[0];
  const latestGraphRun = useQuery(
    api.workflowRuns.getById,
    latestGraphRunSummary ? { id: latestGraphRunSummary._id } : "skip"
  );
  const taskById = useMemo(
    () => new Map((tasks ?? []).map((task) => [task._id, task])),
    [tasks]
  );
  const rootWorkOrder = workOrderDetail?.workOrder;
  const researchObservationCount = cycle?.sources.filter(
    (source) => Boolean(source.researchObservationId)
  ).length ?? 0;
  const evidenceBound = Boolean(cycle?.researchSourceRunIds?.length);
  const graphLoading = workOrderDetail === undefined
    || (latestGraphRunSummary !== undefined && latestGraphRun === undefined);

  const run = async (operation: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await operation();
      toast(success);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Loop Engineering action failed", true);
    } finally {
      setBusy(false);
    }
  };

  if (!projectId) {
    return (
      <div className="rounded-xl border border-line bg-surface-1 p-8 text-center">
        <p className="text-sm text-ink-secondary">
          Select a workspace before starting a Loop Engineering cycle.
        </p>
      </div>
    );
  }

  if (cycles === undefined) {
    return (
      <div className="rounded-xl border border-line bg-surface-1 p-6">
        <div className="h-4 w-48 animate-pulse rounded bg-surface-2" />
        <div className="mt-3 h-3 w-80 animate-pulse rounded bg-surface-2" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ResearchWatchlistPanel
        projectId={projectId}
        onCycleCreated={(cycleId) => setSelectedId(cycleId)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Select
            value={cycle?._id ?? ""}
            onValueChange={(value) => setSelectedId(value as Id<"loopEngineeringCycles">)}
            disabled={cycles.length === 0}
          >
            <SelectTrigger className="w-[320px]" aria-label="Selected Loop Engineering cycle">
              <SelectValue placeholder="No cycles yet" />
            </SelectTrigger>
            <SelectContent>
              {cycles.map((item) => (
                <SelectItem key={item._id} value={item._id}>
                  Iteration {item.iteration} · {item.objective}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {cycle && <StatusBadge tone={phaseTone(cycle.phase)}>{humanize(cycle.phase)}</StatusBadge>}
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Start cycle
        </Button>
      </div>

      {!cycle ? (
        <div className="rounded-xl border border-line bg-surface-1 px-6 py-10 text-center">
          <h2 className="text-[19px] font-semibold text-ink">No learning cycle yet</h2>
          <p className="mx-auto mt-2 max-w-[64ch] text-sm text-ink-secondary">
            Start with one measurable objective. Mission Control will create governed research,
            evidence-verification, and recommendation work without authorizing repository changes.
          </p>
          <Button className="mt-5" onClick={() => setCreateOpen(true)}>
            Start the first cycle
          </Button>
        </div>
      ) : (
        <>
          <PhaseProgress phase={cycle.phase} />

          <GraphExecutionCard
            loading={graphLoading}
            workOrder={rootWorkOrder}
            run={latestGraphRun}
            evidenceBound={evidenceBound}
            observationCount={researchObservationCount}
            executionControl={executionControl}
            busy={busy}
            onDispatch={() => {
              if (!rootWorkOrder) return;
              void run(
                async () => {
                  const target = buildGraphDispatchTarget({
                    cycleId: cycle._id,
                    workOrderId: rootWorkOrder._id,
                    workOrderRevision: rootWorkOrder.currentRevisionNumber ?? 1,
                    researchSourceRunIds: cycle.researchSourceRunIds,
                  });
                  const result = target.kind === "CONTINUOUS_RESEARCH"
                    ? await dispatchResearchGraph({
                        cycleId: target.cycleId as Id<"loopEngineeringCycles">,
                      })
                    : await dispatchLegacyGraph({
                        workOrderId: target.workOrderId as Id<"workOrders">,
                        actorType: "HUMAN",
                        idempotencyKey: target.idempotencyKey,
                      });
                  if (!result.run) {
                    throw new Error(
                      result.reason === "routing-exhausted"
                        ? "No approved model route is currently available for this graph. Review Model Routing before retrying."
                        : "The graph could not be dispatched. Review the WorkOrder for the blocking condition."
                    );
                  }
                  setInspectedRunId(result.run._id);
                },
                "Graph dispatched"
              );
            }}
            onInspect={() => latestGraphRun && setInspectedRunId(latestGraphRun._id)}
            onOpenWorkOrder={() => onNavigate("control-work-orders")}
          />

          <ProjectionStatusCard
            cycle={cycle}
            workflowRun={latestGraphRun}
            busy={busy}
            onSync={() => {
              if (!latestGraphRun) return;
              void run(
                () => projectWorkflowRun({ workflowRunId: latestGraphRun._id }),
                "Completed workflow evidence synchronized"
              );
            }}
          />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <CycleGateCard
                cycle={cycle}
                busy={busy}
                onAdvance={() =>
                  run(
                    () => advance({ cycleId: cycle._id }),
                    "Cycle advanced"
                  )
                }
                onApprove={() =>
                  run(
                    () =>
                      approveRecommendations({
                        cycleId: cycle._id,
                        idempotencyKey: `loop-approval:${cycle._id}`,
                      }),
                    "Implementation work created"
                  )
                }
                onReject={(reason) =>
                  run(
                    () =>
                      rejectRecommendations({
                        cycleId: cycle._id,
                        reason,
                      }),
                    "Recommendations returned for revision"
                  )
                }
                onSync={() =>
                  run(
                    () => syncImplementation({ cycleId: cycle._id }),
                    "Implementation status synchronized"
                  )
                }
                onCreateNext={(values) =>
                  run(
                    () =>
                      createNextCycle({
                        cycleId: cycle._id,
                        objective: values.objective,
                        hypothesis: values.hypothesis || undefined,
                        stopCondition: values.stopCondition,
                      }),
                    "Next learning cycle created"
                  )
                }
              />

              <EvidenceLedger
                cycle={cycle}
                busy={busy}
                freshnessFilter={freshnessFilter}
                onFreshnessFilter={setFreshnessFilter}
                onAddSource={(values) =>
                  run(
                    () =>
                      addSource({
                        cycleId: cycle._id,
                        title: values.title,
                        url: values.url,
                        publisher: values.publisher || undefined,
                        publishedAt: parseDate(values.publishedAt),
                        sourceType: values.sourceType,
                        vendorClaim: values.vendorClaim,
                        syndicatedFromUrl: values.syndicatedFromUrl || undefined,
                      }),
                    "Source recorded"
                  )
                }
                onDecide={(sourceId, decision, reason) =>
                  run(
                    () =>
                      decideSource({
                        cycleId: cycle._id,
                        sourceId,
                        decision,
                        reason: reason || undefined,
                      }),
                    decision === "ACCEPTED" ? "Source accepted" : "Source rejected"
                  )
                }
              />

              <ClaimLedger
                cycle={cycle}
                busy={busy}
                onAdd={(values) =>
                  run(
                    () =>
                      addClaim({
                        cycleId: cycle._id,
                        ...values,
                      }),
                    "Claim recorded"
                  )
                }
              />

              <RecommendationLedger
                cycle={cycle}
                busy={busy}
                onAdd={(values) =>
                  run(
                    () =>
                      addRecommendation({
                        cycleId: cycle._id,
                        title: values.title,
                        rationale: values.rationale,
                        evidenceSourceIds: values.evidenceSourceIds,
                        confidence: values.confidence,
                      }),
                    "Recommendation recorded"
                  )
                }
              />

              <ValidationAndMeasurement
                cycle={cycle}
                busy={busy}
                onValidation={(values) =>
                  run(
                    () =>
                      recordValidation({
                        cycleId: cycle._id,
                        name: values.name,
                        status: values.status,
                        evidenceLocation: values.evidenceLocation,
                      }),
                    "Validation evidence recorded"
                  )
                }
                onMeasurement={(values) =>
                  run(
                    () =>
                      recordMeasurement({
                        cycleId: cycle._id,
                        name: values.name,
                        baseline: Number(values.baseline),
                        result: Number(values.result),
                        unit: values.unit,
                        target: values.target === "" ? undefined : Number(values.target),
                        passed: values.passed,
                        evidenceLocation: values.evidenceLocation,
                      }),
                    "Measurement recorded"
                  )
                }
              />
            </div>

            <aside className="space-y-4">
              <div className="rounded-xl border border-line bg-surface-1 p-4">
                <h2 className="text-[15px] font-semibold text-ink">Cycle contract</h2>
                <dl className="mt-3 divide-y divide-line text-[12.5px]">
                  <Meta label="Objective" value={cycle.objective} />
                  <Meta label="Hypothesis" value={cycle.hypothesis ?? "Not stated"} />
                  <Meta label="Research question" value={cycle.researchBrief?.question ?? cycle.objective} />
                  <Meta label="Scope" value={cycle.researchBrief?.scope ?? "Not stated"} />
                  <Meta label="Exclusions" value={cycle.researchBrief?.exclusions.join(", ") || "None stated"} />
                  <Meta label="Freshness window" value={cycle.researchBrief?.freshnessWindow ?? "Not stated"} />
                  <Meta label="Preferred sources" value={cycle.researchBrief?.preferredSourceTypes.join(", ") || "Not stated"} />
                  <Meta label="Required output" value={cycle.researchBrief?.requiredOutput ?? "Not stated"} />
                  <Meta label="Approval policy" value={cycle.researchBrief?.approvalPolicy ?? "Explicit operator approval"} />
                  <Meta label="Stop condition" value={cycle.stopCondition} />
                  <Meta label="Iteration" value={`${cycle.iteration} of ${cycle.maxIterations}`} />
                  <Meta label="Approval" value={cycle.approvalActorId ?? "Not approved"} />
                </dl>
              </div>

              <div className="rounded-xl border border-line bg-surface-1 p-4">
                <h2 className="text-[15px] font-semibold text-ink">Linked factory work</h2>
                <div className="mt-3 space-y-2">
                  {cycle.taskIds.map((taskId) => {
                    const task = taskById.get(taskId);
                    return (
                      <button
                        key={taskId}
                        type="button"
                        onClick={() => onNavigate("tasks")}
                        className="flex w-full items-start justify-between gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-left transition-colors hover:border-line-strong"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[12.5px] text-ink">
                            {task?.title ?? taskId}
                          </span>
                          <span className="mt-0.5 block text-[11.5px] text-ink-muted">
                            {task ? humanize(task.status) : "Linked task"}
                          </span>
                        </span>
                        <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted" />
                      </button>
                    );
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => onNavigate("control-work-orders")}
                >
                  View {cycle.workOrderIds.length} WorkOrders
                </Button>
              </div>
            </aside>
          </div>
        </>
      )}

      <CreateCycleDialog
        open={createOpen}
        busy={busy}
        onClose={() => setCreateOpen(false)}
        onCreate={(values) =>
          run(
            async () => {
              const result = await createCycle({
                projectId,
                objective: values.objective,
                hypothesis: values.hypothesis || undefined,
                researchBrief: {
                  question: values.question,
                  scope: values.scope,
                  exclusions: values.exclusions.split("\n").map((value) => value.trim()).filter(Boolean),
                  freshnessWindow: values.freshnessWindow,
                  preferredSourceTypes: values.preferredSourceTypes.split(",").map((value) => value.trim()).filter(Boolean),
                  requiredOutput: values.requiredOutput,
                  approvalPolicy: values.approvalPolicy,
                },
                stopCondition: values.stopCondition,
                maxIterations: Number(values.maxIterations),
                idempotencyKey: `loop-cycle:${projectId}:${values.objective.trim().toLowerCase()}`,
              });
              if (result.cycle?._id) setSelectedId(result.cycle._id);
              setCreateOpen(false);
            },
            "Loop Engineering cycle created"
          )
        }
      />
      <ExecutionRunInspector
        open={inspectedRunId !== null}
        workflowRunId={inspectedRunId}
        onClose={() => setInspectedRunId(null)}
      />
    </div>
  );
}

function GraphExecutionCard({
  loading,
  workOrder,
  run,
  evidenceBound,
  observationCount,
  executionControl,
  busy,
  onDispatch,
  onInspect,
  onOpenWorkOrder,
}: {
  loading: boolean;
  workOrder?: {
    _id: Id<"workOrders">;
    title: string;
    state: string;
    currentRevisionNumber?: number;
  } | null;
  run?: Doc<"workflowRuns"> | null;
  evidenceBound: boolean;
  observationCount: number;
  executionControl?: {
    mode: "NORMAL" | "PAUSED" | "DRAINING" | "KILLED" | "QUARANTINED";
    executionPolicy: {
      continuousSchedulingEnabled: boolean;
      dailyBudgetUsd: number;
      perRunBudgetUsd: number;
      maxConcurrentRuns: number;
    };
  };
  busy: boolean;
  onDispatch: () => void;
  onInspect: () => void;
  onOpenWorkOrder: () => void;
}) {
  const state = graphDispatchState({ loading, workOrder, run });
  const summary = run ? summarizeGraphExecution(run) : null;
  const presentation = graphDispatchPresentation({ evidenceBound, observationCount });
  const workspaceAllowsManualDispatch = executionControl?.mode === "NORMAL";
  const stateCopy: Record<typeof state, { label: string; detail: string }> = {
    LOADING: {
      label: "Loading",
      detail: "Resolving the governed WorkOrder and its latest graph run.",
    },
    MISSING_WORK_ORDER: {
      label: "WorkOrder missing",
      detail: "This cycle is missing its root WorkOrder and cannot be dispatched safely.",
    },
    READY: {
      label: "Ready to dispatch",
      detail: presentation.readyDetail,
    },
    QUEUED: {
      label: "Queued",
      detail: "The graph is waiting for the workflow executor to claim its first runnable nodes.",
    },
    RUNNING: {
      label: "Running",
      detail: "Independent nodes are executing within the configured concurrency limit.",
    },
    AWAITING_APPROVAL: {
      label: "Awaiting approval",
      detail: "Evidence synthesis is complete. The graph cannot cross its terminal gate without an operator decision.",
    },
    COMPLETED: {
      label: "Completed",
      detail: "The graph reached a terminal state with its evidence-linked approval intact.",
    },
    RECOVERY_REQUIRED: {
      label: "Recovery required",
      detail: summary?.failureReason ?? "The run stopped and requires governed recovery from its WorkOrder.",
    },
    UNAVAILABLE: {
      label: "Not dispatchable",
      detail: "Review the WorkOrder state and governance requirements before dispatching this graph.",
    },
  };
  const tone = state === "COMPLETED"
    ? "success" as const
    : state === "RECOVERY_REQUIRED" || state === "MISSING_WORK_ORDER"
      ? "error" as const
      : state === "AWAITING_APPROVAL"
        ? "warning" as const
        : "info" as const;

  return (
    <section className="rounded-xl border border-line bg-surface-1 p-5" aria-labelledby="graph-execution-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <GitBranch className="h-4 w-4 text-registry-accent" aria-hidden />
            <h2 id="graph-execution-title" className="text-[16px] font-semibold text-ink">
              {presentation.title}
            </h2>
            <StatusBadge tone={tone}>{stateCopy[state].label}</StatusBadge>
          </div>
          <p className="mt-2 max-w-[78ch] text-[12.5px] leading-relaxed text-ink-secondary">
            {stateCopy[state].detail}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11.5px] text-ink-muted">
            <span>Workspace: {executionControl?.mode ?? "loading"}</span>
            <span>·</span>
            <span>Continuous scheduling: {executionControl?.executionPolicy.continuousSchedulingEnabled ? "enabled" : "disabled"}</span>
            {executionControl && (
              <>
                <span>·</span>
                <span>Run limit: {executionControl.executionPolicy.maxConcurrentRuns}</span>
                <span>·</span>
                <span>Budget: ${executionControl.executionPolicy.perRunBudgetUsd.toFixed(2)} / run</span>
              </>
            )}
          </div>
          {workOrder && (
            <p className="mt-2 text-[11.5px] text-ink-muted">
              {workOrder.title} · revision {workOrder.currentRevisionNumber ?? 1}
              {run ? ` · ${run.workflowId}@v${run.workflowVersion ?? "legacy"}` : ""}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {state === "READY" && (
            <Button size="sm" disabled={busy || !workspaceAllowsManualDispatch} onClick={onDispatch}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
              {presentation.buttonLabel}
            </Button>
          )}
          {state === "RECOVERY_REQUIRED" && evidenceBound && (
            <Button size="sm" disabled={busy || !workspaceAllowsManualDispatch} onClick={onDispatch}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1.5 h-4 w-4" />}
              {presentation.retryButtonLabel}
            </Button>
          )}
          {run && (
            <Button size="sm" variant="outline" onClick={onInspect}>
              Inspect run
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onOpenWorkOrder}>
            View WorkOrder
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-16 animate-pulse rounded-lg bg-surface-2" />
          ))}
        </div>
      ) : summary && run ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <GraphMetric label="Nodes complete" value={`${summary.complete}/${summary.total}`} />
            <GraphMetric label="Active now" value={String(summary.active)} />
            <GraphMetric label="Independent verification" value={`${summary.verificationComplete}/${summary.verificationTotal}`} />
            <GraphMetric label="Parallel limit" value={String(run.maxConcurrency ?? 1)} />
          </div>
          <div className="mt-4" aria-label={`${summary.progressPercent}% of graph nodes complete`}>
            <div className="mb-1.5 flex items-center justify-between text-[11.5px] text-ink-muted">
              <span>{run.topology ?? "LINEAR"} execution</span>
              <span>{summary.progressPercent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-registry-accent transition-[width]"
                style={{ width: `${summary.progressPercent}%` }}
              />
            </div>
          </div>
          {(summary.failed > 0 || summary.blocked > 0) && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-[12px] text-ink-secondary">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
              <span>{summary.failed} failed and {summary.blocked} blocked node(s). Inspect the run before recovery.</span>
            </div>
          )}
        </>
      ) : state === "READY" ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12px] text-ink-secondary">
          {workspaceAllowsManualDispatch ? (
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />
          ) : (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          )}
          <span>
            {workspaceAllowsManualDispatch
              ? presentation.boundaryDetail
              : `Manual dispatch is blocked while the workspace is ${executionControl?.mode ?? "loading"}.`}
          </span>
        </div>
      ) : null}
    </section>
  );
}

function GraphMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-[0.08em] text-ink-muted">{label}</div>
      <div className="mt-1 text-[17px] font-semibold tabular-nums text-ink">{value}</div>
    </div>
  );
}

function ProjectionStatusCard({
  cycle,
  workflowRun,
  busy,
  onSync,
}: {
  cycle: LoopCycle;
  workflowRun?: Doc<"workflowRuns"> | null;
  busy: boolean;
  onSync: () => void;
}) {
  const completed = workflowRun?.status === "COMPLETED";
  const currentRunProjected = completed
    && cycle.latestWorkflowRunId === workflowRun?._id
    && cycle.projectionStatus === "PROJECTED";
  const needsSync = completed && !currentRunProjected;
  const summary = cycle.projectionSummary;
  const status = cycle.projectionStatus ?? (completed ? "PENDING" : "PENDING");
  const tone = status === "PROJECTED" ? "success" as const : status === "FAILED" ? "error" as const : "warning" as const;

  return (
    <section className="rounded-xl border border-line bg-surface-1 p-4" aria-labelledby="projection-status-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="projection-status-title" className="text-[15px] font-semibold text-ink">
              Workflow evidence projection
            </h2>
            <StatusBadge tone={tone}>{humanize(status)}</StatusBadge>
          </div>
          <p className="mt-1 text-[12.5px] text-ink-secondary">
            Completed graph output is imported once into the cycle ledger; the workflow approval remains the authoritative gate.
          </p>
          {cycle.projectionError && (
            <p className="mt-2 text-[12px] text-danger" role="alert">{cycle.projectionError}</p>
          )}
        </div>
        {needsSync && (
          <Button size="sm" variant="outline" disabled={busy} onClick={onSync}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Sync completed evidence
          </Button>
        )}
      </div>
      {summary && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <GraphMetric label="Sources" value={String(summary.sourceCount)} />
          <GraphMetric label="Claims" value={String(summary.claimCount)} />
          <GraphMetric label="Recommendations" value={String(summary.recommendationCount)} />
          <GraphMetric label="Measurements" value={String(summary.measurementCount)} />
          <GraphMetric label="Outcome" value={summary.cleanStop ? "Clean stop" : "Implementation"} />
        </div>
      )}
      {summary?.stopCondition && (
        <p className="mt-3 text-[11.5px] text-ink-muted">Stop condition: {summary.stopCondition}</p>
      )}
    </section>
  );
}

function CycleGateCard({
  cycle,
  busy,
  onAdvance,
  onApprove,
  onReject,
  onSync,
  onCreateNext,
}: {
  cycle: LoopCycle;
  busy: boolean;
  onAdvance: () => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
  onSync: () => void;
  onCreateNext: (values: {
    objective: string;
    hypothesis: string;
    stopCondition: string;
  }) => void;
}) {
  const [rejectReason, setRejectReason] = useState("");
  const [nextObjective, setNextObjective] = useState("");
  const [nextHypothesis, setNextHypothesis] = useState("");
  const [nextStop, setNextStop] = useState(cycle.stopCondition);
  const gateCopy: Record<LoopCycle["phase"], string> = {
    RESEARCH: "Record at least one source, then move the cycle to independent verification.",
    VERIFY: "Every source needs an explicit accept/reject decision; rejection requires a reason.",
    RECOMMEND: "Create at least one recommendation linked only to accepted evidence.",
    AWAITING_APPROVAL: "Approval is explicit and creates implementation tasks and governed WorkOrders.",
    IMPLEMENT: "Complete linked implementation tasks, synchronize their state, then validate.",
    VALIDATE: "Record passing test evidence before measuring the outcome.",
    MEASURE: "Record at least one baseline-to-result measurement.",
    READY_FOR_NEXT_CYCLE: "Stop if the condition is met, or create one bounded next cycle from a remaining gap.",
    COMPLETE: "This cycle is complete and retained as evidence.",
    BLOCKED: cycle.blockedReason ?? "Resolve the blocker before continuing.",
  };

  return (
    <section className="rounded-xl border border-line bg-surface-1 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-registry-accent" />
            <h2 className="text-[15px] font-semibold text-ink">Current gate</h2>
          </div>
          <p className="mt-2 max-w-[72ch] text-[13px] text-ink-secondary">
            {gateCopy[cycle.phase]}
          </p>
        </div>
        {cycle.phase === "IMPLEMENT" ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onSync} disabled={busy}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Sync tasks
            </Button>
            <Button size="sm" onClick={onAdvance} disabled={busy}>
              Continue to validation
            </Button>
          </div>
        ) : !["AWAITING_APPROVAL", "READY_FOR_NEXT_CYCLE", "COMPLETE", "BLOCKED"].includes(
            cycle.phase
          ) ? (
          <Button size="sm" onClick={onAdvance} disabled={busy}>
            Continue
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>

      {cycle.phase === "AWAITING_APPROVAL" && (
        <div className="mt-4 grid gap-3 border-t border-line pt-4 md:grid-cols-[1fr_auto_auto]">
          <Input
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="Reason required when rejecting"
            aria-label="Recommendation rejection reason"
          />
          <Button
            variant="outline"
            onClick={() => onReject(rejectReason)}
            disabled={busy || !rejectReason.trim()}
          >
            Reject
          </Button>
          <Button onClick={onApprove} disabled={busy}>
            {cycle.workflowApprovalId ? "Create approved implementation work" : "Approve implementation"}
          </Button>
        </div>
      )}

      {cycle.phase === "READY_FOR_NEXT_CYCLE" && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              value={nextObjective}
              onChange={(event) => setNextObjective(event.target.value)}
              placeholder="Remaining gap for the next cycle"
              aria-label="Next cycle objective"
            />
            <Input
              value={nextHypothesis}
              onChange={(event) => setNextHypothesis(event.target.value)}
              placeholder="Updated hypothesis (optional)"
              aria-label="Next cycle hypothesis"
            />
          </div>
          <Input
            value={nextStop}
            onChange={(event) => setNextStop(event.target.value)}
            placeholder="Next cycle stop condition"
            aria-label="Next cycle stop condition"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onAdvance} disabled={busy}>
              Stop — condition met
            </Button>
            <Button
              onClick={() =>
                onCreateNext({
                  objective: nextObjective,
                  hypothesis: nextHypothesis,
                  stopCondition: nextStop,
                })
              }
              disabled={busy || !nextObjective.trim() || !nextStop.trim()}
            >
              Create next cycle
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function EvidenceLedger({
  cycle,
  busy,
  freshnessFilter,
  onFreshnessFilter,
  onAddSource,
  onDecide,
}: {
  cycle: LoopCycle;
  busy: boolean;
  freshnessFilter: "ALL" | Freshness;
  onFreshnessFilter: (value: "ALL" | Freshness) => void;
  onAddSource: (values: {
    title: string;
    url: string;
    publisher: string;
    publishedAt: string;
    sourceType: SourceType;
    vendorClaim: boolean;
    syndicatedFromUrl: string;
  }) => void;
  onDecide: (
    sourceId: string,
    decision: "ACCEPTED" | "REJECTED",
    reason: string
  ) => void;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [publisher, setPublisher] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("OTHER");
  const [vendorClaim, setVendorClaim] = useState(false);
  const [syndicatedFromUrl, setSyndicatedFromUrl] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const visibleSources = cycle.sources.filter(
    (source) => freshnessFilter === "ALL" || source.freshness === freshnessFilter
  );
  const canCollect = ["RESEARCH", "VERIFY"].includes(cycle.phase);

  return (
    <section className="rounded-xl border border-line bg-surface-1 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Evidence ledger</h2>
          <p className="mt-1 text-[12.5px] text-ink-secondary">
            Publication and retrieval dates remain separate; missing dates are classified Unknown.
          </p>
        </div>
        <Select
          value={freshnessFilter}
          onValueChange={(value) => onFreshnessFilter(value as "ALL" | Freshness)}
        >
          <SelectTrigger className="w-[170px]" aria-label="Filter sources by freshness">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FRESHNESS.map((value) => (
              <SelectItem key={value} value={value}>
                {humanize(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {canCollect && (
        <form
          className="mt-4 grid gap-3 border-t border-line pt-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            onAddSource({ title, url, publisher, publishedAt, sourceType, vendorClaim, syndicatedFromUrl });
            setTitle("");
            setUrl("");
            setPublisher("");
            setPublishedAt("");
            setSourceType("OTHER");
            setVendorClaim(false);
            setSyndicatedFromUrl("");
          }}
        >
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Source title" required />
          <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" type="url" required />
          <Input value={publisher} onChange={(event) => setPublisher(event.target.value)} placeholder="Publisher (optional)" />
          <Select value={sourceType} onValueChange={(value) => setSourceType(value as SourceType)}>
            <SelectTrigger aria-label="Source type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PRIMARY">Primary source</SelectItem>
              <SelectItem value="OFFICIAL_DOCS">Official documentation</SelectItem>
              <SelectItem value="RESEARCH">Research</SelectItem>
              <SelectItem value="NEWS">News</SelectItem>
              <SelectItem value="VENDOR">Vendor</SelectItem>
              <SelectItem value="COMMUNITY">Community</SelectItem>
              <SelectItem value="OTHER">Other</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={syndicatedFromUrl}
            onChange={(event) => setSyndicatedFromUrl(event.target.value)}
            placeholder="Syndicated from URL (optional)"
            type="url"
          />
          <div className="flex gap-2">
            <Input
              value={publishedAt}
              onChange={(event) => setPublishedAt(event.target.value)}
              type="date"
              aria-label="Source publication date"
            />
            <Button type="submit" disabled={busy || !title.trim() || !url.trim()}>
              Add
            </Button>
          </div>
          <label className="flex items-center gap-2 text-[12.5px] text-ink-secondary">
            <input
              type="checkbox"
              checked={vendorClaim}
              onChange={(event) => setVendorClaim(event.target.checked)}
            />
            Contains vendor claims
          </label>
        </form>
      )}

      <div className="mt-4 divide-y divide-line rounded-lg border border-line">
        {visibleSources.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12.5px] text-ink-muted">
            No sources match this filter.
          </p>
        ) : (
          visibleSources.map((source) => (
            <div key={source.id} className="space-y-3 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <a
                    href={safeExternalUrl(source.url) ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[13px] font-medium text-ink hover:underline"
                  >
                    {source.title}
                  </a>
                  <p className="mt-1 text-[11.5px] text-ink-muted">
                    {source.publisher ?? "Publisher not recorded"} · Retrieved{" "}
                    {new Date(source.retrievedAt).toLocaleDateString()}
                  </p>
                  <p className="mt-1 text-[11.5px] text-ink-muted">
                    {humanize(source.sourceType ?? "OTHER")}
                    {source.vendorClaim ? " · Vendor claim" : ""}
                    {source.syndicatedFromUrl ? " · Syndicated content" : ""}
                  </p>
                  {source.researchObservationId && (
                    <p className="mt-1 font-mono text-[10.5px] text-info-accent">
                      Verified observation {String(source.researchObservationId).slice(-8)}
                      {source.runArtifactId ? ` · artifact ${String(source.runArtifactId).slice(-8)}` : ""}
                      {source.safetyScanStatus ? ` · ${humanize(source.safetyScanStatus)}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <StatusBadge tone="neutral">{humanize(source.freshness)}</StatusBadge>
                  <StatusBadge
                    tone={
                      source.decision === "ACCEPTED"
                        ? "success"
                        : source.decision === "REJECTED"
                          ? "error"
                          : "warning"
                    }
                  >
                    {humanize(source.decision)}
                  </StatusBadge>
                </div>
              </div>
              {source.decisionReason && (
                <p className="text-[12px] text-ink-secondary">{source.decisionReason}</p>
              )}
              {cycle.phase === "VERIFY" && source.decision === "PENDING" && (
                <div className="flex flex-wrap gap-2">
                  <Input
                    className="min-w-[220px] flex-1"
                    value={reasons[source.id] ?? ""}
                    onChange={(event) =>
                      setReasons((current) => ({ ...current, [source.id]: event.target.value }))
                    }
                    placeholder="Reason required only for rejection"
                    aria-label={`Decision reason for ${source.title}`}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDecide(source.id, "REJECTED", reasons[source.id] ?? "")}
                    disabled={busy || !(reasons[source.id] ?? "").trim()}
                  >
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => onDecide(source.id, "ACCEPTED", reasons[source.id] ?? "")}
                    disabled={busy}
                  >
                    Accept
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function ClaimLedger({
  cycle,
  busy,
  onAdd,
}: {
  cycle: LoopCycle;
  busy: boolean;
  onAdd: (values: {
    statement: string;
    supportingSourceIds: string[];
    contradictorySourceIds: string[];
    unsupported: boolean;
    confidence: "LOW" | "MEDIUM" | "HIGH";
  }) => void;
}) {
  const [statement, setStatement] = useState("");
  const [supportingSourceIds, setSupportingSourceIds] = useState<string[]>([]);
  const [contradictorySourceIds, setContradictorySourceIds] = useState<string[]>([]);
  const [unsupported, setUnsupported] = useState(false);
  const [confidence, setConfidence] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const acceptedSources = cycle.sources.filter((source) => source.decision === "ACCEPTED");
  const claims = cycle.claims ?? [];
  const canAdd = ["VERIFY", "RECOMMEND"].includes(cycle.phase);

  const toggle = (
    sourceId: string,
    current: string[],
    setCurrent: (ids: string[]) => void
  ) => {
    setCurrent(
      current.includes(sourceId)
        ? current.filter((id) => id !== sourceId)
        : [...current, sourceId]
    );
  };

  return (
    <section className="rounded-xl border border-line bg-surface-1 p-4">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">Claim–evidence ledger</h2>
        <p className="mt-1 text-[12.5px] text-ink-secondary">
          Material claims must link to accepted evidence or be explicitly marked unsupported.
        </p>
      </div>
      <div className="mt-4 space-y-3">
        {claims.length === 0 ? (
          <p className="rounded-lg border border-line bg-surface-2 px-4 py-5 text-center text-[12.5px] text-ink-muted">
            No material claims recorded.
          </p>
        ) : claims.map((claim) => (
          <div key={claim.id} className="rounded-lg border border-line bg-surface-2 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="max-w-[72ch] text-[13px] text-ink">{claim.statement}</p>
              <StatusBadge tone={claim.unsupported ? "warning" : "success"}>
                {claim.unsupported ? "Unsupported" : `${claim.confidence} confidence`}
              </StatusBadge>
            </div>
            <p className="mt-2 text-[11.5px] text-ink-muted">
              {claim.supportingSourceIds.length} supporting · {claim.contradictorySourceIds.length} contradictory
            </p>
          </div>
        ))}
      </div>

      {canAdd && (
        <form
          className="mt-4 space-y-3 border-t border-line pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            onAdd({
              statement,
              supportingSourceIds,
              contradictorySourceIds,
              unsupported,
              confidence,
            });
            setStatement("");
            setSupportingSourceIds([]);
            setContradictorySourceIds([]);
            setUnsupported(false);
          }}
        >
          <Textarea
            value={statement}
            onChange={(event) => setStatement(event.target.value)}
            placeholder="Material claim"
            required
          />
          <div className="grid gap-3 md:grid-cols-2">
            <fieldset className="rounded-lg border border-line p-3">
              <legend className="px-1 text-[11.5px] font-medium text-ink-muted">Supporting evidence</legend>
              {acceptedSources.map((source) => (
                <label key={source.id} className="mt-2 flex items-center gap-2 text-[12.5px] text-ink-secondary">
                  <input
                    type="checkbox"
                    checked={supportingSourceIds.includes(source.id)}
                    disabled={unsupported}
                    onChange={() => toggle(source.id, supportingSourceIds, setSupportingSourceIds)}
                  />
                  {source.title}
                </label>
              ))}
            </fieldset>
            <fieldset className="rounded-lg border border-line p-3">
              <legend className="px-1 text-[11.5px] font-medium text-ink-muted">Contradictory evidence</legend>
              {acceptedSources.map((source) => (
                <label key={source.id} className="mt-2 flex items-center gap-2 text-[12.5px] text-ink-secondary">
                  <input
                    type="checkbox"
                    checked={contradictorySourceIds.includes(source.id)}
                    onChange={() => toggle(source.id, contradictorySourceIds, setContradictorySourceIds)}
                  />
                  {source.title}
                </label>
              ))}
            </fieldset>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[12.5px] text-ink-secondary">
              <input
                type="checkbox"
                checked={unsupported}
                onChange={(event) => {
                  setUnsupported(event.target.checked);
                  if (event.target.checked) setSupportingSourceIds([]);
                }}
              />
              Mark unsupported
            </label>
            <Select value={confidence} onValueChange={(value) => setConfidence(value as typeof confidence)}>
              <SelectTrigger className="w-[170px]" aria-label="Claim confidence"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low confidence</SelectItem>
                <SelectItem value="MEDIUM">Medium confidence</SelectItem>
                <SelectItem value="HIGH">High confidence</SelectItem>
              </SelectContent>
            </Select>
            <Button
              className="ml-auto"
              type="submit"
              disabled={busy || !statement.trim() || (!unsupported && supportingSourceIds.length === 0)}
            >
              Add claim
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

function RecommendationLedger({
  cycle,
  busy,
  onAdd,
}: {
  cycle: LoopCycle;
  busy: boolean;
  onAdd: (values: {
    title: string;
    rationale: string;
    evidenceSourceIds: string[];
    confidence: "LOW" | "MEDIUM" | "HIGH";
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [rationale, setRationale] = useState("");
  const [confidence, setConfidence] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [evidenceSourceIds, setEvidenceSourceIds] = useState<string[]>([]);
  const acceptedSources = cycle.sources.filter((source) => source.decision === "ACCEPTED");

  return (
    <section className="rounded-xl border border-line bg-surface-1 p-4">
      <h2 className="text-[15px] font-semibold text-ink">Recommendations</h2>
      <div className="mt-4 space-y-3">
        {cycle.recommendations.length === 0 ? (
          <p className="rounded-lg border border-line bg-surface-2 px-4 py-5 text-center text-[12.5px] text-ink-muted">
            No recommendations recorded.
          </p>
        ) : (
          cycle.recommendations.map((recommendation) => (
            <div key={recommendation.id} className="rounded-lg border border-line bg-surface-2 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[13px] font-medium text-ink">{recommendation.title}</h3>
                  <p className="mt-1 text-[12.5px] text-ink-secondary">{recommendation.rationale}</p>
                </div>
                <StatusBadge
                  tone={
                    recommendation.status === "IMPLEMENTED"
                      ? "success"
                      : recommendation.status === "REJECTED"
                        ? "error"
                        : "neutral"
                  }
                >
                  {humanize(recommendation.status)}
                </StatusBadge>
              </div>
              <p className="mt-2 text-[11.5px] text-ink-muted">
                {recommendation.confidence} confidence · {recommendation.evidenceSourceIds.length} evidence link(s)
              </p>
            </div>
          ))
        )}
      </div>

      {cycle.phase === "RECOMMEND" && (
        <form
          className="mt-4 space-y-3 border-t border-line pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            onAdd({ title, rationale, evidenceSourceIds, confidence });
            setTitle("");
            setRationale("");
            setEvidenceSourceIds([]);
          }}
        >
          <div className="grid gap-3 md:grid-cols-[1fr_170px]">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Recommendation title" required />
            <Select value={confidence} onValueChange={(value) => setConfidence(value as typeof confidence)}>
              <SelectTrigger aria-label="Recommendation confidence"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low confidence</SelectItem>
                <SelectItem value="MEDIUM">Medium confidence</SelectItem>
                <SelectItem value="HIGH">High confidence</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Textarea value={rationale} onChange={(event) => setRationale(event.target.value)} placeholder="Evidence-backed rationale and expected outcome" required />
          <fieldset className="rounded-lg border border-line p-3">
            <legend className="px-1 text-[11.5px] font-medium text-ink-muted">Accepted evidence</legend>
            <div className="mt-1 space-y-2">
              {acceptedSources.map((source) => (
                <label key={source.id} className="flex items-center gap-2 text-[12.5px] text-ink-secondary">
                  <input
                    type="checkbox"
                    checked={evidenceSourceIds.includes(source.id)}
                    onChange={() =>
                      setEvidenceSourceIds((current) =>
                        current.includes(source.id)
                          ? current.filter((id) => id !== source.id)
                          : [...current, source.id]
                      )
                    }
                    className="h-4 w-4 rounded border-line"
                  />
                  {source.title}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || !title.trim() || !rationale.trim() || evidenceSourceIds.length === 0}>
              Add recommendation
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

function ValidationAndMeasurement({
  cycle,
  busy,
  onValidation,
  onMeasurement,
}: {
  cycle: LoopCycle;
  busy: boolean;
  onValidation: (values: {
    name: string;
    status: "PASS" | "FAIL";
    evidenceLocation: string;
  }) => void;
  onMeasurement: (values: {
    name: string;
    baseline: string;
    result: string;
    unit: string;
    target: string;
    passed: boolean;
    evidenceLocation: string;
  }) => void;
}) {
  const [validationName, setValidationName] = useState("");
  const [validationStatus, setValidationStatus] = useState<"PASS" | "FAIL">("PASS");
  const [validationEvidence, setValidationEvidence] = useState("");
  const [measurement, setMeasurement] = useState({
    name: "",
    baseline: "",
    result: "",
    unit: "%",
    target: "",
    evidenceLocation: "",
    passed: true,
  });
  if (
    !["VALIDATE", "MEASURE", "READY_FOR_NEXT_CYCLE", "COMPLETE"].includes(cycle.phase) &&
    cycle.validations.length === 0 &&
    cycle.measurements.length === 0
  ) {
    return null;
  }

  return (
    <section className="rounded-xl border border-line bg-surface-1 p-4">
      <h2 className="text-[15px] font-semibold text-ink">Validation and measurement</h2>
      {cycle.validations.map((item) => (
        <div key={item.id} className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 p-3">
          <div>
            <p className="text-[12.5px] text-ink">{item.name}</p>
            <p className="mt-0.5 text-[11.5px] text-ink-muted">{item.evidenceLocation}</p>
          </div>
          <StatusBadge tone={item.status === "PASS" ? "success" : "error"}>{item.status}</StatusBadge>
        </div>
      ))}
      {cycle.measurements.map((item) => (
        <div key={item.id} className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 p-3">
          <div>
            <p className="text-[12.5px] text-ink">{item.name}</p>
            <p className="mt-0.5 text-[11.5px] text-ink-muted">
              {item.baseline}{item.unit} → {item.result}{item.unit} · {item.evidenceLocation}
            </p>
          </div>
          <StatusBadge tone={item.passed ? "success" : "warning"}>
            {item.passed ? "Target met" : "Gap remains"}
          </StatusBadge>
        </div>
      ))}

      {cycle.phase === "VALIDATE" && (
        <form
          className="mt-4 grid gap-3 border-t border-line pt-4 md:grid-cols-[1fr_140px_1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            onValidation({
              name: validationName,
              status: validationStatus,
              evidenceLocation: validationEvidence,
            });
            setValidationName("");
            setValidationEvidence("");
          }}
        >
          <Input value={validationName} onChange={(event) => setValidationName(event.target.value)} placeholder="Validation or test name" required />
          <Select value={validationStatus} onValueChange={(value) => setValidationStatus(value as typeof validationStatus)}>
            <SelectTrigger aria-label="Validation result"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="PASS">Pass</SelectItem><SelectItem value="FAIL">Fail</SelectItem></SelectContent>
          </Select>
          <Input value={validationEvidence} onChange={(event) => setValidationEvidence(event.target.value)} placeholder="Evidence file, trace, or CI URL" required />
          <Button type="submit" disabled={busy}>Record</Button>
        </form>
      )}

      {cycle.phase === "MEASURE" && (
        <form
          className="mt-4 grid gap-3 border-t border-line pt-4 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            onMeasurement(measurement);
            setMeasurement({ name: "", baseline: "", result: "", unit: "%", target: "", evidenceLocation: "", passed: true });
          }}
        >
          <Input value={measurement.name} onChange={(event) => setMeasurement({ ...measurement, name: event.target.value })} placeholder="Metric name" required />
          <Input value={measurement.baseline} onChange={(event) => setMeasurement({ ...measurement, baseline: event.target.value })} type="number" step="any" placeholder="Baseline" required />
          <Input value={measurement.result} onChange={(event) => setMeasurement({ ...measurement, result: event.target.value })} type="number" step="any" placeholder="Result" required />
          <Input value={measurement.unit} onChange={(event) => setMeasurement({ ...measurement, unit: event.target.value })} placeholder="Unit" required />
          <Input value={measurement.target} onChange={(event) => setMeasurement({ ...measurement, target: event.target.value })} type="number" step="any" placeholder="Target (optional)" />
          <Input value={measurement.evidenceLocation} onChange={(event) => setMeasurement({ ...measurement, evidenceLocation: event.target.value })} placeholder="Evidence location" required />
          <label className="flex items-center gap-2 text-[12.5px] text-ink-secondary">
            <input type="checkbox" checked={measurement.passed} onChange={(event) => setMeasurement({ ...measurement, passed: event.target.checked })} />
            Target met
          </label>
          <div className="md:col-span-2 flex justify-end"><Button type="submit" disabled={busy}>Record measurement</Button></div>
        </form>
      )}
    </section>
  );
}

function CreateCycleDialog({
  open,
  busy,
  onClose,
  onCreate,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onCreate: (values: {
    objective: string;
    hypothesis: string;
    question: string;
    scope: string;
    exclusions: string;
    freshnessWindow: string;
    preferredSourceTypes: string;
    requiredOutput: string;
    approvalPolicy: string;
    stopCondition: string;
    maxIterations: string;
  }) => void;
}) {
  const [objective, setObjective] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [question, setQuestion] = useState("");
  const [scope, setScope] = useState("");
  const [exclusions, setExclusions] = useState("");
  const [freshnessWindow, setFreshnessWindow] = useState("Previous 12 months, plus necessary foundational sources");
  const [preferredSourceTypes, setPreferredSourceTypes] = useState("Primary source, official documentation, independent research");
  const [requiredOutput, setRequiredOutput] = useState("Evidence-linked recommendations with conflicts and limitations");
  const [approvalPolicy, setApprovalPolicy] = useState("Explicit operator approval before implementation");
  const [stopCondition, setStopCondition] = useState("");
  const [maxIterations, setMaxIterations] = useState("3");
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Start Loop Engineering cycle</DialogTitle>
          <DialogDescription>
            Define one measurable objective. Research work is created immediately; repository-changing work waits for approval.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="loop-objective">Objective</Label>
            <Textarea id="loop-objective" value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="Improve Mission Control's PRD-to-delivery success rate" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loop-hypothesis">Hypothesis (optional)</Label>
            <Textarea id="loop-hypothesis" value={hypothesis} onChange={(event) => setHypothesis(event.target.value)} placeholder="Structured evidence gates will reduce invalid completion claims" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loop-question">Research question</Label>
            <Textarea id="loop-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What evidence would change the implementation decision?" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loop-scope">Scope</Label>
            <Textarea id="loop-scope" value={scope} onChange={(event) => setScope(event.target.value)} placeholder="Mission Control local Software Factory workflows and governed UI journeys" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loop-exclusions">Exclusions (one per line)</Label>
            <Textarea id="loop-exclusions" value={exclusions} onChange={(event) => setExclusions(event.target.value)} placeholder={"Production deployment\nUnapproved repository writes"} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="loop-freshness">Freshness window</Label>
              <Input id="loop-freshness" value={freshnessWindow} onChange={(event) => setFreshnessWindow(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loop-source-types">Preferred sources</Label>
              <Input id="loop-source-types" value={preferredSourceTypes} onChange={(event) => setPreferredSourceTypes(event.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loop-output">Required output</Label>
            <Input id="loop-output" value={requiredOutput} onChange={(event) => setRequiredOutput(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loop-policy">Approval policy</Label>
            <Input id="loop-policy" value={approvalPolicy} onChange={(event) => setApprovalPolicy(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loop-stop">Stop condition</Label>
            <Input id="loop-stop" value={stopCondition} onChange={(event) => setStopCondition(event.target.value)} placeholder="All critical UI journeys pass twice with zero critical accessibility violations" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loop-max">Maximum iterations</Label>
            <Input id="loop-max" value={maxIterations} onChange={(event) => setMaxIterations(event.target.value)} type="number" min={1} max={10} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onCreate({
              objective,
              hypothesis,
              question,
              scope,
              exclusions,
              freshnessWindow,
              preferredSourceTypes,
              requiredOutput,
              approvalPolicy,
              stopCondition,
              maxIterations,
            })}
            disabled={
              busy ||
              !objective.trim() ||
              !question.trim() ||
              !scope.trim() ||
              !freshnessWindow.trim() ||
              !requiredOutput.trim() ||
              !approvalPolicy.trim() ||
              !stopCondition.trim()
            }
          >
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Create governed work
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-muted">{label}</dt>
      <dd className="mt-1 text-[12.5px] text-ink-secondary">{value}</dd>
    </div>
  );
}
