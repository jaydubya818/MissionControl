# 1. Repo Bootstrap Plan

## Directory Structure

```
openclaw-mission-control/
├── README.md
├── package.json                    # Monorepo root (pnpm workspaces)
├── pnpm-workspace.yaml
├── turbo.json                      # Turborepo config
├── .env.example
├── .gitignore
│
├── apps/
│   ├── mission-control-ui/         # React frontend
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts          # Or next.config.js if Next.js
│   │   ├── index.html
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx
│   │   │   ├── components/
│   │   │   │   ├── layout/
│   │   │   │   │   ├── Sidebar.tsx
│   │   │   │   │   ├── Header.tsx
│   │   │   │   │   └── Layout.tsx
│   │   │   │   ├── tasks/
│   │   │   │   │   ├── TaskBoard.tsx       # Kanban view
│   │   │   │   │   ├── TaskCard.tsx
│   │   │   │   │   ├── TaskDetail.tsx
│   │   │   │   │   ├── TaskThread.tsx      # Comments/artifacts
│   │   │   │   │   ├── TaskTransitions.tsx # State machine UI
│   │   │   │   │   └── WorkPlanEditor.tsx
│   │   │   │   ├── agents/
│   │   │   │   │   ├── AgentRegistry.tsx
│   │   │   │   │   ├── AgentCard.tsx
│   │   │   │   │   ├── AgentControls.tsx   # pause/drain/quarantine
│   │   │   │   │   └── AgentTimeline.tsx
│   │   │   │   ├── approvals/
│   │   │   │   │   ├── ApprovalQueue.tsx
│   │   │   │   │   ├── ApprovalCard.tsx
│   │   │   │   │   └── ApprovalDetail.tsx
│   │   │   │   ├── alerts/
│   │   │   │   │   ├── AlertBanner.tsx
│   │   │   │   │   └── AlertList.tsx
│   │   │   │   ├── timeline/
│   │   │   │   │   ├── ActivityFeed.tsx
│   │   │   │   │   └── RunDetail.tsx
│   │   │   │   └── common/
│   │   │   │       ├── Button.tsx
│   │   │   │       ├── Badge.tsx
│   │   │   │       ├── Modal.tsx
│   │   │   │       └── ...
│   │   │   ├── hooks/
│   │   │   │   ├── useTasks.ts
│   │   │   │   ├── useAgents.ts
│   │   │   │   ├── useApprovals.ts
│   │   │   │   ├── useRealtime.ts          # Convex/WS subscriptions
│   │   │   │   └── usePolicy.ts
│   │   │   ├── lib/
│   │   │   │   ├── api.ts                  # API client
│   │   │   │   ├── convex.ts               # Convex client (if used)
│   │   │   │   └── utils.ts
│   │   │   ├── pages/
│   │   │   │   ├── Dashboard.tsx
│   │   │   │   ├── Tasks.tsx
│   │   │   │   ├── Agents.tsx
│   │   │   │   ├── Approvals.tsx
│   │   │   │   ├── Alerts.tsx
│   │   │   │   ├── Timeline.tsx
│   │   │   │   └── Settings.tsx
│   │   │   └── styles/
│   │   │       └── globals.css
│   │   └── public/
│   │
│   └── mission-control-api/          # TypeScript API server
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts              # Entry point
│       │   ├── server.ts             # Express/Fastify setup
│       │   ├── routes/
│       │   │   ├── tasks.ts
│       │   │   ├── agents.ts
│       │   │   ├── approvals.ts
│       │   │   ├── policies.ts
│       │   │   ├── events.ts
│       │   │   ├── notifications.ts
│       │   │   └── health.ts
│       │   ├── middleware/
│       │   │   ├── auth.ts
│       │   │   ├── validate.ts
│       │   │   ├── rateLimit.ts
│       │   │   └── errorHandler.ts
│       │   ├── services/
│       │   │   ├── taskService.ts
│       │   │   ├── transitionService.ts   # State machine logic
│       │   │   ├── agentService.ts
│       │   │   ├── approvalService.ts
│       │   │   ├── policyService.ts       # Uses policy-engine
│       │   │   ├── notificationService.ts
│       │   │   └── eventService.ts
│       │   ├── storage/
│       │   │   ├── interface.ts           # Storage abstraction
│       │   │   ├── convex.ts              # Convex implementation
│       │   │   ├── postgres.ts            # Postgres implementation
│       │   │   └── index.ts               # Factory
│       │   └── types/
│       │       └── index.ts
│       └── tests/
│           ├── tasks.test.ts
│           ├── transitions.test.ts
│           └── policy.test.ts
│
├── packages/
│   ├── policy-engine/                # Policy evaluation library
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── evaluator.ts          # Main evaluation logic
│   │   │   ├── rules/
│   │   │   │   ├── risk.ts           # GREEN/YELLOW/RED classification
│   │   │   │   ├── allowlists.ts     # Shell/file/network checks
│   │   │   │   ├── budgets.ts        # Budget enforcement
│   │   │   │   ├── spawn.ts          # Spawn limits
│   │   │   │   └── loops.ts          # Loop detection
│   │   │   ├── types.ts
│   │   │   └── defaults.ts           # Default policies
│   │   └── tests/
│   │       └── evaluator.test.ts
│   │
│   └── shared/                       # Shared types/utils
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── types/
│           │   ├── task.ts
│           │   ├── agent.ts
│           │   ├── message.ts
│           │   ├── approval.ts
│           │   ├── policy.ts
│           │   ├── event.ts
│           │   └── notification.ts
│           ├── constants/
│           │   ├── statuses.ts
│           │   ├── taskTypes.ts
│           │   └── riskLevels.ts
│           ├── utils/
│           │   ├── idempotency.ts
│           │   ├── redaction.ts
│           │   └── validation.ts
│           └── schemas/              # Zod schemas for validation
│               ├── task.ts
│               ├── agent.ts
│               └── ...
│
├── workers/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── notification-worker.ts    # Delivery loop
│   │   ├── budget-monitor.ts         # Budget + containment
│   │   ├── loop-detector.ts          # Loop detection + summary
│   │   ├── standup-generator.ts      # Daily standup
│   │   ├── approval-expirer.ts       # Expire stale approvals
│   │   └── cleanup-worker.ts         # Archive old data
│   └── Dockerfile
│
├── infra/
│   ├── docker-compose.yml
│   ├── docker-compose.prod.yml
│   ├── Dockerfile.api
│   ├── Dockerfile.ui
│   ├── Dockerfile.workers
│   └── nginx.conf                    # Reverse proxy config
│
├── cli/                              # Optional: standalone CLI
│   ├── package.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── commands/
│   │   │   ├── task.ts               # mc task list/claim/comment/submit
│   │   │   ├── approval.ts           # mc approval request/check
│   │   │   └── agent.ts              # mc agent status/register
│   │   └── lib/
│   │       └── api.ts
│   └── bin/
│       └── mc                        # Executable
│
└── docs/
    ├── PRD.md                        # Full PRD (copy from bootstrap)
    ├── STATE_MACHINE.md
    ├── POLICY_V1.md
    ├── HEARTBEAT.md
    ├── RUNBOOK.md
    ├── API.md                        # OpenAPI spec or reference
    ├── ARCHITECTURE.md
    └── DEPLOYMENT.md
```

