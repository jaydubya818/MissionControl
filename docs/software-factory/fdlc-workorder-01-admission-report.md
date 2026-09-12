# FDLC Phase 1 — WorkOrder 1 Admission Report

Recommendation: **NO_GO**. Admission bootstrap observed 2026-09-05 07:17–07:18 UTC.
This is a static assessment, not a WorkOrder readiness snapshot or authorization.
The exact pinned runtime was reproduced; a complete admissible execution tuple
could not be formed. Stop at host containment and the unresolved budget contract.

## Authority and unchanged pilot

Owning team: **FDLC / Mission Control**. Champion, Human FDE / Operator and
Incident Commander: **Jarrett West**. These intentionally overlapping human roles
do not combine Plan approval, WorkOrder authorization, independent verification,
acceptance, publication, merge, release, containment, cost, security or rollback gates.
Named roles do not constitute missing live membership or permission records.

WO1 remains the one-link repair in `docs/guides/RUN.md`, from
`../README.md#software-factory-demo-local-end-to-end` to
`../../README.md#software-factory-demo-local-end-to-end`. No candidate was created.
The [execution proposal](fdlc-phase1-execution-proposal.md) remains the workload,
acceptance and rollback design; ten accepted pilot WorkOrders must still span
BUG_FIX, FEATURE, REFACTOR and SECURITY_POLICY. Documentation-first applies only
to WO1; it does not redefine the cohort.

## Evidence index

All new evidence is under
`docs/testing/evidence/fdlc-phase1-admission-bootstrap-2026-09-05/`:

- **R**: [runtime-containment.json](../testing/evidence/fdlc-phase1-admission-bootstrap-2026-09-05/runtime-containment.json), actual executable startup and synthetic sandbox probes.
- **P**: [package-files.json](../testing/evidence/fdlc-phase1-admission-bootstrap-2026-09-05/package-files.json), SHA-256 inventory of every extracted package file.
- **L**: [live-scope.json](../testing/evidence/fdlc-phase1-admission-bootstrap-2026-09-05/live-scope.json), refreshed read-only responses from the original backend.
- **S**: `packages/workflow-engine/src/harnessManifests.ts`, `apps/orchestration-server/src/codexExecutorAdapter.ts`, `convex/lib/modelRouteAdmission.ts`, at source HEAD `f82fe1d98b156278c4fa0c0e2032008e2f010f39`.
- **T**: [verification.md](../testing/evidence/fdlc-phase1-admission-bootstrap-2026-09-05/verification.md), bounded offline adapter tests and limitations.

These files are observations, not issued Factory or host qualification receipts.

## Component admission table

| Component | Exact Identity | Qualification | Evidence | Currentness |
| --- | --- | --- | --- | --- |
| Control plane | `local-jaydubya818-missioncontrol_df0fe`; localhost:3214; contract 40; binary `precompiled-2026-08-25-7cce8fb` | Identity and scoped reads PASS; deployed source SHA UNKNOWN | L; prior preflight backend-startup evidence | Observed 07:18 UTC; recheck before admission |
| Factory Version | NONE; definition `md7t93bxm0f2y6x9c9j7k20ted8ckfge` | BLOCKED; DRAFT, latestVersion 0, versions empty | L | Current at observation; no frozen version |
| Factory qualification | NONE | BLOCKED; assessments empty | L | No receipt/currentness to assess |
| Model route | NONE in intended scope; modelRoutes empty | BLOCKED; legacy model names are insufficient | L, S | No exact route/digest/receipt |
| Harness | `codex/v1`; `codex-cli@0.146.0`; commit `e363b08c9175ac1cbe5893615dd2cb9ddf95043b`; manifest `sha256:7e8b7435f6dab9a8a9a09b90ae1791110c3593ad1b38cdc48227d18069ec1c06` | Historical manifest exists; WO1 tuple qualification BLOCKED | S, R, T | Source identity retained; not live admitted configuration |
| Runtime | `codex@0.146.0`, EXECUTABLE; native SHA-256 `ae1d3ffe6d48aec6a4dc3f50e7eb8e0d11962485a6a9406c5a7012139383da02`; artifact digest `sha256:dbd2a09c812ba8b2a5b5425f5386b0c65b2a399e40813374597d20bcfcd855fc` | Exact reproduction and startup PASS; admission remains conditional on host/containment | R, P | Temporary isolated extraction; rehash and provision durable governed location before registration |
| Execution backend | Candidate adapter compatibility key `persistent-worker`; no admitted profile or worker instance ID | BLOCKED; not the Convex service | L, S | No session/lease or qualification |
| Host | NONE; intended project `sn71gskbdemgf4z1trt9zdmm5h8bde69`, tenant `wx7ajfqrhbjn1rxfz4tc32mekx8b639n` | BLOCKED_CONTAINMENT; host list empty | L, R | Local machine observation is not a scoped registration |
| Containment | Existing source profile `mission-planner-contained` is read-only; no admitted WO1 mutation profile/digest | BLOCKED_CONTAINMENT | R, S | Partial offline proof only; no mutation host receipt |
| Verifier | NONE; separate execution/configuration identity required | BLOCKED; verifier list empty | L | No subject-bound receipt or freshness |
| Budget | NONE; proposal $2/WO1 split $1 producer/$1 verifier, $20 cohort | BLOCKED; exact tokens unsupported; liability UNKNOWN | S; budget section below | Proposal only; no approved policy revision |
| Reservation | NONE | BLOCKED; no valid budget contract or real WO subject | S | No expiry, settlement or reservation ID |
| Repository | `k17wswvrva7ky172eej2w1nj858cbzt7`; `jaydubya818/MissionControl`; proposed base `9a80cf3c5cc229bb4a552a9f08ddda5841e70a38` | Workload/base identified; execution scope/classification and final approval BLOCKED | L; execution proposal and preflight | Proposed historical base; not authorized current candidate |
| Plan | NONE; no approved live Plan ID/revision | BLOCKED | Preflight; no subject created here | Cannot issue revision-bound readiness |
| WorkOrder | NONE; WO1 is design ordinal, not a database ID | BLOCKED | Preflight; no subject created here | No revision, Attempt or dispatch |

