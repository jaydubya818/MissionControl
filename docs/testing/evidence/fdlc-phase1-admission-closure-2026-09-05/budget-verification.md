# Budget and admission control tests

2026-09-05 UTC; source HEAD f82fe1d98b156278c4fa0c0e2032008e2f010f39 plus one new test.

```sh
pnpm exec vitest run convex/__tests__/factoryConfiguration.test.ts convex/__tests__/modelRouteAdmission.test.ts convex/__tests__/executionRoutingEvidence.test.ts convex/__tests__/preExecutionRecovery.test.ts
```

4 files / 44 tests passed, 449 ms. These prove existing deterministic controls,
not candidate-tuple qualification or provider spend enforcement. The routing
budget test computes the remaining approved cap and prevents a retry estimate
from fitting when all authority has already been committed. It does not count
opaque Codex provider retries. Configuration bounds do not prove Attempt exhaustion.

```sh
pnpm --filter @mission-control/orchestration-server exec vitest run src/__tests__/codexExecutorAdapter.test.ts -t 'unsupported hard token cap|fails closed instead|rejects executable drift'
```

1 file, 3 tests passed, 12 skipped, 566 ms. New regression test runs the adapter
prepare/execute/collect/cleanup lifecycle with a deterministic process-runner spy
and a hard maxTokens field. Normalized result FAILED; runner was never called.
The digest resolver is a fixture. This is no-process-start control evidence, not
real runtime or provider behavioral qualification. No model calls occurred.

Preserved source constraints:

- Adapter validateConfiguration rejects maxTokens and temperature.
- Generic Factory budget requires only maxCostUsd/maxRuntimeMinutes/maxAttempts.
- Pilot preparation explicitly retains the hard token prerequisite before GO.
- Route cost FULL_ESTIMATE reservation permits UNAVAILABLE actuals with a reason.
- Embedded run cost authorization has no standalone reservation expiry.
- No pre-provider request count/retry cap is exposed on the selected native path.

Unsupported provider limits, reservation expiry/single-use semantics and all
missing live subject tests remain blockers; they are not marked as passing.
