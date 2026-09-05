---
status: complete
priority: p1
issue_id: "068"
tags: [code-review, architecture, convex, orchestration, model-routing]
dependencies: []
---

# Bind Mission Planning to Frozen Execution Identity

## Problem Statement

Phase 1 makes new Factory Versions V2-only and removes harness/runtime fields from model-route identity, but the newer Mission planning path still filters catalog rows through legacy V1 `capabilityIdentity` fields. New V2 routes therefore cannot plan, while an unrelated legacy row can be selected outside the active Factory Version. The planning worker also omits exact V2 route controls and does not reconcile normalized result provenance against the frozen route/runtime tuple.

## Findings

- `convex/missionPlanning.ts` selects planning routes by legacy route-owned harness fields instead of the active Factory Version's frozen `modelCatalogId`, route, qualification, runtime artifact, and backend.
- `apps/orchestration-server/src/missionPlanningWorker.ts` sends provider/model only, causing V2 adapters to treat planning as legacy execution.
- Host selection does not require the exact runtime artifact or Factory Version binding.
- The issue was latent on current main but becomes a Phase 1 regression because V2 explicitly forbids `capabilityIdentity`.

## Proposed Solutions

### Option 1: Bind to the active Factory Version

**Approach:** Admit only the active Factory Version's exact catalog row and frozen tuple, require its currently supported persistent-worker backend, preserve existing PLAN policy over the singleton, freeze route/runtime evidence on the run, and reconcile worker requests/results exactly.

**Pros:** Smallest fail-closed Phase 1 correction; preserves immutable Factory authority and legacy frozen compatibility.

**Cons:** Remote-sandbox Factory Versions cannot use the currently local-only planning worker.

**Effort:** Medium

**Risk:** Low

### Option 2: Add a separate planning execution composition

**Approach:** Introduce an independently frozen planning profile and backend selection.

**Pros:** Could support remote-backed Factories and separate planning models.

**Cons:** Introduces new execution-profile semantics and exceeds Phase 1 scope.

**Effort:** Large

**Risk:** High

## Recommended Action

Implement Option 1. Fail early for remote-backed Factory Versions until a separately governed planning composition is designed in a later phase.

## Technical Details

**Affected files:**

- `convex/missionPlanning.ts`
- `convex/schema.ts`
- `convex/lib/factoryModelRoute.ts`
- `convex/lib/factoryWorkerRuntime.ts`
- `apps/orchestration-server/src/missionPlanningWorker.ts`
- focused Convex and orchestration tests
- `docs/decisions/model-route-runtime-identity-separation.md`

No new table, public mutation argument, adapter, provider, plugin, MCP, or Phase 2 execution profile is required.

## Resources

- PR: https://github.com/jaydubya818/MissionControl/pull/164
- ADR: `docs/decisions/model-route-runtime-identity-separation.md`
- Known pattern: `docs/solutions/build-errors/missing-convex-schema-contracts-ci-20260730.md`

## Acceptance Criteria

- [x] V2 planning uses the active Factory Version's exact catalog row and qualification.
- [x] Same-model sibling and legacy fallback routes cannot replace the frozen route.
- [x] Planning fails early when the active Factory backend is not supported by the local planning worker.
- [x] Host selection proves exact Factory, route, harness, runtime-artifact, and backend binding.
- [x] Both planning phases send V2 route digest, provider route, and reasoning controls.
- [x] Normalized results fail closed on route, harness, configuration, or runtime provenance mismatch.
- [x] Frozen V1 compatibility remains readable without synthesizing V2 identity.
- [x] ADR documents deferred legacy model-health behavior.
- [x] Authoritative codegen and all required Phase 1 qualification gates pass after the fix.

## Work Log

### 2026-09-04 - PR Review Discovery

**By:** notes-to-factory / review workflow

**Actions:**

- Reproduced the V2 exclusion directly from the route filter.
- Traced planning request creation, host selection, worker request construction, and normalized result handling.
- Selected the active-Factory binding correction to avoid Phase 2 execution-profile design.

**Learnings:**

- Main's planning path predates the decomposed V2 route and must be explicitly reconciled.
- Convex schema, worker request, and receipt validation must change atomically.

### 2026-09-04 - Completed and Requalified

**By:** notes-to-factory / review workflow

**Actions:**

- Bound planning request and claim admission to the active Factory Version's exact route, qualification, harness runtime artifact, backend, and workspace host binding.
- Added exact request/result provenance checks for both planning phases and preserved explicit frozen V1 projection behavior.
- Ran authoritative Convex code generation, focused planning tests, the full repository suite, lint, build, orchestration startup smoke, runtime-contract v39 guard, documentation checks, and Factory V2 qualification.

**Validation:**

- Mission planning worker: 7/7 tests passed.
- Convex full suite: 913/913 tests passed.
- Factory V2 golden eval: 6/6 blocking checks and 7/7 negative controls passed with zero regressions.

## Notes

Completed on PR #164 and requalified before merge.
