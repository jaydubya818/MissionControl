/**
 * Deterministic demo data for the Control Plane views.
 * Used until the backend epic/fleet/approval protocol is wired.
 * All views render a "Demo data" badge when showing this content.
 */

import type {
  AgentRunState,
  AgentRuntime,
  ApprovalRequest,
  AutonomyLevel,
  BranchNode,
  DecisionEntry,
  Epic,
  EpicHealth,
  FleetAgent,
  QualityGate,
  RiskLevel,
  Story,
  StoryStatus,
} from "./types";

const NOW = Date.now();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Cheap deterministic pseudo-random from an index.
function det(i: number, mod: number): number {
  return Math.abs(Math.imul(i + 7, 2654435761) >>> 8) % mod;
}

function pick<T>(arr: T[], i: number): T {
  return arr[det(i, arr.length)];
}

// ─── Fleet ──────────────────────────────────────────────────────────────────

const RUNTIMES: AgentRuntime[] = [
  "LOOM",
  "PI",
  "HERMES",
  "OPENCLAW",
  "CLAUDE_CODE",
  "CURSOR",
  "CODEX",
];

const MODELS: { model: string; provider: string }[] = [
  { model: "claude-4.5-opus", provider: "Anthropic" },
  { model: "claude-4.6-sonnet", provider: "Anthropic" },
  { model: "gpt-5.3-codex", provider: "OpenAI" },
  { model: "gemini-3-pro", provider: "Google" },
  { model: "composer-2.5", provider: "Cursor" },
];

const AGENT_NAMES = [
  "atlas", "vega", "orion", "lyra", "nova", "rigel", "callisto", "juno",
  "ceres", "draco", "ember", "flux", "gale", "helix", "iris", "koda",
];

const STATES: AgentRunState[] = [
  "CODING", "TESTING", "PLANNING", "REVIEWING", "WAITING", "CODING",
  "BLOCKED", "CODING", "TESTING", "IDLE", "REVIEWING", "FAILED",
  "CODING", "WAITING", "COMPLETED", "PAUSED",
];

const LAST_ACTIONS = [
  "Edited packages/policy-engine/src/classify.ts",
  "Ran pnpm test --filter state-machine (42 passed)",
  "Opened draft PR #312",
  "Requested approval for DB migration 0042",
  "Rebased story branch onto epic branch",
  "Generated integration tests for approvals API",
  "Analyzed failing CI run #9871",
  "Drafted ADR for event-sourced audit log",
  "Resolved merge conflict in convex/schema.ts",
  "Summarized review feedback into task list",
];

const NEXT_ACTIONS = [
  "Run full test suite before promoting to PR",
  "Wait for human approval (dependency change)",
  "Implement review feedback on PR #298",
  "Write rollback plan for migration",
  "Split story into two subtasks",
  "Re-run flaky e2e suite to confirm fix",
  null,
  "Request review from @jay",
];

const AUTONOMIES: AutonomyLevel[] = [
  "GUIDED", "FULL", "ASSISTED", "GUIDED", "PROD_GUARDED", "FULL",
  "GUIDED", "MANUAL", "FULL", "GUIDED", "SANDBOX", "ASSISTED",
];

export const DEMO_FLEET: FleetAgent[] = AGENT_NAMES.map((name, i) => {
  const state = STATES[i % STATES.length];
  const epicIdx = det(i, 22);
  const m = pick(MODELS, i);
  const active = state !== "IDLE" && state !== "COMPLETED" && state !== "PAUSED";
  return {
    id: `fleet-${name}`,
    name,
    runtime: pick(RUNTIMES, i),
    state,
    currentTask: active ? `EP-${101 + epicIdx} · ${pick(LAST_ACTIONS, i + 3).slice(0, 48)}` : null,
    epicKey: active ? `EP-${101 + epicIdx}` : null,
    startedAt: active ? NOW - det(i, 9 * 60) * 60_000 - 5 * 60_000 : null,
    branch: active ? `agent/${name}/ep-${101 + epicIdx}-story-${det(i, 5) + 1}` : null,
    worktree: active ? `.worktrees/${name}-ep${101 + epicIdx}` : null,
    model: m.model,
    provider: m.provider,
    tokensUsed: 120_000 + det(i, 4_000_000),
    costUsd: 1.2 + det(i, 4000) / 100,
    riskLevel: (["LOW", "MEDIUM", "MEDIUM", "HIGH"] as RiskLevel[])[det(i, 4)],
    autonomy: AUTONOMIES[i % AUTONOMIES.length],
    lastAction: pick(LAST_ACTIONS, i),
    nextAction: pick(NEXT_ACTIONS, i),
    confidence: 55 + det(i, 45),
  };
});

