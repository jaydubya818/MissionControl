# Getting Started with Mission Control

> **Superseded.** The "Project Structure" and build steps below reference
> packages (`packages/api`, `packages/ui`, `packages/workers`) and documents
> that do not exist, and instruct building an Express REST API that the current
> architecture explicitly rejects — Convex is the only backend. Use the
> "Local development" section of the root `README.md` and `docs/guides/RUN.md`.


**Welcome to Mission Control for OpenClaw!**

This guide will help you understand the project structure and get started with development.

---

## What You Have

Mission Control is now in **Phase 1 (Foundation)** with the following completed:

### ✅ Complete Planning & Architecture
- **IMPLEMENTATION_PLAN.md** - 6-8 week roadmap with 4 phases
- **EPICS_AND_STORIES.md** - 59 user stories with acceptance criteria
- **PROJECT_STATUS.md** - Current status and progress tracking

### ✅ Core Infrastructure
- **Monorepo Structure** - Turbo + TypeScript + workspaces
- **Type System** - Complete types for all entities
- **State Machine** - Deterministic task transitions with validator
- **Policy Engine** - Risk classification and approval logic
- **Database Schema** - Convex schema with 13 tables
- **Multi-Project Support** - Projects table with projectId on all entities
- **React UI** - Kanban, TaskDrawer, Sidebar, LiveFeed, Modals

### ✅ Documentation
- **README.md** - Project overview and quick start
- **RUNBOOK.md** - Operational procedures
- **MULTI_PROJECT_MODEL.md** - Multi-project architecture
- **This File** - Getting started guide

---

## Project Structure

```
mission-control/
├── packages/
│   ├── shared/              ✅ Types, constants, utilities
│   ├── state-machine/       ✅ Task state validator
│   ├── policy-engine/       ✅ Risk & approval logic
│   ├── api/                 ⏳ Express API (next)
│   ├── ui/                  ⏳ React UI (next)
│   └── workers/             ⏳ Daemons (next)
│
├── convex/                  ✅ Database schema
│   └── schema.ts
│
├── docs/                    ✅ Documentation
│   └── RUNBOOK.md
│
├── IMPLEMENTATION_PLAN.md   ✅ Complete roadmap
├── EPICS_AND_STORIES.md     ✅ User stories
├── PROJECT_STATUS.md        ✅ Current status
├── README.md                ✅ Project overview
└── GETTING_STARTED.md       ✅ This file
```

---

## Next Steps (In Order)

### 1. Set Up Development Environment

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Verify everything compiles
npm run typecheck
```

### 2. Set Up Convex

```bash
# Create Convex account (if needed)
open https://convex.dev

# Initialize Convex project
npx convex dev

# Follow prompts to create deployment
# Copy deployment URL to .env

# Verify schema
npx convex run --prod agents:list
```

### 3. Implement Convex Functions (Next Priority)

**Files to Create:**
- `convex/agents.ts` - Agent CRUD operations
- `convex/tasks.ts` - Task CRUD + transitions
- `convex/messages.ts` - Message operations
- `convex/approvals.ts` - Approval workflow
- `convex/activities.ts` - Activity logging

**Reference:**
- See `EPICS_AND_STORIES.md` stories E1-US-007 through E1-US-010
- Use types from `packages/shared/src/types/`
- Integrate state machine validator from `packages/state-machine`

### 4. Build Express API (After Convex)

**Files to Create:**
- `packages/api/src/index.ts` - Express server setup
- `packages/api/src/routes/agents.ts` - Agent routes
- `packages/api/src/routes/tasks.ts` - Task routes
- `packages/api/src/middleware/error.ts` - Error handling

**Reference:**
- See `EPICS_AND_STORIES.md` stories E1-US-011 and E1-US-012
- API endpoints documented in `IMPLEMENTATION_PLAN.md`

### 5. Build React UI (After API)

**Files to Create:**
- `packages/ui/src/main.tsx` - Entry point
- `packages/ui/src/components/AgentList.tsx` - Agent list
- `packages/ui/src/components/Kanban.tsx` - Task board
- `packages/ui/src/components/Layout.tsx` - Main layout

**Reference:**
- See `EPICS_AND_STORIES.md` stories E1-US-013 and E1-US-014
- Use Tailwind CSS for styling
- Connect to Convex with real-time subscriptions

### 6. Create Docker Setup (After UI)

**Files to Create:**
- `docker/Dockerfile.api` - API container
- `docker/Dockerfile.ui` - UI container
- `docker/docker-compose.yml` - Full stack

**Reference:**
- See `EPICS_AND_STORIES.md` story E1-US-015
- Use `.env.example` as template

---

## Development Workflow

### Daily Development

```bash
# Start all services in dev mode
npm run dev

# In separate terminals:
# Terminal 1: Convex dev server
npm run convex:dev

# Terminal 2: API server
cd packages/api && npm run dev

# Terminal 3: UI dev server
cd packages/ui && npm run dev

# Terminal 4: Workers (when implemented)
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

### Type Checking

```bash
# Check all packages
npm run typecheck

# Check specific package
cd packages/shared && npm run typecheck
```

---

## Key Concepts to Understand

### 1. Multi-Project Workspaces

Mission Control supports multiple projects (workspaces). Every entity is scoped to a project:

- **Project Switcher** - UI header dropdown to switch between projects
- **Scoped Queries** - All list queries accept optional `projectId`
- **Per-Project Policies** - Projects can have policy defaults

**Key Files:**
- `convex/projects.ts` - Project CRUD operations
- `docs/MULTI_PROJECT_MODEL.md` - Complete documentation

### 2. Sofie as CAO (Chief Agent Officer)

