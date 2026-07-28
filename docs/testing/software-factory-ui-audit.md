---
title: "Software Factory UI Audit"
date: 2026-07-28
commit: 478cac7c24bca636015bc9ba52d397ce403c2b59
branch: codex/software-factory-enhancement-plan
browser: Chromium via agent-browser
---

# Software Factory UI Audit

## Test context

- URL: `http://localhost:5199`
- Workspace: Software Factory Research Lab
- Workspace ID: `sn71gskbdemgf4z1trt9zdmm5h8bde69`
- Repository: `jaydubya818/MissionControl`
- Shell: EOS v2 demo-development configuration
- Date/time zone: 2026-07-28, America/Los_Angeles
- Method: accessibility-tree semantic locators, direct URLs, real Convex
  mutations only through visible Mission UI, screenshots, console/page-error
  logs, network request inspection, and a DevTools trace.
- Cleanup: nine requested DRAFT Missions intentionally retained; no disposable
  Task/Memory was created and no important record was changed.

## Executive result

**No-Go for claiming the full governed Mission lifecycle works end to end.**

The application loads, workspace scoping changes live metrics, WorkOrders and
Tasks contain real scoped records, nine Mission DRAFTs were created through the
UI and persisted, and focused governance/model tests pass.

Two critical Mission UI failures were reproduced:

1. `DRAFT` cards say “In progress.”
2. Clicking a Mission or opening `/v2/mission-detail?...&mission=<id>` returns
   to `/v2/missions`; the live detail view is unreachable.

The UI also cannot author/edit the complete Mission draft, propose a plan,
author assertions, reject/revise/approve a plan, or materialize its WorkOrders.

## Passed workflows

| Workflow | Result | Evidence |
| --- | --- | --- |
| Load local v2 application | Pass | HTTP 200 and rendered shell |
| Select Research Lab | Pass | URL/workspace selector use `sn71...` |
| Workspace-scoped Command Center | Pass | Research Lab showed 7 WorkOrders, 2 agents, 0 graph packages |
| Open WorkOrders | Pass | 7 scoped records, filters and governed actions |
| Open Tasks | Pass | 84 scoped Tasks and controls |
| Open Approvals | Pass | Scoped empty PENDING view |
| Open Memory and Graph | Pass | Scoped zero counts and explicit empty graph |
| Mission empty state | Pass | “Define your first Mission” |
| Required Mission fields | Pass | Empty title/objective submission blocked |
| Create nine Mission DRAFTs through UI | Pass | IDs below; zero WorkOrders/contracts |
| Draft persistence | Pass | Reloaded portfolio contains all nine |
| Empty Chat send | Pass | Send disabled |
| Console/page errors on sampled pages | Pass | No page errors or error-level console entries |
| Sample network requests | Pass | Observed localhost module requests returned 200 |

## Failed workflows

| Failure | Reproduction | Severity | Recommended owner |
| --- | --- | --- | --- |
| DRAFT health says “In progress” | Open Missions after creating any draft | P0 | Delivery Control Plane |
| Mission card does not open detail | Click any Mission card; URL remains portfolio | P0 | Shell + Mission UI |
| Direct Mission detail is rewritten | Open `/v2/mission-detail?workspace=...&mission=...`; final URL is `/v2/missions?...&mission=...` | P0 | Shell routing |
| Complete draft cannot be authored | Define dialog has only Title, Objective, Stop condition | P0 | Mission UI |
| Existing draft cannot be edited | Portfolio/detail has no edit flow | P0 | Mission UI |
| Plan/assertion/blueprint creation unavailable | Mission detail unreachable; no authoring controls | P0 | Mission lifecycle |
| Plan rejection/revision/approval unavailable | No UI journey | P0 | Mission + Decisions |
| WorkOrder release from plan unavailable | Backend blueprint exists but no UI/server materialization journey | P0 | Mission + WorkOrders |
| Live WorkOrders exposes “Seed demo” | Open WorkOrders in Research Lab | P0 | WorkOrders |
| Memory graph is empty and nested | Memory → Knowledge graph → Memory → Graph | P1 | Knowledge Platform |
| Tasks defaults to dense board at 84 records | Open Tasks | P1 | Operator Experience |

## Mission IDs created

All remain DRAFT and undispatched:

- `gs7h9xj72fd5msr6b9r4bqdqz18bcyv9`
- `gs7qr791rj4rq91xedfa7xbwdx8bd8ha`
- `gs7g4215qyeka9njttxdcsd48n8bc9yn`
- `gs7tnxvr0xnd9r0ggerzq162898bdr4w`
- `gs7s292kk2s1q7g9rzmch64msh8bcqjs`
- `gs7sjdjw9083akes0zq00s20hx8bdrbg`
- `gs7wra7jtmsvg0trsqzcpc63fn8bdrhq`
- `gs7sxd9snqya0v0yggp0c9ns298bdrd9`
- `gs7jkmzhhhfhp2gj4pc1gggych8bd0x9`

