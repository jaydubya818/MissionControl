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

Seventeen focused assertions, workspace TypeScript, the UI production build, and
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

Screenshots are retained under
`docs/testing/evidence/runtime-contract-recovery/`. The full evidence record is
in `docs/testing/runtime-contract-recovery-results.md`.

## Next recommendation

Add a focused CI guard that requires a runtime-contract version increment when a
public Convex API contract changes. Do not introduce permissive validators or
multi-version negotiation yet.
