# FDLC Phase 1 — Docker Execution Path Qualification Report

Updated 2026-09-05. Current boundary: **QUALIFICATION_AWS_IDENTITY_REQUIRED**. Provider/model selection is resolved.
WO1 readiness: **NOT_ISSUED**. Full execution-path qualification: **INCOMPLETE**.

The Product Owner approved AWS Bedrock, `us-east-1`, model `anthropic.claude-sonnet-4-6`, foundation-model ARN `arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-sonnet-4-6`, in a dedicated qualification account/project only. Selection is resolved. The four required inputs are the approved qualification AWS account ID, approved project/environment identifier, approved role ARN or authoritative configuration location, and confirmation of the allowed Bedrock execution topology. They remain unresolved. Locally discovered AWS credentials, profiles, cached sessions and unrelated account configuration must not be used. No account, provider, region, model or inference profile was substituted. No model-call authorization is inferred.

The owning team remains **FDLC / Mission Control**. **Jarrett West** remains champion, Human FDE / Operator and Incident Commander. These assignments do not combine any approval, authorization, independent verification, acceptance, publication, merge, release, containment, cost, security or rollback gates.

## Preserved history

The original **NO_GO, 43 focused tests, 13/14 gates**, old image, failed nested sandbox probe, v40/v41 divergence, prior admission reports and original implementation hashes are historical evidence. They have not been overwritten. A checksum manifest and a copy of the original report/evidence are under [closure history](../testing/evidence/fdlc-phase1-docker-execution-path/closure-2026-09-05/history/). Earlier closure probe failures also remain in the closure directory.

New evidence is under [closure-2026-09-05](../testing/evidence/fdlc-phase1-docker-execution-path/closure-2026-09-05/). The original target `docs/guides/RUN.md` is unchanged: SHA-256 `0672a5c2cd49b36550cdc2989ff7400ed3c6a55b81e51c46bfddda9de8fd3b88`.

## Current result

| Area | Evidence | Qualification limit |
|---|---|---|
| Repository/System gates | **19/19 PASS** on the reconciled working tree, against current-main `0d1a0908cce380d815069ce0a59e1604d2f26ece` | Includes full tests, lint, build, security, current contract, historical evidence, verifier contracts and startup smoke. This is not post-merge or WO1 admission evidence. |
| Docker/legacy offline ledger | **51 tests PASS**, including actual Factory worker execution, cancellation, frozen timeout, missing-image failure, inference denial, restart teardown and actual worker-process death | Mocked control-plane subjects and disposable repository. No live producing Attempt. |
| Native runtime | **27 actual-container checks PASS**, including an actual Codex tool call driven by an in-container loopback Responses fixture | No real provider. Existing outer Docker boundary is used; the preserved nested namespace failure is not relabeled as a pass. |
| Authoritative liability code | **42 tests PASS**: transition and actual mutation-handler tests | Profile eligibility is controlled by the handler test fixture; no complete live admission claim. |
| Transactional concurrency | Real isolated Convex backend: one of two same-WO budget creations admitted; one of two full-balance requests admitted | Uses the same reservation core and index/read/write pattern. This is not deployment or end-to-end testing of a real pilot reservation. |
| Contract lineage | Default and exact current-main guards PASS; exactly seven planned additions, **v41 → v42** | Merge remains uncommitted; no final-main claim. |
| Provider, model and price | **SELECTED / UNQUALIFIED** | Exact Bedrock/model/region/ARN selected; qualification account/project and role unavailable, pricing and provider behavior unqualified. |
| Broker, complete producing profile, verifier and admission | **NOT_QUALIFIED** | Docker still rejects inference before start. No production-ready profile or Factory Version has been issued. |
| PR, merge, post-merge, readiness | **NOT_COMPLETED / NOT_ISSUED** | Full qualification prerequisites have not passed. |

