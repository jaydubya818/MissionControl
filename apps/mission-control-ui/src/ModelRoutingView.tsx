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
  riskApproved: boolean;
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
    tone: "text-ink border-line bg-surface-2",
    use: "Architecture, decomposition, tradeoffs, and high-context planning.",
    boundary: "Use GPT-5.6 Sol for difficult architecture and high-context planning.",
  },
  {
    id: "execute",
    lane: "EXECUTE" as const,
    title: "Execute",
    model: "Approved execution pool",
    icon: Code2,
    tone: "text-ink border-line bg-surface-2",
    use: "Focused implementation tasks with a clear acceptance contract.",
    boundary: "Prefer Composer for bounded coding; escalate by complexity and tools.",
  },
  {
    id: "review",
    lane: "REVIEW" as const,
    title: "Review",
    model: "Approved reviewer pool",
    icon: ShieldCheck,
    tone: "text-ink border-line bg-surface-2",
    use: "Code review, risk analysis, verification, and release gates.",
    boundary: "Reserve Claude Opus for consequential, high-risk, or large reviews.",
  },
  {
    id: "local",
    lane: "LOCAL" as const,
    title: "Local",
    model: "Approved local pool",
    icon: Bot,
    tone: "text-ink border-line bg-surface-2",
    use: "QA, automation, documentation, classification, and small private tasks.",
    boundary: "Use only when the node is healthy and the policy rule is explicit.",
  },
  {
    id: "long-running",
    lane: "LONG_RUNNING" as const,
    title: "Long-running",
    model: "Approved cloud pool",
    icon: Cloud,
    tone: "text-ink border-line bg-surface-2",
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
                  className="mt-3 text-[10.5px] font-medium text-ink-secondary underline underline-offset-2 hover:text-ink"
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
  const initializeCatalog = useMutation(api.modelCatalog.initializeDefaults);
  const savePolicy = useMutation(api.modelRoutingPolicies.save);
  const setFlag = useMutation(api.featureFlags.setFlag);
  const { toast } = useToast();

  const [name, setName] = useState("Workspace routing policy");
  const [defaultModelId, setDefaultModelId] = useState("");
  const [safeFallbackModelId, setSafeFallbackModelId] = useState("");
  const [fallbackChain, setFallbackChain] = useState<string[]>([]);
  const [budgetLimit, setBudgetLimit] = useState("");
  const [canaryPercent, setCanaryPercent] = useState("0");
  const [killSwitch, setKillSwitch] = useState(false);
  const [rules, setRules] = useState<Rule[]>([]);
  const [lanePools, setLanePools] = useState<LanePool[]>([]);
  const [selectedLane, setSelectedLane] = useState<OperatingLane>("REVIEW");
  const [saving, setSaving] = useState(false);
  const [initializingCatalog, setInitializingCatalog] = useState(false);
  const [togglingEnforcement, setTogglingEnforcement] = useState(false);
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
    const available = catalog.filter((model) => !model.deprecated && model.availability !== "UNAVAILABLE");
    const balanced = available.find((model) => model.tier === "BALANCED") ?? available[0];
    if (!balanced) return;
    const powerful = available.find((model) => model.tier === "POWERFUL" && model.riskApproved) ?? balanced;
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

  async function toggleEnforcement() {
    setTogglingEnforcement(true);
    try {
      await setFlag({
        key: "model-routing.enabled",
        enabled: !enforcementEnabled,
        projectId,
      });
      toast(enforcementEnabled ? "Routing returned to shadow mode" : "Routing enforcement enabled");
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Unable to change routing enforcement", true);
    } finally {
      setTogglingEnforcement(false);
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

  if (!catalog || policy === undefined || decisions === undefined || enforcementEnabled === undefined) {
    return (
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-app">
        <PageHeader
          eyebrow="Settings"
          title="Model Routing"
          description="Choose models centrally, test decisions safely, and audit every dispatch route."
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
    const healthy = models.filter((model) => model?.availability === "HEALTHY" && !model.deprecated);
    if (!models.length) return [`${title} has no approved models`];
    if (!healthy.length) return [`${title} has no healthy approved model`];
    if (["PLAN", "REVIEW", "LONG_RUNNING"].includes(lane) && !healthy.some((model) => model?.tier === "POWERFUL")) return [`${title} has no powerful fallback`];
    return [];
  });

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-app">
      <PageHeader
        eyebrow="Settings"
        title="Model Routing"
        description="Choose models centrally, test decisions safely, and audit every dispatch route."
        status={
          enforcementEnabled ? (
            <StatusBadge tone={killSwitch ? "warning" : "success"}>
              {killSwitch ? "Kill switch active" : "Enforced"}
            </StatusBadge>
          ) : (
            <StatusBadge tone="neutral">Shadow mode</StatusBadge>
          )
        }
        actions={
          <Button
            size="sm"
            variant={enforcementEnabled ? "outline" : "default"}
            disabled={!policy || catalog.length === 0 || togglingEnforcement}
            onClick={toggleEnforcement}
          >
            {togglingEnforcement ? "Updating…" : enforcementEnabled ? "Use shadow mode" : "Enable enforcement"}
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-[1400px] gap-4 px-6 py-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]">
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
                </div>
                {catalog.length === 0 && (
                  <Button
                    size="sm"
                    disabled={initializingCatalog}
                    onClick={async () => {
                      setInitializingCatalog(true);
                      try {
                        const result = await initializeCatalog({ projectId });
                        toast(`Initialized ${result.created} model routes`);
                      } catch (cause) {
                        toast(cause instanceof Error ? cause.message : "Catalog initialization failed", true);
                      } finally {
                        setInitializingCatalog(false);
                      }
                    }}
                  >
                    {initializingCatalog ? "Initializing…" : "Initialize safe catalog"}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled
                  title="Requires a signed orchestration service connection"
                >
                  Managed local sync required
                </Button>
              </div>
              {catalog.length ? (
                <div className="overflow-x-auto" tabIndex={0} aria-label="Model provider catalog">
                  <table className="w-full min-w-[680px] text-left">
                    <thead className="bg-surface-2 text-[10.5px] uppercase tracking-[0.06em] text-ink-muted">
                      <tr>
                        <th className="px-4 py-2.5">Route</th>
                        <th className="px-3 py-2.5">Provider</th>
                        <th className="px-3 py-2.5">Tier</th>
                        <th className="px-3 py-2.5">Capabilities</th>
                        <th className="px-3 py-2.5">High-risk use</th>
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
                          <td className="px-3 py-3">
                            <StatusBadge tone={model.riskApproved ? "success" : "warning"}>
                              {model.riskApproved ? "Approved" : "Low / medium only"}
                            </StatusBadge>
                          </td>
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
                    <SelectTrigger aria-label="Workspace default model"><SelectValue placeholder="Select model route" /></SelectTrigger>
                    <SelectContent>
                      {catalog.filter((model) => !model.deprecated && model.availability !== "UNAVAILABLE").map((model) => <SelectItem key={model._id} value={model.modelId}>{model.displayName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Safe fallback">
                  <Select value={safeFallbackModelId} onValueChange={setSafeFallbackModelId}>
                    <SelectTrigger aria-label="Safe fallback model"><SelectValue placeholder="Select safe fallback" /></SelectTrigger>
                    <SelectContent>
                      {catalog.filter((model) => model.riskApproved && !model.deprecated).map((model) => (
                        <SelectItem key={model._id} value={model.modelId}>{model.displayName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Per-run budget cap" hint="Optional routing estimate cap in USD.">
                  <Input aria-label="Per-run budget cap" type="number" min="0" step="0.01" value={budgetLimit} onChange={(event) => setBudgetLimit(event.target.value)} placeholder="No cap" />
                </Field>
                <Field label="Fallback chain" hint="Comma-separated ordered model route IDs.">
                  <Input aria-label="Fallback model chain" value={fallbackChain.join(", ")} onChange={(event) => setFallbackChain(event.target.value.split(",").map((value) => value.trim()).filter(Boolean))} />
                </Field>
                <label className="flex items-center gap-2 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2.5 text-[12.5px] text-ink md:col-span-2">
                  <input type="checkbox" checked={killSwitch} onChange={(event) => setKillSwitch(event.target.checked)} />
                  Kill switch: keep existing runtime model selection and record the policy as bypassed
                </label>
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
                  disabled={!catalog.some((model) => !model.deprecated && model.availability !== "UNAVAILABLE")}
                  onClick={() =>
                    setRules((current) => [
                      ...current,
                      {
                        id: `rule-${Date.now()}`,
                        order: current.length,
                        taskType: "ENGINEERING",
                        modelId:
                          defaultModelId ||
                          catalog.find((model) => !model.deprecated && model.availability !== "UNAVAILABLE")?.modelId ||
                          "",
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
                        <SelectTrigger aria-label={`Rule ${index + 1} risk level`}><SelectValue /></SelectTrigger>
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
                        <SelectTrigger aria-label={`Rule ${index + 1} model`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {catalog.filter((model) => !model.deprecated && model.availability !== "UNAVAILABLE").map((model) => <SelectItem key={model._id} value={model.modelId}>{model.displayName}</SelectItem>)}
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
                <div className="max-h-[520px] divide-y divide-line overflow-y-auto" tabIndex={0} aria-label="Routing decision history">
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
