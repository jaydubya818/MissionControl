---
title: Task Kanban and Work Order UI Discovery Results
date: 2026-07-28
result: partial-pass-with-product-gaps
commit_tested: 3252aa0
workspace: Software Factory Research Lab
workspace_id: sn71gskbdemgf4z1trt9zdmm5h8bde69
---

# Task Kanban and Work Order UI Discovery Results

## Test metadata

| Field | Value |
| --- | --- |
| Branch | `codex/task-kanban-workorder-hierarchy` |
| Commit tested | `3252aa0` (planning branch base) |
| Browser | Chromium via `agent-browser` 0.27.0 |
| Local URL | `http://localhost:5180` |
| Requested remote URL | `https://unwearying-floatier-omar.ngrok-free.dev` |
| Workspace | Software Factory Research Lab |
| Test date | 2026-07-28 |
| Data mutation | none |
| Direct database/seed use | none |

The remote ngrok endpoint failed TLS negotiation from this environment with
`ERR_SSL_PROTOCOL_ERROR`. The local UI was started from the isolated worktree
with v2/EOS flags and connected to the configured Convex deployment/workspace.

## Test approach

- selected the workspace through the UI;
- navigated through the v2 sidebar;
- inspected real Research Lab Tasks and Work Orders;
- used semantic accessibility snapshots and named controls;
- did not create, transition, seed, approve, or delete records;
- captured screenshots from the tested UI;
- captured clean-session console and page errors;
- tested refresh/filter persistence without record mutation.

## Workflow results

| Workflow | Result | Evidence/notes |
| --- | --- | --- |
| Open Mission Control | Pass | v2 Command Center rendered |
| Select Research Lab | Pass | workspace URL and selector updated |
| Navigate to Tasks | Pass | Tasks H1 and 84 count rendered |
| Populated Kanban | Pass | nine lanes and real cards rendered |
| Empty state | Partial | Inbox lane empty state rendered; no empty-workspace board was created |
| New Task modal | Pass/Gap | modal operable; Work Order parent and governance mode absent |
| Task assignment visibility | Pass | assigned Research Scout/Evidence Reviewer shown |
| Valid Move options | Pass | Assigned exposed only In Progress, Inbox, Canceled |
| Invalid transition prevention | Pass (UI inventory) | invalid destinations omitted; no mutation performed |
| Task detail | Pass/Gap | Overview/Timeline/Artifacts/Approvals/Cost/Reviews/Why tabs; no parent links |
| Run history | Partial | Timeline exists; selected Task had no rendered timeline entries |
| Review state | Partial | Review lane records visible; actionable SLA/owner context absent on card |
| Approval state | Partial | Needs Approval lane/Approvals tabs exist; no approval mutation performed |
| Blocked state | Partial | Work Order blocked count/detail works; Task blocker structure absent |
| Saved views | Present | save/apply/delete implementation exists; no test view created |
| Filters | Pass/Gap | P1 filter reduced cards from 84 to 0 |
| URL persistence | Fail | filter did not enter URL |
| Refresh persistence | Fail for filters | reload restored 84 cards and inactive P1 |
| Workspace persistence | Pass | workspace query remained after reload |
| Work Orders queue | Pass | eight records; attention/blocked filters and detail |
| Work Order detail | Pass | acceptance, governance, evidence, Runs visible |
| Work Order → child Tasks | Fail/not implemented | no child relationship/list |
| Browser back/forward | Not tested | no relationship routes/query state to validate |
| Pause/Resume Squad | Not mutated | controls visible; out of scope for read-only discovery |

## Key observed UI state

### Tasks

- 84 total;
- 44 “In progress” in header metric;
- 18% completion;
- zero Inbox;
- eight Assigned;
- one In Progress;
- populated Review/Needs Approval/Failed/Done history;
- multiple attempt/retry-labeled Loop Engineering Tasks.

The board is usable at 1920×1200, but the fixed Agents panel and Chat/Feed
surface substantially reduce lane visibility. At the original 1272×633
viewport, the central board showed roughly one full lane plus fragments.

### Work Orders

- eight total;
- zero active by current page metric;
- one blocked;
- two need attention;
- zero awaiting approval;
- zero ready to dispatch.

The selected Work Order showed outcome, risk/state, execution setup, required
attention, acceptance readiness, evidence, and linked execution Runs. It did
not show child Tasks because no canonical relationship exists.

## Screenshots

