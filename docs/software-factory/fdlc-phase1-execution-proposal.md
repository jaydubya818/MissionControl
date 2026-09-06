# Pilot Execution Proposal — human review only

Recommendation: **NO_GO**. Prepared 2026-09-05 UTC. WorkOrder 1 is NOT authorized
or executed. No model call, candidate change, pilot PR, merge or deployment has
occurred. Identifying owners removes the identity blocker; it does not resolve
execution readiness. Zero accepted outcomes describes the unrun pilot, not the
reason to deny its first execution.

Latest live observations and bound-item statuses: [WorkOrder 1 Preflight](fdlc-workorder-01-preflight.md).
It supersedes initial unavailable-configuration descriptions below.

## Decision summary

| Item | Proposal for approval |
| --- | --- |
| Repository | jaydubya818/MissionControl; original baseline 9a80cf3c5cc229bb4a552a9f08ddda5841e70a38; re-pin after Phase 0 is reviewed and deployed |
| WorkOrder 1 | Repair one incorrect root-README link in docs/guides/RUN.md; exact before/after hashes below |
| Cohort | Documentation WO1 first; remaining docs are backlog only; overall ten accepted WorkOrders must retain four-class coverage |
| Baseline | Broken link measured; preparation timings retained; four heterogeneous historical docs PR timings; active human effort UNKNOWN |
| Acceptance | Only the approved link bytes change; exact file hash, target and anchor; all specified repository gates pass |
| Independent verification | Separate registered verifier, isolated exact-candidate worktree and immutable receipts; identity not yet configured |
| Execution tuple | LOCAL persistent-worker proposed; source harness/runtime hashes below; live Factory, route, host and qualifications unresolved |
| Budget | Proposed $2 per WorkOrder/$20 cohort, one producer and one verifier Attempt, no automatic retry, 15 minutes each; hard token cap and price authority unresolved |
| Incident/rollback | Jarrett owns stop/escalation/restoration; local process/fencing rehearsal passed; live credential/host containment still blocked; close unmerged PR or reviewed revert after merge only with authority |
| Recommendation | NO_GO. Do not execute WorkOrder 1. |

The identity assignment preserves all Plan, WorkOrder, verification, acceptance,
publication, merge, release, containment, cost, security and rollback gates.

## Identity and repository

Owning team: **FDLC / Mission Control**. Champion, human FDE/operator and
Incident Commander: **Jarrett West**, intentionally holding all three roles.
Human acceptance is separate from independent technical verification. Each
Plan, WorkOrder, correction, publication, merge and release decision remains
distinct; these names do not supply software permissions or sign any decision.

Recommend **jaydubya818/MissionControl**, default branch `main`, public GitHub
repository; authenticated viewer permission ADMIN. Original pilot source pin:
`9a80cf3c5cc229bb4a552a9f08ddda5841e70a38`. Phase 0 review commit:
`f82fe1d98b156278c4fa0c0e2032008e2f010f39` on `codex/fdlc-pilot-readiness`.
No other repository was presumed controlled or inspected for private content.

For the proposed main-based pilot, Phase 0 must be reviewed, merged by a human
and deployed with compatible v40 frontend/backend before relying on its new
query. Freeze the resulting main SHA in the Plan and recheck the target file
and tuple. The original pin is a reproducible baseline, not permission to run
an old deployment or treat an unmerged review commit as main.

GitHub requires strict current-branch CI: TypeScript Type Check, Lint, Unit
Tests, Build (UI + workspaces), Smoke Test, Release Security Gates and System
Qualification V2. Force pushes/deletions are disabled. Admin enforcement and
required-review settings are not enabled; no rulesets were returned. This is
an acknowledged administrative bypass exposure. The pilot must still require
Jarrett's recorded review/merge decision; no admin bypass or rule change is
part of this proposal. Evidence: `repository.json` and `branch-protection.json`
in the preexecution evidence directory.

Owning software scope remains **UNRESOLVED**: actual tenant/project/repository,
team and owner-member record IDs cannot be inferred from these human names.
The original configured Convex backend at `http://127.0.0.1:3214` has now been
started for qualification and answers exact-instance/read queries. No seeding,
code deployment, alternate backend or execution worker was used. Current live
findings supersede the initial offline observations below; see
[WorkOrder 1 Preflight](fdlc-workorder-01-preflight.md).

## One recommended workload

**Repair incorrect operator/developer documentation against current source.**
These are documentation defects, not new functionality. They are repetitive,
reversible, independently checkable and avoid dependency/provider upgrades.

