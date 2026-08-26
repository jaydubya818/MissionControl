---
status: ready
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

- [ ] Canonical incident records reference existing evidence rather than copying it.
- [ ] Containment and restoration are separate, authorized, idempotent decisions.
- [ ] Agents can detect, enrich, and propose but cannot erase evidence or restore authority.
- [ ] OWASP agentic threat drills produce incident, containment, recovery, and follow-up evidence.
- [ ] UI covers loading, empty, error, denied, contained, recovering, monitoring, and resolved states.
- [ ] Refresh/restart and duplicate/late/reordered event behavior are verified.

## Work Log

### 2026-08-25 - Approved implementation kickoff

**By:** Codex

**Actions:**
- Confirmed a thin aggregate is the approved architecture.

**Learnings:**
- Authority restoration must never be inferred from alert closure.
