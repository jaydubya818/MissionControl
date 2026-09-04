---
status: complete
priority: p1
issue_id: "065"
tags: [factory, harness, worker, codex, fail-closed]
dependencies: []
---

# Remove Implicit Codex Worker Construction

## Problem Statement

The governed Attempt path resolves the exact adapter frozen by the selected
Factory Version, but orchestration startup and the Factory worker constructor
can still manufacture a Codex adapter when no harness was explicitly enabled
or supplied. That makes worker capability composition misleading even though
Attempt resolution itself is fail-closed.

## Findings

- Orchestration startup replaces an empty enabled-adapter list with a new
  `CodexV1ExecutorAdapter`.
- `FactoryAttemptWorker` accepts an implicit concrete Codex adapter default.
- The older `DurableCodexWorker` also accepts an implicit concrete Codex
  adapter default even though current callers inject it explicitly.
- `HarnessAdapterRegistry` rejects an intentionally empty adapter collection.
- Worker capability reporting is derived from registry registrations. Convex
  deliberately rejects an active worker registration with zero executors, so
  the honest no-adapter state is an empty local registry, a disabled worker,
  and no worker-runtime advertisement.

## Proposed Solutions

### Option 1: Permit an intentionally empty registry

**Approach:** Allow `HarnessAdapterRegistry([])`, require explicit adapter or
registry injection into `FactoryAttemptWorker`, and start the orchestration
service while leaving Factory execution disabled and unregistered. Reject any
configuration that enables a Factory worker with zero explicit adapters.

**Pros:**
- Keeps service health separate from harness availability.
- Preserves one registry and one worker lifecycle.
- Makes capability reporting truthful without placeholder behavior.

**Cons:**
- A generic legacy worker flag without an explicit adapter becomes a startup
  configuration error instead of selecting Codex.

**Effort:** Small

**Risk:** Low

### Option 2: Do not construct the Factory worker without adapters

**Approach:** Make the worker and reporter optional at the composition root.

**Pros:**
- Avoids an empty execution component.

**Cons:**
- Adds optional branching across server lifecycle and reporting.
- Makes zero-capability reporting harder to distinguish from an absent worker.

**Effort:** Medium

**Risk:** Medium

## Recommended Action

Use Option 1. Preserve the orchestration service and generic worker object, but
allow its exact registry to contain zero explicitly enabled adapters. Never
construct Codex to fill that empty state.

## Technical Details

Primary files:

- `apps/orchestration-server/src/harnessAdapterRegistry.ts`
- `apps/orchestration-server/src/factoryAttemptWorker.ts`
- `apps/orchestration-server/src/durableCodexWorker.ts`
- `apps/orchestration-server/src/index.ts`
- focused registry, worker, startup-composition, and reporter tests
- `docs/architecture/generic-harness-contract-v1.md`

No schema, UI, model-route, sandbox-provider, MCP, Deep Agents, Open SWE, or
Execution Profile change belongs in this todo.

## Acceptance Criteria

- [x] An empty harness registry is valid and exposes no capabilities or registrations.
- [x] Empty-registry `resolve` and `supports` are negative while `require` fails explicitly.
- [x] Orchestration startup never constructs Codex when both harness flags are disabled.
- [x] Explicit Codex-only, DeepSeek-only, and dual-adapter composition remain exact.
- [x] `FactoryAttemptWorker` requires an explicitly supplied adapter or registry.
- [x] Missing requested adapters continue to fail closed without fallback.
- [x] Worker capability reporting contains only explicitly enabled adapters; an execution-disabled, empty registry emits no worker registration.
- [x] Existing explicitly enabled Codex execution remains green.
- [x] Focused tests, typecheck, lint, build, relevant Factory qualification, and `git diff --check` pass.
- [x] Final diff contains no later composable-factory phase work.

## Work Log

### 2026-09-04 - Approved implementation started

**By:** Codex

**Actions:**
- Read the approved Phase 0 request and created this bounded work item.
- Selected the intentionally empty registry design because orchestration has
  useful responsibilities independent of coding-harness availability.

**Learnings:**
- The execution-time exact adapter path is already fail-closed; the defect is
  implicit composition and capability truthfulness at startup.

### 2026-09-04 - Phase 0 completed

**By:** Codex

**Actions:**
- Removed both orchestration startup paths that manufactured Codex: the empty
  adapter fallback and the legacy generic worker flag.
- Allowed an empty registry for execution-disabled orchestration, made the
  Factory workers' adapter inputs explicit, and rejected enabled empty workers.
- Added startup composition, empty-registry, zero-adapter lifecycle, and exact
  missing-adapter regression tests.
- Updated active environment, worker-operations, and harness architecture docs
  with the explicit availability and static-manifest-versus-runtime distinction.
- Ran focused and repository-wide tests, typecheck, lint, builds, startup
  smoke, worker admission tests, and whitespace validation.

**Learnings:**
- A persisted `supportedExecutors: []` worker report is not part of the current
  public contract. Phase 0 therefore keeps the disabled service healthy without
  registering a zero-capability worker, preserving the no-public-API exit gate.
- The repository-wide runtime-contract and Factory-doc consistency commands
  still report pre-existing branch drift outside this todo (`executionIntents`
  contract additions and README omissions); no unrelated fixes were folded in.