Scoring: 0 absent/unfavorable, 1 partial, 2 strong. These are engineering
judgments from repository evidence, not measured success probabilities.

| Candidate | Bounded | Repeatable | Acceptance | Independent check | Blast radius | Revert | Baseline | Repo fit | Environment | Few external deps | Legitimate cohort | Total /22 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Documentation maintenance | 2 | 2 | 2 | 2 | 2 | 2 | 1 | 2 | 1 | 2 | 2 | 20 |
| Dependency modernization | 1 | 2 | 2 | 2 | 1 | 2 | 1 | 2 | 1 | 1 | 1 | 16 |
| Test repair | 2 | 1 | 2 | 2 | 2 | 2 | 0 | 2 | 1 | 2 | 0 | 16 |
| Mechanical API migration | 1 | 1 | 1 | 2 | 1 | 2 | 0 | 1 | 1 | 2 | 0 | 12 |
| Framework upgrade | 1 | 1 | 2 | 2 | 0 | 1 | 0 | 1 | 1 | 0 | 0 | 9 |

Evidence: a read-only Markdown scan found 36 missing relative file targets,
including changelog entries which are excluded from this cohort. Additional
source inspection found absent root scripts and nonexistent packages in
operator guides. Current full tests pass, so no ten real test failures were
invented. Dependency audit has no unaccepted high/critical findings; that does
not provide ten necessary upgrades. No bounded API/framework migration was
identified. All candidates share the unresolved live control-plane readiness.

## WorkOrder 1 — exact bounded change

Title: **Repair the Run Commands link to the root Software Factory demo guide**.
Risk proposal: LOW / GREEN, documentation only. Owning scope: FDLC / Mission
Control, Jarrett West; corresponding record IDs still required.

Only allowed changed file: `docs/guides/RUN.md`. Replace exactly one link target:

- Old: `../README.md#software-factory-demo-local-end-to-end`
- New: `../../README.md#software-factory-demo-local-end-to-end`

The source file lives under `docs/guides`; the old target resolves to absent
`docs/README.md`. The replacement resolves to root `README.md`, whose heading
is `Software Factory demo (local end to end)`. This repairs a real onboarding
navigation failure without changing an operational command or invoking one.

Pinned base file SHA256:
`0672a5c2cd49b36550cdc2989ff7400ed3c6a55b81e51c46bfddda9de8fd3b88`.
Expected file SHA256 after this exact replacement:
`2012221334f6b0149efab53d32762cbe6ddca2fc5e164c8bdc4b7da10181659d`.
These hashes were computed in memory for the proposal. The candidate file was
NOT written. Rebase drift invalidates this contract and requires a newly
reviewed revision; never apply blindly. See `workorder-01-contract.json`.

Forbidden changes: all other files, executable content, tests or assertions,
dependencies/lockfiles, credentials, policies, generated artifacts, data,
historical failure evidence, merge settings, CI and release configuration.
Expected artifact: one-line documentation diff plus independently produced
candidate evidence and review package, eventually a human-authorized PR.

## Ten legitimate candidate WorkOrders

Each row is a separate operator/developer workflow defect, with independent
scope and acceptance. These are proposed backlog entries, not created records
or approved outcomes. Revalidate every row at its approved base. Do not split
links in a single navigation repair simply to increase the count.

| Candidate | Real defect / source location | Proposed bounded correction |
| --- | --- | --- |
| 01 | docs/guides/RUN.md:6 links to nonexistent docs/README.md | Exact root demo-guide link repair above |
| 02 | docs/guides/TELEGRAM_COMMANDS.md:422–424 has three nonexistent relative related-guide/package targets | Repair that related-resources section as one change |
| 03 | docs/architecture/MULTI_PROJECT_MODEL.md:239 points to absent docs/runbook/STATE_MACHINE.md | Point to verified current state-machine reference with accurate context; do not change state rules |
| 04 | docs/guides/DEPLOY_NOW.md:325–328 related links resolve beneath the wrong directory | Repair the related-guide navigation section together |
| 05 | docs/guides/GETTING_STARTED.md:43,107–125,158–178 advertises absent packages/api, packages/ui, packages/workers and test:watch | Replace obsolete developer setup instructions using actual package scripts and Convex/UI layout; no new API |
| 06 | docs/runbook/RUNBOOK.md:47–48,145–147 names absent agent:run:scout / agent:run:scribe scripts | Correct agent-start guidance against supported scripts; no agent started during verification |
| 07 | docs/runbook/RUNBOOK.md:238,428–431,490–493 names absent backup / restore / verify-db scripts | Correct backup/recovery guidance to verified supported procedures or explicitly mark unavailable; no invented recovery command |
| 08 | docs/runbook/RUNBOOK.md:561,578,582 names absent cleanup / archive / security-check scripts | Correct maintenance guidance, keeping data deletion excluded |
| 09 | docs/guides/START_HERE.md:91 directs operators to absent docs/RUNBOOK.md | Repair the operations-manual reference and its navigation context |
| 10 | docs/guides/QUICK_START_NOW.md:172–205,239–269 starts nonexistent packages/agent-runner | Correct or clearly retire the obsolete runner-start procedure; do not launch agents |

