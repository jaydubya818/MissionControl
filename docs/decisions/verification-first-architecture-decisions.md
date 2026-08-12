---
title: Verification-First Architecture Decisions
status: PROPOSED_FOR_ACCEPTANCE
date: 2026-08-11
baseline_commit: 2b1a7c4
---

# Verification-First Architecture Decisions

This ADR set records the decisions that future verification work must preserve.
P0 implementation already embodies several decisions; acceptance makes their
ownership explicit and identifies the remaining target boundary.

## VF-001 — Preserve the authoritative delivery hierarchy

**Decision:** Keep `Mission -> approved Plan -> WorkOrder -> Task ->
WorkflowRun/Attempt -> evidence -> pull request -> release`. Do not introduce a
parallel Verification Job hierarchy that can accept a WorkOrder independently.

**Reason:** Each record owns a different decision. Existing schemas, UI, and
tests already use this hierarchy.

**Consequence:** Verification records reference the current WorkOrder revision
and execution try; they never replace either.

## VF-002 — Treat the approved Plan as top-level quality authority

**Decision:** The approved Plan revision and validation assertions are the
human-owned source for a future canonical Quality Contract. WorkOrder
requirements, constraints, Change Budget, and verifier requirements are scoped
projections.

**Current state:** P0 freezes the WorkOrder specification into the execution
manifest. Compilation of a separate Plan-level Quality Contract digest remains
future work.

**Rejected:** Allowing each WorkOrder or executor to redefine “done.”

## VF-003 — Separate observations from decisions

**Decision:** `evidenceEnvelopes` and criterion receipts preserve observations.
`verificationRuns` group applied methods. A server-owned WorkOrder receipt
records the P0 verdict. The future cross-policy Quality Gate Decision must be a
distinct explainable decision rather than a mutable property of evidence.

**Reason:** A valid observation can be stale, contradicted, out of scope, or
insufficient under current policy.

## VF-004 — Bind proof and authority to immutable subjects

**Decision:** Every enforced decision binds WorkOrder revision, execution
manifest digest, source SHA, candidate SHA or artifact digest, verifier/method
version, evidence set, policy version, and validity period.

**Consequence:** A changed candidate or contract requires re-evaluation. Late
evidence remains history and cannot advance the new subject.

## VF-005 — Missing evidence is not success

**Decision:** Preserve `PASS`, `FAIL`, `SKIPPED`, `NOT_CONFIGURED`, and `ERROR`
at check level. Required `SKIPPED`, `NOT_CONFIGURED`, `ERROR`, missing, stale,
or insufficiently independent evidence cannot produce `VERIFIED`.

**Rejected:** Converting absent integrations to pass or averaging hard failures
into a high score.

## VF-006 — Enforce Change Budget at three boundaries

**Decision:** Evaluate authority during preflight, monitor commands/files during
execution where possible, and reconcile the complete committed diff before
verification and publication.

**Reason:** Preflight alone cannot detect execution drift; post-run scanning
alone detects violations too late to limit damage.

## VF-007 — Keep implementation and verification logically independent

**Decision:** Builder self-review is telemetry. Criteria marked independent
must be evaluated through a separate invocation and evidence path whose
identity and independence level meet policy.

**Consequence:** AI review may support a decision but cannot replace missing
deterministic evidence.

## VF-008 — Govern publication separately from verification

**Decision:** Verification eligibility does not itself authorize GitHub writes.
Human-review reservations suspend the same Attempt. Publication requires a
short-lived, candidate-bound, lease-bound permit immediately before mutation.

**Current state:** Implemented in the P0 continuation and publication path.

## VF-009 — Use existing product interfaces

**Decision:** Extend typed Convex state, the existing Hono service boundary,
`mc work-order`, Work Orders UI, and Execution Run Inspector. Do not create a
second REST authority, CLI, evidence database, or top-level navigation product.

## VF-010 — Defer autonomous learning and trust promotion

**Decision:** Record outcome inputs now. Human review is mandatory for policy,
verifier, prompt, workflow, or autonomy promotion. No agent self-declares trust.

## Revisit triggers

Revisit these decisions if multi-repository Missions, production deployment
verification, regulated evidence retention, remote third-party verifiers, or a
second execution provider demonstrates that the current ownership boundary
cannot meet isolation, scale, or availability requirements.
