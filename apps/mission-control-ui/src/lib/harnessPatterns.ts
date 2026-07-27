/** Patrick Debois — AI Patterns (tessl.io/patterns) & org enablement stack. */

export type EnablementLevel = "agent" | "team" | "platform" | "org";

export interface EnablementStage {
  id: EnablementLevel;
  label: string;
  subtitle: string;
  description: string;
  focus: string;
  maturity: "emerging" | "partial" | "established";
}

export const ENABLEMENT_LADDER: readonly EnablementStage[] = [
  {
    id: "agent",
    label: "Agent enablement",
    subtitle: "Level 0 · technical",
    description: "Context, harness, loops — what most of the industry talks about today.",
    focus: "Individual developer workflow: specs, skills, session hooks.",
    maturity: "partial",
  },
  {
    id: "team",
    label: "Team enablement",
    subtitle: "Shared components",
    description: "Team lead drives reuse — shared skills, shared library vs everyone inventing their own.",
    focus: "Cadence jumps: when everyone's ready, force the next practice (context in repo → tests).",
    maturity: "emerging",
  },
  {
    id: "platform",
    label: "Platform enablement",
    subtitle: "Multiplayer unlock",
    description: "Registry, centralized evals, MCP proxy, dark-factory pipeline — DX team as factory provider.",
    focus: "One team's harness optimization compounds for every team.",
    maturity: "emerging",
  },
  {
    id: "org",
    label: "Org enablement",
    subtitle: "VP / transformation",
    description: "Structure around continuous learning — success stories first, not the resistors.",
    focus: "Measure shared-system contribution, not license counts or token billionaires.",
    maturity: "emerging",
  },
] as const;

export type CollaborationMode = "solo" | "shared" | "multiplayer";

export interface CollaborationModeInfo {
  id: CollaborationMode;
  label: string;
  description: string;
  unlock: string;
}

export const COLLABORATION_MODES: readonly CollaborationModeInfo[] = [
  {
    id: "solo",
    label: "Solo mode",
    description: "Personal prompts, local rules, individual token spend.",
    unlock: "Fast individual iteration — no compounding across teams.",
  },
  {
    id: "shared",
    label: "Shared mode",
    description: "Team skills, shared context, reusable harness pieces.",
    unlock: "One optimization benefits the whole team.",
  },
  {
    id: "multiplayer",
    label: "Multiplayer mode",
    description: "Platform registry, org-wide evals, centralized pipelines.",
    unlock: "Fix context once — every team's human-touch metric improves.",
  },
] as const;

export type PatternCategoryId =
  | "agentic-dev"
  | "platform"
  | "quality-security"
  | "changing-roles"
  | "scaling-org";

export interface PatternTopic {
  id: string;
  title: string;
  summary: string;
  trend?: "rising" | "stable" | "settling";
}

export interface PatternCategory {
  id: PatternCategoryId;
  label: string;
  subtitle: string;
  maturity: "high" | "medium" | "low";
  description: string;
  topics: readonly PatternTopic[];
}

export const PATTERN_CATEGORIES: readonly PatternCategory[] = [
  {
    id: "agentic-dev",
    label: "Agentic development",
    subtitle: "Solo → factory progression",
    maturity: "high",
    description: "Vibe coding → spec coding → harness → loops → software factory. Stack adds layers; earlier slices stay.",
    topics: [
      { id: "prompts-specs", title: "Prompts & specifications", summary: "Keepers — input side of the bottleneck.", trend: "settling" },
      { id: "context-harness", title: "Context & harness", summary: "Executable constraints, not documentation.", trend: "settling" },
      { id: "loop-craft", title: "Loop engineering", summary: "Inner, outer, meta — loops of loops.", trend: "rising" },
      { id: "dark-factory", title: "Dark factory", summary: "Technically works — org must be organized for it.", trend: "rising" },
    ],
  },
  {
    id: "platform",
    label: "Platform",
    subtitle: "Reusable factory components",
    maturity: "low",
    description: "Immature in large orgs but unlocks scale — same muscle as observability for AI products, applied to coding agents.",
    topics: [
      { id: "registry", title: "Context registry", summary: "Shared skills, manifests, package boundaries.", trend: "rising" },
      { id: "central-evals", title: "Centralized evals", summary: "Org-wide verification — not per-team LLM-as-judge only.", trend: "rising" },
      { id: "mcp-proxy", title: "MCP proxy", summary: "Controlled tool surface for all teams.", trend: "stable" },
      { id: "factory-pipeline", title: "Factory pipeline", summary: "Dark-factory orchestration as a platform service.", trend: "rising" },
    ],
  },
  {
    id: "quality-security",
    label: "Quality & security",
    subtitle: "Output verification",
    maturity: "medium",
    description: "Generation bottleneck moves to proving the agent did the right thing — IDE returns as review interface.",
    topics: [
      { id: "agent-convince", title: "Agent must convince you", summary: "Not just a PR — evidence, recordings, checklists.", trend: "rising" },
      { id: "custom-eval-tools", title: "Custom eval tooling", summary: "Fast yes/no verification beyond LLM-as-judge.", trend: "rising" },
      { id: "ide-review", title: "IDE as review UI", summary: "CLI for generation; IDE for situational verification.", trend: "rising" },
      { id: "harness-regression", title: "Harness regression tests", summary: "Rules accepted into context need test gates too.", trend: "stable" },
    ],
  },
  {
    id: "changing-roles",
    label: "Changing roles",
    subtitle: "Harness engineers",
    maturity: "medium",
    description: "Skeptics → write the context. Coders → build harness & loops. Review builders → verification UX.",
    topics: [
      { id: "harness-engineer", title: "Harness engineering", summary: "Technical outlet for people who still want to build systems.", trend: "rising" },
      { id: "system-thinker", title: "System thinker hiring", summary: "Taste helps; collaboration and learning velocity matter more.", trend: "settling" },
      { id: "team-lead-shift", title: "Team lead as enabler", summary: "Push shared setup over solo optimization.", trend: "stable" },
      { id: "product-engineer", title: "Product engineer option", summary: "80% customers / 20% tech — not for everyone.", trend: "stable" },
    ],
  },
  {
    id: "scaling-org",
    label: "Scaling the org",
    subtitle: "Adoption & ROI",
    maturity: "medium",
    description: "Can't skip learning phases — but team leads can force cadence jumps. Celebrate fast teams; educate the 80%.",
    topics: [
      { id: "success-first", title: "Success stories first", summary: "Don't spend early energy on resistors — spearhead then level up.", trend: "settling" },
      { id: "forcing-functions", title: "Forcing functions", summary: "Context in repo → exposes missing tests → next jump.", trend: "stable" },
      { id: "cost-finops", title: "Agent FinOps", summary: "Telemetry on spend habits — learning budget vs production budget.", trend: "rising" },
      { id: "roi-cfo", title: "Defending ROI to CFO", summary: "Put best teams on highest-value business projects.", trend: "rising" },
    ],
  },
] as const;

