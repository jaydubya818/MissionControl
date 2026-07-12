# External Executor Contract (Epic 18)

Boundary between Mission Control and external execution supervisors. First consumer: the **Pi bridge** (executor type `PI_BRIDGE`), which supervises the Hermes worker. Approved 2026-07-11.

## Authority hierarchy

| Layer | Authority |
|---|---|
| Mission Control | policy, state, approvals, context, verification, trust, cost, audit — **system of record** |
| Pi bridge | execution supervision, state translation, heartbeats, reporting, approval forwarding |
| Hermes | governed software-delivery executor; its internal safety controls are last-line defense only |

**Completion rule:** an executor can never assert `DONE`. `succeeded` maps through `nextStateForRunStatus(COMPLETED, verificationStatus)` — the same rule the internal workflow path uses. `AWAITING_VERIFICATION → DONE` happens only inside `recordVerificationEvidence` when Mission Control derives verification `PASS`/`WAIVED` from acceptance criteria.

## Identities

- `pi-supervisor` — LEAD; claims work, forwards approvals, reports supervision events. Never executes.
- `hermes-executor` — SPECIALIST (ENGINEERING); runs, costs, tool calls, and deliverables are attributed to it.

Both registered idempotently via `agents.register`; heartbeat every **30s** via `agents.heartbeat`. The adapter treats 2 minutes without a successful heartbeat as DEGRADED (local alert); actual quarantine uses the backend-configured stale threshold (`HEARTBEAT_STALE_MINUTES`) and the adapter consumes the backend's health/quarantine result — never hard-codes it.

## Surface (all flag-gated: `executor.pi-bridge`, default off)

| Function | Purpose |
|---|---|
| `workOrdersExecutor.listClaimable` | READY (or lease-expired DISPATCHED) work orders passing the approval gate |
| `workOrdersExecutor.claimForExecutor` | Lease-based claim (default 15 min, renewed on each report) |
| `workOrdersExecutor.reportExecutionEvent` | Bridge state → work-order state via `lib/executorContract.mapBridgeState` |
| `workOrdersExecutor.recordExecutorArtifact` | Deduplicated content drop + `ARTIFACT_RECORDED` audit event |
| `workOrdersExecutor.recordVerificationEvidence` | Per-criterion evidence; MC recomputes verification and derives DONE |
| `runs.start` / `runs.complete` | Execution runs incl. `sessionLogRefs` (path + sha256 + size + optional redacted excerpt — never full logs) |

## State mapping (single source: `convex/lib/executorContract.ts`)

| Bridge state | Work order | Notes |
|---|---|---|
| accepted, starting | DISPATCHED | |
| running, producing_artifacts | IN_PROGRESS | lease renewed |
| succeeded | AWAITING_VERIFICATION → (DONE via verification only) | |
| failed | BLOCKED | blockingIssue = failure summary |
| timed_out | BLOCKED | `executor-timeout` |
| interrupted | BLOCKED | human interrupted |
| cancelled | CANCELED | terminal |

The mapping test (`convex/__tests__/executorContract.test.ts`) iterates `BRIDGE_EXECUTION_STATES` — adding a state without a mapping fails CI. The Pi adapter mirrors this table and tests it the same way.

## Idempotency keys (deterministic, timestamp-free, prefix `pib`)

`pib:claim:<workOrderId>:<attempt>` · `pib:state:<workOrderId>:<bridgeRunId>:<seq>` · `pib:run:<workOrderId>:<bridgeRunId>` · `pib:art:<workOrderId>:<artifactId>` · `pib:verify:<workOrderId>:<criterionId>:<bridgeRunId>`. Replays are absorbed by `by_idempotency` indexes and return the prior result.

## Correlation chain

`workOrders.correlation` accumulates (never erases): `missionId`, `workOrderId`, `taskId`, `executionId`, `runId`, `bridgeRunId`, `hermesSessionId`, `pullRequestId`. Every audit event carries the ids it knows in `metadata`.

## Verification

```bash
mc flags set executor.pi-bridge on
mc flags set delivery.workorders on
mc executor smoke        # runs scripts/fake-executor.mjs — full contract walk
```

## Harvest-only note

`~/projects/Hermes-harness-with-missioncontrol` is **not** an integration path (see `ARCHIVE-hermes-harness.md`). Patterns reused from it in this contract, with attribution: event replay keyed by a stable event id, artifact dedup by artifact id, and budget-envelope thinking. Its standalone JSON control plane is not merged or revived.
