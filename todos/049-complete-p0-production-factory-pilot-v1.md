---
status: complete
priority: p0
issue_id: "049"
tags: [factory, qualification, operations, remote-sandbox, evidence]
dependencies: []
---

# Qualify Production Factory Pilot V1

## Problem Statement

Mission Control has qualified its major Factory capabilities independently and through one composed System Qualification V2 path, but it lacks repeated operational evidence across materially different engineering workloads. A single deterministic golden path does not establish production reliability, recovery behavior, operator toil, or routing quality.

## Findings

- Exact fetched baseline is `75981d8ae1bd49e235cc1478bac3d0f853fc717f`; Convex runtime contract is v30.
- System Qualification V2 is qualified with known limitations and uses `FakeSandboxProvider`.
- Remote Sandbox N=1 is live certified with known limitations, remains Preview/disabled by default, and has a dedicated live exe.dev identity available to this operator session.
- Codex CLI 0.146.0 is available as the primary qualified harness.
- Guarded Auto remains disabled; routing evidence must be shadow-only.
- Review Intelligence, Factory Learning, Factory Memory, and Observability/Evals remain non-authoritative.
- No current durable suite executes five workload classes three times each.

## Proposed Solutions

### Option 1: Re-label existing qualification evidence

**Approach:** Aggregate prior one-off qualification packets into a pilot report.

**Pros:** Low effort and no external execution cost.

**Cons:** Does not satisfy repetition, workload diversity, current baseline, live subset, or first-pass/eventual measurement requirements.

**Effort:** Low

**Risk:** High; produces a false qualification claim.

### Option 2: Add a bounded operational pilot runner

**Approach:** Execute five disposable workload fixtures three times each through the current governed primitives, use Codex as the primary harness, exercise a serial live exe.dev subset, and emit deterministic evidence/scorecards without changing product authority.

**Pros:** Directly answers the operational question, preserves production repositories, and is repeatable.

**Cons:** Requires real execution time/cost and careful external-resource cleanup.

**Effort:** High

**Risk:** Medium; bounded by disposable repositories, opt-in live execution, and `N <= 1`.

## Recommended Action

Execute Option 2 exactly as specified in `docs/plans/2026-08-18-production-factory-pilot-v1-plan.md`. Do not add architecture or expand autonomy. Treat every failed invariant as evidence first; only make the smallest product correction after deterministic reproduction and regression coverage.

## Technical Details

**Expected affected areas:**
- `scripts/` and/or qualification-only tests for the pilot runner
- `docs/testing/evidence/production-factory-pilot-v1/`
- focused regression tests only if a real defect is found

**Protected areas:**
- `docs/testing/evidence/system-factory-e2e-v1/`
- `docs/testing/evidence/system-factory-e2e-v2/`
- production repositories outside this isolated worktree

## Acceptance Criteria

- [x] Exact baseline and authority audit recorded.
- [x] Five materially different workload classes run three times each.
- [ ] At least 15 governed executions complete; failed/retried Attempts remain independent.
- [x] Local Codex and bounded live exe.dev paths are exercised without remote concurrency above one.
- [x] Required failure injection and fail-closed recovery matrix passes.
- [x] Metrics preserve unknown values as `null`.
- [x] Reliability scorecard exposes value, samples, coverage, and limitations per dimension.
- [x] Routing remains advisory and produces a shadow effectiveness report.
- [x] Factory Learning produces signals, clusters, candidates, and one proposal-only experiment.
- [x] Review proof preserves Intent → Criterion → Evidence → Verification → Decision → Changed Code.
- [x] Governance and avoidable operator toil are distinguished.
- [x] Required browser and accessibility matrix passes.
- [x] Pilot, full qualification, repository tests, typecheck, lint, runtime, build, smoke, security, secret, and whitespace gates pass.
- [x] Final decision and next milestone are evidence-based; no next milestone is started.
- [ ] Any draft PR remains unmerged.

## Work Log

### 2026-08-18 - Baseline and execution design

**By:** Codex operating under the repository owner's task

**Actions:**
- Fetched `origin/main` before modification and verified exact SHA `75981d8ae1bd49e235cc1478bac3d0f853fc717f`.
- Attached isolated worktree branch `codex/production-factory-pilot-v1` at the exact baseline.
- Confirmed runtime contract v30, Node 24.18.1, pnpm 9.0.0, Codex CLI 0.146.0, and live exe.dev prerequisites.
- Audited the existing System Qualification V2, Remote Sandbox certification, routing, learning, observability, Spec Intake, Generic Harness, and Review Intelligence records.
- Selected the bounded operational pilot runner approach.

**Learnings:**
- Existing V2 evidence is strong but intentionally single-scenario and fake-sandbox based.
- The pilot needs new current-baseline executions; historical packets are inputs to the baseline audit, not substitutes for pilot repetitions.

### 2026-08-18 - Operational qualification completed

**By:** Codex operating under the repository owner's task

**Actions:**
- Ran 15 scheduled governed executions across five workload classes, preserving 29 independent Attempts.
- Proved 12/12 local Codex executions and 1/3 live exe.dev executions; the two failed remote executions each exhausted eight bounded Attempts.
- Proved all observed allocated remote resources terminated, credentials revoked, remote concurrency never exceeded one, and final exe.dev inventory was zero.
- Completed 15/15 fail-closed fault injections, advisory routing analysis, Factory Learning clustering/candidate generation, human-effort analysis, and real UI/browser/accessibility proof.
- Corrected reproduced remote output-boundary defects, one UI overflow defect, and composed-test polling races with focused regression coverage.
- Passed the final composed System Qualification V2 gate after the bounded test correction, including repository tests, typecheck, skill lint, runtime guard, build, startup smoke, dependency audit, secret scan, whitespace, and historical-evidence immutability.

**Outcome:**
- Final decision is `BLOCKED`, because only 13/15 executions reached independent verification and human acceptance.
- Recommended next milestone is a governed remote Codex structured-output and retry-policy experiment. It was not started.

## Notes

- Guarded Auto and all other autonomy expansions remain out of scope.
- Unknown cost/telemetry remains null.
