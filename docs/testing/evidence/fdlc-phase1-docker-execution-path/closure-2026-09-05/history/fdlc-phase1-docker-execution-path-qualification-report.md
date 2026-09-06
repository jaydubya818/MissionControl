# FDLC Phase 1 — Docker Execution Path Qualification Report

Date: 2026-09-05. Disposition: **NO_GO**. WO1 readiness: **NOT_ISSUED**.

This implements an internal, offline Docker provider and durable budget fixtures. It does **not** qualify the producing execution path or authorize WO1. No model calls, real pilot Attempts, candidate, PR, publication, merge, release, deployment or dependent admission records were created. Disposable test repositories and mocked control-plane subjects are labeled fixtures; they are not the pilot repository or admission records.

The owning team remains **FDLC / Mission Control**. Champion, Human FDE / Operator and Incident Commander remain **Jarrett West**. Multiple roles do not combine or waive any existing approval, authorization, independent verification, acceptance, publication, merge, release, containment, cost, security or rollback gate.

## Decision matrix

| Required decision | Status | Evidence and limitation |
|---|---|---|
| Containment | BLOCKED | 26 actual-container probes pass, including filesystem, native runtime read-only, non-root, privilege attempt, credentials and network. Complete hostile-process/namespace/mount matrix and active worker-death qualification remain incomplete. |
| Worker integration | BLOCKED | Real FactoryAttemptWorker → RemoteSandboxRuntime → Docker → immutable probe → validated result → Attempt report → cleanup works against a disposable fixture client. Production inference, complete reservation/Plan/Execution Profile/generation bindings and full terminal-state qualification remain unavailable. |
| Runtime | BLOCKED | Exact Linux x64 Codex 0.146.0 starts and its bytes are hashed inside the worker image. Nested Codex Linux sandbox fails to create a namespace. Existing remote invocation deliberately uses the outer boundary with `danger-full-access`; the nested test is not evidence that this different invocation fails. No complete producing-runtime compatibility qualification is claimed. |
| Hard budget | BLOCKED | Durable offline reservation/broker fixtures pass. No authoritative production reservation service, exact approved provider route, qualified billing bound or real provider behavior proof. |
| Provider route | BLOCKED | Prior pilot route remains unresolved; no provider/model substitution or live pricing assumption. Fixture route/model are explicitly offline. |
| Dependent admission | BLOCKED | Neither hard gate is fully qualified; no host, route, verifier, Factory Version, Factory qualification or readiness issued. |
| WO1 readiness | NOT_ISSUED | No frozen production execution tuple or expiration can honestly be issued. |

## Implementation and exact environment

Baseline: `f82fe1d98b156278c4fa0c0e2032008e2f010f39`, branch `codex/fdlc-pilot-readiness`. Changes are uncommitted. Prior reports and evidence remain preserved. The original target `docs/guides/RUN.md` remains SHA-256 `0672a5c2cd49b36550cdc2989ff7400ed3c6a55b81e51c46bfddda9de8fd3b88`.

- Provider ID/version: `factory/docker-offline/v1`, provider kind `DOCKER`, existing backend `remote-sandbox`. No second orchestrator.
- Exact candidate image: `sha256:6bccfbcece421e5f3d7a2a0f29b986a39520bddbbf11cce6e4a20c81421dd7b0`; Linux/amd64 under Docker Desktop on the ARM64 Mac. Qualification uses the immutable local Docker image ID, not a tag. Rebuilds are distinct identities.
- Source-built base: `ghcr.io/jaydubya818/mission-control-remote-sandbox@sha256:41a66f1d6f7b90618a6c58fb9a1a336ef69ab2794fc1322233e4a5d9788782b8`. Prior VM qualification is not reused as Docker qualification.
- Actual daemon: Engine 29.7.2, API 1.55, LinuxKit 7.0.12, Docker Desktop 4.88.1. Candidate validator requires Linux Engine ≥29 with built-in seccomp; that minimum is not a claim that every later engine is qualified. Qualification binds the exact captured engine.
- Runtime: Linux x64 native Codex 0.146.0 SHA-256 `2e863156ed35ecc5253b1e2f907a9143077b9f7cb51942070c61996471ff6e04`, Node v26.7.0. This is distinct from the preserved Darwin artifact. No admitted runtime artifact record was issued.
- Implementation digest and exact per-file hashes: [implementation-files.json](../testing/evidence/fdlc-phase1-docker-execution-path/implementation-files.json).

