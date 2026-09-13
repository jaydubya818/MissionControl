# Corrective WorkOrder queue

This queue turns first-pilot findings into bounded, factory-executable work. Items are proposals until the Product Owner approves their exact WorkOrder revisions or creation.

## Relay repository outer-scope proposal

The shared `relay-app` code scope must be a safe superset of later approved WorkOrder budgets. Expanding it does not by itself authorize a Factory Attempt; every Attempt remains restricted by its exact WorkOrder change budget. This proposal still requires explicit Product Owner approval because it adds infrastructure, migration, script, and test surfaces.

Proposed additional includes:

```text
.env.example
Dockerfile
components.json
db/**
docker/**
docker-compose.yml
drizzle/**
drizzle.config.ts
e2e/**
instrumentation.ts
middleware.ts
migrations/**
prisma/**
prisma.config.ts
scripts/**
tailwind.config.js
tailwind.config.ts
tests/**
```

Proposed additional excludes:

```text
.env
.env.local
.env.*.local
.github/workflows/**
.mission-control/**
coverage/**
docs/RELAY-V1-SPEC.md
playwright-report/**
test-results/**
```

Already reconciled for the explicitly approved foundation: `pnpm-workspace.yaml` is included and `package-lock.json` is excluded.

## MC-FIX-001 Canonical Factory Task Progress and WorkOrder-scoped Kanban

### Desired outcome

Mission Control exposes one tenant-scoped delivery projection from WorkOrder to current Attempt chain to canonical Task. A filtered Tasks URL shows only the selected WorkOrder, real Factory identity and progress, current recovery actions, and clearly separated immutable history.

### Scope

- Use the existing `tasks.listByWorkOrder` query when the URL contains `workOrder`; fail closed on invalid or cross-workspace IDs and show a filter banner plus Clear action.
- Derive the primary Task presentation from the current WorkOrder revision and current source/verifier Attempt chain. Keep persisted `task.status` as secondary audit state.
- Add an append-only audited binding for historical taskless Attempts. Preview eligibility and conflicts; require explicit HUMAN Task selection; never mutate historical Attempt, manifest, receipt, evidence, or candidate lineage.
- Allow a reconciled taskless source to produce a new directly Task-bound retry while preserving and labeling the original taskless fact.
- Project Factory Version, executor adapter/version, host/lease owner, and current Attempt as execution identity. Do not create fake legacy `agents` records.
- Make the live current-revision Attempt the primary WorkOrder review content. Put stale revisions and superseded recovery actions under History.
- Include pending WorkOrder revisions in approval counters and operator-attention queues. Rank a pending revision approval ahead of stale-evidence recovery and show the exact pending revision in readiness summaries.
- When a WorkOrder revision changes its objective or revision-bound authority, preserve prior Tasks as immutable history and materialize or explicitly roll over current-revision execution Tasks with successor links and visible revision badges.

### Acceptance criteria

1. A valid `/v2/tasks?...&workOrder=<id>` renders only Tasks with that exact WorkOrder ID, shows the WorkOrder title and count, and preserves scope across refresh, back, and forward.
2. Invalid, missing, or cross-workspace WorkOrder IDs never fall back to an unfiltered board.
3. One pure policy projects active implementation as In Progress, active verification as Review, current-chain failure as Failed, WorkOrder blocker as Blocked, acceptance as Done, and actual current approval gates only as Needs Approval.
4. Historical reconciliation is authorized, audited, idempotent, conflict-checked, and append-only. Ambiguous mappings require explicit selection.
5. A reconciled source can be retried into a new direct Task-bound Attempt; cross-Task, cross-WorkOrder, stale-revision, or conflicting recovery fails closed.
6. A claimed Factory Attempt supplies valid execution ownership without a legacy agent row. Cards show Factory Version and executor/host identity.
7. A live replacement Attempt always outranks a stale verifier recovery card. Old failures remain inspectable in History.
8. A pending WorkOrder revision increments Awaiting approval, makes `Approve revision rN` the primary next action, and is visible from the queue, readiness, and detail views without implying that it is already applied.
9. Applying a material WorkOrder revision never strands its execution on stale Child Task authority: prior Tasks remain inspectable, current replacements are linked to their predecessors, and only current-revision Tasks are schedulable.
10. Unit, contract, typecheck, production-build, and Playwright evidence covers filtered board, active Factory Task, reconciled history, revision rollover, current-attempt hierarchy, approval counters, error states, request/console errors, and zero critical accessibility violations.

