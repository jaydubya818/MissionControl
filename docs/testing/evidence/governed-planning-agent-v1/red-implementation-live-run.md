# RED implementation live-run evidence

Date: 2026-08-27
Decision: **NO-GO**

This record distinguishes the completed RED route qualification from the actual browser-operated implementation Attempt. The route and Factory became eligible. The live Attempt then failed closed before the Codex adapter or model was invoked, so no candidate, independent verification, human-acceptance checkpoint, or controlled pull request exists.

## 2026-08-30 final authorized Attempt

The Product Owner approved WorkOrder revision 3 with a cumulative cap of $48
and one final Factory v3 Attempt capped at $24. Four fresh current-revision
decisions were recorded through the browser. They did not authorize
publication, merge, deployment, waiver, or acceptance.

The governed retry created run `gq16ag6e` / WorkflowRun
`sh7tfppxgpabn1cbesnd6j43318de6b2`, Task Attempt 3 on canonical Task
`ph7h5vq1043kms52c2r52kvjed8ddswr`. Worker `planning-pilot-local` claimed the
exact Factory v3 digest, WorkOrder revision 3, manifest digest
`sha256:e78bfcc6d8d297f880a43108c3579966f82e72b10c400df76332d2b4a6e1ceff`,
base SHA `470057334800c7cddfc268b3f26d5ef3fc632088`, branch
`mc/9v09dh8d87wj-gq16ag6e`, and one $24 reservation.

This Attempt crossed the executor boundary. The real Codex adapter emitted 38
durable events and wrote eight in-scope files in the isolated worktree. It then
returned a structured `BLOCKED` result because the linked worktree lacked the
pnpm dependency graph required for full typechecking and
`pnpm run test:e2e:critical`. The control plane correctly made the Attempt
terminal `FAILED` and blocked every downstream workflow step. No source changes
were committed; no candidate SHA, verification record, publication checkpoint,
or product pull request was created.

The worker runtime now prepares builder and detached verifier dependencies
before execution using `pnpm install --offline --frozen-lockfile
--ignore-scripts`, and rejects any Git source-state change. That correction is
commit `7344b42` and passes focused lifecycle tests, typechecking, local critical
browser tests, and GitHub CI. The terminal Attempt remains immutable and no
additional Attempt was created.

## 2026-08-29 continuation

The original pre-execution defect is now recovered through the governed UI.
The server proved the Task-less `uct8ndgk` Attempt never invoked the executor,
released only its zero-spend reservation, created canonical Task
`ph7h5vq1043kms52c2r52kvjed8ddswr`, and created replacement Attempt
`dsf4y6au`. After a separate frozen-executor claim-envelope correction, the
same narrow proof contract released `dsf4y6au`'s zero-spend reservation and
created Task Attempt 2, `aj0whcd1`.

`aj0whcd1` was a real Codex planning call. It claimed the exact Factory v2
tuple and planning SHA, created isolated branch `mc/9v09dh8d87wj-aj0whcd1`,
and retained a clean worktree. The harness then returned `BLOCKED` before any
repository writes because the WorkOrder prose authorized the governed Convex
backend/schema and golden-path tests while its machine-enforced code scope and
path budget allowed only UI source.

The operator applied WorkOrder revision 2 to reconcile that internal
contradiction. It freezes exactly three code scopes—Operator shell, Convex
control plane, and Planning golden-path tests—plus a 13-pattern allowlist,
`.env*` and `.github/workflows/**` denials, 16 files, 1600 lines, and bounded
schema permission. All four material-change approvals were freshly recorded.

Factory v3 `sh7ahq69kg6vzb0yykkz9fydas8dcw3v` /
`factory-v1-746c28c5` is active and passed all 16 readiness checks. It preserves
the v2 harness, RED model route, workflow, agent versions, policy, verifier,
$24 per-attempt cap, 60-minute timeout, three-attempt limit, and recovery
contract; only the two newly required code scopes were added.

The continuation remains **NO-GO** for a final Attempt until the Product Owner
explicitly approves a cumulative WorkOrder cap increase. Because saved ChatGPT
authentication supplies no authoritative USD cost, `aj0whcd1` retains the
full $24 reservation. A new $24 Attempt requires a $48 cumulative cap. No
reservation was released, no cost evidence was fabricated, and no budget
increase was applied silently.

## Qualified execution tuple

- Model catalog revision: `zd7624w4h7h7np5n1jmp33epsd8d86r4`.
- Exact route: `openai/gpt-5.6-sol` via `codex-cli/chatgpt-auth` and Codex CLI `0.146.0`.
- Route digest: `sha256:0b33c00b74ab1ed0e0f22d66cda61a2530db75b27a1db7906a16701ef4bd3347`.
- Qualification digest: `sha256:9edd5415b77a59744ed6383d683eccf5950995f186bed7e419e54cdb6883d350`.
- Capability manifest digest: `sha256:7e8b7435f6dab9a8a9a09b90ae1791110c3593ad1b38cdc48227d18069ec1c06`.
- Scope: `SOFTWARE_CHANGE`, `YELLOW` and `RED`, repository `sx7swdarky96tbckcfw3bz6zfx8d9dcp`, persistent-worker backend.
- Human promotion actor: `demo:company-administrator`.
- Qualification evidence: [`red-route-qualification.json`](./red-route-qualification.json), digest `sha256:6b5caf715e7a462cc86b7b0ea181f4e0cfa738a14c5e28615547c55dbef5b6be`.

