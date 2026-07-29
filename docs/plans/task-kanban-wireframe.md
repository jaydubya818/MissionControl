---
title: Task Kanban and Work Order Wireframes
date: 2026-07-28
status: proposed
---

# Task Kanban and Work Order Wireframes

These wireframes define information hierarchy, not final visual styling. Use
`docs/design.md` and the existing v2 shell tokens during implementation.

## Tasks board

```text
┌ Delivery / Tasks ────────────────────────────────────────────────────────────┐
│ Tasks                                      [+ New Task] [Import PRD] [⋯]    │
│ Kanban execution board for Tasks across active Work Orders.                 │
│                                                                             │
│ 84 Tasks  |  8 active WOs  |  6 blocked  |  5 review  |  3 overdue         │
│                                                                             │
│ [Board] [Table]   Search…   [Saved view ▾]   [Filters 4]   [Group: None ▾] │
│ View: Needs operator attention                                  [Share URL] │
├─────────────────────────────────────────────────────────────────────────────┤
│ Inbox 3       Ready 8        In Progress 12   Review 5    Approval 2 ... →  │
│ ┌──────────┐  ┌───────────┐  ┌─────────────┐ ┌──────────┐ ┌─────────────┐  │
│ │ Task card│  │ Task card │  │ Task card   │ │Task card │ │ Task card   │  │
│ └──────────┘  └───────────┘  └─────────────┘ └──────────┘ └─────────────┘  │
│                                                                             │
│ [Agents ◀] left panel collapsed                    [Feed] [Chat] contextual │
└─────────────────────────────────────────────────────────────────────────────┘
```

Rules:

- Kanban owns the main width.
- Agent, Feed, and Chat panels collapse independently and close automatically
  below the agreed breakpoint.
- Failed/Canceled lanes are optional.
- lane headers show count, WIP warning, and oldest age.
- empty lanes remain discoverable but compact.

## Task card

```text
┌──────────────────────────────────────────┐
│ SFRL-104                      P1 · HIGH   │
│ Implement Convex GraphStore adapter      │
│                                          │
│ WO  Graph Storage Foundation             │
│ MIS Production Memory and GraphRAG       │
│                                          │
│ ● In Progress        Next: finish tests  │
│ Agent Memory Engineer    Due tomorrow    │
│ Run 2 · Retry 1           In state 3h    │
│ Evidence 3/4 · 1 missing   $1.84         │
│ ⛓ 2 deps                   [Open] [Move] │
└──────────────────────────────────────────┘
```

Blocked variant:

```text
┌──────────────────────────────────────────┐
│ SFRL-105                      P1 · HIGH   │
│ Verify migration rollback                │
│ WO  Graph Storage Foundation             │
│ ⚠ Blocked 1d 4h                          │
│ Reason: waiting for schema review        │
│ Unblock owner: Platform Reviewer          │
│ Impact: Work Order acceptance blocked    │
│                              [Open] [⋯]   │
└──────────────────────────────────────────┘
```

Review variant:

```text
┌──────────────────────────────────────────┐
│ SFRL-106                      P2 · MEDIUM │
│ Validate GraphStore adapter              │
│ WO  Graph Storage Foundation             │
│ ◉ Review · 6h of 8h SLA                  │
│ Reviewer: Evidence Reviewer              │
│ Run 2 · Evidence 4/4 · 2 findings        │
│ Next: independent validation             │
│                     [Evidence] [Review]   │
└──────────────────────────────────────────┘
```

## Task details

```text
Goal / Mission / Work Order / SFRL-104                           [Close]
Implement Convex GraphStore adapter                 In Progress · P1

[Overview] [Execution] [Dependencies] [Evidence] [Review] [Governance] [History]

OVERVIEW
Outcome contribution        Agent              Due / age
Adapter passes contract     Memory Engineer    Tomorrow / 3h in state

Parent Work Order           Parent Mission     Current Attempt
Graph Storage Foundation    Production Memory  Run 2 · retry 1 · Running

Required next action
Complete type-safe query adapter and run the contract suite.

Acceptance contribution
[graph-read-contract] [workspace-isolation] [rollback]
```

Execution tab:

```text
Current Attempt — Run 2                                       Running
Started 10:21 · model · worktree · $0.84 · 4m 12s
[Inspect logs] [Pause] [Cancel safely]

Steps
✓ Inspect repository
✓ Add provider
● Run unit tests
○ Browser verification
○ Handoff

Attempt history
Run 1  Failed  Typecheck error  8m  $1.00  [Inspect]
Run 2  Running Current                           [Inspect]
```

## Work Order details

```text
Mission / Work Orders / WO-027
Graph Storage Foundation                  IN PROGRESS · HIGH
Deliver a provider-neutral GraphStore with a production Convex adapter.

[Overview] [Acceptance] [Tasks 8] [Runs 3] [Evidence] [Governance] [History]

Execution progress                    Acceptance readiness
████████░░  8 of 10 Tasks Done        ███████░░░ 3 of 4 criteria verified
2 blocked · 1 review · 1 overdue      Not eligible: isolation criterion failed

Required human action
Assign an independent verifier for workspace isolation.

Child Tasks
ID        Task                         State        Agent       Attempt   Due
SFRL-104  Implement adapter            In Progress  Memory Eng  Run 2     Tue
SFRL-105  Verify rollback              Blocked      Reviewer    —         Tue
SFRL-106  Independent validation       Review       Reviewer    Run 1     Wed

[+ Create Task] [Generate Tasks from plan]
```

