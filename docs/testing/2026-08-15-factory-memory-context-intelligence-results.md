---
title: Factory Memory and Context Intelligence verification
date: 2026-08-15
status: passed
branch: codex/FactoryMemoryGraphRag
---

# Factory Memory and Context Intelligence verification

## Outcome

The deterministic five-phase Factory Knowledge System is operational behind
five workspace-scoped, default-off flags. The verified demo path indexes
authoritative engineering memory, traverses typed relationships, plans bounded
retrieval, freezes an exact Context Package on an Attempt, creates advisory
verification context, records effectiveness signals, and limits learning to a
reviewable proposal.

The clean demo dataset contains:

- 8 active documents and 8 retrieval chunks
- 10 typed entities and 12 typed relationships
- 2 frozen Context Packages for retry/version comparison
- 8 items and 266 estimated tokens in the current Attempt package
- 6/6 passing context evals and 5 linked retrieval observations
- 1 secret-shaped value redacted before persistence

## Runtime isolation

The canonical demo port `5199` and shared Convex port `3210` were already owned
by another active worktree. The reconciliation pass therefore used only this
worktree with an isolated UI on `http://127.0.0.1:5202` and an anonymous local
Convex deployment on `http://127.0.0.1:3212`. Both processes were stopped after
verification, and the temporary deployment selector was removed from the
ignored `.env.local` file. No shared service or golden-path rollout file was
modified.

## Automated verification

### Repository-wide lint and typecheck

Command:

```bash
pnpm lint
```

Result: passed. All 19 checked workspace projects typechecked. All 10 Mission
Control skills linted at 100/100 with 0 errors and 0 warnings.

### Full test suite

Command:

```bash
pnpm test
```

Result: passed.

- Total: 1,471 tests passed
- UI suite: 249 tests passed
- Convex suite: 548 tests passed
- One existing integration test was skipped

The UI suite emitted only the repository's existing React Router v7 future-flag
notices; they are not failures.

### Focused Factory Memory tests

Commands and results:

```bash
pnpm --filter @mission-control/memory test -- src/__tests__/factory.test.ts
# 8 Factory Memory tests passed

pnpm exec vitest run convex/__tests__/factoryMemory.test.ts convex/__tests__/featureFlags.test.ts --config vitest.config.ts
# passed, including repository-isolation regressions

pnpm --filter mission-control-ui exec vitest run src/controlPlane/FactoryContextRunCard.test.tsx
# 2 component tests passed
```

Coverage includes redaction, untrusted-memory authority boundaries, tenant and
repository isolation, same-path/same-key records in two repositories,
cross-repository relationship rejection, typed edge validation, traversal
caps, refinement caps, stable Context Package digests, retry diffs,
default-off flags, exact Attempt binding, and component loading/disabled/data
states.

### Convex runtime build

Command:

```bash
npx convex dev --run seedMissionControlDemo:run
pnpm run ci:runtime-contract
```

Result: passed. Convex reported `functions ready`, seeded 8 documents, 8
chunks, 10 entities, 12 relationships, and 2 Context Packages, and the runtime
guard accepted exactly 17 new public endpoints in the contract change from 18
to 19.

## Golden path

Command:

```bash
pnpm --filter @mission-control/memory golden-path
```

Result: passed with the required output:

```text
OK: hybrid Factory RAG retrieved authoritative context.
OK: typed relationships were created.
OK: graph traversal resolved dependency path.
OK: Context Planner selected multiple retrieval strategies.
OK: Context Engine respected token budget.
OK: Attempt froze its Context Package.
OK: Verification Plan referenced historical risk context.
OK: trace captured retrieval behavior.
OK: context evals completed.
OK: no inferred relationship was treated as authoritative.
```

The command also printed the complete Context Package, advisory Verification
Plan, and deterministic comparison of the small relevant package against a
28-item, 14,254-token noisy package. The noisy variant was correctly measured
as over budget with a 71.4% unused-context ratio; the result is measured rather
than encoded as a universal preference for smaller context.

## Browser verification

Verified with `agent-browser` in a fresh isolated browser session:

- Overview showed the exact 8/8/10/12/2 dataset and all five enabled phases.
- Memory search for `auth middleware token refresh` returned 7 bounded,
  provenance-backed results across code, tests, ADR, incident, WorkOrder, and
  verification evidence. Secret text appeared only as `[REDACTED]`.
- Graph inspection for `auth-middleware` returned 9 entities and 11 reachable
  relationships, displayed the inferred `similar_to` edge at 42% confidence,
  and explained the directional path `auth-middleware —used_by→ orders-api
—governed_by→ ADR-004`.
- Context displayed the current 8-item/266-token package and earlier
  6-item/212-token package. The comparison reported 2 added, 0 removed, 0
  revision changes, and 0 graph-path changes.
- The exact `auto-demo-3` Attempt inspector displayed the frozen package,
  immutable digest, exact revisions, selection reasons, 6/6 evals, and the
  advisory two-check Verification Plan.
- A fresh browser session ended with zero page errors. The console contained
  only normal Vite connection and React development messages.
- A full-page Attempt inspector screenshot was captured outside the repository
  at `/tmp/mission-control-factory-memory-context-20260815.png`.

## Git state

The reconciliation branch is based directly on current `origin/main`. The
complete pre-reconciliation dirty state remains recoverable in `stash@{0}` and
branch `codex/FactoryMemoryGraphRag-pre-reconcile-20260815`. Unrelated commits,
formatter-only churn, and superseded model-routing flag authorization were not
carried into this feature.
