/**
 * Mission Control — Control Plane data model (UI contract).
 *
 * This is the proposed runtime-agnostic protocol for orchestrating epics,
 * stories, agents, branches, approvals, and safeguards across Loom, PI,
 * Hermes, OpenClaw, Claude Code, Cursor, Codex, and future runtimes.
 *
 * Today these types are fed by demo data (`demoData.ts`) merged with live
 * Convex queries where they exist (tasks, agents, approvals, alerts).
 * The intended backend mapping is documented per type.
 */

// ─── Risk & autonomy ────────────────────────────────────────────────────────

/** Backend mapping: extends policy-engine GREEN/YELLOW/RED with CRITICAL. */
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type AutonomyLevel =
  | "MANUAL" // agent only suggests actions
  | "ASSISTED" // agent drafts, human approves execution
  | "GUIDED" // agent codes/tests, approval needed for risky actions
  | "FULL" // agent plans/codes/tests/reviews/opens PR
  | "PROD_GUARDED" // full, except deploys/destructive/prod data/secrets/infra
  | "SANDBOX"; // unrestricted, isolated environments only

export const AUTONOMY_LEVELS: AutonomyLevel[] = [
  "MANUAL",
  "ASSISTED",
  "GUIDED",
  "FULL",
  "PROD_GUARDED",
  "SANDBOX",
];

export const AUTONOMY_LABELS: Record<AutonomyLevel, string> = {
  MANUAL: "Manual",
  ASSISTED: "Assisted",
  GUIDED: "Guided",
  FULL: "Full",
  PROD_GUARDED: "Prod Guarded",
  SANDBOX: "Sandbox",
};

export type PermissionCategory =
  | "CODE_EDITS"
  | "SHELL_COMMANDS"
  | "DEPENDENCY_CHANGES"
  | "DB_MIGRATIONS"
  | "FEATURE_FLAGS"
  | "INFRA_TERRAFORM"
  | "SECRETS_CONFIG"
  | "EXTERNAL_API_CALLS"
  | "PRODUCTION_DATA"
  | "PR_CREATION"
  | "PR_MERGE"
  | "DEPLOYMENTS";

export const PERMISSION_CATEGORIES: { id: PermissionCategory; label: string; baseRisk: RiskLevel }[] = [
  { id: "CODE_EDITS", label: "Code edits", baseRisk: "LOW" },
  { id: "SHELL_COMMANDS", label: "Shell commands", baseRisk: "MEDIUM" },
  { id: "DEPENDENCY_CHANGES", label: "Dependency changes", baseRisk: "MEDIUM" },
  { id: "DB_MIGRATIONS", label: "Database migrations", baseRisk: "CRITICAL" },
  { id: "FEATURE_FLAGS", label: "Feature flags", baseRisk: "MEDIUM" },
  { id: "INFRA_TERRAFORM", label: "Infra / Terraform", baseRisk: "CRITICAL" },
  { id: "SECRETS_CONFIG", label: "Secrets / config", baseRisk: "CRITICAL" },
  { id: "EXTERNAL_API_CALLS", label: "External API calls", baseRisk: "MEDIUM" },
  { id: "PRODUCTION_DATA", label: "Production data", baseRisk: "CRITICAL" },
  { id: "PR_CREATION", label: "PR creation", baseRisk: "LOW" },
  { id: "PR_MERGE", label: "PR merge", baseRisk: "HIGH" },
  { id: "DEPLOYMENTS", label: "Deployments", baseRisk: "CRITICAL" },
];

// ─── Multi-runtime agent registry ───────────────────────────────────────────

export type AgentRuntime =
  | "LOOM"
  | "PI"
  | "HERMES"
  | "OPENCLAW"
  | "CLAUDE_CODE"
  | "CURSOR"
  | "CODEX"
  | "CONVEX_NATIVE";

/** Common status protocol — every runtime adapter maps its states into these. */
export type AgentRunState =
  | "PLANNING"
  | "CODING"
  | "TESTING"
  | "REVIEWING"
  | "BLOCKED"
  | "WAITING" // waiting on human / approval
  | "FAILED"
  | "COMPLETED"
  | "PAUSED"
  | "IDLE";

/** Backend mapping: `agents` table + ARM `agentInstances` + runtime adapters. */
export interface FleetAgent {
  id: string;
  name: string;
  runtime: AgentRuntime;
  state: AgentRunState;
  currentTask: string | null;
  epicKey: string | null;
  startedAt: number | null; // epoch ms — runtime duration derived
  branch: string | null;
  worktree: string | null;
  model: string;
  provider: string;
  tokensUsed: number;
  costUsd: number;
  riskLevel: RiskLevel;
  autonomy: AutonomyLevel;
  lastAction: string;
  nextAction: string | null;
  confidence: number; // 0-100
}

export type FleetCommand =
  | "PAUSE"
  | "RESUME"
  | "KILL"
  | "RETRY"
  | "REASSIGN"
  | "EXPLAIN"
  | "FORCE_REVIEW"
  | "PROMOTE_TO_PR"
  | "CHANGE_AUTONOMY";

// ─── Epics, stories, quality gates ──────────────────────────────────────────

export type EpicHealth =
  | "ON_TRACK"
  | "AT_RISK"
  | "BLOCKED"
  | "WAITING_ON_HUMAN"
  | "FAILED"
  | "READY_TO_MERGE";

export const EPIC_HEALTH_LABELS: Record<EpicHealth, string> = {
  ON_TRACK: "On track",
  AT_RISK: "At risk",
  BLOCKED: "Blocked",
  WAITING_ON_HUMAN: "Waiting on human",
  FAILED: "Failed",
  READY_TO_MERGE: "Ready to merge",
};

