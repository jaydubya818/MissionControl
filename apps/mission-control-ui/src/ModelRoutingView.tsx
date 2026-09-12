import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "./components/PageHeader";
import { StatusBadge } from "./components/factory/badges";
import { useToast } from "./Toast";
import { AlertTriangle, Bot, BrainCircuit, Cloud, Code2, Plus, Route, Save, ShieldCheck, TimerReset, Trash2 } from "lucide-react";

type Tier = "FAST" | "BALANCED" | "POWERFUL";
type Risk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type Complexity = "SMALL" | "STANDARD" | "LARGE";
type OperatingLane = "PLAN" | "EXECUTE" | "REVIEW" | "LOCAL" | "LONG_RUNNING";
type RoutingDetailLevel = "BASIC" | "INTERMEDIATE" | "ADVANCED";
type LanePool = {
  lane: OperatingLane;
  modelIds: string[];
  canaryModelIds?: string[];
  dailyBudgetUsd?: number;
  monthlyBudgetUsd?: number;
  minProviderCount?: number;
  canaryPercent?: number;
};
type CatalogEntry = {
  modelId: string;
  displayName: string;
  provider: string;
  tier: Tier;
  availability: string;
  deprecated: boolean;
  estimatedCostPerRunUsd?: number;
};
type Rule = {
  id: string;
  order: number;
  taskType?: string;
  operatingLane?: OperatingLane;
  riskLevel?: Risk;
  complexity?: Complexity;
  requiredCapabilities?: string[];
  modelId: string;
};
type ExecutionCandidateSnapshot = {
  tuple: {
    tupleKey: string;
    harness: { adapter: string; version: string };
    model: { provider: string; modelId: string };
    backend: string;
  };
  eligible: boolean;
  rejectionCodes: string[];
  rejectionReasons: string[];
  score?: number;
  evidenceCoverage: number;
  evidence: { attemptCount: number; verifiedAttemptCount: number; totalCostPerVerifiedSuccessUsd?: number; timeToVerifiedCandidateMs?: number };
  metrics: Array<{ metric: string; weight: number; observed: boolean; rawValue?: number; normalizedScore?: number }>;
};
type ExecutionRoutingSnapshot = {
  schemaVersion: string;
  algorithmVersion: string;
  policyVersion: number;
  evidenceCutoffAt: number;
  result: {
    status: "SELECTED" | "EXHAUSTED";
    mode: "ADVISORY" | "GUARDED_AUTO" | "PINNED";
    candidates: ExecutionCandidateSnapshot[];
    recommendedTupleKey?: string;
    appliedTupleKey?: string;
    fallbackTupleKey?: string;
    explanation: string;
    fallbackReason?: string;
    guardedAutoApplied: boolean;
  };
};

const TASK_TYPES = [
  "ENGINEERING",
  "DOCS",
  "OPS",
  "CONTENT",
  "CUSTOMER_RESEARCH",
  "SEO_RESEARCH",
  "SOCIAL",
  "EMAIL_MARKETING",
];

const OPERATING_LANES = [
  {
    id: "plan",
    lane: "PLAN" as const,
    title: "Plan",
    model: "Approved planning pool",
    icon: BrainCircuit,
    tone: "text-sky-300 border-sky-400/25 bg-sky-400/5",
    use: "Architecture, decomposition, tradeoffs, and high-context planning.",
    boundary: "Use GPT-5.6 Sol for difficult architecture and high-context planning.",
  },
  {
    id: "execute",
    lane: "EXECUTE" as const,
    title: "Execute",
    model: "Approved execution pool",
    icon: Code2,
    tone: "text-violet-300 border-violet-400/25 bg-violet-400/5",
    use: "Focused implementation tasks with a clear acceptance contract.",
    boundary: "Prefer Composer for bounded coding; escalate by complexity and tools.",
  },
  {
    id: "review",
    lane: "REVIEW" as const,
    title: "Review",
    model: "Approved reviewer pool",
    icon: ShieldCheck,
    tone: "text-amber-300 border-amber-400/25 bg-amber-400/5",
    use: "Code review, risk analysis, verification, and release gates.",
    boundary: "Reserve Claude Opus for consequential, high-risk, or large reviews.",
  },
  {
    id: "local",
    lane: "LOCAL" as const,
    title: "Local",
    model: "Approved local pool",
    icon: Bot,
    tone: "text-emerald-300 border-emerald-400/25 bg-emerald-400/5",
    use: "QA, automation, documentation, classification, and small private tasks.",
    boundary: "Use only when the node is healthy and the policy rule is explicit.",
  },
  {
    id: "long-running",
    lane: "LONG_RUNNING" as const,
    title: "Long-running",
    model: "Approved cloud pool",
    icon: Cloud,
    tone: "text-rose-300 border-rose-400/25 bg-rose-400/5",
    use: "Night and weekend work with checkpoints, evidence, budgets, and escalation.",
    boundary: "Cloud only · select the execution model by complexity and risk.",
  },
] as const;

