# Mission Control for OpenClaw

**Version:** 0.9.0 MVP  
**Status:** Implementation Phase  
**Target:** 6-8 weeks to production-ready MVP

---

## Overview

Mission Control is a self-hosted orchestration and observability control plane for running a squad of autonomous OpenClaw agents. It transforms multiple agent sessions into a coherent digital team with:

- **Deterministic Task State Machine** - 8 states with strict transition rules
- **Thread-per-Task Collaboration** - @mentions, subscriptions, real-time discussions
- **Safety Guardrails** - Budgets, approvals, risk classification, emergency controls
- **Deep Observability** - Timeline view, cost attribution, audit logs
- **Operator Control** - Pause/drain/quarantine agents, approve risky actions

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+
- Docker & Docker Compose
- Convex account (free tier works)

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd mission-control

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your Convex credentials

# Build all packages
npm run build

# Start development servers
npm run dev
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
│  Notification | Heartbeat | Loop Detector | Budget Enforcer │
└─────────────────────────────────────────────────────────────┘
```

---

## Repository Structure

```
mission-control/
├── packages/
│   ├── shared/              # Shared types, constants, utilities
│   ├── state-machine/       # Task state validator
│   ├── policy-engine/       # Risk classification & approvals
│   ├── api/                 # Express API server
│   ├── ui/                  # React frontend
│   └── workers/             # Background daemons
├── convex/                  # Convex database schema & functions
├── docker/                  # Docker configuration
├── docs/                    # Documentation
├── scripts/                 # Setup and utility scripts
└── README.md
```

---

## Core Concepts

### Agents

Agents are autonomous OpenClaw sessions with:
- **Autonomy Levels:** Intern, Specialist, Lead
- **Budgets:** Daily cap, per-run cap
- **Tool Permissions:** Allowlisted tools
- **Status:** Active, Paused, Drained, Quarantined, Stopped

### Tasks

Tasks are units of work with deterministic state machine:
- **8 States:** Inbox → Assigned → In Progress → Review → Done
- **Special States:** Needs Approval, Blocked, Canceled
- **Artifacts:** Work plan, deliverable, self-review, evidence
- **Budget Tracking:** Per-task spend vs. budget

### State Machine

Strict transition rules enforced by validator:
- **Agent Actions:** Can move forward up to Review
- **Human Actions:** Required for Review → Done
- **System Actions:** Can block or require approval
- **Required Artifacts:** Work plan for In Progress, deliverable for Review, approval for Done

### Policy Engine

Risk classification and approval logic:
- **GREEN:** Internal, reversible (read DB, post comments)
- **YELLOW:** Potentially harmful (shell, git commit, network calls)
- **RED:** External impact (email, social post, prod deploy, secrets)
- **Approval Triggers:** RED always, YELLOW for Interns, budget exceeds, secrets, production

### Approvals

Human-in-the-loop for risky actions:
- **Approval Queue:** Pending approvals with risk badge
- **Approve/Deny:** Record decision with explanation
- **Audit Trail:** Complete history of approval decisions

### Budgets

Cost containment at multiple levels:
- **Per-Agent Daily:** Intern $2, Specialist $5, Lead $12
- **Per-Task:** Content $6, Engineering $8, etc.
- **Per-Run:** Intern $0.25, Specialist $0.75, Lead $1.50
- **Containment:** Budget exceed → Needs Approval or Blocked

### Observability

Deep visibility into agent activity:
- **Task Timeline:** Transitions, runs, tool calls, approvals, alerts
- **Cost Attribution:** Per-agent, per-task, per-run rollups
- **Audit Logs:** Every state transition and tool call
- **Live Feed:** Real-time activity stream

---

## Key Features

### Emergency Controls

- **Pause Squad:** Pause all agents immediately
- **Quarantine Agent:** Stop agent and block its tasks
- **Drain Agent:** Finish current task, then pause
- **Emergency Stop:** Pause all + block all tasks

### Loop Detection

Automatic detection of runaway loops:
- `>20` comments in 30 minutes
- `>3` review cycles
- Same pair back-and-forth `>8` times in 10 minutes
- Tool retries `>3` with same error
- **Containment:** Task → Blocked + alert + summary

### Collaboration

Thread-per-task with real-time updates:
- **@Mentions:** Notify agents of relevant discussions
- **Subscriptions:** Follow tasks of interest
- **Comments:** Mirrored into DB for audit
- **Rate Limits:** Prevent spam and loops

---

## Development

### Package Scripts

```bash
# Development
npm run dev              # Start all packages in dev mode
npm run build            # Build all packages
npm run typecheck        # Type check all packages
npm run test             # Run all tests
npm run lint             # Lint all packages

# Individual packages
cd packages/api && npm run dev
cd packages/ui && npm run dev
cd packages/workers && npm run dev
```

### Testing

```bash
# Run all tests
npm run test

# Run specific package tests
cd packages/state-machine && npm run test
cd packages/policy-engine && npm run test

# Watch mode
npm run test:watch
```

### Database

```bash
# Start Convex dev server
npm run convex:dev

# Deploy to Convex cloud
npm run convex:deploy

# View Convex dashboard
open https://dashboard.convex.dev
```

---

## Documentation

- **[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)** - Complete implementation plan with phases
- **[EPICS_AND_STORIES.md](./EPICS_AND_STORIES.md)** - 59 user stories with acceptance criteria
- **[docs/STATE_MACHINE.md](./docs/STATE_MACHINE.md)** - State machine specification
- **[docs/POLICY_V1.md](./docs/POLICY_V1.md)** - Policy rules and risk classification
- **[docs/API.md](./docs/API.md)** - REST API documentation
- **[docs/RUNBOOK.md](./docs/RUNBOOK.md)** - Operational procedures
- **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** - VPS deployment guide

---

## Roadmap

### Phase 1: Foundation (Weeks 1-2) ✅
- [x] Monorepo setup
- [x] Convex schema
- [x] State machine validator
- [x] Policy engine
- [ ] Agent registry CRUD
- [ ] Task CRUD with transitions
- [ ] Basic UI (Kanban + agent list)
- [ ] Docker Compose setup

### Phase 2: Safety & Collaboration (Weeks 3-4)
- [ ] Approvals workflow
- [ ] Budget tracking & enforcement
- [ ] Thread mapping & subscriptions
- [ ] Notification dispatcher
- [ ] Loop detection daemon
- [ ] Emergency controls
- [ ] Approvals inbox UI

### Phase 3: Observability (Weeks 5-6)
- [ ] Task timeline view
- [ ] Run & tool call tracking
- [ ] Cost attribution & rollups
- [ ] Audit log export
- [ ] Daily standup generator
- [ ] Task detail drawer

### Phase 4: Hardening (Weeks 7-8)
- [ ] Integration tests
- [ ] Load testing (100+ tasks/day)
- [ ] Security audit
- [ ] Deployment guide
- [ ] Operator training materials
- [ ] Incident response playbook

### v1.1 (Post-MVP)
- [ ] Sub-agent tree visualization
- [ ] Global search
- [ ] Incident export (JSON/CSV/PDF)
- [ ] Better AI summaries
- [ ] Slack integration
- [ ] Enterprise RBAC

---

## Success Metrics

### Autonomy & Throughput
- ≥80% tasks reach Review without human intervention
- ≥60% tasks reach Done with only final approval
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

## Contributing

This is currently a solo project by Jarrett West. Contributions welcome after v1.0 release.

---

## License

MIT

---

## Support

For issues, questions, or feature requests, please open an issue on GitHub.

---

**Built with ❤️ for autonomous agent teams**
