---
title: Task and Work Order Hierarchy Decision Record
date: 2026-07-28
status: IN_REVIEW
owner: Mission Control Platform
approver: Product Owner
mission_control_docs_id: SFE-DOC-007
mission_control_docs_title: Decision Log
related_mission_id: gs7g4215qyeka9njttxdcsd48n8bc9yn
related_work_order_ids: []
last_synchronized_date: 2026-07-28
---

# Task and Work Order Hierarchy Decision Record

## DEC-001 — Canonical delivery hierarchy

- Status: Approved
- Context: Task and Work Order records exist but lack a canonical child link.
- Options: merge objects; hide Tasks; keep distinct hierarchy.
- Selected: Goal → Mission → Work Order → Task → Attempt.
- Reason: separates strategy, governance, execution, and retry ownership.
- Tradeoff: compatibility and data migration.
- Evidence: schema/UI assessment at rebased commit `bc8340d`.
- Risk: wrong legacy linkage.
- Revisit trigger: PR 1 cannot classify required legacy records safely.

## DEC-002 — Continue Tasks Kanban

- Status: Approved
- Options: remove Kanban; make Work Orders cards; keep Task cards.
- Selected: keep Task Kanban central.
- Reason: operators need visible operational ownership and progress.
- Tradeoff: high-volume board needs table/responsive modes.
- Evidence: 84 Research Lab Tasks and guarded transitions.

## DEC-003 — Task versus Work Order responsibility

- Status: Approved
- Selected: Task owns operational work; Work Order owns delivery contract and
  acceptance.
- Reason: avoids duplicate top-level state and silent acceptance.
- Tradeoff: both state layers must be shown clearly.

## DEC-004 — ASSIGNED versus READY

- Status: Deferred
- Selected: migrate to READY later; preserve assignee attribute/history.
- Reason: assignment is not a workflow phase.
- Risk: state-machine, automation, saved-view compatibility.
- Revisit trigger: relationship PR is accepted and compatibility metrics exist.

## DEC-005 — Orphan Task handling

- Status: Approved
- Selected: visible Ungoverned Inbox and explicit conversion.
- Alternative: visible Quick Work Order flow.
- Rejected: silent hidden Quick Work Order.
- Reason: governance must remain visible.

## DEC-006 — Progress rollups

- Status: Approved
- Selected: Work Order execution progress and acceptance readiness are separate.
- Reason: completed Tasks do not prove criteria.
- Tradeoff: more than one metric.

## DEC-007 — Review and blocked work

- Status: Proposed
- Selected: structured owner, reason, age, action, evidence/findings, and
  escalation.
- Reason: passive lanes do not support operator intervention.

## DEC-008 — Initial implementation sequence

- Status: Approved
- Selected: relationship → Kanban context/query → state cleanup → generation →
  detail → scale → enforcement.
- Reason: smallest reversible path.

## DEC-009 — Documentation synchronization

- Status: Accepted for current cycle
- Selected: static operator Docs pages plus repository engineering detail and
  stable mappings.
- Reason: dynamic Docs authoring is missing.
- Tradeoff: status/history are descriptive, not enforced.
- Revisit trigger: dynamic Docs record design is approved.

## DEC-010 — Static document URL contract

- Status: Implemented and verified for current cycle
- Context: configured Docs pages reset to the default after refresh and could
  not be linked directly.
- Options: component-only state; route segment; query parameter.
- Selected: retain the configured page ID in the `doc` query parameter.
- Reason: preserves the existing `/v2/docs` route and `workspace` selection
  while adding stable links and native browser history.
- Tradeoff: unknown IDs fall back to the default configured page; this does not
  define future dynamic-document routing.
- Evidence: focused unit tests and deterministic Chromium direct URL, reload,
  back, and forward journey.
- Risk: future dynamic document IDs could collide with configured IDs.
- Revisit trigger: governed document records and routes are designed.