// ─── Epics ──────────────────────────────────────────────────────────────────

const EPIC_TITLES = [
  "Unified billing & invoicing platform",
  "SSO + SCIM enterprise auth",
  "Realtime collaboration engine",
  "Data warehouse export pipeline",
  "Mobile app parity (iOS)",
  "Plugin marketplace v1",
  "Audit log event sourcing",
  "Multi-region failover",
  "Self-serve onboarding revamp",
  "Usage-based pricing engine",
  "AI copilot for support tickets",
  "Granular RBAC permissions",
  "Search infrastructure rebuild",
  "Customer-facing API v2",
  "Notification preferences center",
  "GDPR data residency controls",
  "Performance: p95 < 200ms",
  "Design system migration",
  "Sandbox environments on demand",
  "Webhooks reliability overhaul",
  "In-product analytics dashboards",
  "Legacy importer deprecation",
];

const OWNERS = ["jay", "maria", "chen", "sofia", "derek", "amara"];

const HEALTH_DIST: EpicHealth[] = [
  "ON_TRACK", "ON_TRACK", "ON_TRACK", "AT_RISK", "ON_TRACK", "BLOCKED",
  "ON_TRACK", "AT_RISK", "READY_TO_MERGE", "ON_TRACK", "WAITING_ON_HUMAN",
  "ON_TRACK", "AT_RISK", "ON_TRACK", "READY_TO_MERGE", "BLOCKED",
  "ON_TRACK", "WAITING_ON_HUMAN", "ON_TRACK", "AT_RISK", "ON_TRACK", "FAILED",
];

const BLOCKER_POOL = [
  "Waiting on security review for token storage",
  "Flaky e2e suite blocking merge gate",
  "Schema migration needs DBA approval",
  "Upstream API contract not finalized",
  "Budget threshold reached — runs paused",
  "Merge conflict with main (14 files)",
  "Review ping-pong detected (loop alert)",
  "Missing acceptance criteria on 2 stories",
];

const STORY_TITLES = [
  "Schema + data model",
  "Core service implementation",
  "API endpoints + validation",
  "UI surface",
  "Integration tests",
  "Migration & rollout plan",
  "Observability + alerts",
  "Docs + runbook",
];

const GATE_DEFS: { id: string; label: string }[] = [
  { id: "unit", label: "Unit tests" },
  { id: "integration", label: "Integration tests" },
  { id: "evals", label: "Evals" },
  { id: "lint", label: "Lint" },
  { id: "coverage", label: "Coverage ≥ 80%" },
  { id: "security", label: "Security scan" },
  { id: "review", label: "Code review" },
  { id: "acceptance", label: "Acceptance criteria" },
];

function makeGates(seed: number, done: boolean): QualityGate[] {
  return GATE_DEFS.map((g, gi) => {
    const r = det(seed * 13 + gi, 10);
    const status = done
      ? "PASS"
      : r < 6
        ? "PASS"
        : r < 7
          ? "FAIL"
          : r < 9
            ? "PENDING"
            : "SKIPPED";
    return {
      ...g,
      status,
      detail:
        status === "FAIL"
          ? gi === 4
            ? "Coverage at 71% (target 80%)"
            : "Last run failed — see CI"
          : undefined,
    };
  });
}

function makeStories(epicIdx: number, epicKey: string, progress: number): Story[] {
  const count = 5 + det(epicIdx, 4);
  const doneCount = Math.round((progress / 100) * count);
  return Array.from({ length: count }, (_, si) => {
    const done = si < doneCount;
    const seed = epicIdx * 31 + si;
    const status: StoryStatus = done
      ? "DONE"
      : si === doneCount
        ? (["IN_PROGRESS", "IN_REVIEW", "NEEDS_APPROVAL", "BLOCKED"] as StoryStatus[])[det(seed, 4)]
        : si === doneCount + 1
          ? "IN_PROGRESS"
          : "BACKLOG";
    const agent = status === "IN_PROGRESS" || status === "IN_REVIEW" ? pick(DEMO_FLEET, seed) : null;
    return {
      id: `${epicKey}-S${si + 1}`,
      key: `${epicKey}-S${si + 1}`,
      title: STORY_TITLES[si % STORY_TITLES.length],
      status,
      agentId: agent ? agent.id : null,
      branch: status === "BACKLOG" ? null : `story/${epicKey.toLowerCase()}-s${si + 1}`,
      prNumber: done || status === "IN_REVIEW" ? 200 + det(seed, 180) : null,
      prStatus: done ? "MERGED" : status === "IN_REVIEW" ? "OPEN" : null,
      riskLevel: (["LOW", "LOW", "MEDIUM", "MEDIUM", "HIGH"] as RiskLevel[])[det(seed, 5)],
      gates: makeGates(seed, done),
      blockedReason: status === "BLOCKED" ? pick(BLOCKER_POOL, seed) : undefined,
    };
  });
}

