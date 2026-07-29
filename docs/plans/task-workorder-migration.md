---
title: Task and Work Order Migration Plan
date: 2026-07-28
status: proposed-not-executed
mission_control_docs_id: SFE-DOC-005
mission_control_docs_title: Task and Work Order Migration Plan
related_mission_id: gs7g4215qyeka9njttxdcsd48n8bc9yn
related_work_order_ids: []
last_synchronized_date: 2026-07-28
---

# Task and Work Order Migration Plan

## Safety decision

No migration was executed during discovery.

The migration must be additive, idempotent, workspace-bounded, observable, and
reversible by compensating writes. Existing Task, Work Order, transition, Run,
approval, evidence, and event records must not be deleted or rewritten.

## Current schema

### Task relationship fields

```text
task.projectId?
task.goalId?
task.parentTaskId?
task.metadata.workflowRunId?
task.metadata.workflowAttempt?
```

There is no `task.workOrderId`.

### Work Order relationship fields

```text
workOrder.projectId
workOrder.missionId?
workOrder.missionPlanId?
workOrder.legacyTaskId?
workOrder.currentWorkflowRunId?
```

`legacyTaskId` points from a Work Order to a legacy source/parent Task and may be
used to synchronize completion. It is not a child Task collection.

### Execution fields

```text
run.taskId?
run.workflowRunId?
workflowRun.taskId?
workflowRun.workOrderId?
workflowRun.missionId?
workflowRun.retryCount
```

### Current Task states

```text
INBOX
ASSIGNED
IN_PROGRESS
REVIEW
NEEDS_APPROVAL
BLOCKED
FAILED
DONE
CANCELED
```

## Target schema

### Phase-one additive fields

```text
task.workOrderId?
task.governanceMode? = GOVERNED | UNGOVERNED_INBOX
task.stateEnteredAt?
```

Indexes:

```text
by_work_order(workOrderId)
by_project_work_order(projectId, workOrderId)
by_project_status_state_entered(projectId, status, stateEnteredAt)
```

### Later structured fields

```text
task.criteriaContributionIds?
task.review?
task.blocker?
workflowRun.attemptNumber?
workflowRun.supersedesRunId?
workflowRun.retryReason?
```

Do not add a writable authoritative `task.missionId`; derive Mission from the
Work Order.

## Field mapping

| Current field/source | Target | Rule |
| --- | --- | --- |
| `workOrder.missionId` | Task Mission projection | derive through validated `task.workOrderId` |
| `workOrder.legacyTaskId` | compatibility only | keep meaning; do not invert |
| Task `goalId` | legacy alignment | preserve; stop using as canonical parent |
| Task `parentTaskId` | Task decomposition | preserve; not a substitute for Work Order |
| Task `metadata.workflowRunId` | Attempt compatibility | resolve to workflowRun when valid, then dual-write |
| Task `metadata.workflowAttempt` | Attempt summary | translate to immutable Attempt records where provable |
| Task `reviewerId` | `review.ownerId` mirror | dual-read/write during compatibility |
| Task `blockedReason` | `blocker.reason` mirror | backfill UNKNOWN type when no stronger evidence |
| Task `submittedAt` | `review.enteredAt` candidate | only when transition history confirms Review entry |
| Task `completedAt` | Task completion | preserve |
| Task `ASSIGNED` | `READY` | later bounded migration; assignees unchanged |
| Work Order criteria | Task contribution IDs | explicit operator/generation mapping; never infer from title alone |

## Migration phases

### M0 — Baseline and manifest

Produce a read-only manifest per workspace:

- Task count by state/source;
- Work Order count by Mission and `legacyTaskId`;
- Tasks with workflow metadata;
- Runs/workflowRuns by Task and Work Order;
- duplicate idempotency keys;
- potential cross-workspace references;
- legacy attempt/retry title patterns;
- orphan and ambiguous counts.

Store:

- source commit;
- deployment identifier;
- timestamp;
- query version;
- record IDs and classification, without secrets;
- manifest digest.

Exit criterion: counts reconcile with board/query totals.

### M1 — Additive compatibility

1. add optional fields and indexes;
2. add same-workspace validators;
3. add board/detail projection;
4. old readers continue to work;
5. new Task creation dual-writes governance mode and parent;
6. no existing record is changed.

Exit criterion: unit/integration/isolation tests green and projection parity
counts match current Tasks.

### M2 — Shadow classification

Classify each Task:

| Class | Evidence | Automated action |
| --- | --- | --- |
| Direct generated child | workflowRun has matching Task + Work Order | link if same workspace |
| Legacy source Task | `workOrder.legacyTaskId == task._id` | retain compatibility; do not treat as child automatically |
| PRD/intake orphan | source PRD_IMPORT/DASHBOARD, no deterministic parent | mark UNGOVERNED_INBOX |
| Attempt-like Task | title/metadata suggests retry | no automatic grouping without shared logical identity |
| Ambiguous | conflicting/missing links | operator review |

Shadow output shows what would change. It does not affect rollups or
acceptance.

Exit criterion: zero cross-workspace candidates and operator approval of
classification thresholds.

### M3 — High-confidence Work Order linkage

For deterministic candidates:

1. validate Task, Work Order, and Mission project scope;
2. ensure Task does not already have a conflicting parent;
3. patch `workOrderId` and governance mode;
4. append `TASK_WORK_ORDER_LINKED` event with migration version, actor SYSTEM,
   source IDs, and manifest digest;
5. update checkpoint;
6. re-read and verify.

Idempotency key:

