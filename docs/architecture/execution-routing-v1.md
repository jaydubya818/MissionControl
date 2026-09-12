---
title: Autonomous Execution Routing V1
status: implemented
date: 2026-08-17
---

# Autonomous Execution Routing V1

## Purpose

Execution Routing recommends or selects one exact production-qualified Factory
Version for a WorkOrder. New Factory Versions reference an immutable qualified
Execution Profile that binds the exact
`Model Route + Harness + Runtime Artifact + Execution Backend` composition. It
reduces an operator decision without moving any authority from Factory
admission, independent verification, publication, merge, or acceptance.

The routed unit is an active immutable Factory Version. Mission Control never
constructs an arbitrary Cartesian product of model, harness, runtime, and
backend components at dispatch time.

The Execution Profile is subordinate configuration, not a fifth independently
routed component and not a second Factory system. It has no active pointer or
routing authority. See the [Execution Profile identity
decision](../decisions/execution-profile-identity.md).

## Identity and qualification

The four tuple members answer different questions:

| Identity | Question answered | Canonical owner |
| --- | --- | --- |
| Model Route | Which provider route, model, and bounded reasoning configuration supply inference? | `factory-model-route/v2` |
| Harness | Which agent execution behavior and capabilities run the work? | `harness-capability-manifest/v1` plus its adapter-effective configuration |
| Runtime Artifact | Which exact executable or container image implements that harness? | `harness-runtime-artifact/v1` sidecar |
| Execution Backend | Where does execution take place? | Factory Version backend binding |

Identity separation does not weaken compatibility. Qualification and the
immutable Factory Version bind an allowed combination; the router selects that
Factory Version as a whole. A valid model route cannot authorize a different
harness, runtime artifact, or backend, and a valid harness advertisement cannot
authorize an unqualified model route. The V2 qualification snapshot names the
exact adapter/version, capability-manifest digest, effective-configuration
digest, runtime-artifact digest, and backend that were reviewed with the route.

For a profile-bound candidate, `factory-execution-profile/v1` and its exact
qualification receipt bind those identities, the route qualification, any
Sandbox Profile, allowed isolation modes, and required capabilities. The
Factory Version freezes the profile row ID, key, version, snapshot, digest, and
qualification digest. No alias is resolved after selection.

## Control flow

1. Load at most 25 active Factory Version candidates for the WorkOrder
   repository.
2. Reuse the exact Execution Profile, model-route, harness-manifest,
   runtime-artifact, and canonical worker-admission contracts.
3. Reject candidates that fail Factory/current-readiness, repository, worker,
   route, harness, runtime-artifact, backend, isolation, network, credential,
   approved-model, risk, budget, context, or production-certification
   constraints.
4. Load at most 250 recent implementation Attempts, plus bounded trace and gate
   observations, inside the policy evidence window.
5. Score only eligible candidates with `execution-routing/v1`.
6. Apply mode rules:
   - `ADVISORY`: retain the operator/current certified Factory Version;
   - `GUARDED_AUTO`: select only after policy promotion, feature enablement,
     non-RED risk, evidence coverage, sample, and score-margin gates;
   - `PINNED`: an eligible exact operator pin wins; an ineligible pin blocks.
7. Run the selected Factory Version through the unchanged canonical dispatch
   preflight.
8. Freeze the decision snapshot and SHA-256 digest onto the Attempt before the
   worker can claim it. Profile-bound Attempts also freeze
   `factory-execution-manifest/v3` with the exact profile and qualification
   identity.

V1 is additive and default-off for existing execution paths. A dispatch enters
the tuple router only when it already supplies an exact Factory Version
baseline or the WorkOrder has an explicit tuple pin. Legacy non-Factory
dispatch remains on the existing model-only path.

## Eligibility before score

An ineligible candidate never receives a score. Rejection codes are stable and
stored with the decision. Cost and latency cannot compensate for a missing
capability, stale worker, model-route digest mismatch, harness-manifest or
effective-configuration mismatch, runtime-artifact mismatch, unsupported
backend, missing/revoked/expired profile, profile or qualification digest
mismatch, scope mismatch, uncertified harness, risk violation, or other hard
constraint.

Worker freshness uses the canonical two-minute heartbeat threshold. Worker
capacity is calculated from server-side active leases; worker-reported occupied
slots are not trusted. Worker admission additionally requires the exact frozen
adapter/version, capability-manifest digest, effective-configuration digest,
host adapter artifact, backend, provider/model, repository scope, and Factory
Version binding. The version binding separately attests the execution artifact:
the harness executable for a persistent worker or the frozen Sandbox Profile
image for remote execution.

Profile currentness is evaluated before scoring, again in canonical dispatch
preflight, and again before the first worker claim. The worker resolves only the
frozen adapter/version from its explicitly configured registry. Neither the
router nor the profile can substitute another profile, model route, harness,
runtime artifact, backend, or adapter. A profile revoked after a valid lease is
issued does not rewrite that in-flight Attempt; a retry is a new Attempt and
must pass current admission.