function OperatingLanes({
  catalog = [],
  lanePools = [],
  selectedLane,
  onSelectLane,
  onToggleModel,
  onToggleCanary,
  onUpdatePool,
  onApplyPreset,
}: {
  catalog?: CatalogEntry[];
  lanePools?: LanePool[];
  selectedLane?: OperatingLane;
  onSelectLane?: (lane: OperatingLane) => void;
  onToggleModel?: (lane: OperatingLane, modelId: string) => void;
  onToggleCanary?: (lane: OperatingLane, modelId: string) => void;
  onUpdatePool?: (lane: OperatingLane, patch: Partial<LanePool>) => void;
  onApplyPreset?: (preset: "COST" | "BALANCED" | "QUALITY") => void;
}) {
  const selectedPool = lanePools.find((pool) => pool.lane === selectedLane);

  function healthFor(lane: OperatingLane) {
    const pool = lanePools.find((item) => item.lane === lane);
    const models = (pool?.modelIds ?? []).map((modelId) => catalog.find((model) => model.modelId === modelId)).filter(Boolean) as CatalogEntry[];
    const healthy = models.filter((model) => model.availability === "HEALTHY");
    const providerCount = new Set(healthy.map((model) => model.provider)).size;
    const issues: string[] = [];
    if (!models.length) issues.push("Empty pool");
    else if (!healthy.length) issues.push("No healthy route");
    if (["PLAN", "REVIEW", "LONG_RUNNING"].includes(lane) && !healthy.some((model) => model.tier === "POWERFUL")) issues.push("No powerful fallback");
    if (lane === "LONG_RUNNING" && providerCount < (pool?.minProviderCount ?? 2)) issues.push("Provider diversity gap");
    return { issues, tone: issues.length ? "warning" as const : "success" as const };
  }

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface-1 xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-accent/30 bg-accent/10 text-accent">
          <TimerReset className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink">AI Software Factory — operating lanes</h2>
          <p className="text-[11.5px] leading-5 text-ink-muted">Every developer manages a fleet of agents. Use local inference for bounded work and cloud agents for durable delivery; reduce cost only when capability, evidence, and review coverage still protect quality.</p>
        </div>
        {onApplyPreset && (
          <div className="flex items-center gap-1 rounded-md border border-line bg-surface-2 p-1" aria-label="Routing presets">
            {(["COST", "BALANCED", "QUALITY"] as const).map((preset) => (
              <button key={preset} type="button" onClick={() => onApplyPreset(preset)} className="rounded px-2 py-1 text-[10px] font-medium text-ink-secondary hover:bg-surface-1 hover:text-ink">
                {preset === "COST" ? "Cost-conscious" : preset === "QUALITY" ? "Quality-first" : "Balanced"}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-5">
        {OPERATING_LANES.map((lane) => {
          const Icon = lane.icon;
          const approved = lanePools.find((pool) => pool.lane === lane.lane)?.modelIds ?? [];
          const health = healthFor(lane.lane);
          return (
            <div key={lane.id} className="min-w-0 px-3 py-3">
              <div className={`mb-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-medium ${lane.tone}`}>
                <Icon className="h-3 w-3" />
                {lane.title}
              </div>
              <p className="truncate font-mono text-[11px] font-semibold text-ink" title={lane.model}>{lane.model}</p>
              <p className="mt-1 text-[11px] leading-4 text-ink-secondary">{lane.use}</p>
              <p className="mt-2 text-[10px] leading-4 text-ink-muted">{lane.boundary}</p>
              {onSelectLane && (
                <button
                  type="button"
                  className="mt-3 text-[10.5px] font-medium text-accent hover:underline"
                  onClick={() => onSelectLane(lane.lane)}
                >
                  {approved.length ? `${approved.length} approved · Manage` : "Select approved models"}
                </button>
              )}
              <div className="mt-2 flex items-center gap-1.5 text-[9.5px] text-ink-muted">
                <span className={`h-1.5 w-1.5 rounded-full ${health.issues.length ? "bg-warn" : "bg-success"}`} />
                {health.issues[0] ?? "Ready"}
              </div>
            </div>
          );
        })}
      </div>
      {selectedLane && onToggleModel && (
        <div className="border-t border-line bg-surface-2/40 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-ink">Approved models for {selectedLane.replace("_", " ").toLowerCase()}</p>
              <p className="text-[10.5px] text-ink-muted">The router picks the cheapest healthy option that clears the task's quality floor. Click a model to approve or remove it.</p>
            </div>
            <StatusBadge tone={lanePools.find((pool) => pool.lane === selectedLane)?.modelIds.length ? "success" : "warning"}>
              {lanePools.find((pool) => pool.lane === selectedLane)?.modelIds.length ?? 0} approved
            </StatusBadge>
          </div>
          {onUpdatePool && (
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <Field label="Daily spend limit">
                <Input aria-label="Daily spend limit" type="number" min="0" step="0.01" placeholder="No limit" value={selectedPool?.dailyBudgetUsd ?? ""} onChange={(event) => onUpdatePool(selectedLane, { dailyBudgetUsd: event.target.value ? Number(event.target.value) : undefined })} />
              </Field>
              <Field label="Monthly spend limit">
                <Input aria-label="Monthly spend limit" type="number" min="0" step="0.01" placeholder="No limit" value={selectedPool?.monthlyBudgetUsd ?? ""} onChange={(event) => onUpdatePool(selectedLane, { monthlyBudgetUsd: event.target.value ? Number(event.target.value) : undefined })} />
              </Field>
              <Field label="Minimum providers">
                <Input aria-label="Minimum providers" type="number" min="1" step="1" value={selectedPool?.minProviderCount ?? (selectedLane === "LONG_RUNNING" ? 2 : 1)} onChange={(event) => onUpdatePool(selectedLane, { minProviderCount: Math.max(1, Number(event.target.value) || 1) })} />
              </Field>
              <Field label="New-model canary">
                <Input aria-label="New-model canary percentage" type="number" min="0" max="100" step="1" value={selectedPool?.canaryPercent ?? 10} onChange={(event) => onUpdatePool(selectedLane, { canaryPercent: Math.min(100, Math.max(0, Number(event.target.value) || 0)) })} />
              </Field>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {catalog.filter((model) => !model.deprecated).map((model) => {
              const approved = lanePools.find((pool) => pool.lane === selectedLane)?.modelIds.includes(model.modelId) ?? false;
              const canary = lanePools.find((pool) => pool.lane === selectedLane)?.canaryModelIds?.includes(model.modelId) ?? false;
              return (
                <div key={model.modelId} className={`flex items-stretch overflow-hidden rounded-md border transition-colors ${approved ? "border-accent/50 bg-accent/10" : "border-line bg-surface-1"}`}>
                  <button type="button" aria-pressed={approved} onClick={() => onToggleModel(selectedLane, model.modelId)} className="px-2.5 py-2 text-left hover:bg-surface-2">
                    <span className="block text-[11px] font-medium text-ink">{approved ? "✓ " : ""}{model.displayName}</span>
                    <span className="block text-[9.5px] text-ink-muted">{model.tier} · {model.provider}{model.estimatedCostPerRunUsd != null ? ` · ~$${model.estimatedCostPerRunUsd}` : ""}</span>
                  </button>
                  {approved && onToggleCanary && (
                    <button type="button" onClick={() => onToggleCanary(selectedLane, model.modelId)} className={`border-l border-line px-2 text-[9px] font-medium ${canary ? "text-warn" : "text-ink-muted hover:text-ink"}`} title={canary ? "Promote to stable" : "Return to canary"}>
                      {canary ? "CANARY" : "STABLE"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="grid gap-px border-t border-line bg-line sm:grid-cols-3">
        <div className="bg-surface-1 px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-ink-muted">Default</p>
          <p className="mt-1 text-xs text-ink-secondary">Start with the cheapest eligible route that has passed the required capability and risk checks.</p>
        </div>
        <div className="bg-surface-1 px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-ink-muted">Escalate</p>
          <p className="mt-1 text-xs text-ink-secondary">Move to a stronger cloud lane after failed validation, missing capability, repeat retries, or larger context.</p>
        </div>
        <div className="bg-surface-1 px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-ink-muted">Evidence</p>
          <p className="mt-1 text-xs text-ink-secondary">Every fleet owner reviews cost, quality, retries, and approval evidence—not model activity alone.</p>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-ink-secondary">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-ink-muted">{hint}</p>}
    </div>
  );
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

export function ModelRoutingView({ projectId }: { projectId: Id<"projects"> }) {
  const catalog = useQuery(api.modelCatalog.list, { projectId });
  const policy = useQuery(api.modelRoutingPolicies.getActive, { projectId });
  const decisions = useQuery(api.modelRoutingDecisions.listRecent, { projectId, limit: 30 });
  const enforcementEnabled = useQuery(api.featureFlags.isEnabled, {
    key: "model-routing.enabled",
    projectId,
  });
  const guardedAutoEnabled = useQuery(api.featureFlags.isEnabled, {
    key: "execution-routing.guarded-auto",
    projectId,
  });
  const initializeCatalog = useMutation(api.modelCatalog.initializeDefaults);
  const savePolicy = useMutation(api.modelRoutingPolicies.save);
  const promoteGuardedAuto = useMutation(api.executionRouting.promoteGuardedAuto);
  const setFlag = useMutation(api.featureFlags.setFlag);
  const { toast } = useToast();

  const [name, setName] = useState("Workspace routing policy");
  const [defaultModelId, setDefaultModelId] = useState("");
  const [safeFallbackModelId, setSafeFallbackModelId] = useState("");
  const [fallbackChain, setFallbackChain] = useState<string[]>([]);
  const [budgetLimit, setBudgetLimit] = useState("");
  const [canaryPercent, setCanaryPercent] = useState("0");
  const [killSwitch, setKillSwitch] = useState(false);
  const [executionMode, setExecutionMode] = useState<"ADVISORY" | "GUARDED_AUTO">("ADVISORY");
  const [evidenceWindowDays, setEvidenceWindowDays] = useState("30");
  const [minimumVerifiedAttempts, setMinimumVerifiedAttempts] = useState("5");
  const [minimumEvidenceCoverage, setMinimumEvidenceCoverage] = useState("60");
  const [minimumScoreMargin, setMinimumScoreMargin] = useState("5");
  const [minimumContextWindow, setMinimumContextWindow] = useState("");
  const [promotionReason, setPromotionReason] = useState("");
  const [routingDetailLevel, setRoutingDetailLevel] = useState<RoutingDetailLevel>("BASIC");
  const [rules, setRules] = useState<Rule[]>([]);
  const [lanePools, setLanePools] = useState<LanePool[]>([]);
  const [selectedLane, setSelectedLane] = useState<OperatingLane>("REVIEW");
  const [saving, setSaving] = useState(false);
  const [simTaskType, setSimTaskType] = useState("ENGINEERING");
  const [simLane, setSimLane] = useState<OperatingLane>("EXECUTE");
  const [simRisk, setSimRisk] = useState<Risk>("MEDIUM");
  const [simComplexity, setSimComplexity] = useState<Complexity>("STANDARD");
  const [simTier, setSimTier] = useState<Tier>("BALANCED");
  const [simCapabilities, setSimCapabilities] = useState("tools, code");
  const [simBudget, setSimBudget] = useState("");

  useEffect(() => {
    if (!policy) return;
    setName(policy.name);
    setDefaultModelId(policy.defaultModelId ?? "");
    setSafeFallbackModelId(policy.safeFallbackModelId ?? "");
    setFallbackChain(policy.fallbackChain);
    setBudgetLimit(policy.budgetLimitUsd == null ? "" : String(policy.budgetLimitUsd));
    setCanaryPercent(String(policy.canaryPercent));
    setKillSwitch(policy.killSwitch);
    setExecutionMode(policy.executionRouting?.mode ?? "ADVISORY");
    setEvidenceWindowDays(String(policy.executionRouting?.evidenceWindowDays ?? 30));
    setMinimumVerifiedAttempts(String(policy.executionRouting?.minimumVerifiedAttempts ?? 5));
    setMinimumEvidenceCoverage(String(Math.round((policy.executionRouting?.minimumEvidenceCoverage ?? 0.6) * 100)));
    setMinimumScoreMargin(String(policy.executionRouting?.minimumScoreMargin ?? 5));
    setMinimumContextWindow(policy.executionRouting?.minimumContextWindow == null ? "" : String(policy.executionRouting.minimumContextWindow));
    setRules((policy.rules as Rule[]).map((rule) =>
      !rule.operatingLane && rule.modelId.startsWith("local:")
        ? { ...rule, operatingLane: "LOCAL" }
        : rule
    ));
    setLanePools((policy.lanePools ?? []) as LanePool[]);
  }, [policy]);

  useEffect(() => {
    if (!catalog?.length || lanePools.length) return;
    const healthy = catalog.filter((model) => model.availability === "HEALTHY" && !model.deprecated);
    setLanePools(OPERATING_LANES.map(({ lane }) => ({
      lane,
      modelIds: healthy
        .filter((model) => lane === "LOCAL" ? model.provider.startsWith("local:") : !model.provider.startsWith("local:"))
        .filter((model) => lane !== "LONG_RUNNING" || model.tier !== "FAST")
        .map((model) => model.modelId),
      canaryModelIds: [],
      minProviderCount: lane === "LONG_RUNNING" ? 2 : 1,
      canaryPercent: 10,
    })));
  }, [catalog, lanePools.length]);

  useEffect(() => {
    if (!catalog?.length || defaultModelId) return;
    const balanced = catalog.find((model) => model.tier === "BALANCED") ?? catalog[0];
    const powerful = catalog.find((model) => model.tier === "POWERFUL") ?? balanced;
    setDefaultModelId(balanced.modelId);
    setSafeFallbackModelId(powerful.modelId);
    setFallbackChain([powerful.modelId]);
  }, [catalog, defaultModelId]);

  const requiredCapabilities = useMemo(
    () => [...new Set(simCapabilities.split(",").map((value) => value.trim()).filter(Boolean))],
    [simCapabilities]
  );
  const simulation = useQuery(
    api.modelRoutingPolicies.simulate,
    catalog?.length
      ? {
          projectId,
          taskType: simTaskType,
          operatingLane: simLane,
          riskLevel: simRisk,
          complexity: simComplexity,
          requestedTier: simTier,
          requiredCapabilities,
          budgetRemainingUsd: simBudget ? Number(simBudget) : undefined,
        }
      : "skip"
  );

  async function save() {
    setSaving(true);
    try {
      await savePolicy({
        projectId,
        name,
        defaultModelId: defaultModelId || undefined,
        safeFallbackModelId: safeFallbackModelId || undefined,
        fallbackChain,
        rules: rules.map((rule, index) => ({ ...rule, order: index })),
        lanePools,
        budgetLimitUsd: budgetLimit ? Number(budgetLimit) : undefined,
        executionRouting: {
          mode: executionMode,
          evidenceWindowDays: Number(evidenceWindowDays),
          minimumVerifiedAttempts: Number(minimumVerifiedAttempts),
          minimumEvidenceCoverage: Number(minimumEvidenceCoverage) / 100,
          minimumScoreMargin: Number(minimumScoreMargin),
          minimumContextWindow: minimumContextWindow ? Number(minimumContextWindow) : undefined,
        },
        canaryPercent: Number(canaryPercent),
        killSwitch,
      });
      toast("Routing policy activated");
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Policy update failed", true);
    } finally {
      setSaving(false);
    }
  }

  function applyPreset(preset: "COST" | "BALANCED" | "QUALITY") {
    if (!catalog?.length) return;
    const cloud = catalog.filter((model) => model.availability === "HEALTHY" && !model.deprecated && !model.provider.startsWith("local:"));
    const local = catalog.filter((model) => model.availability === "HEALTHY" && !model.deprecated && model.provider.startsWith("local:"));
    const ids = (tiers: Tier[]) => cloud.filter((model) => tiers.includes(model.tier)).map((model) => model.modelId);
    const tiersByLane: Record<Exclude<OperatingLane, "LOCAL">, Tier[]> = preset === "QUALITY"
      ? { PLAN: ["POWERFUL"], EXECUTE: ["BALANCED", "POWERFUL"], REVIEW: ["POWERFUL"], LONG_RUNNING: ["POWERFUL"] }
      : preset === "COST"
        ? { PLAN: ["POWERFUL"], EXECUTE: ["FAST", "BALANCED"], REVIEW: ["FAST", "POWERFUL"], LONG_RUNNING: ["BALANCED", "POWERFUL"] }
        : { PLAN: ["BALANCED", "POWERFUL"], EXECUTE: ["FAST", "BALANCED", "POWERFUL"], REVIEW: ["FAST", "BALANCED", "POWERFUL"], LONG_RUNNING: ["BALANCED", "POWERFUL"] };
    setLanePools(OPERATING_LANES.map(({ lane }) => ({
      lane,
      modelIds: lane === "LOCAL" ? local.map((model) => model.modelId) : ids(tiersByLane[lane]),
      canaryModelIds: [],
      minProviderCount: lane === "LONG_RUNNING" ? 2 : 1,
      canaryPercent: 10,
    })));
    toast(`${preset === "COST" ? "Cost-conscious" : preset === "QUALITY" ? "Quality-first" : "Balanced"} preset applied. Review and activate to save.`);
  }

  if (!catalog || policy === undefined || decisions === undefined || enforcementEnabled === undefined || guardedAutoEnabled === undefined) {
    return (
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-app">
        <PageHeader
          eyebrow="Settings"
          title="Execution Routing"
          description="Recommend a production-qualified harness, model, and backend from frozen Factory evidence."
          status={<StatusBadge tone="neutral">Loading policy</StatusBadge>}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto grid w-full max-w-[1400px] gap-4 px-6 py-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]">
            <OperatingLanes />
            <div className="rounded-lg border border-line bg-surface-1 p-6 text-sm text-ink-muted xl:col-span-2">Loading provider health and workspace policy…</div>
          </div>
        </div>
      </section>
    );
  }

  const healthyCount = catalog.filter((model) => model.availability === "HEALTHY").length;
  const result = simulation?.result;
  const activationIssues = OPERATING_LANES.flatMap(({ lane, title }) => {
    const pool = lanePools.find((item) => item.lane === lane);
    const models = (pool?.modelIds ?? []).map((modelId) => catalog.find((model) => model.modelId === modelId)).filter(Boolean);
    const healthy = models.filter((model) => model?.availability === "HEALTHY");
    if (!models.length) return [`${title} has no approved models`];
    if (!healthy.length) return [`${title} has no healthy approved model`];
    if (["PLAN", "REVIEW", "LONG_RUNNING"].includes(lane) && !healthy.some((model) => model?.tier === "POWERFUL")) return [`${title} has no powerful fallback`];
    return [];
  });
  const latestExecutionDecision = decisions.find((decision) => Boolean(decision.algorithmVersion));
  const latestExecutionSnapshot = latestExecutionDecision?.executionRoutingSnapshot as ExecutionRoutingSnapshot | undefined;
  const latestRecommendedCandidate = latestExecutionSnapshot?.result.candidates.find(
    (candidate) => candidate.tuple.tupleKey === latestExecutionSnapshot.result.recommendedTupleKey,
  );
  const eligibleCandidateCount = latestExecutionSnapshot?.result.candidates.filter((candidate) => candidate.eligible).length ?? 0;
  const rejectedCandidateCount = latestExecutionSnapshot?.result.candidates.length
    ? latestExecutionSnapshot.result.candidates.length - eligibleCandidateCount
    : 0;

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-app">
      <PageHeader
        eyebrow="Settings"
        title="Execution Routing"
        description="Recommend a production-qualified harness, model, and backend from frozen Factory evidence."
        status={
          enforcementEnabled ? (
            <StatusBadge tone={killSwitch ? "warning" : "success"}>
              {killSwitch ? "Kill switch active" : "Model policy enforced"}
            </StatusBadge>
          ) : (
            <StatusBadge tone="neutral">Model policy shadow</StatusBadge>
          )
        }
        actions={
          <Button
            size="sm"
            variant={enforcementEnabled ? "outline" : "default"}
            disabled={!policy || catalog.length === 0}
            onClick={async () => {
              await setFlag({
                key: "model-routing.enabled",
                enabled: !enforcementEnabled,
                projectId,
              });
              toast(enforcementEnabled ? "Model policy returned to shadow mode" : "Model policy enforcement enabled");
            }}
          >
            {enforcementEnabled ? "Use model shadow" : "Enforce model policy"}
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-[1400px] gap-4 px-6 py-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]">
          <section className="overflow-hidden rounded-lg border border-line bg-surface-1 xl:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <Route className="h-4 w-4 text-accent" />
                  <h2 className="text-sm font-semibold text-ink">Execution strategy</h2>
                </div>
                <p className="mt-1 text-[11.5px] text-ink-muted">Exact Factory Version tuples only. Eligibility is decided before verified evidence is scored.</p>
              </div>
              <div className="flex items-center gap-1 rounded-md border border-line bg-surface-2 p-1" aria-label="Execution routing detail level">
                {(["BASIC", "INTERMEDIATE", "ADVANCED"] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    aria-pressed={routingDetailLevel === level}
                    onClick={() => setRoutingDetailLevel(level)}
                    className={`rounded px-2.5 py-1.5 text-[10.5px] font-medium ${routingDetailLevel === level ? "bg-surface-1 text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}
                  >
                    {level === "BASIC" ? "Basic" : level === "INTERMEDIATE" ? "Intermediate" : "Advanced"}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
              <div className="px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.06em] text-ink-muted">Operating mode</p>
                <p className="mt-1 text-sm font-semibold text-ink">{latestExecutionSnapshot?.result.mode.replace("_", " ") ?? executionMode.replace("_", " ")}</p>
                <p className="mt-1 text-[10.5px] text-ink-muted">Guarded flag {guardedAutoEnabled ? "enabled" : "off"}</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.06em] text-ink-muted">Recommended strategy</p>
                <p className="mt-1 truncate font-mono text-[12px] font-semibold text-ink" title={latestRecommendedCandidate?.tuple.tupleKey}>
                  {latestRecommendedCandidate ? `${latestRecommendedCandidate.tuple.harness.adapter} · ${latestRecommendedCandidate.tuple.model.modelId}` : "Awaiting first decision"}
                </p>
                <p className="mt-1 text-[10.5px] text-ink-muted">{latestRecommendedCandidate?.tuple.backend ?? "No frozen evidence yet"}</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.06em] text-ink-muted">Evidence confidence</p>
                <p className="mt-1 text-sm font-semibold text-ink">{latestRecommendedCandidate ? `${Math.round(latestRecommendedCandidate.evidenceCoverage * 100)}%` : "Unknown"}</p>
                <p className="mt-1 text-[10.5px] text-ink-muted">{latestRecommendedCandidate ? `${latestRecommendedCandidate.evidence.verifiedAttemptCount} verified / ${latestRecommendedCandidate.evidence.attemptCount} Attempts` : "Unknown stays unknown"}</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.06em] text-ink-muted">Dispatch gate</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${latestExecutionSnapshot?.result.status === "EXHAUSTED" ? "bg-danger" : latestExecutionSnapshot ? "bg-success" : "bg-ink-muted"}`} />
                  <p className="text-sm font-semibold text-ink">{latestExecutionSnapshot?.result.status ?? "No decision"}</p>
                </div>
                <p className="mt-1 text-[10.5px] text-ink-muted">{eligibleCandidateCount} eligible · {rejectedCandidateCount} rejected</p>
              </div>
            </div>

            <div className={`border-t px-4 py-3 ${latestExecutionSnapshot?.result.status === "EXHAUSTED" ? "border-danger/30 bg-danger/5" : "border-line bg-surface-2/40"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-4xl">
                  <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-ink-muted">Why this route</p>
                  <p className="mt-1 text-[12px] leading-5 text-ink-secondary">{latestExecutionSnapshot?.result.explanation ?? "Dispatch will preserve the current production-certified Factory Version until a WorkOrder records its first evidence-backed decision."}</p>
                </div>
                {latestExecutionSnapshot && (
                  <StatusBadge tone={latestExecutionSnapshot.result.guardedAutoApplied ? "success" : latestExecutionSnapshot.result.status === "EXHAUSTED" ? "error" : "neutral"}>
                    {latestExecutionSnapshot.result.guardedAutoApplied ? "Auto-applied" : latestExecutionSnapshot.result.fallbackReason ? "Fallback retained" : "Advisory"}
                  </StatusBadge>
                )}
              </div>
            </div>

            {routingDetailLevel !== "BASIC" && latestExecutionSnapshot && (
              <div className="border-t border-line">
                <div className="overflow-x-auto" tabIndex={0} aria-label="Execution routing candidate comparison">
                  <table className="w-full min-w-[860px] text-left">
                    <thead className="bg-surface-2 text-[10px] uppercase tracking-[0.06em] text-ink-muted">
                      <tr>
                        <th className="px-4 py-2.5">Candidate tuple</th>
                        <th className="px-3 py-2.5">Eligibility</th>
                        <th className="px-3 py-2.5">Score</th>
                        <th className="px-3 py-2.5">Evidence</th>
                        <th className="px-4 py-2.5">Decision reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latestExecutionSnapshot.result.candidates.map((candidate) => (
                        <tr key={candidate.tuple.tupleKey} className="border-t border-line align-top text-[11.5px]">
                          <td className="px-4 py-3">
                            <p className="font-mono font-medium text-ink">{candidate.tuple.harness.adapter}/{candidate.tuple.harness.version}</p>
                            <p className="mt-0.5 text-ink-muted">{candidate.tuple.model.provider}/{candidate.tuple.model.modelId} · {candidate.tuple.backend}</p>
                          </td>
                          <td className="px-3 py-3"><StatusBadge tone={candidate.eligible ? "success" : "error"}>{candidate.eligible ? "Eligible" : "Rejected"}</StatusBadge></td>
                          <td className="px-3 py-3 font-mono text-ink">{candidate.score == null ? "Unknown" : candidate.score.toFixed(2)}</td>
                          <td className="px-3 py-3 text-ink-secondary">{Math.round(candidate.evidenceCoverage * 100)}% · {candidate.evidence.verifiedAttemptCount} verified</td>
                          <td className="max-w-[360px] px-4 py-3 leading-5 text-ink-secondary">{candidate.eligible ? "Cleared every hard constraint; scored only on observed metrics." : candidate.rejectionReasons.join(" ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {routingDetailLevel === "ADVANCED" && latestExecutionSnapshot && (
              <div className="grid gap-3 border-t border-line bg-surface-2/30 px-4 py-3 md:grid-cols-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.06em] text-ink-muted">Frozen identity</p>
                  <p className="mt-1 break-all font-mono text-[10.5px] leading-5 text-ink-secondary">{latestExecutionDecision?.decisionDigest ?? "Digest unavailable"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.06em] text-ink-muted">Algorithm and cutoff</p>
                  <p className="mt-1 font-mono text-[10.5px] leading-5 text-ink-secondary">{latestExecutionSnapshot.algorithmVersion}<br />{formatTime(latestExecutionSnapshot.evidenceCutoffAt)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.06em] text-ink-muted">Policy gates</p>
                  <p className="mt-1 text-[10.5px] leading-5 text-ink-secondary">{minimumVerifiedAttempts} verified Attempts · {minimumEvidenceCoverage}% coverage · {minimumScoreMargin}-point margin · {evidenceWindowDays} days</p>
                </div>
              </div>
            )}
          </section>

          <OperatingLanes
            catalog={catalog}
            lanePools={lanePools}
            selectedLane={selectedLane}
            onSelectLane={setSelectedLane}
            onToggleModel={(lane, modelId) => setLanePools((current) => {
              const existing = current.find((pool) => pool.lane === lane) ?? { lane, modelIds: [], canaryModelIds: [], canaryPercent: 10 };
              const removing = existing.modelIds.includes(modelId);
              const modelIds = removing ? existing.modelIds.filter((id) => id !== modelId) : [...existing.modelIds, modelId];
              const canaryModelIds = removing
                ? (existing.canaryModelIds ?? []).filter((id) => id !== modelId)
                : [...new Set([...(existing.canaryModelIds ?? []), modelId])];
              return [...current.filter((pool) => pool.lane !== lane), { ...existing, modelIds, canaryModelIds }];
            })}
            onToggleCanary={(lane, modelId) => setLanePools((current) => current.map((pool) => pool.lane !== lane ? pool : {
              ...pool,
              canaryModelIds: (pool.canaryModelIds ?? []).includes(modelId)
                ? (pool.canaryModelIds ?? []).filter((id) => id !== modelId)
                : [...(pool.canaryModelIds ?? []), modelId],
            }))}
            onUpdatePool={(lane, patch) => setLanePools((current) => current.map((pool) => pool.lane === lane ? { ...pool, ...patch } : pool))}
            onApplyPreset={applyPreset}
          />
          <div className="space-y-4">
            <section className="rounded-lg border border-line bg-surface-1">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-ink">Provider health</h2>
                  <p className="text-[11.5px] text-ink-muted">{healthyCount} of {catalog.length} routes healthy</p>
                  <p className="text-[11.5px] text-ink-muted">Local sync requires a signed workspace command.</p>
                </div>
                {catalog.length === 0 && (
                  <Button
                    size="sm"
                    onClick={async () => {
                      const result = await initializeCatalog({ projectId });
                      toast(`Initialized ${result.created} model routes`);
                    }}
                  >
                    Initialize safe catalog
                  </Button>
                )}
              </div>
              {catalog.length ? (
                <div className="overflow-x-auto" tabIndex={0} aria-label="Provider health routes">
                  <table className="w-full min-w-[680px] text-left">
                    <thead className="bg-surface-2 text-[10.5px] uppercase tracking-[0.06em] text-ink-muted">
                      <tr>
                        <th className="px-4 py-2.5">Route</th>
                        <th className="px-3 py-2.5">Provider</th>
                        <th className="px-3 py-2.5">Tier</th>
                        <th className="px-3 py-2.5">Capabilities</th>
                        <th className="px-4 py-2.5">Health</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catalog.map((model) => (
                        <tr key={model._id} className="border-t border-line text-[12.5px]">
                          <td className="px-4 py-3">
                            <p className="font-medium text-ink">{model.displayName}</p>
                            <p className="font-mono text-[10.5px] text-ink-muted">{model.modelId}</p>
                          </td>
                          <td className="px-3 py-3 text-ink-secondary">{model.provider}</td>
                          <td className="px-3 py-3 text-ink-secondary">{model.tier}</td>
                          <td className="px-3 py-3 text-ink-secondary">{model.capabilities.join(", ")}</td>
                          <td className="px-4 py-3">
                            <StatusBadge tone={model.availability === "HEALTHY" ? "success" : model.availability === "DEGRADED" ? "warning" : "error"}>
                              {model.availability}
                            </StatusBadge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-4 py-8 text-center text-sm text-ink-muted">
                  Initialize the catalog before creating or enforcing a routing policy.
                </p>
              )}
            </section>

            <section className="rounded-lg border border-line bg-surface-1 p-4">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-ink">Workspace policy</h2>
                  <p className="text-[11.5px] text-ink-muted">
                    Every save creates a new immutable policy version. Current: v{policy?.version ?? 0}.
                  </p>
                </div>
                <Button size="sm" disabled={saving || catalog.length === 0 || activationIssues.length > 0} onClick={save} title={activationIssues[0]}>
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  {saving ? "Saving…" : "Activate policy"}
                </Button>
              </div>
              {activationIssues.length > 0 && (
                <div className="mb-4 flex gap-2 rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-[11.5px] text-ink-secondary">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
                  <span>Activation blocked: {activationIssues.join("; ")}.</span>
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Policy name">
                  <Input aria-label="Policy name" value={name} onChange={(event) => setName(event.target.value)} />
                </Field>
                <Field label="Canary enforcement" hint="0% stays in shadow; increase after decision review.">
                  <Input aria-label="Canary enforcement percentage" type="number" min="0" max="100" value={canaryPercent} onChange={(event) => setCanaryPercent(event.target.value)} />
                </Field>
                <Field label="Workspace default">
                  <Select value={defaultModelId} onValueChange={setDefaultModelId}>
                    <SelectTrigger aria-label="Workspace default"><SelectValue placeholder="Select model route" /></SelectTrigger>
                    <SelectContent>
                      {catalog.map((model) => <SelectItem key={model._id} value={model.modelId}>{model.displayName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Safe fallback">
                  <Select value={safeFallbackModelId} onValueChange={setSafeFallbackModelId}>
                    <SelectTrigger aria-label="Safe fallback"><SelectValue placeholder="Select safe fallback" /></SelectTrigger>
                    <SelectContent>
                      {catalog.filter((model) => model.riskApproved).map((model) => (
                        <SelectItem key={model._id} value={model.modelId}>{model.displayName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Per-run budget cap" hint="Optional routing estimate cap in USD.">
                  <Input aria-label="Per-run budget cap" type="number" min="0" step="0.01" value={budgetLimit} onChange={(event) => setBudgetLimit(event.target.value)} placeholder="No cap" />
                </Field>
                <Field label="Fallback chain" hint="Comma-separated ordered model route IDs.">
                  <Input aria-label="Fallback chain" value={fallbackChain.join(", ")} onChange={(event) => setFallbackChain(event.target.value.split(",").map((value) => value.trim()).filter(Boolean))} />
                </Field>
                <Field label="Execution routing mode" hint="Guarded Auto remains inert until separately promoted and enabled.">
                  <Select value={executionMode} onValueChange={(value) => setExecutionMode(value as "ADVISORY" | "GUARDED_AUTO")}>
                    <SelectTrigger aria-label="Execution routing mode"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADVISORY">Advisory</SelectItem>
                      <SelectItem value="GUARDED_AUTO">Guarded Auto (staged)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Evidence window" hint="Bounded verified history in days.">
                  <Input aria-label="Evidence window in days" type="number" min="1" max="90" step="1" value={evidenceWindowDays} onChange={(event) => setEvidenceWindowDays(event.target.value)} />
                </Field>
                <Field label="Minimum verified Attempts">
                  <Input aria-label="Minimum verified Attempts" type="number" min="1" max="100" step="1" value={minimumVerifiedAttempts} onChange={(event) => setMinimumVerifiedAttempts(event.target.value)} />
                </Field>
                <Field label="Minimum evidence coverage" hint="Observed scoring weight required, as a percentage.">
                  <Input aria-label="Minimum evidence coverage percentage" type="number" min="0" max="100" step="1" value={minimumEvidenceCoverage} onChange={(event) => setMinimumEvidenceCoverage(event.target.value)} />
                </Field>
                <Field label="Minimum score margin" hint="Required lead over the runner-up on a 100-point scale.">
                  <Input aria-label="Minimum score margin" type="number" min="0" max="100" step="1" value={minimumScoreMargin} onChange={(event) => setMinimumScoreMargin(event.target.value)} />
                </Field>
                <Field label="Minimum context window" hint="Optional hard token constraint; unknown fails closed.">
                  <Input aria-label="Minimum context window" type="number" min="1" step="1000" value={minimumContextWindow} onChange={(event) => setMinimumContextWindow(event.target.value)} placeholder="No hard minimum" />
                </Field>
                <label className="flex items-center gap-2 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2.5 text-[12.5px] text-ink md:col-span-2">
                  <input type="checkbox" checked={killSwitch} onChange={(event) => setKillSwitch(event.target.checked)} />
                  Kill switch: keep existing runtime model selection and record the policy as bypassed
                </label>
              </div>

              <div className="mt-4 rounded-lg border border-line bg-surface-2/50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-ink">Guarded Auto promotion gate</p>
                    <p className="mt-1 text-[11px] leading-5 text-ink-muted">Promotion creates a new policy version bound to a reviewed, reproducible routing decision. The runtime flag is independent and default-off.</p>
                  </div>
                  <StatusBadge tone={policy?.executionRouting?.guardedAutoPromotedAt ? "success" : "neutral"}>
                    {policy?.executionRouting?.guardedAutoPromotedAt ? "Promoted" : "Not promoted"}
                  </StatusBadge>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <Input aria-label="Guarded Auto promotion evidence" value={promotionReason} onChange={(event) => setPromotionReason(event.target.value)} placeholder="Why is this evidence sufficient for guarded selection?" />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!latestExecutionDecision?.decisionDigest || !promotionReason.trim() || Boolean(policy?.executionRouting?.guardedAutoPromotedAt)}
                    onClick={async () => {
                      try {
                        await promoteGuardedAuto({
                          projectId,
                          reason: promotionReason.trim(),
                          evidenceDecisionIds: [latestExecutionDecision!._id],
                        });
                        setPromotionReason("");
                        toast("Guarded Auto policy promoted; runtime flag remains unchanged");
                      } catch (cause) {
                        toast(cause instanceof Error ? cause.message : "Guarded Auto promotion failed", true);
                      }
                    }}
                  >
                    Promote with evidence
                  </Button>
                  <Button
                    size="sm"
                    variant={guardedAutoEnabled ? "outline" : "default"}
                    disabled={!policy?.executionRouting?.guardedAutoPromotedAt}
                    onClick={async () => {
                      try {
                        await setFlag({
                          key: "execution-routing.guarded-auto",
                          enabled: !guardedAutoEnabled,
                          projectId,
                        });
                        toast(guardedAutoEnabled ? "Guarded Auto runtime disabled" : "Guarded Auto runtime enabled");
                      } catch (cause) {
                        toast(cause instanceof Error ? cause.message : "Guarded Auto flag update failed", true);
                      }
                    }}
                  >
                    {guardedAutoEnabled ? "Disable runtime" : "Enable runtime"}
                  </Button>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-line bg-surface-1">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-ink">Ordered rules</h2>
                  <p className="text-[11.5px] text-ink-muted">First matching rule wins after an explicit run override; policy rules take priority over workflow defaults.</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!catalog.length}
                  onClick={() =>
                    setRules((current) => [
                      ...current,
                      {
                        id: `rule-${Date.now()}`,
                        order: current.length,
                        taskType: "ENGINEERING",
                        modelId: defaultModelId || catalog[0]?.modelId,
                      },
                    ])
                  }
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add rule
                </Button>
              </div>
              {rules.length ? (
                <div className="space-y-2 p-4">
                  {rules.map((rule, index) => (
                    <div key={rule.id} className="grid items-center gap-2 rounded-lg border border-line bg-surface-2 p-3 md:grid-cols-[40px_1fr_1fr_1fr_1fr_1.2fr_36px]">
                      <span className="text-center font-mono text-xs text-ink-muted">{index + 1}</span>
                      <Select value={rule.operatingLane ?? "ANY"} onValueChange={(value) => setRules((current) => current.map((item) => item.id === rule.id ? { ...item, operatingLane: value === "ANY" ? undefined : value as OperatingLane } : item))}>
                        <SelectTrigger aria-label={`Rule ${index + 1} operating lane`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ANY">Any lane</SelectItem>
                          {OPERATING_LANES.map(({ lane, title }) => <SelectItem key={lane} value={lane}>{title}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={rule.taskType ?? "ANY"} onValueChange={(value) => setRules((current) => current.map((item) => item.id === rule.id ? { ...item, taskType: value === "ANY" ? undefined : value } : item))}>
                        <SelectTrigger aria-label={`Rule ${index + 1} task type`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ANY">Any task</SelectItem>
                          {TASK_TYPES.map((taskType) => <SelectItem key={taskType} value={taskType}>{taskType}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={rule.riskLevel ?? "ANY"} onValueChange={(value) => setRules((current) => current.map((item) => item.id === rule.id ? { ...item, riskLevel: value === "ANY" ? undefined : value as Risk } : item))}>
                        <SelectTrigger aria-label={`Rule ${index + 1} risk`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ANY">Any risk</SelectItem>
                          {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).map((riskLevel) => <SelectItem key={riskLevel} value={riskLevel}>{riskLevel}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={rule.complexity ?? "ANY"} onValueChange={(value) => setRules((current) => current.map((item) => item.id === rule.id ? { ...item, complexity: value === "ANY" ? undefined : value as Complexity } : item))}>
                        <SelectTrigger aria-label={`Rule ${index + 1} complexity`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ANY">Any size</SelectItem>
                          {(["SMALL", "STANDARD", "LARGE"] as const).map((complexity) => <SelectItem key={complexity} value={complexity}>{complexity}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={rule.modelId} onValueChange={(modelId) => setRules((current) => current.map((item) => item.id === rule.id ? { ...item, modelId } : item))}>
                        <SelectTrigger aria-label={`Rule ${index + 1} model route`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {catalog.map((model) => <SelectItem key={model._id} value={model.modelId}>{model.displayName}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setRules((current) => current.filter((item) => item.id !== rule.id))} aria-label="Remove rule">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-7 text-center text-[12.5px] text-ink-muted">No overrides. The workspace default and fallback chain apply.</p>
              )}
            </section>
          </div>

          <div className="space-y-4">
            <section className="rounded-lg border border-line bg-surface-1 p-4">
              <div className="mb-4 flex items-center gap-2">
                <Route className="h-4 w-4 text-accent" />
                <div>
                  <h2 className="text-sm font-semibold text-ink">Decision simulator</h2>
                  <p className="text-[11.5px] text-ink-muted">Read-only. Uses the same resolver as dispatch.</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <Field label="Operating lane" hint="The approved pool is evaluated before generic workflow defaults.">
                  <Select value={simLane} onValueChange={(value) => setSimLane(value as OperatingLane)}>
                    <SelectTrigger aria-label="Simulator operating lane"><SelectValue /></SelectTrigger>
                    <SelectContent>{OPERATING_LANES.map(({ lane, title }) => <SelectItem key={lane} value={lane}>{title}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Task type">
                  <Select value={simTaskType} onValueChange={setSimTaskType}>
                    <SelectTrigger aria-label="Simulator task type"><SelectValue /></SelectTrigger>
                    <SelectContent>{TASK_TYPES.map((taskType) => <SelectItem key={taskType} value={taskType}>{taskType}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Risk">
                  <Select value={simRisk} onValueChange={(value) => setSimRisk(value as Risk)}>
                    <SelectTrigger aria-label="Simulator risk"><SelectValue /></SelectTrigger>
                    <SelectContent>{(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Complexity">
                  <Select value={simComplexity} onValueChange={(value) => setSimComplexity(value as Complexity)}>
                    <SelectTrigger aria-label="Simulator complexity"><SelectValue /></SelectTrigger>
                    <SelectContent>{(["SMALL", "STANDARD", "LARGE"] as const).map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Workflow tier">
                  <Select value={simTier} onValueChange={(value) => setSimTier(value as Tier)}>
                    <SelectTrigger aria-label="Simulator workflow tier"><SelectValue /></SelectTrigger>
                    <SelectContent>{(["FAST", "BALANCED", "POWERFUL"] as const).map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Required capabilities">
                  <Input aria-label="Simulator required capabilities" value={simCapabilities} onChange={(event) => setSimCapabilities(event.target.value)} />
                </Field>
                <Field label="Budget remaining">
                  <Input aria-label="Simulator budget remaining" type="number" min="0" step="0.01" value={simBudget} onChange={(event) => setSimBudget(event.target.value)} placeholder="No request cap" />
                </Field>
              </div>
              <div className="mt-4 rounded-lg border border-line bg-surface-2 p-4">
                {result ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] uppercase tracking-[0.06em] text-ink-muted">Selected route</p>
                      <StatusBadge tone={result.status === "SELECTED" ? "success" : "error"}>{result.status}</StatusBadge>
                    </div>
                    <p className="mt-2 font-mono text-sm font-semibold text-ink">{result.selectedModelId ?? "No safe route"}</p>
                    <p className="mt-1 text-[12px] leading-5 text-ink-secondary">{result.explanation}</p>
                    <p className="mt-2 text-[11px] text-ink-muted">Source: {result.source} · Policy v{simulation.policyVersion}</p>
                    {simulation.laneTelemetry && (
                      <p className="mt-1 text-[11px] text-ink-muted">
                        Lane spend: ${simulation.laneTelemetry.dailySpendUsd.toFixed(2)} today · ${simulation.laneTelemetry.monthlySpendUsd.toFixed(2)} this month
                        {simulation.laneTelemetry.laneBudgetRemainingUsd != null ? ` · $${simulation.laneTelemetry.laneBudgetRemainingUsd.toFixed(2)} remaining` : ""}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[12px] text-ink-muted">Resolving…</p>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-line bg-surface-1">
              <div className="border-b border-line px-4 py-3">
                <h2 className="text-sm font-semibold text-ink">Routing decisions</h2>
                <p className="text-[11.5px] text-ink-muted">Immutable evidence from Work Order dispatch.</p>
              </div>
              {decisions.length ? (
                <div className="max-h-[520px] divide-y divide-line overflow-y-auto" tabIndex={0} aria-label="Recent immutable routing decisions">
                  {decisions.map((decision) => (
                    <div key={decision._id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-[12px] font-medium text-ink">{decision.selectedModelId ?? "No safe route"}</p>
                          <p className="text-[10.5px] text-ink-muted">{formatTime(decision.createdAt)} · v{decision.policyVersion}</p>
                          <p className="text-[10.5px] text-ink-muted">{decision.operatingLane ?? "EXECUTE"} lane · {decision.complexity ?? "STANDARD"} complexity · {decision.riskLevel} risk</p>
                        </div>
                        <StatusBadge tone={decision.mode === "ENFORCED" ? "success" : decision.mode === "EXHAUSTED" ? "error" : "neutral"}>{decision.mode}</StatusBadge>
                      </div>
                      <p className="mt-2 text-[11.5px] leading-5 text-ink-secondary">{decision.explanation}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-10 text-center">
                  <ShieldCheck className="mx-auto mb-2 h-5 w-5 text-ink-muted" />
                  <p className="text-[12.5px] text-ink-muted">No dispatch decisions recorded yet.</p>
                </div>
              )}
            </section>

            {enforcementEnabled && Number(canaryPercent) === 0 && (
              <div className="flex gap-2 rounded-lg border border-warn/30 bg-warn/5 p-3 text-[12px] text-ink-secondary">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                Enforcement is enabled, but the canary is 0%. Decisions remain in shadow mode until you activate a non-zero policy version.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