function makeBranches(epicKey: string, stories: Story[]): BranchNode[] {
  const epicBranch = `epic/${epicKey.toLowerCase()}`;
  const nodes: BranchNode[] = [
    {
      name: "main",
      kind: "MERGE_TARGET",
      parent: null,
      agentId: null,
      commitCount: 0,
      driftFromMain: 0,
      testStatus: "PASS",
      reviewStatus: "NONE",
      conflict: false,
    },
    {
      name: epicBranch,
      kind: "EPIC",
      parent: "main",
      agentId: null,
      commitCount: stories.length * 7,
      driftFromMain: det(stories.length, 30),
      testStatus: det(stories.length, 5) === 0 ? "FAIL" : "PASS",
      reviewStatus: "PENDING",
      conflict: det(stories.length, 7) === 0,
    },
  ];
  for (const [si, s] of stories.entries()) {
    if (!s.branch) continue;
    nodes.push({
      name: s.branch,
      kind: s.prNumber ? "PR" : "STORY",
      parent: epicBranch,
      agentId: s.agentId,
      commitCount: 2 + det(si, 18),
      driftFromMain: det(si, 12),
      testStatus: s.gates.find((g) => g.id === "unit")?.status === "FAIL" ? "FAIL" : s.status === "DONE" ? "PASS" : (["PASS", "RUNNING", "PASS"] as const)[det(si, 3)],
      reviewStatus: s.status === "DONE" ? "APPROVED" : s.status === "IN_REVIEW" ? "PENDING" : "NONE",
      conflict: s.status === "BLOCKED" && det(si, 2) === 0,
    });
  }
  return nodes;
}

const DECISION_TITLES: { title: string; type: DecisionEntry["type"] }[] = [
  { title: "Use event sourcing for the audit trail", type: "ARCHITECTURE" },
  { title: "Defer offline mode to phase 2", type: "PRODUCT" },
  { title: "Adopt contract tests for the public API", type: "TEST" },
  { title: "Rotate signing keys to KMS", type: "SECURITY" },
  { title: "Pin zod to v3 until v4 migration epic", type: "DEPENDENCY" },
  { title: "Split story: API + UI shipped separately", type: "SCOPE" },
  { title: "Require rollback plan on HIGH risk changes", type: "PROCESS" },
];

function makeDecisions(epicIdx: number, epicKey: string): DecisionEntry[] {
  const count = 2 + det(epicIdx, 3);
  return Array.from({ length: count }, (_, di) => {
    const seed = epicIdx * 17 + di;
    const d = pick(DECISION_TITLES, seed);
    const human = det(seed, 3) === 0;
    return {
      id: `${epicKey}-D${di + 1}`,
      title: d.title,
      type: d.type,
      context: `${epicKey} · raised during ${pick(STORY_TITLES, seed)}`,
      reasoning:
        "Agent evaluated 3 options, weighed blast radius and migration cost, selected the option preserving backwards compatibility.",
      decidedBy: human ? "HUMAN" : "AGENT",
      approver: human ? pick(OWNERS, seed) : null,
      filesImpacted: [`convex/${epicKey.toLowerCase()}.ts`, "convex/schema.ts"].slice(0, 1 + det(seed, 2)),
      riskLevel: (["LOW", "MEDIUM", "HIGH"] as RiskLevel[])[det(seed, 3)],
      timestamp: NOW - det(seed, 6 * 24) * HOUR,
      outcome: (["APPLIED", "APPLIED", "APPLIED", "PENDING", "REVERTED"] as const)[det(seed, 5)],
    };
  });
}

