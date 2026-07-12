/**
 * Atlas Checkout demo narrative — typed fixtures for capabilities whose
 * backend pipelines are on the roadmap (Lineage v1, projections). Every
 * name/title matches the Convex seed (seedFactoryDemo, tag sf-demo) so
 * drill-downs land on real records. All objects carry provenance "demo"
 * and render a ProvenanceBadge. Replaced by adapters over real projections
 * without UI changes (see docs/software-factory/EOS-DEMO-NOTE.md).
 *
 * Story beats (Phase 12): mission with PCI constraints → planning → code
 * change → security approval → env-setup failure → PR → verification with
 * one waiver-pending criterion → cost attribution → friction detection →
 * bootstrap-skill recommendation → Factory Improvement → validated outcome.
 */

import type {
  AgentCapabilityProfile,
  EvidenceDossier,
  EffectivenessMetric,
  FactoryTrait,
  FrictionSummary,
  HealthSignal,
  Insight,
  LineageNode,
  MissionSummary,
  ReadinessAssessment,
  TraceSpanView,
} from "./types";

export const ATLAS = {
  mission: "Modernize Atlas Checkout",
  repo: "demo/atlas-checkout",
  workOrders: {
    applePay: "Enable Apple Pay in live payment config",
    pci: "PCI compliance evidence pack",
    fraud: "Fraud-screening vendor integration",
  },
  agents: {
    supervisor: "pi-supervisor-demo",
    executor: "hermes-executor-demo",
    coder: "demo-coder",
    qa: "demo-qa",
    security: "demo-security",
  },
  pr: { number: 214, url: "https://github.com/demo/atlas-checkout/pull/214" },
} as const;

export const demoHealthSignals: HealthSignal[] = [
  { id: "mission", label: "Mission health", status: "WATCH", trend: "flat", summary: "1 of 3 work orders blocked on approval", confidence: "high", provenance: "demo", evidence: [{ label: "work orders", count: 3, view: "missions" }], drillView: "missions" },
  { id: "factory", label: "Factory health", status: "HEALTHY", trend: "up", summary: "5 agents active · 1 quarantined", confidence: "high", provenance: "demo", evidence: [{ label: "agents", count: 8, view: "agent-catalog" }], drillView: "factory-health" },
  { id: "delivery", label: "Delivery confidence", status: "WATCH", trend: "up", summary: "PR #214 open · checks green", confidence: "moderate", provenance: "demo", evidence: [{ label: "trace", view: "trace-inspector" }], drillView: "trace-inspector" },
  { id: "verification", label: "Verification", status: "AT_RISK", trend: "flat", summary: "1 criterion awaiting waiver decision", confidence: "high", provenance: "demo", evidence: [{ label: "criteria", count: 4, view: "trace-inspector" }], drillView: "trace-inspector" },
  { id: "effectiveness", label: "AI effectiveness", status: "HEALTHY", trend: "up", summary: "Verified completion 78% (n=9)", confidence: "moderate", provenance: "demo", evidence: [{ label: "metrics", view: "effectiveness" }], drillView: "effectiveness" },
  { id: "readiness", label: "Environment readiness", status: "AT_RISK", trend: "down", summary: "Setup failures recurring in atlas-checkout", confidence: "high", provenance: "demo", evidence: [{ label: "friction events", count: 11, view: "friction" }], drillView: "readiness" },
];

export const demoInsights: Insight[] = [
  {
    id: "bootstrap-skill",
    observed: "Repository setup failures are increasing in demo/atlas-checkout.",
    evidence: [
      { label: "affected runs", count: 11, view: "friction" },
      { label: "work orders", count: 5, view: "missions" },
      { label: "agent versions", count: 3, view: "agent-catalog" },
    ],
    impact: "Median completion time +18% · token usage +14% · 2 human interventions",
    confidence: "high",
    action: "Draft bootstrap skill",
    provenance: "demo",
    drillView: "readiness",
  },
  {
    id: "gate-review",
    observed: "Second approval gate on low-risk changes adds latency without denials.",
    evidence: [
      { label: "approvals sampled", count: 24, view: "dossier" },
      { label: "median wait", view: "dossier", detail: "4.2h" },
    ],
    impact: "Median low-risk cycle time +4.2h · 0 denials in sample window",
    confidence: "moderate",
    action: "Open evidence dossier",
    provenance: "demo",
    drillView: "dossier",
  },
];

