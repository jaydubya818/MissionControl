# Fix V1 Factory Safety and Golden-Path Closeout Plan

- **Status:** APPROVED — operator authorized execution on 2026-08-22
- **Date:** 2026-08-22
- **Baseline:** `af534ae` (origin/main = PR #130 governed hardening v2 reconciled)
- **Replaces:** DeepSeek umbrella plan v2 (superseded by this focused closeout)
- **Related active plans (reconciled in §1, not duplicated):** `docs/plans/2026-08-11-feat-v1-operational-hardening-plan.md`, `docs/plans/2026-08-15-feat-local-mission-pr-golden-path-plan.md`
- **Ownership:** Codex implements + produces test/browser evidence · Reasonix independently reviews diff + evidence · DeepSeek optional adversarial pass · Operator approves, merges, promotes
- **Rule:** no shared implementation of the same security surfaces; no sole certifier; implementer touches only the `codex/...` branch from `af534ae`.

## 1. Current-state reconciliation at `af534ae`

### 1a. Completed by PR #130 (verified)
- Authorization enforces once an operator is provisioned; writes fail closed before provisioning (evidence: `docs/testing/evidence/governed-hardening-v2-reconciliation/README.md`)
- Stripe webhooks fail closed without a secret (`convex/http.ts:85–92`)
- WorkOrder acceptance requires a server-derived authenticated human
- Verification authority and signed GitHub App merge attestation hardened
- CI syntax-tree ratchet blocks new unauthenticated Convex functions

### 1b. Reconciliation of the two active plans
| Active plan | Item | Disposition at `af534ae` |
|---|---|---|
| 2026-08-11 hardening | Phase 1 — durable overnight recovery | **COMPLETED** (stale-lease reclaim, retry-of-claim, idempotent evidence; PR #62 proof) |
| 2026-08-11 hardening | Phase 2 — unified review evidence | **COMPLETED / SUPERSEDED** by PR #130's stronger acceptance + verification semantics |
| 2026-08-11 hardening | Phase 3 — final V1 browser hardening | **REMAINING** (browser-state polish; folds into §4) |
| 2026-08-15 golden path | Phases 1–2 — executable WorkOrder; authoritative eligibility | **COMPLETED** (verification-first architecture; READY-gated accept) |
| 2026-08-15 golden path | Phase 3 — browser operator path | **REMAINING** (folds into §4) |
| 2026-08-15 golden path | Phase 4 — happy path + recovery proof | **COMPLETED** (PRs #61–63/#67/#71/#80); **re-prove at `af534ae`** in §4 |
| 2026-08-15 golden path | Phase 5 — validate and publish | **COMPLETED** except blocking-CI requirement → §4 |

### 1c. Genuinely remaining (this plan's scope)
- Legacy approval mutations trust caller-supplied identity — `convex/approvals.ts:387`
- Legacy executor callbacks unauthenticated — `convex/executorRouter.ts:91`
- `agentDocuments`/`alerts` surfaces lack authorization (0 `ctx.auth` refs today); audit gaps on mutations/denials
- Demo mode warns only (`MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT`)
- E2E: the broad `e2e-tests` job is non-blocking and ARM-only (`ci.yml:147`); a separate blocking `browser-security` (critical) job already exists. Gap = the golden path must be blocking and complete, complementing that existing gate
- Cost telemetry `null` on both adapters; bound enforcement unproven
- PM2/deploy config references nonexistent `packages/agent-runner`
- Operator attestations default UNKNOWN (§5.3)

### 1d. Out of scope (recorded, separate decisions — not scheduled here)
- `tenantId` required-ification: **112 optional fields** in `convex/schema.ts`; requires its own inventory, migration, rollback, and compatibility decision
- Multi-tenant isolation beyond the current baseline
- Documentation cleanup (stale root docs, `progress.txt`): separate track, outside this blast radius

## 2. Active-versus-legacy mutation classification (inventory first — no code)

- **Scope (bounded):** functions reachable from the V1 golden path (Mission → Plan → WorkOrder → Task → Attempt → evidence → PR) **plus** the explicitly identified legacy surfaces: `convex/approvals.ts`, `convex/executorRouter.ts`, `convex/agentDocuments.ts`, `convex/alerts.ts`. Not a platform-wide sweep of `tasks`/`agents`/`messages`; those enter only if a golden-path reachability trace puts them on the path.
- Cover **all reads and mutations** of `agentDocuments` and `alerts` (the authorization baseline lists entire public surfaces, not only `set`/`create`).
- Classify ACTIVE (live call sites in UI, scripts, tests, seed) vs DEAD; disposition each: `harden | retire | alias-to-canonical`.
- **Gate:** no hardening/retirement code until the inventory is reviewed by the operator and Reasonix.

## 3. Remaining V1 authorization fixes

| Item | Measurable acceptance |
|---|---|
| `approvals.ts:387` `approve`/`deny`: bind to server-derived authenticated human (`ctx.auth`) or retire legacy path | Impersonation test fails before / passes after; RED dual-control preserved |
| `executorRouter.ts:91` `onExecutionStart`/`Complete`: validate executor identity via lease/signed path | Spoofed "execution succeeded" test rejected |
| `agentDocuments` + `alerts`: every **read and mutation** authorized (queries are read-only and cannot write audit records); **audit mutations, authorization denials, and consequential decisions** — not reads | Ratchet open-count for these surfaces = 0 |
| Demo mode fails closed outside an explicitly local backend deployment | Define one backend deployment-class contract. When the deployment is `shared` or `production`, `MC_ALLOW_ANONYMOUS_COMPANY_CONTEXT=1` must not enable demo access: governed operations remain authorization-enforced or return a configuration error. Cover the configuration matrix with unit tests; do not require an HTTP status or an audit write from read-only Convex queries. |
| Authorization-ratchet rule (measurable) | CI fails if the open-baseline count **increases on any PR**; designated security PRs (this plan's phases) must **reduce** the scoped count toward zero; golden-path surfaces reach 0 |

## 4. One blocking Mission-to-PR browser golden path

- Path: Mission → approved Plan → WorkOrder → Task → Attempt (Codex) → evidence → verified PR (draft) → operator acceptance; deterministic and replayable.
- **Verification base:** a **clean worktree at the candidate implementation SHA** (fresh checkout of the `codex/...` branch tip), **not** the `af534ae` base — testing the base alone would ignore the branch's changes.
- **CI infra decision (evaluate, do not assume a dedicated Convex project):** compare (a) `convex preview` deploy per PR, (b) deterministic local dev backend + seeded fixture, (c) dedicated test project — lowest recurring infrastructure/secrets obligations; operator sign-off.
- Acceptance: this golden-path job becomes **blocking** (removing `continue-on-error` for it) alongside the existing blocking `browser-security` job; completes all checks; browser evidence committed per the `real-codex-github-pr-golden-path` pattern; qualification packet refreshed.

## 5. Canonical worker deployment and enforceable cost bounds

### 5.1 PM2 canonicality decision first
PM2 is documented (`docs/WORKFLOW_EXECUTOR.md`) but `ecosystem.config.cjs` is broken. Determine if PM2 remains canonical → fix it to the real services (`orchestration-server`, `workflow-executor`) **or retire it entirely**; do not build a new deployment path before this decision. `agent-runtime` is a library (`dev: tsc --watch`), not a runner.
**Acceptance:** canonical process manager chosen and documented; deploy scripts target real services; a smoke start passes.

### 5.2 Cost bounds — assessment first, no new subsystem by default
- Step 1 (assessment): determine whether existing Attempt/run cost records (`convex/costEvents.ts`, run cost fields) plus provider-enforced limits (per-run key caps / `maxCostUsd`) can already support the required bound.
- Step 2: only if the assessment shows a gap, design the minimal addition (e.g., attempt-level cost aggregation); do not prescribe an internal budget ledger up front.
**Acceptance:** documented assessment; the chosen mechanism enforces the bound — a budget-exceeded attempt fails closed, with test.

### 5.3 Operator attestations
- Reuse the existing `workspaceHostBindings.networkPolicyStatus` and `secretPolicyStatus` reports. Connect those fields to canonical Factory readiness, worker eligibility, and dispatch instead of adding another attestation store or UI.
- `UNKNOWN`, missing, stale, or `BLOCKED` attestations fail closed for production-capable workers. Local demo compatibility remains explicit and cannot qualify a production Factory version.
**Acceptance:** readiness and attempt dispatch are blocked unless both current attestations are `READY`; focused tests cover missing, `UNKNOWN`, `BLOCKED`, stale, and ready states.

## V1 Non-goals

Auto-merge / autonomous production release · provider failover / second production provider · DSH promotion to production executor · fleet-scale load · `tenantId` required migration · documentation cleanup (separate track) · platform-wide legacy mutation sweep beyond the §2 scope.

## Sequencing · verification · approval

- Phase 1: §2 inventory → §3 authorization fixes. Phase 2: §4 golden path. Phase 3: §5 runtime/cost (§5.1 decision may start in parallel).
- Verification: per-PR repo gates; §4 blocking CI + committed browser evidence; cross-agent independence (Codex produces, Reasonix reviews, DeepSeek adversarial pass optional).
- **Approval:** operator approves → Codex opens `codex/...` from `af534ae` and begins §2. No code before approval.