Rows 06–08 touch separate operational procedures in the same file; schedule
serially and re-pin after each accepted merge. If review determines two entries
belong together, combine them and source another real defect; never count a
fragment twice. Archived plans, changelog claims and historical evidence are
excluded. Larger documentation changes need their own acceptance contract,
not automatic reuse of WorkOrder 1's hash rule.

**Accepted Product Owner decision:** preserve the existing BUG_FIX, FEATURE,
REFACTOR and SECURITY_POLICY requirement for the overall ten-accepted-WorkOrder
Phase 1 gate. WorkOrder 1 may be the documentation correction above. First
qualify its execution path, then obtain human authorization, prove one complete
lineage and review the outcome. Only then expand toward the ten-outcome pilot.
Rows 02–10 remain useful documentation backlog candidates, not the approved
complete pilot cohort. Do not relabel them to manufacture class coverage. The
cohort decision is resolved and is no longer an admission blocker for WO1.

## Baseline and expected measurement

| Measure | Classification | Value / limits |
| --- | --- | --- |
| Navigation defect | MEASURED | Old file target absent; correct root target/heading present; exact byte replacement contract retained |
| Recent docs PR open→merge time | HISTORICAL | Four docs-prefixed PRs among latest 15 merged PRs: #159 8.80m; #155 3807.73m; #152 3974.67m; #151 0.97m; median 1908.265m |
| Typical human cycle/active effort/review minutes | UNKNOWN | Those four heterogeneous PRs include waiting and do not measure human effort or typical one-line correction time |
| Human defects/rework and handoff count | UNKNOWN | No attribution/timing log available; do not infer from commits |
| Implementation and verifier preparation | MEASURED rehearsal | Separate detached worktrees at original pin; frozen offline install with scripts disabled, ci:prepare and Convex tsc pass; exact durations in worktree-preparation.json |
| Verification/build/test durations | MEASURED local qualification | Per-gate timings in Phase 0 review automated-checks.json; not future candidate verification time |
| Current process | SOURCE-VERIFIED design | Intent→Spec→governed Plan→human approval→WorkOrder→Task→Attempt→independent verification→review→authorized PR→human acceptance/merge; existing gates/CI are automation |
| Expected outcome | PROPOSED | Correct navigable guide link; zero out-of-scope changes/policy escapes; no cycle-time or cost improvement claimed before results |

For each WorkOrder record accepted status, verifier verdict, intent-to-acceptance
and dispatch-to-candidate duration, execution duration, human review minutes,
intervention count, attempts/retries, first-pass verdict, rework, revert,
tokens, actual/estimated/unknown cost components, violations, recovery events
and observed outcome. UNKNOWN is never zero. Jarrett records human attention;
the independent verifier records technical results; existing traces/evidence
provide immutable lineage. The observed outcome for WO1 is the corrected link
at accepted PR head and, after separately authorized merge, at main; no
production deployment is needed for this source-navigation repair.

## Execution tuple and environment

Proposed backend: **persistent-worker**, execution environment **LOCAL**, one
slot, isolated worktree per producer and separate verifier. No remote-sandbox.
Local execution does not make a hosted model call local; provider egress must
still be explicitly authorized for the exact repository content and route.
GitHub visibility PUBLIC is verified; the control-plane classification and
provider-egress policy are UNKNOWN, not automatically changed to PUBLIC.

