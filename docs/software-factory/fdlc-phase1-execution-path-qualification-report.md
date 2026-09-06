# FDLC Phase 1 — Execution Path Qualification Report

Disposition: **BLOCKED_EXECUTION_ENVIRONMENT**.

The human decision is recorded: **retain the hard-budget requirement**. The
resource-only alternative in the prior report is not approved and will not be
used. Containment and pre-spend provider liability remain independent mandatory
gates. No available **integrated, qualified Factory execution path** currently
satisfies both. Under section 7 of this request, stop before dependent admission.

Recommend exactly one candidate for further qualification: **a local Docker-backed
Factory provider using a pinned Linux runtime image, read-only root filesystem,
private bounded tmpfs and no direct provider credentials or network from the
workload**. This is a proposed integration, not an admitted backend. The existing
Docker doctor is not that integration and must not be relabelled as one.

## Evidence and scope

New observations: 2026-09-05, approximately 16:52–16:55 UTC. Evidence directory:
`docs/testing/evidence/fdlc-phase1-execution-path-2026-09-05/`.

- [Infrastructure inventory](../testing/evidence/fdlc-phase1-execution-path-2026-09-05/infrastructure-inventory.json): live Docker identity, relevant cached images, read-only remote-provider readiness.
- [Local container canary](../testing/evidence/fdlc-phase1-execution-path-2026-09-05/local-container-canary.json): one actual existing diagnostic lifecycle, inspected controls, workload receipt and exact cleanup.
- [Nested-sandbox diagnosis](../testing/evidence/fdlc-phase1-execution-path-2026-09-05/nested-sandbox-diagnosis.json): controlled single/permissive-nested/restricted-nested OS tests.
- [Current scope](../testing/evidence/fdlc-phase1-execution-path-2026-09-05/scope-currentness.json): no eligible routes, execution profiles, sandbox profiles, code scopes, hosts or verifiers in the intended project.

[Final checks](../testing/evidence/fdlc-phase1-execution-path-2026-09-05/final-checks.json)
confirm exact canary absence, unchanged package/WO1 hashes and original backend
identity at 17:03 UTC.

Original reports, runtime reproduction and failed profiles remain unchanged.
The current source revision remains `f82fe1d98b156278c4fa0c0e2032008e2f010f39`;
no production code, runtime identity, budget policy or authority record changed
in this execution-path audit. Prior uncommitted work was preserved.

Intended scope remains project `sn71gskbdemgf4z1trt9zdmm5h8bde69`, tenant
`wx7ajfqrhbjn1rxfz4tc32mekx8b639n`, repository `k17wswvrva7ky172eej2w1nj858cbzt7`.
FDLC / Mission Control owns the pilot. Jarrett West retains the named Champion,
Human FDE / Operator and Incident Commander roles without combining any gates.

## Containment candidates

| Backend | Isolation | Runtime compatibility | Result | Evidence |
| --- | --- | --- | --- | --- |
| Current Darwin persistent worker | Native sandbox, host process; prior temp/resource escapes | Exact reproduced Darwin 0.146.0 | NOT QUALIFIED | Preserved admission reports, `codexExecutorAdapter.ts` |
| Restricted outer Seatbelt plus native sandbox | Outer default-deny write allowlist | Native starts in diagnostic broad-read mode; nested restricted path fails | NOT QUALIFIED; do not force this composition | New paired nesting tests plus prior native probe |
| Existing EXE_DEV remote sandbox | Separate Linux VM; restricted unprivileged workload, guest nftables | Cached certified-image candidate is amd64 and a different runtime/environment; Darwin binary cannot be reused | Provider access/capacity READY; required exact WO1 isolation/profile qualification absent | Read-only doctor; `exeDevSandboxProvider.ts`; retained network-policy evidence |
| Local Docker-backed provider — **recommended** | Docker Desktop Linux VM, container namespaces/cgroups, read-only image, private tmpfs, no host binds/socket, denied network | Linux runtime artifact must be separately reproduced/qualified; never inherit Darwin digest | Local diagnostic PASS; Factory provider and actual worker-path qualification MISSING | Actual canary; provider type permits only EXE_DEV/FAKE |
| Cached context-isolation image | Linux arm64 image with chroot entrypoint | Runs a separate Node/chroot environment; not reproduced Codex identity | NOT SELECTED; provenance/integration/qualification not established | Image inspection, no provenance labels; no matching source found in scoped source searches |
| Other dedicated VM/cloud mechanism | Potentially suitable structural boundary | Requires exact environment/runtime qualification | No available registered supported candidate located; no infrastructure created | No limactl/colima/qemu-system-aarch64/tart/orb on PATH; scoped profile inventory empty |

