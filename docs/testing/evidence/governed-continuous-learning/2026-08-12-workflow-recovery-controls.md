# Workflow Recovery Control Proof — 2026-08-12

## Scope

This was a bounded manual canary in the Software Factory Research Lab workspace
`sn71gskbdemgf4z1trt9zdmm5h8bde69`. It created no agent Tasks, made no network
request, dispatched no research graph, changed no repository, and enabled no
schedule. Runtime contract version 17 was active during the drill. After the
recovery controls were integrated with the newer mainline v17 contract, the
combined local client and backend contract advanced to version 18.

The temporary canary function was guarded by
`WORKFLOW_RECOVERY_CANARY_ENABLED=true`; that deployment flag was removed after
the independent verifier completed.

## Results

| Control | Durable proof | Result |
| --- | --- | --- |
| Atomic lease | A racing owner was rejected with `run-already-claimed` | PASS |
| Workspace concurrency | A second run was rejected with `workspace-concurrency-exhausted` | PASS |
| Heartbeat and fencing | Matching owner returned `CONTINUE`; expired heartbeat and release were rejected | PASS |
| Timeout and retry | `controlProof` recorded timeout failure, checkpoint artifact `v97evg8kfecc55a6ygm2crshvx8carzs`, retry 1, and a new pending cursor | PASS |
| Checkpoint | Claim, step, retry, pause, drain, budget stop, recovery, and kill boundaries retained `CHECKPOINT` artifacts | PASS |
| Stale recovery | `recovery-canary-lifecycle` and `recovery-canary-quarantine` recorded `STALE_RUN_RECOVERED` from a matching prior cursor | PASS |
| Quarantine | Second stale loss recorded `RUN_QUARANTINED`, code `stale-recovery-limit-exceeded`, count 2 | PASS |
| Budget | A $6 reservation was denied against a $5 run limit; a $5 cost heartbeat returned `BUDGET_STOP` | PASS |
| Pause | Active owner heartbeat returned `PAUSE`, then released at a durable cursor | PASS |
| Drain | Active owner heartbeat returned `DRAIN`; a new claim was rejected with `workspace-draining` | PASS |
| Kill | Canary-scoped workspace kill returned `KILL`, retained a final checkpoint, and canceled the active run | PASS |
| Scheduling gate | A scheduled claim was rejected with `continuous-scheduling-disabled` | PASS |
| Final posture | Workspace restored to `NORMAL`; schedule false; all canary leases and reservations released | PASS |

## Independent receipts

- Lifecycle: `xh78vthbp76wk3rjyvd8m7v1tn8cb27z`
- Concurrency, retry, and kill: `xh7f1nxyvm5bysht7m4b506ran8cbfhz`
- Budget and drain: `xh702a24cwwxd244a0c9jm03d58cbyzd`
- Repeated-stale quarantine: `xh78d3a0razcb05g3401wafrv58caj3b`

All four receipts were created by
`workflow-recovery-independent-verifier-v1`, which inspected only the durable
run, event, artifact, control, lease, cost, and quarantine records after the
execution operations finished.

## Canonical fixtures

- Lifecycle run `recovery-canary-lifecycle` / WorkOrder
  `yh7ewtabxptt23q8rwdwa7pcfx8cagpp`
- Concurrency run `recovery-canary-concurrency` / WorkOrder
  `yh73zdezsd2y8fvv48yaw4hct58cbwyx`
- Budget run `recovery-canary-budget` / WorkOrder
  `yh783yw0bjw444gzbjfzgcj2858cb0hv`
- Quarantine run `recovery-canary-quarantine` / WorkOrder
  `yh7fxpj8n86cwge3w6naw19v1s8cb1nk`

The verifier marked each canary WorkOrder `DONE` with verification status
`PASS`. The runs are terminal evidence fixtures and are not eligible for
redispatch.

## Activation decision

This evidence proves the local operational primitives. It does not authorize a
continuous schedule. A separate activation audit must prove signed scheduled
dispatch, restart behavior, and multi-worker contention before the Product
Owner decides whether to enable one bounded recurring canary.
