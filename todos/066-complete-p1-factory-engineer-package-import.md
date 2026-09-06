---
status: complete
priority: p1
issue_id: "066"
tags: [convex, integration, authentication, missions, planning]
dependencies: []
---

# Import trusted Factory Engineer deployment packages

## Problem Statement

Mission Control has no authenticated, idempotent way to retrieve an approved
Factory Engineer deployment package and turn it into its existing governed
Mission and Plan draft records.

## Findings

- `convex/missions.ts` owns the canonical Mission and Plan draft lifecycle.
- Clerk plus Mission Control company/workspace records are the human authority.
- The HMAC service-command boundary is for orchestration service execution and
  should not replace the initiating human authorization for this import.
- Existing Mission/Plan idempotency keys do not detect a second digest or target
  for the same external package identity.
- `missions.spec-intake-v1` requires a finalized Mission Spec before Plan draft
  creation; the importer must fail closed rather than bypass it.
- `docs/solutions/build-errors/missing-convex-schema-contracts-ci-20260730.md`
  requires schema, validators, indexes, generated types, tests, and consumers to
  land together.

## Proposed Solutions

### Option 1: Clerk-authenticated Convex retrieval action

**Approach:** Authorize the operator and target, retrieve from configured
Factory Engineer, validate, then use one internal mutation to create a durable
receipt and existing drafts atomically.

**Pros:** Preserves human identity and workspace authorization; transactional;
smallest trustworthy boundary.

**Cons:** Requires a new receipt table and outbound credential configuration.

**Effort:** Medium

**Risk:** Medium

### Option 2: Orchestration-server import route

**Approach:** Protect a Hono route with the orchestration bearer token and sign
a new service command into Convex.

**Pros:** Reuses service-command infrastructure.

**Cons:** Loses the initiating Clerk operator and risks treating a broad service
credential as workspace assignment authority.

**Effort:** Medium

**Risk:** High

## Recommended Action

Implement Option 1. Keep imports draft-only, use a configured issuer, persist
issuer-scoped idempotency, and return `SPEC_INTAKE_REQUIRED` when existing Spec
governance prevents safe Plan creation.

## Technical Details

Affected areas include the shared contract, Convex schema, a bounded import
module, pure validation/mapping tests, generated API types, and integration
documentation. No executable abstraction or WorkOrder path is added.

## Resources

- `docs/plans/2026-09-04-feat-factory-engineer-package-import-plan.md`
- `docs/security/clerk-company-authorization.md`
- `docs/security/service-command-authentication.md`
- `docs/software-factory/governed-missions-contract.md`
- `docs/solutions/build-errors/missing-convex-schema-contracts-ci-20260730.md`

## Acceptance Criteria

- [x] Authenticated, authorized preview retrieves only from configured issuer.
- [x] Invalid issuer, schema, status, digest, stale, or revoked state fails closed.
- [x] Confirm creates one existing Mission draft and one existing Plan draft.
- [x] Retry returns existing receipt; digest/target conflict creates nothing.
- [x] Spec-intake-enabled targets return `SPEC_INTAKE_REQUIRED` without writes.
- [x] No WorkOrder, submit, approval, dispatch, or execution state is created.
- [x] Tests, typecheck, build, authorization scan, and diff check pass.
- [x] Documentation reflects implemented state and operational validation.

## Work Log

### 2026-09-04 - Audit and implementation start

**By:** Product engineering

**Actions:**

- Audited Mission, Plan, Clerk, service-command, schema, and test contracts.
- Chose the authenticated Convex action and atomic internal mutation seam.
- Identified Mission Spec intake as an explicit fail-closed boundary.

**Learnings:**

- An immutable package needs a separate current attestation for revocation and
  staleness without invalidating its original content digest.
- The current shared canonical JSON is an internal legacy format and must not be
  mislabeled as RFC 8785.

### 2026-09-04 - Implementation complete

**By:** Product engineering

**Actions:**

- Added the exact immutable package and current attestation contract, bounded
  retrieval adapter, Clerk authorization, local project/repository/scope/workflow
  binding, atomic draft import, and durable receipt.
- Added cross-language digest fixtures, adversarial validation tests, acceptance
  lineage mapping, idempotency coverage, and draft-only authority checks.
- Passed repository-wide typecheck, tests, production build, Convex authorization
  ratchet, factory documentation check, formatting check, and diff check.

**Learnings:**

- The upstream workspace reference must be paired with an explicit local project
  ID; a repository slug alone is not a sufficient multi-tenant boundary.
- Approved acceptance criteria must all be referenced by at least one blueprint
  or the receiver can silently lose approved intent during projection.