## Auditable cost policy

- Approved Plan estimate: **$32**.
- Implementation WorkOrder estimate and hard cap: **$24**.
- Validator WorkOrder estimate: **$8**.
- Route estimate and reservation: **$24** for each admitted Attempt.
- Method: `FULL_APPROVED_WORK_ORDER_CAP_RESERVATION`.
- Actual-cost telemetry: `UNAVAILABLE`; unknown cost is not treated as zero.
- Cost-policy digest: `sha256:e60a9db47524cbb7c91f0cb64f40425d9ac0755825fcf5a1a0381ef6c718a8df`.

The known-cost, unknown-cost, over-budget, and retry-over-remaining-budget cases are covered by focused tests. After the live failure, routing reports `priorCommittedUsd: 24`, `remainingBeforeReservationUsd: 0`, `EXHAUSTED`, and rejection code `BUDGET_EXCEEDED`.

## Factory and worker

- Factory Definition: `sn7d8kh8gxs0h4n1yr25jzgv5s8d9nt4`.
- Immutable Factory Version: `sh7d132nqtswjw0g8wvcbpjf2n8d8aby`, version 2.
- Configuration digest: `factory-v1-2dcece17`.
- Risk boundary: `RED`.
- Backend: `persistent-worker`.
- Budget: $24, 60 minutes, 3 Attempts.
- Readiness assessment: `t975rkst5dcz5qc6eddkjvv3p58d9321`, `PASS`, 16/16 verified.
- Worker host binding: `ss7vgvg88brc302kzdvae96cxd8d8a02`, worker `planning-pilot-local`.
- Claimed lease: worker session `c93fb84a-cdf2-4709-af77-bc475cb927a8`, generation 8.

The worker was clean and exactly bound before the successful route reassessment and live claim. See [`factory-configuration-v2-active.png`](./factory-configuration-v2-active.png).

## Browser dispatch and Attempt

The operator used the Work Orders UI and clicked Dispatch for implementation WorkOrder `s57xr6201qh1wt83ca7y9v09dh8d87wj`. Routing decision `zh72gx1qh72rtbdpkjwnhscv6d8d8qwd` persisted `SELECTED` with no candidate rejection codes and applied tuple `sh7d132nqtswjw0g8wvcbpjf2n8d8aby:factory-v1-2dcece17`.

See [`implementation-dispatch-ready.png`](./implementation-dispatch-ready.png).

- Attempt document: `sh7pvakrn8r6e7hhtb7rzb7rfn8d9byv`.
- Run ID: `uct8ndgk`.
- Manifest digest: `sha256:2d967ab95f0cc2962e22de0c3f223bc987ef2696cb51fecce81b930e23fe8ae2`.
- Branch: `mc/9v09dh8d87wj-uct8ndgk`.
- Model: `gpt-5.6-sol`.
- Harness: `codex/v1`.
- Route and Factory identities: exact values above.
- Task ID: **none**. The WorkOrder has no canonical Child Tasks and no legacy Task.

Persisted events:

1. `RUN_STARTED`, `PENDING`, from the UI dispatch.
2. `CHECKPOINT_CREATED`, `RUNNING`, when the canonical worker claimed the lease.
3. `RUN_FAILED`, `FACTORY_ATTEMPT_FAILURE`, with `Claimed Factory execution manifest is invalid.`

No executor-start, model, file-change, artifact, candidate-ready, verification, or publication event exists.

## Revision chain

The persisted SHA chain is aligned through the execution manifest:

`470057334800c7cddfc268b3f26d5ef3fc632088`

equals the Planning Run SHA, approved Plan execution basis, WorkOrder planning SHA, Attempt execution base SHA, and execution manifest `repository.baseSha`. There is no Task base SHA because no Task exists. There is no candidate SHA because execution stopped before adapter invocation.

## Failure analysis and correction

The Task-less manifest was hashed before persistence with optional `undefined` fields. Convex storage omitted those fields, so the worker's hash of the stored manifest did not match the frozen dispatch digest. The manifest builder now normalizes the complete manifest to its persisted JSON representation before computing the digest. A regression test proves a Task-less manifest retains the same digest after the storage round trip.

That source correction does not rewrite the terminal Attempt, release its conservative $24 reservation, or create a missing Task. No recovery authorization was fabricated. The existing WorkOrder remains `BLOCKED`; a second Attempt remains fail-closed with `BUDGET_EXCEEDED`.

## Downstream state

- Canonical Task: none.
- Candidate: none.
- Validator Task/Attempt: none; validator WorkOrder `s57tz4nvwvja0ktgzefjsh8ytd8d9fdm` remains dependency-blocked.
- Independent receipts: none for the implementation candidate.
- Human acceptance: ineligible; required assertion receipts are missing.
- Controlled product PR: none.
- Merge, deployment, Leonardo, and learning: not executed.

This is a legitimate NO-GO boundary: exact RED routing and UI dispatch succeeded, but the authoritative Task/Attempt chain and available governed retry budget did not.
