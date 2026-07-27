# Eval runs

Scenario-based measurement before trusting a skill change.

## Data model

- **Scenarios** (`contextEvalScenarios`) — prompt + weighted criteria
- **Runs** (`contextEvalRuns`) — baseline/candidate scores, status, impact delta
- **Verifiers** (`contextVerifiers`) — invariant checks with glob patterns

## Run statuses

PENDING → RUNNING → COMPLETED | FAILED | CANCELED

## UI

**Knowledge → Eval Runs** lists runs with package, version, scenario count, and scores.

Registry package detail unifies eval history, verifiers, and security in one panel when `eval.framework` flag banner is shown.

## Framework gate

`convex/lib/evalFrameworkGate.ts` enforces eval evidence on publish paths.

## Meta-loop

Failed or low-delta runs generate `metaLoopSuggestions` of kind `EVAL_SCENARIO` to close coverage gaps.

Demo seed: twelve eval runs across nine packages.
