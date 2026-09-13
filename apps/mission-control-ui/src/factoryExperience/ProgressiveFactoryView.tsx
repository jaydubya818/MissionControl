import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Factory,
  Filter,
  GitPullRequest,
  Loader2,
  Route,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Textarea } from "../components/ui/textarea";
import { EmptyState } from "../components/ui/empty-state";
import {
  StatusBadge,
  type StatusBadgeProps,
} from "../components/factory/badges";
import { cn } from "../lib/utils";
import { missionDetailPath } from "../eos/missionRoutes";
import { CreateFactoryMissionDialog } from "./CreateFactoryMissionDialog";
import { ExperienceLevelSelector } from "./ExperienceLevelSelector";
import { FactoryPhaseInspector } from "./FactoryPhaseInspector";
import { FactoryRecipeCatalog } from "./FactoryRecipeCatalog";
import { FactoryRunSwimlane } from "./FactoryRunSwimlane";
import { FactoryRunMembershipPanel, type FactoryRunMembershipModel } from "./FactoryRunMembershipPanel";
import {
  FACTORY_RECIPES,
  getFactoryRecipe,
  recommendFactoryRecipe,
  recipeIdFromTrace,
} from "./recipeCatalog";
import {
  projectFactoryPhases,
  type FactoryPhaseProjection,
} from "./phaseProjection";
import { useFactoryExperienceLevel } from "./useFactoryExperienceLevel";
import { FactoryLearningView } from "./FactoryLearningView";
import {
  parseFactorySurface,
  visibleFactorySurfaces,
  type FactorySurface,
} from "./factoryLearningModel";

type Dashboard = FunctionReturnType<
  typeof api.observability.getWorkspaceDashboard
>;
type TraceSummary = Dashboard["traces"][number];
type StatusFilter = "ALL" | "RUNNING" | "SUCCESS" | "FAILED" | "CANCELED";
const CONTROL_CLASS =
  "h-8 min-w-0 rounded-md border border-line bg-surface-1 px-2.5 text-[11.5px] text-ink outline-none focus:border-info-accent focus:ring-2 focus:ring-info-accent/20";
const STATUS_TONE: Record<string, StatusBadgeProps["tone"]> = {
  RUNNING: "info",
  SUCCESS: "success",
  FAILED: "error",
  CANCELED: "warning",
};