## Named-surface assessment

Codes:

- Evidence: **B** browser sampled, **C** code/repository assessed, **R** prior
  repository E2E report.
- Data: **L** live, **P** partial/mixed, **D** demo, **U** unproven.
- Scope: **W** workspace, **G** global, **A** admin, `?` unproven.
- CRUD: available UI actions; `—` means absent/not applicable.
- States: loading/empty/error/success coverage summarized as
  `L/E/R/S`; missing letters indicate a gap.
- Tests: U unit/component, I integration, B browser, `—` no located focused
  test.

| Surface | Ev | Load | Data/scope | CRUD | States | Auth/audit | Refresh/URL/nav | Search/filter/metrics/relations | Duplicate/shape | Tests | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Goals | C | Preview | P/W | R, limited C/U | L/E/S | Unproven | Deep link unproven | Relations incomplete | Strategic page | — | ENHANCE |
| Missions | B/C | Yes | L/W | C only | L/E/R/S | Events; auth weak | Refresh pass; detail URL fail | No search/filter; counts real; relations absent in DRAFT | Portfolio page | governance U; no view B | P0 ENHANCE |
| Mission DAG | C/R | Preview | P/W | R | L/E/S | Run audit exists | Unproven | Execution graph proven; plan graph absent | Move to Mission/Run tab | workflow I/B prior | MOVE/RENAME |
| WorkOrders | B/C/R | Yes | L/W | C/U/governed actions | L/E/R/S | Strong audit; role enforcement incomplete | URL/refresh broadly works | Many filters; real counts; Mission links incomplete | Dense master-detail | U/I/B prior | ENHANCE |
| Tasks | B/C/R | Yes | L/W | C/U/transition | L/E/R/S | Transition audit; actor auth partial | URL/refresh prior pass | Search/filter/saved views; 84 count; relationship ambiguity | Table default + optional board | I/B prior | ENHANCE |
| Code Pipeline | C | Preview | P/W | Mixed | L/E/S | Mixed | Unproven | Metrics/relations fragmented | Duplicate pipeline domain | — | CONSOLIDATE |
| QC Dashboard | C | Preview | P/W | C/R mixed | Mixed | TODO tenant/policy | Unproven | QC metrics fragmented | Become Quality tabs | partial | CONSOLIDATE |
| Agent Registry | C/R | Yes | L/W | C/U/lifecycle | L/E/R/S | Lifecycle audit; identity gap | Scoped route | Filter/metrics; identity relation incomplete | Keep page | tests/prior B | ENHANCE |
| Identity Directory | C | Yes | L/W | Mixed | L/E/S | Core purpose; membership incomplete | Deep link | Empty workspace concern; agent relation incomplete | Settings page | — | P0 ENHANCE |
| Skills/Context | C/R | Yes + previews | L global + P/W | catalog/install/eval mixed | Mixed | Lifecycle evidence exists | Multiple routes | Search/filter varies; duplicated subpages | One Context Registry | U/prior B | CONSOLIDATE |
| Content Pipeline | C | Labs/legacy | P/? | Mixed | Mixed | Unproven | Unproven | Overlaps code pipeline | Typed pipeline definition | — | CONSOLIDATE |
| Calendar | C | Legacy/preview | P/? | Mixed | Mixed | Unproven | Unproven | Schedule relationship unclear | Automation tab | — | CONSOLIDATE |
| Schedule(s) | C | Multiple routes | P/W | C/U mixed | Mixed | Partial | Unproven | Missed-run/incidents incomplete | One Automation page | partial | CONSOLIDATE |
| Audit | C/R | Yes | L/W | R | L/E/R/S | Core audit | Scoped URL | Entity correlation partial | Decisions/Audit tab | prior B | CONSOLIDATE |
| Telemetry | C | Yes | L/W | R | Mixed | Data audit only | Scoped route | Correlation/incident workflow partial | Incidents detail/tab | partial | ENHANCE |
| System/Database | C | Preview | L/A | high-power R/U | Mixed | Role gate absent | Route | Search/data metrics; broad | Admin Developer Tool | — | MOVE |
| Memory | B/C | Yes | P/W | C/R mixed | L/E/S | Memory decisions incomplete | Refresh route works | Zero counts; nested tabs; provenance incomplete | Rebuild one Memory IA | memory U + graph U | REBUILD |
| Knowledge Graph | B/C | Yes/empty | P/W | import/R | E/S | Import audit partial | Nested URL state weak | Neighborhood query; no retrieval explanation | Memory Graph tab | 4 U pass | ENHANCE |
| Chat | B/C/R | Dock loads | P/W | C/R | L/E/R/S | Linked work audit partial | History prior pass | Empty blocked; work relation prior proven | Dock plus history, not separate core pages | prior B | ENHANCE |
| Create Task | B/C/R | Yes | L/W | C | R/S | Create audit | Modal state | PRD provenance prior proven | Prefer WorkOrder-derived creation | I/B prior | ENHANCE |
| Search | B/C | Opens | P/W | R | Mixed | N/A | URL unproven | Cross-entity relevance/actions unproven | One global scoped search | — | ENHANCE |
| Docs | C | Yes | L/G | R | L/E/S | Global/read-only | Route | Search/version limited | Keep Global page | U | KEEP |
| Meetings | C | Labs/legacy | U/? | Mixed | Mixed | Unproven | Unproven | Durable work links unclear | Contextual/Labs | package tests | MOVE |
| Telegraph | C | Labs/legacy | U/? | Mixed | Mixed | Unproven | Unproven | Notification/work relation unclear | Contextual/Labs | package tests | MOVE |
| Approvals | B/C/R | Yes | L/W | decide/cancel | L/E/R/S | Strong records; Mission/role gap | Scoped route | Status filter; entity types fragmented | One Decisions center | I/B prior | CONSOLIDATE |
| Incidents | C | Telemetry-backed | P/W | partial | Mixed | Partial | Route | Action/owner/recovery incomplete | Operations page | — | ENHANCE |
| Model routing | C/R | Yes | L/W | C/U/simulate | L/E/R/S | Decision capture | Scoped route | Metrics/outcome feedback partial | Settings page | U/I | ENHANCE |
| Command Center | B/C | Yes | L/W + labeled demo | action shortcuts | L/E/R/S | Governed destinations | Refresh/workspace pass | Real scoped counts, confidence labels; release gate not enforced | Keep page | U/B prior | ENHANCE |

