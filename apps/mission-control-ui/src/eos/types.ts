/**
 * EOS demo type system (flag: eos.command-center-preview).
 *
 * Every non-Convex datum carries Provenance and renders a ProvenanceBadge —
 * the UI never presents seeded projections as measured fact (EOS principle:
 * honest absence beats invented data). Adapters compose Convex queries with
 * typed demo fixtures behind these interfaces so Lineage v1 / projections
 * can replace fixtures without UI redesign.
 */

export type Provenance =
  | "convex" // authoritative backend data
  | "demo" // seeded demo projection (labeled "Demo data")
  | "preview" // real shape, future pipeline ("Preview")
  | "projected" // derived client-side from real data ("Projected")
  | "insufficient" // honest absence ("Insufficient evidence")
  | "disconnected"; // integration absent ("Not yet connected")

export type HealthStatus = "HEALTHY" | "WATCH" | "AT_RISK" | "CRITICAL" | "INSUFFICIENT_EVIDENCE";
export type Trend = "up" | "down" | "flat";
export type Confidence = "high" | "moderate" | "low";

export interface EvidenceReference {
  label: string;
  count?: number;
  /** MainView id the drill-down navigates to */
  view: string;
  detail?: string;
}

export interface HealthSignal {
  id: string;
  label: string;
  status: HealthStatus;
  trend: Trend;
  summary: string;
  confidence: Confidence;
  provenance: Provenance;
  evidence: EvidenceReference[];
  drillView: string;
}

export interface Insight {
  id: string;
  observed: string;
  evidence: EvidenceReference[];
  impact: string;
  confidence: Confidence;
  action: string;
  provenance: Provenance;
  drillView: string;
}

export interface MissionSummary {
  id: string;
  name: string;
  objective: string;
  owner: string;
  priority: "P1" | "P2" | "P3";
  state: "ACTIVE" | "AT_RISK" | "BLOCKED" | "VALIDATED";
  health: HealthStatus;
  confidence: Confidence;
  progressPct: number;
  plannedBudgetUsd: number;
  actualCostUsd: number;
  workOrderTitles: string[];
  deliveryRisk: string;
  nextMilestone: string;
  provenance: Provenance;
}

export interface LineageNode {
  kind:
    | "MISSION"
    | "WORK_ORDER"
    | "RUN"
    | "AGENT_SESSION"
    | "TOOL_CALL"
    | "ARTIFACT"
    | "PULL_REQUEST"
    | "VERIFICATION"
    | "APPROVAL"
    | "COST"
    | "OUTCOME"
    | "LEARNING";
  id: string;
  label: string;
  status?: string;
  detail?: string;
  provenance: Provenance;
  drillView?: string;
}

export interface TraceSpanView {
  spanId: string;
  parentSpanId?: string;
  label: string;
  kind: "PLAN" | "TOOL" | "TEST" | "COMMIT" | "APPROVAL" | "VERIFY" | "RETRY" | "INTERVENTION";
  status: "OK" | "FAILED" | "DENIED" | "RETRIED" | "WAIVED";
  startedAtOffsetMs: number;
  durationMs: number;
  costUsd?: number;
  detail?: string;
  evidence?: EvidenceReference;
}

export interface EffectivenessMetric {
  id: string;
  label: string;
  definition: string;
  value: number | null; // null → insufficient evidence
  unit: "%" | "usd" | "count" | "ratio";
  sampleSize: number;
  minSampleSize: number;
  periodDays: number;
  trend: Trend;
  provenance: Provenance;
  groupBy?: Record<string, number | null>;
  drillView: string;
  misuseNote: string;
}

export interface FrictionSummary {
  category:
    | "excessive-retry"
    | "flaky-test"
    | "loop-detected"
    | "approval-latency"
    | "permission-denial"
    | "env-setup-failure"
    | "tool-unavailable"
    | "stuck-run"
    | "budget-exhaustion";
  label: string;
  incidents: number;
  affectedRepos: string[];
  affectedWorkflows: string[];
  estCostUsd: number;
  wastedMinutes: number;
  trend: Trend;
  representativeTrace: EvidenceReference;
  recommendation: string;
  provenance: Provenance;
}

export interface AgentCapabilityProfile {
  agentName: string;
  role: string;
  version: string;
  skills: string[];
  taskSpecializations: Array<{
    taskType: string;
    verifiedCompletionPct: number | null;
    costP50Usd: number | null;
    sampleSize: number;
  }>;
  trustComponents: Array<{ label: string; value: string }>;
  currentAssignment?: string;
  policyLimits: string[];
  provenance: Provenance;
}

export interface FactoryTrait {
  id: string;
  label: string;
  definition: string;
  /** distribution rendered as range, never a single vanity number */
  p25: number;
  p50: number;
  p75: number;
  unit: string;
  windowLabel: string;
  trend: Trend;
  evidence: EvidenceReference[];
  provenance: Provenance;
}

export interface EvidenceDossier {
  question: string;
  preparedFor: string;
  evidence: Array<{ heading: string; body: string; refs: EvidenceReference[] }>;
  assumptions: string[];
  alternatives: string[];
  confidence: Confidence;
  provenance: Provenance;
}

export interface ReadinessAssessment {
  repoSlug: string;
  state: HealthStatus;
  dimensions: Array<{ id: string; label: string; score: number | null; note?: string }>;
  recurringFriction: string[];
  recommendations: Insight[];
  provenance: Provenance;
}
