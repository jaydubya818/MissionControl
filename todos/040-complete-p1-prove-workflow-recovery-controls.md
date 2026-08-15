---
status: complete
priority: p1
issue_id: "040"
tags: [software-factory, research-lab, workflow, recovery, governance]
dependencies: ["039"]
---

# Prove Workflow Recovery and Workspace Execution Controls

## Problem Statement

The frozen-evidence research graph is bounded and independently verified, but
its legacy workflow executor still polls pending and running rows without an
atomic lease. Timeout and retry state exist, yet execution writes are not
fenced, checkpoints are not a durable recovery cursor, expired ownership is not
recovered, budget and workspace concurrency are not enforced at admission, and
the operator has no true workspace pause, drain, or kill control. Continuous
scheduling must remain disabled until these controls are independently proven.

## Findings

- `workflowRuns.lease` exists in the schema but is unused by the research
  executor and its state mutations accept unfenced writes.
- Step retries are idempotent at Task creation, but `RETRY_STARTED` currently
  records a null checkpoint artifact and cannot prove where recovery resumed.
- The executor's timeout expression always resolves to the workflow-defined
  timeout, so its configured operational ceiling is ineffective.
- Workflow graph concurrency limits runnable steps inside one run, but there is
  no atomic workspace-wide run concurrency admission limit.
- Workspace Pause Squad changes agent presence only; it is not a durable
  workflow scheduler or execution authority control.
- The current local Research Lab correctly runs without an autonomous workflow
  executor. This phase must use explicit manual canaries only.

## Proposed Solutions

### Option 1: Add executor-local locks and process flags

**Pros:** Small code change.

**Cons:** Locks disappear on restart, cannot fence another worker, provide no
shared operator state, and cannot prove stale-run recovery.

**Risk:** High.

### Option 2: Reuse the Factory attempt worker immediately

**Pros:** That path already has strong attempt leasing and signed heartbeats.

**Cons:** Continuous Research uses the canonical Task lifecycle and immutable
workflow snapshots; migrating it now combines two architecture changes and
expands the proof surface.

**Risk:** Medium to high.

### Option 3: Add a durable workflow execution control plane

**Pros:** Makes claim, heartbeat, checkpoints, recovery, budgets, concurrency,
quarantine, and workspace controls atomic in Convex; preserves the current
workflow and Task boundaries; exposes the same governed primitives to operator
UI and executor clients.

**Cons:** Adds a narrow schema and executor protocol extension.

**Risk:** Low.

## Recommended Action

Implement Option 3. Add one explicit per-workspace execution-control record and
audited mode events. Replace polling ownership with an atomic, expiring lease;
fence all executor writes; write a durable cursor checkpoint before retry and
at every step boundary; recover expired leases only from a checkpoint; and
quarantine missing or repeatedly stale recovery state. Enforce daily/per-run
budgets and workspace run concurrency at claim time. Keep scheduling disabled
and prove each behavior with deterministic tests plus a bounded manual Research
Lab canary.

## Execution Semantics

- `NORMAL`: manual claims are permitted within budget and concurrency limits.
- `PAUSED`: no new claim or step may start; an active worker checkpoints and
  releases the run as paused.
- `DRAINING`: no new runs are claimed; already leased runs may reach a terminal
  state, but continuous scheduling remains disabled.
- `KILLED`: no claims; active work receives a kill directive and nonterminal
  workflow runs are canceled with an audit reason.
- `continuousSchedulingEnabled` is independent, false by default, and is not
  enabled in this phase.
- A scheduled claim must be rejected whenever continuous scheduling is false,
  even if the workspace mode is `NORMAL`.

## Agent-Native Architecture Decisions

- **Parity:** Operator controls and executor decisions use the same durable
  Convex control primitives; no UI-only switch exists.
- **Granularity:** Claims, heartbeats, checkpoints, recovery, quarantine, and
  mode changes are separate deterministic operations.
- **Completion:** A canary is complete only when lease, cursor, events, budget,
  and terminal state can be inspected after restart/replay.
- **Partial progress:** The last fenced cursor checkpoint is the only automatic
  stale-run recovery point.
- **Shared state:** The operator UI reads the same reactive control and run state
  the executor enforces.
- **Approval:** These controls grant no discovery, recommendation, repository
  mutation, messaging, or continuous scheduling authority.

