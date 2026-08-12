---
status: complete
priority: p1
issue_id: "041"
tags: [software-factory, review-evidence, browser, authorization, v1]
dependencies: ["031", "038"]
---

# Unify review evidence and finish V1 browser hardening

## Problem Statement

The Execution Run Inspector already derives a review package, but its criterion
projection reads every receipt on the WorkOrder. A receipt from another Attempt
on the same revision can therefore be selected, and a run can appear current
after its WorkOrder revision advances. The UI also omits the authoritative gate
receipt and several reviewer-focus signals already present in the read model.

## Findings

- Criterion evidence is selected by criterion ID and timestamp without binding
  it to the inspected Attempt, candidate SHA, source SHA, or evidence envelope.
- The package does not require an exact-candidate WorkOrder-level `VERIFIED`
  receipt before returning `READY`.
- Exact-head CI is matched by URL and SHA but not by Attempt, repository, or
  branch lineage.
- Policy deviations, failed checks, risk reasons, and change-review lenses are
  derived but not presented as one reviewer-focus list.
- Existing browser evidence predates the latest publication and release
  hardening changes and must be reconfirmed on current `main`.

## Proposed Solutions

### Option 1: Persist a separate review-package record

**Pros:** Simple UI query and historical snapshots.

**Cons:** Creates a second mutable source of truth and requires invalidation
logic for every receipt, revision, PR, CI, and recovery change.

**Risk:** High.

### Option 2: Harden the existing derived read model

**Pros:** Preserves one authority hierarchy, fails closed, and keeps browser
state current after refresh without new persistence.

**Cons:** Adds explicit identity checks to the inspector projection.

**Risk:** Medium.

## Recommended Action

Implement Option 2. Bind every review input to the inspected Attempt and exact
candidate, require the current WorkOrder revision and server-owned gate receipt,
surface one concise reviewer-focus section, and rerun the complete browser state
matrix. Do not add merge automation, connectors, or hundred-agent scheduling.

## Acceptance Criteria

- [x] Criterion evidence must match the inspected Attempt, WorkOrder revision,
  source SHA, candidate SHA, and durable evidence reference.
- [x] `READY` requires a current exact-candidate WorkOrder-level `VERIFIED`
  receipt and exact Attempt/repository/branch/head GitHub CI lineage.
- [x] A newer WorkOrder revision, stale gate, cross-run receipt, or candidate
  mismatch fails closed with a specific operator action.
- [x] The package presents gate identity, pull-request identity, reviewer focus,
  deviations, failed checks, risks, rollback guidance, and complete file lineage.
- [x] Loading, unavailable, blocked, incomplete, recovery, canceled, failed,
  and ready states remain explicit, keyboard reachable, responsive, and stable
  after refresh.
- [x] Focused tests, full CI-equivalent validation, production build, and current
  desktop/narrow browser evidence pass.

## Work Log

### 2026-08-11 - Audit and scope selection

**By:** Codex

**Actions:**

- Read the V1 operational-hardening and verification-first contracts.
- Audited the current review-package query, deterministic evaluator, UI, and
  prior browser evidence on the latest remote `main`.
- Selected a bounded read-model correction instead of a parallel evidence store.

**Learnings:**

- Exact-head CI does not repair cross-Attempt receipt ambiguity; every evidence
  input needs the same immutable Attempt and candidate identity.
- A completed historical run is not review-ready after its WorkOrder authority
  advances, even when its original proof remains valid history.

### 2026-08-11 - Implementation and browser proof

**By:** Codex

**Actions:**

- Bound criterion, gate, pull-request, and CI evidence to the exact Attempt,
  WorkOrder revision, repository, branch, source SHA, and candidate SHA.
- Projected canonical pull-request, base/head, and file lineage from exact-run
  artifacts and persisted that lineage for future Factory Attempts.
- Added the authoritative verification gate, review focus, exact pull-request
  action, rollback guidance, and full changed-file lineage to the inspector.
- Exercised desktop and narrow loading, unavailable, incomplete, failed,
  canceled, recovery, and refresh behavior against the preserved Research Lab.
- Confirmed zero axe violations, no narrow viewport overflow, keyboard dialog
  dismissal, and deterministic `READY` rendering without inventing live proof.

**Learnings:**

- Existing published Factory artifacts held the missing lineage, so the safe
  correction was to project historical records and persist future records—not
  mutate preserved execution history.
- The preserved database contains no Attempt that satisfies every newly strict
  `READY` condition. A fresh governed canary is a post-merge release proof, not
  a reason to weaken or fabricate the review state.

**Validation:**

- `pnpm run ci:lint`
- `pnpm run ci:typecheck`
- `pnpm run ci:test` (53 UI files / 233 tests; 73 Convex files / 515 tests;
  every package suite passed)
- `pnpm run ci:runtime-contract` (838 public functions unchanged)
- `pnpm run build`
- `pnpm run smoke:orchestration-start`
- Focused Factory worker, evaluator, inspector, and review-package tests
- Desktop and narrow browser state matrix documented in
  `docs/testing/evidence/v1-review-browser-hardening/README.md`

## Notes

- Independent verifier process isolation remains a separately documented
  durability boundary. This todo does not widen runtime or scaling scope.
