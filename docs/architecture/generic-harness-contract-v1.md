# Generic Harness Contract V1

## Decision

Mission Control integrates a provider-neutral execution contract beneath its
existing governed Factory lifecycle. Codex and DeepSeek Harness implement the
same opaque lifecycle and normalized result. DeepSeek remains optional,
experimental, disabled by default, and local persistent-worker only.

Harnesses are replaceable execution infrastructure. Mission Control remains
authoritative for WorkOrders, Attempts, worker admission and leases, sandbox
policy, Verification Subjects and Plans, evidence/currentness, publication
permits, GitHub publication, acceptance, memory, observability, and learning.

Model, harness, runtime, and placement identity are deliberately separate:

- a **Model Route** identifies inference through `provider`, `providerRoute`,
  `modelId`, and any bounded reasoning configuration;
- a **Harness** identifies the agent execution implementation and its effective
  capabilities;
- a **Runtime Artifact** identifies the exact executable or container image
  used to run that harness; and
- an **Execution Backend** identifies where the harness runs.

Qualification may bind those identities into an allowed combination. It does
not make any component semantically own another component.

The implementation started from `origin/main`
`3de80b97c7272f64586e5d08bc7c73fcd2114faa` and was later reconciled onto
`6800ab39b09691c3b64b3f621d6d00be293e87c9`, which already contained the
smaller generic lifecycle and registry from PR #112. This initiative extends
that seam; it does not introduce a second executor framework and does not copy
the standalone Harness Lab into Mission Control.

## Existing architecture audit

| Existing concept | Generic Harness equivalent | Disposition |
| --- | --- | --- |
| `HarnessExecutorAdapter` and `runHarnessExecution` | Opaque `prepare -> execute -> collectResult -> cleanup`, with handle-scoped `cancel` | Keep as the single lifecycle |
| `HarnessAdapterRegistry` | Exact adapter/version runtime selection | Keep and extend with validated adapter-effective manifests |
| `CodexV1ExecutorAdapter` | Concrete real harness adapter | Consolidate behind the shared result and capability contracts |
| `FactoryAttemptWorker` | Governed host around the adapter | Keep worker lease, candidate checks, verification, and publication outside adapters |
| `factory-execution-manifest/v1` | Frozen model route, harness, runtime artifact, backend, and requirements snapshot | Preserve one Attempt manifest and add exact sidecar provenance rather than creating a parallel manifest |
| `workspaceHostBindings.workerRuntime` | #102-style capability advertisement | Extend exact executor admission with manifest/config/runtime/model/capability matching |
| `RemoteSandboxRuntime` | Execution backend and external sandbox | Keep unchanged; only Codex advertises the existing remote invocation builder |
| canonical traces and trace observations | Harness lifecycle/usage diagnostics | Reuse; do not add a telemetry store |
| Factory Learning signals | Advisory harness context | Reuse as diagnostic metadata with no routing mutation authority |
| agent configuration registry `.loom/**` discovery | Loom configuration inventory | Keep separate; it is not a Loom runtime adapter |

The older durable Codex worker remains compatible and calls the same lifecycle
runner, but new governed Factory dispatch uses the exact registry and frozen
manifest admission path.

## Reconciliation with merged PR #112

PR #112 remains the lifecycle authority. Phase 2 keeps its one
`HarnessExecutorAdapter`, one `runHarnessExecution` runner, and one
`HarnessAdapterRegistry`. The existing `capabilities()` return is extended with
the optional adapter-effective manifest; Phase 2 does not add a second
capability-discovery method or adapter framework. Real governed adapters require
that manifest, while the optional field keeps deterministic and external test
adapters compatible with the merged contract.

The reconciliation removed unused parallel request, event, estimate, health,
process-observer, and configuration-issue types carried from the earlier branch;
removed duplicate registry `get`/`has` aliases and the unused Codex recovery
alias; and made DeepSeek-only worker enablement start the canonical worker loop.
No duplicate or unrelated file remains in the Phase 2 delta.

## Generic contract

`HarnessExecutorAdapter<TPrepared, THandle>` retains the already-merged methods:

1. `prepare(request, context)` validates and freezes adapter-private launch
   state;
2. `execute(prepared)` starts one exact execution and returns an opaque handle;
3. `collectResult(handle)` returns the provider-neutral executor result;
4. `cancel(handle, reason)` requests cancellation of that handle and reports
   whether a new request was issued;
5. `cleanup(handle)` disposes owned resources idempotently.

Capability discovery, validation, estimation, remote invocation construction,
and health remain supporting methods because current readiness and worker
composition already use them. The generic contract contains no local process,
DeepSeek patch, Codex JSONL, provider SDK, or credential-home fields.

Harness availability is explicit. A worker advertises only adapters that are
installed and explicitly enabled; worker composition and adapter resolution do
not construct, advertise, select, or substitute Codex as a fallback. An empty
registry is valid while every Factory execution worker mode is disabled, so the
orchestration service can remain healthy without a coding harness. Enabling a
Factory execution worker with zero configured adapters is a startup
configuration error, and no worker runtime is advertised.

