# Work Orders and Tasks Experience

| Field | Value |
| --- | --- |
| Document ID | SFE-DOC-003 |
| Status | IN_REVIEW |
| Owner | Mission Control Platform |
| Reviewer | Product Owner |
| Workspace | Software Factory Research Lab (`sn71gskbdemgf4z1trt9zdmm5h8bde69`) |
| Repository | `jaydubya818/MissionControl` |
| Related Mission | WorkOrders and Tasks Operator Experience (`gs7g4215qyeka9njttxdcsd48n8bc9yn`) |
| Related Work Orders | Current Research Lab queue; no Mission-linked Work Order yet |
| Related Tasks | Current Research Lab Task board |
| Created / updated | 2026-07-28 |
| Source commit | Discovery `61d479b`; operator mirror `5ea8703` |
| Document version | 1.0 |

## Summary

The Tasks page remains the execution-management surface. Work Orders remain the
delivery-contract and acceptance surface. Their relationship, card context,
query state, review ownership, and blocker ownership need implementation.

## Verified current state

### Tasks

- 84 Tasks rendered in nine lanes.
- valid Move destinations are enforced.
- New Task supports title, description, type, priority, due date, and agents.
- saved views exist for agent, priority, and type filters.
- P1 filtering changed the rendered result but did not change the URL.
- refresh reset the filter.
- Task detail includes Overview, Timeline, Artifacts, Approvals, Cost, Reviews,
  and Why.
- no parent Work Order field or link exists.

### Work Orders

- eight Work Orders rendered.
- one was blocked and two needed attention.
- queue filters and selected detail work.
- detail separates outcome, acceptance, approval, verification, evidence, and
  orchestration Runs.
- no first-class child Task collection exists.
- a Seed demo action is visible in a real workspace and should be gated.

## Target Tasks board

Default lanes:

```text
Inbox | Ready | In Progress | Review | Needs Approval | Blocked | Done
```

Failed and Canceled become optional historical lanes. Each card shows Task ID,
title, Work Order, Mission, agent, priority, risk, due date, state age, current
Attempt, retry count, review/blocker owner, dependencies, evidence, cost, and
repository when relevant.

Support URL-addressable search/filters, saved views, board/table modes,
Work Order/Mission/agent swimlanes, WIP warnings, accessible Move controls, and
collapsible side panels.

## Target Work Order detail

Stable sections:

```text
Overview | Acceptance | Tasks | Runs | Evidence | Governance | History
```

The Tasks section shows execution progress, blocked/review/overdue counts, and
Create/Generate actions. Acceptance separately shows criterion coverage and
eligibility.

## Review workflow

- submission captures evidence digest, Attempt, reviewer, and time;
- changes require a reason and retain findings;
- reviewer age/SLA and next action appear on cards;
- self-certification restrictions remain;
- approval does not imply verification.

## Blocked workflow

Capture reason, type, blocking Task or external dependency, owner, required
action, blocked-since, escalation date, affected Work Order, and Mission.

## Decisions

- do not remove or replace Kanban;
- do not make Runs separate cards;
- do not silently create hidden Quick Work Orders;
- keep execution and acceptance metrics separate;
- remove `ASSIGNED` only through an approved compatibility migration.

## Risks

- horizontal board pressure from side panels;
- large live joins without a server projection;
- saved-view compatibility during query expansion;
- ambiguous seeded retry Tasks;
- bulk actions could bypass mixed-state governance.

## Open questions

- default orphan behavior;
- review SLA policy;
- WIP warning versus enforcement;
- responsive breakpoint and default table threshold.

## Next actions

Approve PR 1 relationship scope, then implement card/query changes in PR 2.

## Supporting evidence and repository mapping

- `docs/plans/task-workorder-current-state.md`
- `docs/plans/task-kanban-wireframe.md`
- `docs/testing/task-kanban-ui-results.md`
- `docs/testing/evidence/task-kanban-workorder/`
- Last synchronized: 2026-07-28
