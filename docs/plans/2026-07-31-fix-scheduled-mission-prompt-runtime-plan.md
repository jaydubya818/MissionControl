---
title: Fix scheduled mission-prompt runtime failures
status: completed
date: 2026-07-31
owner: Codex
scope: bounded-runtime-correctness
---

# Fix scheduled mission-prompt runtime failures

## Problem this solves

An enabled `mission_prompt` scheduled job advances its schedule and records an execution before the asynchronous action discovers that the workspace has no mission statement. The action then throws every schedule interval, creating noisy Convex errors and a false successful-execution audit event.

A separate task-table ID appeared as `projectId` in `modelRoutingPolicies:getActive` and `workflowRuns:list`. Read-only validation found that the referenced task no longer exists, current workspace selection rejects inaccessible IDs, and current source has no untyped task-to-project caller for those queries. This is classified as an environmental stale-client/HMR condition unless it can be reproduced on a clean reload; Convex's strict project-ID validators will remain unchanged.

## Decision

Add a scheduler preflight for mission-prompt jobs. A job without a configured mission statement will:

- not dispatch `mission:reversePrompt`;
- not record a successful execution or update `lastRun`;
- advance `nextRun` to avoid retrying every minute;
- record a visible `SCHEDULED_JOB_SKIPPED` activity with the reason;
- return an explicit skipped result when invoked through **Run now**.

Keep direct operator invocation of `mission:reversePrompt` strict so the UI continues to communicate that a mission statement is required.

## Institutional learning check

`docs/solutions/` contains no entries and no critical-patterns document in the current repository, so there is no prior solution to apply. The implementation follows the existing scheduler policy/audit patterns.

## Execution checklist

- [x] Capture deterministic reproduction evidence from the current runtime logs.
- [x] Add a small, testable mission-configuration readiness helper.
- [x] Gate scheduled and manual scheduler dispatch before enqueuing the action.
- [x] Record skipped audit evidence without claiming execution.
- [x] Add focused regression tests; do not run the complete test suite.
- [x] Verify the affected UI journey after a clean reload and inspect browser/server errors.
- [x] Publish the implementation and test result in repository docs and Mission Control Docs.
- [x] Commit, open a pull request, monitor CI, and squash-merge to `main`.

## Bounded validation

- Focused Vitest coverage for mission-prompt readiness and scheduler source contract.
- Existing workspace selection tests for invalid workspace IDs.
- TypeScript typecheck and production build.
- Browser check on the Software Factory Research Lab task board and schedule surface.
- Runtime observation spanning a due scheduled-job interval, with no new unhandled `mission:reversePrompt` failure.

The full 870-test suite is intentionally excluded to control cost, per product-owner direction.