export type StoryStatus =
  | "BACKLOG"
  | "IN_PROGRESS"
  | "IN_REVIEW"
  | "NEEDS_APPROVAL"
  | "BLOCKED"
  | "DONE";

export type GateStatus = "PASS" | "FAIL" | "PENDING" | "SKIPPED";

export interface QualityGate {
  id: string;
  label: string;
  status: GateStatus;
  detail?: string;
}

/** Backend mapping: `tasks` with parentTaskId; gates from qcRuns + CI. */
export interface Story {
  id: string;
  key: string;
  title: string;
  status: StoryStatus;
  agentId: string | null;
  branch: string | null;
  prNumber: number | null;
  prStatus: "OPEN" | "DRAFT" | "MERGED" | "CLOSED" | null;
  riskLevel: RiskLevel;
  gates: QualityGate[];
  blockedReason?: string;
}

// ─── Branch topology ────────────────────────────────────────────────────────

export type BranchKind = "EPIC" | "STORY" | "WORKTREE" | "PR" | "MERGE_TARGET";
export type CheckStatus = "PASS" | "FAIL" | "RUNNING" | "NONE";

export interface BranchNode {
  name: string;
  kind: BranchKind;
  parent: string | null;
  agentId: string | null;
  commitCount: number;
  driftFromMain: number; // commits behind main
  testStatus: CheckStatus;
  reviewStatus: "APPROVED" | "CHANGES_REQUESTED" | "PENDING" | "NONE";
  conflict: boolean;
}

// ─── Decisions & approvals ──────────────────────────────────────────────────

export type DecisionType =
  | "ARCHITECTURE"
  | "PRODUCT"
  | "TEST"
  | "SECURITY"
  | "SCOPE"
  | "DEPENDENCY"
  | "PROCESS";

/** Backend mapping: `activities` + ARM `changeRecords`/`decisionRecords`. */
export interface DecisionEntry {
  id: string;
  title: string;
  type: DecisionType;
  context: string;
  reasoning: string;
  decidedBy: "AGENT" | "HUMAN";
  approver: string | null;
  filesImpacted: string[];
  riskLevel: RiskLevel;
  timestamp: number;
  outcome: "APPLIED" | "REVERTED" | "PENDING" | "REJECTED";
}

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "MODIFIED" | "ESCALATED";

/** Backend mapping: `approvals` table, enriched with blast radius + rollback. */
export interface ApprovalRequest {
  id: string;
  epicKey: string | null;
  agentId: string;
  agentName: string;
  category: PermissionCategory;
  action: string; // what the agent wants to do
  reason: string; // why it wants to do it
  affected: string[]; // files / systems
  riskLevel: RiskLevel;
  blastRadius: "FILE" | "MODULE" | "SERVICE" | "SYSTEM" | "PRODUCTION";
  rollbackPlan: string;
  recommendation: "APPROVE" | "REJECT" | "REVIEW_CAREFULLY";
  status: ApprovalStatus;
  requestedAt: number;
}

// ─── Epic aggregate ─────────────────────────────────────────────────────────

export interface TimelineEvent {
  ts: number;
  label: string;
  kind: "STATE" | "AGENT" | "PR" | "APPROVAL" | "BLOCKER" | "DECISION";
}

/**
 * Backend mapping (proposed): new `epics` table, or `goals` rows of a new
 * EPIC kind, with tasks linked via goalId. Stories = tasks with parentTaskId.
 */
export interface Epic {
  id: string;
  key: string; // e.g. "EP-104"
  title: string;
  summary: string;
  owner: string;
  health: EpicHealth;
  riskScore: number; // 0-100
  confidence: number; // 0-100
  progress: number; // 0-100
  etaDays: number;
  committed: boolean; // committed vs stretch
  autonomy: AutonomyLevel;
  agentIds: string[];
  blockers: string[];
  branch: string;
  mergeTarget: string;
  prsOpen: number;
  prsMerged: number;
  reviewsPending: number;
  approvalsPending: number;
  stories: Story[];
  branches: BranchNode[];
  decisions: DecisionEntry[];
  timeline: TimelineEvent[];
  dependsOn: string[]; // epic keys
}

// ─── UI modes ───────────────────────────────────────────────────────────────

/** PM mode emphasizes health/forecast/approvals; DEV mode emphasizes branches/PRs/gates. */
export type ControlPlaneMode = "PM" | "DEV";

// ─── Shared helpers ─────────────────────────────────────────────────────────

export const RISK_BADGE_CLASS: Record<RiskLevel, string> = {
  LOW: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  MEDIUM: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  HIGH: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  CRITICAL: "bg-red-500/15 text-red-300 border-red-500/30",
};

export const HEALTH_BADGE_CLASS: Record<EpicHealth, string> = {
  ON_TRACK: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  AT_RISK: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  BLOCKED: "bg-red-500/15 text-red-300 border-red-500/30",
  WAITING_ON_HUMAN: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  FAILED: "bg-red-500/20 text-red-400 border-red-500/40",
  READY_TO_MERGE: "bg-violet-500/15 text-violet-300 border-violet-500/30",
};

export const STATE_BADGE_CLASS: Record<AgentRunState, string> = {
  PLANNING: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  CODING: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  TESTING: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  REVIEWING: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  BLOCKED: "bg-red-500/15 text-red-300 border-red-500/30",
  WAITING: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  FAILED: "bg-red-500/20 text-red-400 border-red-500/40",
  COMPLETED: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
  PAUSED: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  IDLE: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

export function formatDuration(startedAt: number | null): string {
  if (!startedAt) return "—";
  const mins = Math.max(0, Math.floor((Date.now() - startedAt) / 60_000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
}

export function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${value}`;
}