The VM/cloud row describes the limits of the inspected environment, not a claim
that the operator owns no other infrastructure. No unapproved cloud provider was
enabled and no remote VM was allocated.

### Required capability comparison

“Candidate design” is not a pass. “Historical” is not current WO1 evidence.

| Requirement | Current Darwin | EXE_DEV supported path | Recommended local Docker candidate |
| --- | --- | --- | --- |
| Filesystem isolation | Fails required prior boundary | VM + guest restricted account; exact pilot proof absent | Diagnostic RO root/no binds PASS; full worker matrix absent |
| Runtime read-only | Writable-open failures | Historical guest identity/modes; exact WO1 runtime absent | RO image structurally available; Codex image absent |
| Private bounded temp | Prior global-temp escape | Dedicated guest path; qualified WO1 bound absent | Actual 16 MiB private `/tmp` tmpfs in diagnostic |
| Process isolation | Host process namespace | Guest process isolation | Separate PID namespace, dropped caps and PID bound in diagnostic |
| Secret/environment isolation | Not admitted | Scoped broker/guest design | Diagnostic has no inherited secret/env or host mount; provider path pending |
| Network/egress | Not admitted | Guest-enforced; provider-enforced isolation unavailable in retained evidence | `network=none` actual canary; approved inference transport not implemented |
| Subprocess inheritance | Required complete proof absent | Historical guest controls | Kernel container boundary available; full native tool matrix absent |
| Runtime 0.146.0 | Exact Darwin bytes reproduced | Different Linux artifact needs qualification | Different Linux artifact needs qualification |
| Cancellation | Existing owned-process mechanism | Existing provider cancel/terminate contract | Doctor exact teardown only; worker cancellation not integrated |
| Cleanup | Earlier fixture cleanup only | Provider lifecycle/reconciler source | Actual doctor cleanup verified; canonical Attempt recovery absent |
| Lease/fencing | Existing worker machinery, no admitted host | Existing canonical remote worker path | Missing Docker provider integration with canonical lease/fence |
| Reproducible identity | Native digest known; environment not qualified | Pinned historical image; no exact pilot tuple | Engine/image diagnostic identity known; no native execution-profile identity |
| Provider path compatibility | Saved-auth budget unsupported | Existing OpenRouter broker, hard liability unproven | Narrow mediated provider path required; no direct credential/network escape |

### Exact available infrastructure

Docker context: `desktop-linux`, local Unix socket; Docker Desktop 4.88.1
(237512), Engine 29.7.2, Linux arm64, kernel 7.0.12-linuxkit. Runtime components
were inspected read-only. Other running containers were not stopped or changed.

The approved doctor image is
`alpine@sha256:a2d49ea686c2adfe3c992e47dc3b5e7fa6e6b5055609400dc2acaeb241c829f4`.
One canary ran as UID/GID 65534, dropped all capabilities, enabled no-new-privileges,
used a read-only root, no host bind mounts, no ports and network none; memory
128 MiB, CPU 0.5, PID limit 32; `/tmp` 16 MiB and `/output` 1 MiB tmpfs. It proved
root-write denial, denied network, private output writes and exact lifecycle
cleanup. **It did not run Codex or a Factory Attempt.** These tiny doctor resource
limits are not proposed as sufficient for the real runtime.

Cached remote image:
`sha256:41a66f1d6f7b90618a6c58fb9a1a336ef69ab2794fc1322233e4a5d9788782b8`,
Linux amd64, with MissionControl source label. Cached unrelated context candidate:
`sha256:cb09d022acc4661c1818b34de3d5bce6a0886f1f1cf61c87d6ddc2d772f9a7fc`,
Linux arm64, chroot/Node entrypoint. Image presence does not establish reviewed
provenance, expected behavior, route approval or WO1 eligibility.

