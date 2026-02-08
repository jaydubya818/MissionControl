# Mission Control for OpenClaw - Implementation Plan v0.9

**Target:** MVP in 6–8 weeks  
**Owner:** Jarrett West  
**Status:** Planning Phase  
**Last Updated:** 2026-02-01

---

## Executive Summary

Mission Control transforms multiple OpenClaw agent sessions into a coherent digital team with:
- **Deterministic task state machine** (9 states, strict transitions)
- **Thread-per-task collaboration** with @mentions and subscriptions
- **Safety guardrails**: budgets, approvals, risk classification, emergency controls
- **Deep observability**: timeline view, cost attribution, audit logs
- **Operator control**: pause/drain/quarantine agents, approve risky actions

**Core Tech Stack:**
- **Backend:** TypeScript + Node.js
- **Database:** Convex (with abstraction layer for future swap)
- **Frontend:** React + TypeScript + Tailwind CSS
- **Deployment:** Docker Compose (single VPS or local)
- **Messaging:** Telegram (primary), Slack (future)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Mission Control UI                        │
│              (React + WebSocket/SSE updates)                 │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────┐
│              Mission Control API (Express)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Task Manager │  │ Agent Mgmt   │  │ Policy Engine│      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ State Machine│  │ Approvals    │  │ Cost Tracker │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────┐
│                   Convex Database                            │
│  agents | tasks | messages | approvals | activities |       │
│  taskTransitions | runs | toolCalls | policies | alerts     │
└─────────────────────────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────┐
│                Workers & Daemons                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Notification │  │ Heartbeat    │  │ Loop Detector│      │
│  │ Dispatcher   │  │ Monitor      │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Budget       │  │ Approval     │  │ Daily Standup│      │
│  │ Enforcer     │  │ Processor    │  │ Generator    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────────┐
│              OpenClaw Gateway (External)                     │
│         Runs agent sessions via Telegram/Slack               │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase Breakdown

### Phase 1: Foundation (Weeks 1-2)
**Goal:** Core infrastructure + basic task/agent management

**Deliverables:**
1. Repository structure with monorepo setup
2. Convex schema (agents, tasks, taskTransitions, messages)
3. State machine validator (hard-coded transition rules)
4. Agent registry CRUD + lifecycle controls (pause/drain/quarantine)
5. Task CRUD with status transitions
6. Basic API endpoints (Express)
7. Simple React UI: agent list + Kanban board + live feed
8. Docker Compose setup (API + UI + Convex dev)

**Acceptance Criteria:**
- Can create/read/update agents via API
- Can create tasks and transition them through valid states
- Invalid transitions are rejected with clear error
- UI displays agents and tasks in real-time
- Docker Compose brings up full stack locally

---

### Phase 2: Safety & Collaboration (Weeks 3-4)
**Goal:** Approvals, budgets, thread mapping, containment

**Deliverables:**
1. Policy engine module (risk classification, approval rules)
2. Approvals workflow (queue, approve/deny, record)
3. Budget tracking (per-agent daily, per-task, per-run caps)
4. Cost attribution scaffolding (record run/tool costs)
5. Thread mapping (threadRef per task, subscriptions, @mentions)
6. Notification dispatcher daemon (idempotent delivery)
7. Loop detection daemon (comment rate, retry patterns)
8. Emergency controls (pause squad, quarantine agent, e-stop)
9. UI: Approvals inbox, BLOCKED/NEEDS_APPROVAL columns, incident banner

**Acceptance Criteria:**
- Risky tool actions trigger approval requests
- Budget exceeded → task moves to NEEDS_APPROVAL or BLOCKED
- Operator can approve/deny actions with audit trail
- Loop detection triggers task → BLOCKED + alert
- Pause/quarantine controls work end-to-end
- Notifications delivered with idempotency (no duplicates)

---

### Phase 3: Observability & Polish (Weeks 5-6)
**Goal:** Timeline view, cost reporting, audit logs, operational readiness

