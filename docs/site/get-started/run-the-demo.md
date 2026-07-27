# Run the demo

This walkthrough uses `pnpm dev:demo` and seeded data (`mc-demo-v2`).

## Start

```bash
pnpm dev:demo
pnpm convex:seed:demo:force
```

Open `http://localhost:5199` — EOS sidebar is enabled by default.

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

## Re-seed

Demo seed is idempotent. Force refresh:

```bash
pnpm convex:seed:demo:force
```

Seed version is stored on the project metadata as `missionControlDemoSeedVersion`.
