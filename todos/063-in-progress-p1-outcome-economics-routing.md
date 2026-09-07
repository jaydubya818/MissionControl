---
status: in_progress
priority: p1
issue_id: "063"
tags: [software-factory, outcomes, economics, routing, metrics]
dependencies: []
---

# Connect Outcome Economics to Routing

## Problem Statement

Routing is deterministic and governed, but complete outcome and provider cost
coverage is missing. Tokens or estimated prices are insufficient optimization targets.

## Findings

- Missing cost remains `null`, correctly avoiding false zero-cost claims.
- Guarded Auto has frozen sample, coverage, and score-margin thresholds.
- Accepted work, merge, deployment, production verification, incident, rollback,
  adoption, and customer outcomes are not interchangeable.

## Proposed Solutions

### Option 1: Versioned outcome projection with immutable observations

**Pros:** Reproducible routing decisions and honest confidence.

**Cons:** Requires cross-domain lineage and formula governance.

**Effort:** High

**Risk:** Medium

### Option 2: Dashboard-only aggregation

**Pros:** Faster presentation.

**Cons:** Cannot safely feed routing or preserve decision provenance.

**Effort:** Medium

**Risk:** High

## Recommended Action

Implement Option 1. Keep raw facts immutable, version formulas, retain sample,
coverage, freshness, and confidence, and feed only accepted compatible outcomes.

The bounded implementation plan is
`docs/plans/2026-09-05-feat-inference-gateway-outcome-economics-qualification-plan.md`.

## Sequencing Decision

**Approved 2026-09-05:** the bounded first slice may proceed ahead of todo
`062`, limited to the governed inference boundary, exact route identity,
pricing, provider receipts, hard reservations, accounting, settlement, cost
coverage, and verified-outcome economics primitives. Todo `062` remains open
and required for shared builder intent, product/QA/design contribution
semantics, and broader outcome-workflow semantics. This decision does not mark
either todo complete and does not authorize implementation by itself.

## Acceptance Criteria

- [ ] Outcome stages and cost components have one versioned measurement dictionary.
- [ ] Derived metrics retain formula version, lineage, sample, coverage, freshness, and confidence.
- [ ] Unknown values cannot improve a score or qualify a route.
- [ ] Every routing decision is reproducible from frozen inputs and later outcomes.
- [ ] Dashboards lead with accepted outcomes, reliability, attention, and confidence.
- [ ] Guarded Auto, RED auto-routing, merge, and deployment remain disabled.

## Work Log

### 2026-09-07 - Exact-main liability authority hardening

- Reconciled the merged conservative liability implementation with independent
  architecture, security, accounting, and simplicity review.
- The Convex authority now pins the complete qualified Bedrock provider-price
  digest at registration, reservation creation, and physical request admission.
  A caller cannot substitute lower rates, larger bounds, another API, or stale
  provenance while retaining Bedrock send authority.
- Inference evidence now records `MAXIMUM_RESERVED` separately from provider
  input/output usage and the `ESTIMATED` settled cost. Existing strict response
  parsing rejects unexpected cache usage and retains the full unresolved hold.
- Focused handler, liability-bound, serialization, and bridge tests pass. A
  further live request remains blocked by the account agreement and requires
  separate request authority after that prerequisite is satisfied.

### 2026-09-07 - Conservative contract landed; one live request reached account agreement gate

- PR `#214` passed all 12 checks and merged as exact main
  `beaf1f8cb293845ec2abaa6c3c1502676a5cf83b`. The post-merge Todo 063 gate passed
  256 tests, documentation consistency, and runtime contract v55.
- Revalidated the exact account, principal, region, active US Sonnet 4.6 profile,
  and three regional backing models. Before transport, a durable hold reserved
  the full 1,000,000-token input bound plus 4,096 output tokens: 3,367,584,000
  nano-USD under the 5,000,000,000 nano-USD one-request program ceiling.
- AWS received exactly one non-streaming synthetic request with SDK attempts set
  to one. It returned `ResourceNotFoundException` before model use because the
  account has not submitted Anthropic use-case details. Readback independently
  reports `agreementAvailability=NOT_AVAILABLE` while authorization, entitlement,
  and region availability are present.