System results: [automated-checks.json](../testing/evidence/fdlc-docker-recovery-reviewed-20260905/automated-checks.json). The final full run passed after the runtime, receipt-integrity and request-recovery fixes. Any further implementation requires affected requalification; PR/CI and clean post-merge qualification remain mandatory.

## Exact offline execution identity

- Existing path: `FactoryAttemptWorker → RemoteSandboxRuntime → DockerSandboxProvider → existing supervisor → structured result → existing Attempt reporting/cleanup`.
- Provider: `factory/docker-offline/v1`, kind `DOCKER`; existing backend `remote-sandbox`.
- Immutable image: `mission-control/factory-docker-qualification@sha256:32951f1bd7974c9f6e7d37e75b5356ba0196120448b8b10b47bb34fc2dbe34e2`.
- Local Docker image ID: `sha256:32951f1bd7974c9f6e7d37e75b5356ba0196120448b8b10b47bb34fc2dbe34e2`. This daemon reports equal values, but the provider validates them as separate identities and does not assume registry manifest/configuration identity equivalence.
- Source-built base: `ghcr.io/jaydubya818/mission-control-remote-sandbox@sha256:41a66f1d6f7b90618a6c58fb9a1a336ef69ab2794fc1322233e4a5d9788782b8`.
- Runtime: Linux/amd64 Codex CLI **0.146.0**, native SHA-256 `2e863156ed35ecc5253b1e2f907a9143077b9f7cb51942070c61996471ff6e04`; Node **26.7.0**.
- Tested backend: Docker Engine **29.7.2**, API **1.55**, Docker Desktop **4.88.1**, LinuxKit **7.0.12**, ARM64 host running the amd64 image.
- Policy: no host mounts or Docker socket; network `none`; read-only root; UID/GID 10001; all capabilities dropped; no-new-privileges; built-in seccomp; private IPC/cgroup namespace; 1 CPU, 512 MiB memory without swap, 64 PIDs; bounded private noexec tmpfs workspace and temp.

The fixed fixture makes no external model call and receives no credentials. It intentionally emits a FAILED workload result with no accepted criterion or publishable candidate. A passing fixture means the worker handled its bounded execution/evidence correctly. The model name inside that fake protocol is not a selected WO1 model.

The new runtime probe initially exited 137 while hashing the entire native binary into memory. Streaming hashing fixed the probe without increasing the container's memory allowance. Actual tool execution then passed. The timeout drill exposed a deadline exit being mislabeled as a supervisor crash; the host timer now uses the frozen allocation deadline and the worker records `DOCKER_TIMEOUT`, fencing late results. The worker-death drill kills a separate actual test-worker process with SIGKILL and proves the container-owned deadline stops execution without worker shutdown handlers. A fresh provider performs exact-label recovery teardown. No qualification containers remained after verification.

The v3 `profileAdmittedAt` value is now forwarded to the existing supervisor. Complete producing v3 profile qualification, including exact broker and model route, is still required. Startup failure is fail-closed. A durable REQUESTED journal lacking its create response can recover an observed exact container ID through strict name/image/lease/manifest checks. The signed reconciliation path validates that proof against the inactive canonical Attempt and journal, and cannot replace an already-known ID. Twelve recovery contract tests and an actual-Docker lost-reply/wrong-lease test pass. An empty lookup cannot rule out delayed creation, so that outcome deliberately remains unresolved and blocks terminal absence certification. This is qualified fail-closed ambiguity handling, not guaranteed automatic resolution of every daemon fault. A supplemental actual-Docker drill now injects teardown transport failure, verifies failed Attempt/cleanup evidence, and uses a fresh Factory worker with its normal scoped orphan reconciliation path to remove the resource and report absence. It does not manually repair control-plane records.

## Monetary authority and its limits

The new Convex tables hold immutable price versions, one monetary authority per WorkOrder, and append-only usage/correction events. Public operations require scoped Factory permissions; request operations use the existing signed service-command mechanism and dedicated capabilities. No service capability grants or live records were issued.

