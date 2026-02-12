# Implementation Map

Date: 2026-02-12  
Branch: `feat/prd-roadmap-impl-20260212`

## Sources Read

- `docs/PRD_V2.md` (used as PRD source; `docs/PRD.md` is missing)
- `docs/ROADMAP.md`
- `README.md`

## What Is Already Implemented

### Platform/Foundation

- Monorepo is active with pnpm + Turborepo.
- Frontend exists as React + Vite app in `apps/mission-control-ui`.
- Backend/data plane exists in Convex (`convex/schema.ts` + many functions).
- Long-running orchestration service exists (`apps/orchestration-server`, Hono).
- Core packages are present: `coordinator`, `agent-runtime`, `memory`, `context-router`, `model-router`, `workflow-engine`, `policy-engine`, `state-machine`.

### Control Plane + Governance

- Deterministic task lifecycle implemented with 9 statuses (includes `FAILED`) in `convex/schema.ts` and `convex/tasks.ts`.
- Transition validation and actor restrictions are enforced in mutation path.
- Approvals system implemented with escalation and dual-control fields in `convex/approvals.ts`.
- Operator modes (`NORMAL`, `PAUSED`, `DRAINING`, `QUARANTINED`) implemented in `convex/operatorControls.ts`.
- `taskEvents` table exists and is used by task timeline UI as canonical-first source.
- Saved views and watch subscriptions exist with UI usage (`convex/savedViews.ts`, `convex/watchSubscriptions.ts`, `KanbanFilters`, `TaskDrawerTabs`).

### Agent Org OS / Communications (Roadmap "Now" scope)

- Identity governance backend and UI exist (`convex/identity.ts`, `IdentityDirectoryView.tsx`).
- Telegraph backend and UI exist (`convex/telegraph.ts`, `TelegraphInbox.tsx`).
- Meetings backend and UI exist (`convex/meetings.ts`, `MeetingsView.tsx`).
- Voice backend and UI exist (`convex/voice.ts`, `VoicePanel.tsx`).
- Org assignments table + API exist (`orgAssignments` schema and `convex/orgAssignments.ts`).
- Session bootstrap action exists (`convex/sessionBootstrap.ts`).

## Missing vs PRD + ROADMAP

### Highest-Impact Gaps

- `taskEvents` is not yet fully unified:
  - Remaining producers are incomplete or missing (notably tool-call production path).
  - No explicit backfill workflow for legacy tasks with partial event streams.
  - `policy` decisions are explainable but not consistently materialized as timeline events.
- Workflow execution path has partial surfaces:
  - `convex/workflows.install` is a stub.
  - Workflow dashboard components exist but are not wired into main app navigation.
- Security + tenancy hardening is incomplete:
  - Project scoping is optional in many list/search queries.
  - Fine-grained authz checks are not consistently enforced.
- Session bootstrap memory contract is present but has TODO placeholders for full memory hydration.

### Notable Technical Signals

- `toolCalls` table exists but lacks a complete write path in Convex functions.
- Some timeline views still keep fallback stitching logic from legacy tables.
- Several queries still rely on `.collect()` + in-memory filtering in hot paths.

## Immediate Next Milestone To Build

## Milestone 1: Canonical Timeline Hardening (`taskEvents` backfill + producer coverage)

This is the best "next" milestone because it directly matches ROADMAP control-plane hardening:
- "Canonical `taskEvents` timeline backfill coverage"
- "Move remaining producers to `taskEvents` (messages, policy decisions, tool calls)"

Outcome target:
- Every important task event is represented in `taskEvents` with deterministic IDs.
- Existing tasks can be backfilled safely.
- Task drawer timeline can rely on canonical events first, with auditable metadata.

## Key Domain Model Inventory

### Lifecycle States

- Task: `INBOX`, `ASSIGNED`, `IN_PROGRESS`, `REVIEW`, `NEEDS_APPROVAL`, `BLOCKED`, `FAILED`, `DONE`, `CANCELED`
- Approval: `PENDING`, `ESCALATED`, `APPROVED`, `DENIED`, `EXPIRED`, `CANCELED`
- Run: `RUNNING`, `COMPLETED`, `FAILED`, `TIMEOUT`
- Operator control: `NORMAL`, `PAUSED`, `DRAINING`, `QUARANTINED`

### Core Tables (Convex)

- `projects`, `agents`, `tasks`, `taskTransitions`, `taskEvents`
- `runs`, `toolCalls`, `approvals`, `messages`, `activities`, `alerts`
- `operatorControls`, `savedViews`, `watchSubscriptions`
- `agentIdentities`, `orgAssignments`, `telegraphThreads`, `telegraphMessages`, `meetings`, `voiceArtifacts`, `workflowRuns`, `workflows`

### Core APIs (Convex/Hono)

- Tasks: `tasks.create`, `tasks.transition`, `tasks.getWithTimeline`, `tasks.getUnifiedTimeline`
- Approvals: `approvals.request`, `approvals.approve`, `approvals.deny`, `approvals.escalateOverdue`
- Runs: `runs.start`, `runs.complete`
- Policy: `policy.explainTaskPolicy`, `policy.evaluate`
- Operator controls: `operatorControls.getCurrent`, `operatorControls.setMode`
- Workflow: `workflows.*`, `workflowRuns.*`
- Hono orchestrator endpoints: `/health`, `/status`, `/tick`, `/agents/spawn`, `/agents/stop`, `/agents/personas`

### Main UI Surfaces

- Board/queue: `Kanban`, `TaskDrawerTabs`, `ApprovalsModal`
- Governance/comms: `IdentityDirectoryView`, `TelegraphInbox`, `MeetingsView`, `VoicePanel`
- Org/ops: `OrgView`, `AgentRegistryView`, dashboards (`Health`, `Monitoring`, `Analytics`)
