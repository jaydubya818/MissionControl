---
status: complete
priority: p1
issue_id: "038"
tags: [factory, security, authorization, cancellation, github, human-review]
dependencies: []
---

# Harden PR 72 publication authority

## Problem Statement

The post-merge review of PR #72 found gaps between the documented production
worker, cancellation state, Decision Center projection, and GitHub pull-request
identity. Together they could misrepresent review authority or allow a stale
worker/provider record to outlive an operator decision.

## Findings

- The documented `CODEX_FACTORY_WORKER_ENABLED` path selected the older durable
  worker, while verification-first human-review resume existed only in the
  compatibility `FactoryAttemptWorker`.
- Factory cancellation did not revoke the Factory lease or pending review
  authority, and report/publication mutations did not reject a cancellation
  request.
- Reused pull requests were matched by branch/base but their provider head SHA
  was replaced with the expected SHA instead of verified.
- The Decision Center inferred publication resume from run state without
  requiring the exact Factory-owned approval ID.
- Publication authorization read the WorkOrder's complete approval history
  instead of the current revision.

## Proposed Solutions

### Option 1: Focused contract hardening

**Approach:** Select one bounded verification-first worker at startup, revoke
Factory authority on cancellation, require exact provider SHA and approval ID,
persist decision outcomes outside the reactive queue card, and scope approval
queries by revision.

**Pros:** Smallest safe correction; preserves the merged model; directly tests
each identified boundary.

**Cons:** Leaves the older durable worker module in the tree as non-started
historical implementation until a separate cleanup.

**Effort:** 2-4 hours

**Risk:** Medium

### Option 2: Re-port the full contract to the older durable worker

**Approach:** Duplicate verification packet persistence, pause/resume, and
publication permits across the older execution-claim model.

**Pros:** Preserves the former runtime selection.

**Cons:** Maintains two lease and publication implementations and increases the
chance they diverge again.

**Effort:** 1-2 days

**Risk:** High

## Recommended Action

Implement Option 1 and require focused tests, full CI, startup smoke, exact-head
GitHub checks, and browser proof before merging the follow-up.

## Technical Details

**Affected areas:**

- `apps/orchestration-server/src/factoryAttemptWorker.ts`
- `apps/orchestration-server/src/githubAppRuntime.ts`
- `apps/orchestration-server/src/index.ts`
- `convex/factory/attempts.ts`
- `convex/workflowRuns.ts`
- `convex/lib/factoryHumanReview.ts`
- `apps/mission-control-ui/src/controlPlane/WorkOrderApprovalsView.tsx`
- `convex/schema.ts`

## Resources

- PR #72
- Merge commit `2b1a7c4`
- `docs/software-factory/durable-codex-github-pr.md`

## Acceptance Criteria

- [x] Production startup selects the bounded verification-first worker.
- [x] Factory cancellation revokes lease, review authority, and receipts.
- [x] Report, renewal, and publication authority fail closed after cancellation.
- [x] Reused and created PR records must expose the exact verified head SHA.
- [x] Decision Center resume language requires the exact Factory approval ID.
- [x] Decision outcome remains visible after the pending queue refreshes.
- [x] Approval reads are scoped to the current WorkOrder revision.
- [x] Focused tests and TypeScript validation pass.
- [x] Full CI and startup smoke pass.
- [x] Browser proof passes.
- [x] Follow-up PR passes review and all required remote CI gates before merge.

## Work Log

### 2026-08-11 - Post-merge audit and focused remediation

**By:** Codex

**Actions:**

- Ran independent security/data-integrity, architecture/TypeScript/performance,
  and agent-native/simplicity reviews against PR #72's merge commit.
- Implemented the bounded corrections and regression tests.
- Ran focused UI, orchestration, Convex, and TypeScript validation successfully.

### 2026-08-11 - Final validation and browser proof

**By:** Codex

**Actions:**

- Passed the complete 51-file UI and 72-file Convex test suites, workspace
  TypeScript validation, lint, production build, runtime-contract guard, and
  orchestration startup smoke.
- Deployed runtime contract v11 to the local Convex backend and proved the
  Decision Center populated and empty states in a real browser without
  mutating an approval decision.
- Verified the compatibility gate during the v10-to-v11 transition and the
  successful browser reload after the backend synchronized.
- Completed final architecture, TypeScript, performance, security,
  data-integrity, agent-native, and simplicity reviews with no remaining
  merge blockers.

**Learnings:**

- Runtime feature flags must select the same worker implementation proved by
  the verification and publication tests.
- A provider identity is not authoritative until its returned commit SHA is
  checked against the verified candidate.
- Runtime compatibility must be proved against persisted local data, not only
  against generated types and isolated unit fixtures.

### 2026-08-11 - Remote review gate complete

**By:** Codex

**Actions:**

- Published PR #76 from a branch rebased onto the latest `main`.
- Confirmed GitHub CI run 288 passed TypeScript, unit, E2E, build, lint and
  runtime-contract, and smoke jobs.
- Cleared the todo for merge; final `main` confirmation remains part of the
  PR handoff rather than an implementation acceptance criterion.

## Notes

- Remote sandbox enforcement and provider CI ingestion remain intentionally
  deferred; this todo does not expand those scopes.
