---
title: Govern execution behavior with exact Execution Profile identity
status: accepted
date: 2026-09-04
baseline_commit: 9a80cf3c5cc229bb4a552a9f08ddda5841e70a38
related:
  - docs/decisions/model-route-runtime-identity-separation.md
  - docs/architecture/execution-routing-v1.md
  - docs/architecture/generic-harness-contract-v1.md
  - docs/plans/2026-09-04-feat-composable-factory-execution-profiles-plan.md
---

# Govern execution behavior with exact Execution Profile identity

## Decision summary

Mission Control will represent reusable execution behavior as an exact,
immutable, qualified Execution Profile version. A profile composes existing
model-route, harness, runtime-artifact, backend, Sandbox Profile, isolation,
capability, lifecycle, and authority identities. It does not own work and it
does not create a second Factory control plane.

`FactoryDefinitionVersion` remains the only unit that can be assessed,
activated, routed, dispatched, retried, or rolled back. A profile is a
subordinate referenced configuration. `Attempt` remains the only execution
lifecycle and the existing execution manifest remains its frozen authority.

Phase 2 deliberately precedes the promoted harness catalog described in the
longer composable-factory roadmap. To keep that sequencing safe, this phase can
compose only exact tuples that are already known, qualified, and admissible
under the Phase 1 rules. A profile cannot discover, install, advertise, or
promote harness code.

## Context

Phase 1 established independent identities for:

- the inference-only model route and its qualification;
- the harness capability manifest and effective configuration;
- the runtime artifact that actually executes;
- the persistent-worker or remote-sandbox backend; and
- the evidence that qualified the exact compatibility tuple.

Factory Versions currently freeze those fields directly. That is safe, but it
does not provide a reusable name and qualification boundary for the execution
composition itself. Reconstructing the composition from aliases at dispatch
would weaken reproducibility, while introducing a second active/routed object
would duplicate Factory authority.

## Record model

Phase 2 uses one workspace-scoped table whose rows are immutable profile
versions. There is no mutable profile draft or parent record in this phase.

Each `factoryExecutionProfiles` row contains:

- a stable lowercase `profileKey` and monotonically allocated `version`;
- an immutable `factory-execution-profile/v1` snapshot and SHA-256 digest;
- exact model-catalog row, route digest, and route-qualification digest;
- exact adapter/version, Harness Capability Manifest, manifest digest, and
  effective-configuration digest;
- exact runtime-artifact snapshot and digest;
- exact execution backend and, for remote execution, Sandbox Profile identity,
  digest, and snapshot;
- a bounded set of allowed isolation modes plus their derived harness and
  worker capabilities;
- the existing Generic Harness V1 cancellation, retry, and cleanup semantics;
  and
- an all-denied authority declaration for routing, verification, publication,
  acceptance, merge, policy mutation, and worker leases.

The row begins disabled and unqualified. Qualification may populate one exact
qualification snapshot/digest, evidence reference/digest, scope, approver,
approval time, and expiry. A later revocation may change only lifecycle fields.
Profile bytes, digest, component references, and qualification bytes are never
patched or deleted. Qualification and revocation also write append-only
activity records, preserving who made the decision and why.

This mirrors the existing exact model-route qualification pattern and avoids a
parallel qualification framework. The content-addressed qualification digest
is the receipt identity frozen by downstream records.

## Canonical identity and versioning

The canonical snapshot is closed and deterministic:

- unknown fields are rejected;
- optional values use one canonical representation;
- set-like arrays are unique and sorted;
- digests use canonical JSON and SHA-256; and
- nested governed snapshots must recompute to their recorded digests.

The executable identity is the tuple:

`{ workspace, profileKey, version, profile row ID, profileDigest }`.

Changing any semantic component requires another version row and therefore a
new identity. Retrying the same exact registration idempotency key reuses its
row; reusing that key with different inputs fails closed. A previously unseen
key creates the next version even when its component tuple is unchanged, so
every accepted key is durably bound without mutating an older version. Changing
stored bytes without changing the digest fails validation; changing the digest
breaks every exact downstream binding.

Qualification is single-use for a version. A duplicate, replayed, or
conflicting qualification submission fails closed. Requalification after
expiry or revocation requires a new immutable profile version; historical
qualification evidence is never rewritten.

## Bounded profile content

The profile contains execution mechanics only. It intentionally does not own:

- repository or workflow identity;
- Mission, WorkOrder, Task, or Attempt state;
- code scopes, Factory risk, budget, or policy;
- Agent Version prompts, tools, skills, or Context Packages;
- verifier selection or Quality Gate policy;
- publication, acceptance, merge, or release authority; or
- worker registration, leases, health, or routing policy.

Resource budgets stay on Factory Version. Sandbox resource limits stay on the
exact Sandbox Profile. Harness lifecycle support stays on the Harness
Capability Manifest. Phase 2 does not invent another resource, environment,
tool, or lifecycle DSL merely to copy those values.

## Qualification and currentness

`factory-execution-profile-qualification/v1` binds:

- exact profile row identity, version, snapshot digest, and component digests;
- exact model route and model-route qualification;
- exact harness manifest, effective configuration, runtime artifact, backend,
  and optional Sandbox Profile;
- the frozen allowed isolation modes and capability requirements;
- approved workload and risk scopes;
- evidence reference and SHA-256 digest;
- approver and approval time; and
- a bounded `validUntil` time.

A profile is current only when all of the following are true:

