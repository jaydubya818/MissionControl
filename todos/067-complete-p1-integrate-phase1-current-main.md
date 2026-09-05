---
status: complete
priority: p1
issue_id: "067"
tags: [software-factory, phase-1, integration, runtime-contract]
dependencies: ["065", "066"]
---

# Integrate Phase 1 onto current main

## Problem Statement

The completed Phase 0 and Phase 1 model-route/runtime-identity work was validated in a detached worktree based on an older mainline. It must be reconciled onto current `origin/main`, regenerated with authoritative Convex codegen, revalidated against the current runtime-contract baseline, and pushed as a clean review branch without implementing Phase 2.

## Findings

- Detached Phase 1 HEAD: `dc51cd873a2edaca6972cceb35a3602fd30330ac`.
- Current `origin/main`: `1d27266d5d6892a37f897c7d0fe325fe811e63fe`.
- Merge-base: `b8c94b3a3baefc4c18e3651bfccf3d31805e9333`.
- Current-main runtime contract is v38; the integrated version must use the next valid version.
- The clean current-main documentation baseline passes `pnpm docs:factory-check`.

## Proposed Solutions

### Option 1: Three-way reconcile on a clean current-main branch

**Approach:** Preserve the detached diff, apply it with three-way context to a clean branch from `origin/main`, and resolve each overlap according to the Phase 1 identity invariants.

**Pros:** Preserves both current-main behavior and the already-reviewed Phase 1 architecture; provides explicit conflict visibility.

**Cons:** Requires careful conflict-by-conflict review and full revalidation.

**Effort:** One focused integration session.

**Risk:** Medium.

### Option 2: Reimplement Phase 1 from scratch

**Approach:** Use the detached work only as a reference and rewrite it directly on current main.

**Pros:** Avoids textual merge conflicts.

**Cons:** High regression risk, duplicates completed work, and may silently drift from validated semantics.

**Effort:** Multiple sessions.

**Risk:** High.

## Recommended Action

Use Option 1. Prefer current-main behavior when compatible, preserve exact Phase 1 identity separation and fail-closed qualification, bump the runtime contract once for intended public changes, run authoritative codegen, and execute every requested validation gate before commit and push.

## Technical Details

- Integration branch: `codex/phase1-model-runtime-identity`.
- No Phase 2 catalog, profile, Deep Agents, Open SWE, MCP, provider, benchmarking, routing, or UI work is in scope.
- Deferred follow-up remains: V2 model health should eventually key by exact qualification identity such as `routeDigest`, not `(projectId, modelId)`.

## Acceptance Criteria

- [x] All conflicts are reconciled without weakening the Phase 1 identity model.
- [x] Runtime contract is bumped from the current-main value to the next valid version.
- [x] Authoritative Convex codegen runs and generated changes are inspected.
- [x] Legacy V1 compatibility and V2 exact-execution invariants are covered by passing tests.
- [x] All requested focused and full validation commands run with exact outcomes recorded.
- [x] Worktree is clean, contains no unrelated changes, and branch is pushed.

## Work Log

### 2026-09-04 - Integration started

**By:** Repository operator with Codex assistance

**Actions:**
- Fetched current remote refs and recorded the Phase 1 base, current main, and merge-base.
- Created a clean integration branch from `origin/main` using the repository worktree workflow.
- Confirmed the current-main documentation gate passes before applying Phase 1.
- Preserved and applied the detached tracked diff with three-way context; copied the nine Phase 0/1 untracked source, test, plan, ADR, and todo files.

**Learnings:**
- Current main is runtime-contract v38.
- Main changed several Phase 1-adjacent execution and documentation files, so semantic reconciliation is required.

### 2026-09-04 - Reconciliation and validation complete

**By:** Repository operator with Codex assistance

**Actions:**
- Reconciled 19 textual conflicts across 31 files changed by both Phase 1 and current main; retained current-main planning SHA, repository/cost policy, source-Attempt recovery, structured-output containment, Mission planning, and exact-route health behavior.
- Preserved inference-only V2 model routes, independent harness/runtime/backend identities, exact tuple qualification, V2 manifests for new work, and narrow V1 read/execution compatibility for already-frozen versions.
- Corrected the Factory version-options path so it exposes every promoted V2 qualification instance instead of collapsing siblings by `modelId`; added a legacy-first/sibling regression.
- Advanced the runtime contract from v38 to v39. The normal guard reports only three public argument changes: `modelCatalog:registerExactRoute`, `modelCatalog:promoteExactRoute`, and `workspaceHostBindings:report`.
- Ran authoritative Convex 1.42.3 codegen against an isolated local backend with telemetry disabled. Only `convex/_generated/api.d.ts` changed, adding the expected `lib/factoryModelRoute` module registration; the final rerun was deterministic.
- Ran focused route, routing, capability, configuration, Attempt, manifest, adapter, worker, workflow, documentation, typecheck, and build gates.
- Ran the repository-standard full test command: 277 test files passed, one integration file skipped; 2,249 tests passed and one integration test skipped.
- Ran the unrestricted full-system Factory V2 qualification because the sandbox blocks nested `tsx` IPC sockets. All 17 qualification gates passed, including 85/85 composed tests, the publishable golden eval, full tests, lint, runtime guard, production build, startup smoke, and whitespace integrity.
- Kept generated V2 qualification evidence out of this integration diff after preserving the passing output under `/private/tmp`; current main's evidence generator still hard-codes historical runtime v28 and is an unrelated follow-up.

**Learnings:**
- Generic model routing must continue choosing one stable row per `modelId`, while Factory composition must retain every immutable qualification row and select by exact `modelCatalogId`.
- Model health remains intentionally deferred: the legacy path is keyed by `(projectId, modelId)` and the exact worker-attested path targets a catalog row plus route digest; broader route-digest health semantics belong in a separate change.

## Notes

- Do not broaden this work to the deferred model-health redesign.