export function ProgressiveFactoryView({
  projectId,
  onNavigate,
}: {
  projectId: Id<"projects"> | null;
  onNavigate?: (view: string) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [level, setLevel] = useFactoryExperienceLevel();
  const activeSurface = useMemo(
    () => parseFactorySurface(new URLSearchParams(location.search).get("factoryView"), level),
    [location.search, level],
  );
  const overviewActive = activeSurface === "overview";
  const [request, setRequest] = useState("");
  const recommendation = useMemo(
    () => recommendFactoryRecipe(request),
    [request],
  );
  const [selectedRecipeId, setSelectedRecipeId] = useState("plan-build-test");
  const [recipeTouched, setRecipeTouched] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [executor, setExecutor] = useState("ALL");
  const [model, setModel] = useState("ALL");
  const [costRecordedOnly, setCostRecordedOnly] = useState(false);
  const dashboard = useQuery(
    api.observability.getWorkspaceDashboard,
    projectId && overviewActive
      ? {
          projectId,
          status: status === "ALL" ? undefined : status,
          executor: executor === "ALL" ? undefined : executor,
          model: model === "ALL" ? undefined : model,
          limit: 24,
        }
      : "skip",
  );
  const repositories = useQuery(
    api.projects.listRepositories,
    projectId ? { projectId } : "skip",
  );
  const governedFactoryRuns = useQuery(
    api.factoryRuns.list,
    projectId && overviewActive ? { projectId, limit: 10 } : "skip",
  ) as FactoryRunMembershipModel[] | undefined;
  const factoryDefinitions = useQuery(
    api["factory/configuration"].list,
    projectId && overviewActive && level === "advanced" ? { projectId } : "skip",
  );
  const [selectedTraceId, setSelectedTraceId] = useState<Id<"traces"> | null>(
    null,
  );
  const traceDetail = useQuery(
    api.observability.getTraceDetail,
    selectedTraceId ? { traceId: selectedTraceId } : "skip",
  );
  const phases = useMemo(
    () =>
      projectFactoryPhases(
        (traceDetail?.observations ?? []).map((observation) => ({
          ...observation,
          _id: String(observation._id),
          parentObservationId: observation.parentObservationId
            ? String(observation.parentObservationId)
            : undefined,
        })),
      ),
    [traceDetail?.observations],
  );
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const selectedPhase = phases.find((phase) => phase._id === selectedPhaseId);
  const selectedRecipe =
    getFactoryRecipe(selectedRecipeId) ?? FACTORY_RECIPES[0];
  const visibleTraces = (dashboard?.traces ?? []).filter(
    (trace) => !costRecordedOnly || trace.estimatedCostUsd !== undefined,
  );

  useEffect(() => {
    if (!recommendation || recipeTouched) return;
    setSelectedRecipeId(recommendation.recipeId);
  }, [recommendation?.recipeId, recipeTouched]);

  useEffect(() => {
    if (!visibleTraces.length) {
      setSelectedTraceId(null);
      return;
    }
    if (
      !selectedTraceId ||
      !visibleTraces.some((trace) => trace._id === selectedTraceId)
    )
      setSelectedTraceId(visibleTraces[0]._id);
  }, [visibleTraces.map((trace) => trace._id).join("|"), selectedTraceId]);

  useEffect(() => {
    if (!phases.length) {
      setSelectedPhaseId(null);
      return;
    }
    if (
      !selectedPhaseId ||
      !phases.some((phase) => phase._id === selectedPhaseId)
    )
      setSelectedPhaseId(phases[0]._id);
  }, [phases.map((phase) => phase._id).join("|"), selectedPhaseId]);

  if (!projectId)
    return (
      <div className="p-6">
        <EmptyState
          icon={Factory}
          title="Select a workspace"
          description="The Factory is scoped to one workspace, its repositories, and its governed execution records."
        />
      </div>
    );

  const openMission = (missionId: string) =>
    navigate({
      pathname: missionDetailPath(missionId),
      search: location.search,
    });
  const openFactorySurface = (view: string) => {
    onNavigate?.(view);
    navigate({ pathname: `/v2/${view}`, search: location.search });
  };
  const selectSurface = (surface: FactorySurface) => {
    const search = new URLSearchParams(location.search);
    if (surface === "overview") search.delete("factoryView");
    else search.set("factoryView", surface);
    navigate({ pathname: location.pathname, search: search.toString() });
  };

  if (activeSurface !== "overview") {
    return (
      <div className="min-h-0 bg-app pb-10">
        <FactoryPageHeader level={level} onLevelChange={setLevel} />
        <FactorySurfaceTabs level={level} active={activeSurface} onSelect={selectSurface} />
        <FactoryLearningView projectId={projectId} surface={activeSurface} />
      </div>
    );
  }
  return (
    <div className="min-h-0 bg-app pb-10">
      <FactoryPageHeader level={level} onLevelChange={setLevel} />
      <FactorySurfaceTabs level={level} active={activeSurface} onSelect={selectSurface} />

      <div className="mx-auto flex max-w-[1600px] flex-col gap-5 px-4 py-5 sm:px-6">
        <section
          className="grid overflow-hidden rounded-xl border border-line bg-surface-1 sm:grid-cols-3"
          aria-label="Factory posture"
        >
          <PostureItem
            label="UI mode"
            value={capitalize(level)}
            detail="Presentation preference only"
            icon={Route}
          />
          <PostureItem
            label="Execution"
            value={selectedRecipe.complexity}
            detail={`${selectedRecipe.name} composition`}
            icon={Bot}
          />
          <PostureItem
            label="Autonomy"
            value="L2 governed"
            detail="Human approval and acceptance"
            icon={ShieldCheck}
          />
        </section>

        <section className="space-y-3" aria-labelledby="governed-factory-runs-title">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-info-accent">Governed inventory</div>
            <h2 id="governed-factory-runs-title" className="mt-1 text-[17px] font-semibold text-ink">Factory Runs and explicit membership</h2>
            <p className="mt-1 text-[12px] text-ink-secondary">Counts include only the immutable WorkOrder membership snapshot for each run.</p>
          </div>
          {governedFactoryRuns === undefined ? (
            <div className="h-36 animate-pulse rounded-xl bg-surface-2" aria-label="Loading Factory Runs" />
          ) : (
            <FactoryRunMembershipPanel runs={governedFactoryRuns} />
          )}
        </section>

        <section
          className="grid gap-4 rounded-xl border border-line bg-surface-1 p-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]"
          aria-labelledby="factory-request-title"
        >
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-info-accent">
              Launch a Mission
            </div>
            <h2
              id="factory-request-title"
              className="mt-1 text-[18px] font-semibold text-ink"
            >
              What are we building?
            </h2>
            <p className="mt-1 text-[12px] text-ink-secondary">
              State the outcome, constraints, and what success looks like. The
              recommendation is deterministic and reviewable.
            </p>
            <Textarea
              className="mt-4 min-h-28 resize-y"
              value={request}
              onChange={(event) => {
                setRequest(event.target.value);
                setRecipeTouched(false);
              }}
              placeholder="Example: Add a buyer due-diligence checklist with responsive states, tests, and browser evidence."
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-[11px] text-ink-muted">
                Repository:{" "}
                <span className="font-mono text-ink-secondary">
                  {repositories === undefined
                    ? "Loading…"
                    : (repositories.find((item) => item.isDefault)
                        ?.repository ??
                      repositories[0]?.repository ??
                      "Select during Mission scoping")}
                </span>
              </div>
              <Button
                disabled={!recommendation}
                onClick={() => setCreateOpen(true)}
              >
                Review Mission draft <ArrowRight size={14} className="ml-1.5" />
              </Button>
            </div>
          </div>
          <RecommendationCard
            recommendation={recommendation}
            selectedRecipeId={selectedRecipeId}
            overridden={Boolean(
              recommendation && recommendation.recipeId !== selectedRecipeId,
            )}
          />
        </section>

        <FactoryMetrics metrics={dashboard?.metrics} />

        {level !== "basic" ? (
          <>
            <FactoryRecipeCatalog
              selectedId={selectedRecipeId}
              recommendation={recommendation}
              onSelect={(id) => {
                setRecipeTouched(true);
                setSelectedRecipeId(id);
              }}
            />
            <CompositionDetails
              recipeId={selectedRecipeId}
              advanced={level === "advanced"}
            />
          </>
        ) : null}

        <section className="space-y-3" aria-labelledby="recent-runs-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-info-accent">
                Canonical observability
              </div>
              <h2
                id="recent-runs-title"
                className="mt-1 text-[17px] font-semibold text-ink"
              >
                Recent runs
              </h2>
              <p className="mt-1 text-[11.5px] text-ink-muted">
                Run cards are projections of persisted traces, not a second
                execution store.
              </p>
            </div>
            {onNavigate ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => openFactorySurface("trace-inspector")}
              >
                Open full Observability
              </Button>
            ) : null}
          </div>
          <RunFilters
            status={status}
            setStatus={setStatus}
            executor={executor}
            setExecutor={setExecutor}
            model={model}
            setModel={setModel}
            costOnly={costRecordedOnly}
            setCostOnly={setCostRecordedOnly}
            dashboard={dashboard}
            level={level}
          />
          {dashboard === undefined ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-1 py-16 text-sm text-ink-muted">
              <Loader2 size={16} className="animate-spin" />
              Loading governed runs…
            </div>
          ) : visibleTraces.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No runs match this view"
              description="Approved and dispatched WorkOrders will appear here after they create canonical trace records. Clear filters to inspect earlier runs."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleTraces.map((trace) => (
                <RunCard
                  key={trace._id}
                  trace={trace}
                  selected={trace._id === selectedTraceId}
                  onSelect={() => setSelectedTraceId(trace._id)}
                />
              ))}
            </div>
          )}
        </section>

        {selectedTraceId ? (
          <section className="space-y-3" aria-labelledby="run-detail-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-info-accent">
                  Selected run
                </div>
                <h2
                  id="run-detail-title"
                  className="mt-1 text-[17px] font-semibold text-ink"
                >
                  Execution lanes and evidence
                </h2>
              </div>
              {traceDetail ? (
                <div className="text-[10.5px] text-ink-muted">
                  {traceDetail.observationsTruncated
                    ? "First 5,000 observations shown"
                    : `${traceDetail.observations.length} recorded observations`}{" "}
                  · {traceDetail.verificationRuns.length} verification runs
                </div>
              ) : null}
            </div>
            {traceDetail === undefined ? (
              <div className="h-44 animate-pulse rounded-xl bg-surface-2" />
            ) : traceDetail === null ? (
              <div className="rounded-xl border border-err/30 bg-err-soft p-4 text-sm text-err">
                The selected trace is no longer available in this workspace.
              </div>
            ) : (
              <>
                <FactoryRunSwimlane
                  phases={phases as FactoryPhaseProjection[]}
                  selectedPhaseId={selectedPhaseId}
                  onSelectPhase={setSelectedPhaseId}
                />
                <FactoryPhaseInspector phase={selectedPhase} level={level} />
              </>
            )}
          </section>
        ) : null}

        {level === "advanced" ? (
          <AdvancedFactoryPanel
            definitions={factoryDefinitions}
            onNavigate={openFactorySurface}
          />
        ) : null}
      </div>
      <CreateFactoryMissionDialog
        projectId={projectId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        experienceLevel={level}
        initialRequest={request}
        initialRecipeId={selectedRecipeId}
        onCreated={(mission) => openMission(String(mission._id))}
      />
    </div>
  );
}

