---
status: complete
priority: p1
issue_id: "039"
tags: [software-factory, release, staging, verification, rollback, golden-path]
dependencies: ["024"]
---

# Govern Staging Release and Verification

## Problem Statement

The real Factory path stops at a review-ready pull request. It does not keep an
authoritative, evidence-backed distinction between merged, staging deployed,
staging verified, and rolled back.

## Findings

- GitHub PR evidence is already correlated to exact WorkOrder and Attempt
  lineage, but merge commit/actor/time are not ingested from GitHub.
- The existing `deployments` aggregate manages agent-template versions and its
  gate is explicitly shadow-only; it must not own code releases.
- Factory versions already bind an environment, enabling an enforced
  staging-only boundary.
- The existing permission system can derive human approval and delivery-write
  authority server-side.

## Proposed Solutions

### Option 1: Extend agent-template deployments

**Pros:** reuses an existing page and table.

**Cons:** conflates unrelated aggregates, preserves a non-blocking shadow gate,
and cannot bind WorkOrder/Attempt/PR merge lineage safely.

**Risk:** High.

### Option 2: Separate factory release and independent HTTP evidence

**Pros:** exact lineage, explicit states, provider-neutral staging, enforced
approval, independently checked evidence, additive future provider adapters.

**Cons:** adds a new aggregate and operator workflow.

**Risk:** Medium.

### Option 3: Direct provider deployment now

**Pros:** can trigger staging automatically.

**Cons:** adds provider credentials, vendor semantics, cancellation, and remote
rollback before the authority/evidence contract is proven.

**Risk:** High.

## Recommended Action

Implement Option 2 using
`docs/plans/2026-08-11-feat-governed-staging-release-verification-plan.md`.
Keep deployment initiation provider-external for this slice; enforce approval,
exact receipts, independent verification, and rollback evidence in Mission
Control. Defer production and direct provider automation.

## Acceptance Criteria

- [x] GitHub provider evidence creates one exact, correlated `MERGED` release.
- [x] A human approves the exact merge SHA for staging before deployment.
- [x] Deployment receipt moves only the approved SHA to `DEPLOYED`.
- [x] Independent provenance, smoke, and health evidence is immutable and fail
      closed.
- [x] Passing exact evidence moves the release to `VERIFIED`.
- [x] Explicit rollback evidence moves a deployed/verified release to
      `ROLLED_BACK` and exposes recovery work.
- [x] Workspace authorization, audit, idempotency, refresh, loading, empty,
      failure, success, and rollback states are tested.
- [x] The complete path is browser-validated and documented.
- [x] Full repository quality gates pass.

## Work Log

### 2026-08-11 - Approved and planned

**By:** Codex

**Actions:**

- Preserved unrelated Research Lab schema work in the primary checkout and
  created isolated branch `codex/governed-release-verification` from current
  `origin/main`.
- Audited the GitHub PR, Factory configuration, environment, deployment,
  authorization, service-command, and browser navigation contracts.
- Selected a separate factory-release aggregate with independent staging HTTP
  verification and explicit rollback evidence.
- Recorded the implementation and SpecFlow plan.

**Learnings:**

- The existing agent-template deployment aggregate cannot safely represent code
  release authority.
- Provider-specific deployment is not required to prove the control-plane
  contract and would expand credentials and failure modes prematurely.

### 2026-08-11 - Implemented and browser-proved

**By:** Codex

**Actions:**

- Added a separate code-release aggregate and immutable evidence ledger with
  exact GitHub merge, staging-only approval, provider receipt, independent
  provenance/smoke/health verification, and terminal rollback states.
- Added fail-closed URL, provenance, lineage, transition, and replay contracts;
  conflicting idempotent retries are rejected rather than silently accepted.
- Added the governed release panel to Governance → Deployments with complete
  loading, empty, approval, deployed, verification-failed, verified, and
  rollback states.
- Drove `MERGED → DEPLOYED → VERIFIED → ROLLED_BACK` in headless Chromium,
  including refreshes after approval, verification, and rollback. Captured five
  screenshots and removed all temporary database and endpoint fixtures.
- Rebased onto current `main`, bumped the public runtime contract from v11 to
  v12, and passed the post-rebase full lint/typecheck, 506 Convex tests, 228 UI
  tests, package tests, production build, and runtime-contract guard.

**Learnings:**

- Treat the GitHub PR head and merge commit as distinct immutable identities.
- A reachable staging URL is not proof; provenance itself must fail when its
  SHA, deployment ID, or environment does not match.
- Idempotency is an evidence-integrity constraint: the same key may replay only
  the same normalized receipt.