- No provider usage was returned. The hold is durably `UNKNOWN`, the full maximum
  remains retained, and no zero-cost or successful-inference claim is made. No
  retry, fallback, alternate route, IAM broadening, or second request occurred;
  the temporary credential envelope was deleted.
- Evidence is under
  `docs/testing/evidence/todo063-bedrock-live-qualification-2026-09-07/`.
  Todo 063 remains in progress; Todo 064 remains dependency-blocked. Resumption
  requires the account owner to complete the Anthropic use-case agreement and a
  new explicit one-request authorization.

### 2026-09-07 — Earlier 429 liability reconciled; account quota requires administrator

- Read-only CloudWatch provider telemetry records one route-specific throttle at
  the request minute and no invocation, input-token, or output-token datapoints
  through the request window. The pre-inference quota rejection therefore had
  zero billable model usage; the $0.924528 reservation is released with linked
  evidence while the provider-send hold remains active.
- The exact quota is `L-B29C9321`, Model invocation max tokens per day for
  Anthropic Claude Sonnet 4.6 (doubled for cross-region calls). Its documented
  default is 4,320,000,000 and it is non-adjustable, but the qualification role
  is denied quota value and request-history reads. An administrator in account
  `083665737366` or AWS Support must resolve the applied capacity before another
  bounded call can be considered.
- This is retained as historical evidence. The later account-agreement failure
  and its unresolved liability are now the active resumption boundary.

### 2026-09-07 — Earlier Bedrock IAM route admission reached the daily provider quota

- The narrow Identity Center administrator provisioned the exact
  `FDLCQualificationTFOperator` policy to account `083665737366`; canonical AWS
  read-back matches and the approved Sonnet 4.6 request passed IAM.
- The one-attempt synthetic request reached Bedrock and was rejected with HTTP
  429 `Too many tokens per day`. No retry, fallback, output, or usage receipt was
  produced. Its initial $0.924528 maximum reservation was later reconciled to
  zero billable usage by the evidence above.
- Todo 063 remains in progress. Successful live receipt, ten accepted real-work
  outcomes, complete outcome coverage, and a second independently qualified
  route remain missing. Todo 064 therefore remains dependency-blocked.

### 2026-09-07 - Worker-path CountTokens permission applied; profile still unsupported

- Applied a reviewed Terraform plan with zero creates, two in-place updates,
  and zero destroys. Only the exact qualification worker role and its Bedrock
  runtime VPC endpoint policy gained `bedrock:CountTokens`; targeted post-apply
  drift is clean and the human permission set fingerprint is unchanged.
- One corrected one-off task used the immutable worker task definition, exact
  worker role, private worker network, and approved inference profile. Bedrock
  admitted the call but returned `ValidationException` because the profile does
  not support token counting.
- No generation request, reservation, automatic retry, fallback, or billable
  inference occurred. AI-FDE PR `#4` merged as `8c2aa2b026e8af3ba60fad9d70eef859d4d9c981`.
  Evidence is retained under
  `docs/testing/evidence/todo063-bedrock-worker-counttokens-2026-09-07/`.
- Todo 063 remains in progress. Todo 064 remains dependency-blocked.

### 2026-09-07 - Conservative Bedrock liability contract qualified locally

- Replaced universal CountTokens success with explicit
  `SUPPORTED` / `UNSUPPORTED` / `UNKNOWN` route capability modeling. The exact
  approved Sonnet 4.6 profile is `UNSUPPORTED` from the retained AWS
  `ValidationException`; unknown fails closed and no local estimate is labeled
  provider-exact.
- Bound the qualification route to exact serialized Converse bytes, a 262,144
  byte request ceiling, the complete 1,000,000-token context liability, a 4,096
  output cap, and the reviewed expiring price digest. Maximum one-call liability
  is 3,367,584,000 nano-USD under the machine-bound 5,000,000,000 nano-USD
  program ceiling.
- The canonical Convex transaction retains the pre-send bound in the immutable
  hold. The bridge independently recomputes the amount and verifies the price,
  aggregate ceiling, one-request limit, and full hold digest before transport.
  AWS usage remains ACTUAL, calculated money ESTIMATED, and overrun/ambiguity
  freezes further execution without retry or fallback.