**Sofie** is the top-level authority for Mission Control execution:

- All agents report to Sofie
- Sofie owns: task triage, approval decisions, dispute resolution, escalation handling
- No agent may self-promote autonomy or execute RED actions without approval
- DB is canonical; if instructions conflict, Sofie wins

### 4. Task State Machine

Tasks flow through a deterministic state machine:

```
INBOX → ASSIGNED → IN_PROGRESS → REVIEW → DONE
                         ↓
                   NEEDS_APPROVAL
                         ↓
                     BLOCKED
```

**Rules:**
- Agents can move forward up to REVIEW
- Only humans can move REVIEW → DONE
- System can move any → BLOCKED or NEEDS_APPROVAL
- Each transition requires specific artifacts

**Implementation:**
- Validator in `packages/state-machine/src/validator.ts`
- Complete rules in `packages/state-machine/src/transitions.ts`
- Used by Convex mutations to enforce transitions

### 5. Policy Engine

Classifies tool actions by risk and determines approval requirements:

**Risk Levels:**
- **GREEN:** Internal, reversible (read DB, post comments)
- **YELLOW:** Potentially harmful (shell, git, network)
- **RED:** External impact (email, social, prod, secrets)

**Approval Logic:**
- RED always requires approval
- YELLOW requires approval for Interns
- Budget exceeds require approval
- Secrets/production require approval

**Implementation:**
- Risk classifier in `packages/policy-engine/src/evaluator.ts`
- Allowlists in `packages/policy-engine/src/allowlists.ts`
- Policy rules in `packages/policy-engine/src/rules.ts`

### 6. Budgets & Cost Containment

Three levels of budget enforcement:

1. **Per-Agent Daily:** Intern $2, Specialist $5, Lead $12
2. **Per-Task:** Content $6, Engineering $8, etc.
3. **Per-Run:** Intern $0.25, Specialist $0.75, Lead $1.50

**Containment:**
- Budget exceed → Task moves to NEEDS_APPROVAL or BLOCKED
- Agent paused if daily cap exceeded
- Alert created for operator

**Implementation:**
- Budget checks in Convex mutations
- Budget enforcer daemon in `packages/workers`

### 7. Observability

Complete audit trail of all activity:

- **Task Timeline:** All transitions, runs, tool calls, approvals
- **Activity Log:** System-wide event stream
- **Cost Attribution:** Per-agent, per-task, per-run rollups
- **Audit Export:** JSON/CSV export for compliance

**Implementation:**
- Activity logging in all Convex mutations
- Timeline query in `convex/tasks.ts`
- Cost rollup queries in `convex/runs.ts`

---

## Common Tasks

### Add a New Tool to Risk Map

```typescript
// packages/policy-engine/src/rules.ts
export const TOOL_RISK_MAP: ToolRiskMap = {
  // ... existing tools
  my_new_tool: "yellow",  // or "green" or "red"
};
```

### Add a New Task Type

```typescript
// packages/shared/src/types/task.ts
export type TaskType =
  | "content"
  | "social"
  // ... existing types
  | "my_new_type";

// packages/shared/src/constants.ts
export const DEFAULT_BUDGETS = {
  perTask: {
    // ... existing budgets
    my_new_type: 5,  // USD
  },
};
```

### Add a New State Transition

```typescript
// packages/state-machine/src/transitions.ts
export const TRANSITION_RULES: TransitionRule[] = [
  // ... existing rules
  {
    from: "my_status",
    to: "another_status",
    allowedActors: ["agent", "human"],
    requiresArtifacts: ["myArtifact"],
    description: "Description of transition",
  },
];
```

---

## Troubleshooting

### Build Errors

```bash
# Clean and rebuild
npm run clean
npm install
npm run build
```

### Type Errors

```bash
# Check which package has errors
npm run typecheck

# Fix shared types first (other packages depend on it)
cd packages/shared && npm run typecheck
```

### Convex Connection Issues

```bash
# Verify Convex is running
npx convex dev

# Check .env has correct CONVEX_URL
cat .env | grep CONVEX_URL

# Test connection
npx convex run --prod agents:list
```

---

## Getting Help

### Documentation
- **IMPLEMENTATION_PLAN.md** - Complete roadmap
- **EPICS_AND_STORIES.md** - Detailed user stories
- **RUNBOOK.md** - Operational procedures
- **README.md** - Project overview

### Code References
- **packages/shared** - Type definitions
- **packages/state-machine** - Transition logic
- **packages/policy-engine** - Risk & approval logic
- **convex/schema.ts** - Database structure

### External Resources
- [Convex Docs](https://docs.convex.dev)
- [Turbo Docs](https://turbo.build/repo/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

## Success Checklist

Before moving to Phase 2, ensure:

- [ ] All Phase 1 stories complete (15 stories)
- [ ] Convex functions working (agents, tasks CRUD)
- [ ] API server running with health check
- [ ] UI displays agents and tasks
- [ ] State machine validator integrated
- [ ] Docker Compose brings up full stack
- [ ] All tests passing
- [ ] Documentation updated

---

## What's Next?

After completing Phase 1 (Foundation), you'll move to:

**Phase 2: Safety & Collaboration (Weeks 3-4)**
- Approvals workflow
- Budget tracking & enforcement
- Thread mapping & subscriptions
- Notification dispatcher
- Loop detection
- Emergency controls

See `IMPLEMENTATION_PLAN.md` for complete Phase 2 details.

---

**Good luck building Mission Control!** 🚀

If you have questions, refer to the documentation or create an issue.

---

**Last Updated:** 2026-02-01  
**Project Lead:** Jarrett West
