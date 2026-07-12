/**
 * Software Factory DEMO SEED (sf/90-demo-seed branch only).
 *
 * Populates every operator-facing table with rich, coherent demo data for the
 * "Atlas Checkout" product narrative. Every row is tagged with
 * metadata.seedTag = "sf-demo" (or an equivalent prefix where the table has
 * no metadata field) so `clear` can remove exactly and only seed rows.
 *
 *   npx convex run seedFactoryDemo:run '{"force":true}'
 *   npx convex run seedFactoryDemo:status
 *   npx convex run seedFactoryDemo:clear '{}'
 *
 * See docs/software-factory/DEMO.md. Never merge this branch to main.
 */

import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

const SEED_TAG = "sf-demo";
const PROJECT_SLUG = "sf-demo";
const REPO_SLUG = "demo/atlas-checkout";
const FLAG_ACTOR = "sf-demo-seed";
const QUOTA_TIER_PREFIX = "sf-demo/";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.now();

const DEMO_FLAGS = [
  "ui.shell.v2",
  "context.registry",
  "delivery.workorders",
  "executor.pi-bridge",
] as const;

type Meta = Record<string, unknown>;

function meta(key: string, extra?: Meta): Meta {
  return { ...(extra ?? {}), seedTag: SEED_TAG, seedKey: key };
}

/** Deterministic fake 64-char hex digest (NOT cryptographic; demo data only). */
function fakeHex(seed: string): string {
  let h = 0x811c9dc5;
  let out = "";
  for (let i = 0; out.length < 64; i++) {
    const c = seed.charCodeAt(i % seed.length) + i * 31;
    h = Math.imul(h ^ c, 0x01000193) >>> 0;
    out += h.toString(16).padStart(8, "0");
  }
  return out.slice(0, 64);
}

function sha(seed: string): string {
  return `sha256:${fakeHex(seed)}`;
}

// ---------------------------------------------------------------------------
// Static data builders
// ---------------------------------------------------------------------------

type AgentSpec = {
  key: string;
  name: string;
  emoji: string;
  role: "INTERN" | "SPECIALIST" | "LEAD" | "CEO";
  status: "ACTIVE" | "PAUSED" | "DRAINED" | "QUARANTINED" | "OFFLINE";
  taskTypes: string[];
  budgetDaily: number;
  spendToday: number;
  heartbeatAgoMs?: number;
  lastError?: string;
};

const AGENT_SPECS: AgentSpec[] = [
  { key: "pi-supervisor-demo", name: "pi-supervisor-demo", emoji: "🎛️", role: "LEAD", status: "ACTIVE", taskTypes: ["ENGINEERING", "OPS", "DOCS"], budgetDaily: 50, spendToday: 12.4, heartbeatAgoMs: 2 * 60 * 1000 },
  { key: "hermes-executor-demo", name: "hermes-executor-demo", emoji: "⚡", role: "SPECIALIST", status: "ACTIVE", taskTypes: ["ENGINEERING"], budgetDaily: 40, spendToday: 18.75, heartbeatAgoMs: 45 * 1000 },
  { key: "demo-coder", name: "demo-coder", emoji: "🧑‍💻", role: "SPECIALIST", status: "ACTIVE", taskTypes: ["ENGINEERING"], budgetDaily: 30, spendToday: 9.1, heartbeatAgoMs: 8 * 60 * 1000 },
  { key: "demo-qa", name: "demo-qa", emoji: "🔍", role: "SPECIALIST", status: "ACTIVE", taskTypes: ["ENGINEERING", "OPS"], budgetDaily: 25, spendToday: 4.2, heartbeatAgoMs: 20 * 60 * 1000 },
  { key: "demo-security", name: "demo-security", emoji: "🛡️", role: "SPECIALIST", status: "QUARANTINED", taskTypes: ["OPS"], budgetDaily: 20, spendToday: 19.9, lastError: "Attempted RED-tier tool call without approval (quarantined by policy engine)" },
  { key: "demo-docs", name: "demo-docs", emoji: "📚", role: "INTERN", status: "PAUSED", taskTypes: ["DOCS", "CONTENT"], budgetDaily: 10, spendToday: 1.3 },
  { key: "demo-research", name: "demo-research", emoji: "🔬", role: "INTERN", status: "ACTIVE", taskTypes: ["CUSTOMER_RESEARCH", "SEO_RESEARCH"], budgetDaily: 15, spendToday: 6.6, heartbeatAgoMs: 90 * 60 * 1000 },
  { key: "demo-ops", name: "demo-ops", emoji: "🧰", role: "SPECIALIST", status: "OFFLINE", taskTypes: ["OPS"], budgetDaily: 20, spendToday: 0 },
];

type TaskStatusT =
  | "INBOX" | "ASSIGNED" | "IN_PROGRESS" | "REVIEW" | "NEEDS_APPROVAL"
  | "BLOCKED" | "FAILED" | "DONE" | "CANCELED";

const TRANSITION_PATHS: Record<TaskStatusT, Array<[string, string]>> = {
  INBOX: [],
  ASSIGNED: [["INBOX", "ASSIGNED"]],
  IN_PROGRESS: [["INBOX", "ASSIGNED"], ["ASSIGNED", "IN_PROGRESS"]],
  REVIEW: [["INBOX", "ASSIGNED"], ["ASSIGNED", "IN_PROGRESS"], ["IN_PROGRESS", "REVIEW"]],
  NEEDS_APPROVAL: [["INBOX", "ASSIGNED"], ["ASSIGNED", "IN_PROGRESS"], ["IN_PROGRESS", "NEEDS_APPROVAL"]],
  BLOCKED: [["INBOX", "ASSIGNED"], ["ASSIGNED", "IN_PROGRESS"], ["IN_PROGRESS", "BLOCKED"]],
  FAILED: [["INBOX", "ASSIGNED"], ["ASSIGNED", "IN_PROGRESS"], ["IN_PROGRESS", "FAILED"]],
  DONE: [["INBOX", "ASSIGNED"], ["ASSIGNED", "IN_PROGRESS"], ["IN_PROGRESS", "REVIEW"], ["REVIEW", "DONE"]],
  CANCELED: [["INBOX", "CANCELED"]],
};

type TaskSpec = { title: string; status: TaskStatusT; type: "ENGINEERING" | "DOCS" | "OPS" | "CONTENT" | "CUSTOMER_RESEARCH"; priority: 1 | 2 | 3 | 4; agent: string; note?: string };

