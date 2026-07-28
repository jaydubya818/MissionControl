---
title: "WorkOrders and Tasks UX Review"
date: 2026-07-28
tested_url: http://localhost:5199
workspace: Software Factory Research Lab
---

# WorkOrders and Tasks UX Review

## Executive decision

Keep both objects, but make their roles explicit:

- A **WorkOrder** is the authorized unit of value and acceptance.
- A **Task** is a bounded operational unit that performs or tracks work.

The default operator experience should not be a complete board or a selected
record. It should be an attention queue answering: what needs a decision,
why, by whom, and by when?

## Current workflow

### WorkOrders

1. Open Delivery → Work Orders.
2. The page selects a record and combines list, summary, actions, and a long
   detail panel.
3. Operator filters by repository, state, risk, assignment, requestor, and
   verification.
4. Actions vary by lifecycle: request approval, dispatch, record receipt,
   accept, revise, reopen, refresh governance, or supersede.
5. Runs and evidence are available, but their location changes with state and
   the selected record.

Audited Research Lab state: seven WorkOrders; two need attention; one blocked;
zero awaiting approval; zero ready to dispatch. A “Seed demo” action is visible
inside the live workspace.

### Tasks

1. Open Delivery → Tasks.
2. A horizontally scrolling board renders lifecycle columns and 84 scoped
   tasks.
3. Operator can search, filter, use saved views, import a PRD, create a Task,
   pause the squad, and use card-level Move/Open controls.
4. Many visible records are Loop Engineering attempts and retries; relationship
   and outcome context must be inferred from titles and small badges.

The flow works, but the information hierarchy favors complete inventory over
operator decisions.

## Browser evidence

- Mission portfolio and WorkOrder/Task observations are recorded in
  `docs/testing/software-factory-ui-audit.md`.
- The prior supplied screenshot illustrates a wide five-column Task board and a
  modal PRD import over an already dense three-column shell.
- Current Mission screenshots:
  - `docs/testing/evidence/software-factory-plan/mission-portfolio-nine-drafts.png`
  - `docs/testing/evidence/software-factory-plan/mission-draft-detail.png`

## Operator pain points

| Finding | Impact | Severity |
| --- | --- | --- |
| Default WorkOrder selection competes with queue triage | Operator starts in detail before knowing priority | P1 |
| Long action/detail surface changes by state | Important governance actions are hard to predict | P1 |
| “Seed demo” appears in live WorkOrders | Accidental fixture mutation and trust loss | P0 |
| Board requires horizontal scanning | Slow at 84 tasks and poor on narrow screens | P1 |
| Review can become a waiting room | Age, reviewer, reason, and next action are not first-class | P1 |
| Mission, WorkOrder, Task, run, approval and verification states compete | A badge can be mistaken for overall completion | P0 |
| Attempt/retry labels dominate titles | Operators cannot quickly see the underlying outcome | P1 |
| Empty columns consume width | Low-value layout cost | P2 |
| Icons such as `🔎` and `🧪` need contextual names | Meaning is not reliably accessible or obvious | P1 |
| Finished records add visual noise | Active intervention is diluted | P1 |

## Information hierarchy

Every queue row/card should answer in this order:

1. outcome title;
2. required operator action;
3. state and reason;
4. owner and next-action owner;
5. age / review age / due date;
6. parent Mission and WorkOrder;
7. approval and verification summary;
8. active run or latest failed attempt;
9. risk and budget only when material.

Agent identity, token cost, attempt number, and low-level execution status are
secondary metadata or detail content.

## Review-queue analysis

Review is a governed service, not a passive column. A review item needs:

- `submittedAt` and live age;
- required reviewer role and assigned reviewer;
- submission reason and change summary;
- evidence completeness and stale/missing indicators;
- prior rejection reason and resubmission count;
- service-level target and breach indicator;
- Approve, Reject with required reason, and Open evidence;
- explicit outcome after decision.

Recommended initial SLOs are measurements, not hard gates:

- P0/high-risk: p50 under 4 hours; p75 under 8 hours.
- P1/normal: p50 under 1 business day; p75 under 2 business days.
- Low risk: p75 under 2 business days.

Do not automate approval to meet the SLO. Escalate aging work and measure the
cause.

## Proposed page structure

### WorkOrders

1. Page header: title, workspace, New WorkOrder.
2. KPI strip: Needs decision, Blocked, Review aging, Verification gaps.
3. View tabs: Attention, Active, Review, Completed, All.
4. Query bar: search, saved view, compact filters, group, sort.
5. Results: table by default; optional board by state.
6. Detail drawer/page opened intentionally; no implicit selection on first
   load.

Desktop table columns:

`Outcome | Required action | State/reason | Mission | Owner | Age | Approval |
Verification | Active run`

Narrow layout collapses rows into a vertical list and opens detail as a full
screen sheet.

### Tasks

1. Same attention KPI pattern.
2. View tabs: My/Assigned, Attention, Review, Active, All.
3. Table default when task count exceeds a threshold (for example 30).
4. Board optional, with empty columns collapsed and a visible WIP count/limit.
5. Group by WorkOrder or Mission; standalone Tasks have an explicit label.
6. Historical attempts collapse beneath the current logical Task.

## Proposed card/row structure

