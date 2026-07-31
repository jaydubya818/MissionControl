---
date: 2026-07-31
topic: runtime-contract-ci-guard
---

# Runtime contract CI guard

## What we're building

A bounded CI check that compares the public Convex function contract on the
current commit with its Git base. When a public query, mutation, or action is
added, removed, or changes its argument or explicit return validator, CI requires
an intentional increment to `RUNTIME_CONTRACT_VERSION`.

The guard protects the startup handshake added in PR 53. It must remain strict
without forcing a version increment for handler-only implementation changes.

## Approaches considered

### Guard every Convex source change

Require a version bump whenever any file under `convex/` changes. This is simple
but noisy: indexes, internal helpers, seed data, and handler-only fixes do not
necessarily change the client contract. Repeated false positives would make the
version meaningless.

### Maintain a checked-in contract manifest

Generate and commit a second contract snapshot. This is reviewable, but it adds
another artifact developers must update and creates a path for stale manifests.

### Compare public validators against the Git base

Parse TypeScript source from the base and current trees, extract exported public
`query`, `mutation`, and `action` definitions, and compare function presence,
argument validators, and explicit return validators. This is selected because it
has no manual snapshot and ignores handler-only edits.

## Key decisions

- Use the TypeScript parser already installed by the workspace; do not add a
  dependency or use regular expressions for nested validator syntax.
- Treat public function additions and removals as contract changes.
- Exclude `internalQuery`, `internalMutation`, `internalAction`, generated files,
  tests, and schema-only definitions.
- Compare validator AST structure rather than formatting so whitespace-only edits
  do not require a bump.
- Fail closed when a contract changes without a version increment.
- Report changed function names and the exact remediation command in CI output.
- Explicitly document that implicit handler return-shape changes are outside this
  bounded guard until public functions adopt return validators.

## Institutional learning applied

`docs/solutions/build-errors/missing-convex-schema-contracts-ci-20260730.md`
shows that partial Convex contracts can pass isolated work and then break strict
generated types or runtime validators. This guard keeps the client/backend
compatibility version atomic with public validator changes and does not introduce
permissive shims.

## Open questions

None for this bounded cycle. Enforcing explicit return validators across all
existing public functions would be a separate migration.

## Next steps

Implement the extractor and comparison command, add deterministic fixtures, wire
it into the existing lint CI job, and publish the test evidence in both repository
and Mission Control Docs.