const TASK_SPECS: TaskSpec[] = [
  { title: "Wire Stripe payment intents into checkout API", status: "DONE", type: "ENGINEERING", priority: 1, agent: "demo-coder" },
  { title: "Add idempotency keys to order submission", status: "DONE", type: "ENGINEERING", priority: 2, agent: "demo-coder" },
  { title: "Checkout page skeleton + cart summary component", status: "DONE", type: "ENGINEERING", priority: 2, agent: "hermes-executor-demo" },
  { title: "Draft checkout API reference docs", status: "DONE", type: "DOCS", priority: 3, agent: "demo-docs" },
  { title: "Provision staging environment for Atlas Checkout", status: "DONE", type: "OPS", priority: 2, agent: "demo-ops" },
  { title: "Implement address validation service adapter", status: "REVIEW", type: "ENGINEERING", priority: 2, agent: "demo-coder" },
  { title: "Add Playwright coverage for guest checkout flow", status: "REVIEW", type: "ENGINEERING", priority: 2, agent: "demo-qa" },
  { title: "Write launch-week changelog post", status: "REVIEW", type: "CONTENT", priority: 3, agent: "demo-docs" },
  { title: "Migrate cart persistence from localStorage to server", status: "IN_PROGRESS", type: "ENGINEERING", priority: 1, agent: "hermes-executor-demo" },
  { title: "Tax calculation for EU VAT zones", status: "IN_PROGRESS", type: "ENGINEERING", priority: 2, agent: "demo-coder" },
  { title: "Load-test checkout at 500 rps", status: "IN_PROGRESS", type: "OPS", priority: 2, agent: "demo-qa" },
  { title: "Competitive teardown: one-click checkout UX", status: "IN_PROGRESS", type: "CUSTOMER_RESEARCH", priority: 3, agent: "demo-research" },
  { title: "Apply promo-code stacking rules", status: "ASSIGNED", type: "ENGINEERING", priority: 3, agent: "demo-coder" },
  { title: "Refund flow runbook", status: "ASSIGNED", type: "DOCS", priority: 3, agent: "demo-docs" },
  { title: "Rotate staging API credentials", status: "ASSIGNED", type: "OPS", priority: 2, agent: "demo-ops" },
  { title: "Deploy checkout v2 to production", status: "NEEDS_APPROVAL", type: "OPS", priority: 1, agent: "demo-ops" },
  { title: "Enable Apple Pay in live payment config", status: "NEEDS_APPROVAL", type: "ENGINEERING", priority: 2, agent: "hermes-executor-demo" },
  { title: "Fraud-screening vendor integration", status: "BLOCKED", type: "ENGINEERING", priority: 1, agent: "demo-security", note: "Vendor sandbox credentials pending; security agent quarantined" },
  { title: "PCI compliance evidence pack", status: "BLOCKED", type: "OPS", priority: 2, agent: "demo-security", note: "Waiting on Q3 audit window" },
  { title: "Currency rounding fix for JPY carts", status: "FAILED", type: "ENGINEERING", priority: 2, agent: "demo-coder", note: "Run failed: vitest currency.spec.ts 3/14 failing after 2 retries" },
  { title: "Auto-generate order confirmation emails", status: "FAILED", type: "ENGINEERING", priority: 3, agent: "hermes-executor-demo", note: "Executor timeout after 45m; branch abandoned" },
  { title: "Inventory reservation timeout tuning", status: "INBOX", type: "ENGINEERING", priority: 3, agent: "demo-coder" },
  { title: "Checkout abandonment email sequence", status: "INBOX", type: "CONTENT", priority: 4, agent: "demo-docs" },
  { title: "Survey: payment method preferences", status: "INBOX", type: "CUSTOMER_RESEARCH", priority: 4, agent: "demo-research" },
  { title: "Legacy cart service decommission", status: "CANCELED", type: "OPS", priority: 4, agent: "demo-ops", note: "Superseded by server-side cart migration" },
];

type WoState =
  | "DRAFT" | "READY" | "DISPATCHED" | "IN_PROGRESS" | "BLOCKED"
  | "AWAITING_APPROVAL" | "AWAITING_VERIFICATION" | "DONE" | "CANCELED";

type WoSpec = {
  key: string; title: string; outcome: string; state: WoState;
  risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; priority: 1 | 2 | 3 | 4;
  verification: "PENDING" | "PASS" | "FAIL" | "WAIVED";
  approval: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED" | "CONDITIONAL";
  acStatuses: Array<"PENDING" | "PASS" | "FAIL" | "WAIVED">;
  correlated?: boolean; blocking?: string; humanAction?: string;
};

const WO_SPECS: WoSpec[] = [
  { key: "wo-01", title: "Checkout payment-intent service", outcome: "Stripe payment intents created/confirmed server-side with idempotent retries", state: "DONE", risk: "MEDIUM", priority: 1, verification: "PASS", approval: "APPROVED", acStatuses: ["PASS", "PASS", "PASS"], correlated: true },
  { key: "wo-02", title: "Guest checkout E2E suite", outcome: "Playwright suite covers guest checkout happy path + 4 failure modes", state: "AWAITING_VERIFICATION", risk: "LOW", priority: 2, verification: "PENDING", approval: "NOT_REQUIRED", acStatuses: ["PASS", "PENDING", "PENDING"], correlated: true },
  { key: "wo-03", title: "Production deploy of checkout v2", outcome: "checkout-v2 serving 100% of traffic with error rate < 0.1%", state: "AWAITING_APPROVAL", risk: "CRITICAL", priority: 1, verification: "PENDING", approval: "PENDING", acStatuses: ["PASS", "PASS", "PENDING"], correlated: true, humanAction: "Dual-control approval required (RED tier): second approver needed" },
  { key: "wo-04", title: "Server-side cart persistence migration", outcome: "Carts stored server-side; localStorage fallback removed", state: "IN_PROGRESS", risk: "MEDIUM", priority: 1, verification: "PENDING", approval: "NOT_REQUIRED", acStatuses: ["PASS", "PENDING", "PENDING", "PENDING"], correlated: true },
  { key: "wo-05", title: "Fraud-screening vendor integration", outcome: "Sift screening on every order over $200 with < 300ms overhead", state: "BLOCKED", risk: "HIGH", priority: 1, verification: "PENDING", approval: "CONDITIONAL", acStatuses: ["PENDING", "PENDING"], blocking: "Vendor sandbox credentials not yet issued" },
  { key: "wo-06", title: "EU VAT calculation engine", outcome: "Correct VAT for all 27 EU member states incl. OSS thresholds", state: "DISPATCHED", risk: "MEDIUM", priority: 2, verification: "PENDING", approval: "NOT_REQUIRED", acStatuses: ["PENDING", "PENDING", "PENDING"], correlated: true },
  { key: "wo-07", title: "Promo-code stacking rules", outcome: "Deterministic stacking order with per-campaign caps", state: "READY", risk: "LOW", priority: 3, verification: "PENDING", approval: "NOT_REQUIRED", acStatuses: ["PENDING", "PENDING"] },
  { key: "wo-08", title: "Order-confirmation email pipeline", outcome: "Transactional emails within 30s of order completion", state: "DRAFT", risk: "LOW", priority: 3, verification: "PENDING", approval: "NOT_REQUIRED", acStatuses: ["PENDING"] },
  { key: "wo-09", title: "Legacy cart service decommission", outcome: "v1 cart service retired; traffic 0 for 30 days", state: "CANCELED", risk: "MEDIUM", priority: 4, verification: "WAIVED", approval: "NOT_REQUIRED", acStatuses: ["WAIVED", "WAIVED"] },
];

type PkgSpec = {
  slug: string; name: string; type: "DOCUMENTATION" | "RULES" | "POLICY" | "PROMPT_TEMPLATE" | "WORKFLOW" | "TOOL_GUIDE";
  risk: "GREEN" | "YELLOW" | "RED"; quality: number; impact?: number;
  security: "PASSED" | "UNSCANNED" | "QUARANTINED";
  install: "INSTALLED" | "STALE" | "INCOMPATIBLE";
};

const PKG_SPECS: PkgSpec[] = [
  { slug: "demo/architecture-guide", name: "architecture-guide", type: "DOCUMENTATION", risk: "GREEN", quality: 91, impact: 1.25, security: "PASSED", install: "INSTALLED" },
  { slug: "demo/git-safety", name: "git-safety", type: "RULES", risk: "YELLOW", quality: 100, impact: 1.4, security: "PASSED", install: "INSTALLED" },
  { slug: "demo/security-policy", name: "security-policy", type: "POLICY", risk: "YELLOW", quality: 84, security: "UNSCANNED", install: "STALE" },
  { slug: "demo/release-notes-template", name: "release-notes-template", type: "PROMPT_TEMPLATE", risk: "RED", quality: 62, security: "QUARANTINED", install: "INCOMPATIBLE" },
  { slug: "demo/checkout-runbook", name: "checkout-runbook", type: "DOCUMENTATION", risk: "GREEN", quality: 77, impact: 1.05, security: "PASSED", install: "INSTALLED" },
  { slug: "demo/deploy-workflow", name: "deploy-workflow", type: "WORKFLOW", risk: "YELLOW", quality: 88, security: "UNSCANNED", install: "STALE" },
];

const RUN_MODELS = ["claude-sonnet-5", "gpt-5.5", "claude-opus-4.8"];
const MODEL_PROVIDER: Record<string, string> = {
  "claude-sonnet-5": "anthropic",
  "gpt-5.5": "openai",
  "claude-opus-4.8": "anthropic",
};

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