The provider is wired into the existing Factory provider selection. Current public Convex admission does not register Docker profiles; production readiness remains blocked. The new image contains the existing generated supervisor plus a fixed bootstrap/probe. A caller cannot supply an arbitrary executor: every producing invocation currently receives `BUDGET_DENIED` before start. This is a deliberate gate, not a working production broker.

The versioned invocation transports the manifest, its digest, Attempt/WO/source/profile identities, immutable image, lease ID, deadline and repository bundle over Docker stdin. The worker retains its existing claim/lease, verification and publication machinery. Control-plane IDs in fixture evidence are synthetic, including the legacy fixture string `work-order-1`; that string is **not** the real pilot WO1.

Missing production contract work includes authoritative Plan revision, Execution Profile, reservation and exact route/price/verifier references, explicit generation/correlation binding and complete terminal-result proof. Typed Docker boundary failures preserve stable `DOCKER_*` failure codes through the existing remote error path. Declared terminal vocabulary alone is not qualification of every terminal path.

## Isolation, credentials and lifecycle

The host owns the Docker daemon socket; it is never mounted or copied into the workload. There are no host binds or persistent volumes. A frozen Git bundle is copied through stdin and cloned into a fresh, 128 MiB, non-executable workspace tmpfs. `/tmp` is a separate 16 MiB noexec/nosuid/nodev tmpfs. Root and runtime files are read-only. User/group 10001, all capabilities dropped, no-new-privileges, built-in seccomp, private IPC/cgroup namespaces, no host PID/network, no privileged mode, 1 CPU, 512 MiB memory with no additional swap and 64 PIDs are inspected before start.

`network=none` removes external provider, public, private, metadata and host-service access. Tests attempt public IP, loopback, metadata, private IP, Docker host gateway and alternate provider hostname. Loopback within the container is not an escape to host loopback. No inference credentials are minted for `credentials.inference=NONE`; environment inspection rejects unexpected variables. No key, SDK or provider egress path is available to the fixed workload. A future broker must not weaken this to arbitrary Internet access.

Normal result handling and cancellation both terminate and verify absence. Resource names are not reused. Recovery uses durable allocation metadata and requires exact resource ID/name/provider/lease/manifest labels before mutation. Recovery permits teardown only. Already-absent cleanup is acknowledged only after a responsive daemon inventory proves absence; daemon errors are not absence. A policy violation cannot prevent removal of an otherwise positively owned resource.

PID 1 receives its absolute deadline at container creation, before stdin, and bounds bootstrap and supervisor work independently of the host timer. Dedicated active-worker-death and every deadline fault point have not been behaviorally qualified; source controls and fresh-provider teardown tests do not replace those tests. Docker daemon/VM/kernel authority remains part of the trusted execution base. No claim of universal container-escape resistance is made.

## Hard liability contract and limits

Required production invariant is unchanged:

> Before any provider request, the worst-case liability of that request, including all billable dimensions, must fit within the remaining approved reservation. Every retry requires a new precheck against the same reservation; unknown outcomes retain their liability.

`hardLiabilityLedger.ts` implements an **offline qualification storage adapter**. It is not registered as a Convex authority and cannot authorize a real provider call. Amounts are integer nano-USD. The fixture reserves the entire policy input bound plus the enforced maximum output at inclusive worst-case rates; it does not use bytes/4, generic tokenizers or cache multipliers. Only `EXACTLY_ENFORCEABLE` or `CONSERVATIVELY_BOUNDED` policies can proceed. Input payload bytes and output settings are checked before send. The fixture adapter receives `max_output_tokens`; that proves wiring to a fixture, not provider compliance.

Reservation bindings include workspace, WO, Execution Profile, route, provider, model, price identity, policy digest, limit, expiration and creation idempotency key. An exclusive filesystem transaction lock serializes independent ledger instances. A durable, fsynced hold precedes fixture invocation. A crash lock is never stolen automatically. State checksum/schema detect accidental corruption; they are not authentication against a compromised controller. Production transactional storage and authority checks still need implementation.

Unknown requests remain fully encumbered across restart. Retries use distinct request IDs, retain prior holds and cannot exceed the shared reservation or request count. Duplicate sends, settlements and reused usage IDs are denied. Settlement requires request digest linkage and cannot exceed the hold. Policy/source/pricing/billing semantics in tests are intentionally `fixture://not-real-prices` and must never be promoted to production evidence.

