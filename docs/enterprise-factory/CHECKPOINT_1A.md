# Immutable delegation contract checkpoint

Status: locally verified contract; composed foundation PARTIAL.

Base: `5308727463ec737589bf8072ee9f5de0af1bba7a`. Branch: `codex/enterprise-factory-orchestration`.

## Change

The shared package now defines a strict `factory-delegation-binding/v1` value, a namespaced canonical SHA-256 digest, and exact comparison against a trusted stored binding. It retains separate enterprise and partner identities, exact revision/source/policy digests, effect limits, reservation identity, integer micro-USD, and validity bounds. Unknown fields, unsupported protocols, unsafe values, broadened effects, and substituted identities deny.

This module is deliberately not wired into admission. It neither authenticates a message nor grants execution. Authentication, durable idempotency, current authority, revocation, reservation existence, and candidate/result custody remain later checkpoints. Identical digests prove identical binding content only; they do not prove at-most-once execution.

## Local verification

| Command | Result |
| --- | --- |
| `pnpm --filter @mission-control/shared exec vitest run src/__tests__/factoryDelegationBinding.test.ts` | 116 passed |
| `pnpm --filter @mission-control/shared test` | 200 passed across 8 files |
| `pnpm run typecheck` | Passed across repository workspaces |
| `pnpm exec vitest run convex/__tests__/factoryAttempt.test.ts convex/__tests__/factoryConfiguration.test.ts convex/__tests__/factoryDispatch.test.ts convex/__tests__/factoryRuntimeGoldenPath.test.ts convex/__tests__/missionWorkOrderContract.test.ts convex/__tests__/missionGovernance.test.ts` | 58 passed across 6 files |
| MyFactory `node --test apps/cloud-control/test/cloud-contract.test.mjs` at recovered main | 2 passed |
| `node scripts/skill-lint.mjs` | 0 errors; 34 existing warnings |

The initial contract test run failed because the implementation module did not exist. After implementation, the suite passed. Native regressions ran without a MyFactory endpoint or credentials. They are focused unit regressions, not composed execution qualification.

Locked dependencies were installed with lifecycle scripts disabled. The offline install first failed because the local package store lacked a Convex tarball; the subsequent frozen network install succeeded without changing the lockfile.

## Review and blast radius

Runtime changes are limited to one shared contract module and its export. Tests live in the existing Vitest suite. Documentation records the required architecture, compatibility, source pins, native multi-agent reuse, and unpassed qualification gates. The added branch-specific CI workflow provides exact-commit evidence because the existing CI push filter excludes `codex/*`. No database migration, native dispatch change, UI change, dependency update, or partner source change is included.

Sequential source, API-contract, and comment reviews found no in-scope blocker. Two public API comments describe the non-executable boundary and caller obligations. No suppressions or `any` casts were added. This review is not an independent security review.

The source repositories were confirmed public before including their identifiers and source SHAs. Fixtures use generic identities and contain no credentials or private source. Raw attachments and local checkout diagnostics remain in the local orchestration workspace.

CI reuses existing pinned action revisions, has a bounded timeout, read-only contents permission, no secrets, and no deployment/publication step, following [GitHub's secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use). Hosted results and remote commit identity are recorded in the workspace checkpoint report after push.

## Remaining gates

The owner selected canonical main and required dependency merges before execution wiring. MyFactory private-source/Work authority, MyEve shared accounting/Work authority, and MySkills integration remain gated. After their merge, recover exact new main SHAs and review the actual contracts before Phase 1b and registry/admission. Do not activate experimental DeepAgents, alter frozen UX/external-alpha releases, or inherit historical PASS.

Real database, concurrency, sandbox, fault injection, independent verification, browser, accessibility, visual regression, and independent security review for the new composition are NOT_RUN. No E2-E10 or T1-T10 gate is claimed PASS.