Each adapter declares `generic-harness-contract/v1` and an all-`NONE` authority
profile. The registry rejects malformed identities, duplicates, authority
claims, backend/invocation mismatches, and disagreement between the concise
runtime capabilities and the full adapter-effective manifest. It also requires
an exact `harness-runtime-artifact/v1` advertisement and calculates its
canonical digest. An installed adapter with a different executable or image is
not the same admitted runtime.

## Identity and compatibility boundary

`factory-model-route/v2` is inference-only. It never contains an adapter,
harness manifest, effective configuration, executable digest, image digest, or
the legacy `CODEX_CLI` literal. Its canonical digest can therefore remain
stable when a qualified harness runtime changes.

Harness identity and behavior remain in `harness-capability-manifest/v1`. The
exact executable environment is a separate `harness-runtime-artifact/v1`
sidecar with a canonical digest. Persistent workers normally advertise an
`EXECUTABLE` adapter artifact. Remote execution freezes the immutable Sandbox
Profile `CONTAINER_IMAGE` as the execution artifact; the host-side adapter
executable remains a separate worker compatibility fact. Backend remains a
separate placement decision.

Mission Control admits only an immutable Factory Version that binds the exact
route digest, harness manifest digest, effective-configuration digest, runtime
artifact digest, and backend. These independent identities are not eligible as
an arbitrary Cartesian product. Factory qualification, readiness, dispatch,
claim, and result reconciliation must all agree on the same frozen tuple.
`factory-model-route-qualification/v2` records that compatibility tuple
explicitly alongside evidence and workload/risk scope; it does not move harness
or runtime identity into the V2 route snapshot.

## Capability manifest

`harness-capability-manifest/v1` describes effective adapter behavior, not all
features that an upstream harness might theoretically expose. It includes:

- exact harness, source commit, adapter, version, and effective configuration
  digest;
- admitted provider/model routes and reasoning controls;
- filesystem, shell, Git, browser, tools, and subagent support;
- event streaming, structured output, context, headless, cancellation, and
  cleanup behavior;
- sandbox, network, and credential requirements;
- telemetry availability, including explicitly unsupported values;
- maturity, supported backends, required external controls, prohibited
  authorities, and limitations.

Runtime artifacts are intentionally sidecars to this V1 manifest. Adding an
artifact field to an already-qualified V1 manifest would change its canonical
digest and silently invalidate historical Factory Versions. The sidecar keeps
the existing manifest bytes and digests immutable while allowing executable or
image identity to change independently and explicitly.

An executable sidecar may include `closureSha256` when the entry point loads an
installed dependency tree. The optional field is omitted, rather than encoded
as `null`, for artifacts without closure attestation so their existing
canonical digests remain unchanged. DeepSeek uses this field for its complete
installation-tree digest in addition to its preserved CLI-file digest.

The Factory Version stores the full manifest plus its canonical digest and the
effective configuration digest, execution runtime artifact and digest, inference-only
model-route snapshot and digest, and backend. The Attempt execution manifest
repeats that exact composition plus isolation and required generic
capabilities. A canonical worker must advertise the same adapter/version,
manifest digest, effective config digest, host adapter artifact, model route,
isolation, backend, and minimum capability levels before server-owned admission
succeeds. Its exact Factory Version binding separately attests the execution
artifact digest; for a remote Attempt that digest must also equal the frozen
Sandbox Profile and the independently observed sandbox environment image.

Legacy `factory-model-route/v1` snapshots remain readable only as frozen
historical identity. Their embedded Codex capability and runtime fields may be
used to reconstruct the exact sidecar for the Factory Version that already
froze them; they are not accepted when creating a new Factory Version and are
never silently upgraded to V2. Existing route and harness-manifest digests are
not rewritten. Legacy stored Factory versions may resolve the known exact
`codex/v1` manifest, but execution still requires a current worker registration
matching the frozen manifest, configuration, runtime artifact, model route, and
backend. Legacy host reports without this provenance remain readable but are
ineligible for new exact admission.

This static legacy resolution interprets compatibility metadata for an exact
stored identity only. It does not install, enable, register, advertise, or
select adapter code.

## Normalized result

Concrete adapters attach `harness-result/v1` to the existing `ExecutorResult`.
The bundle contains:

- execution status and timing;
- exact model-route digest, provider route, provider/model, reasoning controls,
  harness, configuration, runtime-artifact, and request provenance;
- changed files, Git baseline/head, and scope deviations observed by the host;
- bounded lifecycle events and tool activity;
- input/output/cache token usage, cost, model requests, retries, and session
  count where available;
- exit code, signal, cancellation, cleanup outcome, structured summary, output,
  and bounded scalar provider metadata.