| Screenshot | Purpose |
| --- | --- |
| `docs/testing/evidence/task-kanban-workorder/tasks-wide.png` | populated board, lanes, cards, side-panel layout |
| `docs/testing/evidence/task-kanban-workorder/tasks-populated-board.png` | narrow viewport board pressure |
| `docs/testing/evidence/task-kanban-workorder/new-task-modal.png` | current Task creation fields |
| `docs/testing/evidence/task-kanban-workorder/task-detail-wide.png` | Task Overview and missing hierarchy |
| `docs/testing/evidence/task-kanban-workorder/task-timeline-run-history.png` | current Timeline surface |
| `docs/testing/evidence/task-kanban-workorder/work-orders-queue.png` | Work Order queue at narrow viewport |
| `docs/testing/evidence/task-kanban-workorder/work-order-detail-wide.png` | Work Order queue/detail and acceptance |

An empty Inbox lane is visible in the populated-board evidence. A completely
empty disposable workspace was not created because the discovery pass avoided
unnecessary persistent data and direct setup.

## Traces

No Playwright trace was produced in this read-only discovery pass. The isolated
UI journey had no browser assertion failure, and the established `agent-browser`
workflow captured screenshots and accessibility snapshots rather than traces.
The later relationship E2E must retain a trace on first retry/failure and link
it from this report.

## Console, page, and network results

### Isolated local session

- console errors: 0;
- page errors: 0;
- failed browser network requests observed through the automation session: 0;
- Vite informational/debug messages only.

The Vite server log recorded one `/gateway/status` proxy `ECONNREFUSED` because
the optional orchestration server on port 4100 was not running. Tasks and Work
Orders use Convex and remained available. A release E2E fixture should either
start the orchestration server or assert the intended degraded Gateway state.

### Existing port 5199 session

The pre-existing development server was hot-reloading from another working
copy. Its historical browser console included dynamic-import failures during
server restarts and an invalid persisted project-ID query. Those were not
reproduced on the isolated port 5180 server and are not attributed to this
planning branch.

### Remote tunnel

- TLS negotiation failed before the application loaded;
- no application network or console assertions were possible against the
  tunnel;
- the tunnel should be restarted/reconfigured before it is used as release
  evidence.

## Automated test results

### First attempt

`pnpm test` stopped in the isolated worktree because local workspace packages
had not been built and `@mission-control/shared` could not be resolved.

### Prepared result

Commands:

```text
pnpm run ci:prepare
pnpm test
```

Result:

- 941 tests passed;
- 0 failed;
- 101 test files passed.

Breakdown:

| Area | Tests |
| --- | ---: |
| UI | 135 |
| Convex | 259 |
| Context tools | 197 |
| Shared | 10 |
| Meetings | 7 |
| Memory | 18 |
| Model router | 8 |
| Policy engine | 92 |
| State machine | 51 |
| Telegraph | 17 |
| Agent runtime | 19 |
| Workflow engine | 62 |
| Coordinator | 28 |
| Context router | 38 |
| **Total** | **941** |

## Accessibility findings

### Pass/strength

- Tasks and Work Orders have H1 headings;
- card actions expose named Open/Move/Drag controls;
- modal fields have accessible labels;
- empty title/comment prevents submission;
- state is communicated with text;
- Move menu provides a non-drag transition mechanism;
- Task detail tabs are named.

### Findings

| Severity | Finding | Recommendation |
| --- | --- | --- |
| High | Agent filters are emoji-only in accessible snapshot | use agent names as accessible and visible text |
| High | Board can be reduced to roughly one lane by persistent side panels | collapse/contextualize panels; test breakpoints |
| Medium | Clickable card container nests action buttons | use one semantic card container with separate buttons |
| Medium | filter result/reset is not announced | add polite live region |
| Medium | query is not URL-addressable | versioned URL codec and history tests |
| Medium | full keyboard drag journey not proven | add keyboard Move E2E and focus tests |
| Medium | no parent breadcrumb on Task detail | add Mission/Work Order links |
| Medium | Review/Blocked cards lack actionable text | show owner, reason, age, SLA/required action |

Automated axe checks already cover critical routes in the repository, but this
discovery did not run a new full axe/zoom/mobile E2E pass. That belongs in PR 2
and later feature acceptance.

## Known limitations

- no disposable Mission → Work Order → Task journey exists yet;
- no records were created because current UI cannot create the required
  relationship;
- no Task transition was mutated in the persistent Research Lab;
- no full empty board was available;
- selected Task Timeline did not contain Runs;
- approval/rejection and Pause/Resume were not mutated;
- drag pointer behavior was not executed; the semantic Move alternative was
  inspected;
- filters support only agent, priority, and type;
- remote tunnel unavailable;
- screenshots are discovery evidence, not final release acceptance evidence.

## Release conclusion

Current Tasks and Work Orders are individually functional but the canonical
end-to-end hierarchy is not shippable. PR 1 must establish Task → Work Order
linkage, derived Mission context, compatibility, and workspace isolation before
the 40-step journey can be implemented honestly.
