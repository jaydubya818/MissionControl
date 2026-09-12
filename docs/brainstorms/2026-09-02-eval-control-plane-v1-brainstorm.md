---
date: 2026-09-02
topic: eval-control-plane-v1
status: accepted
source: https://github.com/garrytan/gbrain-evals
---

# Eval Control Plane V1

## What We're Building

Mission Control will turn its existing eval primitives into one receipt-first
control plane. Versioned suites will bind public cases, sealed assertions,
negative controls, baselines, adapter provenance, case results, and immutable
run receipts. The first suite will dogfood Mission Control's governed Mission
golden path instead of introducing a generic benchmark marketplace.

The operator surface will remain inside Observability & Evals. It will lead
with the latest verdict, regressions, invalid runs, publication eligibility,
failure origin, and known gaps before showing aggregate evaluator analytics.

## Why This Approach

Mission Control already has traces, eval definitions, eval scores, datasets,
experiments, operator evals, context evals, and a role-specific Python harness.
Adding another isolated runner would deepen fragmentation. Replacing those
systems would create unnecessary migration risk. A thin canonical run and
receipt layer lets each existing evaluator converge over time while preserving
the authoritative `Mission -> WorkOrder -> Task -> Attempt -> evidence -> pull
request -> release` hierarchy.

The strongest transferable practices from gbrain-evals are benchmark
governance: sealed gold boundaries, exact version pins, machine-validated
receipts, explicit baselines, negative controls, hermetic CI, typed failure
origins, judge calibration, and public accounting for known weaknesses.

## Key Decisions

- Keep `evalDefinitions` and `evalScores` as observation-level measures; add a
  suite/run/result/receipt layer above them.
- Separate run status from verdict. A completed run may warn or fail; a
  skipped, malformed, or harness-broken run can never pass.
- Classify errors as system-under-test, harness, judge, data, or infrastructure.
- Make suite manifests, case assertions, baselines, and receipts content-bound.
- Give candidate adapters only public case inputs; score against sealed
  assertions at the trusted evaluator boundary.
- Require a negative control for every V1 case and reject unfailable suites.
- Gate pull requests with deterministic, keyless checks. Paid or model-based
  judges remain scheduled/manual until calibrated.
- Compare every blocking case and slice, not only the aggregate score.
- Keep all V1 eval records advisory and without execution, approval, merge, or
  acceptance authority.
- Publish the current missing token-attribution coverage as an advisory warning
  rather than weakening the case or inventing a passing value.

## V1 Golden Suite

1. Exact intent and approved-plan lineage.
2. Human-only acceptance and bounded authority.
3. Exact-current evidence and candidate/PR identity.
4. Failure, retry, recovery, and immutable Attempt history.
5. Harness isolation, cleanup, and configuration provenance.
6. Learning cannot self-promote or release work.
7. Cost, latency, token, and model-call attribution (advisory until complete).

## Deferred

- A generic suite authoring UI.
- Automatic release blocking from model-judged evals.
- Online sampling and production canary evals.
- Statistical promotion from small samples.
- Migrating context, operator, and role-specific eval histories.

## Success Criteria

A fresh checkout can run the dogfood suite without secrets, reproduce the
baseline, prove every case can fail, reject incomplete or invalid runs, emit a
schema-valid receipt tied to exact provenance, and show receipt health in the
existing operator console. The current economics gap remains visible and does
not block the six trust invariants.