export const demoMission: MissionSummary = {
  id: "mission-atlas",
  name: ATLAS.mission,
  objective: "Modernize checkout delivery while preserving payment reliability and PCI compliance.",
  owner: "Jay West",
  priority: "P1",
  state: "ACTIVE",
  health: "WATCH",
  confidence: "moderate",
  progressPct: 62,
  plannedBudgetUsd: 25,
  actualCostUsd: 8.35,
  workOrderTitles: [ATLAS.workOrders.applePay, ATLAS.workOrders.pci, ATLAS.workOrders.fraud],
  deliveryRisk: "PCI evidence pack blocked pending Q3 audit-window approval",
  nextMilestone: "Apple Pay verification complete",
  provenance: "demo",
};

export const demoLineage: LineageNode[] = [
  { kind: "MISSION", id: "mission-atlas", label: ATLAS.mission, status: "ACTIVE", provenance: "demo", drillView: "missions" },
  { kind: "WORK_ORDER", id: "wo-applepay", label: ATLAS.workOrders.applePay, status: "AWAITING_VERIFICATION", provenance: "convex", drillView: "tasks" },
  { kind: "RUN", id: "run-12", label: "Execution run · claude-opus-4.8", status: "COMPLETED", detail: "$1.62 · 14 tool calls", provenance: "convex", drillView: "trace-inspector" },
  { kind: "APPROVAL", id: "appr-red", label: "Security policy approval (RED, dual-control)", status: "APPROVED 2/2", provenance: "convex", drillView: "audit" },
  { kind: "PULL_REQUEST", id: "pr-214", label: `PR #${ATLAS.pr.number} — Apple Pay live config`, status: "OPEN · checks passing", provenance: "demo", drillView: "trace-inspector" },
  { kind: "VERIFICATION", id: "ver-1", label: "3 of 4 criteria PASSED · 1 awaiting waiver", status: "AT_RISK", provenance: "demo", drillView: "trace-inspector" },
  { kind: "COST", id: "cost-1", label: "Attributed cost $3.41", detail: "3 runs on this work order", provenance: "projected", drillView: "effectiveness" },
  { kind: "OUTCOME", id: "out-1", label: "Validated outcome: Apple Pay live in staging", status: "PENDING VERIFICATION", provenance: "demo" },
  { kind: "LEARNING", id: "learn-1", label: "Candidate: payment-config bootstrap steps", status: "PROPOSED", provenance: "demo", drillView: "skills" },
];

export const demoTraceSpans: TraceSpanView[] = [
  { spanId: "s1", label: "Plan: decompose Apple Pay enablement", kind: "PLAN", status: "OK", startedAtOffsetMs: 0, durationMs: 210_000, costUsd: 0.22, detail: "pi-supervisor-demo → 3 steps" },
  { spanId: "s2", parentSpanId: "s1", label: "read payment-config module", kind: "TOOL", status: "OK", startedAtOffsetMs: 240_000, durationMs: 8_000 },
  { spanId: "s3", parentSpanId: "s1", label: "env setup: install deps", kind: "TOOL", status: "FAILED", startedAtOffsetMs: 260_000, durationMs: 96_000, detail: "missing bootstrap step — undocumented pnpm config" },
  { spanId: "s4", parentSpanId: "s1", label: "retry env setup", kind: "RETRY", status: "OK", startedAtOffsetMs: 380_000, durationMs: 64_000, detail: "manual hint applied (human intervention)" },
  { spanId: "s5", parentSpanId: "s1", label: "edit: enable applepay flag + config", kind: "TOOL", status: "OK", startedAtOffsetMs: 470_000, durationMs: 31_000 },
  { spanId: "s6", parentSpanId: "s1", label: "security policy check → RED approval", kind: "APPROVAL", status: "OK", startedAtOffsetMs: 520_000, durationMs: 5_400_000, detail: "dual control 2/2 approved" },
  { spanId: "s7", parentSpanId: "s1", label: "tests: payment integration suite", kind: "TEST", status: "OK", startedAtOffsetMs: 6_000_000, durationMs: 420_000 },
  { spanId: "s8", parentSpanId: "s1", label: `commit + PR #${ATLAS.pr.number}`, kind: "COMMIT", status: "OK", startedAtOffsetMs: 6_500_000, durationMs: 45_000 },
  { spanId: "s9", parentSpanId: "s1", label: "verification: 4 acceptance criteria", kind: "VERIFY", status: "WAIVED", startedAtOffsetMs: 6_600_000, durationMs: 300_000, detail: "3 PASSED · 1 awaiting human waiver (sandbox-only PCI scan)" },
];

