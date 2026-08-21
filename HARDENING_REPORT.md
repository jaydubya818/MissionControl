# Mission Control — Hardening, Verification Isolation & Production Readiness

> Sections 1–16 are passes 1–2 and are preserved unchanged.
> **Pass 3 begins at section 17.** Its status legend: **FIXED**, **VERIFIED**,
> **PARTIALLY VERIFIED**, **NOT VERIFIED**, **REMAINING**, **DESIGN DECISION REQUIRED**.

**Worktree:** `/Users/jaywest/.codex/worktrees/48f5/MissionControl`
**Base commit:** `75981d8ae1bd49e235cc1478bac3d0f853fc717f`
**Working tree state:** uncommitted — 194 files. Nothing committed, pushed, merged, or released.
**Date:** 2026-08-19
**Passes recorded here:** Pass 1–2 (sections 1–16), Pass 3 (sections 17–24).

---

## 1. Executive summary

This pass began by skeptically validating the previous uncommitted diff rather than
trusting it, and it found real regressions in that diff — which were fixed before
any new work started. It then continued through the 24-phase brief, prioritising
the phases where the gap between what Mission Control *claims* and what it *does*
was widest.

Three classes of defect dominated, and all three are the same failure at different
layers:

1. **Authorization that was structurally unenforceable.** 576 public Convex
   functions resolved no server-side authorization, and the two flags meant to gate
   the governed core defaulted off with gates that returned `null` — so an
   unconfigured deployment authorized everything, indefinitely, to anyone holding
   the deployment URL.
2. **Identity supplied by the caller.** Governed audit trails recorded whatever
   string the request contained. Every UI call site sent the literal `"operator"`.
3. **Fabricated evidence.** QC runs returned a constant `qualityScore: 82` with
   `gatePassed: true` for every repository at every commit, hashed that constant
   into an `evidenceHash`, stored it as an `EVIDENCE_PACK_JSON` artifact, and fed
   the dashboards. Test execution invented per-step verdicts. Token counts and
   costs were hardcoded. Agents ticked their own review checkboxes.

Each is now either fixed, structurally prevented from recurring, or withdrawn.
The full deterministic qualification suite (`pnpm run qualify:factory`) passes
**16/16** against this diff.

---

## 2. Validation of the pre-existing diff (Phase 1)

The prior diff was reviewed adversarially, not accepted. Regressions found in
**my own earlier work** and fixed in this pass:

| Regression | Consequence | Fix |
| --- | --- | --- |
| Delivery gate enforced, but `canAccessDeliveryRecord` returned `false` for unowned records | Every unowned WorkOrder — the default state — would have become unreachable by every operator who is not a company admin, with an unactionable error | Unowned records are decided by the workspace permission check; ownership only *narrows*. `convex/__tests__/deliveryRecordScope.test.ts` |
| `requireAuthorizedDeliveryScope` switched to an indexed read | Broke a test double that only implemented `.collect()`, masking a fail-closed assertion as a `TypeError` | Test double extended to answer `withIndex` and the `operators` read |
| Two "authorized path" fixtures held only `factory.*` permissions | Passed only because the gate was fail-open; would have failed in any real enforced deployment | Fixtures now hold the company-scope `delivery.approve` they assert authority with |

Two existing tests were changed. Both changes are behavioural, documented inline
with the reason, and paired with a new test that pins the new behaviour:
`companyAccess.test.ts` (unowned delivery records) and
`modelRoutingAuthorization.test.ts` (fixture permissions).

---

## 3. Authorization (Phases 2–4)

### The boundary — `convex/lib/authedFunctions.ts`

Wrappers that make the secure shape the easy one: `authedQuery/Mutation`,
`workspaceQuery/Mutation` (inject a **required** `projectId`),
`companyQuery/Mutation` (inject a required `tenantId`), `adminQuery/Mutation`,
and `publicQuery/Mutation` which require a non-empty `reason` string.

Every wrapper resolves the actor server-side onto `ctx.access.actorId`. The rule
is stated once and enforced by construction: **actor identity is never an
argument.**

In this pass `workspaceQuery`/`workspaceMutation` gained an *optional* permission,
so a read-only query can require workspace membership without inventing a write
permission for it.

### The rollout — `convex/lib/authorizationRollout.ts`

The fail-open-flag dilemma is resolved by treating **provisioning as the migration
signal**: authorization enforces as soon as the deployment has at least one active
operator, regardless of the flag.

| Deployment state | Flag off | Flag on |
| --- | --- | --- |
| No active operators | legacy, reported as `UNPROVISIONED` | enforced |
| ≥1 active operator | **enforced** | enforced |

The only unenforced state is the one where enforcing would refuse everyone, and it
self-resolves. `MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT=1` is reported separately with
an `UNSAFE:` headline.

### The ratchet — `scripts/check-convex-authorization.mjs`

A brace-matched, per-function scanner with a committed baseline. A new
unauthorized public function fails CI; the baseline may only shrink. Wired into
`pnpm run security:authorization`, `release:security`, and
`.github/workflows/ci.yml`.

**Baseline movement this pass: 576 → 571.** The functions that left:
`execution:executeApi`, `execution:executeUi`, `execution:executeHybrid`,
`execution:storeResult`, `comments:post`. Two new functions
(`approvals:pendingSummary`, `approvals:countPending`) were caught by the ratchet
before they could join the debt and were converted to `workspaceQuery` — which
also closed a cross-tenant read, because their `projectId` had been optional.

---

## 4. Fabricated evidence, quarantined (Phase 8)

### `convex/qcRuns.ts` — the most serious finding

`mockAssuranceCall` returned a hardcoded `QCEvidencePack`: `qualityScore: 82`,
`commitSha: "abc123def456"`, 78% unit coverage, every `deliveryGate.passed === true`,
and a requirement-traceability row naming real repository files as evidence for a
requirement nobody wrote. `execute` then computed an `evidenceHash` over that
constant, stored it as an `EVIDENCE_PACK_JSON` artifact, recorded `quality_score`
and `gate_passed` metrics for the dashboards, and completed the run as passing.

Every QC run against every repository at every commit produced the same verdict.

Both mocks are removed. `runQcAnalyzer` throws `QC_ANALYZER_UNAVAILABLE`, and the
existing `catch` marks the run `FAILED` with that reason. The entire downstream
pipeline — findings, artifacts, deterministic `computeRiskGrade`, metrics, RED
alerting — is untouched and still expects a `QCEvidencePack`, so a real adapter
drops straight in. `StartQcRunModal` states the situation before the operator
starts a run.

### `convex/execution.ts`

`evaluateSteps` marked every step "passed" unless the caller passed `shouldFail`,
timed it as `60 + index * 20` ms, and returned a `success` boolean derived from
nothing. Two additional defects were found in the same code path:

- `evaluateSteps` returned `{ evaluated }` but `testGeneration.ts:200` read
  `executionResult.steps`, so every `api_*` suite persisted `steps: []` while
  reporting a pass count.
- `TestGenerationView` called `storeResult` a **second** time after
  `testGeneration.execute` had already stored the result, doubling every row in
  Execution Results.

The three actions now throw `EXECUTION_RUNNER_UNAVAILABLE`. `storeResult` is
`internal` and requires a `producer` (`AUTOMATION_ADAPTER` | `MANUAL_IMPORT` |
`FIXTURE`) plus `producedBy`. As a public mutation it had accepted a
client-supplied `success: true` — anyone with the deployment URL could write
passing test evidence. `ExecutionView` labels unattributed rows as
"unattributed (simulated executor)".

### `packages/openclaw-sdk`

- `inputTokens: 1000, outputTokens: 500` on every completion, plus a `costUsd`
  the only in-repo caller hardcoded to `0.25`. `Deliverable.usage` is now required
  and `completeTask()` throws without it.
- A work plan of three generic bullets with `estimatedCost: 0.5`. The auto-start
  plan now says what it is and estimates nothing.
- **The agent ticked its own review boxes**: "Acceptance criteria addressed" and
  "Deliverable ready for independent review" were hardcoded `checked: true`, and
  rendered in the reviewer's UI as though a reviewer had confirmed them. Both now
  start unchecked; only the mechanically checkable "Evidence attached" is
  pre-filled.

### Other quarantines

| Site | Finding | Resolution |
| --- | --- | --- |
| `convex/planning.ts` | Fallback returned `estimatedCost: 0.5` / `"1–2 hours"` through the same shape as a generated plan, including when the model call failed and the error was swallowed by a bare `catch {}` | Returns `source: "TEMPLATE"` + `unavailableReason`, estimates nothing; `PlanningModal` renders the distinction |
| `shellV2/ChatDock.tsx` | `cost: 0.004`, `model: "factory-agent-router"` on deterministic client-side keyword routing; `cost: 0`, `latencyMs: 0`, `gate: allow` on persisted history | Unmeasured fields omitted; latency is the only real value retained |
| `CrmView.tsx` | Rendered the **agent fleet** as a sales pipeline: `IDLE` → "Prospect", `QUARANTINED` → "Proposal", with static "outreach"/"follow-up" badges and unwired buttons. "3 in Proposal" meant "3 quarantined agents" | Withdrawn; the page states there is no contact model |
| `TeamView.tsx` | "N active roles" counting hardcoded cards | Relabelled as a static reference model, not live fleet state |
| `seedMissionControlDemo.ts` | `evidenceHash: sha256:${Math.random()}` — indistinguishable from a real digest to every reader and verifier | `seed-fixture-no-evidence:<runId>`, deliberately not digest-shaped |

`RecommendationsView` was examined and left alone: the EOS layer already has an
honest `ProvenanceBadge` / `PageProvenanceNote` model that labels demo projections
at the point of display.

---

## 5. Identity integrity (Phase 13)

| Function | Before | After |
| --- | --- | --- |
| `comments.post` | `authorUserId` a caller-supplied string, written to `activities.actorId`. The only caller sent `"operator"` | `authedMutation`; the HUMAN author is `ctx.access.actorId` |
| `tasks.transition` | `actorUserId` caller-supplied, written to `activities.actorId` and the task event | HUMAN transitions re-derive from the authenticated operator; AGENT/SYSTEM paths (workflow executor, approval application) are unchanged |
| `tasks.assign` | same | same |

Seven UI call sites that sent `actorUserId: "operator"` were removed, along with
the prop types that required it. Regression coverage:
`convex/__tests__/taskActorAttribution.test.ts` asserts that an anonymous caller
cannot transition or assign a task under a chosen name.

