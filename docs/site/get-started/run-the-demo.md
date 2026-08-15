# Run the demo

This walkthrough uses `pnpm dev:demo` and seeded data (`mc-demo-v2`).

## Start

```bash
pnpm dev:demo
pnpm convex:seed:demo:force
```

Open `http://localhost:5199` — EOS sidebar is enabled by default.

## Verify the server root

Port 5199 can appear healthy while an older worktree-owned Vite process serves
stale modules. If a page reports `Failed to fetch dynamically imported module`,
check which checkout owns the listener:

```bash
lsof -nP -iTCP:5199 -sTCP:LISTEN
lsof -a -p <vite-pid> -d cwd -Fn
```

The supported demo UI process must run from the main Mission Control checkout:

```text
/Users/jaywest/MissionControl/apps/mission-control-ui
```

Stop only the stale UI process, preserve the running Convex backend, and start:

```bash
pnpm run dev:demo:ui
```

Then reload the failed route in a clean browser session. A successful Tasks
smoke test must show the requested workspace, the Tasks heading, board counts,
and no page or console errors. See
`docs/validation/2026-07-28-tasks-demo-server-recovery.md` for the verified
incident record.

## Overview

| Section | Pages to check |
| --- | --- |
| **Overview** | Command Center — approvals, alerts, upcoming jobs |
| **Strategy** | Missions (demo narrative), Objectives (goals hierarchy) |
| **Delivery** | Work Orders, Tasks, Factory Board, Execution, Pipelines |
| **Operations** | Agents, Queue (ATC), Approvals & Audit, Incidents, Cost |
| **Intelligence** | Factory Health, AI Effectiveness, Friction, Recommendations |
| **Knowledge** | Registry Discover (9 skills), Context CDL, Eval Runs, Memory, **Docs** |
| **Harness** | AI Patterns, Architect Mode, Software Factory, Code Review Wizard |

## Registry smoke test

1. Open **Registry Discover** — nine published skills (factory-health, code-review-wizard, TDD, etc.).
2. Open **Installations** — `jaydubya818/MissionControl` install rows (INSTALLED / STALE mix).
3. Open **Eval Runs** — completed and running eval rows with impact deltas.

## Factory smoke test

1. Open **Work Orders** — eight governed orders across READY → AWAITING_APPROVAL states.
2. Open **Factory Board** — active/blocked cards.
3. Open **Harness → Architect Mode** — live merge gates and adoption metrics.

## Factory Memory smoke test

1. Open **Knowledge → Memory → Overview** — all five demo phase gates are on and
   the latest ingestion run is successful.
2. Open **Memory**, search `auth middleware token refresh`, and verify the
   bounded results include source code, ADR-004, INC-12, tests, and WO-42 with
   source revisions.
3. Open **Graph**, resolve `auth-middleware`, and inspect paths to orders-api,
   ADR-004, INC-12, and the end-to-end test. The `similar_to` edge must be
   visibly inferred with confidence.
4. Open **Context** and inspect the frozen verification package, token budget,
   advisory evidence-required checks, observations, evals, and package diff.
5. Open its linked Attempt in **Execution Run Inspector** and confirm the same
   package digest and source revisions appear under **Frozen Factory context**.

## Re-seed

Demo seed is idempotent. Force refresh:

```bash
pnpm convex:seed:demo:force
```

Seed version is stored on the project metadata as `missionControlDemoSeedVersion`.
