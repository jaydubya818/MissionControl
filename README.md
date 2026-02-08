# Mission Control

**Version:** 0.9.0  
**Status:** Phase 2 Complete -- Intelligence Layer Shipped  
**Architecture:** pnpm monorepo + Convex serverless backend + React dashboard + Hono orchestration server

---

## Overview

Mission Control is a self-hosted orchestration and observability control plane for autonomous AI agent squads. It transforms multiple AI agent sessions into a coordinated digital team with:

- **Deterministic Task State Machine** -- 8 states with strict transition rules
- **Thread-per-Task Collaboration** -- @mentions, subscriptions, real-time discussions
- **Safety Guardrails** -- Budgets, approvals, risk classification, emergency controls
- **Deep Observability** -- Timeline view, cost attribution, audit logs
- **Operator Control** -- Pause/drain/quarantine agents, approve risky actions
- **Multi-Project Workspaces** -- Multiple projects with independent agents, tasks, and policies

---

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm
- Docker & Docker Compose
- Convex account (free tier works)

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd MissionControl

# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
# Edit .env with your Convex credentials

# Build all packages
pnpm run build

# Start development
pnpm run dev
```

### Docker Deployment

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

---

## Architecture

```
+-----------------------------------------------------------+
|                    Mission Control UI                      |
|              (React + Convex Reactive Subscriptions)       |
+----------------------------+------------------------------+
                             |
+----------------------------+------------------------------+
|                   Convex Backend                           |
|  Tasks | Agents | Messages | Approvals | Activities       |
|  Runs  | ToolCalls | Policies | Alerts | Projects         |
+----------------------------+------------------------------+
                             |
+----------------------------+------------------------------+
|               Background Jobs (Convex Crons)               |
|  Loop Detection | Approval Expiry | Daily Standup          |
+-----------------------------------------------------------+
```

The React UI communicates directly with Convex via reactive `useQuery`/`useMutation` hooks. There is no Express API server -- Convex serves as both the database and the backend API layer.

For the full architectural vision including the planned orchestration server, see the [PRD v2.0](./docs/PRD_V2.md).

---

## Repository Structure

```
MissionControl/
├── apps/
│   ├── mission-control-ui/      # React dashboard (Vite + Convex)
│   └── orchestration-server/    # Hono-based coordinator + agent runtime host
├── agents/                      # Agent persona YAML configs (11 agents)
├── convex/                      # Database schema & serverless functions
│   ├── schema.ts                # Source-of-truth data model (21 tables)
│   ├── tasks.ts                 # Task CRUD & state transitions
│   ├── agents.ts                # Agent management & heartbeat recovery
│   ├── coordinator.ts           # Task decomposition & dependency graph
│   ├── taskRouter.ts            # Performance-based task routing
│   ├── agentLearning.ts         # Agent performance & pattern tracking
│   ├── crons.ts                 # Scheduled jobs (loops, heartbeat, executor)
│   ├── lib/riskClassifier.ts    # Centralized risk classification
│   └── ...
├── packages/
│   ├── shared/                  # Shared types, constants, utilities
│   ├── state-machine/           # Task state validator (9-state lifecycle)
│   ├── policy-engine/           # Risk classification & approval logic
│   ├── agent-runtime/           # Full agent lifecycle, persona loading, memory
│   ├── coordinator/             # Task decomposition, delegation, orchestration
│   ├── context-router/          # Intent classification & routing (Tier 1)
│   ├── model-router/            # Multi-model abstraction (Claude, cost estimation)
│   ├── memory/                  # 3-tier memory (session, project, global)
│   ├── agent-runner/            # DEPRECATED — use orchestration-server
│   ├── openclaw-sdk/            # SDK for external agent integration
│   └── telegram-bot/            # Telegram commands & notifications
├── docs/
│   ├── PRD_V2.md                # Product Requirements Document v2.0
│   ├── TECH_STACK.md            # Locked dependency versions
│   ├── FRONTEND_GUIDELINES.md   # Design system (colors, typography, spacing)
│   ├── APP_FLOW.md              # Dashboard views, navigation, modals
│   ├── BACKEND_STRUCTURE.md     # Convex schema & API surface reference
│   ├── architecture/            # System design docs
│   ├── guides/                  # Getting started, deployment, etc.
│   ├── planning/                # Implementation plans, epics, roadmaps
│   ├── decisions/               # Architecture Decision Records (ADRs)
│   ├── runbook/                 # Operational runbook
│   └── openclaw-bootstrap/      # OpenClaw integration & agent personas
├── scripts/                     # Setup and utility scripts
├── .cursorrules                 # AI session rules (read automatically by Cursor)
├── progress.txt                 # Session continuity tracker
├── docker-compose.yml
├── pnpm-workspace.yaml
└── turbo.json
```

---

## Core Concepts

### Tasks

Tasks are units of work with a deterministic state machine:
- **8 States:** INBOX, ASSIGNED, IN_PROGRESS, REVIEW, NEEDS_APPROVAL, BLOCKED, DONE, CANCELED
- **Artifacts:** Work plan, deliverable, self-review, evidence
- **Budget Tracking:** Per-task spend vs. budget
- **Source Provenance:** Every task tracks where it came from and who created it

#### Task Sources

Each task records its origin via the `source` field, displayed as a color-coded badge on Kanban cards and in the Task Drawer:

| Source | Icon | Description |
|---|---|---|
| `DASHBOARD` | 🖥️ | Created manually from the Mission Control UI |
| `TELEGRAM` | ✈️ | Created via the Telegram bot (e.g. `/newtask`) |
| `GITHUB` | 🐙 | Created from GitHub events (issues, PRs, webhooks) |
| `AGENT` | 🤖 | Spawned autonomously by an AI agent |
| `API` | 🔌 | Created via external API integration |
| `TRELLO` | 📋 | Synced from a Trello board |
| `SEED` | 🌱 | Inserted by seed/demo scripts |

Tasks also carry:
- **`sourceRef`** — a reference ID (e.g. `owner/repo#42`, Telegram message ID, Trello card ID)
- **`createdBy`** — who initiated it: `HUMAN`, `AGENT`, or `SYSTEM`