1. its immutable snapshot and digest recompute exactly;
2. its qualification snapshot/digest recompute and bind that profile;
3. it is enabled and evidence-qualified, not revoked, and not expired;
4. its exact model-catalog row still carries the frozen route and qualification
   identity and remains eligible;
5. its harness/runtime/backend tuple is still exactly resolvable; and
6. its Sandbox Profile, when present, is still the exact eligible profile.

Same-model routes never collapse to `modelId`. The profile binds the catalog
row, route digest, and route-qualification digest, so sibling qualifications
remain independently selectable and independently invalidatable.

## Factory Version binding

New Factory Version creation requires one currently qualified profile version.
The Factory Version freezes:

- profile row ID, key, version, snapshot, and digest; and
- the exact profile-qualification snapshot and receipt digest.

The current harness, runtime-artifact, backend, Sandbox Profile, and model-route
fields remain as compatibility projections during migration. The server derives
them from the profile and rejects any caller-supplied disagreement. The Factory
configuration digest covers the profile and qualification identity as well as
the existing Factory-owned configuration.

The profile does not gain an active-version pointer. Only the containing
Factory Version can become active or be selected by Execution Routing.

## Attempt admission and worker execution

A profile-bound Factory Version emits `factory-execution-manifest/v3`. V3 adds
the exact frozen profile and qualification identity without changing the V1/V2
bytes used by historical Attempts.

Dispatch and first claim both require the profile qualification to remain
current and require exact agreement among:

- the profile row;
- the Factory Version projections;
- the Attempt columns;
- the V3 execution manifest; and
- the selected worker's existing exact Factory Version binding.

After those checks, the worker resolves only the frozen adapter/version from
the explicitly configured `HarnessAdapterRegistry`. The profile never loads
code and never provides a fallback adapter. The worker re-hashes the profile
snapshot and verifies its harness, runtime-artifact, backend, Sandbox Profile,
  model-route, and selected-isolation projections before invoking the adapter. Missing, unsupported,
or substituted components fail before harness execution.

## Revocation and in-flight policy

Expired or revoked profiles cannot create a Factory Version, pass readiness,
admit a new Attempt, or receive a first worker claim. No alternative profile or
component is selected automatically.

An Attempt that already holds a valid worker lease continues with its exact
frozen identity until that bounded lease completes or normal cancellation and
recovery policy intervenes. Profile state is not re-resolved inside harness
execution. A retry is a new Attempt and must pass current profile admission
again. Evidence always records the originally authorizing profile and
qualification receipt, so later revocation cannot rewrite history.

## Evidence and observability

Profile-bound Attempt records, claim events, selection traces, and
control-plane-generated execution artifacts expose:

- profile row ID, key, version, digest, qualification digest, expiry, and
  current eligibility or stable blocker;
- exact harness adapter/version, manifest, and effective-config digests;
- exact runtime-artifact digest and execution backend;
- exact Sandbox Profile identity when applicable; and
- exact model-catalog row, route digest, and route-qualification digest.

Harness output does not acquire profile authority. Mission Control derives and
reconciles profile evidence at the host boundary before persisting it.

## Historical compatibility

No historical Factory Version or Attempt is rewritten.

- frozen model-route V1 / execution-manifest V1 records keep their explicit
  legacy path;
- Phase 1 profileless model-route V2 / execution-manifest V2 records remain
  readable and executable under their frozen rules; and
- newly created profile-bound Factory Versions use execution-manifest V3.

References are optional in storage only for historical compatibility. They are
required by the new Factory Version creation API.

## Authorization and agent parity

The existing Factory permissions remain authoritative:

- `VIEW` lists and inspects profiles;
- `MANAGE_AUTOMATION` registers immutable versions; and
- `APPROVE` qualifies or revokes them.

These operations use the same authenticated Convex boundary available to the
product and agents. No profile-only UI authority or hidden administrative write
path is introduced.

## Runtime contract and generated API

The new authenticated profile API and required Factory Version argument are
intentional public Convex contract changes. Runtime contract v39 therefore
advances to v40. Convex schema, validators, indexes, callers, and authoritative
generated API types must land atomically. Both the default guard and the
explicit guard against baseline `9a80cf3c5cc229bb4a552a9f08ddda5841e70a38`
must report only the intended changes.

The system qualification packet must derive its runtime version from the
canonical `RUNTIME_CONTRACT_VERSION` source. This narrowly pulls #167 into the
phase because a hard-coded v28 receipt would make Phase 2 qualification
evidence false. Model-health identity #166 and the UI presentation work in #168
remain deferred.

## Explicit non-goals

- promoted or dynamic harness installation;
- a plugin marketplace or arbitrary tool loading;
- MCP or unrestricted native subagents;
- Deep Agents, Open SWE, or another harness implementation;
- recipes, multi-model roles, mutable profile drafts, or a profile editor;
- cross-customer sharing or self-modifying profiles;
- production rollout or broad Factory UI redesign; and
- profile-owned routing, leases, verification, publication, or acceptance.

## Rejected alternatives

- **Make profiles independently active or routable.** This creates a second
  Factory system and conflicting authority.
- **Identify compatibility by model ID.** Same-model qualifications would
  contaminate one another and reproduce the Phase 1 defect.
- **Load adapters from profile metadata.** Persisted configuration must never
  become executable-code installation authority.
- **Rewrite existing Factory Versions.** Historical lineage would stop being
  reproducible.
- **Patch qualified profile bytes.** Qualification would no longer attest to
  exact execution behavior.
- **Implement the future harness catalog in this phase.** The bounded proof can
  safely reference already-admissible Phase 1 tuples; discovery and promotion
  require their own review.
