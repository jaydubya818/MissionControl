---
status: complete
priority: p1
issue_id: "043"
tags:
  [
    factory-memory,
    retrieval,
    knowledge-graph,
    context-engine,
    verification,
    security,
  ]
dependencies: []
---

# Build Factory Memory and Context Intelligence

Implement the complete five-phase Factory Knowledge System described in
`docs/plans/2026-08-15-feat-factory-memory-context-intelligence-plan.md`.

## Problem Statement

Mission Control has operational records, Registry context packages, imported
graph data, and partial observability, but it cannot yet assemble, explain,
freeze, compare, and evaluate minimal authoritative context for Software and
Verification Factory Attempts.

## Findings

- `convex/schema.ts` already contains WorkOrders, `workflowRuns` Attempts,
  FactoryDefinitionVersions, verification evidence, Registry context packages,
  traces/evals schemas, legacy `knowledgeChunks`, and imported graph tables.
- `convex/knowledgeGraph.ts` is an Agentic-KB/Obsidian overlay with free-form
  relations, not the typed operational graph required for execution.
- `apps/mission-control-ui/src/eos/views/MemoryPillarsView.tsx` is the existing
  operator entry point and currently delegates to the legacy Memory view.
- The branch already contains unrelated uncommitted model-routing,
  observability and sandbox work; changes must remain additive and preserve it.
- Convex vector search is action-only, so semantic retrieval needs an adapter
  and deterministic offline implementation for CI.

## Proposed Solutions

### Option 1: Additive Convex + provider-neutral TypeScript core

**Approach:** Add typed Factory Memory records and APIs in Convex, while
implementing algorithms/interfaces in a standalone workspace package with an
in-memory fixture adapter.

**Pros:** Reuses authority, supports deterministic CI, avoids external vendors,
and keeps future storage migration possible.

**Cons:** Adds several tables and requires careful schema/UI integration.

**Effort:** Large.

**Risk:** Medium, controlled by phase flags and additive schema.

### Option 2: Extend legacy chunks/imported graph only

**Approach:** Reuse `knowledgeChunks` and `knowledgeGraph*` directly.

**Pros:** Smaller initial diff.

**Cons:** Cannot represent typed derivation, frozen Attempt packages,
repository authorization, or execution-specific provenance safely.

**Effort:** Medium.

**Risk:** High product/authority ambiguity.

### Option 3: External vector + graph services

**Approach:** Add specialized stores immediately.

**Pros:** Strong native search/traversal.

**Cons:** Premature operational dependency, tenancy/credential burden, and
dual-consistency risk.

**Effort:** Very large.

**Risk:** High.

## Recommended Action

Use Option 1. Deliver a deterministic vertical slice through all five phases,
with independent phase flags and no live model dependency. Keep Convex as the
governed system of record and treat all graph/search state as rebuildable,
provenance-backed projections.

## Technical Details

**Primary affected areas:**

- `packages/memory/src/factory/` — domain interfaces and deterministic algorithms.
- `convex/schema.ts`, `convex/factoryMemory.ts`, `convex/lib/flags.ts` — durable
  storage, scoped APIs, phase gates and Attempt snapshot linkage.
- `apps/mission-control-ui/src/eos/views/MemoryPillarsView.tsx` and focused new
  components — Memory/Graph/Context operator experience.
- `apps/mission-control-ui/src/controlPlane/ExecutionRunInspector.tsx` — frozen
  Attempt Context Package inspection.
- `scripts/` and tests — deterministic golden path and eval fixtures.

## Resources

- `docs/plans/2026-08-15-feat-factory-memory-context-intelligence-plan.md`
- `docs/plans/memory-graphrag-architecture.md`
- `docs/design.md`

## Acceptance Criteria

- [x] Phase 1 hybrid ingestion/retrieval, provenance, filters, dedupe and budget.
- [x] Phase 2 typed directional relationships with provenance/derivation.
- [x] Phase 3 bounded planner, sufficiency and observable refinement loop.
- [x] Phase 4 graph abstraction, resolution, traversal, paths and explorer UI.
- [x] Phase 5 purpose profiles, frozen packages, diffs, verification influence,
      effectiveness evals and proposal-only learning.
