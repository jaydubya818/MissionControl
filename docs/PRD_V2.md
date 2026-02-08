# Mission Control -- Unified Product Requirements Document

**Version:** 2.0  
**Date:** February 8, 2026  
**Authors:** Jay (Project Lead), Claude (Technical Co-Author)  
**Status:** Draft  
**Repository:** github.com/jaydubya818/MissionControl

---

## 1. Vision & Overview

Mission Control is a self-hosted orchestration and observability control plane for autonomous AI agent squads. It transforms multiple AI agent sessions into a coordinated digital team with deterministic task state management, safety guardrails, deep observability, and persistent learning.

Unlike single-agent chat interfaces, Mission Control treats AI as a special ops team -- specialized agents with distinct roles, shared memory, heartbeat monitoring, and invisible orchestration. The system enables complex multi-domain work (research, coding, operations, QA, design, compliance, finance) to be decomposed, delegated, executed, and refined autonomously.

**Key differentiators:**

- **Model-agnostic orchestration:** Claude-primary for development and coordination, with pluggable support for GPT, Gemini, and Grok for specialized tasks and consensus verification.
- **Deterministic state machine:** 8-state task lifecycle with strict transition rules -- no ambiguous task states.
- **Safety-first:** Risk classification (GREEN/YELLOW/RED), budget enforcement, loop detection, and emergency controls (pause/quarantine/drain/stop) built into the core, not bolted on.
- **Persistent learning:** Agents capture wins, errors, and fixes into shared memory, enabling proactive issue prevention across sessions.
- **Multi-project workspaces:** Multiple projects share a single deployment, each with independent agents, tasks, policies, and budgets.

### 1.1 Current State (v0.9.0)

The existing repository implements the foundational layer:

| Component | Location | Status |
|---|---|---|
| Task State Machine | `packages/state-machine` | Complete |
| Risk Classification & Policy | `packages/policy-engine` | Complete |
| Shared Types & Utilities | `packages/shared` | Complete |
| Agent Runner (proto-runtime) | `packages/agent-runner` | Complete |
| OpenClaw SDK | `packages/openclaw-sdk` | Complete |
| Telegram Bot | `packages/telegram-bot` | Complete |
| Convex Database Schema & Functions | `convex/` | Complete |
| React Dashboard | `apps/mission-control-ui` | Complete |
| Docker Infrastructure | `docker-compose.yml` | Complete |

**Architecture:** pnpm monorepo with Turborepo. React frontend communicates directly with Convex serverless backend via reactive `useQuery`/`useMutation` hooks. Background work runs as Convex cron jobs. Docker Compose deployment for the UI layer.

> **Note:** There is no Express API server or standalone workers package in the current codebase. The PRD v1.0 described these but the implementation chose a Convex-native architecture instead. This document reflects the actual architecture.

---

## 2. Problem Statement

Current AI tools are limited to single-threaded conversations or brittle workflows that fail in complex, real-world scenarios:

- **No coordination:** Users manually context-switch between tools and domains, leading to lost context and redundant work.
- **No memory:** Agents forget past learnings, repeating mistakes across sessions.
- **No safety net:** Unchecked autonomous actions can cause expensive mistakes with no rollback mechanism.
- **No observability:** Users cannot see what agents are doing, why they made decisions, or how much they are spending.
- **No scaling:** Sequential execution bottlenecks block parallel workstreams.

Mission Control solves these by providing the orchestration layer that turns independent AI agents into a managed, observable, safety-constrained team.

---

## 3. Architecture

### 3.1 System Architecture

The system uses a **hybrid architecture**: Convex handles state management, real-time subscriptions, and cron-based background jobs. A server-side orchestration process (to be built in Phase 2) handles long-running agent loops, LLM API calls, and multi-model routing.

```
+-------------------------------------------------------------------+
|                        Mission Control                             |
|                                                                    |
|  +----------------+    +------------------+                        |
|  |   React UI     |<-->|   Convex Backend  |                       |
|  |  (Dashboard)   |    |  (State, Queries, |                       |
|  |                |    |   Mutations,      |                       |
|  |                |    |   Cron Jobs)      |                       |
|  +----------------+    +--------+---------+                        |
|                                 |                                  |
|                        +--------+---------+                        |
|                        |  Orchestration   |                        |
|                        |  Server (NEW)    |                        |
|                        |  - Coordinator   |                        |
|                        |  - Agent Runtime |                        |
|                        |  - Model Router  |                        |
|                        +--------+---------+                        |
|                                 |                                  |
|         +-----------------------+-----------------------+          |
|         |                       |                       |          |
|  +------+------+   +-----------+-+   +--------+--------+          |
|  | Agent Pool  |   | LLM APIs    |   | External Tools  |          |
|  | (Spawned    |   | (Claude/GPT/|   | (Git, Browser,  |          |
|  |  Squads)    |   |  Gemini/    |   |  Web Search)    |          |
|  |             |   |  Grok)      |   |                 |          |
|  +-------------+   +-------------+   +-----------------+          |
|                                                                    |
|  +--------------------------------------------------------------+ |
|  |                    Safety Layer                                | |
|  |  Policy Engine | Budget Enforcer | Loop Detector | Kill Switch| |
|  +--------------------------------------------------------------+ |
+-------------------------------------------------------------------+
```

#### Architectural Decision: Hybrid Model

The Coordinator and Agent Runtime run as a **server-side process** (Express or Hono), not as Convex actions. Rationale:

