# Canonical Delivery Hierarchy

| Field | Value |
| --- | --- |
| Document ID | SFE-DOC-002 |
| Status | IN_REVIEW |
| Owner | Mission Control Platform |
| Reviewer | Product Owner |
| Workspace | Software Factory Research Lab (`sn71gskbdemgf4z1trt9zdmm5h8bde69`) |
| Repository | `jaydubya818/MissionControl` |
| Related Mission | WorkOrders and Tasks Operator Experience (`gs7g4215qyeka9njttxdcsd48n8bc9yn`) |
| Related Work Orders | None |
| Related Tasks | None canonically linked yet |
| Created / updated | 2026-07-28 |
| Source commit | Discovery `bc8340d`; operator mirror `78d7219` |
| Document version | 1.0 |

## Summary

The final delivery model is Goal → Mission → Work Order → Task → Attempt.
Artifacts and evidence belong to execution and acceptance, not to competing
top-level work objects.

## Detailed content

```text
Goal — strategic result or investment objective
  Mission — governed outcome spanning one or more deliverables
    Work Order — authorized contract for one concrete deliverable
      Task — visible, assignable operational unit on the Kanban
        Attempt — one workflow execution try attached to the Task
          agent Runs, steps, tool calls, artifacts, and evidence
```

### Ownership

| Entity | Owns | Does not own |
| --- | --- | --- |
| Goal | strategic result | execution state |
| Mission | objective, limits, plan, assertions, final acceptance | direct Task state |
| Work Order | outcome, scope, criteria, risk, verification, acceptance | Kanban retry cards |
| Task | operational status, assignment, due date, dependencies, review, blocker | Work Order acceptance |
| Attempt | runtime state, steps, logs, tools, retry reason | independent Task identity |
| Evidence | criterion-specific proof | optimistic completion state |

### State ownership

- Task: INBOX, READY, IN_PROGRESS, REVIEW, NEEDS_APPROVAL, BLOCKED, DONE,
  FAILED, CANCELED.
- Attempt: queued/running/paused/completed/failed/canceled/timeout.
- Approval: pending/approved/rejected/expired.
- Verification: pending/pass/fail/stale/waived/unknown.
- Work Order and Mission retain their existing governed lifecycles.

Assignment is an attribute, not a future primary state. A failed Attempt does
not make the Task terminal while recovery is active. Task Done does not accept
the Work Order.

### Rollups

Work Orders display both:

```text
Execution progress: 8 of 10 required Tasks Done
Acceptance readiness: 3 of 4 blocking criteria verified
```

Mission progress derives from Work Order acceptance, validation assertions,
corrective iterations, approvals, and final acceptance. Task count alone is
never sufficient.

## Decisions

- no writable Task Mission relationship as the primary link; derive through
  Work Order;
- query child Tasks by indexed `task.workOrderId`, not an ID array;
- use Task-scoped `workflowRuns` as Attempts;
- retain low-level `runs` as agent turns;
- preserve `legacyTaskId` meaning during compatibility.

## Risks

- two Run layers require an explicit projection;
- legacy Tasks may be ambiguous;
- denormalized relationship labels may drift;
- acceptance could be bypassed if state ownership is merged.

## Open questions

- risk-dependent independent review rules;
- cross-Work-Order dependency policy;
- whether Task progress needs a display-only percentage;
- exact compatibility duration for ASSIGNED.

## Next actions

Approve the hierarchy, then implement the additive relationship/read model
before changing the board state machine.

## Supporting evidence and repository mapping

- Repository document: `docs/plans/task-workorder-target-model.md`
- Migration: `docs/plans/task-workorder-migration.md`
- Decision record: `docs/decisions/task-workorder-hierarchy-decisions.md`
- Last synchronized: 2026-07-28