function FactoryPageHeader({
  level,
  onLevelChange,
}: {
  level: "basic" | "intermediate" | "advanced";
  onLevelChange: (level: "basic" | "intermediate" | "advanced") => void;
}) {
  return (
    <header className="border-b border-line bg-surface-1 px-4 py-4 sm:px-6">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-info-accent">
            <Factory size={13} /> Software Factory
          </div>
          <h1 className="mt-1 text-[24px] font-semibold tracking-tight text-ink">From intent to verified change</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-secondary">
            Governed execution, evidence-backed improvement, and human-owned acceptance in one operating surface.
          </p>
        </div>
        <ExperienceLevelSelector value={level} onChange={onLevelChange} />
      </div>
    </header>
  );
}

function FactorySurfaceTabs({
  level,
  active,
  onSelect,
}: {
  level: "basic" | "intermediate" | "advanced";
  active: FactorySurface;
  onSelect: (surface: FactorySurface) => void;
}) {
  return (
    <nav className="border-b border-line bg-surface-1 px-4 sm:px-6" aria-label="Factory views">
      <div className="mx-auto flex max-w-[1600px] flex-wrap gap-1 sm:flex-nowrap sm:overflow-x-auto">
        {visibleFactorySurfaces(level).map((surface) => (
          <button
            key={surface.id}
            type="button"
            onClick={() => onSelect(surface.id)}
            aria-current={active === surface.id ? "page" : undefined}
            className={cn(
              "relative shrink-0 px-3 py-2.5 text-[11.5px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-info-accent/30",
              active === surface.id ? "text-ink" : "text-ink-muted hover:text-ink-secondary",
            )}
          >
            {surface.label}
            {active === surface.id ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-info-accent" /> : null}
          </button>
        ))}
      </div>
    </nav>
  );
}

function PostureItem({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Route;
}) {
  return (
    <div className="flex items-start gap-3 border-t border-line px-4 py-3 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-muted">
        <Icon size={15} />
      </div>
      <div>
        <div className="text-[9.5px] font-medium uppercase tracking-[0.08em] text-ink-muted">
          {label}
        </div>
        <div className="mt-0.5 text-[13px] font-semibold text-ink">{value}</div>
        <div className="mt-0.5 text-[10.5px] text-ink-muted">{detail}</div>
      </div>
    </div>
  );
}

function FactoryMetrics({ metrics }: { metrics?: Dashboard["metrics"] }) {
  const items = [
    {
      label: "Attempts",
      value: metrics ? metrics.attempts.toLocaleString() : "—",
      icon: Activity,
    },
    {
      label: "Success",
      value: formatPercent(metrics?.successRate),
      icon: CheckCircle2,
    },
    {
      label: "Median",
      value: formatDuration(metrics?.medianDurationMs),
      icon: Clock3,
    },
    {
      label: "Average cost",
      value: formatCost(metrics?.averageCostUsd),
      icon: CircleDollarSign,
    },
    {
      label: "Human touch",
      value: formatPercent(metrics?.humanInterventionRate),
      icon: TriangleAlert,
    },
  ];
  return (
    <section
      className="grid overflow-hidden rounded-xl border border-line bg-surface-1 grid-cols-2 lg:grid-cols-5"
      aria-label="Recent run metrics"
    >
      {items.map(({ label, value, icon: Icon }, index) => (
        <div
          key={label}
          className={cn(
            "min-w-0 px-3.5 py-3",
            index > 1 && "border-t border-line lg:border-t-0",
            index % 2 === 1 && "border-l border-line",
            index > 0 && "lg:border-l lg:border-line",
          )}
        >
          <div className="flex items-center gap-1.5 text-[9.5px] font-medium uppercase tracking-[0.08em] text-ink-muted">
            <Icon size={11} /> {label}
          </div>
          <div className="mt-1.5 font-mono text-[16px] font-semibold text-ink">
            {value}
          </div>
        </div>
      ))}
    </section>
  );
}

function RecommendationCard({
  recommendation,
  selectedRecipeId,
  overridden,
}: {
  recommendation: ReturnType<typeof recommendFactoryRecipe>;
  selectedRecipeId: string;
  overridden: boolean;
}) {
  const recipe = getFactoryRecipe(selectedRecipeId) ?? FACTORY_RECIPES[0];
  return (
    <Card className="h-full p-4">
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-info-accent">
        <Sparkles size={13} />
        Recommended workflow
      </div>
      {recommendation ? (
        <>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-[17px] font-semibold text-ink">
                {recipe.name}
              </h3>
              <p className="mt-1 text-[11.5px] text-ink-muted">
                {recipe.timeEstimate}
              </p>
            </div>
            <StatusBadge tone={overridden ? "warning" : "success"}>
              {overridden ? "Override recorded" : "Rule based"}
            </StatusBadge>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-secondary">
            {recommendation.rationale}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {recommendation.signals.map((signal) => (
              <span
                key={signal}
                className="rounded-md border border-line bg-surface-2 px-2 py-1 text-[10px] text-ink-muted"
              >
                {signal}
              </span>
            ))}
          </div>
          {overridden ? (
            <p className="mt-3 text-[11px] text-warn">
              Recommended {getFactoryRecipe(recommendation.recipeId)?.name};
              selected {recipe.name}. Mandatory policy can still add stricter
              gates.
            </p>
          ) : null}
        </>
      ) : (
        <div className="mt-6 rounded-lg border border-dashed border-line bg-surface-2 px-4 py-8 text-center">
          <div className="text-[13px] font-medium text-ink">
            Describe the outcome
          </div>
          <p className="mt-1 text-[11px] text-ink-muted">
            A recommendation appears after enough intent is available.
          </p>
        </div>
      )}
    </Card>
  );
}

function CompositionDetails({
  recipeId,
  advanced,
}: {
  recipeId: string;
  advanced: boolean;
}) {
  const recipe = getFactoryRecipe(recipeId) ?? FACTORY_RECIPES[0];
  const facts = [
    {
      label: "Roles",
      value: recipe.roles.length
        ? recipe.roles.join(" · ")
        : "Deterministic-only on a passing run",
    },
    { label: "Routing intent", value: recipe.modelRoutingIntent },
    { label: "Context", value: recipe.contextStrategy },
    { label: "Tests", value: recipe.testStrategy },
    { label: "Review", value: recipe.reviewStrategy },
    {
      label: "Retry bound",
      value: `${recipe.maxCorrectiveIterations} corrective iterations`,
    },
  ];
  return (
    <section
      className="rounded-xl border border-line bg-surface-1 p-4"
      aria-labelledby="composition-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-info-accent">
            Selected composition
          </div>
          <h2
            id="composition-title"
            className="mt-1 text-[16px] font-semibold text-ink"
          >
            {recipe.name}
          </h2>
          <p className="mt-1 max-w-3xl text-[11.5px] text-ink-secondary">
            {recipe.useWhen}
          </p>
        </div>
        <StatusBadge tone="neutral">{recipe.verificationLevel}</StatusBadge>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {facts.map((fact) => (
          <div
            key={fact.label}
            className="rounded-lg border border-line bg-surface-2 p-3"
          >
            <dt className="text-[9.5px] font-medium uppercase tracking-[0.07em] text-ink-muted">
              {fact.label}
            </dt>
            <dd className="mt-1 text-[11.5px] text-ink-secondary">
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {recipe.deterministicGates.map((gate) => (
          <span
            key={gate}
            className="rounded-md border border-line bg-surface-2 px-2 py-1 text-[10px] text-ink-secondary"
          >
            {gate}
          </span>
        ))}
      </div>
      {advanced ? (
        <details className="mt-3 border-t border-line pt-3">
          <summary className="cursor-pointer text-[11.5px] font-medium text-ink">
            Raw recipe definition
          </summary>
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 font-mono text-[10px] text-ink-secondary">
            {JSON.stringify(recipe, null, 2)}
          </pre>
        </details>
      ) : null}
    </section>
  );
}

function RunFilters({
  status,
  setStatus,
  executor,
  setExecutor,
  model,
  setModel,
  costOnly,
  setCostOnly,
  dashboard,
  level,
}: {
  status: StatusFilter;
  setStatus: (value: StatusFilter) => void;
  executor: string;
  setExecutor: (value: string) => void;
  model: string;
  setModel: (value: string) => void;
  costOnly: boolean;
  setCostOnly: (value: boolean) => void;
  dashboard?: Dashboard;
  level: "basic" | "intermediate" | "advanced";
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-1 p-2">
      <Filter size={13} className="mx-1 text-ink-muted" />
      <select
        aria-label="Run status"
        value={status}
        onChange={(event) => setStatus(event.target.value as StatusFilter)}
        className={CONTROL_CLASS}
      >
        {["ALL", "RUNNING", "SUCCESS", "FAILED", "CANCELED"].map((item) => (
          <option key={item}>{item}</option>
        ))}
      </select>
      {level !== "basic" ? (
        <>
          <select
            aria-label="Run executor"
            value={executor}
            onChange={(event) => setExecutor(event.target.value)}
            className={CONTROL_CLASS}
          >
            <option value="ALL">All executors</option>
            {dashboard?.filters.executors.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            aria-label="Run model"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            className={CONTROL_CLASS}
          >
            <option value="ALL">All models</option>
            {dashboard?.filters.models.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </>
      ) : null}
      <label className="flex h-8 items-center gap-2 rounded-md border border-line px-2.5 text-[11px] text-ink-secondary">
        <input
          type="checkbox"
          checked={costOnly}
          onChange={(event) => setCostOnly(event.target.checked)}
        />
        Cost recorded
      </label>
    </div>
  );
}

function RunCard({
  trace,
  selected,
  onSelect,
}: {
  trace: TraceSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const recipe = getFactoryRecipe(recipeIdFromTrace(trace));
  const metadata = asRecord(trace.metadata);
  const output = asRecord(trace.output);
  const pr = stringValue(
    metadata.pullRequestUrl ??
      metadata.pullRequest ??
      output.pullRequestUrl ??
      output.pullRequest,
  );
  const verification = stringValue(
    metadata.verificationStatus ??
      metadata.verification ??
      output.verificationStatus ??
      output.verification,
  );
  const approval = stringValue(
    metadata.approvalStatus ??
      metadata.approval ??
      output.approvalStatus ??
      output.approval,
  );
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "rounded-xl border bg-surface-1 p-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-info-accent/30",
        selected
          ? "border-info-accent/60"
          : "border-line hover:border-line-strong",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold text-ink">
            {trace.workOrderTitle ?? trace.name}
          </div>
          <div className="mt-1 font-mono text-[9.5px] text-ink-muted">
            {trace.externalTraceId}
          </div>
        </div>
        <StatusBadge tone={STATUS_TONE[trace.status] ?? "neutral"}>
          {trace.status}
        </StatusBadge>
      </div>
      <div className="mt-3">
        <FactoryRunSwimlane
          compactCounts={{
            human: trace.humanInterventionCount,
            agent: trace.generationCount,
            code: trace.toolCount,
          }}
        />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3">
        <RunFact
          label="Duration"
          value={formatDuration(trace.durationMs)}
          icon={Clock3}
        />
        <RunFact
          label="Cost"
          value={formatCost(trace.estimatedCostUsd)}
          icon={CircleDollarSign}
        />
        <RunFact
          label="Recipe"
          value={recipe?.name ?? "Not recorded"}
          icon={Route}
        />
      </dl>
      <div className="mt-3 grid gap-1.5 text-[10.5px] text-ink-muted">
        <RunLine icon={GitPullRequest} label="PR" value={pr} />
        <RunLine
          icon={CheckCircle2}
          label="Verification"
          value={verification}
        />
        <RunLine icon={ShieldCheck} label="Approval" value={approval} />
      </div>
    </button>
  );
}

function RunFact({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Clock3;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-[9px] uppercase tracking-[0.06em] text-ink-muted">
        <Icon size={10} />
        {label}
      </dt>
      <dd className="mt-1 truncate text-[10.5px] font-medium text-ink-secondary">
        {value}
      </dd>
    </div>
  );
}
function RunLine({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof GitPullRequest;
  label: string;
  value?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon size={11} />
      <span>{label}:</span>
      <span className={value ? "text-ink-secondary" : "text-ink-muted"}>
        {value ?? "Not recorded"}
      </span>
    </div>
  );
}

function AdvancedFactoryPanel({
  definitions,
  onNavigate,
}: {
  definitions: Array<{ status: string }> | undefined;
  onNavigate?: (view: string) => void;
}) {
  const active =
    definitions?.filter((item) => item.status === "ACTIVE").length ?? 0;
  const links = [
    { id: "projects", label: "Factory configuration" },
    { id: "model-routing", label: "Execution routing" },
    { id: "policies", label: "Policies" },
    { id: "memory", label: "Factory Memory" },
    { id: "trace-inspector", label: "Observability & evals" },
    { id: "control-work-orders", label: "WorkOrders & evidence" },
  ];
  return (
    <section className="rounded-xl border border-line bg-surface-1 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-info-accent">
            Advanced control plane
          </div>
          <h2 className="mt-1 text-[16px] font-semibold text-ink">
            Factory Versions and diagnostics
          </h2>
          <p className="mt-1 text-[11.5px] text-ink-secondary">
            Recipe intent is resolved against immutable versions, policy, scoped
            identities, exact subjects, and server-side authority.
          </p>
        </div>
        <StatusBadge tone={active ? "success" : "neutral"}>
          {definitions === undefined
            ? "Loading…"
            : `${active} active · ${definitions.length} total`}
        </StatusBadge>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {links.map((link) => (
          <Button
            key={link.id}
            variant="outline"
            size="sm"
            disabled={!onNavigate}
            onClick={() => onNavigate?.(link.id)}
          >
            {link.label}
          </Button>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
        Factory Memory retrieval and frozen Context Package evidence remain on
        the canonical Memory and Observability surfaces. Factory Board links to
        them instead of creating a second memory view.
      </p>
      <div className="mt-4 flex items-start gap-2 rounded-lg border border-warn/25 bg-warn-soft p-3 text-[11.5px] leading-relaxed text-ink-secondary">
        <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warn" />
        Advanced visibility does not add bypass authority. Direct routes retain
        their existing workspace permission checks.
      </div>
    </section>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
function formatDuration(value?: number) {
  if (value === undefined) return "Not recorded";
  if (value < 1_000) return `${Math.round(value)}ms`;
  if (value < 60_000) return `${(value / 1_000).toFixed(1)}s`;
  return `${(value / 60_000).toFixed(1)}m`;
}
function formatCost(value?: number) {
  return value === undefined
    ? "Not recorded"
    : `$${value.toFixed(value < 1 ? 3 : 2)}`;
}
function formatPercent(value?: number) {
  return value === undefined ? "Not recorded" : `${Math.round(value * 100)}%`;
}