| Identity | Resolved proposal / current qualification |
| --- | --- |
| Factory Version ID and configuration digest | BLOCKED: no live selected/qualified version; do not use demo IDs |
| Model provider route ID, revision and digest | BLOCKED: live route unresolved; no selection by model ID alone |
| Harness source candidate | codex-cli 0.146.0, commit e363b08c9175ac1cbe5893615dd2cb9ddf95043b; adapter codex/v1 |
| Harness manifest digest | sha256:7e8b7435f6dab9a8a9a09b90ae1791110c3593ad1b38cdc48227d18069ec1c06 |
| Runtime source candidate | EXECUTABLE codex 0.146.0; executable SHA256 ae1d3ffe6d48aec6a4dc3f50e7eb8e0d11962485a6a9406c5a7012139383da02 |
| Runtime artifact digest | sha256:dbd2a09c812ba8b2a5b5425f5386b0c65b2a399e40813374597d20bcfcd855fc |
| Backend qualification / host / worker session | BLOCKED: persistent-worker proposed; actual binding, executable attestation, session/generation and current qualification absent |
| Independent verifier Factory/agent configuration | BLOCKED: registration and separately qualified tuple not resolved; Jarrett is not its substitute |
| Candidate commit / exact verifier worktree | NOT CREATED by design; must bind exact immutable Verification Subject after authorized implementation |

Source candidate hashes identify existing artifacts only, not a live available
installation or route. No executable was invoked to ask a model. Frozen suite:
reuse existing Mission Control golden suite and its exact digest from the
Phase 0 review eval receipt as the baseline; before pilot evaluation bind its
version, input revision and live tuple. Diagnostic evals never grant authority.

## Machine acceptance and independent verification

At the later approved base, independent verification must assert: exactly the
one allowed tracked file changed; old link occurs once at base and zero times
in candidate; corrected link occurs once; file bytes match the frozen expected
SHA256; root README target and heading exist; no other candidate bytes changed.
Run `git diff --check`, `pnpm run docs:factory-check`, `pnpm run test`,
`pnpm run lint`, `pnpm run ci:typecheck`, `pnpm run build`,
`pnpm run ci:runtime-contract`, `pnpm run release:security`,
`pnpm run eval:mission-control` and `pnpm run qualify:factory`, retaining fresh
candidate evidence in a new directory. Do not overwrite prior receipts.

The registered independent verifier prepares a distinct worktree from the
exact candidate SHA and frozen dependencies, records verification identity,
configuration, commands/results, changed-file set, content/subject digests and
currentness. Producer-written receipts are not sufficient. Any command failure,
missing case, wrong subject, stale Plan/WO revision, revocation or PR-head drift
blocks publication/acceptance; preserve the failure and do not retry invisibly.
INVALID/SKIP retain their meanings and cannot count as PASS. Candidate changes
after verification require new evidence and any required new human decision.

## Readiness and budget

The real `workOrders:readiness` evaluation is **NOT RUN / BLOCKED**, because the
real Plan/WorkOrder and tuple do not yet exist; the backend is now reachable but these subject bindings are still absent. No fake IDs, direct DB writes or manual READY transition were used.
The following is a proposal blocker inventory, not a server query receipt.

| Category | Status | Exact remaining gate |
| --- | --- | --- |
| Human named roles | PASS | Supplied explicitly; software membership IDs/permissions still required |
| Plan | BLOCKED | Research/ingest exact governed Plan, review and human approval not performed |
| WorkOrder | BLOCKED | No authorized real ID/current revision/Task; may not invent one to run query |
| Risk | BLOCKED | LOW/GREEN proposed, not frozen in approved Plan/WorkOrder |
| Factory / route | BLOCKED | Version ID/config digest and route qualification absent |
| Harness / runtime | BLOCKED | Source identity known; admitted installed exact artifacts not proven |
| Backend / host | BLOCKED | Live qualified worker/binding/session absent; control-plane read access restored |
| Repository | BLOCKED | GitHub owner/public source pin known; company/team/owner scopes and classification unavailable |
| Dependencies | BLOCKED for live Attempt | Both preparation rehearsals PASS; actual Attempt/verifier worktrees must repeat and retain receipts |
| Verifier | BLOCKED | Independent configured identity/Factory and exact-candidate worktree absent |
| Budget/cost | BLOCKED | Proposed limits below not configured; route price/usage enforcement unverified |
| Policy / containment | BLOCKED | Current envelope, egress and credential scopes not resolved |
| Evidence | BLOCKED | No candidate-specific independent receipt or current PR subject |
| Human approvals | BLOCKED | Identities do not approve Plan, WorkOrder, PR, acceptance or merge |
| Incident controls | BLOCKED for live pilot | Bounded local cancellation drill PASS; actual credential/host mapping and restoration path untested |