- The live credential boundary now authenticates the exact static temporary
  credentials through STS immediately before Bedrock client construction.
  Nullable unresolved IAM role metadata grants no authority; the exact STS
  principal is route- and grant-bound.
- Independent architecture/simplicity, security, and data-integrity re-reviews
  are GO for the current unsupported route. The dedicated deterministic gate
  passes 256 tests, documentation consistency, and the unchanged
  runtime-contract v55 guard. Source publication, CI, merge, exact-main
  qualification, and the one bounded live call remain pending.

### 2026-09-07 - CountTokens provisioned; approved profile unsupported

- Reprovisioned Identity Center permission set `FDLCQualificationTFOperator`
  to account `083665737366`; final request
  `103a21b2-ce2a-4feb-b387-fe5b36d78665` completed `SUCCEEDED`.
- Effective-policy readback confirms no `bedrock:*`, streaming, Global profile,
  unrelated model, direct foundation-model inference, or Production authority
  was added. An unrelated-model CountTokens request was explicitly denied.
- Exact STS identity revalidation passed. The authorized CountTokens request
  reached Bedrock for the approved Sonnet 4.6 profile, but Bedrock returned
  `ValidationException: The provided model doesn't support counting tokens.`
- No inference call, reservation, provider inference response, retry, fallback,
  or spend occurred. Evidence is retained under
  `docs/testing/evidence/todo063-bedrock-counttokens-provisioning-2026-09-07/`.
  Todo 063 remains in progress at the existing preflight checkpoint; todo 064
  remains dependency-blocked.

### 2026-09-07 - Authenticated Bedrock preflight stopped before inference

- Product Owner authorized account `083665737366`, profile
  `fdlc-qualification`, the exact US geographic Sonnet 4.6 route, and at most
  USD 5.00 of non-Production synthetic qualification calls with zero retries
  and zero fallbacks.
- Authenticated STS returned the exact expected principal. Read-only Bedrock
  inspection returned active account-specific profile ARN
  `arn:aws:bedrock:us-east-1:083665737366:inference-profile/us.anthropic.claude-sonnet-4-6`
  with exactly the permitted `us-east-1`, `us-east-2`, and `us-west-2`
  foundation-model destinations.
- The exact synthetic CountTokens preflight failed with
  `AccessDeniedException`: the verified principal has no identity-based policy
  allowing `bedrock:CountTokens` on that profile. No Converse/Invoke request,
  reservation, provider response, retry, fallback, or spend occurred.
- IAM `GetRole` is also unavailable to this principal, so the canonical IAM role
  ARN remains unresolved rather than inferred from the STS session ARN.
- Evidence is retained under
  `docs/testing/evidence/todo063-bedrock-live-preflight-2026-09-07/`. Todo 063
  remains in progress and todo 064 remains dependency-blocked.

### 2026-09-05 - Allocation slice merged; persisted identity repair started

- PR #184 merged as `4434cc56448075f4804787325a9586c6290b2215` after every
  check passed. Clean-main composed qualification, Phase 5 and critical browser
  tests passed; Production remained unchanged. Evidence is linked from the
  cumulative program record.
- Independent next-slice audit confirmed normal intent/receipt persistence uses
  database reservation IDs where strict constructors require frozen logical IDs.
  Intent keys/ancestry and reconstructed projection identities also lose the
  original canonical bytes. Fix the complete persisted chain without weakening
  equality checks or rewriting history; follow the new identity contract.
- This remains within todo 063. Live calls, billing authority, real acceptance
  and Production transitions are still outside this bounded repair's proof.

### 2026-09-05 - Reservation slice independent review

- Architecture/security/data-integrity review found that the stored allocation
  also needs to match `immutableSnapshot.maxCostMicrousd`. Added fail-closed
  equality and regressions for lower, higher and missing frozen amounts.
- Simplicity/docs/agent-parity review found one wording issue: idempotent replay
  still requires current admission checks. Corrected the cumulative record.
- Nonblocking scale limit: admission reads all WorkOrder reservations. Keep the
  sum in one transaction; revisit a bounded aggregate only when rollout volume
  requires it. No high-volume scale qualification is claimed here.
- Final transaction drill: 22 scenarios on a disposable local Convex backend,
  165 reservation requests and 140 observed concurrency retries. Exact handler
  and reservation schema/indexes; fixture authorization and related records.
  This is local transaction proof, not provider or real-work economics.