Read-only EXE_DEV doctor: authenticated, 0 VMs, capacity 50, billing readable,
no automatic integrations. This updates availability only. Retained
`remote-sandbox-blocker-remediation-v1/network-policy.md` documents guest nftables
and lack of provider-enforced egress. The current scope has no eligible sandbox
profile or final repository classification; capacity cannot waive those gates.

### Precise nested-sandbox diagnosis

New controls returned:

| Control | Result |
| --- | --- |
| `/usr/bin/true` | Exit 0 |
| One allow-default Seatbelt layer → true | Exit 0 |
| Allow-default outer → allow-default inner → true | Exit 0 |
| Restricted deny-default outer → identical inner → true | Exit 71, `sandbox_apply: Operation not permitted` |

Therefore **B, universal unsupported nesting, is not established and is contradicted
by this permissive control**. The evidence points to **A/D: a restriction in the
chosen outer profile blocks a primitive required by the inner sandbox**. No missing
Linux capability is implicated in this Darwin experiment. The exact operation
remains unidentified; guessing one would overstate diagnosis. Local SDK comments
on legacy sandbox_init are not a substitute for the observed behavior of this
sandbox-exec implementation.

This does not reinterpret earlier native failures: those exact restricted profiles
still fail. Nor does permissive nesting qualify containment. Per the human decision,
do not loosen the outer boundary or inner sandbox to obtain success. The recommended
design puts the workload in an isolated backend with one coherent policy; native
sandbox compatibility must still be demonstrated, not bypassed.

### Containment result and stop

**BLOCKED_EXECUTION_ENVIRONMENT**. Source `SandboxProviderKind` currently admits
only EXE_DEV and FAKE; the architecture explicitly labels local Docker doctor
non-executable for a governed Factory Attempt. No actual Docker Factory provider,
frozen profile, native runtime image, host session or worker-path receipt exists.
Thus no complete `Mission Control → backend → host → runtime → tool → filesystem`
qualification can be issued from the canary. This is an integration/qualification
blocker, not evidence that Docker lacks isolation primitives.

Under the requested stop rule, dependent qualification does not proceed. A new
provider integration is not silently represented by the existing diagnostic.

## Budget candidates

Human contract now unambiguously requires **preventing consumption beyond the
approved liability before excess spend**, expressed as a proven token/request
bound and/or provider monetary boundary. Attempt/time/retry ceilings alone are
not equivalent. Numeric pilot amounts remain proposals until governed approval;
unknown actuals remain unknown but cannot stand in for a finite liability ceiling.

| Route/provider candidate | Hard bound capability | Usage provenance | Result | Evidence |
| --- | --- | --- | --- | --- |
| Existing `codex/v1` saved-auth OpenAI path | No propagated hard token cap; opaque internal requests/retries | Token events; no authoritative cost/request/retry telemetry | BLOCKED_HARD_BUDGET | Adapter, manifest, preserved rejection test |
| Existing remote OpenRouter broker | Sends per-key `limit` and `expires_at`; no local request-liability hold/check | Revocable key identity; provider results can contain usage | Hard no-overrun guarantee not established; do not equate key limit to proof | `sandboxCredentials.ts`; provider docs below |
| OpenRouter workspace budget | Rejects later requests after spend reaches limit; in-flight overrun documented | Workspace usage pipeline | Insufficient alone for strict invariant | Official workspace-budget documentation |
| OpenAI organization/project hard limit | Configurable enforcement exists; propagation overrun documented | API usage/request IDs when available | Insufficient alone; no qualified pilot API project/route | Official current spend-limits documentation |
| Existing generic OpenAI/Claude model-router adapters | Explicit request output cap, but input estimation and unversioned price constants | Response usage; source model/request fields vary by adapter | Potential narrow mediator seam; not a Factory-exact route or liability boundary | `packages/model-router/src/providers/*`, cost estimator/router |
| Experimental local Ollama/DeepSeek path | No external paid API liability if truly local; separate compute/resource contract still required | Request/retry events supported, cost unsupported | Not an approved substitution; distinct disabled harness/runtime/model, no eligible scoped route | DeepSeek adapter and manifest |

