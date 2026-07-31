---
status: complete
priority: p1
issue_id: "009"
tags: [tasks, workflow, convex, ui, governance]
dependencies: []
---

# Add truthful Task workflow states

## Problem Statement

Mission Control conflates assignment with readiness and does not retain enough
structured Review/Blocked context for trustworthy operator decisions.

## Findings

- `ASSIGNED` exists in the schema, shared types, two state-machine implementations,
  schedulers, tests, and the Kanban lane.
- The approved target model defines assignment as an attribute and `READY` as the
  canonical actionable state.
- `blockedReason` is a loose string and Review metadata lacks an embedded retained
  decision summary.
- Prior schema drift proves schema, writers, generated types, and tests must land in
  one atomic change.

## Proposed Solutions

### Option 1: Destructive enum replacement

Replace every Assigned record immediately. Simple end state, but unsafe because live
data and integrations have not been classified. Risk: high.

### Option 2: Additive compatibility slice

Add Ready, dual-read Assigned, dual-write structured context, and publish a dry-run
report. Slight temporary complexity, but reversible and measurable. Risk: low.

### Option 3: Presentation-only rename

Rename the Assigned lane without changing contracts. Fast, but leaves execution and
audit semantics false. Risk: medium.

## Recommended Action

Implement Option 2. Do not migrate data in this todo.

## Technical Details

Primary areas: `convex/schema.ts`, `convex/tasks.ts`, shared/state-machine packages,
Task scheduler compatibility, `Kanban.tsx`, `TaskDrawerTabs.tsx`, focused tests, and
Mission Control Docs.

## Resources

- `docs/plans/2026-07-31-feat-workflow-state-cleanup-plan.md`
- `docs/plans/task-workorder-target-model.md`

## Acceptance Criteria

- [x] Plan contract implemented without a data migration.
- [x] Focused tests, typecheck, and build pass.
- [x] Browser journey and persistence pass with evidence.
- [x] Architecture, test results, and rollback are documented.

## Work Log

### 2026-07-31 - Planning and repository research

**By:** Codex

**Actions:**
- Confirmed the additive Ready/legacy Assigned approach against the approved model.
- Located both state machines, Convex schema/writer paths, scheduler consumers, and
  the live Tasks UI.
- Incorporated review rejection, blocker recovery, refresh, authorization, and
  duplicate-submission edge cases into the implementation plan.

**Learnings:**
- The prior schema drift requires atomic contract changes.
- The migration must remain a separately approved cycle after dry-run evidence.

### 2026-07-31 - Implementation and bounded verification

**By:** Codex

**Actions:**
- Added canonical Ready handling while preserving raw Assigned records for audit and
  compatibility.
- Added structured Review and Blocker state, reasoned operator dialogs, audited
  transitions, and a read-only workspace compatibility report.
- Verified assignment, invalid-input prevention, rejection, blocker recovery,
  refresh persistence, lane counts, timeline history, and accessibility in Chromium.
- Passed 116 focused assertions, workspace typecheck, production build, and diff
  validation. The full repository suite was intentionally omitted per the bounded-cost
  instruction.

**Learnings:**
- The final report found 20 legacy Assigned Tasks and 34 Review Tasks without
  structured context; none of the Assigned records are automatically migration-safe.
- Existing Task drawer color tokens produce 24 serious contrast findings and should
  be handled as a separate visual-system cycle.
- Local frontend and Convex URLs must be pinned to the same backend during evidence
  runs; mismatched ports make valid workspaces appear missing.