- PR #184 on integrated main `f749b06` / runtime v46; full qualification passed
  at `f4c5c8d`. CI, merge and final-main proof remain pending in the program record.

### 2026-09-05 - Master program continuation on current main

**Actions:**
- Reconciled current main `e9d2f52720e634b79d2c614a7fb9812a6b986fe9`,
  runtime v45, the bounded offline inference closure and completed todo 062.
- Started the remaining economics acceptance work under the master execution
  authorization; no new live provider or Production authority is inferred.
- Identified that independent inference reservations can each consume the
  same WorkOrder ceiling. The first corrective slice conserves allocations
  across the existing parent WorkOrder index, including retry Attempts.
- Created the cumulative program record at
  `docs/software-factory/capability-convergence-program.md`.

**Limits:**
- Existing fixture accounting does not prove live spend, complete real costs,
  the ten-WorkOrder pilot, or the complete Factory improvement/rollback loop.

### 2026-09-05 - Phase 5 implementation started

**By:** Codex

**Actions:**
- Started the authorized bounded Phase 5 slice from exact main SHA
  `6d7146d5205aef729aee2960aed2a4ed8e8ab95c` in the isolated
  `codex/phase5-inference-outcome-economics` worktree.
- Confirmed the existing provider adapters call external APIs directly and the
  legacy `costEvents` table cannot represent reservations, dispatch ambiguity,
  immutable price provenance, or outcome-linked coverage.
- Chose a separate governed inference ledger and shared gateway boundary while
  retaining existing routing and cost records as migration-safe compatibility
  surfaces.

**Learnings:**
- Exact model-route identity is already separated from harness/runtime identity;
  Phase 5 can build on that boundary without coupling inference to Codex or any
  other coding harness.
- A claimed physical request with an ambiguous transport result must remain
  `UNKNOWN`; ordinary fallback behavior is unsafe after possible dispatch.

### 2026-09-05 - Bounded first-slice resequencing approved

**By:** Product Owner

**Actions:**
- Allowed the governed inference/economics primitives listed above to proceed
  ahead of todo `062` under a separate implementation authorization.
- Kept todo `062` open for shared builder intent and broader outcome semantics.

**Learnings:**
- Infrastructure accounting can be qualified independently without inventing
  product, QA, or design workflow semantics.

### 2026-09-05 - Governed inference and accounting slice qualified

**By:** Codex

**Actions:**
- Implemented a harness-neutral governed inference boundary with exact immutable
  route identity, active price books, hard per-request reservations, durable
  physical intents and claims, immutable receipts, reconciliation, fallback
  rules, and replay protection.
- Added versioned accepted-outcome projections and advisory route comparisons
  that preserve unknown cost and never authorize automatic promotion.
- Added the exact OpenAI Chat Completions transport behind a disabled-by-default
  gateway flag, signed Convex service commands, operator inspection, and
  deterministic offline qualification evidence.
- Passed the 35-test Phase 5 regression suite, all 12 negative controls, full
  repository tests, typecheck, lint, build, release security, runtime-contract
  v42-to-v43 guard, browser checks, and all 18 System Qualification stages.

**Learnings:**
- A useful economic denominator must include every physical receipt for the
  logical Attempt, including failed primary spend before a permitted fallback.
- Provider reconciliation must create a new frozen projection interpretation;
  mutating the original receipt would destroy reproducibility.
- This todo remains in progress: production outcomes, broader dashboards, and a
  second independently qualified route are intentionally outside the bounded
  Phase 5 slice.
- Implementation PR `#178` merged as
  `e76796f76f92577dab9f073bf1007a29285cbe03`; clean post-merge Phase 5,
  typecheck, documentation, and runtime-contract qualification passed.

### 2026-08-25 - Approved implementation kickoff

**By:** Codex

**Actions:**
- Preserved the existing hard eligibility and conservative fallback boundaries.

**Learnings:**
- Cost per accepted outcome is useful only when coverage and outcome identity are explicit.

### 2026-09-06 - Canonical identity storage qualification