## Runtime resolution — path A, exact reproduction

The pin is an evaluated artifact requirement, not an arbitrary version preference.
`CODEX_HARNESS_EFFECTIVE_CONFIG`, `CODEX_V1_RUNTIME_ARTIFACT`, native digest map,
health check and pre-spawn identity check agree on 0.146.0. Git history locates
the generic harness introduction at `d84f55a` and identity separation at
`9a80cf3`. `docs/architecture/generic-harness-contract-v1.md` records Darwin arm64
qualification and the standalone `openai/gpt-5.6-terra` conformance scope.
Historical planning and route evidence under
`docs/testing/evidence/governed-planning-agent-v1/` binds earlier 0.146.0 runs;
it does not qualify this new host/route/WO1 tuple or turn failed delivery into success.

Reproduced the official npm alias target `@openai/codex@0.146.0-darwin-arm64`.
The parent package's optional dependency named `@openai/codex-darwin-arm64` is
an npm alias, not a separately published package of that version. The first
lookup of that separate name returned 404; the correct alias target succeeded.
Archive: `https://registry.npmjs.org/@openai/codex/-/codex-0.146.0-darwin-arm64.tgz`.
SHA-512 archive integrity was recomputed and matches registry metadata:
`sha512-nb61yX4r5L6Z0dlC4o3u0GAK1YCd4TUvjaB382bajDoh84V+uv2hTBIVZ++fgXWV9yoeuNrNnNcn7GoTGOe2Tg==`.
Registry signature metadata was available; no independent signature verification
is claimed. Native SHA-256 independently matches the repository's frozen pin.

Executable:
`/tmp/fdlc-runtime-0146/package/vendor/aarch64-apple-darwin/bin/codex`.
Platform observed macOS 26.6.2, arm64; package target aarch64-apple-darwin.
Native direct invocation avoids adding a Node wrapper dependency to the probe.
P records bundled code-mode host, rg, zsh and package metadata digests.
Host OS libraries are not a reproducible image and are not independently pinned.
Startup `--version` returned exit 0 / `codex-cli 0.146.0`; temporary-home helper
alias warning is retained, not concealed. The binary is not registered or made
the global default. Existing global 0.153.3 native digest remains
`0e1f892695844ad0798dab8895955846450a9e7663476ebf24615814dd377216`.
Why that global upgrade occurred is **UNKNOWN**: package presence is not updater
or operator provenance. No attribution is invented.

Execution interface remains headless `exec` JSONL, ephemeral, approval never,
ignore user config/rules, result contract `factory-result/v1`. Supported source
capabilities include repository mutation, structured output, tool/token events
and process-signal cancellation. Path allowlists, credential scrubbing and
cancellation are PARTIAL. Exact provider-request counts, internal retry counts,
monetary telemetry, resume, durable event replay and MCP are unsupported.
Subagent capability is partial in the manifest; it is not enabled by this task.
External owned process groups, repository isolation, canonical leases,
independent verification and publication permits remain required.

