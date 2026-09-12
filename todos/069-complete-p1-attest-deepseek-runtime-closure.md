---
status: complete
priority: p1
issue_id: "069"
tags: [code-review, security, orchestration, runtime-identity]
dependencies: []
---

# Attest the Complete DeepSeek Runtime Closure

## Problem Statement

Phase 1 describes the experimental DeepSeek Harness as exactly runtime-qualified, but its current runtime artifact and installation verification bind only `apps/cli/lib/bin.js`. That JavaScript entrypoint imports sibling generated chunks and external packages from ignored `lib/` and `node_modules/` trees. Those files can therefore drift while the worker continues to advertise the approved runtime-artifact digest.

## Findings

- The pinned CLI entrypoint is not self-contained and dynamically imports sibling chunks.
- Upstream ignores generated `lib/` output and installed dependencies.
- `verifyPinnedDeepSeekInstallation` intentionally ignores untracked files and verifies only the entrypoint digest.
- DeepSeek is experimental, disabled by default, and operator-enabled, which lowers exposure but does not support an exact-runtime qualification claim when enabled.

## Proposed Solutions

### Option 1: Add a canonical runtime-closure digest

**Approach:** Preserve the entrypoint digest, freeze an additional canonical digest over the dedicated pinned installation tree, reject escaping links and special files, and verify the closure before registration and execution.

**Pros:** Preserves the existing persistent-worker adapter and exact qualification model without adding a new backend.

**Cons:** Makes DeepSeek startup and prepare checks more expensive and binds qualification to one evaluated installation closure.

**Effort:** Medium

**Risk:** Low

### Option 2: Disable qualified DeepSeek execution

**Approach:** Keep the adapter visible but ineligible until a digest-pinned image or package closure exists.

**Pros:** Smallest code change and strictest immediate fail-closed posture.

**Cons:** Breaks the Phase 1 qualified non-Codex execution path.

**Effort:** Small

**Risk:** Medium

## Recommended Action

Implement Option 1 using the already-evaluated pinned installation. Keep the current entrypoint digest as independent provenance and do not add an Execution Profile, remote backend, or Phase 2 runtime.

## Technical Details

Directly affected areas:

- `packages/workflow-engine/src/executorAdapter.ts`
- `packages/workflow-engine/src/harnessManifests.ts`
- `apps/orchestration-server/src/deepseekHarnessExecutorAdapter.ts`
- focused contract and adapter tests
- directly relevant runtime-operations documentation

## Resources

- PR: https://github.com/jaydubya818/MissionControl/pull/164
- Upstream commit: `47f943859bef60e4160492346772ded9b24f765a`
- ADR: `docs/decisions/model-route-runtime-identity-separation.md`

## Acceptance Criteria

- [x] Runtime artifact preserves the exact entrypoint SHA-256 and adds an optional closure SHA-256 without changing historical artifacts that omit it.
- [x] The DeepSeek closure covers generated chunks, configuration, workspace build output, dependencies, file types, and link targets for the dedicated installation.
- [x] Added or modified closure content fails before registration and before spawn.
- [x] Escaping links and special files fail closed.
- [x] Health reports unavailable on closure drift.
- [x] Focused tests, package typechecks, contract guards, and the full Phase 1 qualification pass.

## Work Log

### 2026-09-04 - Security Review Discovery

**By:** notes-to-factory / review workflow

**Actions:**

- Confirmed the evaluated entrypoint digest against the pinned upstream installation.
- Traced its sibling chunk and external dependency imports.
- Selected complete closure attestation rather than removing the qualified experimental path.

**Learnings:**

- A JavaScript entrypoint digest is not equivalent to executable runtime identity when imported code remains mutable.
- Experimental and disabled-by-default changes likelihood, not the integrity required once a tuple is qualified.

### 2026-09-04 - Completed and Requalified

**By:** notes-to-factory / review workflow

**Actions:**

- Added the optional canonical closure digest while preserving historical runtime-artifact digests when the field is absent.
- Attested and reverified the complete pinned DeepSeek installation tree before registration and spawn, including fail-closed handling for drift, dangling or escaping links, `.git` targets, and special files.
- Reverified the real 70,119-file installation and ran focused adapter/contract tests, package typechecks, runtime-contract guards, and the full Factory V2 qualification.

**Validation:**

- DeepSeek adapter: 10/10 tests passed.
- Harness contract: 6/6 tests passed.
- Factory V2 golden eval: 6/6 blocking checks and 7/7 negative controls passed with zero regressions.

## Notes

Completed on PR #164 and requalified before merge.
