# ARM Cutover Checklist

## Current Mode

- `ARM_COMPAT_MODE=true` is enabled for safe rollout.
- This keeps legacy-preferred reads while ARM dual-write/backfill remains active.

## 1) Clean PR Prep

Run from repo root:

```bash
pnpm run ci:typecheck
pnpm run ci:test
```

Stage only ARM migration changes:

```bash
git add convex/migrations/backfillInstanceRefs.ts
git add convex/crons.ts
git add convex/lib/legacyToolPolicy.ts
git add convex/runs.ts
git add convex/policy.ts
git add convex/agents.ts
git add convex/comments.ts
git add convex/coordinator.ts
git add convex/meetings.ts
git add convex/messages.ts
git add convex/__tests__/armPolicy.test.ts
git add tests/e2e/arm-ui.e2e.spec.ts
git add playwright.config.ts
git add package.json
git add README.md
git add MIGRATION_PLAN.md
git add .env.example
```

Suggested commit split:

1. `feat(migration): add tenant backfill + health guard cron`
2. `feat(policy): ARM-first with legacy fallback evaluator`
3. `test(arm): add backend + Playwright ARM smoke gates`
4. `docs(arm): rollout runbook + env defaults`

## 2) Staging Rollout

1. Keep `ARM_COMPAT_MODE=true` in staging.
2. From UI (`ARM -> Directory`):
3. Run `Seed Mission Control Demo` if needed.
4. Run `Run Instance Ref Backfill`.
5. Run `Run Tenant Backfill`.
6. Confirm migration counters are all zero.
7. Let staging soak for 24-48h.

## 3) Regression Guard

- Cron `guard ARM migration health` runs every 30 minutes.
- It creates/updates `alerts.type = MIGRATION_HEALTH_DRIFT` when drift appears.
- It auto-resolves that alert when drift returns to zero.

Manual check:

```bash
pnpm run migration:health
```

## 4) Future Cutover (when ready)

Only after stable soak with zero drift:

1. Set `ARM_COMPAT_MODE=false` in staging.
2. Re-run full UI smoke + CI.
3. Soak 24-48h and verify no drift alerts.
4. Promote to production.

Rollback:

1. Set `ARM_COMPAT_MODE=true`.
2. Re-run both backfills.
3. Verify drift counters return to zero.