- Convex actions have execution time limits (10-15 min), which cannot support long-running agent loops that iterate over multiple LLM calls.
- Streaming responses from LLM APIs require persistent connections.
- Webhook ingestion requires a stable HTTP server.
- The server syncs state to/from Convex, which remains the source of truth for tasks, agents, and all persistent data.
- The React UI continues to read from Convex directly via reactive subscriptions for real-time updates.

### 3.2 Package Map (Monorepo)

```
mission-control/
├── apps/
│   └── mission-control-ui/        # React dashboard (EXISTING)
├── convex/                         # Database schema & functions (EXISTING)
│   ├── schema.ts                   # Source-of-truth data model
│   ├── tasks.ts                    # Task CRUD & transitions
│   ├── agents.ts                   # Agent management & heartbeat
│   ├── runs.ts                     # Run tracking & cost accounting
│   ├── approvals.ts                # Approval workflow
│   ├── loops.ts                    # Loop detection logic
│   ├── messages.ts                 # Task thread messages
│   ├── crons.ts                    # Scheduled background jobs
│   ├── agentDocuments.ts           # Agent session memory & notes
│   ├── agentLearning.ts            # Learning entries
│   ├── executionRequests.ts        # Multi-executor routing
│   └── ...                         # Activities, alerts, monitoring, etc.
├── packages/
│   ├── shared/                     # Types & utilities (EXISTING)
│   ├── state-machine/              # Task lifecycle validator (EXISTING)
│   ├── policy-engine/              # Risk classification (EXISTING)
│   ├── agent-runner/               # Proto-runtime: register, heartbeat, claim (EXISTING)
│   ├── openclaw-sdk/               # SDK for external agent integration (EXISTING)
│   ├── telegram-bot/               # Telegram commands & notifications (EXISTING)
│   ├── coordinator/                # NEW -- Central orchestrator
│   ├── agent-runtime/              # NEW -- Full agent lifecycle (evolves agent-runner)
│   ├── model-router/               # NEW -- Multi-model abstraction
│   ├── memory/                     # NEW -- Persistent learning system
│   └── context-router/             # NEW -- Intent detection & routing
├── agents/                          # NEW -- Agent persona configs (YAML)
│   ├── coordinator.yaml
│   ├── research.yaml
│   ├── coder.yaml
│   ├── operations.yaml
│   ├── qa.yaml
│   ├── storyteller.yaml
│   ├── designer.yaml
│   ├── compliance.yaml
│   ├── finance.yaml
│   ├── learner.yaml
│   └── strategist.yaml
├── docs/
│   ├── architecture/               # System design docs & ADRs
│   ├── guides/                     # Operator, developer, agent authoring
│   ├── changelog/                  # Version history
│   └── runbook/                    # Operational runbook
├── scripts/
├── docker-compose.yml
├── pnpm-workspace.yaml
└── turbo.json
```

### 3.3 Multi-Model Architecture

The Model Router provides a unified interface to multiple LLM providers. Claude is the primary model for coordination and development; other models are available for specialized tasks and consensus verification.

**Phase 3 ships Claude-only.** The `ModelRouter` interface is designed for multiple providers, but the initial implementation supports only Claude (Opus and Sonnet). Additional providers (GPT, Gemini, Grok) are added incrementally behind feature flags in Phase 4+.

```typescript
// packages/model-router/src/types.ts
interface ModelRouter {
  // Route to specific model by capability
  route(task: AgentTask): ModelSelection;

  // Fallback chain: try primary, fall back on failure
  withFallback(primary: ModelId, fallbacks: ModelId[]): ModelChain;

  // Consensus: query multiple models, reconcile (Phase 5)
  consensus(prompt: string, models: ModelId[], strategy: ConsensusStrategy): ConsensusResult;
}

type ModelId = 'claude-opus' | 'claude-sonnet' | 'gpt-4o' | 'gemini-2.0' | 'grok-3';

interface ModelSelection {
  model: ModelId;
  reason: string;         // Why this model was chosen
  fallback: ModelId[];    // Ordered fallback chain
  costEstimate: number;   // Estimated token cost (refined over time)
}
```

**Routing heuristics (target state, post-Phase 4):**

| Task Type | Primary Model | Fallback | Rationale |
|---|---|---|---|
| Coordination / Planning | Claude Opus | Claude Sonnet | Best at structured reasoning |
| Code Generation | Claude Sonnet | GPT-4o | Strong coding, fast iteration |
| Research Synthesis | Gemini 2.0 | Claude Opus | Large context window |
| Creative / Marketing | Claude Opus | Grok 3 | Narrative quality |
| Financial Analysis | GPT-4o | Claude Sonnet | Quantitative strength |
| QA / Adversarial Testing | Grok 3 | GPT-4o | Contrarian perspective |
| Consensus Verification | Multi (3-model vote) | -- | Cross-model agreement |

**Cost controls:** The model router enforces per-task and per-session token budgets. Consensus mode is opt-in and reserved for high-risk (RED) decisions only.

**Dynamic cost estimation:** The system tracks actual vs. estimated costs per task type and model. Historical data is used to improve future estimates. The Learner agent captures cost prediction accuracy as a lesson.

### 3.4 Multi-Project Support

The system supports multiple projects within a single deployment. Most entities (tasks, agents, activities, alerts, policies) are scoped by `projectId`.

- **Projects table** in Convex stores project name, slug, description, and per-project policy defaults.
- **Project switching** is supported in the React dashboard.
- **Per-project policies** can override global policy defaults (budget thresholds, risk rules).
- **Agents can be scoped** to specific projects or shared across projects.