---

## 6. Error isolation (Phase 9)

Mission Control had exactly **one** error boundary, in `main.tsx`, wrapping the
entire application. A render error anywhere in any of ~250 views — including one
caused by a single malformed record — replaced the whole console: no sidebar, no
navigation, no way to reach a different view, recovery only by reload.

That is the wrong failure mode for the tool an operator reaches for *during* an
incident, which is exactly when a bad record is most likely present.

`RouteErrorBoundary` now wraps only the routed content region and is keyed by
route, so navigating away clears the error without a reload. Runtime-contract
errors are deliberately re-thrown to the root boundary, because a client/backend
API mismatch is a whole-app condition.
Tests: `apps/mission-control-ui/src/RouteErrorBoundary.test.tsx`.

---

## 7. Operator UX (Phase 10)

The "Needs attention" queue appended items strictly by category — every approval,
then blocked, then needs-approval, then failed, then alerts — and then
`slice(0, 12)`. **With 12 pending approvals, every open alert and every failed task
was silently cut**, with no indication anything had been dropped. The header also
read `items.length`, so it displayed "12 items" whether there were 12 or 300.

`buildAttentionQueue` now sorts error-tone rows ahead of warning-tone rows (ties
broken by the original category order, so the result is stable), reports
`totalCount` and `hiddenCount`, and the panel renders an explicit "N more items
need attention and are not shown here" line. Tests:
`apps/mission-control-ui/src/lib/attentionQueue.test.ts`.

---

## 8. Accessibility (Phase 11)

**Non-text contrast (WCAG 2.2 SC 1.4.11).** `--border-subtle` measures **1.30:1**
against `--surface-primary` and **1.23:1** against `--surface-secondary`, and it
was the border of every text input, textarea, and select trigger — so a form field
had no perceivable edge. A new `--border-control` token (`#6b7079` dark,
`#82868e` light) measures 3.39–4.00:1 across every surface in its theme and is
applied to the shadcn `Input`, `Textarea`, and `SelectTrigger`, the `--input`
token, and the five hand-rolled `INPUT_CLASS` constants. `--border-subtle` is
retained for decorative dividers and card edges, which 1.4.11 does not cover — so
the visual language is unchanged everywhere it was already conformant.

**Mobile overlays (SC 2.1.2, 2.4.3, 4.1.2).** The compact shell's navigation and
chat overlays were plain `<div className="fixed inset-0">` panels: no
`role="dialog"`, no `aria-modal`, no accessible name, Escape did nothing, and Tab
walked straight through into the page behind the scrim — a keyboard user could
operate controls they could not see. The new `MobileOverlay` supplies dialog
semantics, Escape-to-close, initial focus, a bounded Tab cycle, and focus
restoration. Tests:
`apps/mission-control-ui/src/shellV2/MobileOverlay.test.tsx` (5 tests).

---

## 9. Runtime Google Fonts dependency (Phase 12)

Two blocking `@import url("https://fonts.googleapis.com/...")` statements meant:
the UI does not render text in an air-gapped or egress-restricted deployment (the
environment a governed control plane is most likely to run in); every operator's
IP and User-Agent were disclosed to Google on every load; and a third-party outage
degraded the console used to respond to incidents.

Fonts are now self-hosted via `@fontsource*` — **62 WOFF2 files bundled, zero
`googleapis` references in the production build**. Fira Code was imported but
referenced by no `font-family` declaration anywhere, and is gone.

This also removed the environmental cause of six previously-failing Playwright
tests; the shell-only suite now passes 9/9 without any sandbox workaround.

---

## 10. Runtime contract (Phase 23)

`RUNTIME_CONTRACT_VERSION` 30 → 31, covering **64** public contract changes.

A gap was found and closed in the guard itself: `PUBLIC_BUILDERS` contained only
`query`/`mutation`/`action`, so every function moved onto an authorization wrapper
became **invisible** to the contract guard — precisely the functions the
authorization migration is moving onto. The wrappers are now registered. Before
the fix the guard reported 62 changes and mis-classified `comments:post` as
"removed"; after, it correctly reports 64 including `approvals:countPending: added`
and `approvals:pendingSummary: added`.

---

## 11. Qualification evidence

Everything below was executed in this session. Nothing is inferred.

| Gate | Command | Result |
| --- | --- | --- |
| Full deterministic qualification | `pnpm run qualify:factory` | **16/16 PASS** (`docs/testing/evidence/system-factory-e2e-v2/automated-checks.json`) |
| Workspace + Convex typecheck | `pnpm typecheck` | PASS (exit 0) |
| All workspace suites | `pnpm test` | PASS (exit 0) — 708 tests across 102 files, plus 312 UI, plus 134 orchestration |
| Convex + script suites | `npx vitest run` (root) | **776 passed / 112 files** |
| UI suite | `npx vitest run` (mission-control-ui) | **317 passed / 70 files** |
| Lint + skill quality | `pnpm lint` | PASS — 10 skills, avg 100/100 |
| Authorization ratchet | `node scripts/check-convex-authorization.mjs` | **PASS** — 864 public, 293 authorized, 571 unauthorized (baseline 571) |
| Runtime contract guard | `node scripts/check-runtime-contract.mjs` | **PASS** — 64 changes accepted at v30 → v31 |
| Dependency audit | (within qualification) | PASS — critical 0, high 0 |
| Secret scan | (within qualification) | PASS — 2345 tracked files, no credential material |
| Production build | `vite build` | PASS |
| E2E — shell-only critical | `pnpm run test:e2e:critical` | **9/9 passed**, including 5 Axe accessibility checks and the mobile-shell viewport check |
| E2E — full suite | `npx playwright test` | 10 passed, 5 skipped, **10 failed** — see below |

### The 10 E2E failures are environmental, and I am not claiming otherwise

`playwright.config.ts` points `VITE_CONVEX_URL` at `http://127.0.0.1:3212` and
`VITE_ORCHESTRATION_URL` at `http://127.0.0.1:4100`. **Neither is listening in this
sandbox** (verified with `ss -ltnp`), and provisioning a Convex deployment requires
credentials I do not have. The captured failure context confirms the diagnosis: the
app rendered the default Command Center route with
*"The workspace projection has not resolved yet: loading"* instead of the requested
route, because no workspace could resolve.

These 10 specs (`work-orders-happy-path`, `docs-*`, `mission-draft-routing`,
`task-*`) require a seeded backend. **I did not run them to completion and make no
claim about them.** The shell-only suites, which are designed to run without a
backend, pass fully.

I also restored four committed evidence artifacts
(`docs/testing/evidence/**/*.zip`, `*.png`) that the Playwright run overwrote as a
side effect, and deleted the generated `test-results/` and `playwright-report/`
directories.

---

## 12. What I did NOT do, and why

These phases were scoped but not completed. Each is stated with what I found, so
the work is not lost.

| Phase | Status | Finding |
| --- | --- | --- |
| **7 — Route registry coherence** | Not done | ~14 files carry parallel route knowledge with no single `ROUTES` registry. `control-approvals` is live but invisible under the EOS flag; 48 `NAV_GROUPS` items are hard-blocked when the EOS flag is on; 14 Harness views are unreachable from any nav. This is a genuine multi-file refactor and I judged it too large to do safely alongside the security work. |
| **14 — Verification isolation** | Not done | The verifier executes the candidate's own `Makefile` / `package.json` scripts inside the candidate's worktree. A candidate can therefore influence its own verification. This is the most significant remaining architectural risk and deserves its own pass. |
| **16 — Dead code** | Not done | `convex/lib/stateMachine.ts` is dead *and* wrong; 9 feature flags are never read; `ui.shell.v1` is unregistered; 5 orphan packages; 23 orphan UI modules. |
| **17 — Type safety** | Not done | `apps/mission-control-ui/tsconfig.json` has `"strict": false`. Turning it on is a large, mechanical, high-churn change that would have made this diff unreviewable. |
| **18/19 — Reliability & observability** | Not done | `generateRunId()` uses `Math.random()`; the `sandboxReconciler` has a credential gap; the exe.dev `known_hosts` write is racy. |
| **11 (remainder)** | Partial | Hand-rolled one-off `<input>` elements outside the five `INPUT_CLASS` constants still use `border-line`. A global element-level rule would have overridden intentional error-state borders, so I left them for a deliberate sweep. |

---

## 13. Behavioural changes a reviewer must consciously accept

1. **Unowned delivery records are now accessible to anyone the workspace check
   authorized.** This is a widening relative to the literal previous code, but the
   previous behaviour was unreachable (the gate was fail-open) and would have
   locked out every non-admin the moment enforcement turned on.
2. **Authorization now enforces on any deployment with an active operator**, flag
   or no flag. A deployment that has operators but incomplete role/membership data
   will start refusing requests. `UNPROVISIONED` is reported, not silent.
3. **`approvals.pendingSummary` / `countPending` now require `projectId`.** The
   previous optional argument was a cross-tenant read.
4. **`completeTask()` in the OpenClaw SDK throws without `deliverable.usage`.**
   Any external harness must be updated to report measured tokens and cost.
5. **QC runs now fail** instead of completing with a fabricated pass.
6. **Test execution actions now throw** instead of returning invented results.

---

## 14. Preserved invariants — confirmed unchanged

- `workOrders.accept` remains the **only** authority producing `WORK_ORDER_ACCEPTED`.
- Execution success ≠ Verification success ≠ Gate eligibility ≠ Acceptance ≠ Merge.
- Humans merge GitHub PRs. No automation opens, merges, or releases anything.
- No alternative acceptance API was created; no harness can call acceptance.
- Nothing fails open where authority or currentness cannot be proven.
- `docs/testing/evidence/system-factory-e2e-v1/**` immutability gate: PASS.

---

## 15. Git discipline

Nothing was committed, pushed, merged, tagged, or released. No branch was created.
No other worktree was touched. No `git reset --hard`, `git clean -fd`, or
`git checkout .` was run.

The one `git checkout --` I did run named four specific evidence artifacts
(`docs/testing/evidence/**/*.zip|png`) that the Playwright run had overwritten as a
side effect of my own test execution — restoring them, not discarding work. It is
called out here rather than left implicit.

**All 180 changed/new files remain uncommitted in the working tree.**

---

## 16. Applying this on your machine

The sync bundle has been extracted into
`/Users/jaywest/.codex/worktrees/48f5/MissionControl` and verified by matching
SHA-1 digests on both sides.

One action is required before the UI will build locally:

