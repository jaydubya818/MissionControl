/** IndyDevDan — AI Developer Workflows (ADW), not "loop engineering". */

export type ValueActor = "engineer" | "agent" | "code";

export interface ValueActorMeta {
  id: ValueActor;
  label: string;
  reliability: number;
  cost: "high" | "tokens" | "free";
  tagline: string;
}

export const THREE_ACTORS: readonly ValueActorMeta[] = [
  {
    id: "code",
    label: "Code",
    reliability: 99,
    cost: "free",
    tagline: "Deterministic — lint, typecheck, CI, ticket updates. Zero tokens.",
  },
  {
    id: "engineer",
    label: "Engineer",
    reliability: 85,
    cost: "high",
    tagline: "Planning & review — the two constraints at start and end.",
  },
  {
    id: "agent",
    label: "Agent",
    reliability: 70,
    cost: "tokens",
    tagline: "Probabilistic compute — plan, build, test, scout, route.",
  },
] as const;

export type SandboxKind = "hotfix" | "feature" | "bug" | "chore" | "custom";

export interface AdwNode {
  id: string;
  label: string;
  kind: "human" | "agent" | "code" | "decision" | "terminal";
}

export interface AdwEdge {
  from: string;
  to: string;
  variant?: "pass" | "fail" | "default";
  label?: string;
}

export interface AdwSandbox {
  id: SandboxKind;
  label: string;
  description: string;
  modelHint: string;
  nodes: AdwNode[];
  edges: AdwEdge[];
}

export const FACTORY_INTAKE: readonly AdwNode[] = [
  { id: "support", label: "Support", kind: "human" },
  { id: "product", label: "Product", kind: "human" },
  { id: "engineer-in", label: "Engineer", kind: "human" },
  { id: "kanban", label: "Kanban ticket", kind: "decision" },
  { id: "eng-prompt", label: "Engineer prompt", kind: "human" },
  { id: "start-factory", label: "Start factory", kind: "decision" },
  { id: "in-progress", label: "Status: In progress", kind: "decision" },
  { id: "router", label: "Factory router agent", kind: "agent" },
  { id: "setup-sandbox", label: "Setup sandbox", kind: "decision" },
] as const;

export const ADW_SANDBOXES: readonly AdwSandbox[] = [
  {
    id: "hotfix",
    label: "Hotfix sandbox",
    description: "Production down — scout routes to surgical hot-fix agent. Human approve/reject, then parallel racing sandboxes.",
    modelHint: "Specialist + workhorse build — speed over elegance",
    nodes: [
      { id: "scout", label: "Scout agent", kind: "agent" },
      { id: "hotfix", label: "Hot fix agent", kind: "agent" },
      { id: "approve", label: "Approve / reject", kind: "human" },
      { id: "build", label: "Build agent", kind: "agent" },
      { id: "test", label: "Test agent", kind: "agent" },
      { id: "review", label: "Engineer review", kind: "human" },
    ],
    edges: [
      { from: "scout", to: "hotfix", variant: "default" },
      { from: "hotfix", to: "approve", variant: "default" },
      { from: "approve", to: "build", variant: "pass", label: "approve" },
      { from: "approve", to: "hotfix", variant: "fail", label: "reject" },
      { from: "build", to: "test", variant: "default" },
      { from: "test", to: "review", variant: "pass" },
      { from: "test", to: "hotfix", variant: "fail" },
    ],
  },
  {
    id: "feature",
    label: "Feature sandbox",
    description: "Planner + build + test loop until green, then CI/CD and engineer review.",
    modelHint: "SOTA planner/scout · workhorse build",
    nodes: [
      { id: "planner", label: "Planner agent", kind: "agent" },
      { id: "build", label: "Build agent", kind: "agent" },
      { id: "test", label: "Test agent", kind: "agent" },
      { id: "cicd", label: "CI/CD", kind: "code" },
      { id: "review", label: "Engineer review", kind: "human" },
    ],
    edges: [
      { from: "planner", to: "build", variant: "default" },
      { from: "build", to: "test", variant: "default" },
      { from: "test", to: "planner", variant: "fail" },
      { from: "test", to: "cicd", variant: "pass" },
      { from: "cicd", to: "build", variant: "fail" },
      { from: "cicd", to: "review", variant: "pass" },
    ],
  },
  {
    id: "bug",
    label: "Bug sandbox",
    description: "Plan → build → test with CI gate — same shape as feature, narrower scope.",
    modelHint: "Balanced models · focused context",
    nodes: [
      { id: "plan", label: "Plan agent", kind: "agent" },
      { id: "build", label: "Build agent", kind: "agent" },
      { id: "test", label: "Test agent", kind: "agent" },
      { id: "cicd", label: "CI/CD", kind: "code" },
      { id: "review", label: "Engineer review", kind: "human" },
    ],
    edges: [
      { from: "plan", to: "build", variant: "default" },
      { from: "build", to: "test", variant: "default" },
      { from: "test", to: "plan", variant: "fail" },
      { from: "test", to: "cicd", variant: "pass" },
      { from: "cicd", to: "review", variant: "pass" },
      { from: "cicd", to: "build", variant: "fail" },
    ],
  },
  {
    id: "chore",
    label: "Chore sandbox",
    description: "Single workhorse agent — build, lint, CI/CD, ship. No heavy planning.",
    modelHint: "Lightweight model · minimal agents",
    nodes: [
      { id: "build", label: "Build agent", kind: "agent" },
      { id: "lint", label: "Lint", kind: "code" },
      { id: "cicd", label: "CI/CD", kind: "code" },
      { id: "review", label: "Engineer review", kind: "human" },
    ],
    edges: [
      { from: "build", to: "lint", variant: "default" },
      { from: "lint", to: "build", variant: "fail" },
      { from: "lint", to: "cicd", variant: "pass" },
      { from: "cicd", to: "review", variant: "pass" },
    ],
  },
  {
    id: "custom",
    label: "Your ADW",
    description: "Any specialized AI developer workflow — route via factory router.",
    modelHint: "You define nodes · code + agents",
    nodes: [{ id: "custom", label: "Custom workflow", kind: "agent" }],
    edges: [],
  },
] as const;