## Acceptance Criteria

- [x] Atomic claim permits only one owner per workflow run and enforces a
  workspace-wide concurrent-run limit.
- [x] Fenced run mutations reject missing, mismatched, or expired leases while
  a run is leased.
- [x] Owner-authenticated, lease-fenced heartbeats renew the lease and return deterministic continue,
  pause, drain, kill, budget-stop, or quarantine directives.
- [x] The effective step timeout respects both the workflow deadline and the
  executor's configured operational ceiling.
- [x] A timed-out attempt is superseded before retry; retry creation is
  idempotent and linked to a durable pre-retry cursor checkpoint.
- [x] Every step transition and terminal transition persists a cursor checkpoint
  that survives executor restart.
- [x] Expired ownership resumes only from a valid checkpoint; missing or
  exhausted recovery state quarantines the run instead of replaying blindly.
- [x] Per-run and daily workspace budget admission is atomic and produces a
  clear denial/quarantine reason without starting a Task.
- [x] Workspace pause, drain, and kill controls have audited transitions,
  deterministic executor behavior, and operator-visible state.
- [x] Continuous scheduling remains false and scheduled claims are rejected.
- [x] Backend and executor tests independently cover timeout, retry, checkpoint,
  stale recovery, budget, concurrency, quarantine, pause, drain, kill, fencing,
  and replay.
- [x] A bounded manual Research Lab canary proves the recovery path without
  enabling an autonomous process.
- [x] Convex/UI typechecks, focused tests, repository lint, production build,
  browser verification, and `git diff --check` pass.

## Work Log

### 2026-08-12 - Plan approved and audit completed

**By:** Codex

**Actions:**
- Audited the current workflow executor, workflow run schema and mutations,
  Factory attempt leasing, workspace agent pause behavior, and Phase 3B graph.
- Selected the durable Convex control-plane design and kept timer-driven
  scheduling outside the scope.
- Confirmed all public Convex schema changes and their consumers must ship
  atomically under the repository's runtime-contract discipline.

**Learnings:**
- Per-run graph concurrency is not workspace admission concurrency.
- Task idempotency does not replace lease fencing or a durable recovery cursor.
- Agent presence pause is not a workspace execution kill switch.

## Notes

- Do not enable recurring or continuous scheduling in this todo.
- Do not dispatch the broad `loop-engineering` research graph.
- Do not let recovery state authorize recommendations or repository changes.

### 2026-08-12 - Implemented, drilled, and independently verified

**By:** Codex and deterministic independent verifier

**Actions:**
- Added atomic workflow claims, owner heartbeats, lease fencing, durable cursor
  artifacts, stale recovery, repeated-stale quarantine, budget reservations,
  workspace concurrency admission, and shared pause/drain/kill enforcement.
- Fixed the executor timeout ceiling and linked each retry to its actual
  pre-retry checkpoint artifact.
- Added operator-visible workspace mode, budget, concurrency, lease, and
  scheduling state without exposing a scheduling enable switch.
- Ran four manual canonical canary fixtures in the Research Lab and restored
  the workspace to `NORMAL` after the canary-scoped kill.
- Removed the temporary canary deployment flag after verification.

**Verification:**
- Runtime contract: v17 during the canary; v18 after integration with the
  newer mainline v17 contract.
- Browser verification: the Research Lab operator modal showed scheduling
  `DISABLED`, mode `NORMAL`, a $10 daily budget, a $5 per-run budget, one
  concurrent run, a 60-second lease, and one stale recovery.
- Independent canary result: 4/4 fixtures passed with receipts
  `xh78vthbp76wk3rjyvd8m7v1tn8cb27z`,
  `xh7f1nxyvm5bysht7m4b506ran8cbfhz`,
  `xh702a24cwwxd244a0c9jm03d58cbyzd`, and
  `xh78d3a0razcb05g3401wafrv58caj3b`.
- Scheduled claim result: `continuous-scheduling-disabled`.
- Evidence report:
  `docs/testing/evidence/governed-continuous-learning/2026-08-12-workflow-recovery-controls.md`.

**Operational state:**
- Workspace mode is `NORMAL`.
- `continuousSchedulingEnabled` remains `false`.
- All canary WorkOrders are `DONE` with verification status `PASS`; all canary
  leases and cost reservations are released.