A reservation binds project, repository, WorkOrder/revision, Execution Profile/digest, model-route digest and price digest, with integer nano-USD ceiling, expiry, maximum request count and idempotency. Creation uses a transactional WorkOrder index guard: a different key, profile, revision or expired prior record cannot create a second balance. This conservative design does not implement automatic budget renewal or release.

Before each send, one Convex mutation checks current Attempt, lease/generation, host registration, cancellation, profile admission, scope and Factory ceiling, then reserves the full bounded input plus request output maximum. The shared row serializes concurrent requests. No production adapter sends requests yet; these checks do not independently establish a provider-compatible input bound.

Unknown requests retain their full hold. Settled requests also retain their original maximum against late corrections. Observed token usage is ACTUAL; monetary values computed from conservative inclusive rates remain ESTIMATED, not actual invoices. Corrections require scoped operator authority and persisted evidence. Request, provider request and usage identities cannot be replaced. Duplicate current receipts are idempotent; stale revisions/replays fail closed. Usage over any request bound is recorded and freezes further reservation. Unknown corrections preserve frozen incident state.

Outstanding provider-specific requirements include authoritative versioned pricing, model-confirmed identity, actual input and output controls, cache/reasoning semantics, bounded SDK/provider retries, provider-account receipt uniqueness, credential isolation, a no-bypass broker, unknown-outcome reconciliation and independent verification through the final profile. Cohort ceiling and producer/verifier suballocations must be composed into that authority before admission.

Proposed ceilings remain **$2 per WO ($1 producer + $1 verifier), $20 cohort**, one producer plus one verifier Attempt, zero Mission Control automatic retries, 15 minutes per Attempt, one slot. These are proposed limits, not issued reservations or evidence that the unresolved route fits them.

## Contract reconciliation

Current main lineage is v39 (`9a80cf3…`) → v40 (`3ae9d86…`, Execution Profiles) → v41 (`6611a03…`, governed MCP), retained by `0d1a090…`. The separate readiness branch `f82fe1d…` also consumed v40; its history remains intact. Current main was merged into `codex/fdlc-docker-closure` without downgrading or removing its Phase 2/3 architecture.

[The prior public change plan](fdlc-docker-closure-contract-plan.md) enumerated all seven additions before implementation. Current source is v42: readiness plus four liability APIs and two service actions. Default guard and explicit current-main guard agree. The Phase 3 historical baseline remains scoped only to its child gate; fresh evidence records the actual current contract separately from historical v41. Previous forced-f82 evidence remains explicitly historical.

Authoritative Convex codegen generated the API diff. Its analysis/upload log is retained; this invocation does not finalize a deployment. The configured local runtime was observed at v41 afterward; no v42 admission is claimed. Source hashes, generated diff, image inspection and command logs are preserved in the closure evidence. The merge is still in progress and uncommitted. Recovery stash `6a4c12fae135e2a7ed10ec3c2a41c9de236d80ce` remains retained.

## Reviews and next authority

Independent security review identified and source-verified the duplicate-budget fix. Architecture/simplicity review identified and source-verified timestamp propagation and image-identity separation. Data-integrity review identified usage-identity replacement; it is fixed with a regression. These reviews cover bounded source/control behavior, not production provider or WO1 readiness.

**Required inputs:** approved AWS qualification account ID; approved project/environment identifier; approved role ARN or authoritative configuration location; confirmation of allowed Bedrock execution topology for Sonnet 4.6. Do not paste secret keys. Provider, model, region, account, project, role and execution route cannot be substituted.

Once the approved identity and routing configuration are supplied, validate them against the preserved restrictions and resume the exact-route offline qualification. The current instruction prohibits all model calls, WO1 execution, readiness issuance, merge and publication. Those prohibitions remain in force; populated inputs or successful tests do not authorize these actions. Any later live qualification, readiness or publication stage requires the applicable explicit authority.

