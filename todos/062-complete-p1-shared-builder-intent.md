---
status: complete
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

- [x] Contributions remain in the same Mission/Spec/Plan/Quality Contract lineage.
- [x] Contributor role, source revision, decision state, and evidence expectation are attributable.
- [x] Concurrent edits use revisions or optimistic concurrency, never silent last-write-wins.
- [x] Agents can draft and inspect without gaining Plan approval authority.
- [x] Loading, empty, error, denied, conflict, stale, success, and resumption states are browser-proven.
- [x] The flow is reachable from the existing left navigation and works at narrow widths and keyboard-only.

## Work Log

### 2026-09-05 - Merged and post-merge qualified

**By:** Repository operator through Codex

**Actions:**
- Merged implementation PR #181 at
  `b07be175262e7c6434c7c0d2fc33565a58b91880` after every required check passed.
- Verified that the implementation and merge commits have the same Git tree.
- Re-ran the focused qualification, runtime-contract guard, documentation guard,
  Fab identity, and composed system contracts from a clean post-merge worktree.
- Preserved the immutable closure evidence in
  `docs/testing/evidence/shared-builder-intent-todo062/completion-record.md`.

**Learnings:**
- Exact tree identity is the clean way to bind pre-merge CI evidence to a merge
  commit that introduces no content change.
- Reused dependency trees are not valid provenance for pinned private runtimes;
  post-merge qualification must start from a frozen clean install.

### 2026-09-05 - Implementation resumed from qualified Phase 5 main

**By:** Repository operator through Codex

**Actions:**
- Bound the implementation to Mission Control main at Phase 5 closure merge
  `cc1c530fad2cd46adeb43443013734a2900f7a06`.
- Chose immutable contribution proposals and separate human decisions attached
  to the existing exact Mission Spec revision and digest.
- Kept agent authority proposal-only: signed agent operations may draft and
  inspect; only an authorized human may accept or reject.
- Rebased the qualified slice onto Fab Phase 3 main
  `906b08f5cfb912711b90c6e2b6ca6808e120e42e`, preserved its recovery contracts,
  and advanced the combined public runtime contract from v44 to v45.

**Learnings:**
- A separate persona workspace is unnecessary. The existing Specification
  workspace is the correct shared surface and authoritative lineage.
- Staleness and concurrent target conflicts should be derived from immutable
  records so recovery survives refresh without rewriting history.

### 2026-08-25 - Approved implementation kickoff

**By:** Codex

**Actions:**
- Confirmed shared lineage and developer + QA first as the approved sequence.

**Learnings:**
- Role-aware guidance is useful; role-specific state models are not.
