---
title: "feat: Import trusted Factory Engineer packages as governed drafts"
type: feat
status: complete
date: 2026-09-04
owner: product-engineering
product_area: software-factory
---

# Import trusted Factory Engineer packages as governed drafts

## Outcome

An authenticated Mission Control operator can preview and confirm retrieval of
one immutable, published Factory Engineer deployment package from a configured
issuer. Mission Control validates the current upstream attestation and creates
exactly one existing Mission draft and one existing Plan draft in one Convex
transaction. The import never submits or approves the Plan, creates WorkOrders,
or grants execution authority.

## Decisions

- Use a Clerk-authenticated Convex action so the initiating operator and local
  workspace permissions remain authoritative.
- Fetch only from a configured Factory Engineer base URL using a server-held
  bearer credential. Never accept a caller-supplied URL.
- Treat the immutable package and mutable retrieval attestation as separate
  contracts. Require both the package-at-publication status and current
  attestation status to be `PUBLISHED`.
- Use versioned `fdlc-canonical-json/v1`: recursively sorted object keys,
  compact UTF-8 JSON, preserved array order, and JSON strings/integers for all
  numeric contract fields. The digest omits only `integrity.digest`.
- Persist one import receipt keyed by issuer ID, package ID, and package
  version. The same digest and target return the receipt; another digest or
  target fails closed.
- Bind the configured Factory Engineer channel to one explicit Mission Control
  project ID and recheck that binding inside the atomic mutation.
- Refuse live draft creation when `missions.spec-intake-v1` is enabled. The
  importer must not bypass or synthesize Mission Spec finalization.

## Implementation

- [x] Add shared package, attestation, canonicalization, validation, and mapping
      contracts with cross-language fixtures.
- [x] Add the complete Convex schema and indexes for durable import receipts.
- [x] Add authenticated preview/confirm actions and one atomic internal
      mutation for receipt, Mission draft, Plan draft, and audit events.
- [x] Add tests for issuer/schema/status/digest/size/idempotency/scope and
      draft-only behavior.
- [x] Document configuration, failure behavior, and post-deploy validation.
- [x] Run Mission Control typecheck, tests, build, security authorization scan,
      and `git diff --check`.

## Mapping boundary

Factory Engineer supplies approved intent, source-version references,
assertions, blueprints, authority ceilings, and verification requirements.
Mission Control resolves its own project, repository, team, owner, code-scope,
and workflow IDs. Raw customer evidence is never copied into Mission Control.

The Plan remains editable and incomplete if local capabilities require operator
resolution. Submission re-runs the existing repository, workflow, policy,
Mission Spec, plan-validation, and separation-of-duty gates.

## Post-Deploy Monitoring & Validation

- Monitor `FACTORY_PACKAGE_IMPORTED` Mission events/activities and expected
  action failure codes, especially `IDEMPOTENCY_CONFLICT`.
- Confirm one import receipt, Mission, Plan, and import event exist for a valid
  package identity and that retries return the original references.
- Healthy behavior: published packages from the configured issuer create only
  `PLANNING` / `DRAFT` records and no WorkOrders.
- Roll back or disable the UI entry point if digest mismatches, duplicate draft
  creation, cross-workspace access, or any post-import execution occurs.
- Validate for 24 hours after enablement; owner: Mission Control operator.