- [x] Secret redaction and workspace/repository isolation tests pass.
- [x] Legacy execution/acceptance behavior remains unchanged when disabled.
- [x] Full deterministic golden path and noisy-context fixture pass.
- [x] Focused/full tests, typecheck, lint and browser verification are recorded.
- [x] Architecture, operator behavior, test results and git state are documented.

## Work Log

### 2026-08-15 - Architecture and repository audit

**By:** Codex

**Actions:**

- Read the complete five-phase product specification.
- Audited existing domain, graph, memory, context registry, observability,
  verification, authorization, UI, feature flags and design guidance.
- Reviewed the existing GraphRAG architecture plan and schema-contract learning.
- Verified current Convex search constraints and OWASP RAG/secret controls.
- Selected the additive Convex plus provider-neutral core approach.

**Learnings:**

- Existing concepts cover most authoritative sources; the missing layer is a
  typed, scoped, explainable projection and frozen Context Package contract.
- The imported graph should coexist with—not become—the Factory operational
  knowledge graph.
- Authorization, redaction and budgets must run before any optional semantic or
  model-assisted step.

### 2026-08-15 - Five-phase implementation and verification

**By:** Codex

**Actions:**

- Added the provider-neutral Factory Memory core to the existing memory
  package, including deterministic hybrid retrieval, graph traversal, bounded
  planning, frozen packages, verification influence, evals, and fixtures.
- Added additive Convex schemas, scoped phase gates, queries/mutations, stable
  demo seed data, exact Attempt linkage, and shared secret-redaction utilities.
- Rebuilt the Memory operator surface with Overview, Memory, Graph, and Context
  tabs and added the frozen Context Package card to the Attempt inspector.
- Added architecture/operator documentation and the deterministic golden-path
  command.
- Verified the isolated runtime with full tests, lint/typecheck, Convex build,
  browser flows, keyboard operation, console/network inspection, and light/dark
  Axe audits.

**Results:**

- 1,413 automated tests passed across workspace packages and Convex.
- Repository lint/typecheck passed; skill lint reported 0 errors and warnings.
- Golden path produced all 10 required `OK` assertions.
- Full-page WCAG 2.0/2.1 A/AA audits reported 0 violations in light and dark
  themes.
- Detailed evidence is recorded in
  `docs/testing/2026-08-15-factory-memory-context-intelligence-results.md`.

### 2026-08-15 - Reconciliation with current main

**By:** Codex

**Actions:**

- Preserved the complete original dirty workspace in a stash and backup branch,
  then rebased the feature branch directly onto current `origin/main`.
- Removed unrelated historical commits, formatter-only churn, and superseded
  feature-flag authorization behavior while retaining current main semantics.
- Qualified documents, entities, relationships, search, and package queries by
  repository before deduplication, limits, traversal, or ranking.
- Added linked WorkOrder, Attempt, FactoryVersion, and repository consistency
  checks so a package or relationship cannot bridge authorization scopes.
- Advanced the public Convex runtime contract from 18 to 19 for the 17 additive
  Factory Memory endpoints.
- Re-ran focused and repository-wide tests, lint, typecheck, build, runtime
  contract verification, the deterministic golden path, and the browser flow.

**Results:**

- 1,471 automated tests passed; one existing integration test remained skipped.
- All 19 typed workspace projects and all 10 skills passed lint/typecheck.
- The production build and runtime-contract guard passed.
- A fresh isolated browser session exercised Overview, Memory, Graph, Context,
  and the exact Attempt inspector with zero page errors.

## Notes

- The original pre-reconciliation workspace remains preserved in
  `stash@{0}` and branch `codex/FactoryMemoryGraphRag-pre-reconcile-20260815`.
- The reconciled feature remains additive and separate from the completed
  autonomous golden-path rollout already present on main.