```bash
pnpm install   # picks up the four @fontsource packages added to
               # apps/mission-control-ui/package.json + pnpm-lock.yaml
```

A stray `_to_delete/` directory exists in the worktree root — it holds the
transfer tarball, which the device bridge cannot delete. Remove it when convenient.

Recommended review order:

1. `convex/lib/authedFunctions.ts`, `authorizationRollout.ts`, `deliveryAuthorization.ts` — the security model
2. `convex/qcRuns.ts`, `convex/execution.ts` — the fabrication removals
3. `scripts/check-convex-authorization.mjs` + baseline — the ratchet
4. `docs/AUTHORIZATION.md`, `docs/EVIDENCE_AND_FABRICATION.md` — the written rationale
5. Everything else

---
---

# PASS 3 — Verification Trust Boundary, Evidence Authority, Production Readiness

## 17. Executive summary (pass 3)

This pass did not accept passes 1–2 as correct. It re-reviewed the accumulated
diff and then went after the item the previous pass had explicitly deferred as
*"the most significant remaining architectural risk"*: the verification trust
boundary.

Three things were established, in descending order of severity.

**1. A candidate could define what "passing" meant, and nothing detected it.**
The independent verifier ran its frozen commands with `cwd` set to the
candidate's own worktree under an executable allowlist. `pnpm` and `make` are on
that allowlist, so `{"scripts": {"test": "exit 0"}}` — or a `Makefile` whose
`test` target echoes PASS — produced a genuine, allowlist-compliant, PASSING
verification. The existing `NO_VERIFICATION_CONFIG_CHANGES` negative constraint
did not close this: its matcher never matched `package.json`, `Makefile`,
`justfile`, `.npmrc`, or `build.gradle`, and like every negative constraint it
was opt-in per WorkOrder. **FIXED**, structurally.

**2. An HTTP POST with an empty body accepted a WorkOrder on fabricated
evidence.** `POST /workorders/:id/automation-verification` defaulted its verdict
to `PASSED`, defaulted the observation to a hardcoded success string, hashed
that fabricated string into an `integrityHash`, stamped the receipts
`independent: true`, wrote PASSED receipts for **every** acceptance criterion,
and then called `workOrders.accept`. The bearer token it requires is an
infrastructure credential held by CI and the dev proxy — not an acceptance
authority. **FIXED**.

**3. Five more public Convex functions could mint high-authority records with no
authorization at all**, including one that turned the literal string `"PASSED"`
into a `VERIFIED` evaluation. **FIXED**, and the class is now ratcheted.

Full deterministic qualification passes **16/16** against the resulting diff.

## 18. Verification trust boundary — what changed

### Can candidate-controlled repository content still influence the verdict?

**Yes — and that is now stated, bounded, and governed rather than unnoticed.**

This is the honest answer and it is worth being precise about, because the
comfortable answer would be wrong. Nothing can make `pnpm test` independent
while the meaning of `pnpm test` lives in the tree under test. Moving it into a
container improves *containment*; it does not create *independence*. The brief
drew exactly that distinction and it is the right one.

What the boundary now does is make the dependency explicit and take the decision
away from the candidate:

| Property | Before | After |
| --- | --- | --- |
| Candidate can make `pnpm test` trivially pass | Yes, undetected | Detected; verdict **BLOCKED** |
| Candidate can rewrite `Makefile` target | Yes, undetected | Detected; **BLOCKED** |
| Candidate can rewrite `vitest.config.ts` | Only if the WorkOrder opted in | Always detected; **BLOCKED** |
| Candidate can delete the tests | Only if the WorkOrder opted in | Always detected; **BLOCKED** |
| Candidate can swap the lockfile / `.npmrc` | No | Detected; **BLOCKED** |
| Candidate can rewrite CI consumed as evidence | No | Detected; **BLOCKED** |
| Candidate can add a test alongside a feature | Yes | Yes — deliberately still allowed |
| Who may authorise a surface change | Nobody / implicit | The **frozen** Quality Contract, authored before the candidate existed |

**New: `packages/workflow-engine/src/verificationAuthority.ts`.** Classifies
every repository path into seven authority surfaces (`PACKAGE_MANIFEST`,
`LOCKFILE`, `BUILD_SCRIPT`, `TEST_CONFIG`, `TEST_SOURCE`, `RUNNER_CONFIG`,
`CI_CONFIG`), resolves every frozen check command to the surfaces that define
what it executes, and fails closed when the two intersect.

**The check cannot be omitted.** Unlike the change budget and negative
constraints, which are opt-in per WorkOrder, `VERIFICATION_AUTHORITY_CHECK` is
added to the check list unconditionally, and `VerificationEngine` constructs its
own `VerificationAuthorityVerifier` in its constructor rather than trusting the
caller to register one. A control a call site can forget to register is a
control an attacker only has to get omitted once.

**The line between blocked and allowed is deliberate.** `SURFACE_BLOCKING_RULES`
makes `TEST_SOURCE` violations `DELETION_ONLY` and everything else
`ANY_CHANGE`. The candidate may add proof; it may not remove proof; it may never
redefine what running the proof means. Blocking every test edit would block
essentially every real WorkOrder, and a control that blocks everything is a
control that gets switched off.

**The escape hatch lives in the frozen contract.**
`verificationContract.authorityPolicy` lets a Quality Contract say "this
WorkOrder is the Jest-to-Vitest migration, TEST_CONFIG may move." Absent means
not permitted. It is part of the frozen contract precisely so the decision
predates the candidate: a candidate cannot grant it to itself.

**Independence is no longer claimed on lineage alone.**
`deriveVerificationIndependence` now takes `authorityStatus`, derived
server-side from the reported packet by
`verificationAuthorityStatusFromPacket`. A `FAIL` adds an explicit reason;
**absent is treated as "not ruled out", never as pass**, so an older or
tampered-with verifier that omits the check cannot silently claim independence.

### Containment hardening

`sanitizedEnvironment()` forwarded `HOME` to candidate-controlled commands. The
verifier runs on the Factory worker's host, so `$HOME` is where
`~/.config/gh/hosts.yml` (GitHub CLI tokens), `~/.npmrc` (registry auth),
`~/.ssh/`, `~/.git-credentials` and `~/.aws/credentials` live. A candidate whose
test script read and printed those got them into the verification log, and the
executable allowlist saw nothing but `pnpm`. `HOME` is now redirected to a
scratch directory, package-manager lifecycle scripts
(`preinstall`/`postinstall`/`prepare`) are disabled via
`npm_config_ignore_scripts`, and `GIT_TERMINAL_PROMPT`/`GIT_ASKPASS` are
neutralised. **FIXED**, with a regression test that asserts the operator's real
`HOME` does not appear in command output.

### Adversarial tests

- `packages/workflow-engine/src/__tests__/verificationAuthority.test.ts` — 18 tests.
- `apps/orchestration-server/src/__tests__/factoryVerificationAuthority.test.ts` — 8 tests that write **real malicious fixtures to disk** and run the real `executeIndependentVerification`.

The load-bearing one: a command verifier that reports PASS for everything —
exactly what `{"scripts":{"test":"exit 0"}}` produces — combined with a
candidate that modified `package.json`, yields `verdict: "BLOCKED"`. The command
passes and the run is still refused.

**Status: FIXED and VERIFIED** for redefinition-detection and credential
containment. **DESIGN DECISION REQUIRED** for true out-of-tree independence —
see section 23.

## 19. Evidence authority audit (Phase B) — findings and disposition

A repo-wide sweep classified every writer capable of creating an evidence-like
record. Ranked findings and what was done:

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | `POST /workorders/:id/automation-verification` defaulted the verdict to PASSED, fabricated the observation, stamped `independent: true`, and called `workOrders.accept` | **FIXED** — status/observation/evidence location now all required and never defaulted; `independent: true` removed; acceptance call deleted |
| 2 | `executorRouter.onExecutionComplete` — public `mutation`, zero auth, client `success: boolean` marked any execution request COMPLETED | **FIXED** — `internalMutation` (it had no in-repo caller) |
| 3 | `skillAutomations.finalizeVerification` — public, zero auth; the literal string `"PASSED"` flipped an evaluation to `VERIFIED` and the Definition to `HEALTHY`, attributed to a client-supplied `actorId`. Nothing consulted a receipt | **FIXED** — requires `VERIFY_DELIVERY` in the Definition's workspace; actor server-derived |
| 4 | `skillAutomations.recordExecutionResult` — public, zero auth, client status + client actor | **FIXED** — requires `DISPATCH_WORK`; actor server-derived |
| 5 | `workflowRuns.createArtifact` / `linkArtifactToVerificationReceipt` — public, zero auth; anyone could insert an artifact with an arbitrary `contentHash` and splice it into a real verification receipt | **FIXED** — both require `DISPATCH_WORK` in the run's workspace |
| 6 | `workOrders.accept` recorded `actorId: args.actorId` — the most authoritative event in the system was attributed to a caller-chosen label (the HTTP proxy defaulted it to `"orchestration-server"`) | **FIXED** — the resolved operator from the `APPROVE_DELIVERY` check wins; the HTTP proxy no longer forwards an actor |
| 7 | `flakySteps.recordRun`, `monitoring.logPerformance`, `agentLearning.recordTaskCompletion` — public, zero auth, client-supplied pass/success driving operator-visible projections | **FIXED** — all three now require `DISPATCH_WORK` |
| 8 | Demo seeders write `status: "PASSED"` receipts into `verificationReceipts`, one with `independent: true` and a fabricated `integrityHash` | **REMAINING** — see section 22 |
| 9 | `context/manifests.saveLock` validates `manifestHash` **shape** but never recomputes it from `lockJson`; the value is copied into immutable activation receipts | **REMAINING** |
| 10 | `context/activation.*` — public, no permission check, client-supplied `actorId` recorded as a SYSTEM actor | **REMAINING** |
| 11 | `factory/prChecks.syncFromSources` transmutes a workflow run reporting its own completion into `harnessPrChecks.ciStatus = "PASS"`, which feeds merge-gate authority | **REMAINING** — this is an execution claim being read as CI evidence |
| 12 | `factory/prChecks.recordMerge` accepts a client `mergeCommitSha` never checked against GitHub or `evaluation.headSha` | **REMAINING** |
| 13 | `MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT=1` grants every company permission over every tenant to unauthenticated callers, short-circuiting every check above | **VERIFIED as intended** — already reported as `ANONYMOUS_DEMO` with an `UNSAFE:` headline (pass 2) |

