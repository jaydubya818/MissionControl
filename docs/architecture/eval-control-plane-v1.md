# Eval Control Plane V1

## Purpose

Mission Control's Eval Control Plane turns individual evaluators and system
qualification artifacts into reproducible, inspectable receipts. It answers a
narrow operator question: “Did this exact candidate preserve the product's
governed trust properties, and is this conclusion itself valid?”

Evals remain diagnostic evidence. They cannot approve a Plan, dispatch a
WorkOrder, satisfy a verification criterion, accept delivery, merge code, or
publish a release.

## Canonical model

```text
EvalSuite vN
  ├─ public case input (safe for candidate adapters)
  ├─ sealed assertions (trusted scorer only)
  └─ negative control (eval-integrity CI only)
       ↓
EvalControlRun ── exact provenance + idempotency
  ├─ EvalCaseResult × complete suite case count
  └─ EvalRunReceipt ── verdict + accounting + regressions + digest
       ↓
EvalBaseline ── immutable receipt-derived reference; explicit promotion
```

The existing `evalDefinitions`, `evalScores`, `evalDatasets`, and experiments
remain the granular measurement layer. The control plane binds them into suite
executions rather than replacing them.

## Verdict semantics

Run lifecycle and evaluation conclusions are deliberately separate:

- Run status: `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, or `CANCELED`.
- Case verdict: `PASS`, `FAIL`, `INVALID`, or `SKIPPED`.
- Receipt verdict: `PASS`, `WARN`, `FAIL`, or `INVALID`.

Skipped and invalid cases never count as passing. A missing or duplicate case,
unpinned provenance, incomplete run, or harness/data/judge/infrastructure error
invalidates publication. A blocking case or slice regression fails the
receipt. Advisory failures remain visible as warnings.

`releaseBlocking` and `acceptanceAuthority` are schema-constrained to `false`.
The distinction matters: a failed eval should attract operator attention, but
no eval record is an authorization primitive.

## Golden suite

`mission-control-golden-path` v1 replays committed System Qualification V2
evidence without API credentials. Its six blocking cases cover:

1. Exact approved-intent lineage.
2. Human-only acceptance authority.
3. Evidence bound to the current candidate.
4. Immutable failed Attempts and explicit retry recovery.
5. Harness identity, isolation, and cleanup provenance.
6. Learning that can propose but never self-promote.

One advisory case measures duration, model-call, token, and cost attribution.
The current evidence intentionally warns because token attribution is unknown.
No placeholder value is invented.

Every case declares a degraded negative control. `pnpm run
eval:mission-control` proves all seven controls make their case worse, validates
the receipt, and compares case and slice results to the committed baseline. The
CI job is deterministic and keyless.

## Integrity boundaries

- `getPublicSuite` returns only the public case projection; sealed assertions
  and negative controls never cross the adapter boundary.
- Suite, baseline, receipt, adapter, dataset, resolved configuration, source
  artifacts, and Git revisions use pinned identities or SHA-256 digests.
- Run submissions are idempotent within a workspace and persist cases plus the
  receipt in one Convex transaction.
- Baselines can only come from complete publishable receipts. Promotion needs
  `factory.improve`, a reason, and an audit record; prior contents are immutable.
- Model-judged evals are outside the V1 merge gate. A future judged-suite
  contract must require model, prompt, and rubric provenance before results
  are eligible for comparable regression claims or calibrated release use.

## Operator workflow

Open **Intelligence → Observability & Evals → Eval library**. Eval Health leads
with the latest receipt verdict, blocking and advisory case health, baseline
regressions, invalid-run count, required next action, case failure origin, and
pinned provenance. The granular evaluator library remains immediately below.

Treat `INVALID` as a harness or accounting incident, not a product failure.
Treat `FAIL` as a product or blocking-regression investigation. Treat `WARN` as
a known coverage gap. `PASS` still requires independent verification and human
acceptance in the normal Mission → WorkOrder path.

## Commands and artifacts

```bash
pnpm run eval:mission-control
node scripts/run-mission-control-eval.mjs \
  --input docs/testing/evidence/system-factory-e2e-v2/scenario-evidence.json \
  --receipt docs/testing/evidence/system-factory-e2e-v2/eval-receipt.json \
  --check-baseline
```

- Receipt schema: `evals/schemas/eval-receipt.schema.json`
- Main baseline: `evals/mission-control-golden-v1/baselines/main.json`
- Baseline source receipt:
  `evals/mission-control-golden-v1/receipts/baseline-source.json`
- Shared scorer: `packages/shared/src/evalControlPlane.ts`
- Governed persistence/API: `convex/evalControlPlane.ts`

## Recovery

If a receipt is invalid, retain it for diagnosis, repair the reported failure
origin or accounting error, and create a new run with a new idempotency key. Do
not mutate or relabel the old receipt. If a baseline is wrong, promote a new
publishable receipt with a reason; never edit the old baseline contents.
