# Executor adapter contract

## V1 identity

Production executors implement `generic-harness-contract/v1`. No harness is a
runtime default: `codex/v1` is registered only when its worker flag is enabled,
and exact `deepseek-harness/0.2.0` is registered only when its experimental
feature flag is enabled. Loom identities remain contract fixtures because no
real pinned Loom adapter is installed.
The exact adapter/version is selected by the immutable Factory version,
advertised by a current canonical worker, frozen in the Attempt manifest, and
resolved without fallback from the worker's adapter registry.

New Factory Versions select that adapter through an exact immutable Execution
Profile and profile-qualification receipt. The profile is subordinate
control-plane configuration: it does not load adapter code, modify registry
composition, or provide a fallback. The worker verifies the profile and all of
its component projections before calling `prepare`. See the [Execution Profile
identity decision](../decisions/execution-profile-identity.md).

An adapter executes an already-approved, already-dispatched WorkOrder Attempt.
Its declared worker, verification, publication, acceptance, memory,
observability, and learning authority must all be `NONE`. The registry rejects
any adapter that claims otherwise. See [Generic Harness Contract
V1](generic-harness-contract-v1.md) for the integration decision and evidence.

## Required surface

`HarnessExecutorAdapter` defines:

- capability discovery, including mutation and isolation support;
- configuration validation before process start;
- an explicitly low-confidence cost/runtime estimate;
- opaque `prepare -> execute -> collectResult -> cleanup` lifecycle values;
- cancellation of the exact opaque live handle;
- ordered structured execution events;
- health/readiness reporting.

The contract lives in `packages/workflow-engine/src/executorAdapter.ts`. The real
runtime implementations are `CodexV1ExecutorAdapter` and the optional
`DeepSeekHarnessExecutorAdapter` in the orchestration server.
The orchestration registry owns exact runtime selection and an optional bounded
remote-sandbox invocation builder; it does not own control-plane policy.

## Repository sandbox

Each request carries an absolute repository root, an absolute working directory
inside that root, repository-relative allowed paths, timeout, model, and explicit
`READ_ONLY` or `WORKSPACE_WRITE` isolation. V2 requests additionally carry the
frozen model-route digest, provider route, and any reasoning controls. These
fields are part of the request digest and normalized result provenance; the
worker rejects a result that does not echo the exact route identity. Validation
rejects path traversal, work outside the repository root, empty scope, missing
prompts, and unbounded timeouts.

An adapter must translate every supplied route control into its underlying
invocation or reject the request before process start. `codex/v1` admits the
`openai` route on a persistent worker and `openrouter` in a remote sandbox,
translates an exact reasoning effort, and rejects unsupported temperature or
maximum-token controls. The pinned DeepSeek adapter admits only its exact local
Ollama route and currently rejects explicit reasoning controls. Legacy V1
requests and persisted results remain readable when the additive route fields
are absent.

The Factory worker creates or reconciles the exact server-owned `mc/` branch in
the frozen attempt worktree. After Codex returns, it compares both committed and
uncommitted changes to the frozen include/exclude scopes. Any deviation creates
a reviewable artifact, fails the attempt, and blocks GitHub token issuance and
PR creation.

## Frozen execution manifest

Every new Factory version binds active repository code scopes and one approved
agent version for each workflow agent. Historical Factory Versions retain their
immutable execution-manifest V1/V2 bytes. A profile-bound Factory Version
compiles `factory-execution-manifest/v3`, adding the exact profile row ID, key,
version, canonical snapshot and digest, and qualification receipt to the
existing causation IDs, WorkOrder revision, Factory digest,
repository/branch/worktree authority, prompt and context hashes, per-step agent
genome/prompt/tool/model identities, timeout, isolation, component identities,
and `factory-result/v1` completion contract. The full compiled prompt is
available only through the signed claim boundary; public run queries and the
inspector return its hash but redact its content.

The host, not the adapter, owns profile evidence. It reconciles the frozen
profile, qualification, model-route, harness-manifest, effective-configuration,
runtime-artifact, backend, and optional Sandbox Profile identities before start
and before persisting results. Missing, revoked, stale, unsupported, or
substituted identity fails closed; adapter output cannot authorize a different
profile.

## Event and secret rules

Events are ordered per execution and use these stable types: execution start,
command start/completion, artifact produced, execution completion/failure/cancel.
Successful event metadata contains runtime facts, not process environment or
credentials. Failure text is bounded and redacts common credential labels.

The child process may receive runtime credentials required by Codex. Those values
must never be written to Mission Control records, artifacts, command receipts,
or application logs.

## Recovery

Generic Harness Contract V1 preserves the qualified recovery policy: cancel and
bounded retry are enabled, while pause and in-process resume remain disabled.
An individual adapter may describe richer native capabilities, but this
initiative does not grant the Factory new recovery authority.
The control plane does support crash reconciliation: an expired durable lease
can be reclaimed against the same immutable manifest, branch, and worktree, and
branch push / PR creation are idempotent. Once an attempt reaches a terminal
state, recovery creates a new bounded WorkOrder attempt referencing the prior
failed/canceled attempt. That retry must pass current Execution Profile
admission and never inherits eligibility merely from the prior Attempt.

Set `CODEX_FACTORY_WORKER_ENABLED=true` to register `codex/v1`, or set
`DEEPSEEK_HARNESS_EXECUTOR_ENABLED=1` to register the pinned DeepSeek adapter.
The legacy `FACTORY_EXECUTION_ENABLED` flag does not select an adapter and must
remain disabled. `FACTORY_EXECUTION_POLL_MS` may be set between 5 seconds and 5
minutes; the default is 15 seconds. Startup polls both pending and running bound
attempts, while the durable lease prevents duplicate execution across workers.