Multi-tenant support (multiple operators sharing a deployment with access isolation) is deferred to v2.0. The current architecture supports multiple projects for a single operator.

---

## 4. Task Lifecycle

The 8-state task machine is implemented in `packages/state-machine`:

```
INBOX --> ASSIGNED --> IN_PROGRESS --> REVIEW --> DONE
                   \-> BLOCKED ---/
                   \-> NEEDS_APPROVAL --/
                   \-> CANCELED
```

**States:**

| State | Description | Terminal |
|---|---|---|
| `INBOX` | New task, not assigned | No |
| `ASSIGNED` | Assigned to agent(s), not started | No |
| `IN_PROGRESS` | Agent actively working | No |
| `REVIEW` | Agent submitted work for review | No |
| `NEEDS_APPROVAL` | Waiting for human approval (budget exceed, RED action) | No |
| `BLOCKED` | Cannot proceed (loop detected, recoverable failure) | No |
| `DONE` | Completed and approved | Yes |
| `CANCELED` | Abandoned | Yes |

**FAILED Terminal State:** Phase 2 will add a `FAILED` terminal state to distinguish unrecoverable failures from recoverable blocks. Failed tasks are currently moved to `BLOCKED` with a `blockedReason`. The `FAILED` state will be used for tasks that cannot be recovered (e.g., invalid requirements, impossible constraints, critical errors). Unlike `BLOCKED`, which can transition back to `IN_PROGRESS` after resolution, `FAILED` is terminal and requires task recreation. **Recommendation: Add FAILED in Phase 2.**

**Transition rules:**

- Only valid transitions are allowed (enforced by the state machine validator).
- `IN_PROGRESS -> REVIEW` requires a deliverable artifact attached.
- `REVIEW -> DONE` requires an approval record (auto-approve for GREEN tasks, human approval for RED).
- `BLOCKED` tasks trigger escalation after configurable timeout.
- `NEEDS_APPROVAL` is entered when budget is exceeded or a YELLOW/RED tool call requires human sign-off.
- All transitions are logged to the `taskTransitions` table with timestamp, actor type, actor ID, and reason.
- Transitions include an idempotency key to prevent duplicate state changes.

---

## 5. Agent System

### 5.1 Agent Runtime (`packages/agent-runtime`)

The existing `packages/agent-runner` provides a proto-runtime that registers agents, sends heartbeats, claims tasks, and posts work plans. The full `agent-runtime` package evolves this foundation into a complete lifecycle manager.

Agents are not separate codebases. They are instances of a generic runtime configured by persona files (YAML). This keeps the system maintainable and allows new specializations without code changes.

```typescript
interface AgentInstance {
  id: string;
  persona: AgentPersona;       // Loaded from agents/*.yaml
  model: ModelId;              // Assigned by model router
  status: 'idle' | 'active' | 'paused' | 'quarantined';
  currentTask: string | null;
  heartbeat: number;           // Last heartbeat timestamp
  tokensBurned: number;        // Running cost
  sessionContext: string[];    // Memory keys loaded for this session
}

interface AgentPersona {
  schemaVersion: number;       // Persona schema version for validation
  name: string;
  role: string;
  systemPrompt: string;
  tools: string[];             // Available tool names
  triggerPatterns: string[];   // Context signals that activate this agent
  preferredModel: ModelId;
  fallbackModel: ModelId;
  riskProfile: 'GREEN' | 'YELLOW' | 'RED';
  maxConcurrentTasks: number;
}
```

**Lifecycle:** Spawn -> Load persona -> Validate schema version -> Receive task -> Execute -> Return artifacts -> Update memory -> Terminate (or idle for reuse).

**Heartbeat and Recovery:**

Active agents emit a heartbeat every 30 seconds. The recovery flow for missed heartbeats is:

1. **2 missed heartbeats (60s):** Alert coordinator. Agent flagged as "potentially stuck."
2. **3 missed heartbeats (90s):** Attempt graceful termination. Send shutdown signal.
3. **4 missed heartbeats (120s):** Force terminate. Reassign task to a new agent instance.
4. **Post-incident:** Log the incident for the Learner agent to analyze. Record `blockedReason` on the task.

**Idempotency:** Each agent run has an idempotency key. Tool calls are logged before execution and checked on retry to prevent duplicate side effects. For RED tools (external writes), an idempotency token is passed to the external service where supported.

### 5.2 Agent Specializations

Defined as YAML configurations in `agents/`:

| Agent | Role | Trigger Patterns | Preferred Model | Risk Profile |
|---|---|---|---|---|
| Coordinator | Task decomposition, delegation, conflict resolution, progress monitoring | Always active | Claude Opus | GREEN |
| Research | Source synthesis, pattern analysis, literature review | research, analyze, find out, compare | Claude Opus (Gemini post-Phase 4) | GREEN |
| Coder | Code generation, iteration, refactoring, debugging | build, code, implement, fix bug | Claude Sonnet | YELLOW |
| Operations | Documentation, process management, follow-ups | document, organize, schedule, track | Claude Sonnet | GREEN |
| QA | Edge case testing, adversarial review, quality gates | test, verify, review, check | Claude Sonnet (Grok post-Phase 4) | GREEN |
| Storyteller | Narratives, marketing copy, grant writing, pitches | write, pitch, story, marketing | Claude Opus | GREEN |
| Designer | UI/UX direction, wireframes, creative review | design, layout, UI, wireframe | Claude Opus | GREEN |
| Compliance | Contract review, security audit, regulatory check | legal, compliance, contract, security | Claude Opus | RED |
| Finance | Deal analysis, pricing models, financial projections | pricing, budget, financial, ROI | Claude Sonnet (GPT-4o post-Phase 4) | YELLOW |
| Learner | Win/error/fix scanning, memory updates, pattern detection | Runs on schedule + post-task | Claude Sonnet | GREEN |
| Strategist | Mission breakdown, dependency mapping, resource planning | plan, strategy, roadmap, decompose | Claude Opus | GREEN |

