/**
 * Maps Convex eos/projections query results to EOS UI types (demoData shapes).
 */

import type {
  EffectivenessMetric,
  FactoryTrait,
  FrictionSummary,
  HealthSignal,
  Insight,
  MissionSummary,
  ReadinessAssessment,
} from "./types";

type LiveEffectiveness = {
  id: string;
  label: string;
  value: number;
  unit: string;
  trend: "up" | "down" | "flat";
  periodLabel: string;
  provenance: EffectivenessMetric["provenance"];
  drillView: string;
};

type LiveFriction = {
  category: string;
  label: string;
  incidents: number;
  medianDelayMin: number;
  provenance: FrictionSummary["provenance"];
  drillView: string;
};

type LiveReadiness = {
  repoSlug: string;
  score: number;
  dimensions: Array<{ id: string; label: string; status: string; detail: string }>;
  provenance: ReadinessAssessment["provenance"];
  drillView: string;
};

type LiveTrait = {
  id: string;
  label: string;
  unit: string;
  p25: number;
  p50: number;
  p75: number;
  provenance: FactoryTrait["provenance"];
  drillView: string;
};

const FRICTION_CATEGORIES = new Set<FrictionSummary["category"]>([
  "excessive-retry",
  "flaky-test",
  "loop-detected",
  "approval-latency",
  "permission-denial",
  "env-setup-failure",
  "tool-unavailable",
  "stuck-run",
  "budget-exhaustion",
]);

function normalizeFrictionCategory(raw: string): FrictionSummary["category"] {
  if (raw === "run-failure") return "stuck-run";
  if (FRICTION_CATEGORIES.has(raw as FrictionSummary["category"])) {
    return raw as FrictionSummary["category"];
  }
  return "stuck-run";
}

function readinessState(score: number): ReadinessAssessment["state"] {
  if (score >= 80) return "HEALTHY";
  if (score >= 60) return "WATCH";
  if (score >= 40) return "AT_RISK";
  return "CRITICAL";
}

function dimensionScore(status: string): number | null {
  if (status === "PASS") return 85;
  if (status === "WARN") return 55;
  if (status === "FAIL") return 25;
  return null;
}

export function adaptHealthSignals(rows: HealthSignal[]): HealthSignal[] {
  return rows;
}

export function adaptFactoryTraits(rows: LiveTrait[]): FactoryTrait[] {
  return rows.map((trait) => ({
    id: trait.id,
    label: trait.label,
    definition: `Distribution of ${trait.label.toLowerCase()} over the last 90 days.`,
    p25: trait.p25,
    p50: trait.p50,
    p75: trait.p75,
    unit: trait.unit,
    windowLabel: "90d window",
    trend: "flat" as const,
    evidence: [{ label: "Inspect runs", view: trait.drillView }],
    provenance: trait.provenance,
  }));
}

export function adaptEffectivenessMetrics(rows: LiveEffectiveness[]): EffectivenessMetric[] {
  return rows.map((row) => {
    const unit = row.unit === "USD" ? ("usd" as const) : row.unit === "%" ? ("%" as const) : ("count" as const);
    const insufficient = row.provenance === "insufficient";
    return {
      id: row.id,
      label: row.label,
      definition: `${row.label} derived from work orders and workflow runs.`,
      value: insufficient ? null : row.value,
      unit,
      sampleSize: insufficient ? 1 : 10,
      minSampleSize: 10,
      periodDays: 90,
      trend: row.trend,
      provenance: row.provenance,
      drillView: row.drillView,
      misuseNote: row.id === "cpvo" ? "Compare only within the same mission scope." : "—",
    };
  });
}

export function adaptFrictionSummary(rows: LiveFriction[]): FrictionSummary[] {
  return rows.map((row) => ({
    category: normalizeFrictionCategory(row.category),
    label: row.label,
    incidents: row.incidents,
    affectedRepos: ["jaydubya818/MissionControl"],
    affectedWorkflows: ["factory-pi-execute-verify", "factory-intake"],
    estCostUsd: row.incidents * 12.5,
    wastedMinutes: row.medianDelayMin * row.incidents,
    trend: row.incidents > 0 ? ("up" as const) : ("flat" as const),
    representativeTrace: { label: "Open trace", view: row.drillView },
    recommendation:
      row.incidents > 0
        ? `Review ${row.label.toLowerCase()} — ${row.incidents} incident(s) in the last 30 days.`
        : "No incidents in window — keep monitoring.",
    provenance: row.provenance,
  }));
}

export function adaptReadinessAssessments(rows: LiveReadiness[]): ReadinessAssessment[] {
  return rows.map((row) => ({
    repoSlug: row.repoSlug,
    state: readinessState(row.score),
    dimensions: row.dimensions.map((d) => ({
      id: d.id,
      label: d.label,
      score: dimensionScore(d.status),
      note: d.detail,
    })),
    recurringFriction: row.score < 70 ? ["Stale context installs", "PR check variance"] : [],
    recommendations: [],
    provenance: row.provenance,
  }));
}

export function adaptRecommendations(rows: Insight[]): Insight[] {
  return rows.map((row) => ({
    ...row,
    drillView: row.drillView ?? "recommendations",
  }));
}

export function adaptMissionSummaries(rows: MissionSummary[]): MissionSummary[] {
  return rows.map((row) => ({
    ...row,
    deliveryRisk: row.deliveryRisk ?? "On track",
    nextMilestone: row.nextMilestone ?? "Next work order in queue",
  }));
}
