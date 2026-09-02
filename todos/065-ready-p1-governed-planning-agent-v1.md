---
status: ready
implementation_status: in_progress
priority: p1
issue_id: "065"
tags: [missions, planning, factory, provenance, ui]
dependencies: []
---

# Governed Planning Agent V1

## Problem Statement

The ordinary Mission lifecycle cannot invoke repository-researched planning intelligence and receive a validated candidate directly in the Mission Plan Workspace. Plans can be reviewed and approved, but the planning proposal still requires manual transcription.

## Findings

- `MissionPlanWorkspace.tsx` exposes the existing Mission Plan mutations but no generation action.
- `convex/planning.ts` is a separate task-scoped legacy path and is not authoritative for Missions.
- Mission Plan approval freezes repository and branch, while dispatch currently resolves a host base commit; exact planning-to-execution revision binding is absent.
- `allowedTools` is recorded in Factory manifests but is not a per-tool field in the generic executor request. Planning must therefore rely on an enforced read-only harness/isolation boundary and must not claim general tool authorization.

## Proposed Solutions

### Option 1: Durable Mission planning run through the generic harness

**Approach:** Add an attributable Mission planning-run lifecycle claimed by the orchestration service, run the selected approved Factory tuple against an exact read-only checkout, validate structured output before creating a draft Mission Plan, and bind the researched SHA through WorkOrder dispatch.

**Pros:** Preserves replaceable intelligence, exact repository evidence, restart-safe state, and existing Mission approval authority.

**Cons:** Requires coordinated Convex, orchestration, UI, and test changes.

**Effort:** High

**Risk:** Medium

### Option 2: Generate inside a Convex action

**Approach:** Call a model provider from Convex and save its JSON result.

**Pros:** Smaller implementation.

**Cons:** Cannot truthfully prove exact-checkout research or generic harness execution and risks direct provider coupling.

**Effort:** Medium

**Risk:** High

## Recommended Action

Implement Option 1 within the approved timebox. Fail closed on unavailable repository identity, malformed output, read-only enforcement gaps, duplicate requests, or revision drift. Preserve the existing human submit/approve and WorkOrder materialization lifecycle.

## Technical Details

Expected areas include Mission schema/mutations, execution-manifest revision lineage, orchestration worker integration, Mission Plan Workspace UI, generated Convex bindings, and deterministic/browser tests.

## Acceptance Criteria

- [x] A browser action creates one durable, idempotent Mission planning run.
- [x] The planner inspects an exact immutable repository revision through an enforced read-only generic harness path.
- [x] Structured output is strictly validated before a candidate Mission Plan is persisted.
- [x] Planning provenance and research evidence are attributable and visible.
- [x] Human edits, submission, approval, rejection, and regeneration remain distinct events.
- [x] Approved planning SHA is inherited by WorkOrders and Attempt manifests; drift fails closed.
- [x] Targeted success and failure tests pass.
- [x] The real UI path executes a Planning Agent and returns a candidate in the browser.
- [x] Canonical qualification passes and a truthful NO-GO is recorded.
- [x] The known Task-less manifest-validation failure can be recovered only
      when server evidence proves the executor never started and spend is zero.
- [x] Recovery atomically materializes one canonical governed Task, releases
      only the proven zero-spend reservation, and creates a replacement Attempt.
- [ ] The exact approved implementation WorkOrder is retried through the real
      operator UI and reaches terminal candidate and verification evidence.

## Work Log

### 2026-08-30 - Final Authorized Attempt Executed; Dependency Boundary Corrected

**By:** Implementation session

**Actions:**
- Applied WorkOrder revision 3 through the browser, increasing only the
  cumulative cap from $24 to $48. Recorded four fresh revision-3 approvals
  authorizing one final Factory v3 Attempt capped at $24 and explicitly
  withholding publication, merge, deployment, waiver, and acceptance.
- Reverified GitHub App installation `152563527` through the browser and
  dispatched Task Attempt 3, run `gq16ag6e` / WorkflowRun
  `sh7tfppxgpabn1cbesnd6j43318de6b2`, on exact SHA
  `470057334800c7cddfc268b3f26d5ef3fc632088` and Factory v3.
- The real Codex executor created eight in-scope worktree changes, then returned
  `BLOCKED` because the linked worktree did not contain a usable dependency
  graph and therefore could not run full typechecking or the frozen
  `pnpm run test:e2e:critical` contract. No candidate commit, Verification
  Subject, verifier Attempt, publication checkpoint, or product PR was created.