“Existing in source” is not “already approved for this project.” Refreshed exact
composition options return zero model routes; no available approved WO1 route was
found. Legacy healthy catalog names are not exact route/price/authority receipts.
No new provider was enabled, no key minted, and no account/project spending setting
was changed.

### Provider-path details

| Path | Output/input controls | Retry and account controls | Pricing, cancellation and identity limits |
| --- | --- | --- | --- |
| Codex saved auth | Adapter rejects maxTokens; total context not bounded before calls | Native requests/retries opaque; Attempt termination only | Cost UNKNOWN; observed harness/model provenance is not independent provider billing confirmation |
| OpenRouter remote | Broker limits key USD/expiry; Codex invocation does not establish a total request liability bound | Key revoke has historical propagation delay; no atomic local request reservation | Existing result telemetry/response identity must bind exact pinned provider/model and price; cancellation cannot release unresolved liability |
| Generic OpenAI | `max_tokens` included; estimator uses `ceil(text.length/4)` | No atomic reservation/concurrency/unknown-result hold in source provider | Hardcoded gpt-4o/gpt-4o-mini prices are not a current versioned price contract; response ID exists, source normalization needs exact identity audit |
| Generic Claude | `max_tokens` included; no proven total-input upper bound | No integrated pre-spend reservation | Must account for cache/billing/reasoning semantics and exact model before admission; present API code is insufficient |
| Local Ollama | Separate local context/output controls must be verified | No external-provider spend only if network/path proves that restriction | Not zero overall execution cost; no silent provider substitution |

Official documentation supports the distinction:

