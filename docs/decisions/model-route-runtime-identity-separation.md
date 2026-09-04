---
title: Model Route and Harness Runtime Identity Separation
status: accepted
date: 2026-09-04
decision: Keep inference, harness behavior, runtime artifact, and execution placement as independent identities joined only by exact Factory qualification
related_plan: docs/plans/2026-09-04-feat-composable-factory-execution-profiles-plan.md
---

# Model Route and Harness Runtime Identity Separation

## Context

`factory-model-route/v1` froze provider and model identity together with a
Codex adapter, capability/configuration digests, and a `CODEX_CLI` executable
or image. That record was exact, but it assigned coding-harness implementation
details to the inference abstraction. Adding a different harness would either
require pretending it was Codex or adding provider-specific runtime branches to
the model catalog.

Mission Control already treats the immutable Factory Version as the routed
unit and separately enforces harness capability, worker, backend, sandbox,
verification, evidence, and publication boundaries. The identity model should
reflect those existing authority boundaries without weakening exact admission.

## Decision

Mission Control separates four identities:

1. A **Model Route** identifies inference: provider, provider route, model, and
   bounded reasoning configuration.
2. A **Harness** identifies agent execution behavior: adapter, upstream harness,
   effective capabilities, and effective configuration.
3. A **Runtime Artifact** identifies the exact executable or container image
   that implements the harness.
4. An **Execution Backend** identifies placement: where the admitted harness
   runtime executes.

`factory-model-route/v2` is the canonical inference-only route. It contains no
adapter, capability-manifest digest, effective-configuration digest,
executable, image, backend, or Codex runtime kind.

The existing `harness-capability-manifest/v1` remains authoritative for harness
identity and behavior. Exact executable/image identity is represented by a
separate, canonically hashed `harness-runtime-artifact/v1` sidecar in harness
composition. The sidecar prevents runtime changes from mutating model identity
and avoids changing historical V1 capability-manifest bytes and digests.

The execution backend remains an explicit Factory Version binding. Backend
support advertised by a harness is compatibility evidence, not ownership of
the backend decision.

## Qualification and routing

Independent identity does not imply independent eligibility. Mission Control
qualification may approve an exact combination for bounded workload,
repository, risk, evidence, and cost scopes. Only a Factory Version that freezes
the approved combination may be activated, routed, dispatched, and claimed.
`factory-model-route-qualification/v2` therefore binds the reviewed route
digest to one adapter/version, capability-manifest digest,
effective-configuration digest, runtime-artifact digest, and backend. The
compatibility fields belong to the qualification decision, not the model-route
identity.

Catalog rows are immutable qualification instances, so the same route digest
may appear in more than one row with different compatible execution tuples.
Registration reuses only an unqualified draft. Factory creation filters by the
complete frozen tuple and scope, then requires exactly one result or an
explicit catalog ID; it never selects an arbitrary matching row.

The exact executable tuple is:

```text
Factory Version
  ├── Model Route snapshot + digest + qualification
  ├── Harness capability manifest + digest
  ├── Harness effective-configuration digest
  ├── Runtime Artifact snapshot + digest
  ├── Execution Backend
  └── Sandbox Profile snapshot + digest, when remote
```

All executable workflow roles in the V1 Factory contract must resolve to the
one frozen model route. Mission Control does not route a model to an arbitrary
installed harness, substitute an available adapter, or assemble a new tuple at
dispatch time.

Readiness, routing, dispatch, worker claim, adapter resolution, normalized
result reconciliation, and retry all use the frozen Factory Version tuple.
Changing a component requires a new immutable Factory Version and a
subsequently routed new Attempt. A retry of the existing version preserves its
frozen tuple.

The exact route digest, provider route, and reasoning controls are propagated
into the generic executor request and normalized result. Each adapter must
translate every supplied control exactly or reject before starting its
harness. Current Codex execution translates reasoning effort and rejects
unsupported temperature/token controls; the pinned DeepSeek adapter rejects
all non-empty reasoning controls. Remote Codex additionally requires the
qualified `openrouter` provider route.

## Authority

This separation changes identity ownership, not control-plane authority.
Mission Control remains authoritative for WorkOrders, Factory Versions,
Attempts, routing admission, worker leases, sandbox policy, verification,
evidence, publication, acceptance, memory, and learning. Models and harnesses
are bounded execution inputs and cannot grant themselves compatibility or
authority.

## Frozen legacy compatibility

`factory-model-route/v1` remains readable as an explicit legacy format.
Historical route and qualification snapshots, capability manifests, Factory
Versions, Attempts, and canonical digests are not rewritten.

A V1 route may execute only through a legacy Factory Version that already
froze its exact Codex capability/runtime combination. Legacy runtime fields may
be projected into the provider-neutral artifact shape solely to reconcile that
frozen version. They are not accepted for new Factory Version creation, do not
create a V2 qualification claim, and do not authorize another harness or
backend.

Malformed V1 data, missing identity, digest drift, or a cross-wired
route/harness/runtime/backend combination fails closed. Read compatibility is
not execution eligibility.

## Consequences

- A non-Codex, tool-calling model can be represented without naming a coding
  harness.
- A harness executable or image can be upgraded and requalified without
  changing the model-route digest.
- Persistent execution binds the exact harness executable, while remote
  execution binds the immutable Sandbox Profile image and independently
  reconciles the observed environment. The host adapter executable remains a
  separate worker-compatibility identity.
- Worker advertisements and normalized results must carry exact runtime
  artifact provenance in addition to existing manifest/configuration
  provenance.
- New Factory Versions require V2 model routes and explicit runtime artifacts;
  existing frozen V1 versions retain narrow compatibility.
- Public Convex validators that expose registration or worker capability shape
  must advance through the repository runtime-contract process.
- This decision does not add Execution Profiles, dynamic plugins, automatic
  harness routing, Deep Agents, Open SWE, MCP, a new sandbox provider, or a
  multi-model workflow contract.

## Rejected alternatives

- Keep executable and image identity in the model route. This preserves the
  original conflation and makes every new harness a model-catalog concern.
- Put the runtime artifact into the existing V1 capability manifest. This
  changes historical manifest digests and breaks frozen compatibility.
- Select model, harness, runtime, and backend independently at dispatch. This
  bypasses Factory Version qualification and permits unreviewed combinations.
- Treat harness installation or worker advertisement as qualification.
  Availability is not approval.
- Introduce Execution Profiles in this phase. Identity separation is required
  first and is intentionally narrower.