export interface MaturityLayer {
  id: string;
  label: string;
  status: "settled" | "building" | "next";
}

export const TECH_MATURITY_STACK: readonly MaturityLayer[] = [
  { id: "prompts", label: "Prompts & specs", status: "settled" },
  { id: "context", label: "Context & skills", status: "settled" },
  { id: "harness", label: "Harness", status: "building" },
  { id: "loops", label: "Loops & ADW", status: "building" },
  { id: "verification", label: "Output verification", status: "next" },
  { id: "org-platform", label: "Platform & org enablement", status: "next" },
] as const;

export interface AdoptionMetric {
  id: string;
  label: string;
  description: string;
  good: boolean;
}

export const ADOPTION_METRICS: readonly AdoptionMetric[] = [
  {
    id: "license-count",
    label: "License count",
    description: "Is everyone using a tool?",
    good: false,
  },
  {
    id: "token-spend",
    label: "Token billionaires",
    description: "High usage ≠ efficient or org-helpful.",
    good: false,
  },
  {
    id: "shared-contrib",
    label: "Shared component touches",
    description: "Fixing harness, context, evals for the whole org.",
    good: true,
  },
  {
    id: "human-touches",
    label: "Human touches per agent task",
    description: "How much human intervention until the agent does the right thing?",
    good: true,
  },
] as const;

export interface ScalingPlaybookItem {
  id: string;
  title: string;
  body: string;
  audience: "team-lead" | "platform" | "vp";
}

export const SCALING_PLAYBOOK: readonly ScalingPlaybookItem[] = [
  {
    id: "spearhead",
    title: "Let fast teams go fastest",
    body: "One bleeding-edge team proves ROI — others strive for the same outcomes.",
    audience: "vp",
  },
  {
    id: "lunch-learn",
    title: "Lunch & learn / hackathon share",
    body: "Classic transformation play — celebrate what worked, don't hide it.",
    audience: "team-lead",
  },
  {
    id: "skeptic-harness",
    title: "Put skeptics on harness work",
    body: "If it's not good enough, make them encode the constraints — ownership improves output.",
    audience: "team-lead",
  },
  {
    id: "meta-loop",
    title: "Continuous learning loop",
    body: "Skills optimizer, repetitive-task detector — positive feedback with regression tests.",
    audience: "platform",
  },
  {
    id: "agent-finops",
    title: "Agent observability",
    body: "FinOps for coding agents — optimize loops instead of shutting the budget.",
    audience: "vp",
  },
] as const;

export const PATTERNS_PRINCIPLES = [
  {
    id: "learning-moat",
    title: "Continuous learning is the moat",
    body: "How fast can you adapt — even rewrite the whole codebase? Feedback loops compound knowledge.",
  },
  {
    id: "not-tokens",
    title: "Not token billionaires",
    body: "Contributors to shared systems help the journey; raw spend is a misleading proxy.",
  },
  {
    id: "dark-factory-org",
    title: "Dark factory is an org problem",
    body: "Technically feasible — blasphemy only because enterprises aren't organized for it yet.",
  },
  {
    id: "review-ide",
    title: "IDE is the review interface",
    body: "Generation moved to CLI; verification needs situational awareness — screenshots, API checks, evidence.",
  },
] as const;

export interface HiringSignal {
  id: string;
  signal: string;
  positive: boolean;
}

export const HIRING_SIGNALS: readonly HiringSignal[] = [
  { id: "system-thinker", signal: "Cares about constraints & invariants, not just syntax", positive: true },
  { id: "collaborator", signal: "Improves shared components, not only personal setup", positive: true },
  { id: "learner", signal: "Follows industry patterns beyond one language/stack", positive: true },
  { id: "rigid-stack", signal: "Only interested in one language — won't switch contexts", positive: false },
  { id: "solo-craft", signal: "Optimizes personal workflow, resists team standards", positive: false },
] as const;
