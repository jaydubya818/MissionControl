/** Eric's Cursor software-factory workshop — static reference content. */

export type AutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface AutonomyStage {
  level: AutonomyLevel;
  id: string;
  label: string;
  subtitle: string;
  description: string;
  humanRole: string;
}

/** Dan Shapiro six stages of agentic autonomy (Jan/Feb 2026). */
export const AUTONOMY_STAGES: readonly AutonomyStage[] = [
  {
    level: 0,
    id: "spicy-autocomplete",
    label: "Spicy autocomplete",
    subtitle: "Tab completion",
    description: "Inline suggestions while you type — Cursor circa 2022–23.",
    humanRole: "You write every line; AI completes fragments.",
  },
  {
    level: 1,
    id: "chat-assist",
    label: "Chat assist",
    subtitle: "Q&A in IDE",
    description: "Ask questions, get snippets, paste into editor.",
    humanRole: "You drive; agent advises.",
  },
  {
    level: 2,
    id: "pair-programmer",
    label: "Pair programmer",
    subtitle: "Back-and-forth agent",
    description: "Most adopters sit here — iterative prompts until the task is done.",
    humanRole: "You pair; agent edits files on request.",
  },
  {
    level: 3,
    id: "developer",
    label: "Developer",
    subtitle: "AI generates majority",
    description: "Agent produces most code; you review traces and diffs in the loop.",
    humanRole: "Reviewer of generated output.",
  },
  {
    level: 4,
    id: "manager",
    label: "Manager",
    subtitle: "Delegate & review outcomes",
    description: "Eric's current mode — delegate work, review artifacts before code.",
    humanRole: "Manager overseeing agent output.",
  },
  {
    level: 5,
    id: "dark-factory",
    label: "Software factory",
    subtitle: "Dark factory",
    description: "Black box — agents plan, build, test, ship. You supply intent only.",
    humanRole: "Intent owner; observability consumer.",
  },
] as const;

export type ChecklistCategory = "primitives" | "guardrails" | "enablers" | "runnable" | "accessible" | "verifiable";

export interface FactoryChecklistItem {
  id: string;
  category: ChecklistCategory;
  label: string;
  description: string;
  /** Path or artifact hint for agents */
  artifactHint?: string;
}

export const FACTORY_CHECKLIST: readonly FactoryChecklistItem[] = [
  { id: "modular-code", category: "primitives", label: "Modular codebase", description: "Colocated domains so agents can ls a folder instead of grep the world.", artifactHint: "docs/ARCHITECTURE.md" },
  { id: "usage-patterns", category: "primitives", label: "Usage patterns", description: "Auth, tests, startup scripts — agents copy existing references.", artifactHint: "package.json scripts" },
  { id: "hooks", category: "guardrails", label: "Hooks", description: "Block sensitive paths (auth, encryption, payments).", artifactHint: ".cursor/hooks/" },
  { id: "rules-sop", category: "guardrails", label: "Emergent rules", description: "Rules as SOPs when agents go off-rails — not bulk-installed generic packs.", artifactHint: ".cursor/rules/" },
  { id: "tests", category: "guardrails", label: "Self-verify tests", description: "Unit, integration, UI — agent runs them before declaring done.", artifactHint: "vitest / playwright" },
  { id: "skills-mcp", category: "enablers", label: "Skills & MCP", description: "External context, feature flags, domain capabilities.", artifactHint: "Registry / MCP" },
  { id: "dev-env", category: "enablers", label: "Reproducible dev env", description: "Agent starts stack without human — VM or devcontainer.", artifactHint: "pnpm dev / cursor worker" },
  { id: "runnable", category: "runnable", label: "Is it runnable?", description: "One command bootstraps the project.", artifactHint: "pnpm dev:demo" },
  { id: "accessible", category: "accessible", label: "Is context accessible?", description: "Linear, Slack, Notion, Datadog — intent and feedback in reach.", artifactHint: "MCP integrations" },
  { id: "verifiable", category: "verifiable", label: "Verifiable outcomes?", description: "DOM clicks, contracts, mutation tests, computer-use recordings.", artifactHint: "Harness verifiers" },
] as const;

export const CHECKLIST_CATEGORY_LABELS: Record<ChecklistCategory, string> = {
  primitives: "Primitives & patterns",
  guardrails: "Guardrails",
  enablers: "Enablers",
  runnable: "Runnable",
  accessible: "Accessible",
  verifiable: "Verifiable",
};

export type AssemblyStageId = "plan" | "produce" | "review" | "ship";

export interface AssemblyStage {
  id: AssemblyStageId;
  label: string;
  description: string;
  automations: string[];
}

/** Plan → Produce → Review → Ship (automated SLC). */
export const ASSEMBLY_LINE: readonly AssemblyStage[] = [
  {
    id: "plan",
    label: "Plan",
    description: "Front-load context — specs, Linear tickets, Notion intent.",
    automations: ["Spec from Slack", "Linear ticket → agent", "Repetitive task scan"],
  },
  {
    id: "produce",
    label: "Produce",
    description: "Isolated VM per agent — parallel work without merge collisions.",
    automations: ["Cloud agent spawn", "Cursor worker", "Git worktree"],
  },
  {
    id: "review",
    label: "Review",
    description: "Automated review before human — Bugbot, mutation tests, risk scoring.",
    automations: ["Change review ingest", "Agentic code owner", "PR comment mining"],
  },
  {
    id: "ship",
    label: "Ship",
    description: "Feature flags, gradual rollout, stale-flag cleanup.",
    automations: ["Feature flag skill", "Stale flag → Linear → agent", "Daily review digest"],
  },
] as const;