**Note:** All agents use Claude models in Phase 2-3. Alternative model assignments (Gemini, Grok, GPT-4o) are activated in Phase 4+ when those providers are integrated.

### 5.3 Coordinator Logic

The Coordinator is the central orchestrator. It does not execute domain work -- it decomposes, delegates, monitors, and resolves.

**Workflow:**

```
User Input ("Build a crypto analysis app")
    |
    v
Coordinator: Decompose into subtasks
    |
    +-> Strategist: Break down architecture & milestones
    +-> Research: Market analysis, API options
    +-> Coder: Implementation (parallel tracks possible)
    +-> Designer: UI/UX mockups
    +-> QA: Test plans, edge cases
    +-> Finance: Cost projections
    |
    v
Coordinator: Monitor progress, resolve blockers, compile results
    |
    v
Learner: Extract wins/errors/fixes -> update memory
```

**Coordinator Decision Logging:** All Coordinator decisions (decomposition plans, agent delegation choices, conflict resolutions, escalations) are logged as first-class audit entries in the `activities` table with `action: 'COORDINATOR_DECISION'`. A "Coordinator Decision Log" view is available on the dashboard. All decisions include an idempotency key to ensure reconcilability on failover.

**Conflict resolution:** When two agents produce contradictory outputs (e.g., Coder and QA disagree), the Coordinator routes to consensus mode (multi-model vote, Phase 5) or escalates to the human operator.

**High Availability & Failure Handling:**

The Coordinator is a critical single point of failure for task decomposition and delegation. Phase 2 implements the following HA measures:

1. **Health Checks:** The Coordinator process exposes a `/health` endpoint that reports status, uptime, and last successful operation. External monitoring (Docker healthcheck, Kubernetes liveness probe) polls this endpoint every 30 seconds.

2. **Auto-Restart:** The Coordinator runs under a process manager (PM2 or systemd) configured to restart on failure. Maximum 3 restart attempts within 5 minutes before escalating to operator alert.

3. **Leader Election (Phase 3):** For multi-instance deployments, a leader election mechanism (using Convex or Redis) ensures only one active Coordinator at a time. Standby instances monitor the leader's heartbeat and take over within 60 seconds of leader failure.

4. **Graceful Degradation:** If the Coordinator is unavailable, agents can continue executing committed in-progress tasks. Agents respect task `dependencies` and post `ARTIFACT`/`PROGRESS` messages to the `messages` table as usual. New task decomposition and delegation are paused until the Coordinator recovers. The dashboard displays a "Coordinator Offline" banner and disables task creation.

5. **State Reconciliation:** On Coordinator restart, the system reconciles in-flight operations by replaying the `activities` log (filtered by `action: 'COORDINATOR_DECISION'` and timestamp > last checkpoint). Idempotency keys prevent duplicate decompositions or delegations.

6. **Failover Testing:** Chaos tests (Phase 5) include Coordinator crash scenarios to validate recovery within 60 seconds and zero task loss.

### 5.4 Inter-Agent Communication Protocol

Agents communicate through a mediated protocol. There are no direct agent-to-agent calls.

1. **Task artifacts:** Results are attached to tasks as deliverables (structured data, files, summaries).
2. **Messages table:** The existing `messages` table in Convex serves as the communication channel. Agents post messages of type `ARTIFACT`, `PROGRESS`, or `COMMENT` to task threads.
3. **Dependencies:** Subtask dependencies enforce execution ordering. An agent cannot start work until its dependency subtasks are `DONE`.
4. **Coordinator mediation:** The Coordinator reads outputs from completed subtasks and provides relevant context when delegating downstream tasks.
5. **Mentions:** Agents can @-mention other agents in task threads to request input. The notification system delivers these via the `notifications` table.

---

## 6. Persistent Memory System (`packages/memory`)

### 6.1 Design

Memory is stored in Convex for real-time sync, querying, and multi-agent access. The system builds on the existing `agentDocuments` and `agentLearning` tables in the Convex schema.

The system maintains three memory tiers:

| Tier | Scope | TTL | Convex Table | Examples |
|---|---|---|---|---|
| Session | Single task execution | End of task | `agentDocuments` (type: `SESSION_MEMORY`) | Current file paths, intermediate results |
| Project | All tasks in a project | Manual cleanup | `agentDocuments` (type: `WORKING_MD`, `DAILY_NOTE`) | Architecture decisions, API keys (encrypted), team context |
| Global | Cross-project | Permanent | `agentLearning` | Lessons learned, error patterns, agent performance stats |

### 6.2 Learning Loop

```
Plan -> Execute -> Observe -> Learn -> Refine -> Iterate
```

After every task completion or failure:

1. Learner agent scans the task log, diffs, and agent communications.
2. Extracts patterns: what worked, what failed, what was retried.
3. Writes structured entries to the `agentLearning` table:

```typescript
interface LessonEntry {
  id: string;
  timestamp: number;
  category: 'win' | 'error' | 'fix' | 'optimization';
  agent: string;
  taskType: string;
  description: string;
  rule: string;           // "When X, do Y instead of Z"
  confidence: number;     // 0-1, increases with repeated observations
  appliedCount: number;   // Times this lesson prevented an issue
}
```

