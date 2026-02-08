# PR Notes

## Major Changes

- Introduced canonical task event stream (`taskEvents`) and wired core producers:
  - task creation + transition events
  - run start/completion/failure events
  - approval request/escalation/decision/expiration events
- Upgraded approvals workflow:
  - `ESCALATED` status and SLA escalation cron
  - dual-control approvals for RED risk actions (two distinct approvers)
  - approval decision-chain query for audit/debug surfaces
- Added operator execution posture controls:
  - modes: `NORMAL`, `PAUSED`, `DRAINING`, `QUARANTINED`
  - mode checks now gate policy decisions and run starts
  - new Operator Controls modal in UI
- Added operator productivity features:
  - saved Kanban views (create/apply/delete)
  - task watch subscriptions + toggle in task drawer
- Upgraded Approvals Center UI:
  - Escalated tab
  - expiry/SLA visibility
  - dual-control first-approval feedback

## How to Run

1. Install dependencies:
```bash
pnpm install
```

2. Start Convex:
```bash
pnpm convex:dev
```

3. Set UI env:
```bash
echo "VITE_CONVEX_URL=<your-convex-url>" > apps/mission-control-ui/.env.local
```

4. Run UI:
```bash
pnpm dev:ui
```

Optional runtime:
```bash
pnpm dev:orch
```

## How to Test

```bash
pnpm run ci:typecheck
pnpm run ci:test
```

## Breaking Changes / Migrations

- Schema changes were introduced:
  - new tables: `taskEvents`, `operatorControls`, `savedViews`, `watchSubscriptions`
  - `approvals.status` now includes `ESCALATED`
  - approvals include new escalation/dual-control fields
- Existing code paths expecting approvals to be only `PENDING/APPROVED/DENIED/EXPIRED/CANCELED` must be updated to handle `ESCALATED`.
- No destructive migration is required; data additions are backward-compatible.

## Screenshot Placeholders

1. **Approvals Center (Escalated + Dual Control)**
- Show Escalated tab, SLA expiry indicator, and first-approval message for RED approval.

2. **Operator Controls Modal**
- Show mode options (`NORMAL`, `PAUSED`, `DRAINING`, `QUARANTINED`) with history panel.

3. **Task Drawer Timeline (`taskEvents`)**
- Show canonical event cards with actor, event type, before/after payload snippet.

4. **Task Drawer Watch Toggle**
- Show watch button state changing (`Watch` -> `Watching`).

5. **Kanban Saved Views**
- Show view select + save/delete actions and filter application.

6. **Command Palette / Quick Actions**
- Show operator controls action entry and navigation to modal.
