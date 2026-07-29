# Master Enhancement Plan

| Field | Value |
| --- | --- |
| Document ID | SFE-DOC-004 |
| Status | IN_REVIEW |
| Owner | Mission Control Platform |
| Reviewer | Product Owner |
| Workspace | Software Factory Research Lab (`sn71gskbdemgf4z1trt9zdmm5h8bde69`) |
| Repository | `jaydubya818/MissionControl` |
| Related Mission | WorkOrders and Tasks Operator Experience (`gs7g4215qyeka9njttxdcsd48n8bc9yn`) |
| Related Work Orders / Tasks | None created for this implementation yet |
| Created / updated | 2026-07-28 |
| Source commit | `61d479b` |
| Document version | 1.0 |

## Summary

Deliver the hierarchy in small PRs. Relationship and compatibility come before
state migration, generation, visual expansion, or acceptance enforcement.

## Recommended first three PRs

### PR 1 — Domain relationships and compatibility

- optional `tasks.workOrderId` and governance classification;
- same-workspace validation and indexes;
- Task relationship/Attempt projection;
- dual-write new Task creation paths;
- Work Order child Task shadow summary;
- legacy compatibility and focused tests;
- no state or acceptance change.

### PR 2 — Kanban hierarchy and query

- corrected subtitle;
- Work Order and Mission card context;
- Attempt, retry, due, age, review, blocker, evidence, and cost summary;
- URL query codec and expanded filters;
- initial saved views;
- collapsible side panels and responsive tests.

### PR 3 — Workflow-state cleanup

- READY in schema, Convex transition rules, and state-machine package;
- compatibility mapping and saved-view translation;
- structured Review and Blocked data;
- dry-run and bounded ASSIGNED migration only after approval.

## Later PRs

4. Work Order Task generation and PRD destination.
5. Unified Task and Work Order detail.
6. Table/swimlanes, WIP, review/blocked aging, authorized bulk actions.
7. Enforced rollups and high-confidence legacy closure.

## Acceptance boundaries

PR 1 passes when governed Tasks resolve Work Order and derived Mission, legacy
Tasks still render, cross-workspace links fail, and acceptance behavior is
unchanged.

## Decisions

- the first slice is additive;
- rollups operate in shadow/display mode before enforcement;
- migration and retry grouping are separate approvals;
- dynamic Docs authoring is a separate product slice.

## Risks

- state and schema scope creep;
- false confidence from display-only relationships;
- migration before classification;
- giant PR coupling Docs, Kanban, and governance.

## Open questions

- operator approval of visible Ungoverned Inbox;
- the implementation Work Order and assigned lead;
- the acceptance criteria for dynamic Docs authoring.

## Next actions

Create one governed PR 1 Work Order after Product Owner approval. Do not start
PR 2 or migration in the same change.

## Supporting evidence and repository mapping

- Detailed plan: `docs/plans/task-kanban-workorder-enhancement-plan.md`
- Wireframes: `docs/plans/task-kanban-wireframe.md`
- Target model: `docs/plans/task-workorder-target-model.md`
- Last synchronized: 2026-07-28