4. At session start, agents load relevant lessons (filtered by task type and agent role).
5. High-confidence lessons (>0.8, applied 3+ times) are promoted to rules that are injected into agent system prompts.

### 6.3 Memory Retention Policy

- Lessons with confidence < 0.3 are pruned after 60 days of no application.
- Lessons with confidence >= 0.3 and < 0.5 that have never been applied after 90 days are archived (moved to cold storage, not deleted) for potential future review.
- All memory writes are versioned. Prompts, agent personas, and routing configs are stored with version history so any change can be audited and rolled back.

### 6.4 Encryption for Project-Tier Secrets

Project-tier memory stored in `agentDocuments` (types `WORKING_MD` and `DAILY_NOTE`) may contain sensitive information such as API keys, credentials, and proprietary context. These secrets are encrypted at rest using the following policy:

**Encryption Standard:** AES-256-GCM (Galois/Counter Mode) for authenticated encryption.

**Key Storage & Management:**
- Encryption keys are stored as environment variables (`CONVEX_ENCRYPTION_KEY`) in the deployment environment, not in the codebase.
- For production deployments, keys should be managed via a secrets manager (AWS Secrets Manager, Google Secret Manager, or Convex environment variables with restricted access).
- Keys are base64-encoded 32-byte values generated using a cryptographically secure random number generator.

**Key Rotation Policy:**
- Keys are rotated every 90 days.
- Rotation is semi-automated: a new key is generated and added as `CONVEX_ENCRYPTION_KEY_NEW`, old documents are re-encrypted in a background migration, and the old key is retired after all documents are migrated.
- During rotation, both old and new keys are available for decryption (graceful migration period of 7 days).
- Key rotation events are logged to the `activities` table with action `ENCRYPTION_KEY_ROTATED`.

**Access Control:**
- Only agents with `LEAD` role or higher can decrypt Project-tier secrets.
- Decryption attempts are logged to the `activities` table with action `SECRET_DECRYPTED`, including agentId, documentId, and timestamp.
- The principle of least privilege applies: agents request decryption only when needed for task execution, not preemptively.
- Human operators can view encrypted fields via the dashboard only after explicit authorization (MFA or approval workflow).

**Implementation Notes:**
- Encryption/decryption is handled in `convex/agentDocuments.ts` via helper functions `encryptField()` and `decryptField()`.
- Encrypted fields are stored as base64-encoded strings with a version prefix (e.g., `v1:base64data`) to support future algorithm upgrades.
- The `agentDocuments` schema includes an `encrypted: boolean` flag to indicate which documents contain encrypted fields.

---

## 7. Safety Framework

### 7.1 Existing (Implemented)

- **Risk classification:** GREEN (reversible), YELLOW (potentially harmful), RED (external impact). Implemented in `packages/policy-engine`.
- **Budget enforcement:** Daily, per-task, and per-run token/cost limits. Enforced inline in `convex/runs.ts` when runs start/complete.
- **Loop detection:** >20 comments in 30 min, review ping-pong >3 cycles, repeated tool failures (5 in last 10 runs). Implemented as both event-triggered checks (on every 10th comment within a 30-minute window) and a Convex cron job every 5 minutes in `convex/loops.ts` to ensure timely detection (maximum 5-minute gap instead of 45 minutes).
- **Emergency controls:** Pause squad, quarantine agent, drain gracefully, hard stop. Implemented in `convex/agents.ts` and `packages/telegram-bot`.
- **Approval workflows:** RED and YELLOW actions (for Interns) require human approval before execution. Implemented in `convex/approvals.ts`.

### 7.2 New: Output Validation

The existing safety framework focuses on input controls (risk classification of tool calls, budget limits). Phase 2 adds output validation to catch harmful, incorrect, or nonsensical agent outputs before they reach `REVIEW`.

**Output validation layer:**

- QA agent runs automated pre-screening on agent outputs before status transitions to `REVIEW`.
- Checks include: format compliance, factual consistency with source material, code compilation (for Coder), sensitivity screening, output length anomaly detection.
- This is distinct from human review -- it is automated quality gating.
- Validation failures route the task back to `IN_PROGRESS` with feedback for the agent to retry.

### 7.3 New: Multi-Model Safety (Phase 5)

- **Consensus verification for RED actions:** Before executing any RED-classified action, query 2+ models independently. Proceed only on 2/3 agreement. Log disagreements and the minority dissent for human review.
- **Model-specific guardrails:** Each model provider has different safety profiles. The policy engine applies provider-specific constraints (e.g., tool access limits per model).
- **Cost circuit breaker:** If total session cost exceeds 3x the estimate, automatically pause and alert operator.
- **Anomaly detection:** Worker daemon monitors agent output patterns. Sudden changes in output length, tool usage frequency, or error rates trigger alerts.

---

## 8. Context Router (`packages/context-router`)

The Context Router detects task intent from natural language input and activates the appropriate agent(s) without user intervention.

```typescript
interface ContextRouter {
  // Classify input into task type(s) and confidence
  classify(input: string): TaskClassification[];

  // Map classification to agent activation plan
  plan(classifications: TaskClassification[]): ActivationPlan;
}

interface TaskClassification {
  taskType: string;        // e.g., 'research', 'code', 'design'
  confidence: number;      // 0-1
  extractedEntities: Record<string, string>;  // domain, technology, etc.
}

interface ActivationPlan {
  agents: { persona: string; task: string; priority: number; dependencies: string[] }[];
  parallel: boolean;       // Can agents run concurrently?
  estimatedCost: number;
  estimatedDuration: number;
}
```

