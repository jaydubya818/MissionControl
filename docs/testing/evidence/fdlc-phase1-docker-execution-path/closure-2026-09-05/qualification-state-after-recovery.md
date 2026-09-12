# FDLC Phase 1 — Docker Execution Path Qualification Report

Updated 2026-09-05. Current boundary: **MODEL_ROUTE_SELECTION_REQUIRED**.
WO1 readiness: **NOT_ISSUED**. Full execution-path qualification: **INCOMPLETE**.

The exact approved provider/model route is absent from the pilot records and the scoped local route inventory. The Product Owner must identify that route before its API, billing semantics, input/output controls, credential boundary and minimum live-call proposal can be frozen. This is a provider selection decision, not authorization to spend. No provider/model substitution has been made.

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
| Provider, model and price | **UNSELECTED / UNQUALIFIED** | No exact approved route, pricing or provider-confirmed behavior exists. |
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

**Required decision:** identify the approved Mission Control model-route ID, or the exact provider, model and approved account/project for this pilot. No credentials should be pasted into chat. Selection alone will not authorize live calls.

Once supplied, audit its authoritative API and price semantics, complete the no-bypass adapter and remaining lifecycle/negative controls, freeze a minimum synthetic/public-data qualification-call proposal with exact call count, output/retry caps and maximum total liability, and obtain separate call authorization if required. Then complete dependent profile/verifier/Factory/reservation/readiness admission, final reviews, PR/CI/merge and clean post-merge qualification. Stop before WO1 dispatch.

## Incident and rollback

Jarrett West remains Incident Commander. On stale authority, unexpected egress/credential evidence, deadline, unknown charge, missing result, overrun or failed cleanup: fence dispatch and provider sends, retain request/hold and allocation evidence, and terminate only positively owned resources. Confirm absence using a responsive daemon. Failed or ambiguous cleanup remains an incident; never infer absence from a connection error or run broad Docker prune.

Keep uncertain holds and audit receipts. Do not delete/recreate a budget record to regain capacity or steal filesystem fixture locks. No production reservation, profile, Factory Version or readiness record needs rollback because none was issued. Preserve the uncommitted merge and recovery stash; revert only reviewed task changes if rollback is requested. No image deletion is necessary. Unrelated containers and global runtime installations remain outside cleanup scope.

**Actual WO1 executions: 0. Real provider calls: 0. Pilot candidate/PR/publication/merge/release: none.** No GO recommendation or dispatch authorization is implied by repository test success.

## Recovery continuation evidence

Provider selection is still pending. The continuation added exact request-journal
recovery, retained unknown creation outcomes, and requalified all 51 Docker/ledger
cases and 12 recovery proof cases. Earlier records remain historical. Current
source hashes, authoritative codegen diff and security reinspection are in the
closure directory. No live provider, pilot admission, PR or merge was performed.

The final recovery System run completed **19/19 PASS**. The provider/model route
decision remains required; full admission and merge prerequisites are not met.
