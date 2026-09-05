---
title: Factory Worker Runtime Operations and Recovery
status: active
date: 2026-08-15
---

# Factory Worker Runtime Operations and Recovery

## Supported boundary

This runbook covers the existing outbound-polling orchestration worker. It does
not provision remote compute, open inbound ports, enroll internet workers, or
grant merge, deployment, verification-independence, or acceptance authority.

The supported production identity is:

- stable worker ID: `CODEX_WORKER_HOST_ID`;
- ephemeral session ID: generated once at orchestration-server startup;
- generation: incremented server-side when the session ID changes;
- service credential: the existing narrow signed service-command credential;
- Attempt lease: a random fencing ID bound to worker ID, session, and
  generation. It is not a credential.

## Startup

Configure the existing variables documented in
`docs/software-factory/durable-codex-github-pr.md`, including:

```text
CODEX_FACTORY_WORKER_ENABLED=true
CODEX_WORKER_PROJECT_ID=<projects ID>
CODEX_WORKER_REPOSITORY_ID=<workspaceRepositories ID>
CODEX_WORKER_CHECKOUT_ROOT=<absolute clean checkout root>
CODEX_WORKER_HOST_ID=<stable host identity>
CODEX_WORKER_MAX_CONCURRENT_RUNS=1
```

The worker reports its repository, exact default-branch commit, harness and
adapter identity, adapter-effective capability manifest and digest, effective
configuration digest, backend, sandbox capabilities, slots, readiness, and
session before polling.
Registration failure is fail-closed: Attempt execution does not start.

Keep one stable `CODEX_WORKER_HOST_ID` per real worker installation. Do not
reuse one ID concurrently on two machines. Each process restart deliberately
creates a new session and server-derived generation.

## Claim and heartbeat behavior

1. Dispatch freezes the exact base SHA, executor/version, backend, sandbox
   requirements, repository scope, model route, timeout, context, Factory
   Version, quality contract, and verification contract.
2. `attempts.claim` atomically checks the current registration, heartbeat,
   readiness/draining state, repository access, executor, isolation, required
   harness capabilities, exact capability/configuration digests, provider/model,
   sandbox capabilities, backend, and server-counted active leases. Capacity is
   counted across all repositories and sessions for the stable worker ID; the
   reported `currentRuns` value is observational only.
3. A successful claim writes a unique lease ID plus worker ID, session, and
   generation.
4. Renewal extends the lease only for that complete identity. A stale process
   cannot report evidence or authorize publication after expiry, replacement,
   cancellation, or session/generation change. Every hardened mutation also
   re-checks the current server registration in the same transaction.
5. Heartbeats update current lease/registration state. They are not emitted as
   high-volume durable events.

## Local ownership files

The worker stores protected ownership manifests under:

```text
<checkout-root>/.mission-control/worker-state/workspaces/<Attempt-hash>.json
```

The directory is outside the agent-writable worktree. The manifest freezes the
repository, Attempt, worker/session/generation, lease, branch, exact path,
execution-manifest digest, base SHA, optional sandbox ID, executor PID/state,
publication proof, and cleanup result. Files are atomically replaced with mode
`0600`; state directories use mode `0700`; symbolic-link traversal is rejected.
The real `.mission-control/worktrees` directory must resolve exactly beneath
the real checkout root; a symlinked root is rejected before creation, transfer,
or cleanup.

Do not hand-edit these files to force recovery or cleanup. A mismatch is a
preservation signal, not a repair instruction.

## Deterministic reconciliation

| Observed condition | Disposition | Runtime action | Operator action |
| --- | --- | --- | --- |
| Pending Attempt, eligible worker, no lease | `RECOVERABLE` | Acquire a new lease and execute | None |
| Active matching lease and known process | `RECOVERABLE` | Continue and heartbeat | None |
| Operator cancellation | `CANCELLED` | Abort; late writes are fenced | Inspect retained evidence; retry only explicitly |
| Executor exits with known failure | `FAILED` | Terminal report; preserve workspace | Inspect failure and choose retry |
| Lease expires before/without durable publication checkpoint | `LOST` | Close old Attempt; preserve workspace | Create a governed retry/new Attempt lineage |
| Worker process restarts during execution | `LOST` | New session cannot adopt unknown execution | Inspect workspace; retry with new Attempt |
| Clean, terminated, exact publication checkpoint | `RECOVERABLE` | Transfer local ownership to new lease/session; revalidate exact candidate | None unless validation fails |
| Attempt running with no valid ownership | `LOST` | Reconciliation on next eligible worker poll closes it | Confirm retry policy |
| Ownership, process, Git, publication, or cleanliness proof fails | N/A | Cleanup returns `PRESERVED` | Inspect manually; never force automated deletion |

The old Attempt remains immutable. A retry creates normal new Attempt/run
lineage through the existing WorkOrder dispatch/retry path; runtime recovery
does not rewrite prior events, evidence, verification receipts, or traces.

## Cleanup invariant

Automatic cleanup runs only after all of the following are true:

1. the protected manifest exactly matches repository, Attempt, worker,
   session/generation, lease, branch, path, manifest digest, base SHA, and
   sandbox ID;