**Classification approach:**

LLM classification is the primary path, with a lightweight cache for repeated patterns. A fast-path keyword matcher against `triggerPatterns` in agent personas serves as an optimization for obvious cases (confidence >= 0.9), but the LLM classifier is the default for ambiguous inputs (the common case). This is simpler to maintain and more accurate than a regex-first approach.

**Activation announcements:** On agent activation, the system emits a notification visible on the dashboard (e.g., "Research Agent activated for market analysis").

---

## 9. Dashboard & Monitoring

### 9.1 Existing (Implemented)

React-based dashboard in `apps/mission-control-ui` with real-time updates via Convex reactive subscriptions. Current features:

- Kanban task board with drag-and-drop
- Agent status dashboard
- Analytics dashboard (cost forecasting, agent efficiency leaderboard, bottleneck detection)
- Health dashboard (agents, tasks, approvals, alerts)
- Monitoring dashboard (error tracking, performance stats)
- Cost analytics view
- Live activity feed
- Task drawer with timeline, comments, transitions
- Approvals modal
- Notifications modal
- Standup report modal
- Policy configuration modal
- Peer review panel
- Multi-project switching
- Command palette and search

### 9.2 New Features (Phase 4)

- **Coordinator decision log:** View decomposition plans, delegation choices, and conflict resolutions.
- **Agent communication timeline:** Visual thread showing inter-agent handoffs and messages.
- **Memory browser:** Search and inspect the learning database. View lesson confidence scores and application history.
- **Model performance comparison:** Side-by-side metrics (latency, cost, quality scores) across models.
- **Operator overrides:** Manual task reassignment, agent persona hot-reload (applies on next spawn), model routing override, and memory rule editing.

---

## 10. Integration Points

### 10.1 Input Methods

- **Chat interface:** Natural language via the React dashboard.
- **Convex mutations:** Programmatic task submission via Convex client SDK.
- **Telegram bot:** Task status, approvals, and squad commands via `packages/telegram-bot`.
- **CLI:** Command-line interface for developer workflows (via `scripts/mc`).
- **Webhooks:** Inbound webhooks for external system triggers (requires orchestration server, Phase 2).

### 10.2 Existing Integrations

- **Telegram:** Full-featured bot with commands for approvals, squad management, and daily CEO briefs. Implemented in `packages/telegram-bot`.
- **OpenClaw:** SDK for external agent integration with registration, heartbeat, and task claiming. Implemented in `packages/openclaw-sdk`.
- **Execution routing:** The `executionRequests` table supports routing work to different executors: `CURSOR`, `CLAUDE_CODE`, or `OPENCLAW_AGENT`.

### 10.3 Tool Access (Per-Agent)

Agents access external tools through a sandboxed tool registry. Each agent persona defines which tools it can use:

| Tool | Available To | Description |
|---|---|---|
| `web_search` | Research, Finance, Compliance | Web search via API |
| `code_exec` | Coder, QA | Sandboxed code execution |
| `file_read` / `file_write` | All | Access to project workspace |
| `git_ops` | Coder, Operations | Git commit, branch, PR |
| `browser` | Research, Design | Headless browser for scraping |
| `database` | All (read), Operations (write) | Convex queries and mutations |
| `notification` | Coordinator, Operations | Send alerts to operator |

### 10.4 External Integrations (Post-MVP)

- **GitHub:** PR reviews, issue triage, CI/CD monitoring.
- **Slack/Discord:** Task intake from messages, status updates to channels.
- **Jira/Linear:** Bidirectional task sync.
- **Cloud providers:** AWS/GCP/Azure resource management (RED-classified, requires approval).

---

## 11. Testing Strategy

### 11.1 Unit Tests

- **State machine transitions:** All valid and invalid transition paths. This is the most critical test surface. Package: `packages/state-machine`.
- **Policy engine rules:** Risk classification for all tool types, budget limit calculations, allowlist/blocklist validation. Package: `packages/policy-engine`.
- **Model router:** Routing decisions, fallback chain behavior, cost estimation. Package: `packages/model-router`.

### 11.2 Integration Tests

- **Agent lifecycle:** Spawn -> receive task -> execute -> return artifacts -> update memory -> terminate.
- **Coordinator workflow:** Decompose task -> spawn agents -> collect results -> compile output.
- **Approval workflow:** RED action -> approval request -> human approve/deny -> execution or block.
- **Loop detection:** Simulate comment storm -> verify task blocked + alert created.
- **Budget enforcement:** Simulate budget exceed -> verify task moves to NEEDS_APPROVAL.

### 11.3 Load Tests (Phase 5)

- 20 concurrent tasks across multiple agents.
- Target: p95 < 5s agent activation latency.
- Verify Convex query performance under load (query batching, index utilization).

### 11.4 Chaos Tests (Phase 5)

- **API provider outage:** Simulate Claude API failure -> verify fallback chain activates.
- **Stuck agent:** Stop heartbeat -> verify detection within 90s and task reassignment within 120s.
- **Budget exhaustion:** Exhaust daily budget mid-task -> verify graceful pause and operator alert.
- **Convex rate limiting:** Simulate high write throughput -> verify caching and batching.

---

## 12. Non-Functional Requirements

