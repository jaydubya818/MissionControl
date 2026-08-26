# Remote Sandbox Runtime

**Status:** Production-pilot eligible / Preview; not general production certified
**Canonical worker prerequisite:** PR #102, merged as `c97b31d59911543c6f95b2cd35fded957b2eddc6`
**Canonical Mission-to-PR prerequisite:** PR #95, merged as `d0e5ff2ff57da7e5037da6f6ee8083ed275d911f`
**Deterministic implementation proof:** `FakeSandboxProvider`
**Bounded live pilot evidence:** [Production Factory Pilot V3](../testing/evidence/production-factory-pilot-v3/README.md)

Remote Sandbox is an execution backend beneath the canonical worker runtime. It does not introduce a second worker, lease, recovery state machine, verifier, publication path, or acceptance authority.

## Authoritative lifecycle

```text
WorkOrder
  -> Attempt
  -> canonical worker admission and Attempt lease
  -> execution backend = remote-sandbox
  -> SandboxProvider
  -> Attempt-scoped sandbox
  -> content-addressed result bundle
  -> host materialization
  -> independent host verification
  -> Attempt credential revocation
  -> exact resource-absence proof
  -> existing publication permit
  -> GitHub App pull request
  -> canonical owned-worktree cleanup
```

PR #102 remains authoritative for stable worker identity, session and generation fencing, capability admission, slot capacity, Attempt leases, worker heartbeat semantics, stale-worker rejection, LOST/replacement recovery, process ownership, worktree ownership, and fail-closed cleanup. The remote backend consumes that contract.

Routine provider liveness is current allocation state (`lastHeartbeatAt`), not a second durable worker heartbeat stream. Orphan reconciliation receives `attemptLeaseCurrent`, computed by the control plane using the canonical Attempt lease and current worker registration predicate. It does not calculate a parallel lease expiry or recover an interrupted sandbox candidate. A retry is a new Attempt.

## Authority boundary

The sandbox may execute the frozen input, emit subordinate lifecycle evidence, and return an untrusted result bundle. It cannot:

- accept or mutate a WorkOrder; `workOrders.accept` remains the sole acceptance mutation;
- authorize publication, push, create a pull request, merge, or deploy;
- create a trusted Verification Subject or assert verifier independence;
- access GitHub App, provider-management, Mission Control service, or long-lived inference credentials;
- change worker admission, capacity, lease, recovery, policy, risk, approval, or cleanup state.

The host validates the result digest and all Attempt, WorkOrder revision, manifest, profile, source, supervisor, and environment identities before applying the binary patch to a clean, canonically owned worktree. Sandbox-reported commands are verification inputs only. Mission Control independently verifies the materialized candidate.

Publication is unavailable until the Attempt credential is revoked and `SandboxProvider.terminate` returns proof that the exact provider resource is absent. Canonical worktree cleanup additionally requires the remote process to be recorded as terminated, the candidate worktree to be clean, and the exact GitHub pull-request publication proof to match.

## Provider contract

`SandboxProvider` is provider-neutral and intentionally narrow:

| Operation | Contract |
| --- | --- |
| `validateProfile` | Validate immutable provider, image, resource, network, credential, spend, preview, readiness, and teardown policy. |
| `allocate` | Idempotently resolve or create the stable Attempt-derived resource. |
| `inspect` | Return normalized current allocation/liveness state without durable worker-heartbeat authority. |
| `start` | Upload the frozen source bundle, manifest, supervisor, executor contract, and Attempt-only inference credential. |
| `fetchResult` | Return the bounded `factory-sandbox-result/v1` payload. |
| `cancel` | Stop the exact sandbox supervisor when the canonical Attempt is canceled or its lease is lost. |
| `terminate` | Remove the exact provider resource and return an absence receipt; ambiguity is an error. |

`FakeSandboxProvider` is the deterministic, no-spend proof provider. `ExeDevSandboxProvider` is the only production adapter. Production workers reject `FAKE` profiles. Remote execution is advertised as a worker capability only when the operator explicitly enables it and configures the required exe.dev identity and OpenRouter management credential.

The immutable `factory-sandbox-profile/v1` snapshot is frozen into the Factory version and the existing `factory-execution-manifest/v1`. No new manifest version is reserved. The profile includes provider/image/resources, supervisor transport, runtime, egress/ingress, credential descriptors, spend, preview, teardown, readiness evidence, and a canonical profile digest.

## Result, credentials, and teardown

`factory-sandbox-result/v1` binds the Attempt, WorkOrder revision, WorkflowRun, manifest, profile, source SHA, supervisor, image, changed files, diff, command results, verification inputs, artifacts, events, usage, and content digest. Host limits are 10 MB for the result and 8 MB for the patch.

The credential broker mints one expiring, Attempt-scoped, cost-limited OpenRouter key. The sandbox receives only that one-time key. Persistent records contain the external identifier and fingerprint, never the secret. Revocation occurs on completion, failure, cancellation, timeout, and reconciliation.

Allocation intent is journaled before provider mutation. Stable resource names derive only from project, WorkflowRun, and Attempt identity. Reconciliation revokes the recorded Attempt credential, terminates the exact resource, requires absence proof, records `ORPHAN_RECONCILED`, and blocks further remote dispatch in the repository-scoped worker while cleanup is unhealthy.

## Progressive Factory experience

Remote configuration extends the shared Factory Basic / Intermediate / Advanced experience; it does not add a competing mode selector.

- **Basic:** Local or Isolated Sandbox.
- **Intermediate:** profile, executor/model, cost/runtime limits, independent verification, retry, and preview summary.
- **Advanced:** provider, image/resources, egress, credential descriptors, teardown/reconciliation, manifest/result identities, readiness evidence, and runtime diagnostics.

The Run Inspector extends canonical Observability/Evals with the allocation, provider heartbeat, result, credential status, cost, lifecycle, and teardown evidence. Factory Memory / Context Packages and Verification Factory policy-v2 remain unchanged and continue to bind the same WorkOrder and Attempt.

## Deterministic proof

Run the authoritative no-spend path:

```bash
./scripts/factory-remote-sandbox-golden-path.sh
```

It proves one canonical worker lease, one sandbox start, content-addressed materialization, independent host verification, credential revocation, exact resource absence, the existing publication permit, one GitHub App PR handoff, and canonical worktree cleanup. It performs no exe.dev request.

## Live exe.dev certification

Live certification is deliberately separate from code integration. Do not upgrade an account, purchase capacity, allocate a VM, change credentials or payment settings, or run a live lifecycle without explicit Product Owner authorization.

Routine Factory configuration cannot self-assert certification; profiles created there freeze `liveCertified=false` and remain blocked. The operator-authorized 2026-08-17 exe.dev run completed as **Live Certified With Known Limitations**; see [Remote Sandbox Live Certification V1](./remote-sandbox-live-certification-v1.md). This does not change the production rollout state: profiles remain Preview and globally disabled until a reviewed pinned Codex image and an explicit control-plane certification/activation path exist. Any future certification must begin with read-only readiness, then one explicitly approved cheap lifecycle canary, then one GREEN-risk Factory Attempt. Any missing credential-revocation or exact resource-absence proof is a failed certification.

## Runtime contract

This integration adds public Factory profile/version and scoped reconciliation service contracts. PR #95 advanced the merged-main runtime baseline to v24. The post-merge extractor still identifies the same four Remote Sandbox public changes, so the combined runtime contract advances atomically to v25.