export const demoEffectiveness: EffectivenessMetric[] = [
  { id: "verified", label: "Verified completion", definition: "Work orders reaching DONE through criteria verification / claimed", value: 78, unit: "%", sampleSize: 9, minSampleSize: 5, periodDays: 30, trend: "up", provenance: "demo", groupBy: { "feature-dev": 83, "bug-fix": 71 }, drillView: "tasks", misuseNote: "Gameable via weak criteria — read with evidence completeness." },
  { id: "autonomous", label: "Autonomous completion", definition: "DONE with zero human interventions / DONE", value: 56, unit: "%", sampleSize: 9, minSampleSize: 5, periodDays: 30, trend: "flat", provenance: "demo", drillView: "trace-inspector", misuseNote: "Autonomy is not success — always read beside rescue rate." },
  { id: "rescue", label: "Human rescue rate", definition: "Runs recovered by human intervention after failure / runs", value: 13, unit: "%", sampleSize: 15, minSampleSize: 10, periodDays: 30, trend: "down", provenance: "demo", drillView: "friction", misuseNote: "Falling rescue with falling completion means abandonment, not improvement." },
  { id: "retries", label: "Retry rate", definition: "Step retries / steps executed", value: 11, unit: "%", sampleSize: 38, minSampleSize: 20, periodDays: 30, trend: "down", provenance: "demo", drillView: "friction", misuseNote: "Some retries are healthy exploration." },
  { id: "cpvo", label: "Cost per validated outcome", definition: "Σ attributed cost of DONE work orders / count", value: 1.67, unit: "usd", sampleSize: 5, minSampleSize: 5, periodDays: 30, trend: "down", provenance: "demo", drillView: "effectiveness", misuseNote: "Excludes exploratory work by design." },
  { id: "evidence", label: "Evidence completeness", definition: "Criteria with recorded evidence / criteria on DONE work orders", value: 92, unit: "%", sampleSize: 24, minSampleSize: 1, periodDays: 30, trend: "up", provenance: "demo", drillView: "trace-inspector", misuseNote: "—" },
  { id: "rework", label: "Rework rate", definition: "Work orders reopened or superseded / DONE", value: null, unit: "%", sampleSize: 2, minSampleSize: 10, periodDays: 30, trend: "flat", provenance: "insufficient", drillView: "tasks", misuseNote: "Requires revision history at n≥10." },
];

export const demoFriction: FrictionSummary[] = [
  { category: "env-setup-failure", label: "Environment setup failures", incidents: 11, affectedRepos: [ATLAS.repo], affectedWorkflows: ["feature-dev"], estCostUsd: 1.4, wastedMinutes: 96, trend: "up", representativeTrace: { label: "run-12 span s3", view: "trace-inspector" }, recommendation: "Create validated repository bootstrap skill", provenance: "demo" },
  { category: "approval-latency", label: "Approval latency", incidents: 6, affectedRepos: [ATLAS.repo], affectedWorkflows: ["feature-dev", "security-audit"], estCostUsd: 0, wastedMinutes: 540, trend: "flat", representativeTrace: { label: "RED approval s6", view: "trace-inspector" }, recommendation: "Review second gate for low-risk changes (see dossier)", provenance: "demo" },
  { category: "permission-denial", label: "Permission denials", incidents: 1, affectedRepos: [ATLAS.repo], affectedWorkflows: ["feature-dev"], estCostUsd: 0.1, wastedMinutes: 12, trend: "flat", representativeTrace: { label: "DENIED tool call (RED)", view: "audit" }, recommendation: "Policy behaving as designed — no action", provenance: "demo" },
  { category: "flaky-test", label: "Flaky tests", incidents: 3, affectedRepos: [ATLAS.repo], affectedWorkflows: ["feature-dev"], estCostUsd: 0.3, wastedMinutes: 41, trend: "down", representativeTrace: { label: "payment integration suite", view: "trace-inspector" }, recommendation: "Quarantine payment-sandbox test; open fix work order", provenance: "demo" },
];

export const demoTraits: FactoryTrait[] = [
  { id: "decision-speed", label: "Decision speed", definition: "Approval request → final decision latency", p25: 0.4, p50: 3.8, p75: 9.1, unit: "hours", windowLabel: "Last quarter", trend: "flat", evidence: [{ label: "approvals", count: 24, view: "audit" }], provenance: "demo" },
  { id: "verification-rigor", label: "Verification rigor", definition: "Acceptance criteria with evidence per DONE work order", p25: 2, p50: 4, p75: 5, unit: "criteria", windowLabel: "Last quarter", trend: "up", evidence: [{ label: "criteria", count: 24, view: "trace-inspector" }], provenance: "demo" },
  { id: "risk-tolerance", label: "Risk tolerance", definition: "Share of work classified YELLOW/RED", p25: 18, p50: 26, p75: 34, unit: "%", windowLabel: "Last quarter", trend: "flat", evidence: [{ label: "work orders", count: 9, view: "tasks" }], provenance: "demo" },
  { id: "automation-maturity", label: "Automation maturity", definition: "Autonomous completion share", p25: 41, p50: 56, p75: 63, unit: "%", windowLabel: "Last quarter", trend: "up", evidence: [{ label: "runs", count: 15, view: "effectiveness" }], provenance: "demo" },
  { id: "knowledge-reuse", label: "Knowledge reuse", definition: "Runs using governed context packages", p25: 55, p50: 71, p75: 84, unit: "%", windowLabel: "Last quarter", trend: "up", evidence: [{ label: "packages", count: 15, view: "skills" }], provenance: "demo" },
];