Authorization ratchet movement this pass: **571 → 563**.

## 20. Provenance ratchet (Phase C) — FIXED

`convex/__tests__/evidenceAuthority.test.ts` (11 tests) encodes the authority
rules structurally, so the *shape* of the mistake fails CI rather than waiting
for a third audit to find the next instance:

- `workOrders.accept` is the only writer of `WORK_ORDER_ACCEPTED`.
- No verification route reaches acceptance as a side effect of reporting evidence.
- The execution worker and Codex adapter may not reference acceptance at all.
- The acceptance proxy may not let the caller name the actor.
- No **ungoverned** public Convex function may accept a pass/verified verdict as an argument and write it. Nine grandfathered entries carry a per-entry reason and an explicit size ceiling; the list may shrink, never grow.
- `execution.storeResult` stays `internalMutation`; `evaluateSteps` stays deleted; `EXECUTION_RUNNER_UNAVAILABLE` and `QC_ANALYZER_UNAVAILABLE` stay present.
- Independence is derived server-side and is fed the authority verdict.
- The authority check is registered structurally in the engine constructor.

One lesson worth recording: the ratchet initially failed against *its own
documentation*, because the comments explaining that `mockAssuranceCall` had
been removed contained the string `mockAssuranceCall`. A source-shape check must
strip comments before scanning — it now does.

## 21. Local Convex backend and Playwright (Phase L) — NOT RUN, with the exact blocker

Pass 2 reported 10 Playwright specs as not run because no backend was listening.
The brief asked me not to repeat that, but to investigate. I did.

| Avenue | Result |
| --- | --- |
| `npx convex dev --local` | Deprecated; redirects to `convex deployment select local` |
| `npx convex deployment select local` | `No local deployment found. Run npx convex deployment create local` |
| `npx convex deployment create local` | **`Creating a deployment requires logging in. Run npx convex login`** |
| `convex-local-backend` from npm | 404 — not an npm package |
| Self-hosted backend via Docker (`ghcr.io/get-convex/convex-backend`) | Docker CLI present, **no daemon**: `/var/run/docker.sock` does not exist in this sandbox |

So even a *local* Convex deployment requires an authenticated Convex account.
I have no such credential and will not invent one, and there is no container
runtime to self-host with. This is a hard environmental blocker, not a
judgement call.

**Result classification, kept strictly separate:**

- **PASS** — 9/9 shell-only E2E (`test:e2e:critical`), including 5 Axe accessibility scans and the mobile-viewport check.
- **NOT RUN** — the 10 backend-dependent specs (`work-orders-happy-path`, `docs-*`, `mission-draft-routing`, `task-*`). No claim is made about them.
- **FAIL** — none.

Phase M (browser validation of real operator workflows) is **NOT RUN** for the
same reason: it requires the backend that cannot be started here.

## 22. Full qualification (Phase N) — exact numbers

Every line below was executed in this session against this diff.

| Gate | Command | Result |
| --- | --- | --- |
| Full deterministic qualification | `pnpm run qualify:factory` | **16/16 PASS**, 0 FAIL |
| Convex + script suites | `npx vitest run` (root) | **787 passed / 113 files** |
| Orchestration server | `npx vitest run` | **142 passed, 1 skipped / 27 files** |
| Workflow engine | `npx vitest run` | **163 passed / 17 files** |
| Convex typecheck | `tsc -p convex/tsconfig.json` | PASS |
| Workspace typecheck + skill lint | (within qualification) | PASS |
| Authorization ratchet | `check-convex-authorization.mjs` | **PASS** — 863 public, 300 authorized, **563 unauthorized (was 571)** |
| Runtime contract guard | `check-runtime-contract.mjs` | **PASS** — 67 changes accepted at v30 → v31 |
| Dependency audit | (within qualification) | PASS — critical 0, high 0 |
| Secret scan | (within qualification) | PASS — no credential material |
| Production build | `vite build` + `tsc` | PASS |
| Orchestration startup smoke | `smoke:orchestration-start` | PASS |
| Git whitespace integrity | `git diff --check` | PASS |
| E2E (shell-only) | `test:e2e:critical` | **9/9 passed** |
| E2E (backend-dependent) | — | **NOT RUN** (section 21) |

## 23. REMAINING and DESIGN DECISION REQUIRED

### DESIGN DECISION REQUIRED