```text
task-workorder-link:<migrationVersion>:<taskId>:<workOrderId>
```

Do not change Task or Work Order state.

### M4 — Orphan Task handling

Recommended default:

- nonterminal Tasks without a deterministic Work Order become
  `UNGOVERNED_INBOX`;
- they remain visible and editable;
- a saved view exposes them;
- mutating governed dispatch and acceptance contribution are blocked;
- operator can create/select a Work Order and convert explicitly.

Terminal historical orphans remain historical and do not require artificial
Quick Work Orders.

Do not auto-create a Work Order per orphan. That would multiply low-value
governance records and invent acceptance contracts.

### M5 — ASSIGNED-to-READY

Prerequisites:

- READY exists in `convex/schema.ts`, `convex/tasks.ts`,
  `packages/state-machine`, UI badges/lanes, filters, analytics, notifications,
  seeds, and tests;
- both old and new clients can read READY;
- saved-view query translation is deployed;
- no automation depends exclusively on ASSIGNED.

Mapping:

```text
status: ASSIGNED → READY
assigneeIds: unchanged
stateEnteredAt: transition time when available, otherwise migration time plus
                `stateAgeConfidence = UNKNOWN`
```

Append a transition/event:

```text
fromStatus: ASSIGNED
toStatus: READY
actorType: SYSTEM
reason: "State-model migration; assignment retained as an attribute"
```

Preserve original transition history. Do not modify old ASSIGNED events.

Execute per workspace in small batches with a checkpoint and count
reconciliation. Pause on any mismatch.

### M6 — Attempt/retry normalization

This is separate from READY.

For each proposed logical Task group require deterministic evidence:

- shared Work Order;
- same intended outcome or explicit source logical ID;
- ordered workflowRuns;
- no conflicting acceptance/evidence ownership;
- same workspace.

Create/retain one logical Task, attach Attempts in order, and record source Task
IDs in migration metadata. Historical Tasks may become read-only aliases that
redirect to the logical Task; they are not deleted.

Ambiguous groups remain separate and visible for operator review.

### M7 — Enforcement

After shadow metrics and operator approval:

- require `workOrderId` for `GOVERNED`;
- require `UNGOVERNED_INBOX` explicitly when absent;
- require Task Attempt to match Task/Work Order;
- enable Work Order Task rollups as acceptance inputs;
- stop new writes to legacy metadata;
- measure legacy reads before removal.

## Existing Work Order linkage

Three cases must remain distinct:

1. **Mission-plan Work Order:** already linked to Mission; generated child Tasks
   derive Mission safely.
2. **Standalone governed Work Order:** `missionId` absent; child Tasks are still
   governed by the Work Order.
3. **Legacy Task-backed Work Order:** `legacyTaskId` identifies origin. It does
   not imply that origin Task is a modern child Task.

A Work Order can have both `legacyTaskId` and new child Tasks during
compatibility.

## Data validation

Pre-write checks:

- parent exists;
- Task and parent share `projectId`;
- existing link is absent or equal;
- Mission, if any, shares project;
- no duplicate attempt number;
- no circular Task dependency;
- source state/version has not changed since manifest.

Post-write checks:

- every GOVERNED Task resolves a Work Order;
- every projected Mission equals Work Order Mission;
- no cross-workspace links;
- Task counts by state unchanged except the approved READY phase;
- Work Order acceptance/state unchanged before enforcement;
- Runs, events, approvals, evidence, and costs unchanged;
- board query count equals baseline;
- idempotent rerun makes zero changes.

## Migration tests

### Unit

- classifies each legacy case;
- rejects conflicting/cross-workspace parents;
- maps ASSIGNED to READY while preserving assignees;
- selects current Attempt deterministically;
- computes retry count without duplicate Tasks;
- translates old saved views;
- is idempotent.

### Integration

- old Task reader with new schema;
- new Task reader with old record;
- Task creation under Mission-linked and standalone Work Orders;
- orphan Task conversion transaction;
- legacy `legacyTaskId` acceptance behavior unchanged;
- rollups remain shadow-only;
- checkpoint resume after simulated failure;
- competing writes cause safe retry/skip.

### Browser

- legacy Task renders;
- governed relationship is visible;
- ungoverned warning is visible;
- old saved view loads;
- READY board lane survives refresh;
- back/forward preserves filters;
- Work Order child count reconciles;
- no retry duplicate card.

## Rollback

### Additive relationship phases

- disable feature flags for new projection/UI;
- stop backfill worker;
- retain added fields/events but ignore them;
- export the completed checkpoint and manifest;
- do not delete links unless they are proven wrong.

If a link is wrong, use a privileged compensating mutation that:

- records old/new parent and reason;
- removes or replaces the link;
- recomputes projections;
- never removes the original migration event.

### READY phase

Only if rollback is required:

- re-enable ASSIGNED reads/writes;
- batch `READY → ASSIGNED`;
- preserve assignees;
- append a rollback transition/event;
- translate saved views back.

### Attempt grouping

Keep a reversible alias map. Disable logical grouping and show source Tasks
again. Source records and evidence remain intact.

## Operational controls

- dry-run required;
- explicit workspace target, never all workspaces by default;
- maximum batch size;
- time and record budget;
- pause/resume checkpoint;
- stop on validation mismatch;
- per-batch audit summary;
- no direct production database edits;
- operator approval before M3, M5, M6, and M7.

## Status

- Migration status: **not started**
- Approved implementation target: **none yet**
- Recommended next approval: **M1 additive compatibility only**