### Likely implementation surface

- `apps/mission-control-ui/src/Kanban.tsx`
- `apps/mission-control-ui/src/sections/OpsSection.tsx`
- `apps/mission-control-ui/src/controlPlane/WorkOrdersView.tsx`
- `convex/tasks.ts`
- `convex/workOrders.ts`
- `convex/lib/taskProjection.ts`
- `convex/lib/taskAttemptScheduler.ts`
- `convex/schema.ts`
- new pure Task/Attempt lineage and current-attempt model modules plus focused unit and browser tests

### Out of scope

Parallel child-Task scheduling, new concurrency semantics, rewriting immutable lineage, general Task state-machine redesign, and Relay product changes.

## MC-FIX-002 Durable harness process and cache isolation

### Desired outcome

A certified local harness Attempt terminates promptly and truthfully when its owned executor exits, and its behavior is reproducible across desktop-agent upgrades because the worker does not consume mutable desktop caches or plugin configuration.

### Scope

- Treat the owned child process `exit` event as authoritative and allow only a short bounded interval to drain stdout/stderr before finalization.
- Terminate or fence remaining members of the owned process group after the child exits; never renew an Attempt lease indefinitely when no owned executor exists.
- Preserve bounded stdout/stderr, exit status, signal, timeout, cancellation, process-observer, and redaction behavior.
- Give each certified harness/runtime-artifact version a private runtime home. Import only the minimum credential material through a reviewed mechanism with restrictive permissions and guaranteed cleanup.
- Validate model-cache compatibility during host/readiness assessment. An incompatible cache must block claim with an actionable error rather than fail inside a paid Attempt.
- Expose `executor exited; finalizing`, cache-compatibility failure, and recovery eligibility in the run inspector.

### Acceptance criteria

1. A fixture whose child exits while a descendant retains stdout/stderr reaches a terminal adapter result inside the bounded drain interval.
2. Cancellation and timeout terminate the exact owned process group and call the process observer once.
3. Partial output remains bounded and no credential-bearing environment variable is inherited.
4. A legacy certified CLI can run against its private compatible cache while a newer desktop cache exists; the desktop cache is never modified.
5. Missing or incompatible private cache/auth material produces a readiness failure before Attempt claim with a recovery action.
6. Restart recovery preserves the durable worktree and creates one auditable retry lineage without accepting partial uncommitted work.

### Likely implementation surface

- `apps/orchestration-server/src/codexExecutorAdapter.ts`
- `apps/orchestration-server/src/factoryHostReporter.ts`
- `apps/orchestration-server/src/factoryAttemptWorker.ts`
- focused executor lifecycle, readiness, and restart-recovery tests
- run-inspector status copy in `apps/mission-control-ui/src/controlPlane/`

### Out of scope

Changing the certified Codex runtime artifact, weakening executable-digest checks, exposing shared desktop credentials, accepting partial Relay output, or altering WO-001 revision 4.

## RELAY-WO-015 Browser/Computer Observer + Runtime Presence

### Dependencies

WO-004, WO-005, WO-007, and WO-008.

### Desired outcome

Relay owns the live Browser/Computer observer experience with one controller, read-only observers, visible presence and resource-lock state, supervised handoff, reconnect behavior, and durable evidence.

### Browser-verifiable acceptance criteria

1. One controller and two observers can join; observer controls are absent or disabled.
2. A second control acquisition is denied with the current holder, expiry, and a request-handoff action.
3. Approved supervised handoff transfers control exactly once and records Activity, Audit, and receipt evidence.
4. Disconnect and reconnect preserve role and clearly mark stale or unavailable frames.
5. Keyboard navigation, accessible status announcements, and desktop/tablet target viewports pass.
6. Credentials, authorization headers, and secret-bearing page data never appear in UI evidence.
