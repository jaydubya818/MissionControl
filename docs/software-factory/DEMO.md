# Software Factory — Demo Seed Branch (`sf/90-demo-seed`)

## What this branch is

`sf/90-demo-seed` exists for one purpose: populating **every operator-facing
table** with rich, coherent, clearly-tagged demo data so every Mission Control
page can be viewed and demoed. It is:

- **Demo/staging only.** It is rebased on top of the real feature stacks
  (`sf/19-ui-v2-migration` merged with `sf/21a-executor-contract`) and is
  **NEVER merged to `main`**.
- **Non-polluting.** Every seeded row is tagged and removable in one command.
  Functional (non-demo) data is never touched by seed or clear.

The demo narrative is a single product team — **"Atlas Checkout"** — shipping
checkout v2 under project **Software Factory Demo** (slug `sf-demo`,
task prefix `DEMO`, repo `demo/atlas-checkout`).

## Commands

```bash
mc demo seed        # seed (force: reseeds cleanly if already present)
mc demo status      # row counts per table
mc demo clear       # remove ALL demo rows

# equivalents
pnpm run demo:seed
pnpm run demo:clear
npx convex run seedFactoryDemo:run '{"force":true}'
npx convex run seedFactoryDemo:status
npx convex run seedFactoryDemo:clear '{}'
```

`run` is idempotent: if the demo project already exists and `force` is not
set, it is a no-op. With `force: true` it clears then reseeds.

## The seedTag cleanup guarantee

`clear` deletes **exactly and only** seed rows, located by:

| Location strategy | Tables |
|---|---|
| `projectId` = demo project (`by_project` index) | agents, goals, tasks, taskTransitions, taskEvents, workOrders, workOrderEvents, runs, toolCalls, costEvents, approvals, approvalRecords, contentDrops, alerts, activities, notifications, agentDocuments, agentPerformance, agentPatterns, workflowRuns, qcRuns, qcFindings |
| `repoSlug = "demo/atlas-checkout"` | contextManifests, contextLocks, contextInstallations |
| slug prefix `demo/` | contextPackages (+ their contextPackageVersions) |
| `planTier` prefix `sf-demo/` (table has no metadata field) | quotaSnapshots |
| `updatedBy = "sf-demo-seed"` (only rows the seed created) | featureFlags |

Additionally, every row whose table has a `metadata` field carries
`metadata.seedTag = "sf-demo"`, and all names/slugs/identifiers are prefixed
`demo-`/`DEMO-`/`sf-demo` for visual identification.

Caveat: if a global feature-flag row already existed before seeding, the seed
patches it to `enabled: true` and `clear` leaves it in place (it is not a seed
row). On this branch that is intended — the demo branch demos everything.

## What each page shows after seeding

| Page / area | Demo data |
|---|---|
| Projects | "Software Factory Demo" project (slug `sf-demo`) |
| Agents | 8 agents: `pi-supervisor-demo` (LEAD), `hermes-executor-demo` (ACTIVE, fresh heartbeat), coder/qa/research ACTIVE, `demo-security` QUARANTINED, `demo-docs` PAUSED, `demo-ops` OFFLINE — with budgets and spend |
| Mission / Goals | 1 COMPANY mission ("Ship Atlas Checkout v2") → 2 TEAM goals → 3 AGENT goals, all with progressPct |
| Tasks / Kanban | 25 tasks `DEMO-001…025` across all 9 states (incl. FAILED, BLOCKED, NEEDS_APPROVAL) with work plans, deliverables, transition + event history |
| Work Orders | 9 work orders covering all 9 states, mixed acceptance-criteria verification, correlation chains (executionId/bridgeRunId/hermesSessionId/runId/pullRequestId), CLAIMED / EXECUTION_STATE / ARTIFACT_RECORDED / VERIFICATION_RECORDED event trails |
| Context Registry | 6 `demo/*` packages (DOCUMENTATION ×2, RULES, POLICY, PROMPT_TEMPLATE, WORKFLOW) with published 1.0.0 versions — qualityScore 62–100, impactScore 1.05–1.4 on some, securityStatus PASSED/UNSCANNED/QUARANTINED mix; manifest + lock + installations (INSTALLED/STALE/INCOMPATIBLE) for `demo/atlas-checkout` |
| Runs / Telemetry | 15 runs across claude-sonnet-5 / gpt-5.5 / claude-opus-4.8 with tokens + cost, FAILED and TIMEOUT cases, sessionLogRefs on two; context snapshots (packages + hashes) on four runs' metadata; 10 toolCalls incl. a DENIED RED-tier call; matching costEvents |
| Approvals | 2 pending YELLOW, 1 pending RED dual-control (first decision recorded), 1 APPROVED, 1 DENIED — mirrored into approvalRecords |
| Content / Alerts / Activity | 5 content drops (all statuses), 3 alerts (WARNING/ERROR/CRITICAL), ~50 activities, 6 notifications |
| Agent memory / learning | WORKING_MD docs for two agents, agentPerformance + agentPatterns rows, 3 quotaSnapshots |
| Workflows / QC | 2 workflowRuns (RUNNING + FAILED with runtime/model/worktree compat fields), 2 qcRuns (GREEN pass + RED fail), 5 qcFindings |
| Feature flags | `ui.shell.v2`, `context.registry`, `delivery.workorders`, `executor.pi-bridge` all enabled GLOBAL |

## Notes / deviations

- There is no `missions` table in the schema — the COMPANY-level goal is the
  mission.
- There is no `contextSnapshots` table — snapshots are recorded as
  `metadata.contextSnapshot` (packages array with content hashes) on four demo
  runs.
- `quotaSnapshots` has no metadata or project field, so those rows are tagged
  via the `planTier` prefix `sf-demo/`.
