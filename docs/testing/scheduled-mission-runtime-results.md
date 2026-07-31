# Scheduled mission runtime correctness results

Date: 2026-07-31

Browser: agent-browser Chromium

Runtime: local Convex at `http://127.0.0.1:3210`

UI: `http://localhost:5199`

Branch: `codex/runtime-correctness-pr5`

## Result

PASS for the bounded scheduled mission-prompt contract.

An enabled mission-prompt job without a configured workspace mission now stops
before dispatch, records a reasoned skip, advances its next evaluation, and does
not claim a successful run. Direct operator use of the mission suggestion action
remains strict and continues to communicate that a mission statement is required.

## Reproduction and classification

### Scheduled mission prompt

- **Status:** Confirmed bug, medium severity.
- **Actual before:** `mission:reversePrompt` threw `No mission statement set`
  every schedule interval. The scheduler had already updated `lastRun` and written
  `SCHEDULED_JOB_EXECUTED`.
- **Observed before:** repeated local Convex failures at 12:11:39, 12:16:39,
  12:22:39, and 12:27:39 PDT.
- **Expected:** a missing mission is a known unmet precondition, not an unhandled
  action failure or successful execution.
- **Root cause:** `scheduledJobs.executeDue` enqueued the action and recorded
  execution without checking the workspace tenant's `missionStatement`.

### Task ID supplied as project ID

- **Status:** Cannot reproduce on a clean current-main reload; classified as an
  environmental stale-client/HMR condition.
- **Evidence:** an old browser connection sent task-table ID
  `wh70nyb395gnhacw3yh8m5rjp98bj3p2` to both `modelRoutingPolicies:getActive`
  and `workflowRuns:list`. A read-only `tasks:get` returned no current record for
  that ID. Current workspace selection accepts only IDs present in the accessible
  project list, and its invalid-ID tests pass.
- **Decision:** keep strict `v.id("projects")` validators. Weakening server
  validation would hide a client-scope error and reduce tenant safety.

### Client/backend version skew

- **Status:** Environmental finding, not a regression in this branch.
- **Evidence:** at 12:32:57 PDT an already-open tab sent a `complexity` field to
  `modelRoutingPolicies:simulate`; current `main`'s caller does not send that field.
  A new agent-browser session against this branch produced no page errors.
- **Recommendation:** add a bounded client/schema version handshake and a clear
  reload-required banner in the next Loop Engineering cycle. This is preferable
  to accepting unknown query fields.

## Implementation

- Added a small mission-readiness policy that rejects missing, empty, or
  whitespace-only mission statements.
- Added scheduler preflight for both **Run now** and due-job execution.
- A due unconfigured job writes `SCHEDULED_JOB_SKIPPED` with a reason, advances
  `nextRun`, leaves `lastRun` unchanged, and does not enqueue the action.
- Non-mission scheduled jobs are unaffected.

## Deterministic runtime evidence

The seeded `Daily CEO brief` job (`vs7at82jz4rth2zrnmdzn6bd158b6x35`) was due
during validation.

- Dry run result: `success=false`, `skipped=true`, reason explicitly requires a
  workspace mission statement.
- Due-job audit event: `j572q3ex58v6vv0rt8bz0jyb498h9he18bjqr5` with action
  `SCHEDULED_JOB_SKIPPED`.
- `lastRun` remained `1785526059368`.
- `nextRun` advanced from `1785526359368` to `1785526719361`.
- No new `mission:reversePrompt` exception followed the due interval.

## Automated and browser evidence

- Focused Vitest: PASS, 18 tests across mission readiness, workspace selection,
  and Mission Control Docs configuration.
- Workspace TypeScript gate: PASS.
- Mission Control UI production build: PASS.
- Fresh Software Factory Research Lab Tasks reload: PASS.
- Task drawer **Why?** policy/compatibility queries: PASS.
- Fresh browser page errors: 0.
- Fresh browser console: Vite connection and React development notice only.
- Full repository suite: intentionally not run under the bounded-cost policy.

Evidence files are under `docs/testing/evidence/runtime-correctness/`:

- `tasks-clean-reload.png`
- `task-why-clean.png`
- `docs-result-page.png`

Two retained diagnostic screenshots (`command-center-route-fallback.png` and
`command-center-audit-nav-attempt.png`) document that direct legacy schedule URLs
fall back to Command Center in the EOS shell. They are not used as scheduler-pass
evidence.

## Publication evidence

- Implementation commit: `6d391b1` (`fix(runtime): guard scheduled mission prompts`)
- Pull request: [#52](https://github.com/jaydubya818/MissionControl/pull/52)
- Substantive CI run: [30659997922](https://github.com/jaydubya818/MissionControl/actions/runs/30659997922)
- CI result: PASS for build, TypeScript, unit, E2E, lint, smoke, and both
  Vercel preview deployments.
- Merge target: canonical `main` branch; no active `master` branch is used.
