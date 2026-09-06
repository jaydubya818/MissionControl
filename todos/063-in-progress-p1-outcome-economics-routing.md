---
status: in_progress
priority: p1
issue_id: "063"
tags: [software-factory, outcomes, economics, routing, metrics]
dependencies: []
---

# Connect Outcome Economics to Routing

## Problem Statement

Routing is deterministic and governed, but complete outcome and provider cost
coverage is missing. Tokens or estimated prices are insufficient optimization targets.

## Findings

- Missing cost remains `null`, correctly avoiding false zero-cost claims.
- Guarded Auto has frozen sample, coverage, and score-margin thresholds.
- Accepted work, merge, deployment, production verification, incident, rollback,
  adoption, and customer outcomes are not interchangeable.

## Proposed Solutions

### Option 1: Versioned outcome projection with immutable observations

**Pros:** Reproducible routing decisions and honest confidence.

**Cons:** Requires cross-domain lineage and formula governance.

**Effort:** High

**Risk:** Medium

### Option 2: Dashboard-only aggregation

**Pros:** Faster presentation.

**Cons:** Cannot safely feed routing or preserve decision provenance.

**Effort:** Medium

**Risk:** High

## Recommended Action

Implement Option 1. Keep raw facts immutable, version formulas, retain sample,
coverage, freshness, and confidence, and feed only accepted compatible outcomes.

The bounded implementation plan is
`docs/plans/2026-09-05-feat-inference-gateway-outcome-economics-qualification-plan.md`.

## Sequencing Decision

**Approved 2026-09-05:** the bounded first slice may proceed ahead of todo
`062`, limited to the governed inference boundary, exact route identity,
pricing, provider receipts, hard reservations, accounting, settlement, cost
coverage, and verified-outcome economics primitives. Todo `062` remains open
and required for shared builder intent, product/QA/design contribution
semantics, and broader outcome-workflow semantics. This decision does not mark
either todo complete and does not authorize implementation by itself.

## Acceptance Criteria

- [ ] Outcome stages and cost components have one versioned measurement dictionary.
- [ ] Derived metrics retain formula version, lineage, sample, coverage, freshness, and confidence.
- [ ] Unknown values cannot improve a score or qualify a route.
- [ ] Every routing decision is reproducible from frozen inputs and later outcomes.
- [ ] Dashboards lead with accepted outcomes, reliability, attention, and confidence.
- [ ] Guarded Auto, RED auto-routing, merge, and deployment remain disabled.

## Work Log

### 2026-09-05 - Phase 5 implementation started

**By:** Codex

**Actions:**
- Started the authorized bounded Phase 5 slice from exact main SHA
  `6d7146d5205aef729aee2960aed2a4ed8e8ab95c` in the isolated
  `codex/phase5-inference-outcome-economics` worktree.
- Confirmed the existing provider adapters call external APIs directly and the
  legacy `costEvents` table cannot represent reservations, dispatch ambiguity,
  immutable price provenance, or outcome-linked coverage.
- Chose a separate governed inference ledger and shared gateway boundary while
  retaining existing routing and cost records as migration-safe compatibility
  surfaces.

**Learnings:**
- Exact model-route identity is already separated from harness/runtime identity;
  Phase 5 can build on that boundary without coupling inference to Codex or any
  other coding harness.
- A claimed physical request with an ambiguous transport result must remain
  `UNKNOWN`; ordinary fallback behavior is unsafe after possible dispatch.

### 2026-09-05 - Bounded first-slice resequencing approved

**By:** Product Owner

**Actions:**
- Allowed the governed inference/economics primitives listed above to proceed
  ahead of todo `062` under a separate implementation authorization.
- Kept todo `062` open for shared builder intent and broader outcome semantics.

**Learnings:**
- Infrastructure accounting can be qualified independently without inventing
  product, QA, or design workflow semantics.

### 2026-09-05 - Governed inference and accounting slice qualified

**By:** Codex

**Actions:**
- Implemented a harness-neutral governed inference boundary with exact immutable
  route identity, active price books, hard per-request reservations, durable
  physical intents and claims, immutable receipts, reconciliation, fallback
  rules, and replay protection.
- Added versioned accepted-outcome projections and advisory route comparisons
  that preserve unknown cost and never authorize automatic promotion.
- Added the exact OpenAI Chat Completions transport behind a disabled-by-default
  gateway flag, signed Convex service commands, operator inspection, and
  deterministic offline qualification evidence.
- Passed the 35-test Phase 5 regression suite, all 12 negative controls, full
  repository tests, typecheck, lint, build, release security, runtime-contract
  v42-to-v43 guard, browser checks, and all 18 System Qualification stages.

**Learnings:**
- A useful economic denominator must include every physical receipt for the
  logical Attempt, including failed primary spend before a permitted fallback.
- Provider reconciliation must create a new frozen projection interpretation;
  mutating the original receipt would destroy reproducibility.
- This todo remains in progress: production outcomes, broader dashboards, and a
  second independently qualified route are intentionally outside the bounded
  Phase 5 slice.
- Implementation PR `#178` merged as
  `e76796f76f92577dab9f073bf1007a29285cbe03`; clean post-merge Phase 5,
  typecheck, documentation, and runtime-contract qualification passed.

### 2026-08-25 - Approved implementation kickoff

**By:** Codex

**Actions:**
- Preserved the existing hard eligibility and conservative fallback boundaries.

**Learnings:**
- Cost per accepted outcome is useful only when coverage and outcome identity are explicit.
