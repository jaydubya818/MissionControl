---
title: "fix: Migrate repository code-scope schema drift"
type: fix
status: complete
date: 2026-08-15
owner: Product Architecture
risk: yellow
---

# Migrate repository code-scope schema drift

## Problem

The preserved Research Lab contains one `repositoryCodeScopes` record with the
retired `approvalPolicyDescription` field. The current strict Convex schema
rejects that stored record before new functions can deploy. Its value is useful
human-readable policy context, while the canonical `approvalPolicy` contains
the machine-facing `HUMAN_REVIEW` value.

## Chosen approach

Use a two-phase compatibility migration:

1. Accept the legacy string as an optional compatibility field for one release.
2. Deploy an internal-only inspector and idempotent migration.
3. Preserve the legacy text in canonical `description` when that field is empty;
   never overwrite a conflicting canonical value.
4. Replace the record without the legacy field and record system audit evidence.
5. Prove the Research Lab deploys cleanly and the migration is idempotent.
6. Remove the compatibility validator in a later cleanup only after every target
   deployment reports zero legacy rows.

## Safety rules

- The inspector is read-only and returns no policy text.
- The mutation is internal-only and must be invoked with deployment admin
  authority.
- Any record whose legacy text cannot be preserved without overwriting canonical
  data blocks the entire transaction.
- The migration never deletes a record and never changes repository, ownership,
  path, reviewer, environment, or machine policy fields.
- Re-running the migration after success performs zero writes.

## Implementation

- [x] Add the temporary compatibility validator.
- [x] Add the internal inspector and idempotent migration.
- [x] Add focused normalization and conflict tests.
- [x] Deploy to the preserved Research Lab and inspect exact candidate counts.
- [x] Apply the migration and prove a zero-candidate second run.
- [x] Run typecheck, tests, build, browser verification, and `git diff --check`.
- [x] Record the real Clerk identity gate as blocked when credentials are absent.

## Post-Deploy Monitoring & Validation

Validation window: the deployment plus 24 hours. Owner: Factory operator.

Watch for Convex schema validation failures, migration conflicts,
`REPOSITORY_CODE_SCOPE_SCHEMA_MIGRATED`, and repository-scope read failures.
Healthy means the inspector reports zero legacy rows, repeated migration writes
zero records, current code deploys without a schema workaround, and the Factory
configuration and WorkOrder scope surfaces still render.

Rollback trigger: any canonical field overwrite, missing scope, or scope-read
failure. Stop deployment, retain the compatibility validator, and restore the
record from its pre-migration values before attempting another cleanup. Do not
remove the compatibility validator until all deployments are clean.