## Existing test results

Focused, cost-conscious verification run from the clean planning worktree:

```text
Mission governance                         7 passed
WorkOrder governance                      10 passed
WorkOrder dispatch                        18 passed
Shell route synchronization                2 passed
Route capability filtering                 5 passed
WorkOrder view models/lifecycle             8 passed
Knowledge Graph panel                       4 passed
Total                                      54 passed
```

The full repository suite was intentionally not run. Existing
`docs/testing/software-factory-loop-engineering-e2e-report.md` records the prior
critical browser suite, accessibility, PRD import, transitions, review,
evidence, Loop Engineering, and persistence evidence.

## Console, page, and network findings

- Console: Vite connection debug lines and React DevTools development
  information only; no error-level entry observed.
- Page errors: none returned by the browser session.
- Network: sampled `localhost:5199` requests shown by the session returned 200;
  no failed request was observed.
- Convex WebSocket/query traffic was not exported as a full HAR in this pass.
- The Mission routing failure is client state/route synchronization, not a
  visible network or page exception.

## Accessibility findings

Positive sampled behavior:

- Workspace, navigation groups, main actions, dialog fields, and tabs expose
  semantic roles/names.
- Empty Chat Send is disabled.
- Mission required-field failure blocks submission.

Gaps:

- The sampled invalid Mission submission did not expose its alert in the
  interactive-only snapshot; verify association and live-region behavior.
- Emoji-only Task filters (`🔎`, `🧪`) need durable visible and accessible
  names.
- Dense board and master-detail layouts need narrow/zoom/keyboard validation.
- State meaning must not rely on color; DRAFT currently has incorrect text.
- A full axe scan was not rerun during this planning audit; prior critical
  accessibility evidence remains the baseline, not proof for the new Mission
  UI.

## Screenshots and trace

- `docs/testing/evidence/software-factory-plan/command-center-research-lab.png`
- `docs/testing/evidence/software-factory-plan/mission-portfolio.png`
- `docs/testing/evidence/software-factory-plan/mission-portfolio-nine-drafts.png`
- `docs/testing/evidence/software-factory-plan/mission-draft-detail.png`
- `docs/testing/evidence/software-factory-plan/work-orders-seven-records.png`
- `docs/testing/evidence/software-factory-plan/tasks-84-records.png`
- `docs/testing/evidence/software-factory-plan/memory-graph-empty.png`
- `docs/testing/evidence/software-factory-plan/mission-detail-route-trace.json`

## Mission route reproduction

1. Open `/v2/missions?workspace=sn71g...`.
2. Click any Mission card.
3. Observe that the portfolio remains visible and the final URL is
   `/v2/missions?...`, not a detail route.
4. Directly open
   `/v2/mission-detail?workspace=sn71g...&mission=gs7h9...`.
5. Observe it is rewritten to `/v2/missions?...&mission=gs7h9...` and still
   renders the portfolio.

## Limitations and next audit

- This was a planning audit, not a destructive full regression.
- No disposable Task transition, Memory creation, plan approval, deployment, or
  schedule mutation was attempted.
- Preview/demo flags were source-inventoried but not every route was rendered.
- No full HAR, video, or full axe suite was captured.
- The next audit should be PR 1’s deterministic Mission create/open/edit/
  refresh/back/forward test, followed by PR 2’s reject/revise/approve/release
  test.

