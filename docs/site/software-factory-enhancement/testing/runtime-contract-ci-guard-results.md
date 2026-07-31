# Runtime Contract CI Guard PR 7

## Outcome

Mission Control CI now compares public Convex validator contracts with the Git
base and requires an intentional runtime-contract version increment when a public
query, mutation, or action is added, removed, or changes arguments or explicit
returns.

The comparison uses TypeScript syntax, follows local validator dependencies, and
ignores formatting and handler-only changes. Strict Convex validation remains
unchanged.

## Verification

Twelve focused assertions cover public/internal classification, formatting and quote
normalization, local validator dependencies, explicit returns, additions,
removals, missing version bumps, accepted bumps, handler-only edits, dependency
name collisions, and base resolution.

The current repository scan passed across 743 public functions with no contract
change relative to the cycle base. The full evidence record is in
`docs/testing/runtime-contract-ci-guard-results.md`.

Mission Control Docs registration and uniqueness tests passed, and the page
rendered in Chromium with zero page errors and a clean application console.

Pull request 54 passed CI run 30669030979 across build, lint, smoke, TypeScript,
unit, E2E, and both previews. The lint job ran the new guard against base
`ec1f6bf` and reported PASS across 743 public functions.

## Limitation and next recommendation

Implicit handler return shapes are not statically guarded. Add explicit return
validators incrementally to high-risk operator reads rather than attempting a
single repository-wide migration.