- Preserved the terminal Attempt and its partial worktree unchanged. Did not
  create another Attempt or expand the approved budget.
- Corrected the control-plane defect at `7344b42`: Factory builder and detached
  verifier worktrees now run a lockfile-frozen, offline, lifecycle-script-free
  pnpm preparation before execution and reject any source-state mutation.
  Sixteen orchestration lifecycle tests, orchestration typecheck, full workspace
  typecheck, local critical browser checks (9/9), and every GitHub PR check pass.
- Rehearsed the live Mission Plan and final WorkOrder views in a fresh Chromium
  session with zero console errors and zero failed application requests.

**Blocker:**
- The final authorized Attempt is terminal without an immutable candidate or
  independent verification subject. The dependency fix prevents recurrence
  but cannot rewrite history. Another governed Attempt would require new
  budget and dispatch authority; none was inferred or consumed.

**Learnings:**
- A linked Git worktree does not inherit the host checkout's pnpm package links.
  Deterministic dependency preparation belongs before the model boundary so an
  Attempt cannot spend its execution budget discovering missing tooling.
- Passing branch CI is useful bootstrap evidence but is not interchangeable
  with Attempt-linked independent verification and must not be presented as if
  the Factory produced the existing pull request.

### 2026-08-29 - Live Recovery Proven; Scope Reconciled; Budget Decision Pending

**By:** Implementation session

**Actions:**
- Completed the browser-operated Task-less recovery. Canonical Task
  `ph7h5vq1043kms52c2r52kvjed8ddswr` was created atomically, only the
  server-proven zero-spend reservation was released, and replacement Attempt
  `dsf4y6au` retained exact causation.
- Corrected the claim envelope's frozen executor identity and used the same
  governed recovery control to create Task Attempt 2, `aj0whcd1`. The canonical
  worker claimed the exact Factory, SHA, branch, worktree, and lease.
- Attempt `aj0whcd1` failed closed during planning with zero file changes when
  it found that the prose authorized Convex/schema and golden-path tests while
  the executable scope allowed only UI files.
- Added versioned WorkOrder code-scope revisions and browser controls for the
  complete change budget. Applied revision 2 with the exact UI, Convex, and
  golden-path-test boundaries and recorded four fresh Product Owner decisions.
- Created and activated Factory v3
  `sh7ahq69kg6vzb0yykkz9fydas8dcw3v` / `factory-v1-746c28c5`; it preserves
  v2's route, workflow, policy, verifier, $24 per-attempt cap, and recovery
  contract while freezing the three required code scopes. All 16 readiness
  checks passed against the clean canonical worker.
- Added a browser-visible cumulative WorkOrder cost-cap field to the governed
  revision flow and a customer demo runbook.

**Blocker:**
- Saved ChatGPT authentication exposes no authoritative USD cost. The real
  `aj0whcd1` planning call therefore retains its conservative $24 reservation.
  A final Task Attempt requires an explicit revision of the cumulative
  WorkOrder cap from $24 to $48; this increase has not been inferred or applied.

**Learnings:**
- WorkOrder prose, repository code scopes, and the change-budget allowlist must
  agree before a worker can safely plan a mutation.
- Per-attempt Factory limits and cumulative WorkOrder authorization are
  different controls and must be displayed separately to the operator.

### 2026-08-28 - Approved Narrow Recovery Contract

**By:** Implementation session

**Actions:**
- Recorded the approved recovery boundary before implementation: recognize
  only the known stored-manifest digest mismatch, require server-side proof
  that execution never crossed the executor boundary, and keep the failed run
  immutable.
- Chose one transactional retry path that creates a new governed Task,
  reconciles only the failed run's reservation to proven zero spend, and
  creates the replacement Attempt or rolls the entire recovery back.
- Implemented the fail-closed proof predicate, audited Task materialization,
  zero-spend cost reconciliation, and new-Task Attempt numbering behind the
  existing human retry control.
- Passed 33 focused recovery/scheduler tests, 794 Convex tests, the complete
  workspace typecheck and lint, runtime-contract validation, and release
  security. Two unrelated orchestration timing tests failed under the first
  parallel suite load and then passed both isolated and in the complete
  single-worker orchestration suite (185 passed, 1 skipped).