## Incident and rollback

Jarrett West remains Incident Commander. On stale authority, unexpected egress/credential evidence, deadline, unknown charge, missing result, overrun or failed cleanup: fence dispatch and provider sends, retain request/hold and allocation evidence, and terminate only positively owned resources. Confirm absence using a responsive daemon. Failed or ambiguous cleanup remains an incident; never infer absence from a connection error or run broad Docker prune.

Keep uncertain holds and audit receipts. Do not delete/recreate a budget record to regain capacity or steal filesystem fixture locks. No production reservation, profile, Factory Version or readiness record needs rollback because none was issued. Preserve the uncommitted merge and recovery stash; revert only reviewed task changes if rollback is requested. No image deletion is necessary. Unrelated containers and global runtime installations remain outside cleanup scope.

**Actual WO1 executions: 0. Real provider calls: 0. Pilot candidate/PR/publication/merge/release: none.** No GO recommendation or dispatch authorization is implied by repository test success.

## Recovery continuation evidence

Provider selection was resolved by the subsequent Bedrock approval; qualification AWS identity remains pending. The continuation added exact request-journal
recovery, retained unknown creation outcomes, and requalified all 51 Docker/ledger
cases and 12 recovery proof cases. Earlier records remain historical. Current
source hashes, authoritative codegen diff and security reinspection are in the
closure directory. No live provider, pilot admission, PR or merge was performed.

The final recovery System run completed **19/19 PASS**. The dedicated qualification AWS account/project/role
identity remains required; full admission and merge prerequisites are not met.

## Approved Bedrock route update

The approved intent and configuration audit are retained in
[bedrock-approved-route-2026-09-05](../testing/evidence/fdlc-phase1-docker-execution-path/bedrock-approved-route-2026-09-05/).
The worktree/main environment files, AWS configuration locations, relevant tracked
configuration, repository environment names and matching repository variable names
did not identify a dedicated qualification account/project/role. Production
credentials were not read, ambient AWS identity was not used, and no AWS API call
was made. This is an external administrative identity boundary, not a new model
selection request. No governed route record with invented account fields was issued.

AWS's current [Sonnet 4.6 model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-4-6.html)
lists Converse and Invoke support, but not Responses. It also lists in-region
inference in us-east-1 as unsupported and geo/global cross-region inference as
supported. Therefore the approved foundation-model-only restriction requires
compatibility resolution; no inference profile has been substituted. The existing
Responses fixture and price validator cannot certify this Bedrock route. Account
identity and API compatibility must be resolved before issuing its exact route,
price, reservation or live-call proposal. The AWS page is documentation evidence,
not account-specific adapter behavior proof.

## Current offline hold and topology decision

**State: QUALIFICATION_AWS_IDENTITY_REQUIRED.** The approved intent remains:
AWS Bedrock; source region `us-east-1`; model `anthropic.claude-sonnet-4-6`;
foundation-model ARN
`arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-sonnet-4-6`;
dedicated qualification environment only. No account or role has been selected
from local discovery. No governed route ID or qualification digest is invented.

### Four missing inputs

1. Approved AWS qualification account ID.
2. Approved project/environment identifier.
3. Approved role ARN or authoritative configuration location.
4. Confirmation of the allowed Bedrock execution topology for Sonnet 4.6.

### Exact incompatibility

| Constraint | Approved state | Compatibility consequence |
|---|---|---|
| Model | Sonnet 4.6, exact ID and foundation-model ARN above | A different model is prohibited. |
| Region | us-east-1 | An endpoint in this region does not imply all inference executes there. |
| Execution identity | Foundation-model-only; no inference-profile substitution | The adapter cannot replace the model ARN with a geo/global inference-profile ID or ARN. |
| Documented Bedrock mechanism | AWS lists in-region Sonnet 4.6 inference as unsupported in us-east-1; geo/global inference supported | The documented supported mechanism conflicts with the current foundation-model-only restriction. |
| Geo example, NOT approved | `us.anthropic.claude-sonnet-4-6`, with us-east-1 source and listed destinations us-east-1/us-east-2/us-west-2 | Selecting it changes execution topology and invocation identity; it is not an implementation detail or an authorized fallback. |