## Host and containment stop

R uses only synthetic files and isolated HOME/CODEX_HOME; no real credentials,
unrelated repository contents or provider data were accessed. The exact native
binary's existing planning profile allowed the fixture workspace read, denied
an outside read directly and through a child shell, and denied workspace writes.
Fixture cleanup succeeded. That is useful read-only profile evidence, but WO1
requires mutation. It cannot admit the producing host.

The attempted mutation sandbox diagnostic using `sandbox_mode=workspace-write`
exited 2 because `codex sandbox` requires an explicit permission profile. This
is **an invalid probe invocation, not proof that mutation containment passed or
failed**. It did not execute its canary. The adapter's `exec --sandbox
workspace-write` path has not been exercised here because `exec` would invoke a
model. Source `commandArguments` selects the strict workspace-only profile as
read-only; ordinary mutation uses the broader sandbox path and prompt/path
reconciliation. Neither source inspection nor a blacklist proves the user's
required preventive boundary. No new permission policy was substituted.

Consequently unrelated credentials, non-fixture repositories, outside writes,
egress policy and authority-preserving mutation subprocesses remain UNPROVEN
for the actual producing path. Network false configuration is not an egress
test. The read-only deny patterns do not constitute WO1 qualification.
Registration and all downstream qualification stop here.

Minimum technical closure: add a dedicated allowlisted mutation permission
profile to the actual adapter path, with exact digest and narrowly provisioned
workspace/environment; expose a no-model qualification invocation using those
same resolved permissions. Prove allowed write and required reads, outside
file/repository/credential read denials, outside write denial, child-process
boundary preservation, scoped environment, network policy, cleanup, cancellation
and lease revocation. Runtime/provider authentication must be isolated from tool
processes. If this cannot be achieved locally, a separately qualified environment
is required. Do not promote the existing read-only profile or an ad hoc fixture
profile as the mutating execution configuration.

No host registration was manufactured. A future signed, project-scoped host
report must bind the runtime digest, execution profile, repository scope, worker
session/fencing epoch, workspace/dependency preparation, cancellation/cleanup,
containment evidence and current heartbeat. Starting the generic worker merely
to obtain registration risks claiming existing work and was not done.

## Draft audit, verifier and dependency handling

The live definition contains only SOFTWARE purpose, repository/project scope,
name, DRAFT status and historical creator; it does not resolve a workload class,
model route, harness/runtime/backend locks, host requirements, verifier, policy,
budget or acceptance/verification contract. Empty composition options confirm
those components cannot be frozen now. Do not mutate historical qualified
versions or borrow canary registrations. Preserve this definition until exact
eligible inputs exist and human authority is bound through governed records.

One physical host may be acceptable **only if** separate producer/verifier
execution identities, workspaces, context, permissions and evidence authority
are enforced and tested. This machine has no such qualified pairing, so same-host
eligibility is UNDETERMINED, not approved. Jarrett's overlapping human roles do
not authorize a producer to attest its own candidate. Independent verification
must bind repository/base/candidate/tree, real WO revision and Plan revision,
Factory/configuration identity and freshness; recompute acceptance from a clean
checkout, not producer claims. Wrong candidate, wrong commit, wrong WO, stale
candidate and mismatched Plan must reject before a receipt is accepted.
Prior dependency rehearsals are preserved, not treated as verifier admission.

No runtime→host dependency was bypassed. Reservation needs a real governed WO
subject, while dispatch/readiness needs the valid reservation. This can be
resolved by creating a non-dispatched governed subject after valid configuration
and Plan approval; it does not justify using fake IDs or dispatching to get an ID.
The current task has not established the prerequisites to do so.

## Budget decision — retain the hard gate

`codex/v1` rejects `reasoningConfig.maxTokens` rather than silently dropping it.
Provider-call and internal retry counts are not exposed; they cannot be
claimed bounded by a single CLI process. One producer Attempt, one verifier
Attempt, zero Mission Control automatic retries, one concurrent slot and 15
minutes each are useful proposed orchestration limits. They do not enforce
provider request count, context/output tokens or a provider billing ceiling.

Existing route policy supports `FULL_APPROVED_WORK_ORDER_CAP_RESERVATION`,
`FULL_ESTIMATE`, USD, evidence-bound positive estimates and actual cost telemetry
MEASURED or explicitly UNAVAILABLE with a reason. That permits truthful unknown
accounting; it does **not** establish a waiver of the pilot's exact token gate
or prove $2 bounds provider liability. There is no valid bounded reservation to
create now. Scope, WO/Attempt eligibility, expiration and settlement remain
unbound; UNKNOWN liability must not settle to zero.

Decision proposal for explicit approval, **not applied**: if the operator elects
to keep this runtime despite absent token enforcement, a revised pilot budget
policy would need to explicitly replace the hard token requirement with the
above orchestration limits and an approved $2 accounting reservation, while
accepting UNKNOWN provider monetary liability and unbounded/unmeasured internal
request/retry/token dimensions. This is weaker than the current requirement and
is **not recommended for admission**. There is no evidence-backed equivalent
alternative cap on this runtime today. Recommended closure is a separately
qualified path with enforceable token/provider cost dimensions, retaining the
current hard gate until demonstrated. No policy, validator or budget changed.

No live provider qualification is proposed yet: model/provider selection is
unresolved because there is no eligible route. Calls authorized/performed here:
zero; repository data transmitted to a model: none. Once containment and budget
are valid, any necessary live route probe requires a separate exact proposal
naming provider/model, call count, bounded data, expected cost/uncertainty and
requested/observed identity, accounting and receipt evidence. A guessed model
call cannot solve these earlier blockers.

## Negative controls

| Requested rejection | Evidence and result for this task |
| --- | --- |
| Wrong runtime | Recovered runtime version PASS; global version mismatch identified. Separate live tuple rejection NOT RUN |
| Wrong runtime digest | Existing offline adapter drift test PASS: rejects before harness runner; not live host admission |
| Wrong host / stale host | NOT RUN on candidate tuple: no registered host/session |
| Containment failure | Admission withheld. Read-only direct/child outside-read denials PASS; mutation probe invalid; mutating containment UNPROVEN |
| Wrong harness | NOT RUN on candidate tuple: no qualified composition |
| Wrong route / same model, wrong route | NOT RUN on candidate tuple: zero routes; model-name match not accepted |
| Wrong backend | NOT RUN on candidate tuple: no execution profile |
| Wrong verifier / stale verifier | NOT RUN on candidate tuple: no independent verifier |
| Missing budget | Gate remains BLOCKED; offline unsupported-control rejection test PASS, no waiver |
| Expired reservation | NOT RUN on candidate tuple: no valid reservation |
| Wrong Factory Version / stale qualification | NOT RUN on candidate tuple: neither exists |
| Mismatched WO revision / Plan revision | NOT RUN on candidate tuple: no real subjects |
| Wrong verification candidate / commit / WO / stale candidate / Plan | NOT RUN on candidate tuple: no verifier. Required before qualification |

Four selected existing adapter tests passed, ten skipped. They cover executable
drift rejection, unsupported exact controls, child environment filtering and
strict planning invocation. They are deterministic source tests, not a fabricated
all-green candidate qualification. Every NOT RUN item remains an open admission
requirement. No complete negative-control suite is claimed.

## Readiness result and remaining blockers

**NOT ISSUED.** No `workOrders:readiness` call with invented IDs; no manual READY.
There is no subject-bound issuance time, expiration or dispatch authorization.
A future snapshot must bind all table identities plus policy, repository revision,
Plan/WO revisions, receipt and reservation currentness; refresh on any change.
The UI's 30-second stale-snapshot rule does not turn this report into readiness.

Remaining closure order:

1. Prove and admit the mutation containment path; provision the exact reproduced runtime durably and qualify one scoped host.
2. Qualify harness and execution backend against that host, including lease, cancellation, preparation and cleanup evidence.
3. Establish the minimal exact eligible model route and separately scoped verifier; retain any required live-call approval boundary.
4. Resolve enforceable budget policy and bind a bounded governed reservation after its real subject exists.
5. Compose and qualify the exact Factory Version, then complete governed Plan/WO decisions and every tuple negative control.
6. Issue current readiness and return for separate human execution approval.

The original Convex service is preserved. Global runtime is unchanged. No model
call, pilot candidate, WorkOrder dispatch, worker claim, pilot PR, publication,
merge, release, deployment or Phase 2 implementation occurred. The isolated
runtime remains in temporary storage for inspection; fixture workspaces were
removed. No application code or frozen identity was changed.

Final recommendation:

**NO_GO**

## Admission closure — 2026-09-05

See [WorkOrder 1 Admission Closure Report](fdlc-workorder-01-admission-closure-report.md).
Three no-model candidate mutation matrices exposed unauthorized global-temp and
runtime writable-open authority; no runtime bytes changed. The hard-token request
is rejected before process start. Both hard gates remain blocked; dependent
authority and readiness remain unissued. WO1 was not executed.
