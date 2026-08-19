---
title: "Production Factory Pilot & Operational Qualification V1"
status: blocked
date: 2026-08-18
baseline: 75981d8ae1bd49e235cc1478bac3d0f853fc717f
runtime_contract: 30
---

# Production Factory Pilot & Operational Qualification V1

## Objective

Determine whether the integrated Mission Control Factory can repeatedly carry realistic software-engineering intent through governed planning, execution, independent verification, evidence-first review, human acceptance, and advisory learning without operator heroics.

This is an operational qualification. It must test and measure the production architecture, not add a new architecture subsystem. Product changes are permitted only for a reproduced defect or unsafe operational gap and must be the smallest correction with regression coverage.

## Fixed authority boundary

- Spec finalization means planning-ready only.
- Separate human Plan approval releases WorkOrders.
- Harness, worker, and Remote Sandbox have no verification, publication, merge, acceptance, memory, observability, or learning authority.
- Workers execute only under a current lease.
- Verification is independent and exact-candidate/currentness bound.
- Review Intelligence is a projection/advisory surface.
- Factory Memory, Factory Learning, and execution routing are advisory.
- Observability/Evals is diagnostic.
- `workOrders.accept` is canonical acceptance; human merge is separate.
- Guarded Auto, Full Auto, autonomous merge/acceptance/deployment, autonomous learning promotion, and dynamic harness plugins remain disabled.

## Workload matrix

Each class runs three independent repetitions in a fresh disposable Git repository. Every retry creates a new Attempt and preserves the failed Attempt.

| Class | Realistic change | Deterministic verification | Migration/rollback requirement |
| --- | --- | --- | --- |
| Bug fix | Correct a bounded pricing calculation defect | Regression test for integer-cent behavior and edge cases | Not applicable |
| Feature | Add a multi-file pricing preview capability | API/module behavior plus acceptance tests | Not applicable |
| Refactor | Extract internal pricing policy without behavior change | Pre/post behavioral contract and full tests | Not applicable |
| Security/policy | Make missing authorization context fail closed | Unauthorized/malformed/authorized policy tests | Not applicable |
| Data/schema migration | Introduce `ownerId` while retaining bounded legacy-read compatibility | Forward migration, mixed-version read, rollback tests | Required |

## Execution allocation

- Canonical local Codex harness: primary path.
- Live-certified exe.dev Remote Sandbox: bounded subset, always `N <= 1`.
- DeepSeek: not selected; experimental admission is audited only.
- Loom: out of scope.
- Actual selection stays operator-pinned. The router records a shadow recommendation only.

## Evidence contract

The pilot writes only to `docs/testing/evidence/production-factory-pilot-v1/` and preserves the frozen System Qualification V1/V2 packets byte-for-byte. Unknown telemetry is `null`, never zero or an estimate.

Each execution record must include:

- exact Constitution, Spec, Plan, Quality Contract, WorkOrder, Factory Version, Context Package, worker/lease, Attempt, candidate, independent Verification Attempt, evidence, Quality Gate, PR-lineage fixture, review, acceptance, learning, and routing-decision lineage;
- actual timing observations and sample coverage;
- first-pass and eventual result, retries, failures, and recovery;
- model/token/cost fields when emitted, otherwise `null` with a limitation;
- human interventions split into required governance and avoidable operational toil;
- omitted lifecycle stages with an explicit reason.

## Failure injection matrix

Across the 15 executions, deliberately exercise stale worker/session/generation, lease loss, timeout, cancellation, deterministic gate failure, independent-verification failure, candidate/PR-head mismatch, stale verification, context miss, sandbox execution failure, simulated cleanup failure, malformed harness result, unsupported capability, missing telemetry, and a review-discovered defect. Each injected failure must fail closed and have a proven recovery or an explicit unresolved limitation.

## Scorecard

Report separate deterministic dimensions for execution reliability, verification reliability, cleanup reliability, context sufficiency, first-pass quality, recovery effectiveness, evidence completeness, review correction frequency, cost efficiency, and latency. Every dimension exposes observed value, sample count, coverage, and confidence/limitations. Missing data cannot improve a dimension.

## Browser proof

Use the real V2 UI at `http://localhost:5180` with EOS flags on. Cover Mission/Spec, Plan, WorkOrder, Run Inspector, verification, Review Package, and Factory Learning across representative desktop/tablet/mobile, light/dark, and Basic/Intermediate/Advanced variants. Verify direct URLs, refresh/history, keyboard/focus, overflow, console/page/request errors, and targeted axe WCAG A/AA.

## Execution checklist

- [x] Record the exact baseline, runtime, capability statuses, and authority audit.
- [x] Implement and regression-test the disposable five-class pilot runner and evidence aggregation.
- [ ] Complete 15 governed executions with independent Attempt history.
- [x] Run the bounded live exe.dev subset serially and prove exact cleanup/final absence.
- [x] Complete all required failure injections and recovery checks.
- [x] Produce run results, metrics, reliability scorecard, routing shadow report, learning output, review proof, and human-intervention analysis.
- [x] Capture and validate the required real-browser evidence matrix.
- [x] Run the pilot suite and all final repository qualification gates.
- [x] Record one final decision and evidence-based next-milestone recommendation without starting it.
- [ ] Create a draft PR only if durable code/evidence changes belong on `main`; do not merge.

## Stop conditions

The final decision is `BLOCKED` if any required authority invariant fails, live resources cannot be proven absent, credential cleanup cannot be proven, historical qualification evidence changes, fewer than 15 governed executions complete, or a required final gate fails without a bounded correction.

## Final outcome

`BLOCKED`: 13 of 15 executions succeeded. The two unresolved live exe.dev workloads exhausted bounded recovery without producing valid `factory-result/v1` output. Cleanup and credential revocation passed and the final remote inventory was zero, but the 15/15 completion invariant is non-negotiable.