type ActivityRow = {
  action: string; description: string; targetType?: string; targetId?: string;
  taskId?: Id<"tasks">; agentId?: Id<"agents">;
};

async function doSeed(ctx: MutationCtx): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const bump = (t: string, n = 1) => { counts[t] = (counts[t] ?? 0) + n; };
  const acts: ActivityRow[] = [];

  // 1. Project ------------------------------------------------------------
  const projectId = await ctx.db.insert("projects", {
    name: "Software Factory Demo",
    slug: PROJECT_SLUG,
    description: "Demo project for the Atlas Checkout narrative. Every row tagged seedTag=sf-demo; remove with seedFactoryDemo:clear.",
    githubRepo: REPO_SLUG,
    githubBranch: "main",
    taskPrefix: "DEMO",
    nextTaskNumber: TASK_SPECS.length + 1,
    swarmConfig: { maxAgents: 8, defaultModel: "claude-sonnet-5", autoScale: false },
    metadata: meta("project"),
  });
  bump("projects");
  acts.push({ action: "PROJECT_CREATED", description: "Demo project Software Factory Demo created", targetType: "project", targetId: projectId });

  // 2. Agents ---------------------------------------------------------------
  const agentIds: Record<string, Id<"agents">> = {};
  for (const a of AGENT_SPECS) {
    const id = await ctx.db.insert("agents", {
      projectId,
      name: a.name,
      emoji: a.emoji,
      role: a.role,
      status: a.status,
      workspacePath: `/workspaces/sf-demo/${a.key}`,
      allowedTaskTypes: a.taskTypes,
      allowedTools: ["Read", "Edit", "Bash", "convex"],
      budgetDaily: a.budgetDaily,
      budgetPerRun: Math.max(2, Math.round(a.budgetDaily / 8)),
      spendToday: a.spendToday,
      spendResetAt: NOW + 6 * HOUR,
      canSpawn: a.role === "LEAD",
      maxSubAgents: a.role === "LEAD" ? 4 : 0,
      lastHeartbeatAt: a.heartbeatAgoMs !== undefined ? NOW - a.heartbeatAgoMs : undefined,
      lastError: a.lastError,
      errorStreak: a.status === "QUARANTINED" ? 3 : 0,
      metadata: meta(`agent:${a.key}`, { persona: a.key.replace(/^demo-/, "") }),
    });
    agentIds[a.key] = id;
    bump("agents");
    acts.push({ action: "AGENT_REGISTERED", description: `Agent ${a.name} registered (${a.role}, ${a.status})`, targetType: "agent", targetId: id, agentId: id });
  }
  const supervisor = agentIds["pi-supervisor-demo"];
  const executor = agentIds["hermes-executor-demo"];

  // 3. Mission + goal hierarchy (COMPANY -> TEAM -> AGENT) -----------------
  const missionId = await ctx.db.insert("goals", {
    projectId, title: "Ship Atlas Checkout v2",
    description: "Mission: rebuild checkout for conversion, compliance, and < 1s p95.",
    level: "COMPANY", status: "ACTIVE", progressPct: 58,
    ownerUserId: "jay@missioncontrol.dev", targetDate: NOW + 21 * DAY,
    metadata: meta("goal:mission"),
  });
  bump("goals");
  const teamGoals: Array<[string, string, number, string]> = [
    ["team-payments", "Payments & compliance hardened", 65, "pi-supervisor-demo"],
    ["team-experience", "Checkout experience rebuilt on v2 shell", 50, "pi-supervisor-demo"],
  ];
  const teamGoalIds: Id<"goals">[] = [];
  for (const [key, title, pct, owner] of teamGoals) {
    teamGoalIds.push(await ctx.db.insert("goals", {
      projectId, title, level: "TEAM", parentGoalId: missionId, status: "ACTIVE",
      progressPct: pct, ownerAgentId: agentIds[owner], metadata: meta(`goal:${key}`),
    }));
    bump("goals");
  }
  const agentGoals: Array<[string, string, number, string, number]> = [
    ["agent-payment-intents", "Payment intents live with 0 duplicate charges", 90, "demo-coder", 0],
    ["agent-e2e", "E2E coverage for all checkout paths", 45, "demo-qa", 1],
    ["agent-fraud", "Fraud screening integrated", 10, "demo-security", 0],
  ];
  const agentGoalIds: Id<"goals">[] = [];
  for (const [key, title, pct, owner, parent] of agentGoals) {
    agentGoalIds.push(await ctx.db.insert("goals", {
      projectId, title, level: "AGENT", parentGoalId: teamGoalIds[parent],
      status: pct >= 90 ? "ACHIEVED" : "ACTIVE", progressPct: pct,
      ownerAgentId: agentIds[owner], achievedAt: pct >= 90 ? NOW - 2 * DAY : undefined,
      metadata: meta(`goal:${key}`),
    }));
    bump("goals");
  }

  // 4. Tasks + transitions + events ----------------------------------------
  const taskIds: Id<"tasks">[] = [];
  for (let i = 0; i < TASK_SPECS.length; i++) {
    const t = TASK_SPECS[i];
    const identifier = `DEMO-${String(i + 1).padStart(3, "0")}`;
    const createdAt = NOW - (30 - i) * DAY;
    const started = !["INBOX", "ASSIGNED", "CANCELED"].includes(t.status);
    const done = t.status === "DONE";
    const taskId = await ctx.db.insert("tasks", {
      projectId,
      identifier,
      goalId: agentGoalIds[i % agentGoalIds.length],
      title: t.title,
      description: `${t.title} — part of the Atlas Checkout v2 mission.${t.note ? ` ${t.note}` : ""}`,
      type: t.type,
      status: t.status,
      priority: t.priority,
      assigneeIds: [agentIds[t.agent]],
      creatorAgentId: supervisor,
      reviewerId: t.status === "REVIEW" || done ? agentIds["demo-qa"] : undefined,
      workPlan: started ? {
        bullets: ["Survey existing code paths", "Implement change behind flag", "Add tests + verify", "Hand off for review"],
        estimatedCost: 3 + (i % 5),
        estimatedDuration: `${2 + (i % 4)}h`,
      } : undefined,
      deliverable: done || t.status === "REVIEW" ? {
        summary: `Completed: ${t.title}`,
        content: `## Deliverable\n\n${t.title} implemented on branch demo/${identifier.toLowerCase()} with tests passing.`,
        artifactIds: [`demo-artifact-${identifier}`],
      } : undefined,
      reviewCycles: done ? 1 : 0,
      estimatedCost: 3 + (i % 5),
      actualCost: started ? Number((1.5 + (i % 7) * 0.8).toFixed(2)) : 0,
      startedAt: started ? createdAt + 4 * HOUR : undefined,
      submittedAt: done || t.status === "REVIEW" ? createdAt + 20 * HOUR : undefined,
      completedAt: done ? createdAt + 26 * HOUR : undefined,
      labels: ["sf-demo", t.type.toLowerCase()],
      blockedReason: t.status === "BLOCKED" ? t.note : undefined,
      source: "SEED",
      createdBy: "SYSTEM",
      createdByRef: FLAG_ACTOR,
      metadata: meta(`task:${identifier}`),
    });
    taskIds.push(taskId);
    bump("tasks");

    await ctx.db.insert("taskEvents", {
      projectId, taskId, eventType: "TASK_CREATED", actorType: "SYSTEM",
      actorId: FLAG_ACTOR, timestamp: createdAt, metadata: meta(`taskEvent:${identifier}:created`),
    });
    bump("taskEvents");

    const path = TRANSITION_PATHS[t.status];
    for (let s = 0; s < path.length; s++) {
      const [from, to] = path[s];
      const ts = createdAt + (s + 1) * 3 * HOUR;
      await ctx.db.insert("taskTransitions", {
        projectId, taskId,
        idempotencyKey: `${SEED_TAG}:transition:${identifier}:${s}`,
        fromStatus: from, toStatus: to,
        actorType: s === 0 ? "HUMAN" : "AGENT",
        actorAgentId: s === 0 ? undefined : agentIds[t.agent],
        actorUserId: s === 0 ? "jay@missioncontrol.dev" : undefined,
        validationResult: { valid: true },
        reason: t.note && s === path.length - 1 ? t.note : undefined,
        sessionKey: `${SEED_TAG}-session-${identifier}`,
      });
      bump("taskTransitions");
      await ctx.db.insert("taskEvents", {
        projectId, taskId, eventType: "TASK_TRANSITION",
        actorType: s === 0 ? "HUMAN" : "AGENT",
        actorId: s === 0 ? "jay@missioncontrol.dev" : t.agent,
        timestamp: ts,
        beforeState: { status: from }, afterState: { status: to },
        metadata: meta(`taskEvent:${identifier}:${s}`),
      });
      bump("taskEvents");
    }
    if (i % 3 === 0) {
      acts.push({ action: "TASK_UPDATED", description: `${identifier} ${t.title} → ${t.status}`, targetType: "task", targetId: taskId, taskId, agentId: agentIds[t.agent] });
    }
  }

  // 5. Work orders + events --------------------------------------------------
  const woIds: Id<"workOrders">[] = [];
  for (let i = 0; i < WO_SPECS.length; i++) {
    const w = WO_SPECS[i];
    const createdAt = NOW - (12 - i) * DAY;
    const active = ["IN_PROGRESS", "AWAITING_APPROVAL", "AWAITING_VERIFICATION", "DONE"].includes(w.state);
    const correlation = w.correlated ? {
      missionId: `mission-atlas-checkout`,
      taskId: `DEMO-${String(i + 1).padStart(3, "0")}`,
      executionId: `exec_${fakeHex(w.key).slice(0, 12)}`,
      runId: `run_${fakeHex(w.key + ":run").slice(0, 12)}`,
      bridgeRunId: `bridge_${fakeHex(w.key + ":bridge").slice(0, 12)}`,
      hermesSessionId: `hermes_${fakeHex(w.key + ":hermes").slice(0, 12)}`,
      pullRequestId: w.state === "DONE" || w.state === "AWAITING_VERIFICATION" ? `${REPO_SLUG}#${140 + i}` : undefined,
    } : undefined;
    const woId = await ctx.db.insert("workOrders", {
      projectId,
      idempotencyKey: `${SEED_TAG}:wo:${w.key}`,
      title: w.title,
      desiredOutcome: w.outcome,
      context: "Atlas Checkout v2 delivery stream (demo data).",
      repository: REPO_SLUG,
      branchStrategy: "feature-branch",
      priority: w.priority,
      riskLevel: w.risk,
      requestedBy: "jay@missioncontrol.dev",
      assignedAgent: active ? "hermes-executor-demo" : undefined,
      acceptanceCriteria: w.acStatuses.map((st, n) => ({
        id: `${w.key}-ac-${n + 1}`,
        title: [`Implementation complete`, `Tests green in CI`, `Docs updated`, `Rollout verified`][n % 4],
        verificationMethod: (["COMMAND", "TEST", "MANUAL", "CHECKLIST"] as const)[n % 4],
        status: st,
      })),
      constraints: ["No schema resets", "Feature-flagged rollout"],
      sourceOfTruthRefs: [{ kind: "REPO", label: "Atlas Checkout", location: `github.com/${REPO_SLUG}` }],
      requiredApprovals: w.risk === "CRITICAL" || w.risk === "HIGH" ? ["release-manager"] : undefined,
      state: w.state,
      verificationStatus: w.verification,
      approvalStatus: w.approval,
      blockingIssue: w.blocking,
      requiredHumanAction: w.humanAction,
      claimedByAgentId: active ? executor : undefined,
      claimLeaseExpiresAt: w.state === "IN_PROGRESS" ? NOW + 30 * 60 * 1000 : undefined,
      claimAttempt: active ? 1 : undefined,
      correlation,
      createdAt,
      updatedAt: createdAt + 2 * DAY,
      metadata: meta(`workOrder:${w.key}`),
    });
    woIds.push(woId);
    bump("workOrders");

    type WoEvent = [string, string, string | undefined, string | undefined];
    const events: WoEvent[] = [["WORK_ORDER_CREATED", `Work order created: ${w.title}`, undefined, "DRAFT"]];
    if (w.state !== "DRAFT" && w.state !== "CANCELED") events.push(["DISPATCH_REQUESTED", "Dispatch requested by operator", "DRAFT", "READY"]);
    if (active || w.state === "DISPATCHED") events.push(["DISPATCHED", "Dispatched to executor pool", "READY", "DISPATCHED"]);
    if (active) {
      events.push(["CLAIMED", "Claimed by hermes-executor-demo (lease 30m)", "DISPATCHED", "IN_PROGRESS"]);
      events.push(["EXECUTION_STATE", "Executor reported phase: implementation", undefined, undefined]);
    }
    if (w.state === "AWAITING_VERIFICATION" || w.state === "DONE") {
      events.push(["ARTIFACT_RECORDED", `Artifact recorded: PR ${REPO_SLUG}#${140 + i}`, undefined, undefined]);
      events.push(["VERIFICATION_RECORDED", `Verification recorded: ${w.verification}`, "IN_PROGRESS", "AWAITING_VERIFICATION"]);
    }
    if (w.state === "DONE") events.push(["RUN_COMPLETED", "All acceptance criteria PASS — closing", "AWAITING_VERIFICATION", "DONE"]);
    if (w.state === "CANCELED") events.push(["RUN_CANCELED", "Canceled: superseded by cart migration", "DRAFT", "CANCELED"]);
    for (let e = 0; e < events.length; e++) {
      const [eventType, summary, fromState, toState] = events[e];
      await ctx.db.insert("workOrderEvents", {
        projectId, workOrderId: woId,
        idempotencyKey: `${SEED_TAG}:woe:${w.key}:${e}`,
        eventType: eventType as never,
        fromState: fromState as never, toState: toState as never,
        actorType: e === 0 ? "HUMAN" : "AGENT",
        actorId: e === 0 ? "jay@missioncontrol.dev" : "hermes-executor-demo",
        summary, timestamp: createdAt + e * 5 * HOUR,
        metadata: meta(`woEvent:${w.key}:${e}`),
      });
      bump("workOrderEvents");
    }
    acts.push({ action: "WORK_ORDER_UPDATED", description: `Work order ${w.title} → ${w.state}`, targetType: "workOrder", targetId: woId });
  }

  // 6. Context registry: packages, versions, manifest, lock, installations --
  const pkgVersionIds: Record<string, Id<"contextPackageVersions">> = {};
  for (const p of PKG_SPECS) {
    const createdAt = NOW - 20 * DAY;
    const pkgId = await ctx.db.insert("contextPackages", {
      name: p.name,
      slug: p.slug,
      displayName: p.name.replace(/-/g, " "),
      description: `Demo ${p.type.toLowerCase().replace(/_/g, " ")} package for Atlas Checkout (${SEED_TAG}).`,
      type: p.type,
      status: "ACTIVE",
      owner: FLAG_ACTOR,
      tags: [SEED_TAG, p.type.toLowerCase()],
      riskLevel: p.risk,
      projectId,
      createdAt,
      updatedAt: createdAt + DAY,
    });
    bump("contextPackages");
    const versionId = await ctx.db.insert("contextPackageVersions", {
      packageId: pkgId,
      version: "1.0.0",
      status: "PUBLISHED",
      contentHash: sha(p.slug + "@1.0.0"),
      inlineContent: `# ${p.name}\n\nDemo ${p.type} content for ${REPO_SLUG}. Seeded by seedFactoryDemo (${SEED_TAG}).`,
      manifestVersion: "1",
      sourceRepo: REPO_SLUG,
      sourcePath: `context/${p.name}.md`,
      sourceCommitSha: fakeHex(p.slug).slice(0, 40),
      capabilities: [p.type.toLowerCase()],
      qualityScore: p.quality,
      impactScore: p.impact,
      securityStatus: p.security,
      approvedBy: "jay@missioncontrol.dev",
      approvedAt: createdAt + 12 * HOUR,
      publishedAt: createdAt + DAY,
      createdAt,
    });
    pkgVersionIds[p.slug] = versionId;
    bump("contextPackageVersions");
    await ctx.db.patch(pkgId, { currentVersionId: versionId });
    acts.push({ action: "CONTEXT_PACKAGE_PUBLISHED", description: `Published ${p.slug}@1.0.0 (quality ${p.quality}, security ${p.security})`, targetType: "contextPackage", targetId: pkgId });
  }

  const manifestJson = JSON.stringify({
    schemaVersion: "1",
    repo: REPO_SLUG,
    packages: PKG_SPECS.map((p) => ({ slug: p.slug, range: "^1.0.0" })),
    seedTag: SEED_TAG,
  });
  await ctx.db.insert("contextManifests", {
    repoSlug: REPO_SLUG, manifestJson, schemaVersion: "1",
    updatedBy: FLAG_ACTOR, createdAt: NOW - 15 * DAY, updatedAt: NOW - 2 * DAY,
  });
  bump("contextManifests");
  await ctx.db.insert("contextLocks", {
    repoSlug: REPO_SLUG,
    lockJson: JSON.stringify({
      schemaVersion: "1",
      resolved: PKG_SPECS.map((p) => ({ slug: p.slug, version: "1.0.0", contentHash: sha(p.slug + "@1.0.0") })),
      seedTag: SEED_TAG,
    }),
    manifestHash: sha(manifestJson),
    resolvedCount: PKG_SPECS.length,
    createdAt: NOW - 2 * DAY,
  });
  bump("contextLocks");
  for (const p of PKG_SPECS) {
    await ctx.db.insert("contextInstallations", {
      repoSlug: REPO_SLUG,
      packageSlug: p.slug,
      versionId: pkgVersionIds[p.slug],
      version: p.install === "STALE" ? "0.9.0" : "1.0.0",
      contentHash: sha(p.slug + (p.install === "STALE" ? "@0.9.0" : "@1.0.0")),
      state: p.install,
      createdAt: NOW - 14 * DAY,
      updatedAt: NOW - DAY,
    });
    bump("contextInstallations");
  }

  // 7+8. Runs (with context snapshots on 4), toolCalls, costEvents -----------
  const runStatuses: Array<"RUNNING" | "COMPLETED" | "FAILED" | "TIMEOUT"> = [
    "COMPLETED", "COMPLETED", "COMPLETED", "FAILED", "COMPLETED", "TIMEOUT",
    "COMPLETED", "COMPLETED", "RUNNING", "COMPLETED", "FAILED", "COMPLETED",
    "TIMEOUT", "RUNNING", "COMPLETED",
  ];
  const runAgents = ["hermes-executor-demo", "demo-coder", "demo-qa", "pi-supervisor-demo", "demo-research"];
  const runIds: Id<"runs">[] = [];
  for (let i = 0; i < 15; i++) {
    const status = runStatuses[i];
    const model = RUN_MODELS[i % RUN_MODELS.length];
    const agentKey = runAgents[i % runAgents.length];
    const startedAt = NOW - (15 - i) * 12 * HOUR;
    const durationMs = (5 + (i % 9) * 4) * 60 * 1000;
    const inputTokens = 40_000 + i * 9_000;
    const outputTokens = 6_000 + i * 1_500;
    const costUsd = Number(((inputTokens / 1e6) * 3 + (outputTokens / 1e6) * 15).toFixed(4));
    // No contextSnapshots table exists in the schema; snapshots ride on run
    // metadata (packages array with hashes) for four runs.
    const snapshot = i < 4 ? {
      snapshotId: `${SEED_TAG}-snap-${i + 1}`,
      capturedAt: startedAt,
      packages: PKG_SPECS.slice(0, 3 + i).map((p) => ({
        slug: p.slug, version: "1.0.0", contentHash: sha(p.slug + "@1.0.0"),
      })),
    } : undefined;
    const runId = await ctx.db.insert("runs", {
      projectId,
      idempotencyKey: `${SEED_TAG}:run:${i + 1}`,
      agentId: agentIds[agentKey],
      taskId: taskIds[i % taskIds.length],
      sessionKey: `${SEED_TAG}-session-${i + 1}`,
      sessionLogRefs: i < 2 ? [{
        kind: i === 0 ? "HERMES_SESSION" : "PI_TAPE",
        path: `/var/log/sf-demo/${i === 0 ? "hermes" : "pi"}-run-${i + 1}.jsonl`,
        sha256: fakeHex(`log:${i}`),
        sizeBytes: 128_000 + i * 64_000,
        excerpt: status === "FAILED" ? "Error: vitest exited 1 (3 failures in currency.spec.ts)" : undefined,
      }] : undefined,
      startedAt,
      endedAt: status === "RUNNING" ? undefined : startedAt + durationMs,
      durationMs: status === "RUNNING" ? undefined : durationMs,
      model,
      inputTokens,
      outputTokens,
      cacheReadTokens: 12_000 + i * 2_000,
      costUsd,
      status,
      error: status === "FAILED" ? "Test suite failed after 2 retries" : status === "TIMEOUT" ? "Executor lease expired after 45m" : undefined,
      metadata: meta(`run:${i + 1}`, snapshot ? { contextSnapshot: snapshot } : undefined),
    });
    runIds.push(runId);
    bump("runs");
    if (snapshot) bump("contextSnapshots(run.metadata)");

    await ctx.db.insert("costEvents", {
      projectId,
      agentId: agentIds[agentKey],
      taskId: taskIds[i % taskIds.length],
      goalId: missionId,
      runId,
      provider: MODEL_PROVIDER[model],
      model,
      inputTokens, outputTokens,
      cacheReadTokens: 12_000 + i * 2_000,
      costCents: Math.round(costUsd * 100),
      occurredAt: startedAt + durationMs,
      billingCode: "sf-demo",
      metadata: meta(`costEvent:${i + 1}`),
    });
    bump("costEvents");
  }

  const toolSpecs: Array<[string, "GREEN" | "YELLOW" | "RED", "SUCCESS" | "FAILED" | "DENIED"]> = [
    ["Read", "GREEN", "SUCCESS"], ["Grep", "GREEN", "SUCCESS"], ["Edit", "YELLOW", "SUCCESS"],
    ["Bash", "YELLOW", "SUCCESS"], ["git_push", "YELLOW", "SUCCESS"], ["Bash", "YELLOW", "FAILED"],
    ["deploy_production", "RED", "DENIED"], ["Edit", "GREEN", "SUCCESS"], ["convex_run", "YELLOW", "SUCCESS"],
    ["stripe_config_write", "RED", "SUCCESS"],
  ];
  for (let i = 0; i < toolSpecs.length; i++) {
    const [toolName, risk, status] = toolSpecs[i];
    const runIdx = i % 6;
    await ctx.db.insert("toolCalls", {
      projectId,
      runId: runIds[runIdx],
      agentId: agentIds[runAgents[runIdx % runAgents.length]],
      taskId: taskIds[i % taskIds.length],
      toolName,
      riskLevel: risk,
      policyResult: status === "DENIED"
        ? { decision: "DENY", reason: "RED-tier tool requires dual-control approval; none present" }
        : { decision: "ALLOW", reason: risk === "GREEN" ? "Auto-approved (GREEN)" : "Within policy envelope" },
      inputPreview: `${toolName}(...) — demo preview`,
      outputPreview: status === "SUCCESS" ? "ok" : undefined,
      inputHash: fakeHex(`tool:${i}:in`),
      startedAt: NOW - (10 - i) * HOUR,
      endedAt: NOW - (10 - i) * HOUR + 4_000,
      durationMs: 4_000,
      status,
      error: status === "FAILED" ? "exit code 1" : undefined,
      retryCount: status === "FAILED" ? 2 : 0,
    });
    bump("toolCalls");
  }

  // 9. Approvals + approvalRecords -------------------------------------------
  type ApprovalSpec = {
    key: string; risk: "YELLOW" | "RED"; status: "PENDING" | "APPROVED" | "DENIED";
    action: string; summary: string; dual?: boolean; taskIdx: number;
  };
  const approvalSpecs: ApprovalSpec[] = [
    { key: "ap-1", risk: "YELLOW", status: "PENDING", action: "deploy_staging", summary: "Deploy checkout v2 to staging", taskIdx: 15 },
    { key: "ap-2", risk: "YELLOW", status: "PENDING", action: "bulk_email_send", summary: "Send abandonment email sequence to 4,200 users", taskIdx: 22 },
    { key: "ap-3", risk: "RED", status: "PENDING", action: "deploy_production", summary: "Deploy checkout v2 to production (dual control)", dual: true, taskIdx: 15 },
    { key: "ap-4", risk: "YELLOW", status: "APPROVED", action: "git_push_protected", summary: "Push payment-intent service to release branch", taskIdx: 0 },
    { key: "ap-5", risk: "RED", status: "DENIED", action: "rotate_live_keys", summary: "Rotate live Stripe keys during peak hours", taskIdx: 14 },
  ];
  for (const a of approvalSpecs) {
    const requestedAt = NOW - 3 * DAY;
    const decided = a.status !== "PENDING";
    const approvalId = await ctx.db.insert("approvals", {
      projectId,
      idempotencyKey: `${SEED_TAG}:approval:${a.key}`,
      taskId: taskIds[a.taskIdx],
      requestorAgentId: a.key === "ap-5" ? agentIds["demo-security"] : executor,
      actionType: a.action,
      actionSummary: a.summary,
      riskLevel: a.risk,
      estimatedCost: a.risk === "RED" ? 25 : 5,
      rollbackPlan: "Revert deploy via previous image tag; flags off.",
      justification: `${a.summary} — required for Atlas Checkout v2 launch.`,
      status: a.status,
      decidedByUserId: decided ? "jay@missioncontrol.dev" : undefined,
      decidedAt: decided ? requestedAt + 6 * HOUR : undefined,
      decisionReason: a.status === "APPROVED" ? "Verified in staging; approved."
        : a.status === "DENIED" ? "Too risky during peak traffic; reschedule." : undefined,
      firstDecisionByUserId: a.dual ? "jay@missioncontrol.dev" : undefined,
      firstDecisionAt: a.dual ? requestedAt + 2 * HOUR : undefined,
      firstDecisionReason: a.dual ? "First approval recorded; awaiting second approver." : undefined,
      requiredDecisionCount: a.dual ? 2 : 1,
      decisionCount: a.dual ? 1 : decided ? 1 : 0,
      expiresAt: NOW + 4 * DAY,
    });
    bump("approvals");
    await ctx.db.insert("approvalRecords", {
      projectId,
      legacyApprovalId: approvalId,
      actionType: a.action,
      riskLevel: a.risk,
      rollbackPlan: "Revert deploy via previous image tag; flags off.",
      justification: `${a.summary} — required for Atlas Checkout v2 launch.`,
      status: a.status,
      requestedAt,
      decidedAt: decided ? requestedAt + 6 * HOUR : undefined,
      decisionReason: a.status === "APPROVED" ? "Verified in staging; approved."
        : a.status === "DENIED" ? "Too risky during peak traffic; reschedule." : undefined,
      metadata: meta(`approvalRecord:${a.key}`),
    });
    bump("approvalRecords");
    acts.push({ action: "APPROVAL_" + a.status, description: `${a.summary} (${a.risk}) — ${a.status}`, targetType: "approval", targetId: approvalId, taskId: taskIds[a.taskIdx] });
  }

  // 10. Content drops, alerts, notifications, docs, learning, quotas ---------
  const dropSpecs: Array<["BLOG_POST" | "REPORT" | "CODE_SNIPPET" | "EMAIL_DRAFT" | "SOCIAL_POST", string, "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "PUBLISHED", string]> = [
    ["BLOG_POST", "Announcing Atlas Checkout v2", "PUBLISHED", "demo-docs"],
    ["REPORT", "Checkout load test results — 500 rps", "APPROVED", "demo-qa"],
    ["CODE_SNIPPET", "Idempotent payment-intent helper", "SUBMITTED", "demo-coder"],
    ["EMAIL_DRAFT", "Cart abandonment email #1", "DRAFT", "demo-docs"],
    ["SOCIAL_POST", "Launch-week teaser thread", "REJECTED", "demo-research"],
  ];
  for (let i = 0; i < dropSpecs.length; i++) {
    const [contentType, title, status, agentKey] = dropSpecs[i];
    await ctx.db.insert("contentDrops", {
      projectId,
      agentId: agentIds[agentKey],
      taskId: taskIds[(i + 3) % taskIds.length],
      title,
      contentType,
      content: `# ${title}\n\nDemo deliverable content produced by ${agentKey} for Atlas Checkout v2.`,
      summary: `${title} (demo)`,
      status,
      reviewedBy: status === "APPROVED" || status === "REJECTED" || status === "PUBLISHED" ? "jay@missioncontrol.dev" : undefined,
      reviewedAt: status === "DRAFT" || status === "SUBMITTED" ? undefined : NOW - i * DAY,
      reviewNote: status === "REJECTED" ? "Tone off-brand; rewrite with launch messaging." : undefined,
      tags: [SEED_TAG],
      metadata: meta(`contentDrop:${i + 1}`),
      idempotencyKey: `${SEED_TAG}:drop:${i + 1}`,
    });
    bump("contentDrops");
  }

  const alertSpecs: Array<["WARNING" | "ERROR" | "CRITICAL", string, string, "OPEN" | "ACKNOWLEDGED" | "RESOLVED", string]> = [
    ["WARNING", "BUDGET_THRESHOLD", "hermes-executor-demo at 80% of daily budget", "OPEN", "hermes-executor-demo"],
    ["ERROR", "RUN_FAILED", "Run failed: currency rounding fix (vitest 3/14 failing)", "ACKNOWLEDGED", "demo-coder"],
    ["CRITICAL", "AGENT_QUARANTINED", "demo-security quarantined after unauthorized RED-tier tool call", "RESOLVED", "demo-security"],
  ];
  for (let i = 0; i < alertSpecs.length; i++) {
    const [severity, type, description, status, agentKey] = alertSpecs[i];
    await ctx.db.insert("alerts", {
      projectId, severity, type,
      title: description.split(":")[0],
      description,
      agentId: agentIds[agentKey],
      runId: severity === "ERROR" ? runIds[3] : undefined,
      status,
      acknowledgedBy: status === "OPEN" ? undefined : "jay@missioncontrol.dev",
      acknowledgedAt: status === "OPEN" ? undefined : NOW - 12 * HOUR,
      resolvedAt: status === "RESOLVED" ? NOW - 6 * HOUR : undefined,
      resolutionNote: status === "RESOLVED" ? "Policy envelope tightened; agent remains quarantined pending review." : undefined,
      metadata: meta(`alert:${i + 1}`),
    });
    bump("alerts");
  }

  const notifSpecs: Array<["MENTION" | "TASK_ASSIGNED" | "TASK_TRANSITION" | "APPROVAL_REQUESTED" | "APPROVAL_DECIDED" | "SYSTEM", string, string]> = [
    ["MENTION", "pi-supervisor-demo mentioned you on DEMO-009", "hermes-executor-demo"],
    ["TASK_ASSIGNED", "You were assigned DEMO-010: Tax calculation for EU VAT zones", "demo-coder"],
    ["TASK_TRANSITION", "DEMO-020 moved to FAILED", "pi-supervisor-demo"],
    ["APPROVAL_REQUESTED", "RED approval pending: Deploy checkout v2 to production", "pi-supervisor-demo"],
    ["APPROVAL_DECIDED", "Approved: push payment-intent service to release branch", "hermes-executor-demo"],
    ["SYSTEM", "Nightly QC sweep completed with 2 RED findings", "pi-supervisor-demo"],
  ];
  for (let i = 0; i < notifSpecs.length; i++) {
    const [type, title, agentKey] = notifSpecs[i];
    await ctx.db.insert("notifications", {
      projectId, agentId: agentIds[agentKey], type, title,
      body: `${title} (demo notification)`,
      taskId: taskIds[(i + 8) % taskIds.length],
      readAt: i % 2 === 0 ? undefined : NOW - i * HOUR,
      metadata: meta(`notification:${i + 1}`),
    });
    bump("notifications");
  }

  for (const agentKey of ["pi-supervisor-demo", "hermes-executor-demo"]) {
    await ctx.db.insert("agentDocuments", {
      projectId, agentId: agentIds[agentKey], type: "WORKING_MD",
      content: `# WORKING.md — ${agentKey}\n\n## Current focus\n- Atlas Checkout v2 delivery\n- Cart persistence migration (DEMO-009)\n\n## Notes\n- Dual-control approval still pending for production deploy.\n- QC sweep flagged VAT edge cases; follow up with demo-coder.`,
      updatedAt: NOW - 3 * HOUR,
      metadata: meta(`agentDocument:${agentKey}`),
    });
    bump("agentDocuments");
  }

  const perfSpecs: Array<[string, string, number, number]> = [
    ["demo-coder", "ENGINEERING", 14, 2],
    ["hermes-executor-demo", "ENGINEERING", 11, 3],
    ["demo-qa", "OPS", 8, 1],
    ["demo-docs", "DOCS", 6, 0],
  ];
  for (const [agentKey, taskType, ok, fail] of perfSpecs) {
    await ctx.db.insert("agentPerformance", {
      projectId, agentId: agentIds[agentKey], taskType,
      successCount: ok, failureCount: fail,
      avgCompletionTimeMs: 42 * 60 * 1000,
      avgCostUsd: 2.35,
      totalTasksCompleted: ok,
      lastUpdatedAt: NOW - DAY,
    });
    bump("agentPerformance");
  }
  const patternSpecs: Array<[string, string, number, string[]]> = [
    ["demo-coder", "strong-at:payment-integrations", 0.92, ["DEMO-001 completed under budget", "DEMO-002 zero review cycles"]],
    ["demo-coder", "weak-at:currency-edge-cases", 0.71, ["DEMO-020 failed twice on JPY rounding"]],
    ["hermes-executor-demo", "strong-at:long-running-migrations", 0.84, ["DEMO-009 steady progress across 6 sessions"]],
    ["demo-qa", "strong-at:load-testing", 0.88, ["DEMO-011 found N+1 before rollout"]],
  ];
  for (let i = 0; i < patternSpecs.length; i++) {
    const [agentKey, pattern, confidence, evidence] = patternSpecs[i];
    await ctx.db.insert("agentPatterns", {
      projectId, agentId: agentIds[agentKey], pattern, confidence, evidence,
      discoveredAt: NOW - 10 * DAY, lastSeenAt: NOW - DAY,
      metadata: meta(`agentPattern:${i + 1}`),
    });
    bump("agentPatterns");
  }

  // quotaSnapshots has no metadata/projectId field: tagged via planTier prefix.
  const quotaSpecs: Array<["anthropic" | "openai" | "google", number]> = [
    ["anthropic", 62], ["openai", 38], ["google", 11],
  ];
  for (const [provider, usagePct] of quotaSpecs) {
    await ctx.db.insert("quotaSnapshots", {
      provider, planTier: `${QUOTA_TIER_PREFIX}max-20x`,
      usagePct, resetAt: NOW + 5 * HOUR,
      tokensUsed: usagePct * 1_000_000, tokensLimit: 100_000_000,
      recordedAt: NOW - HOUR,
    });
    bump("quotaSnapshots");
  }

  // 10b. Workflow runs + QC -----------------------------------------------
  const wfSteps = (statuses: Array<"PENDING" | "RUNNING" | "DONE" | "FAILED">, err?: string) =>
    statuses.map((status, n) => ({
      stepId: ["plan", "implement", "verify"][n],
      status,
      agentId: executor,
      startedAt: status === "PENDING" ? undefined : NOW - (6 - n) * HOUR,
      completedAt: status === "DONE" ? NOW - (5 - n) * HOUR : undefined,
      retryCount: status === "FAILED" ? 2 : 0,
      error: status === "FAILED" ? err : undefined,
    }));
  await ctx.db.insert("workflowRuns", {
    runId: "demo-wr-001", workflowId: "demo-feature-delivery", projectId,
    workOrderId: woIds[3], status: "RUNNING",
    currentStepIndex: 1, totalSteps: 3,
    steps: wfSteps(["DONE", "RUNNING", "PENDING"]),
    context: { repo: REPO_SLUG, branch: "demo/cart-persistence" },
    initialInput: "Migrate cart persistence server-side (work order wo-04).",
    runtime: "pi-bridge", model: "claude-sonnet-5",
    worktree: "/workspaces/sf-demo/worktrees/cart-persistence",
    humanInterventions: 0,
    startedAt: NOW - 6 * HOUR,
    metadata: meta("workflowRun:1"),
  });
  await ctx.db.insert("workflowRuns", {
    runId: "demo-wr-002", workflowId: "demo-feature-delivery", projectId,
    workOrderId: woIds[4], status: "FAILED",
    currentStepIndex: 2, totalSteps: 3,
    steps: wfSteps(["DONE", "DONE", "FAILED"], "Verification failed: vendor sandbox unreachable"),
    context: { repo: REPO_SLUG, branch: "demo/fraud-screening" },
    initialInput: "Integrate fraud-screening vendor (work order wo-05).",
    runtime: "pi-bridge", model: "gpt-5.5",
    worktree: "/workspaces/sf-demo/worktrees/fraud-screening",
    failureReason: "Verification step failed twice: vendor sandbox credentials rejected",
    humanInterventions: 1,
    startedAt: NOW - 2 * DAY, completedAt: NOW - 2 * DAY + 3 * HOUR,
    metadata: meta("workflowRun:2"),
  });
  bump("workflowRuns", 2);

  const qcRun1 = await ctx.db.insert("qcRuns", {
    projectId, runId: "demo-qc-001", runSequence: 9001, status: "COMPLETED",
    riskGrade: "GREEN", qualityScore: 92,
    repoUrl: `https://github.com/${REPO_SLUG}`, branch: "main",
    commitSha: fakeHex("qc1").slice(0, 40),
    scopeType: "BRANCH_DIFF", initiatorType: "WORKFLOW", initiatorId: "demo-wr-001",
    checkType: "CODE_REVIEW", environment: "staging",
    findingCounts: { red: 0, yellow: 1, green: 3, info: 1 }, gatePassed: true,
    startedAt: NOW - 5 * HOUR, completedAt: NOW - 5 * HOUR + 9 * 60 * 1000, durationMs: 9 * 60 * 1000,
    idempotencyKey: `${SEED_TAG}:qc:1`, metadata: meta("qcRun:1"),
  });
  const qcRun2 = await ctx.db.insert("qcRuns", {
    projectId, runId: "demo-qc-002", runSequence: 9002, status: "COMPLETED",
    riskGrade: "RED", qualityScore: 58,
    repoUrl: `https://github.com/${REPO_SLUG}`, branch: "demo/fraud-screening",
    commitSha: fakeHex("qc2").slice(0, 40),
    scopeType: "FULL_REPO", initiatorType: "HUMAN", initiatorId: "jay@missioncontrol.dev",
    checkType: "SECURITY", environment: "dev",
    findingCounts: { red: 2, yellow: 1, green: 0, info: 0 }, gatePassed: false,
    startedAt: NOW - DAY, completedAt: NOW - DAY + 14 * 60 * 1000, durationMs: 14 * 60 * 1000,
    idempotencyKey: `${SEED_TAG}:qc:2`, metadata: meta("qcRun:2"),
  });
  bump("qcRuns", 2);

  const findingSpecs: Array<[Id<"qcRuns">, "RED" | "YELLOW" | "GREEN" | "INFO", string, string]> = [
    [qcRun2, "RED", "SECURITY_GAP", "Vendor API key logged in plaintext during sandbox handshake"],
    [qcRun2, "RED", "CONFIG_MISSING", "Fraud-screening webhook secret absent from staging env"],
    [qcRun2, "YELLOW", "COVERAGE_GAP", "No tests for screening-timeout fallback path"],
    [qcRun1, "YELLOW", "DOCS_DRIFT", "Checkout API docs missing new idempotency header"],
    [qcRun1, "INFO", "DEPENDENCY_RISK", "stripe SDK one minor version behind"],
  ];
  for (let i = 0; i < findingSpecs.length; i++) {
    const [qcRunId, severity, category, title] = findingSpecs[i];
    await ctx.db.insert("qcFindings", {
      projectId, qcRunId, severity, category: category as never,
      title, description: `${title}. Seeded QC finding for the Atlas Checkout demo.`,
      filePaths: ["src/checkout/screening.ts"],
      suggestedFix: severity === "RED" ? "Redact secrets from logs and add env validation at boot." : undefined,
      confidence: 0.9 - i * 0.1,
      linkedTaskId: taskIds[17],
      metadata: meta(`qcFinding:${i + 1}`),
    });
    bump("qcFindings");
  }

  // 11. Feature flags (GLOBAL) — only rows we create are tagged for clear ---
  for (const key of DEMO_FLAGS) {
    const existing = (await ctx.db.query("featureFlags").withIndex("by_key", (q) => q.eq("key", key)).collect())
      .find((f) => f.projectId === undefined);
    if (existing) {
      await ctx.db.patch(existing._id, { enabled: true, updatedAt: NOW });
      bump("featureFlags(patched)");
    } else {
      await ctx.db.insert("featureFlags", {
        key, enabled: true, description: `Enabled by ${FLAG_ACTOR} for the demo branch`,
        updatedBy: FLAG_ACTOR, createdAt: NOW, updatedAt: NOW,
      });
      bump("featureFlags(created)");
    }
  }

  // Activities (accumulated across all domains) ----------------------------
  for (const a of acts) {
    await ctx.db.insert("activities", {
      projectId,
      actorType: a.action.startsWith("APPROVAL") ? "HUMAN" : "SYSTEM",
      actorId: FLAG_ACTOR,
      action: a.action,
      description: a.description,
      targetType: a.targetType,
      targetId: a.targetId,
      taskId: a.taskId,
      agentId: a.agentId,
      metadata: meta(`activity:${a.action}:${a.targetId ?? ""}`),
    });
    bump("activities");
  }

  return counts;
}