export const DEMO_EPICS: Epic[] = EPIC_TITLES.map((title, i) => {
  const key = `EP-${101 + i}`;
  const health = HEALTH_DIST[i];
  const progress =
    health === "READY_TO_MERGE" ? 92 + det(i, 8) : health === "FAILED" ? 34 : 12 + det(i, 75);
  const stories = makeStories(i, key, progress);
  const agents = DEMO_FLEET.filter((a) => a.epicKey === key).map((a) => a.id);
  const blockers =
    health === "BLOCKED" || health === "FAILED"
      ? [pick(BLOCKER_POOL, i), pick(BLOCKER_POOL, i + 3)]
      : health === "AT_RISK" || health === "WAITING_ON_HUMAN"
        ? [pick(BLOCKER_POOL, i)]
        : [];
  return {
    id: `epic-${key}`,
    key,
    title,
    summary: `Deliver ${title.toLowerCase()} end-to-end: schema, services, API, UI, tests, rollout.`,
    owner: pick(OWNERS, i),
    health,
    riskScore:
      health === "BLOCKED" || health === "FAILED"
        ? 70 + det(i, 30)
        : health === "AT_RISK"
          ? 45 + det(i, 25)
          : 8 + det(i, 35),
    confidence:
      health === "ON_TRACK" || health === "READY_TO_MERGE" ? 70 + det(i, 28) : 35 + det(i, 35),
    progress,
    etaDays: health === "READY_TO_MERGE" ? 1 : 2 + det(i, 21),
    committed: det(i, 4) !== 0,
    autonomy: AUTONOMIES[i % AUTONOMIES.length],
    agentIds: agents,
    blockers,
    branch: `epic/${key.toLowerCase()}`,
    mergeTarget: "main",
    prsOpen: stories.filter((s) => s.prStatus === "OPEN").length,
    prsMerged: stories.filter((s) => s.prStatus === "MERGED").length,
    reviewsPending: stories.filter((s) => s.status === "IN_REVIEW").length,
    approvalsPending: stories.filter((s) => s.status === "NEEDS_APPROVAL").length,
    stories,
    branches: makeBranches(key, stories),
    decisions: makeDecisions(i, key),
    timeline: [
      { ts: NOW - (10 + det(i, 20)) * DAY, label: "Epic created from PRD import", kind: "STATE" as const },
      { ts: NOW - (8 + det(i, 8)) * DAY, label: `Squad assigned (${Math.max(agents.length, 1)} agents)`, kind: "AGENT" as const },
      { ts: NOW - (4 + det(i, 4)) * DAY, label: "First story promoted to PR", kind: "PR" as const },
      ...(blockers.length
        ? [{ ts: NOW - det(i, 36) * HOUR, label: blockers[0], kind: "BLOCKER" as const }]
        : []),
      { ts: NOW - det(i, 20) * HOUR, label: pick(DECISION_TITLES, i).title, kind: "DECISION" as const },
    ].sort((a, b) => a.ts - b.ts),
    dependsOn: i > 2 && det(i, 3) === 0 ? [`EP-${101 + det(i, i)}`] : [],
  };
});

// ─── Approval queue ─────────────────────────────────────────────────────────

