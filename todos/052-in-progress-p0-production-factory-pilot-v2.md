---
status: in_progress
priority: p0
issue_id: "052"
tags: [factory, qualification, operations, remote-sandbox, evidence]
dependencies: ["050", "051"]
---

# Qualify Production Factory Pilot V2

## Problem Statement

Pilot V1 preserved 13/15 successful governed executions and only 1/3 reliable live Remote Sandbox executions. PR #121 qualified the canonical remote Codex structured-result and retry boundary, but Mission Control still needs a new, comparable operational pilot rooted at the merged main SHA before it can claim suitability for human-governed production pilot workloads.

## Fixed Scope

- Root the pilot at exact merged `origin/main` SHA `db44819ec59e79cdd71ba9ed36fce8064a120af3` and runtime contract v30.
- Preserve PR #120 and `production-factory-pilot-v1` unchanged as historical BLOCKED evidence.
- Reuse the five V1 workload classes and materially equivalent fixtures: bug fix, feature, refactor, security/policy, and data/schema migration.
- Execute three repetitions per class: 15 governed executions total, including three serial live exe.dev executions with concurrency `N <= 1`.
- Treat this as test-and-measure work. Change product code only for a newly reproduced defect with regression coverage.
- Keep Guarded Auto disabled and all routing, learning, review, memory, and observability outputs non-authoritative.

## Acceptance Criteria

- [x] 15/15 executions reach valid terminal structured results.
- [ ] Every intended-success workload reaches candidate, independent exact-candidate verification, exact-current eligibility, and human acceptance fixture.
- [ ] Comparable live Remote Sandbox workloads reach at least 3/3 success with exact credential revocation and final VM absence.
- [x] First-pass structured-result, first-pass verification, eventual verification, retries, failed Attempts, and recovery events are reported separately.
- [x] Every remote run records output-schema path, result provenance, typed failure/retry decision, Attempt lineage, candidate SHA, and verification outcome.
- [x] Operational latency, context/currentness, recovery, review, token, model-cost, and provider-cost telemetry preserve unavailable values as `null`.
- [x] The required failure matrix passes fail closed, including stale identity, cancellation, timeout, malformed/truncated/missing result, stale candidate, failed verification, context miss, and cleanup simulation.
- [x] Shadow routing records recommendation versus selected tuple without automatic routing.
- [x] Factory Learning produces signals, clusters, and proposal-only candidates; nothing is promoted automatically.
- [x] A new immutable packet is written only under `docs/testing/evidence/production-factory-pilot-v2/`, including V1 comparison and final credential/VM proof.
- [x] Pilot, full Factory qualification, repository tests, TypeScript, lint, skill lint, runtime guard, production build, orchestration smoke, dependency/security gates, secret scan, and `git diff --check` pass.
- [ ] Durable changes receive fresh CI/Vercel evidence in a draft PR; no merge or next milestone is started.

## Work Log

### 2026-08-18/19 - Baseline and phase gate

- PR #121 merged normally as `db44819ec59e79cdd71ba9ed36fce8064a120af3` with Guarded Auto unchanged.
- Main CI and both Vercel deployments passed; runtime contract is v30; independent exe.dev inventory was zero.
- The exact #121 branch/worktree was safely removed.
- Created isolated branch/worktree `codex/production-factory-pilot-v2` from exact merged `origin/main`.
- Audited Pilot V1 runner, workload semantics, BLOCKED packet, and the qualified PR #121 remote result/retry runner without modifying PR #120.

### 2026-08-18 - Final population and qualification

- Preserved two stopped, excluded runner-alignment probes: the first omitted the literal schema contract; the second omitted production criterion-title mapping. Neither changed product code or entered the final denominator.
- Froze final population `e1cbd5f5e9f8`: 15/15 valid terminal structured results, 14/15 independently verified and accepted, local 12/12, Remote Sandbox 2/3.
- Preserved `security-policy-3` as a fail-closed `NON_RETRYABLE_RESULT / RESULT_ACCEPTANCE_CONTEXT_INVALID` outcome. It received no retry, candidate, verification, or acceptance.
- Recorded 15 Attempts, zero replacements, zero retries, one failed Attempt, 17/17 failure injections, three credential revocations, exact absence of all three remote resources, and final exe.dev inventory zero.
- Kept Guarded Auto disabled with zero applications. Routing and Factory Learning remained advisory; no proposal was promoted.
- Completed full local qualification. Restored qualification-generated System V2 evidence timestamps byte-for-byte to `main`; Pilot V1 and System V1/V2 evidence remain unchanged.
- The intended success and remote reliability acceptance bars remain unmet, so the pilot outcome is `BLOCKED`.