// ---------------------------------------------------------------------------
// Clearing — deletes exactly and only seed rows
// ---------------------------------------------------------------------------

const PROJECT_SCOPED_TABLES = [
  "agents", "goals", "tasks", "taskTransitions", "taskEvents",
  "workOrders", "workOrderEvents", "runs", "toolCalls", "costEvents",
  "approvals", "approvalRecords", "contentDrops", "alerts", "activities",
  "notifications", "agentDocuments", "agentPerformance", "agentPatterns",
  "workflowRuns", "qcRuns", "qcFindings",
] as const;

async function findDemoProject(ctx: { db: MutationCtx["db"] }) {
  return await ctx.db
    .query("projects")
    .withIndex("by_slug", (q) => q.eq("slug", PROJECT_SLUG))
    .first();
}

async function doClear(ctx: MutationCtx): Promise<Record<string, number>> {
  const removed: Record<string, number> = {};
  const project = await findDemoProject(ctx);

  if (project) {
    for (const table of PROJECT_SCOPED_TABLES) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
      if (rows.length > 0) removed[table] = rows.length;
    }
  }

  // Context registry rows for the demo repo / demo/* slugs
  for (const table of ["contextManifests", "contextLocks", "contextInstallations"] as const) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_repo", (q) => q.eq("repoSlug", REPO_SLUG))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length > 0) removed[table] = rows.length;
  }
  const allPackages = await ctx.db.query("contextPackages").collect();
  for (const pkg of allPackages) {
    if (!pkg.slug.startsWith("demo/")) continue;
    const versions = await ctx.db
      .query("contextPackageVersions")
      .withIndex("by_package", (q) => q.eq("packageId", pkg._id))
      .collect();
    for (const version of versions) await ctx.db.delete(version._id);
    removed.contextPackageVersions = (removed.contextPackageVersions ?? 0) + versions.length;
    await ctx.db.delete(pkg._id);
    removed.contextPackages = (removed.contextPackages ?? 0) + 1;
  }

  // quotaSnapshots: tagged via planTier prefix (table has no metadata field)
  const quotas = await ctx.db.query("quotaSnapshots").collect();
  for (const q of quotas) {
    if (q.planTier.startsWith(QUOTA_TIER_PREFIX)) {
      await ctx.db.delete(q._id);
      removed.quotaSnapshots = (removed.quotaSnapshots ?? 0) + 1;
    }
  }

  // featureFlags: only rows this seed created (updatedBy tag)
  const flags = await ctx.db.query("featureFlags").collect();
  for (const flag of flags) {
    if (flag.updatedBy === FLAG_ACTOR) {
      await ctx.db.delete(flag._id);
      removed.featureFlags = (removed.featureFlags ?? 0) + 1;
    }
  }

  if (project) {
    await ctx.db.delete(project._id);
    removed.projects = 1;
  }
  return removed;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const run = mutation({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const existing = await findDemoProject(ctx);
    if (existing && !args.force) {
      return {
        status: "exists",
        message: `Demo project '${PROJECT_SLUG}' already seeded. Pass {"force":true} to reseed.`,
      };
    }
    let cleared: Record<string, number> | undefined;
    if (existing) cleared = await doClear(ctx);
    const counts = await doSeed(ctx);
    return { status: "seeded", seedTag: SEED_TAG, cleared, counts };
  },
});

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const removed = await doClear(ctx);
    const total = Object.values(removed).reduce((a, b) => a + b, 0);
    return { status: "cleared", seedTag: SEED_TAG, totalRemoved: total, removed };
  },
});