Unavailable telemetry is `null`; adapters never manufacture a zero. Provider
metadata accepts at most 50 scalar entries with bounded keys and values. The
worker validates result schema and reconciles its model route (including
provider route and reasoning controls), runtime-artifact digest, and all other
identity fields against the frozen Attempt before storing a redacted, bounded
diagnostic artifact. Repository state is still recomputed by Mission Control,
and harness `COMPLETED` status never counts as verification evidence.
An adapter must translate every supplied provider-route and reasoning control
into its invocation or reject before starting the harness. It may not silently
drop a frozen inference control and then echo it as observed provenance.

## Concrete adapters

| Adapter | Exact runtime | Effective route | Backend and limitations |
| --- | --- | --- | --- |
| `codex/v1` | Codex CLI `0.146.0`, source `e363b08c9175ac1cbe5893615dd2cb9ddf95043b`, evaluated Darwin arm64 binary digest | `openai/gpt-5.6-terra`; controlled existing model pass-through remains explicit | Persistent worker and existing remote sandbox; cost/model-request/retry telemetry unavailable; cancellation is process-signal based |
| `deepseek-harness/0.2.0` | DeepSeek Harness `0.1.0-rc.5`, source `47f943859bef60e4160492346772ded9b24f765a`, exact built CLI and complete installed-tree digests | Ollama `0.32.6`, `local-ollama/qwen3.5:35b-a3b-q8_0`, exact model digest | Experimental persistent worker only; disabled unless explicitly enabled; full-tree integrity is recomputed during health and before spawn; weaker headless streaming, no cost, process-signal cancellation, host-enforced scope |

Both adapters use allowlisted child environments, owned process groups,
SIGTERM-to-SIGKILL escalation, canonical cancellation results, and idempotent
cleanup. Neither receives Mission Control service secrets, GitHub App
credentials, publication permits, acceptance authority, or unrelated
provider-admin credentials.

The integrated Codex identity remains `codex/v1` to preserve existing Factory
versions and Attempts. This compatibility ID is distinct from the standalone
lab adapter package version `0.2.0` used to establish conformance.

## Loom compatibility

Loom is **requires future work** at the runtime boundary.

- Clean fit: current executor identity, observations, learning source enums, and
  `.loom/**` configuration discovery are already provider-neutral.
- Adapter fit: an exact Loom runtime could implement the shared opaque lifecycle,
  manifest, normalized result, and health/remote invocation declarations without
  changing the worker control plane.
- Future work: there is no installed, pinned, authenticated real Loom runtime
  adapter in this repository, so cancellation, cleanup, result provenance,
  credentials, sandbox behavior, and model telemetry are unproven.

Loom fixtures remain contract and observability tests only. V1 does not register
or advertise Loom and does not destabilize its external path to claim parity.

## Product and data changes

- Basic Factory mode hides harness implementation detail.
- Intermediate shows a concise harness strategy alongside model, verification,
  retries, and backend.
- Advanced allows exact eligible selection and shows adapter/source identity,
  runtime artifact, backend, cancellation mode, telemetry availability, and
  limitations.
- Existing run inspection shows frozen model, harness, runtime/configuration,
  and backend provenance. No top-level navigation area is added.
- Factory Learning receives bounded harness identity as advisory metadata only;
  it cannot change routing or configuration.

Factory Version schema additions are optional for stored-record compatibility.
The canonical worker report adds exact manifest/config fields, so the public
`workspaceHostBindings.report` contract advances the dynamically extracted
runtime contract from `v26` to `v27`.

## Failure behavior and rollback

- Unsupported or stale exact identities never fall back to Codex.
- Experimental DeepSeek selection requires a current eligible worker at version
  creation and again at readiness, dispatch, and claim.
- Invalid configuration, spawn failure, timeout, cancellation, malformed output,
  normalized-result or runtime-artifact mismatch, scope deviation, or cleanup
  failure cannot reach publication.
- Independent Verification Attempts, exact-current receipts, and publication
  permits remain mandatory before GitHub App publication and acceptance.

DeepSeek can be disabled independently by clearing
`DEEPSEEK_HARNESS_EXECUTOR_ENABLED`. An orphan process, credential-redaction
failure, manifest mismatch, worker lease anomaly, or authority regression is a
rollback trigger.

## Deliberate V1 limits

- DeepSeek is developer-preview infrastructure and is not a remote-sandbox
  executor.
- The existing remote supervisor still has a Codex-oriented invocation/result
  wire contract even though admission and the host lifecycle are generic.
- Persistent Codex execution currently admits the exact evaluated Darwin arm64
  executable. Remote Codex execution instead binds the exact Sandbox Profile
  image and its separately frozen guest-toolchain evidence.
- Autonomous harness routing is not introduced. Factory Version selection keeps
  harness routing separate from model routing.
- `factory-model-route/v1` is a frozen legacy contract, not an input for new
  Factory Version composition.
- No live Loom conformance claim is made.
