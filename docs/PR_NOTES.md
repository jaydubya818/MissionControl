# PR Notes

## Major Changes

- Added core docs and plan alignment artifacts:
  - `docs/ARCHITECTURE.md`
  - `docs/INTELLIGENCE_LAYER_PLAN.md`
  - `docs/DECISIONS.md`
  - `docs/ROADMAP.md`
  - `docs/CHANGELOG_REPORT.md`
- Implemented operator-critical intelligence layer features:
  - Approvals Center tabs + decision reasons
  - Task timeline enrichment + policy explainability panel
  - Dry-run transition simulation
  - Agent Registry + control actions
  - Global search + command palette contract alignment
- Added backend support endpoints:
  - `tasks.simulateTransition`
  - `tasks.update`
  - `policy.explainTaskPolicy`
  - `approvals.listByStatus`
- Added CI pipeline with explicit quality gates:
  - `.github/workflows/ci.yml`
  - root `ci:*` scripts in `package.json`
- Type-safety and contract cleanup across UI + Convex + Telegram + SDK packages.

## How To Run

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

4. Start UI:
```bash
pnpm dev:ui
```

Optional runtime:
```bash
pnpm dev:orch
```

## How To Test

```bash
pnpm run ci:typecheck
pnpm run ci:test
```

## Breaking Changes / Migrations

- No schema-breaking database migration required in this pass.
- UI contracts changed for search and policy/timeline surfaces; custom clients should align to current Convex query payloads.
- Keyboard shortcut for approvals is now `Shift+Cmd+A`.

## Screenshot Placeholders

1. **Approvals Center**
- Show tabs (Pending/Approved/Denied), risk badges, and decision reason modal.

2. **Task Drawer – Timeline + Policy**
- Show unified timeline events and policy explainability/remediation panel.

3. **Task Drawer – Dry Run**
- Show simulation result with validation errors/requirements before transition.

4. **Agent Registry**
- Show per-agent status cards and control actions (Activate/Pause/Drain/Quarantine).

5. **Command Palette + Search**
- Show grouped results for tasks/approvals/agents/messages and quick actions.

6. **Monitoring Dashboard**
- Show severity cards, slow operations, and recent error stream.