- The first browser retry proved transaction rollback when the persistent
  retry omitted a Factory Version: the failed run remained Task-less with its
  $24 reservation intact. Tightened recovery to require and reuse the source
  Attempt's exact frozen Factory Version, then passed 34 focused tests and the
  UI package typecheck.
- The accepted browser retry then atomically created canonical Task
  `ph7h5vq1043kms52c2r52kvjed8ddswr`, released the historical run's $24
  reservation, and created Task Attempt `dsf4y6au`. Its persisted manifest
  digest validated exactly, but the worker failed closed because the Convex
  claim response omitted the frozen executor adapter and version. Added those
  fields to the claim contract plus a fail-closed Task-linked zero-spend
  recovery path that reuses the existing Task and exact Factory Version.
- Passed 39 focused recovery/scheduler tests, the 10-test orchestration worker
  lifecycle suite, Convex TypeScript compilation, and UI package typecheck for
  the claim-contract correction.

**Learnings:**
- The scheduler's existing architecture explicitly forbids reclassifying a
  historical Task-less WorkflowRun as a canonical Task Attempt. Recovery must
  begin new Task lineage while retaining Work Order retry causation.

### 2026-08-27 - RED Route Qualified; Live Attempt Failed Closed

**By:** Implementation session

**Actions:**
- Qualified and human-promoted immutable exact route revision `zd7624w4h7h7np5n1jmp33epsd8d86r4` for `SOFTWARE_CHANGE` at `RED` in the Mission Control repository, backed by a real disposable-repository Codex execution and independent tests.
- Added a fail-closed cost policy that reserves the approved $24 implementation cap when authoritative actual USD telemetry is unavailable; verified known, unknown, over-budget, and retry-over-remaining-budget behavior.
- Created and activated immutable Software Factory version 2, `sh7d132nqtswjw0g8wvcbpjf2n8d8aby` / `factory-v1-2dcece17`, reached 16/16 readiness, and re-attested the exact persistent worker clean.
- Reassessed routing to `SELECTED` with no rejection codes, then dispatched the approved implementation WorkOrder through the UI. Attempt `sh7pvakrn8r6e7hhtb7rzb7rfn8d9byv` / run `uct8ndgk` was claimed at the exact planning SHA and failed before executor invocation because its stored manifest digest did not validate.
- Corrected the manifest storage-round-trip digest defect and added regression coverage. Preserved the terminal live Attempt and its conservative reservation instead of rewriting history or treating unknown cost as zero.

**Blocker:**
- The authoritative WorkOrder has no canonical Task, and the terminal Attempt retains the full $24 reservation because actual cost is unavailable. Routing a replacement Attempt fails closed with `BUDGET_EXCEEDED`; there is no candidate or independent verification subject. The task remains in progress and NO-GO.

**Learnings:**
- Frozen execution digests must be computed from the exact representation persisted by Convex, including omission of optional fields.
- Plan approval currently materializes WorkOrders without the canonical Tasks required by the documented Mission hierarchy; the legacy Task-less dispatch fallback cannot satisfy the golden-path evidence contract.

### 2026-08-27 - Live Planning Path Reached the Execution Authority Gate

**By:** Implementation session

**Actions:**
- Verified canonical GitHub App `4543062` / installation `152563527` for `jaydubya818/MissionControl`, then reached Factory readiness `PASS` with 16/16 checks.
- Ran the real two-phase `mission-planner/v1` path through the browser at exact SHA `470057334800c7cddfc268b3f26d5ef3fc632088`; retained three failed validation runs and successful run `yn71gwer0h1jrdy257n0c9cdq18d9dz6` with exact research/generation receipts.
- Adopted the validated candidate into Plan `ys7at6f5rkhgwd4z36e9mr2jfh8d866g`, submitted and approved it through the UI, released both WorkOrders, and completed the implementation WorkOrder's four explicit human approvals.
- Clicked Dispatch in the WorkOrder UI. Routing decision `zh7dqvsgbw0h0sj6j6wxspqmed8d9typ` failed closed before Task/Attempt creation because the only exact Factory tuple is `YELLOW`/planning-qualified, while the WorkOrder requires `RED`, and the route has no cost estimate under the hard budget.
- Corrected only the genuine defects exposed by the live run: prompt/validator citation mismatch, non-JSON-safe candidate digest transport, undeclared relational citation-span validation, invalid nonmutating validator contract synthesis, and overbroad final-acceptance classification. Added focused regressions for every correction.

