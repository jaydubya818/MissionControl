import { Component, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Database,
  Eye,
  FlaskConical,
  GitBranch,
  Loader2,
  Network,
  Plus,
  Search,
  Sparkles,
  TimerReset,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { PageHeader } from "../../components/factory/DetailLayout";
import { StatusBadge, type StatusBadgeProps } from "../../components/factory/badges";
import { SchematicSubTabs } from "../../components/schematic/SchematicSubTabs";
import {
  buildObservationTree,
  displayEvalValue,
  flattenObservationTree,
  formatDuration,
  formatTokens,
  timelinePosition,
  type TraceObservationNode,
  type TraceObservationRecord,
} from "../traceViewModel";
import { EvalControlPlanePanel } from "../components/EvalControlPlanePanel";

export interface TraceInspectorViewProps {
  onNavigate: (view: string) => void;
  projectId?: Id<"projects"> | null;
}

type DomainTab = "traces" | "evals" | "datasets";
type DetailTab = "tree" | "timeline";
type TraceStatusFilter = "ALL" | "RUNNING" | "SUCCESS" | "FAILED" | "CANCELED";
type TracePurposeFilter = "ALL" | "SOFTWARE" | "VERIFICATION" | "AUTOMATION" | "EVALUATION" | "SYSTEM";
type WorkspaceDashboard = FunctionReturnType<typeof api.observability.getWorkspaceDashboard>;
type TraceDetailResult = NonNullable<FunctionReturnType<typeof api.observability.getTraceDetail>>;
type TraceSummary = WorkspaceDashboard["traces"][number];
type TraceRecord = TraceDetailResult["trace"];
type TraceObservation = TraceDetailResult["observations"][number];
type TraceScore = TraceDetailResult["scores"][number];
type EvalAnalyticsRecord = WorkspaceDashboard["evalAnalytics"][number];
type EvalDatasetRecord = WorkspaceDashboard["datasets"][number];
type ExperimentRecord = WorkspaceDashboard["experiments"][number];

const CONTROL_CLASS = "h-8 min-w-0 rounded-md border border-line bg-surface-1 px-2.5 text-[12px] text-ink outline-none transition-colors placeholder:text-ink-muted hover:border-line-strong focus:border-info-accent focus:ring-2 focus:ring-info-accent/20";

const STATUS_TONE: Record<string, StatusBadgeProps["tone"]> = {
  RUNNING: "info",
  SUCCESS: "success",
  FAILED: "error",
  CANCELED: "warning",
};

const OBSERVATION_ICON: Record<string, LucideIcon> = {
  SPAN: Network,
  GENERATION: BrainCircuit,
  AGENT: Bot,
  TOOL: Wrench,
  RETRIEVAL: Search,
  EMBEDDING: Sparkles,
  EVENT: Activity,
  EVALUATOR: FlaskConical,
};

export function TraceInspectorView(props: TraceInspectorViewProps): JSX.Element {
  return (
    <TraceInspectorErrorBoundary resetKey={String(props.projectId ?? "no-workspace")}>
      <TraceInspectorContent {...props} />
    </TraceInspectorErrorBoundary>
  );
}

function TraceInspectorContent({ projectId }: TraceInspectorViewProps): JSX.Element {
  const [domainTab, setDomainTab] = useState<DomainTab>("traces");
  const [detailTab, setDetailTab] = useState<DetailTab>("tree");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TraceStatusFilter>("ALL");
  const [purpose, setPurpose] = useState<TracePurposeFilter>("ALL");
  const [executor, setExecutor] = useState("ALL");
  const [model, setModel] = useState("ALL");
  const dashboard = useQuery(
    api.observability.getWorkspaceDashboard,
    projectId ? {
      projectId,
      status: status === "ALL" ? undefined : status,
      purpose: purpose === "ALL" ? undefined : purpose,
      executor: executor === "ALL" ? undefined : executor,
      model: model === "ALL" ? undefined : model,
      search: search.trim() || undefined,
      limit: 100,
    } : "skip"
  );
  const [selectedTraceId, setSelectedTraceId] = useState<Id<"traces"> | null>(null);
  const traceDetail = useQuery(
    api.observability.getTraceDetail,
    selectedTraceId ? { traceId: selectedTraceId } : "skip"
  );
  const [selectedObservationId, setSelectedObservationId] = useState<string | null>(null);
  const [datasetOpen, setDatasetOpen] = useState(false);
  const [datasetId, setDatasetId] = useState("new");
  const [datasetName, setDatasetName] = useState("Software Factory Regression");
  const [promotionState, setPromotionState] = useState<{ busy?: boolean; error?: string; success?: string }>({});
  const promoteTrace = useMutation(api.observability.promoteTraceToDataset);

  useEffect(() => {
    if (!dashboard?.traces.length) {
      setSelectedTraceId(null);
      return;
    }
    if (!selectedTraceId || !dashboard.traces.some((trace) => trace._id === selectedTraceId)) {
      setSelectedTraceId(dashboard.traces[0]._id);
    }
  }, [dashboard?.traces, selectedTraceId]);

  useEffect(() => {
    const first = traceDetail?.observations[0];
    if (!first) {
      setSelectedObservationId(null);
      return;
    }
    if (!selectedObservationId || !traceDetail.observations.some((item) => String(item._id) === selectedObservationId)) {
      setSelectedObservationId(String(first._id));
    }
  }, [traceDetail?.observations, selectedObservationId]);

  const observationTree = useMemo(
    () => buildObservationTree((traceDetail?.observations ?? []) as TraceObservationRecord[]),
    [traceDetail?.observations]
  );
  const flattenedObservations = useMemo(() => flattenObservationTree(observationTree), [observationTree]);
  const selectedObservation = traceDetail?.observations.find((item) => String(item._id) === selectedObservationId);
  const selectedScores = traceDetail?.scores.filter((score) =>
    !selectedObservationId || !score.observationId || String(score.observationId) === selectedObservationId
  ) ?? [];

  async function handlePromotion() {
    if (!selectedTraceId) return;
    setPromotionState({ busy: true });
    try {
      const result = await promoteTrace({
        traceId: selectedTraceId,
        datasetId: datasetId !== "new" ? datasetId as Id<"evalDatasets"> : undefined,
        datasetName: datasetId === "new" ? datasetName : undefined,
        metadata: { promotedFrom: "trace-inspector" },
      });
      setPromotionState({ success: result.created ? `Added to ${result.dataset?.name ?? "dataset"}.` : "This trace is already in that dataset." });
      setDatasetOpen(false);
    } catch (error) {
      setPromotionState({ error: error instanceof Error ? error.message : "Trace promotion failed." });
    }
  }

  if (!projectId) {
    return <EmptyPanel title="Select a workspace" body="Trace data is always scoped to one workspace. Select a workspace to inspect execution behavior." />;
  }

  return (
    <div className="min-h-0 bg-surface-0 pb-8">
      <PageHeader
        eyebrow="Execution intelligence"
        title="Observability & Evals"
        description="Inspect how governed work executed, measure quality separately from verification, and turn failures into reusable regression cases."
        actions={(
          <div className="flex items-center gap-2 text-[11.5px] text-ink-muted">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-1 px-2.5 py-1.5">
              <Eye size={13} aria-hidden /> Workspace scoped
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-1 px-2.5 py-1.5">
              <GitBranch size={13} aria-hidden /> OTel-compatible IDs
            </span>
          </div>
        )}
      />

      <div className="px-4 sm:px-6">
        <SchematicSubTabs
          tabs={[
            { id: "traces", label: "Traces", count: dashboard?.traces.length },
            { id: "evals", label: "Eval library", count: dashboard?.evalAnalytics.length },
            { id: "datasets", label: "Datasets & experiments", count: dashboard?.datasets.length },
          ]}
          active={domainTab}
          onChange={(id) => setDomainTab(id as DomainTab)}
        />
      </div>

      {dashboard === undefined ? (
        <div className="flex items-center justify-center gap-2 px-6 py-20 text-[13px] text-ink-muted">
          <Loader2 size={16} className="animate-spin" aria-hidden /> Loading trace data…
        </div>
      ) : domainTab === "evals" ? (
        <>
          <EvalControlPlanePanel projectId={projectId} />
          <EvalLibrary analytics={dashboard.evalAnalytics} />
        </>
      ) : domainTab === "datasets" ? (
        <DatasetLibrary datasets={dashboard.datasets} experiments={dashboard.experiments} />
      ) : (
        <div className="flex flex-col gap-4 px-4 pt-4 sm:px-6">
          <MetricStrip metrics={dashboard.metrics} />
          <TraceFilters
            search={search}
            setSearch={setSearch}
            status={status}
            setStatus={setStatus}
            purpose={purpose}
            setPurpose={setPurpose}
            executor={executor}
            setExecutor={setExecutor}
            model={model}
            setModel={setModel}
            executors={dashboard.filters.executors}
            models={dashboard.filters.models}
          />

          {promotionState.error ? <InlineMessage tone="error" text={promotionState.error} onClose={() => setPromotionState({})} /> : null}
          {promotionState.success ? <InlineMessage tone="success" text={promotionState.success} onClose={() => setPromotionState({})} /> : null}

          {dashboard.traces.length === 0 ? (
            <EmptyPanel
              title="No traces match this view"
              body="New governed Attempts create traces automatically. Clear filters or dispatch a WorkOrder to begin collecting execution observations."
            />
          ) : (
            <div className="grid min-h-[640px] overflow-hidden rounded-xl border border-line bg-surface-1 xl:grid-cols-[330px_minmax(0,1fr)]">
              <TraceList traces={dashboard.traces} selectedTraceId={selectedTraceId} onSelect={setSelectedTraceId} />
              {traceDetail === undefined ? (
                <div className="flex items-center justify-center gap-2 p-12 text-[13px] text-ink-muted">
                  <Loader2 size={16} className="animate-spin" aria-hidden /> Loading trace…
                </div>
              ) : traceDetail === null ? (
                <EmptyPanel
                  title="Trace is no longer available"
                  body="The selected trace was removed or is outside your workspace access. Select another trace or refresh the workspace."
                />
              ) : (
                <TraceDetail
                  detail={traceDetail}
                  detailTab={detailTab}
                  setDetailTab={setDetailTab}
                  observationTree={observationTree}
                  flattenedObservations={flattenedObservations}
                  selectedObservationId={selectedObservationId}
                  setSelectedObservationId={setSelectedObservationId}
                  selectedObservation={selectedObservation}
                  selectedScores={selectedScores}
                  projectId={projectId}
                  onOpenDataset={() => { setDatasetOpen(true); setPromotionState({}); }}
                />
              )}
            </div>
          )}
        </div>
      )}

      {datasetOpen && selectedTraceId ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDatasetOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="dataset-title" className="w-full max-w-md rounded-xl border border-line bg-surface-1 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="registry-kicker">Learning loop</div>
                <h2 id="dataset-title" className="mt-1 text-[19px] font-semibold text-ink">Add trace to eval dataset</h2>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-secondary">Mission Control stores a sanitized, reproducible case with trace and WorkOrder lineage. Runtime secrets and irrelevant environment state are excluded.</p>
              </div>
              <button type="button" onClick={() => setDatasetOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-muted hover:text-ink focus:outline-none focus:ring-2 focus:ring-info-accent/30" aria-label="Close dataset dialog"><X size={15} /></button>
            </div>
            <label className="mt-5 block text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted" htmlFor="dataset-choice">Dataset</label>
            <select id="dataset-choice" value={datasetId} onChange={(event) => setDatasetId(event.target.value)} className={cn(CONTROL_CLASS, "mt-1.5 w-full")}>
              <option value="new">Create / use named dataset</option>
              {dashboard?.datasets.map((dataset) => <option key={dataset._id} value={dataset._id}>{dataset.name} · v{dataset.version} · {dataset.itemCount} cases</option>)}
            </select>
            {datasetId === "new" ? (
              <>
                <label className="mt-4 block text-[11.5px] font-medium uppercase tracking-[0.06em] text-ink-muted" htmlFor="dataset-name">Dataset name</label>
                <input id="dataset-name" value={datasetName} onChange={(event) => setDatasetName(event.target.value)} className={cn(CONTROL_CLASS, "mt-1.5 w-full")} />
              </>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDatasetOpen(false)} className="h-8 rounded-md border border-line px-3 text-[12px] font-medium text-ink-secondary hover:border-line-strong hover:text-ink">Cancel</button>
              <button type="button" onClick={() => void handlePromotion()} disabled={promotionState.busy || (datasetId === "new" && !datasetName.trim())} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-action-primary px-3 text-[12px] font-medium text-action-primary-text disabled:cursor-not-allowed disabled:opacity-50">
                {promotionState.busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add case
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

class TraceInspectorErrorBoundary extends Component<{
  children: ReactNode;
  resetKey: string;
}, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Observability & Evals render failure", error, info.componentStack);
  }

  componentDidUpdate(previous: Readonly<{ children: ReactNode; resetKey: string }>) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section role="alert" className="m-4 rounded-xl border border-err/35 bg-err-soft p-6 sm:m-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-err">Observability unavailable</div>
        <h2 className="mt-2 text-[17px] font-semibold text-ink">Trace data could not be loaded.</h2>
        <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-ink-secondary">
          Your persisted execution and verification records are unchanged. Confirm workspace permission and runtime compatibility, then retry.
        </p>
        <pre className="mt-3 max-h-32 overflow-auto rounded-lg border border-err/20 bg-surface-1 p-3 font-mono text-[10.5px] text-err">
          {this.state.error.message || "Unknown observability error"}
        </pre>
        <button type="button" onClick={() => this.setState({ error: null })} className="mt-4 h-8 rounded-md bg-action-primary px-3 text-[12px] font-medium text-action-primary-text">
          Retry
        </button>
      </section>
    );
  }
}

function MetricStrip({ metrics }: { metrics: WorkspaceDashboard["metrics"] }) {
  const items = [
    { label: "Attempts", value: metrics.attempts.toLocaleString(), icon: Activity },
    { label: "Success", value: formatPercent(metrics.successRate), icon: CheckCircle2 },
    { label: "Median", value: formatDuration(metrics.medianDurationMs), icon: Clock3 },
    { label: "P95", value: formatDuration(metrics.p95DurationMs), icon: TimerReset },
    { label: "Avg cost", value: formatUsd(metrics.averageCostUsd), icon: CircleDollarSign },
    { label: "Avg tokens", value: formatTokens(metrics.averageTokens), icon: BrainCircuit },
    { label: "Human touch", value: formatPercent(metrics.humanInterventionRate), icon: AlertTriangle },
  ];
  return (
    <section className="grid overflow-hidden rounded-xl border border-line bg-surface-1 sm:grid-cols-2 lg:grid-cols-7" aria-label="Trace analytics">
      {items.map(({ label, value, icon: Icon }, index) => (
        <div key={label} className={cn("min-w-0 px-3.5 py-3", index > 0 && "border-t border-line sm:border-l sm:border-t-0")}>
          <div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-muted"><Icon size={12} aria-hidden />{label}</div>
          <div className="mt-1 font-mono text-[17px] font-semibold tracking-tight text-ink">{value}</div>
        </div>
      ))}
    </section>
  );
}

interface TraceFiltersProps {
  search: string;
  setSearch: (value: string) => void;
  status: TraceStatusFilter;
  setStatus: (value: TraceStatusFilter) => void;
  purpose: TracePurposeFilter;
  setPurpose: (value: TracePurposeFilter) => void;
  executor: string;
  setExecutor: (value: string) => void;
  model: string;
  setModel: (value: string) => void;
  executors: string[];
  models: string[];
}

function TraceFilters(props: TraceFiltersProps) {
  return (
    <section className="grid gap-2 rounded-xl border border-line bg-surface-1 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(180px,1fr)_140px_150px_160px_180px]" aria-label="Trace filters">
      <label className="relative min-w-0">
        <Search size={13} className="pointer-events-none absolute left-2.5 top-2.5 text-ink-muted" aria-hidden />
        <span className="sr-only">Search traces</span>
        <input value={props.search} onChange={(event) => props.setSearch(event.target.value)} placeholder="Trace, WorkOrder, model…" className={cn(CONTROL_CLASS, "w-full pl-8")} />
      </label>
      <FilterSelect label="Status" value={props.status} onChange={(value) => props.setStatus(value as TraceStatusFilter)} options={["ALL", "RUNNING", "SUCCESS", "FAILED", "CANCELED"]} />
      <FilterSelect label="Purpose" value={props.purpose} onChange={(value) => props.setPurpose(value as TracePurposeFilter)} options={["ALL", "SOFTWARE", "VERIFICATION", "AUTOMATION", "EVALUATION", "SYSTEM"]} />
      <FilterSelect label="Executor" value={props.executor} onChange={props.setExecutor} options={["ALL", ...props.executors]} />
      <FilterSelect label="Model" value={props.model} onChange={props.setModel} options={["ALL", ...props.models]} />
    </section>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  const allLabel = label === "Status" ? "All statuses" : `All ${label.toLowerCase()}s`;
  return (
    <label className="min-w-0">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={cn(CONTROL_CLASS, "w-full")}>
        {options.map((option) => <option key={option} value={option}>{option === "ALL" ? allLabel : humanize(option)}</option>)}
      </select>
    </label>
  );
}

function TraceList({ traces, selectedTraceId, onSelect }: { traces: TraceSummary[]; selectedTraceId: Id<"traces"> | null; onSelect: (id: Id<"traces">) => void }) {
  return (
    <aside className="max-h-[820px] overflow-y-auto border-b border-line xl:border-b-0 xl:border-r" aria-label="Traces">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface-1 px-3.5 py-3">
        <div><div className="text-[12.5px] font-semibold text-ink">Execution traces</div><div className="text-[10.5px] text-ink-muted">Newest first · {traces.length} shown</div></div>
        <Network size={15} className="text-ink-muted" aria-hidden />
      </div>
      <div className="divide-y divide-line">
        {traces.map((trace) => (
          <button key={trace._id} type="button" onClick={() => onSelect(trace._id)} className={cn("w-full border-l-2 px-3.5 py-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-info-accent/30", selectedTraceId === trace._id ? "border-l-info-accent bg-info-soft/40" : "border-l-transparent hover:bg-surface-2")}>
            <div className="flex items-start justify-between gap-2"><div className="min-w-0 truncate text-[12.5px] font-medium text-ink">{trace.workOrderTitle ?? trace.name}</div><StatusBadge tone={STATUS_TONE[trace.status]}>{humanize(trace.status)}</StatusBadge></div>
            <div className="mt-1 truncate font-mono text-[10.5px] text-ink-muted">{trace.runId ?? shortId(trace.externalTraceId)} · {trace.executor ?? "executor unknown"}</div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] text-ink-secondary">
              <span>{formatDuration(trace.durationMs)}</span><span>{formatTokens(trace.tokenUsage?.total)} tok</span><span>{formatUsd(trace.estimatedCostUsd)}</span><span>{trace.observationCount}{trace.observationCountCapped ? "+" : ""} obs</span>
            </div>
          </button>
        ))}
      </div>
    </aside>
  );
}

interface TraceDetailProps {
  detail: TraceDetailResult;
  detailTab: DetailTab;
  setDetailTab: (tab: DetailTab) => void;
  observationTree: TraceObservationNode[];
  flattenedObservations: TraceObservationNode[];
  selectedObservationId: string | null;
  setSelectedObservationId: (id: string) => void;
  selectedObservation?: TraceObservation;
  selectedScores: TraceScore[];
  projectId: Id<"projects">;
  onOpenDataset: () => void;
}

function TraceDetail(props: TraceDetailProps) {
  const { detail } = props;
  const trace = detail.trace;
  return (
    <section aria-label="Trace detail" className="min-w-0">
      <header className="border-b border-line px-4 py-4 sm:px-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><StatusBadge tone={STATUS_TONE[trace.status]}>{humanize(trace.status)}</StatusBadge><span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-muted">{humanize(trace.purpose)} trace</span></div>
            <h2 className="mt-2 truncate text-[19px] font-semibold tracking-tight text-ink">{detail.workOrder?.title ?? trace.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10.5px] text-ink-muted">
              <span>{shortId(trace.externalTraceId, 16)}</span><span>{trace.executor ?? "unknown executor"}{trace.executorVersion ? `/${trace.executorVersion}` : ""}</span><span>{trace.model ?? "model unavailable"}</span><span>{new Date(trace.startedAt).toLocaleString()}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {detail.workOrder?._id ? <a href={`/v2/control-work-orders?workspace=${encodeURIComponent(String(props.projectId))}&workOrder=${encodeURIComponent(String(detail.workOrder._id))}`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-[12px] font-medium text-ink-secondary hover:border-line-strong hover:text-ink"><GitBranch size={13} /> WorkOrder</a> : null}
            <button type="button" onClick={props.onOpenDataset} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-action-primary px-3 text-[12px] font-medium text-action-primary-text"><Plus size={13} /> Add to dataset</button>
          </div>
        </div>
        <div className="mt-4 grid overflow-hidden rounded-lg border border-line bg-surface-2 sm:grid-cols-5">
          <MiniMetric label="Duration" value={formatDuration(trace.durationMs)} />
          <MiniMetric label="Cost" value={formatUsd(trace.estimatedCostUsd)} />
          <MiniMetric label="Tokens" value={formatTokens(trace.tokenUsage?.total)} />
          <MiniMetric label="Observations" value={String(detail.observations.length)} />
          <MiniMetric label="Eval scores" value={String(detail.scores.length)} />
        </div>
      </header>

      <div className="border-b border-line px-4 pt-2 sm:px-5">
        <SchematicSubTabs tabs={[{ id: "tree", label: "Execution tree", count: detail.observations.length }, { id: "timeline", label: "Timeline" }]} active={props.detailTab} onChange={(id) => props.setDetailTab(id as DetailTab)} />
        {detail.observationsTruncated ? <p className="pb-2 text-[11px] text-warn">Showing the first 5,000 observations; aggregate totals are marked as bounded.</p> : null}
      </div>

      <div className="grid min-h-[500px] xl:grid-cols-[minmax(0,1fr)_350px]">
        <section className="min-w-0 border-b border-line xl:border-b-0 xl:border-r">
          {props.detailTab === "timeline" ? (
            <TraceTimeline trace={trace} observations={props.flattenedObservations} selectedId={props.selectedObservationId} onSelect={props.setSelectedObservationId} />
          ) : (
            <div className="divide-y divide-line">
              {props.observationTree.map((node: TraceObservationNode) => <ObservationTreeRow key={node._id} node={node} selectedId={props.selectedObservationId} onSelect={props.setSelectedObservationId} />)}
            </div>
          )}
        </section>
        <ObservationInspector observation={props.selectedObservation} scores={props.selectedScores} observations={detail.observations} />
      </div>
    </section>
  );
}

function ObservationTreeRow({ node, selectedId, onSelect }: { node: TraceObservationNode; selectedId: string | null; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(true);
  const Icon = OBSERVATION_ICON[node.type] ?? Activity;
  return (
    <>
      <div className={cn("group flex items-center gap-2.5 px-3 py-2.5 transition-colors", selectedId === node._id ? "bg-info-soft/40" : "hover:bg-surface-2")} style={{ paddingLeft: `${12 + Math.min(node.depth, 8) * 20}px` }}>
        {node.children.length ? <button type="button" onClick={() => setOpen((value) => !value)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-muted hover:text-ink focus:outline-none focus:ring-2 focus:ring-info-accent/30" aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button> : <span className="h-6 w-6 shrink-0" />}
        <button type="button" onClick={() => onSelect(node._id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus:outline-none">
          <Icon size={14} className={cn("shrink-0", node.status === "FAILED" ? "text-err" : "text-ink-muted")} aria-hidden />
          <span className="min-w-0 flex-1"><span className="block truncate text-[12.5px] font-medium text-ink">{node.name}</span><span className="block truncate text-[10.5px] uppercase tracking-[0.05em] text-ink-muted">{humanize(node.type)}{typeof node.model === "string" ? ` · ${node.model}` : ""}{typeof node.toolName === "string" ? ` · ${node.toolName}` : ""}</span></span>
          {typeof node.estimatedCostUsd === "number" ? <span className="font-mono text-[10.5px] text-ink-muted">{formatUsd(node.estimatedCostUsd)}</span> : null}
          <span className="w-14 text-right font-mono text-[10.5px] text-ink-muted">{formatDuration(node.durationMs)}</span>
          <span className={cn("h-2 w-2 shrink-0 rounded-full", node.status === "FAILED" ? "bg-err" : node.status === "RUNNING" ? "bg-info-accent" : "bg-ok")} aria-label={humanize(node.status)} />
        </button>
      </div>
      {open ? node.children.map((child) => <ObservationTreeRow key={child._id} node={child} selectedId={selectedId} onSelect={onSelect} />) : null}
    </>
  );
}

function TraceTimeline({ trace, observations, selectedId, onSelect }: { trace: TraceRecord; observations: TraceObservationNode[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="overflow-x-auto p-4">
      <div className="min-w-[680px]">
        <div className="mb-2 grid grid-cols-[190px_minmax(440px,1fr)_64px] gap-3 text-[10px] uppercase tracking-[0.08em] text-ink-muted"><span>Observation</span><div className="flex justify-between"><span>0s</span><span>{formatDuration(trace.durationMs)}</span></div><span className="text-right">Latency</span></div>
        <div className="space-y-1.5">
          {observations.map((observation) => {
            const position = timelinePosition({ traceStartedAt: trace.startedAt, traceEndedAt: trace.endedAt, observationStartedAt: observation.startedAt, observationEndedAt: observation.endedAt, observationDurationMs: observation.durationMs });
            return (
              <button key={observation._id} type="button" onClick={() => onSelect(observation._id)} className={cn("grid w-full grid-cols-[190px_minmax(440px,1fr)_64px] items-center gap-3 rounded-md px-1.5 py-1 text-left focus:outline-none focus:ring-2 focus:ring-info-accent/30", selectedId === observation._id ? "bg-info-soft/40" : "hover:bg-surface-2")}>
                <span className="truncate text-[11.5px] text-ink" style={{ paddingLeft: `${Math.min(observation.depth, 6) * 10}px` }}>{observation.name}</span>
                <span className="relative h-5 overflow-hidden rounded-sm bg-surface-2 [background-image:linear-gradient(to_right,var(--line)_1px,transparent_1px)] [background-size:25%_100%]">
                  <span className={cn("absolute top-1 h-3 rounded-sm", observation.status === "FAILED" ? "bg-err" : observation.type === "GENERATION" ? "bg-info-accent" : observation.type === "TOOL" ? "bg-warn" : "bg-ok")} style={{ left: `${position.leftPercent}%`, width: `${position.widthPercent}%` }} />
                </span>
                <span className="text-right font-mono text-[10.5px] text-ink-muted">{formatDuration(observation.durationMs)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ObservationInspector({ observation, scores, observations }: { observation?: TraceObservation; scores: TraceScore[]; observations: TraceObservation[] }) {
  if (!observation) return <aside className="p-5 text-[12.5px] text-ink-muted">Select an observation to inspect its execution contract.</aside>;
  const parent = observations.find((item) => item._id === observation.parentObservationId);
  const children = observations.filter((item) => item.parentObservationId === observation._id);
  return (
    <aside className="min-w-0 bg-surface-2/35 p-4">
      <div className="flex items-start justify-between gap-3"><div><div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-muted">Observation</div><h3 className="mt-1 text-[14px] font-semibold text-ink">{observation.name}</h3></div><StatusBadge tone={STATUS_TONE[observation.status]}>{humanize(observation.status)}</StatusBadge></div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-line py-3">
        <Meta label="Type" value={humanize(observation.type)} /><Meta label="Latency" value={formatDuration(observation.durationMs)} />
        <Meta label="Model" value={observation.model ?? "—"} /><Meta label="Provider" value={observation.provider ?? "—"} />
        <Meta label="Tokens" value={formatTokens(observation.tokenUsage?.total)} /><Meta label="Cost" value={formatUsd(observation.estimatedCostUsd)} />
        <Meta label="Parent" value={parent?.name ?? "Trace root"} /><Meta label="Children" value={String(children.length)} />
        <Meta label="Evidence" value={String(observation.evidenceEnvelopeIds?.length ?? 0)} /><Meta label="Eval scores" value={String(scores.length)} />
      </dl>
      {observation.error ? <div className="mt-3 rounded-lg border border-err/30 bg-err-soft p-3"><div className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-err">Error {observation.error.code ? `· ${observation.error.code}` : ""}</div><div className="mt-1 text-[12px] leading-relaxed text-ink">{observation.error.message}</div></div> : null}
      {scores.length ? <section className="mt-4"><h4 className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-muted">Associated evals</h4><div className="mt-2 space-y-2">{scores.map((score) => <div key={score._id} className="rounded-lg border border-line bg-surface-1 p-2.5"><div className="flex items-center justify-between gap-2"><span className="text-[11.5px] font-medium text-ink">{score.definition?.name ?? "Evaluator"} v{score.definition?.version ?? "?"}</span><StatusBadge tone={score.value === false ? "error" : "success"}>{displayEvalValue(score.value)}</StatusBadge></div>{score.reason ? <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">{score.reason}</p> : null}<div className="mt-1 font-mono text-[9.5px] uppercase text-ink-muted">{humanize(score.evaluator.type)} · {score.evaluator.version}</div></div>)}</div></section> : null}
      <JsonSection title="Input" value={observation.input} />
      <JsonSection title="Output" value={observation.output} />
      <JsonSection title="Metadata" value={observation.metadata} />
    </aside>
  );
}

function EvalLibrary({ analytics }: { analytics: EvalAnalyticsRecord[] }) {
  return (
    <div className="px-4 pt-4 sm:px-6">
      {analytics.length === 0 ? <EmptyPanel title="No evaluators defined" body="Create versioned deterministic, judge, human, or external evaluator definitions before attaching quality scores to traces." /> : (
        <section className="overflow-hidden rounded-xl border border-line bg-surface-1">
          <div className="border-b border-line px-4 py-3"><h2 className="text-[14px] font-semibold text-ink">Evaluator library</h2><p className="mt-0.5 text-[11.5px] text-ink-muted">Quality measures are versioned, computed over a bounded recent score window, and remain separate from WorkOrder verification evidence.</p></div>
          <div
            className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info-accent/40"
            role="region"
            tabIndex={0}
            aria-label="Evaluation library results"
          ><table className="w-full min-w-[880px] text-left"><thead className="border-b border-line bg-surface-2 text-[10.5px] uppercase tracking-[0.07em] text-ink-muted"><tr>{["Evaluator", "Type", "Target", "Version", "State", "Recent executions", "Average", "Failure rate", "Last run"].map((label) => <th key={label} className="px-4 py-2.5 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-line">{analytics.map((definition) => <tr key={definition._id} className="text-[12px]"><td className="px-4 py-3"><div className="font-medium text-ink">{definition.name}</div><div className="font-mono text-[10px] text-ink-muted">{definition.key}</div></td><td className="px-4 py-3 text-ink-secondary">{humanize(definition.evaluatorType)}</td><td className="px-4 py-3 text-ink-secondary">{humanize(definition.scope)}</td><td className="px-4 py-3 font-mono text-ink">v{definition.version}</td><td className="px-4 py-3"><StatusBadge tone={definition.enabled ? "success" : "neutral"}>{definition.enabled ? "Enabled" : "Disabled"}</StatusBadge></td><td className="px-4 py-3 font-mono text-ink">{definition.executionCount.toLocaleString()}</td><td className="px-4 py-3 font-mono text-ink">{definition.averageScore === undefined ? "—" : definition.averageScore.toFixed(2)}</td><td className="px-4 py-3 font-mono text-ink">{formatPercent(definition.failureRate)}</td><td className="px-4 py-3 font-mono text-[10.5px] text-ink-muted">{definition.lastRunAt ? new Date(definition.lastRunAt).toLocaleString() : "Never"}</td></tr>)}</tbody></table></div>
        </section>
      )}
    </div>
  );
}

function DatasetLibrary({ datasets, experiments }: { datasets: EvalDatasetRecord[]; experiments: ExperimentRecord[] }) {
  return (
    <div className="grid gap-4 px-4 pt-4 sm:px-6 xl:grid-cols-2">
      <section className="overflow-hidden rounded-xl border border-line bg-surface-1"><div className="border-b border-line px-4 py-3"><div className="flex items-center gap-2"><Database size={15} className="text-ink-muted" /><h2 className="text-[14px] font-semibold text-ink">Eval datasets</h2></div><p className="mt-0.5 text-[11.5px] text-ink-muted">Sanitized regression cases promoted from investigated traces.</p></div>{datasets.length ? <div className="divide-y divide-line">{datasets.map((dataset) => <div key={dataset._id} className="flex items-center justify-between gap-4 px-4 py-3"><div><div className="text-[12.5px] font-medium text-ink">{dataset.name}</div><div className="mt-0.5 text-[10.5px] text-ink-muted">v{dataset.version} · updated {new Date(dataset.updatedAt).toLocaleDateString()}</div></div><div className="font-mono text-[12px] text-ink">{dataset.itemCount} cases</div></div>)}</div> : <div className="p-8 text-center text-[12px] text-ink-muted">No datasets yet. Promote a trace to close the learning loop.</div>}</section>
      <section className="overflow-hidden rounded-xl border border-line bg-surface-1"><div className="border-b border-line px-4 py-3"><div className="flex items-center gap-2"><BarChart3 size={15} className="text-ink-muted" /><h2 className="text-[14px] font-semibold text-ink">Experiments</h2></div><p className="mt-0.5 text-[11.5px] text-ink-muted">Fixed Factory/model/executor variants compared against a fixed dataset version.</p></div>{experiments.length ? <div className="divide-y divide-line">{experiments.map((experiment) => <div key={experiment._id} className="px-4 py-3"><div className="flex items-center justify-between gap-3"><div className="text-[12.5px] font-medium text-ink">{experiment.name}</div><StatusBadge tone={experiment.status === "COMPLETED" ? "success" : experiment.status === "FAILED" ? "error" : "neutral"}>{humanize(experiment.status)}</StatusBadge></div><div className="mt-2 grid gap-2 sm:grid-cols-2">{experiment.variants.map((variant) => <div key={variant._id} className="rounded-md border border-line bg-surface-2 p-2.5"><div className="text-[11.5px] font-medium text-ink">{variant.name}</div><div className="mt-1 font-mono text-[10px] text-ink-muted">n={variant.sampleSize} · score {variant.metrics?.averageScore?.toFixed(2) ?? "—"} · success {formatPercent(variant.metrics?.successRate)}</div></div>)}</div><div className="mt-2 text-[10px] text-ink-muted">Dataset v{experiment.datasetVersion}; small samples are shown without significance claims.</div></div>)}</div> : <div className="p-8 text-center text-[12px] text-ink-muted">No experiments yet. Create one after a regression dataset has stable cases.</div>}</section>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) { return <div className="border-t border-line px-3 py-2.5 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0"><div className="text-[9.5px] uppercase tracking-[0.08em] text-ink-muted">{label}</div><div className="mt-0.5 font-mono text-[12.5px] font-medium text-ink">{value}</div></div>; }
function Meta({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="text-[9.5px] uppercase tracking-[0.07em] text-ink-muted">{label}</dt><dd className="mt-0.5 truncate font-mono text-[10.5px] text-ink-secondary" title={value}>{value}</dd></div>; }
function JsonSection({ title, value }: { title: string; value: unknown }) { if (value === undefined) return null; return <section className="mt-4"><h4 className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-muted">{title}</h4><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-surface-1 p-2.5 font-mono text-[10px] leading-relaxed text-ink-secondary">{JSON.stringify(value, null, 2)}</pre></section>; }
function EmptyPanel({ title, body }: { title: string; body: string }) { return <div className="m-4 flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface-1 p-8 text-center sm:m-6"><Network size={22} className="text-ink-muted" /><h2 className="mt-3 text-[15px] font-semibold text-ink">{title}</h2><p className="mt-1 max-w-lg text-[12.5px] leading-relaxed text-ink-muted">{body}</p></div>; }
function InlineMessage({ tone, text, onClose }: { tone: "error" | "success"; text: string; onClose: () => void }) { return <div className={cn("flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[12px]", tone === "error" ? "border-err/30 bg-err-soft text-err" : "border-ok/30 bg-ok-soft text-ok")} role={tone === "error" ? "alert" : "status"}><span>{text}</span><button type="button" onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded hover:bg-surface-1/50" aria-label="Dismiss message"><X size={13} /></button></div>; }
function formatPercent(value?: number) { return value === undefined || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(value >= 0.1 ? 1 : 0)}%`; }
function formatUsd(value?: number) { return value === undefined || !Number.isFinite(value) ? "—" : `$${value.toFixed(2)}`; }
function shortId(value?: string, length = 10) { return value ? value.slice(0, length) : "—"; }
function humanize(value: string) { return value.toLowerCase().replace(/_/g, " ").replace(/(^|\s)\w/g, (character) => character.toUpperCase()); }
