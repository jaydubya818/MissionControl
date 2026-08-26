---
status: ready
priority: p2
issue_id: "064"
tags: [software-factory, feedback, learning, experiments, governance]
dependencies: ["063"]
---

# Connect Production Feedback to Governed Learning

## Problem Statement

Factory Learning V1 is advisory, but production incidents, review corrections,
rollbacks, routing outcomes, adoption friction, and customer outcomes are not a
complete governed feedback stream.

## Findings

- Existing Learning Signals, clusters, candidates, and experiments preserve proposal-only authority.
- External or semantic inputs must remain untrusted and tenant-scoped.
- Promotion must return through a Mission and human Plan approval.

## Proposed Solutions

### Option 1: Project canonical outcomes into immutable Learning Signals

**Pros:** Reuses existing governance and preserves audit history.

**Cons:** Requires idempotent projections and bounded backpressure.

**Effort:** High

**Risk:** Medium

### Option 2: Directly tune prompts/routes from production metrics

**Pros:** Faster apparent adaptation.

**Cons:** Creates uncontrolled self-modification and weak rollback provenance.

**Effort:** Medium

**Risk:** Critical

## Recommended Action

Implement Option 1. Learning may observe, cluster, experiment, and propose; it
may not edit policy, routing, tools, skills, verification, repositories, or acceptance.

## Acceptance Criteria

- [ ] Incident, correction, rollback, routing, cost, adoption, and customer facts project idempotently.
- [ ] Processing is repository-scoped with bounded cursors, windows, budgets, rate limits, and backpressure.
- [ ] Frozen datasets, evaluator versions, baselines, candidates, and experiments remain reproducible.
- [ ] Low sample size, missing counterfactuals, and evaluator disagreement stay visible.
- [ ] Every promoted recommendation creates or revises a Mission and requires ordinary approval.
- [ ] Rollback and supersession preserve the evidence that justified promotion.

## Work Log

### 2026-08-25 - Approved implementation kickoff

**By:** Codex

**Actions:**
- Preserved advisory-only learning and governed promotion as hard scope boundaries.

**Learnings:**
- Autonomous observation is compatible with governance; autonomous promotion is not.
