---
status: complete
priority: p1
issue_id: "061"
tags: [worker, deployment, cost, budget, attestation]
dependencies: ["058"]
---

# Close runtime, cost, and attestation gaps

## Problem Statement

The canonical worker must have one deployable runtime, enforce approved cost
bounds without fabricated telemetry, and reject workers whose network or secret
policy attestations are missing, stale, unknown, or blocked.

## Findings

- PM2 is documented but points to nonexistent `packages/agent-runner` paths.
- The Codex and DeepSeek adapters currently report nullable cost.
- `workspaceHostBindings` already stores network and secret policy status, but
  canonical `factoryWorkerEligibility` does not evaluate those fields.

## Proposed Solutions

### Option 1: Add new deployment, ledger, and attestation systems

**Pros:** Clean-slate contracts.

**Cons:** Duplicates existing services and persisted state.

**Effort:** High.

**Risk:** High.

### Option 2: Reconcile existing services and records

**Pros:** Minimal architecture, preserves existing authority and evidence.

**Cons:** Requires careful migration of stale deployment scripts.

**Effort:** Medium.

**Risk:** Medium.

## Recommended Action

Use Option 2. Decide whether PM2 remains canonical before changing scripts;
assess existing cost records/provider limits before adding persistence; connect
existing host attestations to readiness and dispatch.

## Acceptance Criteria

- [x] PM2 is either made canonical and smoke-tested or retired with a documented
      replacement.
- [x] The chosen cost mechanism enforces the approved bound and preserves
      unknown telemetry honestly.
- [x] Missing, stale, `UNKNOWN`, and `BLOCKED` worker attestations prevent
      readiness and dispatch; current `READY` attestations pass.
- [x] Focused tests and orchestration startup smoke pass.

## Work Log

### 2026-08-22 - Approved and queued

**By:** Codex

**Actions:**

- Recorded the bounded runtime closeout and dependency on the inventory.

**Learnings:**

- The current host report already carries the required attestation fields; the
  gap is admission enforcement, not another storage or UI surface.

### 2026-08-23 - Runtime, cost, and attestation closeout complete

**By:** Codex

**Actions:**

- Chose PM2 as the process manager for one canonical production process,
  `mission-control-orchestration`; replaced hard-coded nonexistent agent paths
  and smoke-started the exact ecosystem definition in an isolated PM2 home.
- Retired the standalone workflow executor from production deployment because
  its legacy public mutation surface is intentionally no longer available.
- Reused Attempt-scoped OpenRouter key caps instead of adding a ledger. The
  aggregate provider cap across `maxAttempts` must fit `maxCostUsd`; unknown
  telemetry remains unknown and an observed cap violation is quarantined.
- Kept persistent Codex/DeepSeek execution explicitly local-only until a hard
  provider cap exists.
- Added server-derived attestation freshness and canonical eligibility checks
  for missing, stale, `UNKNOWN`, `BLOCKED`, and `READY` network/secret states.
- Documented the architecture and operating decision in
  `docs/architecture/v1-factory-runtime-cost-attestation-closeout.md` and
  `docs/WORKFLOW_EXECUTOR.md`.

**Verification:**

- Workflow engine: 158 tests passed after removing the retired legacy executor
  implementation and its compatibility-only tests.
- Orchestration server: 171 tests passed, 1 environment integration skipped.
- Focused Convex Factory: 68 tests passed.
- PM2 orchestration smoke and built ESM orchestration smoke passed.
- Workflow-engine, orchestration, Convex, and UI TypeScript checks passed.