2. the executor PID recorded by the adapter is proven terminated;
3. the Git worktree registry contains the exact path and branch;
4. the worktree is clean and its `HEAD` is the published PR head;
5. the pull-request proof is an exact `https://github.com/<owner>/<repo>/pull/<n>`
   URL with matching GitHub App installation, branch, candidate, permit, and
   execution-manifest lineage;
6. the checkout origin is an exact HTTPS/SSH `github.com` remote matching the
   frozen repository identity.

Cleanup invokes `git worktree remove <exact-path>` without `--force`. It never
runs global `git clean`, recursive blanket deletion, wildcard removal, or
cleanup based only on a branch/path naming convention.

## Operator recovery

When a workspace is preserved:

1. stop or drain the worker before inspection;
2. read the Attempt's canonical run events and trace first;
3. compare the protected ownership manifest with `git worktree list
   --porcelain`, branch, `HEAD`, and `git status --porcelain=v1`;
4. retain useful local diffs as operator evidence, but do not attach them to a
   replacement Attempt as verified evidence;
5. use the existing governed WorkOrder retry/dispatch flow for a new Attempt;
6. remove the old worktree manually only after a human proves it is no longer
   needed. Manual cleanup is outside worker authority and must be recorded in
   the operational incident/change record.

## Draining and shutdown

Set worker readiness to `DRAINING` in the registration interface before a
future fleet manager stops assigning work. The current single-process runtime
aborts active adapters on `SIGINT`/`SIGTERM` and waits for their tasks to settle.
Each local harness child runs in a dedicated process group; cancellation and timeout
signal only that live owned group and escalate from `SIGTERM` to `SIGKILL` after
a bounded grace period. The agent child receives an explicit environment
allowlist and never inherits service-command, Convex, GitHub App, or provider
API secret environment variables. If termination proof cannot be written, the
workspace remains
`RUNNING`/unknown and automated cleanup preserves it after restart. A manifest
PID is never used to adopt or kill a process after restart, so PID reuse cannot
create ownership.

## Optional experimental DeepSeek Harness

No harness is a runtime default. Set `CODEX_FACTORY_WORKER_ENABLED=true` to
register Codex. DeepSeek Harness can be the only registered adapter; it is
disabled by default and is admitted only on the persistent-worker backend when
all of the following are set and healthy:

```text
DEEPSEEK_HARNESS_EXECUTOR_ENABLED=1
DEEPSEEK_HARNESS_ROOT=<absolute path to exact pinned checkout>
CODEX_WORKER_PROJECT_ID=<projects ID>
CODEX_WORKER_REPOSITORY_ID=<workspaceRepositories ID>
```

The checkout must be version `0.1.0-rc.5` at commit
`47f943859bef60e4160492346772ded9b24f765a`, clean for tracked files, and contain
the evaluated built CLI digest. Its runtime artifact also freezes the canonical
digest of the complete installed tree (all paths, object types, regular-file
bytes, and internal symlink targets except root Git metadata). The worker
recomputes that closure during health and again during prepare before spawn;
an added or modified dependency, an escaping/dangling symlink, a symlink into
excluded `.git` metadata, or a special file makes the adapter unavailable.
POSIX mode bits are intentionally excluded because the CLI is launched through
`process.execPath` rather than by its executable bit; unreadable files still
fail verification. On the qualified 1.5 GB installation this full check takes
several seconds per prepare, an accepted fail-closed cost for the experimental
adapter. The provider prerequisite is the existing
loopback Ollama `0.32.6` model `qwen3.5:35b-a3b-q8_0` at digest
`655d273ede3adc056594f511c120d616d92bf4c4d5bcfe580f3cfa29abe8109d`.
Mission Control does not clone, build, install, download, start, or authenticate
these prerequisites. A failed pin or provider probe prevents worker
registration and execution.

## Backend-first rollout

1. Deploy the `v27` Convex backend before an updated orchestration worker. The
   stored manifest fields are optional, so existing Factory versions and host
   records remain readable; legacy host advertisements are not eligible for new
   exact-manifest claims.
2. Confirm the runtime-contract guard reports only the intended
   `workspaceHostBindings.report` change and `v26 -> v27`.
3. Deploy workers one host at a time. Each worker reports its exact capability
   and configuration digests and waits for registration before polling.
4. Confirm readiness and admission for every adapter explicitly enabled on the
   host. DeepSeek does not require Codex, and its registration must fail closed
   if its pin, built artifact, complete installation closure, Ollama runtime,
   or model digest differs.
5. Drain before rollback. Stale registrations stop new claims, and workspaces
   remain preserved for inspection. Clearing
   `DEEPSEEK_HARNESS_EXECUTOR_ENABLED` removes only the experimental adapter.

## Monitoring

Monitor:

- registration failures or stale host heartbeats;
- claim rejections by capability, readiness, backend, or capacity reason;
- `FACTORY_WORKER_LOST` run failures;
- runtime disposition `LOST`, `FAILED`, or `CANCELLED`;
- lifecycle metadata `PROCESS_TERMINATED`,
  `WORKSPACE_CLEANUP_PRESERVED`, and `WORKSPACE_CLEANUP_COMPLETED`;
- growth under `.mission-control/worker-state/workspaces` and preserved
  worktrees.

An increase in preserved workspaces is a signal to investigate runtime or
publication reliability. It is not a reason to weaken cleanup proof.
