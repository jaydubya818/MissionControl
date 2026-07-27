/** Paul Stack — humans architect, agents write code (Elder Swamp Club / Swamp CLI). */

export type FlowStageId =
  | "triage"
  | "classify"
  | "plan-loop"
  | "human-plan"
  | "implement"
  | "verify"
  | "pr-open"
  | "pr-review-loop"
  | "release"
  | "notify";

export interface FlowStage {
  id: FlowStageId;
  label: string;
  actor: "human" | "agent" | "code";
  description: string;
}

export const ARCHITECT_FLOW: readonly FlowStage[] = [
  { id: "triage", label: "Triage issue", actor: "agent", description: "Skill + CLI guardrails — fetch issue, read ops context." },
  { id: "classify", label: "Classify", actor: "agent", description: "Bug vs feature vs chore — structured classification." },
  { id: "plan-loop", label: "Plan ↔ adversarial review", actor: "agent", description: "Planner vs grumpy reviewer — max 5 loops until secure plan." },
  { id: "human-plan", label: "Human approves plan", actor: "human", description: "Arbiter when agents disagree or plan is ready to ship." },
  { id: "implement", label: "Implement", actor: "agent", description: "Agents write every line — no human-authored PRs." },
  { id: "verify", label: "Verify / recreate", actor: "code", description: "Bug: reproduce. Feature: validation suite." },
  { id: "pr-open", label: "Open PR", actor: "agent", description: "Agent-opened PR with full review context captured." },
  { id: "pr-review-loop", label: "Review loop", actor: "code", description: "Five merge gates — fail routes back to implement." },
  { id: "release", label: "Release", actor: "code", description: "Auto-merge when all gates pass + UAT green." },
  { id: "notify", label: "Notify requesters", actor: "code", description: "Users who filed issues get notified on ship." },
] as const;

export interface MergeGate {
  id: string;
  label: string;
  description: string;
  blocksMerge: boolean;
}

export const MERGE_GATES: readonly MergeGate[] = [
  { id: "code-review", label: "Code review", description: "Standard PR review lens — required by process.", blocksMerge: true },
  { id: "adversarial", label: "Adversarial review", description: "Assume everything is broken — prove security, injection, architecture.", blocksMerge: true },
  { id: "ux-review", label: "UX / CLI review", description: "Verb consistency (create, get), no CLI regressions.", blocksMerge: true },
  { id: "ci-security", label: "CI security review", description: "Catch pipeline injection before merge.", blocksMerge: true },
  { id: "skill-check", label: "Skill check", description: "Skill content, format, triggers — agent experience gate.", blocksMerge: true },
] as const;

export interface ExecutableConstraint {
  id: string;
  category: "typescript" | "architecture" | "copyright" | "async" | "session";
  rule: string;
  enforced: boolean;
}

export const EXECUTABLE_CONSTRAINTS: readonly ExecutableConstraint[] = [
  { id: "ts-strict", category: "typescript", rule: "TypeScript strict — no `any`", enforced: true },
  { id: "named-exports", category: "typescript", rule: "Named exports only — no default exports", enforced: true },
  { id: "agpl-header", category: "copyright", rule: "AGPL copyright header on every file", enforced: true },
  { id: "no-fire-forget", category: "async", rule: "No fire-and-forget promises", enforced: true },
  { id: "log-json-endpoints", category: "architecture", rule: "Log + JSON endpoints on every service", enforced: true },
  { id: "import-from-mods", category: "architecture", rule: "Import from module boundaries — no internal path leaks", enforced: true },
  { id: "session-learn", category: "session", rule: "Hit a non-obvious problem → propose AGENTS.md update before continuing", enforced: true },
] as const;

export const TEST_LAYERS = [
  { id: "unit", label: "Unit", phase: "pre-binary" },
  { id: "integration", label: "Integration", phase: "pre-binary" },
  { id: "contract", label: "Contract", phase: "pre-binary" },
  { id: "property", label: "Property", phase: "pre-binary" },
  { id: "architectural", label: "Architectural", phase: "pre-binary" },
  { id: "uat", label: "UAT (separate repo)", phase: "post-binary" },
  { id: "adversarial", label: "Adversarial", phase: "post-binary" },
] as const;

export const SUPPLY_CHAIN_RULES = [
  { id: "no-human-code", label: "No human-written PRs", detail: "Agent-authored only — human PRs are deleted, not merged." },
  { id: "no-external-pr", label: "No external PRs", detail: "Issues & specs welcome — maintain supply chain integrity." },
  { id: "tests-truth", label: "Tests are source of truth", detail: "UAT repo: never change tests to match a bad binary — fix the binary." },
  { id: "self-debug", label: "Self-debugging", detail: "On error: checkout version, reproduce, open issue, check if fixed upstream." },
] as const;

export const ARCHITECT_METRICS = {
  issuesOpened: 295,
  shipped: 217,
  closedDuplicate: 81,
  medianTriageHours: 4.6,
  medianTriageToShipDays: 1.6,
  teamSize: 5,
  monthlyTokenBudgetUsd: 3000,
  ciReviewMonthlyUsd: 1750,
} as const;

export interface TriageDemoStep {
  id: string;
  label: string;
  detail: string;
  status: "done" | "active" | "pending";
}

export const TRIAGE_DEMO_STEPS: readonly TriageDemoStep[] = [
  { id: "cmd", label: "triage issue #518", detail: "CLI + skill entry — guardrailed commands only", status: "done" },
  { id: "fetch", label: "Fetch issue + codebase", detail: "Read ops files, operations context", status: "done" },
  { id: "summary", label: "Summary of findings", detail: "Structured output for classification", status: "done" },
  { id: "classify", label: "Classify as bug", detail: "Ready to write plan", status: "active" },
  { id: "plan", label: "Structured plan", detail: "Detailed plan + adversarial warnings", status: "pending" },
  { id: "loop", label: "Adversarial loop", detail: "Planner vs reviewer until secure (≤5)", status: "pending" },
] as const;

export const ARCHITECT_PRINCIPLES = [
  {
    id: "intent",
    title: "Intent is the new architecture",
    body: "Express unambiguous constraints — vibes don't scale.",
  },
  {
    id: "machine",
    title: "Build the machine that writes code",
    body: "Architecture, invariants, and guardrails — not naming conventions.",
  },
  {
    id: "bottleneck",
    title: "Bottleneck is deciding what to build",
    body: "Ten parallel agents on the wrong feature builds a monolith — thinking beats typing.",
  },
  {
    id: "fresh-context",
    title: "Fresh context per worktree",
    body: "Each report = new worktree — focused context, no slash-clear needed.",
  },
] as const;
