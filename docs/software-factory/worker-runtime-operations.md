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

An Execution Profile is a control-plane identity, not a worker plugin or
advertisement. The worker continues to advertise exact installed components and
its exact Factory Version binding. For a profile-bound version, admission
reconciles that binding with the frozen profile and qualification identity; the
worker does not discover, install, or select a profile independently.

Keep one stable `CODEX_WORKER_HOST_ID` per real worker installation. Do not
reuse one ID concurrently on two machines. Each process restart deliberately
creates a new session and server-derived generation.

## Claim and heartbeat behavior

1. Dispatch freezes the exact base SHA, executor/version, backend, sandbox
   requirements, repository scope, model route, timeout, context, Factory
   Version, quality contract, verification contract, and, for new Factory
   Versions, the exact Execution Profile version, digest, and qualification
   receipt in `factory-execution-manifest/v3`.
2. `attempts.claim` atomically checks the current registration, heartbeat,
   readiness/draining state, repository access, executor, isolation, required
   harness capabilities, exact capability/configuration digests, provider/model,
   sandbox capabilities, backend, current profile qualification and exact
   Factory Version/profile binding, and server-counted active leases. Capacity is
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

A revoked or expired profile blocks dispatch and first claim. If revocation
occurs after a valid lease is issued, the Attempt continues under that exact
frozen identity until the bounded lease completes or normal cancellation and
recovery policy intervenes. Profile state is not re-resolved inside adapter
execution, and a retry must pass current admission as a new Attempt.

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

## Execution Profile v40 rollout

1. Deploy the `v40` Convex backend and authoritative generated API types before
   any caller requires profile-bound Factory Version creation.
2. Register and qualify an immutable `factory-execution-profile/v1` version;
   confirm its exact route, route qualification, harness manifest, effective
   configuration, runtime artifact, backend, optional Sandbox Profile,
   isolation, capability, lifecycle, and all-denied authority bindings.
3. Create a new Factory Version from that exact profile and verify its
   compatibility projections and configuration digest. Do not backfill or
   rewrite historical execution-manifest V1/V2 records.
4. Confirm readiness, dispatch, first claim, and host evidence all expose the
   same profile row ID, key, version, profile digest, qualification digest, and
   exact component identities. Wrong, missing, stale, revoked, unsupported, or
   substituted identities must fail before harness execution.
5. Roll back by stopping new profile-bound Factory Version creation and
   admission. Drain before worker rollback; already leased Attempts retain their
   frozen identity, while retries require current admission. Do not infer or
   substitute a profile.

Phase 2 does not change adapter installation, worker registry composition,
dynamic tools, subagent policy, or harness implementation. The earlier generic
harness rollout remains documented below for operators maintaining those
worker versions.

## Governed read-only MCP v42

Phase 3 adds one profile-specific host capability; it does not enable MCP in a
harness. Register the exact qualification Tool Version, qualify its reviewed
digest, create one expiring Tool Grant, and register/qualify a new Execution
Profile that freezes that grant. Never attach the grant to an existing profile
or historical Attempt.

Before enabling that profile, run the authoritative Factory qualification with
the reviewed baseline:

```sh
MC_QUALIFICATION_BASE_SHA=<reviewed-main-sha> pnpm run qualify:factory:v2
```

The worker executes the exact `read_factory_doctrine_excerpt` fixture before
harness startup. Convex must commit an `ALLOWED` receipt while the Attempt
lease, fencing generation, profile, grant, Tool Version, qualification expiry,
and one-call budget are current. Only then may the local stdio process start.
The harness receives bounded context labeled untrusted; it receives no MCP
endpoint or credential.

Operator remediation is deliberately narrow:

- missing capability: select a separately qualified profile with the exact
  grant, or continue with `NO_TOOL_CAPABILITY` when the WorkOrder does not need it;
- revoked/expired grant or stale qualification: register and qualify a new
  immutable version—never mutate the old receipt/profile;
- server/schema/implementation mismatch: stop and requalify new exact bytes;
- unavailable/timeout/poisoned output: inspect the Attempt receipt; do not
  widen destinations, retry budget, or tool scope;
- stale worker/canceled Attempt: the denial or late completion remains audit
  evidence, but a retry requires a new current Attempt lease.

Rollback is grant revocation plus removal of the MCP-qualified profile from new
Factory Version selection. Revocation denies new calls and preserves historical
receipts. This path is `QUALIFICATION_FIXTURE`, not a real admitted MCP service.

Phase 4 admits one additional exact path: Context7 `query-docs` at
`mcp.context7.com:443`, release `@upstash/context7-mcp@4.0.5`, with no
credential and one fixed public React documentation query. The broker requires
the observed server version and input-schema digest to equal the frozen Tool
Version before the request is sent. It records separate authorization and
completion receipts and supplies only a bounded, untrusted normalized text
envelope to the harness. Every HTTPS connection is pinned to an address from
the broker's validated public-DNS result, and initialize, catalog validation,
and the tool call share one end-to-end deadline. Redirects, private or reserved
address results, duplicate advertised operations, retries, dynamic discovery
authority, writes, acceptance, routing, and policy mutation remain denied.

If publication credentials are unavailable after the candidate commit exists,
an operator may recover only the exact failed policy-v2 publication Attempt
when its durable code-diff and prior workspace-ownership evidence match. The
failed Attempt remains terminal and unchanged. Recovery creates a new linked,
fenced Attempt that transfers the already-owned workspace, attests the existing
commit and allowed-path diff, and emits `LOCAL_GIT` candidate evidence without
rerunning the harness or MCP call. It cannot publish, and even independently
verified `LOCAL_GIT` evidence is not acceptance-current without a trusted
publication projection.

The isolated Phase 4 launcher permits raw SQLite snapshot copying only after
the source backend's configured ports are confirmed stopped and no WAL/SHM
sidecars exist. It fails closed rather than copying a potentially torn live
database.

## Original generic-harness v27 rollout

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
- profile qualification expiry/revocation and readiness blockers;
- claim rejections by profile/qualification digest, component identity,
  capability, readiness, backend, or capacity reason;
- execution evidence whose profile identity disagrees with the Attempt or
  Factory Version;
- governed MCP denials, grant expiry/revocation, server/schema substitution,
  replay, secret withholding, timeout, and `lateOrStale` completion evidence;
- `FACTORY_WORKER_LOST` run failures;
- runtime disposition `LOST`, `FAILED`, or `CANCELLED`;
- lifecycle metadata `PROCESS_TERMINATED`,
  `WORKSPACE_CLEANUP_PRESERVED`, and `WORKSPACE_CLEANUP_COMPLETED`;
- growth under `.mission-control/worker-state/workspaces` and preserved
  worktrees.

An increase in preserved workspaces is a signal to investigate runtime or
publication reliability. It is not a reason to weaken cleanup proof.