- OpenRouter's [key creation API](https://openrouter.ai/docs/api/api-reference/api-keys/create-a-new-api-key) exposes a spending limit, but that schema alone does not establish a zero-overrun concurrent/in-flight guarantee.
- OpenRouter [workspace budgets](https://openrouter.ai/docs/guides/features/workspaces/workspace-budgets) explicitly allow already-dispatched requests to finish and spend to exceed the configured budget. This finding concerns workspace budgets; it is not invented evidence that every key-limit implementation behaves identically.
- OpenAI's current [spend-limit documentation](https://developers.openai.com/api/docs/guides/spend-limits) supports enforceable organization/project limits but documents delayed enforcement and possible overrun. It would be inaccurate to say all OpenAI project limits are only alerts; it is also inaccurate to call this mechanism a strict zero-overrun per-Attempt bound.

No numeric current price or project-level guarantee was inferred from static
adapter constants or a UI label. Provider contract evidence and exact scope are
missing, so a fake-provider pass cannot establish the real liability bound.

### Narrow liability boundary required

The existing source contains a possible integration seam, not a finished governed
gateway. A minimum future boundary would retain the provider credential outside
the workload; reject direct provider egress; validate exact route, model/provider,
price version, request types and input construction; reserve worst-case liability
atomically before transmission; and retain that hold until authoritative settlement.
It must cover all provider fees, output/reasoning/cache/tool charges and each retry.
No fallback/alias may select a model or price outside the frozen bounds.

Use the invariant, in integer monetary units:

`settled liability + unresolved in-flight holds + proposed worst-case request liability <= approved cap`.

The proposed request term may only be computed from proven upper bounds, not
four-characters-per-token estimates. If a full provider context-window bound plus
a supported output bound supplies a conservative finite maximum, its applicability
to the exact request and billing model must be demonstrated. If price, input,
reasoning, retries, tools or unknown-result charges cannot be bounded, deny the
request. Do not reserve a small estimate and permit a larger actual request.

Unknown outcomes retain their full hold. Concurrent requests serialize the
reservation check/update. Duplicate provider receipts settle once; late usage
remains appended/reconciled. Cancellation or a lost HTTP response is not proof
of zero liability. Expiration stops new requests; it does not release in-flight
holds automatically. These are required semantics, not implemented authority.

No narrow gateway code was added after the execution-environment stop: there is
no approved exact provider route/price contract or integrated worker environment
to bind it to. Implementing a generic counter and calling it qualified would
manufacture the missing guarantee.

Budget result on inspected paths: **BLOCKED_HARD_BUDGET**.

## Selected candidate and exact identity status

Selection is **local Docker-backed Factory provider**, one candidate only. Its
implementation must reuse the canonical remote-runtime lifecycle/journal/fencing
interfaces, with a real new provider/backend identity and guarded explicit worker
construction. It must not be named EXE_DEV or FAKE to bypass existing validation.
A containerized Linux Codex artifact is a new material platform identity even if
its version string is 0.146.0. Its executable/package/image digests, behavior and
harness compatibility require separate qualification. The retained Darwin digest
`ae1d3ffe6d48aec6a4dc3f50e7eb8e0d11962485a6a9406c5a7012139383da02` is not reused.

| Exact component | Current identity / blocker |
| --- | --- |
| Execution Profile | NONE; new candidate must bind image/runtime/worker policy |
| Runtime Artifact | Existing Darwin 0.146.0 retained; Linux artifact UNQUALIFIED |
| Execution Backend | Proposed Docker provider; not in current EXE_DEV/FAKE provider contract |
| Host | Docker engine identity observed; no admitted Factory host/session |
| Containment | Doctor policy evidenced; actual native worker policy NONE |
| Model route | NONE admissible in project |
| Provider adapter | Existing candidates audited; no qualified pre-spend boundary |
| Hard budget policy | Human strict liability requirement retained; no enforceable route-specific implementation |
| Reservation | NONE; no exact subjects, price identity, expiry or settlement receipt |
| Verifier | NONE; no independent admitted execution environment |
| Factory Version / qualification | NONE; must not be created before both hard gates |
| Plan / WorkOrder | No approved/authorized live subject; WO1 remains design ordinal |
| Readiness | NOT ISSUED; no exact tuple or expiration |

## Negative controls and evidence limits

| Containment requirement | Evidence / result |
| --- | --- |
| Allowed workspace read/write, required runtime reads | Actual Codex worker NOT RUN; doctor output tmpfs writes PASS only |
| Private temp | Docker inspected bounded private tmpfs PASS; native worker NOT RUN |
| Host root,/etc,home,.ssh,.aws,.config,sibling/parent repos/global temp | No host bind mounts in doctor; full actual-worker read/write attack matrix NOT RUN |
| Runtime/policy mutation | Doctor root write DENIED; exact Linux Codex/runtime/config matrix NOT RUN |
| Symlink/subprocess escape | NOT RUN on actual worker |
| Process interference | Doctor PID isolation/limits inspected; actual worker attack NOT RUN |
| Unauthorized network | Doctor egress test DENIED with network none; exact mediated provider path absent |
| Cancellation, lease, cleanup | Doctor cleanup PASS; real Docker Attempt cancellation/fencing/recovery NOT RUN |

| Budget negative control | Result |
| --- | --- |
| Missing/expired reservation | No governed request boundary/subject; NOT RUN |
| Wrong WO/route/provider | Exact scoped route absent; NOT RUN |
| Request or retry exceeds remaining liability | Existing estimate/Attempt tests are not worst-case provider proof; NOT RUN |
| Concurrent requests cannot oversubscribe | Atomic request-liability ledger absent; NOT RUN |
| Duplicate usage receipt settles once | Provider-specific receipt settlement contract absent; NOT RUN |
| Late usage remains visible | Required; NOT RUN on qualified path |
| Unknown result does not release liability | Required; no qualified implementation to test |

A full negative-control suite is not claimed. No placeholders were created to
obtain green results. Earlier tests remain preserved under their original scope.

## Remaining admission and stop

The environment's required Factory integration and qualification are absent.
Per the explicit stop rule, stop here with preparation records only. Retain the
independent hard-budget blocker. Future work on the one recommended candidate
must prove actual worker isolation, qualify the Linux runtime separately, supply
an approved exact provider/price contract, implement and test the narrow pre-spend
boundary, then qualify reservations and independent verification. Only afterward
may governed host/route/Factory/readiness authority be considered.

No model call, real WorkOrder execution, provider-key creation, remote VM allocation,
pilot candidate, pilot PR, publication, merge, release, deployment or Phase 2
expansion occurred. One pre-existing local diagnostic canary was run and removed;
it is neither a worker nor WorkOrder 1. Original backend and runtime are preserved.

Final disposition:

**BLOCKED_EXECUTION_ENVIRONMENT**
