# Decision Log

| Field | Value |
| --- | --- |
| Document ID | SFE-DOC-007 |
| Status | IN_REVIEW |
| Owner | Mission Control Platform |
| Approver | Product Owner |
| Workspace | Software Factory Research Lab (`sn71gskbdemgf4z1trt9zdmm5h8bde69`) |
| Repository | `jaydubya818/MissionControl` |
| Related Mission | WorkOrders and Tasks Operator Experience (`gs7g4215qyeka9njttxdcsd48n8bc9yn`) |
| Related Work Orders / Tasks | None yet |
| Created / updated | 2026-07-28 |
| Source commit | Discovery `61d479b`; decisions mirrored `5ea8703` |
| Document version | 1.0 |

## DEC-001 — Canonical delivery hierarchy

- Status: Proposed
- Selected option: Goal → Mission → Work Order → Task → Attempt.
- Reason: assigns strategy, governance, execution, and retry ownership once.
- Tradeoff: requires compatibility and a relationship migration.
- Evidence: schema and UI assessment.
- Revisit trigger: PR 1 exposes an unresolvable legacy class.

## DEC-002 — Keep Tasks Kanban

- Status: Proposed
- Selected option: retain Kanban as the central execution surface.
- Reason: operators need visible work ownership, progress, review, and blockers.
- Tradeoff: requires responsive/table alternatives at high volume.
- Evidence: 84-card Research Lab board and existing guarded transitions.

## DEC-003 — Separate Task and Work Order responsibility

- Status: Proposed
- Selected option: Task manages execution; Work Order manages contract and
  acceptance.
- Reason: prevents duplicate top-level status and silent acceptance.
- Tradeoff: UI must explain both states.

## DEC-004 — ASSIGNED versus READY

- Status: Deferred
- Selected option: introduce READY later and migrate ASSIGNED with audit
  history.
- Reason: assignment is an attribute.
- Tradeoff: two state machines, saved views, automation, and existing records
  need compatibility.

## DEC-005 — Orphan Tasks

- Status: Approval required
- Recommended option: visible Ungoverned Inbox plus explicit conversion.
- Rejected option: silent hidden Quick Work Order.
- Reason: keeps governance visible and avoids invented contracts.

## DEC-006 — Progress calculation

- Status: Proposed
- Selected option: show execution and acceptance separately.
- Reason: completed Tasks do not prove criteria.
- Tradeoff: more than one metric must be understood.

## DEC-007 — Review and blocked workflows

- Status: Proposed
- Selected option: structured owner, reason, age, action, findings, and
  escalation.
- Reason: Review and Blocked cannot be waiting-room labels.

## DEC-008 — Initial implementation sequence

- Status: Proposed
- Selected option: relationship → board/query → READY/review/blocker →
  generation → detail → scale → enforcement.
- Reason: smallest reversible path.

## DEC-009 — Documentation synchronization

- Status: Accepted for this cycle
- Selected option: operator-facing Docs site plus version-controlled repository
  detail and stable mapping IDs.
- Reason: current Docs has no dynamic authoring record model.
- Tradeoff: static pages cannot provide approval, ownership enforcement, or
  version history.

## DEC-010 — Static document URL contract

- Status: Implemented and verified for this cycle
- Selected option: preserve the active configured document in the `doc` query
  parameter while retaining the existing `workspace` parameter.
- Reason: operators need stable links, refresh persistence, and browser history
  without introducing a new document persistence model.
- Tradeoff: unknown document IDs fall back to the default configured page;
  dynamic document routes remain future work.
- Evidence: focused unit tests and deterministic Chromium
  reload/back/forward journey.

## Risks

- proposed decisions may be mistaken for approved decisions;
- static page status is descriptive, not enforced;
- future dynamic Docs records need stable import/mapping.

## Open questions

- Product Owner approval for DEC-001 through DEC-008;
- authoring/status/versioning scope for dynamic Docs;
- whether the supplied Docs workspace should be repaired or replaced.

## Next actions

Review DEC-001, DEC-002, DEC-003, DEC-005, DEC-006, and DEC-008 before PR 1.

## Supporting evidence and repository mapping

- Detailed record: `docs/decisions/task-workorder-hierarchy-decisions.md`
- Source plans under `docs/plans/task-*`
- Last synchronized: 2026-07-28