### Agents

Agents are autonomous sessions with:
- **Autonomy Levels:** Intern, Specialist, Lead
- **Budgets:** Daily cap ($2/$5/$12), per-run cap ($0.25/$0.75/$1.50)
- **Tool Permissions:** Allowlisted tools per agent
- **Status:** Active, Paused, Drained, Quarantined, Offline

### Policy Engine

Risk classification and approval logic:
- **GREEN:** Internal, reversible (read DB, post comments)
- **YELLOW:** Potentially harmful (shell, git commit, network calls)
- **RED:** External impact (email, social post, prod deploy, secrets)
- **Approval Triggers:** RED always, YELLOW for Interns, budget exceeds, secrets, production

### Safety Controls

- **Emergency Controls:** Pause Squad, Quarantine Agent, Drain, Emergency Stop
- **Loop Detection:** Comment storms, review ping-pong, repeated tool failures
- **Budget Enforcement:** Per-agent daily, per-task, per-run limits

---

## Documentation

### Canonical Docs (AI Knowledge Base)

These are the source-of-truth documents that AI reads for context. Keep them updated.

| Document | Purpose |
|---|---|
| **[PRD v2.0](./docs/PRD_V2.md)** | Full product requirements, architecture, roadmap, and phasing |
| **[TECH_STACK.md](./docs/TECH_STACK.md)** | Locked dependency versions, what is and is NOT in the stack |
| **[FRONTEND_GUIDELINES.md](./docs/FRONTEND_GUIDELINES.md)** | Design system: colors, typography, spacing, component patterns |
| **[APP_FLOW.md](./docs/APP_FLOW.md)** | All dashboard views, navigation paths, modals, keyboard shortcuts |
| **[BACKEND_STRUCTURE.md](./docs/BACKEND_STRUCTURE.md)** | Convex schema (18 tables), API surface (60+ queries, 50+ mutations) |

### Session Files

| File | Purpose |
|---|---|
| **[.cursorrules](./.cursorrules)** | AI operating manual -- read automatically by Cursor every session |
| **[progress.txt](./progress.txt)** | Session continuity -- what was done, what is broken, what is next |

### Guides

- **[Getting Started](./docs/guides/GETTING_STARTED.md)** -- Development setup
- **[Deployment Guide](./docs/guides/DEPLOY_NOW.md)** -- Step-by-step deployment
- **[Projects Guide](./docs/guides/PROJECTS_GUIDE.md)** -- Multi-project workspaces
- **[Telegram Setup](./docs/guides/TELEGRAM_BOT_SETUP.md)** -- Bot configuration
- **[Runbook](./docs/runbook/RUNBOOK.md)** -- Operational procedures and incident response

### Architecture & Planning

- **[Multi-Project Model](./docs/architecture/MULTI_PROJECT_MODEL.md)** -- Project isolation design
- **[OpenClaw Integration](./docs/architecture/OPENCLAW_INTEGRATION.md)** -- Agent integration patterns
- **[Implementation Plan](./docs/planning/IMPLEMENTATION_PLAN.md)** -- Original phase plan
- **[Epics & Stories](./docs/planning/EPICS_AND_STORIES.md)** -- 59 user stories