## Evidence and unknowns

The V1 evidence window defaults to 30 days. The scorer uses:

- independent verified success and first-pass success;
- retry avoidance;
- time from Attempt start to a current verified receipt;
- model, compute, total, and total-cost-per-verified-success observations,
  where failed and retried Attempt spend remains part of the denominator cost;
- context-miss avoidance from bounded traces;
- current quality-gate avoidance; and
- cancellation/failure avoidance.

Verified outcomes come from the canonical Policy V2 currentness evaluation:
the exact source Attempt is joined to its separate Verification Attempt,
immutable subject, frozen plan, result, evidence set, receipt, and trusted
provider projection. A current exact `VERIFIED` result is a success; a current
exact `NOT_VERIFIED` or `BLOCKED` result with a matching failed receipt is a
verified failure. Unverified, stale, invalidated, superseded, or cross-bound
records do not count. Legacy `factoryContinuation` receipts remain a bounded
read-only fallback only for source Attempts that do not carry a Policy V2
Verification Subject.

Metrics without observations remain absent and are inspectable as
`observed: false`. Each observed component contributes its weighted score to
the fixed 100-point denominator; an unknown component contributes no favorable
score and cannot improve rank merely by disappearing from the denominator.
Evidence coverage remains the observed weight divided by 100 and is a governed
Guarded Auto gate. A hard budget with unknown estimated cost fails closed.

Prompts, credentials, and raw secret values are excluded from routing evidence.
Trace naming follows the existing OpenTelemetry-oriented Attempt/trace model;
model/provider/token/cost attributes remain observations rather than authority.

## Frozen decision record

`modelRoutingDecisions.executionRoutingSnapshot` stores:

- algorithm and schema version;
- policy ID/version and WorkOrder/Task identity;
- risk and fixed evidence cutoff;
- every candidate tuple;
- each candidate's immutable Factory Version and configuration digest, which
  bind its Execution Profile and qualification, model-route,
  harness-manifest, runtime-artifact, and backend identity;
- every rejection code and reason;
- observed raw metrics, weights, normalized component scores, total score, and
  evidence coverage;
- recommended, applied, and fallback tuple keys;
- mode, explanation, and fallback reason.

The canonical digest is copied to `workflowRuns.routingDecisionDigest`, and the
same full snapshot is copied to `workflowRuns.executionRoutingSnapshot`.
Subsequent telemetry and verification outcomes cannot update that Attempt.

## Frozen legacy routes

`factory-model-route/v1` remains a read-compatible historical format. Its
Codex-specific harness and runtime fields are interpreted only when an existing
legacy Factory Version already froze that exact route and qualification. The
router does not use V1 to construct a new Factory Version, infer a V2 route, or
substitute a current harness/runtime combination. A malformed or cross-wired
legacy tuple is ineligible.

Historical route, qualification, harness-manifest, Factory Version, routing,
and Attempt digests remain immutable. Legacy execution is possible only when a
current worker can satisfy the exact frozen compatibility tuple; readability
alone never grants admission.

Phase 1 profileless model-route V2 Factory Versions and execution-manifest V2
Attempts remain readable and executable under their exact frozen rules. The
router never infers a profile for them. New Factory Versions require a current
qualified profile and emit execution-manifest V3.

## Authorization

- Factory View: catalog, policy, preview, and decision reads.
- Factory Improve: agent-specific route overrides and experiment creation.
- Factory Approve: WorkOrder model overrides and exact tuple pins.
- Factory Automation Manage: policy activation, Guarded Auto promotion,
  execution/model routing feature flags, catalog initialization, and approved
  local-model sync.

Actor attribution is derived from authenticated workspace membership. Provider
health ingestion is internal-only. Discovered local models are scoped to their
own workspace and cannot overwrite another workspace's catalog entries.
Project scope is rechecked through the parent WorkOrder, Task, or Attempt before
a decision is returned. Exact pins also retain the existing delivery-approval
boundary when team authorization is enabled.

## Guarded Auto promotion

Policy activation and Guarded Auto promotion are separate mutations. Promotion
requires at least one reviewed decision with an algorithm version and digest
and creates a new immutable policy version. Runtime enablement is a separate
default-off feature flag: `execution-routing.guarded-auto`.

RED/critical WorkOrders are never auto-routed in V1.

## Learning and experiments

Factory Learning continues to create advisory signals and improvement
candidates. It cannot update routing policy. Canonical two-variant experiments
may compare two distinct current, production-qualified exact Factory Versions;
their configuration is frozen with `acceptanceAuthority: false` and
`verificationRequired: true`. Every experimental Attempt still passes normal
dispatch and independent verification.

Failures and later verification outcomes become evidence only for future
routing decisions.

## Rollback

Disable `execution-routing.guarded-auto` first. Advisory decisions and historical
snapshots remain safe to retain. If recommendation and dispatch admission ever
disagree, revert dispatch integration and investigate the eligibility drift;
do not loosen Factory preflight.
