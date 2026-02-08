# Mission Control

**Version:** 0.9.0  
**Status:** Foundation Complete, Agent Runtime Next  
**Architecture:** pnpm monorepo + Convex serverless backend + React dashboard

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
│   └── mission-control-ui/     # React dashboard (Vite + Convex)
├── convex/                      # Database schema & serverless functions
│   ├── schema.ts                # Source-of-truth data model
│   ├── tasks.ts                 # Task CRUD & state transitions
│   ├── agents.ts                # Agent management & heartbeat
│   ├── runs.ts                  # Run tracking & cost accounting
│   ├── approvals.ts             # Approval workflow
│   ├── loops.ts                 # Loop detection logic
│   ├── crons.ts                 # Scheduled background jobs
│   └── ...
├── packages/
│   ├── shared/                  # Shared types, constants, utilities
│   ├── state-machine/           # Task state validator (8-state lifecycle)
│   ├── policy-engine/           # Risk classification & approval logic
│   ├── agent-runner/            # Proto-runtime: register, heartbeat, claim
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
│   ├── changelog/               # Version history, status reports
│   ├── runbook/                 # Operational runbook
│   └── openclaw-bootstrap/      # OpenClaw integration reference
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

## Roadmap

See [PRD v2.0](./docs/PRD_V2.md) for the full roadmap. Summary:

- **Phase 1: Foundation** -- COMPLETE (current repo)
- **Phase 2: Orchestration Server & Agent Runtime** -- Weeks 1-3
- **Phase 3: Model Router & Context Routing** -- Weeks 4-5
- **Phase 4: Multi-Model, Observability & Polish** -- Weeks 6-8
- **Phase 5: Hardening & Scale** -- Weeks 9-12

---

## Contributing

This is currently a solo project by Jarrett West. Contributions welcome after v1.0 release.

## License

MIT

---

**Built for autonomous agent teams.**