**Blocker:**
- The live planning lifecycle is proven through approved, exact-SHA-bound WorkOrders, but the current exact model route and Factory version do not possess the workload/risk/cost authority required to start the `CRITICAL` implementation Attempt. The task remains in progress and NO-GO; expanding that authority requires a separate reviewed qualification, not a software bypass.

**Learnings:**
- Factory readiness is definition-level evidence; WorkOrder-specific execution routing remains a later and stronger risk, workload, availability, and budget gate.
- A truthful internal pilot must stop before Attempt creation when the frozen model-route qualification does not cover the released WorkOrder.

### 2026-08-27 - Hardening Mission Executed

**By:** Implementation session

**Actions:**
- Added an OS-enforced Codex permission profile with live proof for allowed repository reads and denied host reads, secrets, writes, commit, push, network, credentials, and governance authority.
- Replaced misleading Factory-agent execution attribution with built-in `mission-planner/v1` identity plus per-phase prompt digests; retained the approved Factory agent only as admission context.
- Added a transactional server-side one-active-run guard, durable research/generation receipts, Plan-bound versus latest-unadopted UI semantics, draft-only adoption, constrained-width chat behavior, and approved-state warning cleanup.
- Passed repository-wide typecheck/test, runtime contract, release security, orchestration smoke, focused browser accessibility, and containment qualification.

**Blocker:**
- The positive browser path still cannot create a planning run because no verified GitHub App installation exists and the SOFTWARE Factory cannot activate. The UI-operated request fails before insertion, so the todo remains in progress and the decision remains NO-GO.

**Learnings:**
- Codex permission profiles provide the required OS-enforced workspace read boundary without composing them with the legacy `--sandbox` mode.
- Durable per-phase reporting is required before validation so a later retry cannot erase an earlier execution receipt.

### 2026-08-26 - Implementation Started

**By:** Implementation session

**Actions:**
- Confirmed the authoritative Mission and legacy task-planning boundaries at current `origin/main`.
- Confirmed exact revision binding and normal Mission Planning Agent invocation are absent.
- Selected the durable generic-harness planning-run approach required by the execution directive.

**Learnings:**
- General native tool authorization and first-class Skill package lineage remain outside this task and must not be overstated.

### 2026-08-27 - Qualification Stopped at the Live Gate

**By:** Implementation session

**Actions:**
- Qualified the exact `gpt-5.6-sol` Codex CLI route with a real read-only structured-output smoke and froze it into the browser-created Factory version.
- Created the verification Mission and Factory baseline through the UI, attested a clean exact-version worker, and ran Factory readiness from the browser.
- Confirmed 15 of 16 readiness checks; GitHub App installation remained the sole missing check and Factory activation remained disabled.
- Clicked `Generate Plan candidate` through the real Mission Plan UI and confirmed the request failed before planning-run persistence.
- Ran the canonical Factory qualification successfully and recorded UI-versus-backend operations in `docs/testing/evidence/governed-planning-agent-v1/07-ui-operation-log.md`.

**Blocker:**
- Required GitHub App server credentials and a verified installation identity are unavailable in this environment. The 24-hour decision is NO-GO until that baseline is configured and the complete browser-operated path is rerun.

**Learnings:**
- Automated exact-SHA and authority proof cannot substitute for a real browser-operated planner execution.
- The host must not advertise GitHub publication capability unless it is explicitly configured; that admission signal now fails closed.

### 2026-08-26 - Governed Path Implemented

**By:** Implementation session

**Actions:**
- Added durable planning runs, leases, bounded retries, signed worker commands, exact-SHA research packets, strict candidate validation, and frozen provenance.
- Integrated the Planning Agent into the existing Mission Plan Workspace with progress, failure remediation, evidence, history, editable adoption, and human-only submit/approval controls.
- Propagated the approved planning SHA through Plan, WorkOrder, Task, workflow Attempt, Quality Contract, and execution manifest; SOFTWARE dispatch rejects drift.
- Added shared worker capacity so planning and implementation cannot silently exceed the repository worker concurrency limit.

**Learnings:**
- The DeepSeek V1 adapter advertises partial structured output but does not admit request-bound schemas, so V1 planning requires a Factory harness with fully supported structured output and fails before queueing otherwise.
- A candidate can be edited before its first save without weakening provenance: the immutable generated candidate remains on the planning run, while the adopted Plan and audit event record the human-authored result separately.