### Reference

- **[State Machine](./docs/openclaw-bootstrap/operating-manual/STATE_MACHINE.md)** -- State machine specification
- **[Policy v1](./docs/openclaw-bootstrap/operating-manual/POLICY_V1.md)** -- Policy rules detail
- **[Schema](./docs/openclaw-bootstrap/schema/SCHEMA.md)** -- Database schema reference

---

## Development

### Package Scripts

```bash
# Development
pnpm run dev              # Start all packages in dev mode
pnpm run build            # Build all packages
pnpm turbo typecheck      # Type check all packages

# Run the agent runner
pnpm run agent:run        # Default agent (Scout)
pnpm run agent:run:scout  # Scout preset
pnpm run agent:run:scribe # Scribe preset

# Database
pnpm run convex:dev       # Start Convex dev server
pnpm run convex:deploy    # Deploy to Convex cloud
```

---

## Intelligence Layer

Mission Control includes a full intelligence layer that turns the control plane from a passive dashboard into an active orchestration system. This was shipped as part of Phase 2 and includes:

### Orchestration Server
A Hono-based HTTP server (`apps/orchestration-server/`) that hosts the coordinator loop and agent runtime. Endpoints for health checks, status, tick, agent spawn/stop, and graceful shutdown.

### Coordinator
Task decomposition and delegation engine (`packages/coordinator/`, `convex/coordinator.ts`):
- **Strategy-based decomposition** -- breaks complex tasks into subtasks with dependency ordering
- **DAG dependency graph** -- tracks inter-task dependencies for execution ordering
- **Delegation pipeline** -- matches subtasks to the best-fit agent by skill, availability, and performance
- **Stuck detection** -- escalates tasks that stall for too long

### Context Router
Intent classification and routing (`packages/context-router/`):
- **Tier 1 rule-based classifier** -- routes by intent, complexity, and task type
- Routes to `COORDINATOR`, `SINGLE_TASK`, `CLARIFY`, `REJECT`, or `DEFER`
- Capacity and budget checks before routing
- 38 unit tests passing

### Model Router
Multi-model abstraction (`packages/model-router/`):
- **Claude provider** with fallback chains
- **Cost estimation** per model and task type
- Model selection by task type, risk level, and remaining budget
- Designed for future OpenAI/Gemini providers

### Memory System
Three-tier persistent memory (`packages/memory/`):
- **Session memory** -- per-task context that persists across heartbeats
- **Project memory** -- shared knowledge within a project
- **Global memory** -- cross-project insights and patterns
- Unified `MemoryManager` with lifecycle hooks

### Agent Runtime
Full agent lifecycle management (`packages/agent-runtime/`):
- Persona loading from YAML configs (`agents/*.yaml`)
- Heartbeat monitoring with auto-quarantine for stale agents
- Memory integration on start/stop
- Session/daily notes persistence

### Performance-Based Task Routing
Enhanced scoring in `convex/taskRouter.ts`:
- 20% weight for agent performance (success rate, refute count)
- Pulled from `agentPerformance` table
- Used in both `findBestAgent` and `autoAssign`

### Centralized Risk Classifier
`convex/lib/riskClassifier.ts` provides a shared risk classification function used by both the Convex policy layer and the policy-engine package, ensuring consistent GREEN/YELLOW/RED classification.

### Intelligence Layer UI
- **Mission DAG View** -- SVG dependency graph with topological layout (Kahn's algorithm), status-colored nodes
- **Explainability Panel** -- "Why?" tab in task drawer showing assignment reasoning, risk assessment, decision timeline
- **Loop Detection Panel** -- summary cards per loop type with one-click actions (Unblock, Acknowledge, Resolve)
- **Budget Burn-Down** -- per-agent and per-project spend visualization with alerts

### Executor Router
Cron-based auto-routing (`convex/crons.ts`) that processes execution requests every 5 minutes, matching tasks to the appropriate executor (Cursor, Claude Code, OpenClaw, Manual).

---

## Roadmap

See [PRD v2.0](./docs/PRD_V2.md) for the full roadmap. Summary:

- **Phase 1: Foundation** -- COMPLETE
- **Phase 2: Orchestration Server & Agent Runtime** -- COMPLETE
- **Phase 3: Model Router & Context Routing** -- IN PROGRESS
- **Phase 4: Multi-Model, Observability & Polish** -- Weeks 6-8
- **Phase 5: Hardening & Scale** -- Weeks 9-12

---

## Contributing

This is currently a solo project by Jarrett West. Contributions welcome after v1.0 release.

## License

MIT

---

**Built for autonomous agent teams.**