**D1 — True out-of-tree verification independence.** The current boundary
detects and blocks self-certification; it does not eliminate the dependency. To
get independence rather than governed dependency, the Verification Plan would
need to name **trusted verification operations resolved outside the candidate
tree** — a verifier-owned toolchain image, invoked directly (not through the
candidate's package scripts), with the candidate mounted read-only as data. That
is a real architectural change with real cost (per-language verifier images,
plan authoring changes, migration of existing contracts) and it should be a
decision, not something I quietly introduce at the end of an audit.

**D2 — Execution claims as CI evidence.** `factory/prChecks.syncFromSources`
converts a workflow run's self-reported completion into `ciStatus: "PASS"`,
which feeds merge-gate authority. Fixing this properly means deciding what the
authoritative source of CI truth is (GitHub Checks API vs. the run's own
report). Left untouched deliberately — changing it without that decision would
either break the merge gate or move the fabrication somewhere else.

### REMAINING (found, not fixed, nothing claimed)

| Item | Location |
| --- | --- |
| Demo seeders write `PASSED` receipts into `verificationReceipts`; `demoSeedExtensions.ts` sets `independent: true` and a fabricated `integrityHash` | `convex/workOrders.ts:seedDemo`, `convex/projects.ts:createSoftwareFactoryProject`, `convex/lib/demoSeedExtensions.ts` |
| `manifestHash` validated for shape, never recomputed from `lockJson`; copied into immutable activation receipts | `convex/context/manifests.ts:saveLock` |
| Public, unauthorized; client-supplied `actorId` recorded as a SYSTEM actor | `convex/context/activation.ts` |
| Client-supplied `mergeCommitSha` never bound to `evaluation.headSha` | `convex/factory/prChecks.ts:recordMerge` |
| Four orchestration routes still forward `body.actorId` into governed mutations | `apps/orchestration-server/src/index.ts:574, 874, 1151, 1363` |
| Unauthorized score/decision writers (`saveScreenReport` uses `db.replace`, so an attacker can overwrite an existing report) | `convex/agentHiring.ts`, `convex/operatorEvals.ts`, `convex/reviews.ts` |
| Phase E (route registry), F (dead code), G (reliability), H (observability), I (`strict: false`), K (UI review) | Not started this pass — see section 12 for the pass-2 findings, which still stand |

Phases E–K were deprioritised deliberately. The brief said not to polish
cosmetics while trust-boundary issues remained, and the trust-boundary work plus
the eight authorization fixes consumed this pass.

## 24. Invariants — re-verified this pass

Each is now backed by an executing test, not an assertion of intent:

- `workOrders.accept` remains the sole producer of `WORK_ORDER_ACCEPTED` — *and one alternative acceptance path was found and removed*.
- Execution success != Verification success — `execution.storeResult` is internal and requires producer attestation; `recordExecutionResult` can only reach `AWAITING_VERIFICATION`.
- Verification success != Acceptance — the verification route no longer accepts.
- Agents propose, verifiers attest, governance decides, humans merge — the SDK's self-checked review boxes stay unchecked; the harness and Codex adapter cannot reference acceptance.
- **No component may certify its own work** — newly enforced at the layer where it was actually being violated: the candidate could previously define what certification meant.

## 25. Git discipline (pass 3)

Nothing committed, pushed, merged, tagged, or released. No branch created. No
other worktree touched. No `git reset --hard`, `git clean -fd`, or
`git checkout .`.

`git checkout --` was used once, on named evidence artifacts under
`docs/testing/evidence/**` that the Playwright run overwrote as a side effect of
my own test execution, and `test-results/` + `playwright-report/` were deleted.
The two `system-factory-e2e-v2` JSON files ARE modified deliberately — they are
the qualification script's own output.

**All 194 changed/new files remain uncommitted.**

Reminder: `pnpm install` is required before building (pass 2 added four
`@fontsource` packages), and a `_to_delete/` directory in the worktree root
holds transfer tarballs the device bridge cannot delete.

---
---

# PASS 4 — Verification Authority & CI Evidence Trust

Resolves the two design decisions pass 3 left open: **D1** (out-of-tree verifier
authority) and **D2** (execution claims treated as CI evidence).

## 26. The evidence authority graph

### 26.1 Two orthogonal axes

The single most important change in this pass is refusing to collapse these:

| Axis | Question | Where it lives |
| --- | --- | --- |
| **Observation authority** | *Who asserts this happened?* | `convex/lib/evidenceAuthority.ts` |
| **Definition authority** | *Who decided what "success" means?* | `packages/workflow-engine/src/verificationAuthority.ts` |

Conflating them is what made both bugs possible. GitHub truthfully reporting
SUCCESS for a workflow the candidate rewrote to `exit 0` is **strong on
observation and weak on definition**. A `pnpm test` run in an isolated
Verification Attempt is **strong on lineage and weak on definition**. Neither is
independent evidence, and both used to be recorded as though they were.

Evidence is independent only when strong on **both** axes
(`resolveEvidenceIndependence`).

### 26.2 Producers → consumers

| Producer | Observation authority | Controls what is evaluated? | Can reach acceptance? | Can reach merge? |
| --- | --- | --- | --- | --- |
| FactoryAttemptWorker / Codex / sandbox worker | `EXECUTION_CLAIM` | Yes — it *is* the subject | No | No |
| `workflowRuns.status` → prChecks | `EXECUTION_CLAIM` | Yes | No | **No — was yes** |
| `codegenRequests.status` → prChecks | `EXECUTION_CLAIM` | Yes | No | **No — was yes** |
| `runEvents` test counts → prChecks | `EXECUTION_CLAIM` | Yes | No | **No — was yes** |
| `prChecks.recordManual` | `HUMAN_DECISION` | n/a | No | No |
| GitHub webhook → `githubCi.applyCiIngest` | `EXTERNAL_CI_ATTESTATION` | Depends on `.github/workflows/**` | No | Yes, when current + in-scope |
| Verification Attempt (`factory-command/v1`) | `INDEPENDENT_VERIFIER_ATTESTATION` lineage | **Yes** if the command is candidate-defined | Via evidence coverage | No |
| Change budget / negative constraints / verification authority verifiers | `INDEPENDENT_VERIFIER_ATTESTATION` | No — they read the candidate as data | Via evidence coverage | No |
| `workOrders.accept` | `HUMAN_DECISION` (operator, `APPROVE_DELIVERY`) | n/a | **Sole authority** | No |
| `githubAppPublisher` | — | n/a | No | **No merge capability exists** |

Every row above binds subject identity (`headSha`/`candidateSha`), plan digest,
and observed timestamp; currentness rules are in §29.

## 27. D2 — CI evidence trust: **RESOLVED**

### Answering the three questions with source references

**Q1. Can an execution run report COMPLETED and have it become a `prCheck`?**
It could. `convex/factory/prChecks.ts` mapped
`run.status === "COMPLETED" ? "PASS"` (workflow runs) and the same for
`codegenRequests`, then stamped `ciProvider: "github"` on **every** row
regardless of source — including rows that never touched GitHub.

**Q2. Could that record influence merge readiness?**
Yes, decisively. `mergeAuthoritySatisfied` (`convex/lib/prEvaluation.ts`)
required `ciStatus === "PASS"`, and `computeMergeGates` used the same value for
the `ci-security` gate. The chain was:

    worker reports COMPLETED
      -> workflowRuns.status
      -> prChecks.ciStatus = "PASS"  (+ ciProvider: "github")
      -> mergeAuthoritySatisfied
      -> merge recorded

**Q3. Did the consumer distinguish self-reported status from external CI?**
No. Both writers produced structurally identical `harnessPrChecks` rows.

### What changed

1. **`convex/lib/evidenceAuthority.ts`** (new) — five observation classes
   (`EXECUTION_CLAIM`, `EXTERNAL_CI_ATTESTATION`,
   `INDEPENDENT_VERIFIER_ATTESTATION`, `SYSTEM_OBSERVATION`, `HUMAN_DECISION`).
   `classifyPrCheckAuthority` **derives** the class from provenance and never
   reads a stored label: a row is an external attestation only if it carries
   `installationId`, `providerRepositoryId`, `provider`, `headSha` **and**
   `sourceEventId`. Missing any of them fails closed to `EXECUTION_CLAIM`.

2. **The provider label is no longer forged.** `upsertPrCheck` sets
   `ciProvider` only when `source === "GITHUB"`.

3. **Merge authority requires a real attestation.** `recordMerge` calls
   `evaluateCiMergeAuthority`, which additionally requires the PASS to be
   current for this candidate head, for this provider repository, and unexpired.
   Refusals are typed: `NOT_EXTERNALLY_ATTESTED`, `STALE_HEAD`,
   `REPOSITORY_MISMATCH`, `ATTESTATION_EXPIRED`, `NOT_PASSING`,
   `NO_CI_EVIDENCE`.

4. **`mergeAuthoritySatisfied` takes `ciAuthoritySatisfied`.** It is optional
   and defaults to the legacy `ciStatus` test, so omitting it can never *grant*
   authority the status alone would not — it can only withhold it.

5. **Candidate-controlled workflows are classified, not laundered.**
   `classifyCiDefinitionAuthority` marks a CI result `CANDIDATE_DEPENDENT` when
   the candidate touched `.github/workflows/**` (or GitLab/Azure/Jenkins/
   CircleCI/Buildkite equivalents). `trustedWorkflowRefs` lets an
   organisation-level reusable workflow — which the candidate's repository
   cannot modify — stay `INDEPENDENT`.

### GitHub webhook provenance: **VERIFIED, already correct**

`convex/http.ts` `/github/webhook` was audited and needed no change:
HMAC-SHA256 signature required; **fail-closed 503 when unconfigured**;
`x-github-delivery` required; duplicate deliveries short-circuit; repository and
installation identity read **from the signed payload**, never from query params;
unauthorized installations rejected 403. A structural test now pins all of it.

The distinction the brief asked for is preserved explicitly: a valid signature
proves GitHub sent the payload. It does not prove the workflow was independent.

## 28. D1 — verification authority: **RESOLVED for classification, PARTIALLY RESOLVED for execution**

### The bug pass 3 did not find

`FactoryCommandVerifier` hardcoded
`producer: { role: "INDEPENDENT_VERIFIER", independent: true }` on **every**
command result — including `pnpm test` against a `package.json` the candidate
had just rewritten. `calculateCriterionCoverage` filters acceptance evidence on
exactly that flag. So a Quality Contract declaring
`requiredEvidence: [{ independent: true }]` was already being satisfied by the
candidate's own definition of passing. **The schema was right; the value was
self-declared.**

This surfaced as five failing tests the moment independence stopped being
hardcoded — the existing fixtures were asserting a guarantee the system never
provided.

### The resolution: two axes, backwards-compatible default

Rather than silently tighten every deployment's contracts, the two meanings were
separated:

| Field | Meaning | Behaviour |
| --- | --- | --- |
| `producer.independent` | **Lineage** — separate Attempt, lease, executor invocation | Unchanged; still `true` for Verification Attempts |
| `producer.definitionAuthority` | **Definition** — does the candidate control what passing means? | New; derived by `resolveCheckIndependence`, never self-declared |
| `EvidenceRequirement.independenceLevel` | What a criterion demands | New; **defaults to `CANDIDATE_DEPENDENT_ALLOWED`** |

`ANY_VERIFICATION` / `CANDIDATE_DEPENDENT_ALLOWED` / `INDEPENDENT_REQUIRED`.
Every existing contract keeps working unchanged; a contract opts in to the
strong form. Evidence predating the axis reads as `CANDIDATE_DEPENDENT`, so
omission can never satisfy `INDEPENDENT_REQUIRED`.

**`TRUSTED_VERIFIER_IDS`** is the out-of-tree registry, deliberately small:
`factory-change-budget`, `factory-negative-constraints`,
`factory-verification-authority`. These read the candidate as *data* — a diff, a
file list — rather than executing anything it wrote. That is what makes them
independent, and why membership is explicit rather than inferred.

### What remains for D1: **DESIGN DECISION STILL REQUIRED (narrowed)**

Classification is resolved. Mission Control can now state, per check, whether it
is independent, and a contract can require independence. What is **not** built is
a pinned verifier *image* registry that would let a repository-owned check become
independent by being executed from an immutable out-of-tree toolchain.

The remaining decision is narrow and concrete: **which verifier images Mission
Control will own and publish** (per language/ecosystem), and who maintains them.
That is a resourcing decision, not a code one — the seam (`TRUSTED_VERIFIER_IDS`
plus `resolveCheckIndependence`) is in place for adapters to register against.

Containment properties already in place from pass 3: fresh detached worktree per
Verification Attempt, subject digest binding, sanitized environment with `HOME`
redirected away from the operator's credentials, lifecycle scripts disabled,
executable allowlist, timeout, output redaction. Not yet: network disabled by
default, non-root enforcement, explicit resource limits. Those are containment
improvements and are listed as REMAINING.

## 29. Currentness

| Change | Stales |
| --- | --- |
| Candidate SHA | External CI evidence (`STALE_HEAD`), verification receipts (existing `verificationReceiptsInvalidatedByPrHead`) |
| Provider repository | CI evidence (`REPOSITORY_MISMATCH`) |
| Attestation expiry | CI evidence (`ATTESTATION_EXPIRED`) |
| Verification Plan digest / Quality Contract revision | Verification Attempt lineage (existing `deriveVerificationIndependence` tuple match) |
| Authority-defining files | Verification verdict → `BLOCKED` (pass 3) |
| CI workflow definition | CI definition authority → `CANDIDATE_DEPENDENT` |

A replayed, genuinely-signed old SUCCESS remains bound to the SHA it was
observed against and cannot vouch for a later candidate — tested explicitly.

## 30. Anti-self-attestation tests added this pass

| Suite | Count | Covers |
| --- | --- | --- |
| `convex/__tests__/evidenceAuthorityClasses.test.ts` | 18 | Self-reported completion; GitHub label without provenance; stale head; cross-repository check; expired attestation; replayed event; candidate-authored workflow; laundering detection |
| `packages/workflow-engine/src/__tests__/verificationAuthority.test.ts` | 25 (was 18) | Derived vs self-declared independence; trusted verifier registry; `INDEPENDENT_REQUIRED` enforcement; back-compat default; omission ≠ independence |
| `convex/__tests__/evidenceAuthority.test.ts` | 16 (was 11) | No merge capability exists; merge behind CI authority; webhook provenance pinned; no self-declared definition independence |
| `apps/mission-control-ui/src/components/EvidenceAuthorityBadge.test.tsx` | 6 | UI never shows unknown authority as independent |

## 31. UI explainability (Part 14)

`EvidenceAuthorityBadge` renders the authority beside every check status in the
Run Inspector, with the server's specific reason as the drill-down — e.g.
*"node resolves its behaviour from PACKAGE_MANIFEST, TEST_CONFIG, TEST_SOURCE
inside the candidate repository… candidate-dependent, not independent."*

A missing `definitionAuthority` renders as **"Authority unknown"**, never as
independent: omission is not the optimistic case. `verificationIsGreen` only
returns true for a literal `VERIFIED` verdict, so a run that failed an
`INDEPENDENT_REQUIRED` criterion cannot show a green summary tile.

## 32. Qualification (Pass 4) — exact numbers

| Gate | Result |
| --- | --- |
| `pnpm run qualify:factory` | **16/16 PASS, 0 FAIL** |
| Convex + script suites (`npx vitest run`, root) | **805 passed / 114 files** |
| Orchestration server | **142 passed, 1 skipped / 27 files** |
| Workflow engine | **170 passed / 17 files** |
| Mission Control UI | typecheck clean; badge suite 6/6 |
| Authorization ratchet | **PASS** — 563 unauthorized (unchanged) |
| Runtime contract guard | **PASS** — 67 changes at v30 → v31 |
| Production build | PASS |
| Orchestration startup smoke | PASS |
| `git diff --check` | clean |
| E2E shell-only (`test:e2e:critical`) | **9/9 passed** |
| E2E Convex-backed | **NOT RUN** — blocker unchanged from §21 (`npx convex deployment create local` requires login; no Docker daemon) |

## 33. Remaining threat model

| Item | Status |
| --- | --- |
| Pinned verifier images for repository-owned checks | DESIGN DECISION (narrowed — see §28) |
| Verifier sandbox: network-disabled-by-default, non-root, resource limits | REMAINING |
| `trustedWorkflowRefs` has no registration UI or storage yet — the mechanism exists, the operator surface does not | REMAINING |
| Demo seeders still write `PASSED` receipts (`workOrders.seedDemo`, `projects.createSoftwareFactoryProject`, `demoSeedExtensions`) | REMAINING (from §23) |
| `context/manifests.saveLock` does not recompute `manifestHash` | REMAINING (from §23) |
| Four orchestration routes forward `body.actorId` | REMAINING (from §23) |
| Phases E–K from pass 2 (routes, dead code, reliability, observability, `strict: false`) | REMAINING |

## 34. Final answers

**1. Can an execution worker directly produce independent verification evidence?**
**NO.** Workers produce `EXECUTION_CLAIM`. `execution.storeResult` is internal
and requires producer attestation; `skillAutomations.recordExecutionResult` can
only reach `AWAITING_VERIFICATION`. Independence is derived by the control plane
(`deriveVerificationIndependence`), never asserted by the producer.

**2. Can a worker's self-reported COMPLETED/PASSED state become CI evidence?**
**NO** — it could before this pass. `classifyPrCheckAuthority` returns
`EXECUTION_CLAIM` for `WORKFLOW`/`CODEGEN` sources regardless of `ciStatus`, and
`evaluateCiMergeAuthority` refuses it with `NOT_EXTERNALLY_ATTESTED`.

**3. Can GitHub reporting SUCCESS automatically make evidence independent?**
**NO.** It makes the *observation* external. Independence additionally requires
`definition === "INDEPENDENT"`; `resolveEvidenceIndependence` requires both.

**4. Can a candidate modify a GitHub workflow and use that workflow's success as independent evidence?**
**NO.** `classifyCiDefinitionAuthority` marks it `CANDIDATE_DEPENDENT`. It is
still recorded as externally observed — we do not pretend GitHub did not see it —
but it cannot satisfy an independence requirement.

**5. Can a candidate modify package.json/Makefile and certify itself through that command?**
**NO.** Two independent controls: the always-on verification-authority check
returns `BLOCKED` (pass 3), and `resolveCheckIndependence` marks the evidence
`CANDIDATE_DEPENDENT` (this pass).

**6. Can candidate-dependent tests still be recorded and used where policy allows?**
**YES** — deliberately. They are recorded with full output and classified
honestly, and `CANDIDATE_DEPENDENT_ALLOWED` is the **default**. Repository tests
are legitimate evidence; the goal is explicit authority, not blocking them.

**7. Can a Quality Contract require independent evidence?**
**YES.** `EvidenceRequirement.independenceLevel: "INDEPENDENT_REQUIRED"`,
enforced in `calculateCriterionCoverage`.

**8. Is independent verification executed using authority outside candidate control?**
**PARTIALLY.** The trusted verifiers (change budget, negative constraints,
verification authority) are Mission Control code reading the candidate as data —
genuinely outside its control. Repository-owned command checks execute
candidate-authored code and are classified `CANDIDATE_DEPENDENT` rather than
being made independent. Closing that gap is the narrowed D1 decision in §28.

**9. Can stale CI/verification evidence satisfy a new candidate?**
**NO.** `STALE_HEAD` on head mismatch, `REPOSITORY_MISMATCH` on cross-repository
reuse, `ATTESTATION_EXPIRED` on expiry; replay tested explicitly.

**10. Can any route other than the canonical acceptance authority create WORK_ORDER_ACCEPTED?**
**NO.** Re-audited this pass: `WORK_ORDER_ACCEPTED` is written only in
`convex/workOrders.ts`. Callers of `workOrders.accept` are the operator UI and
one operator-initiated proxy route. No CI, webhook, verifier, or worker path
reaches it. Pinned by three structural tests.

**11. Can any Mission Control agent/worker/verifier merge a PR?**
**NO.** The capability does not exist: `githubAppPublisher` and
`githubAppRuntime` issue only GET and POST to `/pulls` (list and create). There
is no `PUT /pulls/{n}/merge`, no `auto_merge`. `recordMerge` records a merge that
already happened. Pinned by a structural test.

**12. Is every green state shown in the UI backed by genuine evidence of the corresponding authority class?**
**PARTIALLY.** The Run Inspector now shows authority beside every check status
with a specific reason, and unknown authority never renders as independent. The
merge-gates and PR-evidence panels have not yet been given the same treatment —
listed as REMAINING.

## 35. Git discipline (pass 4)

Nothing committed, pushed, merged, tagged, or released. `git checkout --` used
once on named `docs/testing/evidence/**` artifacts the Playwright run overwrote;
`test-results/` and `playwright-report/` deleted. The two
`system-factory-e2e-v2` JSON files are the qualification script's own output.

**All 202 changed/new files remain uncommitted.**

---
---

# PASS 5 — Final Stabilization Review & Commit Decomposition

Read-only regression audit of the accumulated four-pass diff, plus the commit
structure to use. **Two P0 lockouts and one P1 break were found and fixed; those
are the only code changes in this pass.**

## 36. Verdict

**READY_TO_COMMIT** — after the three fixes in §37.

Base `75981d8ae1bd49e235cc1478bac3d0f853fc717f` · **204 files** ·
`169 files changed, 3535 insertions(+), 1371 deletions(-)` (+35 new untracked).

## 37. Regressions found and fixed in this pass

### P0-1 — `agentLearning.recordTaskCompletion` threw unconditionally

Pass 3 added an authorization guard by script and passed a literal `undefined`
scope:

```ts
await requireAuthorizedDeliveryScope(ctx, undefined, COMPANY_PERMISSIONS.DISPATCH_WORK);
```

`requireAuthorizedDeliveryScope` rejects an absent workspace outright once
enforcement is on (*"An authorized workspace is required…"*), so the function
**always threw** — for every caller, including `@mission-control/agent-runtime`.
Typecheck and tests were blind to it because the argument is legitimately
optional in the signature.

**Fixed:** the task is loaded first and the guard scopes to `task.projectId`.

### P0-2 — `APPROVE_DELIVERY` was unreachable by every shipped role

Two permission ladders live in `convex/lib/companyAccess.ts` and disagreed:

- `roleGrantsFactoryPermission` honours a **legacy alias table** — a role holding
  `approvals.decide` gets `FACTORY_PERMISSIONS.APPROVE`.
- `roleGrantsPermission` (the company ladder) resolved the delivery permissions
  by matching role **names** against `"workspace lead" | "product manager" |
  "team lead"` — and then `return`ed that comparison directly.

Neither shipped catalog uses those names:

| Catalog | Roles |
| --- | --- |
| `convex/companyMembers.ts` | Company Owner, Portfolio Owner, Scrum Lead, Developer, Read-only Auditor |
| `convex/seedMissionControlDemo.ts` | Owner, Operator, Reviewer, Observer |

So only the role matching `isCompanyAdminRole` could satisfy `APPROVE_DELIVERY`.
A **Portfolio Owner** — holding `missions.approve`, `workorders.dispatch` and
`approvals.decide`, the role that exists to own governed decisions — was refused
`workOrders.accept`. And RED-risk dual control sets
`requiredDecisionCount: 2` and needs two **distinct** approvers, so with one
qualifying role it was **unsatisfiable**.

This was invisible until pass 2, because `requireAuthorizedDeliveryScope`
returned `null` on a flag-off deployment. Provisioning-driven enforcement made
a latent gap into a live lockout — the same shape as the unowned-record lockout
caught in pass 3.

**Fixed** by making the two ladders agree: name matches now **grant** rather
than **decide**, falling through to a `LEGACY_DELIVERY_PERMISSION_ALIASES` table
scoped tightly per permission (`approvals.decide`/`missions.approve` →
`APPROVE_DELIVERY`; `workorders.dispatch` → `DISPATCH_WORK`; etc.).

This does not widen authority — every alias already confers the equivalent
factory permission a few lines below in the same file. Pinned by
`convex/__tests__/deliveryPermissionLadder.test.ts` (8 tests), which asserts the
**shipped catalogs** in both directions: Portfolio Owner can approve, dual
control is satisfiable, and Developer / Scrum Lead / Read-only Auditor / a
dispatch-only role still cannot.

### P1 — `scripts/import-knowledge-graph.mjs` was broken

`knowledgeGraph:importGraphifyJson` was converted to `internalMutation`, but the
script calls it through `ConvexHttpClient`, which cannot address internal
functions. **Fixed** by routing through `npx convex run` — the same path the
seeders and migrations use.

## 38. Invariants re-verified from source

| Invariant | Method | Result |
| --- | --- | --- |
| `workOrders.accept` is the sole acceptance authority | `WORK_ORDER_ACCEPTED` writers across `convex/**` | Only `convex/workOrders.ts` ✅ |
| No alias/wrapper reaches acceptance | grep `acceptWorkOrder`, `accept(` | One UI `useMutation(api.workOrders.accept)` ✅ |
| Mission Control cannot merge | grep `pulls/*/merge`, `auto_merge`, `merge_method`, `enableAutoMerge` | **Zero matches** ✅ |
| Execution success ≠ Verification success | `execution.storeResult` internal; `recordExecutionResult` caps at `AWAITING_VERIFICATION` | ✅ |
| Verification success ≠ Gate eligibility | `evaluateCiMergeAuthority` required alongside `ciStatus` | ✅ |
| Gate eligibility ≠ Acceptance | acceptance requires `APPROVE_DELIVERY` + record scope, independent of gates | ✅ |
| Acceptance ≠ Merge | `recordMerge` only records; no merge capability exists | ✅ |

## 39. Schema and migration safety: **SAFE**

The entire four-pass diff adds to `convex/schema.ts`:

- **6 indexes** on existing tables (`operators.by_active`, `contextPackages.by_project`, `approvalDecisions.by_project`, `alerts.by_project_status`, plus two more) — additive, Convex backfills.
- **1 new table** `rateLimits` — all fields required, but no legacy rows exist.
- **Zero new fields on existing tables.**

`definitionAuthority` and `independenceLevel` are **not schema-validated**: they
live in workflow-engine TypeScript types and in-flight verification results.
Verified that `evidenceEnvelopes.producer` is a strict `v.object` whose value is
**constructed server-side** at `convex/factory/attempts.ts:1465` rather than
spread from the draft — so the new field cannot cause an "Object contains extra
field" validation failure. Old persisted rows are unaffected, and absent
`definitionAuthority` fails closed for `INDEPENDENT_REQUIRED`.

## 40. Runtime contract: **v31 is sufficient — do not bump again**

`check-runtime-contract.mjs` PASSES at v30 → v31 with 67 accepted public
changes. The guard compares the public surface against the merge base and
requires exactly one increment per shipped contract change set; the many
implementation-only edits do not each require a bump. Recommendation: **ship at
v31**. Bump again only if the surface changes after this review.

## 41. Findings NOT fixed (P2 — do not block)

| # | Finding | Why not now |
| --- | --- | --- |
| 1 | Three URL validators coexist (`safeExternalUrl`, `safeLinkHref`, `validateOutboundUrl`) | Distinct responsibilities (UI href vs outbound SSRF); consolidation is a refactor, not a fix |
| 2 | `classifyCiDefinitionAuthority` treats an unmodified in-repo workflow as `INDEPENDENT`, while `resolveCheckIndependence` treats an unmodified in-repo `pnpm test` as candidate-dependent | Different questions (*did the candidate move CI?* vs *where does this command's meaning live?*), but the asymmetry is real and the CI side is the weaker standard. Tightening it changes merge-gate behaviour and needs its own qualification |
| 3 | `definitionAuthority` is enforced at coverage-evaluation time but not persisted on `evidenceEnvelopes` | Enforcement path is correct; a later re-read cannot re-derive the axis. Provenance completeness, not a break |
| 4 | `execution.storeResult` is internal with no caller at all | Dead but harmless; the seam is deliberate |
| 5 | UI queries that became `"skip"` on a null workspace can show a permanent skeleton | Pre-existing pattern, cosmetic |
| 6 | Ratchet: 563 of 863 public functions still unauthorized | Prevents regression; does not represent completion |
| 7 | Four orchestration routes still forward `body.actorId` | Recorded since §23 |

## 42. Qualification (final state, after the §37 fixes)

| Gate | Result |
| --- | --- |
| `pnpm run qualify:factory` | **16/16 PASS, 0 FAIL** |
| Convex + script suites (root) | **818 passed / 115 files** |
| Orchestration server | 142 passed, 1 skipped / 27 files |
| Workflow engine | 170 passed / 17 files |
| Authorization ratchet | PASS — 563 unauthorized (baseline held) |
| Runtime contract guard | PASS — v30 → v31, 67 changes |
| Production build / startup smoke / secret scan / dep audit | PASS |
| `git diff --check` | clean |
| E2E shell-only | **9/9 passed** |
| E2E Convex-backed | **NOT RUN** — `npx convex deployment create local` requires login; no Docker daemon. Unchanged from §21 |

## 43. Recommended commit decomposition (7 commits)

Ordered by dependency. **Commits 1 and 2 must land together or in this order** —
2 depends on the wrappers 1 introduces.

### Commit 1 — `feat(auth): server-derived authorization boundary for Convex functions`
Wrappers, rollout, ladder reconciliation, ratchet.
```
convex/lib/authedFunctions.ts  convex/authorization.ts
convex/lib/authorizationRollout.ts  convex/lib/rateLimit.ts
convex/lib/companyAccess.ts  convex/lib/companyContextGate.ts
convex/lib/deliveryAuthorization.ts  convex/governance/permissions.ts
convex/orgMembers.ts  convex/featureFlags.ts  convex/lib/flags.ts
convex/gatewayConnection.ts  convex/webhooks.ts  convex/policy.ts
scripts/check-convex-authorization.mjs  scripts/lib/convex-authorization-scan*.mjs
scripts/convex-authorization-baseline.json
convex/__tests__/{authorizationRollout,companyAccess,deliveryRecordScope,deliveryPermissionLadder}.test.ts
convex/schema.ts  ← rateLimits table + by_active index ONLY (see §44)
```
Revertible: yes, if 2–4 revert with it. Tests: the four `__tests__` above + `security:authorization`.

### Commit 2 — `fix(auth): derive actor identity server-side`
```
convex/tasks.ts  convex/comments.ts  convex/approvals.ts  convex/workOrders.ts (accept actor hunk)
convex/agentLearning.ts  convex/flakySteps.ts  convex/monitoring.ts
convex/executorRouter.ts  convex/skillAutomations.ts  convex/workflowRuns.ts
apps/mission-control-ui/src/{TaskDrawer,TaskDrawerTabs,TaskEditMode,Kanban,DashboardOverview,TaskComments}.tsx
convex/__tests__/taskActorAttribution.test.ts
```
Depends on 1. Tests: `taskActorAttribution`, `modelRoutingAuthorization`.

### Commit 3 — `fix(evidence): remove fabricated evidence and gate producers`
```
convex/qcRuns.ts  convex/execution.ts  convex/testGeneration.ts  convex/hybridWorkflows.ts
convex/codegen.ts  convex/mission.ts  convex/planning.ts  convex/seedMissionControlDemo.ts
packages/openclaw-sdk/src/{client,types}.ts  packages/openclaw-sdk/README.md
apps/mission-control-ui/src/{ExecutionView,TestGenerationView,StartQcRunModal,PlanningModal,CrmView,TeamView}.tsx
apps/mission-control-ui/src/shellV2/ChatDock.tsx
convex/__tests__/evidenceAuthority.test.ts  docs/EVIDENCE_AND_FABRICATION.md
```
Independently revertible. Tests: `evidenceAuthority`.

### Commit 4 — `feat(verification): candidate cannot define its own verdict`
```
packages/workflow-engine/src/verificationAuthority.ts
packages/workflow-engine/src/verification.ts
packages/workflow-engine/src/verificationIndependence.ts
packages/workflow-engine/package.json
apps/orchestration-server/src/factoryVerification.ts
apps/orchestration-server/vitest.config.ts  vitest.config.ts
convex/factory/attempts.ts
packages/workflow-engine/src/__tests__/{verificationAuthority,verification}.test.ts
apps/orchestration-server/src/__tests__/factoryVerificationAuthority.test.ts
```
Depends on nothing; **most valuable to revert alone** if verification blocks legitimate work.

### Commit 5 — `feat(ci): classify CI evidence authority; require attestation for merge`
```
convex/lib/evidenceAuthority.ts  convex/lib/prEvaluation.ts  convex/factory/prChecks.ts
convex/__tests__/evidenceAuthorityClasses.test.ts
apps/mission-control-ui/src/components/EvidenceAuthorityBadge.tsx (+ .test.tsx)
apps/mission-control-ui/src/controlPlane/ExecutionRunInspector.tsx
```
Depends on 4 (shares the definition-authority vocabulary). Revert alone re-opens the merge gate — do not revert without 4.

### Commit 6 — `fix(worker): sandbox, lease, publication and gateway boundaries`
```
apps/orchestration-server/src/{auth,gateway-proxy,remoteSandboxRuntime,sandboxSupervisor,
  factoryPathScope,exeDevSandboxProvider,factoryAttemptWorker,index}.ts
apps/orchestration-server/src/__tests__/{auth,factoryPathScope,remoteSandboxRuntime,sandboxSupervisor}.test.ts
convex/lib/outboundUrlPolicy.ts  convex/__tests__/{outboundUrlPolicy,controlPlaneAuthority}.test.ts
convex/workflowRuns.ts (supersede hunks)  convex/lib/workOrder*.ts
packages/telegram-bot/src/index.ts  packages/telegram-bot/src/commands/approvals.ts
```
Independently revertible.

### Commit 7 — `feat(ui): truthful surfaces, accessibility, self-hosted fonts` + `chore: docs, CI, contract`
Split into **7a (UI)** and **7b (docs/build)** if you want a clean UI revert:
```
7a: remaining apps/mission-control-ui/** (index.css, AppShellV2, MobileOverlay,
    RouteErrorBoundary, AttentionQueuePanel, attentionQueue.ts, ui/{input,select,textarea},
    markdownRender, safeExternalUrl, navFilter, routeCapabilities, harness/**, releases/**,
    eos/**, + their tests) · apps/mission-control-ui/package.json · pnpm-lock.yaml
7b: README/CLAUDE/AGENTS/.env.example/docs/** · convex/lib/runtimeContract.ts
    · scripts/lib/runtime-contract-guard.mjs · scripts/mc-*.sh · package.json
    · .github/workflows/ci.yml · convex/_generated/api.d.ts
    · tests/e2e/dashboard-smoke.e2e.spec.ts
    · docs/testing/evidence/system-factory-e2e-v2/*.json
```

## 44. Files needing an interactive split (`git add -p`)

`git add <file>` is **not** sufficient for these — each carries hunks from more
than one commit:

| File | Split |
| --- | --- |
| `convex/schema.ts` | `rateLimits` + `operators.by_active` → **1**; `contextPackages/approvalDecisions/alerts` indexes → **6** |
| `convex/workOrders.ts` | acceptance actor derivation → **2**; specification/currentness → **6** |
| `convex/workflowRuns.ts` | `createArtifact`/`linkArtifact` authorization → **2**; supersede/currentness → **6** |
| `apps/orchestration-server/src/index.ts` | automation-verification route + accept proxy → **3**; startup origin assertion + gateway → **6** |
| `apps/mission-control-ui/src/App.tsx` | `RouteErrorBoundary` → **7a**; approvals count wiring → **2** |
| `package.json` | `security:authorization` script → **1**; `release:security` → **7b** |
| `convex/factory/attempts.ts` | independence `authorityStatus` → **4** (single concern, but verify no stray hunks) |

`pnpm-lock.yaml` and `apps/mission-control-ui/package.json` must travel with
**7a** (the `@fontsource` additions) — a reviewer running `pnpm install` between
commits 1–6 will otherwise see a lockfile mismatch.

## 45. Recommended human review order

1. `convex/workOrders.ts` — acceptance authority and actor derivation
2. `convex/lib/companyAccess.ts` + `deliveryAuthorization.ts` + `authorizationRollout.ts` — **the lockout surface; read §37 P0-2 first**
3. `packages/workflow-engine/src/verificationAuthority.ts` + `apps/orchestration-server/src/factoryVerification.ts` — verification authority
4. `convex/lib/evidenceAuthority.ts` + `convex/factory/prChecks.ts` + `convex/lib/prEvaluation.ts` — CI provenance and merge gate
5. `convex/lib/authedFunctions.ts` + `scripts/check-convex-authorization.mjs` + baseline — the authorization boundary and its ratchet
6. `convex/qcRuns.ts` + `convex/execution.ts` — fabrication removal
7. `apps/orchestration-server/src/{auth,gateway-proxy,sandboxSupervisor,remoteSandboxRuntime}.ts` — worker/publication safety
8. `convex/schema.ts` + `convex/lib/runtimeContract.ts` — schema and contract
9. UI, then docs

## 47. Current-Main Integration / Fresh-Series Review

The series recorded in §36–46 was reviewed and committed against
`75981d8`. Upstream `main` then advanced twice — first to `11a51ca`
(PR #121/#123/#124), then to `95b6b2d` (PR #126) — and a merge probe proved the
reviewed series no longer applies cleanly. This section records the fresh series
built directly on current `main`, and why it exists.

Nothing above this section has been rewritten. `codex/mission-control-governed-hardening-v1`
is preserved unchanged at `ed50465` / tree `65777c7b…` as the audit trail.

### 47.1 Bases

| | |
| --- | --- |
| Old reviewed tip | `ed504650b7c5d4b607ec75dadf6b416f40556782` (tree `65777c7b27f3a87847d163284eb077a64365655f`) |
| Old base | `75981d8` |
| New base | `95b6b2d18fb9f14b610d908338fb4e9d8054e171` |
| New branch | `codex/mission-control-governed-hardening-v2` |

### 47.2 Mainline commits reviewed

Sixteen commits landed on `main` between `75981d8` and `95b6b2d`. The
substantive ones:

| SHA | Subject | Relevance |
| --- | --- | --- |
| `3bd254c` | Qualify remote Codex structured output | Introduced `remoteStructuredResult.ts`, `remoteExecutionPolicy.ts`, `standaloneRemoteSupervisorSource.ts`; extracted the inline supervisor source |
| `b5d981f` | fix(factory): bind remote retries to production lineage | Remote retry lineage |
| `f85c372` | docs: record production factory pilot v3 qualification | Evidence only |
| `3f2dd6d` | Preserve Pilot V1 evidence and Mission detail overflow fix | UI + evidence |
| `74c1be3` | feat: add remote sandbox restricted candidate | `standaloneRestrictedSandboxBootstrapSource.ts`, security proof |
| `701285b` | fix: harden remote sandbox image boundary | Image provenance, `.github/workflows/remote-sandbox-image.yml` |
| `6db1ca0` | fix: complete remote sandbox blocker qualification | Credentials, egress policy, SBOM evidence |

All of it is preserved: the fresh branch is `main` plus the hardening commits,
never `main` minus anything.

### 47.3 Semantic conflicts encountered

Cherry-picking the reviewed series onto `95b6b2d` produced conflicts in exactly
two source files, both from `06b8a58` against `3bd254c`:

- `apps/orchestration-server/src/sandboxSupervisor.ts` (3 hunks)
- `apps/orchestration-server/src/exeDevSandboxProvider.ts` (1 hunk)

They are semantic, not textual. Taking either side wholesale fails typecheck:
the series side removes `fetchDiagnostics` that mainline tests now require and
drops four fields mainline's `usage` type marks required; the mainline side
silently drops the untracked-file fix.

The other five commits applied cleanly. Two evidence JSONs under
`docs/testing/evidence/system-factory-e2e-v2/` conflicted and were resolved to
mainline's values, then regenerated by the qualification run.

### 47.4 How `sandboxSupervisor.ts` was reconciled

Mainline's version is the base; the hardening intent was re-derived on top.

Mainline had rewritten the region the hardening commit touched: it now resolves
the executor's structured result through `resolveRemoteStructuredResult`, checks
acceptance-criterion accounting with `factoryResultContextIssues`, writes an
atomic diagnostics file, and derives status from `resolution.accepted` rather
than the raw exit code. All of that is kept exactly as mainline wrote it — the
distinction between *the process exited zero*, *the structured result was
accepted*, and *verification passed* is a guarantee mainline added, and the
hardening series predates it.

Three changes were re-applied on top:

1. `stagingPathspec()` was added as an exported helper deriving the staging
   pathspec from the frozen manifest's `repository.allowedPaths`, rejecting
   absolute paths and `..` traversal, falling back to `["."]` only when the
   manifest declares no scope.
2. `git add -A -- <pathspec>` now runs before the candidate is computed.
3. The patch, `--name-only`, and `--numstat` invocations became `--cached`.

Mainline's status derivation was left untouched. The old series'
`execution.exitCode === 0` / `signal?.aborted` logic was **not** carried
forward — it would have regressed a newer guarantee.

### 47.5 How `standaloneRemoteSupervisorSource.ts` was hardened

This is the file that made the old series inapplicable. Mainline extracted the
remote supervisor out of a minified template literal inside
`sandboxSupervisor.ts` into a readable `String.raw` module with a
`repositoryGit()` helper — and, in doing so, carried the untracked-file bug with
it. Mainline's version still ran `git diff --binary <sourceSha>`, which cannot
see untracked paths.

The fix was applied at the new canonical location: the generated source now
derives the same pathspec from `manifest.repository.allowedPaths`, stages with
`git add -A -- <pathspec>`, and reads the candidate with `--cached`. The
derivation deliberately mirrors `stagingPathspec` so the two backends cannot
drift; the equivalence is asserted by an executing test, not by string matching.

`standaloneSandboxSupervisorSource()` in `sandboxSupervisor.ts` is a thin
delegate to this module on mainline, so both entry points are covered by one
implementation.

### 47.6 `exeDevSandboxProvider.ts`

Three independent hardening edits, all re-applied to mainline's version:

- `SSH_MAX_BUFFER_BYTES` derived from `MAX_SANDBOX_RESULT_BYTES` (10 MB). The
  ssh `maxBuffer` was still hardcoded at 12 MB on mainline, but `fetchResult`
  base64-encodes the bundle, inflating it by 4/3 to ~13.3 MB — so a
  legitimately-sized result failed with an opaque `ENOBUFS` after the model
  spend had already happened.
- `${REMOTE_ROOT}/pid` added to the stale-artifact cleanup. Mainline had
  independently grown that cleanup list to eight entries, including
  `result.json`; only the supervisor pid was still missing.
- Mainline's `standaloneRestrictedSandboxBootstrapSource` import and the
  restricted security-proof upload path were preserved untouched.

### 47.7 `fetchDiagnostics` and telemetry

`fetchDiagnostics` is mainline's and was preserved in full — it was never
stubbed to satisfy the compiler.

Mainline's `usage` type requires `providerCostUsd`, `inferenceCostUsd`,
`inputTokens`, `outputTokens`. No value was invented to satisfy it. Mainline
already represents absence honestly: `codexUsage()` parses `turn.completed`
events from the executor's JSONL and returns `null` for anything malformed or
missing, and the standalone supervisor emits
`providerCostUsd: null, inferenceCostUsd: null`. The old series' goal — no
fabricated token or cost values — is satisfied by mainline's own model, so no
change was needed.

### 47.8 Test coverage added

`apps/orchestration-server/src/__tests__/sandboxSupervisor.test.ts` grew to three
executing tests, all running real git against temp repositories:

1. A modified tracked file and a newly created file both enter the candidate; a
   `.gitignore`d artifact does not.
2. The standalone remote supervisor produces the same candidate as the
   in-process one — the test now executes
   `standaloneRemoteSupervisorSource()`, mainline's canonical source.
3. A deletion inside the frozen scope is represented in the patch, and an
   untracked file written outside `repository.allowedPaths` is excluded.

The fixture's manifest was updated to mainline's stricter supervisor contract
(`intent.acceptanceCriterionIds` plus the full harness identity), because the
test pins the contract rather than an older shape.

### 47.9 Generated Convex API

The old series hand-edited `convex/_generated/api.d.ts` to declare
`convex/authorization.ts`, and stopped there. The repository's generated API is
exhaustive — mainline holds 121 declarations for 121 files under `convex/lib` —
so six new library modules were missing from a file that is meant to list
everything.

Commit 8 restores that invariant: 127 declarations for 127 files, matching the
shape codegen produces. This removes a divergence that could be verified without
a deployment. **Real codegen remains unrun and remains a pre-merge blocker.**

### 47.10 Authorship correction

Every commit in the old series was authored and committed as
`Claude <noreply@anthropic.com>`, which violates `AGENTS.md`:

> Preserve the repository operator's configured Git identity for all commits
> created while working in this repository.
> Do not author commits as Codex, OpenAI, Claude, or another AI agent.

The defect was found by reading `AGENTS.md` during this pass. Because the old
branch is preserved as an audit artifact, it was not rewritten. Every commit on
the fresh branch uses the operator identity recorded in the repository's own
history, carries no AI co-author trailer, and is unsigned — matching the
surrounding mainline commits.

### 47.11 Runtime contract

Mainline is at `RUNTIME_CONTRACT_VERSION = 30`. The fresh series' public Convex
contract changes are the same set the old series introduced, so the bump to
**v31** was retained rather than re-derived. The guard accepts 67 changes at
v30 → v31 and passes. No second bump was applied.

### 47.12 Qualification

Run at `6fe7ad1` on base `95b6b2d`.

| Gate | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm run typecheck` | PASS |
| `pnpm run lint` | PASS |
| `pnpm run build` | PASS |
| `pnpm run qualify:factory` | **16/16 PASS** |
| Convex contract suite | 763 passed / 106 files |
| Root vitest (Convex + scripts) | 837 passed / 116 files |
| Mission Control UI | 324 passed / 71 files |
| Workflow engine | 170 passed / 17 files |
| Orchestration server | 182 passed, 1 skipped / 32 files |
| `pnpm run test:integration` | PASS |
| `pnpm run test:scripts` | 11 passed, 0 failed |
| `pnpm run test:e2e:critical` | 9/9 PASS |
| Authorization ratchet | PASS — 863 total, 300 authorized, 563 unauthorized (baseline 563) |
| Runtime contract guard | PASS — v30 → v31, 67 changes |
| Production dependency audit | PASS — critical=0 high=0 |
| Repository secret scan | PASS — 2,543 files |
| Orchestration startup smoke | PASS |
| `git diff --check` | clean |
| Convex codegen validation | **NOT RUN** — no non-production deployment |
| Convex-backed E2E | **NOT RUN** — no authenticated non-production deployment |

### 47.13 Remaining blockers

1. **Convex-backed E2E — NOT RUN.** No authenticated non-production deployment.
2. **Convex codegen validation — NOT RUN.** §47.9 narrows but does not close it.
3. **Trusted independent verifier — NOT CONFIGURED.** `trustedWorkflowRefs` and
   owned verifier registrations remain unset, so `INDEPENDENT_REQUIRED` cannot
   be satisfied by any current CI evidence. This fails closed by design and was
   not weakened to make qualification green.
4. **Legacy authorization surface — 563.** The ratchet prevents regression; it
   does not prove the remainder safe.