export const FACTORY_OUTRO: readonly AdwNode[] = [
  { id: "merge", label: "Merge", kind: "decision" },
  { id: "ship", label: "Ship", kind: "terminal" },
] as const;

export interface AdwProgressionStep {
  id: string;
  title: string;
  description: string;
  actors: ValueActor[];
}

/** Simple → software factory evolution. */
export const ADW_PROGRESSION: readonly AdwProgressionStep[] = [
  {
    id: "prompt-review",
    title: "Engineer → agent → review",
    description: "Foundation — you prompt, agent works, you validate.",
    actors: ["engineer", "agent"],
  },
  {
    id: "add-lint",
    title: "Add deterministic code",
    description: "Linter loop — fail feeds back into build agent (first real ADW loop).",
    actors: ["engineer", "agent", "code"],
  },
  {
    id: "validation-stack",
    title: "Format · typecheck · test",
    description: "Stack validation nodes — all failures route to build agent.",
    actors: ["agent", "code"],
  },
  {
    id: "test-agent",
    title: "Test agent",
    description: "Scale compute for confidence — one agent owns all verification.",
    actors: ["agent", "code"],
  },
  {
    id: "plan-phase",
    title: "Planning agent",
    description: "Plan → build → test → review → ship — the classic dev workflow.",
    actors: ["engineer", "agent", "code"],
  },
  {
    id: "worktrees",
    title: "Parallel worktrees",
    description: "Code spins isolated trees — multiple ADWs in parallel.",
    actors: ["code", "agent"],
  },
  {
    id: "sandboxes",
    title: "Agent sandboxes",
    description: "Full VM per agent — jump in to review UI, tests, app.",
    actors: ["engineer", "agent", "code"],
  },
  {
    id: "kanban",
    title: "Kanban queue",
    description: "Support · product · engineering intake — ticket drives the factory.",
    actors: ["engineer", "code"],
  },
  {
    id: "factory",
    title: "Software factory",
    description: "Router agent picks hotfix · feature · bug · chore ADW.",
    actors: ["engineer", "agent", "code"],
  },
] as const;

export const ADW_PRINCIPLES = [
  {
    id: "kiss",
    title: "Keep it simple",
    body: "Separate code from agents — SDK build agent, then run linter in code. Not one mega-skill.",
  },
  {
    id: "by-hand",
    title: "Do it by hand first",
    body: "Run the workflow end-to-end yourself, then encode as agents + code. Use Mermaid to diagram.",
  },
  {
    id: "code-plus-agents",
    title: "Agents + code",
    body: "Code is free, fast, deterministic. Don't over-leverage agents for what code does better.",
  },
  {
    id: "meta-layer",
    title: "Agentic layer",
    body: "Build the system that builds the system — meta-engineering on prompts, skills, harness.",
  },
] as const;

export const NODE_KIND_STYLES: Record<
  AdwNode["kind"],
  { fill: string; stroke: string; text: string; shape: "rect" | "diamond" | "circle" }
> = {
  human: { fill: "rgba(250, 204, 21, 0.15)", stroke: "#facc15", text: "#fde68a", shape: "circle" },
  agent: { fill: "rgba(251, 146, 60, 0.18)", stroke: "#fb923c", text: "#fdba74", shape: "rect" },
  code: { fill: "rgba(74, 222, 128, 0.12)", stroke: "#4ade80", text: "#86efac", shape: "diamond" },
  decision: { fill: "rgba(34, 211, 238, 0.12)", stroke: "#22d3ee", text: "#67e8f9", shape: "diamond" },
  terminal: { fill: "rgba(250, 204, 21, 0.25)", stroke: "#facc15", text: "#fef08a", shape: "circle" },
};
