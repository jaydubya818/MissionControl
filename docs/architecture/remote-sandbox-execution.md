---
title: Remote Sandbox Execution
status: proposed
date: 2026-08-10
owner: product
---

# Remote Sandbox Execution

## Purpose

This document defines the execution boundary for running a Mission Control
Factory Attempt on a disposable remote machine. It implements the first stage
of `docs/plans/2026-08-10-feat-remote-sandbox-factory-cohorts-plan.md` without
creating a second orchestration lifecycle.

The governing hierarchy remains:

```text
Mission -> WorkOrder -> Task -> Attempt / WorkflowRun -> evidence -> PR -> release
```

A sandbox allocation is an execution resource attached to one Attempt. It is
not an agent, Task, WorkOrder, Factory, or source of product truth.

## Authority boundary

### Mission Control owns

- authenticated intent, policy, approval, risk, scope, and budget;
- immutable WorkOrder revision and execution manifest;
- Attempt claim, lease, cancellation, retry, and terminal state;
- provider allocation, identity, health, and teardown;
- durable events, receipts, artifacts, and cost attribution;
- independent validation and candidate selection;
- Git commit, push, pull request, merge, deployment, and release authority.

### The sandbox supervisor may

- verify the frozen manifest and exact repository base SHA;
- run approved workflow steps within time/resource bounds;
- append a cursor-based, hash-chained receipt spool;
- collect redacted logs and deterministic verifier artifacts;
- produce a signed, content-addressed result bundle; and
- stop when its lease, runtime, or credential expires.

### The sandbox supervisor may not

- change approved intent, workflow, models, tools, network, or code scope;
- receive a global Mission Control service secret;
- receive GitHub write, PR, merge, deploy, or production identity;
- approve or independently validate its own work;
- make a proxied port public; or
- keep a resource or credential after its Attempt ends.

## Receipt transport

V1 uses pull-based supervision:

1. The root-owned supervisor appends structured events to a local, hash-chained
   spool that the unprivileged agent cannot modify.
2. The trusted outer worker reads new entries over the provider/SSH channel
   using a durable cursor.
3. The worker verifies sequence, hash continuity, Attempt/allocation identity,
   and the supervisor's ephemeral signing-key fingerprint.
4. The worker translates verified packets through the existing host-side
   Attempt reporting contract.

The VM receives no Mission Control callback credential, and a locally running
Mission Control instance does not need to expose an inbound public endpoint.
Duplicate reads are harmless because event identifiers and cursors are
idempotent.

## Phase 0 doctor

`node scripts/sandbox-doctor.mjs` performs fail-closed read-only checks:

1. scan the live exe.dev host key;
2. compare it to the provider's published fingerprint;
3. authenticate with a registered SSH key;
4. read VM, billing-plan, billing-usage, and integration inventories; and
5. reject automatic integration attachments before any allocation.

The optional lifecycle canary additionally requires:

```bash
MISSION_CONTROL_SANDBOX_LIVE=1 \
  node scripts/sandbox-doctor.mjs --lifecycle-canary
```

The canary creates one exact, generated VM name with a Mission Control doctor
tag, attaches no integration, passes no environment value, runs no repository
or model workload, and removes only that exact VM in a bounded cleanup path.

`EXEDEV_IDENTITY_FILE` may select a dedicated registered private key. The
doctor never prints key material or copies the key to the VM.

## Zero-cost local development canary

When remote capacity is unavailable, the following development-only diagnostic
exercises the lifecycle and cleanup contract against the operator's existing
Docker engine:

```bash
node scripts/local-sandbox-doctor.mjs --canary --repeat=3
```

The diagnostic uses a cached Alpine image by immutable repository digest with
`--pull=never` and fails closed unless the active Docker endpoint is a local
Unix socket with no `DOCKER_HOST` override. Each canary has no network,
environment secret, host bind mount, published port, or elevated privilege. It
runs as UID/GID 65534 with a read-only root filesystem, all Linux capabilities
dropped, no-new-privileges, bounded CPU/memory/PIDs, and tmpfs-only writable
storage. The outer process validates the inspected Docker policy and the
in-container receipt before removing the container by its returned Docker
identity and rechecking the exact generated name.

This is not a provider adapter and must not be selected for a governed Factory
Attempt. It proves local lifecycle mechanics, policy inspection, result
extraction, failure cleanup, and deterministic teardown only. It does not prove
an independent computer, host-failure isolation, remote restart recovery,
private provider previews, credential vending/revocation, provider spend
controls, or best-of-N scaling across machines. Those remote promotion gates
remain blocked until capacity is explicitly approved.

## Lifecycle contract

```text
REQUESTED
  -> PROVISIONING
  -> HEALTH_CHECKING
  -> READY
  -> RUNNING
  -> RESULT_READY
  -> TEARING_DOWN
  -> TERMINATED
```

Every transition must be recoverable from a durable allocation journal before
repository execution is added. `FAILED` describes the workload outcome;
`ORPHANED` describes provider/control-plane drift and remains an operator
exception until reconciled.

## Result publication

Future governed Attempts return a signed result bundle to quarantine. The
trusted outer control plane verifies bundle signature/checksums, exact base
SHA, changed-file scope, forbidden content, verifier receipts, and target-branch
freshness. Only then may it materialize the selected result in a controlled
worktree and use the existing GitHub App publication path.

The sandbox never pushes its own branch. A best-of-N cohort creates one pull
request from one human-selected candidate.

## Promotion gates

Remote execution remains Preview until it proves:

- exact company/workspace/repository authorization;
- provider and integration readiness that fails closed;
- no sandbox-held publication identity;
- bounded privilege, egress, runtime, spend, and port visibility;
- restart-safe event ingestion and lifecycle reconciliation;
- deterministic cancellation and teardown;
- real cost attribution and reconciliation; and
- browser-operable success, failure, cancellation, and orphan recovery.
