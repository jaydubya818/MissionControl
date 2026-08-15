---
title: Repository code-scope schema migration validation
date: 2026-08-15
status: passed-with-external-gates
owner: Product Architecture
---

# Repository code-scope schema migration validation

## Result

The preserved Research Lab schema blocker is migrated without losing policy
meaning. A one-release compatibility validator permits controlled rollout; the
actual cleanup function is internal-only and requires deployment admin authority.

## Migration evidence

Pre-migration inspection:

- 13 repository code scopes scanned.
- 1 legacy row found.
- 0 canonical conflicts.
- Scope `jx7rkb4hf89ydhqgavr6zzbzzs8ca6ds` belongs to Mission Control Factory.
- Canonical `approvalPolicy` was `HUMAN_REVIEW`.
- Canonical `description` was empty, so the legacy human explanation had a safe
  canonical destination.

Applied result:

- 1 row migrated at migration version 2.
- Machine policy remained `HUMAN_REVIEW`.
- Human policy context was preserved in `description`.
- The retired field was removed from the stored row.
- Post-migration inspection reported 0 legacy rows and 0 conflicts.
- A second migration run reported 0 writes, proving idempotency.
- `npx convex dev --once` deployed the compatibility migration cleanly against
  the preserved database.

## Browser evidence

At `http://localhost:5199`, the Mission Control Factory workspace loaded the
affected `jaydubya818/MissionControl` repository and rendered:

- one `Browser dispatch evidence` code scope;
- its repository-relative path;
- owner, local execution boundary, and verification policy;
- the existing Factory configuration with the migrated scope selectable;
- zero browser console errors or warnings.

Screenshot:
`output/playwright/repository-code-scope-schema-migrated.png`.

The Codex Queue Canary workspace also rendered three READY WorkOrders. The
oldest local canary is not dispatchable because its Child Task is already
`BLOCKED`, and its own contract explicitly says it is local-only evidence. It
was not mutated or presented as a fresh Live READY canary.

## Automated verification

- `pnpm run test` passed across every test-bearing workspace.
  - Mission Control UI: 53 files, 238 tests.
  - Convex: 75 files, 538 tests.
  - The repository-scope migration added 5 focused tests.
- `pnpm run lint` passed the full workspace typecheck and skill lint.
- `pnpm run build` passed every workspace build; Vite emitted only the existing
  large-chunk advisory.
- `git diff --check` passed.

## External gates not claimed

- Real Clerk proof is blocked: no Clerk publishable key, secret, issuer, auth
  mode, or two test identities are configured in this checkout.
- A fresh Live READY canary requires a deployed candidate and authenticated
  production-like operator identity. Local seeded or preserved records do not
  satisfy that claim.

## Post-Deploy Monitoring & Validation

Validation window: deployment plus 24 hours. Owner: Factory operator.

Search for:

- `REPOSITORY_CODE_SCOPE_SCHEMA_MIGRATED`
- Convex schema validation failures
- repository-scope query or Factory configuration failures
- Model Routing authorization denials and cross-workspace access attempts

Healthy signals:

- inspector reports zero conflicts and zero legacy rows after migration;
- migration reruns produce zero writes;
- Workspaces & Repositories and Factory configuration render their scopes;
- Model Routing writes retain authenticated operator attribution.

Rollback trigger: any missing scope, overwritten canonical policy, schema
validation error, or Factory configuration read failure. Retain the compatibility
validator and restore the affected scope from audited pre-migration values before
retrying. Do not remove compatibility until all deployments report zero legacy
rows.