**Deliverables:**
1. Task timeline view (transitions, runs, tool calls, approvals, alerts)
2. Run tracking (runId, startTime, endTime, status, cost)
3. Tool call logging (tool, risk, duration, redacted I/O)
4. Cost rollup reports (per-agent, per-task, daily)
5. Audit log export (JSON/CSV)
6. Task detail drawer (tabs: Overview, Timeline, Artifacts, Approvals, Cost)
7. Global search (tasks, agents, messages)
8. Daily standup cron (summary of yesterday's work)
9. RUNBOOK.md (start/stop, common incidents, recovery procedures)
10. Git soul templates (agent config versioning)

**Acceptance Criteria:**
- Task timeline shows complete execution history
- Cost attribution accurate to ±5%
- Audit logs capture every state transition + tool call
- Operator can answer "what happened, who, why, cost" in <60s
- RUNBOOK covers startup, shutdown, budget breach, loop incident
- Daily standup generates useful summary

---

### Phase 4: Hardening & Launch Prep (Weeks 7-8)
**Goal:** Testing, documentation, production readiness

**Deliverables:**
1. Integration tests (state machine, policy engine, approvals)
2. Load testing (100+ tasks/day, 20 agents)
3. Security audit (secrets redaction, allowlists, approval bypass checks)
4. Deployment guide (VPS setup, env vars, SSL, backups)
5. Operator training materials (video walkthrough, FAQ)
6. Incident response playbook (runaway costs, agent stuck, DB corruption)
7. Monitoring setup (health checks, alerting)
8. Backup/restore procedures

**Acceptance Criteria:**
- 10 agents run 24h without manual intervention
- Budget caps contain reliably (100% of test cases)
- Invalid transitions rejected (100% of test cases)
- Reboot preserves all state (DB canonical)
- Operator can recover from common incidents in <5 min
- Documentation complete and tested by external reviewer

---

## Repository Structure

```
mission-control/
├── packages/
│   ├── api/                      # Express API server
│   │   ├── src/
│   │   │   ├── routes/           # REST endpoints
│   │   │   ├── middleware/       # Auth, error handling
│   │   │   ├── services/         # Business logic
│   │   │   └── index.ts          # Entry point
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── ui/                       # React frontend
│   │   ├── src/
│   │   │   ├── components/       # React components
│   │   │   ├── hooks/            # Custom hooks
│   │   │   ├── pages/            # Page components
│   │   │   ├── lib/              # Utilities
│   │   │   └── main.tsx          # Entry point
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── tsconfig.json
│   │
│   ├── policy-engine/            # Policy evaluation module
│   │   ├── src/
│   │   │   ├── evaluator.ts      # Risk + approval logic
│   │   │   ├── rules.ts          # Policy rules (v1)
│   │   │   ├── allowlists.ts     # Shell/network/file allowlists
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── state-machine/            # Task state validator
│   │   ├── src/
│   │   │   ├── validator.ts      # Transition rules
│   │   │   ├── states.ts         # State definitions
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── workers/                  # Background daemons
│   │   ├── src/
│   │   │   ├── notification-dispatcher.ts
│   │   │   ├── heartbeat-monitor.ts
│   │   │   ├── loop-detector.ts
│   │   │   ├── budget-enforcer.ts
│   │   │   ├── approval-processor.ts
│   │   │   ├── daily-standup.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── shared/                   # Shared types/utils
│       ├── src/
│       │   ├── types/            # TypeScript types
│       │   ├── constants.ts      # Shared constants
│       │   └── utils.ts          # Shared utilities
│       ├── package.json
│       └── tsconfig.json
│
├── convex/                       # Convex backend
│   ├── schema.ts                 # Database schema
│   ├── agents.ts                 # Agent queries/mutations
│   ├── tasks.ts                  # Task queries/mutations
│   ├── messages.ts               # Message queries/mutations
│   ├── approvals.ts              # Approval queries/mutations
│   ├── activities.ts             # Activity log queries
│   ├── runs.ts                   # Run tracking
│   ├── toolCalls.ts              # Tool call logging
│   └── policies.ts               # Policy storage
│
├── docker/
│   ├── Dockerfile.api
│   ├── Dockerfile.ui
│   ├── Dockerfile.workers
│   └── docker-compose.yml
│
├── docs/
│   ├── RUNBOOK.md
│   ├── DEPLOYMENT.md
│   ├── STATE_MACHINE.md
│   ├── POLICY_V1.md
│   └── API.md
│
├── scripts/
│   ├── setup.sh                  # Initial setup
│   ├── seed-dev-data.ts          # Dev data seeding
│   └── backup.sh                 # Backup script
│
├── .env.example
├── package.json                  # Root package.json (workspace)
├── tsconfig.json                 # Root tsconfig
├── turbo.json                    # Turborepo config
└── README.md
```

---

## Data Model (Convex Schema)

### Core Tables

#### `agents`
```typescript
{
  _id: Id<"agents">,
  _creationTime: number,
  name: string,                    // "ResearchBot-01"
  sessionKey: string,              // OpenClaw session identifier
  autonomyLevel: "intern" | "specialist" | "lead",
  status: "active" | "paused" | "drained" | "quarantined" | "stopped",
  modelConfig: {
    primary: string,               // "gpt-4"
    fallback?: string,
  },
  toolPermissions: string[],       // ["read_db", "git_commit", ...]
  budgets: {
    dailyCap: number,              // USD
    perRunCap: number,
  },
  currentTaskId?: Id<"tasks">,
  lastHeartbeat?: number,          // timestamp
  errorStreak: number,             // consecutive failures
  totalSpend: number,              // lifetime USD
  todaySpend: number,              // resets daily
  soulHash?: string,               // git commit hash of agent template
  metadata: Record<string, any>,
}
```

#### `tasks`
```typescript
{
  _id: Id<"tasks">,
  _creationTime: number,
  title: string,
  description: string,
  type: "content" | "social" | "email_marketing" | "customer_research" | 
        "seo_research" | "engineering" | "docs" | "ops",
  status: "inbox" | "assigned" | "in_progress" | "review" | 
          "needs_approval" | "blocked" | "done" | "canceled",
  priority: "high" | "medium" | "low",
  assigneeIds: Id<"agents">[],
  reviewerIds: Id<"agents">[],
  subscriberIds: Id<"agents">[],
  threadRef?: string,              // Telegram/Slack thread ID
  parentTaskId?: Id<"tasks">,      // for sub-agents
  dependsOn: Id<"tasks">[],
  budget: number,                  // USD cap
  spend: number,                   // USD spent
  workPlan?: string,               // markdown
  deliverable?: string,            // markdown or link
  selfReview?: string,             // checklist
  evidence?: string[],             // links/refs
  blockedReason?: string,
  metadata: Record<string, any>,
}
```

#### `taskTransitions`
```typescript
{
  _id: Id<"taskTransitions">,
  _creationTime: number,
  taskId: Id<"tasks">,
  fromStatus: TaskStatus,
  toStatus: TaskStatus,
  actor: "agent" | "human" | "system",
  actorId?: Id<"agents"> | string, // agent ID or human username
  reason?: string,
  artifactsProvided?: string[],    // ["deliverable", "selfReview"]
  idempotencyKey: string,
}
```

#### `runs`
```typescript
{
  _id: Id<"runs">,
  _creationTime: number,
  taskId: Id<"tasks">,
  agentId: Id<"agents">,
  sessionKey: string,
  startTime: number,
  endTime?: number,
  status: "running" | "success" | "failed" | "blocked",
  cost: number,                    // USD
  toolCallCount: number,
  errorMessage?: string,
  idempotencyKey: string,
}
```

#### `toolCalls`
```typescript
{
  _id: Id<"toolCalls">,
  _creationTime: number,
  runId: Id<"runs">,
  taskId: Id<"tasks">,
  agentId: Id<"agents">,
  tool: string,                    // "git_commit", "shell_exec"
  risk: "green" | "yellow" | "red",
  input: string,                   // redacted if secrets
  output: string,                  // redacted if secrets
  duration: number,                // ms
  status: "success" | "failed" | "blocked" | "needs_approval",
  cost?: number,                   // USD if applicable
  approvalId?: Id<"approvals">,
}
```

#### `approvals`
```typescript
{
  _id: Id<"approvals">,
  _creationTime: number,
  taskId: Id<"tasks">,
  agentId: Id<"agents">,
  toolCallId?: Id<"toolCalls">,
  summary: string,                 // what agent wants to do
  risk: "yellow" | "red",
  reason: string,                  // why risky
  status: "pending" | "approved" | "denied",
  approver?: string,               // human username
  decision?: string,               // explanation
  decidedAt?: number,
}
```

#### `messages`
```typescript
{
  _id: Id<"messages">,
  _creationTime: number,
  taskId: Id<"tasks">,
  threadRef: string,
  authorId: Id<"agents"> | string, // agent or human
  authorType: "agent" | "human",
  content: string,
  mentions: Id<"agents">[],
  metadata: Record<string, any>,
}
```

#### `activities`
```typescript
{
  _id: Id<"activities">,
  _creationTime: number,
  type: "task_created" | "task_transition" | "agent_paused" | 
        "budget_exceeded" | "loop_detected" | "approval_requested" |
        "approval_decided" | "comment_posted" | "alert_fired",
  taskId?: Id<"tasks">,
  agentId?: Id<"agents">,
  actorId?: string,
  actorType: "agent" | "human" | "system",
  summary: string,
  details?: Record<string, any>,
}
```

#### `policies`
```typescript
{
  _id: Id<"policies">,
  _creationTime: number,
  version: string,                 // "v1"
  active: boolean,
  autonomyRules: Record<string, any>,
  riskMap: Record<string, "green" | "yellow" | "red">,
  allowlists: {
    shell: string[],
    network: string[],
    filesystem: { read: string[], write: string[] },
  },
  budgets: {
    perAgentDaily: Record<string, number>,
    perTask: Record<string, number>,
    perRun: Record<string, number>,
  },
  spawnLimits: {
    maxActive: number,
    maxPerParent: number,
    maxDepth: number,
    ttl: number,
  },
  loopDetection: {
    commentRateThreshold: number,
    reviewCycleLimit: number,
    retryLimit: number,
  },
}
```

#### `alerts`
```typescript
{
  _id: Id<"alerts">,
  _creationTime: number,
  type: "budget_exceeded" | "loop_detected" | "agent_error_streak" |
        "approval_timeout" | "security_violation",
  severity: "low" | "medium" | "high" | "critical",
  taskId?: Id<"tasks">,
  agentId?: Id<"agents">,
  message: string,
  resolved: boolean,
  resolvedAt?: number,
  resolvedBy?: string,
}
```

---

## State Machine Specification

### States
1. `INBOX` - New task, not assigned
2. `ASSIGNED` - Assigned to agent(s), not started
3. `IN_PROGRESS` - Agent actively working
4. `REVIEW` - Agent submitted for review
5. `NEEDS_APPROVAL` - Waiting for human approval
6. `BLOCKED` - Cannot proceed (budget/loop/failure)
7. `DONE` - Completed and approved
8. `CANCELED` - Abandoned

### Transition Rules (Enforced by Validator)

**Valid Transitions:**
- `INBOX → ASSIGNED` (agent/human/system)
- `INBOX → NEEDS_APPROVAL` (system)
- `INBOX → BLOCKED` (system/human)
- `INBOX → CANCELED` (human)
- `ASSIGNED → IN_PROGRESS` (agent/human)
- `ASSIGNED → NEEDS_APPROVAL` (system)
- `ASSIGNED → BLOCKED` (system/human)
- `ASSIGNED → CANCELED` (human)
- `ASSIGNED → INBOX` (human only; unassign)
- `IN_PROGRESS → REVIEW` (agent/human; requires deliverable)
- `IN_PROGRESS → NEEDS_APPROVAL` (system)
- `IN_PROGRESS → BLOCKED` (system/human)
- `IN_PROGRESS → CANCELED` (human)
- `IN_PROGRESS → ASSIGNED` (human only; revert)
- `REVIEW → IN_PROGRESS` (agent/human; revisions)
- `REVIEW → DONE` (human only; requires approval record)
- `REVIEW → NEEDS_APPROVAL` (system/human)
- `REVIEW → BLOCKED` (system/human)
- `REVIEW → CANCELED` (human)
- `REVIEW → ASSIGNED` (human only; reassign)
- `NEEDS_APPROVAL → BLOCKED` (system/human)
- `NEEDS_APPROVAL → (any)` (human only; based on approval)
- `NEEDS_APPROVAL → CANCELED` (human)
- `BLOCKED → ASSIGNED` (human; once unblocked)
- `BLOCKED → IN_PROGRESS` (human; once unblocked)
- `BLOCKED → NEEDS_APPROVAL` (human/system)
- `BLOCKED → CANCELED` (human)
- `DONE → REVIEW` (human; reopen)
- `DONE → CANCELED` (human; incorrect close)

**Required Artifacts:**
- Enter `IN_PROGRESS`: workPlan + assigneeIds non-empty
- Enter `REVIEW`: deliverable + selfReview + evidence (if claims) + cost summary
- Enter `DONE`: approval record + deliverable confirmed + decision note

---

## Policy Engine (v1)

### Autonomy Levels
- **Intern**: Read/comment/research only; Yellow/Red require approval; cannot spawn
- **Specialist**: Yellow allowed within allowlists/budgets; Red requires approval
- **Lead**: Yellow allowed; Red requires approval (default)

### Risk Classification
- **GREEN**: Internal, reversible (read DB, post comments, read files)
- **YELLOW**: Potentially harmful (shell, git commit, network calls, file writes)
- **RED**: External impact (email, social post, prod deploy, secrets, destructive ops)

### Approval Triggers
- RED actions always
- YELLOW if Intern
- Action exceeds budget cap
- Action touches secrets
- Action affects production/external
- Network egress not allowlisted

### Tool Risk Map
```typescript
const TOOL_RISK_MAP = {
  // GREEN
  read_db: "green",
  post_comment: "green",
  create_doc: "green",
  read_file: "green",
  web_search: "green",
  
  // YELLOW
  shell_exec: "yellow",
  git_commit: "yellow",
  git_push: "yellow",
  network_call: "yellow",
  write_file: "yellow",
  install_deps: "yellow",
  
  // RED
  send_email: "red",
  post_social: "red",
  deploy_prod: "red",
  access_secrets: "red",
  destructive_shell: "red",
};
```

### Allowlists
**Shell:**
- Allow: `ls`, `pwd`, `cat`, `head`, `tail`, `grep`, `find` (scoped), `git status/diff/log/checkout -b/add/commit`, project tests/lint, node/python scripts in `scripts/`
- Block: `rm -rf`, `sudo`, `chmod 777`, `chown`, `dd`, `mkfs`, `curl|bash`, unbounded traversal

**Filesystem:**
- Read: workspace + specific subdirs
- Write: `workspace/output/**`, `workspace/docs/**`, `workspace/memory/**`
- Block writes: `workspace/config/**` (except approved)

**Network:**
- Start strict: git host, docs domains, SaaS endpoints, analytics
- Block others by default

### Budgets (Defaults)
```typescript
const BUDGETS = {
  perAgentDaily: {
    intern: 2,
    specialist: 5,
    lead: 12,
  },
  perTask: {
    content: 6,
    seo_research: 4,
    customer_research: 5,
    social: 2,
    email_marketing: 4,
    engineering: 8,
    docs: 3,
    ops: 3,
  },
  perRun: {
    intern: 0.25,
    specialist: 0.75,
    lead: 1.50,
  },
};
```

### Spawn Limits
- Hard cap active agents: 30
- Max sub-agents per parent: 3
- Max spawn depth: 2
- TTL: 6h auto-retire
- Intern cannot spawn
- Cleanup sub-agents on parent DONE/CANCELED

### Loop Detection
- `>20` comments on task in 30 min
- `>3` review cycles
- Same pair back-and-forth `>8` times in 10 min
- Tool retries `>3` with same error signature
- **Containment:** task → BLOCKED; alert; create Loop Summary doc

---

## API Endpoints (Express)

### Agents
- `GET /api/agents` - List all agents
- `GET /api/agents/:id` - Get agent details
- `POST /api/agents` - Create agent
- `PATCH /api/agents/:id` - Update agent
- `POST /api/agents/:id/pause` - Pause agent
- `POST /api/agents/:id/drain` - Drain agent (finish current task, then pause)
- `POST /api/agents/:id/quarantine` - Quarantine agent (immediate stop + block tasks)
- `POST /api/agents/:id/restart` - Restart agent
- `DELETE /api/agents/:id` - Delete agent

### Tasks
- `GET /api/tasks` - List tasks (filterable by status, agent, type)
- `GET /api/tasks/:id` - Get task details
- `POST /api/tasks` - Create task
- `PATCH /api/tasks/:id` - Update task
- `POST /api/tasks/:id/transition` - Transition task status
- `GET /api/tasks/:id/timeline` - Get task timeline (transitions, runs, tool calls)
- `GET /api/tasks/:id/cost` - Get task cost breakdown
- `DELETE /api/tasks/:id` - Delete task

### Approvals
- `GET /api/approvals` - List pending approvals
- `GET /api/approvals/:id` - Get approval details
- `POST /api/approvals/:id/approve` - Approve action
- `POST /api/approvals/:id/deny` - Deny action

### Messages
- `GET /api/messages` - List messages (filterable by task, agent)
- `POST /api/messages` - Post message (comment)

### Activities
- `GET /api/activities` - Get activity feed (filterable)

### Policies
- `GET /api/policies/active` - Get active policy
- `GET /api/policies` - List all policies
- `POST /api/policies` - Create new policy version
- `POST /api/policies/:id/activate` - Activate policy

### Emergency
- `POST /api/emergency/pause-squad` - Pause all agents
- `POST /api/emergency/stop` - Emergency stop (pause all + block all tasks)

---

## Workers & Daemons

### 1. Notification Dispatcher
- **Frequency:** Real-time (event-driven)
- **Purpose:** Deliver @mentions and subscriptions to agents
- **Logic:** Queue notifications, deliver on agent heartbeat, retry with backoff, idempotency keys

### 2. Heartbeat Monitor
- **Frequency:** Every 30s
- **Purpose:** Check agent liveness, detect stale sessions
- **Logic:** Flag agents with `lastHeartbeat > 5min`, alert if task stuck

### 3. Loop Detector
- **Frequency:** Every 1min
- **Purpose:** Detect runaway comment loops, review cycles, retry storms
- **Logic:** Analyze comment rates, review cycles, tool retry patterns; trigger BLOCKED + alert

### 4. Budget Enforcer
- **Frequency:** Real-time (on cost events)
- **Purpose:** Enforce budget caps, trigger containment
- **Logic:** Check spend vs caps, move task to NEEDS_APPROVAL or BLOCKED, pause agent if needed

### 5. Approval Processor
- **Frequency:** Real-time (on approval decisions)
- **Purpose:** Execute approved actions, record decisions
- **Logic:** On approve: allow tool call, record; on deny: block, record

### 6. Daily Standup Generator
- **Frequency:** Daily at 9am
- **Purpose:** Generate summary of yesterday's work
- **Logic:** Query completed tasks, cost, incidents; generate markdown report; post to operator channel

---

## UI Components

### Layout
- **Left Sidebar:** Agent list (status, burn rate, last heartbeat)
- **Center:** Kanban board (columns: Inbox, Assigned, In Progress, Review, Needs Approval, Blocked, Done)
- **Right Sidebar:** Live feed (tasks, comments, decisions, alerts)

### Key Views
1. **Dashboard (Kanban + Feed)**
2. **Task Detail Drawer** (tabs: Overview, Timeline, Artifacts, Approvals, Cost)
3. **Approvals Inbox** (pending approvals with approve/deny)
4. **Agent Detail** (status, tasks, spend, controls)
5. **Incident Banner** (pause squad, quarantine agent quick actions)

### Real-time Updates
- WebSocket or SSE for live feed
- Optimistic UI updates with rollback on error

---

## Deployment (Docker Compose)

### Services
1. **mission-control-api** (Express server)
2. **mission-control-ui** (Vite dev server or static build)
3. **mission-control-workers** (Node.js daemons)
4. **convex-dev** (Convex local dev server, or cloud connection)

### Environment Variables
```bash
# Convex
CONVEX_DEPLOYMENT=dev:your-deployment
CONVEX_DEPLOY_KEY=your-key

# API
API_PORT=3000
API_SECRET=your-secret

# Workers
WORKER_CONCURRENCY=5

# OpenClaw
OPENCLAW_GATEWAY_URL=http://localhost:8080
TELEGRAM_BOT_TOKEN=your-token

# Monitoring
SENTRY_DSN=optional
```

### Volumes
- `./convex:/app/convex` (schema + functions)
- `./data:/app/data` (backups, logs)

---

## Testing Strategy

### Unit Tests
- State machine validator (all valid/invalid transitions)
- Policy engine (risk classification, approval logic)
- Budget calculations
- Idempotency key handling

### Integration Tests
- Task lifecycle (create → assign → in_progress → review → done)
- Approval workflow (request → approve → execute)
- Budget enforcement (exceed → block)
- Loop detection (trigger → block)

### Load Tests
- 100+ tasks/day steady state
- 20 agents concurrent
- 1000+ tool calls/day

### Security Tests
- Secrets redaction
- Allowlist bypass attempts
- Approval bypass attempts
- SQL injection (if using SQL)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Credential exposure | Critical | Env-only, redaction, approvals for secrets access |
| Runaway loops | High | Rate limits, max cycles, escalate BLOCKED + summary |
| Cost spikes | High | Cheap heartbeat models, budgets/caps/alerts |
| State divergence (DB vs thread) | Medium | DB canonical, transitions recorded, reconciliation job |
| Upgrade instability | Medium | Pin versions, staged upgrades, rollback procedure |
| Convex vendor lock-in | Medium | Abstract storage with interface, plan DB swap |

---

## Success Metrics (v1)

### Autonomy & Throughput
- ≥80% tasks reach REVIEW without human intervention
- ≥60% tasks reach DONE with only final approval
- 100+ tasks/day steady state

### Reliability
- <5% task runs end "failed without recovery path"
- MTTR from loop/cost spike <5 min

### Safety & Cost
- Budget cap violations trigger containment 100%
- Per-agent/task cost attribution ≥95%

### Operator Trust
- Operator can answer in <60s: what happened, who, why, cost, what's next

---

## Open Questions & Decisions

### Decided
- **DB:** Convex for MVP (abstract for future swap)
- **Channel:** Telegram first, Slack next
- **Review→Done:** Human only (default)
- **Red actions:** email, social post, prod config, secrets, non-allowlisted network
- **Budgets:** Use Policy v1 defaults

### Open (Defer to v1.1)
- Sub-agent tree visualization
- Global search implementation details
- Incident export format (JSON/CSV/PDF)
- Model finetuning integration
- Token economy for agent incentives

---

## Next Steps

1. **Week 1:** Set up monorepo, Convex schema, state machine validator
2. **Week 2:** Agent registry, task CRUD, basic UI, Docker Compose
3. **Week 3:** Policy engine, approvals workflow, budgets
4. **Week 4:** Thread mapping, notifications, loop detection
5. **Week 5:** Timeline view, cost attribution, audit logs
6. **Week 6:** Daily standup, RUNBOOK, operational polish
7. **Week 7:** Testing, security audit, deployment guide
8. **Week 8:** Load testing, incident playbook, launch prep

---

## Appendix: Key Files to Create

1. `IMPLEMENTATION_PLAN.md` (this file) ✅
2. `EPICS_AND_STORIES.md` (detailed user stories)
3. `STATE_MACHINE.md` (formal spec + diagram)
4. `POLICY_V1.md` (complete policy rules)
5. `API.md` (OpenAPI spec)
6. `RUNBOOK.md` (operational procedures)
7. `DEPLOYMENT.md` (VPS setup guide)
8. Repository structure (monorepo setup)
9. Convex schema (all tables)
10. State machine validator (TypeScript)
11. Policy engine (TypeScript)
12. API server (Express)
13. Workers (6 daemons)
14. UI (React + Tailwind)
15. Docker Compose setup
16. Seed data scripts
17. Integration tests
18. Deployment scripts

---

**End of Implementation Plan**