## File Contents Overview

### Root package.json
```json
{
  "name": "openclaw-mission-control",
  "private": true,
  "workspaces": ["apps/*", "packages/*", "workers", "cli"],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "db:push": "turbo run db:push --filter=mission-control-api",
    "workers:start": "node workers/dist/index.js"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.3.0"
  }
}
```

### pnpm-workspace.yaml
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'workers'
  - 'cli'
```

### turbo.json
```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {}
  }
}
```

### .env.example
```bash
# Database
DATABASE_URL=postgresql://localhost:5432/mission_control
# Or for Convex:
CONVEX_DEPLOYMENT=dev:your-deployment

# API
API_PORT=3100
API_SECRET=your-secret-key

# Notifications
TELEGRAM_BOT_TOKEN=your-telegram-token
SLACK_WEBHOOK_URL=https://hooks.slack.com/...

# OpenClaw Integration
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=your-gateway-token

# Workers
REDIS_URL=redis://localhost:6379
WORKER_CONCURRENCY=5

# Feature Flags
ENABLE_CONVEX=true
ENABLE_POSTGRES=false
```

## Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| UI | React + Vite | Or Next.js if SSR needed |
| UI Components | shadcn/ui | Consistent with SellerFi |
| API | Fastify | Fast, typed, good DX |
| Storage (MVP) | Convex | Realtime, serverless |
| Storage (Scale) | Postgres + Prisma | Swap via interface |
| Workers | Node.js + BullMQ | Job queues |
| Cache/Queues | Redis | For BullMQ |
| Notifications | Telegram API | First channel |

## Implementation Order

1. **Week 1: Foundation**
   - [ ] Repo scaffold + monorepo setup
   - [ ] `packages/shared` types
   - [ ] `packages/policy-engine` core
   - [ ] Storage interface + Convex impl

2. **Week 2: API**
   - [ ] Task CRUD + transitions
   - [ ] Agent registry
   - [ ] Approvals queue
   - [ ] Policy evaluation endpoint

3. **Week 3: Workers**
   - [ ] Notification delivery
   - [ ] Budget monitor
   - [ ] Loop detector

4. **Week 4: UI + Integration**
   - [ ] Task board + detail
   - [ ] Agent controls
   - [ ] Approval queue UI
   - [ ] OpenClaw agent integration