Source: the already inspected [AWS Sonnet 4.6 model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-4-6.html).
This documents public support, not account-specific successful behavior. AWS's
Converse/Invoke APIs also differ from the current Responses-only fixture; that
fixture is not evidence of Bedrock compatibility.

**Exact policy/configuration decision required:** the authorized owner must
confirm whether the approved account has a supported execution configuration
that preserves this exact model, region and foundation-model-only restriction.
That configuration requires authoritative compatibility evidence. If it instead
requires a cross-region inference profile, the owner must separately and
explicitly decide the permitted invocation identity, source/destination regions,
account/project/role scope and associated policy change. No such change is
currently approved. Merely naming an inference profile or supplying credentials
does not resolve this conflict. Until a compatible, explicitly approved decision
exists, retain the hold; do not weaken the restriction or switch models.

### Work completed offline and work held by this dependency

| Work | Current disposition |
|---|---|
| Exact intended route and action prohibitions | Recorded in `fdlc-bedrock-qualification-inputs.json`; null fields are intentional. |
| Offline substitution/constraint checker | Implemented; 19 deterministic tests pass. It reads only the explicit document and never AWS config, credentials, environment identity or the network. |
| Generic liability and recovery regressions | Rechecked with the new checker; results retained in the offline-hold evidence directory. |
| Docker containment/lifecycle and current-main contract lineage | Prior verified evidence preserved; documentation-only hold work does not recertify a live execution profile. |
| Authoritative AWS account, principal/role and project binding | Blocked by inputs 1–3 and their approval provenance. |
| Exact supported invocation topology, route registration/digest and identity proof | Blocked by input 4 and the unresolved foundation-model-only conflict. |
| Bedrock-specific serializer/broker/runtime compatibility | Cannot be frozen or qualified against an unapproved execution topology; the current Responses path remains insufficient. |
| Versioned pricing, input/output/reasoning/cache bounds and retry liability | No exact-route qualification until topology/API and account terms are settled. Existing generic arithmetic tests are not price or billing proof. |
| Bedrock usage/request-ID attribution, replay, late/unknown outcomes | Generic tests retained; exact provider integration and independent evidence remain blocked. |
| Live provider verification | Explicitly prohibited by the current instruction, regardless of future document completeness. |
| Independent verifier on the exact environment, final Execution Profile, reservation, frozen Factory Version and Factory qualification | Blocked by exact route, provider liability and environment qualification. |
| Readiness issuance | Explicitly prohibited; no manual READY override. |
| WO1 execution, candidate/output, merge and publication | Explicitly prohibited. No PR/CI publication or merge is performed under this hold. |
| Clean post-merge proof | Remains part of the original objective, unavailable before separately authorized merge and full qualification. |

### Deterministic resumption

Run `node scripts/check-fdlc-bedrock-prerequisites.mjs` from the repository. Exit
**2** means missing or incompatible prerequisites; it is the expected current
result. The assessment grants no authority. Even exit 0 means document
completeness only and reports `REQUIRES_INDEPENDENT_QUALIFICATION`.

Populate only the four approved inputs from an explicit authorized source.
Record their provenance and independently validate topology compatibility.
Do not resolve them from default profiles, cached sessions, local credentials or
unrelated accounts. Re-run the checker and exact-route negative tests; preserve
the image/runtime/profile and contract lineage evidence. Resume only the work
allowed by the resulting approved configuration. Live calls, WO1, readiness,
merge and publication remain disabled until the appropriate new authorization.
