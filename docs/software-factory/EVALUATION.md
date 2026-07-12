# Evaluation Framework — Scenarios, Criteria, Lift

> Software Factory Epic 5 (PR 7: contracts + CRUD). Feature flag:
> `eval.framework` (default off).

The evaluation framework answers one question: **does a context change
actually make agents better?** A candidate (new context package version,
prompt, or agent config) is run against a baseline on the same scenario,
scored by the same criteria, and the difference — the **context lift** —
plus any regression flags produce a recommendation.

This PR ships the contracts and CRUD only. Execution (running trials)
arrives in PR 8; the automated comparison pipeline in PR 9.

- Tables: `evaluationScenarios`, `evaluationCriteria`, `evaluationRuns`,
  `evaluationComparisons` (`convex/schema.ts`)
- Functions: `convex/evaluation/scenarios.ts`,
  `convex/evaluation/comparisons.ts`
- Pure scoring/lift/regression math: `convex/lib/evaluation.ts`
  (no Convex imports)
- Flag gate: `convex/lib/evalGate.ts`
- Tests: `convex/__tests__/evaluation.test.ts`

## Two-tier scoring model

| Tier | What | Cost | When |
|---|---|---|---|
| **Structural** (cheap) | Skill-lint review score (`packages/context-tools/src/skillLint.ts`) — frontmatter, size, naming, structure. Cap-then-deduct: hard rules cap at 40, deductions apply on top. | Milliseconds, deterministic | Every publish, every gate |
| **Scenario** (expensive) | Baseline/candidate trials of a real task, scored per criterion. | Agent runs (dollars, minutes) | Before promoting a context change |

Both tiers share the same "hard requirement missed" signal: a failed
**required** criterion caps a scenario run's score at
`REQUIRED_FAILURE_SCORE_CAP = 40` — the same ceiling skill-lint applies to
structurally broken skills. A run that misses a hard requirement can never
look healthy, no matter how well the soft criteria scored.

## Contracts

### `evaluationScenarios` — WHAT to run

A reusable task definition: `taskPrompt`, `capability` under test,
optional `repoSlug`, fixture pinning (`fixtureRef`: `REPO_SHA` | `SCRIPT`
| `NONE`), per-arm configs (`baselineConfig` / `candidateConfig`),
budgets (`timeoutMs`, `maxCostUsd`), `requiredArtifacts`, `trials` per arm
(default 1), `owner`, `riskLevel`, provenance (`source`: `MANUAL` |
`FROM_PR` | `FROM_COMMIT` | `FROM_RUN` | `FROM_INCIDENT` + `sourceRef`).

Lifecycle: `DRAFT` ↔ `ACTIVE` → `ARCHIVED` (terminal, read-only).
Activation requires at least one criterion.

### `evaluationCriteria` — HOW to score

Per-scenario scoring rules: `weight` (> 0, normalized at scoring time —
weights need not sum to 1), `scoringMethod` (`BINARY` | `SCALE` |
`LLM_RUBRIC` | `COMMAND`), method-specific `scoringConfig`, `required`
flag, `ordinal` ordering. **Criteria are mutable only while the scenario
is DRAFT** — once ACTIVE the scoring contract is frozen so runs stay
comparable.

### `evaluationRuns` — one trial, one arm

One row per trial per arm (`mode`: `BASELINE` | `CANDIDATE`), created by
the execution pipeline (PR 8). Carries the model, optional
`contextPackageVersionId` under test, optional links to the live `runId`
and its CBOM `contextSnapshotId` (Epic 4), per-criterion
`criterionResults`, the weighted aggregate `score` (0–100), and telemetry
(`costUsd`, `turns`, `durationMs`, `toolFailures`, `humanInterventions`,
`policyViolations`, `artifacts`). Status: `PENDING` → `RUNNING` →
`SCORED` | `FAILED` | `CANCELED`.

### `evaluationComparisons` — the verdict

Immutable baseline-vs-candidate record over scored runs:
`baselineScore` / `candidateScore` (arm means), `contextLift`, optional
`costDelta` / `durationMsDelta` / `turnDelta`, `regressionFlags`, and a
`recommendation`. Written by `recordComparison`, never patched.

## Scoring semantics (`lib/evaluation.ts`)

`computeWeightedScore(criteria, results)`:

- Weight-normalized mean of clamped (0–100) per-criterion scores.
- A criterion with no result contributes 0; a **required** criterion with
  no result counts as failed — silence about a requirement is failure.
- Any required failure caps the run at `REQUIRED_FAILURE_SCORE_CAP` (40).
- Empty criteria list scores 0. Non-positive weights throw.

## Lift semantics

`computeLift(baselineScores, candidateScores)` returns per-arm means,
`lift = candidateMean - baselineMean` (points, may be negative), and
sample standard deviations. **Statistics honesty:** stddev is `null` when
an arm has fewer than 2 trials, and means/lift are `null` for empty arms.
No fabricated statistics below the sample size that supports them —
single-trial comparisons report a raw difference, not a distribution.

## Regression flags

`detectRegressions(baseline, candidate, thresholds)` — defaults in
`DEFAULT_REGRESSION_THRESHOLDS`:

| Flag | Fires when | Default threshold |
|---|---|---|
| `SCORE_DROP` | candidate mean score falls more than N points | 5 points |
| `COST_INCREASE` | candidate cost grows more than N% (both arms report cost, baseline > 0) | 20% |
| `DURATION_INCREASE` | candidate duration grows more than N% | 25% |
| `REQUIRED_CRITERION_REGRESSION` | a required criterion the baseline passed now fails in any candidate trial | — |

## Recommendation mapping

`recommendationFor(lift, regressionFlags)`:

| Condition | Recommendation |
|---|---|
| `REQUIRED_CRITERION_REGRESSION` or `SCORE_DROP` fired | `BLOCK` |
| lift unknown (an arm had no scored trials) | `NEEDS_REVIEW` |
| other flags fired (cost/duration) | `NEEDS_REVIEW` |
| no flags, lift ≥ `APPROVE_LIFT_THRESHOLD` (5 points) | `APPROVE` |
| no flags, lift below threshold | `NEUTRAL` |

## Function surface (this PR)

`evaluation/scenarios.ts` — all mutations flag-gated and audited:

- `create` / `update` (DRAFT/ACTIVE only) / `archive`
- `addCriterion` / `updateCriterion` / `removeCriterion` (DRAFT only)
- `get` / `getWithCriteria` / `list` (by capability, status, repoSlug)

`evaluation/comparisons.ts`:

- `recordComparison` — validates run refs (exist, same scenario, correct
  mode, `SCORED`), recomputes means/lift/deltas/flags/recommendation
  server-side, records the verdict (audit: `EVAL_COMPARISON_RECORDED`)
- `get` / `listByScenario`

## What later PRs add

- **PR 8 — execution:** trial runner that creates `evaluationRuns`,
  executes the scenario in both arms (with CBOM snapshots), scores each
  criterion by its `scoringMethod`, and aggregates with
  `computeWeightedScore`.
- **PR 9 — comparison pipeline:** orchestrates N trials per arm, calls
  `recordComparison`, and feeds recommendations into context publication
  gates (PR 10) and rollout rings (PR 17).
