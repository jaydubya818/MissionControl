# Factory measurement semantics

## Repair contract

This change repairs two source-level scoring defects on baseline
`b6bfc6a85eaa99e5af3f8fa7d3a2b947a888788a`. It does not qualify live factory
self-improvement or change promotion authority.

Meta-loop measurements accept an explicit `targetDirection` of
`HIGHER_IS_BETTER` or `LOWER_IS_BETTER`. Omitted direction keeps the existing
higher-is-better behavior. New measurements retain the resolved direction in
the stored measurement. Existing stored records may omit it. Direction is not
inferred from a unit string. Baseline, result, and target must be finite numbers.
The existing permission, linked-WorkOrder, evidence, and bounded-follow-up
requirements continue to apply.

Cost or latency callers must pass `LOWER_IS_BETTER` explicitly. No UI controls
were added, and historical measurements are not recalculated. The separate
Loop Engineering measurement API is unchanged.

Factory Learning experiment review carries the recorded `averageScore` into
its advisory comparison. A paired quality-score regression prevents a
promotion recommendation even when cost improves. One-sided or invalid score
evidence holds an otherwise positive recommendation and reports the gap. When
both scores are absent, the existing comparison behavior remains available.
Other known regressions still cause a rejection recommendation.
The query retains an invalid recorded score as an invalid value rather than
silently treating it as an absent score. `comparisonWarnings` explains missing
or invalid quality evidence. Comparisons with both scores absent may still
recommend promotion based on other recorded metrics; they do not establish
quality preservation.

The query compares variants from one stored experiment, which records a shared
dataset version and evaluator-ID set. Human-recorded aggregate outcomes do not
prove identical samples, immutable scorer versions, or statistical significance.
The result remains advisory with `autoPromote: false` and
`statisticallySignificant: false`.

## Design decision

An explicit enum makes comparison direction part of the data contract. Inferring
it from arbitrary unit text would misclassify measures and leave historical
meaning uncertain. A missing direction retains the documented legacy meaning.

The existing promotion helper remains the comparison owner. The query passes
through the score it previously dropped. Missing-score diagnostics belong to
that helper so other callers receive the same conservative recommendation.

## Verification

The failing baseline had 16 failed tests and 23 passing tests. It reproduced
both inverted cost-target verdicts and a promotion recommendation despite a
recorded quality decrease from 0.95 to 0.20. That evidence is retained in
`.audit/factory-measurements-before.log`.

The repaired candidate passes 39 tests in the same three files. The checks
cover actual query score projection, optional direction in both API and stored
schema, persisted measurement and lifecycle state, duplicate-follow-up
suppression, permission and evidence gates, equality boundaries, nonfinite
measurements, known score regression, preserved scores, missing scores, and
invalid scores. Existing meta-loop and Factory Learning checks also pass.

Command:

```sh
npx --yes pnpm@9.0.0 exec vitest run convex/__tests__/factoryMeasurementSemantics.test.ts convex/__tests__/metaLoopSignals.test.ts convex/__tests__/factoryLearning.test.ts
```

The final Convex typecheck exits 0:

```sh
npx --yes pnpm@9.0.0 exec tsc --noEmit -p convex/tsconfig.json
```

Raw successful logs are `.audit/factory-measurements-after.log` and
`.audit/factory-measurements-typecheck.log`. `git diff --check` also passes.
These are author checks; the parent handoff records independent review.

The handler tests use in-memory records and a controlled permission adapter.
They assert that authorization is consulted and rejected calls do not write;
they do not requalify the underlying membership resolver. No hosted database,
provider execution, live replay, factory configuration promotion, or generated
application was exercised.