export const status = query({
  args: {},
  handler: async (ctx) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", PROJECT_SLUG))
      .first();
    const counts: Record<string, number> = {};
    if (project) {
      for (const table of PROJECT_SCOPED_TABLES) {
        const rows = await ctx.db
          .query(table)
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect();
        counts[table] = rows.length;
      }
      for (const table of ["contextManifests", "contextLocks", "contextInstallations"] as const) {
        counts[table] = (await ctx.db
          .query(table)
          .withIndex("by_repo", (q) => q.eq("repoSlug", REPO_SLUG))
          .collect()).length;
      }
      const demoPackages = (await ctx.db.query("contextPackages").collect())
        .filter((p) => p.slug.startsWith("demo/"));
      counts.contextPackages = demoPackages.length;
      let versionCount = 0;
      for (const pkg of demoPackages) {
        versionCount += (await ctx.db
          .query("contextPackageVersions")
          .withIndex("by_package", (q) => q.eq("packageId", pkg._id))
          .collect()).length;
      }
      counts.contextPackageVersions = versionCount;
      counts.quotaSnapshots = (await ctx.db.query("quotaSnapshots").collect())
        .filter((q) => q.planTier.startsWith(QUOTA_TIER_PREFIX)).length;
      counts.featureFlags = (await ctx.db.query("featureFlags").collect())
        .filter((f) => f.updatedBy === FLAG_ACTOR).length;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return { seeded: project !== null, seedTag: SEED_TAG, projectSlug: PROJECT_SLUG, totalRows: total + (project ? 1 : 0), counts };
  },
});