Proposed pilot ceilings remain $2 per WO ($1 producer + $1 verifier), $20 cohort, one producer plus one verifier Attempt, zero Mission Control automatic retries, 15 minutes per Attempt and one slot. These are proposed ceilings, **not issued reservations** or proof that provider liability can fit. No production input/output token numbers or current prices are invented. Unknown cost is not zero.

## Provider route and live-call gate

The existing pilot proposal has no exact approved route/model/pricing identity. The generic OpenRouter credential path and saved-auth Codex path do not become a hard-budget path by running in Docker. No provider was selected to simplify testing. Existing provider spend-limit research remains evidence of limitations, not a guarantee of zero overshoot.

Before any live qualification proposal can be submitted, the operator must identify the exact approved route and obtain a current price/billing contract supporting a conservative input bound, hard output cap, reasoning/cache category treatment, request IDs, confirmed model identity, usage, cancellation and unknown-outcome reconciliation. Then implement the broker so all sends reserve first and the workload has no bypass.

**Live-call proposal: NOT_READY. Calls authorized/performed: 0.** Exact provider/model, transmitted data, call count and maximum approved liability cannot be honestly frozen while route/pricing and the bound are absent. This report does not request an unbounded test call or treat an elapsed timeout as authorization.

## Verification and independent reviews

The Docker/budget suite records **43 passing tests**, including 26 passing container-boundary probes, actual worker result delivery and cancellation, restart teardown, stale-label rejection, repeated absence, negative policy substitutions, reservation concurrency, replay protection and unknown hold retention. The result fixture intentionally reports `FAILED` with no accepted criterion or candidate change, preventing entry into publication. Passing this test means failed-workload evidence was handled correctly, not that a pilot WorkOrder completed.

Required repository gates and their exact exit codes are in [gates.json](../testing/evidence/fdlc-phase1-docker-execution-path/gates.json). The final gate run is retained alongside a separate System Qualification evidence directory. Default runtime guard fails because the current branch is v40 and the default upstream baseline is v41 with unrelated public APIs. Explicit `--base f82fe1d98b156278c4fa0c0e2032008e2f010f39` passes across 931 functions. This task changes no public Convex validator contract, so no artificial increment was made. The default guard failure still prevents claiming all required gates pass.

Independent source reviews: [security](../testing/evidence/fdlc-phase1-docker-execution-path/security-review.md) and [data integrity](../testing/evidence/fdlc-phase1-docker-execution-path/data-integrity-review.md). Original findings and follow-up fixes are retained. Reviewers did not execute Docker or provider tests. Their review is independent source review; the test evidence is implementer evidence. Production hard-budget authority, full invocation/terminal qualification and remaining hostile-runtime/lifecycle tests remain unresolved. High readiness blockers keep NO_GO in force.

## Remaining admission work, in order

1. Resolve the branch/default-baseline contract divergence explicitly; do not invent a version bump or import unrelated APIs as part of this closure.
2. Complete the actual outer-container Codex invocation and hostile-action/lifecycle qualification, including active worker death, startup interruption, timeout and stale generation. Preserve the nested-sandbox failure as a separate control.
3. Resolve the approved exact provider route and versioned billing contract. Implement the authoritative reservation/broker path and full tuple binding; qualify it offline before proposing any bounded live call.
4. Obtain explicit authorization for any necessary live provider proof, with provider/model, purpose, count, data, maximum liability and expected evidence frozen first.
5. Only after containment and hard budget qualify, issue the exact dependent host/route/verifier/Factory qualifications and regenerate readiness from real approved subjects. Stop again before dispatch.

## Incident and rollback procedure

Jarrett West remains Incident Commander. On lease loss, policy mismatch, timeout, unexpected network/credential evidence, missing result, unknown charge or failed cleanup: stop dispatch; preserve the exact allocation, manifest, image, request/hold and evidence; terminate only positively owned Docker resources; verify absence with the responsive daemon. Retain unknown budget holds and block retries until authoritative reconciliation. Never delete or recreate a ledger to regain capacity, steal a crash lock, infer absence from an API error, or clean up by broad Docker prune.

This turn installed no production authority and deployed no backend. Source rollback is removal/reversion of only the Docker/provider/fixture changes after review, preserving the pre-existing pilot docs, adapter regression and evidence. The new immutable image may be removed by exact ID only after confirming no references or running containers; no image deletion is needed for containment. Existing unrelated containers, the original Convex backend, global Codex installation, prior evidence and WO1 target remain outside rollback scope.

No readiness expiration or frozen production execution tuple is issued. **Stop before WO1.**
