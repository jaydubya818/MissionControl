# Runtime contract CI guard results

Date: 2026-07-31

Branch: `codex/runtime-contract-ci-guard-pr7`

Base: `ec1f6bf` on canonical `main`

## Result

PASS for the bounded public Convex validator contract guard.

Mission Control can now compare the public Convex query, mutation, and action
contract in a working tree against a Git base. Additions, removals, argument
validator changes, local validator dependency changes, and explicit return
validator changes require an intentional `RUNTIME_CONTRACT_VERSION` increment.

Handler-only and formatting-only edits do not trigger the guard. Internal Convex
functions, generated sources, and tests remain outside the public contract.

## Root finding

The runtime handshake delivered in PR 53 could detect a version mismatch, but CI
did not enforce the step that makes the handshake meaningful. A developer could
change a public argument validator without incrementing the version, allowing an
old browser tab to pass startup and fail later at an ordinary query boundary.

The repository learning in
`docs/solutions/build-errors/missing-convex-schema-contracts-ci-20260730.md`
confirmed the same class of failure: Convex consumers and strict validators must
ship as one atomic contract, and permissive compatibility shims are not a fix.

## Implementation

- Added a TypeScript-AST extractor for exported public `query`, `mutation`, and
  `action` definitions.
- Canonicalized validator syntax so whitespace, comments, and equivalent string
  quote styles do not create false positives.
- Followed local validator constants recursively so changing a reused validator
  is detected even when the public `args` object still references the same name.
- Compared base/current function presence, builder kind, arguments, and explicit
  returns.
- Required a strictly greater runtime version for every detected contract change
  and rejected version decreases.
- Added actionable failure output listing every affected Convex function.
- Added `pnpm run ci:runtime-contract` and wired it into the existing lint job with
  full Git history and the pull-request or push base SHA.

## Deterministic evidence

- Current repository scan: PASS, 743 public Convex functions, zero contract
  changes against `ec1f6bf`.
- Focused guard tests: PASS, 12 assertions.
- Contract addition/removal detection: PASS.
- Argument and explicit return validator detection: PASS.
- Recursive local validator dependency detection: PASS.
- Missing version bump rejection: PASS in a temporary Git repository.
- Incremented version acceptance: PASS in a temporary Git repository.
- Handler-only and formatting-only changes: PASS without a version bump.
- Argument field-name/local-constant collision: PASS without a false positive.
- Default base resolution: PASS for `origin/main` and repositories without a
  remote.
- Script syntax checks: PASS.
- Mission Control Docs registration and uniqueness: PASS, 7 assertions.
- Runtime Contract CI Guard page: PASS in Chromium with zero page errors and no
  console warnings beyond Vite/React development notices.
- Skill lint: PASS, 10 skills with zero errors and warnings.
- Full local repository suite: intentionally not run under the bounded-cost
  policy.

## Limitations

- Most existing public Convex functions do not declare explicit `returns`
  validators. Their implicit handler return shapes cannot be compared reliably by
  this bounded source guard.
- The extractor follows validator dependencies declared in the same module. The
  current public argument contracts do not rely on imported custom validators;
  cross-module validator resolution is deferred until the repository introduces
  that pattern.
- HTTP action route contracts are not query/mutation/action API contracts and are
  outside this cycle.

Browser evidence is retained at
`docs/testing/evidence/runtime-contract-ci-guard/docs-result-page.png`.

## Recommendation

Adopt explicit `returns` validators incrementally on high-risk operator queries,
starting with task, approval, workflow-run, and runtime-compatibility reads. Do
not attempt a 743-function migration in one cycle.

## Publication evidence

- Implementation commit: `9dcbd3e`
- Pull request: [#54](https://github.com/jaydubya818/MissionControl/pull/54)
- CI run: [30669030979](https://github.com/jaydubya818/MissionControl/actions/runs/30669030979),
  PASS for build, lint, smoke, TypeScript, unit, E2E, and both preview deployments.
- Guard job evidence: lint job `91282548913` executed against base `ec1f6bf` and
  reported PASS across 743 public functions.
- Merge target: canonical `main`, squash merge after this evidence update.