| Requirement | Target | Notes |
|---|---|---|
| Concurrent tasks | 20 active tasks | Across all agents |
| Agent activation latency | < 5s | From task assignment to first agent action |
| System uptime | 99% | During active operation |
| Task completion (no human) | 80% for GREEN, 60% for YELLOW | RED tasks always require human approval |
| Per-task cost | < $0.50 median, < $2.00 p95 | Excluding RED consensus verification |
| Memory query latency | < 200ms | For lesson lookup at session start |
| Audit log retention | 90 days | All state transitions and agent actions |
| Security | Role-based access, encrypted secrets, GDPR-compliant data handling | |
| Deployment | Docker Compose (MVP), Kubernetes-ready (v2) | |
| Cross-platform | macOS, Linux, Windows (via Docker) | |

---

## 13. Development Phases

### Phase 1: Foundation -- COMPLETE (Existing Repo)

- Task state machine (8 states, strict transitions)
- Risk classification and policy engine (GREEN/YELLOW/RED)
- Convex database schema and functions (18 tables, full CRUD)
- React dashboard with real-time updates (Kanban, analytics, monitoring, approvals)
- Background jobs via Convex crons (loop detection, approval expiration, standup)
- Budget enforcement (inline in run lifecycle)
- Agent runner proto-runtime (register, heartbeat, claim)
- OpenClaw SDK for external agent integration
- Telegram bot (approvals, squad commands, CEO briefs)
- Docker Compose infrastructure
- Multi-project workspace support
- Approval workflows and emergency controls

### Phase 2: Orchestration Server & Agent Runtime (Weeks 1-3)

**Goal:** Ship the orchestration server, full agent runtime, and persistent learning system.

| Deliverable | Package | Priority |
|---|---|---|
| Orchestration server (Express/Hono) with Convex state sync | `packages/coordinator` | P0 |
| Agent runtime with persona loading (evolve `agent-runner`) | `packages/agent-runtime` | P0 |
| YAML persona definitions for all 11 agents | `agents/*.yaml` | P0 |
| Persona schema versioning and validation | `packages/agent-runtime` | P1 |
| Coordinator orchestration logic | `packages/coordinator` | P0 |
| Memory system (3-tier, building on `agentDocuments`/`agentLearning`) | `packages/memory` | P0 |
| Learner agent (post-task analysis) | `agents/learner.yaml` + worker | P1 |
| Heartbeat monitoring with recovery flow | `packages/agent-runtime` | P1 |
| Agent lifecycle management (spawn/idle/terminate) | `packages/agent-runtime` | P0 |
| Output validation layer (automated QA pre-screening) | `packages/coordinator` | P1 |
| Unit tests for state machine and policy engine | `packages/state-machine`, `packages/policy-engine` | P0 |

**Exit criteria:** Given the input "Research the top 5 competitors in the AI orchestration space and create a summary report," the system must:
1. Coordinator decomposes into at least 2 subtasks.
2. Research agent is spawned and completes within 5 minutes.
3. Operations agent creates a summary document.
4. Learner agent writes at least 1 lesson entry.
5. Heartbeat monitor detects a simulated stuck agent within 90 seconds.

### Phase 3: Model Router & Context Routing (Weeks 4-5)

**Goal:** Enable model routing (Claude-only initial implementation) and automatic intent detection.

| Deliverable | Package | Priority |
|---|---|---|
| Model router interface with Claude Opus/Sonnet implementation | `packages/model-router` | P0 |
| Fallback chains (Opus -> Sonnet) and cost estimation | `packages/model-router` | P0 |
| Context router (LLM-primary classification with keyword fast-path) | `packages/context-router` | P0 |
| Activation announcements on dashboard | `apps/mission-control-ui` | P1 |
| Model performance metrics collection | `packages/model-router` | P2 |
| Dynamic cost estimation (actual vs. estimated tracking) | `packages/model-router` | P1 |

**Exit criteria:** Tasks route to correct agent and model based on input. Fallback chains work on API failure. Context router correctly classifies 90%+ of test inputs.

### Phase 4: Multi-Model, Observability & Polish (Weeks 6-8)

**Goal:** Add additional model providers. Full visibility into system behavior. Operator confidence.

| Deliverable | Package | Priority |
|---|---|---|
| GPT-4o provider integration | `packages/model-router` | P1 |
| Gemini 2.0 provider integration | `packages/model-router` | P2 |
| Grok 3 provider integration | `packages/model-router` | P2 |
| Coordinator decision log view | `apps/mission-control-ui` | P0 |
| Cost attribution dashboard view | `apps/mission-control-ui` | P0 |
| Agent communication timeline | `apps/mission-control-ui` | P1 |
| Memory browser (search, inspect, edit) | `apps/mission-control-ui` | P1 |
| Model comparison view | `apps/mission-control-ui` | P2 |
| Operator overrides (reassign, hot-reload, routing override) | `apps/mission-control-ui` + API | P1 |

**Exit criteria:** Operator can see cost breakdown, Coordinator decisions, agent communications, and memory contents. Can manually override any routing decision. At least one non-Claude model is integrated and routing correctly.

### Phase 5: Hardening & Scale (Weeks 9-12)

**Goal:** Production-ready reliability.

| Deliverable | Priority |
|---|---|
| Consensus mode (multi-model vote for RED actions) | P1 |
| Anomaly detection worker | P1 |
| Load testing (20 concurrent tasks) | P0 |
| Error recovery and graceful degradation | P0 |
| Kubernetes manifests and Helm chart | P1 |
| API rate limiting and auth | P0 |
| Chaos testing (provider outages, stuck agents, budget exhaustion) | P1 |
| Documentation (operator guide, agent authoring guide) | P1 |
| CLI tool for task submission | P2 |
| Webhook ingestion for GitHub/Slack | P2 |

