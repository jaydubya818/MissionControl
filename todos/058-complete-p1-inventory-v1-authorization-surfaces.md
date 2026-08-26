---
status: complete
priority: p1
issue_id: "058"
tags: [authorization, convex, v1, inventory, golden-path]
dependencies: []
---

# Inventory V1 authorization surfaces

## Problem Statement

The V1 golden path and four explicit legacy modules contain public Convex
functions whose current callers and authority models are not uniformly known.
Changing them before classifying reachability could break live product, seed,
demo, or service flows.

## Findings

- `convex/approvals.ts` accepts caller-provided decision identity.
- `convex/executorRouter.ts` exposes unauthenticated lifecycle callbacks.
- Every public `agentDocuments` and `alerts` function appears in the current
  authorization baseline.
- The approved closeout plan requires an inventory review before behavior
  changes.

## Proposed Solutions

### Option 1: Harden every public function immediately

**Pros:** Fastest apparent baseline reduction.

**Cons:** Risks breaking legacy or service callers and creates unnecessary
compatibility code.

**Effort:** High.

**Risk:** High.

### Option 2: Classify reachability, then harden or retire

**Pros:** Preserves live flows, removes dead authority, and keeps the V1 scope
bounded.

**Cons:** Requires an explicit inventory and review gate.

**Effort:** Medium.

**Risk:** Low.

## Recommended Action

Use Option 2. Trace UI, scripts, services, tests, and seeds; classify each
function as active or dead and recommend `harden`, `retire`, or
`alias-to-canonical`.

## Technical Details

**Primary surfaces:**

- `convex/approvals.ts`
- `convex/executorRouter.ts`
- `convex/agentDocuments.ts`
- `convex/alerts.ts`
- Golden-path functions reachable through Mission, Plan, WorkOrder, Task,
  Attempt, evidence, and PR flows

## Resources

- `docs/plans/2026-08-22-fix-v1-factory-safety-and-golden-path-closeout-plan.md`
- `scripts/convex-authorization-baseline.json`
- `scripts/lib/convex-authorization-scan.mjs`

## Acceptance Criteria

- [x] Every public function in the four explicit legacy modules is classified.
- [x] Golden-path call paths and actor types are documented.
- [x] Each active function has a named authorization/audit pattern.
- [x] Each dead function has removal evidence and compatibility impact noted.
- [x] The operator and independent reviewer approve the disposition matrix.

## Work Log

### 2026-08-22 - Inventory started

**By:** Codex

**Actions:**

- Created the execution branch from `af534ae`.
- Reconciled the approved plan with current Convex and worker contracts.
- Started call-site and authority tracing before any behavior changes.

**Learnings:**

- Existing authorization scans ratchet public surfaces but do not establish
  runtime reachability or the correct actor model.

### 2026-08-22 - Inventory completed for review

**By:** Codex

**Actions:**

- Traced repository call sites for every public function in `approvals`,
  `executorRouter`, `agentDocuments`, and `alerts`.
- Traced the browser golden path through Task, Attempt, evidence, and PR
  surfaces.
- Wrote the disposition matrix and actor map to
  `docs/security/v1-factory-authorization-surface-inventory.md`.
- Ran the authorization ratchet: 920 public functions, 283 authorized, 637
  open, baseline 637; ratchet passes.

**Learnings:**

- `convex/tasks.ts` is golden-path reachable and still trusts caller-provided
  actor types and IDs. It must be part of the closeout scope.
- `executorRouter` has no public repository callers; its cron feeds an orphaned
  legacy queue. Retirement is simpler and safer than adding a parallel callback
  protocol.
- Browser, worker, bot, and cron callers must be split across human, signed
  service, and internal authority boundaries.
- A Convex mutation cannot persist a denial audit and then throw because the
  transaction rolls back. The durable human-denial mechanism needs explicit
  review before implementation.

### 2026-08-22 - Operator approval recorded

**By:** Codex

**Actions:**

- Recorded the operator's approval of the disposition matrix and six review
  decisions.
- Left the inventory gate open pending Reasonix's independent review, as
  required by the approved closeout plan.

### 2026-08-22 - Independent review corrections resolved

**By:** Codex

**Actions:**

- Recorded Reasonix's `APPROVE WITH CORRECTIONS` verdict against a clean
  `af534ae` worktree.
- Reclassified uncalled `workflowRuns.createArtifact`, `recordEvent`,
  `advance`, and `checkpointExecution` mutations as dead candidates.
- Added `taskRouter.autoAssign`, omitted Task reads, and server Task callers to
  the scoped service split.
- Labeled the 920/283 ratchet totals as scan-derived and the 637 baseline as
  statically recorded.
- Selected authenticated action wrappers for durable human-denial audit so a
  rejected internal transaction cannot roll back the denial record.

**Learnings:**

- The independent review found no critical or high-severity issue and approved
  implementation once its four bounded corrections were folded in.
