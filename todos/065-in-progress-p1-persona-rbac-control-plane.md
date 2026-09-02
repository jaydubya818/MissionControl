---
status: in_progress
priority: p1
issue_id: "065"
tags: [authorization, rbac, identity, software-factory, ui, security]
dependencies: ["015"]
---

# Implement the Persona RBAC Control Plane

## Problem Statement

Mission Control has authenticated company membership and scoped permission
primitives, but the operator shell and settings do not yet provide coherent
Executive, Architect, Builder, and Admin access profiles. Navigation-only
filtering would be unsafe while some public Convex domains still mix human and
service authority.

## Findings

- Clerk authenticates humans; Mission Control roles and assignments remain the
  authorization source of truth.
- Existing `roles.permissions` and `roleAssignments.scope` can carry the active
  profile without introducing a second membership model.
- Current authorization still includes legacy aliases and role-name inference.
- EOS route maturity filtering exists but is not permission-aware.
- Company Access already provides the correct administrative home for member
  assignments.
- `governance/permissions.createPermission` is publicly writable and must not
  back an administrative access editor in its current form.
- Human and service authority must remain separate so profile enforcement does
  not strand schedulers, agents, webhooks, or executors.

## Proposed Solutions

### Option 1: UI-only persona navigation

Hide navigation based on a selected persona.

**Pros:** Small implementation.

**Cons:** Does not secure direct Convex calls and creates false confidence.

**Risk:** Critical.

### Option 2: Replace Mission Control roles with Clerk Organizations

Move persona membership and permissions into Clerk.

**Pros:** Uses an external organization product.

**Cons:** Duplicates tenants, operators, roles, assignments, and scopes; breaks
the existing authorization doctrine.

**Risk:** High.

### Option 3: Extend existing roles with versioned access profiles

Keep Mission Control authoritative, add stable persona keys and experience
defaults to roles, version changes, resolve effective access server-side, and
filter every navigation entry from the resulting context.

**Pros:** One authority model, scoped enforcement, auditable recovery, and
consistent UI.

**Cons:** Requires coordinated schema, Convex, migration, UI, and verification
work.

**Risk:** Medium when shipped in legacy/shadow/enforced phases.

## Recommended Action

Implement Option 3 according to
`docs/plans/2026-08-31-feat-persona-rbac-control-plane-plan.md`. Treat the
Product Owner's “proceed” instruction as approval of the ten recommended V1
decisions. Do not edit the plan document; track execution here.

## Technical Details

### Foundation

- Add a shared typed access-control registry.
- Extend roles additively and add immutable profile revisions.
- Add tenant legacy/shadow/enforced rollout state.
- Make permission catalog writes internal or explicitly authorized.

### Server

- Add profile lifecycle and effective-access APIs.
- Preserve company/workspace/team/record scope checks.
- Require optimistic concurrency, reasons, audit, and final-admin safety.
- Preserve separate service command boundaries.

### UI

- Add `Settings → Access Profiles` with four persona tabs.
- Add permission-aware route, navigation, deep-link, command, and recovery
  behavior.
- Extend Company Access with primary persona and scope assignment.
- Provide loading, empty, error, denied, stale, success, and restore states.

### Verification

- Add shared, Convex, UI, and browser tests.
- Verify all four personas in the demo at `http://localhost:5199`.
- Run authorization ratchet, typecheck, tests, build, and browser accessibility
  checks.

## Resources

- `docs/plans/2026-08-31-feat-persona-rbac-control-plane-plan.md`
- `docs/security/clerk-company-authorization.md`
- `docs/security/human-service-authorization-matrix.md`
- `docs/architecture/company-workspace-repository-control-plane.md`
- `docs/design.md`
- `convex/lib/companyAccess.ts`
- `apps/mission-control-ui/src/shellV2/routeCapabilities.ts`

## Acceptance Criteria

- [x] Shared persona, permission, route, and safety registry is implemented and tested.
- [x] Schema supports stable system profiles, immutable revisions, and rollout state.
- [x] Permission registry writes are no longer available anonymously.
- [x] Executive, Architect, Builder, and Admin profiles initialize idempotently.
- [x] Profile list, detail, preview, update, restore, assignment, and rollout APIs are guarded and audited.
- [x] Final Admin, same-tenant, valid-scope, valid-view, and optimistic-concurrency invariants are enforced.
- [x] Existing members can be mapped through a dry-run, exact-only migration.
- [ ] Server-derived effective access preserves workspace, team, record, and service boundaries across every live domain.
- [x] Every live EOS route declares a read capability and alternate navigation paths use the same predicate.
- [x] Settings contains a reachable Access Profiles page with all required operational states.
- [x] Company Access supports one primary persona and safe scope assignment.
- [x] Persona and direct-call negative tests prove cross-scope denial.
- [x] Documentation, rollout, rollback, and monitoring guidance are complete.
- [x] Typecheck, focused tests, authorization ratchet, build, and critical E2E pass.
- [x] Browser evidence covers all four personas in dark/light, narrow width, keyboard, and accessibility checks.

## Work Log

### 2026-09-02 - Approved implementation kickoff

**By:** Codex

**Actions:**

- Treated the Product Owner's “proceed” instruction as approval of the plan's
  recommended V1 decisions.
- Created isolated branch `codex/feat-persona-rbac`.
- Confirmed the plan remains unchanged and established this todo as the
  implementation ledger.

**Learnings:**

- The feature must extend the existing Clerk/company authorization boundary;
  a second organization or membership model would introduce unsafe drift.
- Authorization coverage and browser navigation must move together, but the
  server remains authoritative.

### 2026-09-02 - Shared access contract implemented

**By:** Codex

**Actions:**

- Added the canonical persona, permission, view, scope, rollout, and Admin
  safety registry to `@mission-control/shared`.
- Added profile validation for unknown capabilities, invalid landing/scope
  defaults, view-permission mismatches, and locked Admin permissions.
- Added focused unit coverage; all 20 shared-package tests and typecheck pass.

**Learnings:**

- Experience defaults can remain customizable without becoming authorization
  because every visible view also requires a registered read permission.

### 2026-09-02 - Control plane, operator shell, and rollout safety implemented

**By:** Codex

**Actions:**

- Added additive role/profile schema, immutable revisions, tenant rollout state,
  guarded lifecycle APIs, exact-only migration tooling, optimistic concurrency,
  audit records, and final-Admin protections.
- Added server-derived access context, route capability declarations, filtered
  desktop/mobile navigation and command search, deep-link denial, recovery
  navigation, and persistent demo-preview labeling.
- Added `Settings → Access Profiles` with preview, activation, revision restore,
  coverage blockers, operational states, and all four persona tabs.
- Extended Company Access with one primary persona, constrained scope selection,
  and explicit confirmation for company-wide Architect access.
- Verified all four personas in an isolated browser environment, including
  dark/light presentation, narrow width, keyboard navigation, direct URL
  denial, immutable restore, and zero Axe A/AA violations.
- Passed shared tests (20), Convex tests (785), UI tests (307), both TypeScript
  checks, the authorization ratchet, and the production build.

**Learnings:**

- Safe production enforcement must remain blocked while 56 inventoried server
  areas have not yet adopted the effective-access guard. The implemented
  control plane therefore remains in `SHADOW`; existing role authorization is
  still authoritative outside the access-profile domain.
- Navigation parity is complete, but UI hiding is not treated as enforcement.
  Closing the remaining server coverage debt is the required next phase before
  any tenant can transition to `ENFORCED`.
