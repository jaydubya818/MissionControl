# Task and Work Order Migration Plan

| Field | Value |
| --- | --- |
| Document ID | SFE-DOC-005 |
| Status | DRAFT |
| Owner | Mission Control Platform |
| Reviewer | Data and Governance Reviewer |
| Workspace | Software Factory Research Lab (`sn71gskbdemgf4z1trt9zdmm5h8bde69`) |
| Repository | `jaydubya818/MissionControl` |
| Related Mission | WorkOrders and Tasks Operator Experience (`gs7g4215qyeka9njttxdcsd48n8bc9yn`) |
| Related Work Orders / Tasks | Not selected; migration has not started |
| Created / updated | 2026-07-28 |
| Source commit | `61d479b` |
| Document version | 1.0 |

## Summary

No migration has been executed. The safe order is additive schema, shadow
classification, high-confidence linkage, explicit orphan handling, separate
READY migration, separate Attempt normalization, then enforcement.

## Migration sequence

1. baseline manifest and count reconciliation;
2. optional fields, indexes, projection, and dual writes;
3. read-only classification;
4. Task → Work Order backfill for deterministic same-workspace candidates;
5. visible Ungoverned Inbox for unresolved Tasks;
6. READY compatibility and bounded ASSIGNED migration;
7. high-confidence Attempt normalization without deleting source Tasks;
8. parent/rollup enforcement after measured approval.

## Field mapping

- `workOrder.missionId` → derived Task Mission.
- `workOrder.legacyTaskId` → compatibility only.
- `task.goalId` → retained legacy alignment.
- `task.reviewerId` → structured review owner mirror.
- `task.blockedReason` → structured blocker reason mirror.
- `ASSIGNED` → READY with assignees retained.
- Task workflow metadata → Attempt records only when deterministic.

## Validation

- same workspace for every relationship;
- zero Task count/state change before READY phase;
- Work Order acceptance unchanged before enforcement;
- immutable events retained;
- idempotent rerun makes zero changes;
- checkpoints support pause/resume;
- ambiguous records remain visible.

## Rollback

Disable new reads/flags, stop the backfill, retain additive fields and events,
and use compensating audited writes for wrong links. READY rollback appends a
READY → ASSIGNED event. Attempt grouping retains a reversible alias map.

## Decisions

- no direct production database editing;
- no all-workspace default;
- no automatic orphan Work Order creation;
- no destructive Task deletion;
- operator approval before linkage, READY, grouping, and enforcement.

## Risks

- wrong parent changes acceptance;
- cross-workspace link;
- ambiguous attempt grouping;
- stale saved views/automation;
- rollback that erases audit.

## Open questions

- classification confidence threshold;
- batch size and budget;
- operator for ambiguous legacy review;
- compatibility measurement window.

## Next actions

Approve additive compatibility only. Generate and review a dry-run manifest
before any data write.

## Supporting evidence and repository mapping

- Full migration plan: `docs/plans/task-workorder-migration.md`
- Current state: `docs/plans/task-workorder-current-state.md`
- Last synchronized: 2026-07-28