Proposed limits for final approval: $2 per WorkOrder total ($1 producer + $1
independent verifier), $20 cohort ceiling; 1 producer Attempt and 1 verifier
Attempt, zero automatic retries; 15 minutes each, 30 minutes combined; one
concurrent WorkOrder/host slot. These limits are recommendations, not recorded
budget authority. A corrected Attempt requires a new bounded authorization.
Hard token limit: UNCONFIGURED/UNKNOWN; resolve the supported route/runtime cap
and record it before GO. Actual provider price, compute/tool/CI dollars remain
UNKNOWN. Do not enable dispatch by converting unknown price to zero or replacing
a hard cap with an estimate. No dollar-efficiency metric is claimed.

## Incident stop, rollback and restoration contract

Jarrett West is the Incident Commander and escalation recipient in this task.
This does not assume an unattended/on-call notification channel. Until an
operational contact path and response availability are confirmed, unattended
execution is excluded. No Phase 2 incident aggregate is implemented.

| Stage/control | Actual mechanism and outcome | Boundary/gap |
| --- | --- | --- |
| Pause new work | Jarrett stops issuing dispatch approvals; stop configured worker admission via existing worker lifecycle | FactoryAttemptWorker.stop() aborts active work; it is not a checkpoint-preserving pause |
| Drain | Do not dispatch more work; allow an already authorized bounded Attempt to finish while monitored | No verified per-pilot administrative drain command/host mapping; do not invent one |
| Cancel before publication | Existing workflowRuns:requestCancellation with exact workflowRunId and reason; worker heartbeat observes request, aborts owned process and fences late writes | Requires live authorized operator and exact run ID, both pending |
| Publication already authorized | requestCancellation returns refusal for PUBLICATION_AUTHORIZED; reconcile exact provider effect first | Never report cancellation successful while provider write is unresolved |
| Contain/quarantine | Stop dedicated worker, preserve ownership manifest/worktree, prevent re-enrollment/admission through existing host/service controls | Exact authorized host-disable/service-revoke operation not demonstrated; live pilot blocker |
| Credential revoke | Named operator uses scoped credential issuer's existing revocation path; verify reuse denied; GitHub installation revocation only at its actual scope | Issuer/key IDs and scope not resolved; no broad installation revocation or rotation performed |
| Before candidate/PR | Cancel/fence, preserve failed Attempt and owned workspace/evidence; abandon candidate only after reconciliation | Do not delete unknown or dirty worktrees to claim cleanup success |
| Unmerged PR | After confirmed provider write, Jarrett closes exact PR; retain evidence/branch until approved retention cleanup | Agent cannot close or delete real pilot artifacts now |
| After human merge | Jarrett authorizes a new reviewed revert of the exact accepted commit; CI/currentness and human merge apply again | Never force-reset main; no automatic revert, deployment or rollback authority |
| Unresolved external effect | Preserve publication permit/checkpoint, provider request IDs and candidate/PR head; block retry, credential restoration and duplicate publication until reconciled | Escalate to Jarrett; UNKNOWN is not failure-free |
| Restore | Jarrett explicitly authorizes restoring exact host/credential and fresh qualification, then a separately authorized new Attempt | No automatic resumption, silent retry or reuse of a revoked lease |

Retain action summaries, evidence deltas, failure classes, changed hypotheses,
control decisions, exact tuple/lease/session, signed cancellation/audit events,
process termination, candidate hashes, provider effects and cleanup records.
No private chain-of-thought. Failed Attempts and their relationships remain
immutable; identical failure detection/budgets prevent an unbounded retry loop.

Bounded non-destructive drill performed: existing fake executor spawned an
owned process group/child, cancellation terminated both, cleanup completed;
three existing admission/reconciliation tests proved cancellation revokes
report/publication authority and stale worker/session writes are fenced. One
initial command used the wrong test filename and ran zero tests; its failure
is preserved separately. Corrected run: 1 process test PASS; 3 fencing tests
PASS. No production credential, real worker, model or provider publication was
used. This is a useful control rehearsal, not an end-to-end live incident drill;
actual host/credential containment remains a NO_GO blocker.

## Human decision and stop

The next safe decision is to resolve the named configuration/policy/runtime
blockers and review a fully pinned replacement proposal. Do not ask for an
unconditional GO while these remain. Jarrett must separately approve the exact
Plan, WorkOrder and later review/PR/acceptance/merge decisions. A pilot PR can
be prepared only after independent evidence, currentness and the required human
decision. No automatic merge or production deployment.

[Phase 0 review PR #169](https://github.com/jaydubya818/MissionControl/pull/169) is solely for completed readiness work; it is not a pilot
PR. Phase 1 preparation evidence is separate and remains uncommitted in this
workspace for review. Stop here. Do not execute WorkOrder 1 or Phase 2.