**Exit criteria:** System handles 20 concurrent tasks at p95 < 5s latency. Survives API provider outages via fallback chains. Consensus blocks on RED actions where models disagree. Operator guide complete.

---

## 14. Success Metrics

| Metric | Target | Measurement |
|---|---|---|
| Task autonomy rate | 80% GREEN tasks complete without human intervention | Task audit log |
| Daily task throughput | 100+ tasks/day | Dashboard metrics |
| Mean time to resolution | < 10 min for GREEN, < 30 min for YELLOW | Task timestamps |
| Cost efficiency | < $0.50 median per task | Model router cost tracking |
| Learning effectiveness | 50% reduction in repeated errors after 30 days | Lesson application count |
| Operator satisfaction | NPS > 8 | Pilot feedback |
| System reliability | 99% uptime, < 1% task failure rate (non-user-error) | Health checks |

---

## 15. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Model hallucinations cause incorrect outputs | High | Medium | QA agent adversarial review + output validation + consensus for RED tasks |
| API cost overruns | Medium | High | Budget enforcement at 3 levels + cost circuit breaker |
| Context drift in long sessions | Medium | Medium | Convex-backed state (not in-memory), fresh agent instances per task |
| Multi-model integration complexity | High | Medium | Ship Claude-only first, add models incrementally behind feature flags |
| Agent coordination deadlocks | Low | High | Coordinator timeout + escalation to operator |
| Convex rate limits under load | Medium | Medium | Query batching, caching layer, fallback to read replicas |
| Learning system captures bad patterns | Low | Medium | Confidence scoring + manual review in memory browser + retention policy |
| Agent crashes cause duplicate side effects | Medium | High | Idempotency keys on runs and tool calls, logged-before-executed protocol |
| Orchestration server failure | Medium | High | Health checks, auto-restart via PM2/Docker, Convex state survives restarts, leader election (Phase 3), graceful degradation mode |
| Dependency on primary model provider (Claude) | High | High | Implement adapter pattern in model-router with stable interface, monitor Anthropic changelogs, maintain fallback chains, accelerate Phase 4 multi-model support as strategic hedge against pricing changes/rate limits/outages/API breaking changes |
| Convex schema migrations during active usage | Medium | High | **Migration Rollback Plan:** Blue-green deployment for breaking changes, canary rollout for schema updates. **Schema Versioning:** Version prefix on schema changes (v1, v2). **Backward Compatibility:** Additive migrations only (new optional fields), feature-flag gated reads/writes, dual-write/dual-read compatibility helpers during transition periods. Test migrations in staging environment before production rollout. |

---

## 16. Assumptions & Dependencies

**Assumptions:**

- API access to Anthropic (Claude) is available for Phase 2-3. OpenAI, Google, and xAI APIs are available for Phase 4+.
- Convex free tier is sufficient for MVP; paid tier for production.
- Operators are technical enough to deploy via Docker Compose and use a web dashboard.

**Dependencies:**

- Anthropic API (Claude Opus/Sonnet) -- required from Phase 2
- OpenAI API (GPT-4o) -- required from Phase 4
- Google AI API (Gemini 2.0) -- optional, Phase 4
- xAI API (Grok 3) -- optional, Phase 4
- Convex SDK
- Node.js 18+, pnpm, Turborepo
- Docker & Docker Compose
- React 18+, TypeScript 5+

---

## 17. Resolved Design Decisions

The following design questions have been resolved and are incorporated into the architecture:

1. **FAILED Terminal State:** Phase 2 adds a `FAILED` terminal state to the task state machine (see Section 4). `FAILED` is used for unrecoverable errors (invalid requirements, impossible constraints, critical failures). Unlike `BLOCKED`, which can transition back to `IN_PROGRESS`, `FAILED` is terminal and requires task recreation. The `blockedReason` field is retained for `BLOCKED` tasks to describe recoverable issues.

2. **Consensus Threshold:** Multi-model voting (Phase 5) uses a 2/3 majority threshold for RED actions (see Section 7.3). When 3 models are queried and only 2 agree, the action proceeds with mandatory human review of the minority dissent. Dissent rationale is logged to the `activities` table for audit. Unanimous agreement is not required to avoid excessive blocking.

3. **Agent Persona Hot-Reload:** Persona YAML changes apply only on next agent spawn (see Section 5.1). Running agents continue with their loaded persona until termination. For urgent persona updates, the system provides a `POST /agents/:id/restart` API endpoint that gracefully terminates the agent and spawns a new instance with the updated persona. The restart operation is logged to `activities` with `action: 'AGENT_RESTARTED'` and includes the persona version change.

4. **Cursor IDE Integration:** The Coder agent treats Cursor as an external tool via the existing `executionRequests` table (see Section 10.2). When a task requires Cursor-specific execution (e.g., interactive debugging, IDE-based refactoring), the Coder agent creates an `executionRequest` with `executor: 'CURSOR'` and `payload` containing the task context. The Cursor integration polls for pending requests and executes them in the IDE environment. Results are posted back as task artifacts. This approach keeps the agent runtime decoupled from IDE-specific logic.

---

*This PRD supersedes the "Mission Control AI Agent Squad" PRD (v1.0) and the "Cursor and Clawdbot in Mission Control" PRD (v1.0). It is anchored to the actual v0.9.0 repository architecture as of February 2026.*
