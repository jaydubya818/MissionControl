# Mission Control Upgrade Report

Last updated: 2026-02-08

## What Changed

### Backend / Intelligence Layer

- Added canonical task timeline stream:
  - `convex/schema.ts`: new `taskEvents` table
  - `convex/lib/taskEvents.ts`: shared event logger
  - `convex/tasks.ts`: `getWithTimeline` now returns `taskEvents`; added `getUnifiedTimeline`; transitions and task creation now emit canonical events
  - `convex/runs.ts`: run start/completion now emit `RUN_STARTED` / `RUN_COMPLETED` / `RUN_FAILED`

- Upgraded approvals into an operator-grade workflow:
  - `convex/schema.ts`: `approvals.status` now includes `ESCALATED`; added escalation + dual-control fields
  - `convex/approvals.ts`:
    - `listEscalated`, `getDecisionChain`
    - `escalateOverdue` SLA escalation mutation
    - dual-control approval path for RED actions (first/second approver semantics)
    - stale-expiration + escalation events wired into timeline/audit
  - `convex/crons.ts`: added scheduled escalation job (`escalate overdue approvals`)

- Added operator incident posture controls:
  - `convex/schema.ts`: new `operatorControls` table
  - `convex/lib/operatorControls.ts`: effective mode + gating logic
  - `convex/operatorControls.ts`: `getCurrent`, `listHistory`, `setMode`
  - `convex/policy.ts` and `convex/runs.ts`: enforce operator mode in policy/runs gates

- Added operator productivity persistence:
  - `convex/schema.ts`: new `savedViews` and `watchSubscriptions` tables
  - `convex/savedViews.ts`: list/create/update/delete saved views
  - `convex/watchSubscriptions.ts`: toggle/list task/entity watchers

- Approval metrics consistency updates:
  - `convex/health.ts`, `convex/standup.ts`, `convex/projects.ts` now treat `ESCALATED` as pending-like approval load.

### Frontend / UX

- Added Operator Controls modal:
  - `apps/mission-control-ui/src/OperatorControlsModal.tsx`
  - wired into app header, sidebar, command palette, and quick actions

- Upgraded Approvals Center UX:
  - `apps/mission-control-ui/src/ApprovalsModal.tsx`
  - added Escalated tab, expiry SLA indicators, dual-control cues, and first-approval messaging

- Task drawer timeline and control upgrades:
  - `apps/mission-control-ui/src/TaskDrawerTabs.tsx`
  - timeline now prefers canonical `taskEvents`
  - added task watch toggle (`watchSubscriptions.toggle`)

- Saved kanban views in operator workflow:
  - `apps/mission-control-ui/src/KanbanFilters.tsx`
  - save/apply/delete view support backed by Convex `savedViews`

### Tests / DX

- Added tests for operator mode gating:
  - `convex/__tests__/operatorControls.test.ts`
- Updated CI test lane to include new test file:
  - `package.json` (`ci:test`)
- Updated Telegram bot TS config to avoid rootDir/include breakages from expanded Convex API typing:
  - `packages/telegram-bot/tsconfig.json`

### Docs / Plan Alignment

- Updated docs to reflect shipped behavior:
  - `README.md`
  - `docs/ARCHITECTURE.md`
  - `docs/INTELLIGENCE_LAYER_PLAN.md`
  - `docs/DECISIONS.md`
  - `docs/ROADMAP.md`
  - `docs/PR_NOTES.md`

## What Was Intentionally Not Changed (and Why)

- Full RBAC/authz enforcement across all mutations/queries:
  - still needs explicit product policy and migration sequencing; this pass focused on operator-critical control-plane safety.
- Executor stub removal and full automation hardening:
  - out of scope for this batch; rollout still needs feature-flag and reliability gates.
- Full index/perf rewrite of all `.collect()` hot paths:
  - partially addressed indirectly; full query audit remains Next-phase work.

## Known Risks + Follow-Ups

1. Project scoping and authz are still optional/inconsistent in parts of backend read/query surface.
2. `taskEvents` is canonical in task drawer, but not all producers (e.g. every policy/tool event path) are fully migrated.
3. Watch subscriptions currently track state and audit intent; richer user-facing notifications are a follow-up.
4. Local `convex codegen` can still fail in restricted-network environments due telemetry network calls.
