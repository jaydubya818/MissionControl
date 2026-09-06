---
status: complete
priority: p1
issue_id: "060"
tags: [software-factory, incidents, security, sre, governance]
dependencies: ["059"]
---

# Add Canonical Factory Incident Command

## Problem Statement

Alerts, run failures, traces, and operational events are fragmented. Mission
Control has no canonical incident owner, lifecycle, containment state, or safe
restoration decision.

## Findings

- Existing controls can pause, cancel, revoke, quarantine, and preserve evidence.
- Closing an alert does not represent authority restoration or incident resolution.
- A second trace or evidence store would duplicate trusted records.

## Proposed Solutions

### Option 1: Thin incident aggregate over existing evidence

**Pros:** Preserves one authority hierarchy and reuses proven controls.

**Cons:** Requires careful cross-record currentness and idempotency.

**Effort:** High

**Risk:** Medium

### Option 2: Standalone incident subsystem

**Pros:** Faster isolated modeling.

**Cons:** Duplicates evidence and creates hidden authority.

**Effort:** High

**Risk:** High

## Recommended Action

Implement Option 1 with immutable transitions and the exact lifecycle:
Clarify → Contain → Observe → Isolate → Restore → Correct → Prevent → Measure.

## Technical Details

- `convex/schema.ts`
- new `convex/factory/incidents.ts`
- existing alerts, Attempts, routing, credentials, Factory Versions, PRs, releases, and audits
- existing Factory Ops/Incidents route and v2 navigation

## Acceptance Criteria

- [x] Canonical incident records reference existing evidence rather than copying it.
- [x] Containment and restoration are separate, authorized, idempotent decisions.
- [x] Agents can detect, enrich, and propose but cannot erase evidence or restore authority.
- [x] OWASP agentic threat drills produce incident, containment, recovery, and follow-up evidence.
- [x] UI covers loading, empty, error, denied, contained, recovering, monitoring, and resolved states.
- [x] Refresh/restart and duplicate/late/reordered event behavior are verified.

## Work Log

### 2026-09-06 - Current-main v51 reconciliation

**By:** Repository operator through Codex

**Actions:**
- Reconciled the additive incident-command API onto authoritative runtime v50
  and recorded the exact eight-operation v50 → v51 public contract diff. Main
  claimed v50 for inference observation retention while this branch was being
  qualified, so the incident contract advanced to the next truthful version.
- Replaced opaque control references with one-to-one canonical PASS evidence
  envelopes for command issue and observed effect. Enforced exact workspace,
  control key, receipt role, creation ordering, incident currentness, and a
  distinct command/effect identity.
- Kept restoration as a separate `factory.approve` decision and confirmed the
  incident module never mutates grants, WorkOrders, or Attempts.
- Ran authoritative Convex codegen against the isolated local deployment; the
  generated API required no manual edits.
- Passed the 19-test focused incident suite, browser verification, and all 18
  canonical System Factory E2E qualification gates against the v50 base.

**Learnings:**
- An identifier-shaped string is not containment proof. The durable evidence
  record must exist, be scoped, pass, identify the exact control/role, and
  predate the observation.
- Incident restoration is an audit decision, not a shortcut that reactivates
  authority in another subsystem.

### 2026-09-05 - Deterministic implementation qualification complete

**By:** Repository operator through Codex

**Actions:**
- Implemented the thin incident aggregate, append-only transition log, explicit
  containment/restoration authority, signed service detection/proposals, and
  the existing-nav operator workspace at runtime contract v47.
- Exercised the complete public API lifecycle in an isolated local Convex
  deployment through nine immutable decisions, including exact duplicate,
  stale/reordered, resolved-immutability, and denied-access checks.
- Browser-verified the resolved aggregate, Event stream continuity, narrow
  split-pane layout, local denied-state boundary, and zero browser errors.
- Updated the v2 route smoke contract for the intentionally renamed
  `Factory Incidents` page and passed all 15 deterministic browser, security,
  accessibility, and route-smoke tests.
- Ran the focused 15-test incident suite and the full composed system
  qualification. All 18 qualification gates passed, including release security,
  128 execution-boundary tests, 204 cross-domain contracts, the full repository
  suite, lint, runtime-contract guard, production build, startup smoke, and
  whitespace integrity.
- Retained exact fixture and browser evidence under
  `docs/testing/evidence/factory-incident-command-todo060/` and composed evidence
  under `docs/testing/evidence/factory-incident-command-todo060-system/`.

**Learnings:**
- The final simplicity pass found two material issues before shipment: the
  split-pane layout used the viewport breakpoint rather than available content
  width, and source deduplication needed an exact repository-scope check.
- Deterministic incident-command capability is complete, but production
  promotion still depends on todo 059's real repository, team, champion, FDE,
  named incident commander, and retained live drill evidence.

### 2026-09-05 - Current-main implementation resumed

**By:** Repository operator

**Actions:**
- Began the safe, deterministic incident aggregate and operator workflow on the
  exact post-merge pilot-readiness baseline.
- Kept the real pilot drill and named incident commander as external evidence
  gates; no production incident, authority restoration, or live provider action
  is inferred by this implementation.

**Learnings:**
- The approved convergence program permits independent incident implementation
  before the externally blocked real pilot completes, while preserving the
  pilot dependency for real-world qualification and promotion claims.

### 2026-08-25 - Approved implementation kickoff

**By:** Codex

**Actions:**
- Confirmed a thin aggregate is the approved architecture.

**Learnings:**
- Authority restoration must never be inferred from alert closure.