```text
[State] Outcome-oriented title                         Age 2d
Required action: Assign independent reviewer          [P1]
Mission: Lifecycle Completion  /  WO: Plan UI
Owner: MC Forge       Next: Jay       Review: 6h / 8h
Approval: pending     Evidence: 4/5, 1 stale
Active run: retry 2 (failed predecessor retained)
```

Rules:

- Never combine WorkOrder, Task, run, approval, and verification into one
  ambiguous “status.”
- Use labels/icons with text; color is supplementary.
- Show only the current attempt by default, with expandable attempt history.
- Avoid per-card controls beyond Open and the one highest-confidence next
  action.
- Bulk actions are deferred until authorization, mixed-state behavior, and
  idempotency are specified.

## Unified detail tabs

Both WorkOrder and Task details should use a stable tab vocabulary, omitting
tabs only when not applicable:

1. **Overview** — outcome, state, required action, owners, relationships.
2. **Acceptance** — structured criteria/assertions and current coverage.
3. **Tasks** — child Tasks or sibling execution units.
4. **Runs** — attempts, runtime, model, cost, logs, recovery.
5. **Evidence** — receipts, artifacts, validator, freshness, conflicts.
6. **Governance** — approvals, waivers, policies, budget, permissions.
7. **History** — immutable transitions, revisions, decisions, comments.

Breadcrumb:

`Goal → Mission → WorkOrder → Task → Run`

Each segment uses a stable ID in the URL and returns to the prior saved
view/filter state.

## Table versus board

| Need | Table | Board |
| --- | --- | --- |
| Scan age, owner, reason, evidence | Best | Weak |
| Understand lifecycle distribution | Adequate | Best |
| 80+ records | Best | Poor |
| Drag transition | Optional menu | Best |
| Keyboard/narrow viewport | Best | Costly |
| Dependency/relationship grouping | Best | Limited |

Recommendation:

- Table is default at normal production volumes.
- Board is an optional state-transition view.
- WIP limits are warnings first; a hard limit requires a policy decision.
- Empty board columns collapse but remain discoverable.
- Both modes share the same query, selection, permissions, and URL state.

## State-model review

Keep separate state machines and surface them independently:

| State | Owner | Example |
| --- | --- | --- |
| Mission | outcome governance | DRAFT, READY, IN_PROGRESS, BLOCKED |
| WorkOrder | requested value | READY, DISPATCHED, AWAITING_VERIFICATION, DONE |
| Task | operational work | INBOX, ASSIGNED, IN_PROGRESS, REVIEW, DONE |
| WorkflowRun | execution attempt | QUEUED, RUNNING, FAILED, COMPLETED |
| Approval | decision | PENDING, APPROVED, REJECTED, EXPIRED |
| Verification | evidence result | PENDING, PASS, FAIL, STALE, WAIVED, UNKNOWN |

UI rules:

- Parent completion derives from governed rules, never the most optimistic child.
- A failed run does not automatically mean a failed WorkOrder when recovery is
  active.
- Review is not approval; approval is not verification.
- Rejection returns work to an explicit actionable state and retains decision
  history.
- Unknown is not pending and never pass.

## Accessibility review

Observed strengths:

- Primary controls have accessible names.
- Empty-message Send is disabled.
- Workspace selection and main groups are keyboard-visible in the accessibility
  tree.

Required improvements:

- Replace emoji-only task filters with named accessible controls and visible
  text/tooltips.
- Add one H1 and stable landmark structure to both pages.
- Ensure board drag has Move menu/keyboard parity.
- Announce transition success/failure and filter result counts.
- Associate validation errors with inputs.
- Preserve focus after mutation and return it to the initiating control.
- Use dialog focus containment and restore focus after close.
- Provide non-color state reason text.
- Test at 320–400 px and 200% zoom.

## Mobile/responsive recommendation

Mobile should prioritize:

1. attention count;
2. required action;
3. outcome and relationship;
4. age/owner;
5. evidence decision.

Do not render the full Kanban horizontally by default. Use a vertical,
virtualized list and a full-screen detail sheet. Keep approve/reject/resolve
actions sticky only after their authorization and evidence prerequisites load.

## Acceptance tests

### WorkOrders

1. Open Research Lab WorkOrders and land on Attention without an implicit
   selected record.
2. Filter by state, risk, repository, verification, and Mission; refresh and
   retain URL state.
3. Open blocked WorkOrder; see reason, blocker owner, resolution, age, parent
   Mission, children, latest run, approval, and evidence.
4. Navigate Mission→WorkOrder→Task→Run and back without losing filters.
5. Record an authorized decision; duplicate click creates one event.
6. Rejected/expired/stale governance remains visible and blocks acceptance.
7. Completed WorkOrders are absent from Active but discoverable in Completed.

### Tasks

1. Search 80+ Tasks with responsive results and no horizontal board requirement.
2. Switch table/board without changing the result set.
3. Group by Mission and WorkOrder; standalone Tasks are explicit.
4. Move a disposable Task through valid states; invalid transitions show an
   actionable error.
5. Submit to Review; age, reviewer, evidence, and required action appear.
6. Reject with a reason, correct, resubmit, and approve; history is preserved.
7. Pause/resume squad and refresh; state persists without duplicate events.
8. Use all critical actions by keyboard at narrow viewport.

## Explicit non-scope

- No new task or WorkOrder state machine.
- No automatic approval or review bypass.
- No bulk state transitions in the first PR.
- No removal of legacy Tasks until relationships are measured and migrated.
- No new Roadmaps page.

