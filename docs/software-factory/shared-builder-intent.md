# Shared Builder Intent

## Status

Implementation contract for todo 062. This is an additive capability within the
existing Mission → Spec → Plan → Quality Contract lineage. It does not create a
new planning authority or primary navigation domain.

## Contract

A contribution is an immutable proposal bound to an exact Mission Spec revision
and digest. It records a stable contribution key, contributor role, target Spec
section and optional item, proposed change, evidence expectation, actor identity,
actor type, source, and time. Revising a contribution creates another immutable
record and names the prior record it supersedes.

An authorized human may append one ACCEPTED or REJECTED decision for an exact
contribution. Acceptance means the proposal is suitable input to a subsequent
human-authored Spec revision; it does not mutate the Spec, finalize it, approve a
Plan, release work, establish verification, accept delivery, or promote Factory
configuration.

Currentness and conflicts are projections:

- A proposal is stale when its bound Spec revision or digest is no longer the
  Mission's current Spec.
- A current undecided proposal conflicts when another current undecided latest
  proposal targets the same Spec section and item under a different contribution
  key.
- Older records in one contribution key are superseded by its newest revision.
- A stale or conflicting proposal remains visible with its full history and can
  be revised against the current Spec. It is never silently applied.

Every create, revise, and decision operation uses an idempotency key. Human
writes also require the expected current Spec identity; revisions require the
expected latest contribution identity. This prevents silent last-write-wins.

## Roles and guided targets

- PRODUCT: outcomes, user impact, priority, constraints, and non-goals.
- QA: acceptance criteria, negative cases, environments, and evidence needs.
- DESIGN: interaction intent, accessibility, visual evidence, and UX risks.
- ENGINEERING: architecture, scope, dependencies, rollout, and recovery.
- SECURITY_OPERATIONS: threats, policy, SLOs, containment, and rollback.

These are contribution modes in the existing Specification workspace, not
separate dashboards or state machines.

## Agent parity and authority boundary

The service-command boundary exposes only `intent.contributions.inspect` and
`intent.contributions.draft`. Commands are signed, scoped to the exact project
and repository, idempotent, and durably receipted. Agent drafts are explicitly
attributed as AGENT / SERVICE_COMMAND.

There is no agent operation for accepting or rejecting a contribution. The
shared-intent capability has no execution, verification, publication, merge,
acceptance, routing, credential, policy, or Factory Version authority.

## Qualification boundary

Qualification is deterministic and uses no external services, model calls,
credentials, customer data, or production mutation. Browser evidence must cover
loading, empty, denied, error, conflict, stale, success, resumption, narrow-width,
and keyboard-only behavior in the existing Mission Specification route.
