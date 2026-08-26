---
status: complete
priority: p1
issue_id: "060"
tags: [golden-path, playwright, ci, convex, evidence]
dependencies: ["059"]
---

# Make the Mission-to-PR golden path blocking

## Problem Statement

Mission Control has historical and deterministic golden-path evidence, but the
current candidate must prove one refresh-stable Mission-to-draft-PR flow in a
blocking CI job without relying on stale records or the non-blocking ARM job.

## Findings

- `browser-security` is already blocking for critical shell/accessibility
  coverage.
- The broader `e2e-tests` job is non-blocking and currently runs the ARM spec.
- The existing golden-path and operational-hardening plans have completed
  backend authority work; the remaining gap is current browser/CI proof.

## Proposed Solutions

### Option 1: Make every existing E2E spec blocking

**Pros:** Broad coverage.

**Cons:** Mixes environment-dependent and deterministic tests; likely flaky.

**Effort:** High.

**Risk:** High.

### Option 2: Add one deterministic blocking golden-path lane

**Pros:** Directly proves the V1 promise with bounded infrastructure.

**Cons:** Other E2E specs remain advisory until independently qualified.

**Effort:** Medium.

**Risk:** Medium.

## Recommended Action

Use Option 2 after comparing Convex preview, deterministic local backend, and a
dedicated test deployment. Obtain operator approval before adding recurring
infrastructure or secrets.

## Acceptance Criteria

- [x] CI backend option is documented and approved.
- [x] A clean worktree at the candidate SHA runs the complete browser flow.
- [x] The golden-path CI job is blocking and complements `browser-security`.
- [x] Failure, recovery, evidence, PR, and refresh behavior are asserted.
- [x] Browser evidence and a refreshed qualification packet are recorded.

## Work Log

### 2026-08-22 - Approved and blocked on authorization closeout

**By:** Codex

**Actions:**

- Recorded the focused CI/browser unit and dependency on todo 059.

**Learnings:**

- Making all environment-dependent E2E tests blocking would expand scope and
  reduce CI reliability; one deterministic lane is the V1 target.

### 2026-08-23 - Blocking deterministic lane implemented

**By:** Codex

**Actions:**

- Selected a fresh ephemeral local Convex backend with no shared deployment,
  provider credential, or recurring infrastructure.
- Added an idempotent internal qualification fixture covering failed and
  recovered implementation Attempts, independent verification, four evidence
  envelopes, GitHub App/PR/exact-head CI projections, and explicit human
  acceptance readiness.
- Added the blocking `mission-golden-path` CI job and browser assertions for
  Mission and WorkOrder refresh stability.
- Recorded focused Mission/WorkOrder screenshots and a qualification packet in
  `docs/testing/evidence/v1-factory-safety-golden-path-closeout/`.
- Rehearsed the exact CI sequence from a fresh local backend; Playwright passed
  1/1 before and after the runtime/cost closeout.

### 2026-08-25 - Clean candidate qualification completed

**By:** Codex

**Actions:**

- Committed the implementation, fetched current `origin/main`, and rebased the
  single candidate commit without conflicts.
- Created a detached clean worktree at candidate SHA
  `4d7542b4ed40be72471397b2320dbb8d59585e82`.
- Installed the frozen lockfile offline, started a fresh anonymous local Convex
  backend, applied both deterministic seeds, and exported the dynamic fixture
  identifiers.
- Ran the fully provisioned blocking browser job: Playwright executed and
  passed 1/1.
- Re-ran workspace typechecking, authorization/security gates, focused
  authorization/runtime tests, workflow and orchestration suites, tombstone
  builds, runtime-contract checks, and PM2/orchestration smoke checks.

**Learnings:**

- The Playwright script correctly skips when the dynamic fixture environment is
  absent. Qualification must reproduce the complete CI provisioning sequence;
  a successful but skipped standalone browser command is not evidence.
