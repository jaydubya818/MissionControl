---
status: ready
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

### 2026-09-05 - Bounded first-slice resequencing approved

**By:** Product Owner

**Actions:**
- Allowed the governed inference/economics primitives listed above to proceed
  ahead of todo `062` under a separate implementation authorization.
- Kept todo `062` open for shared builder intent and broader outcome semantics.

**Learnings:**
- Infrastructure accounting can be qualified independently without inventing
  product, QA, or design workflow semantics.

### 2026-08-25 - Approved implementation kickoff

**By:** Codex

**Actions:**
- Preserved the existing hard eligibility and conservative fallback boundaries.

**Learnings:**
- Cost per accepted outcome is useful only when coverage and outcome identity are explicit.