export const demoCapabilities: AgentCapabilityProfile[] = [
  {
    agentName: ATLAS.agents.executor, role: "Implementation", version: "0.18.2",
    skills: ["mission-control-task-lifecycle", "mission-control-run-logging", "mission-control-submit-deliverable"],
    taskSpecializations: [
      { taskType: "feature-dev", verifiedCompletionPct: 82, costP50Usd: 1.4, sampleSize: 7 },
      { taskType: "bug-fix", verifiedCompletionPct: null, costP50Usd: null, sampleSize: 2 },
    ],
    trustComponents: [
      { label: "Policy compliance", value: "no violations (30d)" },
      { label: "Evidence quality", value: "92% criteria evidenced" },
      { label: "Budget discipline", value: "0 overruns" },
    ],
    currentAssignment: ATLAS.workOrders.applePay,
    policyLimits: ["RED requires dual approval", "$0.75/run cap", "worktree isolation required"],
    provenance: "demo",
  },
  {
    agentName: ATLAS.agents.security, role: "Security review", version: "1.2.0",
    skills: ["mission-control-request-approval"],
    taskSpecializations: [{ taskType: "security-audit", verifiedCompletionPct: null, costP50Usd: null, sampleSize: 3 }],
    trustComponents: [{ label: "Status", value: "QUARANTINED — sandbox credential expiry" }],
    currentAssignment: undefined,
    policyLimits: ["quarantined: no new claims"],
    provenance: "demo",
  },
];

export const demoDossier: EvidenceDossier = {
  question: "Should we remove the second approval gate for low-risk repository changes?",
  preparedFor: "Engineering lead",
  evidence: [
    { heading: "Approval latency", body: "Median 4.2h added per low-risk change; p75 9.1h. 24 approvals sampled over 30 days.", refs: [{ label: "approvals", count: 24, view: "audit" }] },
    { heading: "Denial and override rates", body: "0 denials on low-risk second gates in sample; 2 conditional approvals, both on YELLOW-risk items outside this cohort.", refs: [{ label: "decision chain", view: "audit" }] },
    { heading: "Incident correlation", body: "No incidents traced to low-risk changes in window; 1 incident traced to a RED change that passed both gates (gate not causal).", refs: [{ label: "incidents", count: 1, view: "friction" }] },
    { heading: "Cost impact", body: "Gate wait dominates cycle time on 6 of 9 demo work orders; direct token cost of the gate ≈ $0.", refs: [{ label: "friction: approval latency", view: "friction" }] },
  ],
  assumptions: ["30-day sample is representative", "risk classifier correctly labels low-risk changes", "sample excludes production-touching paths by policy"],
  alternatives: ["Keep gate, add 2h SLA with auto-escalation", "Ring-scoped removal: pilot on 2 low-risk repos via rollout rings, measure incident delta (factory experiments on itself)", "Replace human second gate with deterministic verification receipt requirement"],
  confidence: "moderate",
  provenance: "demo",
};

export const demoReadiness: ReadinessAssessment[] = [
  {
    repoSlug: ATLAS.repo,
    state: "AT_RISK",
    dimensions: [
      { id: "docs", label: "Documentation", score: 61 },
      { id: "setup", label: "Setup reproducibility", score: 38, note: "undocumented pnpm config; 11 failures" },
      { id: "tests", label: "Test maturity", score: 74 },
      { id: "ci", label: "CI reliability", score: 88 },
      { id: "tools", label: "Tool access", score: 92 },
      { id: "verify", label: "Verification speed", score: 66 },
    ],
    recurringFriction: ["env-setup-failure", "flaky-test"],
    recommendations: [demoInsights[0]],
    provenance: "demo",
  },
  {
    repoSlug: "jaydubya818/MissionControl",
    state: "HEALTHY",
    dimensions: [
      { id: "docs", label: "Documentation", score: 90, note: "contracts + style guide + runbooks" },
      { id: "setup", label: "Setup reproducibility", score: 82 },
      { id: "tests", label: "Test maturity", score: 78, note: "460+ tests; UI suite young" },
      { id: "ci", label: "CI reliability", score: 85 },
      { id: "tools", label: "Tool access", score: 95 },
      { id: "verify", label: "Verification speed", score: 80 },
    ],
    recurringFriction: [],
    recommendations: [],
    provenance: "projected",
  },
];
