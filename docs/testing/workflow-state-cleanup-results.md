# Workflow-state cleanup browser and test results

Date: 2026-07-31  
Browser: Playwright Chromium  
Workspace: Software Factory Research Lab (`sn71gskbdemgf4z1trt9zdmm5h8bde69`)  
Branch: `codex/workflow-state-cleanup-pr3`

## Result

PASS for the bounded PR 3 contract. The browser journeys ran from 11:23 to
11:36 America/Los_Angeles and used only Mission Control UI actions for state
changes.

Evidence entities are retained as audit fixtures:

- Ready/block/recovery Task SFRL-091:
  `wh7a5a5194jeryk0n14svp1fpn8bf880`
- Canonical assignment Task SFRL-089:
  `wh77nty172rgsxhmq0qme9ec6x8bfn6s`
- Review-rejection Task SFRL-064:
  `wh7a1y93y31451bmvdvdyp2w058bdhq8`

Cleanup status: retained intentionally. SFRL-091 ended Ready with a resolved
Policy blocker; SFRL-089 ended Ready after assignment; SFRL-064 ended In
Progress with a retained Changes Requested decision and two findings.

## Acceptance evidence

| Requirement | Evidence | Result |
|---|---|---|
| Canonical Ready | Assigning SFRL-089 through Reassign atomically moved Inbox → Ready | PASS |
| Invalid transition prevention | Mark Ready failed closed until an assignee existed; nine-character blocker reason kept Submit disabled | PASS |
| Structured blocking | Policy type, owner, required action, reason, and timestamp persisted | PASS |
| Structured recovery | Resolved blocker returned to Ready and retained resolution actor, time, and reason | PASS |
| Review rejection | SFRL-064 returned Review → In Progress with required reason and two findings | PASS |
| Audit trail | Timeline retained raw before/after state plus Review and Blocker context | PASS |
| Counts | Inbox decreased and Ready increased immediately; compatibility view reported 22 Ready presentation records | PASS |
| Refresh persistence | Reload while Blocked preserved status and all structured blocker fields | PASS |
| Legacy compatibility | 20 raw Assigned records rendered in the Ready lane without mutation | PASS |
| Dry run | Ready → In Progress reported invalid because the chosen Task lacked a work plan | PASS |
| Approval authority | Existing Review → Done approval check remains unchanged | PASS |
| Runtime errors | Zero browser console errors and zero feature-relevant failed requests | PASS |
| New dialog accessibility | Axe WCAG A/AA scan: 17 rules passed, zero violations | PASS |
| Critical accessibility | Whole Task drawer: zero critical violations | PASS |

The older Task drawer has 24 serious color-contrast findings. They predate this
dialog and are not hidden by this result. A scrollable-region finding discovered
during the run was fixed by making Task detail content keyboard focusable. The
contrast debt should be addressed as a dedicated visual-system cycle because it
spans existing badges, tabs, timestamps, and metadata—not only PR 3 controls.

## Automated and build results

- Convex Task/scheduler/context tests: 56 passed.
- Shared state-machine tests: 52 passed.
- Command Center focused UI tests: 3 passed.
- Total bounded automated assertions: 116 passed.
- Workspace TypeScript gate: PASS.
- Root production build: PASS.
- Diff whitespace check: PASS after documentation finalization.
- Full repository test suite: intentionally not run, following the operator's
  bounded-cost instruction.

## Compatibility dry run

The final read-only report returned `mutatesData: false` and:

| Measure | Count |
|---|---:|
| Total Tasks | 106 |
| Native Ready | 2 |
| Legacy Assigned | 20 |
| Ready presentation | 22 |
| Eligible for automatic migration | 0 |
| Assigned missing assignee | 12 |
| Assigned missing Work Order | 8 |
| Review missing structured context | 34 |
| Blocked missing structured context | 0 |

Decision: no migration is authorized. The next bounded Loop Engineering cycle
should produce a repair proposal for legacy relationships and Review history,
with exact eligibility, idempotency, rollback, and independent verification.

## Evidence files

- `blocked-structured-context.png`
- `assignment-enters-ready.png`
- `resolution-audit-timeline.png`
- `review-rejection-context.png`
- `compatibility-report.png`

All files are under
`docs/testing/evidence/workflow-state-cleanup/`. The passing run generated a
local Playwright trace, but it is not committed because the evidence contract
requires traces on failure and no failure occurred.

## Browser environment finding

The first browser attempt exposed a stale local endpoint: the UI read port 3212
while the active Convex backend used port 3210. This caused valid workspace IDs
to look unavailable. Restarting the demo with a single explicit
`VITE_CONVEX_URL` restored correct workspace selection. This was an environment
configuration mismatch, not a workspace-recovery defect; the server currently
runs at `http://localhost:5199` against `http://127.0.0.1:3210`.

## Publication evidence

- Implementation commit: `82b1167` (`feat(tasks): add truthful workflow states`)
- Pull request: [#50](https://github.com/jaydubya818/MissionControl/pull/50)
- Substantive CI run: [30656367162](https://github.com/jaydubya818/MissionControl/actions/runs/30656367162)
- CI result: PASS for build, TypeScript, unit tests, E2E, lint, smoke, and both
  Vercel preview deployments.