The independent reviews corrected canonical receipt replay and cohort isolation.
The real local backend then reproduced an undefined-field digest mismatch masked
by the old in-memory fixture. New v2 intent, receipt and projection snapshots
omit absent fields before hashing; v1 history and the global hash remain intact.
Forty-two focused tests and 13 real local backend scenarios pass. Root code
generation passes with unchanged generated files. Main advances #185 and #186
are being integrated before final qualification and merge. Live authority and
complete outcome economics remain open.

### 2026-09-06 — Dispatch authority continuation

PR #188 merged at `9a68b56c3ee788c4f8b4132a8c7c9d14f32dee28` and passed
clean-main qualification (19 gates, 2773 tests, 11 inherited skips, Phase 5 and
15 browser checks). All four Production targets and guards remain unchanged.
Finite classification dispatch is now in progress under the same approved
program; see the cumulative program record. Todo 063 remains in progress.

### 2026-09-06 — Dispatch merged; observation retention started

PR #189 merged as `8bf19fcb7e46f4b80a862054d22fbd7ca7ed436f`. Fresh main
passes 19 composed gates, 2895 tests (11 inherited skips), Phase 5 and 15 browser
checks; all four Production targets and guards remain unchanged. Continue the
approved accounting scope under the observation-retention contract. Overrun
observations and historical first settlement must survive without new execution
authority; the bounded bridge correction passes its initial regressions.

The observation slice also clarifies the earlier economics wording: every
physical call contributes to the cohort cost numerator. Verified and human-
accepted outcomes use separate denominators. New corrected projection formula v2
preserves UNKNOWN monetary corrections without changing historical v1 snapshots.

### 2026-09-06 — Durable accounting delivery started

The observation slice passes 57 real local backend scenarios and eight browser
checks against persisted records. Its in-memory failure payload still disappears
through the Docker consumer and cannot survive restart. Continue in the isolated
`codex/inference-accounting-recovery` branch under the
[accounting delivery contract](../docs/software-factory/accounting-delivery-contract.md).
The host journal carries immutable observations to the existing historical
settlement path; it grants no execution, new allocation, correction or release.
Source implementation and integrated recovery qualification remain pending.

### 2026-09-06 — Recovery source approved and focused qualification passed

The Product Owner approved settlement error classification, independent recovery
startup, and acknowledgment diagnostics. The applied implementation passes 186
focused orchestration tests with two existing conditional daemon skips, 196
backend and authority tests with no skips, orchestration typecheck, and the
runtime-contract v50 guard across 970 public functions. Explicitly incomplete
provider configuration disables the complete Factory execution bootstrap while
the configured accounting recovery runtime remains independently available.
Actual signed backend recovery, current-main integration, complete qualification,
CI, merge, clean-main proof, and release remain in progress.

### 2026-09-06 — Recovery integrated and exact-source qualification passed

The recovery source now contains current main `13ce5f0ef961` and runtime contract
v52. Final review found and corrected one startup race: provider registration
and both execution workers now wait for successful durable journal readiness.
The actual index regression proves invalid storage records a bounded diagnostic
while both workers remain unstarted.

Focused proof passes 196 orchestration tests, 132 backend and authority tests,
and six incident workspace tests. Exact-source composed qualification passes
every release-blocking stage, including full repository tests, security, lint,
typecheck, build, startup smoke, runtime guard, and historical evidence checks.
All 15 critical browser checks pass. Phase 5's frozen offline evidence now binds
to v52 and continues to deny live comparison or automatic promotion.

Signed restart evidence, exact PR-head CI, merge, and clean-main requalification
were completed in the closure below. No configured Production target exists for
the orchestration service. The ten accepted real-work outcomes and two-route live
economics comparison remain separate acceptance requirements.

### 2026-09-06 — Durable accounting recovery merged and qualified

PR #197 merged as `b17c9c5` after all required exact-head CI and Preview
contexts passed. A fresh detached checkout of the merge passed 19/19 composed
gates, the full Phase 5 suite, 15/15 critical browser checks, and an independent
74/74 signed restart/recovery qualification. The existing Production UI
deployment remains unchanged. This repository has no configured Production
target for the orchestration service, so no UI-only deployment was represented
as releasing the recovery behavior.

The ten accepted real-work outcomes, live two-route comparison, and attributable
Production incident restoration remain open acceptance requirements.
