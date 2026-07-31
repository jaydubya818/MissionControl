# Runtime Contract Recovery PR 6

## Outcome

Mission Control now checks a stable client/backend runtime contract before the
operator console mounts normal query consumers.

- Exact contract matches open the console normally.
- Mismatches block the console with a single Reload action.
- The recovery state confirms persisted work is safe and shows both versions.
- Old tabs that throw Convex argument-validation errors receive the same guidance.
- Strict Convex validators remain unchanged.
- Saved dark/light theme is applied before the recovery surface renders.

## Verification

Nineteen focused assertions, workspace TypeScript, the UI production build, and
skill lint passed. Real-browser checks passed for compatible SFRL Tasks startup,
dark mismatch recovery, and light mismatch recovery, with zero page errors and no
new final Convex runtime errors.

The first live prototype also exposed a temporary missing-function window while
Convex compiled. The final implementation uses a non-throwing probe with bounded
startup retries and periodic polling, so deployment startup does not strand the
operator in a render error.

The Docs browser check found duplicate registrations for two Task-to-Work-Order
pages. The redundant entries were removed, unique page IDs and paths are now
enforced by tests, and the clean browser console check passed after the repair.

PR CI also confirmed that the retained-route Playwright test starts without a
Convex backend. Its web server now opts into a development-only compatibility
bypass; production builds cannot honor the flag, so the shipped gate remains
fail-closed.

Pull request 53 passed corrected CI run 30665288772 across build, lint, smoke,
TypeScript, unit, E2E, and both preview deployments. The initial failed E2E run
30664768978 is retained as evidence for the harness correction.

Screenshots are retained under
`docs/testing/evidence/runtime-contract-recovery/`. The full evidence record is
in `docs/testing/runtime-contract-recovery-results.md`.

## Next recommendation

Add a focused CI guard that requires a runtime-contract version increment when a
public Convex API contract changes. Do not introduce permissive validators or
multi-version negotiation yet.
