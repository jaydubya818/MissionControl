---
status: complete
priority: p1
issue_id: "059"
tags: [authorization, convex, approvals, executors, memory, alerts]
dependencies: ["058"]
---

# Close remaining V1 authorization gaps

## Problem Statement

Active legacy and golden-path functions must derive authority server-side,
scope records to the selected workspace, and produce appropriate denial and
decision audit evidence.

## Findings

- Caller-provided approval identity and executor callback identity remain open.
- `agentDocuments` and `alerts` require full-surface authorization review.
- Anonymous demo access must remain local-only and fail closed elsewhere.

## Proposed Solutions

### Option 1: Add checks to every existing function

**Pros:** Minimal call-site migration.

**Cons:** Retains duplicate and potentially obsolete authority paths.

**Effort:** Medium.

**Risk:** Medium.

### Option 2: Retire dead paths and harden only active paths

**Pros:** Smaller public surface and one authoritative lifecycle.

**Cons:** Requires consumers to move to canonical APIs where aliases exist.

**Effort:** Medium.

**Risk:** Low after todo 058.

## Recommended Action

Use Option 2 according to the approved inventory. Preserve human/service actor
separation and RED dual control.

## Acceptance Criteria

- [x] Caller labels cannot grant approval authority.
- [x] Executor completion cannot be spoofed.
- [x] Active `agentDocuments` and `alerts` functions enforce workspace scope.
- [x] Mutations, denials, and consequential decisions have durable audit.
- [x] Anonymous demo access cannot activate outside an explicit local backend.
- [x] Scoped authorization baseline reaches zero and the overall baseline does
      not increase.
- [x] Focused tests, Convex typecheck, and runtime-contract guard pass.

## Work Log

### 2026-08-22 - Approved and blocked on inventory

**By:** Codex

**Actions:**

- Recorded the implementation unit and dependency on todo 058.

**Learnings:**

- Convex queries can enforce access but cannot write audit records; audit is
  required for mutations, denials where the contract supports persistence,
  and consequential decisions.

### 2026-08-22 - Authorization closeout complete

**By:** Codex

**Actions:**

- Retired the unauthenticated legacy executor/task-router APIs and kept the
  local-only coordinator observe-only.
- Moved active human writes to audited action boundaries with server-derived
  actors, workspace scope, and durable success/denial records.
- Authorized the complete active approvals, task, workflow-run,
  `agentDocuments`, and alert read/write surfaces.
- Made anonymous demo context require an explicit local deployment class.
- Added a scoped V1 gate at zero and updated the global non-increase baseline
  atomically.
- Advanced the public runtime contract from v32 to v33 and fixed the guard to
  recognize tracked files removed from the candidate worktree and explicitly
  public query wrappers.
- Retired stale standalone executor, CLI, OpenClaw, Telegram, autonomous-worker,
  and scheduler-fixture consumers after confirming canonical execution already
  uses the signed service-command boundary.
- Extended the scoped gate to reject active references to retired callbacks or
  direct mutation calls to authenticated human actions.

**Verification:**

- 86 focused tests passed.
- Convex, UI, and orchestration TypeScript checks passed.
- Runtime contract guard accepted 62 intentional changes at v33.
- Global authorization ratchet passed at 551; V1 scoped open count is 0.

**Learnings:**

- A denial audit must cross a separate Convex action/mutation boundary so the
  record survives the rejected domain transaction.
- Removing dead public APIs is safer than preserving unauthenticated aliases;
  the runtime contract makes that compatibility decision explicit.
