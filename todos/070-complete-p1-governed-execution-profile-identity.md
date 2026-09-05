---
status: complete
priority: p1
issue_id: "070"
tags: [factory, execution-profile, admission, qualification, evidence]
dependencies: ["066"]
---

# Add Governed Execution Profile Identity and Admission

## Problem Statement

Phase 1 separates model-route, harness, runtime-artifact, and execution-backend
identity, but each Factory Version still embeds that execution composition
directly. Mission Control needs one reusable, independently qualified execution
profile without creating another routable Factory or weakening exact-tuple
admission.

## Proposed Solution

Add an immutable, versioned, workspace-scoped Execution Profile that references
the existing exact component identities. Bind append-only qualification and
revocation decisions to the profile digest. New Factory Versions reference one
qualified profile while retaining existing fields as exact compatibility
projections. Profile-bound Attempts freeze the profile identity in the existing
execution manifest, and workers and evidence reconcile that identity before
execution or acceptance.

## Scope

- Execution Profile contract, deterministic digest, persistence, and versioning
- Append-only exact qualification, expiry, revocation, and replay protection
- Factory Version binding and projection reconciliation
- Attempt admission/freeze, worker resolution, evidence, and observability
- Explicit legacy Factory Version compatibility and in-flight policy
- Negative controls and repository qualification gates
- ADR and relevant Factory architecture/runtime documentation

## Non-Goals

- MCP, plugins, dynamic tools, Deep Agents, Open SWE, or native subagent support
- A second Factory lifecycle, router, active-version pointer, lease, or Attempt
- Cross-customer sharing, self-modifying profiles, rollout, or broad UI changes
- Model-health, broad qualification-report generation, or same-model UI
  follow-ups tracked in #166 and #168

## Acceptance Criteria

- [x] Profile versions have deterministic immutable identities and digests.
- [x] Qualification binds the exact profile and component tuple and is append-only.
- [x] Duplicate/replayed or conflicting qualification receipts fail closed.
- [x] Revoked, expired, stale, missing, unsupported, or tampered profiles cannot admit new Factory Versions or Attempts.
- [x] New Factory Versions reference an exact qualified profile without becoming a second routable configuration system.
- [x] Profile-bound Attempts freeze the exact profile and qualification identity in the existing manifest.
- [x] Worker construction resolves only the frozen profile's harness and rejects profile/component substitution.
- [x] Execution evidence and observability expose exact profile, harness, runtime, backend, route, and authorizing qualification identity.
- [x] Existing frozen profileless Factory Versions remain readable and executable under explicit legacy rules.
- [x] Same-model routes remain independently selectable and exact Phase 1 tuple admission remains fail-closed.
- [x] Focused negative controls and all required repository gates pass from base `9a80cf3c5cc229bb4a552a9f08ddda5841e70a38`.
- [x] The final diff contains no Phase 3 capability work.

## Work Log

### 2026-09-04 - Phase 2 implementation started

**By:** Codex

**Actions:**
- Verified the isolated worktree and refreshed `origin/main` both resolve to the
  authoritative Phase 1 merge `9a80cf3c5cc229bb4a552a9f08ddda5841e70a38`.
- Began parallel audits of current identity/admission contracts, architecture
  scope, and prior Convex schema lessons before changing runtime code.
- Reviewed #166, #167, and #168. Kept #166 and #168 deferred. Pulled in only
  #167's narrow runtime-qualification identity correction because retaining the
  hard-coded v28 claim would make Phase 2 qualification evidence false.

**Learnings:**
- The profile must be subordinate to Factory Version and reuse the existing
  execution manifest, worker lease, readiness, and evidence paths.
- Convex schema, validators, indexes, public API, generated types, and consumers
  must land atomically; local validator shims are not an acceptable substitute.

### 2026-09-05 - Phase 2 implementation and qualification complete

**By:** Codex

**Actions:**
- Added immutable, versioned, workspace-scoped Execution Profiles with exact
  digest-bound qualification, expiry, revocation, and replay protection.
- Bound new Factory Versions, Attempts, execution manifests, worker claims,
  remote sandboxes, verification receipts, evidence, and observability to the
  exact profile and its component identities while preserving explicit legacy
  profileless execution.
- Added the profile selector and derived read-only execution composition to the
  Factory configuration UI, including empty and disabled states, and verified
  them in the browser.
- Regenerated authoritative Convex API types; the only generated change is
  `convex/_generated/api.d.ts`.
- Bumped the public runtime contract from v39 to v40 for exactly six intentional
  changes: the Factory Version argument change and five Execution Profile APIs.
- Fixed the production Node ESM packaging boundary exposed by qualification by
  making the shared profile helper's relative imports explicit `.js` imports.
- Passed the complete Factory V2 qualification from base
  `9a80cf3c5cc229bb4a552a9f08ddda5841e70a38`, including security, authorization,
  secrets, docs, tests, lint, runtime-contract, build, startup smoke, and
  whitespace gates.

**Learnings:**
- Lease admission time must be server-authoritative: an already admitted lease
  may finish after qualification expiry or revocation, while every new claim or
  reclaim re-admits the current exact profile.
- Execution Profile is an admission boundary subordinate to Factory Version,
  not a second router or lifecycle owner.