## Task generation preview

```text
Generate Tasks — Graph Storage Foundation
Source: Approved plan revision 3                         [Regenerate]

☑ 1. Define GraphStore contract              READ-ONLY / DESIGN
   Agent: Architecture Specialist · P1 · Due +1d
   Contributes: API-contract

☑ 2. Implement Convex provider               MUTATING
   Agent: Memory Engineer · P1 · depends on 1 · Due +3d
   Artifacts: code, tests · Contributes: graph-read, graph-write

☑ 3. Validate workspace isolation            READ-ONLY / INDEPENDENT
   Agent: Evidence Reviewer · P1 · depends on 2 · Due +4d
   Evidence: test receipt · Contributes: workspace-isolation

[+ Add Task]  [Edit selected]  [Remove]  [Cancel]  [Create 3 Tasks]
```

Confirmation states the Work Order, Mission, plan revision, and idempotency
result. Removed suggestions stay in the generation event but do not become
Tasks.

## Review queue

```text
Tasks / Review queue
5 waiting · 2 approaching SLA · 1 overdue

Task       Outcome              WO / Mission       Reviewer     Age/SLA  Evidence  Action
SFRL-106   Validate adapter     Graph Storage       Evidence R   6h/8h    4/4       Review
SFRL-117   Verify rollback      Migration Safety    Unassigned   9h/8h    2/3       Assign
SFRL-121   Approve report       Research Cycle      Operator     1h/24h   5/5       Review

Selected review
Submission summary · current Run · evidence digest · findings history
[Open evidence] [Approve Task] [Request changes] [Reassign] [Escalate]
```

Request changes opens a reason/findings form; reason is required. Approval is
hidden/disabled when authority or independent-review rules fail, with an
explanation.

## Blocked queue

```text
Tasks / Blocked
6 blocked · 2 overdue escalation · 3 Work Orders affected

Task       Reason/type       Unblock owner     Blocked   Impact          Action
SFRL-105   Schema review     Platform Review   1d 4h     WO acceptance   Open
SFRL-130   Capacity          Squad Lead        4h        Mission delay   Reassign
SFRL-144   External API      Operator          2d 1h     3 downstream    Escalate

Selected blocker
Required action · linked blocking Task · downstream Tasks · escalation history
[Resolve] [Replace dependency] [Request waiver] [Escalate]
```

## Table view

```text
☐ ID       Task / required action       State       Work Order      Mission
           Agent / reviewer             Age / due   Run / retries   Evidence
──────────────────────────────────────────────────────────────────────────────
☐ 104      Implement adapter            Executing   Graph Storage   Memory
           Memory Engineer              3h / Tue    Run 2 / 1       3/4
☐ 105      Review schema to unblock      Blocked     Graph Storage   Memory
           Platform Reviewer            1d / Tue    —               1/3
```

Table and board share the same query, selection, URL, permissions, and saved
view. Bulk actions appear only after selection and show mixed-state eligibility.

## Swimlane by Work Order

```text
Graph Storage Foundation          8/10 Tasks · criteria 3/4 · HIGH
  Ready 2       In Progress 3       Review 1       Blocked 1       Done 3
  [cards...]    [cards...]          [card]         [card]          [cards...]

Memory Retrieval                  4/6 Tasks · criteria 1/3 · MEDIUM
  Ready 1       In Progress 1       Review 0       Blocked 0       Done 2
  [card]        [card]                                             [cards]

Ungoverned Inbox                  3 Tasks · cannot dispatch mutating work
  Inbox 3
  [cards...]
```

Work Order header links to contract detail and keeps execution versus
acceptance metrics separate.

## Swimlane by Mission

```text
Production Memory and GraphRAG
Mission: IN PROGRESS · 3/4 Work Orders accepted · assertions 5/6

  Graph Storage Foundation        [Task cards grouped by status]
  Memory Retrieval                [Task cards grouped by status]
  Independent Validation          [Task cards grouped by status]

Continuous Factory Research
Mission: BLOCKED · required action: approve plan revision

  Research Cycle 7                [Task cards grouped by status]
```

Mission headers do not use Task count as acceptance. They show Work Order and
assertion rollups.

## Responsive behavior

### 1200 px and wider

- left navigation visible;
- Agents collapsed by default unless pinned;
- Chat/Feed contextual overlay or resizable pane;
- at least three full Task lanes visible.

### 768–1199 px

- navigation compact;
- side panels overlay, never permanently consume board width;
- two lanes or table view;
- Task detail full-height sheet.

### 320–767 px / 200% zoom

- table/list is the default readable mode;
- lane picker replaces horizontal nine-lane scan;
- Task detail is a full-screen route/sheet;
- all transitions use named Move actions;
- no drag-only workflow.

## Interaction and accessibility notes

- one H1 per route;
- filter result count uses a polite live region;
- successful/failed moves are announced;
- card container is not an extra interactive control around nested buttons;
- every agent filter has a text name and optional avatar;
- visible focus and focus restoration after dialogs/sheets;
- Escape closes overlays without losing board query;
- state and risk always include text;
- keyboard Move offers the same allowed destinations as drag;
- reduced motion disables nonessential card animation;
- errors are associated with fields and focus the first invalid input.