export type AutomationId =
  | "daily-review"
  | "pr-comment-mining"
  | "agentic-code-owner"
  | "continual-learning"
  | "repetitive-tasks"
  | "linear-triage"
  | "slack-triage"
  | "stale-feature-flag";

export interface WorkshopAutomation {
  id: AutomationId;
  label: string;
  description: string;
  cadence: string;
  sources: string[];
  skillName: string;
  schedule: string;
}

export const WORKSHOP_AUTOMATIONS: readonly WorkshopAutomation[] = [
  {
    id: "daily-review",
    label: "Daily review",
    description: "Summarize Slack + GitHub activity from the last 24h — replace manual standup notes.",
    cadence: "Daily 7am",
    sources: ["Slack", "GitHub"],
    skillName: "daily-review",
    schedule: "0 7 * * *",
  },
  {
    id: "pr-comment-mining",
    label: "Merge PR comment mining",
    description: "Extract high-signal human review comments from merged PRs for agent memory.",
    cadence: "On merge",
    sources: ["GitHub"],
    skillName: "pr-comment-mining",
    schedule: "on-merge",
  },
  {
    id: "agentic-code-owner",
    label: "Agentic code owner",
    description: "Risk-score PRs — auto-approve low risk; route high risk to prior authors.",
    cadence: "Per PR",
    sources: ["GitHub", "CODEOWNERS"],
    skillName: "code-owner-review",
    schedule: "on-pr",
  },
  {
    id: "continual-learning",
    label: "Continual learning",
    description: "Scan agent transcripts; propose rules from corrections you repeat.",
    cadence: "Weekly",
    sources: ["Agent transcripts"],
    skillName: "continual-learning",
    schedule: "0 8 * * 1",
  },
  {
    id: "repetitive-tasks",
    label: "Repetitive task detector",
    description: "Analyze chat history for loops you do manually — candidate automations.",
    cadence: "On demand",
    sources: ["Chat history"],
    skillName: "repetitive-task-scan",
    schedule: "manual",
  },
  {
    id: "linear-triage",
    label: "Linear → cloud agent",
    description: "Every new Linear ticket spawns an isolated cloud agent run.",
    cadence: "Per ticket",
    sources: ["Linear"],
    skillName: "linear-dispatch",
    schedule: "on-ticket",
  },
  {
    id: "slack-triage",
    label: "Slack triage agent",
    description: "Dedupe bugs, classify severity, auto-fix easy issues.",
    cadence: "Per message",
    sources: ["Slack"],
    skillName: "slack-triage",
    schedule: "on-message",
  },
  {
    id: "stale-feature-flag",
    label: "Stale feature flag cleanup",
    description: "Flag at 100% for 2 weeks → Linear issue → agent removes flag.",
    cadence: "Weekly scan",
    sources: ["Feature flags", "Linear"],
    skillName: "stale-flag-cleanup",
    schedule: "0 6 * * 1",
  },
] as const;

export interface FactoryArtifact {
  id: string;
  path: string;
  kind: "rules" | "skills" | "docs" | "tests" | "hooks" | "spec";
  description: string;
}

/** Eric: factory spec lives in-repo where agents can read it. */
export const FACTORY_ARTIFACTS: readonly FactoryArtifact[] = [
  { id: "agents-md", path: "AGENTS.md", kind: "docs", description: "Cross-harness rules — startup, verify, conventions" },
  { id: "cursor-rules", path: ".cursor/rules/", kind: "rules", description: "Emergent SOPs — add when agents drift" },
  { id: "cursor-hooks", path: ".cursor/hooks/", kind: "hooks", description: "Block sensitive paths before edit" },
  { id: "skills", path: ".claude/skills/", kind: "skills", description: "Capabilities agents invoke (feature flags, etc.)" },
  { id: "playwright", path: "e2e/", kind: "tests", description: "Browser verification — click paths agents must pass" },
  { id: "factory-spec", path: "docs/FACTORY.md", kind: "spec", description: "Council-approved factory blueprint" },
  { id: "feature-flags", path: "docs/FEATURE_FLAGS.md", kind: "docs", description: "Flag rollout + stale cleanup policy" },
  { id: "progress", path: "progress.txt", kind: "docs", description: "Session handoff for agents and humans" },
] as const;

export interface RepetitiveTaskFinding {
  id: string;
  pattern: string;
  occurrences: number;
  suggestion: string;
  ruleCandidate?: string;
}

export const DEMO_REPETITIVE_FINDINGS: readonly RepetitiveTaskFinding[] = [
  { id: "restart-dev", pattern: "Restart dev server after config change", occurrences: 12, suggestion: "Schedule health-check cron", ruleCandidate: "Always run pnpm dev:demo after env change" },
  { id: "ui-iteration", pattern: "Ableton-style UI polish loops", occurrences: 8, suggestion: "Add design-system rule", ruleCandidate: "Match Ableton dark UI tokens in index.css" },
  { id: "plan-rerun", pattern: "Re-run plan after direction change", occurrences: 6, suggestion: "Front-load spec in meta loop", ruleCandidate: "Require written plan before >3 file edits" },
  { id: "tooling-housekeeping", pattern: "Lint + typecheck before merge", occurrences: 15, suggestion: "Wire CI ingest to Change Review", ruleCandidate: "Never merge without green harness checks" },
] as const;
