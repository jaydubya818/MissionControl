# Architecture Notes

Date: 2026-02-12  
Branch: `feat/prd-roadmap-impl-20260212`

## High-Level Diagram (Text)

```text
Operator (Browser UI)
  -> React/Vite SPA (apps/mission-control-ui)
    -> Convex client hooks (useQuery/useMutation/useAction)
      -> Convex functions (queries/mutations/actions)
        -> Convex database tables (source of truth)

Orchestration Server (apps/orchestration-server, Hono)
  -> ConvexHttpClient
    -> reads tasks/agents state
    -> runs coordinator tick logic
    -> writes assignments/alerts/subtasks

Packages (domain logic)
  - coordinator: decomposition/delegation loop logic
  - agent-runtime: persona + heartbeat + lifecycle
  - memory: session/project/global memory models
  - context-router: intent + route decision
  - model-router: model selection + fallback + cost estimates
  - workflow-engine: workflow step execution loop
```

## Module Boundaries

### 1) UI Layer (`apps/mission-control-ui`)

- Responsibility: operator workflows, visibility, controls.
- Pattern: mostly direct Convex data access from components.
- Key entrypoint: `apps/mission-control-ui/src/App.tsx`.

### 2) Convex Domain/API Layer (`convex/`)

- Responsibility: persistence, guardrails, task lifecycle, audit, real-time query surfaces.
- Key modules:
  - Task lifecycle: `tasks.ts`, `taskRouter.ts`
  - Governance/safety: `policy.ts`, `approvals.ts`, `operatorControls.ts`
  - Audit/eventing: `taskTransitions`, `taskEvents`, `activities`
  - Comms/identity: `identity.ts`, `telegraph.ts`, `meetings.ts`, `voice.ts`
- Source-of-truth schema: `convex/schema.ts`.

### 3) Orchestration Runtime Layer (`apps/orchestration-server`, `packages/*`)

- Responsibility: long-running coordination loop and package-level decision logic.
- Current state:
  - Coordinator tick is functional and writes back into Convex.
  - Agent lifecycle scaffolding is present; full runtime integration is partial.
  - Workflow engine exists but not fully integrated into top-level app operations.

### 4) Shared Contract Layer (`packages/shared`)

- Responsibility: shared type contracts and cross-package utilities.
- Important because many packages mirror schema/state conventions.

## Core Data Flows

### Task Lifecycle Flow

1. Operator or system creates task (`tasks.create`) -> `tasks` row in `INBOX`.
2. Assignment or transition operations mutate task via `tasks.transition` and `taskRouter`.
3. Transition writes:
  - `tasks` current state
  - immutable `taskTransitions` row
  - canonical `taskEvents` row
  - `activities` audit row
4. UI reads via `tasks.getWithTimeline` / `tasks.getUnifiedTimeline`.

### Approval Flow

1. Risk/policy path requests approval (`approvals.request`).
2. Approval lifecycle changes status (`approve`, `deny`, escalation, expiry).
3. Approval and related events are surfaced in task timeline and approval center.

### Run/Cost Flow

1. Agent run starts (`runs.start`) with budget gates and operator-mode checks.
2. Run completion (`runs.complete`) updates token/cost totals.
3. Spend rolls up to agent/task budgets, with alerts + approval gates as needed.

### Communications/Governance Flow

1. Identity/scanner APIs maintain agent governance data (`agentIdentities`).
2. Telegraph thread/message APIs support internal/external comms.
3. Meetings + voice artifacts persist operational comms records and outputs.

## Current Architecture Risks

- Event stream is present but not fully unified across all producer paths.
- Some modules still rely on broad `.collect()` queries and in-memory filtering.
- Project scoping and authz posture is not yet strict by default across all surfaces.
