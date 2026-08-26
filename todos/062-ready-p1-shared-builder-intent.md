---
status: ready
priority: p1
issue_id: "062"
tags: [software-factory, intent, qa, product, design, ux]
dependencies: ["061"]
---

# Extend Shared Builder Intent

## Problem Statement

The governed intent path is strong for developers/operators but does not provide
clear attributable contribution modes for QA, product, and design.

## Findings

- Mission, Spec, Plan, and Quality Contract are already the correct shared lineage.
- Separate persona dashboards would duplicate state and expand navigation.
- Contributions need revision, diff, attribution, conflicts, and explicit states.

## Proposed Solutions

### Option 1: Role-aware contributions in the existing lineage

**Pros:** Preserves one source of intent and one golden path.

**Cons:** Requires careful progressive UX and concurrency handling.

**Effort:** High

**Risk:** Medium

### Option 2: Separate role workspaces

**Pros:** Tailored surfaces.

**Cons:** Creates silos and hidden handoffs.

**Effort:** Very high

**Risk:** High

## Recommended Action

Implement Option 1. Start with developer + QA, then product and design, using
guided forms in the existing Mission flow and no new primary domain.

## Acceptance Criteria

- [ ] Contributions remain in the same Mission/Spec/Plan/Quality Contract lineage.
- [ ] Contributor role, source revision, decision state, and evidence expectation are attributable.
- [ ] Concurrent edits use revisions or optimistic concurrency, never silent last-write-wins.
- [ ] Agents can draft and inspect without gaining Plan approval authority.
- [ ] Loading, empty, error, denied, conflict, stale, success, and resumption states are browser-proven.
- [ ] The flow is reachable from the existing left navigation and works at narrow widths and keyboard-only.

## Work Log

### 2026-08-25 - Approved implementation kickoff

**By:** Codex

**Actions:**
- Confirmed shared lineage and developer + QA first as the approved sequence.

**Learnings:**
- Role-aware guidance is useful; role-specific state models are not.
