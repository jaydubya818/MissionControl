# Software Factory Enhancement Overview

| Field | Value |
| --- | --- |
| Document ID | SFE-DOC-001 |
| Status | IN_REVIEW |
| Owner | Mission Control Platform |
| Reviewer | Product Owner |
| Workspace | Software Factory Research Lab (`sn71gskbdemgf4z1trt9zdmm5h8bde69`) |
| Repository | `jaydubya818/MissionControl` |
| Related Mission | WorkOrders and Tasks Operator Experience (`gs7g4215qyeka9njttxdcsd48n8bc9yn`) |
| Related Work Orders | None; the Mission is currently a Draft with zero Work Orders |
| Related Tasks | Research Lab execution board; 84 Tasks observed, not yet canonically linked |
| Created | 2026-07-28 |
| Last updated | 2026-07-28 |
| Source commit | `61d479b` discovery package |
| Document version | 1.0 |

## Summary

Mission Control should keep the Tasks Kanban as the central execution surface
and make Work Orders its governed parent delivery contracts. The completed
discovery found that both surfaces work independently, but Tasks have no
canonical `workOrderId`. The first implementation slice should add that
relationship and compatibility projection without migrating state or changing
acceptance behavior.

## Purpose

Give operators, reviewers, product leaders, and agents one browser-readable
source for the Task and Work Order enhancement cycle while retaining detailed,
version-controlled engineering records under `docs/`.

## Canonical hierarchy

```text
Goal
  Mission
    Work Order
      Task
        Attempt / workflowRun
          agent Runs, steps, tool calls, artifacts, and evidence
```

Tasks are Kanban cards. Attempts and retries remain under their Task. Work
Orders own acceptance criteria and explicit acceptance.

## Mission portfolio summary

The Research Lab contains nine enhancement Missions covering the operating
model, governed lifecycle, Work Orders and Tasks, memory and GraphRAG, agent
workforce, quality, pipelines, autonomous operations, and continuous research.
All nine were observed as Draft with no approved contract at discovery time.

This document is related specifically to Mission 3, WorkOrders and Tasks
Operator Experience. The other portfolio Missions require their own evidence
cycles before detailed documents can be marked current; placeholder assessments
have intentionally not been created.

## Current status

- Discovery and planning: completed and committed.
- Current-state browser evidence: completed.
- Full prepared repository suite: 941 tests passed.
- Canonical relationship implementation: proposed, not started.
- Data migration: not started.
- Docs record authoring workflow: unavailable in the current product.
- Operator-facing repository Docs collection: implemented and browser-verified
  in this branch.
- Docs direct URL, reload, back, and forward behavior: verified.
- Supplied invalid Docs workspace recovery: failed; DOCS-001 remains open.

## Top findings

- Task and Work Order responsibilities are useful and distinct.
- `tasks.workOrderId` is missing.
- `workOrders.legacyTaskId` is compatibility metadata in the opposite
  direction and cannot be repurposed silently.
- the board currently renders nine lanes and 84 Research Lab Tasks.
- valid Move destinations are enforced in the UI and backend.
- Task filters are not URL-addressable and reset after refresh.
- the New Task modal cannot choose a Work Order or governance mode.
- Attempt/retry-labeled Tasks conflict with the target one-Task-many-Attempts
  rule.
- Work Order acceptance already has meaningful approval and evidence gates.
- the supplied Docs workspace ID is invalid in the current deployment.

## Current decisions

- Keep the Tasks Kanban.
- Adopt Goal → Mission → Work Order → Task → Attempt.
- Keep Work Orders as governed delivery contracts.
- Do not make retries separate cards.
- Add compatibility relationships before visual/state migration.
- Use a visible Ungoverned Inbox for parentless intake until the operator
  approves another policy.
- Keep Task execution progress separate from Work Order acceptance readiness.
- Treat Mission Control Docs as operator source and repository Markdown as
  version-controlled engineering source.

## Risks

- incorrect legacy linkage could change acceptance semantics;
- cross-workspace links could expose data;
- automatic Quick Work Orders could hide governance;
- retry consolidation could destroy audit history;
- static Docs pages do not satisfy create/edit/approval/version-history needs;
- the invalid supplied Docs workspace can crash the console.

## Open questions

- Should parentless global Tasks remain Ungoverned Inbox or require visible
  Quick Work Order conversion?
- When should `ASSIGNED` migrate to `READY`?
- Are cross-Work-Order dependencies allowed or approval-gated?
- What authority and SLA apply to Task review?
- Should WIP limits warn or block?
- Which dynamic document-management slice should follow the static collection?

## Next actions

1. Product Owner reviews and approves the canonical hierarchy and PR 1 boundary.
2. Implement additive Task → Work Order linkage and workspace invariants.
3. Design dynamic Docs collections, authoring, status, and version history as a
   separate governed Work Order.
4. Restart or replace the invalid Docs workspace link.
5. Keep operator and repository documents synchronized on every material update.

## Supporting evidence

- Browser screenshots: `docs/testing/evidence/task-kanban-workorder/`
- Docs screenshots and traces: `docs/testing/evidence/mission-control-docs/`
- Current-state assessment: `docs/plans/task-workorder-current-state.md`
- Target model: `docs/plans/task-workorder-target-model.md`
- Enhancement plan: `docs/plans/task-kanban-workorder-enhancement-plan.md`
- Migration plan: `docs/plans/task-workorder-migration.md`
- UI results: `docs/testing/task-kanban-ui-results.md`
- Docs UI results: `docs/testing/mission-control-docs-ui-results.md`
- Source commit: `61d479bb82e00da2aac2c12738bf39fb0f914215`

## Collection map

- [Canonical Delivery Hierarchy](./canonical-delivery-hierarchy.md)
- [Work Orders and Tasks Experience](./task-workorder-experience.md)
- [Master Enhancement Plan](./implementation-plan.md)
- [Task and Work Order Migration Plan](./migration-plan.md)
- [Browser Test Results](./browser-test-results.md)
- [Decision Log](./decision-log.md)
- [Mission Control Docs Product Assessment](./docs-product-assessment.md)
- [Documentation Governance](./documentation-governance.md)