const APPROVAL_SEEDS: Omit<ApprovalRequest, "id" | "requestedAt" | "status" | "agentId" | "agentName" | "epicKey">[] = [
  {
    category: "DB_MIGRATIONS",
    action: "Apply migration 0042: add epics + storyLinks tables",
    reason: "Epic hierarchy requires first-class tables; tasks.labels convention can't express dependencies.",
    affected: ["convex/schema.ts", "convex/migrations/0042_epics.ts"],
    riskLevel: "CRITICAL",
    blastRadius: "SYSTEM",
    rollbackPlan: "Down-migration drops new tables; no existing rows mutated. Verified on staging snapshot.",
    recommendation: "APPROVE",
  },
  {
    category: "DEPENDENCY_CHANGES",
    action: "Upgrade convex 1.16 → 1.19",
    reason: "Needed for new vector index API used by search rebuild epic.",
    affected: ["package.json", "pnpm-lock.yaml", "convex/*"],
    riskLevel: "HIGH",
    blastRadius: "SERVICE",
    rollbackPlan: "Revert lockfile commit; previous version pinned and cached in CI.",
    recommendation: "REVIEW_CAREFULLY",
  },
  {
    category: "SHELL_COMMANDS",
    action: "Run `pnpm prune --prod` inside CI image",
    reason: "Reduce deploy artifact size by 60%.",
    affected: ["CI pipeline"],
    riskLevel: "MEDIUM",
    blastRadius: "MODULE",
    rollbackPlan: "Re-run previous pipeline definition (kept 30 days).",
    recommendation: "APPROVE",
  },
  {
    category: "PR_MERGE",
    action: "Merge PR #298 (auth middleware refactor) into epic/ep-102",
    reason: "All gates pass; review approved by senior agent + 1 human.",
    affected: ["apps/orchestration-server/src/auth/*", "14 files"],
    riskLevel: "HIGH",
    blastRadius: "SERVICE",
    rollbackPlan: "Revert merge commit; feature-flagged path keeps old middleware live.",
    recommendation: "APPROVE",
  },
  {
    category: "SECRETS_CONFIG",
    action: "Rotate TELEGRAM_BOT_TOKEN in staging env",
    reason: "Token age exceeds 90-day policy; rotation rehearsal before prod.",
    affected: ["staging env", ".env.staging (vault)"],
    riskLevel: "CRITICAL",
    blastRadius: "SERVICE",
    rollbackPlan: "Previous token valid for 24h grace window.",
    recommendation: "REVIEW_CAREFULLY",
  },
  {
    category: "FEATURE_FLAGS",
    action: "Expand EP-113 scope: include typo-tolerant search (behind flag)",
    reason: "Eval results show 23% of failed queries are misspellings; small lever, big win.",
    affected: ["EP-113 stories +2", "flags/search-typo-tolerance"],
    riskLevel: "MEDIUM",
    blastRadius: "MODULE",
    rollbackPlan: "Drop the two added stories; flag stays off — no code impact yet.",
    recommendation: "REVIEW_CAREFULLY",
  },
  {
    category: "DEPLOYMENTS",
    action: "Deploy webhooks-overhaul to production (canary 5%)",
    reason: "Two weeks green in staging; canary plan with auto-rollback on error budget burn.",
    affected: ["production", "webhooks service"],
    riskLevel: "CRITICAL",
    blastRadius: "PRODUCTION",
    rollbackPlan: "Auto-rollback on >0.5% 5xx for 5m; manual `mc rollback webhooks` fallback.",
    recommendation: "REVIEW_CAREFULLY",
  },
  {
    category: "EXTERNAL_API_CALLS",
    action: "Call Stripe API in test mode for billing epic fixtures",
    reason: "Generate realistic invoice fixtures for integration tests.",
    affected: ["test fixtures only"],
    riskLevel: "LOW",
    blastRadius: "FILE",
    rollbackPlan: "N/A — read-only test-mode calls.",
    recommendation: "APPROVE",
  },
  {
    category: "INFRA_TERRAFORM",
    action: "Add read-replica for analytics queries (terraform plan attached)",
    reason: "Dashboard epic queries impact primary DB p95.",
    affected: ["infra/db.tf", "production database"],
    riskLevel: "CRITICAL",
    blastRadius: "PRODUCTION",
    rollbackPlan: "terraform destroy of replica module; zero impact to primary.",
    recommendation: "REVIEW_CAREFULLY",
  },
  {
    category: "PR_CREATION",
    action: "Open PR: EP-109 onboarding revamp (story 4/6)",
    reason: "Story gates green; ready for human review.",
    affected: ["apps/mission-control-ui/src/onboarding/*"],
    riskLevel: "LOW",
    blastRadius: "MODULE",
    rollbackPlan: "Close PR; branch retained.",
    recommendation: "APPROVE",
  },
];

export const DEMO_APPROVALS: ApprovalRequest[] = APPROVAL_SEEDS.map((seed, i) => {
  const agent = DEMO_FLEET[det(i, DEMO_FLEET.length)];
  return {
    ...seed,
    id: `appr-${i + 1}`,
    agentId: agent.id,
    agentName: agent.name,
    epicKey: `EP-${101 + det(i, 22)}`,
    status: "PENDING",
    requestedAt: NOW - det(i, 18) * HOUR - 12 * 60_000,
  };
});

// ─── Portfolio rollups ──────────────────────────────────────────────────────

export function portfolioCounts(epics: Epic[]) {
  const stories = epics.flatMap((e) => e.stories);
  return {
    epicsActive: epics.filter((e) => e.health !== "FAILED").length,
    stories: stories.length,
    storiesDone: stories.filter((s) => s.status === "DONE").length,
    branches: epics.reduce((acc, e) => acc + e.branches.filter((b) => b.kind !== "MERGE_TARGET").length, 0),
    prsOpen: epics.reduce((acc, e) => acc + e.prsOpen, 0),
    prsMerged: epics.reduce((acc, e) => acc + e.prsMerged, 0),
    reviewsPending: epics.reduce((acc, e) => acc + e.reviewsPending, 0),
    approvalsPending: epics.reduce((acc, e) => acc + e.approvalsPending, 0),
    blockers: epics.reduce((acc, e) => acc + e.blockers.length, 0),
  };
}

export function healthCounts(epics: Epic[]): Record<EpicHealth, number> {
  const base: Record<EpicHealth, number> = {
    ON_TRACK: 0,
    AT_RISK: 0,
    BLOCKED: 0,
    WAITING_ON_HUMAN: 0,
    FAILED: 0,
    READY_TO_MERGE: 0,
  };
  for (const e of epics) base[e.health] += 1;
  return base;
}
