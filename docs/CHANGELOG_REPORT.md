# Mission Control Upgrade Report

Last updated: 2026-02-08

## What Changed

### Plan and architecture alignment

- Added `docs/ARCHITECTURE.md` with current system model, state/policy overview, API surfaces, and gap list.
- Added/updated `docs/INTELLIGENCE_LAYER_PLAN.md` with plan-vs-reality matrix, corrected contracts, telemetry/SLOs, rollout phases, and principal-engineer recommendations.

### Backend (Convex)

- `convex/tasks.ts`
  - `getWithTimeline` now returns `activities` for richer task timelines.
  - Added `simulateTransition` query for dry-run state-machine validation.
  - Added `update` mutation for editable fields; status changes route through transition rules.
- `convex/policy.ts`
  - Added `explainTaskPolicy` query to expose decision rationale, rules, required approvals, remediation hints.
- `convex/approvals.ts`
  - Added `listByStatus` query for status-tabbed approvals workflows.
- `convex/search.ts`
  - Fixed project-scoped message search indexing.
  - Added approvals into global search results and total counts.
- `convex/health.ts`
  - Fixed uptime calculation bug.
- Cleanup/type-safety fixes in `convex/captures.ts`, `convex/executors.ts`, `convex/github.ts`, `convex/reviews.ts`, `convex/seed.ts`.

### Frontend (mission-control-ui)

- Added new `AgentRegistryView.tsx` and routed it in top-nav/app/command-palette/quick-actions.
- Rebuilt `ApprovalsModal.tsx` into a tabbed Approvals Center with decision reason workflow.
- Upgraded `TaskDrawerTabs.tsx`:
  - unified timeline stream with activity events
  - real policy explainability panel
  - dry-run transition simulation rendering
- Rebuilt search surfaces:
  - `SearchBar.tsx` now aligned to grouped `search.searchAll` contract
  - `CommandPalette.tsx` now supports tasks/agents/approvals/messages + quick actions
- `QuickActionsMenu.tsx` now executes real actions (palette/approvals/agent registry) rather than placeholders.
- `KeyboardShortcuts.tsx` changed approvals shortcut to `Shift+Cmd+A` to avoid `Cmd+A` conflict.
- `MonitoringDashboard.tsx` aligned to real monitoring payload fields.
- Type-safety fixes in:
  - `QuickEditModal.tsx`, `TaskEditMode.tsx` (strict task unions)
  - `ActivityFeed.tsx`, `DashboardOverview.tsx` (use `description` instead of stale `body`)
  - `PeopleView.tsx` (unused prop cleanup)

### Monorepo/runtime quality and DX

- Fixed Telegram package typing and task `threadRef` shape consistency:
  - `packages/telegram-bot/src/threads.ts`
  - `packages/telegram-bot/src/agentBot.ts`
- Fixed OpenClaw SDK strict build issues:
  - `packages/openclaw-sdk/src/client.ts`
- Added root CI scripts in `package.json`:
  - `ci:prepare`, `ci:typecheck`, `ci:test`, `ci:lint`
- Added GitHub Actions workflow:
  - `.github/workflows/ci.yml`

### README + delivery docs

- Rewrote `README.md` to match actual runtime and current plan.
- Added `docs/DECISIONS.md`.
- Added `docs/ROADMAP.md`.
- Added `docs/PR_NOTES.md`.

## High-Impact Features Implemented

The following core-plane features were implemented in this pass:

1. Approvals Center (pending/approved/denied, decision reasons)
2. Task Timeline + audit enrichment
3. Policy Decision Viewer (rule rationale/remediation)
4. Dry-run/Simulation mode for transitions
5. Agent Registry + operator controls
6. Global Search + Command Palette integration

## What Was Intentionally Not Changed (and Why)

- Full authn/authz enforcement and strict tenant isolation were not fully rolled out.
  - Reason: touches many query boundaries and requires explicit product decisions on roles/permissions.
- Executor automation hardening was not fully completed.
  - Reason: existing executor paths include partial/stub behavior and need phased rollout controls.
- Legacy/deprecated package cleanup (notably `agent-runner`) was not performed in this pass.
  - Reason: kept blast radius focused on v1 control-plane reliability.
- Full UI visual redesign was not attempted.
  - Reason: prioritized operator workflow correctness, explainability, and state integrity.

## Validation Summary

Verified locally:

- `pnpm run ci:typecheck` ✅
- `pnpm run ci:test` ✅

Additional focused runs (also passing):

- `pnpm --filter mission-control-ui typecheck`
- `pnpm --filter @mission-control/policy-engine test`
- `pnpm --filter @mission-control/state-machine test`
- `pnpm exec vitest run convex/__tests__/tasks.test.ts convex/__tests__/integration.test.ts`

## Known Risks and Follow-Ups

1. Project scoping is still optional in parts of query surface.
2. Some dashboards still rely on broad collection patterns that may degrade with scale.
3. Policy/risk telemetry is present but needs tighter SLO dashboards and alerting thresholds.
4. Deprecated `agent-runner` package still produces noisy build output (suppressed by existing `|| true`).
5. Executor routing and webhooks should move behind explicit feature flags before production rollout.
6. Legacy root `turbo` scripts can still fail in some local keychain/TLS environments; use `ci:*` scripts as the stable lane.
